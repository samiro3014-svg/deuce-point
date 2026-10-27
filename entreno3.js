'use strict';
/* =====================================================================
   Deuce Point v10 · Entrenamiento
   Bloques de periodización, fuerza por mes, VFC, calentamiento de tenis,
   saques y golpes, monotonía y tensión de la carga, movilidad guiada,
   videos propios de ejercicios, rutina en casa y progresión por RIR (auto.js).
   ===================================================================== */

/* ---------- 16. Bloques de periodización ---------- */
const BLOCK_FOCUS = ['Adaptación anatómica', 'Hipertrofia', 'Fuerza máxima', 'Potencia', 'Fuerza-resistencia', 'Descarga', 'Precompetitivo', 'Competencia', 'Transición'];
const weeksOf = b => Math.max(1, Math.round((daysBetween(b.start_date, b.end_date) + 1) / 7));
function blocksTimelineHtml(bs, routines) {
  if (!bs.length) return '';
  const t0 = bs[0].start_date, t1 = bs.reduce((a, b) => b.end_date > a ? b.end_date : a, bs[0].end_date); const span = Math.max(1, daysBetween(t0, t1) + 1); const today = todayStr();
  const nowPct = today >= t0 && today <= t1 ? daysBetween(t0, today) / span * 100 : null;
  return `<div class="card"><h3>Línea de tiempo</h3><div class="blk-tl">${nowPct != null ? `<span class="blk-now" style="left:calc(104px + (100% - 156px) * ${(nowPct / 100).toFixed(3)})"></span>` : ''}${bs.map(b => `<div class="blk-row"><span class="blk-l">${esc(b.name)}</span><div class="blk-t"><div class="blk-b${today >= b.start_date && today <= b.end_date ? ' on' : ''}" style="margin-left:${(daysBetween(t0, b.start_date) / span * 100).toFixed(1)}%;width:${Math.max(3, (daysBetween(b.start_date, b.end_date) + 1) / span * 100).toFixed(1)}%"></div></div><span class="blk-w">${weeksOf(b)} sem</span></div>`).join('')}</div>
    <p class="small muted">${esc(fmtDM(parseDay(t0)))} a ${esc(fmtDM(parseDay(t1)))}. La línea vertical marca hoy.</p></div>`;
}
async function blocksTab(cid) {
  if (S.needsV10) return { html: '<div class="card empty"><p>Ejecuta la migración v10 para activar los bloques de periodización.</p></div>' };
  const [bs, routines] = await Promise.all([DB.select('training_blocks', { eq: { client_id: cid }, order: 'start_date' }), DB.select('routines', { eq: { client_id: cid }, order: 'created_at', asc: false })]);
  const rn = id => (routines.find(r => r.id === id) || {}).name || '';
  const last = bs[bs.length - 1]; const s0 = last ? addDays(last.end_date, 1) : todayStr();
  const html = `${blocksTimelineHtml(bs, routines)}
    ${bs.map(b => `<div class="card"><div class="day-h"><div><b>${esc(b.name)}</b><small class="muted">${esc(b.focus || '')} · ${esc(fmtDM(parseDay(b.start_date)))} a ${esc(fmtDM(parseDay(b.end_date)))} · ${weeksOf(b)} semanas${b.routine_id ? ' · rutina: ' + esc(rn(b.routine_id)) : ''}</small></div>${todayStr() >= b.start_date && todayStr() <= b.end_date ? '<span class="badge ok">En curso</span>' : b.end_date < todayStr() ? '<span class="badge">Terminado</span>' : '<span class="badge warnb">Próximo</span>'}</div>
      ${b.notes ? `<p class="small pre">${esc(b.notes)}</p>` : ''}${b.activated_at ? `<p class="small muted">Rutina activada el ${esc(fmtDateShort(b.activated_at))}.</p>` : ''}
      <div class="row-btns">${b.routine_id ? `<button class="btn sm" data-act="blkAct" data-id="${b.id}">Activar su rutina ahora</button>` : ''}<button class="btn sm danger-outline" data-act="blkDel" data-id="${b.id}">Eliminar</button></div></div>`).join('')}
    <div class="card"><h3>Nuevo bloque</h3><label class="field"><span>Nombre</span><input class="input" id="bk-n" placeholder="Bloque ${bs.length + 1}"></label>
      <label class="field"><span>Enfoque</span><select class="input" id="bk-f">${BLOCK_FOCUS.map(f => `<option>${esc(f)}</option>`).join('')}</select></label>
      <label class="field"><span>Rutina del bloque</span><select class="input" id="bk-r"><option value="">Sin rutina asociada</option>${routines.map(r => `<option value="${r.id}">${esc(r.name)}${r.active ? ' (activa)' : ''}</option>`).join('')}</select></label>
      <div class="rex-grid"><label><span>Inicio</span><input class="input" type="date" id="bk-s" value="${s0}"></label><label><span>Semanas</span><input class="input" type="number" min="1" max="26" id="bk-w" value="4"></label></div>
      <label class="field"><span>Fin</span><input class="input" type="date" id="bk-e" value="${addDays(s0, 27)}"></label>
      <label class="field"><span>Indicaciones (opcional)</span><textarea class="input" rows="2" id="bk-o" placeholder="Rangos de repeticiones, RIR, volumen semanal…"></textarea></label>
      <button class="btn primary block" data-act="blkAdd">Guardar bloque</button>
      <p class="small muted">Cuando llega la fecha de inicio de un bloque con rutina asociada, aparece en Pendientes para activarla con un toque. Con «Avance automático» (Ajustes › Bloques) la rutina se activa sola al abrir la app. El asesorado ve el bloque y la semana en curso en Entreno.</p></div>`;
  return {
    html,
    change: t => { if (t.id === 'bk-w' || t.id === 'bk-s') { const s = $('#bk-s').value; if (s) $('#bk-e').value = addDays(s, Math.max(1, num($('#bk-w').value)) * 7 - 1); return true; } return false; },
    click: {
      blkAdd: async () => {
        const rec = { client_id: cid, name: $('#bk-n').value.trim() || `Bloque ${bs.length + 1}`, focus: $('#bk-f').value, start_date: $('#bk-s').value, end_date: $('#bk-e').value, routine_id: $('#bk-r').value || null, notes: $('#bk-o').value.trim() || null };
        if (!rec.start_date || !rec.end_date || rec.end_date < rec.start_date) return toast('Revisa las fechas', 'error');
        await DB.insert('training_blocks', rec); toast('Bloque guardado'); route();
      },
      blkDel: async el => { if (!confirm('¿Eliminar este bloque? La rutina asociada no se elimina.')) return; await DB.remove('training_blocks', el.dataset.id); route(); },
      blkAct: async el => { const b = bs.find(x => x.id === el.dataset.id); await activateBlock(b); toast('Rutina del bloque activada'); route(); }
    }
  };
}
async function activateBlock(b) {
  const rs = await DB.select('routines', { eq: { client_id: b.client_id } });
  for (const r of rs) if (r.active && r.id !== b.routine_id) await DB.update('routines', r.id, { active: false });
  await DB.update('routines', b.routine_id, { active: true });
  await DB.update('training_blocks', b.id, { activated_at: new Date().toISOString() });
}
async function inboxBlockRows(byId) {
  if (S.needsV10 || !isCoach()) return [];
  const t = todayStr();
  const bs = (await DB.select('training_blocks', { order: 'start_date' }).catch(() => [])).filter(b => byId[b.client_id] && b.routine_id && !b.activated_at && b.start_date <= t && b.end_date >= t);
  if (!bs.length) return [];
  const act = new Set((await DB.select('routines', { eq: { active: true } })).map(r => r.id));
  const rows = [];
  for (const b of bs) {
    if (act.has(b.routine_id)) { await DB.update('training_blocks', b.id, { activated_at: new Date().toISOString() }).catch(() => { }); continue; }
    if (S.settings.blocks_auto) { await activateBlock(b).catch(() => { }); rows.push(`<a class="ib-row" href="#/asesorado/${b.client_id}/bloques"><span class="ib-tag f">Bloque</span><span class="ib-n">${esc(byId[b.client_id].full_name || '')}</span><span class="ib-m">${esc(b.name)}: rutina activada</span></a>`); continue; }
    rows.push(`<div class="ib-row"><span class="ib-tag f">Bloque</span><a class="ib-n" href="#/asesorado/${b.client_id}/bloques">${esc(byId[b.client_id].full_name || '')}</a><span class="ib-m">${esc(b.name)} inicia <button class="chip" data-act="ibBlk" data-id="${b.id}">Activar rutina</button></span></div>`);
  }
  S.ibBlocks = Object.fromEntries(bs.map(b => [b.id, b]));
  return rows;
}
async function blockBannerHtml(c) {
  if (S.needsV10) return '';
  const bs = await DB.select('training_blocks', { eq: { client_id: c.cid }, order: 'start_date' }).catch(() => []); if (!bs.length) return '';
  const t = todayStr(); const cur = bs.find(b => t >= b.start_date && t <= b.end_date); const nx = bs.find(b => b.start_date > t);
  if (!cur && !nx) return '';
  const wk = cur ? Math.floor(daysBetween(cur.start_date, t) / 7) + 1 : 0;
  return `<div class="card blk-c">${cur ? `<b>${esc(cur.name)} · ${esc(cur.focus || '')}</b><small class="muted">Semana ${wk} de ${weeksOf(cur)} · termina el ${esc(fmtDM(parseDay(cur.end_date)))}</small>${cur.notes ? `<p class="small pre">${esc(cur.notes)}</p>` : ''}` : ''}${nx ? `<small class="muted">Siguiente: ${esc(nx.name)} (${esc(nx.focus || '')}) desde el ${esc(fmtDM(parseDay(nx.start_date)))}</small>` : ''}</div>`;
}

