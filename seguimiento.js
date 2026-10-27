/* =====================================================================
   Deuce Point v9 · Seguimiento del entrenador, cuestionarios, acudientes,
   resultados con consentimiento y exportación de datos
   ===================================================================== */

/* ---------- semáforo de la lista de asesorados ---------- */
async function riskLights(clients) {
  const out = {}; if (!clients.length) return out;
  const start = addDays(todayStr(), -6);
  const q = (t, o) => DB.select(t, o).catch(() => []);
  const [logs, dailies, wel, pains, ws] = await Promise.all([q('food_logs', { gte: { log_date: start } }), q('daily_logs', { gte: { log_date: start } }), S.needsV6 ? [] : q('wellness', { gte: { log_date: addDays(todayStr(), -3) } }), S.needsV6 ? [] : q('pain_reports', {}), q('workouts', { gte: { started_at: parseDay(addDays(todayStr(), -6)).toISOString() } })]);
  for (const c of clients) {
    const why = []; let lvl = 0; const up = (n, t) => { lvl = Math.max(lvl, n); why.push(t); };
    const days = new Set(logs.filter(l => l.client_id === c.id).map(l => l.log_date)).size;
    const tr = ws.filter(w => w.client_id === c.id).length;
    if (days <= 2 && !tr) up(2, `${days}/7 días con registro y sin sesiones`); else if (days <= 2) up(1, `${days}/7 días con registro de comida`); else if (days <= 4) up(1, `${days}/7 días con registro`);
    const w = wel.filter(x => x.client_id === c.id).map(x => typeof wellnessLight === 'function' ? wellnessLight(x) : null).filter(Boolean);
    if (w.some(x => x.cls === 'bad')) up(2, 'Bienestar en rojo'); else if (w.some(x => x.cls === 'warnb')) up(1, 'Bienestar en amarillo');
    const p = pains.filter(x => x.client_id === c.id && !x.resolved_at && num(x.intensity) >= 5); if (p.length) up(p.some(x => num(x.intensity) >= 7) ? 2 : 1, 'Molestia activa');
    const off = dailies.filter(x => x.client_id === c.id && x.choices && x.choices.__off).length; if (off >= 2) up(1, `${off} días sin poder seguir el plan`);
    out[c.id] = { cls: ['ok', 'warnb', 'bad'][lvl], why: why.join(' · ') || 'Registro y bienestar al día' };
  }
  return out;
}

