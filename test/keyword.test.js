'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { discoverKeywords, randomLike } = require('../src/keyword');

function record(host, count, category) {
  return { host, count, app: 'DOUYIN', category: category || 'FEED', recognition: 'FINGERPRINT' };
}

test('discovers stable hyphenated DOMAIN-KEYWORD with high confidence', () => {
  const output = discoverKeywords([
    record('abc-core-c-lq.example.com', 100),
    record('foo-core-c-lq.example.com', 130),
    record('bar-core-c-lq.example.com', 190)
  ]);
  const candidate = output.find((item) => item.value === 'core-c-lq');
  assert.ok(candidate);
  assert.equal(candidate.hostCount, 3);
  assert.equal(candidate.requestCount, 420);
  assert.ok(candidate.confidence >= 0.9);
});

test('random/hash-like strings receive negligible confidence', () => {
  assert.equal(randomLike('a8f71c92'), true);
  const output = discoverKeywords([record('a8f71c92.example.com', 2), record('a8f71c92.other.net', 2)]);
  const candidate = output.find((item) => item.value === 'a8f71c92');
  assert.ok(candidate);
  assert.ok(candidate.confidence < 0.2);
  assert.equal(candidate.randomLike, true);
});