/* ---------- 17. Fuerza estimada por mes ---------- */
function strengthMonthlyHtml(sets) {
  const cnt = {}; sets.forEach(s => { if (num(s.weight_kg) > 0) cnt[s.exercise_id] = (cnt[s.exercise_id] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]); if (!top.length) return '';
  const months = []; const d = new Date(); d.setDate(1); for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(x.getFullYear() + '-' + pad2(x.getMonth() + 1)); }
  const mLbl = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''); };
  return `<details class="card" open><summary><b>Fuerza estimada por mes</b> <small class="muted">mejor 1RM estimado de cada mes</small></summary>${top.map(id => {
    const vals = months.map(k => sets.filter(s => s.exercise_id === id && String(s.created_at).slice(0, 7) === k).reduce((a, s) => Math.max(a, e1rm(num(s.weight_kg), s.reps)), 0));
    const v = vals.filter(Boolean); const fl = v.length ? Math.max(0, Math.floor(Math.min(...v) * 0.8)) : 0;
    const f = v.length > 1 ? vals.find(Boolean) : 0, l = [...vals].reverse().find(Boolean) || 0;
    return `<h4>${esc(exName(id))}${f && l ? ` <small class="muted">${l >= f ? '+' : ''}${fmtN((l / f - 1) * 100)} % en el periodo</small>` : ''}</h4>${vbars(months.map((k, i) => ({ label: mLbl(k), value: vals[i], text: vals[i] ? Math.round(vals[i]) : '', hi: i === 5 })), 'Sin registros en los últimos 6 meses.', fl)}`;
  }).join('')}<p class="small muted">Los 4 ejercicios con carga más registrados. Estimación de Epley; el eje inicia en el 80 % del menor valor.</p></details>`;
}

