'use strict';
/* =====================================================================
   Deuce Point · Generador de menús propios
   Construye cada comida a partir de la base de alimentos según la
   estructura del tipo de comida (desayuno, refrigerio, almuerzo, cena),
   las exclusiones, los alimentos preferidos, el presupuesto, el momento
   del día con más hambre y el horario de entrenamiento. Las porciones de
   cada opción se calculan para cumplir la proteína, los carbohidratos y
   la grasa asignados a esa comida.
   Depende de app.js, nutri.js y auto.js.
   ===================================================================== */

/* Clasificación de los alimentos de la base inicial.
   [tipo, usos (D desayuno · S refrigerio · A almuerzo y cena), costo (1 económico · 2 moderado · 3 costoso), nombre corto] */
const FOOD_META = {
  'Pechuga de pollo cocida': ['carne', 'A', 2, 'Pollo'], 'Muslo de pollo sin piel cocido': ['carne', 'A', 1, 'Muslo de pollo'],
  'Carne de res magra cocida': ['carne', 'A', 2, 'Carne de res'], 'Carne molida de res magra cocida': ['carne', 'A', 2, 'Carne molida'],
  'Lomo de cerdo cocido': ['carne', 'A', 2, 'Lomo de cerdo'], 'Hígado de res cocido': ['carne', 'A', 1, 'Hígado', 1],
  'Tilapia cocida': ['pescado', 'A', 2, 'Tilapia'], 'Salmón cocido': ['pescado', 'A', 3, 'Salmón'], 'Camarón cocido': ['pescado', 'A', 3, 'Camarón'],
  'Atún en agua escurrido': ['atun', 'SA', 2, 'Atún'], 'Sardinas en aceite escurridas': ['atun', 'SA', 1, 'Sardinas'],
  'Huevo entero': ['huevo', 'DSA', 1, 'Huevo'], 'Clara de huevo': ['clara', 'DS', 1, 'Claras'], 'Jamón de pollo': ['fiambre', 'DS', 2, 'Jamón de pollo'],
  'Tofu firme': ['tofu', 'A', 2, 'Tofu'],
  'Leche entera': ['leche', 'DS', 1, 'Leche'], 'Leche descremada': ['leche', 'DS', 1, 'Leche'], 'Leche deslactosada semidescremada': ['leche', 'DS', 1, 'Leche deslactosada'],
  'Yogur griego natural sin azúcar': ['yogur', 'DS', 2, 'Yogur griego'], 'Yogur natural entero': ['yogur', 'DS', 2, 'Yogur'], 'Kumis': ['kumis', 'S', 1, 'Kumis'],
  'Queso cottage': ['yogur', 'DS', 2, 'Queso cottage'], 'Queso campesino': ['queso', 'DS', 1, 'Queso campesino'], 'Queso costeño': ['queso', 'DS', 1, 'Queso costeño'],
  'Queso mozzarella': ['queso', 'DS', 2, 'Queso mozzarella'], 'Cuajada': ['queso', 'DS', 1, 'Cuajada'],
  'Arroz blanco cocido': ['arroz', 'A', 1, 'Arroz'], 'Arroz integral cocido': ['arroz', 'A', 2, 'Arroz integral'],
  'Arepa de maíz': ['arepa', 'DSA', 1, 'Arepa'], 'Papa cocida': ['tuberculo', 'A', 1, 'Papa'], 'Papa criolla cocida': ['tuberculo', 'A', 1, 'Papa criolla'],
  'Yuca cocida': ['tuberculo', 'A', 1, 'Yuca'], 'Plátano maduro cocido': ['tuberculo', 'A', 1, 'Plátano maduro'], 'Plátano verde cocido': ['tuberculo', 'A', 1, 'Plátano verde'],
  'Batata cocida': ['tuberculo', 'A', 1, 'Batata'], 'Mazorca cocida': ['tuberculo', 'A', 1, 'Mazorca'],
  'Avena en hojuelas': ['avena', 'DS', 1, 'Avena'], 'Pan tajado integral': ['pan', 'DS', 1, 'Pan integral'], 'Pan blanco': ['pan', 'DS', 1, 'Pan'],
  'Pasta cocida': ['pasta', 'A', 1, 'Pasta'], 'Quinua cocida': ['pasta', 'A', 3, 'Quinua'], 'Tortilla de trigo': ['tortilla', 'DSA', 2, 'Wrap'],
  'Galletas de arroz': ['galleta', 'DS', 2, 'Galletas de arroz'], 'Cereal de maíz': ['cereal', 'D', 2, 'Cereal'],
  'Fríjol rojo cocido': ['grano', 'A', 1, 'Fríjol'], 'Lenteja cocida': ['grano', 'A', 1, 'Lenteja'], 'Garbanzo cocido': ['grano', 'A', 1, 'Garbanzo'], 'Arveja verde cocida': ['grano', 'A', 1, 'Arveja'],
  'Banano': ['fruta', 'DS', 1, 'Banano'], 'Manzana': ['fruta', 'DS', 2, 'Manzana'], 'Papaya': ['fruta', 'DS', 1, 'Papaya'], 'Mango': ['fruta', 'DS', 1, 'Mango'],
  'Piña': ['fruta', 'DS', 1, 'Piña'], 'Fresa': ['fruta', 'DS', 2, 'Fresa'], 'Guayaba': ['fruta', 'DS', 1, 'Guayaba'], 'Mora': ['fruta', 'DS', 1, 'Mora'],
  'Naranja': ['fruta', 'DS', 1, 'Naranja'], 'Mandarina': ['fruta', 'DS', 1, 'Mandarina'], 'Uva': ['fruta', 'DS', 2, 'Uvas'], 'Pera': ['fruta', 'DS', 2, 'Pera'],
  'Sandía': ['fruta', 'DS', 1, 'Sandía'], 'Melón': ['fruta', 'DS', 1, 'Melón'], 'Maracuyá (pulpa)': ['fruta', 'S', 1, 'Maracuyá', 1], 'Uchuva': ['fruta', 'DS', 2, 'Uchuvas'],
  'Kiwi': ['fruta', 'DS', 3, 'Kiwi'], 'Arándanos': ['fruta', 'DS', 3, 'Arándanos'],
  'Brócoli cocido': ['verdura', 'A', 1, 'Brócoli'], 'Espinaca': ['verdura', 'DA', 1, 'Espinaca'], 'Tomate': ['verdura', 'DSA', 1, 'Tomate'], 'Zanahoria': ['verdura', 'A', 1, 'Zanahoria'],
  'Lechuga': ['verdura', 'DSA', 1, 'Lechuga'], 'Pepino': ['verdura', 'SA', 1, 'Pepino'], 'Cebolla cabezona': ['verdura', 'A', 1, 'Cebolla', 1], 'Pimentón': ['verdura', 'A', 1, 'Pimentón'],
  'Ahuyama cocida': ['verdura', 'A', 1, 'Ahuyama'], 'Habichuela cocida': ['verdura', 'A', 1, 'Habichuela'], 'Champiñones': ['verdura', 'DA', 2, 'Champiñones'],
  'Calabacín': ['verdura', 'A', 1, 'Calabacín'], 'Coliflor cocida': ['verdura', 'A', 1, 'Coliflor'], 'Remolacha cocida': ['verdura', 'A', 1, 'Remolacha'], 'Ensalada verde mixta': ['verdura', 'A', 1, 'Ensalada'],
  'Aguacate': ['aguacate', 'DA', 1, 'Aguacate'], 'Aceite de oliva': ['aceite', 'A', 2, 'Aceite de oliva'], 'Aceite vegetal': ['aceite', 'A', 1, 'Aceite'],
  'Mantequilla': ['untable', 'D', 1, 'Mantequilla', 1], 'Mantequilla de maní': ['untable', 'DS', 2, 'Mantequilla de maní'], 'Maní': ['fruto_seco', 'S', 1, 'Maní'],
  'Almendras': ['fruto_seco', 'DS', 3, 'Almendras'], 'Nueces': ['fruto_seco', 'DS', 3, 'Nueces'], 'Semillas de chía': ['semilla', 'DS', 2, 'Chía'],
  'Proteína whey (polvo)': ['whey', 'DS', 3, 'Proteína whey'], 'Proteína vegetal en polvo': ['whey', 'DS', 3, 'Proteína vegetal']
};
/* Alimentos creados por el entrenador: tipo y usos según la categoría */
const SUB_BY_CAT = { 'Proteínas': ['carne', 'A'], 'Lácteos': ['queso', 'DS'], 'Cereales y tubérculos': ['tuberculo', 'A'], 'Leguminosas': ['grano', 'A'], 'Frutas': ['fruta', 'DS'], 'Verduras': ['verdura', 'A'], 'Grasas': ['aceite', 'A'], 'Suplementos': ['whey', 'DS'] };
const COST_LBL = ['', 'Económico', 'Moderado', 'Costoso'];
const USE_LBL = { D: 'Desayuno', S: 'Refrigerios', A: 'Almuerzo y cena' };
function foodMeta(f) {
  const m = FOOD_META[f.name];
  let sub, uses, cost, short, rare = 0;
  if (m) [sub, uses, cost, short, rare] = m;
  else { [sub, uses] = SUB_BY_CAT[f.category] || [null, '']; cost = 2; if (f.category === 'Suplementos' && num(f.protein) < 50) sub = null; }
  if (num(f.cost_tier)) cost = num(f.cost_tier);
  if (Array.isArray(f.meal_use) && f.meal_use.length) uses = f.meal_use.join('');
  if (!short) short = f.name.replace(/\s+(cocid[oa]s?|escurrid[oa]s?|en hojuelas|natural.*|\(.*\))$/i, '');
  return { sub, uses: uses || '', cost: cost || 2, short, rare: rare || 0 };
}

