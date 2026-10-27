'use strict';
/* =====================================================================
   Deuce Point v10 · Seguimiento y análisis
   Panel de grupo, informe para el entrenador del club, perfiles similares,
   riesgo de abandono, ciclo cruzado con consumo y entrenamiento, laboratorios,
   tipos de informe mensual, check-in en un toque, agenda de citas y bioimpedancia.
   ===================================================================== */

/* Consulta paginada con columnas (la API devuelve como máximo 1.000 filas por consulta) */
async function selCols(table, cols, o = {}) {
  if (DEMO) return DB.select(table, o);
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    let q = sb.from(table).select(cols);
    for (const [k, v] of Object.entries(o.eq || {})) q = q.eq(k, v);
    for (const [k, v] of Object.entries(o.inn || {})) q = q.in(k, v);
    for (const [k, v] of Object.entries(o.gte || {})) q = q.gte(k, v);
    if (o.order) q = q.order(o.order, { ascending: o.asc !== false });
    const { data, error } = await q.range(from, from + 999); if (error) throw error;
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}
const avgOf = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const weekEnds = n => Array.from({ length: n }, (_, i) => addDays(todayStr(), -7 * (n - 1 - i)));
const inWeek = (d, end) => d > addDays(end, -7) && d <= end;

/* ---------- 36. Panel de grupo ---------- */
async function vGrupo() {
  const all = await DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' });
  const mem = typeof loadMemberships === 'function' ? await loadMemberships() : {};
  const cl = all.filter(c => !(mem[c.id] && mem[c.id].archived)); const ids = new Set(cl.map(c => c.id));
  const since = addDays(todayStr(), -56); const ends = weekEnds(8);
  const [logs, ws, wel, bodies, dls, its] = await Promise.all([
    selCols('food_logs', 'client_id,log_date', { gte: { log_date: since } }), selCols('workouts', 'client_id,started_at', { gte: { started_at: parseDay(since).toISOString() } }),
    S.needsV6 ? [] : selCols('wellness', 'client_id,log_date,sleep,fatigue,soreness,stress,mood', { gte: { log_date: since } }).catch(() => []),
    selCols('body_logs', 'client_id,log_date,weight_kg', { gte: { log_date: since } }), selCols('daily_logs', 'client_id,log_date,choices', { gte: { log_date: since } }), DB.select('intakes', { eq: { status: 'approved' } })]);
  const n = cl.length || 1;
  const logDays = {}; logs.filter(l => ids.has(l.client_id)).forEach(l => { (logDays[l.client_id] = logDays[l.client_id] || new Set()).add(l.log_date); });
  const wkLog = ends.map(e => Math.round(cl.reduce((a, c) => a + [...(logDays[c.id] || [])].filter(d => inWeek(d, e)).length, 0) / n / 7 * 100));
  const wkSes = ends.map(e => ws.filter(w => ids.has(w.client_id) && inWeek(dateStr(new Date(w.started_at)), e)).length / n);
  const wkWel = ends.map(e => avgOf(wel.filter(w => ids.has(w.client_id) && inWeek(w.log_date, e)).map(w => wellnessLight(w).tot)));
  const wkAlc = ends.map(e => dls.filter(d => ids.has(d.client_id) && inWeek(d.log_date, e)).reduce((a, d) => a + num(d.choices && d.choices.__alc && d.choices.__alc.g), 0) / n);
  const last4 = c => [...(logDays[c.id] || [])].filter(d => d > addDays(todayStr(), -28)).length;
  const rank = cl.map(c => ({ c, v: Math.round(last4(c) / 28 * 100) })).sort((a, b) => b.v - a.v);
  const goalOf = {}; its.forEach(i => { goalOf[i.client_id] = (i.calc && i.calc.goal) || 'mant'; });
  const chg = {}; cl.forEach(c => { const b = bodies.filter(x => x.client_id === c.id && num(x.weight_kg)).sort((a, b) => a.log_date < b.log_date ? -1 : 1); if (b.length >= 2 && daysBetween(b[0].log_date, b[b.length - 1].log_date) >= 14) { const g = goalOf[c.id] || 'mant'; (chg[g] = chg[g] || []).push((num(b[b.length - 1].weight_kg) / num(b[0].weight_kg) - 1) * 100 * 7 / daysBetween(b[0].log_date, b[b.length - 1].log_date)); } });
  const lights = typeof riskLights === 'function' ? await riskLights(cl).catch(() => ({})) : {};
  const lc = { ok: 0, warnb: 0, bad: 0 }; Object.values(lights).forEach(l => { lc[l.cls] = (lc[l.cls] || 0) + 1; });
  const lbl = e => fmtDM(parseDay(e));
  paint(`<a class="linkbtn" href="#/asesorados">← Asesorados</a>
    <div class="stats3"><div><b>${cl.length}</b><small>Asesorados activos</small></div><div><b>${wkLog[7]} %</b><small>Días con registro (semana)</small></div><div><b>${fmtN(wkSes[7])}</b><small>Sesiones por asesorado</small></div></div>
    <div class="card"><h3>Estado del grupo</h3>${hbars([{ label: 'Al día', value: lc.ok, text: lc.ok }, { label: 'Atención', value: lc.warnb, text: lc.warnb }, { label: 'Riesgo', value: lc.bad, text: lc.bad }])}<p class="small muted">Semáforo de los últimos 7 días: registro, bienestar, molestias y avisos de «no pude seguir el plan».</p></div>
    <div class="card"><h3>Días con registro de comidas (% del grupo)</h3>${vbars(ends.map((e, i) => ({ label: lbl(e), value: wkLog[i], text: wkLog[i] + '%', hi: i === 7 })))}</div>
    <div class="card"><h3>Sesiones de fuerza por asesorado</h3>${vbars(ends.map((e, i) => ({ label: lbl(e), value: wkSes[i], text: fmtN(wkSes[i]), hi: i === 7 })))}</div>
    ${wkWel.some(Boolean) ? `<div class="card"><h3>Bienestar promedio (sobre 25)</h3>${vbars(ends.map((e, i) => ({ label: lbl(e), value: wkWel[i], text: wkWel[i] ? fmtN(wkWel[i]) : '', hi: i === 7 })), '', 10)}</div>` : ''}
    ${wkAlc.some(Boolean) ? `<div class="card"><h3>Alcohol registrado (g por asesorado por semana)</h3>${vbars(ends.map((e, i) => ({ label: lbl(e), value: wkAlc[i], text: wkAlc[i] ? fmtInt(wkAlc[i]) : '', hi: i === 7 })))}</div>` : ''}
    ${Object.keys(chg).length ? `<div class="card"><h3>Cambio de peso por objetivo (% por semana)</h3>${hbars(Object.entries(chg).map(([g, v]) => ({ label: `${GOAL_LBL[g] || g} (${v.length})`, value: Math.abs(avgOf(v)) + 0.001, text: (avgOf(v) > 0 ? '+' : '') + fmtN(avgOf(v)) + ' %' })))}<p class="small muted">Promedio de los asesorados con al menos 2 pesos separados por 14 días o más en las últimas 8 semanas.</p></div>` : ''}
    <div class="card"><h3>Registro de comidas, últimas 4 semanas</h3><h4>Mayor constancia</h4>${hbars(rank.slice(0, 5).map(x => ({ label: x.c.full_name || x.c.email, value: x.v, text: x.v + ' %' })))}<h4>Menor constancia</h4>${hbars(rank.slice(-5).reverse().map(x => ({ label: x.c.full_name || x.c.email, value: x.v + 0.01, text: x.v + ' %' })))}</div>`, {}, 'Panel del grupo');
}

