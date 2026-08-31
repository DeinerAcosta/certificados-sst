// Tests for the hand-rolled ZIP writer used by the bulk download.
// The archive is checked by unzipping it with Node's own inflate-free reader
// below, plus a CRC check — the same things a real unzip tool validates.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

// zip.js is a plain browser script; give it the globals it expects.
globalThis.window = {};
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
new Function(readFileSync(new URL('../assets/js/admin/zip.js', import.meta.url), 'utf8'))();
const { buildZip } = globalThis.window;

const bytesOf = blob => Buffer.from(blob.parts[0]);

/** Minimal central-directory reader: returns [{name, data}] for a STORE zip. */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.notStrictEqual(eocd, -1, 'end-of-central-directory record not found');

  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdStart = buf.readUInt32LE(eocd + 16);
  assert.strictEqual(cdStart + cdSize, eocd, 'central directory size/offset disagree');

  const out = [];
  let off = cdStart;
  for (let n = 0; n < count; n++) {
    assert.strictEqual(buf.readUInt32LE(off), 0x02014b50, 'bad central header signature');
    const crc = buf.readUInt32LE(off + 16);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

    assert.strictEqual(buf.readUInt32LE(local), 0x04034b50, 'bad local header signature');
    assert.strictEqual(buf.readUInt16LE(local + 8), 0, 'entry is not stored');
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;

    out.push({ name, crc, data: buf.subarray(start, start + size) });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const enc = s => new Uint8Array(Buffer.from(s, 'utf8'));

test('round-trips entries with their bytes and names intact', () => {
  const files = [
    { name: 'certificados/1002242858 - PEREZ.pdf', data: enc('%PDF-1.7 uno') },
    { name: 'certificados/1045737800 - GOMEZ.pdf', data: enc('%PDF-1.7 dos, mas largo') },
  ];
  const entries = readZip(bytesOf(buildZip(files)));

  assert.strictEqual(entries.length, 2);
  entries.forEach((entry, i) => {
    assert.strictEqual(entry.name, files[i].name);
    assert.deepStrictEqual(new Uint8Array(entry.data), files[i].data);
    assert.strictEqual(entry.crc, crc32(files[i].data), 'stored CRC must match the data');
  });
});

test('keeps non-ASCII filenames readable', () => {
  const name = 'certificados/1124062389 - ZUÑIGA CURVELO ÑÁÉÍÓÚ.pdf';
  const [entry] = readZip(bytesOf(buildZip([{ name, data: enc('x') }])));
  assert.strictEqual(entry.name, name);
});

test('handles binary payloads with every byte value', () => {
  const data = new Uint8Array(256).map((_, i) => i);
  const [entry] = readZip(bytesOf(buildZip([{ name: 'all-bytes.bin', data }])));
  assert.deepStrictEqual(new Uint8Array(entry.data), data);
  assert.strictEqual(entry.crc, crc32(data));
});

test('produces a valid archive for a single entry and for many', () => {
  for (const count of [1, 50]) {
    const files = Array.from({ length: count }, (_, i) => ({
      name: `certificados/cert-${i}.pdf`,
      data: enc(`contenido ${i}`),
    }));
    const entries = readZip(bytesOf(buildZip(files)));
    assert.strictEqual(entries.length, count);
    assert.strictEqual(entries[count - 1].name, `certificados/cert-${count - 1}.pdf`);
  }
});

test('an empty entry list still yields a readable, empty archive', () => {
  const buf = bytesOf(buildZip([]));
  assert.strictEqual(buf.length, 22);              // EOCD only
  assert.deepStrictEqual(readZip(buf), []);
});
