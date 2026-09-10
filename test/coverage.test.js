'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCoverage } = require('../src/coverage');

const records = [
  { host: 'api.example.com', count: 80, category: 'API', recognition: 'FINGERPRINT' },
  { host: 'video.example.com', count: 15, category: 'VIDEO', recognition: 'FINGERPRINT' },
  { host: 'unknown.test', count: 5, category: 'UNKNOWN', recognition: 'SESSION' }
];

test('calculates request-weighted overall/core/media/unknown coverage', () => {
  const coverage = calculateCoverage(records, [
    { type: 'DOMAIN', value: 'api.example.com', recommended: true },
    { type: 'DOMAIN', value: 'video.example.com', recommended: true }
  ]);
  assert.equal(coverage.identifiedPercent, 95);
  assert.equal(coverage.unknownPercent, 5);
  assert.equal(coverage.ruleCoveragePercent, 95);
  assert.equal(coverage.core.percent, 100);
  assert.equal(coverage.media.percent, 100);
  assert.equal(coverage.unknown.percent, 0);
});