/* Estructuras por tipo de comida. Cada espacio: [rol, tipos de alimento, gramos base, mínimo, máximo, opcional].
   Roles: P proteína · P2 lácteo que acompaña · C carbohidrato · G leguminosa · Fr fruta · V verdura · F grasa */
const MENU_FORMATS = {
  D: [
    { n: '{P} con {C}', s: [['P', ['huevo'], 100, 50, 200], ['Px', ['clara'], 60, 0, 160, 1], ['C', ['arepa', 'pan', 'tortilla'], 60, 25, 170], ['Fr', ['fruta'], 120, 60, 250], ['F', ['queso', 'aguacate'], 30, 0, 60, 1]] },
    { n: 'Avena con {P2} y {Fr}', s: [['C', ['avena'], 40, 20, 90], ['P2', ['leche'], 200, 150, 320], ['Px', ['whey', 'yogur'], 20, 0, 170, 1], ['Fr', ['fruta'], 100, 60, 200], ['C2', ['pan', 'arepa'], 30, 0, 120, 1], ['F', ['untable', 'semilla', 'fruto_seco'], 12, 0, 30, 1]] },
    { n: '{P} con {Fr} y {C}', sw: 1, s: [['P', ['yogur'], 170, 120, 320], ['Px', ['whey'], 20, 0, 40, 1], ['Fr', ['fruta'], 120, 60, 250], ['C', ['avena', 'galleta', 'cereal'], 30, 10, 80], ['C2', ['pan', 'arepa'], 30, 0, 120, 1], ['F', ['fruto_seco', 'semilla'], 15, 0, 30, 1]] },
    { n: '{C} con {P}', s: [['C', ['pan', 'tortilla', 'arepa'], 50, 25, 130], ['P', ['huevo', 'fiambre', 'queso'], 80, 40, 180], ['Px', ['clara', 'fiambre'], 40, 0, 120, 1], ['V', ['verdura'], 50, 30, 120], ['Fr', ['fruta'], 100, 0, 200, 1], ['F', ['aguacate'], 30, 0, 60, 1]] }],
  S: [
    { n: '{P} con {Fr}', sw: 1, s: [['P', ['yogur'], 150, 100, 300], ['Px', ['whey'], 15, 0, 35, 1], ['Fr', ['fruta'], 120, 60, 220], ['C2', ['galleta', 'avena'], 15, 0, 60, 1], ['F', ['fruto_seco', 'semilla'], 15, 0, 30, 1]] },
    { n: '{P} con {C}', alt: ['fiambre', 'huevo', 'tofu'], s: [['P', ['queso'], 40, 25, 90], ['Px', ['fiambre', 'clara'], 30, 0, 100, 1], ['C', ['galleta', 'arepa', 'pan'], 25, 10, 90], ['Fr', ['fruta'], 100, 0, 200, 1]] },
    { n: 'Batido de proteína con {Fr}', sw: 1, s: [['P', ['whey'], 30, 15, 45], ['P2', ['leche'], 200, 0, 300, 1], ['Fr', ['fruta'], 110, 60, 220], ['C', ['avena'], 20, 0, 70, 1], ['F', ['untable'], 10, 0, 25, 1]] },
    { n: '{C} con {P}', s: [['C', ['pan', 'tortilla', 'galleta'], 40, 15, 110], ['P', ['atun', 'fiambre', 'huevo'], 60, 30, 150], ['V', ['verdura'], 40, 0, 100, 1], ['Fr', ['fruta'], 100, 0, 200, 1], ['F', ['aguacate'], 20, 0, 50, 1]] }],
  A: [
    { n: '{P} con arroz y {G}', s: [['P', ['carne', 'pescado'], 120, 70, 260], ['C', ['arroz'], 120, 50, 320], ['G', ['grano'], 80, 40, 160], ['V', ['verdura'], 80, 50, 200], ['V', ['verdura'], 60, 30, 150], ['C2', ['tuberculo'], 60, 0, 200, 1], ['F', ['aguacate', 'aceite'], 30, 0, 70, 1]] },
    { n: '{P} con {C}', s: [['P', ['carne', 'pescado'], 120, 70, 260], ['C', ['tuberculo'], 150, 60, 400], ['V', ['verdura'], 100, 60, 220], ['V', ['verdura'], 60, 30, 150], ['C2', ['arroz'], 60, 0, 200, 1], ['F', ['aguacate', 'aceite'], 30, 0, 70, 1]] },
    { n: '{P} con {C}', s: [['P', ['carne', 'pescado'], 120, 70, 260], ['C', ['pasta'], 140, 60, 340], ['V', ['verdura'], 120, 60, 250], ['C2', ['arepa', 'tuberculo'], 40, 0, 160, 1], ['F', ['aceite', 'aguacate'], 8, 0, 25, 1]] }],
  N: [
    { n: '{P} con {C}', s: [['P', ['carne', 'pescado', 'huevo'], 120, 70, 240], ['C', ['tuberculo', 'arepa'], 100, 40, 300], ['V', ['verdura'], 120, 60, 250], ['C2', ['arroz'], 50, 0, 180, 1], ['F', ['aguacate', 'aceite'], 30, 0, 70, 1]] },
    { n: '{C} con {P}', s: [['C', ['tortilla', 'arepa'], 45, 25, 140], ['P', ['carne', 'atun', 'huevo'], 100, 60, 220], ['V', ['verdura'], 80, 40, 180], ['F', ['aguacate'], 30, 0, 70, 1]] },
    { n: '{P} con {C}', s: [['P', ['carne', 'pescado'], 120, 70, 240], ['C', ['arroz', 'pasta'], 90, 40, 260], ['V', ['verdura'], 150, 80, 280], ['C2', ['tuberculo'], 50, 0, 180, 1], ['F', ['aceite', 'aguacate'], 8, 0, 25, 1]] }]
};
/* Si no hay carnes ni pescados (vegetariano, vegano o exclusiones) */
const VEG_PROTEIN = ['tofu', 'huevo', 'queso', 'atun'];
/* Distribución diaria de proteína, carbohidratos y grasa por tipo de comida (se normaliza según las comidas del plan) */
const MEAL_SHARE = { D: { protein: 0.22, carbs: 0.24, fat: 0.25 }, S: { protein: 0.12, carbs: 0.11, fat: 0.12 }, A: { protein: 0.28, carbs: 0.28, fat: 0.26 }, N: { protein: 0.26, carbs: 0.2, fat: 0.25 } };
const MEAL_TIP = { D: 'Consumir dentro de la primera hora después de despertar.', S: '', A: 'Servir primero la verdura. Preparaciones a la plancha, al horno, asadas o sudadas.', N: 'Preparaciones a la plancha, al horno, asadas o sudadas.' };
const mealTypeOf = (name, i, n) => /desayuno/i.test(name) ? 'D' : /almuerzo/i.test(name) ? 'A' : /cena/i.test(name) ? 'N' : (i === 0 ? 'D' : i === n - 1 ? 'N' : 'S');
const useOf = type => type === 'N' ? 'A' : type;

