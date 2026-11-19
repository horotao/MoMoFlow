/// <reference lib="es2022.intl" />
import { mapAssets, WorkflowStorage, type Workflow } from './workflowStorage.ts';
import { earliestSavedImagePrompt } from '../nodes/executionGraph.ts';

export type CanvasProject = {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: string;
  deletedAt?: number;
  nameStatus?: 'manual' | 'automatic' | 'auto-attempted';
};

const untitledProjectName = '未命名项目';
const maxAutomaticNameLength = 32;
const legacyProject: CanvasProject = { id: 'current', name: untitledProjectName, updatedAt: 0 };

function canAutoName(project: CanvasProject) {
  return project.name === untitledProjectName && project.nameStatus !== 'manual' && project.nameStatus !== 'automatic';
}

function nameFromPrompt(prompt: string) {
  const name = prompt.trim().replace(/\s+/g, ' ');
  if (name.length <= maxAutomaticNameLength) return name;
  const characters = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter().segment(name), ({ segment }) => segment)
    : Array.from(name);
  if (characters.length <= maxAutomaticNameLength) return name;
  return `${characters.slice(0, maxAutomaticNameLength - 1).join('').trimEnd()}…`;
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('无法保存项目列表。'));
  });
}

async function thumbnail(workflow: Workflow): Promise<string | undefined> {
  let source: string | undefined;
  mapAssets(workflow.nodes, asset => {
    if (!source && asset.kind === 'image') source = asset.url;
    return asset;
  });
  if (!source) return undefined;
  // Persist a small preview, never a temporary blob URL or the original image.
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = source;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([image.decode(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('预览读取超时。')), 1500);
      })]);
    } finally { clearTimeout(timer); }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 48, 48);
    return canvas.toDataURL('image/webp', 0.75);
  } catch { return undefined; }
}

/** Project metadata is separate from graph databases so asset cleanup stays project-local. */
export class ProjectLibrary {
  private database?: Promise<IDBDatabase>;
  constructor(private databaseName = 'momoflow-projects', private legacyDatabaseName = 'momoflow-canvas') {}

  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('projects', { keyPath: 'id' });
        request.result.createObjectStore('preferences');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他 MoMoFlow 页面后重试。'));
    }).catch(error => { this.database = undefined; throw error; });
    return this.database;
  }

  async restore(): Promise<{ projects: CanvasProject[]; active: CanvasProject }> {
    const db = await this.open();
    const transaction = db.transaction(['projects', 'preferences'], 'readwrite');
    const done = completed(transaction);
    const projects = transaction.objectStore('projects');
    const all = projects.getAll();
    const active = transaction.objectStore('preferences').get('active');
    all.onsuccess = () => {
      if (!all.result.length) {
        projects.put(legacyProject);
        transaction.objectStore('preferences').put(legacyProject.id, 'active');
      }
    };
    await done;
    const list = ((all.result.length ? all.result : [legacyProject]) as CanvasProject[]).filter(project => !project.deletedAt);
    if (!list.length) throw new Error('没有可用的画布项目，原有数据已保留。');
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return { projects: list, active: list.find(project => project.id === active.result) ?? list[0] };
  }

  async select(id: string) {
    const db = await this.open();
    const transaction = db.transaction('preferences', 'readwrite');
    const done = completed(transaction);
    transaction.objectStore('preferences').put(id, 'active');
    await done;
  }

  async create(name = untitledProjectName): Promise<CanvasProject> {
    const project = { id: crypto.randomUUID(), name: name.trim() || untitledProjectName, updatedAt: Date.now() };
    // A real empty snapshot prevents a new project from inheriting initial/demo nodes.
    const storage = this.storage(project);
    try { await storage.save({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' }); }
    finally { storage.dispose(); }
    try { await this.put(project); }
    catch (cause) { indexedDB.deleteDatabase(`${this.databaseName}-${project.id}`); throw cause; }
    return project;
  }

  private async put(project: CanvasProject) {
    const db = await this.open();
    const transaction = db.transaction('projects', 'readwrite');
    const done = completed(transaction);
    transaction.objectStore('projects').put(project);
    await done;
  }

  private nameChannel() {
    if (typeof BroadcastChannel === 'function') return new BroadcastChannel(`${this.databaseName}:project-names`);
  }

  watchNames(onChange: () => void) {
    const channel = this.nameChannel();
    if (channel) channel.onmessage = onChange;
    return () => channel?.close();
  }

  private async updateName(id: string, change: (project: CanvasProject) => Pick<CanvasProject, 'name' | 'nameStatus'> | undefined) {
    const db = await this.open();
    const transaction = db.transaction('projects', 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('projects');
    const request = store.get(id);
    let current: CanvasProject | undefined;
    let updated = false;
    request.onsuccess = () => {
      const project = request.result as CanvasProject | undefined;
      if (!project || project.deletedAt) return;
      const patch = change(project);
      current = patch ? { ...project, ...patch } : project;
      if (!patch) return;
      store.put(current);
      updated = true;
    };
    await done;
    if (updated) {
      const channel = this.nameChannel();
      channel?.postMessage(null);
      channel?.close();
    }
    return current;
  }

  async rename(id: string, name: string) {
    await this.updateName(id, () => ({ name: name.trim() || untitledProjectName, nameStatus: 'manual' }));
  }

  autoName(id: string, prompt: string) {
    if (!prompt.trim()) return Promise.resolve(undefined);
    // Check and write together so concurrent runs and tabs cannot overwrite another name.
    return this.updateName(id, project => {
      if (!canAutoName(project)) return;
      return { name: nameFromPrompt(prompt), nameStatus: 'automatic' };
    });
  }

  async backfillName(project: CanvasProject, workflow: Workflow) {
    if (!canAutoName(project)) return;
    const prompt = earliestSavedImagePrompt(workflow.nodes);
    if (prompt) return this.autoName(project.id, prompt);
  }

  async remove(id: string, nextActiveId?: string) {
    const db = await this.open();
    const transaction = db.transaction(['projects', 'preferences'], 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('projects');
    const preferences = transaction.objectStore('preferences');
    const active = preferences.get('active');
    const request = store.getAll();
    let failure: unknown;
    request.onsuccess = () => {
      const projects = (request.result as CanvasProject[]).filter(project => !project.deletedAt);
      const target = projects.find(project => project.id === id);
      if (!target) return;
      const remaining = projects.filter(project => project.id !== id);
      if (!remaining.length) {
        failure = new Error('请先新建一个画布项目，再删除此项目。');
        transaction.abort();
        return;
      }
      // Retain the graph and its assets; removal from the menu is reversible.
      store.put({ ...target, deletedAt: Date.now() });
      if (active.result === id || nextActiveId) {
        preferences.put(remaining.find(project => project.id === nextActiveId)?.id ?? remaining[0].id, 'active');
      }
    };
    await done.catch(cause => { throw failure ?? cause; });
  }

  async updatePreview(id: string, workflow: Workflow) {
    const preview = await thumbnail(workflow);
    const db = await this.open();
    const transaction = db.transaction('projects', 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('projects');
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, thumbnail: preview, updatedAt: Date.now() });
    };
    await done;
  }

  storage(project: CanvasProject) {
    return new WorkflowStorage(project.id === 'current' ? this.legacyDatabaseName : `${this.databaseName}-${project.id}`);
  }
}