/* ---------- 18. Variabilidad de la frecuencia cardiaca ---------- */
async function hrvStatus(cid, w) {
  if (S.needsV10 || !w || !num(w.hrv_ms)) return null;
  const prev = (await DB.select('wellness', { eq: { client_id: cid }, gte: { log_date: addDays(w.log_date, -28) } })).filter(x => x.log_date < w.log_date && num(x.hrv_ms) > 0).map(x => Math.log(num(x.hrv_ms)));
  if (prev.length < 7) return { v: num(w.hrv_ms), n: prev.length };
  const m = prev.reduce((a, b) => a + b, 0) / prev.length; const sd = Math.sqrt(prev.reduce((a, b) => a + (b - m) ** 2, 0) / (prev.length - 1));
  const lo = Math.exp(m - 0.5 * sd), hi = Math.exp(m + 0.5 * sd); const v = num(w.hrv_ms);
  return { v, lo, hi, n: prev.length, low: v < Math.exp(m - sd) };
}
async function hrvLineHtml(w) {
  const parts = [];
  if (num(w.sleep_h)) parts.push(`sueño ${fmtN(w.sleep_h)} h`);
  if (num(w.rhr)) parts.push(`pulso ${fmtInt(w.rhr)} lpm`);
  const h = await hrvStatus(w.client_id, w).catch(() => null);
  if (h) parts.push(h.lo ? `VFC ${fmtInt(h.v)} ms (habitual ${fmtInt(h.lo)}–${fmtInt(h.hi)})${h.low ? ' · baja' : ''}` : `VFC ${fmtInt(h.v)} ms (línea base con 7 registros: ${h.n}/7)`);
  return parts.length ? `<small class="muted">${esc(parts.join(' · '))}</small>` : '';
}
async function hrvChartHtml(cid) {
  if (S.needsV10) return '';
  const ws = (await DB.select('wellness', { eq: { client_id: cid }, gte: { log_date: addDays(todayStr(), -20) }, order: 'log_date' }).catch(() => [])).filter(x => num(x.hrv_ms) || num(x.sleep_h));
  if (ws.length < 3) return '';
  const days = Array.from({ length: 21 }, (_, i) => addDays(todayStr(), -20 + i));
  const hv = days.map(d => num((ws.find(x => x.log_date === d) || {}).hrv_ms)); const sh = days.map(d => num((ws.find(x => x.log_date === d) || {}).sleep_h));
  const fl = hv.filter(Boolean).length ? Math.max(0, Math.floor(Math.min(...hv.filter(Boolean)) * 0.8)) : 0;
  return `${hv.some(Boolean) ? `<div class="card"><h3>Variabilidad de la frecuencia cardiaca (ms)</h3>${vbars(days.map((d, i) => ({ label: fmtDM(parseDay(d)), value: hv[i], text: hv[i] ? Math.round(hv[i]) : '', hi: i === 20 })), '', fl)}<p class="small muted">Una VFC por debajo del rango habitual (promedio de 28 días − 1 desviación, en escala logarítmica) indica menor recuperación; se interpreta junto con el bienestar.</p></div>` : ''}
    ${sh.some(Boolean) ? `<div class="card"><h3>Horas de sueño</h3>${vbars(days.map((d, i) => ({ label: fmtDM(parseDay(d)), value: sh[i], text: sh[i] ? fmtN(sh[i]) : '', hi: i === 20 })))}</div>` : ''}`;
}

