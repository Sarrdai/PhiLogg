// Generates the app icon set the Tauri bundler requires (unlike
// electron-builder, which happily falls back to a default icon on win/mac —
// see desktop/README.md "Adding an app icon" for why desktop/ still has
// none). Deliberately dependency-free: a plain RGBA raster encoded to PNG
// with Node's own zlib, then wrapped into .ico/.icns containers (both accept
// embedded PNG data), so generating the set needs nothing but `node
// generate.js` from this directory. The artwork is the same teal dot the
// tray icon draws (see main.rs TRAY_ICON) — a placeholder, not a logo;
// replace this script's draw() and re-run once real artwork exists.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ACCENT = [0x4f, 0xc7, 0xc3];

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const r = size * 0.44;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance-to-edge alpha gives a 1px-ish antialiased rim at every size
      // instead of a visibly stair-stepped circle at 32x32.
      const d = Math.hypot(x - c, y - c);
      const a = Math.max(0, Math.min(1, r - d + 0.5));
      const i = (y * size + x) * 4;
      px[i] = ACCENT[0];
      px[i + 1] = ACCENT[1];
      px[i + 2] = ACCENT[2];
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const px = draw(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// .ico: Vista+ reads PNG-compressed entries directly, so the container is
// just a directory pointing at the same PNGs written above.
function ico(sizes) {
  const images = sizes.map(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

// .icns: same idea — ic07..ic10 are PNG-payload icon types.
function icns(entries) {
  const parts = entries.map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write("icns", 0, 4, "ascii");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const out = (name, buf) => fs.writeFileSync(path.join(__dirname, name), buf);

out("32x32.png", png(32));
out("128x128.png", png(128));
out("128x128@2x.png", png(256));
out("icon.png", png(512));
out("icon.ico", ico([16, 32, 48, 64, 128, 256]));
out("icon.icns", icns([["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]]));
console.log("icons written");
