'use strict';
/* =====================================================================
   Deuce Point v10 · Alimentación
   Exclusiones al reemplazar, costo por supermercado y opciones económicas,
   hogar en la lista de compras, viajes, refrigerios de torneo, medidas caseras,
   clima e hidratación, alcohol, fibra/sodio/azúcar, ajuste por tendencia de peso
   y escáner con porción equivalente.
   ===================================================================== */

/* ---------- 12. Exclusiones de la valoración (alergias, restricciones, «no me gusta») ---------- */
S.excl = { cid: null, fn: null };
async function loadExcl(cid) {
  if (S.excl.cid === cid) return;
  let d = null;
  if (cid === S.profile.id) d = S.intake && S.intake.data;
  else d = ((await DB.select('intakes', { eq: { client_id: cid } }).catch(() => []))[0] || {}).data;
  S.excl = { cid, fn: d && typeof exclusionTest === 'function' ? exclusionTest(d) : null };
}
const isExcl = f => !!(f && S.excl.fn && S.excl.fn(f));
const exclTag = f => isExcl(f) ? ' <span class="tag bad-t">Excluido en la valoración</span>' : '';

/* ---------- 1 y 2. Supermercados, costo por porción y opciones económicas ---------- */
const storeList = () => String((S.settings && S.settings.stores) || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6);
const priceAt = (f, st) => st ? num((f.prices || {})[st]) || 0 : num(f.price_kg);
const bestPrice = f => { const v = [num(f.price_kg), ...Object.values(f.prices || {}).map(num)].filter(x => x > 0); return v.length ? Math.min(...v) : 0; };
const portionCost = (f, g) => { const p = bestPrice(f); return p ? p * num(g) / 1000 : 0; };
function eqCostTag(e) { const c = portionCost(e.food, e.grams); return c ? ` <span class="tag">$${fmtInt(Math.round(c / 50) * 50)}</span>` : ''; }
function eqCostNote(f, g, eqs) {
  const c0 = portionCost(f, g); if (!c0) return '';
  const cheaper = eqs.filter(e => !isExcl(e.food) && portionCost(e.food, e.grams) && portionCost(e.food, e.grams) < c0 * 0.8).sort((a, b) => portionCost(a.food, a.grams) - portionCost(b.food, b.grams))[0];
  return `<p class="small muted">Costo de la porción del plan: $${fmtInt(Math.round(c0 / 50) * 50)}.${cheaper ? ` Opción económica: <b>${esc(cheaper.food.name)} ${fmtN(cheaper.grams)} g</b> ($${fmtInt(Math.round(portionCost(cheaper.food, cheaper.grams) / 50) * 50)}).` : ''}</p>`;
}

/* ---------- 13. Personas del hogar en la lista de compras ---------- */
function famState() { try { return Object.assign({ a: 0, k: 0 }, JSON.parse(lsGet('dp_family', '{}'))); } catch (e) { return { a: 0, k: 0 }; } }
const famFactor = () => { const s = famState(); return 1 + num(s.a) + num(s.k) * 0.6; };

