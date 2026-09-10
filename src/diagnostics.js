'use strict';

function buildDiagnostics(records) {
  const ipv4 = records.filter((record) => record.isIP && record.ipVersion === 4);
  const ipv6 = records.filter((record) => record.isIP && record.ipVersion === 6);
  const websocket = records.filter((record) => record.category === 'WEBSOCKET');
  const likelyQuic = records.filter((record) => record.likelyQuic);
  const unknown = records.filter((record) => !['FINGERPRINT', 'CUSTOM_SESSION'].includes(record.recognition) || record.category === 'UNKNOWN')
    .sort((a, b) => b.count - a.count);
  const warnings = [
    'Request Script 每个请求只会命中最终配置顺序中的首个完整匹配项；更早的脚本可能造成漏采。',
    'HTTP Request Script 不能证明已观察原始 QUIC/UDP；DOMAIN 规则也不等于自动覆盖所有 UDP。'
  ];
  if (ipv4.length) warnings.push('检测到直连 IPv4 字面量 Host；域名规则无法匹配这些目标。');
  if (ipv6.length) warnings.push('检测到 IPv6 字面量 Host，请检查 IPv6 是否绕过代理。');
  else warnings.push('未观察到 IPv6 字面量不代表没有 IPv6 泄漏，请进行双栈出口验证。');
  if (likelyQuic.length) warnings.push('发现疑似 QUIC/HTTP3 Host 标记，需额外核验 UDP 路由。');
  return { ipv4, ipv6, websocket, likelyQuic, unknown, warnings };
}

module.exports = { buildDiagnostics };