/* ---------- 20. Saques y golpes por semana ---------- */
function servesHtml(ts) {
  if (S.needsV10 || !ts.some(t => num(t.serves) || num(t.strokes))) return '';
  const wk = []; for (let i = 5; i >= 0; i--) { const e = addDays(todayStr(), -7 * i), s = addDays(e, -6); const xs = ts.filter(t => t.log_date >= s && t.log_date <= e); wk.push({ e, sv: xs.reduce((a, t) => a + num(t.serves), 0), st: xs.reduce((a, t) => a + num(t.strokes), 0) }); }
  const prev = wk.slice(2, 5).map(x => x.sv).filter(Boolean); const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0; const cur = wk[5].sv;
  return `<div class="card"><h3>Saques por semana</h3>${vbars(wk.map((x, i) => ({ label: fmtDM(parseDay(x.e)), value: x.sv, text: x.sv || '', hi: i === 5 })), 'Sin saques registrados.')}
    ${avg && cur > avg * 1.3 ? `<p class="small warn">Esta semana hay ${Math.round((cur / avg - 1) * 100)} % más saques que el promedio de las 3 semanas anteriores. Los aumentos bruscos del volumen de saque se asocian con molestias de hombro y codo: aumenta de forma gradual y mantén el trabajo de prevención.</p>` : ''}
    ${wk.some(x => x.st) ? `<h4>Golpes totales</h4>${vbars(wk.map((x, i) => ({ label: fmtDM(parseDay(x.e)), value: x.st, text: x.st || '', hi: i === 5 })))}` : ''}</div>`;
}