function comprasExtraHtml(rows, days) {
  const fs = famState(); let h = '';
  h += `<div class="card no-print"><h3>Hogar</h3><p class="small muted">Para cocinar para la casa: cada adulto adicional suma una porción igual a la del plan y cada niño el 60 %. Es una aproximación; ajusta según el apetito de cada persona.</p>
    <div class="rex-grid"><label><span>Adultos adicionales</span><input class="input" type="number" min="0" max="8" data-fam="a" value="${num(fs.a)}"></label><label><span>Niños</span><input class="input" type="number" min="0" max="8" data-fam="k" value="${num(fs.k)}"></label></div></div>`;
  const stores = storeList();
  if (stores.length && rows.length) {
    const tot = stores.map(st => { let t = 0, miss = 0; rows.forEach(r => { const p = priceAt(r.f, st); if (p) t += r.shown / 1000 * p; else miss++; }); return { st, t, miss }; });
    const full = tot.filter(x => !x.miss && x.t); const best = (full.length ? full : tot.filter(x => x.t)).sort((a, b) => a.t - b.t)[0];
    // Compra combinada: cada alimento en el supermercado más barato
    let mix = 0, mixMiss = 0; const where = {};
    rows.forEach(r => { const ps = stores.map(st => [st, priceAt(r.f, st)]).filter(x => x[1]); if (!ps.length) { mixMiss++; return; } const b = ps.sort((a, b) => a[1] - b[1])[0]; mix += r.shown / 1000 * b[1]; (where[b[0]] = where[b[0]] || []).push(r.name); });
    h += `<div class="card"><h3>Comparar supermercados</h3>${tot.some(x => x.t) ? hbars(tot.map(x => ({ label: x.st, value: x.t, text: x.t ? '$' + fmtInt(Math.round(x.t / 100) * 100) + (x.miss ? ` (${x.miss} sin precio)` : '') : 'sin precios' }))) : '<p class="small muted">Sin precios por supermercado todavía.</p>'}
      ${best ? `<p class="small">Más económico para la lista completa: <b>${esc(best.st)}</b>.</p>` : ''}
      ${mix && Object.keys(where).length > 1 ? `<p class="small">Comprando cada alimento donde es más barato: <b>$${fmtInt(Math.round(mix / 100) * 100)}</b>${mixMiss ? ` (${mixMiss} sin precio)` : ''}. ${Object.entries(where).map(([st, ns]) => `${esc(st)}: ${esc(ns.slice(0, 6).join(', '))}${ns.length > 6 ? '…' : ''}`).join(' · ')}.</p>` : ''}
      ${isCoach() ? `<button class="btn sm no-print" data-act="spEdit">Editar precios por supermercado</button><div id="sp-box"></div>` : ''}
      <p class="small muted">Los supermercados se configuran en Ajustes › Supermercados y los precios en Biblioteca › Alimentos o aquí.</p></div>`;
  } else if (isCoach() && !stores.length) h += `<p class="small muted no-print">Para comparar supermercados, escribe sus nombres en Ajustes › Supermercados.</p>`;
  // Opciones económicas: alimentos de mayor costo con un equivalente del mismo grupo al menos 25 % más barato
  const sugg = [];
  rows.filter(r => r.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 12).forEach(r => {
    if (sugg.length >= 5) return;
    const eq = equivalents(r.f, r.g, 0).filter(e => !isExcl(e.food) && bestPrice(e.food) > 0).map(e => ({ e, c: bestPrice(e.food) * e.grams / 1000 })).filter(x => x.c < r.cost * 0.75).sort((a, b) => a.c - b.c)[0];
    if (eq) sugg.push(`<li><b>${esc(r.f.name)}</b> → ${esc(eq.e.food.name)}: ahorro aproximado de $${fmtInt(Math.round((r.cost - eq.c) / 100) * 100)} en ${days} días.</li>`);
  });
  if (sugg.length) h += `<div class="card"><h3>Opciones para ahorrar</h3><ul class="plain">${sugg.join('')}</ul><p class="small muted">Equivalentes del mismo grupo con la misma cantidad del nutriente principal. Se reemplazan en Hoy con «⇄» en cada alimento.</p></div>`;
  return h;
}
async function comprasChange(t) {
  if (t.dataset.fam) { const s = famState(); s[t.dataset.fam] = Math.max(0, Math.min(8, Math.round(num(t.value)))); lsSet('dp_family', JSON.stringify(s)); return true; }
  if (t.dataset.sp) { const [fid, st] = t.dataset.sp.split('|'); const f = S.foodById[fid]; const pr = Object.assign({}, f.prices || {}); if (num(t.value)) pr[st] = num(t.value); else delete pr[st]; await DB.update('foods', fid, { prices: pr }); f.prices = pr; toast('Precio guardado'); return false; }
  return false;
}
const comprasHandlers = () => ({
  spEdit: () => {
    const box = $('#sp-box'); if (!box) return; if (box.innerHTML) { box.innerHTML = ''; return; }
    const ids = [...document.querySelectorAll('.shop input[data-f]')].map(x => x.dataset.f); const stores = storeList();
    box.innerHTML = `<div class="tbl-x"><table class="tbl"><thead><tr><th>Alimento ($/kg)</th>${stores.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>${ids.map(id => { const f = S.foodById[id]; return f ? `<tr><td>${esc(f.name)}</td>${stores.map(st => `<td><input class="input price-in" inputmode="numeric" data-sp="${id}|${esc(st)}" value="${num((f.prices || {})[st]) || ''}"></td>`).join('')}</tr>` : ''; }).join('')}</tbody></table></div>`;
  }
});

/* ---------- 15. Medidas caseras colombianas ---------- */
const HOME_DEF = `Pocillo (200 ml) | 200 | leche, kumis, jugo, bebida, kefir, caldo, sopa, crema de
Cucharón | 90 | arroz, pasta, quinua, frijol, frijol, lenteja, garbanzo, arveja, mazorca, mote
Taza de verdura cocida | 150 | brocoli, zanahoria, habichuela, ahuyama, calabacin, coliflor, berenjena
Taza de verdura cruda | 60 | lechuga, espinaca, ensalada, repollo, pepino, tomate
Taza de fruta picada | 150 | papaya, pina, melon, sandia, fresa, mango, mora
Cuchara sopera | 14 | aceite, mantequilla de mani, miel, crema de leche, mayonesa
Cucharada | 10 | avena, granola, chia, linaza, mani, almendra, azucar, panela, cacao
Tajada de pan | 25 | pan tajado
Tajada de queso | 20 | queso
Tajada de jamón | 15 | jamon
Unidad | 50 | huevo`;
function homeMeasures() {
  return String((S.settings && S.settings.home_measures) || HOME_DEF).split('\n').map(l => l.split('|').map(x => x.trim())).filter(x => x.length >= 3 && num(x[1]) > 0)
    .map(([n, g, kw]) => ({ n, g: num(g), kw: kw.split(',').map(k => norm(k.trim())).filter(Boolean) }));
}
function caseraText(f, g) {
  if (!f) return ''; if (f.unit_name && num(f.unit_grams)) return unitText(f, g);
  const n = norm(f.name); const m = homeMeasures().find(x => x.kw.some(k => n.includes(k))); if (!m) return '';
  const u = Math.max(0.25, Math.round(num(g) / m.g * 4) / 4);
  return `≈ ${fmtFrac(u)} ${u > 1 ? plural(m.n.replace(/\s*\(.*\)$/, '').toLowerCase()) : m.n.replace(/\s*\(.*\)$/, '').toLowerCase()}`;
}

