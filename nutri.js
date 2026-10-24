'use strict';
/* =====================================================================
   Deuce Point · Módulo de nutrición
   Planes con opciones de menú, diario de alimentos, macros, agua,
   reemplazos equivalentes, lista de compras, peso y medidas, plantillas.
   Depende de las utilidades globales de app.js.
   ===================================================================== */

const FOOD_CATS = ['Proteínas', 'Lácteos', 'Cereales y tubérculos', 'Leguminosas', 'Frutas', 'Verduras', 'Grasas', 'Suplementos', 'Bebidas', 'Dulces y otros'];
// Nutriente de referencia para calcular equivalencias dentro de cada grupo
const CAT_KEY = { 'Proteínas': 'protein', 'Lácteos': 'kcal', 'Cereales y tubérculos': 'carbs', 'Leguminosas': 'carbs', 'Frutas': 'carbs', 'Verduras': 'kcal', 'Grasas': 'fat', 'Suplementos': 'protein', 'Bebidas': 'kcal', 'Dulces y otros': 'kcal' };
const KEY_LBL = { kcal: 'energía', protein: 'proteína', carbs: 'cantidad de carbohidratos', fat: 'cantidad de grasa' };
const DEFAULT_MEALS = [['Desayuno', '7:00'], ['Media mañana', '10:00'], ['Almuerzo', '13:00'], ['Merienda', '16:00'], ['Cena', '19:30']];
const ACTIVITY = [[1.2, 'Sedentario'], [1.375, 'Ligera (1–3 días/semana)'], [1.55, 'Moderada (3–5 días/semana)'], [1.725, 'Alta (6–7 días/semana)'], [1.9, 'Muy alta (doble sesión o competencia)']];
// Factores aproximados de peso cocido → peso crudo para la lista de compras
const RAW_FACTORS = [['Arroz', 0.35], ['Pasta', 0.42], ['Quinua', 0.33], ['Fríjol', 0.38], ['Lenteja', 0.33], ['Garbanzo', 0.45], ['pollo', 1.33], ['res', 1.33], ['cerdo', 1.3], ['Tilapia', 1.25], ['Salmón', 1.25], ['Camarón', 1.25], ['Hígado', 1.3]];

S.foods = []; S.foodById = {}; S.editOpt = {};

/* Estructura base de 5 comidas con 2 opciones (usada en la demo y como plan base de la generación automática) */
const NUTRI_BASE = [
  ['Desayuno', '7:00', 'Consumir dentro de la primera hora después de despertar.', [
    ['Opción 1', [['Huevo entero', 100], ['Arepa de maíz', 80], ['Queso campesino', 30], ['Papaya', 150]]],
    ['Opción 2', [['Avena en hojuelas', 50], ['Leche descremada', 250], ['Banano', 100], ['Proteína whey (polvo)', 30]]]]],
  ['Media mañana', '10:00', '', [
    ['Opción 1', [['Yogur griego natural sin azúcar', 170], ['Fresa', 100], ['Almendras', 15]]],
    ['Opción 2', [['Cuajada', 60], ['Mandarina', 180], ['Galletas de arroz', 18]]]]],
  ['Almuerzo', '13:00', 'Servir primero la ensalada. Preparaciones a la plancha, al horno o sudadas.', [
    ['Opción 1', [['Arroz blanco cocido', 150], ['Pechuga de pollo cocida', 150], ['Fríjol rojo cocido', 80], ['Lechuga', 50], ['Tomate', 80], ['Aguacate', 50], ['Aceite de oliva', 5]]],
    ['Opción 2', [['Papa cocida', 200], ['Carne de res magra cocida', 140], ['Brócoli cocido', 100], ['Arroz blanco cocido', 60], ['Aguacate', 50]]]]],
  ['Merienda', '16:00', 'En días de entrenamiento, consumir 60 a 90 minutos antes de la sesión.', [
    ['Opción 1', [['Pan tajado integral', 50], ['Atún en agua escurrido', 80], ['Manzana', 150]]],
    ['Opción 2', [['Kumis', 200], ['Galletas de arroz', 18], ['Mantequilla de maní', 16]]]]],
  ['Cena', '19:30', '', [
    ['Opción 1', [['Tilapia cocida', 150], ['Plátano maduro cocido', 100], ['Ensalada verde mixta', 120], ['Aceite de oliva', 5]]],
    ['Opción 2', [['Pechuga de pollo cocida', 130], ['Quinua cocida', 120], ['Espinaca', 60], ['Aguacate', 40]]]]]];


/* ---------- utilidades ---------- */
const pad2 = n => String(n).padStart(2, '0');
const dateStr = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const todayStr = () => dateStr(new Date());
const parseDay = s => new Date(s + 'T12:00:00');
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dateStr(d); };
const fmtDayLong = s => { const t = parseDay(s).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fmtInt = n => Math.round(num(n)).toLocaleString('es-CO');
const ZERO = () => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
const addM = (a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + (b.fiber || 0) });
const scaleM = (a, f) => ({ kcal: a.kcal * f, protein: a.protein * f, carbs: a.carbs * f, fat: a.fat * f, fiber: a.fiber * f });
const foodOf = id => S.foodById[id];
function macrosFor(f, g) { const k = num(g) / 100; return { kcal: num(f.kcal) * k, protein: num(f.protein) * k, carbs: num(f.carbs) * k, fat: num(f.fat) * k, fiber: num(f.fiber) * k }; }
const logM = l => ({ kcal: num(l.kcal), protein: num(l.protein), carbs: num(l.carbs), fat: num(l.fat), fiber: 0 });
const macroLine = m => `${fmtInt(m.kcal)} kcal · P ${fmtN(m.protein)} g · C ${fmtN(m.carbs)} g · G ${fmtN(m.fat)} g`;
function roundG(g) { g = num(g); if (g <= 0) return 0; if (g < 10) return Math.round(g * 2) / 2; if (g < 20) return Math.round(g); return Math.round(g / 5) * 5; }
function fmtFrac(u) {
  const w = Math.floor(u + 1e-9); const r = Math.round((u - w) * 4) / 4;
  if (r === 1) return String(w + 1);
  const fr = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[r] || '';
  return (w ? String(w) : '') + fr || '0';
}
const plural = s => s.split(' ').map(w => /ón$/.test(w) ? w.replace(/ón$/, 'ones') : /[aeiouáéíóú]$/i.test(w) ? w + 's' : w + 'es').join(' ');
function unitText(f, g) {
  if (!f || !f.unit_name || !num(f.unit_grams)) return '';
  const r = Math.round(num(g) / num(f.unit_grams) * 4) / 4;
  if (r < 0.25) return '';
  return '≈ ' + fmtFrac(r) + ' ' + (r > 1 ? plural(f.unit_name) : f.unit_name);
}
async function keepScroll(fn) { const y = window.scrollY; await fn(); window.scrollTo(0, y); }
const targetsOf = p => p ? { kcal: num(p.kcal), protein: num(p.protein_g), carbs: num(p.carbs_g), fat: num(p.fat_g) } : null;
function targetsLine(p) {
  if (!num(p.kcal)) return 'Sin objetivos definidos';
  return `${fmtInt(p.kcal)} kcal · P ${fmtInt(p.protein_g)} g · C ${fmtInt(p.carbs_g)} g · G ${fmtInt(p.fat_g)} g`;
}

async function loadFoods() {
  S.foods = await DB.select('foods', { order: 'name' });
  S.foods.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  S.foodById = Object.fromEntries(S.foods.map(f => [f.id, f]));
}

/* Equivalentes dentro del mismo grupo, con la misma cantidad del nutriente de referencia */
function equivalents(food, grams, n = 3) {
  const key = CAT_KEY[food.category] || 'kcal';
  const base = num(food[key]) * num(grams) / 100;
  if (base <= 0) return [];
  const prof = x => { const k = num(x.protein) * 4 + num(x.carbs) * 4 + num(x.fat) * 9 || 1; return [num(x.protein) * 4 / k, num(x.carbs) * 4 / k, num(x.fat) * 9 / k]; };
  const p0 = prof(food);
  const list = S.foods.filter(f => f.category === food.category && f.id !== food.id && num(f[key]) > 0).map(f => {
    const g = roundG(base * 100 / num(f[key])); const p = prof(f);
    return { food: f, grams: g, m: macrosFor(f, g), d: Math.abs(p[0] - p0[0]) + Math.abs(p[1] - p0[1]) + Math.abs(p[2] - p0[2]) };
  }).filter(e => e.grams > 0 && e.grams <= Math.max(600, num(grams) * 4)).sort((a, b) => a.d - b.d);
  return n ? list.slice(0, n) : list;
}

/* ---------- planes ---------- */
async function loadPlanFull(id) {
  const plan = (await DB.select('nutrition_plans', { eq: { id } }))[0];
  if (!plan) return null;
  const meals = await DB.select('plan_meals', { eq: { plan_id: id }, order: 'position' });
  const opts = await DB.select('plan_options', { inn: { meal_id: meals.map(m => m.id) }, order: 'position' });
  const items = await DB.select('plan_items', { inn: { option_id: opts.map(o => o.id) }, order: 'position' });
  meals.forEach(m => { m.options = opts.filter(o => o.meal_id === m.id); m.options.forEach(o => { o.items = items.filter(i => i.option_id === o.id); }); });
  plan.meals = meals;
  return plan;
}
const optionTotals = o => o.items.reduce((a, i) => { const f = foodOf(i.food_id); return f ? addM(a, macrosFor(f, i.grams)) : a; }, ZERO());
function mealAvg(m) { const os = m.options.filter(o => o.items.length); if (!os.length) return ZERO(); return scaleM(os.reduce((a, o) => addM(a, optionTotals(o)), ZERO()), 1 / os.length); }
const planAvgTotals = p => p.meals.reduce((a, m) => addM(a, mealAvg(m)), ZERO());
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const isCarbFood = f => !!f && !['Proteínas', 'Lácteos', 'Suplementos', 'Grasas', 'Verduras'].includes(f.category);
const cycles = p => !!p && p.rest_carbs_g != null && num(p.carbs_g) > num(p.rest_carbs_g);
/* Factor para las porciones del grupo de carbohidratos en días de descanso */
function restFactor(p) {
  if (!cycles(p)) return 1;
  const cg = p.meals.reduce((a, m) => { const os = m.options.filter(o => o.items.length); return a + (os.length ? os.reduce((b, o) => b + o.items.reduce((c, i) => { const f = foodOf(i.food_id); return isCarbFood(f) ? c + macrosFor(f, i.grams).carbs : c; }, 0), 0) / os.length : 0); }, 0);
  if (!cg) return 1;
  return Math.min(1, Math.max(0.2, (cg - (num(p.carbs_g) - num(p.rest_carbs_g))) / cg));
}
const restTargets = (p, t) => ({ kcal: t.kcal - (t.carbs - num(p.rest_carbs_g)) * 4, protein: t.protein, carbs: num(p.rest_carbs_g), fat: t.fat });
async function activePlanFor(cid) {
  const ps = await DB.select('nutrition_plans', { eq: { client_id: cid, active: true }, order: 'created_at', asc: false, limit: 1 });
  return ps[0] ? loadPlanFull(ps[0].id) : null;
}
async function deactivatePlans(cid, exceptId) {
  const ps = await DB.select('nutrition_plans', { eq: { client_id: cid, active: true } });
  for (const p of ps) if (p.id !== exceptId) await DB.update('nutrition_plans', p.id, { active: false });
}
async function createBlankPlan({ clientId = null, isTemplate = false, name }) {
  if (clientId) await deactivatePlans(clientId);
  const [p] = await DB.insert('nutrition_plans', { client_id: clientId, is_template: isTemplate, name, kcal: null, protein_g: null, carbs_g: null, fat_g: null, water_ml: 2500, notes: '', active: !isTemplate });
  for (let i = 0; i < DEFAULT_MEALS.length; i++) {
    const [m] = await DB.insert('plan_meals', { plan_id: p.id, name: DEFAULT_MEALS[i][0], time_label: DEFAULT_MEALS[i][1], instructions: '', position: i });
    await DB.insert('plan_options', { meal_id: m.id, name: 'Opción 1', position: 0 });
  }
  return p.id;
}
/* Copia un plan (a un asesorado o como plantilla) escalando porciones y objetivos a las kcal indicadas */
async function copyPlan(planId, o) {
  const p = await loadPlanFull(planId);
  const f = (num(o.kcal) && num(p.kcal)) ? num(o.kcal) / num(p.kcal) : 1;
  const sc = v => (v == null || v === '') ? null : Math.round(num(v) * f);
  if (o.clientId) await deactivatePlans(o.clientId);
  const [np] = await DB.insert('nutrition_plans', { client_id: o.clientId || null, is_template: !o.clientId, name: o.name || (o.clientId ? p.name.replace(/^Plantilla\s*·\s*/, '') : p.name), kcal: sc(p.kcal), protein_g: sc(p.protein_g), carbs_g: sc(p.carbs_g), fat_g: sc(p.fat_g), water_ml: p.water_ml, notes: p.notes, active: !!o.clientId, ...(p.rest_carbs_g != null ? { rest_carbs_g: sc(p.rest_carbs_g), train_days: p.train_days, peri_meals: p.peri_meals } : {}) });
  for (const m of p.meals) {
    const [nm] = await DB.insert('plan_meals', { plan_id: np.id, name: m.name, time_label: m.time_label, instructions: m.instructions, position: m.position });
    for (const op of m.options) {
      const [no] = await DB.insert('plan_options', { meal_id: nm.id, name: op.name, position: op.position });
      await DB.insert('plan_items', op.items.map(i => ({ option_id: no.id, food_id: i.food_id, grams: Math.max(1, roundG(num(i.grams) * f)), position: i.position, note: i.note })));
    }
  }
  return np.id;
}

