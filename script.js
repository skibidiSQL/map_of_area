const GW = 28, GH = 18, KEY = 'tk-spacemap-v1', PK = 'tk-spacemap-pin';
const CATS = {
  stand: ['🏷', 'Стенд'],
  hall: ['🎤', 'Зал'],
  door: ['🚪', 'Вход'],
  desk: ['🛎', 'Стойка'],
  wifi: ['📶', 'Wi-Fi'],
  food: ['☕', 'Кафе'],
  other: ['📍', 'Другое']
};
const $ = s => document.querySelector(s),
      uid = () => Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const brg = (a, b) => Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI;

const blank = () => ({ name: '', bg: null, cor: [], rooms: [], pois: [], panos: [] });

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); }
  catch { return null; }
}

let S = blank(),
    mode = 'v',
    tool = 'sel',
    sh = null,
    route = null,
    unlocked = false,
    WS, RS, dr = null, pt = null;

function save() { if (window.Core && Core.onSave) Core.onSave(S); }

function toast(t) {
  const e = $('#toast');
  e.textContent = t;
  e.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.style.display = 'none', 2600);
}

const P = id => S.pois.find(p => p.id == id),
      N = id => S.panos.find(p => p.id == id),
      R_ = id => S.rooms.find(r => r.id == id);

function mk() {
  WS = new Set(S.cor);
  RS = new Set();
  S.rooms.forEach(r => {
    for (let i = 0; i < r.w; i++)
      for (let j = 0; j < r.h; j++) {
        const k = (r.x + i) + ',' + (r.y + j);
        WS.add(k);
        RS.add(k);
      }
  });
}

function bfs(a, b) {
  const q = [[a.x, a.y]],
        prev = { [a.x + ',' + a.y]: null },
        t = b.x + ',' + b.y;
        
  for (let i = 0; i < q.length && !(t in prev); i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + ',' + (y + dy);
      if (WS.has(k) && !(k in prev)) {
        prev[k] = x + ',' + y;
        q.push([x + dx, y + dy]);
      }
    }
  }
  
  if (!(t in prev)) return null;
  const p = [];
  for (let k = t; k; k = prev[k]) p.push(k.split(',').map(Number));
  return p.reverse();
}

