import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import { createLibraryNode } from '../components/libraryCatalog.ts';
import { migrateLegacyImageGraph } from '../persistence/legacyImageMigration.ts';
import { canConnect } from './connectionRules.ts';
import { prepareModel } from './executionGraph.ts';
import { routedEdges } from './router.ts';
import { textGenerationInput } from './textGeneration.ts';

const pos = { x: 0, y: 0 };
const link = (source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id: source + '-' + target, source, sourceHandle, target, targetHandle });

test('relay chains carry live text and the selected reference through workflow restoration', () => {
  const text = createLibraryNode('text', pos), image = createLibraryNode('image', pos);
  const consumer = createLibraryNode('text', pos), picture = createLibraryNode('image', pos);
  const a = createLibraryNode('router', pos), b = createLibraryNode('router', pos), c = createLibraryNode('router', pos);
  const nodes = [text, image, consumer, picture, a, b, c];
  text.data.textComposer.prompt = 'source text';
  image.data.results = ['first', 'second'].map(id => ({ id, kind: 'image', url: 'blob:' + id, name: id }));
  image.data.activeResultId = 'first';
  const edges: Edge[] = [];
  for (const wire of [link(b.id, 'out', consumer.id, 'text'), link(a.id, 'out', b.id, 'in'),
    link(text.id, 'text', a.id, 'in'), link(image.id, 'result', c.id, 'in'), link(c.id, 'out', consumer.id, 'image-0'),
    link(b.id, 'out', picture.id, 'prompt')]) {
    assert.ok(canConnect(wire, nodes, edges));
    edges.push(wire);
  }
  assert.ok(!canConnect(link(image.id, 'result', a.id, 'in'), nodes, edges));
  assert.ok(!canConnect(link(b.id, 'out', a.id, 'in'), nodes, edges));
  assert.ok(!canConnect(link(c.id, 'out', picture.id, 'prompt'), nodes, edges));
  assert.ok(!canConnect(link(a.id, 'out', picture.id, 'prompt'), nodes.map(n => n === a ? { ...a, data: { ...a.data, locked: true } } : n), edges));
  for (const legacy of [[], [createLibraryNode('text', pos)].map(n => ({ ...n, data: { text: '' } }))]) {
    const restored = migrateLegacyImageGraph([...nodes, ...legacy], edges);
    assert.deepEqual(restored.edges, edges);
    assert.equal(textGenerationInput(consumer.id, restored.nodes, restored.edges).prompt, 'source text');
  }
  assert.deepEqual(textGenerationInput(consumer.id, nodes, edges).images, ['blob:first']);
  image.data.activeResultId = 'second';
  text.data.text = 'updated';
  assert.equal(textGenerationInput(consumer.id, nodes, edges).prompt, 'updated');
  assert.deepEqual(textGenerationInput(consumer.id, nodes, edges).images, ['blob:second']);
  assert.equal(prepareModel({ nodes, edges: routedEdges(edges) }, picture.id)[0].imageRequest?.prompt, 'updated');
  assert.throws(() => textGenerationInput(consumer.id, nodes, edges.filter(e => e.source !== text.id)), /上游 Text/);
  assert.equal(edges.find(e => e.target === consumer.id)?.source, b.id);
});

test('video and audio relays honor downstream slots even when wired from the consumer first', () => {
  const router = createLibraryNode('router', pos);
  const audio = createLibraryNode('audio', pos), clip = createLibraryNode('video', pos);
  const target = createLibraryNode('video', pos);
  const nodes = [router, audio, clip, target];
  for (const [source, other] of [[audio, clip], [clip, audio]]) {
    const output = source.type!;
    const downstream = link(router.id, 'out', target.id, output + '-0');
    const upstream = link(source.id, output, router.id, 'in');
    assert.ok(canConnect(downstream, nodes, []));
    assert.ok(canConnect(upstream, nodes, [downstream]));
    assert.ok(!canConnect(link(other.id, other.type!, router.id, 'in'), nodes, [downstream]));
    const graph = migrateLegacyImageGraph(nodes, [downstream, upstream]);
    const edge = routedEdges(graph.edges).find(edge => edge.id === downstream.id);
    assert.deepEqual(edge, { ...downstream, source: source.id, sourceHandle: output });
  }
});