/* ---------- 39. Riesgo de abandono ---------- */
async function inboxDropRows(byId) {
  const ids = Object.keys(byId); if (!ids.length) return [];
  const since = addDays(todayStr(), -28);
  const [logs, ws] = await Promise.all([selCols('food_logs', 'client_id,log_date', { gte: { log_date: since } }), selCols('workouts', 'client_id,started_at', { gte: { started_at: parseDay(since).toISOString() } })]);
  const act = {}; const add = (c, d) => { (act[c] = act[c] || new Set()).add(d); };
  logs.forEach(l => add(l.client_id, l.log_date)); ws.forEach(w => add(w.client_id, dateStr(new Date(w.started_at))));
  const rows = [];
  for (const cid of ids) {
    const ds = [...(act[cid] || [])]; const last7 = ds.filter(d => d > addDays(todayStr(), -7)).length; const prev = ds.filter(d => d <= addDays(todayStr(), -7)).length / 3;
    if (prev >= 3 && last7 > 0 && last7 <= prev * 0.4) { const c = byId[cid]; rows.push(`<div class="ib-row"><span class="ib-tag i">Abandono</span><a class="ib-n" href="#/asesorado/${cid}/seguimiento">${esc(c.full_name || '')}</a><span class="ib-m">${fmtN(prev)} → ${last7} días/sem ${waBtn(c.phone, `Hola ${firstName(c.full_name)}, noté que esta semana te ha costado más registrar. ¿Qué ha cambiado? Ajustemos el plan para que sea más fácil de seguir.`, 'WhatsApp', 'chip wa')}</span></div>`); }
  }
  return rows;
}

/* ---------- 38. Perfiles similares ---------- */
async function similarTab(cid) {
  const its = await DB.select('intakes', { eq: { status: 'approved' } }); const me = its.find(i => i.client_id === cid);
  if (!me || !me.data) return { html: '<div class="card empty"><p>La comparación requiere la valoración aprobada del asesorado.</p></div>' };
  const goal = (me.calc && me.calc.goal) || 'mant'; const sex = me.data.sexo; const age = ageFrom(me.data.fecha_nac); const w = num(me.data.peso);
  const cand = its.filter(i => i.client_id !== cid && i.data && ((i.calc && i.calc.goal) || 'mant') === goal && i.data.sexo === sex).map(i => ({ i, d: Math.abs(ageFrom(i.data.fecha_nac) - age) / 8 + Math.abs(num(i.data.peso) - w) / Math.max(5, w * 0.1) })).sort((a, b) => a.d - b.d).slice(0, 8);
  const res = async (x, isMe) => {
    const ref = dateStr(new Date(x.reviewed_at || x.created_at)); const end = addDays(ref, 56);
    const [b, l] = await Promise.all([DB.select('body_logs', { eq: { client_id: x.client_id }, gte: { log_date: ref }, order: 'log_date' }), selCols('food_logs', 'client_id,log_date', { eq: { client_id: x.client_id }, gte: { log_date: ref } })]);
    const bw = b.filter(r => num(r.weight_kg) && r.log_date <= end); const span = bw.length >= 2 ? daysBetween(bw[0].log_date, bw[bw.length - 1].log_date) : 0;
    const days = Math.max(1, Math.min(56, daysBetween(ref, todayStr()) + 1)); const logged = new Set(l.filter(r => r.log_date <= end).map(r => r.log_date)).size;
    return { isMe, age: ageFrom(x.data.fecha_nac), w: num(x.data.peso), wk: span >= 14 ? (num(bw[bw.length - 1].weight_kg) / num(bw[0].weight_kg) - 1) * 100 * 7 / span : null, reg: Math.round(logged / days * 100) };
  };
  const rows = [await res(me, true)]; for (const c of cand) rows.push(await res(c.i, false));
  const valid = rows.filter(r => !r.isMe && r.wk != null); const meR = rows[0];
  return {
    html: `<div class="card"><h3>Asesorados con perfil similar</h3><p class="small muted">Mismo objetivo (${esc(GOAL_LBL[goal] || goal)}) y sexo, con edad y peso cercanos. Resultados de las primeras 8 semanas después de aprobar la valoración. Los nombres se ocultan para poder mostrar la comparación.</p>
      <table class="tbl"><thead><tr><th>Perfil</th><th class="n">Edad</th><th class="n">Peso</th><th class="n">% peso/sem</th><th class="n">Registro</th></tr></thead><tbody>${rows.map((r, i) => `<tr${r.isMe ? ' class="hi"' : ''}><td>${r.isMe ? '<b>Este asesorado</b>' : 'Asesorado ' + i}</td><td class="n">${r.age || '—'}</td><td class="n">${fmtN(r.w)}</td><td class="n">${r.wk == null ? '—' : (r.wk > 0 ? '+' : '') + fmtN(r.wk)}</td><td class="n">${r.reg} %</td></tr>`).join('')}</tbody></table></div>
      ${valid.length ? `<div class="card"><h3>Cambio de peso semanal (%)</h3>${hbars(rows.filter(r => r.wk != null).map((r, i) => ({ label: r.isMe ? 'Este asesorado' : 'Similar ' + (i + (meR.wk == null ? 1 : 0)), value: Math.abs(r.wk) + 0.001, text: (r.wk > 0 ? '+' : '') + fmtN(r.wk) + ' %' })))}<p class="small muted">Promedio de los similares: ${(avgOf(valid.map(r => r.wk)) > 0 ? '+' : '') + fmtN(avgOf(valid.map(r => r.wk)))} % por semana con ${fmtInt(avgOf(valid.map(r => r.reg)))} % de días con registro.</p></div>` : '<p class="small muted">Los asesorados similares todavía no tienen pesos suficientes para comparar.</p>'}`
  };
}

