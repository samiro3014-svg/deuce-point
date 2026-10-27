'use strict';
/* =====================================================================
   Deuce Point v10 · Experiencia del asesorado
   Contador en el ícono, registro sin conexión, logros clínicos, notas del día,
   fotos y audios en el chat, calendario mensual, metas semanales y tutoriales.
   ===================================================================== */

/* ---------- 28. Registro sin conexión (solo con la base de datos real) ---------- */
const OFF_TABLES = ['food_logs', 'daily_logs', 'wellness', 'workouts', 'workout_sets', 'body_logs', 'supplement_logs', 'tennis_sessions', 'cycle_logs', 'messages', 'checkins'];
const Offline = {
  q() { try { return JSON.parse(localStorage.getItem('dp_offq') || '[]'); } catch (e) { return []; } },
  save(q) { try { localStorage.setItem('dp_offq', JSON.stringify(q)); } catch (e) { } Offline.badge(); },
  mem: null,
  cache() { if (!Offline.mem) { try { Offline.mem = JSON.parse(localStorage.getItem('dp_offc') || '{}'); } catch (e) { Offline.mem = {}; } } return Offline.mem; },
  put(k, rows) {
    if (rows.length > 400) return; const c = Offline.cache(); c[k] = { t: Date.now(), r: rows };
    const keys = Object.keys(c); if (keys.length > 150) keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - 150).forEach(x => delete c[x]);
    clearTimeout(Offline.st); Offline.st = setTimeout(() => { try { localStorage.setItem('dp_offc', JSON.stringify(c)); } catch (e) { try { Object.keys(c).sort((a, b) => c[a].t - c[b].t).slice(0, 60).forEach(x => delete c[x]); localStorage.setItem('dp_offc', JSON.stringify(c)); } catch (x) { } } }, 400);
  },
  get(k) { const x = Offline.cache()[k]; return x ? x.r.map(r => Object.assign({}, r)) : null; },
  isNet: e => /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(String(e && (e.message || e))) || navigator.onLine === false,
  apply(table, o, rows) {
    const q = Offline.q().filter(x => x.table === table); if (!q.length) return rows;
    let out = rows.slice();
    for (const op of q) {
      if (op.op === 'insert') op.rows.filter(r => matchRow(r, o || {}) && !out.some(x => x.id === r.id)).forEach(r => out.push(Object.assign({}, r)));
      if (op.op === 'update') out.forEach(r => { if (r[op.key] === op.id) Object.assign(r, op.patch); });
      if (op.op === 'remove') out = out.filter(r => r[op.key] !== op.id);
    }
    if (o && o.order) { const k = o.order, dir = o.asc === false ? -1 : 1; out.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); }
    return o && o.limit ? out.slice(0, o.limit) : out;
  },
  badge() {
    const n = Offline.q().length; let b = document.getElementById('off-b');
    if (!n && navigator.onLine !== false) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'off-b'; b.className = 'off-b'; document.body.appendChild(b); }
    b.textContent = navigator.onLine === false ? `Sin conexión${n ? ` · ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar` : ': los registros se guardan en el celular'}` : `Enviando ${n} ${n === 1 ? 'registro guardado' : 'registros guardados'} sin conexión…`;
  },
  async flush() {
    if (Offline.busy || navigator.onLine === false) return; const q = Offline.q(); if (!q.length) return Offline.badge();
    Offline.busy = true; let done = 0;
    try {
      for (const op of q) {
        try {
          if (op.op === 'insert') await Offline.orig.insert(op.table, op.rows);
          else if (op.op === 'update') await Offline.orig.update(op.table, op.id, op.patch, op.key);
          else await Offline.orig.remove(op.table, op.id, op.key);
        } catch (e) { if (Offline.isNet(e)) break; if (!(e && e.code === '23505')) console.warn('No se pudo enviar un registro guardado sin conexión', op, e); }
        done++;
      }
    } finally { Offline.save(Offline.q().slice(done)); Offline.busy = false; }
    if (done) toast(`${done} ${done === 1 ? 'registro enviado' : 'registros enviados'}`);
  },
  install() {
    if (DEMO || Offline.orig) return;
    Offline.orig = { select: DB.select, insert: DB.insert, update: DB.update, remove: DB.remove };
    const queue = op => { const q = Offline.q(); q.push(op); Offline.save(q); };
    DB.select = async (table, o = {}) => {
      const k = table + JSON.stringify(o);
      if (navigator.onLine === false) { const c = Offline.get(k); if (c) return Offline.apply(table, o, c); }
      try { const r = await Offline.orig.select(table, o); Offline.put(k, r); return Offline.apply(table, o, r); }
      catch (e) { if (Offline.isNet(e)) { const c = Offline.get(k); if (c) return Offline.apply(table, o, c); } throw e; }
    };
    DB.insert = async (table, rows) => {
      if (!OFF_TABLES.includes(table)) return Offline.orig.insert(table, rows);
      const arr = (Array.isArray(rows) ? rows : [rows]).map(r => Object.assign({ id: uid(), created_at: new Date().toISOString() }, r));
      if (navigator.onLine === false) { queue({ op: 'insert', table, rows: arr }); return arr.map(r => Object.assign({}, r)); }
      try { return await Offline.orig.insert(table, arr); } catch (e) { if (!Offline.isNet(e)) throw e; queue({ op: 'insert', table, rows: arr }); return arr.map(r => Object.assign({}, r)); }
    };
    DB.update = async (table, id, patch, key = 'id') => {
      if (!OFF_TABLES.includes(table)) return Offline.orig.update(table, id, patch, key);
      if (navigator.onLine === false) { queue({ op: 'update', table, id, patch, key }); return Object.assign({ [key]: id }, patch); }
      try { return await Offline.orig.update(table, id, patch, key); } catch (e) { if (!Offline.isNet(e)) throw e; queue({ op: 'update', table, id, patch, key }); return Object.assign({ [key]: id }, patch); }
    };
    DB.remove = async (table, id, key = 'id') => {
      if (!OFF_TABLES.includes(table)) return Offline.orig.remove(table, id, key);
      if (navigator.onLine === false) return queue({ op: 'remove', table, id, key });
      try { return await Offline.orig.remove(table, id, key); } catch (e) { if (!Offline.isNet(e)) throw e; queue({ op: 'remove', table, id, key }); }
    };
    window.addEventListener('online', () => { Offline.badge(); Offline.flush(); });
    window.addEventListener('offline', () => Offline.badge());
    setInterval(() => Offline.flush(), 30000);
    setTimeout(() => { Offline.badge(); Offline.flush(); }, 1500);
  }
};
Offline.install();