/* ---------- notas privadas del entrenador ---------- */
async function coachNotesTab(cid) {
  if (S.needsV9) return { html: '<div class="card empty"><p>Ejecuta la migración v9 para activar las notas privadas.</p></div>' };
  const ns = await DB.select('coach_notes', { eq: { client_id: cid }, order: 'created_at', asc: false }).catch(() => []);
  return {
    html: `<div class="card"><h3>Notas privadas</h3><p class="small muted">Decisiones, observaciones y acuerdos. El asesorado no las ve.</p>
      <textarea class="input" id="cn-t" rows="3" placeholder="Ej.: 27-10 · se subió a 2.800 kcal por baja disponibilidad energética; revisar peso en 2 semanas."></textarea><button class="btn primary block" data-act="cnAdd">Guardar nota</button></div>
      ${ns.map(n => `<div class="card note-c"><small class="muted">${esc(new Date(n.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small><p class="pre small">${esc(n.body)}</p>${isCoach() ? `<button class="linkbtn small" data-act="cnDel" data-id="${n.id}">Eliminar</button>` : ''}</div>`).join('') || '<p class="small muted">Sin notas.</p>'}`,
    click: {
      cnAdd: async () => { const t = $('#cn-t').value.trim(); if (!t) return; await DB.insert('coach_notes', { client_id: cid, body: t.slice(0, 4000) }); route(); },
      cnDel: async el => { if (!confirm('¿Eliminar la nota?')) return; await DB.remove('coach_notes', el.dataset.id); route(); }
    }
  };
}

/* ---------- cuestionarios: plantillas, envío, respuesta y puntaje ---------- */
/* Formato de plantilla (texto):
   TITULO: Nombre del cuestionario
   INSTRUCCION: texto para el asesorado
   P: pregunta | opción=puntos; opción=puntos
   R: mínimo-máximo | interpretación                                       */
function parseQTemplate(text) {
  const t = { title: '', intro: '', items: [], ranges: [] };
  for (let ln of String(text || '').split(/\r?\n/)) {
    ln = ln.trim(); if (!ln) continue; const m = ln.match(/^([A-ZÁÉÍÓÚ]+)\s*:\s*(.*)$/i); if (!m) continue; const k = nrm(m[1]).toUpperCase(), v = m[2].trim();
    if (k === 'TITULO') t.title = v; else if (k === 'INSTRUCCION') t.intro = v;
    else if (k === 'P') { const [q, o] = v.split('|').map(x => x.trim()); const opts = String(o || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const mm = x.match(/^(.*?)=\s*(-?\d+(?:[.,]\d+)?)$/); return mm ? { t: mm[1].trim(), p: num(mm[2]) } : { t: x, p: 0 }; }); if (q && opts.length) t.items.push({ q, opts }); }
    else if (k === 'R') { const [r, txt0] = v.split('|').map(x => x.trim()); const mm = String(r).match(/(-?\d+(?:[.,]\d+)?)\s*[-–a]\s*(-?\d+(?:[.,]\d+)?)/); if (mm) t.ranges.push({ min: num(mm[1]), max: num(mm[2]), text: txt0 || '' }); }
  }
  if (!t.title || !t.items.length) throw new Error('La plantilla necesita TITULO y al menos una línea P.');
  return t;
}
const qTemplateText = t => [`TITULO: ${t.title}`, t.intro ? `INSTRUCCION: ${t.intro}` : '', ...t.items.map(i => `P: ${i.q} | ${i.opts.map(o => `${o.t}=${o.p}`).join('; ')}`), ...t.ranges.map(r => `R: ${r.min}-${r.max} | ${r.text}`)].filter(Boolean).join('\n');
function qScore(tpl, ans) { let s = 0, n = 0; tpl.items.forEach((it, i) => { const a = ans[i]; if (a != null && it.opts[a]) { s += num(it.opts[a].p); n++; } }); const r = tpl.ranges.find(x => s >= x.min && s <= x.max); return { score: s, answered: n, result: r ? r.text : '' }; }
function qTemplatesCardHtml() {
  const ts = S.settings.qtemplates || [];
  return `<div class="card"><h3>Cuestionarios</h3><p class="small muted">Plantillas para enviar a los asesorados (por ejemplo LEAF-Q, calidad de sueño o estrés). Copia el instrumento oficial con este formato: <code>TITULO:</code>, <code>INSTRUCCION:</code>, una línea <code>P: pregunta | opción=puntos; opción=puntos</code> por pregunta y <code>R: mín-máx | interpretación</code> por rango.</p>
    ${ts.map((t, i) => `<div class="pick-row"><div><b>${esc(t.title)}</b><small class="muted"> · ${t.items.length} preguntas</small></div><button class="btn sm" data-act="qtEdit" data-i="${i}">Editar</button><button class="icon-btn danger" data-act="qtDel" data-i="${i}" aria-label="Eliminar">✕</button></div>`).join('') || '<p class="small muted">Sin plantillas.</p>'}
    <button class="btn block" data-act="qtNew">+ Nueva plantilla</button></div>`;
}
const qTemplateHandlers = {
  qtNew: () => qTemplateModal(-1), qtEdit: el => qTemplateModal(+el.dataset.i),
  qtDel: async el => { if (!confirm('¿Eliminar la plantilla?')) return; const ts = (S.settings.qtemplates || []).slice(); ts.splice(+el.dataset.i, 1); await saveSettings({ qtemplates: ts }); route(); }
};
function qTemplateModal(i) {
  const t = i >= 0 ? S.settings.qtemplates[i] : null;
  modal(`${modalHead(t ? 'Editar plantilla' : 'Nueva plantilla')}<textarea class="input code" id="qt-t" rows="14" placeholder="TITULO: Cuestionario de ejemplo&#10;INSTRUCCION: Responde según las últimas 4 semanas.&#10;P: ¿Pregunta 1? | Nunca=0; A veces=1; Siempre=2&#10;R: 0-3 | Sin riesgo&#10;R: 4-10 | Riesgo: revisar con el entrenador">${esc(t ? qTemplateText(t) : '')}</textarea><button class="btn primary block" data-act="qtSave">Guardar</button>`, {
    click: { qtSave: async () => { try { const nt = Object.assign(parseQTemplate($('#qt-t').value), { id: t ? t.id : uid() }); const ts = (S.settings.qtemplates || []).slice(); if (i >= 0) ts[i] = nt; else ts.push(nt); await saveSettings({ qtemplates: ts }); closeModal(); toast('Plantilla guardada'); route(); } catch (e) { toast(e.message, 'error'); } } }
  });
}
async function coachQuestTab(cid) {
  if (S.needsV9) return { html: '<div class="card empty"><p>Ejecuta la migración v9 para activar los cuestionarios.</p></div>' };
  const qs = await DB.select('questionnaires', { eq: { client_id: cid }, order: 'created_at', asc: false }).catch(() => []);
  const ts = S.settings.qtemplates || [];
  return {
    html: `<div class="card"><h3>Enviar cuestionario</h3>${ts.length ? `<select class="input" id="qs-t">${ts.map((t, i) => `<option value="${i}">${esc(t.title)}</option>`).join('')}</select><button class="btn primary block" data-act="qsSend">Enviar al asesorado</button>` : '<p class="small muted">Crea plantillas en Ajustes › Cuestionarios.</p>'}</div>
      ${qs.map(q => { const s = qScore(q.template, q.answers || {}); return `<div class="card"><div class="day-h"><div><b>${esc(q.title)}</b><small class="muted">Enviado ${esc(fmtDateShort(q.created_at))}${q.answered_at ? ' · respondido ' + esc(fmtDateShort(q.answered_at)) : ''}</small></div><span class="badge ${q.status === 'respondido' ? 'ok' : 'warnb'}">${q.status === 'respondido' ? 'Respondido' : 'Pendiente'}</span></div>
        ${q.status === 'respondido' ? `<p><b>Puntaje: ${fmtN(s.score)}</b>${s.result ? ' · ' + esc(s.result) : ''}</p><details><summary class="small">Ver respuestas</summary><table class="tbl small"><tbody>${q.template.items.map((it, i) => `<tr><td>${esc(it.q)}</td><td>${esc((it.opts[(q.answers || {})[i]] || {}).t || '—')}</td></tr>`).join('')}</tbody></table></details>` : ''}
        <button class="linkbtn small" data-act="qsDel" data-id="${q.id}">Eliminar</button></div>`; }).join('')}`,
    click: {
      qsSend: async () => { const t = ts[+$('#qs-t').value]; await DB.insert('questionnaires', { client_id: cid, title: t.title, template: t, answers: {}, status: 'pendiente' }); if (!S.needsV6) await DB.insert('messages', { client_id: cid, sender_id: S.profile.id, body: `Te envié el cuestionario «${t.title}». Lo encuentras en tu pantalla Hoy.` }).catch(() => { }); toast('Cuestionario enviado'); route(); },
      qsDel: async el => { if (!confirm('¿Eliminar el cuestionario?')) return; await DB.remove('questionnaires', el.dataset.id); route(); }
    }
  };
}
async function questCardHtml() {
  if (S.needsV9) return '';
  const qs = (await DB.select('questionnaires', { eq: { client_id: S.profile.id, status: 'pendiente' } }).catch(() => []));
  return qs.map(q => `<a class="card row-link ck-due" href="#/cuestionario/${q.id}"><div><b>Cuestionario: ${esc(q.title)}</b><small class="muted">${q.template.items.length} preguntas · tu entrenador lo usa para ajustar tu plan</small></div><span class="chev">›</span></a>`).join('');
}
async function vCuestionario(id) {
  const q = (await DB.select('questionnaires', { eq: { id } }).catch(() => []))[0];
  if (!q) return paint('<div class="card empty"><p>Cuestionario no encontrado.</p></div>', {}, 'Cuestionario');
  const ans = Object.assign({}, q.answers || {}); const t = q.template;
  const draw = () => paint(`<div class="card"><h3>${esc(t.title)}</h3>${t.intro ? `<p class="small">${esc(t.intro)}</p>` : ''}</div>
    ${t.items.map((it, i) => `<div class="card qi"><p><b>${i + 1}. ${esc(it.q)}</b></p><div class="chips">${it.opts.map((o, j) => `<button class="chip${ans[i] === j ? ' on' : ''}" data-act="qa" data-i="${i}" data-j="${j}">${esc(o.t)}</button>`).join('')}</div></div>`).join('')}
    ${q.status === 'respondido' ? '<p class="small muted center">Ya respondiste este cuestionario. Puedes corregir tus respuestas y enviarlas de nuevo.</p>' : ''}
    <button class="btn primary block" data-act="qSend">Enviar respuestas</button>`, {
    click: {
      qa: el => { ans[+el.dataset.i] = +el.dataset.j; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); },
      qSend: async () => { const miss = t.items.findIndex((_, i) => ans[i] == null); if (miss >= 0) return toast(`Falta la pregunta ${miss + 1}`, 'error'); const s = qScore(t, ans); await DB.update('questionnaires', q.id, { answers: ans, score: s.score, result: s.result, status: 'respondido', answered_at: new Date().toISOString() }); toast('Respuestas enviadas'); location.hash = '#/hoy'; }
    }
  }, 'Cuestionario');
  draw();
}
async function inboxQuestRows(byId) {
  if (S.needsV9) return [];
  try { const since = new Date(Date.now() - 14 * 864e5).toISOString(); return (await DB.select('questionnaires', { eq: { status: 'respondido' }, gte: { answered_at: since } })).filter(q => byId[q.client_id]).map(q => `<a class="ib-row" href="#/asesorado/${q.client_id}/cuestionarios"><span class="ib-tag v">Cuestionario</span><span class="ib-n">${esc(byId[q.client_id].full_name || '')}</span><span class="ib-d">${esc(q.title)}: ${fmtN(q.score)}</span></a>`); } catch (e) { return []; }
}

/* ---------- avisos: plan para revisar, próximo control, «no pude seguir», mensajes sugeridos ---------- */
const AUTO_RULES = [
  ['sinreg', 'Tres días sin registro de comidas', 'Hola {nombre}, no veo registros de comidas en los últimos días. ¿Cómo vas con el plan? Si algo no te está funcionando, cuéntame para ajustarlo.'],
  ['habitos', 'Siete días cumpliendo los hábitos', '{nombre}, completaste tus hábitos durante 7 días seguidos. Ese es el tipo de constancia que produce resultados. Sigue así.'],
  ['meta', 'Meta alcanzada', '{nombre}, alcanzaste tu meta de {meta}. Revisemos el siguiente objetivo en el próximo control.'],
  ['checkin', 'Check-in pendiente por más de 2 días', 'Hola {nombre}, recuerda registrar tu check-in semanal (peso en ayunas y cómo te sentiste). Me sirve para ajustar el plan.']];
function autoMsgCardHtml() {
  const cfg = S.settings.auto_msgs || {};
  return `<div class="card"><h3>Mensajes automáticos</h3><p class="small muted">Se revisan al abrir la lista de asesorados. «Sugerir» los deja en Pendientes con el botón Enviar; «Enviar solo» los envía sin revisión (uno por asesorado y regla cada 7 días). Usa {nombre} y {meta} en el texto.</p>
    ${AUTO_RULES.map(([k, l, d]) => { const c = cfg[k] || {}; const mode = c.mode || 'sugerir'; return `<div class="am-rule"><b>${esc(l)}</b><div class="seg sm">${[['off', 'No'], ['sugerir', 'Sugerir'], ['auto', 'Enviar solo']].map(([m, ml]) => `<button class="${mode === m ? 'on' : ''}" data-act="amMode" data-k="${k}" data-v="${m}">${ml}</button>`).join('')}</div><textarea class="input" rows="2" data-amt="${k}">${esc(c.text || d)}</textarea></div>`; }).join('')}
    <label class="field"><span>Revisar el plan después de (semanas)</span><input class="input" data-s="review_weeks" data-num="1" inputmode="numeric" value="${esc(S.settings.review_weeks ?? 6)}"></label>
    <label class="field"><span>Compensación máxima por evento social (% de las kcal del día)</span><input class="input" data-s="event_max_pct" data-num="1" inputmode="numeric" value="${esc(S.settings.event_max_pct ?? 15)}"></label></div>`;
}
const autoMsgSettingsHandlers = {
  amMode: async el => { const cfg = Object.assign({}, S.settings.auto_msgs || {}); cfg[el.dataset.k] = Object.assign({}, cfg[el.dataset.k] || {}, { mode: el.dataset.v }); await saveSettings({ auto_msgs: cfg }); el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); }
};
document.addEventListener('change', async e => { const k = e.target && e.target.dataset && e.target.dataset.amt; if (!k) return; const cfg = Object.assign({}, S.settings.auto_msgs || {}); cfg[k] = Object.assign({}, cfg[k] || {}, { text: e.target.value.trim() }); await saveSettings({ auto_msgs: cfg }); toast('Guardado'); });
async function autoMsgCandidates(clients) {
  const cfg = S.settings.auto_msgs || {}; const on = k => ((cfg[k] || {}).mode || 'sugerir') !== 'off';
  const log = S.settings.auto_log || {}; const fresh = (cid, k) => { const d = log[cid + ':' + k]; return !d || daysBetween(d, todayStr()) >= 7; };
  const q = (t, o) => DB.select(t, o).catch(() => []);
  const start = addDays(todayStr(), -6); const out = [];
  const [logs, dailies, cks, reps, bodies] = await Promise.all([q('food_logs', { gte: { log_date: addDays(todayStr(), -2) } }), q('daily_logs', { gte: { log_date: start } }), q('checkins', {}), S.needsV7 ? [] : q('case_reports', { eq: { visible: true } }), q('body_logs', { gte: { log_date: addDays(todayStr(), -30) } })]);
  for (const c of clients) {
    const fill = (k, extra = {}) => { const t = ((cfg[k] || {}).text || AUTO_RULES.find(r => r[0] === k)[2]).replace(/\{nombre\}/g, firstName(c.full_name)).replace(/\{meta\}/g, extra.meta || ''); out.push({ cid: c.id, k, text: t, mode: (cfg[k] || {}).mode || 'sugerir', name: c.full_name || c.email, label: AUTO_RULES.find(r => r[0] === k)[1] }); };
    if (on('sinreg') && fresh(c.id, 'sinreg') && !logs.some(l => l.client_id === c.id) && dailies.some(d => d.client_id === c.id) === false) fill('sinreg');
    const rep = reps.filter(r => r.client_id === c.id).find(r => ((r.data || {}).habits || []).length);
    if (rep && on('habitos') && fresh(c.id, 'habitos')) {
      const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i)); const dl = dailies.filter(d => d.client_id === c.id);
      const ok = dates.every(d => { const due = rep.data.habits.filter(h => habitDue(h, d)); const x = dl.find(y => y.log_date === d); const done = x && x.choices && x.choices.__h ? due.filter(h => x.choices.__h[h.k]).length : 0; return !due.length || done / due.length >= 0.8; });
      if (ok) fill('habitos');
    }
    if (rep && on('meta') && fresh(c.id, 'meta')) {
      const w = bodies.filter(b => b.client_id === c.id && num(b.weight_kg)).sort((a, b) => a.log_date < b.log_date ? -1 : 1).pop();
      const g = (rep.data.goals || []).find(g0 => /peso/.test(nrm(g0.variable)) && w && (num(g0.target) >= num(g0.start) ? num(w.weight_kg) >= num(g0.target) : num(w.weight_kg) <= num(g0.target)));
      if (g) fill('meta', { meta: `${g.variable.toLowerCase()} (${fmtN(g.target)} ${g.unit || ''})` });
    }
    if (on('checkin') && fresh(c.id, 'checkin') && typeof checkinStatus === 'function') { const last = cks.filter(x => x.client_id === c.id).sort((a, b) => a.check_date < b.check_date ? 1 : -1)[0]; if (last && daysBetween(last.check_date, todayStr()) >= 9) fill('checkin'); }
  }
  return out;
}
async function sendAutoMsg(cid, k, text) {
  await DB.insert('messages', { client_id: cid, sender_id: S.profile.id, body: text });
  await saveSettings({ auto_log: Object.assign({}, S.settings.auto_log || {}, { [cid + ':' + k]: todayStr() }) });
}
async function inboxV9Rows(byId) {
  const rows = []; const clients = Object.values(byId);
  if (isCoach() && !S.needsV6) {
    const cand = await autoMsgCandidates(clients).catch(() => []);
    for (const c of cand) {
      if (c.mode === 'auto') { await sendAutoMsg(c.cid, c.k, c.text).catch(() => { }); continue; }
      rows.push(`<div class="ib-row"><span class="ib-tag v">Sugerido</span><span class="ib-n">${esc(c.name)} · ${esc(c.label)}</span><button class="btn sm" data-act="amSend" data-c="${c.cid}" data-k="${c.k}" data-t="${esc(c.text)}">Enviar</button></div>`);
    }
  }
  // Plan activo con más semanas de las definidas
  const rw = num(S.settings.review_weeks) || 6;
  const plans = (await DB.select('nutrition_plans', { eq: { active: true } }).catch(() => [])).filter(p => !p.variant_of && byId[p.client_id] && daysBetween(String(p.created_at).slice(0, 10), todayStr()) >= rw * 7);
  plans.forEach(p => rows.push(`<a class="ib-row" href="#/asesorado/${p.client_id}/nutricion"><span class="ib-tag f">Revisar plan</span><span class="ib-n">${esc(byId[p.client_id].full_name || '')}</span><span class="ib-d">${Math.floor(daysBetween(String(p.created_at).slice(0, 10), todayStr()) / 7)} semanas</span></a>`));
  if (!S.needsV9) {
    const metas = await DB.select('client_meta', {}).catch(() => []);
    metas.filter(m => m.next_review && byId[m.client_id] && m.next_review <= addDays(todayStr(), 1)).forEach(m => rows.push(`<a class="ib-row" href="#/asesorado/${m.client_id}/expediente"><span class="ib-tag c">Control</span><span class="ib-n">${esc(byId[m.client_id].full_name || '')}</span><span class="ib-d">${esc(fmtDM(parseDay(m.next_review)))}</span></a>`));
  }
  if (!S.needsV7) {
    const reps = await DB.select('case_reports', { eq: { visible: true } }).catch(() => []);
    reps.filter(r => byId[r.client_id]).forEach(r => (r.data && r.data.goals || []).filter(g => g.date && g.date < todayStr() && daysBetween(g.date, todayStr()) <= 14).forEach(g => rows.push(`<a class="ib-row" href="#/asesorado/${r.client_id}/expediente"><span class="ib-tag r">Meta vencida</span><span class="ib-n">${esc(byId[r.client_id].full_name || '')}</span><span class="ib-d">${esc(g.variable)}</span></a>`)));
  }
  const off = await DB.select('daily_logs', { gte: { log_date: addDays(todayStr(), -6) } }).catch(() => []);
  off.filter(d => d.choices && d.choices.__off && byId[d.client_id]).forEach(d => rows.push(`<a class="ib-row" href="#/diario/${d.client_id}/${d.log_date}"><span class="ib-tag i">No siguió el plan</span><span class="ib-n">${esc(byId[d.client_id].full_name || '')}</span><span class="ib-d">${esc(fmtDM(parseDay(d.log_date)))} · ${esc((d.choices.__off.r || []).join(', '))}</span></a>`));
  return rows;
}
const autoMsgHandlers = () => ({ amSend: async el => { el.disabled = true; await sendAutoMsg(el.dataset.c, el.dataset.k, el.dataset.t); toast('Mensaje enviado'); el.closest('.ib-row').remove(); } });

