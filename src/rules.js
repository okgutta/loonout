'use strict';

const { CORE_CATEGORIES, MEDIA_CATEGORIES, LOW_VALUE_CATEGORIES } = require('./constants');
const { knownSuffixes, hostMatchesSuffix } = require('./fingerprints');
const { discoverKeywords } = require('./keyword');
const { clamp, confidenceToStars } = require('./scoring');

const TYPE_ORDER = { DOMAIN: 0, 'DOMAIN-SUFFIX': 1, 'DOMAIN-KEYWORD': 2 };

function normalizePolicy(policy) {
  const value = String(policy || '').trim();
  if (!value || /[,\r\n]/.test(value)) throw new Error('policy must be non-empty and cannot contain comma/newline');
  return value;
}

function categoryAllowed(category, proxyMode, customCategories) {
  if (proxyMode === 'CORE_ONLY') return CORE_CATEGORIES.includes(category);
  if (proxyMode === 'CORE_MEDIA') return CORE_CATEGORIES.includes(category) || MEDIA_CATEGORIES.includes(category);
  if (proxyMode === 'CUSTOM') return (customCategories || []).includes(category);
  return category !== 'UNKNOWN';
}

function buildRule(type, value, policy, confidence, reason, requestCount, hostCount, category, app, eligible) {
  const rating = confidenceToStars(confidence);
  return {
    id: type + ':' + value,
    type,
    value,
    policy,
    confidence: clamp(confidence, 0, 0.99),
    reason,
    requestCount,
    hostCount,
    category,
    app,
    stars: rating.stars,
    rating: rating.glyphs + ' ' + rating.label,
    recommended: Boolean(eligible && confidence >= 0.55),
    eligible: Boolean(eligible),
    coveredBy: null
  };
}

function dominantCategory(records) {
  const counts = {};
  for (const record of records) counts[record.category] = (counts[record.category] || 0) + (record.count || 0);
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'UNKNOWN';
}

function derivedSuffix(host) {
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 3) return null;
  const commonSecondLevels = new Set(['com.cn', 'net.cn', 'org.cn', 'com.hk', 'co.uk', 'co.jp']);
  const lastTwo = labels.slice(-2).join('.');
  return commonSecondLevels.has(lastTwo) && labels.length >= 3 ? labels.slice(-3).join('.') : lastTwo;
}

function discoverSuffixes(records, app, policy, proxyMode, customCategories) {
  const results = [];
  const observed = records.filter((record) => record.app === app && !record.isIP && ['FINGERPRINT', 'CUSTOM_SESSION'].includes(record.recognition));
  for (const suffix of knownSuffixes(app)) {
    const matching = observed.filter((record) => hostMatchesSuffix(record.host, suffix));
    if (!matching.length) continue;
    const category = dominantCategory(matching);
    const count = matching.reduce((sum, record) => sum + record.count, 0);
    const media = matching.reduce((sum, record) => sum + record.resourceScore * record.count, 0) / Math.max(1, count);
    const confidence = clamp(0.91 + Math.min(0.05, Math.log10(count + 1) * 0.03) - media * 0.28, 0.35, 0.97);
    results.push(buildRule(
      'DOMAIN-SUFFIX', suffix, policy, confidence,
      media > 0.6 ? '已知 App 媒体后缀；资源流量需人工权衡' : '已知 App 归属且覆盖稳定业务 Host',
      count, matching.length, category, app,
      categoryAllowed(category, proxyMode, customCategories)
    ));
  }

  const groups = new Map();
  for (const record of observed) {
    const suffix = derivedSuffix(record.host);
    if (!suffix || suffix.split('.').length < 2) continue;
    if (!groups.has(suffix)) groups.set(suffix, []);
    groups.get(suffix).push(record);
  }
  for (const [suffix, matching] of groups) {
    const distinctHosts = new Set(matching.map((record) => record.host));
    if (distinctHosts.size < 2 || results.some((rule) => rule.value === suffix)) continue;
    const category = dominantCategory(matching);
    const count = matching.reduce((sum, record) => sum + record.count, 0);
    const avgResource = matching.reduce((sum, record) => sum + record.resourceScore * record.count, 0) / Math.max(1, count);
    const customOnly = matching.every((record) => record.recognition === 'CUSTOM_SESSION');
    const confidence = clamp(0.55 + Math.min(0.18, distinctHosts.size * 0.035) + Math.min(0.08, Math.log10(count + 1) * 0.03) - avgResource * 0.18 - (customOnly ? 0.12 : 0), 0.2, 0.85);
    results.push(buildRule(
      'DOMAIN-SUFFIX', suffix, policy, confidence,
      customOnly ? 'CUSTOM 隔离会话中的多个 Host 共享后缀；归属未经内置指纹验证' : '同一 App 的多个已识别 Host 共享稳定可注册域后缀',
      count, distinctHosts.size, category, app,
      categoryAllowed(category, proxyMode, customCategories)
    ));
  }
  return results;
}

