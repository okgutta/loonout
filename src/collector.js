'use strict';

const { normalizeRequest } = require('./normalizer');
const { detectApp } = require('./fingerprints');
const { classifyRequest } = require('./classifier');

function selectedApp(config, detection) {
  const target = config.target;
  const broadObservation = config.mode === 'ANALYZE' || config.proxyMode === 'WHOLE_APP';
  if (target === 'ALL') {
    if (detection.app !== 'UNKNOWN') return { app: detection.app, recognition: 'FINGERPRINT' };
    return broadObservation ? { app: 'UNKNOWN', recognition: 'UNATTRIBUTED' } : null;
  }
  if (target === 'CUSTOM') {
    return { app: config.customTarget || 'CUSTOM', recognition: 'CUSTOM_SESSION' };
  }
  if (detection.app === target) return { app: target, recognition: 'FINGERPRINT' };
  if (detection.app !== 'UNKNOWN') return null;
  return broadObservation ? { app: target, recognition: 'SESSION' } : null;
}

function recordRequest(state, rawRequest, now) {
  const time = now == null ? Date.now() : now;
  if (!state || state.lifecycle !== 'RUNNING' || !state.config || !state.config.enabled) {
    return { collected: false, reason: 'inactive', state };
  }
  const request = normalizeRequest(rawRequest);
  if (!request) return { collected: false, reason: 'invalid-url', state };
  const detection = detectApp(request.host);
  const attribution = selectedApp(state.config, detection);
  if (!attribution) {
    state.ignoredRequests = (state.ignoredRequests || 0) + 1;
    return { collected: false, reason: 'target-mismatch', state };
  }
  const classification = classifyRequest(request, attribution.app);
  const key = attribution.app + '|' + request.host;
  const seen = new Date(time).toISOString();
  const current = state.hosts[key];
  if (current) {
    current.count += 1;
    current.lastSeen = seen;
    current.categoryCounts[classification.category] = (current.categoryCounts[classification.category] || 0) + 1;
    current.category = Object.keys(current.categoryCounts).sort((a, b) => current.categoryCounts[b] - current.categoryCounts[a])[0];
    current.resourceScore = (current.resourceScore * (current.count - 1) + classification.resourceScore) / current.count;
    current.methods[rawRequest.method || 'UNKNOWN'] = (current.methods[rawRequest.method || 'UNKNOWN'] || 0) + 1;
    if (!current.pathSamples.includes(request.path) && current.pathSamples.length < 5) current.pathSamples.push(request.path);
  } else {
    state.hosts[key] = {
      host: request.host,
      app: attribution.app,
      detectedApp: detection.app,
      appConfidence: detection.strength,
      recognition: attribution.recognition,
      fingerprint: detection.value,
      count: 1,
      firstSeen: seen,
      lastSeen: seen,
      category: classification.category,
      categoryCounts: { [classification.category]: 1 },
      categoryConfidence: classification.confidence,
      resourceScore: classification.resourceScore,
      methods: { [rawRequest.method || 'UNKNOWN']: 1 },
      schemes: { [request.scheme]: 1 },
      pathSamples: [request.path],
      isIP: request.isIP,
      ipVersion: request.ipVersion,
      likelyQuic: /(?:quic|http3|h3)[.-]/i.test(request.host)
    };
  }
  state.totalRequests = (state.totalRequests || 0) + 1;
  return { collected: true, record: state.hosts[key], state };
}

module.exports = { recordRequest, selectedApp };