/* ---------- registros diarios ---------- */
async function upsertDaily(cid, date, patch) {
  const ex = (await DB.select('daily_logs', { eq: { client_id: cid, log_date: date } }))[0];
  if (ex) return DB.update('daily_logs', ex.id, patch);
  return (await DB.insert('daily_logs', Object.assign({ client_id: cid, log_date: date, water_ml: 0, choices: {} }, patch)))[0];
}
function logFood(cid, date, meal, f, grams, planItemId) {
  const m = macrosFor(f, grams);
  return DB.insert('food_logs', { client_id: cid, log_date: date, meal_id: meal.id || null, meal_name: meal.name, food_id: f.id, plan_item_id: planItemId || null, name: f.name, grams: r1(num(grams)), kcal: r1(m.kcal), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) });
}

/* ---------- componentes ---------- */
function macroBar(label, v, target, unit, cls = '') {
  const pct = target ? v / target * 100 : 0;
  return `<div class="mb"><div class="mb-h"><span>${esc(label)}</span><span><b>${fmtInt(v)}</b>${target ? ' / ' + fmtInt(target) : ''} ${unit}</span></div>
    <div class="mb-t"><div class="mb-f ${cls}${pct > 110 ? ' over' : ''}" style="width:${Math.min(100, pct || (v > 0 && !target ? 100 : 0)).toFixed(1)}%"></div></div></div>`;
}
const macroBars = (m, t) => macroBar('Calorías', m.kcal, t && t.kcal, 'kcal', 'k') + macroBar('Proteína', m.protein, t && t.protein, 'g', 'p') + macroBar('Carbohidratos', m.carbs, t && t.carbs, 'g', 'c') + macroBar('Grasa', m.fat, t && t.fat, 'g', 'f');

function foodListHtml(q, cat, act = 'pick') {
  const ql = norm(q);
  const list = S.foods.filter(f => (!cat || f.category === cat) && (!ql || norm(f.name + ' ' + f.category).includes(ql))).slice(0, 200);
  return list.map(f => `<button class="pick-item" data-act="${act}" data-id="${f.id}"><b>${esc(f.name)}</b><small>${esc(f.category)} · 100 g: ${fmtInt(f.kcal)} kcal · P ${fmtN(f.protein)} · C ${fmtN(f.carbs)} · G ${fmtN(f.fat)}</small></button>`).join('') || '<p class="muted small">Sin resultados.</p>';
}
function pickFood(title, onPick) {
  let q = '', cat = '';
  const h = {
    click: { pick: el => { closeModal(); onPick(el.dataset.id); }, cat: el => { cat = el.dataset.c; document.querySelectorAll('#modal [data-act=cat]').forEach(c => c.classList.toggle('on', c.dataset.c === cat)); $('#pf-list').innerHTML = foodListHtml(q, cat); } },
    input: t => { if (t.id === 'pf-q') { q = t.value; $('#pf-list').innerHTML = foodListHtml(q, cat); } }
  };
  modal(`${modalHead(title)}<input class="input" id="pf-q" placeholder="Buscar alimento" autocomplete="off">
    <div class="chips scroll">${['', ...FOOD_CATS].map(c => `<button class="chip${c === cat ? ' on' : ''}" data-act="cat" data-c="${esc(c)}">${esc(c || 'Todos')}</button>`).join('')}</div>
    <div id="pf-list" class="pick-list tall">${foodListHtml('', '')}</div>`, h);
}

/* Añadir alimento al diario (búsqueda o registro rápido) */
function addFoodModal(o) {
  let mode = 'buscar', q = '', cat = '', sel = null;
  const draw = () => {
    let body;
    if (sel) {
      const g0 = num(sel.unit_grams) || 100;
      body = `<button class="linkbtn" data-act="back">← Resultados</button>
        <div class="card flat"><b>${esc(sel.name)}</b><div class="small muted">${esc(sel.category)} · por 100 g: ${macroLine(macrosFor(sel, 100))}</div>
        <label class="field"><span>Cantidad (g)</span><input class="input" id="af-g" inputmode="decimal" value="${fmtN(g0).replace(/\./g, '')}"></label>
        ${sel.unit_name && num(sel.unit_grams) ? `<div class="chips">${[0.5, 1, 2, 3].map(u => `<button class="chip" data-act="unit" data-g="${num(sel.unit_grams) * u}">${fmtFrac(u)} ${esc(u > 1 ? plural(sel.unit_name) : sel.unit_name)}</button>`).join('')}</div>` : ''}
        <p class="small" id="af-m">${macroLine(macrosFor(sel, g0))}</p>
        <button class="btn primary block" data-act="save">Añadir a ${esc(o.meal.name)}</button></div>`;
    } else if (mode === 'rapido') {
      body = `<p class="small muted">Para alimentos que no están en la base (por ejemplo, un producto empacado). Copia los valores de la etiqueta nutricional.</p>
        <label class="field"><span>Nombre</span><input class="input" id="qk-n" placeholder="Ej.: Barra de proteína"></label>
        <div class="rex-grid"><label><span>kcal</span><input class="input" id="qk-k" inputmode="decimal"></label><label><span>Proteína g</span><input class="input" id="qk-p" inputmode="decimal"></label><label><span>Carbs g</span><input class="input" id="qk-c" inputmode="decimal"></label><label><span>Grasa g</span><input class="input" id="qk-f" inputmode="decimal"></label></div>
        <button class="btn primary block" data-act="quick">Añadir a ${esc(o.meal.name)}</button>`;
    } else {
      body = `<input class="input" id="af-q" placeholder="Buscar alimento" value="${esc(q)}" autocomplete="off">
        <div class="chips scroll">${['', ...FOOD_CATS].map(c => `<button class="chip${c === cat ? ' on' : ''}" data-act="cat" data-c="${esc(c)}">${esc(c || 'Todos')}</button>`).join('')}</div>
        <div id="af-list" class="pick-list tall">${foodListHtml(q, cat, 'sel')}</div>`;
    }
    const tabs = o.planItemId ? '' : `<div class="seg"><button class="${mode === 'buscar' ? 'on' : ''}" data-act="mode" data-m="buscar">Buscar</button><button class="${mode === 'rapido' ? 'on' : ''}" data-act="mode" data-m="rapido">Registro rápido</button>${typeof barcodeModal === 'function' ? '<button data-act="scan">Escanear</button>' : ''}</div>`;
    modal(`${modalHead(o.planItemId ? 'Reemplazar por otro alimento' : 'Añadir a ' + o.meal.name)}${sel ? '' : tabs}${body}`, h);
  };
  const finish = async () => { closeModal(); toast('Registrado'); await o.after(); };
  const h = {
    click: {
      mode: el => { mode = el.dataset.m; draw(); },
      scan: () => barcodeModal(o),
      cat: el => { cat = el.dataset.c; document.querySelectorAll('#modal [data-act=cat]').forEach(c => c.classList.toggle('on', c.dataset.c === cat)); $('#af-list').innerHTML = foodListHtml(q, cat, 'sel'); },
      sel: el => { sel = foodOf(el.dataset.id); draw(); },
      back: () => { sel = null; draw(); },
      unit: el => { $('#af-g').value = r1(num(el.dataset.g)); $('#af-m').textContent = macroLine(macrosFor(sel, num(el.dataset.g))); },
      save: async () => {
        const g = num($('#af-g').value); if (g <= 0) return toast('Indica la cantidad en gramos', 'error');
        if (o.replaceLog) await DB.remove('food_logs', o.replaceLog.id);
        await logFood(o.cid, o.date, o.meal, sel, g, o.planItemId); await finish();
      },
      quick: async () => {
        const n = $('#qk-n').value.trim(); const k = num($('#qk-k').value);
        if (!n || k <= 0) return toast('Indica nombre y calorías', 'error');
        await DB.insert('food_logs', { client_id: o.cid, log_date: o.date, meal_id: o.meal.id || null, meal_name: o.meal.name, food_id: null, plan_item_id: null, name: n, grams: null, kcal: r1(k), protein: r1(num($('#qk-p').value)), carbs: r1(num($('#qk-c').value)), fat: r1(num($('#qk-f').value)) });
        await finish();
      }
    },
    input: t => {
      if (t.id === 'af-q') { q = t.value; $('#af-list').innerHTML = foodListHtml(q, cat, 'sel'); }
      if (t.id === 'af-g' && sel) $('#af-m').textContent = macroLine(macrosFor(sel, num(t.value)));
    }
  };
  draw();
}

function replaceModal(o) {
  const { it, meal, log } = o; const f = foodOf(it.food_id);
  const eqs = equivalents(f, num(it.grams), 0);
  const key = CAT_KEY[f.category] || 'kcal';
  const g0 = log && log.food_id === f.id ? num(log.grams) : num(it.grams);
  modal(`${modalHead('Ajustar o reemplazar')}
    <div class="card flat"><b>${esc(f.name)}</b><div class="small muted">Porción del plan: ${fmtN(it.grams)} g ${esc(unitText(f, it.grams))}</div>
      <label class="field"><span>Cantidad consumida (g)</span><input class="input" id="rp-g" inputmode="decimal" value="${r1(g0)}"></label>
      <p class="small" id="rp-m">${macroLine(macrosFor(f, g0))}</p>
      <button class="btn primary block" data-act="own">Registrar ${esc(f.name)}</button></div>
    <h4>Equivalentes · ${esc(f.category)}</h4>
    <p class="small muted">Cantidades calculadas para aportar la misma ${KEY_LBL[key]} que la porción del plan.</p>
    <div class="pick-list">${eqs.map((e, i) => `<button class="pick-item" data-act="eq" data-i="${i}"><b>${esc(e.food.name)} · ${fmtN(e.grams)} g</b><small>${esc(unitText(e.food, e.grams))}${unitText(e.food, e.grams) ? ' · ' : ''}${macroLine(e.m)}</small></button>`).join('') || '<p class="muted small">Sin equivalentes registrados en este grupo.</p>'}</div>
    <button class="btn block" data-act="other">Buscar otro alimento</button>
    ${log ? '<button class="btn danger-outline block" data-act="clear">Quitar registro</button>' : ''}`, {
    input: t => { if (t.id === 'rp-g') $('#rp-m').textContent = macroLine(macrosFor(f, num(t.value))); },
    click: {
      own: async () => { const g = num($('#rp-g').value); if (g <= 0) return toast('Indica los gramos', 'error'); if (log) await DB.remove('food_logs', log.id); await logFood(o.cid, o.date, meal, f, g, it.id); closeModal(); await o.after(); },
      eq: async el => { const e = eqs[+el.dataset.i]; if (log) await DB.remove('food_logs', log.id); await logFood(o.cid, o.date, meal, e.food, e.grams, it.id); closeModal(); toast('Alimento reemplazado'); await o.after(); },
      other: () => addFoodModal({ cid: o.cid, date: o.date, meal, planItemId: it.id, replaceLog: log, after: o.after }),
      clear: async () => { await DB.remove('food_logs', log.id); closeModal(); await o.after(); }
    }
  });
}

/* ---------- entrenamiento del día ---------- */
async function nextWorkoutDay(cid) {
  const rs = await DB.select('routines', { eq: { client_id: cid, active: true }, order: 'created_at', asc: false });
  if (!rs.length) return null;
  const r = rs[0];
  const days = await DB.select('routine_days', { eq: { routine_id: r.id }, order: 'position' });
  if (!days.length) return null;
  const last = (await DB.select('workouts', { eq: { client_id: cid }, order: 'started_at', asc: false, limit: 1 }))[0];
  let idx = 0;
  if (last) { const i = days.findIndex(d => d.id === last.day_id); idx = i < 0 ? 0 : (i + 1) % days.length; }
  return { routine: r, day: days[idx], last, doneToday: !!(last && dateStr(new Date(last.started_at)) === todayStr()) };
}
async function workoutCardHtml(cid) {
  const draft = getDraft();
  if (draft) return `<div class="card live"><div><small class="muted">Entrenamiento</small><div><b>Sesión en curso</b></div><small>${esc(draft.day_name || 'Sesión libre')}</small></div><a class="btn primary" href="#/entreno">Continuar</a></div>`;
  const n = await nextWorkoutDay(cid);
  if (!n) return '';
  if (n.doneToday) return `<a class="card row-link wk-done" href="#/resumen/${n.last.id}"><div><small class="muted">Entrenamiento de hoy</small><b>Completado · ${esc(n.last.day_name || '')}</b><small class="muted">${fmtKg(n.last.total_volume)} de volumen</small></div><span class="chev">›</span></a>`;
  return `<div class="card live"><div><small class="muted">Entrenamiento sugerido</small><div><b>${esc(n.day.name)}</b></div><small class="muted">${esc(n.routine.name)}</small></div><button class="btn primary" data-act="startWk" data-id="${n.day.id}">Iniciar</button></div>`;
}

