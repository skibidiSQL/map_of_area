/* Карта пространства: аккаунты (логин + пароль), доступ по ссылке, встраивание, офлайн.
   Через server.js: аккаунты и карты на сервере, копия карт — в IndexedDB браузера (работает без сети).
   Открыт как файл (file://): автономный режим, аккаунты только на этом устройстве, общих ссылок нет. */
(() => {
let API = '', BASE = '';
const SK = 'tk-session', TK = 'tk-token', PKG = window.__PKG || null,
  THREE_URL = 'vendor/three.min.js',
  EMB = /\/embed\/?$/.test(location.pathname);
let me = null, rec = null, role = 'view', st = 0;
const body = document.body,
      rnd = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(36).padStart(2, '0')).join(''),
      view = v => body.dataset.v = v,
      nav_ = on => body.toggleAttribute('data-nav', on),
      authH = () => ({ Authorization: 'Bearer ' + (localStorage.getItem(TK) || '') }),
      dq = () => JSON.parse(localStorage.getItem('tk-del') || '[]'),
      api = (p, b) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authH() }, body: JSON.stringify(b || {}) }).then(r => r.ok ? r.json().catch(() => ({})) : Promise.reject(r.status)),
      dlg = h => { const d = $('#dlg'); d.firstElementChild.innerHTML = h; d.hidden = false; },
      undlg = () => $('#dlg').hidden = true,
      link = r => BASE + '/#/m/' + r.id + '/' + r.share.token,
      av = (u, big) => `<span class="av${big ? ' big' : ''}"${u.photo ? ` style="background-image:url('${u.photo}')"` : ''}>${u.photo ? '' : esc(u.email[0].toUpperCase())}</span>`;

