'use strict';

const { FINGERPRINTS } = require('./fingerprints');

const STOPWORDS = new Set([
  'www', 'api', 'apis', 'app', 'apps', 'com', 'net', 'org', 'cn', 'cdn', 'img', 'image',
  'static', 'video', 'web', 'mobile', 'gateway', 'service', 'server', 'prod', 'client', 'data'
]);

function randomLike(value) {
  const clean = value.replace(/[-_]/g, '');
  if (/^[0-9a-f]{8,}$/i.test(clean)) return true;
  if (/^[0-9a-z]{16,}$/i.test(clean) && !/[aeiou]/i.test(clean)) return true;
  if (/^\d{6,}$/.test(clean)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return true;
  return clean.length >= 8 && (clean.match(/\d/g) || []).length / clean.length > 0.55;
}

function labelCandidates(label) {
  const values = new Set();
  const pieces = label.split(/[-_]+/).filter(Boolean);
  const separator = label.includes('-') ? '-' : '_';
  for (let length = 2; length <= Math.min(5, pieces.length); length += 1) {
    for (let start = 0; start + length <= pieces.length; start += 1) {
      const value = pieces.slice(start, start + length).join(separator);
      if (value.length >= 4 && value.length <= 40) values.add(value);
    }
  }
  if (label.length >= 5 && label.length <= 40 && /[-_]/.test(label)) values.add(label);
  if (label.length >= 8 && label.length <= 40) values.add(label);
  return values;
}

function confidenceForKeyword(value, hostCount, requestCount, dominantRatio, app, category) {
  let score = 0.14;
  score += Math.min(0.28, Math.max(0, hostCount - 1) * 0.1);
  score += Math.min(0.18, Math.log10(requestCount + 1) * 0.075);
  score += Math.min(0.12, value.length / 100);
  if (/[-_]/.test(value)) score += 0.1;
  if (dominantRatio >= 0.9) score += 0.08;
  if (((FINGERPRINTS[app] || {}).keywords || []).includes(value)) score += 0.24;
  if (['API', 'AUTH', 'FEED', 'SEARCH', 'COMMENT', 'USER'].includes(category)) score += 0.06;
  if (randomLike(value)) score -= 0.62;
  if (STOPWORDS.has(value) || value.length < 4) score -= 0.5;
  return Math.max(0, Math.min(0.99, score));
}

function discoverKeywords(records, options) {
  const minHosts = options && options.minHosts || 2;
  const aggregate = new Map();
  for (const record of records) {
    if (!record || !record.host || record.isIP) continue;
    for (const label of record.host.split('.')) {
      for (const value of labelCandidates(label)) {
        if (!aggregate.has(value)) aggregate.set(value, { hosts: new Set(), requestCount: 0, apps: {}, categories: {} });
        const item = aggregate.get(value);
        if (!item.hosts.has(record.host)) item.requestCount += record.count || 0;
        item.hosts.add(record.host);
        item.apps[record.app] = (item.apps[record.app] || 0) + (record.count || 0);
        item.categories[record.category] = (item.categories[record.category] || 0) + (record.count || 0);
      }
    }
  }
  const output = [];
  for (const [value, item] of aggregate) {
    const hostCount = item.hosts.size;
    if (hostCount < minHosts && !Object.values(FINGERPRINTS).some((fp) => (fp.keywords || []).includes(value))) continue;
    const app = Object.keys(item.apps).sort((a, b) => item.apps[b] - item.apps[a])[0];
    const category = Object.keys(item.categories).sort((a, b) => item.categories[b] - item.categories[a])[0];
    const dominantRatio = item.apps[app] / Math.max(1, item.requestCount);
    const confidence = confidenceForKeyword(value, hostCount, item.requestCount, dominantRatio, app, category);
    output.push({
      value, hostCount, requestCount: item.requestCount, app, category, confidence,
      randomLike: randomLike(value),
      hosts: Array.from(item.hosts).sort()
    });
  }
  return output.sort((a, b) => b.confidence - a.confidence || b.requestCount - a.requestCount || b.value.length - a.value.length);
}

module.exports = { discoverKeywords, randomLike, labelCandidates, confidenceForKeyword };
