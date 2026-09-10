'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recordRequest } = require('../src/collector');
const { runningState } = require('./helpers');

test('OBSERVE collects matching fingerprints and ignores unknown/background apps', () => {
  const state = runningState({ target: 'BILIBILI', mode: 'OBSERVE' });
  assert.equal(recordRequest(state, { url: 'https://api.bilibili.com/x', method: 'GET' }, 1).collected, true);
  assert.equal(recordRequest(state, { url: 'https://unknown.example.com/x' }, 2).collected, false);
  assert.equal(recordRequest(state, { url: 'https://music.163.com/x' }, 3).collected, false);
  assert.equal(Object.values(state.hosts)[0].recognition, 'FINGERPRINT');
});

test('ANALYZE retains unknown target-session hosts but marks them as session attribution', () => {
  const state = runningState({ target: 'DOUYIN', mode: 'ANALYZE' });
  const result = recordRequest(state, { url: 'https://unknown.example.com/feed' }, 1);
  assert.equal(result.collected, true);
  assert.equal(result.record.app, 'DOUYIN');
  assert.equal(result.record.recognition, 'SESSION');
});

test('CUSTOM supports arbitrary apps and aggregates count/timestamps/categories', () => {
  const state = runningState({ target: 'CUSTOM', customTarget: 'MY_APP', mode: 'ANALYZE' });
  recordRequest(state, { url: 'HTTPS://API.EXAMPLE.COM:443/search?q=x', method: 'POST' }, 1000);
  recordRequest(state, { url: 'https://api.example.com/comment', method: 'GET' }, 2000);
  const record = Object.values(state.hosts)[0];
  assert.equal(record.app, 'MY_APP');
  assert.equal(record.recognition, 'CUSTOM_SESSION');
  assert.equal(record.count, 2);
  assert.equal(record.firstSeen, new Date(1000).toISOString());
  assert.equal(record.lastSeen, new Date(2000).toISOString());
});