/* ---------- 40. Ciclo menstrual: consumo, saciedad y entrenamiento por fase ---------- */
async function cycleExtraHtml(cid, starts) {
  if (!starts.length || typeof cycleState !== 'function') return '';
  const since = starts[0].start_date;
  const [logs, ws, dls] = await Promise.all([selCols('food_logs', 'log_date,kcal', { eq: { client_id: cid }, gte: { log_date: since } }), DB.select('workouts', { eq: { client_id: cid }, gte: { started_at: parseDay(since).toISOString() } }), DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: since } })]);
  const ph = Object.keys(PHASES); const agg = Object.fromEntries(ph.map(p => [p, { kcal: [], vol: [], sat: [] }]));
  const kd = {}; logs.forEach(l => { kd[l.log_date] = (kd[l.log_date] || 0) + num(l.kcal); });
  Object.entries(kd).forEach(([d, k]) => { const s = cycleState(starts, d); if (s) agg[s.phase].kcal.push(k); });
  ws.forEach(w => { const s = cycleState(starts, dateStr(new Date(w.started_at))); if (s && num(w.total_volume)) agg[s.phase].vol.push(num(w.total_volume)); });
  dls.forEach(d => { const s = cycleState(starts, d.log_date); const fb = d.choices && d.choices.__fb; if (s && fb) Object.values(fb).forEach(x => { if (num(x.s)) agg[s.phase].sat.push(num(x.s)); }); });
  const ch = (k, l, f) => agg[ph[0]] && ph.some(p => agg[p][k].length) ? `<div class="card"><h3>${l}</h3>${vbars(ph.map(p => ({ label: PHASES[p][0], value: avgOf(agg[p][k]), text: agg[p][k].length ? f(avgOf(agg[p][k])) : '' })))}<p class="small muted">${ph.map(p => `${PHASES[p][0]}: ${agg[p][k].length}`).join(' · ')} registros.</p></div>` : '';
  return ch('kcal', 'Calorías registradas por día según la fase', v => fmtInt(v)) + ch('sat', 'Saciedad después de comer (1–5)', v => fmtN(v)) + ch('vol', 'Volumen por sesión de fuerza (kg)', v => fmtInt(v));
}

/* ---------- 41. Laboratorios ---------- */
const LAB_MARKERS = [
  ['hb', 'Hemoglobina', 'g/dL', [13.5, 17.5], [12, 15.5]], ['hto', 'Hematocrito', '%', [41, 50], [36, 44]], ['ferritina', 'Ferritina', 'ng/mL', [30, 400], [15, 150]],
  ['hierro', 'Hierro sérico', 'µg/dL', [60, 170], [60, 170]], ['vitd', 'Vitamina D (25-OH)', 'ng/mL', [30, 100], [30, 100]], ['b12', 'Vitamina B12', 'pg/mL', [200, 900], [200, 900]],
  ['glucosa', 'Glucosa en ayunas', 'mg/dL', [70, 99], [70, 99]], ['hba1c', 'Hemoglobina glicada (HbA1c)', '%', [4, 5.6], [4, 5.6]], ['insulina', 'Insulina en ayunas', 'µUI/mL', [2, 25], [2, 25]],
  ['col', 'Colesterol total', 'mg/dL', [0, 199], [0, 199]], ['ldl', 'Colesterol LDL', 'mg/dL', [0, 99], [0, 99]], ['hdl', 'Colesterol HDL', 'mg/dL', [40, 100], [50, 100]], ['tg', 'Triglicéridos', 'mg/dL', [0, 149], [0, 149]],
  ['tsh', 'TSH', 'µUI/mL', [0.4, 4], [0.4, 4]], ['creat', 'Creatinina', 'mg/dL', [0.7, 1.3], [0.6, 1.1]], ['ck', 'Creatina quinasa (CK)', 'U/L', [39, 308], [26, 192]],
  ['pcr', 'Proteína C reactiva', 'mg/L', [0, 5], [0, 5]], ['testo', 'Testosterona total', 'ng/dL', [264, 916], [15, 70]], ['cortisol', 'Cortisol (mañana)', 'µg/dL', [6, 23], [6, 23]]];
const labOf = k => LAB_MARKERS.find(m => m[0] === k || norm(m[1]) === norm(k));
async function labsHtml(cid, staff) {
  const [rows, info, cases] = await Promise.all([DB.select('lab_results', { eq: { client_id: cid }, order: 'test_date' }), typeof clientInfo === 'function' ? clientInfo(cid) : { sex: 'M' }, S.needsV7 ? [] : DB.select('case_reports', { eq: { client_id: cid }, order: 'created_at', asc: false, limit: 1 }).catch(() => [])]);
  const req = ((cases[0] && cases[0].data && cases[0].data.labs) || {}).tests || [];
  const by = {}; rows.forEach(r => { (by[r.marker] = by[r.marker] || []).push(r); });
  const st = r => r.ref_low != null && num(r.value) < num(r.ref_low) ? ['bad', 'Bajo'] : r.ref_high != null && num(r.value) > num(r.ref_high) ? ['bad', 'Alto'] : ['ok', 'En rango'];
  const sx = info.sex === 'F' ? 4 : 3;
  return `${req.length ? `<div class="card"><h3>Exámenes solicitados en el expediente</h3><p class="small">${req.map(esc).join(' · ')}</p></div>` : ''}
    <div class="card"><h3>Registrar resultado</h3><div class="rex-grid"><label><span>Fecha</span><input class="input" type="date" id="lb-d" value="${todayStr()}"></label><label><span>Examen</span><select class="input" id="lb-m">${LAB_MARKERS.map(m => `<option value="${m[0]}">${esc(m[1])}</option>`).join('')}<option value="otro">Otro…</option></select></label></div>
      <div class="rex-grid"><label><span>Resultado</span><input class="input" id="lb-v" inputmode="decimal"></label><label><span>Unidad</span><input class="input" id="lb-u" value="${esc(LAB_MARKERS[0][2])}"></label></div>
      <div class="rex-grid"><label><span>Referencia mínima</span><input class="input" id="lb-lo" inputmode="decimal" value="${LAB_MARKERS[0][sx][0]}"></label><label><span>Referencia máxima</span><input class="input" id="lb-hi" inputmode="decimal" value="${LAB_MARKERS[0][sx][1]}"></label></div>
      <input class="input" id="lb-o" placeholder="Nombre del examen (si elegiste «Otro») o notas">
      <button class="btn primary block" data-act="lbAdd">Guardar resultado</button>
      <p class="small muted">Los rangos sugeridos son orientativos para adultos; usa siempre los valores de referencia impresos en el reporte de tu laboratorio, porque varían según el método.</p></div>
    ${Object.keys(by).length ? Object.entries(by).map(([k, rs]) => { const m = labOf(k); const last = rs[rs.length - 1]; const s = st(last); const fl = Math.max(0, Math.floor(Math.min(...rs.map(r => num(r.value))) * 0.7));
      return `<div class="card"><div class="day-h"><b>${esc(m ? m[1] : k)}</b><span class="badge ${s[0]}">${s[1]}: ${fmtN(last.value)} ${esc(last.unit || '')}</span></div>${rs.length > 1 ? vbars(rs.slice(-8).map((r, i, a) => ({ label: fmtDM(parseDay(r.test_date)), value: num(r.value), text: fmtN(r.value), hi: i === a.length - 1 })), '', fl) : ''}
        <p class="small muted">Referencia: ${last.ref_low != null ? fmtN(last.ref_low) : '—'} a ${last.ref_high != null ? fmtN(last.ref_high) : '—'} ${esc(last.unit || '')}${last.notes ? ' · ' + esc(last.notes) : ''}</p>
        <div class="small">${rs.slice().reverse().map(r => `${esc(fmtDM(parseDay(r.test_date)))}: ${fmtN(r.value)} <button class="linkbtn" data-act="lbDel" data-id="${r.id}">eliminar</button>`).join(' · ')}</div></div>`; }).join('') : '<div class="card empty"><p>Sin resultados de laboratorio registrados.</p></div>'}`;
}
function labHandlers(cid) {
  return {
    lbAdd: async () => {
      const k = $('#lb-m').value; const v = $('#lb-v').value.trim(); if (!v) return toast('Escribe el resultado', 'error');
      const other = k === 'otro'; const note = $('#lb-o').value.trim(); if (other && !note) return toast('Escribe el nombre del examen', 'error');
      await DB.insert('lab_results', { client_id: cid, test_date: $('#lb-d').value || todayStr(), marker: other ? note : k, value: num(v), unit: $('#lb-u').value.trim() || null, ref_low: $('#lb-lo').value.trim() === '' ? null : num($('#lb-lo').value), ref_high: $('#lb-hi').value.trim() === '' ? null : num($('#lb-hi').value), notes: other ? null : note || null });
      toast('Resultado guardado'); route();
    },
    lbDel: async el => { if (!confirm('¿Eliminar este resultado?')) return; await DB.remove('lab_results', el.dataset.id); route(); }
  };
}
async function labsTab(cid) {
  if (S.needsV10) return { html: '<div class="card empty"><p>Ejecuta la migración v10 para activar los laboratorios.</p></div>' };
  const info = await clientInfo(cid); const sx = info.sex === 'F' ? 4 : 3;
  return { html: await labsHtml(cid, true), click: labHandlers(cid), change: t => labChange(t, sx) };
}
function labChange(t, sx) { if (t.id !== 'lb-m') return false; const m = labOf(t.value); if (m) { $('#lb-u').value = m[2]; $('#lb-lo').value = m[sx][0]; $('#lb-hi').value = m[sx][1]; } else { $('#lb-u').value = ''; $('#lb-lo').value = ''; $('#lb-hi').value = ''; } return true; }
async function vLaboratorios() {
  if (S.needsV10) return paint('<div class="card empty"><p>Disponible después de la actualización v10.</p></div>', {}, 'Progreso');
  const sx = S.intake && S.intake.data && S.intake.data.sexo === 'Femenino' ? 4 : 3;
  paint(progSeg('laboratorios') + await labsHtml(S.profile.id, false), { click: labHandlers(S.profile.id), change: t => labChange(t, sx) }, 'Progreso');
}