/* =====================================================================
   DIARIO · Hoy (asesorado) / Diario de un asesorado (entrenador)
   ===================================================================== */
async function vHoy(date, cid) {
  cid = cid || S.profile.id; date = date || todayStr();
  const own = cid === S.profile.id;
  const base = own ? '#/hoy/' : `#/diario/${cid}/`;
  const client = own ? S.profile : (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  const [plan, logs, daily] = await Promise.all([
    activePlanFor(cid),
    DB.select('food_logs', { eq: { client_id: cid, log_date: date }, order: 'created_at' }),
    DB.select('daily_logs', { eq: { client_id: cid, log_date: date } }).then(r => r[0] || null)]);
  const isToday = date === todayStr();
  let t = targetsOf(plan); const hasT = t && t.kcal > 0;
  const tot = logs.reduce((a, l) => addM(a, logM(l)), ZERO());
  const choices = (daily && daily.choices) || {};
  // Tipo de día (ciclado de carbohidratos)
  let dayType = null, rf = 1;
  const tday = plan && hasT && typeof tournamentDay === 'function' ? await tournamentDay(cid, date, plan).catch(() => null) : null;
  const dayOpts = [['train', 'Día de entreno']].concat(cycles(plan) ? [['rest', 'Día de descanso']] : [], tday ? [[tday.type, tday.label]] : []);
  if (cycles(plan) || tday) {
    const ws = await DB.select('workouts', { eq: { client_id: cid }, gte: { started_at: parseDay(addDays(date, -1)).toISOString() }, limit: 20 });
    const trained = ws.some(w => dateStr(new Date(w.started_at)) === date);
    const auto = tday ? tday.type : ((plan.train_days || []).includes(WEEKDAYS[parseDay(date).getDay()]) || trained || !cycles(plan) ? 'train' : 'rest');
    dayType = dayOpts.some(o => o[0] === choices.__day) ? choices.__day : auto;
    if (dayType === 'rest') { t = restTargets(plan, t); rf = restFactor(plan); }
    else if (tday && dayType === tday.type) { t = Object.assign({}, t, { carbs: tday.carbs, kcal: t.kcal + (tday.carbs - t.carbs) * 4 }); rf = carbFactor(plan, tday.carbs); }
  }
  // Partidos y práctica de tenis: gasto adicional del día
  const tk = hasT && typeof tennisKcal === 'function' ? await tennisKcal(cid, date) : { kcal: 0, rows: [] };
  if (tday && dayType === tday.type) tk.kcal = 0;   // en días de torneo la meta de carbohidratos en g/kg ya cubre el gasto del partido
  if (tk.kcal) t = Object.assign({}, t, { kcal: t.kcal + tk.kcal, carbs: t.carbs + Math.round(tk.kcal * 0.7 / 4), fat: t.fat + Math.round(tk.kcal * 0.3 / 9) });
  const peri = dayType === 'train' && plan && plan.peri_meals ? plan.peri_meals : null;
  const water = num(daily && daily.water_ml), waterT = num(plan && plan.water_ml) || 2500;
  const left = hasT ? t.kcal - tot.kcal : 0;
  const rerender = () => keepScroll(() => vHoy(date, cid));

  let html = '';
  const nut = !own || typeof showsNutrition !== 'function' || showsNutrition();
  if (own && isToday) html += `<p class="muted hello">Hola, ${esc(firstName(S.profile.full_name))}</p>`;
  html += `<div class="datebar"><a class="icon-btn" href="${base}${addDays(date, -1)}" aria-label="Día anterior">‹</a><b>${isToday ? 'Hoy · ' + esc(fmtDayLong(date).toLowerCase()) : esc(fmtDayLong(date))}</b><a class="icon-btn" href="${base}${addDays(date, 1)}" aria-label="Día siguiente">›</a></div>`;
  if (dayType) html += `<div class="seg daytype">${dayOpts.map(([k, l]) => `<button class="${dayType === k ? 'on' : ''}" data-act="dayT" data-v="${k}">${l}</button>`).join('')}</div>
    ${dayType === 'rest' ? `<p class="small muted">Día de descanso: ${fmtInt(num(plan.carbs_g) - num(plan.rest_carbs_g))} g menos de carbohidratos; las porciones del grupo de cereales, tubérculos y frutas ya están ajustadas.</p>` : ''}
    ${tday && dayType === tday.type ? `<p class="small muted">${esc(tday.t.name)}: carbohidratos ${fmtInt(tday.carbs)} g (${fmtN(tday.gkg)} g/kg); las porciones de cereales, tubérculos y frutas ya están aumentadas. <a href="${own ? '#/rendimiento/torneos' : `#/asesorado/${cid}/rendimiento/torneos`}">Protocolo del día de partido</a></p>` : ''}`;
  if (tk.rows.length) html += `<p class="small muted">Tenis hoy: ${tk.rows.map(r => `${r.kind.toLowerCase()} de ${r.minutes} min`).join(', ')} · gasto estimado ${fmtInt(tk.gross)} kcal${tk.kcal ? ` · +${fmtInt(tk.kcal)} kcal sumadas al objetivo (70 % carbohidratos, 30 % grasa)${tk.assumed ? `; el plan ya incluye ${String(tk.assumed).replace('.', ',')} sesiones por semana` : ''}` : tday && dayType === tday.type ? ' · cubierto por la meta de carbohidratos del día de torneo' : ''}.</p>`;
  if (own && isToday && S.profile.goal) html += `<div class="goal"><small>Objetivo</small>${esc(S.profile.goal)}</div>`;
  if (nut) html += `<div class="card sum">
    <div class="sum-top"><div><b>${fmtInt(tot.kcal)}</b><small>Consumidas</small></div>
    <div class="sum-mid"><b class="${left < 0 ? 'over' : ''}">${hasT ? fmtInt(Math.abs(left)) : '—'}</b><small>${left < 0 ? 'kcal por encima' : 'kcal restantes'}</small></div>
    <div><b>${hasT ? fmtInt(t.kcal) : '—'}</b><small>Objetivo</small></div></div>
    ${macroBars(tot, hasT ? t : null)}
  </div>`;
  html += `<div class="card"><div class="mb-h"><span>Agua</span><span><b>${(water / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</b> / ${(waterT / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} L</span></div>
    <div class="mb-t"><div class="mb-f w" style="width:${Math.min(100, water / waterT * 100).toFixed(1)}%"></div></div>
    <div class="row-btns"><button class="btn sm" data-act="water" data-d="-250">− 250 ml</button><button class="btn sm primary" data-act="water" data-d="250">+ 250 ml</button><button class="btn sm" data-act="water" data-d="500">+ 500 ml</button></div>
    ${S.needsV6 ? '' : `<label class="steps-in"><span>Pasos del día</span><input class="input" data-steps inputmode="numeric" value="${num(daily && daily.steps) || ''}" placeholder="0"></label>`}</div>`;
  if (own && isToday && typeof messageCardHtml === 'function') html += (await messageCardHtml()) + (await streakCardHtml()) + (await lessonCardHtml()) + (await challengeCardHtml().catch(() => ''));
  if (own && isToday && typeof wellnessCardHtml === 'function') html += await wellnessCardHtml();
  if (own && isToday && typeof cycleCardHtml === 'function') html += await cycleCardHtml();
  if (own && isToday && typeof supplementCardHtml === 'function') html += await supplementCardHtml().catch(() => '');
  if (own && isToday && (typeof showsTraining !== 'function' || showsTraining())) html += await workoutCardHtml(cid);
  if (own && isToday && typeof surveyCardHtml === 'function') html += await surveyCardHtml().catch(() => '');
  if (own && isToday && typeof checkinCardsHtml === 'function' && !S.needsMigration) html += await checkinCardsHtml(cid).catch(() => '');
  if (own && isToday && typeof clientMembershipCard === 'function') html += (await clientMembershipCard()) + (await clientReportCard());

  if (!nut) html += '<div class="card empty"><p>Tu asesoría incluye el plan de entrenamiento. Puedes registrar el agua, los pasos y el bienestar diario.</p></div>';
  else if (!plan) html += `<div class="card empty"><p>${own ? (S.intake && S.intake.status === 'pending' ? 'Tu entrenador está revisando tu valoración y tu plan nutricional. Cuando lo apruebe aparecerá aquí.' : 'Tu entrenador todavía no te ha asignado un plan nutricional.') : 'Este asesorado no tiene un plan nutricional activo.'}</p><p class="small muted">Puedes registrar alimentos libremente en cada comida.</p></div>`;
  const meals = plan ? plan.meals : DEFAULT_MEALS.map(([n, tl]) => ({ id: null, name: n, time_label: tl, options: [] }));
  const used = new Set(); const itemMap = {};
  const itemRow = (it0, meal, log) => {
    const f = foodOf(it0.food_id); if (!f) return '';
    const it = rf !== 1 && isCarbFood(f) ? Object.assign({}, it0, { grams: Math.max(1, roundG(num(it0.grams) * rf)) }) : it0;
    itemMap[it.id] = { it, meal, log };
    const replaced = log && log.food_id !== it.food_id;
    const g = log ? num(log.grams) : num(it.grams);
    const kc = log ? num(log.kcal) : macrosFor(f, it.grams).kcal;
    const ut = replaced ? unitText(foodOf(log.food_id), g) : unitText(f, g);
    return `<div class="fi${log ? ' done' : ''}">
      <button class="chk" data-act="tick" data-item="${it.id}" aria-label="Marcar ${esc(f.name)}">✓</button>
      <button class="fi-b" data-act="repl" data-item="${it.id}"><b>${esc(replaced ? log.name : f.name)}</b>
        <small>${fmtN(g)} g${ut ? ' · ' + esc(ut) : ''} · ${fmtInt(kc)} kcal</small>
        ${replaced ? `<small class="swapped">Reemplaza a: ${esc(f.name)} ${fmtN(it.grams)} g</small>` : ''}${it.note ? `<small class="muted">${esc(it.note)}</small>` : ''}</button>
      <button class="icon-btn" data-act="repl" data-item="${it.id}" aria-label="Reemplazar o ajustar">⇄</button></div>`;
  };
  const logRow = l => `<div class="fi done extra"><span class="chk">✓</span><div class="fi-b"><b>${esc(l.name)}</b><small>${l.grams ? fmtN(l.grams) + ' g · ' : ''}${macroLine(logM(l))}</small></div><button class="icon-btn danger" data-act="dellog" data-id="${l.id}" aria-label="Eliminar">✕</button></div>`;
  const mealByKey = {};
  if (nut) html += meals.map((m, mi) => {
    const mk = m.id || 'n' + mi; mealByKey[mk] = m;
    const mlogs = logs.filter(l => m.id ? l.meal_id === m.id : (!l.meal_id && l.meal_name === m.name));
    mlogs.forEach(l => used.add(l.id));
    const opt = m.options.find(o => o.id === choices[m.id]) || m.options[0];
    const ids = new Set(opt ? opt.items.map(i => i.id) : []);
    const extras = mlogs.filter(l => !ids.has(l.plan_item_id));
    const mt = mlogs.reduce((a, l) => addM(a, logM(l)), ZERO());
    const planned = opt && opt.items.length ? opt.items.reduce((a, i) => { const f = foodOf(i.food_id); return f ? addM(a, macrosFor(f, num(i.grams) * (rf !== 1 && isCarbFood(f) ? rf : 1))) : a; }, ZERO()) : null;
    const periTag = peri ? (peri.pre === m.name ? 'Pre-entreno' : peri.post === m.name ? 'Post-entreno' : '') : '';
    const pending = opt ? opt.items.filter(i => !mlogs.some(l => l.plan_item_id === i.id)).length : 0;
    return `<div class="card meal">
      <div class="meal-h"><div><h3>${esc(m.name)}${periTag ? ` <span class="tag peri">${periTag}</span>` : ''}</h3><small class="muted">${esc(m.time_label || '')}${planned ? (m.time_label ? ' · ' : '') + 'plan ' + fmtInt(planned.kcal) + ' kcal' : ''}</small></div><span class="kpi">${fmtInt(mt.kcal)}<small>kcal</small></span></div>
      ${m.options.length > 1 ? `<div class="chips">${m.options.map(o => `<button class="chip${o === opt ? ' on' : ''}" data-act="opt" data-meal="${m.id}" data-opt="${o.id}">${esc(o.name)}</button>`).join('')}</div>` : ''}
      ${m.instructions ? `<p class="note">${esc(m.instructions)}</p>` : ''}
      ${opt ? opt.items.map(it => itemRow(it, m, mlogs.find(l => l.plan_item_id === it.id))).join('') : ''}
      ${extras.map(logRow).join('')}
      <div class="row-btns">${pending ? `<button class="btn sm" data-act="all" data-meal="${mk}">Marcar todo</button>` : ''}<button class="btn sm" data-act="add" data-meal="${mk}">+ Añadir alimento</button>${opt && opt.items.length && typeof recipeModal === 'function' ? `<button class="btn sm" data-act="recipe" data-meal="${mk}">Preparación</button>` : ''}</div>
    </div>`;
  }).join('');
  const orphans = logs.filter(l => !used.has(l.id));
  if (nut && orphans.length) html += `<div class="card meal"><div class="meal-h"><h3>Otros registros</h3></div>${orphans.map(logRow).join('')}</div>`;
  if (nut && plan) html += `<div class="row-btns"><a class="btn" href="#/plan-ver/${plan.id}">Ver plan completo</a><a class="btn" href="#/compras/${plan.id}">Lista de compras</a>${own && typeof vFuera === 'function' ? '<a class="btn" href="#/fuera">Comer fuera de casa</a>' : ''}</div>`;

  paint(html, {
    change: async t => { if ('steps' in t.dataset) { await upsertDaily(cid, date, { steps: Math.max(0, Math.round(num(t.value))) }); toast('Pasos guardados'); } },
    click: {
      water: async el => { await upsertDaily(cid, date, { water_ml: Math.max(0, water + num(el.dataset.d)) }); rerender(); },
      ...(typeof wellnessHandlers === 'function' ? wellnessHandlers(rerender) : {}),
      ...(typeof supplementHandlers === 'function' ? supplementHandlers(rerender) : {}),
      ...(typeof cycleHandlers === 'function' ? cycleHandlers(rerender) : {}),
      ...(typeof challengeHandlers === 'function' ? challengeHandlers(rerender) : {}),
      recipe: el => { const m = mealByKey[el.dataset.meal]; const o = m.options.find(x => x.id === choices[m.id]) || m.options[0]; if (o) recipeModal(o, rf); },
      dayT: async el => { await upsertDaily(cid, date, { choices: Object.assign({}, choices, { __day: el.dataset.v }) }); rerender(); },
      startWk: el => startWorkout(el.dataset.id),
      opt: async el => { await upsertDaily(cid, date, { choices: Object.assign({}, choices, { [el.dataset.meal]: el.dataset.opt }) }); rerender(); },
      tick: async el => {
        const x = itemMap[el.dataset.item];
        if (x.log) await DB.remove('food_logs', x.log.id);
        else await logFood(cid, date, x.meal, foodOf(x.it.food_id), x.it.grams, x.it.id);
        rerender();
      },
      repl: el => { const x = itemMap[el.dataset.item]; replaceModal({ ...x, cid, date, after: rerender }); },
      all: async el => {
        const m = mealByKey[el.dataset.meal];
        for (const x of Object.values(itemMap)) if (x.meal === m && !x.log) await logFood(cid, date, m, foodOf(x.it.food_id), x.it.grams, x.it.id);
        rerender();
      },
      add: el => addFoodModal({ cid, date, meal: mealByKey[el.dataset.meal], after: rerender }),
      dellog: async el => { await DB.remove('food_logs', el.dataset.id); rerender(); }
    }
  }, own ? 'Hoy' : 'Diario · ' + (client.full_name || ''));
}

/* =====================================================================
   Documento del plan (pantalla, PDF e HTML)
   ===================================================================== */
const DOC_CSS = `
.doc{background:#fff;color:#0f2a44;border-radius:14px;padding:22px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.doc-h{display:flex;align-items:center;gap:16px;border-bottom:3px solid #6FB232;padding-bottom:14px;margin-bottom:14px}
.doc-logo{width:96px;height:auto}
.doc h1{font-size:22px;margin:0;color:#0B406C}
.doc h2{font-size:17px;color:#0B406C;margin:22px 0 6px;padding-bottom:4px;border-bottom:1px solid #dce2d8}
.doc h3{font-size:14px;margin:12px 0 4px}
.doc p{margin:4px 0}
.doc .doc-sub{color:#5f6d79;font-size:12px}
.doc .pre{white-space:pre-wrap}
.doc-t{width:100%;border-collapse:collapse;font-size:12.5px;margin:4px 0 6px}
.doc-t th{background:#0B406C;color:#fff;text-align:left;padding:5px 6px;font-weight:600}
.doc-t td{padding:5px 6px;border-bottom:1px solid #e3e8df}
.doc-t td.n,.doc-t th.n{text-align:right;white-space:nowrap}
.doc-t tfoot td{font-weight:700;background:#eef4e6}
.doc-t.targets td{font-size:14px;font-weight:600}
.doc-repl{font-size:12px;color:#36485a;margin:2px 0 10px;padding-left:16px}
.doc-repl li{margin:2px 0}
.doc-foot{margin-top:18px;font-size:11px;color:#5f6d79;border-top:1px solid #dce2d8;padding-top:8px}
@media print{.doc{padding:0;border-radius:0}.doc h2{break-after:avoid}.doc-t{break-inside:auto}.doc-t tr{break-inside:avoid}}`;
function ensureDocCss() { if (!document.getElementById('doc-css')) { const s = document.createElement('style'); s.id = 'doc-css'; s.textContent = DOC_CSS; document.head.appendChild(s); } }

function planDocHtml(plan, client, logoSrc) {
  const t = targetsOf(plan); const avg = planAvgTotals(plan);
  const pct = (g, k) => t.kcal ? Math.round(g * k / t.kcal * 100) + ' %' : '';
  let h = `<div class="doc-h">${logoSrc ? `<img class="doc-logo" src="${esc(logoSrc)}" alt="">` : ''}<div><h1>Plan nutricional</h1>
    <p><b>${esc(client ? client.full_name : 'Plantilla')}</b> · ${esc(plan.name)}</p>
    <p class="doc-sub">${esc(BRAND.name)} · ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div></div>`;
  if (client && client.goal) h += `<p><b>Objetivo:</b> ${esc(client.goal)}</p>`;
  h += `<h2>Requerimientos diarios</h2><table class="doc-t targets"><thead><tr><th>Energía</th><th>Proteína</th><th>Carbohidratos</th><th>Grasa</th><th>Agua</th></tr></thead>
    <tbody><tr><td>${t.kcal ? fmtInt(t.kcal) + ' kcal' : '—'}</td><td>${t.protein ? fmtInt(t.protein) + ' g · ' + pct(t.protein, 4) : '—'}</td><td>${t.carbs ? fmtInt(t.carbs) + ' g · ' + pct(t.carbs, 4) : '—'}</td><td>${t.fat ? fmtInt(t.fat) + ' g · ' + pct(t.fat, 9) : '—'}</td><td>${plan.water_ml ? (plan.water_ml / 1000).toLocaleString('es-CO') + ' L' : '—'}</td></tr></tbody></table>
    <p class="doc-sub">Aporte promedio del plan: ${macroLine(avg)}.</p>`;
  const cyc = cycles(plan), rfd = restFactor(plan);
  if (cyc && t.kcal) {
    const rt = restTargets(plan, t);
    h += `<h2>Día de entreno vs día de descanso</h2><table class="doc-t"><thead><tr><th></th><th class="n">Día de entreno</th><th class="n">Día de descanso</th></tr></thead><tbody>
      <tr><td>Energía</td><td class="n">${fmtInt(t.kcal)} kcal</td><td class="n">${fmtInt(rt.kcal)} kcal</td></tr>
      <tr><td>Proteína</td><td class="n">${fmtInt(t.protein)} g</td><td class="n">${fmtInt(rt.protein)} g</td></tr>
      <tr><td>Carbohidratos</td><td class="n">${fmtInt(t.carbs)} g</td><td class="n">${fmtInt(rt.carbs)} g</td></tr>
      <tr><td>Grasa</td><td class="n">${fmtInt(t.fat)} g</td><td class="n">${fmtInt(rt.fat)} g</td></tr></tbody></table>
      <p class="doc-sub">Días de entreno: ${esc((plan.train_days || []).join(', ') || 'los días con sesión de entrenamiento o de deporte')}. En los días de descanso se usan las cantidades de la columna «Descanso» para los alimentos del grupo de carbohidratos.${plan.peri_meals && (plan.peri_meals.pre || plan.peri_meals.post) ? ` Comidas cercanas al entrenamiento: ${esc([plan.peri_meals.pre && plan.peri_meals.pre + ' (antes)', plan.peri_meals.post && plan.peri_meals.post + ' (después)'].filter(Boolean).join(' y '))}.` : ''}</p>`;
  }
  if (plan.notes) h += `<h2>Indicaciones generales</h2><p class="pre">${esc(plan.notes)}</p>`;
  for (const m of plan.meals) {
    h += `<h2>${esc(m.name)}${m.time_label ? ' · ' + esc(m.time_label) : ''}</h2>`;
    if (m.instructions) h += `<p class="pre">${esc(m.instructions)}</p>`;
    for (const o of m.options.filter(x => x.items.length)) {
      const ot = optionTotals(o);
      if (m.options.filter(x => x.items.length).length > 1) h += `<h3>${esc(o.name)}</h3>`;
      h += `<table class="doc-t"><thead><tr><th>Alimento</th><th class="n">${cyc ? 'Entreno' : 'Gramos'}</th>${cyc ? '<th class="n">Descanso</th>' : ''}<th>Medida casera</th><th class="n">kcal</th><th class="n">P</th><th class="n">C</th><th class="n">G</th></tr></thead><tbody>`;
      const repl = [];
      for (const i of o.items) {
        const f = foodOf(i.food_id); if (!f) continue; const mm = macrosFor(f, i.grams);
        h += `<tr><td>${esc(f.name)}${i.note ? `<br><small>${esc(i.note)}</small>` : ''}</td><td class="n">${fmtN(i.grams)} g</td>${cyc ? `<td class="n">${isCarbFood(f) ? fmtN(Math.max(1, roundG(num(i.grams) * rfd))) + ' g' : '='}</td>` : ''}<td>${esc(unitText(f, i.grams).replace('≈ ', ''))}</td><td class="n">${fmtInt(mm.kcal)}</td><td class="n">${fmtN(mm.protein)}</td><td class="n">${fmtN(mm.carbs)}</td><td class="n">${fmtN(mm.fat)}</td></tr>`;
        const eq = equivalents(f, num(i.grams), 3);
        if (eq.length) repl.push(`<li><b>${esc(f.name)} ${fmtN(i.grams)} g:</b> ${eq.map(e => `${esc(e.food.name)} ${fmtN(e.grams)} g`).join(' · ')}</li>`);
      }
      h += `</tbody><tfoot><tr><td>Total</td><td></td>${cyc ? '<td></td>' : ''}<td></td><td class="n">${fmtInt(ot.kcal)}</td><td class="n">${fmtN(ot.protein)}</td><td class="n">${fmtN(ot.carbs)}</td><td class="n">${fmtN(ot.fat)}</td></tr></tfoot></table>`;
      if (repl.length) h += `<p class="small"><b>Opciones de reemplazo</b></p><ul class="doc-repl">${repl.join('')}</ul>`;
      if (typeof recipeDocHtml === 'function') h += recipeDocHtml(o);
    }
  }
  h += `<p class="doc-foot">Los gramos corresponden al alimento en el estado indicado en su nombre (por ejemplo, «cocido»). Los reemplazos aportan la misma cantidad del nutriente principal del grupo (proteína, carbohidratos, grasa o energía). Documento elaborado por ${esc(BRAND.name)}.</p>`;
  return h;
}
async function toDataUrl(src) {
  try { const b = await (await fetch(src)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(''); fr.readAsDataURL(b); }); } catch (e) { return ''; }
}
function downloadFile(name, content, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const docName = (plan, client) => `Plan nutricional - ${client ? client.full_name : plan.name}`.replace(/[\\/:*?"<>|]/g, '');

async function vPlanDoc(id) {
  const plan = id ? await loadPlanFull(id) : await activePlanFor(S.profile.id);
  if (!plan) return paint('<div class="card empty"><p>Plan no encontrado.</p></div>');
  const client = plan.client_id ? (await DB.select('profiles', { eq: { id: plan.client_id } }))[0] : null;
  ensureDocCss();
  const logo = BRAND.logoFull || BRAND.logo;
  paint(`<div class="row-btns no-print"><button class="btn" data-act="back">← Volver</button><button class="btn primary" data-act="pdf">Descargar PDF</button><button class="btn" data-act="html">Descargar HTML</button>${S.profile.role === 'coach' ? `<a class="btn" href="#/plan-nutri/${plan.id}">Editar</a>` : ''}</div>
    <p class="small muted no-print">«Descargar PDF» abre la ventana de impresión: elige «Guardar como PDF».</p>
    <div class="doc">${planDocHtml(plan, client, logo)}</div>`, {
    click: {
      back: () => history.back(),
      pdf: () => { const t = document.title; document.title = docName(plan, client); window.print(); setTimeout(() => { document.title = t; }, 1000); },
      html: async () => {
        const body = planDocHtml(plan, client, logo ? await toDataUrl(logo) : '');
        downloadFile(docName(plan, client) + '.html', `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(docName(plan, client))}</title><style>body{margin:0;background:#f3f5f1}.wrap{max-width:820px;margin:0 auto;padding:16px}${DOC_CSS}</style></head><body><div class="wrap"><div class="doc">${body}</div></div></body></html>`, 'text/html');
      }
    }
  });
}

/* =====================================================================
   Lista de compras
   ===================================================================== */
async function vCompras(id, days) {
  days = +days || 7;
  const plan = await loadPlanFull(id);
  if (!plan) return paint('<div class="card empty"><p>Plan no encontrado.</p></div>');
  const agg = {};
  plan.meals.forEach(m => { const os = m.options.filter(o => o.items.length); os.forEach(o => o.items.forEach(i => { agg[i.food_id] = (agg[i.food_id] || 0) + num(i.grams) * days / os.length; })); });
  const key = 'dp_compras_' + id; let checked = {};
  try { checked = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { }
  let total = 0, noPrice = 0; const coachShop = S.profile.role === 'coach';
  const qty = g => g >= 1000 ? (Math.round(g / 100) / 10).toLocaleString('es-CO') + ' kg' : Math.round(g / 5) * 5 + ' g';
  let html = `<div class="chips no-print">${[3, 7, 14].map(d => `<a class="chip${d === days ? ' on' : ''}" href="#/compras/${id}/${d}">${d} días</a>`).join('')}</div>
    <p class="small muted">${esc(plan.name)}. Cantidades para ${days} días, con rotación equitativa de las opciones de cada comida. Los alimentos que el plan indica cocidos se convierten a peso en crudo aproximado.</p>`;
  for (const cat of FOOD_CATS) {
    const rows = Object.entries(agg).map(([fid, g]) => ({ f: foodOf(fid), g })).filter(x => x.f && x.f.category === cat).sort((a, b) => a.f.name.localeCompare(b.f.name, 'es'));
    if (!rows.length) continue;
    html += `<div class="card"><h3>${esc(cat)}</h3>${rows.map(({ f, g }) => {
      const rf = /cocid/i.test(f.name) ? (RAW_FACTORS.find(([k]) => f.name.includes(k)) || [])[1] : null;
      const shown = rf ? g * rf : g;
      const name = rf ? f.name.replace(/\s*cocid[oa]s?/i, '') : f.name;
      const cost = num(f.price_kg) ? shown / 1000 * num(f.price_kg) : 0; total += cost; if (!num(f.price_kg)) noPrice++;
      return `<label class="shop${checked[f.id] ? ' got' : ''}"><input type="checkbox" data-f="${f.id}" ${checked[f.id] ? 'checked' : ''}><span>${esc(name)}</span><b>${qty(shown)}</b><small>${rf ? 'en crudo' : esc(unitText(f, g))}${cost ? ' · $' + fmtInt(Math.round(cost / 100) * 100) : ''}</small>${coachShop && !S.needsV6 ? `<input class="input price-in" data-price="${f.id}" inputmode="numeric" value="${num(f.price_kg) || ''}" placeholder="$/kg" aria-label="Precio por kg">` : ''}</label>`;
    }).join('')}</div>`;
  }
  if (total) html += `<div class="card"><h3>Costo estimado</h3><div class="stats3"><div><b>$${fmtInt(Math.round(total / 1000) * 1000)}</b><small>${days} días</small></div><div><b>$${fmtInt(Math.round(total / days / 100) * 100)}</b><small>Por día</small></div><div><b>$${fmtInt(Math.round(total * 30 / days / 1000) * 1000)}</b><small>Por mes</small></div></div><p class="small muted">Con los precios por kg registrados en Biblioteca › Alimentos${noPrice ? `; ${noPrice} alimentos sin precio no se incluyen` : ''}.</p></div>`;
  else if (coachShop && !S.needsV6) html += `<p class="small muted">Escribe el precio por kg (o por litro) de cada alimento para calcular el costo del mercado.</p>`;
  html += `<div class="row-btns no-print"><button class="btn" data-act="print">Imprimir / PDF</button><button class="btn" data-act="clear">Desmarcar todo</button></div>`;
  paint(html, {
    change: async t => { if (t.dataset.price) { const v = num(t.value) || null; await DB.update('foods', t.dataset.price, { price_kg: v }); S.foodById[t.dataset.price].price_kg = v; toast('Precio guardado'); return vCompras(id, days); } if (t.dataset.f) { checked[t.dataset.f] = t.checked; try { localStorage.setItem(key, JSON.stringify(checked)); } catch (e) { } t.closest('.shop').classList.toggle('got', t.checked); } },
    click: { print: () => window.print(), clear: () => { checked = {}; try { localStorage.removeItem(key); } catch (e) { } vCompras(id, days); } }
  }, 'Lista de compras');
}

/* =====================================================================
   Peso y medidas
   ===================================================================== */
async function bodySection(cid) {
  const rows = await DB.select('body_logs', { eq: { client_id: cid }, order: 'log_date', asc: false, limit: 60 });
  const w = rows.filter(r => num(r.weight_kg) > 0).slice(0, 12).reverse();
  const first = w[0], last = w[w.length - 1];
  const diff = first && last && first !== last ? num(last.weight_kg) - num(first.weight_kg) : null;
  const wa = rows.filter(r => num(r.waist_cm) > 0).slice(0, 12).reverse();
  const floorOf = arr => arr.length ? Math.max(0, Math.floor(Math.min(...arr) - 3)) : 0;
  const wFloor = floorOf(w.map(r => num(r.weight_kg))), cFloor = floorOf(wa.map(r => num(r.waist_cm)));
  const html = `
    <div class="card"><h3>Nuevo registro</h3>
      <label class="field"><span>Fecha</span><input class="input" type="date" id="bd-d" value="${todayStr()}"></label>
      <div class="rex-grid three"><label><span>Peso kg</span><input class="input" id="bd-w" inputmode="decimal"></label><label><span>Cintura cm</span><input class="input" id="bd-c" inputmode="decimal"></label><label><span>% grasa</span><input class="input" id="bd-f" inputmode="decimal"></label></div>
      <input class="input" id="bd-n" placeholder="Nota (opcional)">
      <button class="btn primary block" data-act="bdAdd">Guardar registro</button></div>
    ${w.length ? `<div class="stats3"><div><b>${fmtN(last.weight_kg)} kg</b><small>Último peso</small></div><div><b>${diff == null ? '—' : (diff > 0 ? '+' : '') + fmtN(diff) + ' kg'}</b><small>Cambio en el periodo</small></div><div><b>${rows.length}</b><small>Registros</small></div></div>` : ''}
    <div class="card"><h3>Peso corporal (kg)</h3>${vbars(w.map((r, i) => ({ label: fmtDM(parseDay(r.log_date)), value: num(r.weight_kg), text: fmtN(r.weight_kg), hi: i === w.length - 1 })), 'Sin registros de peso.', wFloor)}${w.length ? `<p class="small muted">El eje inicia en ${wFloor} kg para mostrar mejor los cambios.</p>` : ''}</div>
    ${wa.length ? `<div class="card"><h3>Perímetro de cintura (cm)</h3>${vbars(wa.map((r, i) => ({ label: fmtDM(parseDay(r.log_date)), value: num(r.waist_cm), text: fmtN(r.waist_cm), hi: i === wa.length - 1 })), '', cFloor)}<p class="small muted">El eje inicia en ${cFloor} cm.</p></div>` : ''}
    ${rows.length ? `<div class="card"><h3>Registros</h3><table class="tbl"><thead><tr><th>Fecha</th><th>Peso</th><th>Cintura</th><th>% grasa</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${fmtDM(parseDay(r.log_date))}${r.notes ? `<br><small class="muted">${esc(r.notes)}</small>` : ''}</td><td>${r.weight_kg != null ? fmtN(r.weight_kg) : '—'}</td><td>${r.waist_cm != null ? fmtN(r.waist_cm) : '—'}</td><td>${r.body_fat != null ? fmtN(r.body_fat) : '—'}</td><td><button class="icon-btn danger" data-act="bdDel" data-id="${r.id}" aria-label="Eliminar">✕</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
  const opt = v => v.trim() === '' ? null : num(v);
  return {
    html, click: {
      bdAdd: async () => {
        const rec = { client_id: cid, log_date: $('#bd-d').value || todayStr(), weight_kg: opt($('#bd-w').value), waist_cm: opt($('#bd-c').value), body_fat: opt($('#bd-f').value), notes: $('#bd-n').value.trim() || null };
        if (rec.weight_kg == null && rec.waist_cm == null && rec.body_fat == null) return toast('Indica al menos un valor', 'error');
        await DB.insert('body_logs', rec); toast('Registro guardado'); route();
      },
      bdDel: async el => { if (!confirm('¿Eliminar este registro?')) return; await DB.remove('body_logs', el.dataset.id); route(); }
    }
  };
}

/* =====================================================================
   Cumplimiento nutricional (últimos 14 días)
   ===================================================================== */
async function adherenceSection(cid, dayLink) {
  const plan = await activePlanFor(cid); const t = targetsOf(plan); const hasT = t && t.kcal > 0;
  const start = addDays(todayStr(), -13);
  const [logs, dailies] = await Promise.all([DB.select('food_logs', { eq: { client_id: cid }, gte: { log_date: start } }), DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: start } })]);
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const stats = days.map(d => {
    const dl = logs.filter(l => l.log_date === d); const dd = dailies.find(x => x.log_date === d);
    const m = dl.reduce((a, l) => addM(a, logM(l)), ZERO());
    let comp = null;
    if (plan) {
      const ch = (dd && dd.choices) || {}; let total = 0, done = 0;
      plan.meals.forEach(me => { const o = me.options.find(x => x.id === ch[me.id]) || me.options[0]; if (!o) return; total += o.items.length; done += o.items.filter(i => dl.some(l => l.plan_item_id === i.id)).length; });
      comp = total ? Math.round(done / total * 100) : null;
    }
    return { d, m, n: dl.length, comp, water: num(dd && dd.water_ml) };
  });
  const last7 = stats.slice(-7).filter(s => s.n);
  const avg = last7.length ? scaleM(last7.reduce((a, s) => addM(a, s.m), ZERO()), 1 / last7.length) : ZERO();
  const wAvg = stats.slice(-7).filter(s => s.water).reduce((a, s, _, arr) => a + s.water / arr.length, 0);
  const html = `
    <div class="stats3"><div><b>${last7.length}/7</b><small>Días con registro</small></div><div><b>${last7.length && plan ? Math.round(last7.reduce((a, s) => a + (s.comp || 0), 0) / last7.length) + ' %' : '—'}</b><small>Cumplimiento 7 días</small></div><div><b>${wAvg ? (wAvg / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' L' : '—'}</b><small>Agua promedio</small></div></div>
    <div class="card"><h3>Calorías por día (kcal)</h3>${vbars(stats.map((s, i) => ({ label: fmtDM(parseDay(s.d)), value: s.m.kcal, text: s.m.kcal >= 1000 ? r1(s.m.kcal / 1000) + 'k' : Math.round(s.m.kcal), hi: i === 13 })), 'Sin registros de alimentación.')}
      ${hasT ? `<p class="small muted">Objetivo diario: ${fmtInt(t.kcal)} kcal.</p>` : ''}</div>
    ${plan ? `<div class="card"><h3>Cumplimiento del plan por día (%)</h3>${vbars(stats.map((s, i) => ({ label: fmtDM(parseDay(s.d)), value: s.comp || 0, text: s.comp == null ? '' : s.comp, hi: i === 13 })), 'Sin registros.')}<p class="small muted">Porcentaje de alimentos del plan marcados como consumidos (incluye reemplazos).</p></div>` : ''}
    <div class="card"><h3>Promedio diario · últimos 7 días</h3>${macroBars(avg, hasT ? t : null)}<p class="small muted">Calculado sobre los días con registro.</p></div>
    <h2 class="sec">Días</h2>
    ${stats.slice().reverse().filter(s => s.n || s.d === todayStr()).map(s => `<a class="card row-link" href="${dayLink(s.d)}"><div><b>${esc(fmtDayLong(s.d))}</b><small class="muted">${s.n} registros${s.comp != null ? ' · cumplimiento ' + s.comp + ' %' : ''}</small></div><span class="kpi">${fmtInt(s.m.kcal)}<small>kcal</small></span></a>`).join('')}`;
  return { html };
}

/* Pestañas de Progreso del asesorado */
const progSeg = a => `<div class="chips scroll tabs2">${[['historial', 'Entrenamiento'], ['progreso', 'Ejercicios'], ['rendimiento', 'Rendimiento'], ['cuerpo', 'Cuerpo'], ['adherencia', 'Nutrición'], ['logros', 'Logros'], ['fotos', 'Fotos']].map(([k, l]) => `<a class="chip${a === k ? ' on' : ''}" href="#/${k}">${l}</a>`).join('')}</div>`;
async function vCuerpo() { const b = await bodySection(S.profile.id); if (typeof antropometriaTab === 'function' && !S.needsV6) { const a = await antropometriaTab(S.profile.id); if ((await DB.select('anthropometry', { eq: { client_id: S.profile.id }, limit: 1 })).length) { b.html += '<h2 class="sec">Antropometría</h2>' + a.html; Object.assign(b.click, a.click); } } const pj = S.intake && S.intake.status === 'approved' && typeof projectionHtml === 'function' ? projectionHtml(S.intake.calc) : ''; paint(progSeg('cuerpo') + b.html + pj, { click: b.click }, 'Progreso'); }
async function vAdherencia() { const a = await adherenceSection(S.profile.id, d => '#/hoy/' + d); paint(progSeg('adherencia') + a.html, {}, 'Progreso'); }

/* =====================================================================
   ENTRENADOR · Nutrición del asesorado
   ===================================================================== */
async function coachNutriTab(cid) {
  const plans = await DB.select('nutrition_plans', { eq: { client_id: cid }, order: 'created_at', asc: false });
  const html = `<div class="row-btns"><button class="btn primary" data-act="nNew">+ Nuevo plan</button><button class="btn" data-act="nTpl">Desde plantilla</button><a class="btn" href="#/diario/${cid}/${todayStr()}">Ver diario</a></div>
    ${plans.length ? plans.map(p => `<div class="card">
      <div class="day-h"><div><h3>${esc(p.name)}</h3><small class="muted">${esc(targetsLine(p))}</small></div><span class="badge ${p.review ? 'warnb' : p.active ? 'ok' : ''}">${p.review ? 'Borrador' : p.active ? 'Activo' : 'Inactivo'}</span></div>
      <div class="row-btns"><a class="btn sm primary" href="#/plan-nutri/${p.id}">Editar</a><a class="btn sm" href="#/plan-ver/${p.id}">Ver / PDF</a><button class="btn sm" data-act="nToggle" data-id="${p.id}" data-on="${p.active ? 1 : 0}">${p.active ? 'Desactivar' : 'Activar'}</button><button class="btn sm" data-act="nDup" data-id="${p.id}">Duplicar</button><button class="btn sm danger-outline" data-act="nDel" data-id="${p.id}">Eliminar</button></div>
    </div>`).join('') : '<div class="card empty"><p>Este asesorado no tiene plan nutricional. Crea uno nuevo o parte de una plantilla.</p></div>'}
    <p class="small muted">Solo un plan puede estar activo: es el que el asesorado ve en su diario.</p>`;
  return {
    html, click: {
      nNew: async () => { const name = prompt('Nombre del plan:', 'Plan nutricional · Fase 1'); if (!name) return; const id = await createBlankPlan({ clientId: cid, name: name.trim() }); location.hash = '#/plan-nutri/' + id; },
      nTpl: () => templatePickModal(cid),
      nToggle: async el => { const on = el.dataset.on === '1'; if (!on) await deactivatePlans(cid); await DB.update('nutrition_plans', el.dataset.id, { active: !on }); route(); },
      nDup: el => copyPlanModal(el.dataset.id),
      nDel: async el => { if (!confirm('¿Eliminar el plan nutricional? Los registros diarios del asesorado se conservan.')) return; await DB.remove('nutrition_plans', el.dataset.id); toast('Plan eliminado'); route(); }
    }
  };
}
async function coachSeguimientoTab(cid) {
  const a = await adherenceSection(cid, d => `#/diario/${cid}/${d}`);
  const b = await bodySection(cid);
  return { html: `<h2 class="sec">Nutrición · últimos 14 días</h2>${a.html}<h2 class="sec">Peso y medidas</h2>${b.html}`, click: b.click };
}

async function templatePickModal(cid) {
  const tpls = await DB.select('nutrition_plans', { eq: { is_template: true }, order: 'name' });
  if (!tpls.length) return toast('No hay plantillas. Créalas en la sección Plantillas.', 'error');
  modal(`${modalHead('Crear desde plantilla')}
    <label class="field"><span>Calorías objetivo para este asesorado (opcional)</span><input class="input" id="tp-k" inputmode="numeric" placeholder="Ej.: 2600"></label>
    <p class="small muted">Si indicas las calorías, las porciones y los objetivos de macronutrientes se escalan proporcionalmente.</p>
    <div class="pick-list">${tpls.map(p => `<button class="pick-item" data-act="pick" data-id="${p.id}"><b>${esc(p.name)}</b><small>${esc(targetsLine(p))}</small></button>`).join('')}</div>`, {
    click: { pick: async el => { const k = num($('#tp-k').value); closeModal(); const id = await copyPlan(el.dataset.id, { clientId: cid, kcal: k || null }); toast('Plan creado'); location.hash = '#/plan-nutri/' + id; } }
  });
}
async function copyPlanModal(planId) {
  const p = (await DB.select('nutrition_plans', { eq: { id: planId } }))[0];
  const clients = await DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' });
  modal(`${modalHead('Duplicar plan')}
    <label class="field"><span>Calorías objetivo de la copia</span><input class="input" id="cp-k" inputmode="numeric" value="${p.kcal ? Math.round(p.kcal) : ''}"></label>
    <p class="small muted">Las porciones y los objetivos se escalan proporcionalmente a las calorías indicadas.</p>
    <button class="pick-item tpl" data-act="to" data-id=""><b>Guardar como plantilla</b><small>Disponible en la sección Plantillas</small></button>
    <div class="pick-list tall">${clients.map(c => `<button class="pick-item" data-act="to" data-id="${c.id}"><b>${esc(c.full_name || c.email)}</b><small>${esc(c.email || '')}</small></button>`).join('')}</div>`, {
    click: { to: async el => { const k = num($('#cp-k').value); closeModal(); const id = await copyPlan(planId, { clientId: el.dataset.id || null, kcal: k || null, name: el.dataset.id ? null : 'Plantilla · ' + p.name.replace(/^Plantilla\s*·\s*/, '') }); toast(el.dataset.id ? 'Plan asignado' : 'Plantilla guardada'); location.hash = '#/plan-nutri/' + id; } }
  });
}

/* Calculadora de requerimiento energético (Mifflin-St Jeor) */
function kcalCalcModal(plan, after) {
  let st = { sex: 'M', age: 25, w: 70, h: 172, af: 1.55, adj: 0, pk: 2, fk: 1 };
  try { st = Object.assign(st, JSON.parse(localStorage.getItem('dp_calc_' + plan.id) || '{}')); } catch (e) { }
  const calc = () => {
    const tmb = 10 * st.w + 6.25 * st.h - 5 * st.age + (st.sex === 'M' ? 5 : -161);
    const get = tmb * st.af; const kcal = Math.round(get * (1 + st.adj / 100) / 10) * 10;
    const p = Math.round(st.w * st.pk), f = Math.round(st.w * st.fk), c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { tmb, get, kcal, p, f, c };
  };
  const res = () => { const r = calc(); return `<table class="tbl"><tbody><tr><td>Gasto basal (Mifflin-St Jeor)</td><td>${fmtInt(r.tmb)} kcal</td></tr><tr><td>Gasto total (× ${st.af})</td><td>${fmtInt(r.get)} kcal</td></tr><tr><td><b>Objetivo (${st.adj > 0 ? '+' : ''}${st.adj} %)</b></td><td><b>${fmtInt(r.kcal)} kcal</b></td></tr><tr><td>Proteína (${st.pk} g/kg)</td><td>${r.p} g</td></tr><tr><td>Grasa (${st.fk} g/kg)</td><td>${r.f} g</td></tr><tr><td>Carbohidratos (resto)</td><td>${r.c} g</td></tr></tbody></table>`; };
  modal(`${modalHead('Calculadora de requerimientos')}
    <div class="rex-grid"><label><span>Sexo</span><select class="input" data-k="sex"><option value="M"${st.sex === 'M' ? ' selected' : ''}>Hombre</option><option value="F"${st.sex === 'F' ? ' selected' : ''}>Mujer</option></select></label>
      <label><span>Edad</span><input class="input" data-k="age" inputmode="numeric" value="${st.age}"></label>
      <label><span>Peso kg</span><input class="input" data-k="w" inputmode="decimal" value="${st.w}"></label>
      <label><span>Estatura cm</span><input class="input" data-k="h" inputmode="numeric" value="${st.h}"></label></div>
    <label class="field"><span>Actividad física</span><select class="input" data-k="af">${ACTIVITY.map(([v, l]) => `<option value="${v}"${v === st.af ? ' selected' : ''}>${v} · ${esc(l)}</option>`).join('')}</select></label>
    <div class="rex-grid three"><label><span>Ajuste %</span><input class="input" data-k="adj" inputmode="numeric" value="${st.adj}"></label><label><span>Proteína g/kg</span><input class="input" data-k="pk" inputmode="decimal" value="${st.pk}"></label><label><span>Grasa g/kg</span><input class="input" data-k="fk" inputmode="decimal" value="${st.fk}"></label></div>
    <p class="small muted">Ajuste: negativo para déficit (p. ej. −15), positivo para superávit (p. ej. +10).</p>
    <div id="kc-res">${res()}</div>
    <button class="btn primary block" data-act="apply">Aplicar objetivos al plan</button>`, {
    input: t => { if (t.dataset.k) { st[t.dataset.k] = t.dataset.k === 'sex' ? t.value : num(t.value); $('#kc-res').innerHTML = res(); } },
    change: t => { if (t.dataset.k) { st[t.dataset.k] = t.dataset.k === 'sex' ? t.value : num(t.value); $('#kc-res').innerHTML = res(); } },
    click: { apply: async () => { const r = calc(); try { localStorage.setItem('dp_calc_' + plan.id, JSON.stringify(st)); } catch (e) { } await DB.update('nutrition_plans', plan.id, { kcal: r.kcal, protein_g: r.p, carbs_g: r.c, fat_g: r.f }); closeModal(); toast('Objetivos aplicados'); after(); } }
  });
}

/* =====================================================================
   ENTRENADOR · Editor del plan nutricional
   ===================================================================== */
async function vPlanEditor(id) {
  const plan = await loadPlanFull(id);
  if (!plan) return paint('<div class="card empty"><p>Plan no encontrado.</p></div>');
  const client = plan.client_id ? (await DB.select('profiles', { eq: { id: plan.client_id } }))[0] : null;
  const tot = planAvgTotals(plan); const t = targetsOf(plan);
  const back = plan.is_template ? '#/plantillas' : `#/asesorado/${plan.client_id}/nutricion`;
  const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
  const rerender = () => keepScroll(() => vPlanEditor(id));
  const inp = (tbl, rid, f, v, extra = '') => `<input class="input" data-tbl="${tbl}" data-id="${rid}" data-f="${f}" value="${esc(v ?? '')}" ${extra}>`;

  let html = `<a class="linkbtn" href="${back}">← ${esc(client ? client.full_name : 'Plantillas')}</a>
    ${plan.review ? `<div class="warn-box small">Borrador generado automáticamente a partir de la valoración inicial. Revísalo y publícalo con «Aprobar y publicar» en la pestaña <a href="#/asesorado/${plan.client_id}/valoracion">Valoración</a>.</div>` : ''}
    <div class="card">
      <label class="field"><span>Nombre del plan</span>${inp('nutrition_plans', id, 'name', plan.name)}</label>
      <div class="rex-grid"><label><span>kcal</span>${inp('nutrition_plans', id, 'kcal', plan.kcal, 'inputmode="numeric" data-type="num"')}</label><label><span>Proteína g</span>${inp('nutrition_plans', id, 'protein_g', plan.protein_g, 'inputmode="numeric" data-type="num"')}</label><label><span>Carbs g</span>${inp('nutrition_plans', id, 'carbs_g', plan.carbs_g, 'inputmode="numeric" data-type="num"')}</label><label><span>Grasa g</span>${inp('nutrition_plans', id, 'fat_g', plan.fat_g, 'inputmode="numeric" data-type="num"')}</label></div>
      ${fromMacros ? `<p class="small muted">Distribución: P ${Math.round(t.protein * 4 / fromMacros * 100)} % · C ${Math.round(t.carbs * 4 / fromMacros * 100)} % · G ${Math.round(t.fat * 9 / fromMacros * 100)} % (${fmtInt(fromMacros)} kcal según macronutrientes)</p>` : ''}
      <label class="field"><span>Agua diaria (ml)</span>${inp('nutrition_plans', id, 'water_ml', plan.water_ml, 'inputmode="numeric" data-type="int"')}</label>
      ${S.needsV4 ? '' : `<label class="field"><span>Carbohidratos en días de descanso (g) · vacío = sin ciclado</span>${inp('nutrition_plans', id, 'rest_carbs_g', plan.rest_carbs_g, 'inputmode="numeric" data-type="num"')}</label>
      <div class="field"><span>Días de entreno (usan las metas de día de entreno)</span><div class="chips">${WEEKDAYS.slice(1).concat('Domingo').map(dn => `<button class="chip${(plan.train_days || []).includes(dn) ? ' on' : ''}" data-act="tday" data-v="${dn}">${dn.slice(0, 3)}</button>`).join('')}</div></div>`}
      <label class="field"><span>Indicaciones generales</span><textarea class="input" rows="3" data-tbl="nutrition_plans" data-id="${id}" data-f="notes" placeholder="Hidratación, horarios, suplementación, comidas libres…">${esc(plan.notes || '')}</textarea></label>
      ${plan.is_template ? '' : `<label class="check"><input type="checkbox" data-tbl="nutrition_plans" data-id="${id}" data-f="active" ${plan.active ? 'checked' : ''}> Plan activo (visible en el diario del asesorado)</label>`}
      <div class="row-btns"><button class="btn sm" data-act="calc">Calculadora</button><button class="btn sm" data-act="setT">Objetivos = totales del plan</button><button class="btn sm" data-act="scale">Ajustar porciones a las kcal objetivo</button></div>
    </div>
    <div class="card"><h3>Plan vs objetivo</h3>${macroBars(tot, t.kcal ? t : null)}<p class="small muted">Promedio diario considerando la rotación de las opciones de cada comida.</p></div>`;

  plan.meals.forEach((m, mi) => {
    const sel = m.options.find(o => o.id === S.editOpt[m.id]) || m.options[0];
    const mav = mealAvg(m);
    html += `<div class="card meal-ed">
      <div class="day-ed-h">${inp('plan_meals', m.id, 'name', m.name, 'class="input title-in"').replace('class="input" data-tbl', 'data-tbl')}
        <input class="input time-in" data-tbl="plan_meals" data-id="${m.id}" data-f="time_label" value="${esc(m.time_label || '')}" placeholder="Hora">
        <button class="icon-btn" data-act="mvMeal" data-id="${m.id}" data-dir="-1" ${mi === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button class="icon-btn" data-act="mvMeal" data-id="${m.id}" data-dir="1" ${mi === plan.meals.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
        <button class="icon-btn danger" data-act="delMeal" data-id="${m.id}" aria-label="Eliminar comida">✕</button></div>
      <textarea class="input" rows="2" data-tbl="plan_meals" data-id="${m.id}" data-f="instructions" placeholder="Instrucciones de la comida">${esc(m.instructions || '')}</textarea>
      <div class="chips">${m.options.map(o => `<button class="chip${o === sel ? ' on' : ''}" data-act="selOpt" data-meal="${m.id}" data-id="${o.id}">${esc(o.name)} · ${fmtInt(optionTotals(o).kcal)}</button>`).join('')}<button class="chip add" data-act="addOpt" data-meal="${m.id}" data-n="${m.options.length}">+ Opción</button>${typeof autoOptionFor === 'function' ? `<button class="chip add" data-act="autoOpt" data-meal="${m.id}" data-n="${m.options.length}">+ Opción automática</button>` : ''}</div>
      ${sel ? `<div class="opt-ed">
        <div class="day-ed-h"><input class="input" data-tbl="plan_options" data-id="${sel.id}" data-f="name" value="${esc(sel.name)}" aria-label="Nombre de la opción">
          <button class="icon-btn" data-act="dupOpt" data-id="${sel.id}" data-meal="${m.id}" data-n="${m.options.length}" aria-label="Duplicar opción">⧉</button>
          <button class="icon-btn danger" data-act="delOpt" data-id="${sel.id}" aria-label="Eliminar opción">✕</button></div>
        ${sel.items.map((it, ii) => { const f = foodOf(it.food_id); const mm = f ? macrosFor(f, it.grams) : ZERO(); return `<div class="pi">
          <div class="rex-h"><b>${esc(f ? f.name : 'Alimento eliminado')}</b><span class="rex-btns">
            <button class="icon-btn" data-act="mvItem" data-id="${it.id}" data-opt="${sel.id}" data-dir="-1" ${ii === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
            <button class="icon-btn" data-act="mvItem" data-id="${it.id}" data-opt="${sel.id}" data-dir="1" ${ii === sel.items.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
            <button class="icon-btn" data-act="chItem" data-id="${it.id}" aria-label="Cambiar alimento">⇄</button>
            <button class="icon-btn danger" data-act="delItem" data-id="${it.id}" aria-label="Quitar">✕</button></span></div>
          <div class="pi-row"><label><span>Gramos</span><input class="input" data-tbl="plan_items" data-id="${it.id}" data-f="grams" data-type="num" inputmode="decimal" value="${r1(num(it.grams))}"></label>
            <div class="small muted">${esc(unitText(f, it.grams))}<br>${macroLine(mm)}</div></div>
          <input class="input" data-tbl="plan_items" data-id="${it.id}" data-f="note" value="${esc(it.note || '')}" placeholder="Nota (opcional): preparación, marca…">
        </div>`; }).join('')}
        <p class="opt-tot small"><b>Total ${esc(sel.name)}:</b> ${macroLine(optionTotals(sel))}</p>
        ${S.needsV6 || typeof recipeSteps !== 'function' ? '' : `<label class="field"><span>Preparación (una instrucción por línea; vacío = preparación automática)</span><textarea class="input" rows="3" data-tbl="plan_options" data-id="${sel.id}" data-f="recipe" placeholder="${esc(recipeSteps(Object.assign({}, sel, { recipe: '' })).join('\n'))}">${esc(sel.recipe || '')}</textarea></label>`}
      </div>` : ''}
      <button class="btn sm block" data-act="addItem" data-meal="${m.id}" data-opt="${sel ? sel.id : ''}" data-n="${sel ? sel.items.length : 0}">+ Añadir alimento</button>
      ${m.options.length > 1 ? `<p class="small muted">Promedio de la comida: ${macroLine(mav)}</p>` : ''}
    </div>`;
  });
  html += `<button class="btn ghost block" data-act="addMeal">+ Añadir comida</button>
    <div class="row-btns"><a class="btn" href="#/plan-ver/${id}">Ver documento / PDF</a>${plan.is_template ? '' : `<a class="btn" href="#/compras/${id}">Lista de compras</a>`}</div>
    <p class="small muted center">Los cambios se guardan automáticamente.</p>`;

  const reorder = async (table, list, idx, dir) => {
    const j = idx + dir; if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    for (let i = 0; i < list.length; i++) if (list[i].position !== i) await DB.update(table, list[i].id, { position: i });
    rerender();
  };
  const findOpt = oid => { for (const m of plan.meals) for (const o of m.options) if (o.id === oid) return o; return null; };
  paint(html, {
    change: async t => {
      const { tbl, id: rid, f } = t.dataset; if (!tbl) return;
      let v = t.type === 'checkbox' ? t.checked : t.value.trim();
      if (t.dataset.type === 'int') v = t.value.trim() === '' ? null : Math.round(num(t.value));
      if (t.dataset.type === 'num') v = t.value.trim() === '' ? null : num(t.value);
      if (tbl === 'plan_items' && f === 'grams' && !(v > 0)) { toast('Indica una cantidad mayor que cero', 'error'); return rerender(); }
      if (tbl === 'nutrition_plans' && f === 'active' && v && plan.client_id) await deactivatePlans(plan.client_id, id);
      await DB.update(tbl, rid, Object.assign({ [f]: v }, tbl === 'nutrition_plans' && f === 'active' && v ? { review: false } : {}));
      if ((tbl === 'plan_items' && f === 'grams') || (tbl === 'nutrition_plans' && /kcal|_g$/.test(f))) rerender(); else toast('Guardado');
    },
    click: {
      calc: () => kcalCalcModal(plan, rerender),
      tday: async el => { const v = el.dataset.v; const cur = plan.train_days || []; await DB.update('nutrition_plans', id, { train_days: cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v) }); rerender(); },
      setT: async () => { if (!tot.kcal) return toast('El plan no tiene alimentos', 'error'); await DB.update('nutrition_plans', id, { kcal: Math.round(tot.kcal / 10) * 10, protein_g: Math.round(tot.protein), carbs_g: Math.round(tot.carbs), fat_g: Math.round(tot.fat) }); toast('Objetivos actualizados'); rerender(); },
      scale: async () => {
        if (!t.kcal || !tot.kcal) return toast('Define las kcal objetivo y añade alimentos', 'error');
        const fct = t.kcal / tot.kcal;
        if (!confirm(`¿Ajustar todas las porciones (×${fct.toFixed(2)}) para llegar a ${fmtInt(t.kcal)} kcal?`)) return;
        for (const m of plan.meals) for (const o of m.options) for (const i of o.items) await DB.update('plan_items', i.id, { grams: Math.max(1, roundG(num(i.grams) * fct)) });
        toast('Porciones ajustadas'); rerender();
      },
      selOpt: el => { S.editOpt[el.dataset.meal] = el.dataset.id; rerender(); },
      addOpt: async el => { const [o] = await DB.insert('plan_options', { meal_id: el.dataset.meal, name: 'Opción ' + (+el.dataset.n + 1), position: +el.dataset.n }); S.editOpt[el.dataset.meal] = o.id; rerender(); },
      autoOpt: async el => {
        const meal = plan.meals.find(x => x.id === el.dataset.meal); el.disabled = true;
        const o = await autoOptionFor(plan, meal);
        const [no] = await DB.insert('plan_options', { meal_id: meal.id, name: o.name, position: +el.dataset.n });
        await DB.insert('plan_items', o.items.map((i, ii) => ({ option_id: no.id, food_id: i.food_id, grams: i.grams, position: ii, note: i.note || '' })));
        S.editOpt[meal.id] = no.id; toast('Opción generada con las mismas metas de la comida'); rerender();
      },
      dupOpt: async el => {
        const src = findOpt(el.dataset.id);
        const [o] = await DB.insert('plan_options', { meal_id: el.dataset.meal, name: 'Opción ' + (+el.dataset.n + 1), position: +el.dataset.n });
        await DB.insert('plan_items', src.items.map(i => ({ option_id: o.id, food_id: i.food_id, grams: i.grams, position: i.position, note: i.note })));
        S.editOpt[el.dataset.meal] = o.id; rerender();
      },
      delOpt: async el => { if (!confirm('¿Eliminar esta opción y sus alimentos?')) return; await DB.remove('plan_options', el.dataset.id); rerender(); },
      addItem: el => pickFood('Añadir alimento', async fid => {
        let oid = el.dataset.opt;
        if (!oid) { const [o] = await DB.insert('plan_options', { meal_id: el.dataset.meal, name: 'Opción 1', position: 0 }); oid = o.id; }
        const f = foodOf(fid);
        await DB.insert('plan_items', { option_id: oid, food_id: fid, grams: num(f.unit_grams) && num(f.unit_grams) >= 20 ? num(f.unit_grams) : 100, position: +el.dataset.n, note: '' });
        rerender();
      }),
      chItem: el => pickFood('Cambiar alimento', async fid => { await DB.update('plan_items', el.dataset.id, { food_id: fid }); rerender(); }),
      delItem: async el => { await DB.remove('plan_items', el.dataset.id); rerender(); },
      mvItem: el => { const o = findOpt(el.dataset.opt); return reorder('plan_items', o.items.slice(), o.items.findIndex(i => i.id === el.dataset.id), +el.dataset.dir); },
      mvMeal: el => reorder('plan_meals', plan.meals.slice(), plan.meals.findIndex(m => m.id === el.dataset.id), +el.dataset.dir),
      delMeal: async el => { if (!confirm('¿Eliminar esta comida con todas sus opciones?')) return; await DB.remove('plan_meals', el.dataset.id); rerender(); },
      addMeal: async () => { const name = prompt('Nombre de la comida:', 'Comida ' + (plan.meals.length + 1)); if (!name) return; const [m] = await DB.insert('plan_meals', { plan_id: id, name: name.trim(), time_label: '', instructions: '', position: plan.meals.length }); await DB.insert('plan_options', { meal_id: m.id, name: 'Opción 1', position: 0 }); rerender(); }
    }
  }, plan.is_template ? 'Plantilla nutricional' : 'Plan nutricional');
}

