'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function confidenceToStars(confidence) {
  const stars = confidence >= 0.9 ? 5 : confidence >= 0.75 ? 4 : confidence >= 0.55 ? 3 : confidence >= 0.3 ? 2 : 1;
  const labels = ['忽略', '不建议', '可以考虑', '推荐', '强烈推荐'];
  return {
    stars,
    glyphs: '★'.repeat(stars) + '☆'.repeat(5 - stars),
    label: labels[stars - 1],
    percent: Math.round(clamp(confidence, 0, 1) * 100)
  };
}

function weightedAverage(items, valueKey, weightKey) {
  let total = 0;
  let weight = 0;
  for (const item of items) {
    const currentWeight = Number(item[weightKey] || 0);
    total += Number(item[valueKey] || 0) * currentWeight;
    weight += currentWeight;
  }
  return weight ? total / weight : 0;
}

module.exports = { clamp, confidenceToStars, weightedAverage };
