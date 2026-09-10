'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recommendRules, dedupeRules, exportConfirmed, normalizePolicy, parseExistingRules } = require('../src/rules');
const { runningState, collectMany } = require('./helpers');

function bilibiliRecords() {
  const state = runningState({ target: 'BILIBILI', mode: 'ANALYZE' });
  collectMany(state, [
    { url: 'https://api.bilibili.com/x/web-interface/view', count: 30 },
    { url: 'https://app.bilibili.com/x/feed/index', count: 20 },
    { url: 'https://foo.biliapi.net/x/api', count: 10 },
    { url: 'https://bar.biliapi.net/x/api', count: 8 },
    { url: 'https://upos.bilivideo.com/video/part.mp4', count: 100 }
  ]);
  return Object.values(state.hosts);
}

test('recommends DOMAIN, DOMAIN-SUFFIX and lowers video/CDN confidence', () => {
  const rules = recommendRules(bilibiliRecords(), { policy: 'IP', proxyMode: 'CORE_MEDIA' });
  const exact = rules.find((rule) => rule.id === 'DOMAIN:api.bilibili.com');
  const suffix = rules.find((rule) => rule.id === 'DOMAIN-SUFFIX:biliapi.net');
  const video = rules.find((rule) => rule.id === 'DOMAIN-SUFFIX:bilivideo.com');
  assert.ok(exact && exact.confidence > 0.8);
  assert.ok(suffix && suffix.confidence > 0.8);
  assert.ok(video && video.confidence < suffix.confidence);
  assert.equal(exact.coveredBy, 'DOMAIN-SUFFIX:bilibili.com');
});

test('discovers DOMAIN-KEYWORD and excludes random identifiers', () => {
  const state = runningState({ target: 'DOUYIN', mode: 'ANALYZE' });
  collectMany(state, [
    { url: 'https://abc-core-c-lq.example.com/api/feed', count: 30 },
    { url: 'https://xyz-core-c-lq.example.com/api/feed', count: 40 },
    { url: 'https://foo-core-c-lq.example.com/api/feed', count: 50 }
  ]);
  const rules = recommendRules(Object.values(state.hosts), { policy: '美国节点', proxyMode: 'CORE_ONLY' });
  const keyword = rules.find((rule) => rule.id === 'DOMAIN-KEYWORD:core-c-lq');
  assert.ok(keyword);
  assert.equal(keyword.policy, '美国节点');
  assert.ok(keyword.confidence >= 0.9);
  assert.equal(rules.some((rule) => rule.value === 'a8f71c92'), false);
});

test('deduplicates rules and exports only explicit confirmations', () => {
  const rules = recommendRules(bilibiliRecords(), { policy: 'IP', proxyMode: 'CORE_MEDIA' });
  assert.equal(dedupeRules([rules[0], rules[0]]).length, 1);
  const empty = exportConfirmed(rules, '');
  assert.equal(empty.selected.length, 0);
  assert.doesNotMatch(empty.text, /^DOMAIN,/m);

  const exported = exportConfirmed(rules, 'DOMAIN:api.bilibili.com;DOMAIN-SUFFIX:bilibili.com');
  assert.match(exported.text, /DOMAIN-SUFFIX,bilibili\.com,IP/);
  assert.doesNotMatch(exported.text, /DOMAIN,api\.bilibili\.com,IP/);
  assert.deepEqual(exported.omitted, [{ rule: 'DOMAIN:api.bilibili.com', coveredBy: 'DOMAIN-SUFFIX:bilibili.com' }]);
});

test('rejects policy injection', () => {
  assert.equal(normalizePolicy('日本节点'), '日本节点');
  assert.throws(() => normalizePolicy('IP\nDOMAIN,evil,DIRECT'));
  assert.throws(() => normalizePolicy('bad,policy'));
});

test('checks existing rules for duplicates and different-policy shadowing', () => {
  assert.equal(parseExistingRules('[Rule]\nDOMAIN-SUFFIX,biliapi.net,IP').length, 1);
  const rules = recommendRules(bilibiliRecords(), {
    policy: 'IP',
    proxyMode: 'CORE_MEDIA',
    existingRules: 'DOMAIN-SUFFIX,biliapi.net,IP;DOMAIN-SUFFIX,bilibili.com,DIRECT'
  });
  assert.equal(rules.find((rule) => rule.id === 'DOMAIN-SUFFIX:biliapi.net').existingStatus, 'ALREADY_COVERED');
  assert.equal(rules.find((rule) => rule.id === 'DOMAIN:api.bilibili.com').existingStatus, 'POLICY_SHADOW');
  const exported = exportConfirmed(rules, 'DOMAIN-SUFFIX:biliapi.net;DOMAIN:api.bilibili.com', {
    existingRules: 'DOMAIN-SUFFIX,biliapi.net,IP;DOMAIN-SUFFIX,bilibili.com,DIRECT'
  });
  assert.equal(exported.selected.some((rule) => rule.id === 'DOMAIN-SUFFIX:biliapi.net'), false);
  assert.ok(exported.warnings.some((warning) => warning.includes('api.bilibili.com')));
});

test('does not create candidates from session-attributed unknown hosts', () => {
  const state = runningState({ target: 'DOUYIN', mode: 'ANALYZE' });
  collectMany(state, [{ url: 'https://unknown.example.com/api', count: 50 }]);
  const rules = recommendRules(Object.values(state.hosts), { policy: 'IP', proxyMode: 'WHOLE_APP' });
  assert.equal(rules.length, 0);
});

test('CUSTOM isolated sessions produce lower-confidence candidates that still require confirmation', () => {
  const state = runningState({ target: 'CUSTOM', customTarget: 'MY_APP', mode: 'ANALYZE' });
  collectMany(state, [
    { url: 'https://api-a.myservice.example/api/feed', count: 20 },
    { url: 'https://api-b.myservice.example/api/feed', count: 20 }
  ]);
  const rules = recommendRules(Object.values(state.hosts), { policy: 'IP', proxyMode: 'CORE_ONLY' });
  const exact = rules.find((rule) => rule.id === 'DOMAIN:api-a.myservice.example');
  const suffix = rules.find((rule) => rule.id === 'DOMAIN-SUFFIX:myservice.example');
  assert.ok(exact && exact.reason.includes('CUSTOM'));
  assert.ok(suffix && suffix.reason.includes('CUSTOM'));
  assert.equal(exportConfirmed(rules, '').selected.length, 0);
});