/* ---------- 6. Escáner: porción equivalente y alergias ---------- */
function scanExtraHtml(prod, o) {
  let h = '';
  const al = (prod.allergens || []).filter(Boolean); const fake = { name: prod.name + ' ' + (prod.ingredients || '') };
  if (isExcl(fake)) h += `<div class="warn-box small">El producto o sus ingredientes coinciden con una exclusión de tu valoración (alergias, restricciones o alimentos que no consumes). Revisa la etiqueta antes de consumirlo.</div>`;
  if (al.length) h += `<p class="small"><b>Alérgenos declarados:</b> ${esc(al.join(', '))}.</p>`;
  const m = o && o.meal && (o.meal.options || []).length ? mealAvg(o.meal) : null;
  if (m && m.kcal && prod.kcal) {
    const gK = roundG(m.kcal / prod.kcal * 100); const gP = prod.protein >= 5 && m.protein ? roundG(m.protein / prod.protein * 100) : 0;
    h += `<div class="card flat small"><b>Equivalencia con ${esc(o.meal.name)} del plan</b> (${fmtInt(m.kcal)} kcal · P ${fmtInt(m.protein)} g)<br>
      Para cubrir las calorías de la comida: <b>${fmtN(gK)} g</b>${gK > 0 ? ` <button class="linkbtn" data-act="bcUse" data-g="${gK}">usar</button>` : ''}${gP ? `<br>Para cubrir la proteína de la comida: <b>${fmtN(gP)} g</b> <button class="linkbtn" data-act="bcUse" data-g="${gP}">usar</button>` : ''}</div>`;
  }
  if (prod.sodium || prod.sugar || prod.fiber) h += `<p class="small muted">Por 100 g: ${[prod.fiber ? `fibra ${fmtN(prod.fiber)} g` : '', prod.sugar ? `azúcares ${fmtN(prod.sugar)} g` : '', prod.sodium ? `sodio ${fmtInt(prod.sodium)} mg` : ''].filter(Boolean).join(' · ')}.</p>`;
  return h;
}

/* ---------- 11. Fibra, sodio y azúcar del día ---------- */
function microTotals(logs) {
  const r = { fiber: 0, sodium: 0, sugar: 0, nF: 0, nNa: 0, nSu: 0, n: 0 };
  logs.forEach(l => { r.n++; const f = l.food_id && foodOf(l.food_id); if (!f) return; const k = num(l.grams) / 100; r.fiber += num(f.fiber) * k; r.nF++; if (f.sodium_mg != null) { r.sodium += num(f.sodium_mg) * k; r.nNa++; } if (f.sugar_g != null) { r.sugar += num(f.sugar_g) * k; r.nSu++; } });
  return r;
}
function microCardHtml(c) {
  if (!c.nut || !c.logs.length || S.needsV10) return '';
  const m = microTotals(c.logs); const kc = c.t ? c.t.kcal : 2000; const fT = Math.round(kc / 1000 * 14);
  return `<details class="card micro"><summary><b>Fibra, sodio y azúcares</b> <small class="muted">fibra ${fmtInt(m.fiber)} / ${fT} g</small></summary>
    ${macroBar('Fibra', m.fiber, fT, 'g', 'c')}
    ${m.nNa ? macroBar('Sodio (límite)', m.sodium, 2000, 'mg', 'f') : ''}${m.nSu ? `<p class="small">Azúcares totales: <b>${fmtInt(m.sugar)} g</b>.</p>` : ''}
    <p class="small muted">Fibra recomendada: 14 g por cada 1.000 kcal. Sodio: máximo 2.000 mg al día en población general (OMS); los deportistas con sudoración alta pueden necesitar más según la prueba de sudoración. Calculado con ${m.nF} de ${m.n} registros del día${m.nNa < m.nF ? `; ${m.nF - m.nNa} alimentos sin dato de sodio` : ''}.</p></details>`;
}

