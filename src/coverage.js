'use strict';

const { CORE_CATEGORIES, MEDIA_CATEGORIES } = require('./constants');
const { matchRule } = require('./rules');

function percent(part, total) {
  return total ? Math.round(part / total * 1000) / 10 : 0;
}

function groupCoverage(records, rules, predicate) {
  const group = records.filter(predicate);
  const requests = group.reduce((sum, record) => sum + (record.count || 0), 0);
  const covered = group.reduce((sum, record) => {
    return sum + (rules.some((rule) => matchRule(record.host, rule)) ? (record.count || 0) : 0);
  }, 0);
  return { requests, coveredRequests: covered, percent: percent(covered, requests) };
}

function calculateCoverage(records, rules) {
  const activeRules = (rules || []).filter((rule) => rule.recommended !== false);
  const total = records.reduce((sum, record) => sum + (record.count || 0), 0);
  const recognizedKinds = ['FINGERPRINT', 'CUSTOM_SESSION'];
  const identified = records.reduce((sum, record) => sum + (recognizedKinds.includes(record.recognition) ? (record.count || 0) : 0), 0);
  const unknownRecords = records.filter((record) => !recognizedKinds.includes(record.recognition) || record.category === 'UNKNOWN');
  const unknown = unknownRecords.reduce((sum, record) => sum + (record.count || 0), 0);
  const all = groupCoverage(records, activeRules, () => true);
  return {
    totalRequests: total,
    identifiedRequests: identified,
    identifiedPercent: percent(identified, total),
    unknownRequests: unknown,
    unknownPercent: percent(unknown, total),
    ruleCoveragePercent: all.percent,
    coveredRequests: all.coveredRequests,
    core: groupCoverage(records, activeRules, (record) => CORE_CATEGORIES.includes(record.category)),
    media: groupCoverage(records, activeRules, (record) => MEDIA_CATEGORIES.includes(record.category)),
    unknown: groupCoverage(records, activeRules, (record) => !recognizedKinds.includes(record.recognition) || record.category === 'UNKNOWN')
  };
}

module.exports = { calculateCoverage, percent, groupCoverage };
