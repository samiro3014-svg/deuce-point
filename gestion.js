'use strict';
/* =====================================================================
   Deuce Point · Gestión
   Membresías (vencimiento, renovación, archivar y eliminar asesorados),
   informe mensual de progreso (pantalla, PDF y HTML), recordatorios en el
   calendario del celular (.ics) y videos de técnica en los ejercicios.
   Depende de app.js, nutri.js, auto.js y fotos.js.
   ===================================================================== */

const fmtDateLong = s => parseDay(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDayMonth = s => parseDay(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
const V5_NOTICE = '<div class="card warn-box small"><b>Actualización pendiente de la base de datos.</b> Para activar membresías, informes mensuales guardados y la eliminación de asesorados, ejecuta <code>supabase/migracion-v5.sql</code> en Supabase › SQL Editor.</div>';

/* =====================================================================
   Membresías
   ===================================================================== */
const MEMB_PLANS = [['Mensual', 30], ['Trimestral', 90], ['Semestral', 180], ['Anual', 365], ['Personalizado', 0]];
async function loadMemberships() {
  if (S.needsV5) return {};
  try { return Object.fromEntries((await DB.select('memberships')).map(r => [r.client_id, r])); } catch (e) { console.warn('memberships', e); return {}; }
}
function membStatus(m) {
  if (!m || !m.end_date) return null;
  const left = daysBetween(todayStr(), m.end_date); const warn = num(S.settings.renew_days ?? 7);
  const label = left < 0 ? `Vencida hace ${-left} ${left === -1 ? 'día' : 'días'}` : left === 0 ? 'Vence hoy' : `Vence en ${left} ${left === 1 ? 'día' : 'días'}`;
  return { left, expired: left < 0, soon: left >= 0 && left <= warn, label, cls: left < 0 ? 'bad' : left <= warn ? 'warnb' : 'ok' };
}
function renewText(c, m) {
  const past = daysBetween(todayStr(), m.end_date) < 0;
  const link = typeof payLink === 'function' ? payLink(m.plan_name) : '';
  return `Hola ${firstName(c.full_name)}, tu asesoría${m.plan_name ? ' ' + m.plan_name.toLowerCase() : ''} de ${BRAND.name} ${past ? 'venció' : 'vence'} el ${fmtDateLong(m.end_date)}. ¿Deseas renovarla para continuar con tu plan?${link ? ' Puedes pagar aquí: ' + link : ''}`;
}
async function saveMembership(cid, patch) {
  const ex = (await DB.select('memberships', { eq: { client_id: cid } }))[0];
  const rec = Object.assign({}, patch, { updated_at: new Date().toISOString() });
  if (ex) return DB.update('memberships', cid, rec, 'client_id');
  return (await DB.insert('memberships', Object.assign({ client_id: cid, archived: false }, rec)))[0];
}
function membershipModal(c, m, after) {
  m = m || {};
  const plan = m.plan_name || 'Mensual';
  const days = n => (MEMB_PLANS.find(p => p[0] === n) || [0, 0])[1];
  const renewStart = m.end_date ? (m.end_date >= todayStr() ? addDays(m.end_date, 1) : todayStr()) : todayStr();
  modal(`${modalHead('Membresía · ' + (c.full_name || ''))}
    <label class="field"><span>Plan</span><select class="input" id="mb-plan">${MEMB_PLANS.map(([n, d]) => `<option value="${n}"${n === plan ? ' selected' : ''}>${n}${d ? ` · ${d} días` : ''}</option>`).join('')}</select></label>
    <div class="rex-grid"><label><span>Inicio</span><input class="input" type="date" id="mb-start" value="${esc(m.start_date || todayStr())}"></label><label><span>Vencimiento</span><input class="input" type="date" id="mb-end" value="${esc(m.end_date || addDays(todayStr(), days(plan)))}"></label></div>
    ${S.needsV6 ? '' : `<label class="field"><span>Nivel de servicio</span><select class="input" id="mb-tier">${Object.entries(TIERS).map(([k, l]) => `<option value="${k}"${(m.tier || 'completo') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`}
    <label class="field"><span>Valor (opcional)</span><input class="input" id="mb-amount" inputmode="numeric" value="${esc(m.amount ?? '')}" placeholder="Ej.: 180000"></label>
    <label class="field"><span>Notas</span><textarea class="input" id="mb-notes" rows="2" placeholder="Forma de pago, condiciones…">${esc(m.notes || '')}</textarea></label>
    <p class="small muted">El aviso de renovación aparece en Pendientes ${num(S.settings.renew_days ?? 7)} días antes del vencimiento (configurable en Ajustes). El asesorado ve la fecha de vencimiento en su pantalla Hoy durante esos días.</p>
    <button class="btn primary block" data-act="save">Guardar</button>
    ${m.end_date ? `<button class="btn block" data-act="renew">Renovar desde el ${esc(fmtDayMonth(renewStart))}</button>` : ''}`, {
    change: t => {
      if (t.id === 'mb-plan' || t.id === 'mb-start') { const d = days($('#mb-plan').value); if (d) $('#mb-end').value = addDays($('#mb-start').value || todayStr(), d); }
    },
    click: {
      save: async () => {
        const rec = { plan_name: $('#mb-plan').value, start_date: $('#mb-start').value || null, end_date: $('#mb-end').value || null, amount: $('#mb-amount').value.trim() === '' ? null : num($('#mb-amount').value), notes: $('#mb-notes').value.trim() || null };
        if (!rec.end_date) return toast('Indica la fecha de vencimiento', 'error');
        if (rec.start_date && rec.end_date < rec.start_date) return toast('El vencimiento debe ser posterior al inicio', 'error');
        if ($('#mb-tier')) rec.tier = $('#mb-tier').value;
        await saveMembership(c.id, rec);
        if (!m.end_date && rec.amount && typeof recordPayment === 'function') await recordPayment(c.id, rec.amount, rec.plan_name, rec.start_date); closeModal(); toast('Membresía guardada'); if (after) after();
      },
      renew: async () => {
        const n = $('#mb-plan').value; const d = days(n) || Math.max(1, daysBetween(m.start_date || todayStr(), m.end_date));
        const amt = $('#mb-amount').value.trim() === '' ? null : num($('#mb-amount').value);
        await saveMembership(c.id, Object.assign({ plan_name: n, start_date: renewStart, end_date: addDays(renewStart, d), amount: amt, notes: $('#mb-notes').value.trim() || null, archived: false }, $('#mb-tier') ? { tier: $('#mb-tier').value } : {}));
        if (amt && typeof recordPayment === 'function') await recordPayment(c.id, amt, 'Renovación ' + n.toLowerCase(), todayStr());
        closeModal(); toast('Membresía renovada hasta el ' + fmtDateLong(addDays(renewStart, d))); if (after) after();
      }
    }
  });
}
/* Archivos de fotos del asesorado (cifrados) antes de eliminar la cuenta */
async function deleteClientFiles(cid) {
  if (DEMO) { for (const p of await DB.select('progress_photos', { eq: { client_id: cid } })) await Files.del(p.path).catch(() => { }); return; }
  const st = sb.storage.from(PHOTO_BUCKET);
  for (let i = 0; i < 20; i++) {
    const { data, error } = await st.list(cid, { limit: 100 }); if (error) throw error;
    const paths = (data || []).filter(o => o.name && o.id !== null).map(o => cid + '/' + o.name);
    if (!paths.length) break;
    const { error: e2 } = await st.remove(paths); if (e2) throw e2;
  }
}
async function deleteClient(c) {
  await deleteClientFiles(c.id);
  if (typeof deleteCaseFiles === 'function') await deleteCaseFiles(c.id);
  if (typeof VidFiles === 'object' && !S.needsV9) for (const v of await DB.select('technique_videos', { eq: { client_id: c.id } }).catch(() => [])) await VidFiles.del(v.path).catch(() => { });
  if (DEMO) await DB.remove('profiles', c.id);
  else await DB.rpc('delete_client', { target: c.id });
}
function deleteClientModal(c) {
  modal(`${modalHead('Eliminar asesorado')}
    <p>Se eliminan de forma definitiva la cuenta de <b>${esc(c.full_name || c.email)}</b> y todos sus datos: valoración, planes, rutinas, sesiones, registros de alimentación, check-ins, informes y fotos. Esta acción no se puede deshacer.</p>
    <p class="small muted">Si solo quieres ocultarlo de la lista mientras no tiene asesoría activa, usa «Archivar».</p>
    <label class="field"><span>Escribe ELIMINAR para confirmar</span><input class="input" id="del-ok" autocomplete="off"></label>
    <button class="btn danger block" data-act="go">Eliminar definitivamente</button>`, {
    click: {
      go: async el => {
        if ($('#del-ok').value.trim().toUpperCase() !== 'ELIMINAR') return toast('Escribe ELIMINAR para confirmar', 'error');
        el.disabled = true; el.textContent = 'Eliminando…';
        try { await deleteClient(c); } catch (e) { el.disabled = false; el.textContent = 'Eliminar definitivamente'; throw e; }
        closeModal(); toast('Asesorado eliminado'); location.hash = '#/asesorados';
      }
    }
  });
}
/* Encabezado de la ficha del asesorado (entrenador) */
async function membershipHead(c) {
  if (S.needsV5) return { html: '', click: {} };
  const m = (await DB.select('memberships', { eq: { client_id: c.id } }))[0] || null;
  const st = membStatus(m);
  const html = `<div class="memb">
      <div><small class="muted">Membresía</small><b>${m && m.end_date ? `${esc(m.plan_name || 'Plan')} · hasta el ${esc(fmtDateLong(m.end_date))}` : 'Sin fecha de vencimiento'}</b>${st ? `<span class="badge ${st.cls}">${esc(st.label)}</span>` : ''}${m && m.archived ? '<span class="badge">Archivado</span>' : ''}</div>
      <div class="row-btns"><button class="btn sm" data-act="mbEdit">${m && m.end_date ? 'Editar o renovar' : 'Registrar membresía'}</button>${st && (st.expired || st.soon) ? waBtn(c.phone, renewText(c, m), 'Aviso de renovación') : ''}
        <button class="btn sm" data-act="mbArch">${m && m.archived ? 'Restaurar' : 'Archivar'}</button><button class="btn sm danger-outline" data-act="mbDel">Eliminar</button></div></div>`;
  return {
    html, click: {
      mbEdit: () => membershipModal(c, m, route),
      mbArch: async () => {
        const on = !(m && m.archived);
        if (on && !confirm('¿Archivar este asesorado? Deja de aparecer en la lista y en Pendientes. Sus datos se conservan y puede seguir entrando a la app.')) return;
        await saveMembership(c.id, { archived: on }); toast(on ? 'Asesorado archivado' : 'Asesorado restaurado'); route();
      },
      mbDel: () => deleteClientModal(c)
    }
  };
}
/* Aviso para el asesorado en Hoy */
async function clientMembershipCard() {
  if (S.needsV5) return '';
  try {
    const m = (await DB.select('memberships', { eq: { client_id: S.profile.id } }))[0]; const st = membStatus(m);
    if (!st || !(st.expired || st.soon)) return '';
    return `<div class="card memb-c ${st.expired ? 'bad' : ''}"><b>${st.expired ? 'Tu asesoría venció el ' + esc(fmtDateLong(m.end_date)) : 'Tu asesoría vence el ' + esc(fmtDateLong(m.end_date))}</b><small class="muted">${st.expired ? 'Comunícate con tu entrenador para renovarla y continuar con el seguimiento.' : 'Renueva con tu entrenador para no interrumpir tu plan.'}</small><div class="row-btns">${typeof payLink === 'function' && payLink(m.plan_name) ? `<a class="btn sm primary" href="${esc(payLink(m.plan_name))}" target="_blank" rel="noopener">Pagar renovación</a>` : ''}${waBtn(S.settings.whatsapp, `Hola, soy ${S.profile.full_name || ''}. Quiero renovar mi asesoría de ${BRAND.name}.`, 'Renovar por WhatsApp', 'btn sm')}</div></div>`;
  } catch (e) { return ''; }
}
/* Filas de Pendientes: renovaciones e informes mensuales */
async function inboxManagementRows(byId, approved) {
  if (S.needsV5) return [];
  const rows = [];
  const mem = await loadMemberships();
  Object.values(mem).filter(m => byId[m.client_id] && !m.archived).forEach(m => {
    const st = membStatus(m); if (!st || !(st.expired || st.soon)) return;
    const c = byId[m.client_id];
    rows.push(`<div class="ib-row"><span class="ib-tag m">Renovación</span><a class="ib-n" href="#/asesorado/${c.id}/valoracion">${esc(c.full_name || c.email)}</a><span class="ib-m">${esc(st.label)} ${waBtn(c.phone, renewText(c, m), 'WhatsApp', 'chip wa')}</span></div>`);
  });
  try {
    const reps = await DB.select('reports', { order: 'period_end', asc: false });
    const last = {}; reps.forEach(r => { if (!last[r.client_id]) last[r.client_id] = r.period_end; });
    approved.filter(i => byId[i.client_id]).forEach(i => {
      const ref = last[i.client_id] || dateStr(new Date(i.reviewed_at || i.created_at));
      if (daysBetween(ref, todayStr()) >= 30) rows.push(`<a class="ib-row" href="#/asesorado/${i.client_id}/informes"><span class="ib-tag n">Informe</span><span class="ib-n">${esc(byId[i.client_id].full_name || '')}</span><span class="ib-m">${last[i.client_id] ? 'Último: ' + fmtDM(parseDay(last[i.client_id])) : 'Informe mensual'}</span></a>`);
    });
  } catch (e) { console.warn('reports', e); }
  return rows;
}

/* =====================================================================
   Informe mensual de progreso
   ===================================================================== */
const DOC_BARS_CSS = `
.dbars{display:flex;align-items:flex-end;gap:6px;margin:8px 0 4px;border-bottom:1px solid #c9d3c4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.dbars .c{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center}
.dbars .v{font-size:10.5px;color:#0f2a44;font-weight:600;margin-bottom:2px;white-space:nowrap}
.dbars .t{height:120px;width:100%;display:flex;align-items:flex-end;justify-content:center}
.dbars .b{width:62%;max-width:42px;background:#0B406C;border-radius:3px 3px 0 0}
.dbars .b.hi{background:#6FB232}
.dbars .b.ref{background:#c9d3c4}
.dbars .l{font-size:10px;color:#5f6d79;margin-top:3px;text-align:center;white-space:nowrap}
.dhb{margin:6px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.dhb .r{display:grid;grid-template-columns:110px 1fr 56px;gap:8px;align-items:center;font-size:12px;margin:4px 0}
.dhb .t{height:10px;background:#eef2ea;border-radius:5px;overflow:hidden}
.dhb .f{height:100%;background:#0B406C;border-radius:5px}
.dhb .f.hi{background:#6FB232}
.dhb .n{text-align:right;font-weight:600}
.doc .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}
.doc .kpis div{border:1px solid #dce2d8;border-radius:10px;padding:8px 10px}
.doc .kpis b{display:block;font-size:17px;color:#0B406C}
.doc .kpis small{font-size:11px;color:#5f6d79}
.doc .box{border-left:4px solid #6FB232;background:#f5f9f0;padding:8px 12px;border-radius:6px;margin:6px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media (max-width:520px){.doc .kpis{grid-template-columns:repeat(2,1fr)}}
@media print{.dbars,.dhb,.kpis{break-inside:avoid}}`;
function ensureReportCss() { ensureDocCss(); if (!document.getElementById('rep-css')) { const s = document.createElement('style'); s.id = 'rep-css'; s.textContent = DOC_BARS_CSS; document.head.appendChild(s); } }
/* Barras verticales para documentos (se conservan en PDF y HTML) */
function docBars(items, floor = 0, empty = 'Sin datos en el periodo.') {
  if (!items.some(i => i.value > 0)) return `<p class="doc-sub">${esc(empty)}</p>`;
  const max = Math.max(floor + 1, ...items.map(i => i.value));
  return `<div class="dbars">${items.map(i => `<div class="c"><span class="v">${esc(i.text ?? i.value)}</span><div class="t"><div class="b${i.hi ? ' hi' : ''}${i.ref ? ' ref' : ''}" style="height:${(i.value > 0 ? Math.max(3, (i.value - floor) / (max - floor) * 100) : 0).toFixed(1)}%"></div></div><span class="l">${esc(i.label)}</span></div>`).join('')}</div>`;
}
function docHBars(items, max) {
  if (!items.length) return '<p class="doc-sub">Sin datos en el periodo.</p>';
  const mx = max || Math.max(1, ...items.map(i => i.value));
  return `<div class="dhb">${items.map(i => `<div class="r"><span>${esc(i.label)}</span><div class="t"><div class="f${i.hi ? ' hi' : ''}" style="width:${Math.max(2, i.value / mx * 100).toFixed(1)}%"></div></div><span class="n">${esc(i.text ?? i.value)}</span></div>`).join('')}</div>`;
}
const e1rmOf = (w, r) => r > 0 && w > 0 ? w * (1 + Math.min(r, 15) / 30) : 0;
function periodPresets() {
  const t = todayStr(); const d = parseDay(t);
  const firstThis = dateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  const firstPrev = dateStr(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  return [['Últimos 30 días', addDays(t, -29), t], ['Mes anterior', firstPrev, addDays(firstThis, -1)], ['Mes actual', firstThis, t]];
}
async function reportData(cid, start, end) {
  const inP = d => d >= start && d <= end;
  const [bodies, logs, dailies, ws, sets, cks, it, plan, routines] = await Promise.all([
    DB.select('body_logs', { eq: { client_id: cid }, order: 'log_date' }),
    DB.select('food_logs', { eq: { client_id: cid }, gte: { log_date: start } }),
    DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: start } }),
    DB.select('workouts', { eq: { client_id: cid }, order: 'started_at' }),
    DB.select('workout_sets', { eq: { client_id: cid }, order: 'created_at', limit: 20000 }),
    DB.select('checkins', { eq: { client_id: cid }, gte: { check_date: start }, order: 'check_date' }),
    DB.select('intakes', { eq: { client_id: cid } }).then(r => r[0] || null),
    activePlanFor(cid),
    DB.select('routines', { eq: { client_id: cid, active: true } })]);
  const lastDay = end > todayStr() ? todayStr() : end;
  const nDays = Math.max(1, daysBetween(start, lastDay) + 1);
  // semanas del periodo (bloques de 7 días desde el inicio)
  const weeks = []; for (let s = start; s <= lastDay; s = addDays(s, 7)) weeks.push({ s, e: addDays(s, 6) > lastDay ? lastDay : addDays(s, 6) });
  const wk = d => weeks.findIndex(w => d >= w.s && d <= w.e);
  // Peso y composición
  const bw = bodies.filter(b => num(b.weight_kg) > 0);
  const before = bw.filter(b => b.log_date <= start).pop();
  const inside = bw.filter(b => inP(b.log_date));
  const w0 = before || inside[0] || null, w1 = inside[inside.length - 1] || null;
  const weekW = weeks.map(w => { const xs = inside.filter(b => b.log_date >= w.s && b.log_date <= w.e); return xs.length ? xs.reduce((a, b) => a + num(b.weight_kg), 0) / xs.length : 0; });
  const waist = bodies.filter(b => num(b.waist_cm) > 0); const wa0 = waist.filter(b => b.log_date <= start).pop() || waist.find(b => inP(b.log_date)); const wa1 = waist.filter(b => inP(b.log_date)).pop();
  const fat = bodies.filter(b => num(b.body_fat) > 0); const f0 = fat.filter(b => b.log_date <= start).pop() || fat.find(b => inP(b.log_date)); const f1 = fat.filter(b => inP(b.log_date)).pop();
  // Nutrición
  let t = targetsOf(plan); const hasT = t && t.kcal > 0;
  const days = Array.from({ length: nDays }, (_, i) => addDays(start, i));
  // Con tipos de día, el objetivo del periodo es el promedio de las metas de cada fecha
  if (hasT && hasDayTypes(plan)) { const ts = days.map(d => targetsOf(planForDate(plan, d, ((dailies.find(x => x.log_date === d) || {}).choices || {}).__dtype))); t = scaleM(ts.reduce((a, x) => addM(a, Object.assign(ZERO(), x)), ZERO()), 1 / ts.length); }
  const dstats = days.map(d => {
    const dl = logs.filter(l => l.log_date === d); const dd = dailies.find(x => x.log_date === d);
    return { d, n: dl.length, m: dl.reduce((a, l) => addM(a, logM(l)), ZERO()), comp: dl.length ? dayCompletion(plan, dl, dd) : null, water: num(dd && dd.water_ml) };
  });
  const logged = dstats.filter(x => x.n);
  const avgM = logged.length ? scaleM(logged.reduce((a, x) => addM(a, x.m), ZERO()), 1 / logged.length) : ZERO();
  const compVals = logged.map(x => x.comp).filter(v => v != null);
  const adh = compVals.length ? Math.round(compVals.reduce((a, b) => a + b, 0) / compVals.length) : null;
  const weekAdh = weeks.map(w => { const xs = logged.filter(x => x.d >= w.s && x.d <= w.e && x.comp != null); return xs.length ? Math.round(xs.reduce((a, x) => a + x.comp, 0) / xs.length) : 0; });
  const weekLogged = weeks.map(w => logged.filter(x => x.d >= w.s && x.d <= w.e).length);
  const waterDays = dstats.filter(x => x.water); const waterAvg = waterDays.length ? waterDays.reduce((a, x) => a + x.water, 0) / waterDays.length : 0;
  // Entrenamiento
  const wIn = ws.filter(w => inP(dateStr(new Date(w.started_at))));
  const weekSess = weeks.map(w => wIn.filter(x => { const d = dateStr(new Date(x.started_at)); return d >= w.s && d <= w.e; }).length);
  const weekVol = weeks.map(w => wIn.filter(x => { const d = dateStr(new Date(x.started_at)); return d >= w.s && d <= w.e; }).reduce((a, x) => a + num(x.total_volume), 0));
  const rdays = routines.length ? await DB.select('routine_days', { inn: { routine_id: routines.map(r => r.id) } }) : [];
  const perWeek = rdays.length || ((it && it.data && it.data.dias) || []).length || 0;
  const planned = perWeek ? Math.round(perWeek * nDays / 7) : 0;
  const durs = wIn.filter(w => w.finished_at).map(w => (new Date(w.finished_at) - new Date(w.started_at)) / 60000);
  const wInIds = new Set(wIn.map(w => w.id)); const startIso = parseDay(start).toISOString();
  const best = {}, prev = {};
  sets.forEach(s => {
    const v = e1rmOf(num(s.weight_kg), num(s.reps)); if (!v) return;
    if (wInIds.has(s.workout_id)) best[s.exercise_id] = Math.max(best[s.exercise_id] || 0, v);
    else if (s.created_at < startIso) prev[s.exercise_id] = Math.max(prev[s.exercise_id] || 0, v);
  });
  const records = Object.keys(best).filter(id => prev[id] && best[id] > prev[id] * 1.005).map(id => ({ id, name: exName(id), before: prev[id], after: best[id], pct: (best[id] / prev[id] - 1) * 100 })).sort((a, b) => b.pct - a.pct).slice(0, 8);
  // Check-ins
  const ckIn = cks.filter(c => inP(c.check_date));
  const scales = CK_SCALES.map(([k, , l]) => { const v = ckIn.map(c => num(c[k])).filter(x => x > 0); return { k, label: l, value: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }; }).filter(x => x.value);
  // Proyección frente al resultado
  let proj = null;
  const c = it && it.status === 'approved' ? it.calc : null;
  if (c && c.weight && w1) {
    const ref = dateStr(new Date(c.recalc_at || it.reviewed_at || it.created_at));
    const m = Math.max(0, daysBetween(ref, w1.log_date) / 30.4);
    const p = projection(c, 3);
    if (p.length && m > 0.2) {
      const mm = Math.min(3, m), i0 = Math.floor(mm), i1 = Math.min(3, i0 + 1), fr = mm - i0;
      const lerp = k => p[i0][k] + (p[i1][k] - p[i0][k]) * fr;
      const lo = Math.min(lerp('wMin'), lerp('wMax')), hi = Math.max(lerp('wMin'), lerp('wMax'));
      const real = num(w1.weight_kg);
      proj = { ref, months: m, base: c.weight, lo, hi, real, status: real < lo - 0.3 ? 'below' : real > hi + 0.3 ? 'above' : 'in', goal: c.goal };
    }
  }
  // Tenis: carga y pruebas físicas
  let tennis = null;
  if (!S.needsV6 && typeof loadData === 'function') {
    try {
      const L = await loadData(cid, daysBetween(start, todayStr()) + 35);
      const tsIn = L.ts.filter(x => inP(x.log_date));
      const weekLoad = weeks.map(w => { let v = 0; for (let d = w.s; d <= w.e; d = addDays(d, 1)) v += L.daily[d] || 0; return v; });
      const ft = (await DB.select('fitness_tests', { eq: { client_id: cid }, order: 'test_date' })).filter(x => x.test_date <= end);
      const fin = ft.filter(x => inP(x.test_date)); const fLast = fin[fin.length - 1] || null; const fPrev = fLast ? ft.filter(x => x.test_date < fLast.test_date).pop() || null : null;
      const info = await clientInfo(cid);
      if (tsIn.length || weekLoad.some(v => v) || fLast) tennis = { matches: tsIn.filter(x => x.kind === 'Partido').length, practices: tsIn.filter(x => x.kind !== 'Partido').length, minutes: tsIn.reduce((a, x) => a + num(x.minutes), 0), weekLoad, acwr: acwrAt(L, lastDay).ratio, fLast, fPrev, info };
    } catch (e) { console.warn('report tennis', e); }
  }
  return { tennis, start, end, lastDay, nDays, weeks, w0, w1, weekW, wa0, wa1, f0, f1, plan, t: hasT ? t : null, logged: logged.length, avgM, adh, weekAdh, weekLogged, waterAvg, waterT: num(plan && plan.water_ml),
    sessions: wIn.length, planned, perWeek, weekSess, weekVol, volume: wIn.reduce((a, x) => a + num(x.total_volume), 0), avgDur: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0, records, checkins: ckIn.length, scales, proj, goal: c ? c.goal : null };
}
const sgn = (v, u = '') => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtN(Math.abs(v)) + u;
function reportDocHtml(client, rep, D, logo) {
  const wl = i => 'Sem ' + (i + 1);
  const dW = D.w0 && D.w1 && D.w0 !== D.w1 ? num(D.w1.weight_kg) - num(D.w0.weight_kg) : null;
  const dWa = D.wa0 && D.wa1 && D.wa0 !== D.wa1 ? num(D.wa1.waist_cm) - num(D.wa0.waist_cm) : null;
  const dF = D.f0 && D.f1 && D.f0 !== D.f1 ? num(D.f1.body_fat) - num(D.f0.body_fat) : null;
  const sessPct = D.planned ? Math.round(D.sessions / D.planned * 100) : null;
  const wv = D.weekW.filter(v => v > 0); const wFloor = wv.length ? Math.max(0, Math.floor(Math.min(...wv) - 2)) : 0;
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Informe mensual de progreso</h1><p><b>${esc(client.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · ${esc(fmtDateLong(D.start))} al ${esc(fmtDateLong(D.end))}${D.goal ? ' · ' + esc(GOAL_LBL[D.goal] || '') : ''}</p></div></div>`;
  h += `<h2>Resumen del periodo</h2><div class="kpis">
    <div><b>${D.w1 ? fmtN(D.w1.weight_kg) + ' kg' : '—'}</b><small>Peso actual${dW != null ? ' · ' + sgn(dW, ' kg') : ''}</small></div>
    <div><b>${D.wa1 ? fmtN(D.wa1.waist_cm) + ' cm' : '—'}</b><small>Cintura${dWa != null ? ' · ' + sgn(dWa, ' cm') : ''}</small></div>
    <div><b>${D.f1 ? fmtN(D.f1.body_fat) + ' %' : '—'}</b><small>Grasa corporal${dF != null ? ' · ' + sgn(dF, ' %') : ''}</small></div>
    <div><b>${D.adh != null ? D.adh + ' %' : '—'}</b><small>Cumplimiento del plan</small></div>
    <div><b>${D.logged}/${D.nDays}</b><small>Días con registro de comidas</small></div>
    <div><b>${D.sessions}${D.planned ? '/' + D.planned : ''}</b><small>Sesiones de entrenamiento${sessPct != null ? ' · ' + sessPct + ' %' : ''}</small></div></div>`;
  h += `<h2>Peso corporal</h2><p class="doc-sub">Promedio semanal (kg)${wFloor ? `; el eje inicia en ${wFloor} kg` : ''}.${D.w0 ? ` Inicio: ${fmtN(D.w0.weight_kg)} kg (${fmtDM(parseDay(D.w0.log_date))}).` : ''}${D.w1 ? ` Final: ${fmtN(D.w1.weight_kg)} kg (${fmtDM(parseDay(D.w1.log_date))}).` : ''}</p>
    ${docBars(D.weekW.map((v, i) => ({ label: wl(i), value: v, text: v ? fmtN(v) : '', hi: i === D.weekW.length - 1 })), wFloor, 'Sin registros de peso en el periodo.')}`;
  if (D.proj) {
    const p = D.proj; const st = { in: 'dentro del rango proyectado', below: 'por debajo del rango proyectado', above: 'por encima del rango proyectado' }[p.status];
    h += `<h2>Proyección frente al resultado</h2>
      <table class="doc-t"><tbody><tr><td>Peso al iniciar el plan</td><td class="n">${fmtN(p.base)} kg (${esc(fmtDM(parseDay(p.ref)))})</td></tr>
      <tr><td>Peso proyectado a ${fmtN(p.months)} ${p.months >= 1 && p.months < 1.05 ? 'mes' : 'meses'}</td><td class="n">${fmtN(p.lo)}–${fmtN(p.hi)} kg</td></tr>
      <tr><td>Peso registrado</td><td class="n"><b>${fmtN(p.real)} kg</b></td></tr></tbody></table>
      ${docBars([{ label: 'Inicio', value: p.base, text: fmtN(p.base), ref: 1 }, { label: 'Proy. mín.', value: p.lo, text: fmtN(p.lo), ref: 1 }, { label: 'Proy. máx.', value: p.hi, text: fmtN(p.hi), ref: 1 }, { label: 'Real', value: p.real, text: fmtN(p.real), hi: 1 }], Math.max(0, Math.floor(Math.min(p.base, p.lo, p.real) - 2)))}
      <div class="box">El resultado está ${st}.${p.months > 3 ? ' La proyección se calcula hasta 3 meses; para periodos posteriores se compara con el valor del mes 3.' : ''}</div>`;
  }
  h += `<h2>Alimentación</h2><p class="doc-sub">Cumplimiento semanal: porcentaje de alimentos del plan marcados como consumidos en los días con registro.</p>
    ${docBars(D.weekAdh.map((v, i) => ({ label: wl(i), value: v, text: v ? v + ' %' : '', hi: i === D.weekAdh.length - 1 })), 0, 'Sin registros de alimentación en el periodo.')}
    <table class="doc-t"><thead><tr><th>Promedio diario</th><th class="n">Registrado</th><th class="n">Objetivo</th><th class="n">%</th></tr></thead><tbody>
      ${[['Energía', 'kcal', 'kcal'], ['Proteína', 'protein', 'g'], ['Carbohidratos', 'carbs', 'g'], ['Grasa', 'fat', 'g']].map(([l, k, u]) => `<tr><td>${l}</td><td class="n">${D.logged ? fmtInt(D.avgM[k]) + ' ' + u : '—'}</td><td class="n">${D.t ? fmtInt(D.t[k]) + ' ' + u : '—'}</td><td class="n">${D.logged && D.t && D.t[k] ? Math.round(D.avgM[k] / D.t[k] * 100) + ' %' : '—'}</td></tr>`).join('')}
      <tr><td>Agua</td><td class="n">${D.waterAvg ? (D.waterAvg / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' L' : '—'}</td><td class="n">${D.waterT ? (D.waterT / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' L' : '—'}</td><td class="n">${D.waterAvg && D.waterT ? Math.round(D.waterAvg / D.waterT * 100) + ' %' : '—'}</td></tr></tbody></table>
    <p class="doc-sub">Calculado sobre ${D.logged} ${D.logged === 1 ? 'día' : 'días'} con registro. El objetivo corresponde al día de entrenamiento del plan activo.</p>`;
  h += `<h2>Entrenamiento</h2><p class="doc-sub">Sesiones por semana${D.perWeek ? ` (planificadas: ${D.perWeek} por semana)` : ''}.</p>
    ${docBars(D.weekSess.map((v, i) => ({ label: wl(i), value: v, text: v, hi: i === D.weekSess.length - 1 })), 0, 'Sin sesiones registradas en el periodo.')}
    <p class="doc-sub">Volumen total por semana (kg × repeticiones).</p>
    ${docBars(D.weekVol.map((v, i) => ({ label: wl(i), value: v, text: v >= 1000 ? r1(v / 1000) + ' t' : Math.round(v), hi: i === D.weekVol.length - 1 })), 0, 'Sin sesiones registradas en el periodo.')}
    <table class="doc-t"><tbody><tr><td>Sesiones realizadas</td><td class="n">${D.sessions}${D.planned ? ' de ' + D.planned + ' planificadas' : ''}</td></tr><tr><td>Volumen total</td><td class="n">${fmtInt(D.volume)} kg</td></tr><tr><td>Duración promedio</td><td class="n">${D.avgDur ? Math.round(D.avgDur) + ' min' : '—'}</td></tr></tbody></table>
    ${D.records.length ? `<h3>Mejoras de fuerza (1RM estimado)</h3><table class="doc-t"><thead><tr><th>Ejercicio</th><th class="n">Antes</th><th class="n">Periodo</th><th class="n">Cambio</th></tr></thead><tbody>${D.records.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${fmtN(r.before)} kg</td><td class="n">${fmtN(r.after)} kg</td><td class="n">+${fmtN(r.pct)} %</td></tr>`).join('')}</tbody></table><p class="doc-sub">Estimación de Epley con la mejor serie de cada ejercicio, comparada con el mejor registro anterior al periodo.</p>` : ''}`;
  if (D.tennis) {
    const T = D.tennis; const z = acwrZone(T.acwr);
    h += `<h2>Tenis y carga de entrenamiento</h2><table class="doc-t"><tbody><tr><td>Partidos / prácticas</td><td class="n">${T.matches} / ${T.practices}</td></tr><tr><td>Minutos de tenis</td><td class="n">${fmtInt(T.minutes)} min</td></tr><tr><td>Relación aguda:crónica al cierre</td><td class="n">${T.acwr == null ? '—' : fmtN(T.acwr)} · ${esc(z.label.split(':')[0])}</td></tr></tbody></table>
      <p class="doc-sub">Carga semanal (RPE × minutos, fuerza y tenis).</p>${docBars(T.weekLoad.map((v, i) => ({ label: wl(i), value: v, text: Math.round(v), hi: i === T.weekLoad.length - 1 })), 0, 'Sin sesiones con RPE en el periodo.')}`;
    if (T.fLast) {
      const age = ageFrom(T.info.d.fecha_nac);
      h += `<h3>Pruebas físicas (${esc(fmtDayMonth(T.fLast.test_date))})</h3><table class="doc-t"><thead><tr><th>Prueba</th><th class="n">Resultado</th><th class="n">Anterior</th><th class="n">Referencia</th></tr></thead><tbody>${FIT_TESTS.filter(([k]) => num((T.fLast.results || {})[k])).map(([k, l, u, lower]) => { const v = num(T.fLast.results[k]), pv = T.fPrev ? num((T.fPrev.results || {})[k]) : 0, ref = fitRef(k, T.info.sex, age); return `<tr><td>${esc(l)}</td><td class="n"><b>${fmtN(v)} ${u}</b></td><td class="n">${pv ? fmtN(pv) + ' ' + u : '—'}</td><td class="n">${ref ? fmtN(ref.value) + ' (' + ref.group + ')' : '—'}</td></tr>`; }).join('')}</tbody></table><p class="doc-sub">Referencias: ${esc(FIT_SOURCE)}</p>`;
    }
  }
  if (D.scales.length) h += `<h2>Bienestar (check-ins semanales)</h2><p class="doc-sub">Promedio de ${D.checkins} ${D.checkins === 1 ? 'check-in' : 'check-ins'} en escala de 1 a 10.</p>${docHBars(D.scales.map(s => ({ label: s.label, value: s.value, text: fmtN(s.value) + '/10' })), 10)}`;
  if ((rep.comment || '').trim()) h += `<h2>Comentarios del entrenador</h2><p class="pre">${esc(rep.comment.trim())}</p>`;
  if ((rep.goals || '').trim()) h += `<h2>Objetivos para el próximo mes</h2><div class="box pre">${esc(rep.goals.trim())}</div>`;
  return h + `<p class="doc-foot">Informe generado con los registros de la aplicación ${esc(BRAND.name)}. La precisión depende de la constancia en el registro de comidas, entrenamientos, peso y medidas. Documento confidencial (Ley 1581 de 2012).</p>`;
}
async function vInforme(a, b, c) {
  const coach = S.profile.role === 'coach';
  let rep, cid;
  if (b) { cid = coach ? a : S.profile.id; rep = { period_start: b, period_end: c, comment: '', goals: '', preview: true }; }
  else { rep = (await DB.select('reports', { eq: { id: a } }))[0]; if (!rep) return paint('<div class="card"><p>Informe no encontrado.</p></div>'); cid = rep.client_id; }
  const client = cid === S.profile.id ? S.profile : (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  const D = await reportData(cid, rep.period_start, rep.period_end);
  ensureReportCss();
  const name = `Informe mensual - ${client.full_name || ''} - ${rep.period_end}`.replace(/[\\/:*?"<>|]/g, '');
  const docs = reportDocButtons(name, logo => reportDocHtml(client, rep, D, logo));
  if (!rep.preview && !coach) { try { localStorage.setItem('dp_rep_seen_' + rep.id, '1'); } catch (e) { } }
  const back = coach ? `#/asesorado/${cid}/informes` : '#/informes';
  paint(`<div class="row-btns no-print"><a class="btn" href="${back}">← Volver</a><button class="btn primary" data-act="pdf">Descargar PDF</button><button class="btn" data-act="html">Descargar HTML</button>
      ${coach && !rep.preview ? `<button class="btn" data-act="edit">Editar comentarios</button>${waBtn(client.phone, `Hola ${firstName(client.full_name)}, tu informe mensual de progreso ya está disponible en la app de ${BRAND.name} (Perfil › Informes mensuales).`, 'Avisar por WhatsApp')}` : ''}</div>
    ${rep.preview ? '<p class="small muted no-print">Vista previa sin guardar. Los comentarios se agregan al guardar el informe en la pestaña Informes.</p>' : ''}
    <div class="doc">${reportDocHtml(client, rep, D, BRAND.logoFull || BRAND.logo)}</div>`, {
    click: {
      ...docs,
      edit: () => modal(`${modalHead('Comentarios del informe')}
        <label class="field"><span>Comentarios del entrenador</span><textarea class="input" id="rp-c" rows="5">${esc(rep.comment || '')}</textarea></label>
        <label class="field"><span>Objetivos para el próximo mes</span><textarea class="input" id="rp-g" rows="4">${esc(rep.goals || '')}</textarea></label>
        <button class="btn primary block" data-act="save">Guardar</button>`, { click: { save: async () => { await DB.update('reports', rep.id, { comment: $('#rp-c').value.trim() || null, goals: $('#rp-g').value.trim() || null }); closeModal(); toast('Informe actualizado'); route(); } } })
    }
  }, 'Informe mensual');
}
/* PDF (impresión del documento) y HTML descargable con los estilos de las barras */
function reportDocButtons(name, bodyFn) {
  return {
    pdf: () => { ensureReportCss(); printDoc(bodyFn(BRAND.logoFull || BRAND.logo), name); },
    html: async () => { const logo = BRAND.logoFull || BRAND.logo; const body = bodyFn(logo ? await toDataUrl(logo) : ''); downloadFile(name + '.html', `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title><style>body{margin:0;background:#f3f5f1}.wrap{max-width:820px;margin:0 auto;padding:16px}${DOC_CSS}${DOC_BARS_CSS}</style></head><body><div class="wrap"><div class="doc">${body}</div></div></body></html>`, 'text/html'); }
  };
}
/* Pestaña Informes en la ficha del asesorado (entrenador) */
async function coachInformesTab(cid) {
  const pr = periodPresets(); let sel = pr[S.repPreset ?? 0] || pr[0];
  const reps = S.needsV5 ? [] : await DB.select('reports', { eq: { client_id: cid }, order: 'period_end', asc: false });
  const client = (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  const html = `${S.needsV5 ? V5_NOTICE : ''}
    <div class="card"><h3>Nuevo informe mensual</h3>
      <div class="chips">${pr.map((p, i) => `<button class="chip${p === sel ? ' on' : ''}" data-act="rpP" data-i="${i}">${p[0]}</button>`).join('')}</div>
      <div class="rex-grid"><label><span>Desde</span><input class="input" type="date" id="rp-s" value="${sel[1]}"></label><label><span>Hasta</span><input class="input" type="date" id="rp-e" value="${sel[2]}"></label></div>
      ${S.needsV5 ? '' : `<label class="field"><span>Comentarios del entrenador</span><textarea class="input" id="rp-c" rows="4" placeholder="Análisis del mes: avances, dificultades y ajustes realizados."></textarea></label>
      <label class="field"><span>Objetivos para el próximo mes</span><textarea class="input" id="rp-g" rows="3" placeholder="Metas concretas: peso, cumplimiento, cargas, hábitos."></textarea></label>`}
      <p class="small muted">Incluye peso y composición, proyección frente al resultado, cumplimiento del plan, macronutrientes, sesiones, volumen, mejoras de fuerza y bienestar. Se descarga en PDF y HTML.</p>
      <div class="row-btns"><button class="btn" data-act="rpPrev">Vista previa</button>${S.needsV5 ? '' : '<button class="btn primary" data-act="rpSave">Guardar y publicar</button>'}</div></div>
    ${reps.length ? '<h2 class="sec">Informes publicados</h2>' + reps.map(r => `<div class="card"><div class="day-h"><div><b>${esc(fmtDayMonth(r.period_start))} al ${esc(fmtDateLong(r.period_end))}</b><small class="muted">Publicado ${fmtDateShort(r.created_at)}</small></div></div>
      <div class="row-btns"><a class="btn sm primary" href="#/informe/${r.id}">Ver / PDF</a>${waBtn(client.phone, `Hola ${firstName(client.full_name)}, tu informe mensual de progreso ya está disponible en la app de ${BRAND.name} (Perfil › Informes mensuales).`, 'Avisar')}<button class="btn sm danger-outline" data-act="rpDel" data-id="${r.id}">Eliminar</button></div></div>`).join('') : ''}`;
  const per = () => { const s = $('#rp-s').value, e = $('#rp-e').value; if (!s || !e || e < s) { toast('Revisa las fechas del periodo', 'error'); return null; } return [s, e]; };
  return {
    html, click: {
      rpP: el => { S.repPreset = +el.dataset.i; const p = pr[+el.dataset.i]; $('#rp-s').value = p[1]; $('#rp-e').value = p[2]; document.querySelectorAll('[data-act=rpP]').forEach(x => x.classList.toggle('on', x === el)); },
      rpPrev: () => { const p = per(); if (p) location.hash = `#/informe/${cid}/${p[0]}/${p[1]}`; },
      rpSave: async () => { const p = per(); if (!p) return; const [r] = await DB.insert('reports', { client_id: cid, period_start: p[0], period_end: p[1], comment: $('#rp-c').value.trim() || null, goals: $('#rp-g').value.trim() || null }); toast('Informe publicado'); location.hash = '#/informe/' + r.id; },
      rpDel: async el => { if (!confirm('¿Eliminar este informe? El asesorado dejará de verlo.')) return; await DB.remove('reports', el.dataset.id); toast('Informe eliminado'); route(); }
    }
  };
}
/* Asesorado: lista de informes y aviso en Hoy */
async function vMisInformes() {
  const reps = S.needsV5 ? [] : await DB.select('reports', { eq: { client_id: S.profile.id }, order: 'period_end', asc: false });
  const pr = periodPresets()[0];
  paint(`<a class="linkbtn" href="#/perfil">← Perfil</a>
    ${reps.length ? reps.map(r => `<a class="card row-link" href="#/informe/${r.id}"><div><b>${esc(fmtDayMonth(r.period_start))} al ${esc(fmtDateLong(r.period_end))}</b><small class="muted">Informe de tu entrenador · PDF y HTML</small></div><span class="chev">›</span></a>`).join('') : '<div class="card empty"><p>Tu entrenador aún no ha publicado informes mensuales.</p></div>'}
    <a class="card row-link" href="#/informe/${S.profile.id}/${pr[1]}/${pr[2]}"><div><b>Resumen de los últimos 30 días</b><small class="muted">Generado con tus registros, sin comentarios del entrenador</small></div><span class="chev">›</span></a>`, {}, 'Informes mensuales');
}
async function clientReportCard() {
  if (S.needsV5) return '';
  try {
    const r = (await DB.select('reports', { eq: { client_id: S.profile.id }, order: 'created_at', asc: false, limit: 1 }))[0];
    if (!r || daysBetween(dateStr(new Date(r.created_at)), todayStr()) > 14) return '';
    let seen = false; try { seen = !!localStorage.getItem('dp_rep_seen_' + r.id); } catch (e) { }
    return seen ? '' : `<a class="card row-link ck-due" href="#/informe/${r.id}"><div><b>Nuevo informe mensual</b><small class="muted">Tu entrenador publicó el informe del ${esc(fmtDayMonth(r.period_start))} al ${esc(fmtDayMonth(r.period_end))}.</small></div><span class="chev">›</span></a>`;
  } catch (e) { return ''; }
}

/* =====================================================================
   Recordatorios en el calendario del celular (.ics)
   ===================================================================== */
const ICS_DAYS = { 'Lunes': 'MO', 'Martes': 'TU', 'Miércoles': 'WE', 'Jueves': 'TH', 'Viernes': 'FR', 'Sábado': 'SA', 'Domingo': 'SU' };
const remKey = () => 'dp_rem_' + S.profile.id;
const hhmm = s => { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? pad2(+m[1]) + ':' + m[2] : ''; };
const minOf = s => { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const toHHMM = t => pad2(Math.floor(((t % 1440) + 1440) % 1440 / 60)) + ':' + pad2(((t % 1440) + 1440) % 1440 % 60);
async function reminderDefaults() {
  const [plan, cks] = await Promise.all([activePlanFor(S.profile.id), DB.select('checkins', { eq: { client_id: S.profile.id }, order: 'check_date', asc: false, limit: 1 }).catch(() => [])]);
  const d = (S.intake && S.intake.data) || {};
  const wake = minOf(d.despierta) ?? 390, sleep = minOf(d.duerme) ?? 1350;
  const sl = sleep < wake ? sleep + 1440 : sleep;
  const water = []; for (let t = wake + 120; t <= sl - 120 && water.length < 6; t += 150) water.push(toHHMM(Math.round(t / 15) * 15));
  const trainDays = (plan && plan.train_days && plan.train_days.length ? plan.train_days : d.dias) || [];
  const tt = { 'Mañana': '06:00', 'Mediodía': '11:30', 'Tarde': '16:30', 'Noche': '18:30' }[d.horario] || '17:00';
  const ref = cks[0] ? cks[0].check_date : (S.intake ? dateStr(new Date(S.intake.created_at)) : todayStr());
  return {
    plan,
    prefs: {
      meals: Object.fromEntries((plan ? plan.meals : []).map(m => [m.name, { on: true, time: hhmm(m.time_label) || '' }])),
      water: { on: true, times: water.join(', ') },
      train: { on: trainDays.length > 0, time: tt, days: trainDays },
      checkin: { on: true, day: WEEKDAYS[parseDay(addDays(ref, 7)).getDay()], time: '08:00' },
      log: { on: true, time: toHHMM(Math.min(sl - 60, 21 * 60 + 30)) }
    }
  };
}
function loadRemPrefs(def) {
  let p = null; try { p = JSON.parse(localStorage.getItem(remKey()) || 'null'); } catch (e) { }
  if (!p) return def;
  p.meals = Object.assign({}, def.meals, Object.fromEntries(Object.entries(p.meals || {}).filter(([k]) => k in def.meals)));
  return Object.assign({}, def, p);
}
function saveRemPrefs(p) { try { localStorage.setItem(remKey(), JSON.stringify(p)); } catch (e) { } clearTimeout(S.remSync); S.remSync = setTimeout(() => { if (typeof syncReminderPrefs === 'function') syncReminderPrefs(p); }, 800); }
const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {
  const enc = new TextEncoder(); const out = []; let cur = '', n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > 73) { out.push(cur); cur = ' ' + ch; n = 1 + b; } else { cur += ch; n += b; } }
  out.push(cur); return out.join('\r\n');
}
const icsLocal = (date, hm) => date.replace(/-/g, '') + 'T' + hm.replace(':', '') + '00';
function nextDateFor(days) {
  for (let i = 0; i < 7; i++) { const d = addDays(todayStr(), i); if (days.includes(WEEKDAYS[parseDay(d).getDay()])) return d; }
  return todayStr();
}
function mealDescription(plan, m) {
  const os = m.options.filter(o => o.items.length).slice(0, 3);
  return os.map(o => `${o.name}: ${o.items.map(i => { const f = foodOf(i.food_id); return f ? `${f.name} ${fmtN(i.grams)} g` : ''; }).filter(Boolean).join(', ')}`).join('\n');
}
function buildIcs(p, plan) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const url = location.origin + location.pathname + '#/hoy';
  const ev = [];
  const add = (key, date, time, rrule, title, desc, alarm = 0) => {
    if (!time) return;
    const end = toHHMM(minOf(time) + 15);
    ev.push(['BEGIN:VEVENT', `UID:dp-${S.profile.id}-${key}@deucepoint`, `DTSTAMP:${now}`, `DTSTART:${icsLocal(date, time)}`, `DTEND:${icsLocal(minOf(time) + 15 >= 1440 ? addDays(date, 1) : date, end)}`, `RRULE:${rrule}`,
      `SUMMARY:${icsEsc(title)}`, `DESCRIPTION:${icsEsc((desc ? desc + '\n\n' : '') + 'Abrir la app: ' + url)}`, `URL:${url}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, `TRIGGER:${alarm ? '-PT' + alarm + 'M' : 'PT0M'}`, 'END:VALARM', 'END:VEVENT'].map(icsFold).join('\r\n'));
  };
  const today = todayStr();
  if (plan) plan.meals.forEach((m, i) => { const r = p.meals[m.name]; if (r && r.on) add('meal-' + i, today, hhmm(r.time), 'FREQ=DAILY', `${m.name} · ${BRAND.name}`, mealDescription(plan, m)); });
  if (p.water.on) String(p.water.times || '').split(/[,;\s]+/).map(hhmm).filter(Boolean).forEach((t, i) => add('water-' + i, today, t, 'FREQ=DAILY', `Agua · ${BRAND.name}`, `Toma un vaso de agua (250 ml) y regístralo en la app.${plan && plan.water_ml ? ` Objetivo diario: ${(num(plan.water_ml) / 1000).toLocaleString('es-CO')} L.` : ''}`));
  if (p.train.on && p.train.days.length) add('train', nextDateFor(p.train.days), hhmm(p.train.time), 'FREQ=WEEKLY;BYDAY=' + p.train.days.map(d => ICS_DAYS[d]).join(','), `Entrenamiento · ${BRAND.name}`, 'Abre la sesión del día en Entreno y registra tus series.', 30);
  if (p.checkin.on) add('checkin', nextDateFor([p.checkin.day]), hhmm(p.checkin.time), 'FREQ=WEEKLY;BYDAY=' + ICS_DAYS[p.checkin.day], `Check-in semanal · ${BRAND.name}`, 'Pésate en ayunas y completa el check-in semanal en la app.');
  if (p.log.on) add('log', today, hhmm(p.log.time), 'FREQ=DAILY', `Registro del día · ${BRAND.name}`, 'Marca las comidas que consumiste hoy y el agua.');
  return { text: ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${BRAND.name}//Recordatorios//ES`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', icsFold('X-WR-CALNAME:' + icsEsc(BRAND.name)), ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n', count: ev.length };
}
async function vRecordatorios() {
  const def = await reminderDefaults(); const plan = def.plan;
  const p = loadRemPrefs(def.prefs);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const row = (k, label, time, extra = '') => `<div class="rem-row"><label class="check"><input type="checkbox" data-rk="${esc(k)}" ${(k.startsWith('meal:') ? p.meals[k.slice(5)].on : p[k].on) ? 'checked' : ''}> ${esc(label)}</label><input class="input time-in" type="time" data-rt="${esc(k)}" value="${esc(time)}">${extra}</div>`;
  const draw = () => { paint(`<a class="linkbtn" href="#/perfil">← Perfil</a><div id="push-box"></div>
    <p class="small muted">Los recordatorios se agregan al calendario de tu celular con alarma, de modo que suenan aunque la app esté cerrada. Configura los horarios y descarga el archivo.</p>
    <div class="card"><h3>Comidas</h3>${plan ? plan.meals.map(m => row('meal:' + m.name, m.name, p.meals[m.name] ? p.meals[m.name].time : '')).join('') : '<p class="small muted">Aún no tienes un plan nutricional activo.</p>'}
      <p class="small muted">Cada recordatorio incluye las opciones de menú con sus porciones.</p></div>
    <div class="card"><h3>Agua</h3><label class="check"><input type="checkbox" data-rk="water" ${p.water.on ? 'checked' : ''}> Recordar tomar agua</label>
      <label class="field"><span>Horas (separadas por coma)</span><input class="input" data-rw value="${esc(p.water.times)}" placeholder="08:30, 11:00, 13:30, 16:00, 18:30"></label></div>
    <div class="card"><h3>Entrenamiento</h3>${row('train', 'Recordar 30 minutos antes de entrenar', p.train.time)}
      <div class="chips">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(dn => `<button class="chip${p.train.days.includes(dn) ? ' on' : ''}" data-act="tday" data-v="${dn}">${dn.slice(0, 3)}</button>`).join('')}</div></div>
    <div class="card"><h3>Seguimiento</h3>${row('checkin', 'Check-in semanal', p.checkin.time, `<select class="input" data-rd>${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(dn => `<option${dn === p.checkin.day ? ' selected' : ''}>${dn}</option>`).join('')}</select>`)}
      ${row('log', 'Registrar las comidas del día', p.log.time)}</div>
    <button class="btn primary block" data-act="ics">${isIOS ? 'Agregar al calendario del iPhone' : 'Descargar recordatorios (.ics)'}</button>
    ${isIOS ? '<button class="btn block" data-act="icsFile">Descargar archivo .ics</button>' : ''}
    <div class="card"><h3>Cómo agregarlos</h3>
      <p class="small"><b>iPhone:</b> pulsa el botón y elige «Agregar todo». Si la app está instalada en la pantalla de inicio y no se abre el calendario, abre la app desde Safari y repite el paso.</p>
      <p class="small"><b>Android:</b> descarga el archivo y ábrelo con Google Calendar o el calendario del teléfono, y confirma «Importar». Si no se abre, en un computador entra a calendar.google.com › Configuración › Importar y exportar, y selecciona el archivo.</p>
      <p class="small muted">Si tu plan cambia, descarga el archivo de nuevo: los recordatorios con el mismo nombre se actualizan. Para quitarlos, elimina los eventos «${esc(BRAND.name)}» del calendario.</p></div>`, {
    change: t => {
      if (t.dataset.rk) { const k = t.dataset.rk; if (k.startsWith('meal:')) p.meals[k.slice(5)].on = t.checked; else p[k].on = t.checked; }
      if (t.dataset.rt) { const k = t.dataset.rt; if (k.startsWith('meal:')) p.meals[k.slice(5)].time = t.value; else p[k].time = t.value; }
      if ('rw' in t.dataset) p.water.times = t.value;
      if ('rd' in t.dataset) p.checkin.day = t.value;
      saveRemPrefs(p);
    },
    click: {
      tday: el => { const v = el.dataset.v; p.train.days = p.train.days.includes(v) ? p.train.days.filter(x => x !== v) : p.train.days.concat(v); saveRemPrefs(p); keepScroll(async () => draw()); },
      ics: () => {
        const r = buildIcs(p, plan); if (!r.count) return toast('Activa al menos un recordatorio', 'error');
        if (isIOS) location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(r.text);
        else downloadFile(`Recordatorios ${BRAND.name}.ics`, r.text, 'text/calendar');
        toast(`${r.count} recordatorios generados`);
      },
      icsFile: () => { const r = buildIcs(p, plan); if (!r.count) return toast('Activa al menos un recordatorio', 'error'); downloadFile(`Recordatorios ${BRAND.name}.ics`, r.text, 'text/calendar'); },
      ...(typeof pushHandlers === 'function' ? pushHandlers(() => { syncReminderPrefs(p); draw(); }) : {})
    }
  }, 'Recordatorios');
    if (typeof pushCardHtml === 'function') pushCardHtml().then(h => { const b = $('#push-box'); if (b) b.innerHTML = h; });
  };
  draw();
}

/* =====================================================================
   Videos de técnica
   ===================================================================== */
function videoEmbed(url) {
  const u = String(url || '').trim(); if (!u) return '';
  let m = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return `<div class="vid${/shorts\//.test(u) ? ' tall' : ''}"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1&modestbranding=1" title="Video de técnica" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `<div class="vid"><iframe src="https://player.vimeo.com/video/${m[1]}" title="Video de técnica" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  if (/^https:\/\/.+\.(mp4|webm|mov)(\?.*)?$/i.test(u)) return `<div class="vid"><video src="${esc(u)}" controls playsinline preload="metadata"></video></div>`;
  return '';
}
const ytSearch = name => 'https://www.youtube.com/results?search_query=' + encodeURIComponent('técnica ' + name);
function vVideos() {
  let f = sessionStorage.getItem('vid_f') || 'sin', g = '', q = '';
  const groups = [...new Set(S.exercises.map(e => e.muscle_group))];
  const listHtml = () => {
    const ql = norm(q);
    const list = S.exercises.filter(e => (f === 'todos' || (f === 'sin' ? !e.video_url : !!e.video_url)) && (!g || e.muscle_group === g) && (!ql || norm(e.name).includes(ql)));
    const withV = S.exercises.filter(e => e.video_url).length;
    return `<p class="small muted">${withV} de ${S.exercises.length} ejercicios con video · ${list.length} en la lista</p>` + list.slice(0, 150).map(e => `<div class="card vid-row">
      <div class="day-h"><b>${esc(e.name)}</b><span class="tag">${esc(e.muscle_group)}</span></div>
      <div class="vid-in"><input class="input" type="url" data-vid="${e.id}" value="${esc(e.video_url || '')}" placeholder="Pega el enlace de YouTube o Vimeo"><a class="btn sm" href="${ytSearch(e.name)}" target="_blank" rel="noopener">Buscar</a>${e.video_url ? `<button class="btn sm" data-act="see" data-id="${e.id}">Ver</button>` : ''}</div></div>`).join('') + (list.length > 150 ? '<p class="small muted">Usa el buscador para ver más ejercicios.</p>' : '');
  };
  const refresh = () => { $('#vid-list').innerHTML = listHtml(); };
  paint(`<a class="linkbtn" href="#/biblioteca">← Biblioteca</a>
    <p class="small muted">Pega el enlace del video de cada ejercicio (YouTube, YouTube Shorts o Vimeo). Se reproduce dentro de la app en la información del ejercicio y durante la sesión. «Buscar» abre YouTube con el nombre del ejercicio para copiar el enlace (Compartir › Copiar enlace).</p>
    <div class="seg">${[['sin', 'Sin video'], ['con', 'Con video'], ['todos', 'Todos']].map(([k, l]) => `<button class="${k === f ? 'on' : ''}" data-act="f" data-f="${k}">${l}</button>`).join('')}</div>
    <input class="input" id="vq" placeholder="Buscar ejercicio">
    <div class="chips scroll">${['', ...groups].map(x => `<button class="chip${x === g ? ' on' : ''}" data-act="g" data-g="${esc(x)}">${esc(x || 'Todos')}</button>`).join('')}</div>
    <div id="vid-list">${listHtml()}</div>`, {
    input: t => { if (t.id === 'vq') { q = t.value; refresh(); } },
    change: async t => {
      if (!t.dataset.vid) return;
      const v = t.value.trim();
      if (v && !/^https?:\/\//i.test(v)) { toast('El enlace debe empezar por https://', 'error'); return; }
      await DB.update('exercises', t.dataset.vid, { video_url: v || null });
      S.exById[t.dataset.vid].video_url = v || null;
      toast(v ? (videoEmbed(v) ? 'Video guardado' : 'Enlace guardado (se abrirá fuera de la app)') : 'Video retirado');
    },
    click: {
      f: el => { f = el.dataset.f; sessionStorage.setItem('vid_f', f); document.querySelectorAll('[data-act=f]').forEach(x => x.classList.toggle('on', x === el)); refresh(); },
      g: el => { g = el.dataset.g; document.querySelectorAll('[data-act=g]').forEach(x => x.classList.toggle('on', x === el)); refresh(); },
      see: el => exInfoModal(el.dataset.id)
    }
  }, 'Videos de técnica');
}
