import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGrokWindow, parseGrokRateLimits, GROK_MODELS } from '../lib/grok.mjs';

test('GROK_MODELS contains all 4 expected models', () => {
  assert.equal(GROK_MODELS.length, 4);
  assert.deepEqual(GROK_MODELS.map(m => m.id), ['grok-4', 'grok-3', 'grok-3-reasoning', 'grok-3-deepsearch']);
});

test('normalizeGrokWindow correctly computes usedPercent and remaining numbers', () => {
  const norm = normalizeGrokWindow(
    { remainingQueries: 16, totalQueries: 20, windowSizeSeconds: 7200, waitTimeSeconds: 0 },
    'Grok 4 / 3'
  );
  assert.ok(norm);
  assert.equal(norm.label, 'Grok 4 / 3');
  assert.equal(norm.remainingQueries, 16);
  assert.equal(norm.totalQueries, 20);
  assert.equal(norm.windowDurationMins, 120);
  assert.equal(norm.usedPercent, 20);
});

test('normalizeGrokWindow returns null for zero totalQueries or invalid data', () => {
  assert.equal(normalizeGrokWindow(null, 'Test'), null);
  assert.equal(normalizeGrokWindow({ totalQueries: 0 }, 'Test'), null);
  assert.equal(normalizeGrokWindow({ totalQueries: -5, remainingQueries: 2 }, 'Test'), null);
});

test('parseGrokRateLimits structures limits for UI QuotaPie', () => {
  const parsed = parseGrokRateLimits(
    { remainingQueries: 15, totalQueries: 20, windowSizeSeconds: 7200, waitTimeSeconds: 0 },
    { remainingQueries: 8, totalQueries: 10, windowSizeSeconds: 86400, waitTimeSeconds: 0 }
  );
  assert.ok(parsed);
  assert.ok(parsed.grok);
  assert.equal(parsed.grok.limitName, 'Grok · Лимиты аккаунта');
  assert.equal(parsed.grok.primary.remainingQueries, 15);
  assert.equal(parsed.grok.primary.totalQueries, 20);
  assert.equal(parsed.grok.primary.usedPercent, 25);
  assert.equal(parsed.grok.secondary.remainingQueries, 8);
  assert.equal(parsed.grok.secondary.totalQueries, 10);
  assert.equal(parsed.grok.secondary.usedPercent, 20);
});