/* =====================================================================
   ENTRENADOR · Plantillas
   ===================================================================== */
async function vPlantillas() {
  const np = await DB.select('nutrition_plans', { eq: { is_template: true }, order: 'name' });
  const rt = await DB.select('routines', { eq: { is_template: true }, order: 'name' });
  const days = await DB.select('routine_days', { inn: { routine_id: rt.map(r => r.id) } });
  const html = `<p class="small muted">Las plantillas se asignan a cualquier asesorado. Los planes nutricionales se escalan a las calorías de cada persona.</p>
    <h2 class="sec">Planes nutricionales</h2>
    <button class="btn primary block" data-act="newN">+ Nueva plantilla nutricional</button>
    ${np.map(p => `<div class="card"><h3>${esc(p.name)}</h3><small class="muted">${esc(targetsLine(p))}</small>
      <div class="row-btns"><a class="btn sm primary" href="#/plan-nutri/${p.id}">Editar</a><a class="btn sm" href="#/plan-ver/${p.id}">Ver / PDF</a><button class="btn sm" data-act="asgN" data-id="${p.id}">Asignar</button><button class="btn sm danger-outline" data-act="delN" data-id="${p.id}">Eliminar</button></div></div>`).join('') || '<p class="muted small">Sin plantillas nutricionales.</p>'}
    <h2 class="sec">Rutinas de entrenamiento</h2>
    <button class="btn primary block" data-act="newR">+ Nueva plantilla de rutina</button>
    ${rt.map(r => `<div class="card"><h3>${esc(r.name)}</h3><small class="muted">${days.filter(d => d.routine_id === r.id).length} días</small>
      <div class="row-btns"><a class="btn sm primary" href="#/rutina/${r.id}">Editar</a><button class="btn sm" data-act="asgR" data-id="${r.id}">Asignar</button><button class="btn sm danger-outline" data-act="delR" data-id="${r.id}">Eliminar</button></div></div>`).join('') || '<p class="muted small">Sin plantillas de rutina. También puedes guardar como plantilla la rutina de un asesorado con «Duplicar».</p>'}`;
  paint(html, {
    click: {
      newN: async () => { const name = prompt('Nombre de la plantilla:', 'Plantilla · Recomposición'); if (!name) return; const id = await createBlankPlan({ isTemplate: true, name: name.trim() }); location.hash = '#/plan-nutri/' + id; },
      asgN: el => copyPlanModal(el.dataset.id),
      delN: async el => { if (!confirm('¿Eliminar la plantilla?')) return; await DB.remove('nutrition_plans', el.dataset.id); route(); },
      newR: async () => { const name = prompt('Nombre de la plantilla:', 'Plantilla · Fuerza 3 días'); if (!name) return; const [r] = await DB.insert('routines', { client_id: null, is_template: true, name: name.trim(), notes: '', active: false }); await DB.insert('routine_days', { routine_id: r.id, name: 'Día 1', position: 0 }); location.hash = '#/rutina/' + r.id; },
      asgR: el => duplicateModal(el.dataset.id),
      delR: async el => { if (!confirm('¿Eliminar la plantilla de rutina?')) return; await DB.remove('routines', el.dataset.id); route(); }
    }
  }, 'Plantillas');
}