/* ---------- 26. Contador de pendientes en el ícono de la app ---------- */
function setBadge(n) { try { if (!('setAppBadge' in navigator)) return; if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge(); } catch (e) { } }
async function badgeHook(c) {
  if (!c.own || !c.isToday || !c.meals) return '';
  const now = nowMin(); const due = c.meals.filter(m => m.pending > 0 && !m.logs.length && (hm2min(m.m.time_label) ?? 0) <= now).length;
  setBadge(due); return '';
}

/* ---------- 29. Logros clínicos ---------- */
const CLIN_ACH = [
  ['sleep28', 'Sueño de 7 horas', '28 días con 7 horas o más de sueño registradas.', a => a.sleep7 >= 28],
  ['prot14', 'Proteína al día', '14 días con el 90 % o más de la proteína del plan.', a => a.prot >= 14],
  ['fib14', 'Fibra suficiente', '14 días con la fibra recomendada (14 g por 1.000 kcal).', a => a.fib >= 14],
  ['green14', 'Bienestar verde', '14 días con bienestar en verde.', a => a.green >= 14],
  ['steps10', '8.000 pasos', '10 días con 8.000 pasos o más.', a => a.steps >= 10],
  ['goal1', 'Primera meta semanal', 'Cumpliste una meta de la semana aprobada por tu entrenador.', a => a.goals >= 1],
  ['goal4', '4 metas semanales', 'Cumpliste 4 metas semanales.', a => a.goals >= 4]];
