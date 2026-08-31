// Date formatting in the admin.
//
// Pinned to Colombia's timezone on purpose: the bug these guard against only
// shows up at a negative UTC offset, so running in UTC would pass either way.
process.env.TZ = 'America/Bogota';

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

globalThis.window = {};
globalThis.document = { createElement: () => ({ style: {} }), body: { appendChild() {} } };
new Function(readFileSync(new URL('../assets/js/utils.js', import.meta.url), 'utf8'))();
const { formatDate, formatDateTime, escapeHtml } = globalThis.window;

test('the test suite runs in a timezone that would expose the shift', () => {
  assert.strictEqual(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/Bogota');
});

test('a calendar date keeps its day west of Greenwich', () => {
  // Before the fix these rendered as the previous day in Colombia.
  assert.strictEqual(formatDate('2026-01-02'), '02/01/2026');
  assert.strictEqual(formatDate('2026-03-15'), '15/03/2026');
  assert.strictEqual(formatDate('2026-01-01'), '01/01/2026');
});

test('a UTC-midnight ISO string formats the same as the bare date', () => {
  assert.strictEqual(formatDate('2026-01-02T00:00:00.000Z'), formatDate('2026-01-02'));
});

test('the admin table and the certificate PDF agree on the date', async () => {
  const { shortDate } = await import('../api/_certificate.js');
  for (const value of ['2026-01-02', '2026-03-15', '2028-12-31']) {
    assert.strictEqual(formatDate(value), shortDate(value), `mismatch on ${value}`);
  }
});

test('empty and invalid values degrade to a dash', () => {
  for (const value of [null, undefined, '', 'not a date']) {
    assert.strictEqual(formatDate(value), '—');
  }
});

test('formatDateTime still renders instants in local time', () => {
  // last_login_at is a real moment, not a calendar date: 00:30 UTC is the
  // previous evening in Bogota, and showing it that way is correct.
  assert.match(formatDateTime('2026-01-02T00:30:00.000Z'), /^01\/01\/2026/);
});

test('escapeHtml neutralises markup', () => {
  assert.strictEqual(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
  );
});
