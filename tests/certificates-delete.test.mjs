// Tests for deleting certificates, against an in-memory stand-in for the two
// tables involved. The stub really mutates its rows, so the orphan-cleanup
// rule is exercised rather than asserted on a canned answer.

import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let db;
let authUser;

function reset() {
  db = {
    // ANA holds two certificates, one of them outside Barranquilla.
    certificates: [
      { id: 1, document_id: '111' },   // ANA  · BARRANQUILLA
      { id: 2, document_id: '111' },   // ANA  · CARTAGENA
      { id: 3, document_id: '222' },   // BETO · BARRANQUILLA
      { id: 4, document_id: '333' },   // CARLA· BARRANQUILLA
    ],
    attendees: [{ document_id: '111' }, { document_id: '222' }, { document_id: '333' }],
  };
  authUser = { id: 1, email: 'admin@foca.co' };
}

mock.module('../api/_auth.js', {
  namedExports: { requireAuth: () => authUser },
});

mock.module('../api/_db.js', {
  namedExports: {
    sql: async (strings, ...vals) => {
      const text = strings.join('?').replace(/\s+/g, ' ');

      if (/FROM certificates c JOIN attendees/.test(text)) {
        return db.certificates.map(c => ({
          id: c.id, document_id: c.document_id, attendee_name: 'X',
          training_name: 'Violencia Sexual', city: 'BARRANQUILLA',
          issue_date: '2026-01-01', expires_at: '2028-01-01',
          issued_by: 'admin@foca.co', created_at: '2026-01-01',
        }));
      }

      if (/SELECT DISTINCT document_id FROM certificates/.test(text)) {
        const ids = vals[0];
        const docs = new Set(db.certificates.filter(c => ids.includes(c.id)).map(c => c.document_id));
        return [...docs].map(document_id => ({ document_id }));
      }

      if (/DELETE FROM certificates/.test(text)) {
        const ids = vals[0];
        const hit = db.certificates.filter(c => ids.includes(c.id));
        db.certificates = db.certificates.filter(c => !ids.includes(c.id));
        return hit.map(c => ({ id: c.id }));
      }

      if (/DELETE FROM attendees/.test(text)) {
        const docs = vals[0];
        const orphaned = db.attendees.filter(a =>
          docs.includes(a.document_id) &&
          !db.certificates.some(c => c.document_id === a.document_id));
        db.attendees = db.attendees.filter(a => !orphaned.includes(a));
        return orphaned.map(a => ({ document_id: a.document_id }));
      }

      throw new Error('unexpected query: ' + text);
    },
    json: (res, data, status = 200) => { res.status(status); res.end(JSON.stringify(data)); },
    error: (res, message, status = 500) => { res.status(status); res.end(JSON.stringify({ error: message })); },
    handleError: (res, err) => { console.error('handleError:', err); res.status(500); res.end('{}'); },
  },
});

const { default: handler } = await import('../api/admin/certificates.js');

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    setHeader() {},
    end(b) { this.body = b ? JSON.parse(b) : null; return this; },
  };
}

const del = (query = {}, body = undefined) =>
  ({ method: 'DELETE', query, body, headers: {} });

beforeEach(reset);

test('?id= deletes one certificate and keeps a person who has others', async () => {
  const res = mockRes();
  await handler(del({ id: '1' }), res);          // ANA's Barranquilla one
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true, deleted_certificates: 1, deleted_attendees: 0 });
  assert.deepStrictEqual(db.certificates.map(c => c.id), [2, 3, 4]);
  assert.strictEqual(db.attendees.length, 3, 'ANA still holds certificate 2');
});

test('deleting a person\'s last certificate removes the person too', async () => {
  const res = mockRes();
  await handler(del({ id: '3' }), res);          // BETO's only one
  assert.deepStrictEqual(res.body, { ok: true, deleted_certificates: 1, deleted_attendees: 1 });
  assert.deepStrictEqual(db.attendees.map(a => a.document_id), ['111', '333']);
});

test('a bulk delete reports certificates and orphaned people separately', async () => {
  const res = mockRes();
  await handler(del({}, { ids: [1, 3, 4] }), res); // every BARRANQUILLA row
  assert.deepStrictEqual(res.body, { ok: true, deleted_certificates: 3, deleted_attendees: 2 });
  assert.deepStrictEqual(db.certificates.map(c => c.id), [2]);
  assert.deepStrictEqual(db.attendees.map(a => a.document_id), ['111'],
    'ANA survives because her Cartagena certificate remains');
});

test('duplicate and junk ids are cleaned up before the query', async () => {
  const res = mockRes();
  await handler(del({}, { ids: [3, 3, '3', 'abc', -5, 0, null] }), res);
  assert.deepStrictEqual(res.body, { ok: true, deleted_certificates: 1, deleted_attendees: 1 });
});

test('an empty or missing id list is a 400', async () => {
  for (const body of [{ ids: [] }, { ids: ['abc'] }, {}, { ids: 'all' }]) {
    const res = mockRes();
    await handler(del({}, body), res);
    assert.strictEqual(res.statusCode, 400, `body=${JSON.stringify(body)}`);
  }
  assert.strictEqual(db.certificates.length, 4, 'nothing was deleted');
});

test('more than 500 ids is refused rather than partly applied', async () => {
  const res = mockRes();
  await handler(del({}, { ids: Array.from({ length: 501 }, (_, i) => i + 1) }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /max 500/);
  assert.strictEqual(db.certificates.length, 4);
});

test('ids that match nothing are a 404', async () => {
  const res = mockRes();
  await handler(del({}, { ids: [9999] }), res);
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(db.certificates.length, 4);
});

test('deleting requires an authenticated admin', async () => {
  authUser = null;                       // requireAuth rejects the request
  const res = mockRes();
  await handler(del({ id: '1' }), res);
  assert.strictEqual(db.certificates.length, 4, 'unauthenticated request deleted nothing');
  assert.strictEqual(db.attendees.length, 3);
});

test('GET still lists certificates with a generated pdf_url', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.certificates.length, 4);
  assert.strictEqual(res.body.certificates[0].pdf_url, '/api/certificate/1');
});

test('an unsupported method is a 405', async () => {
  const res = mockRes();
  await handler({ method: 'PUT', query: {}, headers: {} }, res);
  assert.strictEqual(res.statusCode, 405);
});