if (typeof ACHIEVEMENTS !== 'undefined') ACHIEVEMENTS.push(...CLIN_ACH);
async function clinicalData(cid) {
  const since = addDays(todayStr(), -400);
  const [wells, logs, dailies, plan, goals] = await Promise.all([S.needsV6 ? [] : DB.select('wellness', { eq: { client_id: cid }, gte: { log_date: since } }).catch(() => []), DB.select('food_logs', { eq: { client_id: cid }, gte: { log_date: since } }), DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: since } }), activePlanFor(cid), S.needsV10 ? [] : DB.select('weekly_goals', { eq: { client_id: cid } }).catch(() => [])]);
  const byDay = {}; logs.forEach(l => { (byDay[l.log_date] = byDay[l.log_date] || []).push(l); });
  let prot = 0, fib = 0;
  Object.entries(byDay).forEach(([d, ls]) => {
    const p = plan ? planForDate(plan, d) : null; const t = targetsOf(p);
    const tot = ls.reduce((a, l) => addM(a, logM(l)), ZERO()); if (t && t.protein && tot.protein >= t.protein * 0.9) prot++;
    const m = typeof microTotals === 'function' ? microTotals(ls) : null; if (m && t && t.kcal && m.fiber >= t.kcal / 1000 * 14) fib++;
  });
  return { sleep7: wells.filter(w => num(w.sleep_h) >= 7).length, green: wells.filter(w => wellnessLight(w).cls === 'ok').length, prot, fib, steps: dailies.filter(x => num(x.steps) >= 8000).length, goals: goals.filter(g => g.done && g.status !== 'rechazada').length };
}
if (typeof achievementData === 'function') { const _ach = achievementData; achievementData = async cid => Object.assign(await _ach(cid), await clinicalData(cid).catch(() => ({}))); }

/* ---------- 30. Notas del día ---------- */
const MOODS = [['5', 'Muy bien'], ['4', 'Bien'], ['3', 'Normal'], ['2', 'Regular'], ['1', 'Mal']];
function notesCardHtml(c) {
  const n = c.choices.__note || {};
  if (!c.own) return n.t || n.m ? `<div class="card"><h3>Notas del asesorado</h3>${n.m ? `<p class="small">Cómo se sintió: <b>${esc((MOODS.find(x => x[0] === String(n.m)) || [])[1] || '')}</b></p>` : ''}${n.t ? `<p class="pre">${esc(n.t)}</p>` : ''}</div>` : '';
  return `<details class="card notes-d"${n.t ? ' open' : ''}><summary><b>Notas del día</b> <small class="muted">${n.t || n.m ? 'guardadas' : 'sensaciones, hambre, energía, digestión'}</small></summary>
    <div class="chips">${MOODS.map(([k, l]) => `<button class="chip${String(n.m) === k ? ' on' : ''}" data-act="ntM" data-v="${k}">${l}</button>`).join('')}</div>
    <textarea class="input" rows="3" id="nt-t" placeholder="Cómo te sentiste hoy: energía, hambre, digestión, sueño, estrés…">${esc(n.t || '')}</textarea>
    <button class="btn sm primary" data-act="ntSave">Guardar nota</button><p class="small muted">Tu entrenador ve estas notas en tu seguimiento.</p></details>`;
}
const notesHandlers = c => ({
  ntM: async el => { await setChoice(c.cid, c.date, ch => { ch.__note = Object.assign({}, ch.__note || {}, { m: +el.dataset.v }); }); el.parentNode.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === el)); toast('Guardado'); },
  ntSave: async () => { const t = ($('#nt-t') || {}).value || ''; await setChoice(c.cid, c.date, ch => { ch.__note = Object.assign({}, ch.__note || {}, { t: t.trim().slice(0, 1500) }); }); toast('Nota guardada'); }
});
async function clientNotesTab(cid) {
  const [ds, gs] = await Promise.all([DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: addDays(todayStr(), -60) }, order: 'log_date', asc: false }), S.needsV10 ? [] : DB.select('weekly_goals', { eq: { client_id: cid }, order: 'week_start', asc: false, limit: 20 }).catch(() => [])]);
  const ns = ds.filter(d => d.choices && d.choices.__note && (d.choices.__note.t || d.choices.__note.m));
  const moods = Array.from({ length: 28 }, (_, i) => addDays(todayStr(), -27 + i)).map(d => { const x = ds.find(y => y.log_date === d); return { d, v: num(x && x.choices && x.choices.__note && x.choices.__note.m) }; });
  return {
    html: `${moods.some(x => x.v) ? `<div class="card"><h3>Cómo se sintió (1–5, 28 días)</h3>${vbars(moods.map((x, i) => ({ label: fmtDM(parseDay(x.d)), value: x.v, text: x.v || '', hi: i === 27 })))}</div>` : ''}
      ${ns.length ? ns.map(d => { const n = d.choices.__note; return `<div class="card"><b>${esc(fmtDayLong(d.log_date))}</b>${n.m ? ` <span class="tag">${esc((MOODS.find(x => x[0] === String(n.m)) || [])[1] || '')}</span>` : ''}${n.t ? `<p class="pre small">${esc(n.t)}</p>` : ''}</div>`; }).join('') : '<div class="card empty"><p>El asesorado no ha escrito notas del día en los últimos 60 días.</p></div>'}
      ${gs.length ? '<h2 class="sec">Metas semanales</h2>' + gs.map(g => `<div class="card"><div class="day-h"><b>${esc(g.body)}</b><span class="badge ${g.status === 'aprobada' || g.status === 'ajustada' ? 'ok' : g.status === 'rechazada' ? '' : 'warnb'}">${esc(g.status)}</span></div><small class="muted">Semana del ${esc(fmtDM(parseDay(g.week_start)))}${g.done === true ? ' · cumplida' : g.done === false ? ' · no cumplida' : ''}</small>${g.coach_note ? `<p class="small">${esc(g.coach_note)}</p>` : ''}</div>`).join('') : ''}`
  };
}

