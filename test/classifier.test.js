'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyRequest } = require('../src/classifier');

function classify(host, path, scheme, app) {
  return classifyRequest({ host, path: path || '/', scheme: scheme || 'https' }, app || 'UNKNOWN');
}

test('classifies API and core business paths with low resource scores', () => {
  const api = classify('api.bilibili.com', '/x/web-interface/view', 'https', 'BILIBILI');
  assert.equal(api.category, 'API');
  assert.ok(api.resourceScore < 0.2);
  assert.equal(classify('api.example.com', '/search?q=x').category, 'SEARCH');
  assert.equal(classify('api.example.com', '/comment/list').category, 'COMMENT');
});

test('classifies video/CDN without blindly dropping CDN', () => {
  const video = classify('upos-sz-mirrorcos.bilivideo.com', '/v/part.m4s', 'https', 'BILIBILI');
  assert.equal(video.category, 'VIDEO');
  assert.ok(video.resourceScore > 0.9);
  const cdn = classify('business-cdn.example.com', '/opaque');
  assert.equal(cdn.category, 'CDN');
  assert.ok(cdn.confidence < 0.8);
});

test('recognizes websocket, images and static resources', () => {
  assert.equal(classify('socket.example.com', '/connect', 'wss').category, 'WEBSOCKET');
  assert.equal(classify('files.example.com', '/cover.webp').category, 'IMAGE');
  assert.equal(classify('files.example.com', '/app.js').category, 'STATIC');
});
