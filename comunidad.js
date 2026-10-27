'use strict';
/* =====================================================================
   Deuce Point · Adherencia y comunicación
   Mensajes entre entrenador y asesorado, rachas y logros, lecciones
   semanales, retos grupales y temporizador de intervalos.
   Depende de app.js, nutri.js, auto.js, gestion.js y tenis.js.
   ===================================================================== */

/* =====================================================================
   Mensajes
   ===================================================================== */
const fmtTime = s => new Date(s).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
async function unreadCount(cid) {
  if (S.needsV6) return 0;
  try { return (await DB.select('messages', { eq: { client_id: cid } })).filter(m => !m.read_at && m.sender_id !== S.profile.id).length; } catch (e) { return 0; }
}
function threadHtml(msgs) {
  let last = '';
  return msgs.map(m => { const d = dateStr(new Date(m.created_at)); const sep = d !== last ? `<div class="msg-day">${esc(fmtDayLong(d))}</div>` : ''; last = d; return `${sep}<div class="msg ${m.sender_id === S.profile.id ? 'me' : 'them'}">${m.media_path ? `<div class="msg-media" data-mp="${esc(m.media_path)}" data-mt="${esc(m.media_type || 'foto')}"><small class="muted">Cargando ${m.media_type === 'audio' ? 'audio' : 'foto'}…</small></div>` : ''}${m.media_path && /^\[(Foto|Audio)\]$/.test(m.body) ? '' : `<p class="pre">${esc(m.body)}</p>`}<small>${fmtTime(m.created_at)}${m.sender_id === S.profile.id && m.read_at ? ' · leído' : ''}</small></div>`; }).join('') || '<p class="small muted center">Sin mensajes todavía.</p>';
}
async function markRead(cid, msgs) {
  const now = new Date().toISOString();
  for (const m of msgs.filter(x => !x.read_at && x.sender_id !== S.profile.id)) await DB.update('messages', m.id, { read_at: now }).catch(() => { });
}
/* Vista de conversación: asesorado (cid = propio) o entrenador (pestaña Mensajes) */
async function chatTab(cid) {
  if (S.needsV6) return { html: V6_NOTICE };
  const msgs = await DB.select('messages', { eq: { client_id: cid }, order: 'created_at' });
  await markRead(cid, msgs);
  const staff = S.profile.role !== 'client';
  const quick = staff ? String(S.settings.quick_replies || '').split('\n').map(s => s.trim()).filter(Boolean) : [];
  const html = `<div class="chat" id="chat">${threadHtml(msgs)}</div>
    ${quick.length ? `<div class="chips scroll">${quick.map((q, i) => `<button class="chip" data-act="qr" data-i="${i}">${esc(q.length > 38 ? q.slice(0, 36) + '…' : q)}</button>`).join('')}</div>` : ''}
    <div class="chat-in"><textarea class="input" id="msg-t" rows="2" placeholder="Escribe un mensaje"></textarea><button class="btn primary" data-act="send">Enviar</button></div>
    ${!S.needsV10 && typeof chatMediaBtnsHtml === 'function' ? chatMediaBtnsHtml() : ''}
    ${staff ? '<p class="small muted">Respuestas guardadas: se configuran en Ajustes.</p>' : '<p class="small muted">Tu entrenador responde en su horario de atención.</p>'}`;
  let n = msgs.length;
  const refresh = async () => {
    const ms = await DB.select('messages', { eq: { client_id: cid }, order: 'created_at' }); const box = $('#chat'); if (!box) return;
    if (ms.length !== n || ms.some(m => m.read_at && !box.innerHTML.includes('leído'))) { n = ms.length; box.innerHTML = threadHtml(ms); box.scrollTop = box.scrollHeight; await markRead(cid, ms); if (typeof loadChatMedia === 'function') loadChatMedia(box); }
  };
  return {
    html, click: {
      qr: el => { const t = $('#msg-t'); t.value = quick[+el.dataset.i]; t.focus(); },
      send: async el => {
        const t = $('#msg-t'); const body = t.value.trim(); if (!body) return;
        el.disabled = true; await DB.insert('messages', { client_id: cid, sender_id: S.profile.id, body }); t.value = ''; el.disabled = false; await refresh();
      },
      ...(typeof chatMediaHandlers === 'function' ? chatMediaHandlers(cid, () => refresh()) : {})
    },
    after: () => { const box = $('#chat'); if (box) { box.scrollTop = box.scrollHeight; if (typeof loadChatMedia === 'function') loadChatMedia(box); } clearInterval(S.tick); S.tick = setInterval(() => refresh().catch(() => { }), 8000); }
  };
}
async function vMensajes() { const r = await chatTab(S.profile.id); paint(r.html, { click: r.click }, 'Mensajes'); if (r.after) r.after(); }
async function messageCardHtml() {
  const n = await unreadCount(S.profile.id);
  return n ? `<a class="card row-link ck-due" href="#/mensajes"><div><b>${n === 1 ? 'Nuevo mensaje' : n + ' mensajes nuevos'} de tu entrenador</b><small class="muted">Toca para leer y responder.</small></div><span class="chev">›</span></a>` : '';
}
async function inboxMessageRows(byId) {
  if (S.needsV6) return [];
  try {
    const ms = await DB.select('messages', { gte: { created_at: new Date(Date.now() - 30 * 864e5).toISOString() } });
    const per = {}; ms.filter(m => !m.read_at && m.sender_id === m.client_id && byId[m.client_id]).forEach(m => { per[m.client_id] = (per[m.client_id] || 0) + 1; });
    return Object.entries(per).map(([cid, n]) => `<a class="ib-row" href="#/asesorado/${cid}/mensajes"><span class="ib-tag v">Mensaje</span><span class="ib-n">${esc(byId[cid].full_name || '')}</span><span class="ib-m">${n} sin leer</span></a>`);
  } catch (e) { return []; }
}

