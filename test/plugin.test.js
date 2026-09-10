'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('plugin uses documented Loon 3.5.0 legacy Script syntax and exposes required arguments', () => {
  const text = fs.readFileSync(path.join(root, 'plugin', 'Loon-App-IP-Router.plugin'), 'utf8');
  for (const name of ['enabled', 'target', 'policy', 'mode', 'existing_rules']) assert.match(text, new RegExp('^' + name + '\\s*=', 'm'));
  for (const app of ['BILIBILI', 'DOUYIN', 'NETEASE', 'WECHAT', 'WEIBO', 'XIAOHONGSHU', 'KUAISHOU', 'ZHIHU', 'TIEBA', 'COOLAPK', 'CUSTOM']) {
    assert.match(text, new RegExp('"' + app + '"'));
  }
  assert.match(text, /#!loon_version = 3\.5\.0/);
  assert.match(text, /^http-request .* script-path=https:\/\//m);
  assert.match(text, /^generic script-path=https:\/\//m);
  assert.match(text, /argument=\[\{enabled\},\{target\}/);
  assert.doesNotMatch(text, /request if \$\{url\} ~=|generic then script/);
  assert.doesNotMatch(text, /onEveryNetworkRequest/);
});

test('built Loon bundles execute with documented globals', () => {
  const data = new Map();
  const persistent = {
    read: (key) => data.get(key),
    write: (value, key) => { if (value == null) data.delete(key); else data.set(key, value); return true; }
  };
  let result;
  const common = { console, $persistentStore: persistent, $done: (value) => { result = value; } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'plugin', 'control.js'), 'utf8'), {
    ...common,
    $argument: { enabled: true, target: 'BILIBILI', policy: 'IP', mode: 'ANALYZE', proxy_mode: 'CORE_ONLY', control: 'START' }
  });
  assert.match(result.content, /RUNNING/);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'plugin', 'analyzer.js'), 'utf8'), {
    ...common,
    $argument: { enabled: true, target: 'BILIBILI', policy: 'IP', mode: 'ANALYZE', proxy_mode: 'CORE_ONLY' },
    $request: { url: 'https://api.bilibili.com/x/web-interface/view', method: 'GET' }
  });
  const state = JSON.parse(Array.from(data.values())[0]);
  assert.equal(state.totalRequests, 1);
});
