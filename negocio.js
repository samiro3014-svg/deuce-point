'use strict';
/* =====================================================================
   Deuce Point · Negocio
   Panel de negocio, prospectos de la página de captación con código QR,
   pagos y enlaces de pago, niveles de servicio, referidos, encuesta de
   satisfacción y testimonios, exportación a Excel y notificaciones push.
   Depende de app.js, nutri.js, auto.js, gestion.js, tenis.js y comunidad.js.
   ===================================================================== */

const TIERS = { completo: 'Completo (nutrición y entrenamiento)', nutricion: 'Nutrición', entrenamiento: 'Entrenamiento' };
const LEAD_ST = { nuevo: 'Nuevo', contactado: 'Contactado', convertido: 'Convertido', descartado: 'Descartado' };
const landingUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'inicio.html';
const appUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const fmtMoney = v => '$' + fmtInt(v);
const monthKey = d => String(d).slice(0, 7);
const monthLbl = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''); };

/* ---------- Referidos ---------- */
const refCode = p => (norm(firstName(p.full_name || p.email || 'DP')).replace(/[^a-z]/g, '').slice(0, 6) + String(p.id || '').replace(/-/g, '').slice(0, 4)).toUpperCase();
function captureRef() { const m = location.search.match(/[?&]ref=([A-Za-z0-9]+)/) || location.hash.match(/[?&]ref=([A-Za-z0-9]+)/); if (m) try { localStorage.setItem('dp_ref', m[1].toUpperCase()); } catch (e) { } }
captureRef();
const storedRef = () => { try { return localStorage.getItem('dp_ref') || ''; } catch (e) { return ''; } };
function referralCardHtml() {
  if (S.needsV6) return '';
  const code = refCode(S.profile); const link = landingUrl() + '?ref=' + code; const pct = num(S.settings.referral_pct ?? 10);
  return `<div class="card"><h3>Invita y obtén descuento</h3><p class="small">Tu código: <b class="refc">${esc(code)}</b>. Por cada persona que inicie su asesoría con tu código recibes ${pct} % de descuento en tu próxima renovación.</p>
    <div class="row-btns"><button class="btn sm" data-act="refCopy" data-v="${esc(link)}">Copiar enlace</button><a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Te recomiendo la asesoría de nutrición y entrenamiento de ${BRAND.name}. Usa mi código ${code}: ${link}`)}">Compartir por WhatsApp</a></div></div>`;
}
const referralHandlers = { refCopy: async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Enlace copiado'); } catch (e) { prompt('Copia este enlace:', el.dataset.v); } } };
async function referralStats() {
  const [profiles, intakes, leads, mem] = await Promise.all([DB.select('profiles', { eq: { role: 'client' } }), DB.select('intakes'), DB.select('leads').catch(() => []), loadMemberships()]);
  const byCode = {}; profiles.forEach(p => { byCode[refCode(p)] = p; });
  const out = {};
  intakes.forEach(i => { const c = String((i.data || {}).ref || '').toUpperCase(); if (!byCode[c]) return; const o = out[c] = out[c] || { owner: byCode[c], clients: [], leads: 0 }; const p = profiles.find(x => x.id === i.client_id); if (p) o.clients.push({ p, active: !!(mem[p.id] && membStatus(mem[p.id]) && !membStatus(mem[p.id]).expired) }); });
  leads.forEach(l => { const c = String(l.ref || '').toUpperCase(); if (!byCode[c]) return; const o = out[c] = out[c] || { owner: byCode[c], clients: [], leads: 0 }; o.leads++; });
  return out;
}

/* ---------- Pagos ---------- */
async function recordPayment(cid, amount, concept, date) { if (S.needsV6 || !num(amount)) return; await DB.insert('payments', { client_id: cid, pay_date: date || todayStr(), amount: num(amount), concept: concept || null }); }
const payLink = plan => { const L = S.settings.pay_links || {}; return (plan && L[plan]) || L.default || ''; };

/* ---------- Nivel de servicio del asesorado ---------- */
async function loadTier() {
  S.tier = 'completo'; if (S.needsV6 || !S.profile || S.profile.role !== 'client') return;
  try { const m = (await DB.select('memberships', { eq: { client_id: S.profile.id } }))[0]; if (m && TIERS[m.tier]) S.tier = m.tier; } catch (e) { }
}
const showsTraining = () => S.tier !== 'nutricion';
const showsNutrition = () => S.tier !== 'entrenamiento';

/* ---------- Mi membresía (asesorado) ---------- */
async function myMembershipCardHtml() {
  if (S.needsV5) return '';
  const m = (await DB.select('memberships', { eq: { client_id: S.profile.id } }).catch(() => []))[0]; if (!m || !m.end_date) return '';
  const st = membStatus(m); const link = payLink(m.plan_name);
  return `<div class="card"><h3>Mi asesoría</h3><p class="small">${esc(m.plan_name || 'Plan')}${m.tier && TIERS[m.tier] ? ' · ' + esc(TIERS[m.tier]) : ''} · vence el ${esc(fmtDateLong(m.end_date))} ${st ? `<span class="badge ${st.cls}">${esc(st.label)}</span>` : ''}</p>
    ${link ? `<a class="btn sm primary" href="${esc(link)}" target="_blank" rel="noopener">Pagar renovación</a>` : ''}</div>`;
}

/* =====================================================================
   Encuesta de satisfacción y testimonios
   ===================================================================== */
const SURVEY_ITEMS = [['plan', 'Plan de alimentación'], ['training', 'Plan de entrenamiento'], ['support', 'Atención y seguimiento del entrenador'], ['app', 'Facilidad de uso de la app']];
async function surveyDue() {
  if (S.needsV6 || !S.intake || S.intake.status !== 'approved') return false;
  const ref = dateStr(new Date(S.intake.reviewed_at || S.intake.created_at)); if (daysBetween(ref, todayStr()) < 60) return false;
  const last = (await DB.select('surveys', { eq: { client_id: S.profile.id }, order: 'created_at', asc: false, limit: 1 }).catch(() => []))[0];
  return !last || daysBetween(dateStr(new Date(last.created_at)), todayStr()) >= 85;
}
async function surveyCardHtml() { return await surveyDue() ? `<a class="card row-link ck-due" href="#/encuesta"><div><b>Encuesta de satisfacción</b><small class="muted">Cuéntanos cómo va tu asesoría (1 minuto).</small></div><span class="chev">›</span></a>` : ''; }
function vEncuesta() {
  const v = { items: {} };
  const draw = () => paint(`<p class="small muted">Tus respuestas ayudan a mejorar la asesoría.</p>
    <div class="card"><div class="field"><span class="ob-l">¿Qué tan probable es que recomiendes la asesoría a un amigo o familiar? (0 = nada probable, 10 = muy probable)</span><div class="chips scale11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="chip${v.nps === n ? ' on' : ''}" data-act="nps" data-v="${n}">${n}</button>`).join('')}</div></div>
    ${SURVEY_ITEMS.map(([k, l]) => `<div class="well-row"><span>${esc(l)}</span><div class="chips scale5">${[1, 2, 3, 4, 5].map(n => `<button class="chip${v.items[k] === n ? ' on' : ''}" data-act="it" data-k="${k}" data-v="${n}">${n}</button>`).join('')}</div></div>`).join('')}
    <label class="field"><span>¿Qué podemos mejorar?</span><textarea class="input" id="sv-c" rows="3">${esc(v.c || '')}</textarea></label>
    <label class="field"><span>Testimonio (opcional): ¿qué resultados has logrado?</span><textarea class="input" id="sv-t" rows="3">${esc(v.t || '')}</textarea></label>
    <label class="check"><input type="checkbox" id="sv-ok" ${v.ok ? 'checked' : ''}> Autorizo el uso de mi testimonio con fines de difusión de ${esc(BRAND.name)}.</label>
    <label class="check"><input type="checkbox" id="sv-n" ${v.n ? 'checked' : ''}> Se puede mostrar mi nombre (si no, se publica como anónimo).</label>
    <button class="btn primary block" data-act="send">Enviar</button></div>`, {
    input: t => { if (t.id === 'sv-c') v.c = t.value; if (t.id === 'sv-t') v.t = t.value; },
    change: t => { if (t.id === 'sv-ok') v.ok = t.checked; if (t.id === 'sv-n') v.n = t.checked; },
    click: {
      nps: el => { v.nps = +el.dataset.v; keepScroll(async () => draw()); },
      it: el => { v.items[el.dataset.k] = +el.dataset.v; keepScroll(async () => draw()); },
      send: async () => {
        if (v.nps == null) return toast('Responde la primera pregunta', 'error');
        await DB.insert('surveys', { client_id: S.profile.id, nps: v.nps, items: v.items, comment: (v.c || '').trim() || null, testimonial: (v.t || '').trim() || null, consent: !!v.ok && !!(v.t || '').trim(), show_name: !!v.n });
        toast('Gracias por tu respuesta'); location.hash = '#/hoy';
      }
    }
  }, 'Encuesta de satisfacción');
  draw();
}

/* =====================================================================
   Panel de negocio (entrenador)
   ===================================================================== */
async function vNegocio(sub) {
  if (S.profile.role !== 'coach') return paint('<div class="card"><p>Sección disponible solo para el entrenador.</p></div>');
  if (S.needsV6) return paint(V6_NOTICE, {}, 'Negocio');
  sub = ['resumen', 'prospectos', 'pagos', 'referidos', 'encuestas', 'captacion'].includes(sub) ? sub : 'resumen';
  const nav = `<div class="chips scroll">${[['resumen', 'Resumen'], ['prospectos', 'Prospectos'], ['pagos', 'Pagos'], ['referidos', 'Referidos'], ['encuestas', 'Encuestas'], ['captacion', 'Página y QR']].map(([k, l]) => `<a class="chip${k === sub ? ' on' : ''}" href="#/negocio/${k}">${l}</a>`).join('')}</div>`;
  const r = await ({ resumen: bizResumen, prospectos: bizLeads, pagos: bizPagos, referidos: bizReferidos, encuestas: bizEncuestas, captacion: bizCaptacion })[sub]();
  paint(nav + r.html, { click: r.click || {}, change: r.change }, 'Negocio');
  if (r.after) r.after();
}
async function bizResumen() {
  const [clients, mem, pays, leads, ws, logs] = await Promise.all([DB.select('profiles', { eq: { role: 'client' } }), loadMemberships(), DB.select('payments', { order: 'pay_date' }), DB.select('leads').catch(() => []), DB.select('workouts', { gte: { started_at: new Date(Date.now() - 14 * 864e5).toISOString() } }), DB.select('food_logs', { gte: { log_date: addDays(todayStr(), -14) } })]);
  const act = clients.filter(c => !(mem[c.id] && mem[c.id].archived));
  const vigentes = act.filter(c => mem[c.id] && mem[c.id].end_date && mem[c.id].end_date >= todayStr());
  const vencen = vigentes.filter(c => daysBetween(todayStr(), mem[c.id].end_date) <= 30);
  const activos14 = new Set([...ws.map(w => w.client_id), ...logs.map(l => l.client_id)]);
  const months = []; for (let i = 5; i >= 0; i--) { const d = parseDay(todayStr()); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(dateStr(d).slice(0, 7)); }
  const inc = months.map(k => pays.filter(p => monthKey(p.pay_date) === k).reduce((a, p) => a + num(p.amount), 0));
  const cnt = months.map(k => pays.filter(p => monthKey(p.pay_date) === k).length);
  const ld = months.map(k => leads.filter(l => monthKey(l.created_at) === k).length);
  const byClient = {}; pays.forEach(p => { (byClient[p.client_id] = byClient[p.client_id] || []).push(p); });
  const eligible = Object.values(byClient).filter(ps => daysBetween(ps[0].pay_date, todayStr()) >= 35);
  const ret = eligible.length ? Math.round(eligible.filter(ps => ps.length >= 2).length / eligible.length * 100) : null;
  const conv = leads.length ? Math.round(leads.filter(l => l.status === 'convertido').length / leads.length * 100) : null;
  const tiers = {}; vigentes.forEach(c => { const t = mem[c.id].tier || 'completo'; tiers[t] = (tiers[t] || 0) + 1; });
  const html = `<div class="stats3"><div><b>${vigentes.length}</b><small>Membresías vigentes</small></div><div><b>${activos14.size}</b><small>Con registros en 14 días</small></div><div><b>${vencen.length}</b><small>Vencen en 30 días</small></div></div>
    <div class="stats3"><div><b>${fmtMoney(inc[5])}</b><small>Ingresos del mes</small></div><div><b>${ret == null ? '—' : ret + ' %'}</b><small>Retención (renovaron)</small></div><div><b>${conv == null ? '—' : conv + ' %'}</b><small>Conversión de prospectos</small></div></div>
    <div class="card"><h3>Ingresos por mes</h3>${vbars(months.map((k, i) => ({ label: monthLbl(k), value: inc[i], text: inc[i] >= 1e6 ? r1(inc[i] / 1e6) + ' M' : inc[i] >= 1000 ? Math.round(inc[i] / 1000) + ' k' : inc[i], hi: i === 5 })), 'Sin pagos registrados.')}<p class="small muted">Pagos registrados al guardar o renovar una membresía con valor, o desde Pagos.</p></div>
    <div class="card"><h3>Pagos por mes (nuevos y renovaciones)</h3>${vbars(months.map((k, i) => ({ label: monthLbl(k), value: cnt[i], text: cnt[i], hi: i === 5 })), 'Sin pagos registrados.')}</div>
    <div class="card"><h3>Prospectos por mes</h3>${vbars(months.map((k, i) => ({ label: monthLbl(k), value: ld[i], text: ld[i], hi: i === 5 })), 'Sin prospectos todavía.')}</div>
    <div class="card"><h3>Membresías vigentes por nivel</h3>${hbars(Object.entries(tiers).map(([k, n]) => ({ label: (TIERS[k] || k).split(' (')[0], value: n, text: n })), 'Sin membresías vigentes.')}</div>
    <div class="card"><h3>Vencimientos próximos</h3>${vencen.length ? vencen.sort((a, b) => mem[a.id].end_date < mem[b.id].end_date ? -1 : 1).map(c => `<div class="ib-row"><a class="ib-n" href="#/asesorado/${c.id}/valoracion">${esc(c.full_name || '')}</a><span class="ib-m">${esc(membStatus(mem[c.id]).label)} ${waBtn(c.phone, renewText(c, mem[c.id]) + (payLink(mem[c.id].plan_name) ? ' Puedes pagar aquí: ' + payLink(mem[c.id].plan_name) : ''), 'WhatsApp', 'chip wa')}</span></div>`).join('') : '<p class="small muted">Sin vencimientos en los próximos 30 días.</p>'}</div>
    <button class="btn block" data-act="xlsAll">Exportar asesorados y pagos a Excel</button>`;
  return {
    html, click: {
      xlsAll: async () => {
        const X = await loadXlsx();
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, X.utils.json_to_sheet(clients.map(c => { const m = mem[c.id] || {}; return { Nombre: c.full_name, Correo: c.email, WhatsApp: c.phone, Plan: m.plan_name || '', Nivel: TIERS[m.tier || 'completo'] || '', Inicio: m.start_date || '', Vencimiento: m.end_date || '', Valor: m.amount ?? '', Archivado: m.archived ? 'Sí' : 'No' }; })), 'Asesorados');
        const byId = Object.fromEntries(clients.map(c => [c.id, c]));
        X.utils.book_append_sheet(wb, X.utils.json_to_sheet(pays.map(p => ({ Fecha: p.pay_date, Asesorado: (byId[p.client_id] || {}).full_name || '', Valor: num(p.amount), Concepto: p.concept || '', Medio: p.method || '' }))), 'Pagos');
        X.utils.book_append_sheet(wb, X.utils.json_to_sheet(leads.map(l => ({ Fecha: String(l.created_at).slice(0, 10), Nombre: l.name, WhatsApp: l.phone, Objetivo: l.goal || '', Estado: LEAD_ST[l.status] || l.status, Referido: l.ref || '', Origen: l.source || '' }))), 'Prospectos');
        X.writeFile(wb, `${BRAND.name} - negocio - ${todayStr()}.xlsx`);
      }
    }
  };
}
async function bizLeads() {
  const leads = await DB.select('leads', { order: 'created_at', asc: false });
  const html = `<p class="small muted">Prospectos registrados desde la página de captación. Al contactarlos, cambia el estado para medir la conversión.</p>
    ${leads.length ? leads.map(l => `<div class="card"><div class="day-h"><div><b>${esc(l.name)}</b><small class="muted">${esc(fmtDayMonth(dateStr(new Date(l.created_at))))}${l.goal ? ' · ' + esc(l.goal) : ''}${l.ref ? ' · referido ' + esc(l.ref) : ''}</small></div><span class="badge ${l.status === 'convertido' ? 'ok' : l.status === 'nuevo' ? 'warnb' : ''}">${esc(LEAD_ST[l.status] || l.status)}</span></div>
      ${l.calc && l.calc.kcal ? `<p class="small muted">Calculadora: ${fmtInt(l.calc.kcal)} kcal · proteína ${fmtInt(l.calc.protein)} g${l.calc.sexo ? ` · ${esc(l.calc.sexo)}, ${esc(l.calc.edad)} años, ${esc(l.calc.peso)} kg` : ''}</p>` : ''}${l.message ? `<p class="small">«${esc(l.message)}»</p>` : ''}
      <div class="row-btns">${waBtn(l.phone, `Hola ${firstName(l.name)}, soy ${firstName(S.profile.full_name)} de ${BRAND.name}. Recibí tu solicitud desde la página.`, 'WhatsApp')}<select class="input sel-sm" data-lead="${l.id}">${Object.entries(LEAD_ST).map(([k, v]) => `<option value="${k}"${k === l.status ? ' selected' : ''}>${v}</option>`).join('')}</select><button class="btn sm danger-outline" data-act="ldDel" data-id="${l.id}">Eliminar</button></div></div>`).join('') : '<div class="card empty"><p>Aún no hay prospectos. Comparte la página de captación o el código QR (pestaña «Página y QR»).</p></div>'}`;
  return {
    html, change: async t => { if (t.dataset.lead) { await DB.update('leads', t.dataset.lead, { status: t.value }); toast('Estado actualizado'); return true; } },
    click: { ldDel: async el => { if (!confirm('¿Eliminar este prospecto?')) return; await DB.remove('leads', el.dataset.id); route(); } }
  };
}
async function bizPagos() {
  const [pays, clients] = await Promise.all([DB.select('payments', { order: 'pay_date', asc: false, limit: 300 }), DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' })]);
  const byId = Object.fromEntries(clients.map(c => [c.id, c]));
  const html = `<div class="card"><h3>Registrar pago</h3><label class="field"><span>Asesorado</span><select class="input" id="py-c">${clients.map(c => `<option value="${c.id}">${esc(c.full_name || c.email)}</option>`).join('')}</select></label>
      <div class="rex-grid three"><label><span>Fecha</span><input class="input" type="date" id="py-d" value="${todayStr()}"></label><label><span>Valor</span><input class="input" id="py-v" inputmode="numeric"></label><label><span>Medio</span><select class="input" id="py-m"><option>Transferencia</option><option>Wompi</option><option>Mercado Pago</option><option>Efectivo</option><option>Otro</option></select></label></div>
      <input class="input" id="py-k" placeholder="Concepto (Mensual, Trimestral…)"><button class="btn primary block" data-act="pyAdd">Registrar</button></div>
    ${pays.length ? `<div class="card"><h3>Pagos</h3><table class="tbl"><thead><tr><th>Fecha</th><th>Asesorado</th><th class="n">Valor</th><th></th></tr></thead><tbody>${pays.map(p => `<tr><td>${fmtDM(parseDay(p.pay_date))}</td><td>${esc((byId[p.client_id] || {}).full_name || '—')}<br><small class="muted">${esc([p.concept, p.method].filter(Boolean).join(' · '))}</small></td><td class="n">${fmtMoney(p.amount)}</td><td><button class="icon-btn danger" data-act="pyDel" data-id="${p.id}" aria-label="Eliminar">✕</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  return {
    html, click: {
      pyAdd: async () => { const v = num($('#py-v').value); if (!v) return toast('Indica el valor', 'error'); await DB.insert('payments', { client_id: $('#py-c').value, pay_date: $('#py-d').value || todayStr(), amount: v, method: $('#py-m').value, concept: $('#py-k').value.trim() || null }); toast('Pago registrado'); route(); },
      pyDel: async el => { if (!confirm('¿Eliminar este pago?')) return; await DB.remove('payments', el.dataset.id); route(); }
    }
  };
}
async function bizReferidos() {
  const st = await referralStats(); const pct = num(S.settings.referral_pct ?? 10);
  const rows = Object.entries(st).sort((a, b) => b[1].clients.length - a[1].clients.length);
  return {
    html: `<p class="small muted">Cada asesorado tiene un código (Perfil › Invita y obtén descuento). Cuando una persona llega con ese código por la página de captación o al crear su cuenta, queda asociada. Descuento por referido activo: ${pct} % (configurable en Ajustes).</p>
      ${rows.length ? `<div class="card"><h3>Referidos por asesorado</h3>${hbars(rows.map(([c, o]) => ({ label: o.owner.full_name || c, value: o.clients.length + o.leads * 0.001, text: `${o.clients.length} clientes · ${o.leads} prospectos` })))}</div>` + rows.map(([c, o]) => `<div class="card"><b>${esc(o.owner.full_name || '')}</b> <span class="tag">${esc(c)}</span><p class="small">${o.clients.map(x => esc(x.p.full_name || '') + (x.active ? ' (activo)' : '')).join(', ') || 'Sin clientes convertidos'}</p><p class="small muted">Descuento sugerido en la próxima renovación: ${Math.min(100, o.clients.filter(x => x.active).length * pct)} %</p></div>`).join('') : '<div class="card empty"><p>Aún no hay referidos.</p></div>'}`
  };
}
async function bizEncuestas() {
  const [sv, clients] = await Promise.all([DB.select('surveys', { order: 'created_at', asc: false }), DB.select('profiles', { eq: { role: 'client' } })]);
  const byId = Object.fromEntries(clients.map(c => [c.id, c]));
  const n = sv.length; const prom = sv.filter(s => s.nps >= 9).length, det = sv.filter(s => s.nps <= 6).length;
  const nps = n ? Math.round((prom - det) / n * 100) : null;
  const avg = k => { const v = sv.map(s => num((s.items || {})[k])).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const tst = sv.filter(s => s.consent && s.testimonial);
  return {
    html: `<div class="stats3"><div><b>${nps == null ? '—' : nps}</b><small>NPS (−100 a 100)</small></div><div><b>${n}</b><small>Respuestas</small></div><div><b>${tst.length}</b><small>Testimonios autorizados</small></div></div>
      <div class="card"><h3>Satisfacción promedio (1–5)</h3>${hbars(SURVEY_ITEMS.map(([k, l]) => ({ label: l, value: avg(k), text: avg(k) ? fmtN(avg(k)) : '—' })), 'Sin respuestas.')}<p class="small muted">NPS = % de promotores (9–10) − % de detractores (0–6). La encuesta aparece a cada asesorado a los 60 días y luego cada 3 meses.</p></div>
      ${tst.length ? '<h2 class="sec">Testimonios autorizados</h2>' + tst.map(s => `<div class="card"><p class="pre">«${esc(s.testimonial)}»</p><small class="muted">${s.show_name ? esc((byId[s.client_id] || {}).full_name || '') : 'Asesorado anónimo'} · ${esc(fmtDayMonth(dateStr(new Date(s.created_at))))} · recomendación ${s.nps}/10</small><button class="btn sm" data-act="cpT" data-v="${esc(`«${s.testimonial}» — ${s.show_name ? (byId[s.client_id] || {}).full_name || '' : 'Asesorado de ' + BRAND.name}`)}">Copiar</button></div>`).join('') : ''}
      ${sv.filter(s => s.comment).length ? '<h2 class="sec">Sugerencias</h2>' + sv.filter(s => s.comment).map(s => `<div class="card"><p class="pre">${esc(s.comment)}</p><small class="muted">${esc((byId[s.client_id] || {}).full_name || '')} · ${s.nps}/10</small></div>`).join('') : ''}`,
    click: { cpT: async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Testimonio copiado'); } catch (e) { prompt('Copia el texto:', el.dataset.v); } } }
  };
}
async function bizCaptacion() {
  const url = landingUrl();
  return {
    html: `<div class="card"><h3>Página de captación</h3><p class="small">Página pública con tus servicios, una calculadora de calorías y proteína, y un formulario que deja el contacto en Prospectos y abre WhatsApp contigo.</p>
      <p class="small"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>
      <div class="row-btns"><button class="btn" data-act="cp" data-v="${esc(url)}">Copiar enlace</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a></div></div>
      <div class="card"><h3>Código QR</h3><div id="qr" class="qr"></div><p class="small muted">Para imprimir en el gimnasio: lleva a la página de captación.</p><button class="btn primary" data-act="qrDl">Descargar QR (PNG)</button></div>
      <div class="card"><h3>Contenido de la página</h3><p class="small muted">Se edita en Ajustes › Página de captación: presentación, servicios, precios y WhatsApp.</p><a class="btn sm" href="#/ajustes">Ir a Ajustes</a></div>`,
    click: {
      cp: async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Enlace copiado'); } catch (e) { prompt('Copia el enlace:', el.dataset.v); } },
      qrDl: () => { const c = document.querySelector('#qr canvas'); if (!c) return toast('El código QR no está disponible', 'error'); const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `QR ${BRAND.name}.png`; a.click(); }
    },
    after: async () => {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', 'qrcode');
        const q = window.qrcode(0, 'M'); q.addData(url); q.make();
        const n = q.getModuleCount(), sc = 10, pad = 4 * sc; const c = document.createElement('canvas'); c.width = c.height = n * sc + pad * 2;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#0B406C';
        for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(pad + k * sc, pad + r * sc, sc, sc);
        const box = $('#qr'); if (box) { box.innerHTML = ''; box.appendChild(c); }
      } catch (e) { const box = $('#qr'); if (box) box.innerHTML = '<p class="small muted">No se pudo generar el QR sin conexión.</p>'; }
    }
  };
}
function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
}

/* =====================================================================
   Exportar a Excel
   ===================================================================== */
async function loadXlsx() { await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX'); return window.XLSX; }
async function exportClientXlsx(cid) {
  const X = await loadXlsx();
  const sel = (t, o) => DB.select(t, o).catch(() => []);
  const [c] = await DB.select('profiles', { eq: { id: cid } });
  const [it, bodies, ck, ws, sets, logs, dailies, isak, fit, ts, wells, sw, pains, tours] = await Promise.all([
    sel('intakes', { eq: { client_id: cid } }), sel('body_logs', { eq: { client_id: cid }, order: 'log_date' }), sel('checkins', { eq: { client_id: cid }, order: 'check_date' }),
    sel('workouts', { eq: { client_id: cid }, order: 'started_at' }), sel('workout_sets', { eq: { client_id: cid }, order: 'created_at', limit: 50000 }), sel('food_logs', { eq: { client_id: cid }, order: 'log_date', limit: 50000 }),
    sel('daily_logs', { eq: { client_id: cid }, order: 'log_date' }), sel('anthropometry', { eq: { client_id: cid }, order: 'measure_date' }), sel('fitness_tests', { eq: { client_id: cid }, order: 'test_date' }),
    sel('tennis_sessions', { eq: { client_id: cid }, order: 'log_date' }), sel('wellness', { eq: { client_id: cid }, order: 'log_date' }), sel('sweat_tests', { eq: { client_id: cid }, order: 'test_date' }), sel('pain_reports', { eq: { client_id: cid }, order: 'report_date' }), sel('tournaments', { eq: { client_id: cid }, order: 'start_date' })]);
  const wb = X.utils.book_new(); const add = (rows, name) => { if (rows.length) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows), name); };
  add([{ Nombre: c.full_name, Correo: c.email, WhatsApp: c.phone || '', Objetivo: c.goal || '', 'Fecha de exportación': todayStr() }], 'Datos');
  if (it[0]) { add(INTAKE.flatMap(sec => sec.f.filter(f => f.id && it[0].data[f.id] != null && fmtAns(it[0].data[f.id]) !== '').map(f => ({ Sección: sec.t, Pregunta: f.label, Respuesta: fmtAns(it[0].data[f.id]) }))).concat((it[0].data.extra || []).map(x => ({ Sección: 'Preguntas adicionales', Pregunta: x.q, Respuesta: x.a }))), 'Valoración'); const k = it[0].calc || {}; add(calcRows(k).map(([a, b]) => ({ Indicador: a, Valor: String(b) })), 'Requerimientos'); }
  add(bodies.map(b => ({ Fecha: b.log_date, 'Peso kg': b.weight_kg, 'Cintura cm': b.waist_cm, '% grasa': b.body_fat, Nota: b.notes || '' })), 'Peso y medidas');
  const age = it[0] ? ageFrom(it[0].data.fecha_nac) : 0; const sex = it[0] && it[0].data.sexo === 'Femenino' ? 'F' : 'M';
  add(isak.map(x => { const r = isakCalc(x.data, sex, age); return Object.assign({ Fecha: x.measure_date }, x.data, { 'Σ6': r.sum6 && r1(r.sum6), 'Grasa Yuhasz %': r.yuhasz && r1(r.yuhasz), 'Grasa D-W %': r.dw && r1(r.dw), 'Masa muscular kg': r.mme && r1(r.mme), Somatotipo: r.somato || '' }); }), 'Antropometría');
  add(ck.map(x => ({ Fecha: x.check_date, 'Peso kg': x.weight_kg, Cumplimiento: x.adherence, Rendimiento: x.performance, Energía: x.energy, Sueño: x.sleep, Hambre: x.hunger, Estrés: x.stress, Comentario: x.notes || '', Respuesta: x.coach_reply || '' })), 'Check-ins');
  add(ws.map(w => ({ Fecha: String(w.started_at).slice(0, 10), Sesión: w.day_name, 'Duración min': minutesOf(w), 'Volumen kg': num(w.total_volume), RPE: w.rpe ?? '', Carga: w.load ?? '' })), 'Sesiones');
  const wd = Object.fromEntries(ws.map(w => [w.id, String(w.started_at).slice(0, 10)]));
  add(sets.map(s => ({ Fecha: wd[s.workout_id] || '', Ejercicio: exName(s.exercise_id), Serie: s.set_number, 'Kg': num(s.weight_kg), Reps: s.reps, RIR: s.rir ?? '' })), 'Series');
  const days = {}; logs.forEach(l => { const d = days[l.log_date] = days[l.log_date] || { kcal: 0, p: 0, c: 0, g: 0 }; d.kcal += num(l.kcal); d.p += num(l.protein); d.c += num(l.carbs); d.g += num(l.fat); });
  add(Object.entries(days).map(([d, v]) => { const dl = dailies.find(x => x.log_date === d) || {}; return { Fecha: d, kcal: Math.round(v.kcal), 'Proteína g': Math.round(v.p), 'Carbohidratos g': Math.round(v.c), 'Grasa g': Math.round(v.g), 'Agua ml': dl.water_ml || '', Pasos: dl.steps || '' }; }), 'Alimentación diaria');
  add(logs.map(l => ({ Fecha: l.log_date, Comida: l.meal_name, Alimento: l.name, Gramos: l.grams, kcal: l.kcal, P: l.protein, C: l.carbs, G: l.fat })), 'Alimentos registrados');
  add(fit.map(f => Object.assign({ Fecha: f.test_date }, Object.fromEntries(FIT_TESTS.filter(([k]) => (f.results || {})[k] != null).map(([k, l, u]) => [`${l} (${u})`, f.results[k]])))), 'Pruebas físicas');
  add(ts.map(t => ({ Fecha: t.log_date, Tipo: t.kind, Minutos: t.minutes, Superficie: t.surface || '', RPE: t.rpe, Carga: num(t.rpe) * num(t.minutes), Resultado: t.result || '' })), 'Tenis');
  add(wells.map(w => ({ Fecha: w.log_date, Sueño: w.sleep, Energía: w.fatigue, 'Sin dolor': w.soreness, 'Sin estrés': w.stress, Ánimo: w.mood, Total: WELL_ITEMS.reduce((a, [k]) => a + num(w[k]), 0) })), 'Bienestar');
  add(sw.map(s => { const x = sweatCalc(s) || {}; return { Fecha: s.test_date, Minutos: s.minutes, 'Peso antes': s.pre_kg, 'Peso después': s.post_kg, 'Bebido ml': s.fluid_ml, 'Tasa L/h': x.rate && r1(x.rate) }; }), 'Sudoración');
  add(tours.map(t => ({ Torneo: t.name, Inicio: t.start_date, Fin: t.end_date, Superficie: t.surface || '', Ciudad: t.city || '' })), 'Torneos');
  add(pains.map(p => ({ Fecha: p.report_date, Zona: PAIN_ZONES[p.zone] || p.zone, Lado: p.side || '', Intensidad: p.intensity, Nota: p.notes || '', Resuelta: p.resolved_at ? String(p.resolved_at).slice(0, 10) : '' })), 'Molestias');
  X.writeFile(wb, `${(c.full_name || 'Asesorado').replace(/[\\/:*?"<>|]/g, '')} - ${BRAND.name} - ${todayStr()}.xlsx`);
}

