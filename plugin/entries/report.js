'use strict';

const { createStorage, normalizeConfig } = require('../../src/storage');
const { recommendRules } = require('../../src/rules');
const { generateReport } = require('../../src/report');

const adapter = {
  read: (key) => $persistentStore.read(key),
  write: (value, key) => $persistentStore.write(value, key)
};

try {
  const state = createStorage(adapter).load();
  state.config = normalizeConfig($argument || {}, state.config);
  const records = Object.values(state.hosts || {});
  const rules = recommendRules(records, {
    policy: state.config.policy,
    proxyMode: state.config.proxyMode,
    customCategories: state.config.customCategories,
    existingRules: ($argument || {}).existing_rules || ''
  });
  const report = generateReport(state, rules);
  $done({ title: 'Loon App IP Router 报告', content: report.text });
} catch (error) {
  $done({ title: 'Loon App IP Router', content: '报告生成失败：' + String(error && error.message || error) });
}
