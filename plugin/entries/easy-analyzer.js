'use strict';

const { createStorage, normalizeConfig } = require('../../src/storage');
const { recordRequest } = require('../../src/collector');

const adapter = {
  read: (key) => $persistentStore.read(key),
  write: (value, key) => $persistentStore.write(value, key)
};

try {
  const storage = createStorage(adapter);
  const state = storage.load();
  const previousTarget = state.config && state.config.target;
  state.config = normalizeConfig(Object.assign({}, $argument || {}, { mode: 'ANALYZE' }), state.config);
  if (state.lifecycle !== 'RUNNING' || previousTarget !== state.config.target) {
    state.lifecycle = 'RUNNING';
    state.session = {
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      target: state.config.target
    };
  }
  const result = recordRequest(state, $request || {});
  if (result.collected || result.reason === 'target-mismatch') storage.save(state);
} catch (error) {
  console.log('[Loon App IP Router Easy] collector error: ' + String(error && error.stack || error));
}

$done({});