/* ---------- 31. Fotos y audios en el chat ---------- */
const CHAT_BUCKET = 'chat-media';
const chatMediaBtnsHtml = () => `<div class="row-btns chat-mb"><button class="btn sm" data-act="chImg">Foto</button><button class="btn sm" data-act="chAud" id="ch-aud">Audio</button><input type="file" accept="image/*" id="ch-img" hidden></div>`;
async function chatUpload(cid, blob, ext) {
  const path = `${cid}/${uid()}.${ext}`;
  if (DEMO) await demoFiles.put('chat/' + path, await blob.arrayBuffer());
  else { const { error } = await sb.storage.from(CHAT_BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream' }); if (error) throw error; }
  return path;
}
async function chatMediaUrl(path, type) {
  if (DEMO) { const v = await demoFiles.get('chat/' + path); return v ? URL.createObjectURL(new Blob([v], { type: type === 'audio' ? 'audio/webm' : 'image/jpeg' })) : ''; }
  const { data, error } = await sb.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600); if (error) throw error; return data.signedUrl;
}
S.chatUrls = {};
async function loadChatMedia(root) {
  for (const el of root.querySelectorAll('.msg-media[data-mp]')) {
    const p = el.dataset.mp, t = el.dataset.mt;
    try { const u = S.chatUrls[p] || (S.chatUrls[p] = await chatMediaUrl(p, t)); el.innerHTML = !u ? '<small class="muted">Archivo no disponible</small>' : t === 'audio' ? `<audio src="${esc(u)}" controls preload="metadata"></audio>` : `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Foto"></a>`; el.removeAttribute('data-mp'); }
    catch (e) { el.innerHTML = '<small class="muted">No se pudo cargar el archivo</small>'; }
  }
}
function chatMediaHandlers(cid, refresh) {
  const send = async (blob, ext, type) => { const path = await chatUpload(cid, blob, ext); const cap = (($('#msg-t') || {}).value || '').trim(); await DB.insert('messages', { client_id: cid, sender_id: S.profile.id, body: cap || (type === 'audio' ? '[Audio]' : '[Foto]'), media_path: path, media_type: type }); if ($('#msg-t')) $('#msg-t').value = ''; await refresh(); };
  return {
    chImg: () => { const inp = $('#ch-img'); if (!inp) return; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { toast('Enviando foto…'); const b = await resizeImage(f, 1280); await send(b, 'jpg', 'foto'); } catch (e) { toast(errMsg(e), 'error'); } inp.value = ''; }; inp.click(); },
    chAud: async el => {
      if (S.rec) { S.rec.stop(); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Este navegador no permite grabar audio', 'error');
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mt = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(x => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) || '';
        const rec = new MediaRecorder(st, mt ? { mimeType: mt } : {}); const parts = []; S.rec = rec;
        rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
        rec.onstop = async () => { st.getTracks().forEach(t => t.stop()); clearTimeout(S.recT); S.rec = null; el.textContent = 'Audio'; el.classList.remove('primary'); const b = new Blob(parts, { type: rec.mimeType || 'audio/webm' }); if (b.size < 800) return toast('Audio muy corto', 'error'); try { await send(b, /mp4/.test(b.type) ? 'm4a' : /ogg/.test(b.type) ? 'ogg' : 'webm', 'audio'); } catch (e) { toast(errMsg(e), 'error'); } };
        rec.start(); el.textContent = 'Detener y enviar'; el.classList.add('primary'); S.recT = setTimeout(() => { if (S.rec) S.rec.stop(); }, 120000); toast('Grabando (máximo 2 minutos)');
      } catch (e) { toast('No se pudo usar el micrófono: ' + errMsg(e), 'error'); }
    }
  };
}