/* =====================================================================
   Rachas y logros
   ===================================================================== */
async function achievementData(cid) {
  const since = addDays(todayStr(), -400);
  const [ws, sets, logs, dailies, cks, wells, plan] = await Promise.all([
    DB.select('workouts', { eq: { client_id: cid } }), DB.select('workout_sets', { eq: { client_id: cid }, order: 'created_at', limit: 20000 }),
    DB.select('food_logs', { eq: { client_id: cid }, gte: { log_date: since } }), DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: since } }),
    DB.select('checkins', { eq: { client_id: cid } }).catch(() => []), S.needsV6 ? [] : DB.select('wellness', { eq: { client_id: cid } }).catch(() => []), activePlanFor(cid)]);
  const days = new Set(); logs.forEach(l => days.add(l.log_date)); ws.forEach(w => days.add(dateStr(new Date(w.started_at)))); wells.forEach(w => days.add(w.log_date));
  let streak = 0; let d = days.has(todayStr()) ? todayStr() : addDays(todayStr(), -1);
  while (days.has(d)) { streak++; d = addDays(d, -1); }
  let best = 0, run = 0; [...days].sort().forEach((x, i, a) => { run = i && daysBetween(a[i - 1], x) === 1 ? run + 1 : 1; best = Math.max(best, run); });
  const byW = {}; sets.forEach(s => { (byW[s.workout_id] = byW[s.workout_id] || []).push(s); });
  const order = ws.slice().sort((a, b) => a.started_at < b.started_at ? -1 : 1); const top = {}; let prs = 0;
  order.forEach(w => { const bestNow = {}; (byW[w.id] || []).forEach(s => { const v = e1rmOf(num(s.weight_kg), num(s.reps)); if (v > (bestNow[s.exercise_id] || 0)) bestNow[s.exercise_id] = v; }); Object.entries(bestNow).forEach(([e, v]) => { if (top[e] && v > top[e] * 1.001) prs++; top[e] = Math.max(top[e] || 0, v); }); });
  const vol = ws.reduce((a, w) => a + num(w.total_volume), 0);
  const waterT = num(plan && plan.water_ml) || 2000;
  const waterDays = new Set(dailies.filter(x => num(x.water_ml) >= waterT).map(x => x.log_date));
  let waterRun = 0, wr = 0; [...waterDays].sort().forEach((x, i, a) => { wr = i && daysBetween(a[i - 1], x) === 1 ? wr + 1 : 1; waterRun = Math.max(waterRun, wr); });
  return { streak, best, sessions: ws.length, prs, vol, checkins: cks.length, waterRun, logDays: new Set(logs.map(l => l.log_date)).size };
}
const ACHIEVEMENTS = [
  ['ses1', 'Primera sesión', 'Registraste tu primera sesión de entrenamiento.', a => a.sessions >= 1], ['ses10', '10 sesiones', 'Completaste 10 sesiones de entrenamiento.', a => a.sessions >= 10],
  ['ses25', '25 sesiones', 'Completaste 25 sesiones.', a => a.sessions >= 25], ['ses50', '50 sesiones', 'Completaste 50 sesiones.', a => a.sessions >= 50], ['ses100', '100 sesiones', 'Completaste 100 sesiones.', a => a.sessions >= 100],
  ['str7', 'Racha de 7 días', '7 días seguidos registrando comidas, entrenamiento o bienestar.', a => a.best >= 7], ['str14', 'Racha de 14 días', '14 días seguidos con registros.', a => a.best >= 14], ['str30', 'Racha de 30 días', '30 días seguidos con registros.', a => a.best >= 30],
  ['pr1', 'Primer récord', 'Superaste tu mejor 1RM estimado en un ejercicio.', a => a.prs >= 1], ['pr10', '10 récords', '10 récords personales.', a => a.prs >= 10], ['pr25', '25 récords', '25 récords personales.', a => a.prs >= 25],
  ['vol10', '10 toneladas', '10.000 kg de volumen acumulado.', a => a.vol >= 10000], ['vol50', '50 toneladas', '50.000 kg de volumen acumulado.', a => a.vol >= 50000], ['vol100', '100 toneladas', '100.000 kg de volumen acumulado.', a => a.vol >= 100000],
  ['ck4', '4 check-ins', 'Un mes de check-ins semanales.', a => a.checkins >= 4], ['ck12', '12 check-ins', 'Tres meses de check-ins semanales.', a => a.checkins >= 12],
  ['h2o7', 'Hidratación 7 días', '7 días seguidos cumpliendo la meta de agua.', a => a.waterRun >= 7], ['log30', '30 días registrados', '30 días con registro de comidas.', a => a.logDays >= 30]];