/* ---------- 9. Clima del día e hidratación ---------- */
function geoGet() { try { return JSON.parse(lsGet('dp_geo', 'null')); } catch (e) { return null; } }
async function weatherToday(g) {
  const k = 'dp_wx_' + todayStr() + '_' + r1(g.lat) + '_' + r1(g.lon);
  try { const c = JSON.parse(lsGet(k, 'null')); if (c) return c; } catch (e) { }
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&daily=temperature_2m_max,apparent_temperature_max,relative_humidity_2m_mean&timezone=auto&forecast_days=1`);
  if (!r.ok) throw new Error('Sin datos del clima');
  const j = await r.json(); const d = j.daily || {};
  const out = { t: num((d.temperature_2m_max || [])[0]), at: num((d.apparent_temperature_max || [])[0]), rh: num((d.relative_humidity_2m_mean || [])[0]) };
  lsSet(k, JSON.stringify(out)); return out;
}
function heatExtra(at, active) {
  if (at < 25) return 0;
  if (at < 30) return active ? 500 : 250;
  if (at < 35) return active ? 1000 : 500;
  return active ? 1500 : 750;
}
async function weatherCardHtml(c) {
  if (!c.own || !c.isToday || S.needsV10 || (typeof modOn === 'function' && !modOn('clima', c.cid))) return '';
  const g = geoGet();
  if (!g) return `<div class="card wx"><b>Hidratación según el clima</b><small class="muted">Indica tu ciudad para ajustar la meta de agua en días de calor.</small><div class="vid-in"><input class="input" id="wx-c" placeholder="Ciudad" value="${esc((S.intake && S.intake.data && S.intake.data.ciudad) || '')}"><button class="btn sm" data-act="wxSet">Guardar</button></div></div>`;
  let w; try { w = await weatherToday(g); } catch (e) { return ''; }
  const active = (c.choices.__day || 'train') !== 'rest';
  const ex = heatExtra(w.at || w.t, active); const added = num(c.choices.__wx);
  return `<div class="card wx"><b>${esc(g.name)} · máxima ${fmtInt(w.t)} °C</b><br><small class="muted">Sensación térmica ${fmtInt(w.at)} °C · humedad ${fmtInt(w.rh)} %</small>
    ${ex ? `<p class="small">Día caluroso: se sugieren <b>${fmtInt(ex)} ml</b> adicionales de agua${active ? ' por la actividad del día' : ''}. Incluye sodio (bebida hidratante o sales) si entrenas más de 60 minutos.</p>
      ${added ? `<p class="small muted">Sumados ${fmtInt(added)} ml a la meta de hoy. <button class="linkbtn" data-act="wxAdd" data-v="0">Quitar</button></p>` : `<button class="btn sm" data-act="wxAdd" data-v="${ex}">Sumar ${fmtInt(ex)} ml a mi meta de hoy</button>`}` : '<p class="small muted">Temperatura moderada: se mantiene la meta de agua del plan.</p>'}
    <p class="small muted">Estimación general por temperatura (Open-Meteo). Para tu cantidad exacta por hora de ejercicio, usa la prueba de sudoración. <button class="linkbtn" data-act="wxReset">Cambiar ciudad</button></p></div>`;
}
const weatherHandlers = c => ({
  wxSet: async () => {
    const q = ($('#wx-c') || {}).value || ''; if (!q.trim()) return toast('Escribe la ciudad', 'error');
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=1&language=es`).then(x => x.json()).catch(() => null);
    const p = r && r.results && r.results[0]; if (!p) return toast('Ciudad no encontrada', 'error');
    lsSet('dp_geo', JSON.stringify({ name: p.name, lat: p.latitude, lon: p.longitude })); c.rerender();
  },
  wxReset: () => { lsSet('dp_geo', 'null'); c.rerender(); },
  wxAdd: async el => { await setChoice(c.cid, c.date, ch => { if (num(el.dataset.v)) ch.__wx = num(el.dataset.v); else delete ch.__wx; }); c.rerender(); }
});