/* ---------- próximo control ---------- */
async function clientMetaOf(cid) { if (S.needsV9) return null; try { return (await DB.select('client_meta', { eq: { client_id: cid } }))[0] || null; } catch (e) { return null; } }
async function nextReviewHtml(cid) {
  if (S.needsV9) return '';
  const m = await clientMetaOf(cid);
  return `<label class="field nr"><span>Próximo control</span><input class="input" type="date" data-nr="${cid}" value="${esc((m && m.next_review) || '')}"></label>`;
}
document.addEventListener('change', async e => {
  const cid = e.target && e.target.dataset && e.target.dataset.nr; if (!cid) return;
  const ex = await clientMetaOf(cid); const rec = { next_review: e.target.value || null, updated_at: new Date().toISOString() };
  if (ex) await DB.update('client_meta', cid, rec, 'client_id'); else await DB.insert('client_meta', Object.assign({ client_id: cid }, rec));
  toast('Próximo control guardado');
});
async function nextReviewCardHtml() {
  const m = await clientMetaOf(S.profile.id); if (!m || !m.next_review) return '';
  const d = daysBetween(todayStr(), m.next_review); if (d < 0 || d > 3) return '';
  return `<div class="card ck-due"><b>Próximo control: ${esc(fmtDayLong(m.next_review))}</b><small class="muted"> ${d === 0 ? 'Es hoy.' : d === 1 ? 'Es mañana.' : `En ${d} días.`} Registra tu peso en ayunas y tus dudas para la revisión.</small></div>`;
}

