'use strict';

// Conservative ownership fingerprints. Broad shared domains (for example
// qq.com and byteimg.com) are intentionally not suffix fingerprints.
const FINGERPRINTS = Object.freeze({
  BILIBILI: {
    suffixes: ['bilibili.com', 'biliapi.net', 'biliapi.com', 'acg.tv', 'biligame.com', 'bilivideo.com'],
    coreSuffixes: ['bilibili.com', 'biliapi.net', 'biliapi.com', 'acg.tv', 'biligame.com'],
    mediaSuffixes: ['bilivideo.com'],
    exact: []
  },
  DOUYIN: {
    suffixes: ['douyin.com', 'douyinvod.com', 'douyinpic.com', 'amemv.com', 'snssdk.com'],
    coreSuffixes: ['douyin.com', 'amemv.com', 'snssdk.com'],
    mediaSuffixes: ['douyinvod.com', 'douyinpic.com'],
    exact: [],
    keywords: ['core-c-lq', 'core-lq', 'normal-c-lq', 'normal-lq', 'search-quic-lq', 'search-lq']
  },
  NETEASE: {
    suffixes: ['music.163.com', 'music.126.net', 'netease.im', '127.net'],
    coreSuffixes: ['music.163.com', 'netease.im'],
    mediaSuffixes: ['music.126.net'],
    exact: [],
    weakSuffixes: ['netease.com']
  },
  WECHAT: {
    suffixes: ['weixin.qq.com'],
    coreSuffixes: ['weixin.qq.com'],
    mediaSuffixes: [],
    exact: ['szshort.weixin.qq.com', 'szextshort.weixin.qq.com', 'szminorshort.weixin.qq.com', 'mp.weixin.qq.com']
  },
  WEIBO: {
    suffixes: ['weibo.com', 'weibo.cn', 'sinaimg.cn'],
    coreSuffixes: ['weibo.com', 'weibo.cn'],
    mediaSuffixes: ['sinaimg.cn'],
    exact: []
  },
  XIAOHONGSHU: {
    suffixes: ['xiaohongshu.com', 'xhscdn.com', 'xiaohongshu.com.cn'],
    coreSuffixes: ['xiaohongshu.com', 'xiaohongshu.com.cn'],
    mediaSuffixes: ['xhscdn.com'],
    exact: []
  },
  KUAISHOU: {
    suffixes: ['kuaishou.com', 'gifshow.com', 'ksapisrv.com'],
    coreSuffixes: ['kuaishou.com', 'gifshow.com', 'ksapisrv.com'],
    mediaSuffixes: [],
    exact: []
  },
  ZHIHU: {
    suffixes: ['zhihu.com', 'zhimg.com'],
    coreSuffixes: ['zhihu.com'],
    mediaSuffixes: ['zhimg.com'],
    exact: []
  },
  TIEBA: {
    suffixes: ['tieba.baidu.com', 'tiebacdn.com'],
    coreSuffixes: ['tieba.baidu.com'],
    mediaSuffixes: ['tiebacdn.com'],
    exact: []
  },
  COOLAPK: {
    suffixes: ['coolapk.com', 'coolapkmarket.com'],
    coreSuffixes: ['coolapk.com', 'coolapkmarket.com'],
    mediaSuffixes: [],
    exact: []
  }
});

function hostMatchesSuffix(host, suffix) {
  return host === suffix || host.endsWith('.' + suffix);
}

function detectApp(host) {
  const matches = [];
  for (const app of Object.keys(FINGERPRINTS)) {
    const fp = FINGERPRINTS[app];
    for (const exact of fp.exact || []) {
      if (host === exact) matches.push({ app, strength: 1, value: exact, kind: 'exact' });
    }
    for (const suffix of fp.suffixes || []) {
      if (hostMatchesSuffix(host, suffix)) {
        matches.push({ app, strength: 0.92 + Math.min(0.07, suffix.length / 1000), value: suffix, kind: 'suffix' });
      }
    }
    for (const suffix of fp.weakSuffixes || []) {
      if (hostMatchesSuffix(host, suffix)) {
        matches.push({ app, strength: 0.58, value: suffix, kind: 'weak-suffix' });
      }
    }
    for (const keyword of fp.keywords || []) {
      if (host.includes(keyword)) matches.push({ app, strength: 0.86, value: keyword, kind: 'keyword' });
    }
  }
  matches.sort((a, b) => b.strength - a.strength || b.value.length - a.value.length);
  return matches[0] || { app: 'UNKNOWN', strength: 0, value: null, kind: 'none' };
}

function fingerprintRole(app, host) {
  const fp = FINGERPRINTS[app];
  if (!fp) return null;
  if ((fp.mediaSuffixes || []).some((suffix) => hostMatchesSuffix(host, suffix))) return 'MEDIA';
  if ((fp.coreSuffixes || []).some((suffix) => hostMatchesSuffix(host, suffix))) return 'CORE';
  return null;
}

function knownSuffixes(app) {
  const fp = FINGERPRINTS[app];
  return fp ? Array.from(new Set([...(fp.coreSuffixes || []), ...(fp.mediaSuffixes || [])])) : [];
}

module.exports = { FINGERPRINTS, hostMatchesSuffix, detectApp, fingerprintRole, knownSuffixes };