async function vLogros() {
  const a = await achievementData(S.profile.id); const got = ACHIEVEMENTS.filter(x => x[3](a));
  try { localStorage.setItem('dp_ach_' + S.profile.id, JSON.stringify(got.map(x => x[0]))); } catch (e) { }
  paint(progSeg('logros') + `<div class="stats3"><div><b>${a.streak}</b><small>Racha actual (días)</small></div><div><b>${a.best}</b><small>Mejor racha</small></div><div><b>${got.length}/${ACHIEVEMENTS.length}</b><small>Logros</small></div></div>
    <div class="card"><h3>Totales</h3>${hbars([{ label: 'Sesiones', value: a.sessions, text: a.sessions }, { label: 'Récords', value: a.prs, text: a.prs }, { label: 'Check-ins', value: a.checkins, text: a.checkins }, { label: 'Días con registro', value: a.logDays, text: a.logDays }])}<p class="small muted">Volumen acumulado: ${fmtInt(a.vol)} kg.</p></div>
    <div class="ach-grid">${ACHIEVEMENTS.map(([k, t, d, f]) => `<div class="ach${f(a) ? ' on' : ''}"><span class="ach-i">${f(a) ? '★' : '☆'}</span><b>${esc(t)}</b><small>${esc(d)}</small></div>`).join('')}</div>`, {}, 'Progreso');
}
async function streakCardHtml() {
  try {
    const a = await achievementData(S.profile.id); const got = ACHIEVEMENTS.filter(x => x[3](a)).map(x => x[0]);
    let seen = null; try { seen = JSON.parse(localStorage.getItem('dp_ach_' + S.profile.id) || 'null'); } catch (e) { }
    const fresh = seen ? got.filter(k => !seen.includes(k)) : [];
    if (!seen) try { localStorage.setItem('dp_ach_' + S.profile.id, JSON.stringify(got)); } catch (e) { }
    const nw = fresh.map(k => ACHIEVEMENTS.find(x => x[0] === k)[1]);
    return `${nw.length ? `<a class="card row-link ach-new" href="#/logros"><div><b>Nuevo logro: ${esc(nw.join(', '))}</b><small class="muted">Toca para ver tus logros.</small></div><span class="chev">›</span></a>` : ''}${a.streak >= 2 ? `<p class="streak">Racha de ${a.streak} días con registros${a.streak >= a.best ? ' · tu mejor racha' : ''}</p>` : ''}`;
  } catch (e) { return ''; }
}

/* =====================================================================
   Lecciones semanales
   ===================================================================== */
