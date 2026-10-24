'use strict';
/* =====================================================================
   Deuce Point · Rendimiento en tenis
   Carga de entrenamiento (RPE × minutos) y relación aguda:crónica,
   bienestar diario, partidos y práctica, calendario de torneos con
   periodización (volumen y carbohidratos), tasa de sudoración y plan de
   hidratación, protocolo de día de torneo, pruebas físicas con valores
   de referencia, molestias con mapa corporal y bloques de prevención.
   Depende de app.js, nutri.js, auto.js y gestion.js.
   ===================================================================== */

const TENIS_DEF = { match_carb_gkg: 7, pre_carb_gkg: 6, taper_days: 7, taper_pct: 60, sweat_na_mgl: 900, sweat_na_salty: 1500 };
const cfgT = k => num(S.settings[k] ?? TENIS_DEF[k]);
const SURFACES = ['Arcilla', 'Dura', 'Césped', 'Sintética'];
async function latestWeight(cid) {
  const b = (await DB.select('body_logs', { eq: { client_id: cid }, order: 'log_date', asc: false, limit: 15 })).find(x => num(x.weight_kg));
  if (b) return num(b.weight_kg);
  const it = cid === S.profile.id ? S.intake : (await DB.select('intakes', { eq: { client_id: cid } }))[0];
  return it && it.data ? num(it.data.peso) : 0;
}
async function clientInfo(cid) {
  const c = cid === S.profile.id ? S.profile : (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  const it = cid === S.profile.id && S.intake ? S.intake : (await DB.select('intakes', { eq: { client_id: cid } }).catch(() => []))[0];
  const d = (it && it.data) || {};
  return { c, d, sex: d.sexo === 'Femenino' ? 'F' : 'M', age: ageFrom(d.fecha_nac) || 0 };
}
const minutesOf = w => w.finished_at ? Math.max(1, Math.round((new Date(w.finished_at) - new Date(w.started_at)) / 60000)) : 0;

/* =====================================================================
   Carga de entrenamiento y relación aguda:crónica (ACWR)
   ===================================================================== */
async function loadData(cid, days = 63) {
  const since = addDays(todayStr(), -days);
  const [ws, ts] = await Promise.all([
    DB.select('workouts', { eq: { client_id: cid }, gte: { started_at: parseDay(since).toISOString() } }),
    S.needsV6 ? [] : DB.select('tennis_sessions', { eq: { client_id: cid }, gte: { log_date: since }, order: 'log_date', asc: false }).catch(() => [])]);
  const daily = {}; const add = (d, v) => { daily[d] = (daily[d] || 0) + v; };
  let unrated = 0;
  ws.forEach(w => { const d = dateStr(new Date(w.started_at)); if (num(w.rpe)) add(d, num(w.rpe) * minutesOf(w)); else unrated++; });
  ts.forEach(t => add(t.log_date, num(t.rpe) * num(t.minutes)));
  const first = Object.keys(daily).sort()[0] || null;
  return { daily, ws, ts, unrated, first };
}
function acwrAt(L, end) {
  let acute = 0, chronic = 0;
  for (let i = 0; i < 28; i++) { const v = L.daily[addDays(end, -i)] || 0; if (i < 7) acute += v; chronic += v; }
  chronic /= 4;
  const enough = L.first && daysBetween(L.first, end) >= 20;
  return { acute, chronic, ratio: chronic > 0 && enough ? acute / chronic : null };
}
function acwrZone(r) {
  if (r == null) return { cls: '', label: 'Datos insuficientes (se requieren 3 semanas de registros)' };
  if (r < 0.8) return { cls: 'low', label: 'Baja: la carga reciente es menor que la habitual' };
  if (r <= 1.3) return { cls: 'ok', label: 'Óptima' };
  if (r <= 1.5) return { cls: 'warnb', label: 'Precaución: aumento rápido de la carga' };
  return { cls: 'bad', label: 'Riesgo alto: aumento de carga superior al 50 %' };
}
function weeklyLoads(L, n = 8) {
  const out = []; const t = todayStr();
  for (let i = n - 1; i >= 0; i--) {
    const end = addDays(t, -7 * i), start = addDays(end, -6); let v = 0;
    for (let k = 0; k < 7; k++) v += L.daily[addDays(start, k)] || 0;
    out.push({ start, end, load: v, ratio: acwrAt(L, end).ratio });
  }
  return out;
}

/* =====================================================================
   Bienestar diario
   ===================================================================== */
const WELL_ITEMS = [['sleep', 'Calidad del sueño'], ['fatigue', 'Energía (ausencia de fatiga)'], ['soreness', 'Ausencia de dolor muscular'], ['stress', 'Ausencia de estrés'], ['mood', 'Estado de ánimo']];
const WELL_LBL = ['', 'Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'];
function wellnessLight(w) {
  if (!w) return null;
  const vals = WELL_ITEMS.map(([k]) => num(w[k])); const tot = vals.reduce((a, b) => a + b, 0);
  if (tot <= 14 || vals.some(v => v === 1)) return { cls: 'bad', tot, label: 'Rojo', text: 'Reducir la intensidad y el volumen de la sesión de hoy y comunicarlo al entrenador.' };
  if (tot <= 19 || vals.some(v => v === 2)) return { cls: 'warnb', tot, label: 'Amarillo', text: 'Entrenar según lo planificado vigilando las sensaciones; evitar llegar al fallo.' };
  return { cls: 'ok', tot, label: 'Verde', text: 'Condición adecuada para entrenar según lo planificado.' };
}
async function wellnessCardHtml() {
  if (S.needsV6) return '';
  try {
    const w = (await DB.select('wellness', { eq: { client_id: S.profile.id, log_date: todayStr() } }))[0];
    if (w) { const l = wellnessLight(w); return `<div class="card well-done"><span class="light ${l.cls}"></span><div><b>Bienestar de hoy: ${l.tot}/25 · ${l.label}</b><small class="muted">${esc(l.text)}</small></div></div>`; }
    return `<div class="card well" id="well-card"><h3>Bienestar de hoy</h3><p class="small muted">Responde antes de entrenar (1 = muy mal, 5 = muy bien).</p>
      ${WELL_ITEMS.map(([k, l]) => `<div class="well-row"><span>${esc(l)}</span><div class="chips scale5">${[1, 2, 3, 4, 5].map(n => `<button class="chip" data-act="wPick" data-k="${k}" data-v="${n}" title="${WELL_LBL[n]}">${n}</button>`).join('')}</div></div>`).join('')}
      <button class="btn primary block" data-act="wSave">Guardar</button></div>`;
  } catch (e) { return ''; }
}
const wellnessHandlers = (after) => {
  const v = {};
  return {
    wPick: el => { v[el.dataset.k] = +el.dataset.v; el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); },
    wSave: async () => {
      const miss = WELL_ITEMS.find(([k]) => !v[k]); if (miss) return toast('Responde: ' + miss[1], 'error');
      await DB.insert('wellness', Object.assign({ client_id: S.profile.id, log_date: todayStr() }, v));
      const l = wellnessLight(v); toast('Bienestar registrado · ' + l.label); after();
    }
  };
};

/* =====================================================================
   Torneos y periodización
   ===================================================================== */
async function tournamentsOf(cid) { if (S.needsV6) return []; try { return await DB.select('tournaments', { eq: { client_id: cid }, order: 'start_date' }); } catch (e) { return []; } }
/* Tipo de día por torneo: «match» (días del torneo) o «pre» (día anterior) */
async function tournamentDay(cid, date, plan) {
  const ts = await tournamentsOf(cid);
  const t = ts.find(x => date >= x.start_date && date <= (x.end_date || x.start_date)) || ts.find(x => addDays(x.start_date, -1) === date);
  if (!t) return null;
  const w = await latestWeight(cid); if (!w) return null;
  const match = date >= t.start_date;
  const gkg = cfgT(match ? 'match_carb_gkg' : 'pre_carb_gkg');
  return { t, type: match ? 'match' : 'pre', label: match ? 'Día de torneo' : 'Víspera de torneo', gkg, carbs: Math.max(num(plan.carbs_g), Math.round(w * gkg)) };
}
function carbFactor(plan, target) {
  const cg = plan.meals.reduce((a, m) => { const os = m.options.filter(o => o.items.length); return a + (os.length ? os.reduce((b, o) => b + o.items.reduce((c, i) => { const f = foodOf(i.food_id); return isCarbFood(f) ? c + macrosFor(f, i.grams).carbs : c; }, 0), 0) / os.length : 0); }, 0);
  if (!cg) return 1;
  return Math.min(3, Math.max(0.2, (cg + (target - num(plan.carbs_g))) / cg));
}
/* Reducción del volumen de fuerza antes y durante el torneo */
async function taperInfo(cid) {
  const ts = await tournamentsOf(cid); const t0 = todayStr();
  const on = ts.find(x => t0 >= x.start_date && t0 <= (x.end_date || x.start_date));
  if (on) return { t: on, factor: 0.4, text: `Torneo en curso (${on.name}): sesión de mantenimiento con 40 % de las series. Prioriza la activación y la técnica; evita el fallo muscular.` };
  const nx = ts.find(x => x.start_date > t0 && daysBetween(t0, x.start_date) <= cfgT('taper_days'));
  if (!nx) return null;
  const d = daysBetween(t0, nx.start_date); const pct = cfgT('taper_pct');
  return { t: nx, factor: pct / 100, days: d, text: `Semana de competencia: ${nx.name} inicia en ${d} ${d === 1 ? 'día' : 'días'}. Volumen reducido al ${pct} % de las series, manteniendo las cargas.${d <= 2 ? ' A 48 horas del torneo, evita los ejercicios excéntricos intensos y el trabajo al fallo.' : ''}` };
}
function applyTaper(draft, tp) {
  draft.taper = tp.text;
  draft.exercises.forEach(e => { const n = Math.max(1, Math.round(e.sets.length * tp.factor)); e.sets = e.sets.slice(0, n); if (e.target && e.target.sets) e.target.sets = n; });
}

