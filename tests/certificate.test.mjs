// Tests for the on-demand certificate endpoint, with the database stubbed.
// Run with: npm test

import { test, mock } from 'node:test';
import assert from 'node:assert';

const ROW = {
  id: 349, document_id: '1124062389', city: 'BARRANQUILLA',
  issue_date: '2026-01-01', expires_at: '2028-01-01',
  name: 'ZUÑIGA CURVELO NAYARETH BEATRIZ', document_type: 'C.C', company: 'FOCA',
  training_name: 'Violencia Sexual', hours: '4 horas',
};

let lastQuery = null;

mock.module('../api/_db.js', {
  namedExports: {
    sql: async (strings, ...vals) => {
      lastQuery = { text: strings.join('?'), vals };
      if (/FROM settings/.test(lastQuery.text)) return [];   // no font override
      return vals[0] === 349 ? [ROW] : [];
    },
    json: (res, data, status = 200) => { res.status(status); res.end(JSON.stringify(data)); },
    error: (res, message, status = 500) => { res.status(status); res.end(JSON.stringify({ error: message })); },
    handleError: (res, err) => { console.error('handleError:', err); res.status(500); res.end('{}'); },
  },
});

const { default: handler } = await import('../api/certificate/[id].js');

function mockRes() {
  const chunks = [];
  const headers = {};
  return {
    statusCode: 200, headers, body: Buffer.alloc(0),
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    end(b) { if (b) chunks.push(Buffer.from(b)); this.body = Buffer.concat(chunks); return this; },
  };
}

const req = (query, method = 'GET') => ({
  method,
  query,
  headers: { host: 'certificados-sst-foca.vercel.app', 'x-forwarded-proto': 'https' },
});

test('GET renders an inline PDF named after the attendee', async () => {
  const res = mockRes();
  await handler(req({ id: '349' }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'application/pdf');
  assert.strictEqual(
    res.headers['content-disposition'],
    'inline; filename="1124062389-ZUNIGA-CURVELO-NAYARETH-BEATRIZ.pdf"',
  );
  assert.strictEqual(res.body.subarray(0, 5).toString(), '%PDF-');
});

test('?download=1 becomes an attachment', async () => {
  const res = mockRes();
  await handler(req({ id: '349', download: '1' }), res);
  assert.match(res.headers['content-disposition'], /^attachment;/);
});

test('HEAD answers with headers and no body', async () => {
  const res = mockRes();
  await handler(req({ id: '349' }, 'HEAD'), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'application/pdf');
  assert.strictEqual(res.body.length, 0);
});

test('an unknown id is a 404, never a broken PDF', async () => {
  const res = mockRes();
  await handler(req({ id: '99999' }), res);
  assert.strictEqual(res.statusCode, 404);
});

test('a non-numeric id is rejected before touching the database', async () => {
  for (const id of ['abc', '-1', '0', '', undefined]) {
    const res = mockRes();
    await handler(req({ id }), res);
    assert.strictEqual(res.statusCode, 400, `id=${id} should be 400`);
  }
});

test('a SQL-ish id reaches the query as a bare number', async () => {
  const res = mockRes();
  await handler(req({ id: '1; DROP TABLE certificates' }), res);
  assert.deepStrictEqual(lastQuery.vals, [1]);   // bound parameter, not text
  assert.strictEqual(res.statusCode, 404);
});

test('POST is rejected', async () => {
  const res = mockRes();
  await handler(req({ id: '349' }, 'POST'), res);
  assert.strictEqual(res.statusCode, 405);
});
