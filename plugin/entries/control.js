'use strict';

const { createStorage } = require('../../src/storage');

const adapter = {
  read: (key) => $persistentStore.read(key),
  write: (value, key) => $persistentStore.write(value, key)
};

try {
  const storage = createStorage(adapter);
  const args = $argument || {};
  const state = storage.control(args.control || 'START', args);
  const target = state.config.target === 'CUSTOM' ? (state.config.customTarget || 'CUSTOM') : state.config.target;
  $done({
    title: 'Loon App IP Router',
    content: '操作：' + String(args.control || 'START').toUpperCase() + '\n状态：' + state.lifecycle + '\n目标：' + target + '\nHost：' + Object.keys(state.hosts || {}).length
  });
} catch (error) {
  $done({ title: 'Loon App IP Router', content: '操作失败：' + String(error && error.message || error) });
}