/* ---------- 32. Calendario mensual ---------- */
async function calendarHtml(cid, ym, base) {
  const now = new Date(); const [y, m] = ym ? ym.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = `${y}-${pad2(m)}-01`; const nDays = new Date(y, m, 0).getDate(); const last = `${y}-${pad2(m)}-${pad2(nDays)}`;
  const [logs, dailies, ws, ts, plan] = await Promise.all([DB.select('food_logs', { eq: { client_id: cid }, gte: { log_date: first } }), DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: first } }), DB.select('workouts', { eq: { client_id: cid }, gte: { started_at: parseDay(first).toISOString() } }), S.needsV6 ? [] : DB.select('tennis_sessions', { eq: { client_id: cid }, gte: { log_date: first } }).catch(() => []), activePlanFor(cid)]);
  const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1); const ymOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  const off = (new Date(y, m - 1, 1).getDay() + 6) % 7; let cells = '';
  for (let i = 0; i < off; i++) cells += '<span class="cal-d x"></span>';
  let sum = 0, cnt = 0;
  for (let d = 1; d <= nDays; d++) {
    const ds = `${y}-${pad2(m)}-${pad2(d)}`; const dl = logs.filter(l => l.log_date === ds); const dd = dailies.find(x => x.log_date === ds);
    const comp = dl.length ? dayCompletion(plan, dl, dd, ds) : null; if (comp != null) { sum += comp; cnt++; }
    const cls = ds > todayStr() ? 'fut' : comp == null ? (dl.length ? 'c1' : 'c0') : comp >= 80 ? 'c3' : comp >= 50 ? 'c2' : 'c1';
    const wk = ws.some(w => dateStr(new Date(w.started_at)) === ds); const tn = ts.some(t => t.log_date === ds);
    cells += `<a class="cal-d ${cls}${ds === todayStr() ? ' today' : ''}" href="${base}${ds}"><b>${d}</b>${comp != null ? `<small>${comp}%</small>` : ''}<i>${wk ? '<span class="dot w"></span>' : ''}${tn ? '<span class="dot t"></span>' : ''}</i></a>`;
  }
  return `<div class="datebar"><a class="icon-btn" href="${location.hash.replace(/\/\d{4}-\d{2}$/, '')}/${ymOf(prev)}" aria-label="Mes anterior">‹</a><b>${esc(new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }))}</b><a class="icon-btn" href="${location.hash.replace(/\/\d{4}-\d{2}$/, '')}/${ymOf(next)}" aria-label="Mes siguiente">›</a></div>
    <div class="cal"><div class="cal-h">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-g">${cells}</div></div>
    <div class="cal-leg small"><span class="cal-d c3"></span> 80 % o más <span class="cal-d c2"></span> 50–79 % <span class="cal-d c1"></span> menos de 50 % <span class="cal-d c0"></span> sin registro · <span class="dot w"></span> entrenamiento <span class="dot t"></span> tenis</div>
    <div class="stats3"><div><b>${cnt ? Math.round(sum / cnt) + ' %' : '—'}</b><small>Cumplimiento promedio</small></div><div><b>${cnt}</b><small>Días con registro</small></div><div><b>${new Set(ws.map(w => dateStr(new Date(w.started_at))).filter(d => d <= last)).size}</b><small>Días con entrenamiento</small></div></div>
    <p class="small muted">Porcentaje de alimentos del plan marcados como consumidos. Toca un día para ver el detalle.</p>`;
}
async function vCalendario(ym) { paint(progSeg('calendario') + await calendarHtml(S.profile.id, ym, '#/hoy/'), {}, 'Progreso'); }
async function coachCalendarTab(cid, ym) { return { html: await calendarHtml(cid, ym, `#/diario/${cid}/`) }; }

