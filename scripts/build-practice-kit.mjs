// Package the Practice Kit for the gated download.
//
//   node scripts/build-practice-kit.mjs          (part of `npm run build`)
//   npm run kit:build                             (local, reads .env)
//
// Zips resources/practice-kit/*.docx plus a README into
// public/practice-kit/files/<secret dir>/painbeacon-practice-kit.zip, where the
// directory name is derived from KIT_SECRET (see functions/_lib/kit.js). The
// zip is a build artifact — *.zip is gitignored — and the .docx sources are
// what's committed. functions/practice-kit/download.js serves the file after
// checking a signed link; nothing else links to the path.
//
// Without KIT_SECRET nothing is written and the endpoint answers 503, so a
// local build never publishes the kit at a predictable path by accident.
//
// The zip writer is inline (deflate via node:zlib, CRC-32 below) so the build
// doesn't grow a dependency for one 60 KB file.
import { readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { kitAssetPath } from '../functions/_lib/kit.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'resources', 'practice-kit');
const STORE = join(root, 'public', 'practice-kit', 'files');

const secret = process.env.KIT_SECRET;
if (!secret) {
  console.warn('! KIT_SECRET not set — Practice Kit not packaged; /practice-kit/download will answer 503.');
  process.exit(0);
}
if (!existsSync(SRC)) {
  console.error(`Practice Kit sources missing: ${SRC}`);
  process.exit(1);
}

// ---------------------------------------------------------------- zip writer
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(entries) {
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const comp = deflateRawSync(e.data, { level: 9 });
    const deflate = comp.length < e.data.length;
    const body = deflate ? comp : e.data;
    const method = deflate ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);

    parts.push(lh, name, body);
    central.push(ch, name);
    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cd, eocd]);
}

// ---------------------------------------------------------------- package it
const docs = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.docx')).sort();
if (!docs.length) {
  console.error(`No .docx files in ${SRC}`);
  process.exit(1);
}

const readme = [
  'PainBeacon Practice Kit',
  '',
  'Five front-desk forms for pain practices, free for claimed and verified',
  'PainBeacon listings. Each file is an editable Word document: open it, fill in',
  'the brackets, delete what does not apply, and have your billing lead or',
  'counsel look it over before you post it.',
  '',
  ...docs.map((f) => `  ${f}`),
  '',
  'Nothing here is legal, compliance, billing, or medical advice. Laws and payer',
  'rules vary by state and change over time.',
  '',
  'About the kit:   https://painbeacon.com/practice-kit/',
  'Your listing:    https://painbeacon.com/for-practices/',
  `Packaged:        ${new Date().toISOString().slice(0, 10)}`,
  '',
].join('\r\n');

const entries = [
  { name: 'README.txt', data: Buffer.from(readme, 'utf8') },
  ...docs.map((f) => ({ name: f, data: readFileSync(join(SRC, f)) })),
];

const rel = await kitAssetPath(secret); // /practice-kit/files/<dir>/<file>
const out = join(root, 'public', ...rel.split('/').filter(Boolean));

// Old secret dirs would otherwise pile up (and stay reachable) after a rotation.
rmSync(STORE, { recursive: true, force: true });
mkdirSync(dirname(out), { recursive: true });
const buf = zip(entries);
writeFileSync(out, buf);
console.log(`Practice Kit packaged: ${entries.length} files, ${(statSync(out).size / 1024).toFixed(0)} KB → public/practice-kit/files/…/${rel.split('/').pop()}`);
