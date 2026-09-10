'use strict';

const { calculateCoverage } = require('./coverage');
const { buildDiagnostics } = require('./diagnostics');
const { confidenceToStars } = require('./scoring');

function durationMinutes(state) {
  if (!state.session || !state.session.startedAt) return 0;
  const end = state.session.stoppedAt || state.updatedAt || new Date().toISOString();
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(state.session.startedAt)) / 60000));
}

function generateReport(state, rules) {
  const records = Object.values(state.hosts || {});
  const recommended = rules.filter((rule) => rule.recommended);
  const coverage = calculateCoverage(records, recommended);
  const diagnostics = buildDiagnostics(records);
  const counts = {};
  for (const record of records) counts[record.category] = (counts[record.category] || 0) + 1;
  const lines = [
    '━━━━━━━━━━━━━━━━━━',
    'Loon Rule Analyzer',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '目标：' + (state.config.target === 'CUSTOM' ? (state.config.customTarget || 'CUSTOM') : state.config.target),
    '状态：' + state.lifecycle,
    '分析时间：' + durationMinutes(state) + ' 分钟',
    '请求：' + coverage.totalRequests,
    'Host：' + records.length,
    '核心业务 Host：' + records.filter((r) => ['API', 'AUTH', 'WEB', 'FEED', 'SEARCH', 'COMMENT', 'USER', 'WEBSOCKET'].includes(r.category)).length,
    '媒体 Host：' + records.filter((r) => ['STATIC', 'IMAGE', 'VIDEO', 'CDN', 'DOWNLOAD'].includes(r.category)).length,
    '未知 Host：' + diagnostics.unknown.length,
    '',
    '已识别请求：' + coverage.identifiedPercent + '%',
    '未知请求：' + coverage.unknownPercent + '%',
    '推荐规则覆盖率：' + coverage.ruleCoveragePercent + '%',
    '核心业务覆盖率：' + coverage.core.percent + '%',
    '媒体覆盖率：' + coverage.media.percent + '%',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '规则候选（复制 ID 到“已确认规则”参数后才能导出）',
    '━━━━━━━━━━━━━━━━━━'
  ];
  for (const rule of rules.slice(0, 80)) {
    const rating = confidenceToStars(rule.confidence);
    lines.push(
      '', rating.glyphs + ' ' + rating.percent + '% ' + rating.label,
      rule.type + ',' + rule.value + ',' + rule.policy,
      'ID：' + rule.id,
      'App：' + rule.app + '；分类：' + rule.category + '；Host：' + rule.hostCount + '；请求：' + rule.requestCount,
      '原因：' + rule.reason +
        (rule.coveredBy ? '；已被候选 ' + rule.coveredBy + ' 覆盖' : '') +
        (rule.existingStatus === 'ALREADY_COVERED' ? '；已有同策略规则覆盖：' + rule.existingRule : '') +
        (rule.existingStatus === 'POLICY_SHADOW' ? '；⚠ 可能被不同策略的已有规则遮蔽：' + rule.existingRule : '')
    );
  }
  lines.push('', '━━━━━━━━━━━━━━━━━━', '⚠ 未识别 Host', '━━━━━━━━━━━━━━━━━━');
  for (const record of diagnostics.unknown.slice(0, 100)) {
    lines.push(record.host + ' | 请求 ' + record.count + ' | 首次 ' + record.firstSeen + ' | 最近 ' + record.lastSeen + ' | 建议继续观察');
  }
  if (!diagnostics.unknown.length) lines.push('无');
  lines.push('', '━━━━━━━━━━━━━━━━━━', '诊断提示', '━━━━━━━━━━━━━━━━━━', ...diagnostics.warnings.map((warning) => '⚠ ' + warning));
  return { text: lines.join('\n'), coverage, diagnostics, categoryCounts: counts };
}

module.exports = { generateReport, durationMinutes };