const BASE_LESSONS = [
  [1, 'todos', 'Cómo usar tu plan de alimentación', 'Tu plan indica gramos de cada alimento en el estado en que se pesa (cocido o crudo, según el nombre). Durante las primeras dos semanas, pesa los alimentos con una gramera; después podrás estimar las porciones con la medida casera que aparece junto a cada alimento.\n\nCada comida tiene varias opciones con el mismo aporte de proteína, carbohidratos y grasa: puedes alternarlas libremente. Si no tienes un alimento, usa «Reemplazar»: la app calcula la cantidad equivalente de otro alimento del mismo grupo.\n\nRegistra lo que comes marcando cada alimento en Hoy. El registro le permite a tu entrenador ajustar el plan con datos reales y no con suposiciones.'],
  [2, 'todos', 'Proteína: cuánta, cuándo y de dónde', 'La proteína aporta los aminoácidos para reparar y construir músculo. Para personas que entrenan, la recomendación está entre 1,6 y 2,2 g por kg de peso al día; tu plan ya trae la cantidad calculada.\n\nReparte la proteína en 4 o 5 comidas con 20 a 40 g cada una (0,3 a 0,4 g/kg): esta distribución estimula la síntesis de proteína muscular mejor que concentrarla en una o dos comidas.\n\nFuentes de calidad: huevo, pollo, carnes magras, pescado, lácteos, leguminosas combinadas con cereales y proteína en polvo cuando la comida no alcanza. Una proteína alta también ayuda a controlar el apetito en las fases de pérdida de grasa.'],
  [3, 'todos', 'Carbohidratos y rendimiento', 'Los carbohidratos son el combustible principal del entrenamiento intenso. Se almacenan como glucógeno en el músculo y el hígado; cuando las reservas son bajas, la fatiga aparece antes y la calidad de la sesión disminuye.\n\nPor eso tu plan cambia según el día: más carbohidratos en los días de entrenamiento y en las comidas cercanas a la sesión, y menos en los días de descanso. La app ajusta automáticamente las porciones de cereales, tubérculos y frutas según el tipo de día.\n\nPrefiere fuentes con fibra (arroz, papa, avena, frutas, leguminosas) en la mayoría de las comidas, y fuentes de rápida digestión (banano, pan, bebida hidratante) antes y durante el ejercicio.'],
  [4, 'todos', 'Grasas: necesarias y en la porción justa', 'Las grasas participan en la producción de hormonas, la absorción de vitaminas A, D, E y K y la salud celular. Tu plan aporta entre 0,8 y 1,2 g por kg de peso, nunca menos del 20 % de la energía.\n\nPrioriza aguacate, aceite de oliva, frutos secos, semillas y pescados grasos. Limita los fritos y los productos de paquete.\n\nLa grasa es el nutriente con más calorías por gramo (9 kcal frente a 4 de la proteína y los carbohidratos): una cucharada de aceite de más al día suma unas 120 kcal. Mide el aceite con cuchara y no a ojo.'],
  [5, 'todos', 'Hidratación diaria', 'Una pérdida de agua del 2 % del peso corporal ya reduce el rendimiento y la concentración. Tu meta diaria de agua aparece en Hoy; repártela a lo largo del día y regístrala con los botones de 250 y 500 ml.\n\nIndicador práctico: la orina debe ser de color amarillo claro. Si es oscura, aumenta la ingesta.\n\nEn días de calor o de entrenamiento largo, agrega líquidos con sodio (bebida hidratante o sales de rehidratación). La prueba de sudoración de la sección Rendimiento calcula exactamente cuánto necesitas por hora de ejercicio.'],
  [6, 'todos', 'Qué comer antes de entrenar', 'Entre 2 y 4 horas antes: una comida con carbohidratos, algo de proteína y poca grasa y fibra (por ejemplo, arroz con pollo y fruta). Así llegas con energía y sin pesadez.\n\nEntre 30 y 90 minutos antes, si tienes hambre o la sesión es intensa: un refrigerio pequeño de fácil digestión (banano, pan con mermelada, bocadillo, yogur).\n\nNo pruebes alimentos nuevos el día de una competencia. Las estrategias se ensayan en los entrenamientos.'],
  [7, 'todos', 'Recuperación después del entrenamiento', 'Después de entrenar, el cuerpo repone glucógeno y repara el músculo. Una comida con 0,3 g de proteína por kg y carbohidratos en las 2 horas siguientes favorece ambos procesos.\n\nSi entrenas de nuevo en menos de 24 horas (por ejemplo, en torneos), la reposición de carbohidratos debe ser más rápida: 1 a 1,2 g por kg por hora durante las primeras 4 horas.\n\nRepón los líquidos perdidos: 1,25 a 1,5 litros por cada kg de peso perdido durante la sesión.'],
  [8, 'todos', 'Sueño y composición corporal', 'Dormir menos de 7 horas aumenta el apetito, el deseo de alimentos muy calóricos y la pérdida de masa muscular durante un déficit calórico. También reduce la fuerza, el tiempo de reacción y la precisión.\n\nRecomendaciones: horario regular para acostarse y levantarse, habitación oscura y fresca, sin pantallas 30 a 60 minutos antes de dormir, cafeína solo antes de las 3 p. m. y cena al menos 2 horas antes de acostarte.\n\nRegistra la calidad del sueño en el bienestar diario: tu entrenador la usa para ajustar la carga de entrenamiento.'],
  [9, 'todos', 'Fines de semana y comidas fuera de casa', 'Dos días de excesos pueden anular el déficit de toda la semana. No se trata de prohibir, sino de planear: decide con anticipación qué comida será más flexible y mantén el resto del día dentro del plan.\n\nEn restaurantes: elige preparaciones a la plancha, asadas o sudadas, un solo carbohidrato y media porción del plato en verduras. Pide las salsas aparte y prefiere agua o bebidas sin azúcar.\n\nLa sección «Comer fuera de casa» de la app tiene las porciones calculadas para tu almuerzo.'],
  [10, 'todos', 'Suplementos: qué tiene evidencia', 'Pocos suplementos tienen evidencia sólida de beneficio en el rendimiento: creatina, cafeína, nitratos, beta-alanina y bicarbonato, cada uno con indicaciones específicas. La proteína en polvo es un alimento práctico, no un requisito.\n\nLos suplementos no compensan una alimentación desordenada: primero el plan, el sueño y el entrenamiento.\n\nRiesgo importante: algunos productos contienen sustancias prohibidas no declaradas. Si compites, usa productos con certificación de terceros (Informed Sport o NSF Certified for Sport) y consulta siempre con tu entrenador antes de iniciar uno.'],
  [11, 'todos', 'Hambre, saciedad y ansiedad por comer', 'El hambre aumenta en los déficits calóricos; se puede manejar con estrategias concretas: proteína en cada comida, verduras en abundancia (mucho volumen y pocas calorías), frutas enteras en lugar de jugos y agua antes de las comidas.\n\nDistingue el hambre física (aparece gradualmente y se calma con cualquier alimento) del deseo de comer por estrés, aburrimiento o cansancio (aparece de golpe y pide un alimento específico).\n\nSi el hambre es constante o te cuesta controlar lo que comes, cuéntaselo a tu entrenador en el check-in: el plan se puede ajustar.'],
  [12, 'todos', 'Mantener los resultados', 'Mantener un resultado requiere los mismos hábitos que lo produjeron, con más flexibilidad. Al terminar una fase de pérdida de grasa, las calorías se suben de forma gradual hasta el mantenimiento, sin volver de golpe a la alimentación anterior.\n\nHábitos que más predicen el éxito a largo plazo: pesarse con regularidad, mantener el entrenamiento de fuerza, una alta ingesta de proteína, planear las comidas de la semana y retomar el plan de inmediato después de un día de excesos.\n\nTu progreso queda registrado en la app: úsalo como referencia cuando necesites retomar.'],
  [4, 'tenis', 'Nutrición en torneos de tenis', 'Durante un torneo pueden jugarse varios partidos en pocos días, con horarios inciertos. La prioridad es llegar con las reservas de glucógeno llenas y recuperarse rápido entre partidos.\n\nLa víspera y los días de torneo, tu plan sube los carbohidratos a 6–7 g por kg. Lleva siempre refrigerios: banano, bocadillo, galletas de arroz, bebida hidratante y un batido de proteína para después del partido.\n\nUsa el «Protocolo del día de partido» en Rendimiento › Torneos: indica qué comer y cuándo según la hora de tu partido.'],
  [6, 'tenis', 'Calor, sudor y sodio en la cancha', 'Un partido de tenis en clima cálido puede producir pérdidas de sudor de 1 a 2,5 litros por hora. Con el sudor se pierde sodio; si solo se repone agua, aumenta el riesgo de calambres y de baja de rendimiento.\n\nBebe en cada cambio de lado la cantidad que indica tu plan de hidratación, alterna agua con bebida hidratante y, si tu sudor es salado, usa sales de rehidratación.\n\nRealiza la prueba de sudoración en un entrenamiento con condiciones similares a las de tus torneos.'],
  [8, 'tenis', 'Viajes a torneos', 'Los viajes alteran horarios, sueño y acceso a alimentos. Planea: lleva refrigerios no perecederos (frutos secos, avena, atún en lata, galletas de arroz, proteína en polvo) e identifica restaurantes y supermercados cerca del hotel.\n\nEn el transporte, mantén la hidratación y evita el exceso de fritos y paquetes. Al llegar, duerme lo suficiente y conserva tus horarios de comida.\n\nEn destinos con riesgo sanitario, consume agua embotellada y alimentos bien cocidos.']];
