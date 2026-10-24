'use strict';
/* Кладёт three.js и шрифт Manrope в папку vendor/, чтобы сайт не зависел от чужих CDN.
   Запускается сам при старте сервера и при сборке Docker; вручную: node vendor.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIR = path.join(__dirname, 'vendor'), FD = path.join(DIR, 'fonts'),
      THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
      FONTS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&display=swap',
      UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const get = async (u, h) => {
  const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(u + ' → ' + r.status);
  return r;
};

async function ensure() {
  fs.mkdirSync(FD, { recursive: true });
  const tf = path.join(DIR, 'three.min.js'), cf = path.join(DIR, 'fonts.css');
  try {
    if (!fs.existsSync(tf)) { fs.writeFileSync(tf, Buffer.from(await (await get(THREE)).arrayBuffer())); console.log('vendor: three.js сохранён'); }
  } catch (e) { console.error('vendor: не удалось скачать three.js (пока используется CDN):', e.message); }
  try {
    if (!fs.existsSync(cf)) {
      const css = await (await get(FONTS, { 'User-Agent': UA })).text();
      let out = '';
      for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)) {
        if (!['cyrillic', 'latin'].includes(m[1])) continue;
        let block = m[2];
        for (const u of [...block.matchAll(/url\((https:[^)]+)\)/g)]) {
          const name = crypto.createHash('md5').update(u[1]).digest('hex').slice(0, 12) + '.woff2';
          fs.writeFileSync(path.join(FD, name), Buffer.from(await (await get(u[1])).arrayBuffer()));
          block = block.replace(u[1], () => 'fonts/' + name);
        }
        out += `/* ${m[1]} */\n${block}\n`;
      }
      if (!out) throw new Error('в ответе нет нужных @font-face');
      fs.writeFileSync(cf, out); console.log('vendor: шрифт Manrope сохранён');
    }
  } catch (e) { console.error('vendor: не удалось скачать шрифт (пока используется Google Fonts):', e.message); }
}

module.exports = { ensure, THREE, FONTS };
if (require.main === module) ensure();
