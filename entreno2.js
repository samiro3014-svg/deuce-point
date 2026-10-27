/* =====================================================================
   Deuce Point v9 · Entrenamiento: ajuste por bienestar, calentamiento,
   récords en la sesión y videos de técnica
   ===================================================================== */

/* ---------- ajuste por cómo amaneció ---------- */
async function readinessFor(cid) {
  if (S.needsV6 || typeof wellnessLight !== 'function') return null;
  const w = (await DB.select('wellness', { eq: { client_id: cid, log_date: todayStr() } }).catch(() => []))[0];
  const l = w ? wellnessLight(w) : null;
  const hv = w && typeof hrvStatus === 'function' ? await hrvStatus(cid, w).catch(() => null) : null;
  if (hv && hv.low && (!l || l.cls === 'ok')) return { cls: 'warnb', tot: l ? l.tot : 0, label: 'VFC baja', hrv: hv };
  if (!l || l.cls === 'ok') return null;
  return { cls: l.cls, tot: l.tot, label: l.label, hrv: hv };
}
function readyBannerHtml(d) {
  const r = d.ready; if (!r) return '';
  if (d.adjusted) return `<div class="card ok-box small">Sesión ajustada por bienestar (${r.label.toLowerCase()}): una serie menos por ejercicio y RIR +1.</div>`;
  return `<div class="card warn-box small"><b>Bienestar de hoy: ${r.tot}/25 · ${esc(r.label)}.</b>${r.hrv && r.hrv.low ? ` VFC ${fmtInt(r.hrv.v)} ms, por debajo de tu rango habitual (${fmtInt(r.hrv.lo)}–${fmtInt(r.hrv.hi)} ms).` : ''} ${r.cls === 'bad' ? 'Se sugiere reducir el volumen y la intensidad.' : 'Se sugiere evitar el fallo muscular.'} Ajuste propuesto: una serie menos en cada ejercicio (mínimo 2) y RIR +1.
    <div class="row-btns"><button class="btn sm primary" data-act="rAdj">Aplicar ajuste</button><button class="btn sm" data-act="rNo">Mantener la sesión</button></div></div>`;
}
const readyHandlers = rerender => ({
  rAdj: () => { const d = getDraft(); d.exercises.forEach(e => { const nd = e.sets.filter(s => !s.done); if (e.sets.length > 2 && nd.length && !e.sets[e.sets.length - 1].done) e.sets.pop(); e.target = Object.assign({}, e.target || {}); const rir = num(String(e.target.rir || '').split('-')[0]); e.target.rir = rir ? String(rir + 1) : '2'; }); d.adjusted = true; d.notes = ((d.notes || '') + `\nSesión ajustada por bienestar (${d.ready.tot}/25).`).trim(); saveDraft(d); rerender(); toast('Sesión ajustada'); },
  rNo: () => { const d = getDraft(); d.ready = null; saveDraft(d); rerender(); }
});

/* ---------- calentamiento sugerido según los grupos musculares del día ---------- */
const WARMUP = {
  base: ['3 min de cardio suave (bicicleta, elíptica o trote)', 'Movilidad de cadera: 8 balanceos de pierna adelante y atrás por lado'],
  pierna: ['10 sentadillas con peso corporal, lentas', '8 zancadas alternas con rotación de tronco', '10 puentes de glúteo con pausa de 2 s'],
  torso: ['10 rotaciones de hombro con banda o palo', '10 aperturas con banda elástica', '8 flexiones de pecho inclinadas'],
  espalda: ['10 retracciones escapulares colgado o con banda', '8 remos con banda, pausa de 1 s'],
  core: ['20 s de plancha frontal', '8 «dead bug» por lado']
};
const WU_MAP = { 'Cuádriceps': 'pierna', 'Isquiotibiales': 'pierna', 'Glúteos': 'pierna', 'Pantorrillas': 'pierna', 'Pecho': 'torso', 'Hombros': 'torso', 'Tríceps': 'torso', 'Espalda': 'espalda', 'Bíceps': 'espalda', 'Core': 'core', 'Potencia': 'pierna' };
function warmupHtml(d) {
  if (d.wuDone || !d.exercises.length) return '';
  const groups = [...new Set(d.exercises.map(e => WU_MAP[(S.exById[e.exercise_id] || {}).muscle_group]).filter(Boolean))];
  if (!groups.length) return '';
  const items = WARMUP.base.concat(...groups.map(g => WARMUP[g]));
  return `<details class="card wu"><summary><b>Calentamiento sugerido</b> <small class="muted">${items.length} ejercicios · 6–8 min</small></summary><ol class="small">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    <p class="small muted">Después, 1–2 series de aproximación del primer ejercicio con el 50–70 % de la carga.</p><button class="btn sm" data-act="wuX">Listo</button></details>`;
}
const warmupHandlers = rerender => ({ wuX: () => { const d = getDraft(); d.wuDone = true; saveDraft(d); rerender(); } });

