'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recordsForConfig } = require('../src/report');

test('reports only the currently selected app while preserving ALL mode', () => {
  const state = {
    config: { target: 'DOUYIN', customTarget: '' },
    hosts: {
      a: { app: 'DOUYIN', host: 'a.example' },
      b: { app: 'BILIBILI', host: 'b.example' }
    }
  };
  assert.deepEqual(recordsForConfig(state).map((record) => record.host), ['a.example']);
  state.config.target = 'ALL';
  assert.equal(recordsForConfig(state).length, 2);
});