async function lessonsFor(cid, d) {
  if (S.needsV6) return [];
  const ls = await DB.select('lessons', { eq: { published: true }, order: 'week' });
  const tennis = d && (d.deporte === 'Tenis' || /tenis/i.test(d.deportes || ''));
  return ls.filter(l => l.audience !== 'tenis' || tennis);
}
function lessonWeek(it) { if (!it) return 1; const ref = dateStr(new Date(it.reviewed_at || it.created_at)); return Math.max(1, Math.floor(daysBetween(ref, todayStr()) / 7) + 1); }
async function lessonCardHtml() {
  try {
    const ls = await lessonsFor(S.profile.id, S.intake && S.intake.data); if (!ls.length) return '';
    const wk = lessonWeek(S.intake); const reads = await DB.select('lesson_reads', { eq: { client_id: S.profile.id } });
    const read = new Set(reads.map(r => r.lesson_id));
    const l = ls.filter(x => x.week <= wk && !read.has(x.id))[0]; if (!l) return '';
    return `<a class="card row-link lesson-c" href="#/leccion/${l.id}"><div><small class="muted">Lección · semana ${l.week}</small><b>${esc(l.title)}</b></div><span class="chev">›</span></a>`;
  } catch (e) { return ''; }
}
async function vLecciones() {
  if (S.needsV6) return paint(V6_NOTICE, {}, 'Lecciones');
  const ls = await lessonsFor(S.profile.id, S.intake && S.intake.data); const wk = lessonWeek(S.intake);
  const reads = new Set((await DB.select('lesson_reads', { eq: { client_id: S.profile.id } })).map(r => r.lesson_id));
  paint(`<a class="linkbtn" href="#/perfil">← Perfil</a><p class="small muted">Una lección nueva cada semana desde el inicio de tu plan. Semana actual: ${wk}.</p>
    ${ls.map(l => l.week <= wk ? `<a class="card row-link" href="#/leccion/${l.id}"><div><b>${esc(l.title)}</b><small class="muted">Semana ${l.week}${reads.has(l.id) ? ' · leída' : ''}</small></div><span class="chev">›</span></a>` : `<div class="card row-link locked"><div><b>${esc(l.title)}</b><small class="muted">Disponible en la semana ${l.week}</small></div></div>`).join('') || '<div class="card empty"><p>Tu entrenador aún no ha publicado lecciones.</p></div>'}`, {}, 'Lecciones');
}
async function vLeccion(id) {
  const l = (await DB.select('lessons', { eq: { id } }))[0]; if (!l) return paint('<div class="card"><p>Lección no encontrada.</p></div>');
  if (S.profile.role === 'client') { const ex = (await DB.select('lesson_reads', { eq: { client_id: S.profile.id, lesson_id: id } }))[0]; if (!ex) await DB.insert('lesson_reads', { client_id: S.profile.id, lesson_id: id }).catch(() => { }); }
  paint(`<a class="linkbtn" href="${S.profile.role === 'client' ? '#/lecciones' : '#/lecciones-admin'}">← Lecciones</a><div class="card lesson"><small class="muted">Semana ${l.week}${l.audience === 'tenis' ? ' · tenis' : ''}</small><h2>${esc(l.title)}</h2>${l.video_url && typeof videoEmbed === 'function' ? videoEmbed(l.video_url) : ''}<p class="pre">${esc(l.body)}</p></div>`, {}, 'Lección');
}
async function vLeccionesAdmin() {
  if (S.needsV6) return paint(V6_NOTICE, {}, 'Lecciones');
  const ls = await DB.select('lessons', { order: 'week' });
  const reads = await DB.select('lesson_reads').catch(() => []);
  paint(`${libSeg('lecciones-admin')}<p class="small muted">Cada asesorado ve la lección de la semana en Hoy según las semanas transcurridas desde la aprobación de su valoración. Las lecciones «tenis» solo las ven los tenistas.</p>
    <div class="row-btns"><button class="btn primary" data-act="lNew">+ Nueva lección</button>${ls.length ? '' : '<button class="btn" data-act="lBase">Cargar las 15 lecciones base</button>'}</div>
    ${ls.map(l => `<div class="card"><div class="day-h"><div><b>Semana ${l.week} · ${esc(l.title)}</b><small class="muted">${l.audience === 'tenis' ? 'Tenistas' : 'Todos'} · ${reads.filter(r => r.lesson_id === l.id).length} lecturas</small></div><span class="badge ${l.published ? 'ok' : ''}">${l.published ? 'Publicada' : 'Borrador'}</span></div>
      <div class="row-btns"><a class="btn sm" href="#/leccion/${l.id}">Ver</a><button class="btn sm" data-act="lEd" data-id="${l.id}">Editar</button><button class="btn sm" data-act="lPub" data-id="${l.id}" data-v="${l.published ? 0 : 1}">${l.published ? 'Despublicar' : 'Publicar'}</button><button class="btn sm danger-outline" data-act="lDel" data-id="${l.id}">Eliminar</button></div></div>`).join('')}`, {
    click: {
      lBase: async () => { await DB.insert('lessons', BASE_LESSONS.map(([week, audience, title, body]) => ({ week, audience, title, body, published: true }))); toast('Lecciones cargadas'); route(); },
      lNew: () => lessonModal(null), lEd: el => lessonModal(ls.find(x => x.id === el.dataset.id)),
      lPub: async el => { await DB.update('lessons', el.dataset.id, { published: el.dataset.v === '1' }); route(); },
      lDel: async el => { if (!confirm('¿Eliminar la lección?')) return; await DB.remove('lessons', el.dataset.id); route(); }
    }
  }, 'Biblioteca');
}
function lessonModal(l) {
  l = l || { week: 1, audience: 'todos', title: '', body: '', video_url: '', published: true };
  modal(`${modalHead(l.id ? 'Editar lección' : 'Nueva lección')}
    <div class="rex-grid"><label><span>Semana</span><input class="input" id="ls-w" inputmode="numeric" value="${l.week}"></label><label><span>Para</span><select class="input" id="ls-a"><option value="todos"${l.audience !== 'tenis' ? ' selected' : ''}>Todos</option><option value="tenis"${l.audience === 'tenis' ? ' selected' : ''}>Tenistas</option></select></label></div>
    <label class="field"><span>Título</span><input class="input" id="ls-t" value="${esc(l.title)}"></label>
    <label class="field"><span>Contenido</span><textarea class="input" id="ls-b" rows="10">${esc(l.body)}</textarea></label>
    <label class="field"><span>Video (opcional)</span><input class="input" id="ls-v" type="url" value="${esc(l.video_url || '')}" placeholder="https://youtu.be/…"></label>
    <button class="btn primary block" data-act="save">Guardar</button>`, {
    click: {
      save: async () => {
        const rec = { week: Math.max(1, Math.round(num($('#ls-w').value) || 1)), audience: $('#ls-a').value, title: $('#ls-t').value.trim(), body: $('#ls-b').value.trim(), video_url: $('#ls-v').value.trim() || null };
        if (!rec.title || !rec.body) return toast('Escribe título y contenido', 'error');
        if (l.id) await DB.update('lessons', l.id, rec); else await DB.insert('lessons', Object.assign({ published: true }, rec));
        closeModal(); toast('Lección guardada'); route();
      }
    }
  });
}