/* ---------- comparar expedientes ---------- */
function compareCasesHtml(a, b) {
  const da = a.data || {}, db = b.data || {};
  const ind = (da.indicators || []).map(x => { const y = (db.indicators || []).find(z => nrm(z.name) === nrm(x.name)); return y ? { n: x.name, u: x.unit, a: num(y.value), b: num(x.value), ta: y.value, tb: x.value } : null; }).filter(x => x && (x.a || x.b));
  const solved = (db.alerts || []).filter(x => !(da.alerts || []).some(y => nrm(y.title) === nrm(x.title)));
  const nuevas = (da.alerts || []).filter(x => !(db.alerts || []).some(y => nrm(y.title) === nrm(x.title)));
  let h = `<div class="card cmp"><h3>Cambios desde el ${esc(fmtDateLong(b.report_date))}</h3>`;
  if (ind.length) h += ind.map(x => { const mx = Math.max(Math.abs(x.a), Math.abs(x.b)) || 1; return `<div class="gb-row"><div class="gb-h"><b>${esc(x.n)}</b><span>${esc(x.ta)} → ${esc(x.tb)} ${esc(x.u || '')}</span></div><div class="hb-t two"><div class="hb-f prev" style="width:${Math.max(2, Math.abs(x.a) / mx * 100).toFixed(1)}%"></div></div><div class="hb-t two"><div class="hb-f" style="width:${Math.max(2, Math.abs(x.b) / mx * 100).toFixed(1)}%"></div></div></div>`; }).join('') + '<p class="small muted">Barra superior: valoración anterior. Barra inferior: actual.</p>';
  else h += '<p class="small muted">No hay indicadores con el mismo nombre en las dos valoraciones.</p>';
  if (solved.length) h += `<p class="small"><b>Prioridades que ya no aparecen:</b> ${solved.map(x => esc(x.title)).join('; ')}.</p>`;
  if (nuevas.length) h += `<p class="small"><b>Prioridades nuevas:</b> ${nuevas.map(x => esc(x.title)).join('; ')}.</p>`;
  return h + '</div>';
}