/* ---------- хранилище (IndexedDB: влезают большие панорамы, работает офлайн) ---------- */
const DB = (() => {
  let p;
  const open = () => p || (p = new Promise((ok, no) => {
    const r = indexedDB.open('tk-spacemap', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('users', { keyPath: 'email' }); r.result.createObjectStore('maps', { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const tx = async (s, m, f) => {
    const d = await open();
    return new Promise((ok, no) => { const t = d.transaction(s, m), q = f(t.objectStore(s)); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); });
  };
  return { get: (s, k) => tx(s, 'readonly', o => o.get(k)), put: (s, v) => tx(s, 'readwrite', o => o.put(v)),
           del: (s, k) => tx(s, 'readwrite', o => o.delete(k)), all: s => tx(s, 'readonly', o => o.getAll()) };
})();
const mine = async () => (await DB.all('maps')).filter(m => m.owner === me.email).sort((a, b) => b.updated - a.updated);

/* ---------- авторизация: логин (почта) + пароль ---------- */
const web = () => /^https?:$/.test(location.protocol);

function authUI() {
  view('auth'); nav_(false);
  $('#auth').innerHTML = `<div class="card"><div class="logo">Карта пространства</div><p><small>Войдите или создайте аккаунт</small></p><label>Логин (почта)</label><input type="text" id="ae" inputmode="email" autocomplete="username" autocapitalize="none"><label>Пароль</label><input type="password" id="ap" autocomplete="current-password"><div class="btns"><button class="pri" id="al">Войти</button><button id="ar">Создать аккаунт</button></div><p><small>Пароль — минимум 8 символов. Восстановления пароля нет: запомните его.</small></p>${web() ? '' : '<div class="note">Страница открыта как файл: общие ссылки не работают. Запустите server.js и откройте http://localhost:3000</div>'}</div>`;
}

$('#auth').onclick = async e => {
  const id = e.target.id;
  if (id != 'al' && id != 'ar') return;
  const email = $('#ae').value.trim().toLowerCase(), pw = $('#ap').value, reg = id == 'ar';
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Логин — это почта, например name@mail.com');
  if (!pw || (reg && pw.length < 8)) return toast(reg ? 'Пароль — минимум 8 символов' : 'Введите пароль');
  try {
    if (!API) await probe();
    let u;
    if (API) {
      const r = await api(reg ? '/auth/register' : '/auth/login', { email, password: pw });
      localStorage.setItem(TK, r.token);
      u = (await DB.get('users', email)) || { email, photo: null };
    } else if (web()) return toast('Нет связи с сервером. Проверьте интернет и обновите страницу');
    else { // файл без сервера: локальные аккаунты только на этом устройстве
      u = await DB.get('users', email);
      if (reg && u) return toast('Такой аккаунт уже существует');
      if (!reg && (!u || u.hash !== await hash(u.salt + pw))) return toast('Неверный логин или пароль');
      if (reg) { const salt = rnd(); u = { email, salt, hash: await hash(salt + pw), photo: null }; }
    }
    await DB.put('users', u);
    localStorage.setItem(SK, u.email); me = u;
    await nav(); home(); pull().then(nav); sync();
  } catch (x) { toast(x == 401 ? 'Неверный логин или пароль' : x == 409 ? 'Такой аккаунт уже существует' : x == 429 ? 'Слишком много попыток. Подождите 15 минут' : x == 400 ? 'Проверьте логин и пароль' : 'Ошибка. Проверьте соединение и попробуйте снова'); }
};
$('#auth').onkeydown = e => { if (e.key == 'Enter' && $('#al')) $('#al').click(); };

function deny(msg) {
  view('auth'); nav_(false);
  $('#auth').innerHTML = `<div class="card"><h3>Нет доступа</h3><p>${msg}</p>${EMB ? '' : '<div class="btns"><button class="pri" onclick="location.hash=\'\';location.reload()">Войти в аккаунт</button></div>'}</div>`;
}

/* ---------- кабинет: панель слева, профиль, карты ---------- */
async function nav() {
  if (!me) return;
  const ms = await mine();
  $('#nav').innerHTML = `<div class="np" data-n="prof">${av(me)}<div><b>Профиль</b><small>${esc(me.email)}</small></div></div><div class="nh">Мои карты</div>` +
    (ms.map(m => `<div class="nr"><button class="ni${rec && rec.id == m.id ? ' on' : ''}" data-m="${m.id}">🗺 ${esc(m.name)}</button><button class="nx" data-x="${m.id}" aria-label="Удалить карту" title="Удалить">🗑</button></div>`).join('') || '<small style="padding:6px 12px">Карт пока нет</small>') +
    '<button class="ni" data-n="new">＋ Создать карту</button>';
}

function home(k) {
  view('home'); nav_(innerWidth >= 900);
  $('#home').innerHTML = k == 'new' ? formHtml() : k == 'prof'
    ? `<div class="card" style="text-align:center">${av(me, 1)}<h3 style="margin-top:12px">Профиль</h3><small>Логин</small><div style="font-weight:800;word-break:break-all">${esc(me.email)}</div><input type="file" accept="image/*" id="ph" hidden><div class="btns" style="justify-content:center"><button data-a="photo">Добавить фото</button><button data-a="out">Выйти</button><button class="del" data-a="del">Удалить профиль</button></div></div>`
    : `<div><button class="plus" data-a="new" aria-label="Создать карту">+</button><div class="plus-t">Создать карту пространства</div></div>`;
}

async function leave() { if (st) { clearTimeout(st); await persist(); } }

$('#cab').onclick = async e => {
  if (e.target.id == 'nbk') return nav_(false);
  const b = e.target.closest('[data-n],[data-m],[data-a],[data-x]');
  if (!b) return;
  const d = b.dataset, a = d.n || d.a;
  if (d.m) { await leave(); openRec(await DB.get('maps', d.m), 'owner'); }
  if (a == 'prof') { await leave(); rec = null; home('prof'); }
  if (a == 'new') return createForm();
  if (a == 'cancel') home();
  if (a == 'next') return createMap();
  if (d.x) {
    const m = await DB.get('maps', d.x);
    return dlg(`<h3>Удалить карту «${esc(m.name)}»?</h3><p>Карта и все панорамы будут удалены, ссылки на неё перестанут работать.</p><div class="btns"><button data-d="cancel">Отмена</button><button class="pri" data-d="delmap" data-id="${m.id}">Удалить</button></div>`);
  }
  if (a == 'photo') $('#ph').click();
  if (a == 'out') { if (API) api('/auth/logout').catch(() => {}); localStorage.removeItem(SK); localStorage.removeItem(TK); me = null; rec = null; return authUI(); }
  if (a == 'del') dlg(`<h3>Удалить профиль?</h3><p>Профиль и все ваши карты будут удалены с сервера и с этого устройства. Это нельзя отменить.</p><div class="btns"><button data-d="cancel">Отмена</button><button class="pri" data-d="delok">Удалить</button></div>`);
  if (innerWidth < 900 && (d.m || a == 'prof')) nav_(false);
  nav();
};
$('#home').onchange = e => {
  const f = e.target.id == 'ph' && e.target.files[0];
  if (f) img(f, 256, async s => { me.photo = s; await DB.put('users', me); nav(); home('prof'); });
};
$('#hb').onclick = $('#bg').onclick = () => nav_();

/* ---------- создание карты ---------- */
function formHtml() {
  return `<div class="card"><h3>Новая карта пространства</h3><label>Название</label><input type="text" id="cn" maxlength="80"><label>Краткое описание (по желанию)</label><textarea id="cd"></textarea><div class="btns"><button data-a="cancel">Отмена</button><button class="pri" data-a="next">Далее</button></div></div>`;
}

async function createForm() {
  await leave(); rec = null; home('new');
  if (innerWidth < 900) nav_(false);
  $('#cn').focus(); nav();
}

async function createMap() {
  const name = $('#cn').value.trim();
  if (!name) return toast('Введите название');
  const r = { id: rnd(), owner: me.email, name, desc: $('#cd').value.trim(), share: { mode: 'off', token: rnd() },
              data: { name, bg: null, cor: [], rooms: [], pois: [], panos: [] }, updated: Date.now(), dirty: true };
  try { await DB.put('maps', r); } catch { return toast('Не удалось сохранить карту'); }
  openRec(r, 'owner'); sync();
}

function openRec(r, ro, solo) {
  rec = r; role = ro;
  body.toggleAttribute('data-solo', !!solo);
  $('#shr').hidden = ro != 'owner';
  view('map'); nav_(!solo && innerWidth >= 900);
  Core.open(r.data, ro);
  nav();
}

/* ---------- сохранение (сначала локально, потом в сеть) ---------- */
Core.onSave = d => {
  if (!rec || role == 'view') return;
  rec.data = d; rec.name = d.name || rec.name; rec.updated = Date.now(); rec.dirty = true;
  clearTimeout(st); st = setTimeout(persist, 500);
};

async function persist(r = rec) {
  st = 0;
  if (!r) return;
  try { await DB.put('maps', r); } catch { toast('Не удалось сохранить карту на устройстве'); }
  nav(); sync();
}

async function sync() {
  if (!API || !navigator.onLine) return;
  for (const id of dq()) try {
    const r = await fetch(`${API}/maps/${id}`, { method: 'DELETE', headers: authH() });
    if (r.ok || r.status == 404) localStorage.setItem('tk-del', JSON.stringify(dq().filter(x => x != id)));
  } catch {}
  let all = [];
  try { all = await DB.all('maps'); } catch { return; }
  for (const m of all.filter(m => m.dirty && !dq().includes(m.id))) try {
    const r = await fetch(`${API}/maps/${m.id}?t=${m.share.token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authH() }, body: JSON.stringify(m) });
    const c = r.ok && await DB.get('maps', m.id);
    if (c && c.updated == m.updated) { c.dirty = false; await DB.put('maps', c); }
  } catch {}
}

// забрать с сервера карты аккаунта (в т.ч. созданные на другом устройстве)
async function pull() {
  if (!API || !me || !navigator.onLine) return;
  try {
    const list = await fetch(`${API}/maps`, { headers: authH() }).then(r => r.ok ? r.json() : Promise.reject());
    for (const l of await mine()) if (!l.dirty && !list.some(x => x.id == l.id)) await DB.del('maps', l.id);
    for (const x of list) {
      if (dq().includes(x.id)) continue;
      const l = await DB.get('maps', x.id);
      if (l && (l.dirty || l.updated >= x.updated)) continue;
      const m = await fetch(`${API}/maps/${x.id}`, { headers: authH() }).then(r => r.ok ? r.json() : null);
      if (m) await DB.put('maps', { ...m, dirty: false });
    }
  } catch {}
}

function dropRemote(id) { localStorage.setItem('tk-del', JSON.stringify([...dq(), id])); sync(); }

async function probe() {
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const r = await fetch('/api/ping', { cache: 'no-store' }).then(x => x.ok ? x.json() : Promise.reject());
    API = '/api';
    BASE = (r.public || (/^(localhost|127\.|\[::1\])/.test(location.hostname) ? r.lan : location.origin)).replace(/\/$/, '');
  } catch {}
}

/* ---------- «Поделиться» ---------- */
function shareDlg() {
  const m = rec.share.mode, o = (v, t) => `<option value="${v}"${m == v ? ' selected' : ''}>${t}</option>`;
  dlg(`<h3>Поделиться «${esc(rec.name)}»</h3><label>Доступ по ссылке</label><select id="sm">${o('off', '🔒 Только я')}${o('view', '👁 Все со ссылкой — посетитель (просмотр)')}${o('edit', '✏️ Все со ссылкой — организатор (редактирование)')}</select>` +
    (!API ? '<div class="note">Сервер недоступен (сайт открыт как файл или нет связи): общая ссылка не создаётся. Запустите server.js и откройте http://localhost:3000. Пока можно скачать офлайн-версию.</div>' : m == 'off' ? '<p><small>Ссылка не работает, пока вы не откроете доступ.</small></p>'
      : `<label>Ссылка</label><input type="text" id="sl" readonly value="${esc(link(rec))}"><div class="btns"><button class="pri" data-d="copy">Копировать ссылку</button><button data-d="reset">Новая ссылка</button></div><label>Встроить на сайт</label><textarea id="se" readonly rows="4">${esc(embedCode(rec))}</textarea><div class="btns"><button data-d="copyembed">Копировать код</button></div><p><small>Во встроенном виде карта всегда только для просмотра.</small></p>`) +
    `<label>Без интернета</label><div class="btns" style="margin-top:0"><button data-d="pack">⬇ Офлайн-версия (.html)</button></div><p><small>Один файл с картой и панорамами: открывается на телефоне без сети. Роль берётся из выбранного доступа (при «Только я» — посетитель). Ссылка работает на любом устройстве; после первого открытия карта сохраняется в браузере и открывается без интернета.</small></p><div class="btns"><button class="pri" data-d="cancel">Готово</button></div>`);
}

const embedCode = r => `<iframe src="${BASE}/embed#/m/${r.id}/${r.share.token}" width="100%" height="640" style="border:0" allow="fullscreen; accelerometer; gyroscope" allowfullscreen loading="lazy"></iframe>`;

const touch = () => { rec.updated = Date.now(); rec.dirty = true; persist(); };

async function pack() {
  toast('Готовлю файл…');
  try {
    const t = u => fetch(u).then(r => r.ok ? r.text() : Promise.reject(u)), z = s => s.replace(/<\/script/gi, '<\\/script');
    const [h, css, core, app, three] = await Promise.all(['index.html', 'style.css', 'script.js', 'app.js', THREE_URL].map(t)),
          r = rec.share.mode == 'edit' ? 'edit' : 'view',
          m = { ...rec, owner: 'pkg', share: { mode: rec.share.mode, token: '' }, dirty: false },
          out = h.replace(/<link rel="stylesheet" href="style.css">/, () => `<style>${css}</style>`)
            .replace(/<link rel="stylesheet" href="vendor\/fonts\.css">\n?/, '')
            .replace(/<script src="vendor\/three\.min\.js"><\/script>/, () => `<script>${z(three)}</script>`)
            .replace(/<script src="script.js"><\/script>/, () => `<script>window.__PKG=${z(JSON.stringify({ map: m, role: r }))}</script><script>${z(core)}</script>`)
            .replace(/<script src="app.js"><\/script>/, () => `<script>${z(app)}</script>`),
          a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'text/html' }));
    a.download = (rec.name.replace(/[^\p{L}\p{N}]+/gu, '_') || 'map') + '.html';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4e4);
  } catch { toast('Не удалось собрать файл: при первом запуске нужен интернет'); }
}

$('#shr').onclick = shareDlg;
$('#dlg').onchange = e => { if (e.target.id == 'sm') { rec.share.mode = e.target.value; touch(); shareDlg(); } };
$('#dlg').onclick = async e => {
  if (e.target.id == 'dlg') return undlg();
  const d = (e.target.closest('[data-d]') || {}).dataset;
  if (!d) return;
  if (d.d == 'cancel') undlg();
  if (d.d == 'delmap') {
    const id = d.id;
    await DB.del('maps', id);
    if (rec && rec.id == id) { rec = null; home(); }
    undlg(); dropRemote(id); nav();
  }
  if (d.d == 'copy') {
    try { await navigator.clipboard.writeText(link(rec)); } catch { $('#sl').select(); document.execCommand('copy'); }
    toast('Ссылка скопирована');
  }
  if (d.d == 'reset') { rec.share.token = rnd(); touch(); shareDlg(); toast('Старая ссылка больше не работает'); }
  if (d.d == 'copyembed') {
    try { await navigator.clipboard.writeText($('#se').value); } catch { $('#se').select(); document.execCommand('copy'); }
    toast('Код скопирован');
  }
  if (d.d == 'pack') pack();
  if (d.d == 'delok') {
    for (const m of await mine()) await DB.del('maps', m.id);
    await DB.del('users', me.email);
    if (API) await api('/auth/delete').catch(() => {});
    localStorage.removeItem(SK); localStorage.removeItem(TK); me = null; rec = null; undlg(); authUI();
  }
};

/* ---------- ссылка посетителя / офлайн-файл / запуск ---------- */
async function openLink(id, tok) {
  let r = null;
  try { r = await DB.get('maps', id); } catch {}
  const fresh = !r;
  if (API && navigator.onLine) try {
    const x = await fetch(`${API}/maps/${id}?t=${tok}`, { headers: EMB ? {} : authH() });
    if (x.ok) {
      const n = await x.json();
      if (!r || n.updated >= r.updated) { r = { ...n, dirty: false }; await DB.put('maps', r); if (fresh && !EMB) toast('Карта сохранена: откроется и без интернета'); }
    } else if (r && r.owner !== localStorage.getItem(SK)) { await DB.del('maps', id); r = null; }
  } catch {}
  const em = EMB ? null : localStorage.getItem(SK), own = !!(r && em && r.owner === em);
  let ro = own ? 'owner' : r && r.share && r.share.token === tok && r.share.mode != 'off' ? r.share.mode : null;
  if (EMB && ro) ro = 'view'; // во встроенном виде карта всегда только для просмотра
  if (!ro) return deny(r ? 'Владелец закрыл доступ по этой ссылке.' : 'Карта удалена, доступ закрыт или она ещё не сохранена на этом устройстве. Откройте ссылку при подключении к интернету или попросите офлайн-версию (.html).');
  if (own) me = await DB.get('users', em);
  openRec(r, ro, !own);
}

(async () => {
  body.toggleAttribute('data-embed', EMB);
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !PKG) navigator.serviceWorker.register('sw.js').catch(() => {});
  addEventListener('online', async () => { await probe(); sync(); });
  addEventListener('hashchange', () => /^#\/m\//.test(location.hash) && location.reload());
  await probe();
  if (PKG) {
    let r = PKG.map;
    try { const o = await DB.get('maps', r.id); if (o && o.updated > r.updated) r = o; } catch {}
    return openRec(r, PKG.role, true);
  }
  const l = location.hash.match(/^#\/m\/([\w-]+)\/([\w-]*)/);
  if (l) return openLink(l[1], l[2]);
  if (EMB) return deny('Не указана карта для показа.');
  const em = localStorage.getItem(SK), u = em && await DB.get('users', em).catch(() => null);
  if (u && API) try { // сессия ещё действует на сервере? без сети — остаёмся в локальной
    if ((await fetch(`${API}/me`, { headers: authH() })).status == 401) { localStorage.removeItem(SK); localStorage.removeItem(TK); return authUI(); }
  } catch {}
  if (u) { me = u; await nav(); home(); pull().then(nav); sync(); } else authUI();
})();
})();
