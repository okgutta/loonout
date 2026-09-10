'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createEmptyState } = require('../src/storage');
const { recordRequest } = require('../src/collector');
const { recommendRules } = require('../src/rules');
const { calculateCoverage } = require('../src/coverage');

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', 'acceptance-scenarios.json'), 'utf8'));
const summaries = [];

for (const [app, requests] of Object.entries(fixtures)) {
  const state = createEmptyState(0);
  state.lifecycle = 'RUNNING';
  state.config = { ...state.config, target: app, mode: 'ANALYZE', proxyMode: 'CORE_MEDIA', policy: 'IP' };
  let now = 1000;
  for (const request of requests) {
    for (let index = 0; index < request.count; index += 1) recordRequest(state, { url: request.url, method: 'GET' }, now++);
  }
  const records = Object.values(state.hosts);
  const rules = recommendRules(records, { policy: 'IP', proxyMode: 'CORE_MEDIA' });
  const coverage = calculateCoverage(records, rules.filter((rule) => rule.recommended));
  if (app === 'DOUYIN') {
    for (const keyword of ['core-c-lq', 'normal-lq', 'search-lq']) {
      assert.ok(rules.some((rule) => rule.id === 'DOMAIN-KEYWORD:' + keyword && rule.confidence >= 0.75), 'missing DOUYIN ' + keyword);
    }
    assert.ok(records.some((record) => record.host === 'unknown-session.example.org' && record.recognition === 'SESSION'));
  }
  if (app === 'BILIBILI') {
    assert.ok(rules.some((rule) => rule.id === 'DOMAIN-SUFFIX:biliapi.net'));
    const media = records.find((record) => record.host === 'upos.bilivideo.com');
    assert.ok(media && ['VIDEO', 'CDN'].includes(media.category) && media.resourceScore > 0.7);
  }
  if (app === 'NETEASE') {
    for (const suffix of ['music.163.com', 'music.126.net', 'netease.im']) assert.ok(rules.some((rule) => rule.id === 'DOMAIN-SUFFIX:' + suffix));
  }
  summaries.push({ app, requests: state.totalRequests, hosts: records.length, candidates: rules.length, coverage: coverage.ruleCoveragePercent });
}

console.log('Acceptance simulation passed:');
for (const item of summaries) console.log(item.app + ': requests=' + item.requests + ', hosts=' + item.hosts + ', candidates=' + item.candidates + ', recommendedCoverage=' + item.coverage + '%');