/* =====================================================================
   Retos grupales
   ===================================================================== */
const CH_METRICS = { pasos: ['Pasos', 'pasos acumulados'], agua: ['Hidratación', 'días con la meta de agua'], registro: ['Registro de comidas', 'días con comidas registradas'], sesiones: ['Entrenamiento', 'sesiones de fuerza y tenis'] };
async function challengeRanking(c) {
  if (!DEMO) { const rows = await DB.rpc('challenge_ranking', { ch: c.id }); return rows.map(r => ({ name: r.name, score: num(r.score), me: r.me })).sort((a, b) => b.score - a.score); }
  const mem = await DB.select('challenge_members', { eq: { challenge_id: c.id } }); const out = [];
  for (const m of mem) {
    const p = (await DB.select('profiles', { eq: { id: m.client_id } }))[0] || {}; const nm = String(p.full_name || '').split(/\s+/); let score = 0;
    const inR = d => d >= c.start_date && d <= c.end_date;
    if (c.metric === 'pasos') score = (await DB.select('daily_logs', { eq: { client_id: m.client_id } })).filter(x => inR(x.log_date)).reduce((a, x) => a + num(x.steps), 0);
    else if (c.metric === 'agua') { const pl = (await DB.select('nutrition_plans', { eq: { client_id: m.client_id, active: true } }))[0]; score = (await DB.select('daily_logs', { eq: { client_id: m.client_id } })).filter(x => inR(x.log_date) && num(x.water_ml) >= (num(pl && pl.water_ml) || 2000)).length; }
    else if (c.metric === 'registro') score = new Set((await DB.select('food_logs', { eq: { client_id: m.client_id } })).filter(x => inR(x.log_date)).map(x => x.log_date)).size;
    else score = (await DB.select('workouts', { eq: { client_id: m.client_id } })).filter(w => inR(dateStr(new Date(w.started_at)))).length + (await DB.select('tennis_sessions', { eq: { client_id: m.client_id } })).filter(t => inR(t.log_date)).length;
    out.push({ name: nm[0] + (nm[1] ? ' ' + nm[1][0] + '.' : ''), score, me: m.client_id === S.profile.id });
  }
  return out.sort((a, b) => b.score - a.score);
}
const fmtScore = (c, v) => c.metric === 'pasos' ? fmtInt(v) : fmtInt(v);
async function activeChallenges() { if (S.needsV6) return []; try { const t = todayStr(); return (await DB.select('challenges', { order: 'start_date' })).filter(c => c.end_date >= t && c.start_date <= addDays(t, 7)); } catch (e) { return []; } }
async function challengeCardHtml() {
  const cs = await activeChallenges(); if (!cs.length) return '';
  const mem = await DB.select('challenge_members', { eq: { client_id: S.profile.id } }); const joined = new Set(mem.map(m => m.challenge_id));
  let h = '';
  for (const c of cs) {
    if (!joined.has(c.id)) { h += `<div class="card chal"><b>Reto: ${esc(c.title)}</b><small class="muted">${esc(CH_METRICS[c.metric][0])} · ${esc(fmtDayMonth(c.start_date))} al ${esc(fmtDayMonth(c.end_date))}${c.goal ? ` · meta ${fmtScore(c, c.goal)} ${CH_METRICS[c.metric][1]}` : ''}</small><button class="btn sm primary" data-act="chJoin" data-id="${c.id}">Unirme al reto</button></div>`; continue; }
    const rk = await challengeRanking(c).catch(() => []); const i = rk.findIndex(r => r.me); const me = rk[i];
    h += `<a class="card row-link chal" href="#/retos"><div><b>Reto: ${esc(c.title)}</b><small class="muted">${me ? `${fmtScore(c, me.score)} ${CH_METRICS[c.metric][1]}${c.ranking ? ` · puesto ${i + 1} de ${rk.length}` : ''}` : ''}${c.goal && me ? ` · meta ${Math.min(100, Math.round(me.score / c.goal * 100))} %` : ''}</small></div><span class="chev">›</span></a>`;
  }
  return h;
}
const challengeHandlers = after => ({ chJoin: async el => { await DB.insert('challenge_members', { challenge_id: el.dataset.id, client_id: S.profile.id }); toast('Te uniste al reto'); after(); } });
async function vRetos() {
  if (S.needsV6) return paint(V6_NOTICE, {}, 'Retos');
  const staff = S.profile.role !== 'client';
  const cs = await DB.select('challenges', { order: 'start_date', asc: false });
  const mem = staff ? [] : await DB.select('challenge_members', { eq: { client_id: S.profile.id } }); const joined = new Set(mem.map(m => m.challenge_id));
  let h = staff ? `<div class="card"><h3>Nuevo reto</h3><label class="field"><span>Título</span><input class="input" id="ch-t" placeholder="Ej.: Reto de pasos de noviembre"></label>
    <div class="rex-grid"><label><span>Métrica</span><select class="input" id="ch-m">${Object.entries(CH_METRICS).map(([k, [l, d]]) => `<option value="${k}">${l} (${d})</option>`).join('')}</select></label><label><span>Meta (opcional)</span><input class="input" id="ch-g" inputmode="numeric"></label></div>
    <div class="rex-grid"><label><span>Inicio</span><input class="input" type="date" id="ch-s" value="${todayStr()}"></label><label><span>Fin</span><input class="input" type="date" id="ch-e" value="${addDays(todayStr(), 29)}"></label></div>
    <label class="check"><input type="checkbox" id="ch-r" checked> Mostrar tabla de posiciones a los participantes (nombre y apellido abreviado)</label>
    ${S.needsV10 ? '' : '<div class="rex-grid"><label><span>Inscripción $ (opcional)</span><input class="input" id="ch-p" inputmode="numeric" placeholder="0 = gratis"></label><label><span>Enlace de pago</span><input class="input" id="ch-l" type="url" placeholder="https://…"></label></div>'}
    <button class="btn primary block" data-act="chNew">Crear reto</button></div>` : '';
  for (const c of cs) {
    const rk = staff || joined.has(c.id) ? await challengeRanking(c).catch(() => []) : [];
    const show = staff || c.ranking;
    h += `<div class="card"><div class="day-h"><div><b>${esc(c.title)}</b><small class="muted">${esc(CH_METRICS[c.metric][0])} · ${esc(fmtDayMonth(c.start_date))} al ${esc(fmtDayMonth(c.end_date))} · ${rk.length} participantes</small></div>${c.end_date < todayStr() ? '<span class="badge">Finalizado</span>' : '<span class="badge ok">Activo</span>'}</div>
      ${num(c.price) ? `<p class="small">Inscripción: <b>$${fmtInt(c.price)}</b>${!staff && c.pay_link ? ` · <a href="${esc(c.pay_link)}" target="_blank" rel="noopener">Pagar inscripción</a>` : ''}${!staff && joined.has(c.id) ? ((mem.find(m => m.challenge_id === c.id) || {}).paid ? ' · <span class="badge ok">Pago confirmado</span>' : ' · <span class="badge warnb">Pago pendiente de confirmar</span>') : ''}</p>` : ''}
      ${!staff && !joined.has(c.id) && c.end_date >= todayStr() ? `<button class="btn sm primary" data-act="chJoin" data-id="${c.id}">Unirme</button>` : ''}
      ${staff && num(c.price) ? await challengePaidHtml(c) : ''}
      ${rk.length ? (show ? hbars(rk.slice(0, 15).map((r, i) => ({ label: `${i + 1}. ${r.name}${r.me ? ' (tú)' : ''}`, value: r.score, text: fmtScore(c, r.score) }))) : `<p class="small">Tu resultado: <b>${fmtScore(c, (rk.find(r => r.me) || { score: 0 }).score)}</b> ${CH_METRICS[c.metric][1]}.</p>`) : ''}
      ${c.goal ? `<p class="small muted">Meta: ${fmtScore(c, c.goal)} ${CH_METRICS[c.metric][1]}.</p>` : ''}
      ${staff ? `<button class="btn sm danger-outline" data-act="chDel" data-id="${c.id}">Eliminar</button>` : ''}</div>`;
  }
  if (!cs.length && !staff) h += '<div class="card empty"><p>No hay retos activos.</p></div>';
  paint((staff ? '' : '<a class="linkbtn" href="#/hoy">← Hoy</a>') + h, {
    click: {
      ...challengeHandlers(route),
      chNew: async () => {
        const rec = Object.assign({ title: $('#ch-t').value.trim(), metric: $('#ch-m').value, goal: num($('#ch-g').value) || null, start_date: $('#ch-s').value, end_date: $('#ch-e').value, ranking: $('#ch-r').checked }, $('#ch-p') && num($('#ch-p').value) ? { price: num($('#ch-p').value), pay_link: $('#ch-l').value.trim() || null } : {});
        if (!rec.title || !rec.start_date || !rec.end_date || rec.end_date < rec.start_date) return toast('Revisa el título y las fechas', 'error');
        await DB.insert('challenges', rec); toast('Reto creado: aparece en Hoy de los asesorados'); route();
      },
      chDel: async el => { if (!confirm('¿Eliminar el reto?')) return; await DB.remove('challenges', el.dataset.id); route(); }
    },
    change: async t => { if (t.dataset.paid) { await DB.update('challenge_members', t.dataset.paid, { paid: t.checked }); toast(t.checked ? 'Pago confirmado' : 'Pago desmarcado'); } }
  }, 'Retos');
}

