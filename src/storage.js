'use strict';

const {
  STORAGE_KEY, STATE_VERSION, MAX_HOSTS, MAX_SERIALIZED_BYTES,
  APPS, ANALYZER_MODES, PROXY_MODES
} = require('./constants');

function nowIso(now) {
  return new Date(now == null ? Date.now() : now).toISOString();
}

function createEmptyState(now) {
  return {
    version: STATE_VERSION,
    lifecycle: 'STOPPED',
    config: {
      enabled: true,
      target: 'ALL',
      customTarget: '',
      policy: 'IP',
      mode: 'OBSERVE',
      proxyMode: 'CORE_ONLY',
      customCategories: []
    },
    session: null,
    totalRequests: 0,
    ignoredRequests: 0,
    hosts: {},
    createdAt: nowIso(now),
    updatedAt: nowIso(now)
  };
}

function safeParse(text, now) {
  if (!text) return createEmptyState(now);
  try {
    const value = JSON.parse(text);
    if (!value || value.version !== STATE_VERSION || typeof value.hosts !== 'object') return createEmptyState(now);
    return value;
  } catch (_) {
    const state = createEmptyState(now);
    state.recoveredFromInvalidData = true;
    return state;
  }
}

function byteLength(value) {
  try { return unescape(encodeURIComponent(value)).length; } catch (_) { return value.length; }
}

function hostRetentionScore(record, now) {
  const ageDays = Math.max(0, (now - Date.parse(record.lastSeen || 0)) / 86400000);
  const recognized = record.recognition === 'FINGERPRINT' ? 2 : 0;
  const core = ['API', 'AUTH', 'FEED', 'SEARCH', 'COMMENT', 'USER', 'WEBSOCKET'].includes(record.category) ? 1.5 : 0;
  return Math.log2((record.count || 0) + 1) * 2 + recognized + core + (record.appConfidence || 0) - ageDays / 14;
}

function pruneState(state, options) {
  const now = options && options.now != null ? options.now : Date.now();
  const maxHosts = options && options.maxHosts || MAX_HOSTS;
  const maxBytes = options && options.maxBytes || MAX_SERIALIZED_BYTES;
  let records = Object.entries(state.hosts);
  if (records.length > maxHosts) {
    records.sort((a, b) => hostRetentionScore(b[1], now) - hostRetentionScore(a[1], now));
    state.hosts = Object.fromEntries(records.slice(0, maxHosts));
  }
  let serialized = JSON.stringify(state);
  if (byteLength(serialized) > maxBytes) {
    records = Object.entries(state.hosts).sort((a, b) => hostRetentionScore(a[1], now) - hostRetentionScore(b[1], now));
    while (records.length && byteLength(serialized) > maxBytes) {
      const batch = Math.max(1, Math.ceil(records.length * 0.05));
      for (const [key] of records.splice(0, batch)) delete state.hosts[key];
      serialized = JSON.stringify(state);
    }
  }
  return state;
}

function normalizeConfig(input, current) {
  const source = input || {};
  const target = APPS.includes(String(source.target || '').toUpperCase()) ? String(source.target).toUpperCase() : current.target;
  const mode = ANALYZER_MODES.includes(String(source.mode || '').toUpperCase()) ? String(source.mode).toUpperCase() : current.mode;
  const proxyMode = PROXY_MODES.includes(String(source.proxyMode || source.proxy_mode || '').toUpperCase())
    ? String(source.proxyMode || source.proxy_mode).toUpperCase() : current.proxyMode;
  const customRaw = source.customCategories || source.custom_categories || current.customCategories || [];
  const customCategories = Array.isArray(customRaw)
    ? customRaw.map((v) => String(v).toUpperCase())
    : String(customRaw).split(/[;,\s]+/).filter(Boolean).map((v) => v.toUpperCase());
  return {
    enabled: source.enabled == null ? current.enabled : source.enabled === true || String(source.enabled).toLowerCase() === 'true' || String(source.enabled).toUpperCase() === 'ON',
    target,
    customTarget: String(source.customTarget || source.custom_target || current.customTarget || '').trim().slice(0, 64),
    policy: String(source.policy || current.policy || 'IP').trim().slice(0, 128),
    mode,
    proxyMode,
    customCategories
  };
}

function createStorage(adapter, options) {
  if (!adapter || typeof adapter.read !== 'function' || typeof adapter.write !== 'function') {
    throw new TypeError('storage adapter requires read and write');
  }
  const key = options && options.key || STORAGE_KEY;
  const clock = options && options.clock || (() => Date.now());
  return {
    load() { return safeParse(adapter.read(key), clock()); },
    save(state) {
      state.updatedAt = nowIso(clock());
      pruneState(state, { now: clock(), maxHosts: options && options.maxHosts, maxBytes: options && options.maxBytes });
      return adapter.write(JSON.stringify(state), key);
    },
    clear() { return adapter.write(undefined, key); },
    control(action, config) {
      const state = this.load();
      const command = String(action || '').toUpperCase();
      state.config = normalizeConfig(config, state.config);
      if (command === 'START') {
        state.lifecycle = 'RUNNING';
        state.session = { startedAt: nowIso(clock()), stoppedAt: null, target: state.config.target };
      } else if (command === 'PAUSE') {
        state.lifecycle = 'PAUSED';
      } else if (command === 'STOP') {
        state.lifecycle = 'STOPPED';
        if (state.session) state.session.stoppedAt = nowIso(clock());
      } else if (command === 'CLEAR') {
        this.clear();
        return createEmptyState(clock());
      } else {
        throw new Error('unsupported lifecycle command: ' + command);
      }
      this.save(state);
      return state;
    }
  };
}

module.exports = { createEmptyState, safeParse, pruneState, normalizeConfig, createStorage, byteLength };
