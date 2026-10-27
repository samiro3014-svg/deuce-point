/* =====================================================================
   Deuce Point · Personalización por asesorado
   Módulos visibles, hábitos diarios y metas medibles del plan, uso de la API
   ===================================================================== */

/* ---------- módulos visibles por asesorado (Ajustes: mods_off = { id: [módulos ocultos] }) ---------- */
const MODULES = [
  ['bienestar', 'Bienestar diario'], ['pasos', 'Pasos'], ['suplementos', 'Suplementos'], ['tenis', 'Rendimiento deportivo'],
  ['ciclo', 'Ciclo menstrual'], ['logros', 'Racha y logros'], ['lecciones', 'Lecciones'], ['retos', 'Retos'], ['fotos', 'Fotos de progreso']
];
const modOn = (k, cid) => { const id = cid || (S.profile && S.profile.id); const off = ((S.settings && S.settings.mods_off) || {})[id] || []; return !off.includes(k); };
function modulesCardHtml(cid) {
  const off = ((S.settings.mods_off || {})[cid]) || [];
  return `<details class="mods"><summary>Módulos visibles para el asesorado${off.length ? ` · ${off.length} ${off.length === 1 ? 'oculto' : 'ocultos'}` : ''}</summary>
    <p class="small muted">Lo que no aplica a esta persona deja de aparecer en su pantalla Hoy y en Progreso. Los registros existentes se conservan.</p>
    <div class="chips">${MODULES.map(([k, l]) => `<button class="chip${off.includes(k) ? '' : ' on'}" data-act="modT" data-k="${k}" data-c="${cid}">${esc(l)}</button>`).join('')}</div></details>`;
}
const modulesHandlers = () => ({
  modT: async el => {
    const all = Object.assign({}, S.settings.mods_off || {}); const cur = new Set(all[el.dataset.c] || []); const k = el.dataset.k;
    if (cur.has(k)) cur.delete(k); else cur.add(k); all[el.dataset.c] = [...cur]; if (!cur.size) delete all[el.dataset.c];
    await saveSettings({ mods_off: all }); el.classList.toggle('on', !cur.has(k));
    const s = el.closest('details').querySelector('summary'); if (s) s.textContent = 'Módulos visibles para el asesorado' + (cur.size ? ` · ${cur.size} ${cur.size === 1 ? 'oculto' : 'ocultos'}` : '');
  }
});

/* ---------- hábitos ---------- */
const habKey = (t, i) => 'h' + i + '_' + nrm(t).replace(/[^a-z0-9]+/g, '').slice(0, 16);
function parseFreq(s) {
  const n = nrm(s);
  const m = n.match(/(\d+)\s*(?:veces|x)?\s*(?:por|a la|\/|en la)?\s*semana/); if (m) return { per: Math.min(7, +m[1]), days: [] };
  if (/lunes a viernes|entre semana|habiles/.test(n)) return { per: 0, days: WEEKDAYS.slice(1, 6) };
  const days = wdList(s); return { per: 0, days };
}
const freqText = h => { if (h.per) return `${h.per} veces por semana`; const ds = h.days || []; if (!ds.length || ds.length === 7) return 'Diario'; if (ds.length === 6) return 'Todos los días excepto ' + WEEKDAYS.find(d => !ds.includes(d)).toLowerCase(); return WEEKDAYS.filter(d => ds.includes(d)).map(d => d.slice(0, 3)).join(', '); };
const habitDue = (h, date) => h.per || !(h.days || []).length || h.days.includes(WEEKDAYS[parseDay(date).getDay()]);
function habitExpected(h, dates) { if (h.per) return h.per * dates.length / 7; return dates.filter(d => habitDue(h, d)).length; }
function habitPct(h, dailies, dates) {
  const done = dates.filter(d => { const x = dailies.find(y => y.log_date === d); return x && x.choices && x.choices.__h && x.choices.__h[h.k]; }).length;
  const exp = habitExpected(h, dates); return exp ? Math.min(100, Math.round(done / exp * 100)) : null;
}
/* Expediente vigente con hábitos o metas (el más reciente visible para el asesorado) */
async function activeCasePlan(cid, forClient) {
  if (S.needsV7) return null;
  let reps = await casesOf(cid); if (forClient) reps = reps.filter(r => r.visible).map(clientCase);
  return reps.find(r => ((r.data || {}).habits || []).length || ((r.data || {}).goals || []).length) || null;
}
async function habitsCardHtml(date, daily) {
  if (S.needsV7) return '';
  const rep = await activeCasePlan(S.profile.id, true); const hs = ((rep && rep.data.habits) || []).filter(h => habitDue(h, date)); if (!hs.length) return '';
  const done = ((daily && daily.choices) || {}).__h || {};
  const n = hs.filter(h => done[h.k]).length;
  return `<div class="card habits"><div class="mb-h"><h3>Hábitos de hoy</h3><span><b>${n}</b> / ${hs.length}</span></div>
    ${hs.map(h => `<div class="fi${done[h.k] ? ' done' : ''}"><button class="chk" data-act="habT" data-k="${h.k}" aria-label="Marcar ${esc(h.text)}">✓</button><div class="fi-b"><b>${esc(h.text)}</b><small>${esc(freqText(h))}</small></div></div>`).join('')}</div>`;
}
const habitHandlers = (cid, date, choices, after) => ({
  habT: async el => { const h = Object.assign({}, choices.__h || {}); if (h[el.dataset.k]) delete h[el.dataset.k]; else h[el.dataset.k] = 1; await upsertDaily(cid, date, { choices: Object.assign({}, choices, { __h: h }) }); after(); }
});

