'use strict';

const { fingerprintRole } = require('./fingerprints');

const IMAGE_EXT = /\.(?:avif|bmp|gif|heic|ico|jpe?g|png|svg|webp)(?:$|\?)/i;
const VIDEO_EXT = /\.(?:m3u8|mp4|m4v|mov|ts|webm)(?:$|\?)/i;
const AUDIO_EXT = /\.(?:aac|flac|m4a|mp3|ogg|opus|wav)(?:$|\?)/i;
const STATIC_EXT = /\.(?:css|js|map|ttf|otf|woff2?)(?:$|\?)/i;
const DOWNLOAD_EXT = /\.(?:apk|dmg|exe|ipa|pkg|rar|tar|zip|7z)(?:$|\?)/i;

function classifyRequest(request, app) {
  const host = String(request.host || '').toLowerCase();
  const path = String(request.path || '/').toLowerCase();
  const scheme = String(request.scheme || '').toLowerCase();
  const combined = host + path;
  const reasons = [];
  let category = 'UNKNOWN';
  let confidence = 0.35;
  let resourceScore = 0.25;

  if (scheme === 'ws' || scheme === 'wss' || /(?:^|[.-])(?:ws|websocket)(?:[.-]|$)/.test(host)) {
    category = 'WEBSOCKET'; confidence = 0.9; resourceScore = 0.1; reasons.push('WebSocket scheme or host marker');
  } else if (/(?:analytics|telemetry|metrics|log\.|report\.|beacon)/.test(combined)) {
    category = 'ANALYTICS'; confidence = 0.78; resourceScore = 0.15; reasons.push('analytics marker');
  } else if (/(?:track|tracking|adservice|advert|ads\.)/.test(combined)) {
    category = 'TRACKING'; confidence = 0.76; resourceScore = 0.18; reasons.push('tracking/advertising marker');
  } else if (/(?:login|oauth|passport|sso|token|auth)/.test(combined)) {
    category = 'AUTH'; confidence = 0.86; resourceScore = 0.04; reasons.push('authentication marker');
  } else if (/(?:search|query|suggest)/.test(combined)) {
    category = 'SEARCH'; confidence = 0.82; resourceScore = 0.06; reasons.push('search marker');
  } else if (/(?:comment|reply|danmaku)/.test(combined)) {
    category = 'COMMENT'; confidence = 0.82; resourceScore = 0.06; reasons.push('comment marker');
  } else if (/(?:profile|account|member|user|relation|follow)/.test(combined)) {
    category = 'USER'; confidence = 0.78; resourceScore = 0.06; reasons.push('user marker');
  } else if (/(?:feed|recommend|timeline|aweme)/.test(combined)) {
    category = 'FEED'; confidence = 0.79; resourceScore = 0.08; reasons.push('feed marker');
  } else if (VIDEO_EXT.test(path) || /(?:video|vod|bilivideo|douyinvod|live-play)/.test(host)) {
    category = 'VIDEO'; confidence = 0.91; resourceScore = 0.96; reasons.push('video extension or delivery host');
  } else if (AUDIO_EXT.test(path)) {
    category = 'CDN'; confidence = 0.87; resourceScore = 0.9; reasons.push('audio media extension (mapped to CDN category)');
  } else if (IMAGE_EXT.test(path) || /(?:image|img[.-]|pic[.-]|douyinpic|sinaimg|zhimg|xhscdn)/.test(host)) {
    category = 'IMAGE'; confidence = 0.88; resourceScore = 0.9; reasons.push('image extension or delivery host');
  } else if (DOWNLOAD_EXT.test(path) || /(?:download|dl[.-])/.test(combined)) {
    category = 'DOWNLOAD'; confidence = 0.84; resourceScore = 0.84; reasons.push('download marker');
  } else if (STATIC_EXT.test(path) || /(?:static|assets?)[.-]/.test(host)) {
    category = 'STATIC'; confidence = 0.83; resourceScore = 0.78; reasons.push('static resource marker');
  } else if (/(?:^|[.-])cdn(?:[.-]|$)/.test(host)) {
    // "cdn" is only one signal. Keep the request and lower confidence when
    // the path does not also look like a resource.
    category = 'CDN'; confidence = 0.62; resourceScore = 0.68; reasons.push('CDN host marker without decisive resource type');
  } else if (/(?:^|[.-])api(?:[.-]|$)/.test(host) || /^\/(?:api|v\d|x)\//.test(path)) {
    category = 'API'; confidence = 0.88; resourceScore = 0.03; reasons.push('API host or path marker');
  } else if (/(?:www\.|^m\.|web\.)/.test(host) || /\.(?:html?|php)(?:$|\?)/.test(path)) {
    category = 'WEB'; confidence = 0.69; resourceScore = 0.12; reasons.push('web marker');
  }

  const role = fingerprintRole(app, host);
  if (role === 'MEDIA' && category === 'UNKNOWN') {
    category = 'CDN'; confidence = 0.76; resourceScore = 0.8; reasons.push('known app media suffix');
  } else if (role === 'CORE' && category === 'UNKNOWN') {
    category = 'API'; confidence = 0.7; resourceScore = 0.08; reasons.push('known app core suffix');
  }

  return { category, confidence, resourceScore, reasons };
}

module.exports = { classifyRequest };