/* ---------- 21. Monotonía y tensión de la carga (Foster) ---------- */
function monotonyHtml(L) {
  const days = Array.from({ length: 7 }, (_, i) => L.daily[addDays(todayStr(), -6 + i)] || 0);
  const tot = days.reduce((a, b) => a + b, 0); if (!tot) return '';
  const m = tot / 7; const sd = Math.sqrt(days.reduce((a, b) => a + (b - m) ** 2, 0) / 6);
  const mono = sd ? m / sd : null; const strain = mono ? tot * mono : null;
  const prevTot = Array.from({ length: 7 }, (_, i) => L.daily[addDays(todayStr(), -13 + i)] || 0).reduce((a, b) => a + b, 0);
  const jump = prevTot ? (tot / prevTot - 1) * 100 : null;
  return `<div class="card"><h3>Monotonía y tensión (7 días)</h3><div class="stats3"><div><b class="${mono > 2 ? 'bad' : ''}">${mono ? fmtN(mono) : '—'}</b><small>Monotonía</small></div><div><b>${strain ? fmtInt(strain) : '—'}</b><small>Tensión (UA)</small></div><div><b class="${jump > 30 ? 'bad' : ''}">${jump == null ? '—' : (jump > 0 ? '+' : '') + fmtInt(jump) + ' %'}</b><small>Cambio vs semana anterior</small></div></div>
    <p class="small muted">Monotonía = carga diaria promedio ÷ desviación estándar; por encima de 2 indica poca variación entre días duros y suaves. Tensión = carga semanal × monotonía (Foster, 1998). Un aumento semanal mayor al 30 % se considera un pico de carga.</p></div>`;
}