async function challengePaidHtml(c) {
  const ms = await DB.select('challenge_members', { eq: { challenge_id: c.id } }); if (!ms.length) return '';
  const ps = await DB.select('profiles', { inn: { id: ms.map(m => m.client_id) } });
  return `<details class="small"><summary>Pagos de inscripción: ${ms.filter(m => m.paid).length} de ${ms.length}</summary>${ms.map(m => `<label class="check"><input type="checkbox" data-paid="${m.id}" ${m.paid ? 'checked' : ''}> ${esc((ps.find(p => p.id === m.client_id) || {}).full_name || '')}</label>`).join('')}<p class="muted">Total recaudado: $${fmtInt(ms.filter(m => m.paid).length * num(c.price))}</p></details>`;
}

/* =====================================================================
   Temporizador de intervalos
   ===================================================================== */
function intervalModal() {
  const cfg = Object.assign({ work: 30, rest: 15, rounds: 8, prep: 10 }, (() => { try { return JSON.parse(localStorage.getItem('dp_iv') || '{}'); } catch (e) { return {}; } })());
  let st = null;
  const stop = () => { clearInterval(S.ivTick); S.ivTick = null; };
  const tick = () => {
    if (!st) return; const left = Math.max(0, Math.ceil((st.end - Date.now()) / 1000));
    const box = $('#iv-box'); if (!box) return stop();
    box.className = 'iv ' + st.phase; $('#iv-p').textContent = { prep: 'Preparación', work: 'Trabajo', rest: 'Descanso', done: 'Terminado' }[st.phase]; $('#iv-t').textContent = fmtClock(left * 1000); $('#iv-r').textContent = st.phase === 'done' ? '' : `Ronda ${st.round} de ${cfg.rounds}`;
    if (left <= 3 && left > 0 && st.beeped !== left) { st.beeped = left; try { const c = Rest.ctx = Rest.ctx || new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 660; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.15, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12); o.start(); o.stop(c.currentTime + 0.13); } catch (e) { } }
    if (left > 0) return;
    beep(); if (navigator.vibrate) navigator.vibrate(300);
    if (st.phase === 'prep') next('work'); else if (st.phase === 'work') { if (st.round >= cfg.rounds) { st.phase = 'done'; stop(); tick(); } else next(num(cfg.rest) ? 'rest' : 'work', true); }
    else if (st.phase === 'rest') next('work', true);
  };
  const next = (ph, inc) => { if (inc && ph === 'work') st.round++; st.phase = ph; st.end = Date.now() + num(cfg[ph]) * 1000; st.beeped = null; };
  modal(`${modalHead('Temporizador de intervalos')}
    <div id="iv-box" class="iv"><small id="iv-p">Listo</small><b id="iv-t">0:00</b><small id="iv-r"></small></div>
    <div class="rex-grid"><label><span>Trabajo (s)</span><input class="input" data-iv="work" inputmode="numeric" value="${cfg.work}"></label><label><span>Descanso (s)</span><input class="input" data-iv="rest" inputmode="numeric" value="${cfg.rest}"></label><label><span>Rondas</span><input class="input" data-iv="rounds" inputmode="numeric" value="${cfg.rounds}"></label><label><span>Preparación (s)</span><input class="input" data-iv="prep" inputmode="numeric" value="${cfg.prep}"></label></div>
    <div class="row-btns"><button class="btn primary" data-act="ivGo">Iniciar</button><button class="btn" data-act="ivStop">Detener</button></div>
    <p class="small muted">Para circuitos, HIIT, Tabata (20 s / 10 s × 8) o trabajo de cancha. Mantén la pantalla encendida.</p>`, {
    input: t => { if (t.dataset.iv) { cfg[t.dataset.iv] = Math.max(0, Math.round(num(t.value))); try { localStorage.setItem('dp_iv', JSON.stringify(cfg)); } catch (e) { } } },
    click: {
      ivGo: () => { if (!num(cfg.work) || !num(cfg.rounds)) return toast('Indica trabajo y rondas', 'error'); try { Rest.ctx = Rest.ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } st = { round: 1 }; next(num(cfg.prep) ? 'prep' : 'work'); stop(); S.ivTick = setInterval(tick, 200); tick(); },
      ivStop: () => { stop(); st = null; $('#iv-p').textContent = 'Detenido'; }
    }
  });
}