/* ---------- metas medibles ---------- */
const GOAL_AUTO = [
  [/peso/, 'peso', 'kg'], [/cintura/, 'cintura', 'cm'], [/grasa/, 'grasa', '%'], [/paso/, 'pasos', 'pasos/día'],
  [/agua|hidrat/, 'agua', 'L/día'], [/cumplim|adherenc/, 'cumplimiento', '%'], [/habito/, 'habitos', '%']
];
const goalAuto = g => { const n = nrm(g.variable); const x = GOAL_AUTO.find(([re]) => re.test(n)); return x ? x[1] : null; };
/* Datos de los últimos 7 días para calcular metas y cumplimiento de hábitos */
async function habitGoalCtx(cid, rep) {
  const end = todayStr(), start = addDays(end, -6), dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const q = (t, o) => DB.select(t, o).catch(() => []);
  const [bodies, dailies, logs, plan] = await Promise.all([q('body_logs', { eq: { client_id: cid }, order: 'log_date', asc: false, limit: 30 }), q('daily_logs', { eq: { client_id: cid }, gte: { log_date: addDays(end, -13) } }), q('food_logs', { eq: { client_id: cid }, gte: { log_date: start } }), activePlanFor(cid).catch(() => null)]);
  const hs = (rep && rep.data && rep.data.habits) || [];
  const hp = hs.map(h => habitPct(h, dailies, dates)).filter(v => v != null);
  const d7 = dailies.filter(x => x.log_date >= start);
  const avg = (arr, f) => { const v = arr.map(f).filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const comps = plan ? dates.filter(d => logs.some(l => l.log_date === d)).map(d => dayCompletion(plan, logs.filter(l => l.log_date === d), d7.find(x => x.log_date === d), d)).filter(v => v != null) : [];
  const last = k => { const b = bodies.find(x => num(x[k]) > 0); return b ? num(b[k]) : null; };
  return {
    dates, dailies,
    auto: { peso: last('weight_kg'), cintura: last('waist_cm'), grasa: last('body_fat'), pasos: avg(d7, x => num(x.steps)), agua: (v => v == null ? null : v / 1000)(avg(d7, x => num(x.water_ml))), cumplimiento: comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : null, habitos: hp.length ? hp.reduce((a, b) => a + b, 0) / hp.length : null },
    habitPct: h => habitPct(h, dailies, dates)
  };
}
function goalState(g, ctx) {
  const a = goalAuto(g); let cur = a && ctx.auto[a] != null ? ctx.auto[a] : (g.current != null && g.current !== '' ? num(g.current) : null);
  if (a === 'agua' && cur != null && /ml/i.test(g.unit || '')) cur = Math.round(cur * 1000);   // el registro automático está en litros
  const s = num(g.start), t = num(g.target);
  let p = null; if (cur != null && t !== s) p = Math.max(0, Math.min(1, (cur - s) / (t - s))); else if (cur != null && t === s) p = cur === t ? 1 : 0;
  return { cur, p, auto: !!a };
}
const fmtG = v => v == null ? '—' : Math.abs(v) >= 100 ? fmtInt(v) : fmtN(v);
function goalsHtml(goals, ctx, coach, repId) {
  return `<div class="gbars">${goals.map(g => { const s = goalState(g, ctx); return `<div class="gb-row"><div class="gb-h"><b>${esc(g.variable)}</b><span>${fmtG(s.cur)} → ${fmtG(num(g.target))} ${esc(g.unit || '')}</span></div>
      <div class="hb-t"><div class="hb-f" style="width:${s.p == null ? 0 : Math.max(2, s.p * 100).toFixed(1)}%"></div></div>
      <small class="muted">Inicio ${fmtG(num(g.start))}${g.date ? ' · meta al ' + esc(fmtDM(parseDay(g.date))) : ''}${s.p != null ? ' · ' + Math.round(s.p * 100) + ' % del camino' : ''}${s.auto ? ' · se actualiza con los registros' : ''}${coach && !s.auto ? ` · <button class="linkbtn" data-act="gCur" data-id="${repId}" data-k="${g.k}">Actualizar valor</button>` : ''}${coach ? ` · <button class="linkbtn" data-act="gDel" data-id="${repId}" data-k="${g.k}">Quitar</button>` : ''}</small></div>`; }).join('')}</div>`;
}
async function goalsCardHtml() {
  if (S.needsV7) return '';
  const rep = await activeCasePlan(S.profile.id, true); const gs = (rep && rep.data.goals) || []; if (!gs.length) return '';
  const ctx = await habitGoalCtx(S.profile.id, rep);
  return `<a class="card goals-c" href="#/expediente/${rep.id}"><h3>Tus metas</h3>${goalsHtml(gs.slice(0, 4), ctx, false)}</a>`;
}

/* ---------- edición de hábitos y metas desde el expediente ---------- */
const habitGoalHandlers = (reps) => {
  const R = id => reps.find(r => r.id === id);
  const save = async (r, patch) => { await DB.update('case_reports', r.id, { data: Object.assign({}, r.data || {}, patch) }); keepScroll(() => route()); };
  return {
    hAdd: async el => {
      const r = R(el.dataset.id); const t = prompt('Hábito (acción concreta para el asesorado):', ''); if (!t || !t.trim()) return;
      const f = prompt('Frecuencia: Diario, días (Lunes, Miércoles) o «3 por semana»:', 'Diario') || 'Diario';
      const hs = ((r.data || {}).habits || []).slice(); hs.push(Object.assign({ k: habKey(t, hs.length + Date.now() % 1000), text: t.trim(), freq: f.trim() }, parseFreq(f)));
      await save(r, { habits: hs });
    },
    hDel: async el => { const r = R(el.dataset.id); await save(r, { habits: ((r.data || {}).habits || []).filter(h => h.k !== el.dataset.k) }); },
    gAdd: async el => {
      const r = R(el.dataset.id); const v = prompt('Variable (peso, cintura, % grasa, pasos, agua, cumplimiento, hábitos u otra):', ''); if (!v || !v.trim()) return;
      const s = prompt('Valor inicial:', ''); const t = prompt('Meta:', ''); if (t == null || t.trim() === '') return;
      const u = prompt('Unidad (kg, cm, %, pasos/día…):', (GOAL_AUTO.find(([re]) => re.test(nrm(v))) || [])[2] || '') || ''; const d = prompt('Fecha límite (AAAA-MM-DD, opcional):', '') || '';
      const gs = ((r.data || {}).goals || []).slice(); gs.push({ k: 'g' + Date.now().toString(36), variable: v.trim(), start: num(s), target: num(t), unit: u.trim(), date: isoDate(d) || null, current: null });
      await save(r, { goals: gs });
    },
    gDel: async el => { const r = R(el.dataset.id); await save(r, { goals: ((r.data || {}).goals || []).filter(g => g.k !== el.dataset.k) }); },
    gCur: async el => { const r = R(el.dataset.id); const v = prompt('Valor actual:', ''); if (v == null || v.trim() === '') return; await save(r, { goals: ((r.data || {}).goals || []).map(g => g.k === el.dataset.k ? Object.assign({}, g, { current: num(v), current_date: todayStr() }) : g) }); }
  };
};
function habitsGoalsBlocksHtml(rep, ctx, coach) {
  const d = rep.data || {}; const H = new Set(d.hidden || []);
  const tg = k => coach ? ` <button class="chip sm vis${H.has(k) ? '' : ' on'}" data-act="cSec" data-id="${rep.id}" data-k="${k}">${H.has(k) ? 'Oculto' : 'Visible'}</button>` : '';
  const cc = k => coach && H.has(k) ? 'card hid' : 'card';
  let h = '';
  const hs = d.habits || [], gs = d.goals || [];
  if (gs.length || coach) h += `<div class="${cc('metas')}"><h3>Metas${tg('metas')}</h3>${gs.length ? goalsHtml(gs, ctx, coach, rep.id) : '<p class="small muted">Sin metas medibles.</p>'}${coach ? `<div class="row-btns"><button class="btn sm" data-act="gAdd" data-id="${rep.id}">+ Meta</button></div>` : ''}</div>`;
  if (hs.length || coach) h += `<div class="${cc('habitos')}"><h3>Hábitos${tg('habitos')}</h3>${hs.length ? `<table class="tbl"><tbody>${hs.map(x => { const p = ctx.habitPct(x); return `<tr><td>${esc(x.text)}<br><small class="muted">${esc(freqText(x))}</small></td><td class="small">${p == null ? '—' : p + ' %'}<br><small class="muted">7 días</small></td>${coach ? `<td><button class="icon-btn danger" data-act="hDel" data-id="${rep.id}" data-k="${x.k}" aria-label="Quitar">✕</button></td>` : ''}</tr>`; }).join('')}</tbody></table>${coach ? '' : '<p class="small muted">Se marcan cada día en la pantalla Hoy.</p>'}` : '<p class="small muted">Sin hábitos asignados.</p>'}${coach ? `<div class="row-btns"><button class="btn sm" data-act="hAdd" data-id="${rep.id}">+ Hábito</button></div>` : ''}</div>`;
  return h;
}

/* ---------- uso de la API (conversiones aplicadas, registradas en cada expediente) ---------- */
async function apiUsageCardHtml() {
  if (S.needsV7) return '';
  const reps = (await DB.select('case_reports', {}).catch(() => [])).filter(r => r.data && r.data.ai);
  let local = []; try { local = JSON.parse(localStorage.getItem('dp_api_log') || '[]'); } catch (e) { }
  const months = {}; reps.forEach(r => { const m = String(r.created_at || r.report_date).slice(0, 7); const x = months[m] || (months[m] = { n: 0, usd: 0, tin: 0, tout: 0 }); x.n++; x.usd += num(r.data.ai.usd); x.tin += num(r.data.ai.input); x.tout += num(r.data.ai.output); });
  const keys = Object.keys(months).sort().slice(-6); const cur = months[todayStr().slice(0, 7)] || { n: 0, usd: 0 };
  const tried = local.filter(x => String(x.at).slice(0, 7) === todayStr().slice(0, 7));
  return `<div class="card"><h3>Conversión con IA · uso</h3>
    <div class="stats3"><div><b>${cur.n}</b><small>Documentos aplicados este mes</small></div><div><b>${fmtUsd(cur.usd)}</b><small>USD este mes</small></div><div><b>${cur.n ? fmtUsd(cur.usd / cur.n) : '—'}</b><small>USD por documento</small></div></div>
    ${keys.length ? `<p class="small muted">Costo por mes (USD)</p>${hbars(keys.map(k => ({ label: k, value: months[k].usd, text: fmtUsd(months[k].usd) })))}` : '<p class="small muted">Todavía no hay conversiones con IA.</p>'}
    ${tried.length > cur.n ? `<p class="small muted">Conversiones realizadas desde este dispositivo este mes (incluye las no aplicadas): ${tried.length} · ${fmtUsd(tried.reduce((a, x) => a + num(x.usd), 0))} USD.</p>` : ''}
    <p class="small muted">Valores estimados con la tarifa publicada del modelo. El consumo exacto está en platform.claude.com › Usage. Los PDF con el anexo «Datos de carga» no consumen la API.</p></div>`;
}
function logApiUse(u, cid) { try { const l = JSON.parse(localStorage.getItem('dp_api_log') || '[]'); l.push({ at: new Date().toISOString(), cid, usd: u.usd, input: u.input, output: u.output, model: u.model }); localStorage.setItem('dp_api_log', JSON.stringify(l.slice(-300))); } catch (e) { } }