function detectConflicts(rules) {
  const suffixes = rules.filter((rule) => rule.type === 'DOMAIN-SUFFIX');
  for (const rule of rules) {
    if (rule.type !== 'DOMAIN') continue;
    const covering = suffixes
      .filter((suffix) => suffix.app === rule.app && hostMatchesSuffix(rule.value, suffix.value))
      .sort((a, b) => b.value.length - a.value.length)[0];
    if (covering) rule.coveredBy = covering.id;
  }
  return rules;
}

function dedupeRules(rules) {
  const map = new Map();
  for (const rule of rules) {
    const key = rule.type + '|' + rule.value.toLowerCase() + '|' + rule.policy;
    const existing = map.get(key);
    if (!existing || rule.confidence > existing.confidence) map.set(key, rule);
  }
  return Array.from(map.values());
}

function parseExistingRules(text) {
  if (Array.isArray(text)) return text;
  const output = [];
  for (const raw of String(text || '').split(/[;\r\n]+/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^\[Rule\]$/i.test(line)) continue;
    const parts = line.split(',').map((part) => part.trim());
    const type = String(parts[0] || '').toUpperCase();
    if (!['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD'].includes(type) || !parts[1] || !parts[2]) continue;
    output.push({ type, value: parts[1].toLowerCase(), policy: parts.slice(2).join(',').trim(), source: line });
  }
  return output;
}

function existingRuleCovers(candidate, existing) {
  const value = candidate.value.toLowerCase();
  if (existing.type === candidate.type && existing.value === value) return true;
  if (existing.type === 'DOMAIN-SUFFIX' && candidate.type === 'DOMAIN') return hostMatchesSuffix(value, existing.value);
  if (existing.type === 'DOMAIN-SUFFIX' && candidate.type === 'DOMAIN-SUFFIX') return hostMatchesSuffix(value, existing.value);
  if (existing.type === 'DOMAIN-KEYWORD' && candidate.type === 'DOMAIN') return value.includes(existing.value);
  return false;
}

function applyExistingRuleAnalysis(rules, existingText) {
  const existingRules = parseExistingRules(existingText);
  for (const rule of rules) {
    const covering = existingRules.find((existing) => existingRuleCovers(rule, existing));
    if (!covering) continue;
    rule.existingRule = covering.source;
    rule.existingStatus = covering.policy === rule.policy ? 'ALREADY_COVERED' : 'POLICY_SHADOW';
  }
  return rules;
}

function recommendRules(records, options) {
  const policy = normalizePolicy(options && options.policy || 'IP');
  const proxyMode = options && options.proxyMode || 'CORE_ONLY';
  const customCategories = options && options.customCategories || [];
  const apps = Array.from(new Set(records.map((record) => record.app).filter((app) => app && app !== 'UNKNOWN')));
  const rules = [];

  for (const record of records) {
    // Session-attributed and raw-IP hosts are deliberately left in the unknown
    // report. They never become automatic rule candidates.
    if (record.isIP || !['FINGERPRINT', 'CUSTOM_SESSION'].includes(record.recognition)) continue;
    const customSession = record.recognition === 'CUSTOM_SESSION';
    const core = CORE_CATEGORIES.includes(record.category);
    const lowValue = LOW_VALUE_CATEGORIES.includes(record.category);
    let confidence = 0.62 + Math.min(0.14, Math.log10((record.count || 0) + 1) * 0.06) + (record.appConfidence || 0) * 0.2;
    confidence -= (record.resourceScore || 0) * 0.34;
    if (core) confidence += 0.08;
    if (lowValue) confidence -= 0.28;
    if (customSession) confidence -= 0.2;
    confidence = clamp(confidence, 0.1, 0.98);
    rules.push(buildRule(
      'DOMAIN', record.host, policy, confidence,
      customSession
        ? 'CUSTOM 隔离会话归属，未经内置指纹验证，必须人工复核'
        : (record.resourceScore > 0.65 ? '明确 App Host，但资源/CDN 得分较高' : '明确 App Host，适合精确分流'),
      record.count, 1, record.category, record.app,
      categoryAllowed(record.category, proxyMode, customCategories)
    ));
  }

  for (const app of apps) rules.push(...discoverSuffixes(records, app, policy, proxyMode, customCategories));

  for (const candidate of discoverKeywords(records)) {
    if (!apps.includes(candidate.app) || candidate.randomLike) continue;
    rules.push(buildRule(
      'DOMAIN-KEYWORD', candidate.value, policy, candidate.confidence,
      '多个同一 App Host 重复出现稳定片段', candidate.requestCount, candidate.hostCount,
      candidate.category, candidate.app,
      categoryAllowed(candidate.category, proxyMode, customCategories) || candidate.confidence >= 0.85
    ));
  }

  const analyzed = applyExistingRuleAnalysis(detectConflicts(dedupeRules(rules)), options && (options.existingRules || options.existing_rules));
  return analyzed.sort((a, b) =>
    Number(b.recommended) - Number(a.recommended) || b.confidence - a.confidence ||
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.value.localeCompare(b.value)
  );
}

