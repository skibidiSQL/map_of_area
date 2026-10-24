'use strict';
/* Сервер «Карты пространства»: раздаёт сайт, хранит аккаунты и карты в PostgreSQL.
   Запуск: node server.js. Настройки — в .env (нужна переменная DATABASE_URL). */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), util = require('util');
const { Pool } = require('pg');

try { // мини-загрузчик .env
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const E = process.env, PORT = +E.PORT || 3000, HOST = E.HOST || '0.0.0.0',
      VENDOR = path.join(__dirname, 'vendor'), vendor = require('./vendor');
vendor.ensure(); // в фоне: three.js и шрифт — на свой сервер

// Подключение к БД. На Render/Railway передаётся через DATABASE_URL
const pool = new Pool({
  connectionString: E.DATABASE_URL,
  ssl: E.DATABASE_URL && E.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

/* ---------- хранилище ---------- */
const DAY = 864e5, SESSION_MS = 30 * DAY, ID = /^[\w-]{6,64}$/;
const scrypt = util.promisify(crypto.scrypt),
      hp = async (pw, salt) => (await scrypt(pw, salt, 32)).toString('hex'),
      same = (a, b) => a.length == b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/* ---------- сессии: случайный токен → почта + срок 30 дней ---------- */
const tokenOf = req => (req.headers.authorization || '').replace(/^Bearer /, '');

async function who(req) {
  const t = tokenOf(req);
  if (!t) return null;
  const { rows } = await pool.query('SELECT email FROM sessions WHERE token = $1 AND exp > $2', [t, Date.now()]);
  return rows.length ? rows[0].email : null;
}

async function pruneSessions() { 
  await pool.query('DELETE FROM sessions WHERE exp <= $1', [Date.now()]); 
}

async function newSession(email) {
  pruneSessions().catch(() => {});
  const t = crypto.randomBytes(24).toString('hex');
  await pool.query('INSERT INTO sessions (token, email, exp) VALUES ($1, $2, $3)', [t, email, Date.now() + SESSION_MS]);
  return t;
}

/* ---------- защита от подбора пароля ---------- */
const fails = new Map(),
      ip = req => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
      blocked = (k, max) => { const f = fails.get(k); return !!f && f.n >= max && Date.now() < f.until; },
      fail = k => { let f = fails.get(k); if (!f || f.until < Date.now()) f = { n: 0 }; f.n++; f.until = Date.now() + 15 * 60e3; fails.set(k, f); };
setInterval(() => { const n = Date.now(); for (const [k, f] of fails) if (f.until < n) fails.delete(k); }, 36e5).unref();

/* ---------- карты и права ---------- */
const formatMap = r => ({
  id: r.id, owner: r.owner, name: r.name, desc: r.desc,
  share: { mode: r.share_mode, token: r.share_token },
  data: r.data, updated: Number(r.updated)
});

const access = (m, email, t) => !m ? null : email && m.owner === email ? 'owner'
  : t && m.share && m.share.token === t && m.share.mode !== 'off' ? m.share.mode : null;

const lan = () => { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) return a.address; return 'localhost'; };

const read = (req, max = 80e6) => new Promise((ok, no) => {
  let n = 0; const c = [];
  req.on('data', d => { n += d.length; if (n > max) { no(new Error('big')); req.destroy(); } else c.push(d); });
  req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c)) : {}); } catch (e) { no(e); } });
  req.on('error', no);
});

