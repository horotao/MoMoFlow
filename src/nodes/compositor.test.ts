import test from 'node:test';
import assert from 'node:assert/strict';
import { alignCompositorLayer, addCompositorInput, compositorDocument, compositorLayout, compositorPending, compositorRevision, createLayer, defaultCompositorDocument, layerAsset, moveCompositorLayer, newEffect, removeCompositorLayer, resizeLayer, restoreCompositorData, snapshotCompositor } from './compositor.ts';
import { compositorInputs, imageOutput } from './sunburstRun.ts';
import { compositorPixels } from './compositor/effects.ts';
import { blurPixels } from './blur.ts';
import { correctPixels, defaultColorSettings } from './colorCorrection.ts';
import { invertPixels } from './invert.ts';
import { defaultLevelsSettings, levelsPixels } from './levels.ts';
import { canConnect } from './connectionRules.ts';
import { mapAssets, workflowSnapshot } from '../persistence/workflowStorage.ts';
import { nodeAssetUrls } from './assetResources.ts';
import type { AppNode, CompositorNode, FileAsset } from './types';
const asset = (id: string, width = 640, height = 480): FileAsset => ({ id, name: `${id}.png`, url: `blob:${id}`, kind: 'image', width, height });
const file: AppNode = { id: 'file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('source')] } };
function compositor(): CompositorNode { return { id: 'comp', type: 'compositor', position: { x: 0, y: 0 }, data: { document: defaultCompositorDocument() } }; }
const input = { id: 'background', source: 'file', sourceHandle: 'file', target: 'comp', targetHandle: 'background' };
const second = { ...input, id: 'layer', targetHandle: 'layer-1' };

test('Compositor inputs retain identity through stacking, replacement, removal and reconnection', () => {
  let doc = addCompositorInput(defaultCompositorDocument());
  assert.deepEqual(doc.inputs.map(input => input.id), ['background', 'layer-1', 'layer-2']);
  const original = doc;
  doc = moveCompositorLayer(doc, 'layer-2', 0);
  assert.deepEqual(doc.layers.map(layer => layer.id), ['layer-2', 'background', 'layer-1']);
  assert.deepEqual(doc.inputs, original.inputs);
  doc = removeCompositorLayer(doc, 'layer-1');
  assert.equal(doc.inputs.some(input => input.id === 'layer-1'), false);
  assert.equal(removeCompositorLayer(doc, 'background'), doc);
  const readded = addCompositorInput(doc);
  assert.equal(readded.inputs[2].id, 'layer-1');
  const edited = { ...doc.layers[0], transform: { x: 11, y: 21, width: 100, height: 200, rotation: 42 }, effects: [newEffect('invert')] };
  doc = { ...doc, layers: [edited, ...doc.layers.slice(1)] };
  const old = compositorLayout(doc, { 'layer-2': { connected: true, asset: asset('old') } });
  const next = compositorLayout(doc, { 'layer-2': { connected: true, asset: asset('new', 800, 900) } });
  assert.deepEqual(next.layers[0].transform, old.layers[0].transform);
  assert.deepEqual(next.layers[0].effects, old.layers[0].effects);
  assert.equal(compositorLayout(doc, {}).layers[0].asset, undefined);
  assert.equal(doc.layers[0].source.kind, 'input');
});

test('canvas auto size, manual override and fallback snapshot work without mutating the document', () => {
  const doc = defaultCompositorDocument(), inputs = { background: { connected: true, asset: asset('bg', 768, 1376) } };
  assert.deepEqual([compositorLayout(doc, inputs).width, compositorLayout(doc, inputs).height], [768, 1376]);
  const manual = { ...doc, canvas: { ...doc.canvas, autoSize: false, width: 1200, height: 500 } };
  assert.deepEqual([compositorLayout(manual, inputs).width, compositorLayout(manual, inputs).height], [1200, 500]);
  const snapshot = snapshotCompositor(doc, inputs);
  assert.equal(layerAsset(snapshot.layers[0], {})?.id, 'bg');
  assert.equal(compositorLayout(snapshot, {}).height, 1376);
  assert.equal(layerAsset(snapshot.layers[0], { background: { connected: true } }), undefined);
  assert.equal(layerAsset(snapshot.layers[0], { background: { connected: true, asset: asset('replacement') } })?.id, 'replacement');
  assert.equal(layerAsset(doc.layers[0], {}), undefined);
  assert.equal(doc.canvas.width, 1024);
});

test('output rejects stale edits, upstream replacement, disconnection, pending images and cycles; shared sources remain valid', () => {
  const node = compositor(), nodes = [file, node], edges = [input, second];
  const inputs = compositorInputs(node.id, nodes, edges);
  assert.equal(inputs.background.asset?.id, 'source'); assert.equal(inputs['layer-1'].asset?.id, 'source');
  node.data.result = asset('output'); node.data.outputRevision = compositorRevision(node.data.document, inputs);
  assert.equal(imageOutput(node, 'result', nodes, edges)[0].id, 'output');
  assert.deepEqual(imageOutput(node, 'wrong', nodes, edges), []);
  assert.deepEqual(imageOutput(node, 'result', nodes, [input]), []);
  assert.deepEqual(imageOutput(node, 'result', [{ ...file, data: { assets: [asset('changed')] } }, node], edges), []);
  const changed = { ...node, data: { ...node.data, document: { ...node.data.document, layers: node.data.document.layers.map(layer => ({ ...layer, opacity: .5 })) } } };
  assert.deepEqual(imageOutput(changed, 'result', [file, changed], edges), []);
  assert.equal(compositorPending(node.data.document, { background: { connected: true } }), true);
  const hidden = { ...node.data.document, canvas: { ...node.data.document.canvas, autoSize: false }, layers: node.data.document.layers.map(layer => ({ ...layer, visible: false })) };
  assert.equal(compositorPending(hidden, { background: { connected: true } }), false);
  assert.deepEqual(imageOutput(node, 'result', [node], [{ ...input, source: 'comp', sourceHandle: 'result' }]), []);
  const preview: AppNode = { id: 'next', type: 'invert', position: { x: 0, y: 0 }, data: { result: asset('inverted'), outputRevision: JSON.stringify(['output', 'invert-rgb-v1']) } };
  assert.equal(imageOutput(preview, 'result', [...nodes, preview], [...edges, { id: 'next', source: 'comp', sourceHandle: 'result', target: 'next', targetHandle: 'image' }])[0].id, 'inverted');
});

test('connection validation accepts multiple image ports and downstream processing, rejects invalid handles and cycles', () => {
  const node = compositor();
  assert.equal(canConnect(input, [file, node], []), true);
  assert.equal(canConnect(second, [file, node], [input]), true);
  assert.equal(canConnect(input, [file, node], [input]), false);
  assert.equal(canConnect({ ...input, targetHandle: 'layer-9' }, [file, node], []), false);
  assert.equal(canConnect(input, [file, { ...node, data: { ...node.data, locked: true } }], []), false);
  const text: AppNode = { ...file, type: 'text', data: { text: 'hello' } };
  assert.equal(canConnect(input, [text, node], []), false);
  for (const type of ['preview', 'invert', 'levels', 'blur', 'color-correction', 'crop', 'painter', 'rotate-flip', 'sunburst', 'image-describer', 'compositor']) {
    const target = { ...compositor(), id: 'target', type } as AppNode;
    const edge = { source: 'comp', sourceHandle: 'result', target: 'target', targetHandle: type === 'compositor' ? 'background' : ['preview', 'color-correction'].includes(type) ? 'file' : ['sunburst', 'image-describer'].includes(type) ? 'image-0' : 'image' };
    assert.equal(canConnect(edge, [node, target], []), true, type);
    assert.equal(canConnect(edge, [node, target], [{ id: 'cycle', source: 'target', target: 'comp' }]), false, type);
  }
});

test('effects reuse existing pixel algorithms in order, preserve original bytes and support disabled effects', () => {
  const source = new Uint8ClampedArray([30, 60, 80, 255, 160, 100, 50, 128, 240, 20, 30, 0, 40, 160, 250, 255]);
  const original = source.slice(), color = { ...defaultColorSettings, exposure: 1.3, contrast: 22 };
  const levels = structuredClone(defaultLevelsSettings); levels.RGB.gamma = 1.7;
  const effects = [{ id: 'b', enabled: true, type: 'blur' as const, settings: { type: 'gaussian' as const, size: 3 } }, { id: 'c', enabled: true, type: 'color' as const, settings: color }, { id: 'i', enabled: true, type: 'invert' as const }, { id: 'l', enabled: true, type: 'levels' as const, settings: levels }];
  let expected: Uint8ClampedArray = blurPixels(source, 2, 2, effects[0].settings! as { type: 'gaussian'; size: number });
  correctPixels(expected, color); expected = invertPixels(expected); expected = levelsPixels(expected, levels);
  assert.deepEqual(compositorPixels(source, 2, 2, effects), expected);
  assert.notDeepEqual(compositorPixels(source, 2, 2, [...effects].reverse()), expected);
  assert.deepEqual(compositorPixels(source, 2, 2, effects.map(effect => ({ ...effect, enabled: false }))), source);
  assert.deepEqual(source, original);
  assert.deepEqual(compositorPixels(source, 2, 2, [effects[2]]).filter((_, index) => index % 4 === 3), source.filter((_, index) => index % 4 === 3));
});

test('rotated corner resize keeps the opposite corner stationary', () => {
  const initial = { x: 30, y: 50, width: 400, height: 200, rotation: 38 };
  const corner = (t: typeof initial, sx: number, sy: number) => { const r = t.rotation * Math.PI / 180; return [t.x + t.width / 2 + sx * t.width / 2 * Math.cos(r) - sy * t.height / 2 * Math.sin(r), t.y + t.height / 2 + sx * t.width / 2 * Math.sin(r) + sy * t.height / 2 * Math.cos(r)]; };
  for (const name of ['nw', 'ne', 'sw', 'se']) {
    const result = resizeLayer(initial, 100, 60, name, false), sx = name.includes('w') ? 1 : -1, sy = name.includes('n') ? 1 : -1;
    const before = corner(initial, sx, sy), after = corner(result, sx, sy);
    before.forEach((value, index) => assert.ok(Math.abs(value - after[index]) < 1e-6));
  }
  const locked = resizeLayer(initial, 100, 60, 'se', true);
  assert.equal(locked.width / locked.height, 2);
});

test('assets, input fallback snapshots, effects and timeline survive persistence while derived output is excluded from undo', () => {
  const node = compositor();
  node.data.document = snapshotCompositor(node.data.document, { background: { connected: true, asset: asset('source') } });
  node.data.document.layers.push(createLayer('local', 'Local', { kind: 'asset', asset: asset('local') }));
  node.data.document.layers[0].effects = [newEffect('invert')]; node.data.document.timeline.enabled = true;
  node.data.result = asset('result');
  const [mapped] = mapAssets([node], image => ({ ...image, url: image.url + '-restored' })) as CompositorNode[];
  assert.deepEqual([...nodeAssetUrls([mapped])].sort(), ['blob:local-restored', 'blob:result-restored', 'blob:source-restored']);
  assert.equal('result' in compositorDocument(node.data), false);
  const snapshot = workflowSnapshot({ nodes: [mapped], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' });
  assert.deepEqual((snapshot.nodes[0] as CompositorNode).data.document, mapped.data.document);
  const restored = restoreCompositorData(mapped.data)!;
  assert.deepEqual(restored.document, mapped.data.document); assert.equal(restored.result, undefined);
  for (const invalid of [null, {}, { document: { ...node.data.document, canvas: { ...node.data.document.canvas, width: Infinity } } }, { document: { ...node.data.document, layers: [{ ...node.data.document.layers[0], opacity: 2 }] } }, { document: { ...node.data.document, inputs: [...node.data.document.inputs, node.data.document.inputs[0]] } }]) assert.equal(restoreCompositorData(invalid), undefined);
});

test('nonvisual editor metadata retains the same image revision', () => {
  const document = defaultCompositorDocument(), revision = compositorRevision(document, {});
  const renamed = { ...document, inputs: document.inputs.map(input => ({ ...input, name: 'rename' })),
    layers: document.layers.map(layer => ({ ...layer, name: 'rename', locked: true, aspectLocked: false })),
    canvas: { ...document.canvas, aspectLocked: true }, timeline: { ...document.timeline, enabled: true, fps: 60 } };
  assert.equal(compositorRevision(renamed, {}), revision);
});

test('restored Blob URLs preserve output validity, including locked nodes; asset identity and remote URL changes invalidate', () => {
  const node = compositor();
  node.data.locked = true; node.data.result = asset('result');
  const inputs = compositorInputs(node.id, [file, node], [input]);
  node.data.outputRevision = compositorRevision(node.data.document, inputs);
  const restored = mapAssets([file, node], asset => ({ ...asset, url: asset.url + '-restored' }));
  assert.equal(imageOutput(restored[1], 'result', restored, [input])[0].url, 'blob:result-restored');
  assert.notEqual(compositorRevision(node.data.document, { background: { connected: true, asset: asset('new') } }), node.data.outputRevision);
  assert.notEqual(compositorRevision(node.data.document, { background: { connected: true, asset: { ...asset('a'), url: 'https://test/a.png' } } }),
    compositorRevision(node.data.document, { background: { connected: true, asset: { ...asset('a'), url: 'https://test/b.png' } } }));
});


test('aspect-locked corner can shrink along one axis and rotated alignment uses visible bounds', () => {
  const t = { x: 0, y: 0, width: 400, height: 200, rotation: 0 };
  const shrunk = resizeLayer(t, -100, 0, 'se', true);
  assert.equal(shrunk.width, 300); assert.equal(shrunk.height, 150);
  const rotated = { ...t, rotation: 90 }, canvas = { width: 1000, height: 800 };
  assert.equal(Math.round(alignCompositorLayer(rotated, canvas, 0).x), -100);
  assert.equal(Math.round(alignCompositorLayer(rotated, canvas, 2).x), 700);
  assert.equal(Math.round(alignCompositorLayer(rotated, canvas, 3).y), 100);
  assert.equal(Math.round(alignCompositorLayer(rotated, canvas, 5).y), 500);
});
