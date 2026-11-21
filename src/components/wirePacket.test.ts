import assert from 'node:assert/strict';
import test from 'node:test';
import { wirePacket, wirePacketCenter } from '../edges/wireGeometry.ts';

test('running wire timing matches the short and long Flora captures, independently of generation progress', () => {
  // Canvas endpoint deltas and periods measured from sequential reference frames.
  for (const [x, y, measured] of [[192, 224, 753], [192, 288, 840], [640, 288, 1435]]) {
    const packet = wirePacket({ x: 0, y: 0 }, { x, y });
    assert.ok(Math.abs(packet.durationMs - measured) < 2);
    assert.equal(packet.radius, 50);
    assert.deepEqual(wirePacketCenter(packet, .5), { x: x / 2, y: y / 2 });
  }
});

test('short and very long wires cap timing and light size, with finite degenerate geometry', () => {
  const empty = wirePacket({ x: 12, y: -8 }, { x: 12, y: -8 });
  assert.equal(empty.durationMs, 500);
  assert.equal(empty.radius, 0);
  assert.deepEqual(wirePacketCenter(empty, .5), { x: 12, y: -8 });
  const short = wirePacket({ x: 0, y: 0 }, { x: 90, y: 0 });
  assert.equal(short.radius, 30);
  assert.equal(short.durationMs, 500);
  assert.deepEqual(wirePacketCenter(short, 0), { x: -42, y: 0 });
  assert.deepEqual(wirePacketCenter(short, 1), { x: 132, y: 0 });
  assert.equal(wirePacket({ x: 0, y: 0 }, { x: 3000, y: 400 }).durationMs, 2000);
});

test('radial light follows reversed and vertical curves through the actual anchors', () => {
  for (const end of [{ x: -300, y: 200 }, { x: 0, y: 300 }]) {
    const start = { x: 0, y: 0 };
    const packet = wirePacket(start, end);
    const span = packet.length + packet.lead * 2;
    assert.deepEqual(wirePacketCenter(packet, packet.lead / span), start);
    const arrival = wirePacketCenter(packet, (packet.lead + packet.length) / span);
    assert.ok(Math.hypot(arrival.x - end.x, arrival.y - end.y) < .000001);
    const middle = wirePacketCenter(packet, .5);
    assert.ok(Number.isFinite(middle.x) && Number.isFinite(middle.y));
  }
});