/* ---------- 33. Metas semanales propuestas por el asesorado ---------- */
const weekStartStr = d => dateStr(startOfWeek(parseDay(d || todayStr())));
async function weeklyGoalCardHtml(c) {
  if (!c.own || !c.isToday || S.needsV10) return '';
  const ws = weekStartStr(); const g = (await DB.select('weekly_goals', { eq: { client_id: c.cid, week_start: ws } }).catch(() => []))[0];
  const dow = (parseDay(todayStr()).getDay() + 6) % 7;
  if (!g) return `<div class="card wgoal"><b>Meta de la semana</b><small class="muted">Propón una meta concreta y medible; tu entrenador la aprueba o la ajusta.</small><div class="vid-in"><input class="input" id="wg-t" maxlength="300" placeholder="Ej.: Registrar todas las comidas de lunes a viernes"><button class="btn sm primary" data-act="wgAdd">Proponer</button></div></div>`;
  const st = { propuesta: 'Pendiente de revisión', aprobada: 'Aprobada', ajustada: 'Ajustada por tu entrenador', rechazada: 'No aprobada' }[g.status];
  return `<div class="card wgoal"><div class="day-h"><b>Meta de la semana</b><span class="badge ${g.status === 'aprobada' || g.status === 'ajustada' ? 'ok' : g.status === 'rechazada' ? '' : 'warnb'}">${esc(st)}</span></div><p>${esc(g.body)}</p>${g.coach_note ? `<p class="small"><b>Entrenador:</b> ${esc(g.coach_note)}</p>` : ''}
    ${(g.status === 'aprobada' || g.status === 'ajustada') && dow >= 4 ? (g.done == null ? `<div class="row-btns"><span class="small">¿La cumpliste?</span><button class="btn sm primary" data-act="wgDone" data-id="${g.id}" data-v="1">Sí</button><button class="btn sm" data-act="wgDone" data-id="${g.id}" data-v="0">No</button></div>` : `<p class="small muted">${g.done ? 'Cumplida' : 'No cumplida'}.</p>`) : ''}
    ${g.status === 'propuesta' ? `<button class="linkbtn" data-act="wgDel" data-id="${g.id}">Retirar</button>` : ''}</div>`;
}
const weeklyGoalHandlers = c => ({
  wgAdd: async () => { const t = (($('#wg-t') || {}).value || '').trim(); if (t.length < 3) return toast('Escribe la meta', 'error'); await DB.insert('weekly_goals', { client_id: c.cid, week_start: weekStartStr(), body: t, status: 'propuesta' }); toast('Meta enviada a tu entrenador'); c.rerender(); },
  wgDone: async el => { await DB.update('weekly_goals', el.dataset.id, { done: el.dataset.v === '1' }); toast(el.dataset.v === '1' ? 'Meta cumplida' : 'Registrado'); c.rerender(); },
  wgDel: async el => { await DB.remove('weekly_goals', el.dataset.id); c.rerender(); }
});
async function inboxGoalRows(byId) {
  if (S.needsV10) return [];
  const gs = (await DB.select('weekly_goals', { eq: { status: 'propuesta' } }).catch(() => [])).filter(g => byId[g.client_id]);
  return gs.map(g => `<div class="ib-row"><span class="ib-tag c">Meta</span><a class="ib-n" href="#/asesorado/${g.client_id}/notas-dia">${esc(byId[g.client_id].full_name || '')}</a><span class="ib-m">«${esc(g.body.length > 60 ? g.body.slice(0, 58) + '…' : g.body)}» <button class="chip" data-act="wgOk" data-id="${g.id}">Aprobar</button><button class="chip" data-act="wgAdj" data-id="${g.id}">Ajustar</button><button class="chip" data-act="wgNo" data-id="${g.id}">No aprobar</button></span></div>`);
}
const goalReviewHandlers = () => ({
  wgOk: async el => { await DB.update('weekly_goals', el.dataset.id, { status: 'aprobada', reviewed_at: new Date().toISOString() }); toast('Meta aprobada'); route(); },
  wgAdj: async el => { const n = prompt('Ajuste o indicación para el asesorado:'); if (!n) return; await DB.update('weekly_goals', el.dataset.id, { status: 'ajustada', coach_note: n.trim(), reviewed_at: new Date().toISOString() }); toast('Meta ajustada'); route(); },
  wgNo: async el => { const n = prompt('Motivo (opcional):') ; if (n === null) return; await DB.update('weekly_goals', el.dataset.id, { status: 'rechazada', coach_note: n.trim() || null, reviewed_at: new Date().toISOString() }); route(); }
});