/* ---------- 19 y 22. Movilidad, recuperación y calentamiento guiados ---------- */
const GUIDED = {
  ramp: ['Calentamiento antes del partido (RAMP)', 'Elevar la temperatura, activar, movilizar y potenciar en 12 minutos.', [['Trote suave alrededor de la cancha', 120, 'Ritmo que permite conversar'], ['Desplazamientos laterales y cruzados', 60, 'Línea de fondo a línea de fondo'], ['Rodillas al pecho y talones a los glúteos', 45, 'Alternando cada 10 m'], ['Zancadas con rotación de tronco', 45, 'Rotar hacia la pierna adelantada'], ['Monster walk con banda', 45, 'Rodillas hacia afuera'], ['Rotaciones externas de hombro con banda', 45, 'Codo pegado al cuerpo'], ['Círculos de brazos y apertura de pecho', 30, 'Amplitud progresiva'], ['Sentadilla con alcance arriba', 30, 'Pecho alto'], ['Saltos de tobillo (pogo)', 30, 'Contacto corto con el piso'], ['Sprints de 5 m con cambio de dirección', 60, '4 a 6 repeticiones al 80–90 %'], ['Split step y primer paso explosivo', 45, 'Reacción a una señal'], ['Golpes de sombra: derecha, revés y saque', 60, 'Velocidad creciente']]],
  cadera: ['Movilidad de cadera', 'Para días con mucho tiempo sentado o antes del tren inferior. 8 minutos.', [['Respiración diafragmática en 90/90', 45, 'Inhala por la nariz, exhala lento'], ['Rotaciones 90/90 alternas', 60, 'Sin apoyar las manos si es posible'], ['Estiramiento de flexor de cadera (lado derecho)', 45, 'Glúteo apretado, pelvis neutra'], ['Estiramiento de flexor de cadera (lado izquierdo)', 45, 'Glúteo apretado, pelvis neutra'], ['Rana dinámica (balanceo)', 45, 'Rodillas abiertas, espalda neutra'], ['Puente de glúteo con pausa', 45, '2 s arriba'], ['Sentadilla profunda sostenida', 45, 'Talones apoyados'], ['Balanceo de pierna adelante y atrás', 60, '30 s por lado']]],
  hombro: ['Hombro de tenista', 'Movilidad y activación del manguito rotador. 6 minutos.', [['Estiramiento posterior de hombro (sleeper), derecho', 30, 'Suave, sin dolor'], ['Estiramiento posterior de hombro (sleeper), izquierdo', 30, 'Suave, sin dolor'], ['Ángeles en la pared', 45, 'Espalda y brazos en contacto'], ['Rotación externa con banda', 45, 'Codo a 90°'], ['Remo Y-T-W en el piso', 60, '5 de cada letra'], ['Retracción escapular con banda', 45, 'Junta las escápulas'], ['Apertura de pecho en el marco de la puerta', 45, 'Respira profundo']]],
  post: ['Recuperación después del partido', 'Vuelta a la calma y estiramientos. 10 minutos.', [['Caminata suave e hidratación', 120, 'Empieza a reponer líquidos'], ['Estiramiento de cuádriceps de pie', 45, 'Por lado: 20 s'], ['Estiramiento de isquiotibiales', 45, 'Rodilla ligeramente flexionada'], ['Estiramiento de pantorrilla en la pared', 45, 'Por lado: 20 s'], ['Estiramiento de aductores', 45, 'Sentado, plantas juntas'], ['Postura del niño', 45, 'Brazos largos'], ['Estiramiento de antebrazo (flexores y extensores)', 45, 'Brazo extendido'], ['Respiración 4-6 (inhala 4 s, exhala 6 s)', 120, 'Acostado, ojos cerrados']]],
  respira: ['Respiración para dormir', 'Respiración lenta para bajar la activación antes de dormir. 5 minutos.', [['Respiración en caja: 4 s inhala, 4 s retén, 4 s exhala, 4 s retén', 120, 'Hombros relajados'], ['Respiración 4-7-8', 90, 'Inhala 4 s, retén 7 s, exhala 8 s'], ['Escaneo corporal de pies a cabeza', 90, 'Suelta la tensión de cada zona']]]
};
function vMovilidad(k) {
  if (!k || !GUIDED[k]) {
    return paint(`<a class="linkbtn" href="#/plan">← Entreno</a>${Object.entries(GUIDED).map(([key, g]) => `<a class="card row-link" href="#/movilidad/${key}"><div><b>${esc(g[0])}</b><small class="muted">${esc(g[1])}</small></div><span class="chev">›</span></a>`).join('')}`, {}, 'Movilidad y recuperación');
  }
  const [title, desc, steps] = GUIDED[k]; const st = { i: 0, left: steps[0][1], run: false };
  const total = steps.reduce((a, s) => a + s[1], 0);
  const draw = () => {
    const s = steps[st.i]; const nx = steps[st.i + 1];
    paint(`<a class="linkbtn" href="#/movilidad">← Rutinas guiadas</a><p class="small muted">${esc(desc)} Total: ${Math.round(total / 60)} min.</p>
      <div class="card guided"><small class="muted">Paso ${st.i + 1} de ${steps.length}</small><h2>${esc(s[0])}</h2><p class="small">${esc(s[2])}</p><div class="g-time" id="g-t">${fmtClock(st.left * 1000)}</div>
        <div class="mb-t"><div class="mb-f" style="width:${((1 - st.left / s[1]) * 100).toFixed(1)}%"></div></div>
        ${nx ? `<p class="small muted">Siguiente: ${esc(nx[0])}</p>` : '<p class="small muted">Último paso</p>'}
        <div class="row-btns"><button class="btn" data-act="gPrev">‹ Anterior</button><button class="btn primary" data-act="gRun">${st.run ? 'Pausa' : st.i || st.left < s[1] ? 'Continuar' : 'Iniciar'}</button><button class="btn" data-act="gNext">Siguiente ›</button></div></div>
      <ol class="small">${steps.map((x, i) => `<li class="${i === st.i ? 'on' : i < st.i ? 'muted' : ''}">${esc(x[0])} · ${x[1]} s</li>`).join('')}</ol>`, {
      click: {
        gRun: () => { st.run = !st.run; tick(); draw(); },
        gNext: () => go(st.i + 1), gPrev: () => go(Math.max(0, st.i - 1))
      }
    }, title);
  };
  const go = i => { if (i >= steps.length) { st.run = false; clearInterval(S.tick); toast('Rutina completada'); try { beep(); } catch (e) { } location.hash = '#/movilidad'; return; } st.i = i; st.left = steps[i][1]; draw(); };
  const tick = () => {
    clearInterval(S.tick); if (!st.run) return;
    S.tick = setInterval(() => {
      st.left--; const el = document.getElementById('g-t'); if (el) el.textContent = fmtClock(Math.max(0, st.left) * 1000);
      if (st.left <= 3 && st.left > 0) { try { navigator.vibrate && navigator.vibrate(60); } catch (e) { } }
      if (st.left <= 0) { try { beep(); } catch (e) { } go(st.i + 1); }
    }, 1000);
  };
  draw();
}

