/* eslint-disable @typescript-eslint/no-require-imports -- Build-only adapter for Next's font loader. */
// Reuse the actual deployed font assets when Google Fonts is unreachable during a build.
// This is never enabled at runtime and does not replace fonts with placeholders.
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.FACTORY_FONT_STATIC_DIR || '/factory-fonts';
const css = fs.readdirSync(path.join(root, 'css')).filter(name => name.endsWith('.css'))
  .map(name => fs.readFileSync(path.join(root, 'css', name), 'utf8')).join('\n');
module.exports = new Proxy({}, { get(_target, url) {
  const family = new URL(url).searchParams.get('family')?.split(':')[0];
  if (!['Geist', 'Geist Mono'].includes(family)) throw Error('Unexpected build font family');
  const faces = (css.match(/@font-face\{[^}]*\}/g) || []).filter(face =>
    face.match(/font-family:([^;]+);/)?.[1].replace(/["']/g, '') === family && face.includes('src:url(/_next/static/media/'));
  if (!faces.length) throw Error('Deployed font assets are missing');
  return faces.map(face => {
    const name = face.match(/src:url\(\/_next\/static\/media\/([A-Za-z0-9.-]+\.woff2)\)/)?.[1];
    if (!name || !fs.existsSync(path.join(root, 'media', name))) throw Error('Deployed font file is missing');
    const local = path.join(root, 'media', name).replace(/\\/g, '/');
    // Next's existing loader parses the subset comment and the literal "src: url(".
    return `/* ${name.includes('.p.') ? 'latin' : 'other'} */\n` + face.replace(`src:url(/_next/static/media/${name})`, `src: url(${local})`);
  }).join('\n');
} });
