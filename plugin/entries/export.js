'use strict';

const { createStorage, normalizeConfig } = require('../../src/storage');
const { recommendRules, exportConfirmed } = require('../../src/rules');
const { recordsForConfig } = require('../../src/report');

const adapter = {
  read: (key) => $persistentStore.read(key),
  write: (value, key) => $persistentStore.write(value, key)
};

try {
  const state = createStorage(adapter).load();
  state.config = normalizeConfig($argument || {}, state.config);
  const records = recordsForConfig(state);
  const rules = recommendRules(records, {
    policy: state.config.policy,
    proxyMode: state.config.proxyMode,
    customCategories: state.config.customCategories,
    existingRules: ($argument || {}).existing_rules || ''
  });
  const exported = exportConfirmed(rules, ($argument || {}).confirmed_rules || '', {
    existingRules: ($argument || {}).existing_rules || ''
  });
  console.log(exported.text);
  $done({ title: '已确认的 Loon Rule', content: exported.text });
} catch (error) {
  $done({ title: 'Loon App IP Router', content: '导出失败：' + String(error && error.message || error) });
}