/* ---------- acudientes: enlace de solo lectura ---------- */
async function vAcudientes() {
  if (S.needsV9) return paint('<div class="card empty"><p>Disponible próximamente.</p></div>', {}, 'Acudientes');
  const ls = await DB.select('guardian_links', { eq: { client_id: S.profile.id }, order: 'created_at', asc: false }).catch(() => []);
  const base = location.origin + location.pathname.replace(/[^/]*$/, '') + 'acudiente.html?t=';
  paint(`<div class="card"><p class="small">Crea un enlace para que tu acudiente (padre, madre o tutor) vea tu plan, tus registros y tus hábitos, sin poder modificar nada. No incluye fotos, valoración, mensajes ni datos de salud del expediente. Puedes revocarlo cuando quieras.</p>
    <label class="field"><span>Para quién es</span><input class="input" id="gl-l" placeholder="Ej.: Mamá"></label><button class="btn primary block" data-act="glNew">Crear enlace</button></div>
    ${ls.map(l => `<div class="card"><div class="day-h"><div><b>${esc(l.label || 'Acudiente')}</b><small class="muted">${l.revoked ? 'Revocado' : 'Activo'} · creado ${esc(fmtDateShort(l.created_at))}</small></div></div>${l.revoked ? '' : `<div class="row-btns"><button class="btn sm" data-act="glCopy" data-u="${esc(base + l.token)}">Copiar enlace</button><button class="btn sm danger-outline" data-act="glRev" data-t="${esc(l.token)}">Revocar</button></div>`}</div>`).join('')}`, {
    click: {
      glNew: async () => { const tok = Array.from(crypto.getRandomValues(new Uint8Array(18)), x => x.toString(16).padStart(2, '0')).join(''); await DB.insert('guardian_links', { token: tok, client_id: S.profile.id, label: $('#gl-l').value.trim() || null, revoked: false }); route(); },
      glCopy: async el => { await copyText(el.dataset.u); toast('Enlace copiado'); },
      glRev: async el => { if (!confirm('¿Revocar el acceso? El enlace deja de funcionar.')) return; await DB.update('guardian_links', el.dataset.t, { revoked: true }, 'token'); route(); }
    }
  }, 'Acceso para acudientes');
}

