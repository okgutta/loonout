'use strict';

const { createStorage, normalizeConfig } = require('../../src/storage');
const { recommendRules } = require('../../src/rules');
const { generateReport, recordsForConfig } = require('../../src/report');

const adapter = {
  read: (key) => $persistentStore.read(key),
  write: (value, key) => $persistentStore.write(value, key)
};

try {
  const state = createStorage(adapter).load();
  state.config = normalizeConfig(Object.assign({}, $argument || {}, { mode: 'ANALYZE' }), state.config);
  const records = recordsForConfig(state);
  const rules = recommendRules(records, {
    policy: state.config.policy,
    proxyMode: state.config.proxyMode,
    customCategories: state.config.customCategories
  });
  const report = generateReport(state, rules);
  const target = state.config.target === 'CUSTOM' ? (state.config.customTarget || 'CUSTOM') : state.config.target;
  const summary = '目标：' + target + '\n请求：' + report.coverage.totalRequests + '\nHost：' + records.length + '\n候选规则：' + rules.filter((rule) => rule.recommended).length;
  console.log(report.text);
  if (typeof $notification !== 'undefined' && $notification && typeof $notification.post === 'function') {
    $notification.post('Loon App IP Router', '抓取结果已生成', summary, { clipboard: report.text });
  }
  $done({ title: 'Loon App IP Router 简易报告', content: report.text });
} catch (error) {
  const message = '报告生成失败：' + String(error && error.message || error);
  console.log('[Loon App IP Router Easy] ' + message);
  $done({ title: 'Loon App IP Router', content: message });
}
