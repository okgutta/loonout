'use strict';

const { createEmptyState } = require('../src/storage');
const { recordRequest } = require('../src/collector');

function memoryAdapter(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    read(key) { return data.get(key); },
    write(value, key) {
      if (value == null) data.delete(key); else data.set(key, value);
      return true;
    },
    data
  };
}

function runningState(config, now) {
  const state = createEmptyState(now || 0);
  state.lifecycle = 'RUNNING';
  state.config = { ...state.config, ...(config || {}) };
  state.session = { startedAt: new Date(now || 0).toISOString(), stoppedAt: null, target: state.config.target };
  return state;
}

function collectMany(state, requests, start) {
  let now = start || 1000;
  for (const item of requests) {
    const count = item.count || 1;
    for (let index = 0; index < count; index += 1) {
      recordRequest(state, { url: item.url, method: item.method || 'GET' }, now++);
    }
  }
  return state;
}

module.exports = { memoryAdapter, runningState, collectMany };
