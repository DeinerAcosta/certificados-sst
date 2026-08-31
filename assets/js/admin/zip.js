/* ============================================================
   admin/zip.js — minimal ZIP writer (STORE, no compression)

   Certificates are PDFs, which are already compressed, so deflating them
   again buys almost nothing and would cost a library dependency. This writes
   the archive structure by hand and returns a Blob.

   Exposes: buildZip(entries) -> Blob
   ============================================================ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date/time, the only timestamp a basic ZIP header carries. */
function dosStamp(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function writer(size) {
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  let pos = 0;
  return {
    u16(v) { view.setUint16(pos, v, true); pos += 2; },
    u32(v) { view.setUint32(pos, v >>> 0, true); pos += 4; },
    bytes(b) { buf.set(b, pos); pos += b.length; },
    get offset() { return pos; },
    done: () => buf,
  };
}

/**
 * Build a ZIP archive.
 *
 * @param {Array<{name: string, data: Uint8Array}>} entries
 * @returns {Blob}
 */
function buildZip(entries) {
  const encoder = new TextEncoder();
  const stamp = dosStamp(new Date());

  const items = entries.map(e => {
    const name = encoder.encode(e.name);
    return { name, data: e.data, crc: crc32(e.data), offset: 0 };
  });

  const localSize = items.reduce((n, i) => n + 30 + i.name.length + i.data.length, 0);
  const centralSize = items.reduce((n, i) => n + 46 + i.name.length, 0);
  const w = writer(localSize + centralSize + 22);

  // Local file headers + data
  for (const item of items) {
    item.offset = w.offset;
    w.u32(0x04034b50);
    w.u16(20);            // version needed
    w.u16(0x0800);        // flags: filename is UTF-8
    w.u16(0);             // method: stored
    w.u16(stamp.time);
    w.u16(stamp.day);
    w.u32(item.crc);
    w.u32(item.data.length);
    w.u32(item.data.length);
    w.u16(item.name.length);
    w.u16(0);             // extra length
    w.bytes(item.name);
    w.bytes(item.data);
  }

  // Central directory
  const centralStart = w.offset;
  for (const item of items) {
    w.u32(0x02014b50);
    w.u16(20);            // version made by
    w.u16(20);            // version needed
    w.u16(0x0800);
    w.u16(0);
    w.u16(stamp.time);
    w.u16(stamp.day);
    w.u32(item.crc);
    w.u32(item.data.length);
    w.u32(item.data.length);
    w.u16(item.name.length);
    w.u16(0);             // extra
    w.u16(0);             // comment
    w.u16(0);             // disk number
    w.u16(0);             // internal attrs
    w.u32(0);             // external attrs
    w.u32(item.offset);
    w.bytes(item.name);
  }

  // End of central directory. Measure the directory before writing this
  // record, or its own bytes get counted into the size it reports.
  const centralEnd = w.offset;
  w.u32(0x06054b50);
  w.u16(0);
  w.u16(0);
  w.u16(items.length);
  w.u16(items.length);
  w.u32(centralEnd - centralStart);
  w.u32(centralStart);
  w.u16(0);

  return new Blob([w.done()], { type: 'application/zip' });
}

window.buildZip = buildZip;