/* =====================================================================
   Notificaciones push
   ===================================================================== */
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
async function generateVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey)); const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { pub, priv: jwk.d };
}
async function syncReminderPrefs(prefs) {
  if (S.needsV6 || DEMO) return;
  try { const ex = (await DB.select('reminder_prefs', { eq: { user_id: S.profile.id } }))[0]; const rec = { prefs, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota', updated_at: new Date().toISOString() };
    if (ex) await DB.update('reminder_prefs', S.profile.id, rec, 'user_id'); else await DB.insert('reminder_prefs', Object.assign({ user_id: S.profile.id }, rec)); } catch (e) { console.warn('reminder_prefs', e); }
}
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
async function pushStatus() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; } catch (e) { return 'off'; }
}
async function enablePush() {
  if (!pushSupported()) throw new Error('Este navegador no admite notificaciones. En iPhone, agrega la app a la pantalla de inicio (iOS 16.4 o superior) y ábrela desde el ícono.');
  const key = S.settings.vapid_public; if (!key) throw new Error('El entrenador aún no ha activado las notificaciones en Ajustes.');
  const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Permiso de notificaciones no concedido.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
  const j = sub.toJSON();
  if (!DEMO) {
    const ex = (await DB.select('push_subscriptions', { eq: { endpoint: j.endpoint } }))[0];
    const rec = { user_id: S.profile.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) };
    if (ex) await DB.update('push_subscriptions', ex.id, rec); else await DB.insert('push_subscriptions', rec);
  }
}
async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (!sub) return;
  if (!DEMO) { const ex = (await DB.select('push_subscriptions', { eq: { endpoint: sub.endpoint } }))[0]; if (ex) await DB.remove('push_subscriptions', ex.id); }
  await sub.unsubscribe();
}
async function pushCardHtml() {
  if (S.needsV6) return '';
  const st = await pushStatus();
  const txt = { on: 'Activadas en este dispositivo.', off: 'Desactivadas en este dispositivo.', denied: 'Bloqueadas en la configuración del navegador.', unsupported: 'Este navegador no las admite.' }[st];
  return `<div class="card"><h3>Notificaciones en el celular</h3><p class="small">${txt} ${S.profile.role === 'client' ? 'Llegan a la hora de cada recordatorio configurado en esta página, con el menú vigente de tu plan, y cuando tu entrenador te escribe.' : 'Llegan cuando un asesorado envía un mensaje, una valoración o un check-in.'}</p>
    ${st === 'on' ? '<button class="btn sm" data-act="pushOff">Desactivar</button>' : st === 'off' ? '<button class="btn sm primary" data-act="pushOn">Activar notificaciones</button>' : ''}
    <p class="small muted">En iPhone: requiere iOS 16.4 o superior y la app agregada a la pantalla de inicio (Safari › Compartir › Agregar a inicio).</p></div>`;
}
const pushHandlers = after => ({
  pushOn: async () => { await enablePush(); toast('Notificaciones activadas'); after(); },
  pushOff: async () => { await disablePush(); toast('Notificaciones desactivadas'); after(); }
});
async function vapidCardHtml() {
  const s = S.settings;
  return `<div class="card"><h3>Notificaciones push</h3>${s.vapid_public ? `<p class="small">Llave pública configurada.</p><p class="small muted mono">${esc(s.vapid_public.slice(0, 32))}…</p>` : '<p class="small">Para activar las notificaciones push, genera el par de llaves. La llave privada se muestra una sola vez y se guarda en Supabase, no en la app.</p>'}
    <button class="btn sm" data-act="vapGen">${s.vapid_public ? 'Generar llaves nuevas' : 'Generar llaves'}</button>
    <p class="small muted">Después: crear la función «enviar-notificaciones» y la tarea programada cada 5 minutos (ver la guía del README).</p></div>`;
}
const vapidHandlers = {
  vapGen: async () => {
    if (S.settings.vapid_public && !confirm('Las suscripciones actuales dejarán de funcionar y los asesorados deberán activar de nuevo las notificaciones. ¿Continuar?')) return;
    const k = await generateVapid(); await saveSettings({ vapid_public: k.pub });
    modal(`${modalHead('Llaves de notificaciones')}<p class="small">Copia estos valores en Supabase › Edge Functions › Secrets (Manage secrets). La llave privada no se guarda en la app.</p>
      <label class="field"><span>VAPID_PUBLIC_KEY</span><textarea class="input mono" rows="3" readonly>${esc(k.pub)}</textarea></label>
      <label class="field"><span>VAPID_PRIVATE_KEY</span><textarea class="input mono" rows="2" readonly>${esc(k.priv)}</textarea></label>
      <label class="field"><span>VAPID_SUBJECT</span><textarea class="input mono" rows="1" readonly>mailto:${esc(S.profile.email || '')}</textarea></label>
      <button class="btn block" data-act="cpAll">Copiar los tres valores</button>`, { click: { cpAll: async () => { const t = `VAPID_PUBLIC_KEY=${k.pub}\nVAPID_PRIVATE_KEY=${k.priv}\nVAPID_SUBJECT=mailto:${S.profile.email || ''}`; try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch (e) { prompt('Copia:', t); } } } });
  }
};

