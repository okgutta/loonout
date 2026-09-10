'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectApp } = require('../src/fingerprints');

const cases = {
  'api.bilibili.com': 'BILIBILI',
  'abc-core-c-lq.example.com': 'DOUYIN',
  'music.163.com': 'NETEASE',
  'szshort.weixin.qq.com': 'WECHAT',
  'api.weibo.com': 'WEIBO',
  'edith.xiaohongshu.com': 'XIAOHONGSHU',
  'api.kuaishou.com': 'KUAISHOU',
  'www.zhihu.com': 'ZHIHU',
  'tieba.baidu.com': 'TIEBA',
  'api.coolapk.com': 'COOLAPK'
};

test('detects all built-in app fingerprints', () => {
  for (const [host, expected] of Object.entries(cases)) assert.equal(detectApp(host).app, expected, host);
});

test('does not claim unrelated shared domains', () => {
  assert.equal(detectApp('example.com').app, 'UNKNOWN');
  assert.equal(detectApp('mail.qq.com').app, 'UNKNOWN');
});