/* ---------- resultados con consentimiento ---------- */
async function clientPrefsOf(cid) { if (S.needsV9) return null; try { return (await DB.select('client_prefs', { eq: { client_id: cid } }))[0] || null; } catch (e) { return null; } }
async function consentCardHtml() {
  if (S.needsV9) return '';
  const p = await clientPrefsOf(S.profile.id) || {};
  return `<div class="card"><h3>Mis resultados</h3><label class="check"><input type="checkbox" data-cp="share_results" ${p.share_results ? 'checked' : ''}> Autorizo a mi entrenador a mostrar mi avance (sin mi nombre completo) como resultado de la asesoría</label>
    <label class="check"><input type="checkbox" data-cp="hide_face" ${p.hide_face !== false ? 'checked' : ''}> No mostrar mi rostro</label><p class="small muted">Puedes retirar la autorización en cualquier momento.</p></div>`;
}
document.addEventListener('change', async e => {
  const k = e.target && e.target.dataset && e.target.dataset.cp; if (!k) return;
  const ex = await clientPrefsOf(S.profile.id); const rec = { [k]: e.target.checked, updated_at: new Date().toISOString() };
  if (ex) await DB.update('client_prefs', S.profile.id, rec, 'client_id'); else await DB.insert('client_prefs', Object.assign({ client_id: S.profile.id, share_results: false, hide_face: true }, rec));
  toast('Guardado');
});
async function resultsCard(cid) {
  const p = await clientPrefsOf(cid); if (!p || !p.share_results) return toast('El asesorado no ha autorizado mostrar sus resultados', 'error');
  const c = (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  const bodies = (await DB.select('body_logs', { eq: { client_id: cid }, order: 'log_date' })).filter(b => num(b.weight_kg) || num(b.waist_cm));
  if (bodies.length < 2) return toast('Se necesitan al menos dos registros de peso o cintura', 'error');
  const f = bodies[0], l = bodies[bodies.length - 1]; const wk = Math.max(1, Math.round(daysBetween(f.log_date, l.log_date) / 7));
  const items = [];
  const fw = bodies.find(b => num(b.weight_kg)), lw = bodies.filter(b => num(b.weight_kg)).pop(); if (fw && lw && fw !== lw) items.push(['Peso', num(fw.weight_kg), num(lw.weight_kg), 'kg']);
  const fc = bodies.find(b => num(b.waist_cm)), lc = bodies.filter(b => num(b.waist_cm)).pop(); if (fc && lc && fc !== lc) items.push(['Cintura', num(fc.waist_cm), num(lc.waist_cm), 'cm']);
  const ff = bodies.find(b => num(b.body_fat)), lf = bodies.filter(b => num(b.body_fat)).pop(); if (ff && lf && ff !== lf) items.push(['% grasa', num(ff.body_fat), num(lf.body_fat), '%']);
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080; const x = cv.getContext('2d');
  x.fillStyle = '#0B406C'; x.fillRect(0, 0, 1080, 1080); x.fillStyle = '#6FB232'; x.fillRect(0, 0, 1080, 14);
  x.fillStyle = '#fff'; x.font = 'bold 54px system-ui, sans-serif'; x.fillText('Resultados', 70, 130);
  x.font = '34px system-ui, sans-serif'; x.fillStyle = '#cfe3f3'; x.fillText(`${firstName(c.full_name)} ${String((c.full_name || '').split(/\s+/)[1] || '').slice(0, 1)}${(c.full_name || '').split(/\s+/)[1] ? '.' : ''} · ${wk} semanas`, 70, 190);
  items.forEach((it, i) => {
    const y = 290 + i * 230; const mx = Math.max(it[1], it[2]);
    x.fillStyle = '#fff'; x.font = 'bold 40px system-ui, sans-serif'; x.fillText(it[0], 70, y);
    x.font = '36px system-ui, sans-serif'; x.fillText(`${fmtN(it[1])} → ${fmtN(it[2])} ${it[3]}  (${it[2] - it[1] > 0 ? '+' : ''}${fmtN(it[2] - it[1])})`, 70, y + 50);
    x.fillStyle = '#3b6a92'; x.fillRect(70, y + 80, 900 * it[1] / mx, 34); x.fillStyle = '#6FB232'; x.fillRect(70, y + 124, 900 * it[2] / mx, 34);
  });
  x.fillStyle = '#cfe3f3'; x.font = '28px system-ui, sans-serif'; x.fillText('Barra azul: inicio · barra verde: actual', 70, 1000); x.fillText(BRAND.name, 70, 1045);
  const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = docSafe('Resultados ' + firstName(c.full_name)) + '.png'; document.body.appendChild(a); a.click(); a.remove();
  toast(p.hide_face !== false ? 'Tarjeta descargada. El asesorado pidió no mostrar su rostro.' : 'Tarjeta descargada');
}

/* ---------- exportar mis datos (PDF y HTML) ---------- */
async function myDataDocHtml(logo) {
  const cid = S.profile.id; const q = (t, o) => DB.select(t, o).catch(() => []);
  const [bodies, cks, plan, reps] = await Promise.all([q('body_logs', { eq: { client_id: cid }, order: 'log_date' }), q('checkins', { eq: { client_id: cid }, order: 'check_date' }), activePlanFor(cid).catch(() => null), S.needsV7 ? [] : casesOf(cid)]);
  const it = S.intake; const d = (it && it.data) || {};
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Mis datos</h1><p><b>${esc(S.profile.full_name || '')}</b> · ${esc(S.profile.email || '')}</p><p class="doc-sub">${esc(BRAND.name)} · generado el ${esc(fmtDateLong(todayStr()))}</p></div></div>`;
  if (S.profile.goal) h += `<p><b>Objetivo:</b> ${esc(S.profile.goal)}</p>`;
  if (it && typeof intakeAnswersHtml === 'function') h += intakeAnswersHtml(d);
  if (plan) h += `<h2>Plan nutricional activo: ${esc(plan.name)}</h2><table class="doc-t"><thead><tr><th>Tipo de día</th><th class="n">kcal</th><th class="n">Proteína</th><th class="n">Carbohidratos</th><th class="n">Grasa</th></tr></thead><tbody>${dayVariants(plan).map(v => `<tr><td>${esc(dayLabel(v))}</td><td class="n">${fmtInt(num(v.kcal))}</td><td class="n">${fmtInt(num(v.protein_g))} g</td><td class="n">${fmtInt(num(v.carbs_g))} g</td><td class="n">${fmtInt(num(v.fat_g))} g</td></tr>`).join('')}</tbody></table>`;
  if (bodies.length) h += `<h2>Peso y medidas</h2><table class="doc-t"><thead><tr><th>Fecha</th><th class="n">Peso</th><th class="n">Cintura</th><th class="n">% grasa</th></tr></thead><tbody>${bodies.map(b => `<tr><td>${esc(b.log_date)}</td><td class="n">${b.weight_kg ?? '—'}</td><td class="n">${b.waist_cm ?? '—'}</td><td class="n">${b.body_fat ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  if (cks.length) h += `<h2>Check-ins</h2><table class="doc-t"><thead><tr><th>Fecha</th><th class="n">Peso</th><th class="n">Adherencia</th><th class="n">Energía</th><th class="n">Sueño</th></tr></thead><tbody>${cks.map(c => `<tr><td>${esc(c.check_date)}</td><td class="n">${c.weight_kg ?? '—'}</td><td class="n">${c.adherence ?? '—'}</td><td class="n">${c.energy ?? '—'}</td><td class="n">${c.sleep ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  const vis = reps.filter(r => r.visible).map(clientCase);
  if (vis.length) h += `<h2>Expedientes</h2>${vis.map(r => `<p><b>${esc(r.title)}</b> · ${esc(fmtDateLong(r.report_date))}</p>${r.summary ? `<p class="pre">${esc(r.summary)}</p>` : ''}`).join('')}`;
  h += `<p class="doc-foot">Copia de tus datos personales y de salud registrados en la aplicación, conforme a la Ley 1581 de 2012. El detalle de cada registro de alimentación y entrenamiento está en el archivo de Excel.</p>`;
  return h;
}
async function exportMyData(kind) {
  const name = docSafe('Mis datos - ' + (S.profile.full_name || '')); const logo = BRAND.logoFull || BRAND.logo;
  if (kind === 'pdf') { ensureReportCss(); printDoc(await myDataDocHtml(logo), name); return; }
  const body = await myDataDocHtml(logo ? await toDataUrl(logo) : '');
  downloadFile(name + '.html', `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title><style>body{margin:0;background:#f3f5f1}.wrap{max-width:820px;margin:0 auto;padding:16px}${DOC_CSS}${typeof DOC_BARS_CSS === 'string' ? DOC_BARS_CSS : ''}</style></head><body><div class="wrap"><div class="doc">${body}</div></div></body></html>`, 'text/html');
}

/* ---------- reemplazos frecuentes y cómo le sientan las comidas (para el entrenador) ---------- */
async function eatingInsights(cid, days = 28) {
  const start = addDays(todayStr(), -(days - 1)); const q = (t, o) => DB.select(t, o).catch(() => []);
  const [logs, dailies, full] = await Promise.all([q('food_logs', { eq: { client_id: cid }, gte: { log_date: start } }), q('daily_logs', { eq: { client_id: cid }, gte: { log_date: start } }), activePlanFor(cid).catch(() => null)]);
  const items = {}, mealName = {};
  if (full) dayVariants(full).forEach(v => v.meals.forEach(m => { mealName[m.id] = m.name; m.options.forEach(o => o.items.forEach(i => { items[i.id] = i; })); }));
  const pairs = {};
  logs.forEach(l => { const it = l.plan_item_id && items[l.plan_item_id]; if (it && l.food_id && l.food_id !== it.food_id) { const k = it.food_id + '>' + l.food_id; pairs[k] = (pairs[k] || 0) + 1; } });
  const swaps = Object.entries(pairs).map(([k, n]) => { const [a, b] = k.split('>'); return { from: (foodOf(a) || {}).name || '—', to: (foodOf(b) || {}).name || '—', n }; }).sort((a, b) => b.n - a.n).slice(0, 8);
  const reps = {}; const fb = {}; const off = [];
  dailies.forEach(d => { const c = d.choices || {}; Object.entries(c.__rep || {}).forEach(([mid, r]) => { const n = mealName[mid] || 'Comida'; reps[n] = reps[n] || {}; const lbl = String(r.l || '').replace(/\s*\(porciones.*$/, ''); reps[n][lbl] = (reps[n][lbl] || 0) + 1; }); Object.entries(c.__fb || {}).forEach(([mid, f]) => { const n = mealName[mid] || 'Comida'; const x = fb[n] || (fb[n] = { s: [], bad: 0, n: 0 }); if (f.s) x.s.push(f.s); if (f.d) { x.n++; if (f.d === 'Mal') x.bad++; } }); if (c.__off) off.push({ d: d.log_date, r: c.__off.r || [], n: c.__off.n }); });
  return { swaps, reps, fb, off };
}
async function eatingInsightsHtml(cid) {
  const x = await eatingInsights(cid);
  let h = '';
  if (x.swaps.length) h += `<div class="card"><h3>Reemplazos frecuentes · 28 días</h3>${hbars(x.swaps.map(s => ({ label: `${s.from} → ${s.to}`, value: s.n, text: s.n + ' veces' })))}<p class="small muted">Alimentos del plan que el asesorado cambia con más frecuencia. Útil para ajustar el siguiente plan a lo que realmente come.</p></div>`;
  const rl = Object.entries(x.reps).flatMap(([m, o]) => Object.entries(o).map(([l, n]) => ({ label: `${m}: ${l}`, value: n, text: n + ' días' })));
  if (rl.length) h += `<div class="card"><h3>Comidas reemplazadas</h3>${hbars(rl.sort((a, b) => b.value - a.value).slice(0, 8))}</div>`;
  const fl = Object.entries(x.fb).filter(([, f]) => f.s.length || f.n);
  if (fl.length) h += `<div class="card"><h3>Saciedad y digestión por comida</h3>${hbars(fl.map(([m, f]) => ({ label: m, value: f.s.length ? f.s.reduce((a, b) => a + b, 0) / f.s.length : 0, text: (f.s.length ? 'Saciedad ' + fmtN(f.s.reduce((a, b) => a + b, 0) / f.s.length) + '/5' : '—') + (f.n ? ` · digestión mala ${Math.round(f.bad / f.n * 100)} %` : '') })), 5)}</div>`;
  if (x.off.length) h += `<div class="card"><h3>Días sin poder seguir el plan</h3><table class="tbl small"><tbody>${x.off.map(o => `<tr><td>${esc(fmtDM(parseDay(o.d)))}</td><td>${esc(o.r.join(', '))}${o.n ? '<br><small class="muted">' + esc(o.n) + '</small>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}
async function eatingInsightsMd(cid) {
  const x = await eatingInsights(cid); const L = [];
  if (x.swaps.length) L.push('## Reemplazos frecuentes (28 días)\n' + x.swaps.map(s => `- ${s.from} → ${s.to}: ${s.n} veces`).join('\n'));
  const rl = Object.entries(x.reps).flatMap(([m, o]) => Object.entries(o).map(([l, n]) => `- ${m}: ${l} (${n} días)`)); if (rl.length) L.push('## Comidas reemplazadas\n' + rl.join('\n'));
  const fl = Object.entries(x.fb).filter(([, f]) => f.s.length || f.n); if (fl.length) L.push('## Saciedad y digestión por comida\n' + fl.map(([m, f]) => `- ${m}: saciedad ${f.s.length ? fmtN(f.s.reduce((a, b) => a + b, 0) / f.s.length) : '—'}/5; digestión mala ${f.n ? Math.round(f.bad / f.n * 100) + ' %' : '—'}`).join('\n'));
  if (x.off.length) L.push('## Días sin poder seguir el plan\n' + x.off.map(o => `- ${o.d}: ${o.r.join(', ')}${o.n ? ' · ' + o.n : ''}`).join('\n'));
  if (!S.needsV9) { const qs = await DB.select('questionnaires', { eq: { client_id: cid, status: 'respondido' } }).catch(() => []); if (qs.length) L.push('## Cuestionarios\n' + qs.map(qq => `- ${qq.title} (${String(qq.answered_at || '').slice(0, 10)}): puntaje ${fmtN(qq.score)}${qq.result ? ' · ' + qq.result : ''}`).join('\n')); }
  return L.join('\n\n');
}