/* =====================================================================
   Datos de demostración
   ===================================================================== */
function buildComunidadDemo(d) {
  const iso = new Date().toISOString(); const t = todayStr();
  Object.assign(d, { messages: [], lessons: [], lesson_reads: [], challenges: [], challenge_members: [] });
  const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
  d.messages.push({ id: uid(), client_id: 'demo-juan', sender_id: 'demo-coach', body: 'Hola Juan, revisé tu semana. Vas bien con el déficit; intenta llegar a 8.000 pasos.', created_at: ago(50), read_at: ago(48) },
    { id: uid(), client_id: 'demo-juan', sender_id: 'demo-juan', body: 'Gracias. ¿Puedo cambiar la merienda por un yogur griego con fruta?', created_at: ago(3), read_at: null },
    { id: uid(), client_id: 'demo-ana', sender_id: 'demo-coach', body: 'Ana, para el Nacional usa el protocolo del día de partido en Rendimiento › Torneos.', created_at: ago(5), read_at: null });
  BASE_LESSONS.forEach(([week, audience, title, body]) => d.lessons.push({ id: uid(), week, audience, title, body, video_url: null, published: true, created_at: iso }));
  const c = { id: uid(), title: 'Reto de pasos de octubre', metric: 'pasos', goal: 240000, start_date: addDays(t, -10), end_date: addDays(t, 20), ranking: true, created_at: iso };
  d.challenges.push(c); d.challenge_members.push({ id: uid(), challenge_id: c.id, client_id: 'demo-ana', created_at: iso });
  (d.daily_logs || []).forEach(x => { if (x.log_date >= c.start_date) x.steps = x.client_id === 'demo-ana' ? 9000 + (x.log_date.charCodeAt(9) % 5) * 700 : 7000 + (x.log_date.charCodeAt(9) % 4) * 900; });
  if (d.app_settings && d.app_settings[0]) d.app_settings[0].data.quick_replies = 'Revisé tu registro de hoy: vas bien, continúa así.\nRecuerda registrar las comidas del fin de semana.\nTe ajusté el plan; revisa las nuevas porciones en Hoy.';
}