/* ---------- 45. Bioimpedancia en condiciones comparables ---------- */
const BIA_COND = [['ayuno', 'Ayuno de 3 horas o más'], ['manana', 'Medición en la mañana'], ['sinej', 'Sin ejercicio en las 12 horas previas'], ['orina', 'Vejiga vacía'], ['hidra', 'Hidratación habitual el día anterior']];
const biaKey = r => [r.device || '', ...BIA_COND.map(([k]) => (r.conditions || {})[k] ? 1 : 0)].join('|');
async function biaHtml(cid) {
  const rows = await DB.select('bia_logs', { eq: { client_id: cid }, order: 'measure_date' });
  const last = rows[rows.length - 1]; const comp = last ? rows.filter(r => biaKey(r) === biaKey(last)) : []; const excl = rows.length - comp.length;
  const prev = comp[comp.length - 2]; const dv = (k, u) => prev && last[k] != null && prev[k] != null ? ` <small class="muted">${num(last[k]) - num(prev[k]) > 0 ? '+' : ''}${fmtN(num(last[k]) - num(prev[k]))} ${u}</small>` : '';
  const ch = (k, l, u) => comp.filter(r => r[k] != null).length > 1 ? `<div class="card"><h3>${l}</h3>${vbars(comp.slice(-8).map((r, i, a) => ({ label: fmtDM(parseDay(r.measure_date)), value: num(r[k]), text: fmtN(r[k]), hi: i === a.length - 1 })), '', Math.max(0, Math.floor(Math.min(...comp.map(r => num(r[k])).filter(Boolean)) * 0.85)))}</div>` : '';
  return `${last ? `<div class="stats3"><div><b>${last.fat_pct != null ? fmtN(last.fat_pct) + ' %' : '—'}</b><small>Grasa${dv('fat_pct', '%')}</small></div><div><b>${last.muscle_kg != null ? fmtN(last.muscle_kg) + ' kg' : '—'}</b><small>Masa muscular${dv('muscle_kg', 'kg')}</small></div><div><b>${last.weight_kg != null ? fmtN(last.weight_kg) + ' kg' : '—'}</b><small>Peso${dv('weight_kg', 'kg')}</small></div></div>
    <p class="small muted">Comparación con ${comp.length - 1} ${comp.length - 1 === 1 ? 'medición' : 'mediciones'} en las mismas condiciones (equipo, ayuno, horario, ejercicio previo, vejiga e hidratación).${excl ? ` ${excl} ${excl === 1 ? 'medición' : 'mediciones'} con condiciones distintas no se comparan: la hidratación y la comida cambian el resultado de la bioimpedancia.` : ''}</p>` : ''}
    ${ch('fat_pct', 'Grasa corporal (%)', '%')}${ch('muscle_kg', 'Masa muscular (kg)', 'kg')}
    <div class="card"><h3>Registrar medición</h3><div class="rex-grid"><label><span>Fecha</span><input class="input" type="date" id="bi-d" value="${todayStr()}"></label><label><span>Equipo</span><input class="input" id="bi-e" list="bi-el" value="${esc(last ? last.device || '' : '')}" placeholder="InBody 270, Tanita…"></label></div>
      <datalist id="bi-el">${['InBody 270', 'InBody 570', 'Tanita', 'Omron', 'Báscula doméstica'].map(x => `<option value="${x}">`).join('')}</datalist>
      <div class="rex-grid three"><label><span>Peso kg</span><input class="input" id="bi-w" inputmode="decimal"></label><label><span>Grasa %</span><input class="input" id="bi-f" inputmode="decimal"></label><label><span>Músculo kg</span><input class="input" id="bi-m" inputmode="decimal"></label></div>
      <div class="rex-grid three"><label><span>Agua %</span><input class="input" id="bi-h" inputmode="decimal"></label><label><span>Grasa visceral</span><input class="input" id="bi-v" inputmode="decimal"></label><label><span>TMB kcal</span><input class="input" id="bi-b" inputmode="numeric"></label></div>
      <div class="field"><span>Condiciones de la medición</span>${BIA_COND.map(([k, l]) => `<label class="check"><input type="checkbox" data-bc="${k}" ${!last || (last.conditions || {})[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <button class="btn primary block" data-act="biAdd">Guardar medición</button></div>
    ${rows.length ? `<div class="card"><h3>Historial</h3><table class="tbl"><thead><tr><th>Fecha</th><th class="n">Grasa</th><th class="n">Músculo</th><th></th></tr></thead><tbody>${rows.slice().reverse().map(r => `<tr${biaKey(r) === biaKey(last) ? '' : ' class="muted"'}><td>${esc(fmtDM(parseDay(r.measure_date)))}<br><small class="muted">${esc(r.device || '')}</small></td><td class="n">${r.fat_pct != null ? fmtN(r.fat_pct) + ' %' : '—'}</td><td class="n">${r.muscle_kg != null ? fmtN(r.muscle_kg) + ' kg' : '—'}</td><td><button class="icon-btn danger" data-act="biDel" data-id="${r.id}" aria-label="Eliminar">✕</button></td></tr>`).join('')}</tbody></table><p class="small muted">En gris: condiciones distintas a la última medición.</p></div>` : ''}`;
}
function biaHandlers(cid) {
  const v = id => { const x = $('#' + id).value.trim(); return x === '' ? null : num(x); };
  return {
    biAdd: async () => {
      const rec = { client_id: cid, measure_date: $('#bi-d').value || todayStr(), device: $('#bi-e').value.trim() || null, weight_kg: v('bi-w'), fat_pct: v('bi-f'), muscle_kg: v('bi-m'), water_pct: v('bi-h'), visceral: v('bi-v'), bmr: v('bi-b'), conditions: Object.fromEntries([...document.querySelectorAll('[data-bc]')].map(x => [x.dataset.bc, x.checked])) };
      if (rec.fat_pct == null && rec.muscle_kg == null && rec.weight_kg == null) return toast('Escribe al menos el peso, la grasa o el músculo', 'error');
      await DB.insert('bia_logs', rec); toast('Medición guardada'); route();
    },
    biDel: async el => { if (!confirm('¿Eliminar esta medición?')) return; await DB.remove('bia_logs', el.dataset.id); route(); }
  };
}
async function biaTab(cid) { if (S.needsV10) return { html: '<div class="card empty"><p>Ejecuta la migración v10.</p></div>' }; return { html: await biaHtml(cid), click: biaHandlers(cid) }; }
async function vComposicion() { if (S.needsV10) return paint('<div class="card empty"><p>Disponible después de la actualización v10.</p></div>', {}, 'Progreso'); paint(progSeg('composicion') + await biaHtml(S.profile.id), { click: biaHandlers(S.profile.id) }, 'Progreso'); }

/* ---------- 42. Tipo de informe mensual por asesorado ---------- */
const REPORT_TYPES = { completo: ['Completo', null], tenista: ['Tenista', ['Resumen', 'Entrenamiento', 'Tenis', 'Bienestar', 'Alimentación']], peso: ['Pérdida de peso', ['Resumen', 'Peso', 'Proyección', 'Composición', 'Alimentación', 'Entrenamiento', 'Bienestar']], ganancia: ['Ganancia de peso', ['Resumen', 'Peso', 'Composición', 'Alimentación', 'Entrenamiento']], nutricion: ['Solo nutrición', ['Resumen', 'Peso', 'Proyección', 'Composición', 'Alimentación', 'Bienestar']] };
async function reportTypeSelectHtml(cid) {
  if (S.needsV10) return '';
  const m = (await DB.select('client_meta', { eq: { client_id: cid } }).catch(() => []))[0] || {};
  return `<div class="card"><label class="field"><span>Tipo de informe de este asesorado</span><select class="input" data-rtype="${cid}">${Object.entries(REPORT_TYPES).map(([k, v]) => `<option value="${k}"${(m.report_type || 'completo') === k ? ' selected' : ''}>${esc(v[0])}</option>`).join('')}</select></label><p class="small muted">Define qué secciones incluye el informe mensual. Los comentarios y objetivos se incluyen siempre.</p></div>`;
}
async function reportTypeChange(t, cid) {
  if (!t.dataset.rtype) return false;
  const ex = (await DB.select('client_meta', { eq: { client_id: cid } }))[0];
  if (ex) await DB.update('client_meta', cid, { report_type: t.value, updated_at: new Date().toISOString() }, 'client_id'); else await DB.insert('client_meta', { client_id: cid, report_type: t.value });
  toast('Tipo de informe guardado'); return true;
}
if (typeof reportData === 'function') {
  const _rd = reportData; reportData = async (cid, start, end) => {
    const D = await _rd(cid, start, end);
    if (!S.needsV10) { const m = (await DB.select('client_meta', { eq: { client_id: cid } }).catch(() => []))[0]; D.rtype = (m && m.report_type) || 'completo'; const b = (await DB.select('bia_logs', { eq: { client_id: cid }, order: 'measure_date' }).catch(() => [])).filter(r => r.measure_date <= end); D.bia = b; }
    return D;
  };
}
if (typeof reportDocHtml === 'function') {
  const _rh = reportDocHtml; reportDocHtml = (client, rep, D, logo) => {
    let h = _rh(client, rep, D, logo);
    const bin = (D.bia || []).filter(r => r.measure_date >= D.start); const last = bin[bin.length - 1];
    if (last) { const comp = (D.bia || []).filter(r => biaKey(r) === biaKey(last) && r.measure_date <= last.measure_date); const prev = comp[comp.length - 2];
      const sec = `<h2>Composición corporal (bioimpedancia)</h2><table class="doc-t"><thead><tr><th></th><th class="n">${prev ? esc(fmtDM(parseDay(prev.measure_date))) : 'Anterior'}</th><th class="n">${esc(fmtDM(parseDay(last.measure_date)))}</th></tr></thead><tbody>${[['Grasa', 'fat_pct', '%'], ['Masa muscular', 'muscle_kg', 'kg'], ['Peso', 'weight_kg', 'kg']].map(([l, k, u]) => `<tr><td>${l}</td><td class="n">${prev && prev[k] != null ? fmtN(prev[k]) + ' ' + u : '—'}</td><td class="n">${last[k] != null ? fmtN(last[k]) + ' ' + u : '—'}</td></tr>`).join('')}</tbody></table><p class="doc-sub">Comparación entre mediciones con el mismo equipo y las mismas condiciones (${esc(last.device || 'equipo no indicado')}).</p>`;
      h = h.replace('<h2>Alimentación</h2>', sec + '<h2>Alimentación</h2>'); }
    const keep = (REPORT_TYPES[D.rtype] || [])[1]; if (!keep) return h;
    const parts = h.split(/(?=<h2>)/);
    return parts.filter((p, i) => { if (i === 0 || !p.startsWith('<h2>')) return true; const t = p.slice(4, 40); return /^(Comentarios|Objetivos)/.test(t) || keep.some(k => t.startsWith(k)); }).join('');
  };
}

/* ---------- 43. Check-in en un toque ---------- */
const CK_REPLIES_DEF = 'Buen trabajo esta semana: seguimos con el mismo plan.\nVas en el ritmo esperado. Prioriza registrar todas las comidas esta semana.\nEsta semana enfócate en la proteína de cada comida y en el agua.\nAjusté tu plan según tu progreso; revisa las nuevas porciones en Hoy.';
const ckReplies = () => String(S.settings.checkin_replies || CK_REPLIES_DEF).split('\n').map(x => x.trim()).filter(Boolean);
function ckQuickHtml(id) { return `<div class="chips scroll">${ckReplies().map((r, i) => `<button class="chip" data-act="ckQ" data-id="${id}" data-i="${i}">${esc(r.length > 40 ? r.slice(0, 38) + '…' : r)}</button>`).join('')}</div><button class="btn sm" data-act="ckOk" data-id="${id}">Revisado: enviar la primera respuesta</button>`; }
const ckQuickHandlers = () => ({
  ckQ: el => { const ta = document.querySelector(`[data-reply="${el.dataset.id}"]`); if (ta) { const r = ckReplies()[+el.dataset.i]; ta.value = ta.value.trim() ? ta.value.trim() + '\n' + r : r; ta.focus(); } },
  ckOk: async el => { const ta = document.querySelector(`[data-reply="${el.dataset.id}"]`); await DB.update('checkins', el.dataset.id, { coach_reply: (ta && ta.value.trim()) || ckReplies()[0], status: 'reviewed', reviewed_at: new Date().toISOString() }); toast('Check-in revisado'); route(); }
});

/* ---------- 37. Informe para el entrenador del club ---------- */
async function clubReportData(cid) {
  const L = await loadData(cid, 63); const wk = weeklyLoads(L, 4); const now = acwrAt(L, todayStr());
  const [wel, pains, tours, ft, client] = await Promise.all([DB.select('wellness', { eq: { client_id: cid }, gte: { log_date: addDays(todayStr(), -27) } }).catch(() => []), activePains(cid), tournamentsOf(cid), DB.select('fitness_tests', { eq: { client_id: cid }, order: 'test_date', asc: false, limit: 2 }).catch(() => []), DB.select('profiles', { eq: { id: cid } }).then(r => r[0] || {})]);
  const ends = weekEnds(4);
  return { client, wk, now, ends, ts: ends.map(e => L.ts.filter(t => inWeek(t.log_date, e))), gym: ends.map(e => L.ws.filter(w => inWeek(dateStr(new Date(w.started_at)), e)).length), wel: ends.map(e => avgOf(wel.filter(w => inWeek(w.log_date, e)).map(w => wellnessLight(w).tot))), pains, tours: tours.filter(t => (t.end_date || t.start_date) >= todayStr()).slice(0, 4), ft: ft[0] || null, mono: typeof monotonyHtml === 'function' ? monotonyHtml(L) : '' };
}
function clubReportDocHtml(R, rec, logo) {
  const z = acwrZone(R.now.ratio); const lb = R.ends.map(e => 'Sem. al ' + fmtDM(parseDay(e)));
  return `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Informe para el entrenador de tenis</h1><p><b>${esc(R.client.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · últimas 4 semanas · ${esc(new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }))}</p></div></div>
    <h2>Carga de entrenamiento</h2><div class="kpis"><div><b>${fmtInt(R.now.acute)}</b><small>Carga últimos 7 días (UA)</small></div><div><b>${R.now.ratio == null ? '—' : fmtN(R.now.ratio)}</b><small>Relación aguda:crónica · ${esc(z.label.split(':')[0])}</small></div><div><b>${R.gym.reduce((a, b) => a + b, 0)}</b><small>Sesiones de fuerza</small></div></div>
    <p class="doc-sub">Carga semanal (RPE × minutos, tenis y fuerza).</p>${docBars(R.wk.map((w, i) => ({ label: lb[i], value: w.load, text: Math.round(w.load), hi: i === 3 })))}
    <table class="doc-t"><thead><tr><th>Semana</th><th class="n">Partidos</th><th class="n">Prácticas</th><th class="n">Minutos de tenis</th><th class="n">Saques</th><th class="n">Fuerza</th></tr></thead><tbody>${R.ends.map((e, i) => `<tr><td>${esc(lb[i])}</td><td class="n">${R.ts[i].filter(t => t.kind === 'Partido').length}</td><td class="n">${R.ts[i].filter(t => t.kind === 'Práctica').length}</td><td class="n">${fmtInt(R.ts[i].reduce((a, t) => a + num(t.minutes), 0))}</td><td class="n">${R.ts[i].reduce((a, t) => a + num(t.serves), 0) || '—'}</td><td class="n">${R.gym[i]}</td></tr>`).join('')}</tbody></table>
    ${R.wel.some(Boolean) ? `<h2>Bienestar diario (promedio sobre 25)</h2>${docBars(R.wel.map((v, i) => ({ label: lb[i], value: v, text: v ? fmtN(v) : '', hi: i === 3 })), 10)}` : ''}
    <h2>Molestias activas</h2>${R.pains.length ? `<table class="doc-t"><tbody>${R.pains.map(p => `<tr><td>${esc(PAIN_ZONES[p.zone] || p.zone)}${p.side ? ' · ' + esc(p.side) : ''}</td><td class="n">${fmtInt(p.intensity)}/10</td><td>${esc(fmtDM(parseDay(p.report_date)))}</td></tr>`).join('')}</tbody></table>` : '<p>Sin molestias activas reportadas.</p>'}
    ${R.tours.length ? `<h2>Próximos torneos</h2><p>${R.tours.map(t => `${esc(t.name)} (${esc(fmtDM(parseDay(t.start_date)))})`).join(' · ')}</p>` : ''}
    ${R.ft ? `<h2>Pruebas físicas (${esc(fmtDM(parseDay(R.ft.test_date)))})</h2><table class="doc-t"><tbody>${FIT_TESTS.filter(([k]) => num((R.ft.results || {})[k])).map(([k, l, u]) => `<tr><td>${esc(l)}</td><td class="n">${fmtN(R.ft.results[k])} ${esc(u)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${rec ? `<h2>Recomendaciones</h2><div class="box pre">${esc(rec)}</div>` : ''}
    <p class="doc-foot">Información compartida con autorización del deportista o su acudiente. No incluye datos clínicos, de alimentación ni fotografías. Documento confidencial (Ley 1581 de 2012).</p>`;
}
async function vInformeClub(cid) {
  if (!isStaff()) return paint('<div class="card"><p>Sección para el equipo.</p></div>');
  const R = await clubReportData(cid); ensureReportCss();
  const name = `Informe para el entrenador de tenis - ${R.client.full_name || ''} - ${todayStr()}`.replace(/[\\/:*?"<>|]/g, '');
  const docs = reportDocButtons(name, logo => clubReportDocHtml(R, ($('#cr-r') || {}).value || '', logo));
  const guard = fn => () => { if (!($('#cr-ok') || {}).checked) return toast('Confirma la autorización para compartir el informe', 'error'); fn(); };
  paint(`<div class="row-btns no-print"><a class="btn" href="#/asesorado/${cid}/rendimiento">← Volver</a><button class="btn primary" data-act="pdf">Descargar PDF</button><button class="btn" data-act="html">Descargar HTML</button></div>
    <div class="card no-print"><label class="field"><span>Recomendaciones para el entrenador del club</span><textarea class="input" id="cr-r" rows="3" placeholder="Ej.: limitar los saques a 80 por sesión esta semana; evitar doble sesión el jueves."></textarea></label>
      <label class="check"><input type="checkbox" id="cr-ok"> El asesorado (o su acudiente, si es menor de edad) autorizó compartir este informe con su entrenador de tenis.</label></div>
    <div class="doc">${clubReportDocHtml(R, '', BRAND.logoFull || BRAND.logo)}</div>`, { click: { pdf: guard(docs.pdf), html: guard(docs.html) } }, 'Informe para el club');
}

/* ---------- 44. Agenda de citas ---------- */
const AG_DEF = 'Lunes | 08:00-12:00, 14:00-18:00\nMartes | 08:00-12:00, 14:00-18:00\nMiércoles | 08:00-12:00, 14:00-18:00\nJueves | 08:00-12:00, 14:00-18:00\nViernes | 08:00-12:00';
function agendaAvail() {
  const out = {}; String(S.settings.agenda || AG_DEF).split('\n').forEach(l => { const [d, r] = l.split('|').map(x => (x || '').trim()); const dn = WEEKDAYS.find(w => norm(w) === norm(d)); if (!dn || !r) return; out[dn] = r.split(',').map(x => x.trim().split('-').map(hm2min)).filter(x => x[0] != null && x[1] != null && x[1] > x[0]); });
  return out;
}
const toHM = m => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
const isoAt = (d, m) => new Date(`${d}T${toHM(m)}:00`).toISOString();
async function busySlots(from, to) {
  if (DEMO) return (await DB.select('appointments')).filter(a => ['solicitada', 'confirmada'].includes(a.status) && a.starts_at >= from && a.starts_at < to);
  return DB.rpc('busy_slots', { p_from: from, p_to: to });
}
function freeSlots(date, busy, slot) {
  const av = agendaAvail()[WEEKDAYS[parseDay(date).getDay()]] || []; const out = []; const nowIso = new Date(Date.now() + 2 * 3600e3).toISOString();
  av.forEach(([a, b]) => { for (let m = a; m + slot <= b; m += slot) { const s = isoAt(date, m), e = new Date(new Date(s).getTime() + slot * 60000).toISOString(); if (s < nowIso) continue; if (busy.some(x => x.starts_at < e && new Date(new Date(x.starts_at).getTime() + num(x.minutes) * 60000).toISOString() > s)) continue; out.push({ m, s }); } });
  return out;
}
const AP_ST = { solicitada: ['warnb', 'Solicitada'], confirmada: ['ok', 'Confirmada'], cancelada: ['', 'Cancelada'], realizada: ['', 'Realizada'] };
const apWhen = a => new Date(a.starts_at).toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
function apIcs(a, who) {
  const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); const s = new Date(a.starts_at), e = new Date(s.getTime() + num(a.minutes) * 60000);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Deuce Point//Agenda//ES', 'BEGIN:VEVENT', 'UID:' + a.id + '@deucepoint', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(s), 'DTEND:' + f(e), 'SUMMARY:' + `${a.kind} · ${who}`.replace(/[,;]/g, ' '), 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Cita', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
async function vAgenda(dsel) {
  if (S.needsV10) return paint('<div class="card empty"><p>Disponible después de la migración v10.</p></div>', {}, 'Agenda');
  const staff = isStaff(); const slot = num(S.settings.agenda_slot) || 30; const kinds = String(S.settings.agenda_kinds || 'Control, Valoración, Videollamada').split(',').map(x => x.trim()).filter(Boolean);
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i)).filter(d => (agendaAvail()[WEEKDAYS[parseDay(d).getDay()]] || []).length);
  const from = parseDay(todayStr()).toISOString(), to = parseDay(addDays(todayStr(), 15)).toISOString();
  const [busy, mine, clients] = await Promise.all([busySlots(from, to).catch(() => []), staff ? DB.select('appointments', { gte: { starts_at: addDays(todayStr(), -1) }, order: 'starts_at' }) : DB.select('appointments', { eq: { client_id: S.profile.id }, order: 'starts_at', asc: false, limit: 20 }), staff ? DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' }) : []]);
  const sel = dsel && days.includes(dsel) ? dsel : days.find(d => freeSlots(d, busy, slot).length) || days[0];
  const byId = Object.fromEntries(clients.map(c => [c.id, c]));
  const free = sel ? freeSlots(sel, busy, slot) : [];
  const list = mine.filter(a => staff ? a.status !== 'cancelada' : true);
  const apCard = a => `<div class="card"><div class="day-h"><div><b>${esc(apWhen(a))}</b><small class="muted">${esc(a.kind)} · ${num(a.minutes)} min${staff ? ' · ' + esc((byId[a.client_id] || {}).full_name || '') : ''}</small></div><span class="badge ${AP_ST[a.status][0]}">${AP_ST[a.status][1]}</span></div>${a.notes ? `<p class="small">${esc(a.notes)}</p>` : ''}
    <div class="row-btns">${staff && a.status === 'solicitada' ? `<button class="btn sm primary" data-act="apSt" data-id="${a.id}" data-v="confirmada">Confirmar</button>` : ''}${staff && a.status === 'confirmada' && a.starts_at < new Date().toISOString() ? `<button class="btn sm" data-act="apSt" data-id="${a.id}" data-v="realizada">Realizada</button>` : ''}${a.status === 'confirmada' ? `<button class="btn sm" data-act="apIcs" data-id="${a.id}">Agregar al calendario</button>` : ''}${['solicitada', 'confirmada'].includes(a.status) && a.starts_at > new Date().toISOString() ? `<button class="btn sm danger-outline" data-act="apSt" data-id="${a.id}" data-v="cancelada">Cancelar</button>` : ''}${staff ? waBtn((byId[a.client_id] || {}).phone, `Hola ${firstName((byId[a.client_id] || {}).full_name)}, te confirmo la cita del ${apWhen(a)}.`, 'WhatsApp') : ''}</div></div>`;
  paint(`${staff ? '' : '<a class="linkbtn" href="#/perfil">← Perfil</a>'}
    <div class="card"><h3>${staff ? 'Agendar a un asesorado' : 'Pedir una cita'}</h3>
      ${days.length ? `<div class="chips scroll">${days.map(d => `<a class="chip${d === sel ? ' on' : ''}" href="#/agenda/${d}">${esc(parseDay(d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }))}</a>`).join('')}</div>
      ${staff ? `<label class="field"><span>Asesorado</span><select class="input" id="ap-c">${clients.map(c => `<option value="${c.id}">${esc(c.full_name || c.email)}</option>`).join('')}</select></label>` : ''}
      <div class="rex-grid"><label><span>Tipo</span><select class="input" id="ap-k">${kinds.map(k => `<option>${esc(k)}</option>`).join('')}</select></label><label><span>Nota (opcional)</span><input class="input" id="ap-n" maxlength="200"></label></div>
      <div class="chips">${free.map(f => `<button class="chip" data-act="apNew" data-s="${f.s}">${toHM(f.m)}</button>`).join('') || '<p class="small muted">Sin horarios libres este día.</p>'}</div>
      <p class="small muted">${staff ? 'Las citas que agendas quedan confirmadas.' : 'Tu entrenador confirma la cita; recibirás el aviso en Hoy.'} Duración: ${slot} min.</p>` : '<p class="small muted">No hay horarios de atención configurados.</p>'}</div>
    <h2 class="sec">${staff ? 'Próximas citas' : 'Mis citas'}</h2>${list.length ? list.map(apCard).join('') : '<div class="card empty"><p>Sin citas.</p></div>'}`, {
    click: {
      apNew: async el => {
        const cid = staff ? $('#ap-c').value : S.profile.id; if (!confirm(`¿${staff ? 'Agendar' : 'Solicitar'} la cita del ${apWhen({ starts_at: el.dataset.s })}?`)) return;
        await DB.insert('appointments', { client_id: cid, starts_at: el.dataset.s, minutes: slot, kind: $('#ap-k').value, notes: $('#ap-n').value.trim() || null, status: staff ? 'confirmada' : 'solicitada' });
        toast(staff ? 'Cita agendada' : 'Cita solicitada'); route();
      },
      apSt: async el => { if (el.dataset.v === 'cancelada' && !confirm('¿Cancelar la cita?')) return; await DB.update('appointments', el.dataset.id, { status: el.dataset.v }); toast('Cita actualizada'); route(); },
      apIcs: el => { const a = mine.find(x => x.id === el.dataset.id); downloadFile('Cita.ics', apIcs(a, staff ? (byId[a.client_id] || {}).full_name || '' : BRAND.name), 'text/calendar'); }
    }
  }, 'Agenda');
}
async function inboxAgendaRows(byId) {
  if (S.needsV10) return [];
  const aps = await DB.select('appointments', { gte: { starts_at: parseDay(todayStr()).toISOString() }, order: 'starts_at' }).catch(() => []);
  return aps.filter(a => byId[a.client_id] && (a.status === 'solicitada' || (a.status === 'confirmada' && dateStr(new Date(a.starts_at)) === todayStr()))).map(a => `<a class="ib-row" href="#/agenda/${dateStr(new Date(a.starts_at))}"><span class="ib-tag c">Cita</span><span class="ib-n">${esc(byId[a.client_id].full_name || '')}</span><span class="ib-m">${a.status === 'solicitada' ? 'Por confirmar · ' : 'Hoy · '}${esc(new Date(a.starts_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></a>`);
}
async function apptCardHtml(c) {
  if (!c.own || !c.isToday || S.needsV10) return '';
  const a = (await DB.select('appointments', { eq: { client_id: c.cid }, gte: { starts_at: new Date().toISOString() }, order: 'starts_at', limit: 3 }).catch(() => [])).find(x => ['solicitada', 'confirmada'].includes(x.status));
  return a ? `<a class="card row-link" href="#/agenda"><div><b>Cita ${a.status === 'confirmada' ? 'confirmada' : 'solicitada'}: ${esc(apWhen(a))}</b><small class="muted">${esc(a.kind)}${a.status === 'solicitada' ? ' · pendiente de confirmación' : ''}</small></div><span class="chev">›</span></a>` : '';
}

/* ---------- Registro ---------- */
HOOKS.coachRoutes.grupo = vGrupo; HOOKS.coachRoutes['informe-club'] = vInformeClub; HOOKS.coachRoutes.agenda = vAgenda;
HOOKS.routes.laboratorios = vLaboratorios; HOOKS.routes.composicion = vComposicion; HOOKS.routes.agenda = vAgenda;
Object.assign(HOOKS.coachNav, { grupo: 'asesorados', 'informe-club': 'asesorados', agenda: 'perfil' });
Object.assign(HOOKS.nav, { laboratorios: 'historial', composicion: 'historial', agenda: 'perfil' });
HOOKS.progreso.push({ key: 'laboratorios', label: 'Laboratorios', show: () => !S.needsV10 }, { key: 'composicion', label: 'Composición', show: () => !S.needsV10 });
HOOKS.perfilClient.push({ href: '#/agenda', title: 'Agendar una cita', sub: 'Controles y valoraciones con tu entrenador', show: () => !S.needsV10 });
HOOKS.perfilCoach.push({ href: '#/grupo', title: 'Panel del grupo', sub: 'Constancia, entrenamiento, bienestar y peso de todos los asesorados' }, { href: '#/agenda', title: 'Agenda de citas', sub: 'Horarios, solicitudes y citas confirmadas', show: () => !S.needsV10 });
HOOKS.fichaTabs.push({ group: 'Seguimiento', key: 'laboratorios', label: 'Laboratorios', fn: labsTab, show: () => !S.needsV10 }, { group: 'Seguimiento', key: 'bia', label: 'Bioimpedancia', fn: biaTab, show: () => !S.needsV10 }, { group: 'Seguimiento', key: 'similares', label: 'Perfiles similares', fn: similarTab });
HOOKS.inbox.push(inboxDropRows, inboxAgendaRows);
HOOKS.hoy.push({ pos: 'afterSum', html: apptCardHtml });
HOOKS.ajustes.push({ html: async () => `<div class="card"><h3>Agenda de citas</h3><label class="field"><span>Horarios de atención: Día | inicio-fin, inicio-fin</span><textarea class="input" rows="5" data-s="agenda">${esc(S.settings.agenda || AG_DEF)}</textarea></label>
  <div class="rex-grid"><label><span>Duración de cada cita (min)</span><input class="input" data-s="agenda_slot" data-num="1" inputmode="numeric" value="${esc(S.settings.agenda_slot ?? 30)}"></label><label><span>Tipos de cita (separados por coma)</span><input class="input" data-s="agenda_kinds" value="${esc(S.settings.agenda_kinds || 'Control, Valoración, Videollamada')}"></label></div></div>
  <div class="card"><h3>Respuestas rápidas de check-in</h3><label class="field"><span>Una por línea; la primera se usa en «Revisado» con un toque</span><textarea class="input" rows="4" data-s="checkin_replies">${esc(S.settings.checkin_replies || CK_REPLIES_DEF)}</textarea></label></div>` });