/* ---------- 10. Alcohol ---------- */
const DRINKS = [['cerveza', 'Cerveza', 330, 4.5, 13], ['cerveza_l', 'Cerveza light', 330, 4, 5], ['vino', 'Vino', 150, 12, 4], ['aguardiente', 'Aguardiente (trago)', 30, 29, 2], ['ron', 'Ron (trago)', 45, 35, 0], ['whisky', 'Whisky, vodka o tequila (trago)', 45, 40, 0], ['coctel', 'Cóctel', 200, 9, 20]];
const drinkInfo = d => { const g = d[2] * d[3] / 100 * 0.789; return { g, kcal: g * 7 + d[4] * 4 }; };
function alcoholModal(c) {
  const n = {};
  const draw = () => {
    const tot = DRINKS.reduce((a, d) => { const k = n[d[0]] || 0; const x = drinkInfo(d); return { g: a.g + x.g * k, kcal: a.kcal + x.kcal * k }; }, { g: 0, kcal: 0 });
    modal(`${modalHead('Registrar alcohol')}<p class="small muted">Cada gramo de alcohol aporta 7 kcal. Una bebida estándar contiene 10 g de alcohol.</p>
      ${DRINKS.map(d => { const x = drinkInfo(d); return `<div class="well-row"><span>${esc(d[1])} <small class="muted">${d[2]} ml · ${fmtInt(x.kcal)} kcal</small></span><div class="row-btns"><button class="btn sm" data-act="dk" data-k="${d[0]}" data-d="-1">−</button><b>${n[d[0]] || 0}</b><button class="btn sm" data-act="dk" data-k="${d[0]}" data-d="1">+</button></div></div>`; }).join('')}
      <p class="small"><b>Total: ${fmtInt(tot.kcal)} kcal · ${fmtN(tot.g)} g de alcohol (${fmtN(tot.g / 10)} bebidas estándar)</b></p>
      <p class="small muted">El alcohol reduce la síntesis de proteína muscular, la calidad del sueño y la rehidratación. Si bebes, alterna con agua y no lo combines con la comida posterior al entrenamiento.</p>
      <button class="btn primary block" data-act="dkSave">Registrar</button>`, h);
  };
  const h = { click: {
    dk: el => { n[el.dataset.k] = Math.max(0, (n[el.dataset.k] || 0) + +el.dataset.d); draw(); },
    dkSave: async () => {
      const rows = DRINKS.filter(d => n[d[0]]).map(d => { const x = drinkInfo(d); const k = n[d[0]]; return { name: `${d[1]} × ${k}`, grams: d[2] * k, kcal: x.kcal * k, protein: 0, carbs: d[4] * k, fat: 0, g: x.g * k, k }; });
      if (!rows.length) return toast('Indica al menos una bebida', 'error');
      await insertLogRows(c.cid, c.date, { id: null, name: 'Alcohol' }, rows);
      await setChoice(c.cid, c.date, ch => { const a = ch.__alc || { g: 0, n: 0 }; ch.__alc = { g: r1(num(a.g) + rows.reduce((s, r) => s + r.g, 0)), n: num(a.n) + rows.reduce((s, r) => s + r.k, 0) }; });
      closeModal(); toast('Alcohol registrado'); c.rerender();
    }
  } };
  draw();
}

/* ---------- 14. Refrigerios para torneo ---------- */
const SNACKS = [
  ['Banano mediano', '1 unidad (≈ 120 g sin cáscara)', 27, 1, 'antes,durante,entre'], ['Bocadillo de guayaba', '1 barra (≈ 35 g)', 25, 0, 'durante,entre'],
  ['Galletas de arroz', '3 unidades (≈ 27 g)', 21, 2, 'antes,entre'], ['Uvas pasas', '1 puñado (30 g)', 24, 1, 'durante,entre'],
  ['Bebida hidratante (6 %)', '500 ml', 30, 0, 'durante'], ['Gel deportivo', '1 sobre', 22, 0, 'durante'],
  ['Pan blanco con mermelada', '2 tajadas y 1 cucharada', 35, 5, 'antes,entre'], ['Dátiles', '3 unidades (≈ 24 g)', 18, 1, 'durante,entre'],
  ['Barra de cereal', '1 unidad (≈ 25 g)', 17, 2, 'antes,entre'], ['Compota de fruta', '1 unidad (≈ 113 g)', 20, 0, 'durante,entre'],
  ['Sándwich de jamón y queso', '1 unidad', 28, 15, 'entre,despues'], ['Leche chocolatada', '250 ml', 26, 8, 'despues'],
  ['Yogur bebible', '200 ml', 26, 6, 'despues,entre'], ['Batido de proteína con banano', '30 g de proteína + 1 banano', 30, 25, 'despues']];