/* ---------- 23. Video propio de cada ejercicio (archivo privado) ---------- */
const EXV_BUCKET = 'exercise-videos';
async function exVideoUrl(path) {
  if (DEMO) { const v = await demoFiles.get('exv/' + path); return v ? URL.createObjectURL(new Blob([v], { type: 'video/mp4' })) : ''; }
  const { data, error } = await sb.storage.from(EXV_BUCKET).createSignedUrl(path, 3600); if (error) throw error; return data.signedUrl;
}
const ownVideoSlot = e => `<div class="vid" id="ov-${esc(e.id)}"><p class="small muted center">Cargando video…</p></div>`;
async function loadOwnVideo(e) { const box = document.getElementById('ov-' + e.id); if (!box) return; try { const u = await exVideoUrl(e.video_path); box.innerHTML = u ? `<video src="${esc(u)}" controls playsinline preload="metadata"></video>` : '<p class="small muted">Video no disponible.</p>'; } catch (x) { box.innerHTML = `<p class="small muted">${esc(errMsg(x))}</p>`; } }
function ownVideoEditorHtml(e) {
  if (e.video_path) setTimeout(() => loadOwnVideo(e), 0);
  return `<div class="field"><span>Video propio (archivo, máximo 50 MB)</span>${e.video_path ? `${ownVideoSlot(e)}<div class="row-btns"><button class="btn sm danger-outline" type="button" data-act="ovDel">Quitar video propio</button></div>` : ''}<input class="input" type="file" accept="video/*" id="ov-f"><button class="btn sm" type="button" data-act="ovUp">Subir video propio</button><small class="muted">Tiene prioridad sobre el enlace de YouTube. Lo ven solo los usuarios de la app.</small></div>`;
}
const ownVideoHandlers = e => ({
  ovUp: async el => {
    const f = ($('#ov-f') || {}).files && $('#ov-f').files[0]; if (!f) return toast('Elige un video', 'error'); if (f.size > 50 * 1024 * 1024) return toast('El video supera 50 MB', 'error');
    el.disabled = true; const ext = (f.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4'; const path = `${e.id}.${ext}`;
    try { if (DEMO) await demoFiles.put('exv/' + path, await f.arrayBuffer()); else { const { error } = await sb.storage.from(EXV_BUCKET).upload(path, f, { contentType: f.type || 'video/mp4', upsert: true }); if (error) throw error; }
      await DB.update('exercises', e.id, { video_path: path }); await loadExercises(); toast('Video guardado'); route(); } catch (x) { toast(errMsg(x), 'error'); el.disabled = false; }
  },
  ovDel: async () => { if (!confirm('¿Quitar el video propio?')) return; if (DEMO) await demoFiles.del('exv/' + e.video_path); else await sb.storage.from(EXV_BUCKET).remove([e.video_path]).catch(() => { }); await DB.update('exercises', e.id, { video_path: null }); await loadExercises(); route(); }
});

/* ---------- 24. Rutina en casa ---------- */
const HOME_EQ_DEF = '["Peso corporal","Banda","Mancuernas"]';
const HOME_EQ = [['Peso corporal', 'Peso corporal'], ['Banda', 'Bandas elásticas'], ['Mancuernas', 'Mancuernas'], ['Kettlebell', 'Kettlebell'], ['Fitball', 'Balón de estabilidad'], ['Balón medicinal', 'Balón medicinal']];
function homeSwap(exId, allowed, used = new Set()) {
  const e = S.exById[exId]; if (!e) return null;
  if (allowed.includes(e.equipment)) return exId;
  const ok = x => allowed.includes(x.equipment) && x.id !== exId && !used.has(x.id);
  const fam = S.exercises.filter(x => e.family && x.family === e.family && ok(x));
  const grp = S.exercises.filter(x => x.muscle_group === e.muscle_group && ok(x));
  // Prioridad: el equipo con más carga disponible (mancuernas, kettlebell, bandas) sobre el peso corporal
  const pickFrom = l => l.sort((a, b) => allowed.indexOf(b.equipment) - allowed.indexOf(a.equipment))[0];
  return (pickFrom(fam) || pickFrom(grp) || {}).id || null;
}
async function homeCardHtml(c) {
  if (!c.days.length) return '';
  const sel = (() => { try { return JSON.parse(lsGet('dp_home_eq', HOME_EQ_DEF)); } catch (e) { return ['Peso corporal']; } })();
  return `<details class="card home-w"><summary><b>Entrenar en casa</b> <small class="muted">sin gimnasio, con el equipo que tengas</small></summary>
    <div class="chips">${HOME_EQ.map(([k, l]) => `<button class="chip${sel.includes(k) ? ' on' : ''}" data-act="heq" data-k="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <label class="field"><span>Día de la rutina</span><select class="input" id="hm-d">${c.days.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>
    <button class="btn primary block" data-act="homeGo">Iniciar versión en casa</button>
    <p class="small muted">Cada ejercicio se cambia por una variante del mismo patrón con el equipo elegido; si no hay variante, se usa otro ejercicio del mismo grupo muscular. Las series y repeticiones se mantienen.</p></details>`;
}
const homeHandlers = c => ({
  heq: el => { let sel = []; try { sel = JSON.parse(lsGet('dp_home_eq', HOME_EQ_DEF)); } catch (e) { } const k = el.dataset.k; sel = sel.includes(k) ? sel.filter(x => x !== k) : sel.concat(k); if (!sel.includes('Peso corporal')) sel.push('Peso corporal'); lsSet('dp_home_eq', JSON.stringify(sel)); el.classList.toggle('on', sel.includes(k)); },
  homeGo: async () => {
    let sel = []; try { sel = JSON.parse(lsGet('dp_home_eq', HOME_EQ_DEF)); } catch (e) { sel = ['Peso corporal']; }
    await startWorkout($('#hm-d').value); const d = getDraft(); if (!d) return;
    const used = new Set(); let miss = 0;
    for (const e of d.exercises) { const n = homeSwap(e.exercise_id, sel, used); if (n) { e.exercise_id = n; used.add(n); } else miss++; }
    await attachPrevious(d.exercises); d.day_name = (d.day_name || 'Sesión') + ' · en casa'; d.notes = ((d.notes || '') + '\nSesión en casa con: ' + sel.join(', ') + '.').trim();
    saveDraft(d); if (miss) toast(`${miss} ejercicios sin alternativa en casa: usa «Alternativas» o quítalos`); if (location.hash === '#/entreno') vEntreno();
  }
});

/* ---------- Registro ---------- */
HOOKS.fichaTabs.push({ group: 'Plan', key: 'bloques', label: 'Bloques', fn: blocksTab, show: () => !S.needsV10 && isCoach() });
HOOKS.inbox.push(inboxBlockRows);
HOOKS.inboxClick.push({ click: () => ({ ibBlk: async el => { const b = (S.ibBlocks || {})[el.dataset.id]; if (!b) return; await activateBlock(b); toast('Rutina del bloque activada'); route(); } }) });
HOOKS.planTop.push({ html: blockBannerHtml }, { html: async c => `<div class="row-btns"><a class="btn sm" href="#/movilidad">Movilidad y recuperación guiadas</a></div>` }, { html: homeCardHtml, click: homeHandlers });
HOOKS.routes.movilidad = vMovilidad; HOOKS.nav.movilidad = 'plan';
HOOKS.ajustes.push({ html: async () => S.needsV10 ? '' : `<div class="card"><h3>Bloques de entrenamiento</h3><label class="check"><input type="checkbox" data-s="blocks_auto" ${S.settings.blocks_auto ? 'checked' : ''}> Avance automático: activar la rutina de cada bloque en su fecha de inicio</label><p class="small muted">Desactivado: el cambio de bloque aparece en Pendientes para confirmarlo.</p></div>` });
