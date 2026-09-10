'use strict';

function isIPv4(value) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false;
  return value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function isIPv6(value) {
  const text = String(value || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!text.includes(':') || !/^[0-9a-f:.%]+$/i.test(text)) return false;
  const address = text.split('%')[0];
  if ((address.match(/::/g) || []).length > 1) return false;
  const parts = address.split(':');
  if (!address.includes('::') && parts.length !== 8) return false;
  if (address.includes('::') && parts.length > 8) return false;
  return parts.every((part) => part === '' || /^[0-9a-f]{1,4}$/i.test(part) || isIPv4(part));
}

function normalizeHost(input) {
  if (typeof input !== 'string') return null;
  let raw = input.trim();
  if (!raw) return null;
  raw = raw.replace(/[\u0000-\u001f\u007f]/g, '');
  // Do not depend on the WHATWG URL global: Loon documents $request.url but
  // does not promise a browser URL constructor in every JavaScript runtime.
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '');
  let authority = raw.split(/[/?#]/)[0];
  authority = authority.slice(authority.lastIndexOf('@') + 1);
  if (!authority) return null;
  let host;
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close < 0) return null;
    host = authority.slice(1, close);
    const remainder = authority.slice(close + 1);
    if (remainder && !/^:\d+$/.test(remainder)) return null;
  } else {
    host = authority;
    const colon = host.lastIndexOf(':');
    if (colon > -1 && host.indexOf(':') === colon && /^\d+$/.test(host.slice(colon + 1))) host = host.slice(0, colon);
  }
  host = host.toLowerCase().replace(/\.+$/, '');
  if (!host || host.length > 253 || /\s/.test(host)) return null;
  if (!isIPv6(host) && !/^[a-z0-9_\-.\u0080-\uffff]+$/i.test(host)) return null;
  return host;
}

function normalizeRequest(input) {
  const url = typeof input === 'string' ? input : input && input.url;
  const host = normalizeHost(url);
  if (!host) return null;
  const raw = String(url || '');
  const schemeMatch = raw.match(/^([a-z][a-z0-9+.-]*):/i);
  let path = '/';
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '');
  const pathIndex = withoutScheme.indexOf('/');
  if (pathIndex >= 0) path = withoutScheme.slice(pathIndex).split(/[?#]/)[0] || '/';
  return {
    host,
    scheme: schemeMatch ? schemeMatch[1].toLowerCase() : 'unknown',
    path: path.toLowerCase(),
    isIP: isIPv4(host) || isIPv6(host),
    ipVersion: isIPv4(host) ? 4 : (isIPv6(host) ? 6 : null)
  };
}

module.exports = { normalizeHost, normalizeRequest, isIPv4, isIPv6 };