function parseConfirmations(text) {
  if (Array.isArray(text)) return new Set(text.map((v) => String(v).trim()).filter(Boolean));
  return new Set(String(text || '').split(/[;\r\n]+/).map((v) => v.trim()).filter(Boolean));
}

function exportConfirmed(rules, confirmations, options) {
  const selectedIds = parseConfirmations(confirmations);
  let selected = rules.filter((rule) => selectedIds.has(rule.id));
  const selectedSuffixes = selected.filter((rule) => rule.type === 'DOMAIN-SUFFIX');
  const omitted = [];
  const warnings = [];
  const existingRules = parseExistingRules(options && options.existingRules);
  selected = selected.filter((rule) => {
    const existing = existingRules.find((item) => existingRuleCovers(rule, item));
    if (existing && existing.policy === rule.policy) {
      omitted.push({ rule: rule.id, coveredBy: 'EXISTING:' + existing.source });
      return false;
    }
    if (existing && existing.policy !== rule.policy) {
      warnings.push(rule.id + ' 可能被更早的已有规则遮蔽：' + existing.source);
    }
    if (rule.type !== 'DOMAIN') return true;
    const covering = selectedSuffixes.find((suffix) => suffix.app === rule.app && hostMatchesSuffix(rule.value, suffix.value));
    if (!covering) return true;
    omitted.push({ rule: rule.id, coveredBy: covering.id });
    return false;
  });
  selected = dedupeRules(selected).sort((a, b) =>
    String(a.app).localeCompare(String(b.app)) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.value.localeCompare(b.value)
  );
  const lines = ['[Rule]', ''];
  let currentApp = null;
  for (const rule of selected) {
    if (rule.app !== currentApp) {
      if (currentApp !== null) lines.push('');
      currentApp = rule.app;
      lines.push('# ===== ' + currentApp + ' =====');
    }
    lines.push(rule.type + ',' + rule.value + ',' + normalizePolicy(rule.policy));
  }
  if (!selected.length) lines.push('# 未导出规则：请先从候选报告复制规则 ID 到“已确认规则”参数。');
  if (options && options.includeWarnings !== false) {
    lines.push('', '# 提示：DOMAIN 置前，其次 DOMAIN-SUFFIX，最后 DOMAIN-KEYWORD。');
    lines.push('# 此导出不能保证覆盖直连 IP、IPv6 绕行或未被 Request Script 观察到的 QUIC/UDP。');
    for (const warning of warnings) lines.push('# 冲突警告：' + warning);
  }
  return { text: lines.join('\n'), selected, omitted, warnings };
}

function matchRule(host, rule) {
  if (rule.type === 'DOMAIN') return host === rule.value;
  if (rule.type === 'DOMAIN-SUFFIX') return hostMatchesSuffix(host, rule.value);
  if (rule.type === 'DOMAIN-KEYWORD') return host.includes(rule.value);
  return false;
}

module.exports = {
  normalizePolicy, categoryAllowed, derivedSuffix, discoverSuffixes, recommendRules,
  detectConflicts, dedupeRules, parseExistingRules, existingRuleCovers, applyExistingRuleAnalysis,
  parseConfirmations, exportConfirmed, matchRule
};