/* =====================================================================
   Tasa de sudoración e hidratación
   ===================================================================== */
function sweatCalc(s) {
  const h = num(s.minutes) / 60; if (!h || !num(s.pre_kg) || !num(s.post_kg)) return null;
  const lossKg = num(s.pre_kg) - num(s.post_kg);
  const sweatL = lossKg + num(s.fluid_ml) / 1000 - num(s.urine_ml) / 1000;
  const rate = sweatL / h; const pct = lossKg / num(s.pre_kg) * 100;
  const na = s.salty ? cfgT('sweat_na_salty') : cfgT('sweat_na_mgl');
  const drink = Math.min(1.2, Math.max(0.4, rate * 0.8));
  return { lossKg, sweatL, rate, pct, drink, perChange: drink * 1000 / 5, naLoss: rate * na, naRepl: Math.round(rate * na * 0.6 / 50) * 50, na };
}
function hydrationDocHtml(c, s, w, logo) {
  const x = sweatCalc(s);
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Plan de hidratación para competencia</h1><p><b>${esc(c.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · prueba del ${esc(fmtDateLong(s.test_date))}${s.temp_c ? ` · ${fmtN(s.temp_c)} °C` : ''}${s.humidity ? ` · humedad ${fmtN(s.humidity)} %` : ''}</p></div></div>`;
  h += `<h2>Resultado de la prueba</h2><table class="doc-t"><tbody>
    <tr><td>Duración</td><td class="n">${fmtInt(s.minutes)} min</td></tr><tr><td>Peso antes / después</td><td class="n">${fmtN(s.pre_kg)} / ${fmtN(s.post_kg)} kg</td></tr>
    <tr><td>Líquido ingerido / orina</td><td class="n">${fmtInt(s.fluid_ml)} / ${fmtInt(s.urine_ml || 0)} ml</td></tr>
    <tr><td>Pérdida de peso</td><td class="n">${fmtN(x.lossKg)} kg (${fmtN(x.pct)} % del peso corporal)</td></tr>
    <tr><td>Sudor total</td><td class="n">${fmtN(x.sweatL)} L</td></tr><tr><td><b>Tasa de sudoración</b></td><td class="n"><b>${fmtN(x.rate)} L/h</b></td></tr>
    <tr><td>Sodio estimado en el sudor</td><td class="n">${fmtInt(x.na)} mg/L${s.salty ? ' (sudor salado)' : ''}</td></tr></tbody></table>
    ${docBars([{ label: 'Sudor L/h', value: x.rate, text: fmtN(x.rate) }, { label: 'Ingesta L/h', value: x.drink, text: fmtN(x.drink), hi: 1 }])}
    ${x.pct > 2 ? `<div class="box">La pérdida de peso superó el 2 % del peso corporal, nivel asociado a disminución del rendimiento. Se recomienda aumentar la ingesta durante el juego.</div>` : ''}`;
  h += `<h2>Plan para el partido</h2><table class="doc-t"><thead><tr><th>Momento</th><th>Indicación</th></tr></thead><tbody>
    <tr><td>2 a 4 h antes</td><td>${fmtInt(w * 5)}–${fmtInt(w * 7)} ml de agua (5–7 ml/kg). Si la orina es oscura, agregar ${fmtInt(w * 3)}–${fmtInt(w * 5)} ml 2 h antes.</td></tr>
    <tr><td>Durante el juego</td><td>${fmtN(x.drink)} L por hora: ${fmtInt(x.perChange)} ml en cada cambio de lado. Sodio: ${fmtInt(x.naRepl)} mg por hora (bebida hidratante o sales de rehidratación).</td></tr>
    <tr><td>Partidos de más de 60 min</td><td>30–60 g de carbohidratos por hora: bebida hidratante al 6 % (60 g por litro), banano o bocadillo.</td></tr>
    <tr><td>Después del partido</td><td>${fmtN(Math.max(0, x.lossKg) * 1.25)}–${fmtN(Math.max(0, x.lossKg) * 1.5)} L de líquido en las 2 a 4 horas siguientes (1,25–1,5 L por kg perdido), con sodio en la comida o la bebida.</td></tr></tbody></table>
    <p class="doc-sub">Cálculo: sudor = pérdida de peso + líquido ingerido − orina. Ingesta recomendada: 80 % de la tasa de sudoración, entre 0,4 y 1,2 L por hora. Reposición de sodio: 60 % de la pérdida estimada. Repetir la prueba con calor y humedad distintos: la tasa cambia con el clima y la intensidad. Referencias: ACSM (2007) y Comité Olímpico Internacional (2018).</p>
    <p class="doc-foot">Documento de ${esc(BRAND.name)}. Confidencial (Ley 1581 de 2012).</p>`;
  return h;
}

/* =====================================================================
   Protocolo de día de torneo
   ===================================================================== */
function gFor(name, carbs) { const f = S.foods.find(x => x.name === name); return f && num(f.carbs) ? { f, g: roundG(carbs * 100 / num(f.carbs)) } : null; }
const foodLine = (name, carbs) => { const x = gFor(name, carbs); return x ? `${x.f.name} ${fmtInt(x.g)} g${unitText(x.f, x.g) ? ' (' + unitText(x.f, x.g) + ')' : ''}` : ''; };
const protLine = (name, prot) => { const f = S.foods.find(x => x.name === name); if (!f || !num(f.protein)) return ''; const g = roundG(prot * 100 / num(f.protein)); return `${f.name} ${fmtInt(g)} g${unitText(f, g) ? ' (' + unitText(f, g) + ')' : ''}`; };
const hm = m => { m = ((m % 1440) + 1440) % 1440; return Math.floor(m / 60) + ':' + pad2(m % 60); };
function protocolPlan(o) {
  const w = o.weight, t = minOf(o.time), dur = num(o.duration) * 60, t2 = o.time2 ? minOf(o.time2) : null;
  const rows = [];
  const add = (time, title, text, foods) => rows.push({ time, title, text, foods: foods.filter(Boolean) });
  add(t - 210, 'Comida previa (3 a 4 h antes)', `Carbohidratos ${fmtInt(w * 2)} g (2 g/kg), proteína ${fmtInt(w * 0.3)} g (0,3 g/kg), baja en grasa y en fibra. Preparaciones conocidas, sin alimentos nuevos.`,
    [foodLine('Arroz blanco cocido', w * 1.1) + ' o ' + foodLine('Pasta cocida', w * 1.1), protLine('Pechuga de pollo cocida', w * 0.3), foodLine('Jugo de naranja natural', w * 0.4), foodLine('Banano', w * 0.5)]);
  add(t - 180, 'Hidratación previa', `${fmtInt(w * 5)}–${fmtInt(w * 7)} ml de agua (5–7 ml/kg) entre 2 y 4 horas antes.`, []);
  add(t - 75, 'Refrigerio (60 a 90 min antes)', `Carbohidratos ${fmtInt(w * 0.5)}–${fmtInt(w * 0.8)} g (0,5–0,8 g/kg), fáciles de digerir.`, [foodLine('Banano', w * 0.4), foodLine('Bocadillo de guayaba', w * 0.25) + ' o ' + foodLine('Galletas de arroz', w * 0.25)]);
  add(t, 'Durante el partido', `${o.drink ? fmtN(o.drink) + ' L de líquido por hora (según la prueba de sudoración) y ' + fmtInt(o.na) + ' mg de sodio por hora. ' : '400–800 ml de líquido por hora en cambios de lado. '}Carbohidratos 30–60 g por hora en partidos de más de 60 minutos.`,
    [foodLine('Bebida hidratante deportiva', 45) + ' por hora', foodLine('Banano', 25) + ' cada 45–60 min', foodLine('Bocadillo de guayaba', 20) + ' como alternativa']);
  const end = t + dur;
  if (t2 != null && t2 > end) {
    const gap = t2 - end;
    if (gap < 120) add(end + 10, `Entre partidos (${Math.round(gap)} min)`, `Carbohidratos ${fmtInt(w * 1)} g (1 g/kg) en forma líquida o de fácil digestión y proteína ${fmtInt(w * 0.2)} g. Reponer líquidos con sodio.`, [foodLine('Bebida hidratante deportiva', w * 0.4), foodLine('Banano', w * 0.35), protLine('Yogur griego natural sin azúcar', w * 0.2)]);
    else add(end + 30, `Entre partidos (${Math.round(gap / 60 * 10) / 10} h)`, `Comida ligera: carbohidratos ${fmtInt(w * 1.2)} g (1–1,5 g/kg), proteína ${fmtInt(w * 0.3)} g, baja en grasa.`, [foodLine('Arroz blanco cocido', w * 0.8), protLine('Pechuga de pollo cocida', w * 0.3), foodLine('Banano', w * 0.4)]);
    add(t2, 'Segundo partido', 'Mismo plan de hidratación y carbohidratos del primer partido.', []);
  }
  const fin = t2 != null && t2 > end ? t2 + dur : end;
  add(fin + 30, 'Recuperación (primera hora)', `Carbohidratos ${fmtInt(w * 1)}–${fmtInt(w * 1.2)} g (1–1,2 g/kg) y proteína ${fmtInt(w * 0.3)} g (0,3 g/kg). Líquidos: 1,25–1,5 L por cada kg de peso perdido.`, [foodLine('Leche descremada', w * 0.25) + ' + ' + foodLine('Avena en hojuelas', w * 0.4), foodLine('Banano', w * 0.35), protLine('Proteína whey (polvo)', w * 0.15)]);
  add(fin + 150, 'Comida de la noche', `Plan habitual con la meta de carbohidratos del día de torneo (${fmtN(cfgT('match_carb_gkg'))} g/kg) si hay partido al día siguiente.`, []);
  return rows.sort((a, b) => a.time - b.time);
}
function protocolDocHtml(c, o, logo) {
  const rows = protocolPlan(o);
  return `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Protocolo de día de torneo</h1><p><b>${esc(c.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)}${o.tname ? ' · ' + esc(o.tname) : ''} · partido a las ${esc(o.time)}${o.time2 ? ' y ' + esc(o.time2) : ''} · duración estimada ${fmtN(o.duration)} h · peso ${fmtN(o.weight)} kg</p></div></div>
    <h2>Cronograma</h2><table class="doc-t"><thead><tr><th>Hora</th><th>Momento</th><th>Indicación</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="n">${hm(r.time)}</td><td><b>${esc(r.title)}</b></td><td>${esc(r.text)}${r.foods.length ? `<br><small>Ejemplo: ${esc(r.foods.join('; '))}.</small>` : ''}</td></tr>`).join('')}</tbody></table>
    <h2>Carbohidratos del día</h2>${docBars([{ label: 'Comida previa', value: o.weight * 2, text: fmtInt(o.weight * 2) + ' g' }, { label: 'Refrigerio', value: o.weight * 0.6, text: fmtInt(o.weight * 0.6) + ' g' }, { label: 'Durante (por h)', value: 45, text: '30–60 g' }, { label: 'Recuperación', value: o.weight * 1.1, text: fmtInt(o.weight * 1.1) + ' g', hi: 1 }])}
    <p class="doc-sub">Recomendaciones basadas en el consenso del Comité Olímpico Internacional (2018), la posición del ACSM (2016) y las guías de nutrición para tenis de la ITF. Ajustar al clima, la duración real del partido y la tolerancia individual; probar las estrategias en entrenamiento antes de usarlas en competencia.</p>
    <p class="doc-foot">Documento de ${esc(BRAND.name)}. Confidencial (Ley 1581 de 2012).</p>`;
}

/* =====================================================================
   Pruebas físicas · referencias: metaanálisis de 8.008 tenistas juveniles
   (Physical Performance Tests in Competitive Youth Tennis Players, 2025). Medias por sexo y categoría (U = menores de).
   ===================================================================== */
const FIT_TESTS = [
  ['cmj', 'Salto con contramovimiento (CMJ)', 'cm', 0], ['s5', 'Sprint 5 m', 's', 1], ['s10', 'Sprint 10 m', 's', 1], ['s20', 'Sprint 20 m', 's', 1],
  ['t505', 'Cambio de dirección 5-0-5', 's', 1], ['spider', 'Spider test (tenis)', 's', 1], ['hexagon', 'Test del hexágono', 's', 1], ['yoyo', 'Yo-Yo IR1 (distancia)', 'm', 0],
  ['mb_oh', 'Balón medicinal sobre la cabeza', 'm', 0], ['mb_fh', 'Balón medicinal de derecha', 'm', 0], ['mb_bh', 'Balón medicinal de revés', 'm', 0],
  ['grip_d', 'Prensión mano dominante', 'kg', 0], ['grip_nd', 'Prensión mano no dominante', 'kg', 0]];
const FIT_REF = {
  cmj: { M: { 10: 21.58, 11: 22.95, 12: 30.05, 13: 29.59, 14: 31.26, 15: 36.18, 16: 34.68, 17: 39.07, 18: 38.12 }, F: { 11: 24.13, 12: 29.13, 13: 28.8, 14: 28.48, 15: 31.99, 16: 26.87, 17: 35.7, 18: 31.13 } },
  s5: { M: { 8: 1.4, 9: 1.36, 10: 1.29, 11: 1.14, 12: 1.13, 13: 1.12, 14: 1.03, 15: 1.0, 16: 1.01, 17: 1.15 }, F: { 8: 1.41, 9: 1.37, 10: 1.29, 11: 1.09, 12: 1.11, 13: 1.14, 14: 1.06, 15: 1.08, 17: 1.31 } },
  s10: { M: { 11: 2.13, 12: 2.03, 13: 1.97, 14: 1.97, 15: 1.86, 16: 1.9, 17: 1.82, 18: 1.77 }, F: { 10: 2.29, 11: 2.18, 12: 2.03, 13: 2.03, 14: 2.02, 15: 1.97, 17: 1.95, 18: 1.96 } },
  s20: { M: { 8: 4.32, 9: 4.14, 11: 3.77, 12: 3.61, 13: 3.52, 14: 3.48, 15: 3.24, 16: 3.3, 17: 3.11, 18: 3.09 }, F: { 8: 4.42, 9: 4.19, 10: 4.04, 11: 3.76, 12: 3.63, 13: 3.57, 14: 3.66, 15: 3.44, 16: 3.72, 17: 3.51, 18: 3.38 } },
  t505: { M: { 8: 3.05, 9: 2.95, 10: 2.78, 11: 2.66, 12: 2.61, 13: 2.89, 15: 2.88, 16: 2.83, 17: 2.97 }, F: { 8: 3.1, 9: 2.97, 10: 2.83, 11: 2.73, 12: 2.65, 13: 2.88, 15: 3.15, 16: 3.2 } },
  spider: { M: { 12: 18.85, 13: 18.29, 14: 17.13, 15: 16.52, 16: 16.31, 17: 18.05 }, F: { 13: 18.8, 14: 17.73, 15: 17.45, 17: 19.28 } },
  hexagon: { M: { 12: 13.86, 13: 12.18, 17: 10.76 }, F: { 12: 12.71, 13: 12.97, 15: 13.18, 17: 11.36 } },
  mb_oh: { M: { 11: 5.4, 12: 5.61, 13: 6.29, 14: 7.6, 15: 8.6, 16: 9.03, 17: 10.69, 18: 10.52 }, F: { 11: 4.5, 12: 5.37, 13: 6.3, 14: 6.6, 15: 7.46, 16: 8.6, 17: 9.1, 18: 7.9 } },
  mb_fh: { M: { 11: 6.7, 12: 7.24, 13: 8.22, 14: 10.13, 15: 11.44, 16: 12.09, 17: 15.4, 18: 15.8 }, F: { 11: 5.8, 12: 6.74, 13: 8.13, 14: 9.6, 15: 9.55, 16: 10.3, 17: 11.3, 18: 10.5 } },
  mb_bh: { M: { 11: 6.0, 12: 6.87, 13: 7.71, 14: 9.66, 15: 10.71, 16: 11.71, 17: 15.0, 18: 15.6 }, F: { 11: 5.2, 12: 6.51, 13: 7.82, 14: 9.2, 15: 9.13, 16: 10.0, 17: 11.5, 18: 10.1 } },
  grip_d: { M: { 11: 21.2, 12: 22.37, 13: 27.01, 14: 28.57, 15: 40.2, 16: 44.99, 17: 49.14, 18: 49.86 }, F: { 11: 14.5, 12: 22.11, 13: 27.25, 14: 28.9, 15: 34.17, 16: 31.54, 17: 37.72, 18: 35.82 } },
  grip_nd: { M: { 11: 19.2, 12: 19.69, 13: 22.6, 14: 21.77, 15: 34.39, 16: 41.6, 17: 43.7, 18: 42.5 }, F: { 11: 12.0, 12: 19.59, 13: 23.48, 14: 24.98, 15: 30.92, 16: 27.0, 17: 35.6, 18: 33.5 } }
};
const FIT_SOURCE = 'Physical Performance Tests in 8008 Competitive Youth Tennis Players: A Systematic Review and Meta-Analysis of Normative Values (2025).';
function fitRef(key, sex, age) {
  const t = (FIT_REF[key] || {})[sex]; if (!t || !age) return null;
  const u = Math.min(18, Math.max(8, age + 1)); const ks = Object.keys(t).map(Number);
  const k = ks.reduce((a, b) => Math.abs(b - u) < Math.abs(a - u) || (Math.abs(b - u) === Math.abs(a - u) && b > a) ? b : a);
  return { value: t[k], group: 'U' + k, adult: age >= 18 };
}
function fitClass(v, ref, lower) {
  if (!ref || !v) return null;
  const p = lower ? ref.value / v - 1 : v / ref.value - 1;
  return p >= 0.05 ? { cls: 'ok', label: 'Por encima de la referencia', p } : p <= -0.05 ? { cls: 'bad', label: 'Por debajo de la referencia', p } : { cls: 'warnb', label: 'En la referencia', p };
}
function fitnessDocHtml(info, tests, logo) {
  const last = tests[tests.length - 1]; if (!last) return '<p>Sin pruebas registradas.</p>';
  const prev = tests[tests.length - 2];
  const age = info.d.fecha_nac ? ageFrom(info.d.fecha_nac) : 0;
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Evaluación de la condición física</h1><p><b>${esc(info.c.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · ${esc(fmtDateLong(last.test_date))}${age ? ` · ${age} años` : ''}</p></div></div>
    <h2>Resultados</h2><table class="doc-t"><thead><tr><th>Prueba</th><th class="n">Resultado</th><th class="n">Anterior</th><th class="n">Referencia</th><th>Clasificación</th></tr></thead><tbody>`;
  FIT_TESTS.forEach(([k, l, u, lower]) => {
    const v = num((last.results || {})[k]); if (!v) return;
    const pv = prev ? num((prev.results || {})[k]) : 0; const ref = fitRef(k, info.sex, age); const cl = fitClass(v, ref, lower);
    h += `<tr><td>${esc(l)}</td><td class="n"><b>${fmtN(v)} ${u}</b></td><td class="n">${pv ? fmtN(pv) + ' ' + u : '—'}</td><td class="n">${ref ? fmtN(ref.value) + ' ' + u + ' (' + ref.group + ')' : '—'}</td><td>${cl ? esc(cl.label) : '—'}</td></tr>`;
  });
  h += `</tbody></table>`;
  FIT_TESTS.forEach(([k, l, u, lower]) => {
    const pts = tests.filter(t => num((t.results || {})[k])).slice(-6); if (!pts.length) return;
    const ref = fitRef(k, info.sex, age);
    h += `<h3>${esc(l)} (${u}${lower ? ', menor es mejor' : ''})</h3>${docBars(pts.map((t, i) => ({ label: fmtDM(parseDay(t.test_date)), value: num(t.results[k]), text: fmtN(t.results[k]), hi: i === pts.length - 1 })).concat(ref ? [{ label: 'Ref. ' + ref.group, value: ref.value, text: fmtN(ref.value), ref: 1 }] : []))}`;
  });
  h += `<p class="doc-sub">Referencias: medias de tenistas juveniles de competencia por sexo y categoría (U = menores de la edad indicada). ${age >= 18 ? 'Para mayores de 18 años se usa la categoría U18 como referencia mínima. ' : ''}Clasificación: ±5 % respecto a la media. Los resultados dependen del protocolo (tipo de cronometraje, peso del balón medicinal); repetir las pruebas siempre con el mismo protocolo. Fuente: ${esc(FIT_SOURCE)}</p><p class="doc-foot">Documento de ${esc(BRAND.name)}. Confidencial (Ley 1581 de 2012).</p>`;
  return h;
}

/* =====================================================================
   Molestias · mapa corporal y restricción de ejercicios
   ===================================================================== */
const PAIN_ZONES = { cuello: 'Cuello', hombro: 'Hombro', codo: 'Codo', muneca: 'Muñeca y mano', pecho: 'Pecho', abdomen: 'Abdomen', espalda_alta: 'Espalda alta', espalda_baja: 'Espalda baja', cadera: 'Cadera e ingle', gluteo: 'Glúteo', muslo_ant: 'Muslo anterior', muslo_post: 'Muslo posterior (isquiotibiales)', rodilla: 'Rodilla', pantorrilla: 'Pantorrilla', tobillo: 'Tobillo y pie' };
const PAIN_FAMILIES = {
  hombro: ['Press vertical', 'Elevaciones laterales', 'Fondos y press declinado', 'Pullover', 'Press inclinado', 'Aperturas', 'Lanzamientos con balón medicinal', 'Tracción vertical'],
  codo: ['Extensión de tríceps', 'Press de tríceps', 'Curl de bíceps', 'Muñeca y agarre', 'Lanzamientos con balón medicinal'],
  muneca: ['Muñeca y agarre', 'Fondos y press declinado', 'Lanzamientos con balón medicinal', 'Extensión explosiva de cadera'],
  cuello: ['Trapecio', 'Press vertical'], pecho: ['Press horizontal', 'Press inclinado', 'Aperturas', 'Fondos y press declinado'],
  abdomen: ['Flexión de tronco', 'Anti-extensión', 'Anti-rotación y rotación'], espalda_alta: ['Trapecio', 'Remo horizontal', 'Press vertical'],
  espalda_baja: ['Bisagra de cadera', 'Extensión explosiva de cadera', 'Flexión de tronco'], cadera: ['Unilateral de pierna', 'Abducción y extensión de cadera', 'Saltos', 'Sentadilla y prensa'],
  gluteo: ['Empuje de cadera', 'Bisagra de cadera', 'Unilateral de pierna'], muslo_ant: ['Extensión de rodilla', 'Sentadilla y prensa', 'Unilateral de pierna', 'Saltos'],
  muslo_post: ['Curl femoral', 'Bisagra de cadera', 'Saltos', 'Extensión explosiva de cadera'], rodilla: ['Sentadilla y prensa', 'Unilateral de pierna', 'Extensión de rodilla', 'Saltos'],
  pantorrilla: ['Elevación de talones', 'Saltos'], tobillo: ['Saltos', 'Elevación de talones', 'Unilateral de pierna']
};
const PAIN_NAMES = { muneca: /Flexiones de pecho|Press de banca con barra/, espalda_baja: /Sentadilla (trasera|frontal) con barra|Remo con barra|Remo en T|Rotación rusa|Buenos días/ };
async function activePains(cid) { if (S.needsV6) return []; try { return (await DB.select('pain_reports', { eq: { client_id: cid } })).filter(p => !p.resolved_at && num(p.intensity) >= 3); } catch (e) { return []; } }
function painFor(exId, pains) {
  const e = S.exById[exId]; if (!e || !pains || !pains.length) return null;
  return pains.find(p => (PAIN_FAMILIES[p.zone] || []).includes(e.family) || (PAIN_NAMES[p.zone] && PAIN_NAMES[p.zone].test(e.name))) || null;
}
/* Silueta frontal y posterior con zonas seleccionables */
function bodyMapSvg(sel, marks) {
  const Z = (id, x, y, side) => `<circle class="bz${sel === id ? ' on' : ''}${marks[id] ? ' mk' : ''}" data-act="zone" data-z="${id}" data-s="${side || ''}" cx="${x}" cy="${y}" r="10"><title>${PAIN_ZONES[id]}</title></circle>`;
  const body = ox => `<g transform="translate(${ox},0)" class="sil"><circle cx="70" cy="28" r="17"/><rect x="62" y="44" width="16" height="10" rx="3"/><path d="M38 56 Q70 48 102 56 L106 120 Q104 150 98 168 L42 168 Q36 150 34 120 Z"/>
    <path d="M36 58 L20 112 L14 158 L22 160 L30 116 L44 76 Z"/><path d="M104 58 L120 112 L126 158 L118 160 L110 116 L96 76 Z"/>
    <path d="M44 166 L68 166 L66 250 L62 316 L50 316 L46 250 Z"/><path d="M72 166 L96 166 L94 250 L90 316 L78 316 L74 250 Z"/></g>`;
  const F = 0, B = 150;
  return `<svg class="bodymap" viewBox="0 0 290 335" role="img" aria-label="Mapa corporal">
    ${body(F)}${body(B)}<text x="70" y="333" class="bm-t">Frente</text><text x="220" y="333" class="bm-t">Espalda</text>
    ${Z('cuello', 70, 50)}${Z('hombro', 38, 62, 'Derecho')}${Z('hombro', 102, 62, 'Izquierdo')}${Z('pecho', 70, 80)}${Z('codo', 24, 112, 'Derecho')}${Z('codo', 116, 112, 'Izquierdo')}
    ${Z('abdomen', 70, 125)}${Z('muneca', 17, 152, 'Derecho')}${Z('muneca', 123, 152, 'Izquierdo')}${Z('cadera', 52, 168, 'Derecho')}${Z('cadera', 88, 168, 'Izquierdo')}
    ${Z('muslo_ant', 57, 205, 'Derecho')}${Z('muslo_ant', 83, 205, 'Izquierdo')}${Z('rodilla', 56, 250, 'Derecho')}${Z('rodilla', 84, 250, 'Izquierdo')}${Z('tobillo', 56, 310, 'Derecho')}${Z('tobillo', 84, 310, 'Izquierdo')}
    ${Z('espalda_alta', 220, 78)}${Z('hombro', 188, 62, 'Izquierdo')}${Z('hombro', 252, 62, 'Derecho')}${Z('codo', 174, 112, 'Izquierdo')}${Z('codo', 266, 112, 'Derecho')}${Z('espalda_baja', 220, 140)}
    ${Z('gluteo', 207, 172, 'Izquierdo')}${Z('gluteo', 233, 172, 'Derecho')}${Z('muslo_post', 207, 212, 'Izquierdo')}${Z('muslo_post', 233, 212, 'Derecho')}${Z('pantorrilla', 206, 278, 'Izquierdo')}${Z('pantorrilla', 234, 278, 'Derecho')}
  </svg>`;
}

/* =====================================================================
   Bloques de prevención para tenis
   ===================================================================== */
const PREV_BLOCKS = [
  ['Hombro', [['Rotación externa con banda', 2, '15'], ['Y-T-W en banco inclinado', 2, '8'], ['Face pull en polea', 2, '15'], ['Rotación externa a 90° con banda', 2, '12'], ['Estiramiento posterior de hombro (sleeper)', 2, '30 s']]],
  ['Codo', [['Excéntrico de extensión de muñeca', 3, '15'], ['Torsión inversa con barra flexible', 3, '15'], ['Pronación-supinación con mancuerna', 2, '15'], ['Curl de muñeca con mancuerna', 2, '15']]],
  ['Muñeca', [['Extensión de muñeca con mancuerna', 2, '15'], ['Desviación radial y cubital con martillo', 2, '15'], ['Apretón de pelota', 2, '30 s'], ['Paseo del granjero', 2, '30 m']]],
  ['Tobillo', [['Equilibrio monopodal', 2, '30 s'], ['Elevación de talones excéntrica en escalón', 3, '12'], ['Saltos de tobillo (pogo)', 2, '20'], ['Alcance en Y monopodal', 2, '6']]],
  ['Aductores y cadera', [['Plancha de Copenhague', 2, '20 s'], ['Aducción de cadera en polea', 2, '12'], ['Abducción con banda elástica', 2, '15']]]
];
function preventionModal(dayId, n, after) {
  modal(`${modalHead('Bloque de prevención')}<p class="small muted">Se agregan al final del día con series, repeticiones y descanso de 45 s. Puedes editarlos después.</p>
    ${PREV_BLOCKS.map(([b, xs], i) => `<button class="pick-item" data-act="pb" data-i="${i}"><b>${esc(b)}</b><small>${esc(xs.map(x => x[0]).join(' · '))}</small></button>`).join('')}`, {
    click: {
      pb: async el => {
        const [, xs] = PREV_BLOCKS[+el.dataset.i]; let pos = n; const miss = [];
        for (const [name, sets, reps] of xs) {
          const e = S.exercises.find(x => x.name === name); if (!e) { miss.push(name); continue; }
          await DB.insert('routine_exercises', { day_id: dayId, exercise_id: e.id, position: pos++, sets, reps, rir: '', rest_seconds: 45, notes: 'Prevención' });
        }
        closeModal(); toast(miss.length ? `Bloque agregado. Faltan en la biblioteca: ${miss.join(', ')} (ejecuta la migración v6).` : 'Bloque de prevención agregado'); after();
      }
    }
  });
}

/* =====================================================================
   Vista Rendimiento (asesorado y entrenador)
   ===================================================================== */
const REND_TABS = [['carga', 'Carga'], ['partidos', 'Partidos'], ['torneos', 'Torneos'], ['hidratacion', 'Hidratación'], ['pruebas', 'Pruebas'], ['molestias', 'Molestias']];
const V6_NOTICE = '<div class="card warn-box small"><b>Actualización pendiente de la base de datos.</b> Para activar esta sección, ejecuta <code>supabase/migracion-v6.sql</code> en Supabase › SQL Editor.</div>';
async function rendimientoTab(cid, sub, base) {
  sub = REND_TABS.some(x => x[0] === sub) ? sub : 'carga';
  const coach = S.profile.role !== 'client';
  const nav = `<div class="chips scroll">${REND_TABS.map(([k, l]) => `<a class="chip${k === sub ? ' on' : ''}" href="${base}/${k}">${l}</a>`).join('')}</div>`;
  if (S.needsV6) return { html: nav + V6_NOTICE, click: {} };
  const info = await clientInfo(cid);
  const R = { carga: rendCarga, partidos: rendPartidos, torneos: rendTorneos, hidratacion: rendHidratacion, pruebas: rendPruebas, molestias: rendMolestias }[sub];
  const r = await R(cid, info, coach);
  return { html: nav + r.html, click: r.click || {}, change: r.change, after: r.after };
}
async function rendCarga(cid) {
  const L = await loadData(cid, 90); const wk = weeklyLoads(L, 8); const now = acwrAt(L, todayStr()); const z = acwrZone(now.ratio);
  const wells = await DB.select('wellness', { eq: { client_id: cid }, gte: { log_date: addDays(todayStr(), -13) }, order: 'log_date' }).catch(() => []);
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), -13 + i));
  const html = `<div class="stats3"><div><b>${fmtInt(now.acute)}</b><small>Carga 7 días (UA)</small></div><div><b>${fmtInt(now.chronic)}</b><small>Promedio semanal 4 semanas</small></div><div><b class="${z.cls}">${now.ratio == null ? '—' : fmtN(now.ratio)}</b><small>Relación aguda:crónica</small></div></div>
    <div class="card"><div class="day-h"><h3>Estado de la carga</h3><span class="badge ${z.cls}">${esc(z.label.split(':')[0])}</span></div><p class="small">${esc(z.label)}.</p>
      <p class="small muted">Carga de cada sesión = esfuerzo percibido (RPE 0–10) × minutos. Relación aguda:crónica = carga de los últimos 7 días ÷ promedio semanal de las últimas 4 semanas. Zona óptima 0,8–1,3; por encima de 1,5 aumenta el riesgo de lesión (Gabbett, 2016). Es un indicador orientativo que se interpreta junto con el bienestar y las molestias.${L.unrated ? ` ${L.unrated} sesiones de fuerza sin RPE no se incluyen.` : ''}</p></div>
    <div class="card"><h3>Carga semanal (UA)</h3>${vbars(wk.map((w, i) => ({ label: fmtDM(parseDay(w.end)), value: w.load, text: w.load >= 1000 ? r1(w.load / 1000) + 'k' : Math.round(w.load), hi: i === wk.length - 1 })), 'Sin sesiones con RPE registradas.')}</div>
    <div class="card"><h3>Relación aguda:crónica por semana</h3>${vbars(wk.map((w, i) => ({ label: fmtDM(parseDay(w.end)), value: w.ratio || 0, text: w.ratio ? fmtN(w.ratio) : '', hi: i === wk.length - 1 })), 'Se requieren al menos 3 semanas de registros.')}<p class="small muted">Semana que termina en la fecha indicada.</p></div>
    <div class="card"><h3>Bienestar diario (puntaje sobre 25)</h3>${vbars(days14.map((d, i) => { const w = wells.find(x => x.log_date === d); const l = wellnessLight(w); return { label: fmtDM(parseDay(d)), value: l ? l.tot : 0, text: l ? l.tot : '', hi: i === 13 }; }), 'Sin registros de bienestar.')}
      <p class="small muted">Sueño, energía, dolor muscular, estrés y ánimo (1–5 cada uno). Verde ≥ 20, amarillo 15–19, rojo ≤ 14 o cualquier respuesta en 1.</p></div>`;
  return { html };
}
async function rendPartidos(cid) {
  const ts = await DB.select('tennis_sessions', { eq: { client_id: cid }, order: 'log_date', asc: false, limit: 60 });
  const html = `<div class="card"><h3>Registrar partido o práctica</h3>
      <div class="seg" id="tk"><button class="on" data-act="tk" data-v="Práctica">Práctica</button><button data-act="tk" data-v="Partido">Partido</button></div>
      <div class="rex-grid three"><label><span>Fecha</span><input class="input" type="date" id="tp-d" value="${todayStr()}"></label><label><span>Minutos</span><input class="input" id="tp-m" inputmode="numeric" placeholder="90"></label><label><span>Superficie</span><select class="input" id="tp-s">${SURFACES.map(s => `<option>${s}</option>`).join('')}</select></label></div>
      <div class="field"><span>Esfuerzo percibido (RPE 0–10)</span><div class="chips scale11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="chip" data-act="tr" data-v="${n}">${n}</button>`).join('')}</div><small class="muted">0 reposo · 3 moderado · 5 duro · 7 muy duro · 10 máximo</small></div>
      <input class="input" id="tp-r" placeholder="Resultado o rival (opcional)">
      <button class="btn primary block" data-act="tpSave">Guardar</button>
      <p class="small muted">La carga (RPE × minutos) se suma al control de carga, y el gasto estimado se suma a las calorías del día en Hoy.</p></div>
    ${ts.length ? `<div class="card"><h3>Registros</h3><table class="tbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Min</th><th>RPE</th><th>Carga</th><th></th></tr></thead><tbody>${ts.map(t => `<tr><td>${fmtDM(parseDay(t.log_date))}${t.result ? `<br><small class="muted">${esc(t.result)}</small>` : ''}</td><td>${esc(t.kind)}<br><small class="muted">${esc(t.surface || '')}</small></td><td>${fmtInt(t.minutes)}</td><td>${fmtInt(t.rpe)}</td><td>${fmtInt(num(t.rpe) * num(t.minutes))}</td><td><button class="icon-btn danger" data-act="tpDel" data-id="${t.id}" aria-label="Eliminar">✕</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  let kind = 'Práctica', rpe = null;
  return {
    html, click: {
      tk: el => { kind = el.dataset.v; document.querySelectorAll('[data-act=tk]').forEach(x => x.classList.toggle('on', x === el)); },
      tr: el => { rpe = +el.dataset.v; document.querySelectorAll('[data-act=tr]').forEach(x => x.classList.toggle('on', x === el)); },
      tpSave: async () => {
        const m = num($('#tp-m').value); if (!m) return toast('Indica los minutos', 'error'); if (rpe == null) return toast('Indica el esfuerzo percibido', 'error');
        await DB.insert('tennis_sessions', { client_id: cid, log_date: $('#tp-d').value || todayStr(), kind, minutes: Math.round(m), surface: $('#tp-s').value, rpe, result: $('#tp-r').value.trim() || null });
        toast('Registro guardado'); route();
      },
      tpDel: async el => { if (!confirm('¿Eliminar este registro?')) return; await DB.remove('tennis_sessions', el.dataset.id); route(); }
    }
  };
}
/* Gasto energético del tenis (MET: práctica 7,0 · partido 8,0; Compendium of Physical Activities).
   El factor de actividad del plan ya incluye las sesiones de tenis semanales declaradas en la valoración, repartidas en los 7 días:
   en un día con tenis se suma solo la diferencia frente a ese promedio (gasto × (1 − sesiones/7)). */
const SPORT_N = { '0 a 1': 0.5, '2 a 3': 2.5, '4 a 5': 4.5, '6 o más': 6 };
async function tennisKcal(cid, date) {
  if (S.needsV6) return { kcal: 0, rows: [] };
  try {
    const rows = await DB.select('tennis_sessions', { eq: { client_id: cid, log_date: date } }); if (!rows.length) return { kcal: 0, rows };
    const w = await latestWeight(cid); const info = await clientInfo(cid);
    const assumed = SPORT_N[info.d.sesiones_deporte] || 0;
    const gross = rows.reduce((a, t) => a + (t.kind === 'Partido' ? 8 : 7) * w * num(t.minutes) / 60, 0);
    return { kcal: Math.round(gross * Math.max(0, 1 - assumed / 7) / 10) * 10, gross: Math.round(gross / 10) * 10, assumed, rows };
  } catch (e) { return { kcal: 0, rows: [] }; }
}
async function rendTorneos(cid, info) {
  const ts = await tournamentsOf(cid); const t0 = todayStr();
  const next = ts.filter(t => (t.end_date || t.start_date) >= t0);
  const past = ts.filter(t => (t.end_date || t.start_date) < t0).reverse();
  const w = await latestWeight(cid);
  const sw = (await DB.select('sweat_tests', { eq: { client_id: cid }, order: 'test_date', asc: false, limit: 1 }))[0];
  const card = t => { const d = daysBetween(t0, t.start_date); return `<div class="card"><div class="day-h"><div><b>${esc(t.name)}</b><small class="muted">${esc(fmtDayMonth(t.start_date))}${t.end_date && t.end_date !== t.start_date ? ' al ' + esc(fmtDayMonth(t.end_date)) : ''}${t.city ? ' · ' + esc(t.city) : ''}${t.surface ? ' · ' + esc(t.surface) : ''}${t.category ? ' · ' + esc(t.category) : ''}</small></div>${d > 0 ? `<span class="badge ${d <= 7 ? 'warnb' : ''}">En ${d} ${d === 1 ? 'día' : 'días'}</span>` : t0 <= (t.end_date || t.start_date) ? '<span class="badge ok">En curso</span>' : ''}</div>
    <div class="row-btns"><button class="btn sm primary" data-act="proto" data-id="${t.id}">Protocolo del día de partido</button><button class="btn sm danger-outline" data-act="tDel" data-id="${t.id}">Eliminar</button></div></div>`; };
  const html = `<div class="card"><h3>Agregar torneo</h3>
      <input class="input" id="to-n" placeholder="Nombre del torneo">
      <div class="rex-grid"><label><span>Inicio</span><input class="input" type="date" id="to-s"></label><label><span>Fin</span><input class="input" type="date" id="to-e"></label></div>
      <div class="rex-grid three"><label><span>Superficie</span><select class="input" id="to-sf"><option></option>${SURFACES.map(s => `<option>${s}</option>`).join('')}</select></label><label><span>Ciudad</span><input class="input" id="to-c"></label><label><span>Categoría</span><input class="input" id="to-k" placeholder="16 años, Open…"></label></div>
      <button class="btn primary block" data-act="tAdd">Guardar torneo</button>
      <p class="small muted">Periodización automática: ${fmtInt(cfgT('taper_days'))} días antes del torneo el volumen de fuerza baja al ${fmtInt(cfgT('taper_pct'))} % de las series (40 % durante el torneo). La víspera, los carbohidratos suben a ${fmtN(cfgT('pre_carb_gkg'))} g/kg y en los días de torneo a ${fmtN(cfgT('match_carb_gkg'))} g/kg (${w ? fmtInt(w * cfgT('pre_carb_gkg')) + ' y ' + fmtInt(w * cfgT('match_carb_gkg')) + ' g' : 'según el peso'}), con las porciones ajustadas en Hoy.</p></div>
    ${next.length ? '<h2 class="sec">Próximos</h2>' + next.map(card).join('') : ''}${past.length ? '<h2 class="sec">Anteriores</h2>' + past.slice(0, 10).map(card).join('') : ''}`;
  return {
    html, click: {
      tAdd: async () => {
        const n = $('#to-n').value.trim(), s = $('#to-s').value; if (!n || !s) return toast('Indica el nombre y la fecha de inicio', 'error');
        const e = $('#to-e').value || s; if (e < s) return toast('La fecha de fin debe ser posterior al inicio', 'error');
        await DB.insert('tournaments', { client_id: cid, name: n, start_date: s, end_date: e, surface: $('#to-sf').value || null, city: $('#to-c').value.trim() || null, category: $('#to-k').value.trim() || null });
        toast('Torneo guardado'); route();
      },
      tDel: async el => { if (!confirm('¿Eliminar este torneo?')) return; await DB.remove('tournaments', el.dataset.id); route(); },
      proto: el => { const t = ts.find(x => x.id === el.dataset.id); protocolModal(info, t, w, sw); }
    }
  };
}
function protocolModal(info, t, w, sw) {
  const x = sw ? sweatCalc(sw) : null;
  modal(`${modalHead('Protocolo del día de partido')}
    <div class="rex-grid three"><label><span>Hora del partido</span><input class="input" type="time" id="pr-t" value="09:00"></label><label><span>Duración (h)</span><select class="input" id="pr-d">${[1, 1.5, 2, 2.5, 3].map(v => `<option value="${v}"${v === 2 ? ' selected' : ''}>${String(v).replace('.', ',')}</option>`).join('')}</select></label><label><span>Segundo partido</span><input class="input" type="time" id="pr-t2"></label></div>
    <label class="field"><span>Peso kg</span><input class="input" id="pr-w" inputmode="decimal" value="${w ? r1(w) : ''}"></label>
    <p class="small muted">${x ? `Hidratación según la prueba de sudoración del ${fmtDM(parseDay(sw.test_date))}: ${fmtN(x.drink)} L/h y ${fmtInt(x.naRepl)} mg de sodio por hora.` : 'Sin prueba de sudoración: se usan valores generales de hidratación. Registra una prueba en Hidratación para personalizarlos.'}</p>
    <div class="row-btns"><button class="btn primary" data-act="ver">Ver protocolo</button><button class="btn" data-act="pdf">PDF</button><button class="btn" data-act="html">HTML</button></div>`, {
    click: (() => {
      const opts = () => ({ time: $('#pr-t').value || '09:00', time2: $('#pr-t2').value || '', duration: num($('#pr-d').value) || 2, weight: num($('#pr-w').value) || w || 60, drink: x ? x.drink : 0, na: x ? x.naRepl : 0, tname: t ? t.name : '' });
      const name = () => `Protocolo de torneo - ${info.c.full_name || ''}${t ? ' - ' + t.name : ''}`.replace(/[\\/:*?"<>|]/g, '');
      return {
        ver: () => { const o = opts(); ensureReportCss(); closeModal(); modal(`${modalHead('Protocolo del día de partido')}<div class="doc">${protocolDocHtml(info.c, o, BRAND.logoFull || BRAND.logo)}</div>`); },
        pdf: () => { const o = opts(); closeModal(); reportDocButtons(name(), logo => protocolDocHtml(info.c, o, logo)).pdf(); },
        html: () => { const o = opts(); reportDocButtons(name(), logo => protocolDocHtml(info.c, o, logo)).html(); }
      };
    })()
  });
}
async function rendHidratacion(cid, info) {
  const ss = await DB.select('sweat_tests', { eq: { client_id: cid }, order: 'test_date', asc: false, limit: 20 });
  const w = await latestWeight(cid);
  const html = `<div class="card"><h3>Prueba de sudoración</h3>
      <p class="small muted">Durante un entrenamiento o partido de al menos 60 minutos: pesarse antes y después con poca ropa y sin sudor en la piel (secarse con toalla), registrar todo lo que se bebió y, si fue al baño, el volumen aproximado de orina.</p>
      <div class="rex-grid three"><label><span>Fecha</span><input class="input" type="date" id="sw-d" value="${todayStr()}"></label><label><span>Minutos</span><input class="input" id="sw-m" inputmode="numeric"></label><label><span>Temperatura °C</span><input class="input" id="sw-t" inputmode="decimal"></label></div>
      <div class="rex-grid"><label><span>Peso antes kg</span><input class="input" id="sw-a" inputmode="decimal" value="${w ? r1(w) : ''}"></label><label><span>Peso después kg</span><input class="input" id="sw-b" inputmode="decimal"></label><label><span>Bebido ml</span><input class="input" id="sw-f" inputmode="numeric"></label><label><span>Orina ml</span><input class="input" id="sw-u" inputmode="numeric" placeholder="0"></label></div>
      <div class="rex-grid"><label><span>Humedad %</span><input class="input" id="sw-h" inputmode="numeric"></label></div>
      <label class="check"><input type="checkbox" id="sw-s"> Quedan marcas blancas de sal en la ropa o la gorra (sudor salado)</label>
      <button class="btn primary block" data-act="swSave">Calcular y guardar</button></div>
    ${ss.length ? `<div class="card"><h3>Tasa de sudoración (L/h)</h3>${vbars(ss.slice(0, 8).reverse().map((s, i, a) => { const x = sweatCalc(s); return { label: fmtDM(parseDay(s.test_date)), value: x ? x.rate : 0, text: x ? fmtN(x.rate) : '', hi: i === a.length - 1 }; }))}</div>` +
      ss.map(s => { const x = sweatCalc(s); return x ? `<div class="card"><div class="day-h"><div><b>${esc(fmtDayMonth(s.test_date))} · ${fmtN(x.rate)} L/h</b><small class="muted">${fmtInt(s.minutes)} min${s.temp_c ? ' · ' + fmtN(s.temp_c) + ' °C' : ''} · pérdida ${fmtN(x.pct)} % del peso</small></div>${x.pct > 2 ? '<span class="badge bad">> 2 %</span>' : '<span class="badge ok">≤ 2 %</span>'}</div>
        <p class="small">Plan: ${fmtN(x.drink)} L por hora (${fmtInt(x.perChange)} ml en cada cambio de lado) y ${fmtInt(x.naRepl)} mg de sodio por hora.</p>
        <div class="row-btns"><button class="btn sm primary" data-act="swPdf" data-id="${s.id}">PDF</button><button class="btn sm" data-act="swHtml" data-id="${s.id}">HTML</button><button class="btn sm danger-outline" data-act="swDel" data-id="${s.id}">Eliminar</button></div></div>` : ''; }).join('') : ''}`;
  const doc = id => { const s = ss.find(x => x.id === id); return reportDocButtons(`Plan de hidratación - ${info.c.full_name || ''} - ${s.test_date}`.replace(/[\\/:*?"<>|]/g, ''), logo => hydrationDocHtml(info.c, s, w || num(s.pre_kg), logo)); };
  return {
    html, click: {
      swSave: async () => {
        const rec = { client_id: cid, test_date: $('#sw-d').value || todayStr(), minutes: Math.round(num($('#sw-m').value)), pre_kg: num($('#sw-a').value), post_kg: num($('#sw-b').value), fluid_ml: Math.round(num($('#sw-f').value)), urine_ml: Math.round(num($('#sw-u').value)), temp_c: $('#sw-t').value.trim() ? num($('#sw-t').value) : null, humidity: $('#sw-h').value.trim() ? num($('#sw-h').value) : null, salty: $('#sw-s').checked };
        if (!rec.minutes || !rec.pre_kg || !rec.post_kg) return toast('Indica minutos y pesos antes y después', 'error');
        if (Math.abs(rec.pre_kg - rec.post_kg) > rec.pre_kg * 0.06) return toast('Revisa los pesos: la diferencia es mayor al 6 %', 'error');
        await DB.insert('sweat_tests', rec); const x = sweatCalc(rec); toast(`Tasa de sudoración: ${fmtN(x.rate)} L/h`); route();
      },
      swPdf: el => doc(el.dataset.id).pdf(), swHtml: el => doc(el.dataset.id).html(),
      swDel: async el => { if (!confirm('¿Eliminar esta prueba?')) return; await DB.remove('sweat_tests', el.dataset.id); route(); }
    }
  };
}
async function rendPruebas(cid, info, coach) {
  const tests = await DB.select('fitness_tests', { eq: { client_id: cid }, order: 'test_date' });
  const age = ageFrom(info.d.fecha_nac); const last = tests[tests.length - 1];
  const name = `Evaluación física - ${info.c.full_name || ''}${last ? ' - ' + last.test_date : ''}`.replace(/[\\/:*?"<>|]/g, '');
  const docs = reportDocButtons(name, logo => fitnessDocHtml(info, tests, logo));
  const html = `${coach ? `<div class="card"><h3>Registrar pruebas</h3><label class="field"><span>Fecha</span><input class="input" type="date" id="ft-d" value="${todayStr()}"></label>
      <div class="rex-grid">${FIT_TESTS.map(([k, l, u]) => `<label><span>${esc(l)} (${u})</span><input class="input" data-ft="${k}" inputmode="decimal"></label>`).join('')}</div>
      <p class="small muted">Registra solo las pruebas realizadas. Sprints con fotocélulas o cronómetro (indicar en notas), balón medicinal de 2 kg en juveniles y 3 kg en adultos, prensión con dinamómetro.</p>
      <input class="input" id="ft-n" placeholder="Notas del protocolo (opcional)"><button class="btn primary block" data-act="ftSave">Guardar evaluación</button></div>` : ''}
    ${last ? `<div class="row-btns"><button class="btn primary" data-act="pdf">Descargar PDF</button><button class="btn" data-act="html">Descargar HTML</button></div>
      <div class="card"><h3>Última evaluación · ${esc(fmtDayMonth(last.test_date))}</h3><table class="tbl"><thead><tr><th>Prueba</th><th class="n">Resultado</th><th class="n">Ref.</th><th></th></tr></thead><tbody>
      ${FIT_TESTS.filter(([k]) => num((last.results || {})[k])).map(([k, l, u, lower]) => { const v = num(last.results[k]), ref = fitRef(k, info.sex, age), cl = fitClass(v, ref, lower); return `<tr><td>${esc(l)}</td><td class="n"><b>${fmtN(v)}</b> ${u}</td><td class="n">${ref ? fmtN(ref.value) + ' (' + ref.group + ')' : '—'}</td><td>${cl ? `<span class="badge ${cl.cls}">${cl.p > 0 ? '+' : ''}${Math.round(cl.p * 100)} %</span>` : ''}</td></tr>`; }).join('')}</tbody></table>
      <p class="small muted">${age ? '' : 'Sin fecha de nacimiento en la valoración: no se pueden asignar referencias. '}Referencia: media de tenistas juveniles de competencia del mismo sexo y categoría${age >= 18 ? ' (U18 como referencia mínima para adultos)' : ''}. Fuente: ${esc(FIT_SOURCE)}</p></div>
      ${FIT_TESTS.map(([k, l, u, lower]) => { const pts = tests.filter(t => num((t.results || {})[k])).slice(-6); if (!pts.length) return ''; const ref = fitRef(k, info.sex, age); const vals = pts.map(t => num(t.results[k])).concat(ref ? [ref.value] : []); const fl = lower ? 0 : Math.max(0, Math.floor(Math.min(...vals) * 0.8)); return `<div class="card"><h3>${esc(l)} (${u}${lower ? ', menor es mejor' : ''})</h3>${vbars(pts.map((t, i) => ({ label: fmtDM(parseDay(t.test_date)), value: num(t.results[k]), text: fmtN(t.results[k]), hi: i === pts.length - 1 })).concat(ref ? [{ label: 'Ref.', value: ref.value, text: fmtN(ref.value) }] : []), '', fl)}</div>`; }).join('')}
      ${coach ? `<button class="btn danger-outline block" data-act="ftDel" data-id="${last.id}">Eliminar la última evaluación</button>` : ''}` : '<div class="card empty"><p>Sin evaluaciones físicas registradas.</p></div>'}`;
  return {
    html, click: {
      ...docs,
      ftSave: async () => {
        const res = {}; document.querySelectorAll('[data-ft]').forEach(i => { if (i.value.trim()) res[i.dataset.ft] = num(i.value); });
        if (!Object.keys(res).length) return toast('Registra al menos una prueba', 'error');
        await DB.insert('fitness_tests', { client_id: cid, test_date: $('#ft-d').value || todayStr(), results: res, notes: $('#ft-n').value.trim() || null }); toast('Evaluación guardada'); route();
      },
      ftDel: async el => { if (!confirm('¿Eliminar la última evaluación?')) return; await DB.remove('fitness_tests', el.dataset.id); route(); }
    }
  };
}
async function rendMolestias(cid, info, coach) {
  const all = await DB.select('pain_reports', { eq: { client_id: cid }, order: 'report_date', asc: false, limit: 40 });
  const act = all.filter(p => !p.resolved_at);
  const marks = {}; act.forEach(p => { marks[p.zone] = 1; });
  let zone = null, side = '', inten = null;
  const restricted = z => S.exercises.filter(e => (PAIN_FAMILIES[z] || []).includes(e.family) || (PAIN_NAMES[z] && PAIN_NAMES[z].test(e.name))).length;
  const html = `<div class="card"><h3>Reportar una molestia</h3><p class="small muted">Toca la zona en el mapa. Con intensidad de 3 o más, los ejercicios que cargan esa zona se marcan durante la sesión con alternativas, hasta que la molestia se marque como resuelta.</p>
      <div id="bm">${bodyMapSvg(null, marks)}</div>
      <div id="pz" class="small"><b>Zona:</b> sin seleccionar</div>
      <div class="seg" id="ps">${['Derecho', 'Izquierdo', 'Ambos', 'Centro'].map(s => `<button data-act="ps" data-v="${s}">${s}</button>`).join('')}</div>
      <div class="field"><span>Intensidad del dolor (0–10)</span><div class="chips scale11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="chip" data-act="pi" data-v="${n}">${n}</button>`).join('')}</div></div>
      <input class="input" id="pn" placeholder="¿Cuándo aparece? (golpe, saque, al correr, en reposo…)">
      <button class="btn primary block" data-act="pSave">Reportar</button>
      <p class="small muted">Dolor agudo, hinchazón, pérdida de fuerza o dolor que no mejora en 72 horas requiere valoración médica o de fisioterapia.</p></div>
    ${all.length ? '<h2 class="sec">Reportes</h2>' + all.map(p => `<div class="card pain ${p.resolved_at ? 'res' : ''}"><div class="day-h"><div><b>${esc(PAIN_ZONES[p.zone] || p.zone)}${p.side ? ' · ' + esc(p.side) : ''} · ${fmtInt(p.intensity)}/10</b><small class="muted">${esc(fmtDayMonth(p.report_date))}${p.notes ? ' · ' + esc(p.notes) : ''}</small></div><span class="badge ${p.resolved_at ? 'ok' : num(p.intensity) >= 6 ? 'bad' : 'warnb'}">${p.resolved_at ? 'Resuelta' : 'Activa'}</span></div>
      ${!p.resolved_at && num(p.intensity) >= 3 ? `<p class="small muted">${restricted(p.zone)} ejercicios de la biblioteca quedan marcados durante la sesión.</p>` : ''}
      <div class="row-btns">${p.resolved_at ? '' : `<button class="btn sm" data-act="pRes" data-id="${p.id}">Marcar resuelta</button>`}${coach && !p.reviewed_at ? `<button class="btn sm" data-act="pRev" data-id="${p.id}">Marcar revisada</button>` : ''}${coach ? waBtn(info.c.phone, `Hola ${firstName(info.c.full_name)}, vi tu reporte de molestia en ${(PAIN_ZONES[p.zone] || '').toLowerCase()}. `, 'WhatsApp') : ''}</div></div>`).join('') : ''}`;
  return {
    html, click: {
      zone: el => { zone = el.dataset.z; side = el.dataset.s || 'Centro'; $('#bm').innerHTML = bodyMapSvg(zone, marks); $('#pz').innerHTML = `<b>Zona:</b> ${esc(PAIN_ZONES[zone])}`; document.querySelectorAll('[data-act=ps]').forEach(x => x.classList.toggle('on', x.dataset.v === side)); },
      ps: el => { side = el.dataset.v; document.querySelectorAll('[data-act=ps]').forEach(x => x.classList.toggle('on', x === el)); },
      pi: el => { inten = +el.dataset.v; document.querySelectorAll('[data-act=pi]').forEach(x => x.classList.toggle('on', x === el)); },
      pSave: async () => {
        if (!zone) return toast('Selecciona la zona en el mapa', 'error'); if (inten == null) return toast('Indica la intensidad', 'error');
        await DB.insert('pain_reports', { client_id: cid, report_date: todayStr(), zone, side, intensity: inten, notes: $('#pn').value.trim() || null });
        toast(inten >= 3 ? 'Molestia reportada: los ejercicios de la zona quedan marcados' : 'Molestia reportada'); route();
      },
      pRes: async el => { await DB.update('pain_reports', el.dataset.id, { resolved_at: new Date().toISOString() }); toast('Molestia resuelta'); route(); },
      pRev: async el => { await DB.update('pain_reports', el.dataset.id, { reviewed_at: new Date().toISOString() }); route(); }
    }
  };
}
async function vRendimiento(sub) {
  const r = await rendimientoTab(S.profile.id, sub, '#/rendimiento');
  paint(progSeg('rendimiento') + r.html, { click: r.click, change: r.change }, 'Progreso');
  if (r.after) r.after();
}

/* ---------- RPE de la sesión de fuerza (resumen) ---------- */
function rpeCardHtml(w) {
  if (S.needsV6 || w.client_id !== S.profile.id || w.rpe != null) return '';
  return `<div class="card rpe-card"><h3>¿Qué tan exigente fue la sesión?</h3><p class="small muted">Responde unos 30 minutos después de terminar. 0 reposo · 3 moderada · 5 dura · 7 muy dura · 10 máxima.</p>
    <div class="chips scale11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="chip" data-act="rpe" data-v="${n}">${n}</button>`).join('')}</div></div>`;
}
const rpeHandler = w => async el => { const v = +el.dataset.v; const m = minutesOf(w); await DB.update('workouts', w.id, { rpe: v, load: v * m }); toast(`Esfuerzo registrado · carga ${fmtInt(v * m)} UA`); route(); };

/* ---------- Pendientes del entrenador ---------- */
async function inboxTenisRows(byId) {
  if (S.needsV6) return [];
  const rows = []; const t0 = todayStr();
  try {
    const [wells, pains, tours] = await Promise.all([DB.select('wellness', { eq: { log_date: t0 } }), DB.select('pain_reports', { gte: { report_date: addDays(t0, -21) } }), DB.select('tournaments', { gte: { start_date: t0 } })]);
    wells.filter(w => byId[w.client_id]).forEach(w => { const l = wellnessLight(w); if (l.cls === 'bad') rows.push(`<a class="ib-row" href="#/asesorado/${w.client_id}/rendimiento/carga"><span class="ib-tag m">Bienestar</span><span class="ib-n">${esc(byId[w.client_id].full_name || '')}</span><span class="ib-m">Rojo · ${l.tot}/25</span></a>`); });
    pains.filter(p => byId[p.client_id] && !p.reviewed_at && !p.resolved_at).forEach(p => rows.push(`<a class="ib-row" href="#/asesorado/${p.client_id}/rendimiento/molestias"><span class="ib-tag m">Molestia</span><span class="ib-n">${esc(byId[p.client_id].full_name || '')}</span><span class="ib-m">${esc(PAIN_ZONES[p.zone] || '')} · ${fmtInt(p.intensity)}/10</span></a>`));
    tours.filter(t => byId[t.client_id] && daysBetween(t0, t.start_date) <= 7).forEach(t => rows.push(`<a class="ib-row" href="#/asesorado/${t.client_id}/rendimiento/torneos"><span class="ib-tag f">Torneo</span><span class="ib-n">${esc(byId[t.client_id].full_name || '')}</span><span class="ib-m">${esc(t.name)} · ${daysBetween(t0, t.start_date) === 0 ? 'hoy' : 'en ' + daysBetween(t0, t.start_date) + ' d'}</span></a>`));
    // Relación aguda:crónica de todos los asesorados con dos consultas
    const since = addDays(t0, -35);
    const [ts, ws] = await Promise.all([DB.select('tennis_sessions', { gte: { log_date: since } }), DB.select('workouts', { gte: { started_at: parseDay(since).toISOString() } })]);
    const per = {};
    const L = cid => per[cid] = per[cid] || { daily: {}, first: null };
    const add = (cid, d, v) => { const x = L(cid); x.daily[d] = (x.daily[d] || 0) + v; if (!x.first || d < x.first) x.first = d; };
    ts.forEach(t => add(t.client_id, t.log_date, num(t.rpe) * num(t.minutes)));
    ws.filter(w => num(w.rpe)).forEach(w => add(w.client_id, dateStr(new Date(w.started_at)), num(w.rpe) * minutesOf(w)));
    Object.entries(per).filter(([cid]) => byId[cid]).forEach(([cid, x]) => {
      const r = acwrAt(x, t0).ratio;
      if (r != null && r > 1.5) rows.push(`<a class="ib-row" href="#/asesorado/${cid}/rendimiento/carga"><span class="ib-tag m">Carga</span><span class="ib-n">${esc(byId[cid].full_name || '')}</span><span class="ib-m">Aguda:crónica ${fmtN(r)}</span></a>`);
    });
  } catch (e) { console.warn('tenis inbox', e); }
  return rows;
}

/* =====================================================================
   Datos de demostración
   ===================================================================== */
function buildTenisDemo(d) {
  const t = todayStr(); const iso = new Date().toISOString();
  Object.assign(d, { tennis_sessions: [], wellness: [], tournaments: [], sweat_tests: [], fitness_tests: [], pain_reports: [] });
  const ana = 'demo-ana';
  (d.workouts || []).forEach((w, i) => { const m = Math.round((new Date(w.finished_at) - new Date(w.started_at)) / 60000); w.rpe = [6, 7, 7, 8, 6][i % 5]; w.load = w.rpe * m; });
  for (let i = 34; i >= 1; i--) {
    const day = addDays(t, -i); const wd = parseDay(day).getDay();
    if ([2, 4, 6].includes(wd)) d.tennis_sessions.push({ id: uid(), client_id: ana, log_date: day, kind: wd === 6 ? 'Partido' : 'Práctica', minutes: wd === 6 ? 110 : 90, surface: 'Arcilla', rpe: wd === 6 ? 8 : (i < 8 ? 7 : 6), result: wd === 6 ? 'Ganó 6-4 6-3' : null, created_at: iso });
    if (i <= 13) d.wellness.push({ id: uid(), client_id: ana, log_date: day, sleep: 4, fatigue: i % 5 === 0 ? 2 : 4, soreness: i % 4 === 0 ? 3 : 4, stress: 3, mood: 4, created_at: iso });
  }
  d.tournaments.push({ id: uid(), client_id: ana, name: 'Nacional Juvenil 18 años', start_date: addDays(t, 5), end_date: addDays(t, 9), surface: 'Arcilla', city: 'Medellín', category: '18 años', created_at: iso },
    { id: uid(), client_id: ana, name: 'Torneo Departamental', start_date: addDays(t, -30), end_date: addDays(t, -28), surface: 'Dura', city: 'Bogotá', category: '18 años', created_at: iso });
  d.sweat_tests.push({ id: uid(), client_id: ana, test_date: addDays(t, -12), minutes: 90, pre_kg: 58.4, post_kg: 57.5, fluid_ml: 700, urine_ml: 0, temp_c: 27, humidity: 65, salty: false, created_at: iso });
  d.fitness_tests.push({ id: uid(), client_id: ana, test_date: addDays(t, -60), results: { cmj: 29.5, s5: 1.12, s10: 2.01, s20: 3.62, t505: 2.9, spider: 18.4, mb_fh: 9.8, mb_bh: 9.1, grip_d: 33, grip_nd: 29 }, created_at: iso },
    { id: uid(), client_id: ana, test_date: addDays(t, -3), results: { cmj: 31.8, s5: 1.09, s10: 1.97, s20: 3.52, t505: 2.84, spider: 17.9, mb_fh: 10.6, mb_bh: 9.9, grip_d: 35.5, grip_nd: 30 }, created_at: iso });
  d.pain_reports.push({ id: uid(), client_id: ana, report_date: addDays(t, -2), zone: 'hombro', side: 'Derecho', intensity: 4, notes: 'En el saque después de 1 hora de juego', resolved_at: null, reviewed_at: null, created_at: iso });
}
