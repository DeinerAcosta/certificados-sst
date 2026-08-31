// Server-side certificate PDF generation.
//
// Replaces the old manual pipeline (Excel → python-docx → Word → commit PDFs),
// which left every issued certificate pointing at a file that did not exist.
// Layout constants below were calibrated against a certificate produced by that
// pipeline (certificates/1002242858.pdf), so output matches what was issued before.
//
// Fonts and images live in assets/certificate; vercel.json bundles that folder
// into this function.

import { readFileSync } from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

const BRAND      = rgb(0x00 / 255, 0x46 / 255, 0x7f / 255); // #00467F
const LABEL_GREY = rgb(0x80 / 255, 0x80 / 255, 0x80 / 255); // #808080
const RULE_GREY  = rgb(0xd0 / 255, 0xd0 / 255, 0xd0 / 255); // #D0D0D0
const BLACK      = rgb(0, 0, 0);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Per-company page layout, in PDF points with the origin at the bottom-left.
 *
 * FOCA numbers are measured, not guessed: every `y` is the text baseline and
 * every box is the draw rectangle read back out of the reference PDF. VIU has
 * no reference PDF (the old script only ever handled FOCA), so its numbers are
 * the FOCA layout transposed onto the A4-landscape page its template uses.
 */
const LAYOUTS = {
  FOCA: {
    width: 792, height: 612,           // Letter landscape
    margin: 70.85,
    imageFit: 'fill',                  // 'contain' un-stretches logo + signature
    intro: 'La Fundación Oftalmológica del Caribe certifica que:',
    logo: { file: 'foca-logo.png', x: 0, y: 480.75, boxW: 340.5, boxH: 108.75 },
    introY: 383.11, introSize: 15.96,
    nameY: 314.71, nameSize: 26.04,
    docY: 284.33, docSize: 14.04,
    bodyTopY: 257.81, bodyLeading: 18.48, bodySize: 14.04,
    hoursY: 210.77, hoursSize: 15.96,
    signature: { x: 315.38, y: 104.83, boxW: 161.25, boxH: 63.75 },
    ruleY: 97.2, ruleX: 50.4, ruleW: 612,
    metaX: 50.4, metaColW: 151.2, metaInnerW: 144,
    labelY: 76.1, labelSize: 6.96, valueY: 52.94, valueSize: 12,
    qr: { x: 673.2, y: 28.8, size: 90 },
  },
  VIU: {
    width: 841.89, height: 595.28,     // A4 landscape
    margin: 43.2,
    imageFit: 'fill',
    intro: 'La Clínica Oftalmológica Internacional certifica que el participante',
    logo: { file: 'viu-logo.png', x: 43.2, y: 486.38, boxW: 129.6, boxH: 72.9 },
    introY: 383.11, introSize: 15.96,
    nameY: 314.71, nameSize: 26.04,
    docY: 284.33, docSize: 14.04,
    bodyTopY: 257.81, bodyLeading: 18.48, bodySize: 14.04,
    hoursY: 210.77, hoursSize: 15.96,
    signature: { x: 340.32, y: 104.83, boxW: 161.25, boxH: 63.75 },
    // The bar stops short of the QR block at x=722 so the fourth column's
    // value cannot run underneath it.
    ruleY: 97.2, ruleX: 43.2, ruleW: 668,
    metaX: 43.2, metaColW: 167, metaInnerW: 158,
    labelY: 76.1, labelSize: 6.96, valueY: 52.94, valueSize: 12,
    qr: { x: 722, y: 28.8, size: 90 },
  },
};

// ---------------------------------------------------------------- assets ----

const assetCache = new Map();

function asset(...parts) {
  const key = parts.join('/');
  if (!assetCache.has(key)) {
    assetCache.set(key, readFileSync(path.join(process.cwd(), 'assets', ...parts)));
  }
  return assetCache.get(key);
}

// ------------------------------------------------------------- utilities ----

/** Long Spanish date: 2026-03-15 → "15 de marzo de 2026". */
export function longDate(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Short date: 2026-03-15 → "15/03/2026". */
export function shortDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Dates arrive from Neon as Date objects or as 'YYYY-MM-DD'. Both must be read
 *  as UTC — parsing the string in local time shifts the day west of Greenwich. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d) ? null : d;
}