/* ---------- aleatoriedad reproducible (misma persona → mismos menús; «Nueva variación» → otros) ---------- */
function seededRandom(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hashStr = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------- contexto de la persona ---------- */
function menuContext(d, seed) {
  const ex = exclusionTest(d);
  const maxCost = { 'Ajustado': 1, 'Moderado': 2, 'Amplio': 3 }[d.presupuesto] || 2;
  const words = norm(d.preferidos || '').split(/[^a-zñ]+/).filter(w => w.length >= 4 && !STOP.has(w));
  const same = (a, b) => { if (a === b) return true; const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return s.length >= 5 && l.startsWith(s); };
  const liked = f => words.length && norm(f.name).split(/[^a-zñ]+/).some(x => x.length >= 4 && words.some(w => same(x, w)));
  const noWhey = d.suplementos_ok === 'No';
  const foods = S.foods.map(f => ({ f, m: foodMeta(f) })).filter(x => x.m.sub && !ex(x.f) && !(noWhey && x.m.sub === 'whey'));
  return { d, foods, maxCost, liked, rand: seededRandom(seed), used: {} };
}
function menuPool(ctx, subs, use, strict) {
  const all = ctx.foods.filter(x => subs.includes(x.m.sub) && x.m.uses.includes(use));
  let p = all.filter(x => x.m.cost <= ctx.maxCost);
  if (p.length < 3) p = all.filter(x => x.m.cost <= ctx.maxCost + 1);  // poca variedad en el presupuesto: se agrega el siguiente nivel
  return p.length || strict ? p : all;
}
function menuPick(ctx, pool, avoid) {
  const sc = x => 1 + (ctx.liked(x.f) ? 2.5 : 0) - 0.7 * (ctx.used[x.f.id] || 0) - (PROCESSED.test(x.f.name) ? 1 : 0) - (x.m.rare && !ctx.liked(x.f) ? 4 : 0) - (avoid.has(x.f.id) ? 3 : 0) + ctx.rand() * 1.4;
  let best = null, bs = -1e9;
  for (const x of pool) { const s = sc(x); if (s > bs) { bs = s; best = x; } }
  return best;
}

/* ---------- porciones: mínimos cuadrados con límites (descenso por coordenadas) ---------- */
function solvePortions(items, tgt) {
  const A = items.map(it => [num(it.f.protein) / 100, num(it.f.carbs) / 100, num(it.f.fat) / 100]);
  const T = [tgt.protein, tgt.carbs, tgt.fat];
  const W = T.map((v, k) => (k === 0 ? 2 : 1) / Math.pow(Math.max(5, v), 2));   // la proteína pesa el doble
  const x = items.map(it => Math.min(it.hi, Math.max(it.lo, it.g)));
  const tot = () => [0, 1, 2].map(k => x.reduce((a, v, j) => a + A[j][k] * v, 0));
  for (let it = 0; it < 400; it++) {
    for (let j = 0; j < x.length; j++) {
      const s = tot(); const b = items[j].g || 1; const lam = items[j].lam; const c = items[j].c ?? b;
      let nu = lam * c / (b * b), de = lam / (b * b);
      for (let k = 0; k < 3; k++) { const r = s[k] - A[j][k] * x[j] - T[k]; nu -= W[k] * A[j][k] * r; de += W[k] * A[j][k] * A[j][k]; }
      x[j] = de > 0 ? Math.min(items[j].hi, Math.max(items[j].lo, nu / de)) : x[j];
    }
  }
  return x;
}
function roundPortion(f, m, g) {
  if (m.sub === 'huevo' && /^Huevo entero/.test(f.name)) return Math.max(1, Math.round(g / num(f.unit_grams || 50))) * num(f.unit_grams || 50);
  if (m.sub === 'whey') return Math.round(g / 5) * 5;
  return roundG(g);
}

/* Una opción de menú para un tipo de comida y unas metas de macronutrientes */
/* Porciones base y límites de las estructuras: corresponden a un plan de referencia (130 g de proteína, 230 g de carbohidratos y
   65 g de grasa) y se escalan según la meta de cada macronutriente en la comida */
const MENU_REF = { protein: 130, carbs: 230, fat: 65 };
/* Porción típica y máxima de las fuentes de grasa (g) */
/* Cantidad mínima con sentido práctico (g): por debajo, el alimento opcional se retira y la opción se recalcula */
const SUB_MIN = { fruta: 40, tuberculo: 40, arroz: 40, pasta: 40, pan: 12, arepa: 30, tortilla: 20, galleta: 9, avena: 20, cereal: 20, clara: 30, whey: 10, fiambre: 20, leche: 100, yogur: 80, kumis: 100, queso: 20, aceite: 3, aguacate: 15, fruto_seco: 8, semilla: 5, untable: 6, grano: 30, huevo: 50, carne: 60, pescado: 60, atun: 40, tofu: 60, verdura: 30 };
const SUB_MAX = { fruta: 250, huevo: 200, pan: 125, arepa: 240, tortilla: 135, avena: 120, galleta: 45, whey: 45, clara: 200, leche: 400, yogur: 350, queso: 90, fiambre: 120 };
const FAT_PORTION = { aceite: [6, 20], aguacate: [35, 80], fruto_seco: [15, 35], semilla: [10, 25], untable: [12, 32], queso: [30, 70] };
function buildOption(ctx, type, fmt, tgt, avoidP) {
  const use = useOf(type); const chosen = []; const inMeal = new Set();
  const sh = MEAL_SHARE[type]; const kk = x => Math.min(2.8, Math.max(0.5, x));
  const kp = kk(tgt.protein / (MENU_REF.protein * sh.protein)), kc = kk(tgt.carbs / (MENU_REF.carbs * sh.carbs)), kf = kk(tgt.fat / (MENU_REF.fat * sh.fat));
  const kv = Math.sqrt((kp + kc + kf) / 3);
  const scaleOf = r => ({ P: kp, P2: Math.sqrt(kp), Px: kp, C: kc, C2: kc, G: kc, Fr: Math.sqrt(kc), F: kf, V: kv })[r] || 1;
  for (const [role, subs0, g0, lo0, hi0, opt] of fmt.s) {
    const fixed = role === 'V' || role === 'Fr' || role === 'P2';
    const sc = scaleOf(role); let g = g0 * sc, lo = lo0 * sc, hi = hi0 * Math.min(sc, 1.8);
    // Espacios opcionales: solo alimentos dentro del presupuesto. Obligatorios fuera del presupuesto: se descarta la estructura
    let subs = subs0, pool = menuPool(ctx, subs, use, opt || !['P', 'C'].includes(role) || !(type === 'A' || type === 'N'));
    // Sin la proteína de la estructura (vegetariano, vegano, exclusiones): alternativas vegetales o proteína en polvo
    if (!pool.length && role === 'P' && !fmt.sw) for (const alt of [fmt.alt || VEG_PROTEIN, ['whey'], ['grano']]) { pool = [...new Set(['A', 'S', 'D'].flatMap(u => menuPool(ctx, alt, u)))]; if (pool.length) break; }
    pool = pool.filter(x => !inMeal.has(x.f.id));
    if (!pool.length) { if (opt || role === 'V' || role === 'Fr' || role === 'G' || role === 'P2' || role === 'F') continue; return null; }
    const x = menuPick(ctx, pool, role === 'P' ? avoidP : new Set());
    inMeal.add(x.f.id);
    // Mínimo práctico de alimentos por unidad (media arepa, media tajada, media lata)
    const ug = num(x.f.unit_grams); const unitMin = !opt && ug >= 20 && ug <= 150 && /unidad|tajada|filete|lata/.test(x.f.unit_name || '') ? ug * 0.5 : 0;
    if (role === 'F' && FAT_PORTION[x.m.sub]) { g = FAT_PORTION[x.m.sub][0] * kf; hi = FAT_PORTION[x.m.sub][1] * kf; }
    if (SUB_MAX[x.m.sub]) hi = Math.min(hi, SUB_MAX[x.m.sub]);
    const l2 = opt ? 0 : Math.min(hi, Math.max(lo, unitMin, SUB_MIN[x.m.sub] || 0));
    chosen.push({ role, f: x.f, m: x.m, g: Math.min(hi, Math.max(g, l2)), lo: l2, hi: Math.max(hi, l2), opt, c: opt ? 0 : undefined, lam: opt ? 0.03 : fixed ? 0.6 : role === 'G' ? 0.3 : 0.02 });
  }
  if (!chosen.some(c => c.role === 'P' || c.role === 'P2' || c.role === 'Px') || !chosen.some(c => c.role === 'C' || c.role === 'Fr' || c.role === 'G')) return null;
  // Se calculan las porciones; los opcionales con cantidades muy pequeñas se retiran y se recalcula
  let grams;
  for (let pass = 0; pass < 4; pass++) {
    grams = solvePortions(chosen, tgt);
    const tiny = chosen.map((c, i) => c.opt && grams[i] < (SUB_MIN[c.m.sub] || 8) ? i : -1).filter(i => i >= 0);
    if (!tiny.length) break;
    tiny.reverse().forEach(i => chosen.splice(i, 1));
  }
  const items = chosen.map((c, i) => ({ c, grams: roundPortion(c.f, c.m, grams[i]) })).filter(x => x.grams > 0);
  items.forEach(x => { ctx.used[x.c.f.id] = (ctx.used[x.c.f.id] || 0) + 1; });
  const byRole = r => (items.find(x => x.c.role === r) || {}).c;
  const label = fmt.n.replace(/\{(\w+)\}/g, (_, r) => { const c = byRole(r); return c ? c.m.short.toLowerCase() : ''; }).replace(/\s{2,}/g, ' ').replace(/\bcon y\b/, 'con').replace(/\s+(con|y)\s*$/, '').trim();
  const p = byRole('P') || byRole('P2');
  return { name: label.charAt(0).toUpperCase() + label.slice(1), items: items.map(x => ({ food_id: x.c.f.id, grams: x.grams, note: x.c.m.sub === 'aceite' ? 'Para preparar o aderezar' : '' })), pid: p ? p.f.id : null };
}

/* Opciones para una comida: estructuras distintas y proteínas distintas entre opciones */
function buildMealOptions(ctx, type, tgt, n, avoid = new Set()) {
  const fmts = MENU_FORMATS[type]; const start = Math.floor(ctx.rand() * fmts.length);
  const out = []; const usedP = new Set(avoid); const names = new Set();
  for (let k = 0; out.length < n && k < n + fmts.length * 2; k++) {
    const o = buildOption(ctx, type, fmts[(start + k) % fmts.length], tgt, usedP);
    if (!o) continue;
    if (o.pid) usedP.add(o.pid);
    let nm = o.name, c = 2; while (names.has(nm)) nm = `${o.name} (${c++})`;
    names.add(nm); o.name = nm; out.push(o);
  }
  return out;
}

/* Horarios a partir de la hora de despertar y de acostarse */
function mealTimes(d, n) {
  const toMin = s => { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const w = toMin(d.despierta), s = toMin(d.duerme);
  if (w == null && s == null) return (n === 4 ? ['7:00', '13:00', '16:00', '19:30'] : DEFAULT_MEALS.map(x => x[1]));
  const first = (w ?? 360) + 30; let last = (s != null ? (s < first ? s + 1440 : s) : first + 13.5 * 60) - 120;
  if (last - first < 9 * 60) last = first + 9 * 60;
  const fr = n === 4 ? [0, 0.45, 0.72, 1] : [0, 0.24, 0.48, 0.74, 1];
  return fr.map(f => { const t = Math.round((first + f * (last - first)) / 15) * 15 % 1440; return Math.floor(t / 60) + ':' + pad2(t % 60); });
}

/* =====================================================================
   Plan completo
   ===================================================================== */
function generateMenus(d, t, opts = {}) {
  const n = t.meals === 4 ? 4 : 5;
  const names = n === 4 ? ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'] : ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena'];
  const times = mealTimes(d, n);
  const meals = names.map((name, i) => ({ name, type: mealTypeOf(name, i, n), time_label: times[i], instructions: '', options: [] }));
  const log = [];
  // Distribución de macronutrientes por comida
  const share = meals.map(m => Object.assign({}, MEAL_SHARE[m.type]));
  const hungerIdx = { 'Mañana': 0, 'Tarde': meals.findIndex(m => m.name === 'Merienda'), 'Noche': meals.length - 1 }[d.hambre];
  if (hungerIdx != null && hungerIdx >= 0) { share[hungerIdx].protein *= 1.2; share[hungerIdx].fat *= 1.15; log.push(`Mayor aporte de proteína en ${meals[hungerIdx].name.toLowerCase()} por el hambre reportada en la ${d.hambre.toLowerCase()}.`); }
  const peri = periMeals(meals, t.horario);
  const periIdx = peri ? [peri.pre, peri.post].filter(i => i != null) : [];
  ['protein', 'carbs', 'fat'].forEach(k => { const s = share.reduce((a, x) => a + x[k], 0); share.forEach(x => { x[k] /= s; }); });
  if (periIdx.length) {
    const pct = num(S.settings.peri_carb_pct ?? 60) / 100;
    const cur = periIdx.reduce((a, i) => a + share[i].carbs, 0);
    if (cur < pct) share.forEach((x, i) => { x.carbs *= periIdx.includes(i) ? pct / cur : (1 - pct) / (1 - cur); });
    log.push(`Carbohidratos concentrados (${Math.round(pct * 100)} %) en ${periIdx.map(i => meals[i].name.toLowerCase()).join(' y ')} según el horario de entrenamiento (${t.horario.toLowerCase()}).`);
  }
  const seed = opts.seed != null ? opts.seed : hashStr((S.profile && S.profile.id || '') + JSON.stringify([d.nombre, d.preferidos, d.presupuesto]));
  const ctx = menuContext(d, seed);
  const nOpt = Math.max(1, Math.min(5, Math.round(num(opts.options || S.settings.menu_options) || 3)));
  let lunchP = new Set();
  meals.forEach((m, i) => {
    const tgt = { protein: t.protein * share[i].protein, carbs: t.carbs * share[i].carbs, fat: t.fat * share[i].fat };
    m.options = buildMealOptions(ctx, m.type, tgt, nOpt, m.type === 'N' ? lunchP : new Set());
    if (m.type === 'A') lunchP = new Set(m.options.map(o => o.pid).filter(Boolean));
    m.options.forEach(o => { delete o.pid; });
    m.instructions = [MEAL_TIP[m.type], peri && peri.pre === i ? 'En días de entrenamiento, consumir 60 a 90 minutos antes de la sesión.' : '', peri && peri.post === i ? 'En días de entrenamiento, consumir dentro de las 2 horas posteriores a la sesión.' : ''].filter(Boolean).join(' ');
  });
  // Ajuste final del día completo (redondeos y límites de porción)
  const all = meals.map(m => ({ options: m.options }));
  const fac = macroFactors(all, t); const cl = v => Math.min(1.15, Math.max(0.88, v));
  meals.forEach(m => m.options.forEach(o => o.items.forEach(i => { const f = foodOf(i.food_id); const g = MACRO_GROUP(f.category); if (g === 'X') return; const k = cl(fac[g]); if (Math.abs(k - 1) <= 0.03) return; const mt = foodMeta(f); i.grams = roundPortion(f, mt, Math.min(SUB_MAX[mt.sub] || 1e4, Math.max(SUB_MIN[mt.sub] || 1, num(i.grams) * k))); })));
  const tot = all.reduce((a, m) => addM(a, mealAvg(m)), ZERO());
  const dev = ['protein', 'carbs', 'fat'].map(k => [k, t[k] ? tot[k] / t[k] - 1 : 0]).filter(([, v]) => Math.abs(v) > 0.08);
  if (dev.length) log.push('Revisar porciones: el promedio de los menús difiere del objetivo en ' + dev.map(([k, v]) => `${{ protein: 'proteína', carbs: 'carbohidratos', fat: 'grasa' }[k]} ${v > 0 ? '+' : ''}${Math.round(v * 100)} %`).join(', ') + '.');
  const pref = (d.preferidos || '').trim();
  log.unshift(`Menús generados con ${nOpt} opciones por comida a partir de ${ctx.foods.length} alimentos permitidos · presupuesto ${(d.presupuesto || 'moderado').toLowerCase()}${pref ? ` · preferencias: ${pref}` : ''}.`);
  const out = meals.map(m => ({ name: m.name, time_label: m.time_label, instructions: m.instructions, options: m.options }));
  return { meals: out, notes: S.settings.plan_notes || DEFAULT_PLAN_NOTES, log, peri: peri ? { pre: peri.pre != null ? out[peri.pre].name : null, post: peri.post != null ? out[peri.post].name : null } : null, source: 'generador' };
}

/* Una opción nueva para una comida existente (editor del plan) */
async function autoOptionFor(plan, meal) {
  const i = plan.meals.indexOf(meal); const type = mealTypeOf(meal.name, i, plan.meals.length);
  let d = {};
  if (plan.client_id) { const it = (await DB.select('intakes', { eq: { client_id: plan.client_id } }))[0]; if (it) d = it.data || {}; }
  let tgt = mealAvg(meal);
  if (!(tgt.kcal > 0)) {
    const t = targetsOf(plan); if (!t || !t.kcal) throw new Error('Define los objetivos del plan o añade alimentos a otra opción de esta comida.');
    const types = plan.meals.map((m, k) => mealTypeOf(m.name, k, plan.meals.length));
    tgt = {}; ['protein', 'carbs', 'fat'].forEach(k => { const s = types.reduce((a, ty) => a + MEAL_SHARE[ty][k], 0); tgt[k] = t[k] * MEAL_SHARE[type][k] / s; });
  }
  const ctx = menuContext(d, Date.now() & 0xffffffff);
  meal.options.forEach(o => o.items.forEach(it => { ctx.used[it.food_id] = (ctx.used[it.food_id] || 0) + 1; }));
  const avoid = new Set(meal.options.flatMap(o => o.items.map(x => x.food_id)));
  const opts = buildMealOptions(ctx, type, tgt, 1, avoid);
  if (!opts.length) throw new Error('No hay alimentos suficientes para generar una opción con las exclusiones de este asesorado.');
  return opts[0];
}