const SN_WHEN = [['antes', 'Antes del partido (60–90 min)'], ['durante', 'Durante el partido (cambios de lado)'], ['entre', 'Entre partidos del mismo día'], ['despues', 'Después del partido (recuperación)']];
async function vSnacks() {
  const w = typeof latestWeight === 'function' ? await latestWeight(S.profile.id).catch(() => 0) : 0;
  let hrs = num(lsGet('dp_sn_h', '2')) || 2;
  const draw = () => {
    const dur = hrs > 1 ? [Math.round(30 * hrs), Math.round(60 * hrs)] : null;
    paint(`<a class="linkbtn" href="#/hoy">← Hoy</a>
      <div class="card"><h3>Calculadora del partido</h3><label class="field"><span>Duración esperada (h)</span><select class="input" id="sn-h">${[1, 1.5, 2, 2.5, 3, 4].map(v => `<option value="${v}"${v === hrs ? ' selected' : ''}>${String(v).replace('.', ',')}</option>`).join('')}</select></label>
        <p class="small">${dur ? `Durante el partido: <b>${dur[0]}–${dur[1]} g de carbohidratos</b> en total (30–60 g por hora), repartidos en los cambios de lado.` : 'En partidos de hasta 1 hora no se requieren carbohidratos durante el juego; basta con el agua y la comida previa.'}
        ${w ? `<br>Recuperación si juegas de nuevo en menos de 24 h: <b>${fmtInt(w * 1)}–${fmtInt(w * 1.2)} g de carbohidratos por hora</b> durante las primeras 4 horas y <b>${fmtInt(w * 0.3)} g de proteína</b> en la primera comida.` : ''}</p>
        <p class="small muted">Recomendaciones de la posición conjunta ACSM, Academy of Nutrition and Dietetics y Dietitians of Canada (2016). Prueba los refrigerios en los entrenamientos, no por primera vez en el torneo.</p></div>
      ${SN_WHEN.map(([k, l]) => `<div class="card"><h3>${esc(l)}</h3><table class="tbl"><thead><tr><th>Refrigerio</th><th>Porción</th><th class="n">Carbs</th><th class="n">Prot.</th></tr></thead><tbody>${SNACKS.filter(s => s[4].split(',').includes(k)).map(s => `<tr><td>${esc(s[0])}</td><td><small>${esc(s[1])}</small></td><td class="n">${s[2]} g</td><td class="n">${s[3]} g</td></tr>`).join('')}</tbody></table></div>`).join('')}
      <p class="small muted">Valores aproximados de productos comunes; verifica la etiqueta de cada marca.</p>`, { change: t => { if (t.id === 'sn-h') { hrs = num(t.value); lsSet('dp_sn_h', String(hrs)); draw(); } } }, 'Refrigerios de torneo');
  };
  draw();
}