/** Largest size <= `size` at which `text` fits `maxWidth`, down to `min`. */
function fitSize(font, text, size, maxWidth, min = 8) {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25;
  return s;
}

/** Greedy wrap of pre-split tokens into at most `maxLines`, shrinking the font
 *  if needed. Tokens are wrap units, so a multi-word token (the issue date) is
 *  kept whole rather than broken across the line end. */
function wrapToLines(font, tokens, size, maxWidth, maxLines) {
  let s = size;
  for (;;) {
    const lines = [];
    let line = '';
    for (const word of tokens) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, s) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines || s <= 8) return { lines: lines.slice(0, maxLines), size: s };
    s -= 0.25;
  }
}

function drawCentered(page, text, { font, size, y, centerX, color = BLACK }) {
  page.drawText(text, {
    x: centerX - font.widthOfTextAtSize(text, size) / 2,
    y, size, font, color,
  });
}

/** Centered text with per-character tracking — the metadata labels in the
 *  reference PDF carry ~1pt of letter-spacing, which pdf-lib has no option for. */
function drawTracked(page, text, { font, size, y, centerX, color, tracking }) {
  const total = font.widthOfTextAtSize(text, size) + tracking * (text.length - 1);
  let x = centerX - total / 2;
  for (const ch of text) {
    page.drawText(ch, { x, y, size, font, color });
    x += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

/**
 * Draw an image into its box.
 *
 * `fill` (the default) stretches to the box exactly as the Word templates do.
 * That distorts — the FOCA logo comes out ~87% too wide, the signature ~17% —
 * but it is what every certificate issued so far looks like, so it stays the
 * default rather than silently restyling the organisation's document.
 *
 * `contain` scales the image to fit without distorting, vertically centred and
 * horizontally placed by `align`. Switch a layout's `imageFit` to 'contain' to
 * adopt the corrected rendering.
 */
function drawImageIn(page, image, box, { fit = 'fill', align = 'left' } = {}) {
  if (fit === 'fill') {
    page.drawImage(image, { x: box.x, y: box.y, width: box.boxW, height: box.boxH });
    return;
  }
  const scale = Math.min(box.boxW / image.width, box.boxH / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: align === 'center' ? box.x + (box.boxW - w) / 2 : box.x,
    y: box.y + (box.boxH - h) / 2,
    width: w,
    height: h,
  });
}

// ------------------------------------------------------------- generator ----

/**
 * Build one certificate PDF.
 *
 * @param {object} cert
 * @param {string} cert.name            attendee full name
 * @param {string} cert.documentId      national ID number
 * @param {string} cert.documentType    e.g. 'C.C'
 * @param {string} cert.company         'FOCA' | 'VIU' — selects the layout
 * @param {string} cert.trainingName    e.g. 'Violencia Sexual'
 * @param {string} cert.hours           e.g. '4 horas'
 * @param {string} cert.city
 * @param {Date|string} cert.issueDate
 * @param {Date|string} cert.expiresAt
 * @param {string} cert.portalBase      public portal origin, for the QR target
 * @returns {Promise<Uint8Array>}
 */
export async function buildCertificatePdf(cert) {
  const L = LAYOUTS[cert.company] || LAYOUTS.FOCA;
  const centerX = L.width / 2;
  const textWidth = L.width - L.margin * 2;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // Questrial (SIL OFL) stands in for the templates' Century Gothic, which is
  // licensed with Office and cannot ship in a public repository. Passing
  // `fontBytes` overrides it — api/certificate/[id].js supplies a licensed TTF
  // if one has been stored in settings under `cert_font_ttf`.
  const bodyFont = cert.fontBytes || asset('certificate', 'Questrial-Regular.ttf');
  const body = await pdf.embedFont(bodyFont, { subset: true });
  const meta = await pdf.embedFont(StandardFonts.Helvetica);      // Arial stand-in
  const metaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([L.width, L.height]);

  pdf.setTitle(`Certificado ${cert.trainingName} — ${cert.name}`);
  pdf.setSubject(`Certificado de capacitación · ${cert.company}`);
  pdf.setProducer('Portal de certificados FOCA/VIU');
  pdf.setCreator('Portal de certificados FOCA/VIU');

  // --- logo + signature ---
  const fit = L.imageFit || 'fill';
  drawImageIn(page, await pdf.embedPng(asset('certificate', L.logo.file)), L.logo, { fit });
  const sig = await pdf.embedPng(asset('certificate', 'signature.png'));
  drawImageIn(page, sig, L.signature, { fit, align: 'center' });

  // --- headline block ---
  drawCentered(page, L.intro, { font: body, size: L.introSize, y: L.introY, centerX });

  const name = String(cert.name || '').toUpperCase();
  drawCentered(page, name, {
    font: body, y: L.nameY, centerX,
    size: fitSize(body, name, L.nameSize, textWidth),
  });

  const docLine = `${cert.documentType || 'C.C'} No: ${cert.documentId}`;
  drawCentered(page, docLine, { font: body, size: L.docSize, y: L.docY, centerX });

  // --- body sentence (1–2 lines, vertically centred in its fixed block) ---
  const lead = `Ha completado satisfactoriamente el Curso de ${cert.trainingName},`
    + ` realizado${cert.city ? ` en ${cert.city}` : ''}`;
  // The date is one wrap token so "el 15 de marzo de 2026" never splits.
  const tokens = [...lead.split(/\s+/), `el ${longDate(cert.issueDate)}`];
  const wrapped = wrapToLines(body, tokens, L.bodySize, textWidth, 2);
  const blockCenter = L.bodyTopY - L.bodyLeading / 2;
  const firstY = wrapped.lines.length === 1 ? blockCenter : L.bodyTopY;
  wrapped.lines.forEach((line, i) => {
    drawCentered(page, line, {
      font: body, size: wrapped.size, y: firstY - i * L.bodyLeading, centerX,
    });
  });

  const hoursLine = `con una intensidad horaria de ${cert.hours}`;
  drawCentered(page, hoursLine, {
    font: body, y: L.hoursY, centerX,
    size: fitSize(body, hoursLine, L.hoursSize, textWidth),
  });

  // --- metadata bar ---
  page.drawRectangle({
    x: L.ruleX, y: L.ruleY, width: L.ruleW, height: 0.5, color: RULE_GREY,
  });

  const columns = [
    ['INTENSIDAD HORARIA', String(cert.hours || '').toUpperCase()],
    ['FECHA DE REALIZACIÓN', shortDate(cert.issueDate)],
    ['VÁLIDO HASTA', shortDate(cert.expiresAt)],
    ['ID DE VERIFICACIÓN', `${L === LAYOUTS.VIU ? 'VIU' : 'FOCA'}-${cert.documentId}`],
  ];
  columns.forEach(([label, value], i) => {
    const cx = L.metaX + i * L.metaColW + L.metaInnerW / 2;
    drawTracked(page, label, {
      font: meta, size: L.labelSize, y: L.labelY, centerX: cx,
      color: LABEL_GREY, tracking: 1,
    });
    drawCentered(page, value, {
      font: metaBold, y: L.valueY, centerX: cx, color: BRAND,
      size: fitSize(metaBold, value, L.valueSize, L.metaInnerW),
    });
  });

  // --- verification QR ---
  const qrUrl = `${String(cert.portalBase).replace(/\/$/, '')}/?cc=${encodeURIComponent(cert.documentId)}`;
  const qrPng = await QRCode.toBuffer(qrUrl, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 360,
    color: { dark: '#00467FFF', light: '#FFFFFFFF' },
  });
  page.drawImage(await pdf.embedPng(qrPng), {
    x: L.qr.x, y: L.qr.y, width: L.qr.size, height: L.qr.size,
  });

  return pdf.save();
}

/** Filename offered to the browser when downloading. */
export function certificateFilename(cert) {
  const safe = String(cert.name || 'certificado')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, '').trim().replace(/\s+/g, '-').toUpperCase();
  return `${cert.documentId}-${safe || 'CERTIFICADO'}.pdf`;
}