/* ---------- 34. Tutoriales de la app ---------- */
const APP_GUIDE = [
  ['Hoy', 'Tipo de día y metas arriba; marca cada alimento con ✓, usa ⇄ para reemplazar y «Más» para copiar, repetir, guardar o ajustar la porción. «Mano» y «Casera» cambian los gramos por medidas.'],
  ['Registro rápido', '«Repetir el día de ayer», «Evento social», «+ Actividad», «Alcohol» y «No pude seguir el plan» están en Acciones rápidas, al final de Hoy.'],
  ['Entreno', 'Inicia el día de la rutina, registra kilos, repeticiones y RIR de cada serie. «Alternativas» cambia el ejercicio si la máquina está ocupada y «Entrenar en casa» adapta la sesión al equipo que tengas.'],
  ['Progreso', 'Entrenamiento, ejercicios, rendimiento, cuerpo, nutrición, calendario, logros y fotos.'],
  ['Mi plan', 'Informe de tu entrenador, metas, hábitos y preguntas pendientes.'],
  ['Sin conexión', 'Si pierdes la señal, los registros se guardan en el celular y se envían al recuperar la conexión. Debes haber abierto la app con internet al menos una vez ese día.']];
function vTutoriales() {
  const vids = String(S.settings.tutorials || '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x.length >= 2 && /^https?:\/\//.test(x[1]));
  paint(`<a class="linkbtn" href="#/perfil">← Perfil</a>
    ${vids.map(([t, u]) => `<div class="card"><h3>${esc(t)}</h3>${typeof videoEmbed === 'function' && videoEmbed(u) ? videoEmbed(u) : `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">Ver video</a>`}</div>`).join('')}
    <div class="card"><h3>Guía rápida</h3>${APP_GUIDE.map(([t, d]) => `<p class="small"><b>${esc(t)}:</b> ${esc(d)}</p>`).join('')}</div>
    <button class="btn block" data-act="tourAgain">Ver de nuevo el recorrido de Hoy</button>`, { click: { tourAgain: () => { Object.keys(localStorage).filter(k => k.startsWith('dp_tour_')).forEach(k => localStorage.removeItem(k)); location.hash = '#/hoy'; } } }, 'Tutoriales');
}

/* ---------- Registro ---------- */
HOOKS.hoy.push(
  { pos: 'afterWater', html: weeklyGoalCardHtml, click: weeklyGoalHandlers },
  { pos: 'afterMeals', html: async c => c.nut || c.own ? notesCardHtml(c) : '', click: notesHandlers },
  { pos: 'tail', html: badgeHook });
HOOKS.routes.calendario = vCalendario; HOOKS.routes.tutoriales = vTutoriales;
Object.assign(HOOKS.nav, { calendario: 'historial', tutoriales: 'perfil' });
HOOKS.progreso.push({ key: 'calendario', label: 'Calendario' });
HOOKS.perfilClient.push({ href: '#/tutoriales', title: 'Tutoriales de la app', sub: 'Videos y guía rápida de cada sección' });
HOOKS.fichaTabs.push({ group: 'Seguimiento', key: 'calendario', label: 'Calendario', fn: coachCalendarTab }, { group: 'Seguimiento', key: 'notas-dia', label: 'Notas y metas', fn: clientNotesTab });
HOOKS.inbox.push(inboxGoalRows); HOOKS.inboxClick.push({ click: goalReviewHandlers });
HOOKS.ajustes.push({ html: async () => `<div class="card"><h3>Tutoriales en video</h3><label class="field"><span>Uno por línea: Título | enlace de YouTube o Vimeo</span><textarea class="input" rows="3" data-s="tutorials" placeholder="Cómo registrar tus comidas | https://youtu.be/…">${esc(S.settings.tutorials || '')}</textarea></label><p class="small muted">Aparecen en Perfil › Tutoriales de la app, junto con la guía rápida.</p></div>` });