/* ---------- API ---------- */
async function api(req, res, u, p) {
  const m = req.method, t = u.searchParams.get('t') || '';
  const j = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };

  if (p == '/api/ping') return j(200, { ok: true, public: (E.PUBLIC_URL || '').replace(/\/$/, ''), lan: `http://${lan()}:${PORT}` });

  const me = await who(req).catch(() => null);

  if (m == 'POST' && (p == '/api/auth/login' || p == '/api/auth/register')) {
    const b = await read(req, 1e5), em = String(b.email || '').trim().toLowerCase(), pw = String(b.password || ''),
          reg = p.endsWith('register'), ke = 'e:' + em, ki = 'i:' + ip(req);
    if (!/^\S+@\S+\.\S+$/.test(em) || em.length > 120 || !pw || pw.length > 200 || (reg && pw.length < 8)) return j(400, { error: 'bad' });
    if (blocked(ke, 8) || blocked(ki, 40) || (reg && blocked('r:' + ki, 20))) return j(429, { error: 'wait' });
    
    if (reg) {
      const { rowCount } = await pool.query('SELECT email FROM users WHERE email = $1', [em]);
      if (rowCount > 0) return j(409, { error: 'exists' });
      const salt = crypto.randomBytes(8).toString('hex'), hash = await hp(pw, salt);
      try {
        await pool.query('INSERT INTO users (email, salt, hash) VALUES ($1, $2, $3)', [em, salt, hash]);
        fail('r:' + ki);
      } catch { return j(409, { error: 'exists' }); }
    } else {
      const { rows } = await pool.query('SELECT salt, hash FROM users WHERE email = $1', [em]);
      const us = rows[0], ok = us ? same(await hp(pw, us.salt), Buffer.from(us.hash)) : (await hp(pw, 'x'), false);
      if (!ok) { fail(ke); fail(ki); return j(401, { error: 'wrong' }); }
      fails.delete(ke);
    }
    return j(200, { token: await newSession(em), email: em });
  }

  if (m == 'GET' && p == '/api/me') return me ? j(200, { email: me }) : j(401, {});

  if (m == 'POST' && p == '/api/auth/logout') { 
    await pool.query('DELETE FROM sessions WHERE token = $1', [tokenOf(req)]);
    return j(200, { ok: true }); 
  }

  if (m == 'POST' && p == '/api/auth/delete') {
    if (!me) return j(401, {});
    await pool.query('DELETE FROM maps WHERE owner = $1', [me]);
    await pool.query('DELETE FROM users WHERE email = $1', [me]);
    await pool.query('DELETE FROM sessions WHERE email = $1', [me]);
    return j(200, { ok: true });
  }

  if (m == 'GET' && p == '/api/maps') {
    if (!me) return j(401, {});
    const { rows } = await pool.query('SELECT id, name, updated FROM maps WHERE owner = $1', [me]);
    return j(200, rows.map(x => ({ id: x.id, name: x.name, updated: Number(x.updated) })));
  }

  const mm = p.match(/^\/api\/maps\/([\w-]{6,64})$/);
  if (mm) {
    const id = mm[1];
    const { rows } = await pool.query('SELECT * FROM maps WHERE id = $1', [id]);
    const cur = rows.length ? formatMap(rows[0]) : null, role = access(cur, me, t);
    
    if (m == 'GET') return role ? j(200, role == 'owner' ? cur : { ...cur, owner: '' }) : j(cur ? 403 : 404, {});
    
    if (m == 'DELETE') { 
      if (role != 'owner') return j(cur ? 403 : 404, {}); 
      await pool.query('DELETE FROM maps WHERE id = $1', [id]);
      return j(200, { ok: true }); 
    }
    
    if (m == 'PUT') {
      const b = await read(req);
      if (b.id !== id) return j(400, {});
      
      const clean = obj => ({
        owner: me, name: String(obj.name || '').slice(0, 80), desc: String(obj.desc || '').slice(0, 500),
        share_mode: ['view', 'edit'].includes(obj.share && obj.share.mode) ? obj.share.mode : 'off',
        share_token: ID.test(String((obj.share && obj.share.token) || '')) ? obj.share.token : crypto.randomBytes(12).toString('hex'),
        data: obj.data && typeof obj.data == 'object' ? obj.data : {}, updated: +obj.updated || Date.now()
      });

      if (!cur) { 
        if (!me) return j(401, {}); 
        const v = clean(b);
        await pool.query(
          'INSERT INTO maps (id, owner, name, desc, share_mode, share_token, data, updated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [id, v.owner, v.name, v.desc, v.share_mode, v.share_token, v.data, v.updated]
        );
        return j(200, { ok: true }); 
      }
      
      if (role == 'owner') {
        const v = clean({ ...b, owner: me });
        await pool.query(
          'UPDATE maps SET name=$1, desc=$2, share_mode=$3, share_token=$4, data=$5, updated=$6 WHERE id=$7',
          [v.name, v.desc, v.share_mode, v.share_token, v.data, v.updated, id]
        );
      }
      else if (role == 'edit') {
        await pool.query(
          'UPDATE maps SET name=$1, data=$2, updated=$3 WHERE id=$4',
          [String(b.name || cur.name).slice(0, 80), b.data && typeof b.data == 'object' ? b.data : cur.data, +b.updated || Date.now(), id]
        );
      }
      else return j(403, {});
      
      return j(200, { ok: true });
    }
  }
  j(404, {});
}

/* ---------- сайт ---------- */
const MIME = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml', webmanifest: 'application/manifest+json', woff2: 'font/woff2' },
      ASSETS = ['style.css', 'script.js', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg'],
      FALLBACK = { '/vendor/three.min.js': vendor.THREE, '/vendor/fonts.css': vendor.FONTS };

function sendFile(res, file, cache) {
  res.writeHead(200, { 'Content-Type': MIME[file.split('.').pop()] || 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if ((req.headers['x-forwarded-proto'] || '').split(',')[0] == 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    if (p.startsWith('/api/')) return await api(req, res, u, p);

    if (p == '/embed/') { res.writeHead(301, { Location: '/embed' }); return res.end(); }
    if (p == '/' || p == '/index.html' || p == '/embed') { 
      res.setHeader('Content-Security-Policy', p == '/embed' ? `frame-ancestors ${E.EMBED_ORIGINS || '*'}` : "frame-ancestors 'self'");
      if (p != '/embed') res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      return sendFile(res, path.join(__dirname, 'index.html'), 'no-cache');
    }

    const a = ASSETS.find(x => '/' + x == p);
    if (a) return sendFile(res, path.join(__dirname, a), 'no-cache');

    if (p.startsWith('/vendor/')) {
      const full = path.join(VENDOR, path.normalize(decodeURIComponent(p.slice(8))));
      if (full.startsWith(VENDOR + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile()) return sendFile(res, full, 'public, max-age=604800');
      if (FALLBACK[p]) { res.writeHead(302, { Location: FALLBACK[p], 'Cache-Control': 'no-store' }); return res.end(); }
    }
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"server"}');
  }
}).listen(PORT, HOST, () => {
  console.log(`Карта пространства: http://localhost:${PORT}`);
});