/* =====================================================================
   Pendientes: prospectos nuevos
   ===================================================================== */
async function inboxLeadRows() {
  if (S.needsV6 || S.profile.role !== 'coach') return [];
  try { return (await DB.select('leads', { eq: { status: 'nuevo' }, order: 'created_at', asc: false })).map(l => `<div class="ib-row"><span class="ib-tag n">Prospecto</span><a class="ib-n" href="#/negocio/prospectos">${esc(l.name)}</a><span class="ib-m">${waBtn(l.phone, `Hola ${firstName(l.name)}, soy ${firstName(S.profile.full_name)} de ${BRAND.name}. Recibí tu solicitud desde la página.`, 'WhatsApp', 'chip wa')}</span></div>`); } catch (e) { return []; }
}

/* =====================================================================
   Datos de demostración
   ===================================================================== */
function buildNegocioDemo(d) {
  const t = todayStr(); const iso = new Date().toISOString();
  Object.assign(d, { payments: [], leads: [], surveys: [], push_subscriptions: [], reminder_prefs: [] });
  d.profiles.push({ id: 'demo-asis', email: 'asistente@demo.app', full_name: 'Asistente (demo)', role: 'assistant', goal: '', created_at: iso });
  [-150, -120, -90, -60, -30, 0].forEach((o, i) => { d.payments.push({ id: uid(), client_id: 'demo-juan', pay_date: addDays(t, o - 3), amount: 180000, concept: 'Mensual', method: 'Transferencia', created_at: iso }); if (i % 3 === 0) d.payments.push({ id: uid(), client_id: 'demo-ana', pay_date: addDays(t, o - 10), amount: 480000, concept: 'Trimestral', method: 'Wompi', created_at: iso }); });
  (d.memberships || []).forEach(m => { m.tier = m.client_id === 'demo-ana' ? 'completo' : 'completo'; });
  d.leads.push({ id: uid(), name: 'Camila Rojas', phone: '3014447788', goal: 'Reducir grasa corporal', source: 'qr-gimnasio', ref: '', status: 'nuevo', calc: { kcal: 1650, protein: 120, sexo: 'Femenino', edad: 29, peso: 70 }, message: 'Entreno en el gimnasio en las mañanas.', created_at: new Date(Date.now() - 5 * 3600e3).toISOString() },
    { id: uid(), name: 'Andrés Gil', phone: '3156667788', goal: 'Rendimiento en tenis', source: 'pagina', ref: refCode({ full_name: 'Ana Torres', id: 'demo-ana' }), status: 'contactado', calc: null, message: null, created_at: new Date(Date.now() - 6 * 864e5).toISOString() });
  d.surveys.push({ id: uid(), client_id: 'demo-juan', nps: 9, items: { plan: 5, training: 4, support: 5, app: 4 }, comment: 'Más opciones de cena rápidas.', testimonial: 'Bajé 3 kg en dos meses sin dejar de comer lo que me gusta.', consent: true, show_name: true, created_at: new Date(Date.now() - 20 * 864e5).toISOString() });
  if (d.app_settings && d.app_settings[0]) Object.assign(d.app_settings[0].data, { pay_links: { Mensual: 'https://example.com/pago-demo', default: '' }, referral_pct: 10 });
}