/* =====================================================================
   ENTRENADOR · Biblioteca de alimentos
   ===================================================================== */
const libSeg = a => `<div class="seg tabs">${[['biblioteca', 'Ejercicios'], ['alimentos', 'Alimentos'], ['lecciones-admin', 'Lecciones']].map(([k, l]) => `<a class="${a === k ? 'on' : ''}" href="#/${k}">${l}</a>`).join('')}</div>`;
function vAlimentos() {
  let cat = sessionStorage.getItem('food_cat') || '', q = '';
  const listHtml = () => {
    const ql = norm(q);
    const list = S.foods.filter(f => (!cat || f.category === cat) && (!ql || norm(f.name).includes(ql)));
    return `<p class="small muted">${list.length} alimentos · valores por 100 g</p>` + list.map(f => `<a class="card row-link" href="#/alimento/${f.id}"><div><b>${esc(f.name)}</b><small class="muted">${esc(f.category)} · ${fmtInt(f.kcal)} kcal · P ${fmtN(f.protein)} · C ${fmtN(f.carbs)} · G ${fmtN(f.fat)}</small></div><span class="chev">›</span></a>`).join('');
  };
  paint(`${libSeg('alimentos')}<a class="btn primary block" href="#/alimento/nuevo">+ Nuevo alimento</a>
    <input class="input" id="fq" placeholder="Buscar alimento">
    <div class="chips scroll">${['', ...FOOD_CATS].map(c => `<button class="chip${c === cat ? ' on' : ''}" data-act="c" data-c="${esc(c)}">${esc(c || 'Todos')}</button>`).join('')}</div>
    <div id="food-list">${listHtml()}</div>`, {
    input: t => { if (t.id === 'fq') { q = t.value; $('#food-list').innerHTML = listHtml(); } },
    click: { c: el => { cat = el.dataset.c; sessionStorage.setItem('food_cat', cat); document.querySelectorAll('[data-act=c]').forEach(c => c.classList.toggle('on', c.dataset.c === cat)); $('#food-list').innerHTML = listHtml(); } }
  }, 'Biblioteca');
}
function vAlimento(id) {
  const isNew = id === 'nuevo';
  const f = isNew ? { name: '', category: sessionStorage.getItem('food_cat') || 'Proteínas', kcal: '', protein: '', carbs: '', fat: '', fiber: '', unit_name: '', unit_grams: '' } : foodOf(id);
  if (!f) return paint('<div class="card"><p>Alimento no encontrado.</p></div>');
  const fld = (n, l, v) => `<label><span>${l}</span><input class="input" name="${n}" inputmode="decimal" value="${esc(v ?? '')}"></label>`;
  paint(`<a class="linkbtn" href="#/alimentos">← Alimentos</a>
    <form id="ff" class="card">
      <label class="field"><span>Nombre</span><input class="input" name="name" required value="${esc(f.name)}" placeholder="Indica si es cocido o crudo"></label>
      <label class="field"><span>Grupo</span><select class="input" name="category">${FOOD_CATS.map(c => `<option${c === f.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <p class="small muted">Valores por 100 g. El grupo define con qué alimentos se calculan los reemplazos equivalentes.</p>
      <div class="rex-grid">${fld('kcal', 'kcal', f.kcal)}${fld('protein', 'Proteína g', f.protein)}${fld('carbs', 'Carbs g', f.carbs)}${fld('fat', 'Grasa g', f.fat)}</div>
      <p class="small muted" id="ff-chk"></p>
      ${S.needsV5 || typeof foodMeta !== 'function' ? '' : (() => { const mt = isNew ? { cost: 2, uses: '' } : foodMeta(f); return `<div class="rex-grid">${S.needsV6 ? '' : fld('price_kg', 'Precio por kg o L ($)', f.price_kg)}<label><span>Costo (generador de menús)</span><select class="input" name="cost_tier">${[1, 2, 3].map(c => `<option value="${c}"${c === mt.cost ? ' selected' : ''}>${COST_LBL[c]}</option>`).join('')}</select></label></div>
      <div class="field"><span>Se usa en</span><div class="chips">${Object.entries(USE_LBL).map(([k, l]) => `<label class="chip"><input type="checkbox" name="mu_${k}" ${mt.uses.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <p class="small muted">El generador de menús elige los alimentos según el presupuesto de cada asesorado y el tipo de comida. Sin marcar, se usa la clasificación por grupo.</p>`; })()}
      <div class="rex-grid three">${fld('fiber', 'Fibra g', f.fiber)}<label><span>Medida casera</span><input class="input" name="unit_name" value="${esc(f.unit_name || '')}" placeholder="unidad, taza…"></label>${fld('unit_grams', 'g por medida', f.unit_grams)}</div>
      <button class="btn primary block" type="submit">${isNew ? 'Crear alimento' : 'Guardar cambios'}</button>
    </form>
    ${isNew ? '' : '<button class="btn danger-outline block" data-act="del">Eliminar alimento</button>'}`, {
    input: () => chk(),
    click: { del: async () => { if (!confirm('¿Eliminar este alimento?')) return; await DB.remove('foods', id); await loadFoods(); toast('Alimento eliminado'); location.hash = '#/alimentos'; } }
  }, isNew ? 'Nuevo alimento' : 'Editar alimento');
  const chk = () => { const fd = new FormData($('#ff')); const k = num(fd.get('protein')) * 4 + num(fd.get('carbs')) * 4 + num(fd.get('fat')) * 9; $('#ff-chk').textContent = k ? `Energía calculada por macronutrientes: ${fmtInt(k)} kcal.` : ''; };
  chk();
  $('#ff').onsubmit = ev => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const rec = { name: fd.name.trim(), category: fd.category, kcal: num(fd.kcal), protein: num(fd.protein), carbs: num(fd.carbs), fat: num(fd.fat), fiber: num(fd.fiber), unit_name: fd.unit_name.trim() || null, unit_grams: num(fd.unit_grams) || null };
    if (fd.price_kg !== undefined) rec.price_kg = num(fd.price_kg) || null;
    if (fd.cost_tier) { rec.cost_tier = num(fd.cost_tier); const mu = Object.keys(USE_LBL).filter(k => fd['mu_' + k]); rec.meal_use = mu.length ? mu : null; }
    if (!rec.name) return toast('Escribe el nombre', 'error');
    if (S.foods.some(x => norm(x.name) === norm(rec.name) && x.id !== id)) return toast('Ya existe un alimento con ese nombre', 'error');
    safe(async () => {
      if (isNew) { const [n] = await DB.insert('foods', rec); await loadFoods(); toast('Alimento creado'); location.hash = '#/alimento/' + n.id; }
      else { await DB.update('foods', id, rec); await loadFoods(); toast('Cambios guardados'); route(); }
    });
  };
}

/* =====================================================================
   Datos de demostración (nutrición)
   ===================================================================== */
function buildNutritionDemo(d) {
  const iso = new Date().toISOString();
  Object.assign(d, { foods: [], nutrition_plans: [], plan_meals: [], plan_options: [], plan_items: [], food_logs: [], daily_logs: [], body_logs: [] });
  for (const c of (window.SEED_FOODS || [])) for (const [name, kcal, protein, carbs, fat, fiber, un, ug] of c.x)
    d.foods.push({ id: uid(), name, category: c.cat, kcal, protein, carbs, fat, fiber: fiber || 0, unit_name: un || '', unit_grams: ug || null, created_at: iso });
  const F = n => { const x = d.foods.find(f => f.name === n); if (!x) throw new Error('Falta alimento demo: ' + n); return x; };
  const BASE = NUTRI_BASE;
  const mk = (clientId, name, factor, water, notes) => {
    const p = { id: uid(), client_id: clientId, is_template: !clientId, name, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, water_ml: water, notes, active: !!clientId, created_at: new Date(Date.now() - 20 * 864e5).toISOString() };
    d.nutrition_plans.push(p); let tot = ZERO();
    BASE.forEach(([mn, tl, ins, opts], mi) => {
      const m = { id: uid(), plan_id: p.id, name: mn, time_label: tl, instructions: ins, position: mi, created_at: iso }; d.plan_meals.push(m);
      let mt = ZERO();
      opts.forEach(([on, items], oi) => {
        const o = { id: uid(), meal_id: m.id, name: on, position: oi, created_at: iso }; d.plan_options.push(o);
        items.forEach(([fn, g], ii) => { const f = F(fn); const gg = Math.max(1, roundG(g * factor)); d.plan_items.push({ id: uid(), option_id: o.id, food_id: f.id, grams: gg, position: ii, note: '', created_at: iso }); mt = addM(mt, macrosFor(f, gg)); });
      });
      tot = addM(tot, scaleM(mt, 1 / opts.length));
    });
    Object.assign(p, { kcal: Math.round(tot.kcal / 10) * 10, protein_g: Math.round(tot.protein), carbs_g: Math.round(tot.carbs), fat_g: Math.round(tot.fat) });
    return p;
  };
  mk(null, 'Plantilla · Estándar 5 comidas', 1, 2500, 'Hidratación: 35 ml por kg de peso al día.\nComida libre: una a la semana, sin superar la porción habitual.');
  const pA = mk('demo-ana', 'Plan competencia · Fase 1', 1.25, 3000, 'Días de partido: añadir 500 ml de bebida hidratante deportiva durante el juego y una fruta en cada cambio de set prolongado.\nCreatina: 5 g diarios con el desayuno.');
  const pJ = mk('demo-juan', 'Plan recomposición · Fase 1', 1, 2800, 'Mantener un consumo de 8.000 pasos diarios.\nCena al menos 2 horas antes de dormir.');

  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const saved = S.foods; S.foods = d.foods;
  const today = todayStr();
  const fillLogs = (plan, cid, from, to, adherence) => {
    const meals = d.plan_meals.filter(m => m.plan_id === plan.id).sort((a, b) => a.position - b.position);
    for (let k = from; k <= to; k++) {
      const date = addDays(today, k); const choices = {};
      meals.forEach((m, mi) => {
        if (k === 0 && mi > 1) return;
        const opts = d.plan_options.filter(o => o.meal_id === m.id).sort((a, b) => a.position - b.position);
        const o = opts[(k + mi + 20) % opts.length]; choices[m.id] = o.id;
        d.plan_items.filter(i => i.option_id === o.id).forEach(i => {
          if (rnd() > adherence) return;
          let f = d.foods.find(x => x.id === i.food_id), g = i.grams;
          if (rnd() < 0.1) { const e = equivalents(f, g, 2)[0]; if (e) { f = e.food; g = e.grams; } }
          else g = roundG(g * (0.9 + rnd() * 0.2));
          const mm = macrosFor(f, g);
          d.food_logs.push({ id: uid(), client_id: cid, log_date: date, meal_id: m.id, meal_name: m.name, food_id: f.id, plan_item_id: i.id, name: f.name, grams: g, kcal: r1(mm.kcal), protein: r1(mm.protein), carbs: r1(mm.carbs), fat: r1(mm.fat), created_at: iso });
        });
      });
      d.daily_logs.push({ id: uid(), client_id: cid, log_date: date, water_ml: k === 0 ? 1000 : 1750 + Math.round(rnd() * 5) * 250, choices, notes: '', created_at: iso });
    }
  };
  fillLogs(pA, 'demo-ana', -9, 0, 0.92);
  fillLogs(pJ, 'demo-juan', -6, -1, 0.8);
  S.foods = saved;
  [[-49, 92.4, 101], [-42, 91.8, 100.5], [-35, 91.5, 100], [-28, 90.9, 99.2], [-21, 90.6, 98.8], [-14, 90.1, 98.1], [-7, 89.8, 97.6], [-1, 89.3, 97.0]]
    .forEach(([k, w, c]) => d.body_logs.push({ id: uid(), client_id: 'demo-juan', log_date: addDays(today, k), weight_kg: w, waist_cm: c, body_fat: null, notes: '', created_at: iso }));
  [[-42, 57.6], [-28, 57.9], [-14, 58.3], [-2, 58.6]]
    .forEach(([k, w]) => d.body_logs.push({ id: uid(), client_id: 'demo-ana', log_date: addDays(today, k), weight_kg: w, waist_cm: null, body_fat: null, notes: '', created_at: iso }));
  // plantilla de rutina de ejemplo: copia de la rutina de Ana
  const rA = d.routines.find(r => r.client_id === 'demo-ana');
  if (rA) {
    const nr = { ...rA, id: uid(), client_id: null, is_template: true, name: 'Plantilla · Fuerza para tenis 3 días', active: false };
    d.routines.push(nr);
    d.routine_days.filter(x => x.routine_id === rA.id).forEach(dy => { const nd = { ...dy, id: uid(), routine_id: nr.id }; d.routine_days.push(nd); d.routine_exercises.filter(x => x.day_id === dy.id).forEach(re => d.routine_exercises.push({ ...re, id: uid(), day_id: nd.id })); });
  }
}