/* ---------- план ---------- */
function plan() {
  mk();
  const svg = $('#plan');
  let h = '', w = '', g = '';
  
  if (S.bg) h += `<image href="${S.bg}" width="28" height="18" preserveAspectRatio="xMidYMid slice" opacity=".45"/>`;
  
  WS.forEach(k => {
    const [x, y] = k.split(',').map(Number);
    h += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="var(--${RS.has(k) ? 'room' : 'cor'})"/>`;
    if (!WS.has(x + ',' + (y - 1))) w += `M${x} ${y}h1`;
    if (!WS.has(x + ',' + (y + 1))) w += `M${x} ${y + 1}h1`;
    if (!WS.has((x - 1) + ',' + y)) w += `M${x} ${y}v1`;
    if (!WS.has((x + 1) + ',' + y)) w += `M${x + 1} ${y}v1`;
  });
  
  if (mode == 'o') {
    for (let i = 0; i <= GW; i++) g += `M${i} 0v${GH}`;
    for (let j = 0; j <= GH; j++) g += `M0 ${j}h${GW}`;
    h += `<path d="${g}" stroke="var(--line)" stroke-width=".03" fill="none"/>`;
  }
  
  h += `<path d="${w}" stroke="var(--wall)" stroke-width=".16" stroke-linecap="square" fill="none"/>`;
  
  S.rooms.forEach(r => h += `<text x="${r.x + r.w / 2}" y="${r.y + .75}" class="lbl" style="font-size:.5px;fill:var(--mut);stroke:none">${esc(r.name)}</text>`);
  
  if (dr) {
    const x = Math.min(dr.x0, dr.x1), y = Math.min(dr.y0, dr.y1);
    h += `<rect x="${x}" y="${y}" width="${Math.abs(dr.x1 - dr.x0) + 1}" height="${Math.abs(dr.y1 - dr.y0) + 1}" fill="#e2231a44" stroke="#e2231a" stroke-width=".1"/>`;
  }
  
  if (route && route.path) h += `<polyline class="route" points="${route.path.map(p => (p[0] + .5) + ',' + (p[1] + .5)).join(' ')}"/>`;
  
  S.panos.forEach(n => h += `<g transform="translate(${n.x + .5} ${n.y + .5})"><circle r=".32" fill="var(--card)" stroke="var(--red)" stroke-width=".1"/><text y=".14" font-size=".36" text-anchor="middle">📷</text></g>`);
  
  S.pois.forEach(p => {
    const on = sh && sh.id == p.id;
    h += `<g transform="translate(${p.x + .5} ${p.y + .5})">${on ? '<circle r=".62" fill="#e2231a33"/>' : ''}<circle r=".42" fill="var(--red)" stroke="#fff" stroke-width=".07"/><text y=".16" font-size=".46" text-anchor="middle">${CATS[p.cat][0]}</text><text y="1" class="lbl">${esc(p.name)}</text></g>`;
  });
  
  svg.innerHTML = h;
  svg.style.touchAction = mode == 'o' && ['room', 'cor', 'era'].includes(tool) ? 'none' : 'pan-y';
  $('#mname').textContent = S.name;
  $('#chips').innerHTML = S.pois.map(p => `<button data-c="${p.id}">${CATS[p.cat][0]} ${esc(p.name)}</button>`).join('');
}

function tools() {
  $('#tools').innerHTML = [['sel', '☝ Выбор'], ['room', '▭ Зал'], ['cor', '▬ Коридор'], ['era', '⌫ Ластик'], ['poi', '📍 Точка'], ['pano', '📷 Панорама'], ['menu', '⚙ Карта']]
    .map(([t, l]) => `<button data-t="${t}" class="${tool == t ? 'on' : ''}">${l}</button>`)
    .join('');
}

const svg = $('#plan');

function cell(e) {
  const r = svg.getBoundingClientRect();
  return [
    Math.min(GW - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * GW))),
    Math.min(GH - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * GH)))
  ];
}

function paint(x, y) {
  const k = x + ',' + y;
  if (tool == 'cor' && !WS.has(k)) S.cor.push(k);
  if (tool == 'era') {
    S.cor = S.cor.filter(c => c != k);
    S.rooms = S.rooms.filter(r => !(x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h));
  }
  plan();
}

svg.onpointerdown = e => {
  const [x, y] = cell(e);
  svg.setPointerCapture(e.pointerId);
  pt = { x, y, lx: x, ly: y, m: false };
  if (mode == 'o') {
    if (tool == 'room') dr = { x0: x, y0: y, x1: x, y1: y };
    if (tool == 'cor' || tool == 'era') paint(x, y);
  }
};

svg.onpointermove = e => {
  if (!pt) return;
  const [x, y] = cell(e);
  if (x == pt.lx && y == pt.ly) return;
  pt.lx = x; pt.ly = y; pt.m = true;
  if (dr) { dr.x1 = x; dr.y1 = y; plan(); }
  else if (mode == 'o' && (tool == 'cor' || tool == 'era')) paint(x, y);
};

svg.onpointerup = e => {
  if (!pt) return;
  const { x, y } = pt;
  if (dr) {
    const r = { id: 'r' + uid(), x: Math.min(dr.x0, dr.x1), y: Math.min(dr.y0, dr.y1), w: Math.abs(dr.x1 - dr.x0) + 1, h: Math.abs(dr.y1 - dr.y0) + 1, name: 'Новый зал' };
    dr = null;
    S.rooms.push(r);
    save();
    sh = { t: 'er', id: r.id };
    plan();
    sheet();
  }
  else if (mode == 'o' && (tool == 'cor' || tool == 'era')) { save(); }
  else if (!pt.m) { tap(x, y); }
  pt = null;
};

function tap(x, y) {
  const poi = S.pois.find(p => p.x == x && p.y == y),
        pn = S.panos.find(p => p.x == x && p.y == y),
        o = mode == 'o';
        
  if (poi) { sh = { t: o ? 'ep' : 'pv', id: poi.id }; }
  else if (pn) { if (o && tool != 'sel' || o) { sh = { t: 'en', id: pn.id }; } else { openPano(pn.id); } }
  else if (o && tool == 'poi' && WS.has(x + ',' + y)) {
    const p = { id: 'p' + uid(), x, y, name: 'Новая точка', cat: 'other', desc: '' };
    S.pois.push(p); save(); sh = { t: 'ep', id: p.id };
  }
  else if (o && tool == 'pano' && WS.has(x + ',' + y)) {
    const p = { id: 'n' + uid(), x, y, name: 'Панорама', demo: 'Панорама', rot: 0, hs: [] };
    S.panos.push(p); save(); sh = { t: 'en', id: p.id };
  }
  else if (o && tool == 'sel') {
    const r = S.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    sh = r ? { t: 'er', id: r.id } : null;
  }
  else sh = null;
  
  plan();
  sheet();
}

/* ---------- панель ---------- */
const nearPano = p => {
  let b = null, d = 6;
  S.panos.forEach(n => {
    const k = Math.hypot(n.x - p.x, n.y - p.y);
    if (k <= d) { d = k; b = n; }
  });
  return b;
};

function recalc() {
  if (!route) return;
  const a = P(route.from), b = P(route.to);
  route.path = a && b ? bfs(a, b) : null;
  route.tour = [];
  if (route.path) {
    const seen = new Set();
    route.path.forEach((c, i) => {
      S.panos.forEach(n => {
        if (!seen.has(n.id) && Math.hypot(n.x - c[0], n.y - c[1]) <= 2.5) {
          seen.add(n.id);
          route.tour.push(n.id);
        }
      });
    });
  }
}

const opts = (sel) => S.pois.map(p => `<option value="${p.id}" ${p.id == sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

const head = (ic, t, s) => `<div class="grab"></div><div class="row"><span class="ic">${ic}</span><div><h3>${esc(t)}</h3><small>${s}</small></div><button class="x" data-a="x">✕</button></div>`;

function sheet() {
  const el = $('#sheet');
  if (!sh) { el.className = ''; return; }
  el.className = 'open';
  let h = '';
  
  if (sh.t == 'pv') {
    const p = P(sh.id), n = nearPano(p);
    h = head(CATS[p.cat][0], p.name, CATS[p.cat][1]) + `<p>${esc(p.desc) || '<small>Описание пока не добавлено</small>'}</p><div class="btns"><button class="pri" data-a="to">Маршрут сюда</button>${n ? `<button data-a="pano" data-id="${n.id}">Смотреть панораму</button>` : ''}</div>`;
  }
  if (sh.t == 'ep') {
    const p = P(sh.id);
    h = head(CATS[p.cat][0], 'Точка', 'на плане и в панорамах') + `<label>Название</label><input type="text" data-f="name" value="${esc(p.name)}"><label>Категория</label><select data-f="cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k == p.cat ? 'selected' : ''}>${v[0]} ${v[1]}</option>`).join('')}</select><label>Описание</label><textarea data-f="desc">${esc(p.desc)}</textarea><div class="btns"><button class="pri" data-a="x">Готово</button><button class="del" data-a="delp">Удалить</button></div>`;
  }
  if (sh.t == 'en') {
    const p = N(sh.id);
    h = head('📷', 'Панорама', p.src ? 'своё фото' : 'без фото') + `<label>Название</label><input type="text" data-f="name" value="${esc(p.name)}"><label>Загрузить панораму 360° (equirectangular)</label><input type="file" accept="image/*" data-up="pano"><label>Поворот относительно плана: ${p.rot}°</label><input type="range" min="0" max="359" value="${p.rot}" data-f="rot" style="width:100%"><div class="btns"><button class="pri" data-a="pano" data-id="${p.id}">Открыть и добавить точки</button><button class="del" data-a="deln">Удалить</button></div>`;
  }
  if (sh.t == 'er') {
    const r = R_(sh.id);
    h = head('▭', 'Зал', 'помещение') + `<label>Название</label><input type="text" data-f="name" value="${esc(r.name)}"><div class="btns"><button class="pri" data-a="x">Готово</button><button class="del" data-a="delr">Удалить</button></div>`;
  }
  if (sh.t == 'rt') {
    recalc();
    const r = route, m = r.path ? (r.path.length - 1) * 2 : 0;
    h = head('🧭', 'Маршрут', 'по плану здания') + `<label>Откуда</label><select data-r="from">${opts(r.from)}</select><label>Куда</label><select data-r="to">${opts(r.to)}</select>` + (r.path ? `<div class="stat"><span>${m} м<small>путь</small></span><span>${Math.max(1, Math.round(m / 80))} мин<small>пешком</small></span><span>${r.tour.length}<small>панорам</small></span></div><div class="btns"><button class="pri" data-a="tour">Пройти по панорамам</button></div>` : `<p><small>${r.from == r.to ? 'Выберите разные точки.' : 'Маршрут не найден: проверьте, что коридоры соединены.'}</small></p>`);
  }
  if (sh.t == 'menu') {
    h = head('⚙', 'Карта', 'настройки организатора') + `<label>Название карты</label><input type="text" data-f="name" value="${esc(S.name)}"><label>Подложка: готовый план (картинка)</label><input type="file" accept="image/*" data-up="bg"><label>Данные карты (JSON) — копируйте или вставьте для переноса</label><textarea id="json" style="min-height:90px">${esc(JSON.stringify({ ...S, bg: null, panos: S.panos.map(p => ({ ...p, src: p.src ? '…' : undefined })) }))}</textarea><div class="btns"><button data-a="imp">Применить JSON</button><button data-a="nobg">Убрать подложку</button></div><p><small>Изменения сохраняются автоматически на устройстве.</small></p>`;
  }
  
  if (h) el.innerHTML = h;
}

const cur = () => sh.t == 'ep' ? P(sh.id) : sh.t == 'en' ? N(sh.id) : sh.t == 'er' ? R_(sh.id) : sh.t == 'menu' ? S : null;

$('#sheet').oninput = e => {
  const t = e.target, o = cur();
  if (o && t.dataset.f) {
    o[t.dataset.f] = t.type == 'range' ? +t.value : t.value;
    if (t.type == 'range') t.previousElementSibling.textContent = 'Поворот относительно плана: ' + t.value + '°';
    save();
    plan();
  }
};

$('#sheet').onchange = e => {
  const t = e.target;
  if (t.dataset.r) { route[t.dataset.r] = t.value; sheet(); plan(); return; }
  if (t.dataset.f == 'cat') { sheet(); }
  if (t.dataset.up && t.files[0]) img(t.files[0], t.dataset.up == 'bg' ? 1600 : 2048, src => {
    if (t.dataset.up == 'bg') { S.bg = src; }
    else { const n = N(sh.id); n.src = src; n.demo = null; delete TX[n.id]; }
    save(); plan(); sheet(); toast('Изображение загружено');
  });
};

function img(f, mx, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const i = new Image();
    i.onload = () => {
      const pano = mx == 2048, k = Math.min(1, mx / i.width),
            c = document.createElement('canvas');
      c.width = pano ? 2048 : i.width * k;
      c.height = pano ? 1024 : i.height * k;
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', .82));
    };
    i.src = fr.result;
  };
  fr.readAsDataURL(f);
}

$('#sheet').onclick = e => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  
  if (a == 'x') { sh = null; }
  if (a == 'to') { route = { from: (S.pois.find(p => p.id != sh.id) || {}).id, to: sh.id }; sh = { t: 'rt' }; }
  if (a == 'pano') { openPano(b.dataset.id, undefined); return; }
  if (a == 'tour') { if (!route.tour.length) return toast('Вдоль маршрута нет панорам'); openPano(route.tour[0], route.tour); return; }
  if (a == 'delp') { S.pois = S.pois.filter(p => p.id != sh.id); S.panos.forEach(n => n.hs = n.hs.filter(h => h.poi != sh.id)); sh = null; }
  if (a == 'deln') { S.panos = S.panos.filter(p => p.id != sh.id); sh = null; }
  if (a == 'delr') { S.rooms = S.rooms.filter(r => r.id != sh.id); sh = null; }
  if (a == 'nobg') { S.bg = null; }
  if (a == 'pin') { localStorage.removeItem(PK); unlocked = false; toast('PIN сброшен: задайте новый при следующем входе'); setMode('v'); }
  if (a == 'imp') {
    try {
      const j = JSON.parse($('#json').value);
      j.panos = j.panos.map(p => ({ ...p, src: (N(p.id) || {}).src }));
      S = { ...S, ...j };
      toast('Карта обновлена');
    } catch { toast('Не удалось прочитать JSON'); }
  }
  
  save(); plan(); sheet();
};

$('#chips').onclick = e => {
  const b = e.target.closest('[data-c]');
  if (b) { sh = { t: 'pv', id: b.dataset.c }; plan(); sheet(); }
};

$('#rbtn').onclick = () => {
  route = route || { from: S.pois[0]?.id, to: S.pois[1]?.id };
  sh = { t: 'rt' }; plan(); sheet();
};

$('#tools').onclick = e => {
  const b = e.target.closest('[data-t]');
  if (!b) return;
  tool = b.dataset.t;
  if (tool == 'menu') { sh = { t: 'menu' }; }
  else if (sh && sh.t == 'menu') sh = null;
  tools(); plan(); sheet();
};

/* ---------- доступ ---------- */
async function hash(s) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tk' + s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch { return btoa(s); }
}

function setMode(m) {
  mode = m;
  document.body.classList.toggle('o', m == 'o');
  $('#mv').className = m == 'v' ? 'on' : '';
  $('#mo').className = m == 'o' ? 'on' : '';
  sh = null; route = null; tool = 'sel';
  tools(); plan(); sheet();
}

$('#mv').onclick = () => setMode('v');

$('#mo').onclick = () => {
  if (unlocked) return setMode('o');
  let has = null;
  try { has = localStorage.getItem(PK); } catch {}
  
  const md = $('#modal'), bx = md.firstElementChild;
  md.hidden = false;
  bx.innerHTML = `<h3>${has ? 'Вход для организатора' : 'Задайте PIN организатора'}</h3><p><small>${has ? 'Введите PIN, чтобы редактировать карту.' : 'Минимум 4 символа. Он защитит редактор от посетителей.'}</small></p><input type="password" id="pin" autocomplete="off"><div class="btns"><button class="pri" id="pok">${has ? 'Войти' : 'Сохранить'}</button><button id="pcn">Отмена</button></div>`;
  
  const f = $('#pin');
  f.focus();
  $('#pcn').onclick = () => md.hidden = true;
  
  const go = async () => {
    const v = f.value;
    if (v.length < 4) return toast('PIN короче 4 символов');
    const hh = await hash(v);
    if (!has) { try { localStorage.setItem(PK, hh); } catch {} }
    else if (hh != has) return toast('Неверный PIN');
    unlocked = true; md.hidden = true; setMode('o');
  };
  
  $('#pok').onclick = go;
  f.onkeydown = e => { if (e.key == 'Enter') go(); };
};

/* ---------- панорамы ---------- */
let RN, SC, CAM, MESH, V = null, TX = {}, raf = 0;
const cv = $('#cv');

function gen(name) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  
  let q = g.createLinearGradient(0, 0, 0, 512);
  q.addColorStop(0, '#2a2a2e');
  q.addColorStop(.25, `hsl(${hue},10%,88%)`);
  q.addColorStop(1, `hsl(${hue},12%,74%)`);
  g.fillStyle = q; g.fillRect(0, 0, 2048, 512);
  
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#0000000d' : '#ffffff22';
    g.fillRect(i * 128, 120, 128, 392);
  }
  
  g.fillStyle = '#e2231a'; g.fillRect(0, 400, 2048, 22);
  
  q = g.createLinearGradient(0, 512, 0, 1024);
  q.addColorStop(0, '#a09b95');
  q.addColorStop(1, '#2e2c2a');
  g.fillStyle = q; g.fillRect(0, 512, 2048, 512);
  
  g.strokeStyle = '#ffffff22'; g.lineWidth = 3;
  for (let i = 0; i < 32; i++) {
    g.beginPath(); g.moveTo(i * 64, 512); g.lineTo(i * 64, 1024); g.stroke();
  }
  for (const y of [560, 640, 760, 900]) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(2048, y); g.stroke();
  }
  
  g.fillStyle = '#fff';
  for (let i = 0; i < 16; i++) { g.fillRect(i * 128 + 40, 36, 48, 10); }
  
  g.fillStyle = '#1a1a1a'; g.font = '800 84px Manrope,Arial,sans-serif'; g.textAlign = 'center';
  [1024, 0, 2048, 512, 1536].forEach(x => g.fillText(name, x, 330));
  g.font = '600 36px Manrope,Arial,sans-serif'; g.fillStyle = '#6d6a66';
  g.fillText('панорама не загружена', 1024, 462);
  
  return c;
}

function tex(p) {
  if (TX[p.id]) return TX[p.id];
  const t = p.src ? new THREE.TextureLoader().load(p.src) : new THREE.CanvasTexture(gen(p.demo || p.name));
  t.wrapS = THREE.RepeatWrapping; t.offset.x = -.25;
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return TX[p.id] = t;
}

const vec = (y, p) => {
  const a = y * Math.PI / 180, b = p * Math.PI / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b));
};

function openPano(id, tour) {
  if (typeof THREE == 'undefined') return toast('Не удалось загрузить 3D-библиотеку');
  if (!RN) {
    RN = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    RN.setPixelRatio(Math.min(devicePixelRatio, 2));
    SC = new THREE.Scene();
    CAM = new THREE.PerspectiveCamera(75, 1, .1, 1100);
    const g = new THREE.SphereGeometry(500, 48, 32);
    g.scale(-1, 1, 1);
    MESH = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    SC.add(MESH);
  }
  const p = N(id);
  V = { ...(V || { yaw: 0, pitch: 0, fov: 75 }), id, add: false, tour: tour === undefined ? (V && V.tour) : tour };
  sh = null; sheet();
  $('#pv').hidden = false;
  MESH.material.map = tex(p);
  MESH.material.needsUpdate = true;
  $('#pvn').textContent = p.name;
  $('#pvinfo').style.display = 'none';
  build(); bar();
  if (!raf) loop();
}

function build() {
  const p = N(V.id); V.hs = [];
  p.hs.forEach((s, i) => {
    const o = P(s.poi);
    if (o) V.hs.push({ yaw: s.yaw, pitch: s.pitch, html: `<button class="hs" data-i="${i}"><i>${CATS[o.cat][0]}</i>${esc(o.name)}</button>` });
  });
  S.panos.forEach(q => {
    if (q.id != p.id && Math.hypot(q.x - p.x, q.y - p.y) <= 11) V.hs.push({ yaw: brg(p, q) + p.rot, pitch: -16, html: `<button class="hs go" data-g="${q.id}"><i>↑</i>${esc(q.name)}</button>` });
  });
  $('#hsl').innerHTML = V.hs.map(x => x.html).join('');
  V.els = [...$('#hsl').children];
}

function bar() {
  const t = V.tour, i = t ? t.indexOf(V.id) : -1;
  $('#pvbar').innerHTML = (t && i >= 0 ? `<button data-v="prev" ${i ? '' : 'disabled'}>◀</button><button>${i + 1} / ${t.length}</button><button data-v="next" ${i < t.length - 1 ? '' : 'disabled'}>▶</button>` : '') + (mode == 'o' ? `<button data-v="add" class="${V.add ? 'on' : ''}">＋ Точка на панораме</button>` : '');
}

function loop() {
  raf = requestAnimationFrame(loop);
  if ($('#pv').hidden) { cancelAnimationFrame(raf); raf = 0; return; }
  const w = cv.clientWidth, h = cv.clientHeight;
  if (V.w != w || V.h != h) { V.w = w; V.h = h; RN.setSize(w, h, false); }
  CAM.aspect = w / h; CAM.fov = V.fov; CAM.updateProjectionMatrix();
  const d = vec(V.yaw, V.pitch);
  CAM.lookAt(d); CAM.updateMatrixWorld();
  RN.render(SC, CAM);
  V.hs.forEach((s, i) => {
    const v = vec(s.yaw, s.pitch), el = V.els[i];
    if (v.dot(d) < .2) { el.style.display = 'none'; return; }
    const q = v.multiplyScalar(50).project(CAM);
    el.style.display = 'flex';
    el.style.transform = `translate(${(q.x + 1) / 2 * w}px,${(1 - q.y) / 2 * h}px) translate(-50%,-50%)`;
  });
}

let gd = null;

cv.onpointerdown = e => { gd = { x: e.clientX, y: e.clientY, m: 0 }; cv.setPointerCapture(e.pointerId); };
cv.onpointermove = e => {
  if (!gd) return;
  const dx = e.clientX - gd.x, dy = e.clientY - gd.y;
  gd.m += Math.abs(dx) + Math.abs(dy);
  gd.x = e.clientX; gd.y = e.clientY;
  const k = V.fov / cv.clientHeight;
  V.yaw -= dx * k; V.pitch = Math.max(-85, Math.min(85, V.pitch + dy * k));
};
cv.onpointerup = e => {
  if (gd && gd.m < 6) {
    $('#pvinfo').style.display = 'none';
    if (V.add) {
      const r = cv.getBoundingClientRect(),
            v = new THREE.Vector3((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1), .5).unproject(CAM).normalize();
      V.pend = { yaw: Math.atan2(v.x, -v.z) * 180 / Math.PI, pitch: Math.asin(v.y) * 180 / Math.PI };
      const i = $('#pvinfo');
      i.style.display = 'block';
      i.innerHTML = `<label style="margin-top:0">Какую точку закрепить здесь?</label><select id="hsel">${opts()}</select><div class="btns"><button class="pri" data-v="hok">Закрепить</button></div>`;
    }
  }
  gd = null;
};
cv.onwheel = e => { V.fov = Math.max(40, Math.min(100, V.fov + e.deltaY * .05)); };

$('#pv').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset, t = V.tour, i = t ? t.indexOf(V.id) : -1, inf = $('#pvinfo');
  
  if (d.v == 'close') { $('#pv').hidden = true; V = null; return; }
  if (d.v == 'prev' && i > 0) openPano(t[i - 1]);
  if (d.v == 'next' && i < t.length - 1) openPano(t[i + 1]);
  if (d.v == 'add') {
    V.add = !V.add; bar();
    inf.style.display = 'block';
    inf.innerHTML = V.add ? '<small>Коснитесь панорамы там, где нужно разместить точку.</small>' : '';
    if (!V.add) inf.style.display = 'none';
  }
  if (d.v == 'hok') {
    N(V.id).hs.push({ poi: $('#hsel').value, ...V.pend });
    V.add = false; save(); build(); bar(); inf.style.display = 'none';
  }
  if (d.g) { V.tour = t && t.includes(d.g) ? t : null; openPano(d.g); }
  if (d.i !== undefined) {
    const s = N(V.id).hs[+d.i], o = P(s.poi);
    inf.style.display = 'block';
    inf.innerHTML = `<h3>${CATS[o.cat][0]} ${esc(o.name)}</h3><p style="margin:6px 0 0">${esc(o.desc)}</p>` + (mode == 'o' ? `<div class="btns"><button class="del" data-v="dh" data-i="${d.i}">Убрать с панорамы</button></div>` : '');
  }
  if (d.v == 'dh') {
    N(V.id).hs.splice(+d.i, 1);
    save(); build(); inf.style.display = 'none';
  }
};

/* ---------- вход в карту (вызывается из app.js) ---------- */
window.Core = {
  open(d, r) {
    S = d; TX = {}; route = null; sh = null;
    if (V) { $('#pv').hidden = true; V = null; }
    unlocked = r != 'view';
    setMode('v');
    $('.seg').style.display = unlocked ? '' : 'none';
  }
};

/* ---------- панорама на телефоне: щипок для зума ---------- */
const pts = new Map();
cv.addEventListener('pointerdown', e => { pts.set(e.pointerId, e); if (pts.size == 2) gd = null; });
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const two = pts.size == 2, [a, b] = [...pts.values()],
        before = two ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0;
  pts.set(e.pointerId, e);
  if (two && V) {
    const [c, d] = [...pts.values()];
    V.fov = Math.max(40, Math.min(100, V.fov * before / Math.max(1, Math.hypot(c.clientX - d.clientX, c.clientY - d.clientY))));
  }
});
cv.addEventListener('pointerup', e => pts.delete(e.pointerId));
cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); gd = null; });
