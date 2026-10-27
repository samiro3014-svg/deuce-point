'use strict';
/* =====================================================================
   Deuce Point v10 · Negocio
   Pagos reportados con comprobante, asignación a varios asesorados, retos
   pagos, cupones y promoción de temporada, afiliados, recibos de pago,
   testimonios publicados, NPS mensual, contratos firmados, asistentes con
   asesorados asignados y marca propia.
   ===================================================================== */

/* ---------- 48. Cupones y promoción de temporada ---------- */
function coupons() {
  return String(S.settings.coupons || '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x[0] && num(x[1]) > 0)
    .map(([code, pct, until, max]) => ({ code: code.toUpperCase(), pct: Math.min(100, num(pct)), until: /^\d{4}-\d{2}-\d{2}$/.test(until || '') ? until : '', max: num(max) || 0 }));
}
function couponCheck(code, used = 0) {
  const c = coupons().find(x => x.code === String(code || '').trim().toUpperCase());
  if (!c) return { ok: false, msg: 'Cupón no válido' };
  if (c.until && todayStr() > c.until) return { ok: false, msg: 'Cupón vencido' };
  if (c.max && used >= c.max) return { ok: false, msg: 'El cupón alcanzó el máximo de usos' };
  return { ok: true, c };
}
function seasonPromo() {
  const [name, pct, from, to] = String(S.settings.season_promo || '').split('|').map(x => (x || '').trim());
  if (!name || !num(pct)) return null; const t = todayStr();
  if ((from && t < from) || (to && t > to)) return null; return { name, pct: num(pct), to };
}

/* ---------- 46. Pagos reportados por el asesorado ---------- */
const PROOF_BUCKET = 'payment-proofs';
const PAY_METHODS = ['Transferencia', 'Nequi', 'Daviplata', 'Wompi', 'Mercado Pago', 'Efectivo', 'Otro'];
function payReportModal(after) {
  const promo = seasonPromo();
  modal(`${modalHead('Reportar un pago')}<p class="small muted">Después de pagar por el enlace o por transferencia, envía el valor y el comprobante. Tu entrenador lo confirma y actualiza tu asesoría.</p>
    ${promo ? `<p class="small"><b>${esc(promo.name)}:</b> ${fmtInt(promo.pct)} % de descuento${promo.to ? ' hasta el ' + esc(fmtDM(parseDay(promo.to))) : ''}.</p>` : ''}
    <div class="rex-grid"><label><span>Valor pagado</span><input class="input" id="pr-v" inputmode="numeric"></label><label><span>Medio</span><select class="input" id="pr-m">${PAY_METHODS.map(m => `<option>${m}</option>`).join('')}</select></label></div>
    <label class="field"><span>Referencia o número de aprobación</span><input class="input" id="pr-r" maxlength="80"></label>
    <label class="field"><span>Cupón (opcional)</span><input class="input" id="pr-c" maxlength="20" style="text-transform:uppercase"></label><p class="small" id="pr-cm"></p>
    <label class="field"><span>Comprobante (foto o PDF, opcional)</span><input class="input" type="file" id="pr-f" accept="image/*,application/pdf"></label>
    <button class="btn primary block" data-act="prSend">Enviar</button>`, {
    input: t => { if (t.id === 'pr-c') { const v = t.value.trim(); const r = v ? couponCheck(v) : null; $('#pr-cm').textContent = r ? (r.ok ? `Cupón válido: ${fmtInt(r.c.pct)} % de descuento.` : r.msg) : ''; } },
    click: {
      prSend: async el => {
        const v = num($('#pr-v').value); if (!v) return toast('Indica el valor pagado', 'error');
        const code = $('#pr-c').value.trim().toUpperCase(); if (code && !couponCheck(code).ok) return toast(couponCheck(code).msg, 'error');
        el.disabled = true;
        try {
          let path = null; const f = $('#pr-f').files[0];
          if (f) { if (f.size > 8 * 1024 * 1024) throw new Error('El comprobante supera 8 MB'); const blob = /^image\//.test(f.type) ? await resizeImage(f, 1600) : f; const ext = /^image\//.test(f.type) ? 'jpg' : 'pdf'; path = `${S.profile.id}/${uid()}.${ext}`; if (DEMO) await demoFiles.put('proof/' + path, await blob.arrayBuffer()); else { const { error } = await sb.storage.from(PROOF_BUCKET).upload(path, blob, { contentType: blob.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg') }); if (error) throw error; } }
          await DB.insert('payment_reports', { client_id: S.profile.id, amount: v, method: $('#pr-m').value, reference: $('#pr-r').value.trim() || null, proof_path: path, coupon: code || null, status: 'pendiente' });
          closeModal(); toast('Pago reportado: tu entrenador lo confirmará'); if (after) after();
        } catch (e) { toast(errMsg(e), 'error'); el.disabled = false; }
      }
    }
  });
}
async function myPaymentsCardHtml() {
  if (S.needsV10) return '';
  const rs = await DB.select('payment_reports', { eq: { client_id: S.profile.id }, order: 'created_at', asc: false, limit: 5 }).catch(() => []);
  const promo = seasonPromo();
  return `<div class="card"><h3>Pagos</h3>${promo ? `<p class="small"><b>${esc(promo.name)}:</b> ${fmtInt(promo.pct)} % de descuento${promo.to ? ' hasta el ' + esc(fmtDM(parseDay(promo.to))) : ''}.</p>` : ''}
    ${rs.map(r => `<p class="small">${esc(fmtDM(new Date(r.created_at)))} · ${fmtMoney(r.amount)} · ${esc(r.method || '')} <span class="badge ${r.status === 'confirmado' ? 'ok' : r.status === 'rechazado' ? '' : 'warnb'}">${esc(r.status)}</span></p>`).join('')}
    <button class="btn sm" data-act="payRep">Reportar un pago</button></div>`;
}
async function proofUrl(path) {
  if (DEMO) { const v = await demoFiles.get('proof/' + path); return v ? URL.createObjectURL(new Blob([v], { type: /\.pdf$/.test(path) ? 'application/pdf' : 'image/jpeg' })) : ''; }
  const { data, error } = await sb.storage.from(PROOF_BUCKET).createSignedUrl(path, 600); if (error) throw error; return data.signedUrl;
}
async function inboxPayRows(byId) {
  if (S.needsV10 || !isCoach()) return [];
  const rs = (await DB.select('payment_reports', { eq: { status: 'pendiente' }, order: 'created_at' }).catch(() => [])).filter(r => byId[r.client_id]);
  S.payReps = Object.fromEntries(rs.map(r => [r.id, r]));
  return rs.map(r => `<div class="ib-row"><span class="ib-tag r">Pago</span><a class="ib-n" href="#/asesorado/${r.client_id}">${esc(byId[r.client_id].full_name || '')}</a><span class="ib-m">${fmtMoney(r.amount)} · ${esc(r.method || '')} <button class="chip" data-act="payRev" data-id="${r.id}">Revisar</button></span></div>`);
}
async function payReviewModal(r) {
  const [c] = await DB.select('profiles', { eq: { id: r.client_id } }); const m = (await DB.select('memberships', { eq: { client_id: r.client_id } }))[0] || {};
  const u = r.proof_path ? await proofUrl(r.proof_path).catch(() => '') : '';
  const plan = m.plan_name || 'Mensual'; const d = (MEMB_PLANS.find(p => p[0] === plan) || [0, 30])[1] || 30;
  const start = m.end_date ? (m.end_date >= todayStr() ? addDays(m.end_date, 1) : todayStr()) : todayStr();
  modal(`${modalHead('Pago reportado · ' + (c.full_name || ''))}
    <p><b>${fmtMoney(r.amount)}</b> · ${esc(r.method || '')}${r.reference ? ' · ref. ' + esc(r.reference) : ''}${r.coupon ? ' · cupón ' + esc(r.coupon) : ''}</p><p class="small muted">Reportado el ${esc(new Date(r.created_at).toLocaleString('es-CO'))}</p>
    ${u ? (/\.pdf$/.test(r.proof_path) ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">Abrir comprobante (PDF)</a>` : `<a href="${esc(u)}" target="_blank" rel="noopener"><img class="proof" src="${esc(u)}" alt="Comprobante"></a>`) : '<p class="small muted">Sin comprobante adjunto.</p>'}
    <label class="field"><span>Concepto</span><input class="input" id="pv-k" value="Renovación ${esc(plan.toLowerCase())}"></label>
    <label class="check"><input type="checkbox" id="pv-ren" ${m.end_date || !m.client_id ? 'checked' : ''}> Renovar la membresía (${esc(plan)}): ${esc(fmtDM(parseDay(start)))} a ${esc(fmtDM(parseDay(addDays(start, d - 1))))}</label>
    <div class="row-btns"><button class="btn primary" data-act="pvOk">Confirmar pago</button><button class="btn danger-outline" data-act="pvNo">Rechazar</button></div>`, {
    click: {
      pvOk: async () => {
        const [p] = await DB.insert('payments', { client_id: r.client_id, pay_date: dateStr(new Date(r.created_at)), amount: num(r.amount), method: r.method, concept: $('#pv-k').value.trim() || null, coupon: r.coupon || null });
        if ($('#pv-ren').checked) await saveMembership(r.client_id, { plan_name: plan, start_date: start, end_date: addDays(start, d - 1), amount: num(r.amount), archived: false });
        await DB.update('payment_reports', r.id, { status: 'confirmado', payment_id: p.id, reviewed_at: new Date().toISOString() });
        await DB.insert('messages', { client_id: r.client_id, sender_id: S.profile.id, body: `Confirmé tu pago de ${fmtMoney(r.amount)}. ¡Gracias!${$('#pv-ren').checked ? ` Tu asesoría queda activa hasta el ${fmtDateLong(addDays(start, d - 1))}.` : ''}` }).catch(() => { });
        closeModal(); toast('Pago confirmado'); route();
      },
      pvNo: async () => { const why = prompt('Motivo para el asesorado (opcional):'); if (why === null) return; await DB.update('payment_reports', r.id, { status: 'rechazado', reviewed_at: new Date().toISOString() }); if (why.trim()) await DB.insert('messages', { client_id: r.client_id, sender_id: S.profile.id, body: 'Sobre tu pago reportado: ' + why.trim() }).catch(() => { }); closeModal(); route(); }
    }
  });
}

/* ---------- 50. Recibo de pago ---------- */
async function receiptNo(p) {
  if (p.receipt_no) return p.receipt_no;
  const all = await DB.select('payments'); const n = Math.max(num(S.settings.receipt_start) - 1, 0, ...all.map(x => num(x.receipt_no))) + 1;
  await DB.update('payments', p.id, { receipt_no: n }); p.receipt_no = n; return n;
}
function receiptHtml(p, c, logo) {
  const s = S.settings; const cp = p.coupon ? coupons().find(x => x.code === p.coupon) : null;
  return `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Recibo de pago N.° ${String(p.receipt_no).padStart(5, '0')}</h1><p><b>${esc(s.biz_name || BRAND.name)}</b>${s.biz_id ? ' · ' + esc(s.biz_id) : ''}</p><p class="doc-sub">${esc([s.biz_address, s.biz_city, s.whatsapp].filter(Boolean).join(' · '))}</p></div></div>
    <table class="doc-t"><tbody><tr><td>Fecha del pago</td><td class="n">${esc(fmtDateLong(p.pay_date))}</td></tr><tr><td>Recibido de</td><td class="n">${esc(c.full_name || '')}</td></tr>${c.email ? `<tr><td>Correo</td><td class="n">${esc(c.email)}</td></tr>` : ''}
      <tr><td>Concepto</td><td class="n">${esc(p.concept || 'Asesoría')}</td></tr><tr><td>Medio de pago</td><td class="n">${esc(p.method || '—')}</td></tr>${p.coupon ? `<tr><td>Cupón</td><td class="n">${esc(p.coupon)}${cp ? ` (${fmtInt(cp.pct)} %)` : ''}</td></tr>` : ''}</tbody>
      <tfoot><tr><td>Valor recibido</td><td class="n">${fmtMoney(p.amount)}</td></tr></tfoot></table>
    <p class="doc-foot">Documento soporte del pago recibido. No es una factura electrónica de venta.${s.biz_note ? ' ' + esc(s.biz_note) : ''}</p>`;
}
async function receiptModal(pid) {
  const p = (await DB.select('payments', { eq: { id: pid } }))[0]; if (!p) return; await receiptNo(p);
  const c = (await DB.select('profiles', { eq: { id: p.client_id } }))[0] || {};
  const name = `Recibo ${String(p.receipt_no).padStart(5, '0')} - ${c.full_name || ''}`.replace(/[\\/:*?"<>|]/g, '');
  const docs = reportDocButtons(name, logo => receiptHtml(p, c, logo));
  ensureReportCss();
  modal(`${modalHead('Recibo de pago')}<div class="doc">${receiptHtml(p, c, BRAND.logoFull || BRAND.logo)}</div><div class="row-btns"><button class="btn primary" data-act="pdf">PDF</button><button class="btn" data-act="html">HTML</button>${waBtn(c.phone, `Hola ${firstName(c.full_name)}, te comparto el recibo N.° ${p.receipt_no} de tu pago de ${fmtMoney(p.amount)}.`, 'WhatsApp')}</div>`, { click: { pdf: () => { closeModal(); docs.pdf(); }, html: docs.html } });
}

/* ---------- 49. Afiliados (entrenadores de tenis y aliados) ---------- */
function affiliates() { return String(S.settings.affiliates || '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x[0] && x[1]).map(([name, code, pct, phone]) => ({ name, code: code.toUpperCase().replace(/[^A-Z0-9]/g, ''), pct: num(pct) || 10, phone: phone || '' })); }
async function bizAfiliados() {
  const af = affiliates();
  if (!af.length) return { html: `<div class="card empty"><p>Agrega los afiliados en Ajustes › Afiliados con el formato Nombre | CÓDIGO | comisión % | WhatsApp.</p><a class="btn sm" href="#/ajustes">Ir a Ajustes</a></div>` };
  const [leads, its, pays, cl] = await Promise.all([DB.select('leads').catch(() => []), DB.select('intakes'), DB.select('payments', { order: 'pay_date' }), DB.select('profiles', { eq: { role: 'client' } })]);
  const rows = af.map(a => {
    const ld = leads.filter(l => String(l.ref || '').toUpperCase() === a.code); const cs = its.filter(i => String((i.data || {}).ref || '').toUpperCase() === a.code).map(i => i.client_id);
    const ps = pays.filter(p => cs.includes(p.client_id)); const tot = ps.reduce((s, p) => s + num(p.amount), 0);
    return { a, leads: ld.length, conv: ld.filter(l => l.status === 'convertido').length, clients: cs, tot, com: tot * a.pct / 100 };
  });
  return {
    html: `<p class="small muted">Cada afiliado comparte su enlace. Los prospectos y asesorados que llegan con su código se asocian a él; la comisión se calcula sobre los pagos registrados de esos asesorados.</p>
      ${hbars(rows.map(r => ({ label: r.a.name, value: r.tot + 0.01, text: fmtMoney(r.tot) })))}
      ${rows.map(r => { const link = landingUrl() + '?ref=' + r.a.code; return `<div class="card"><div class="day-h"><div><b>${esc(r.a.name)}</b> <span class="tag">${esc(r.a.code)}</span><small class="muted">${r.leads} prospectos · ${r.clients.length} asesorados · comisión ${fmtN(r.a.pct)} %</small></div><b>${fmtMoney(Math.round(r.com))}</b></div>
        <p class="small">Pagos de sus asesorados: ${fmtMoney(r.tot)}${r.clients.length ? ' · ' + esc(r.clients.map(id => (cl.find(c => c.id === id) || {}).full_name || '').filter(Boolean).join(', ')) : ''}</p>
        <div class="row-btns"><button class="btn sm" data-act="cp" data-v="${esc(link)}">Copiar su enlace</button>${waBtn(r.a.phone, `Hola ${firstName(r.a.name)}, tu enlace de afiliado de ${BRAND.name} es ${link}. Este mes: ${r.leads} prospectos, ${r.clients.length} asesorados y una comisión acumulada de ${fmtMoney(Math.round(r.com))}.`, 'Enviar resumen')}</div></div>`; }).join('')}`,
    click: { cp: async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Enlace copiado'); } catch (e) { prompt('Copia el enlace:', el.dataset.v); } } }
  };
}

/* ---------- 51 y 52. Testimonios publicados y NPS por mes ---------- */
async function npsMonthlyHtml() {
  const sv = await DB.select('surveys', { order: 'created_at' }).catch(() => []); if (!sv.length) return '';
  const ms = []; const d = new Date(); for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); ms.push(x.getFullYear() + '-' + pad2(x.getMonth() + 1)); }
  const v = ms.map(k => { const xs = sv.filter(s => String(s.created_at).slice(0, 7) === k); return xs.length ? { n: xs.length, nps: Math.round((xs.filter(s => s.nps >= 9).length - xs.filter(s => s.nps <= 6).length) / xs.length * 100) } : null; });
  return `<div class="card"><h3>NPS por mes</h3>${vbars(ms.map((k, i) => ({ label: monthLbl(k), value: v[i] ? v[i].nps + 100 : 0, text: v[i] ? `${v[i].nps} (${v[i].n})` : '', hi: i === 5 })), 'Sin respuestas en los últimos 6 meses.')}<p class="small muted">Barras desplazadas +100 para mostrar valores negativos; la etiqueta indica el NPS real y el número de respuestas.</p></div>`;
}
async function testimonialsAdminHtml() {
  const [sv, cl] = await Promise.all([DB.select('surveys', { order: 'created_at', asc: false }).catch(() => []), DB.select('profiles', { eq: { role: 'client' } })]);
  const ts = sv.filter(s => s.consent && s.testimonial); if (!ts.length) return '';
  return `<div class="card"><h3>Testimonios en la página pública</h3><p class="small muted">Solo testimonios con autorización del asesorado. El nombre se muestra únicamente si lo autorizó.</p>${ts.map(s => `<label class="check"><input type="checkbox" data-pub="${s.id}" ${s.published ? 'checked' : ''}> «${esc(s.testimonial.length > 90 ? s.testimonial.slice(0, 88) + '…' : s.testimonial)}» <small class="muted">${s.show_name ? esc((cl.find(c => c.id === s.client_id) || {}).full_name || '') : 'anónimo'}</small></label>`).join('')}</div>`;
}

/* ---------- 53. Contrato y autorizaciones firmadas ---------- */
const hashText = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
function contractText(c, m) {
  const t = String(S.settings.contract_text || ''); if (!t.trim()) return '';
  return t.replace(/\{nombre\}/g, c.full_name || '').replace(/\{correo\}/g, c.email || '').replace(/\{fecha\}/g, fmtDateLong(todayStr())).replace(/\{plan\}/g, (m && m.plan_name) || '').replace(/\{marca\}/g, BRAND.name);
}
const contractVersion = () => hashText(String(S.settings.contract_text || ''));
async function contractPending() {
  if (S.needsV10 || !String(S.settings.contract_text || '').trim()) return false;
  const s = await DB.select('signatures', { eq: { client_id: S.profile.id, doc_kind: 'contrato', doc_version: contractVersion() } }).catch(() => [1]);
  return !s.length;
}
async function contractCardHtml(c) { return c.own && c.isToday && await contractPending() ? `<a class="card row-link ck-due" href="#/contrato"><div><b>Firma tu contrato de servicio</b><small class="muted">Lectura y firma en 2 minutos.</small></div><span class="chev">›</span></a>` : ''; }
function signedDocHtml(s, logo) {
  return `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Contrato de prestación de servicios</h1><p class="doc-sub">${esc(BRAND.name)} · versión ${esc(s.doc_version)}</p></div></div><p class="pre">${esc(s.doc_text)}</p>
    <h2>Firma</h2>${s.signature_png ? `<img src="${esc(s.signature_png)}" alt="Firma" style="max-width:280px;border-bottom:1px solid #999">` : ''}<p><b>${esc(s.signed_name)}</b></p><p class="doc-sub">Firmado electrónicamente en la aplicación el ${esc(new Date(s.signed_at).toLocaleString('es-CO'))}. Dispositivo: ${esc((s.user_agent || '').slice(0, 120))}.</p>`;
}
async function vContrato() {
  if (S.needsV10) return paint('<div class="card empty"><p>Disponible próximamente.</p></div>');
  const m = (await DB.select('memberships', { eq: { client_id: S.profile.id } }).catch(() => []))[0];
  const sigs = await DB.select('signatures', { eq: { client_id: S.profile.id }, order: 'signed_at', asc: false });
  const cur = sigs.find(s => s.doc_version === contractVersion());
  if (cur || !String(S.settings.contract_text || '').trim()) {
    const s = cur || sigs[0];
    if (!s) return paint('<a class="linkbtn" href="#/perfil">← Perfil</a><div class="card empty"><p>No hay contratos pendientes.</p></div>', {}, 'Contrato');
    ensureReportCss(); const docs = reportDocButtons('Contrato - ' + (S.profile.full_name || ''), logo => signedDocHtml(s, logo));
    return paint(`<a class="linkbtn" href="#/perfil">← Perfil</a><div class="row-btns"><button class="btn primary" data-act="pdf">PDF</button><button class="btn" data-act="html">HTML</button></div><div class="doc">${signedDocHtml(s, BRAND.logoFull || BRAND.logo)}</div>`, { click: docs }, 'Contrato firmado');
  }
  const text = contractText(S.profile, m);
  paint(`<a class="linkbtn" href="#/hoy">← Hoy</a><div class="card"><p class="pre small">${esc(text)}</p></div>
    <div class="card"><label class="field"><span>Nombre completo</span><input class="input" id="sg-n" value="${esc(S.profile.full_name || '')}"></label>
      <div class="field"><span>Firma (dibuja con el dedo)</span><canvas id="sg-c" class="sig" width="600" height="200"></canvas><button class="linkbtn" data-act="sgClr">Borrar firma</button></div>
      <label class="check"><input type="checkbox" id="sg-ok"> Leí y acepto el contrato.</label>
      <button class="btn primary block" data-act="sgSave">Firmar</button></div>`, {
    click: {
      sgClr: () => { const c = $('#sg-c'); c.getContext('2d').clearRect(0, 0, c.width, c.height); c.dataset.ink = ''; },
      sgSave: async el => {
        const n = $('#sg-n').value.trim(); const c = $('#sg-c');
        if (n.length < 5) return toast('Escribe tu nombre completo', 'error'); if (!c.dataset.ink) return toast('Dibuja tu firma', 'error'); if (!$('#sg-ok').checked) return toast('Confirma que aceptas el contrato', 'error');
        el.disabled = true;
        await DB.insert('signatures', { client_id: S.profile.id, doc_kind: 'contrato', doc_version: contractVersion(), doc_text: text, signed_name: n, signature_png: c.toDataURL('image/png'), user_agent: navigator.userAgent.slice(0, 300) });
        toast('Contrato firmado'); route();
      }
    }
  }, 'Contrato de servicio');
  const c = $('#sg-c'); const x = c.getContext('2d'); x.lineWidth = 3; x.lineCap = 'round'; x.strokeStyle = '#0f2a44'; let draw = false;
  const pos = e => { const r = c.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * c.width / r.width, (p.clientY - r.top) * c.height / r.height]; };
  const start = e => { draw = true; const [a, b] = pos(e); x.beginPath(); x.moveTo(a, b); e.preventDefault(); };
  const move = e => { if (!draw) return; const [a, b] = pos(e); x.lineTo(a, b); x.stroke(); c.dataset.ink = '1'; e.preventDefault(); };
  const end = () => { draw = false; };
  c.addEventListener('pointerdown', start); c.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: false });
}
async function contractsTab(cid) {
  if (S.needsV10) return { html: '<div class="card empty"><p>Ejecuta la migración v10.</p></div>' };
  const sigs = await DB.select('signatures', { eq: { client_id: cid }, order: 'signed_at', asc: false });
  ensureReportCss();
  return {
    html: `${String(S.settings.contract_text || '').trim() ? '' : '<p class="small muted">Escribe el texto del contrato en Ajustes › Contrato de servicio para pedir la firma a los asesorados.</p>'}
      ${sigs.length ? sigs.map(s => `<div class="card"><div class="day-h"><div><b>Contrato · versión ${esc(s.doc_version)}</b><small class="muted">Firmado por ${esc(s.signed_name)} el ${esc(new Date(s.signed_at).toLocaleString('es-CO'))}</small></div>${s.doc_version === contractVersion() ? '<span class="badge ok">Vigente</span>' : '<span class="badge">Versión anterior</span>'}</div><div class="row-btns"><button class="btn sm" data-act="sgPdf" data-id="${s.id}">PDF</button><button class="btn sm" data-act="sgHtml" data-id="${s.id}">HTML</button></div></div>`).join('') : '<div class="card empty"><p>Sin contratos firmados.</p></div>'}`,
    click: {
      sgPdf: el => { const s = sigs.find(x => x.id === el.dataset.id); reportDocButtons('Contrato', logo => signedDocHtml(s, logo)).pdf(); },
      sgHtml: el => { const s = sigs.find(x => x.id === el.dataset.id); reportDocButtons('Contrato', logo => signedDocHtml(s, logo)).html(); }
    }
  };
}

/* ---------- 54. Asistentes y asesorados asignados ---------- */
async function assignHeadHtml(cid) {
  if (S.needsV10 || !isCoach()) return '';
  const [team, meta] = await Promise.all([DB.select('profiles', { eq: { role: 'assistant' } }).catch(() => []), DB.select('client_meta', { eq: { client_id: cid } }).catch(() => [])]);
  if (!team.length) return '';
  const cur = (meta[0] || {}).assigned_to || '';
  return `<label class="field"><span>Asistente asignado</span><select class="input" data-assign="${cid}"><option value="">Sin asignar</option>${team.map(t => `<option value="${t.id}"${t.id === cur ? ' selected' : ''}>${esc(t.full_name || t.email)}</option>`).join('')}</select></label>`;
}
async function assignChange(t) {
  if (!t.dataset.assign) return false; const cid = t.dataset.assign;
  const ex = (await DB.select('client_meta', { eq: { client_id: cid } }))[0];
  if (ex) await DB.update('client_meta', cid, { assigned_to: t.value || null, updated_at: new Date().toISOString() }, 'client_id'); else await DB.insert('client_meta', { client_id: cid, assigned_to: t.value || null });
  toast('Asignación guardada'); return true;
}
async function teamCardHtml() {
  if (S.needsV10) return '';
  const [team, clients, metas] = await Promise.all([DB.select('profiles', { eq: { role: 'assistant' } }).catch(() => []), DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' }), DB.select('client_meta').catch(() => [])]);
  return `<div class="card"><h3>Equipo</h3>${team.length ? team.map(t => { const n = metas.filter(m => m.assigned_to === t.id).length; return `<p class="small"><b>${esc(t.full_name || t.email)}</b> · ${n ? n + ' asesorados asignados' : 've a todos los asesorados (sin asignaciones)'} <button class="linkbtn" data-act="tmRole" data-id="${t.id}" data-r="client">quitar de asistente</button></p>`; }).join('') : '<p class="small muted">Sin asistentes.</p>'}
    <label class="field"><span>Convertir una cuenta registrada en asistente</span><select class="input" id="tm-c"><option value="">Elige la cuenta</option>${clients.map(c => `<option value="${c.id}">${esc(c.full_name || c.email)} · ${esc(c.email || '')}</option>`).join('')}</select></label>
    <button class="btn sm" data-act="tmAdd">Convertir en asistente</button>
    <p class="small muted">La persona crea su cuenta con el enlace de la app y tú la conviertes aquí. Un asistente lee los datos y responde mensajes y check-ins; no edita planes ni ve el panel de negocio. Si le asignas asesorados en su ficha, solo ve a esos.</p></div>`;
}
const teamHandlers = () => ({
  tmAdd: async () => { const id = $('#tm-c').value; if (!id) return toast('Elige la cuenta', 'error'); if (!confirm('¿Convertir esta cuenta en asistente? Dejará de aparecer como asesorado.')) return; await setRole(id, 'assistant'); toast('Asistente agregado'); route(); },
  tmRole: async el => { if (!confirm('¿Quitar el rol de asistente? La cuenta vuelve a ser de asesorado.')) return; await setRole(el.dataset.id, el.dataset.r); route(); }
});
async function setRole(id, role) { if (DEMO) return DB.update('profiles', id, { role }); await DB.rpc('set_team_role', { target: id, new_role: role }); }

/* ---------- 55. Marca propia ---------- */
function applySavedBrand() {
  const b = (S.settings && S.settings.brand) || {}; const pick = {};
  ['name', 'short', 'tagline', 'primary', 'accent', 'logo'].forEach(k => { if (b[k]) pick[k] = b[k]; });
  if (!Object.keys(pick).length) return;
  Object.assign(BRAND, pick); if (pick.logo) BRAND.logoFull = pick.logo; applyBrand();
}
async function brandCardHtml() {
  if (S.needsV10) return ''; const b = S.settings.brand || {};
  return `<div class="card"><h3>Marca</h3><p class="small muted">Nombre, colores y logo que ven los asesorados en la app, los documentos y la página de captación. Vacío = valores de config.js.</p>
    <div class="rex-grid"><label><span>Nombre</span><input class="input" data-brand="name" value="${esc(b.name || '')}" placeholder="${esc(CFG.BRAND && CFG.BRAND.name || '')}"></label><label><span>Abreviatura</span><input class="input" data-brand="short" maxlength="3" value="${esc(b.short || '')}"></label></div>
    <label class="field"><span>Frase</span><input class="input" data-brand="tagline" value="${esc(b.tagline || '')}"></label>
    <div class="rex-grid"><label><span>Color principal</span><input class="input" type="color" data-brand="primary" value="${esc(b.primary || BRAND.primary || '#0B406C')}"></label><label><span>Color de acento</span><input class="input" type="color" data-brand="accent" value="${esc(b.accent || BRAND.accent || '#6FB232')}"></label></div>
    <label class="field"><span>Logo (PNG o JPG)</span><input class="input" type="file" accept="image/png,image/jpeg" id="br-f"></label>
    <div class="row-btns"><button class="btn sm" data-act="brLogo">Subir logo</button><button class="btn sm" data-act="brReset">Restablecer marca</button></div>
    <p class="small muted">El ícono de la app instalada en el celular y su nombre en la pantalla de inicio vienen de manifest.json y no cambian desde aquí.</p></div>`;
}
const brandHandlers = () => ({
  brLogo: async el => {
    const f = ($('#br-f') || {}).files && $('#br-f').files[0]; if (!f) return toast('Elige la imagen', 'error'); el.disabled = true;
    try {
      let url;
      if (DEMO) url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      else { const path = 'logo-' + Date.now() + (/png/.test(f.type) ? '.png' : '.jpg'); const { error } = await sb.storage.from('brand').upload(path, f, { contentType: f.type, upsert: true }); if (error) throw error; url = sb.storage.from('brand').getPublicUrl(path).data.publicUrl; }
      await saveSettings({ brand: Object.assign({}, S.settings.brand || {}, { logo: url }) }); applySavedBrand(); toast('Logo guardado');
    } catch (e) { toast(errMsg(e), 'error'); } el.disabled = false;
  },
  brReset: async () => { if (!confirm('¿Volver a la marca de config.js?')) return; await saveSettings({ brand: {} }); location.reload(); }
});
async function brandChange(t) { if (!t.dataset.brand) return false; await saveSettings({ brand: Object.assign({}, S.settings.brand || {}, { [t.dataset.brand]: t.value.trim() }) }); applySavedBrand(); toast('Guardado'); return true; }

/* ---------- 47. Asignar una plantilla a varios asesorados ---------- */
async function bulkAssignModal(kind, id) {
  const cl = (await DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' }));
  const mem = typeof loadMemberships === 'function' ? await loadMemberships() : {}; const act = cl.filter(c => !(mem[c.id] && mem[c.id].archived));
  modal(`${modalHead('Asignar a varios asesorados')}
    ${kind === 'n' ? '<label class="check"><input type="checkbox" id="ba-k" checked> Ajustar las porciones a las calorías del plan activo de cada asesorado</label>' : ''}
    <button class="linkbtn" data-act="baAll">Seleccionar todos</button>
    <div class="pick-list tall">${act.map(c => `<label class="check"><input type="checkbox" data-ba="${c.id}"> ${esc(c.full_name || c.email)}</label>`).join('')}</div>
    <p class="small muted">${kind === 'n' ? 'Cada asesorado recibe una copia como plan activo; su plan anterior queda inactivo.' : 'Cada asesorado recibe una copia de la rutina como rutina activa.'}</p>
    <button class="btn primary block" data-act="baGo">Asignar</button>`, {
    click: {
      baAll: () => document.querySelectorAll('#modal [data-ba]').forEach(x => { x.checked = true; }),
      baGo: async el => {
        const ids = [...document.querySelectorAll('#modal [data-ba]:checked')].map(x => x.dataset.ba); if (!ids.length) return toast('Elige al menos un asesorado', 'error');
        el.disabled = true; let n = 0;
        for (const cid of ids) {
          try {
            if (kind === 'n') { const cur = $('#ba-k') && $('#ba-k').checked ? await activePlanFor(cid) : null; await copyPlan(id, { clientId: cid, kcal: cur && num(cur.kcal) ? num(cur.kcal) : null }); }
            else { await duplicateRoutine(id, cid); }
            n++;
          } catch (e) { console.warn(e); }
        }
        closeModal(); toast(`Asignada a ${n} ${n === 1 ? 'asesorado' : 'asesorados'}`);
      }
    }
  });
}

/* ---------- Registro ---------- */
HOOKS.boot.push(applySavedBrand);
HOOKS.inbox.push(inboxPayRows);
HOOKS.inboxClick.push({ click: () => ({ payRev: el => { const r = (S.payReps || {})[el.dataset.id]; if (r) payReviewModal(r); } }) });
HOOKS.hoy.push({ pos: 'afterSum', html: contractCardHtml });
HOOKS.routes.contrato = vContrato; HOOKS.nav.contrato = 'perfil';
HOOKS.perfilClient.push({ href: '#/contrato', title: 'Contrato de servicio', sub: 'Leer, firmar y descargar', show: () => !S.needsV10 && !!String(S.settings.contract_text || '').trim() });
HOOKS.fichaTabs.push({ group: 'Expediente', key: 'contrato', label: 'Contrato', fn: contractsTab, show: () => !S.needsV10 });
HOOKS.ajustes.push({
  html: async () => S.needsV10 ? '' : `${await brandCardHtml()}${await teamCardHtml()}
    <div class="card"><h3>Cupones y promoción de temporada</h3><label class="field"><span>Cupones: CÓDIGO | % | vence AAAA-MM-DD | usos máximos (opcional)</span><textarea class="input" rows="3" data-s="coupons" placeholder="TENIS10 | 10 | 2026-12-31 | 20">${esc(S.settings.coupons || '')}</textarea></label>
      <label class="field"><span>Promoción: Nombre | % | desde AAAA-MM-DD | hasta AAAA-MM-DD</span><input class="input" data-s="season_promo" value="${esc(S.settings.season_promo || '')}" placeholder="Temporada de torneos | 15 | 2026-11-01 | 2026-11-30"></label>
      <p class="small muted">La promoción vigente aparece en la página de captación y en Perfil › Pagos. El cupón se valida cuando el asesorado reporta su pago y queda registrado en el pago.</p></div>
    <div class="card"><h3>Afiliados</h3><label class="field"><span>Uno por línea: Nombre | CÓDIGO | comisión % | WhatsApp</span><textarea class="input" rows="3" data-s="affiliates" placeholder="Club Los Lagos | LAGOS | 10 | 3001234567">${esc(S.settings.affiliates || '')}</textarea></label><p class="small muted">Resultados y comisiones en Negocio › Afiliados.</p></div>
    <div class="card"><h3>Datos para los recibos</h3><div class="rex-grid"><label><span>Nombre o razón social</span><input class="input" data-s="biz_name" value="${esc(S.settings.biz_name || '')}"></label><label><span>NIT o cédula</span><input class="input" data-s="biz_id" value="${esc(S.settings.biz_id || '')}"></label></div>
      <div class="rex-grid"><label><span>Dirección</span><input class="input" data-s="biz_address" value="${esc(S.settings.biz_address || '')}"></label><label><span>Ciudad</span><input class="input" data-s="biz_city" value="${esc(S.settings.biz_city || '')}"></label></div>
      <div class="rex-grid"><label><span>Número del primer recibo</span><input class="input" data-s="receipt_start" data-num="1" inputmode="numeric" value="${esc(S.settings.receipt_start ?? 1)}"></label><label><span>Nota al pie (opcional)</span><input class="input" data-s="biz_note" value="${esc(S.settings.biz_note || '')}"></label></div>
      <p class="small muted">El recibo es un soporte de pago numerado. No reemplaza la factura electrónica de la DIAN si estás obligado a expedirla.</p></div>
    <div class="card"><h3>Contrato de servicio</h3><label class="field"><span>Texto del contrato. Campos: {nombre} {correo} {fecha} {plan} {marca}</span><textarea class="input" rows="8" data-s="contract_text" placeholder="Entre {marca} y {nombre} se acuerda…">${esc(S.settings.contract_text || '')}</textarea></label><p class="small muted">Cada vez que cambies el texto se crea una nueva versión y se pide la firma de nuevo en Hoy. Las firmas anteriores se conservan.</p></div>`,
  click: () => Object.assign(teamHandlers(), brandHandlers()),
  change: async t => brandChange(t)
});
HOOKS.fichaHead.push({ html: assignHeadHtml, change: assignChange });
HOOKS.perfilExtra.push({ html: myPaymentsCardHtml, show: () => S.profile.role === 'client', click: () => ({ payRep: () => payReportModal(() => route()) }) });

/* ---------- Datos de demostración (v10) ---------- */
function buildV10Demo(d) {
  const t = todayStr(); const iso = new Date().toISOString();
  Object.assign(d, { training_blocks: d.training_blocks || [], weekly_goals: d.weekly_goals || [], lab_results: d.lab_results || [], bia_logs: d.bia_logs || [], appointments: d.appointments || [], payment_reports: d.payment_reports || [], signatures: d.signatures || [] });
  const rAna = (d.routines || []).find(r => r.client_id === 'demo-ana');
  if (rAna) {
    const s0 = addDays(t, -24);
    d.training_blocks.push({ id: uid(), client_id: 'demo-ana', name: 'Bloque 1', focus: 'Adaptación anatómica', start_date: s0, end_date: addDays(s0, 20), routine_id: rAna.id, notes: null, activated_at: iso, created_at: iso },
      { id: uid(), client_id: 'demo-ana', name: 'Bloque 2', focus: 'Fuerza máxima', start_date: addDays(s0, 21), end_date: addDays(s0, 48), routine_id: rAna.id, notes: '3–6 repeticiones, RIR 2. Potencia al inicio de la sesión.', activated_at: iso, created_at: iso },
      { id: uid(), client_id: 'demo-ana', name: 'Bloque 3', focus: 'Potencia', start_date: addDays(s0, 49), end_date: addDays(s0, 69), routine_id: null, notes: null, activated_at: null, created_at: iso });
  }
  (d.wellness || []).filter(w => w.client_id === 'demo-ana').forEach((w, i) => { w.hrv_ms = 58 + (i * 7) % 13 - (i === 0 ? 14 : 0); w.sleep_h = 6.5 + (i % 4) * 0.5; w.rhr = 54 + (i % 3); });
  (d.tennis_sessions || []).filter(x => x.client_id === 'demo-ana').forEach((x, i) => { x.serves = x.kind === 'Partido' ? 95 : 60 + (i % 3) * 10; x.strokes = x.minutes * 6; });
  d.weekly_goals.push({ id: uid(), client_id: 'demo-juan', week_start: dateStr(startOfWeek(new Date())), body: 'Registrar todas las comidas de lunes a viernes', status: 'propuesta', coach_note: null, done: null, created_at: iso });
  [[-120, 'ferritina', 22, 'ng/mL', 30, 400], [-10, 'ferritina', 41, 'ng/mL', 30, 400], [-120, 'vitd', 21, 'ng/mL', 30, 100], [-10, 'vitd', 33, 'ng/mL', 30, 100], [-10, 'glucosa', 92, 'mg/dL', 70, 99]]
    .forEach(([o, m, v, u, lo, hi]) => d.lab_results.push({ id: uid(), client_id: 'demo-juan', test_date: addDays(t, o), marker: m, value: v, unit: u, ref_low: lo, ref_high: hi, notes: null, created_at: iso }));
  const cond = { ayuno: true, manana: true, sinej: true, orina: true, hidra: true };
  [[-60, 92.1, 26.8, 36.1, cond], [-30, 90.4, 25.2, 36.4, cond], [-12, 90.9, 23.9, 36.0, { ayuno: false, manana: false, sinej: true, orina: true, hidra: true }], [-3, 89.2, 24.1, 36.6, cond]]
    .forEach(([o, w, f, m, c]) => d.bia_logs.push({ id: uid(), client_id: 'demo-juan', measure_date: addDays(t, o), device: 'InBody 270', weight_kg: w, fat_pct: f, muscle_kg: m, water_pct: 55, visceral: 9, bmr: 1890, conditions: c, notes: null, created_at: iso }));
  const nx = [1, 2, 3, 4, 5].map(k => addDays(t, k)).find(x => { const wd = parseDay(x).getDay(); return wd >= 1 && wd <= 5; });
  if (nx) d.appointments.push({ id: uid(), client_id: 'demo-juan', starts_at: new Date(nx + 'T09:00:00').toISOString(), minutes: 30, kind: 'Control', notes: 'Revisión de la fase 2', status: 'solicitada', created_at: iso });
  d.payment_reports.push({ id: uid(), client_id: 'demo-juan', amount: 180000, method: 'Nequi', reference: 'M123456', proof_path: null, coupon: null, status: 'pendiente', payment_id: null, created_at: iso });
  (d.surveys || []).forEach(s => { if (s.consent && s.testimonial) s.published = true; });
  const pr = { 'Pechuga de pollo cocida': [21000, 23500, 19800], 'Arroz blanco cocido': [4200, 5100, 3900], 'Huevo entero': [9800, 11200, 9500], 'Banano': [3200, 3900, 2900], 'Avena en hojuelas': [9000, 11800, 8600], 'Salmón cocido': [62000, 69000, 0], 'Tilapia cocida': [24000, 27500, 22800] };
  (d.foods || []).forEach(f => { const v = pr[f.name]; if (v) { f.prices = { 'D1': v[0], 'Éxito': v[1] }; if (v[2]) f.prices.Ara = v[2]; } });
  if (d.app_settings && d.app_settings[0]) Object.assign(d.app_settings[0].data, { stores: 'D1\nÉxito\nAra', affiliates: 'Club Los Lagos | LAGOS | 10 | 3001234567', coupons: 'TENIS10 | 10 | ' + addDays(t, 60) + ' | 20' });
}
