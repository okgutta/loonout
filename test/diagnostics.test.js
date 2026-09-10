'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDiagnostics } = require('../src/diagnostics');

test('reports IPv4, IPv6, QUIC and WebSocket limitations', () => {
  const output = buildDiagnostics([
    { host: '203.0.113.1', isIP: true, ipVersion: 4, category: 'UNKNOWN', recognition: 'SESSION', count: 1 },
    { host: '2001:db8::1', isIP: true, ipVersion: 6, category: 'UNKNOWN', recognition: 'SESSION', count: 1 },
    { host: 'search-quic-lq.example.com', likelyQuic: true, category: 'API', recognition: 'FINGERPRINT', count: 1 },
    { host: 'ws.example.com', category: 'WEBSOCKET', recognition: 'FINGERPRINT', count: 1 }
  ]);
  assert.equal(output.ipv4.length, 1);
  assert.equal(output.ipv6.length, 1);
  assert.equal(output.likelyQuic.length, 1);
  assert.equal(output.websocket.length, 1);
  assert.ok(output.warnings.some((warning) => warning.includes('QUIC/UDP')));
});
