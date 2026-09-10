'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHost, normalizeRequest, isIPv4, isIPv6 } = require('../src/normalizer');

test('normalizes scheme, case, port, trailing dot, path, query and fragment', () => {
  assert.equal(normalizeHost('HTTPS://API.BILIBILI.COM.:443/test?a=1#x'), 'api.bilibili.com');
  assert.equal(normalizeHost('api.bilibili.com:8443/path'), 'api.bilibili.com');
  assert.equal(normalizeHost('  wss://WS.EXAMPLE.COM/socket  '), 'ws.example.com');
});

test('rejects malformed and empty host input', () => {
  assert.equal(normalizeHost(''), null);
  assert.equal(normalizeHost(null), null);
  assert.equal(normalizeHost('https://'), null);
});

test('detects IPv4 and IPv6 literals', () => {
  assert.equal(isIPv4('203.0.113.8'), true);
  assert.equal(isIPv4('999.0.0.1'), false);
  assert.equal(isIPv6('2001:db8::1'), true);
  assert.equal(isIPv6('hello:world'), false);
  assert.deepEqual(normalizeRequest('https://[2001:db8::1]:443/x').ipVersion, 6);
});