/* ---------- récords durante la sesión ---------- */
function prCheck(e, s) {
  if (typeof e1rmOf !== 'function') return;
  const v = e1rmOf(num(s.w), num(s.r)); if (!(v > 0)) return;
  if (e.best && v > e.best * 1.005) { s.pr = true; e.best = v; toast(`Nuevo récord en ${exName(e.exercise_id)}: ${fmtN(s.w)} kg × ${s.r} (1RM estimado ${fmtN(v)} kg)`); try { navigator.vibrate && navigator.vibrate(120); } catch (x) { } }
}

/* ---------- videos de técnica (privados: asesorado y entrenador) ---------- */
const VID_BUCKET = 'client-videos';
const VidFiles = {
  async put(path, file) { if (DEMO) return demoFiles.put('vid/' + path, await file.arrayBuffer()); const { error } = await sb.storage.from(VID_BUCKET).upload(path, file, { contentType: file.type || 'video/mp4', upsert: true }); if (error) throw error; },
  async get(path) { if (DEMO) { const v = await demoFiles.get('vid/' + path); if (!v) throw new Error('Video no encontrado.'); return new Blob([v], { type: 'video/mp4' }); } const { data, error } = await sb.storage.from(VID_BUCKET).download(path); if (error) throw error; return data; },
  async del(path) { if (DEMO) return demoFiles.del('vid/' + path); const { error } = await sb.storage.from(VID_BUCKET).remove([path]); if (error) throw error; }
};
function videoUploadModal(exId, after) {
  if (S.needsV9) return toast('Función disponible después de ejecutar la migración v9', 'error');
  modal(`${modalHead('Video de técnica')}<p class="small muted">Graba una serie (máximo 60 s y 50 MB). Solo lo ven tú y tu entrenador.</p>
    ${exId ? `<p><b>${esc(exName(exId))}</b></p>` : ''}
    <input class="input" type="file" id="vd-f" accept="video/*" capture="environment">
    <label class="field"><span>Pregunta o comentario (opcional)</span><input class="input" id="vd-n" placeholder="Ej.: ¿la rodilla va bien alineada?"></label>
    <button class="btn primary block" data-act="vdUp">Enviar a mi entrenador</button><p id="vd-p" class="small muted"></p>`, {
    click: {
      vdUp: async el => {
        const f = $('#vd-f').files[0]; if (!f) return toast('Elige un video', 'error'); if (f.size > 50 * 1024 * 1024) return toast('El video supera 50 MB', 'error');
        el.disabled = true; $('#vd-p').textContent = 'Subiendo…';
        try {
          const id = uid(); const ext = (f.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4'; const path = `${S.profile.id}/${id}.${ext}`;
          await VidFiles.put(path, f); await DB.insert('technique_videos', { client_id: S.profile.id, exercise_id: exId || null, path, note: $('#vd-n').value.trim() || null });
          closeModal(); toast('Video enviado'); if (after) after();
        } catch (e) { toast(errMsg(e), 'error'); el.disabled = false; $('#vd-p').textContent = ''; }
      }
    }
  });
}
async function playVideo(path) {
  try { const b = await VidFiles.get(path); const u = URL.createObjectURL(b); modal(`${modalHead('Video')}<video class="vid" src="${u}" controls playsinline autoplay></video>`, {}); } catch (e) { toast(errMsg(e), 'error'); }
}
function videosListHtml(vs, coach) {
  if (!vs.length) return `<div class="card empty"><p>${coach ? 'El asesorado no ha enviado videos de técnica.' : 'Aún no has enviado videos. Durante la sesión, usa «Video» en el ejercicio.'}</p></div>`;
  return vs.map(v => `<div class="card"><div class="day-h"><div><b>${esc(v.exercise_id ? exName(v.exercise_id) : 'Video de técnica')}</b><small class="muted">${esc(fmtDateShort(v.created_at))}</small></div><button class="btn sm" data-act="vdPlay" data-p="${esc(v.path)}">▶ Ver</button></div>
    ${v.note ? `<p class="small">${esc(v.note)}</p>` : ''}
    ${v.coach_reply ? `<div class="reply small"><b>Entrenador:</b> ${esc(v.coach_reply)}</div>` : coach ? '' : '<p class="small muted">Pendiente de revisión.</p>'}
    ${coach ? `<textarea class="input" rows="2" data-vr="${v.id}" placeholder="Corrección o indicación">${esc(v.coach_reply || '')}</textarea><div class="row-btns"><button class="btn sm primary" data-act="vdReply" data-id="${v.id}">Guardar respuesta</button><button class="btn sm danger-outline" data-act="vdDel" data-id="${v.id}" data-p="${esc(v.path)}">Eliminar</button></div>` : `<div class="row-btns"><button class="btn sm danger-outline" data-act="vdDel" data-id="${v.id}" data-p="${esc(v.path)}">Eliminar</button></div>`}</div>`).join('');
}
const videoHandlers = () => ({
  vdPlay: el => playVideo(el.dataset.p),
  vdReply: async el => { const t = $(`[data-vr="${el.dataset.id}"]`).value.trim(); await DB.update('technique_videos', el.dataset.id, { coach_reply: t || null, replied_at: t ? new Date().toISOString() : null }); toast('Respuesta guardada'); },
  vdDel: async el => { if (!confirm('¿Eliminar este video?')) return; await VidFiles.del(el.dataset.p).catch(() => { }); await DB.remove('technique_videos', el.dataset.id); route(); }
});
async function vMisVideos() {
  if (S.needsV9) return paint('<div class="card empty"><p>Disponible próximamente.</p></div>', {}, 'Videos de técnica');
  const vs = await DB.select('technique_videos', { eq: { client_id: S.profile.id }, order: 'created_at', asc: false }).catch(() => []);
  paint(`<button class="btn primary block" data-act="vdNew">+ Enviar video</button>${videosListHtml(vs, false)}`, { click: Object.assign({ vdNew: () => videoUploadModal(null, () => route()) }, videoHandlers()) }, 'Videos de técnica');
}
async function coachVideosTab(cid) {
  if (S.needsV9) return { html: '<div class="card empty"><p>Ejecuta la migración v9 para activar los videos de técnica.</p></div>' };
  const vs = await DB.select('technique_videos', { eq: { client_id: cid }, order: 'created_at', asc: false }).catch(() => []);
  return { html: videosListHtml(vs, true), click: videoHandlers() };
}
async function inboxVideoRows(byId) {
  if (S.needsV9) return [];
  try { return (await DB.select('technique_videos', { order: 'created_at', asc: false, limit: 50 })).filter(v => !v.coach_reply && byId[v.client_id]).map(v => `<a class="ib-row" href="#/asesorado/${v.client_id}/videos"><span class="ib-tag v">Video</span><span class="ib-n">${esc(byId[v.client_id].full_name || '')}</span><span class="ib-d">${esc(v.exercise_id ? exName(v.exercise_id) : 'Técnica')}</span></a>`); } catch (e) { return []; }
}