/* ---------- 3. Modo viaje ---------- */
function travelKit(tgt) {
  const pick = n => S.foods.find(f => f.name === n);
  const sets = [['Sin refrigeración', ['Proteína whey (polvo)', 'Galletas de arroz', 'Almendras']], ['Con atún en lata', ['Atún en agua escurrido', 'Galletas de arroz', 'Maní']], ['Desayuno o merienda en el hotel', ['Proteína whey (polvo)', 'Avena en hojuelas', 'Mantequilla de maní']]];
  return sets.map(([l, ns]) => {
    const fs = ns.map(pick); if (fs.some(x => !x)) return null;
    const A = [0, 1, 2].map(k => fs.map(f => num([f.protein, f.carbs, f.fat][k]) / 100));
    const x = typeof solve3 === 'function' ? solve3(A, [tgt.protein, tgt.carbs, tgt.fat]) : null;
    if (!x) return null; const g = x.map(v => Math.max(0, roundG(v)));
    const m = fs.reduce((a, f, i) => addM(a, macrosFor(f, g[i])), ZERO());
    return { l, items: fs.map((f, i) => ({ f, g: g[i] })).filter(o => o.g > 0), m };
  }).filter(Boolean);
}
async function vViaje() {
  const plan = await activePlanFor(S.profile.id);
  if (!plan) return paint('<div class="card empty"><p>Necesitas un plan nutricional activo para preparar el viaje.</p></div>', {}, 'Viaje');
  const v = Object.assign({ d: 3, k: 'avion', kitchen: false, bf: true }, (() => { try { return JSON.parse(lsGet('dp_trip', '{}')); } catch (e) { return {}; } })());
  const snacks = plan.meals.filter(m => !/desayuno|almuerzo|cena|comida principal/i.test(m.name));
  const draw = () => {
    const kits = snacks.map(m => ({ m, t: mealAvg(m) })).filter(x => x.t.kcal > 0).map(x => ({ m: x.m, t: x.t, kits: travelKit(x.t) }));
    const need = {}; kits.forEach(k => { const best = k.kits[0]; if (best) best.items.forEach(o => { need[o.f.name] = (need[o.f.name] || 0) + o.g * v.d; }); });
    const tips = {
      avion: ['Aeropuerto: almuerzo o cena con proteína a la plancha, un carbohidrato y ensalada; evita los combos de comida rápida.', 'En el vuelo: agua cada hora (250 ml), sin alcohol; lleva los refrigerios del kit en el equipaje de mano (la proteína en polvo en un recipiente cerrado).', 'Cambio de horario: mantén los horarios de comida del destino desde el primer día.'],
      carretera: ['Lleva una nevera pequeña con agua, frutas y los refrigerios del kit.', 'Paradas en carretera: prefiere asaderos (pollo sin piel, papa salada, ensalada) sobre fritos.', 'Pausas activas de 5 minutos cada 2 horas de viaje.'],
      torneo: ['Identifica antes de viajar un supermercado y dos restaurantes cerca del hotel o del club.', 'Lleva refrigerios para todo el torneo: la oferta en los clubes suele ser limitada.', 'Agua embotellada y alimentos bien cocidos en destinos con riesgo sanitario. Consulta los refrigerios de torneo en la app.']
    }[v.k];
    paint(`<a class="linkbtn" href="#/hoy">← Hoy</a>
      <div class="card"><h3>Datos del viaje</h3><div class="rex-grid three"><label><span>Días</span><input class="input" type="number" min="1" max="30" id="tv-d" value="${v.d}"></label><label><span>Tipo</span><select class="input" id="tv-k">${[['avion', 'Avión'], ['carretera', 'Carretera'], ['torneo', 'Torneo fuera de la ciudad']].map(([k, l]) => `<option value="${k}"${v.k === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label><span>Hotel</span><select class="input" id="tv-h"><option value="bf"${v.bf ? ' selected' : ''}>Con desayuno</option><option value="kit"${v.kitchen ? ' selected' : ''}>Con cocina</option><option value="no"${!v.bf && !v.kitchen ? ' selected' : ''}>Solo alojamiento</option></select></label></div></div>
      <div class="card"><h3>Recomendaciones</h3><ul class="plain">${tips.map(x => `<li>${esc(x)}</li>`).join('')}
        ${v.bf ? '<li>Desayuno de hotel: huevos (2–3) o yogur con fruta, una porción de pan, arepa o avena y fruta; café o té sin azúcar.</li>' : ''}
        ${v.kitchen ? '<li>Con cocina: compra en el supermercado los alimentos de tu lista de compras para los días del viaje.</li>' : '<li>Sin cocina: almuerzo y cena en restaurante con la guía «Comer fuera de casa».</li>'}</ul>
        <div class="row-btns"><a class="btn sm" href="#/fuera">Comer fuera de casa</a><a class="btn sm" href="#/snacks">Refrigerios de torneo</a>${v.kitchen ? `<a class="btn sm" href="#/compras/${plan.id}/${Math.min(14, v.d) > 7 ? 14 : Math.min(14, v.d) > 3 ? 7 : 3}">Lista de compras</a>` : ''}</div></div>
      ${kits.map(k => `<div class="card"><h3>${esc(k.m.name)} <small class="muted">plan: ${macroLine(k.t)}</small></h3>${k.kits.map(o => `<p class="small"><b>${esc(o.l)}:</b> ${o.items.map(i => `${esc(i.f.name)} ${fmtN(i.g)} g${unitText(i.f, i.g) ? ' (' + esc(unitText(i.f, i.g).replace('≈ ', '')) + ')' : ''}`).join(' + ')}<br><small class="muted">${macroLine(o.m)}</small></p>`).join('') || '<p class="small muted">Sin combinación posible con los alimentos de la base.</p>'}</div>`).join('')}
      ${Object.keys(need).length ? `<div class="card"><h3>Para empacar (${v.d} ${v.d === 1 ? 'día' : 'días'})</h3><ul class="plain">${Object.entries(need).map(([n, g]) => `<li>${esc(n)}: <b>${g >= 1000 ? fmtN(g / 1000) + ' kg' : fmtInt(Math.ceil(g / 10) * 10) + ' g'}</b></li>`).join('')}</ul><p class="small muted">Cantidades para los refrigerios con la primera combinación de cada uno. Agrega fruta fresca que viaje bien (banano, manzana, mandarina).</p></div>` : ''}
      <button class="btn no-print" data-act="print">Imprimir / PDF</button>`, {
      change: t => { if (t.id === 'tv-d') v.d = Math.max(1, Math.min(30, Math.round(num(t.value)) || 1)); if (t.id === 'tv-k') v.k = t.value; if (t.id === 'tv-h') { v.bf = t.value === 'bf'; v.kitchen = t.value === 'kit'; } lsSet('dp_trip', JSON.stringify(v)); draw(); },
      click: { print: () => window.print() }
    }, 'Viaje');
  };
  draw();
}

/* ---------- 7. Ajuste por tendencia de peso (pendientes del entrenador) ---------- */
function weightTrend(rows) {
  const pts = rows.filter(b => num(b.weight_kg) > 0).map(b => [daysBetween(rows[0].log_date, b.log_date), num(b.weight_kg)]);
  if (pts.length < 4 || pts[pts.length - 1][0] - pts[0][0] < 14) return null;
  const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0), sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx); const a = (sy - b * sx) / n; const x1 = pts[n - 1][0];
  return { start: a, end: a + b * x1, days: x1 };
}
async function inboxTrendRows(byId) {
  if (!isCoach() || S.needsV10) return [];
  const since = addDays(todayStr(), -28);
  const [bodies, its, plans, cks] = await Promise.all([DB.select('body_logs', { gte: { log_date: since }, order: 'log_date' }), DB.select('intakes', { eq: { status: 'approved' } }), DB.select('nutrition_plans', { eq: { active: true } }), DB.select('checkins', { eq: { status: 'pending' } })]);
  const withPlan = new Set(plans.filter(p => !p.variant_of).map(p => p.client_id)); const pendCk = new Set(cks.map(c => c.client_id)); const log = S.settings.adj_log || {};
  const rows = [];
  for (const it of its) {
    const cid = it.client_id; if (!byId[cid] || !withPlan.has(cid) || pendCk.has(cid)) continue;
    if (log[cid] && daysBetween(log[cid], todayStr()) < 14) continue;
    const tr = weightTrend(bodies.filter(b => b.client_id === cid)); if (!tr) continue;
    const goal = (it.calc && it.calc.goal) || 'mant';
    const s = suggestAdjust(goal, { weight_kg: tr.end, check_date: todayStr() }, { weight_kg: tr.start, date: addDays(todayStr(), -tr.days) }, null);
    if (!s.delta) continue;
    S.trendSug = S.trendSug || {}; S.trendSug[cid] = s;
    rows.push(`<div class="ib-row"><span class="ib-tag r">Ajuste</span><a class="ib-n" href="#/asesorado/${cid}/seguimiento">${esc(byId[cid].full_name || '')}</a><span class="ib-m">${esc(fmtN(s.wk))} %/sem <button class="chip" data-act="trApply" data-id="${cid}">${s.delta > 0 ? '+' : '−'}${Math.abs(s.delta)} kcal</button><button class="chip" data-act="trSkip" data-id="${cid}">Omitir</button></span></div>`);
  }
  return rows;
}
const trendHandlers = () => ({
  trApply: async el => {
    const cid = el.dataset.id; const s = (S.trendSug || {})[cid]; if (!s) return;
    if (!confirm(`${s.text}\n\n¿Aplicar ${s.delta > 0 ? '+' : ''}${s.delta} kcal al plan activo y avisar al asesorado?`)) return;
    await applyKcalDelta(cid, s.delta);
    await DB.insert('messages', { client_id: cid, sender_id: S.profile.id, body: `Ajusté tu plan ${s.delta > 0 ? 'aumentando' : 'reduciendo'} ${Math.abs(s.delta)} kcal según la tendencia de tu peso de las últimas semanas. Las porciones ya están actualizadas en Hoy.` }).catch(() => { });
    await saveSettings({ adj_log: Object.assign({}, S.settings.adj_log || {}, { [cid]: todayStr() }) }); toast('Plan ajustado'); route();
  },
  trSkip: async el => { await saveSettings({ adj_log: Object.assign({}, S.settings.adj_log || {}, { [el.dataset.id]: todayStr() }) }); route(); }
});

/* ---------- Registro de puntos de extensión ---------- */
HOOKS.hoy.push(
  { pos: 'afterSum', html: async c => { await loadExcl(c.cid).catch(() => { }); const a = c.choices.__alc; return (a && num(a.g) ? `<p class="small muted">Alcohol registrado: ${fmtN(a.g)} g (${fmtN(num(a.g) / 10)} bebidas estándar).</p>` : '') + microCardHtml(c); } },
  { pos: 'afterWater', html: weatherCardHtml, click: weatherHandlers },
  { pos: 'quick', html: async c => c.own && !S.needsV10 ? '<button class="btn sm" data-act="alc">Alcohol</button><a class="btn sm" href="#/viaje">Viaje</a>' : '', click: c => ({ alc: () => alcoholModal(c) }) });
HOOKS.routes.viaje = vViaje; HOOKS.routes.snacks = vSnacks;
Object.assign(HOOKS.nav, { viaje: 'hoy', snacks: 'hoy' });
HOOKS.inbox.push(inboxTrendRows);
HOOKS.inboxClick.push({ click: trendHandlers });
HOOKS.ajustes.push({
  html: async () => S.needsV10 ? '' : `<div class="card"><h3>Supermercados</h3><label class="field"><span>Un supermercado por línea (máximo 6)</span><textarea class="input" rows="3" data-s="stores">${esc(S.settings.stores || '')}</textarea></label><p class="small muted">Cada alimento admite un precio por kg en cada supermercado (Biblioteca › Alimentos o Lista de compras). La lista de compras compara el total por supermercado y sugiere opciones para ahorrar.</p></div>
    <div class="card"><h3>Medidas caseras</h3><label class="field"><span>Una por línea: Medida | gramos | palabras del nombre del alimento</span><textarea class="input" rows="8" data-s="home_measures">${esc(S.settings.home_measures || HOME_DEF)}</textarea></label><p class="small muted">Se muestran cuando el asesorado elige «Casera» en Hoy. Si el alimento tiene medida casera propia (Biblioteca › Alimentos), se usa esa. Son aproximaciones: verifica con una gramera.</p></div>`
});
if (typeof MODULES !== 'undefined') MODULES.push(['clima', 'Hidratación según el clima']);
