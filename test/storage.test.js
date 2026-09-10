'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStorage, createEmptyState, pruneState, safeParse } = require('../src/storage');
const { memoryAdapter } = require('./helpers');

test('persists lifecycle and deletes only its own key on CLEAR', () => {
  let now = 1000;
  const adapter = memoryAdapter({ unrelated: 'keep' });
  const storage = createStorage(adapter, { clock: () => now });
  const started = storage.control('START', { target: 'DOUYIN', policy: '香港节点', mode: 'ANALYZE' });
  assert.equal(started.lifecycle, 'RUNNING');
  assert.equal(storage.load().config.policy, '香港节点');
  now = 2000;
  assert.equal(storage.control('PAUSE').lifecycle, 'PAUSED');
  assert.equal(storage.control('STOP').lifecycle, 'STOPPED');
  storage.control('CLEAR');
  assert.equal(adapter.data.get('unrelated'), 'keep');
  assert.equal(storage.load().totalRequests, 0);
});

test('recovers invalid JSON and prunes low-value records', () => {
  assert.equal(safeParse('{bad').recoveredFromInvalidData, true);
  const state = createEmptyState(0);
  state.hosts = {
    low: { host: 'low.example', count: 1, lastSeen: new Date(0).toISOString(), category: 'UNKNOWN', recognition: 'SESSION' },
    high: { host: 'api.bilibili.com', count: 500, lastSeen: new Date(100000).toISOString(), category: 'API', recognition: 'FINGERPRINT', appConfidence: 1 }
  };
  pruneState(state, { now: 100000, maxHosts: 1, maxBytes: 999999 });
  assert.deepEqual(Object.keys(state.hosts), ['high']);
});
