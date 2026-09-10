'use strict';

const APPS = Object.freeze([
  'ALL',
  'BILIBILI',
  'DOUYIN',
  'NETEASE',
  'WECHAT',
  'WEIBO',
  'XIAOHONGSHU',
  'KUAISHOU',
  'ZHIHU',
  'TIEBA',
  'COOLAPK',
  'CUSTOM'
]);

const CATEGORIES = Object.freeze([
  'API', 'AUTH', 'WEB', 'FEED', 'SEARCH', 'COMMENT', 'USER',
  'STATIC', 'IMAGE', 'VIDEO', 'CDN', 'DOWNLOAD', 'TRACKING',
  'ANALYTICS', 'WEBSOCKET', 'UNKNOWN'
]);

const CORE_CATEGORIES = Object.freeze([
  'API', 'AUTH', 'WEB', 'FEED', 'SEARCH', 'COMMENT', 'USER', 'WEBSOCKET'
]);

const MEDIA_CATEGORIES = Object.freeze([
  'STATIC', 'IMAGE', 'VIDEO', 'CDN', 'DOWNLOAD'
]);

const LOW_VALUE_CATEGORIES = Object.freeze(['TRACKING', 'ANALYTICS']);

const PROXY_MODES = Object.freeze([
  'CORE_ONLY', 'CORE_MEDIA', 'WHOLE_APP', 'CUSTOM'
]);

const ANALYZER_MODES = Object.freeze(['OBSERVE', 'ANALYZE']);
const LIFECYCLE = Object.freeze(['RUNNING', 'PAUSED', 'STOPPED']);

const STORAGE_KEY = 'loon.app.ip.router.state.v1';
const STATE_VERSION = 1;
const MAX_HOSTS = 3000;
const MAX_SERIALIZED_BYTES = 900000;

module.exports = {
  APPS,
  CATEGORIES,
  CORE_CATEGORIES,
  MEDIA_CATEGORIES,
  LOW_VALUE_CATEGORIES,
  PROXY_MODES,
  ANALYZER_MODES,
  LIFECYCLE,
  STORAGE_KEY,
  STATE_VERSION,
  MAX_HOSTS,
  MAX_SERIALIZED_BYTES
};
