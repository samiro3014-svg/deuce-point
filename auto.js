'use strict';
/* =====================================================================
   Deuce Point · Automatización
   Valoración inicial, cálculo de requerimientos, generación automática de
   plan nutricional y rutina, revisión del entrenador, check-ins semanales,
   bandeja de pendientes, ajustes y sugerencias de progresión.
   Depende de app.js y nutri.js.
   ===================================================================== */

S.settings = {}; S.intake = null;
const SI_NO = ['No', 'Sí'];
const GOAL_LBL = { perdida: 'Pérdida de grasa', recomp: 'Recomposición corporal', ganancia: 'Ganancia de peso y masa muscular', mant: 'Mantenimiento y rendimiento' };
const FA_OPTS = [[1.375, '1,375 · ligera'], [1.5, '1,5 · moderada'], [1.6, '1,6 · activa'], [1.725, '1,725 · muy activa']];
const DEFAULT_PLAN_NOTES = 'Pesar los alimentos en el estado indicado en el plan (cocido o crudo).\nDistribuir el agua indicada a lo largo del día.\nUsar la opción «Reemplazar» para cambiar un alimento por un equivalente del mismo grupo.';
const DEFAULT_ROUTINE_NOTES = 'Calentamiento de 8 a 10 minutos: movilidad articular y 2 series de aproximación en el primer ejercicio.\nRIR: repeticiones que quedan en reserva al terminar la serie.\nProgresión: cuando completes el máximo de repeticiones en todas las series con el RIR indicado, aumenta la carga entre 2,5 y 5 %.';

/* ---------- Cuestionario (mismas preguntas del formulario de valoración) ---------- */
const INTAKE = [
  { t: 'Datos personales', d: 'Información básica para preparar tu valoración.', f: [
    { id: 'nombre', type: 'text', label: 'Nombre completo', req: 1 },
    { id: 'fecha_nac', type: 'date', label: 'Fecha de nacimiento', req: 1, half: 1 },
    { id: 'whatsapp', type: 'tel', label: 'Número de WhatsApp', req: 1, half: 1 },
    { id: 'sexo', type: 'radio', label: 'Sexo', opts: ['Femenino', 'Masculino'], req: 1 },
    { id: 'ciudad', type: 'text', label: 'Ciudad', half: 1 },
    { id: 'ocupacion', type: 'text', label: 'Ocupación', half: 1 },
    { id: 'trabajo', type: 'radio', label: 'Tu trabajo es principalmente', opts: ['Sentado la mayor parte del día', 'De pie o caminando', 'Físicamente exigente'], req: 1 },
    { id: 'peso', type: 'number', label: 'Peso', unit: 'kg', half: 1, req: 1, min: 30, max: 300 },
    { id: 'talla', type: 'number', label: 'Estatura', unit: 'cm', half: 1, req: 1, min: 120, max: 230 },
    { id: 'cintura', type: 'number', label: 'Perímetro de cintura (opcional)', unit: 'cm', half: 1, min: 40, max: 200 }]},
  { t: 'Objetivo', d: 'Define con precisión qué quieres lograr. Esto orienta el plan inicial.', f: [
    { id: 'objetivo', type: 'checks', label: 'Objetivos (puedes elegir varios)', req: 1, opts: ['Reducir grasa corporal', 'Ganar peso y masa muscular', 'Recomposición corporal', 'Mejorar salud y hábitos', 'Rendimiento deportivo'] },
    { id: 'resultado', type: 'textarea', label: '¿Qué resultado concreto quieres lograr en 12 semanas?', req: 1, ph: 'Ejemplo: bajar 8 kg y reducir la talla del pantalón.' },
    { id: 'motivo', type: 'textarea', label: '¿Por qué es importante para ti lograrlo ahora?' },
    { id: 'importancia', type: 'scale', label: '¿Qué tan importante es este objetivo para ti?', req: 1, ends: ['Poco', 'Muy importante'] },
    { id: 'intentos', type: 'textarea', label: '¿Qué has intentado antes y qué resultado obtuviste?' },
    { id: 'barreras', type: 'checks', label: '¿Qué te ha impedido lograrlo hasta ahora?', opts: ['Falta de tiempo', 'Hambre o ansiedad', 'Comidas fuera de casa', 'Fines de semana', 'Constancia en el entrenamiento', 'Presupuesto', 'No sé qué comer', 'Otra'] }]},
  { t: 'Salud', d: 'Estas preguntas permiten iniciar el programa de forma segura. Tus respuestas son confidenciales.', f: [
    { type: 'h', label: 'Actividad física segura' },
    { id: 'pq1', type: 'yn', label: '¿Algún médico te ha dicho que tienes una condición del corazón o presión arterial alta?', req: 1 },
    { id: 'pq2', type: 'yn', label: '¿Sientes dolor en el pecho en reposo, en tus actividades diarias o al hacer ejercicio?', req: 1 },
    { id: 'pq3', type: 'yn', label: '¿Has perdido el equilibrio por mareo o has perdido el conocimiento en los últimos 12 meses?', req: 1 },
    { id: 'pq4', type: 'yn', label: '¿Tienes diagnosticada otra enfermedad crónica distinta a las anteriores?', req: 1 },
    { id: 'pq5', type: 'yn', label: '¿Tomas actualmente medicamentos para una enfermedad crónica?', req: 1 },
    { id: 'pq6', type: 'yn', label: '¿Tienes un problema de huesos, articulaciones o músculos que empeore con la actividad física?', req: 1 },
    { id: 'pq7', type: 'yn', label: '¿Algún médico te ha indicado que solo realices actividad física con supervisión médica?', req: 1 },
    { type: 'h', label: 'Antecedentes' },
    { id: 'enfermedades', type: 'checks', label: 'Condiciones diagnosticadas', none: 'Ninguna', opts: ['Diabetes o prediabetes', 'Hipertensión', 'Colesterol o triglicéridos altos', 'Hígado graso', 'Hipotiroidismo', 'Síndrome de ovario poliquístico', 'Gastritis o reflujo', 'Colon irritable', 'Enfermedad renal', 'Ninguna'] },
    { id: 'medicamentos', type: 'textarea', label: 'Medicamentos y suplementos que tomas actualmente', ph: 'Nombre y dosis, si la conoces.' },
    { id: 'alergias', type: 'text', label: 'Alergias o intolerancias alimentarias' },
    { id: 'lesiones', type: 'textarea', label: 'Lesiones, cirugías o dolores actuales' },
    { id: 'embarazo', type: 'radio', label: '¿Estás en embarazo o lactancia?', opts: ['No', 'Embarazo', 'Lactancia'], show: v => v.sexo === 'Femenino', req: 1 },
    { id: 'ciclo', type: 'radio', label: 'Ciclo menstrual', opts: ['Regular', 'Irregular', 'Ausente', 'No aplica'], show: v => v.sexo === 'Femenino' },
    { type: 'h', label: 'Relación con la comida' },
    { id: 'sc1', type: 'yn', label: '¿Te provocas el vómito porque te sientes incómodamente lleno o llena?', req: 1 },
    { id: 'sc2', type: 'yn', label: '¿Te preocupa haber perdido el control sobre cuánto comes?', req: 1 },
    { id: 'sc3', type: 'yn', label: '¿Has perdido más de 6 kg en los últimos 3 meses?', req: 1 },
    { id: 'sc4', type: 'yn', label: '¿Te ves con exceso de peso aunque otras personas te digan que estás delgado o delgada?', req: 1 },
    { id: 'sc5', type: 'yn', label: '¿Dirías que la comida domina tu vida?', req: 1 }]},
  { t: 'Alimentación', d: 'Describe cómo comes hoy, sin ajustar tus respuestas. El plan parte de tus hábitos reales.', f: [
    { id: 'comidas', type: 'radio', label: 'Comidas que haces al día', opts: ['1 o 2', '3', '4', '5 o más'], req: 1 },
    { id: 'despierta', type: 'time', label: 'Hora a la que te despiertas', half: 1 },
    { id: 'duerme', type: 'time', label: 'Hora a la que te acuestas', half: 1 },
    { id: 'cocina', type: 'radio', label: '¿Quién prepara tus comidas?', opts: ['Yo', 'Otra persona en casa', 'Compro la mayoría'] },
    { id: 'fuera', type: 'radio', label: 'Comidas fuera de casa por semana', opts: ['0 a 1', '2 a 4', '5 o más'] },
    { id: 'bebidas', type: 'radio', label: 'Bebidas azucaradas (gaseosa, jugos, té endulzado)', opts: ['Nunca', '1 al día', '2 o más al día'] },
    { id: 'alcohol', type: 'radio', label: 'Consumo de alcohol', opts: ['Nunca', '1 a 2 veces al mes', '1 vez por semana', '2 o más veces por semana'] },
    { id: 'agua', type: 'radio', label: 'Agua al día', opts: ['Menos de 1 L', '1 a 2 L', 'Más de 2 L'] },
    { id: 'restricciones', type: 'checks', label: 'Restricciones', none: 'Ninguna', opts: ['Vegetariano', 'Vegano', 'Sin lactosa', 'Sin gluten', 'No como pescado', 'No como cerdo', 'No como huevo', 'Ninguna'] },
    { id: 'no_gusta', type: 'text', label: 'Alimentos que no consumes o no te gustan', ph: 'Separados por coma' },
    { id: 'preferidos', type: 'text', label: 'Alimentos que más disfrutas' },
    { id: 'presupuesto', type: 'radio', label: 'Presupuesto para el mercado', opts: ['Ajustado', 'Moderado', 'Amplio'] },
    { id: 'hambre', type: 'radio', label: '¿En qué momento del día sientes más hambre o ansiedad por comer?', opts: ['Mañana', 'Tarde', 'Noche', 'No aplica'] },
    { type: 'h', label: 'Lo que comiste ayer' },
    { type: 'note', label: 'Escribe alimentos y cantidades aproximadas. Si ayer fue un día atípico, usa un día normal.' },
    { id: 'r_desayuno', type: 'textarea', label: 'Desayuno', small: 1 },
    { id: 'r_media', type: 'textarea', label: 'Media mañana', small: 1 },
    { id: 'r_almuerzo', type: 'textarea', label: 'Almuerzo', small: 1 },
    { id: 'r_tarde', type: 'textarea', label: 'Tarde', small: 1 },
    { id: 'r_cena', type: 'textarea', label: 'Cena', small: 1 },
    { id: 'r_otros', type: 'textarea', label: 'Otros (bebidas, mecato, alcohol)', small: 1 }]},
  { t: 'Actividad y descanso', d: 'Con esta información se ajustan el gasto energético y el entrenamiento.', f: [
    { id: 'sueno', type: 'radio', label: 'Horas de sueño por noche', opts: ['Menos de 6', '6 a 7', '7 a 8', 'Más de 8'], req: 1 },
    { id: 'sueno_calidad', type: 'scale', label: 'Calidad del sueño', ends: ['Muy mala', 'Excelente'] },
    { id: 'estres', type: 'scale', label: 'Nivel de estrés', ends: ['Bajo', 'Muy alto'] },
    { id: 'pasos', type: 'radio', label: 'Pasos diarios aproximados', opts: ['Menos de 4.000', '4.000 a 7.000', '7.000 a 10.000', 'Más de 10.000', 'No sé'] },
    { id: 'experiencia', type: 'radio', label: 'Experiencia en entrenamiento de fuerza', opts: ['Nunca he entrenado', 'Menos de 6 meses', '6 meses a 2 años', 'Más de 2 años'], req: 1 },
    { id: 'lugar', type: 'radio', label: '¿Dónde vas a entrenar?', opts: ['Gimnasio', 'Casa', 'Ambos'], req: 1 },
    { id: 'equipo', type: 'checks', label: 'Equipamiento disponible en casa', none: 'Ninguno', opts: ['Mancuernas', 'Bandas elásticas', 'Barra de dominadas', 'Banco', 'Ninguno'], show: v => v.lugar === 'Casa' },
    { id: 'dias', type: 'checks', label: 'Días disponibles para entrenar', opts: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], req: 1 },
    { id: 'minutos', type: 'radio', label: 'Tiempo por sesión', opts: ['30 min', '45 min', '60 min', '90 min'], req: 1 },
    { id: 'horario', type: 'radio', label: 'Horario de entrenamiento', opts: ['Mañana', 'Mediodía', 'Tarde', 'Noche'] },
    { id: 'deportes', type: 'text', label: 'Deportes o actividades que practicas' },
    { id: 'deporte', type: 'radio', label: 'Deporte principal', opts: ['Tenis', 'Otro'], show: v => (v.objetivo || []).includes('Rendimiento deportivo') },
    { id: 'nivel_deporte', type: 'radio', label: 'Nivel', opts: ['Recreativo', 'Competitivo amateur', 'Juvenil federado', 'Profesional'], show: v => (v.objetivo || []).includes('Rendimiento deportivo') },
    { id: 'sesiones_deporte', type: 'radio', label: 'Sesiones de práctica o partidos por semana', opts: ['0 a 1', '2 a 3', '4 a 5', '6 o más'], show: v => (v.objetivo || []).includes('Rendimiento deportivo') || /tenis/i.test(v.deportes || '') },
    { id: 'suplementos_ok', type: 'radio', label: '¿Estarías dispuesto o dispuesta a usar suplementos si se te indican?', opts: ['Sí', 'No', 'Prefiero consultarlo'] }]},
  { t: 'Autorizaciones', d: 'Lee y marca las autorizaciones para enviar la valoración.', f: [
    { id: 'consentimiento', type: 'consent', req: 1, label: 'Entiendo que el programa es una asesoría de nutrición y entrenamiento que no reemplaza la atención médica, y declaro que la información que entrego es verídica.' },
    { id: 'datos', type: 'consent', req: 1, label: 'Autorizo el tratamiento de mis datos personales y de salud con fines exclusivos de la asesoría, conforme a la Ley 1581 de 2012.' },
    { id: 'fotos', type: 'consent', label: 'Autorizo el uso de mis fotos de progreso y resultados con fines educativos y de difusión. Puedo solicitar que no se muestre mi rostro. (Opcional)' }]}
];

/* ---------- utilidades ---------- */
function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.length === 10 && p.startsWith('3')) p = '57' + p;
  return p.length >= 8 ? `https://wa.me/${p}?text=${encodeURIComponent(text || '')}` : '';
}
const waBtn = (phone, text, label = 'WhatsApp', cls = 'btn sm') => { const l = waLink(phone, text); return l ? `<a class="${cls} wa" href="${l}" target="_blank" rel="noopener">${esc(label)}</a>` : ''; };
function ageFrom(s) { if (!s) return 0; const b = new Date(s + 'T12:00:00'), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; }
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
const fmtAns = v => Array.isArray(v) ? v.join(', ') : String(v ?? '');
async function loadSettings() {
  let r = null; S.needsMigration = false;
  try { r = (await DB.select('app_settings', { eq: { id: 1 } }))[0]; }
  catch (e) { console.warn('app_settings no disponible: ejecutar supabase/migracion-v3.sql', e); S.needsMigration = true; }
  S.settings = Object.assign({ auto_publish: false, deficit_pct: 22, surplus_pct: 12, recomp_pct: 10, protein_gkg: 2, fat_gkg: 0.9 }, r ? r.data || {} : {});
}
async function saveSettings(patch) {
  const data = Object.assign({}, S.settings, patch);
  const ex = (await DB.select('app_settings', { eq: { id: 1 } }))[0];
  if (ex) await DB.update('app_settings', 1, { data, updated_at: new Date().toISOString() });
  else await DB.insert('app_settings', { id: 1, data });
  S.settings = data;
}

/* =====================================================================
   Cálculo de requerimientos y alertas
   ===================================================================== */
function computeTargets(d, ov = {}) {
  const cfg = S.settings || {};
  const flags = []; const flag = (level, text) => flags.push({ level, text });
  const sex = d.sexo === 'Femenino' ? 'F' : 'M';
  const age = ageFrom(d.fecha_nac) || 30;
  const w = num(d.peso), h = num(d.talla);
  const bmi = w && h ? w / Math.pow(h / 100, 2) : 0;
  const obj = d.objetivo || [];
  let goal = obj.includes('Reducir grasa corporal') ? (obj.includes('Ganar peso y masa muscular') ? 'recomp' : 'perdida')
    : obj.includes('Recomposición corporal') ? 'recomp' : obj.includes('Ganar peso y masa muscular') ? 'ganancia' : 'mant';
  if (ov.goal) goal = ov.goal;

  // Factor de actividad: pasos (o tipo de trabajo) y carga de entrenamiento o deporte
  const FA = [1.375, 1.5, 1.6, 1.725];
  let fi = { 'Menos de 4.000': 0, '4.000 a 7.000': 1, '7.000 a 10.000': 2, 'Más de 10.000': 3 }[d.pasos];
  if (fi == null) fi = { 'Sentado la mayor parte del día': 0, 'De pie o caminando': 1, 'Físicamente exigente': 2 }[d.trabajo] ?? 1;
  const nDays = (d.dias || []).length;
  const sport = { '0 a 1': 0, '2 a 3': 1, '4 a 5': 2, '6 o más': 3 }[d.sesiones_deporte] || 0;
  if (nDays >= 5 || sport >= 2) fi = Math.min(3, fi + 1);
  const fa = num(ov.fa) || FA[fi];

  // Alertas de seguridad
  const parq = ['pq1', 'pq2', 'pq3', 'pq4', 'pq5', 'pq6', 'pq7'].filter(k => d[k] === 'Sí');
  if (parq.length) flag('alta', `PAR-Q positivo (${parq.length} ${parq.length === 1 ? 'respuesta' : 'respuestas'} «Sí»): se recomienda autorización médica antes de iniciar el entrenamiento.`);
  const scoff = ['sc1', 'sc2', 'sc3', 'sc4', 'sc5'].filter(k => d[k] === 'Sí').length;
  if (scoff >= 2) flag('alta', `Tamizaje de conducta alimentaria positivo (${scoff}/5): no se aplica déficit calórico. Requiere valoración individual.`);
  else if (scoff === 1) flag('media', 'Tamizaje de conducta alimentaria con 1 respuesta positiva: revisar antes de asignar un déficit.');
  const preg = d.embarazo === 'Embarazo' || d.embarazo === 'Lactancia';
  if (preg) flag('alta', `${d.embarazo}: no se aplica déficit calórico. Requiere valoración individual.`);
  if (age < 18) flag('media', `Menor de edad (${age} años): no se aplica déficit calórico; se requiere autorización del acudiente.`);
  const enf = (d.enfermedades || []).filter(x => x !== 'Ninguna');
  if (enf.length) flag('media', 'Condiciones diagnosticadas: ' + enf.join(', ') + '.');
  if ((d.medicamentos || '').trim()) flag('info', 'Medicamentos o suplementos: ' + d.medicamentos.trim());
  if ((d.lesiones || '').trim()) flag('media', 'Lesiones o dolores reportados: ' + d.lesiones.trim() + '. Revisar la selección de ejercicios.');
  if ((d.alergias || '').trim()) flag('media', 'Alergias o intolerancias: ' + d.alergias.trim() + '. Verificar las exclusiones del plan.');
  if ((d.restricciones || []).includes('Vegano')) flag('media', 'Alimentación vegana: verificar las fuentes de proteína del plan.');
  if (bmi && bmi < 18.5 && (goal === 'perdida' || goal === 'recomp')) { flag('media', `IMC ${r1(bmi)} con objetivo de reducción de grasa: se cambia a mantenimiento.`); goal = 'mant'; }

  let adj = ov.adjPct != null && ov.adjPct !== '' ? num(ov.adjPct) : { perdida: -num(cfg.deficit_pct ?? 22), recomp: -num(cfg.recomp_pct ?? 10), ganancia: num(cfg.surplus_pct ?? 12), mant: 0 }[goal];
  if (adj < 0 && (scoff >= 2 || preg || age < 18)) adj = 0;

  const ree = 10 * w + 6.25 * h - 5 * age + (sex === 'M' ? 5 : -161);
  const tdee = ree * fa;
  let kcal = Math.round(tdee * (1 + adj / 100) / 10) * 10;
  const minK = Math.max(Math.round(ree / 10) * 10, sex === 'F' ? 1200 : 1500);
  if (kcal < minK) { flag('media', `Las calorías calculadas eran menores al mínimo seguro; se ajustan a ${fmtInt(minK)} kcal.`); kcal = minK; }

  const refW = (goal === 'perdida' || goal === 'recomp') && bmi > 25 ? 25 * Math.pow(h / 100, 2) : w;
  const pg = num(ov.proteinGkg) || num(cfg.protein_gkg) || 2;
  const fg = num(ov.fatGkg) || num(cfg.fat_gkg) || 0.9;
  const protein = Math.round(refW * pg);
  let fat = Math.round(w * fg);
  if (fat * 9 < kcal * 0.2) fat = Math.round(kcal * 0.2 / 9);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  if (carbs < 80) { fat = Math.round(kcal * 0.22 / 9); carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)); }

  const meals = num(ov.meals) || (['1 o 2', '3'].includes(d.comidas) ? 4 : 5);
  const water = Math.max(1500, Math.round(w * 35 / 250) * 250);
  const tennis = d.deporte === 'Tenis' || /tenis/i.test(d.deportes || '');
  const level = ['Nunca he entrenado', 'Menos de 6 meses'].includes(d.experiencia) ? 'beg' : d.experiencia === 'Más de 2 años' ? 'adv' : 'int';
  if (nDays < 2) flag('info', 'Seleccionó menos de 2 días de entrenamiento: se generaron 2 sesiones.');
  return { sex, age, weight: w, height: h, bmi: r1(bmi), goal, fa, adj, ree: Math.round(ree), tdee: Math.round(tdee), kcal, refW: r1(refW), pg, fg, protein, fat, carbs, meals, water, tennis, level, days: Math.min(6, Math.max(2, nDays || 3)), flags };
}
const blocking = flags => (flags || []).some(f => f.level === 'alta' || f.level === 'media');

/* =====================================================================
   Generación del plan nutricional
   ===================================================================== */
const MACRO_GROUP = c => ({ 'Proteínas': 'P', 'Lácteos': 'P', 'Suplementos': 'P', 'Grasas': 'F', 'Verduras': 'X' })[c] || 'C';
const EXCL_WORDS = { lacteo: 'lactosa', lactosa: 'lactosa', leche: 'lactosa', gluten: 'gluten', harina: 'gluten', marisco: 'pescado', mariscos: 'pescado', pescado: 'pescado', carne: 'res', carnes: 'res', cerdo: 'cerdo', huevo: 'huevo', huevos: 'huevo', 'frutos secos': 'nueces', nueces: 'nueces', mani: 'nueces' };
const EXCL_RE = {
  carnes: /pollo|\bres\b|cerdo|hígado|jamón/i, pescado: /tilapia|salmón|atún|sardina|camarón/i, cerdo: /cerdo/i, huevo: /huevo|clara de huevo/i, res: /\bres\b|hígado/i,
  lactosa: /^leche (entera|descremada)|yogur|kumis|cuajada|queso/i, vegano: /huevo|clara|leche|yogur|kumis|queso|cuajada|whey|mantequilla$|miel/i,
  gluten: /\bpan\b|pasta|tortilla de trigo|avena/i, nueces: /maní|almendra|nuez|nueces/i
};
const PROCESSED = /cereal de maíz|galletas|pan blanco|tortilla|bocadillo|azúcar|panela|miel|chocolate|jamón|bebida/i;
const STOP = new Set(['nada', 'ninguno', 'ninguna', 'todo', 'tengo', 'como', 'alergia', 'alergico', 'alergica', 'intolerante', 'intolerancia', 'comida', 'comidas', 'alimentos', 'gusta', 'gustan', 'mucho', 'poco', 'algunos', 'algunas']);
function exclusionTest(d) {
  const regs = []; const r = d.restricciones || [];
  if (r.includes('Vegetariano') || r.includes('Vegano')) regs.push(EXCL_RE.carnes, EXCL_RE.pescado);
  if (r.includes('Vegano')) regs.push(EXCL_RE.vegano);
  if (r.includes('Sin lactosa')) regs.push(EXCL_RE.lactosa);
  if (r.includes('Sin gluten')) regs.push(EXCL_RE.gluten);
  if (r.includes('No como pescado')) regs.push(EXCL_RE.pescado);
  if (r.includes('No como cerdo')) regs.push(EXCL_RE.cerdo);
  if (r.includes('No como huevo')) regs.push(EXCL_RE.huevo);
  const txt = norm([d.no_gusta, d.alergias].join(' , '));
  for (const [k, v] of Object.entries(EXCL_WORDS)) if (new RegExp('\\b' + k).test(txt)) regs.push(EXCL_RE[v]);
  const words = txt.split(/[^a-zñ]+/).filter(w => w.length >= 4 && !STOP.has(w) && !EXCL_WORDS[w]);
  // Coincidencia por palabra completa o por raíz (mínimo 5 letras): «huevos» excluye «huevo», «papaya» no excluye «papa»
  const same = (a, b) => { if (a === b) return true; const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return s.length >= 5 && l.startsWith(s); };
  return f => regs.some(re => re.test(f.name)) || words.some(w => norm(f.name).split(/[^a-zñ]+/).some(x => x.length >= 4 && same(x, w)));
}
function solve3(A, b) {
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A); if (Math.abs(D) < 1e-6) return null;
  return [0, 1, 2].map(c => det(A.map((row, i) => row.map((v, j) => j === c ? b[i] : v))) / D);
}
/* Factores por grupo (proteicos, carbohidratos, grasas) para acercar el día promedio a los objetivos */
function macroFactors(meals, t) {
  const acc = { P: [0, 0, 0, 0], C: [0, 0, 0, 0], F: [0, 0, 0, 0], X: [0, 0, 0, 0] };
  meals.forEach(m => { const os = m.options.filter(o => o.items.length); os.forEach(o => o.items.forEach(i => { const f = foodOf(i.food_id); if (!f) return; const mm = macrosFor(f, i.grams), g = MACRO_GROUP(f.category); acc[g][0] += mm.protein / os.length; acc[g][1] += mm.carbs / os.length; acc[g][2] += mm.fat / os.length; acc[g][3] += mm.kcal / os.length; })); });
  const A = [[acc.P[0], acc.C[0], acc.F[0]], [acc.P[1], acc.C[1], acc.F[1]], [acc.P[2], acc.C[2], acc.F[2]]];
  let x = solve3(A, [t.protein - acc.X[0], t.carbs - acc.X[1], t.fat - acc.X[2]]);
  if (!x || x.some(v => !isFinite(v) || v < 0.3 || v > 3.5)) {
    const var_ = acc.P[3] + acc.C[3] + acc.F[3]; const k = var_ ? (t.kcal - acc.X[3]) / var_ : 1; x = [k, k, k];
  }
  x = x.map(v => Math.min(3, Math.max(0.4, v)));
  return { P: x[0], C: x[1], F: x[2], X: 1 };
}
function scaleMeals(meals, fac) {
  meals.forEach(m => m.options.forEach(o => o.items.forEach(i => { const f = foodOf(i.food_id); if (f) i.grams = Math.max(1, roundG(num(i.grams) * fac[MACRO_GROUP(f.category)])); })));
}
async function baseStructure(goal) {
  const cfg = S.settings || {};
  const tplId = cfg['tpl_' + goal] || cfg.tpl_default;
  if (tplId) {
    const p = await loadPlanFull(tplId);
    if (p) return { meals: p.meals.map(m => ({ name: m.name, time_label: m.time_label, instructions: m.instructions, options: m.options.map(o => ({ name: o.name, items: o.items.map(i => ({ food_id: i.food_id, grams: num(i.grams), note: i.note })) })) })), notes: p.notes };
  }
  const byName = n => S.foods.find(f => f.name === n);
  return { meals: NUTRI_BASE.map(([name, time_label, instructions, opts]) => ({ name, time_label, instructions, options: opts.map(([on, items]) => ({ name: on, items: items.map(([fn, g]) => ({ food_id: (byName(fn) || {}).id, grams: g, note: '' })).filter(i => i.food_id) })) })), notes: '' };
}
async function buildNutrition(d, t) {
  const st = await baseStructure(t.goal); const notes = [];
  let meals = st.meals;
  if (t.meals === 4 && meals.length >= 5) { const i = meals.findIndex(m => /media/i.test(m.name)); meals.splice(i >= 0 ? i : 1, 1); }
  // Exclusiones y sustituciones por equivalentes del mismo grupo
  const ex = exclusionTest(d); const swapped = [];
  meals.forEach(m => m.options.forEach(o => {
    o.items = o.items.map(i => {
      const f = foodOf(i.food_id); if (!f || !ex(f)) return i;
      const alt = equivalents(f, i.grams, 0).filter(e => !ex(e.food)).sort((a, b) => (PROCESSED.test(a.food.name) ? 1 : 0) - (PROCESSED.test(b.food.name) ? 1 : 0))[0];
      swapped.push(f.name + (alt ? ' → ' + alt.food.name : ' (retirado)'));
      return alt ? { food_id: alt.food.id, grams: alt.grams, note: i.note } : null;
    }).filter(Boolean);
  }));
  meals.forEach(m => { m.options = m.options.filter(o => o.items.length); });
  // Hora del desayuno según la hora de despertar
  if (d.despierta && meals[0]) { const [hh, mm] = d.despierta.split(':').map(Number); const tm = hh * 60 + mm + 30; meals[0].time_label = Math.floor(tm / 60) + ':' + pad2(tm % 60); }
  scaleMeals(meals, macroFactors(meals, t));
  if (swapped.length) notes.push('Sustituciones por restricciones o preferencias: ' + swapped.join('; ') + '.');
  return { meals, notes: st.notes || S.settings.plan_notes || DEFAULT_PLAN_NOTES, log: notes };
}
async function insertNutritionPlan(cid, t, built, active) {
  const [p] = await DB.insert('nutrition_plans', { client_id: cid, is_template: false, review: true, active, name: 'Plan nutricional · Fase 1', kcal: t.kcal, protein_g: t.protein, carbs_g: t.carbs, fat_g: t.fat, water_ml: t.water, notes: built.notes });
  for (let mi = 0; mi < built.meals.length; mi++) {
    const m = built.meals[mi];
    const [nm] = await DB.insert('plan_meals', { plan_id: p.id, name: m.name, time_label: m.time_label, instructions: m.instructions || '', position: mi });
    for (let oi = 0; oi < m.options.length; oi++) {
      const o = m.options[oi];
      const [no] = await DB.insert('plan_options', { meal_id: nm.id, name: o.name, position: oi });
      await DB.insert('plan_items', o.items.map((i, ii) => ({ option_id: no.id, food_id: i.food_id, grams: i.grams, position: ii, note: i.note || '' })));
    }
  }
  return p.id;
}

/* =====================================================================
   Generación de la rutina
   ===================================================================== */
const FAM = { squat: 'Sentadilla y prensa', hinge: 'Bisagra de cadera', lunge: 'Unilateral de pierna', knee: 'Extensión de rodilla', curl: 'Curl femoral', glute: 'Empuje de cadera', abd: 'Abducción y extensión de cadera', calf: 'Elevación de talones', hpush: 'Press horizontal', ipush: 'Press inclinado', vpush: 'Press vertical', hpull: 'Remo horizontal', vpull: 'Tracción vertical', fly: 'Aperturas', lat: 'Elevaciones laterales', rear: 'Deltoide posterior', bi: 'Curl de bíceps', tri: 'Extensión de tríceps', core1: 'Anti-extensión', core2: 'Anti-rotación y rotación', core3: 'Flexión de tronco', power: 'Lanzamientos con balón medicinal', jump: 'Saltos', hipx: 'Extensión explosiva de cadera', rc: 'Rotación de hombro', scap: 'Estabilidad escapular', grip: 'Muñeca y agarre' };
const FALLBACK = { vpull: 'hpull', knee: 'lunge', curl: 'hinge', fly: 'hpush', power: 'jump', hipx: 'jump', glute: 'hinge', abd: 'glute', rear: 'scap', lat: 'vpush', rc: 'scap', scap: 'rear', grip: 'core1' };
const COMPOUND = new Set(['squat', 'hinge', 'lunge', 'glute', 'hpush', 'ipush', 'vpush', 'hpull', 'vpull']);
const DAY_T = {
  full_a: ['Cuerpo completo A', ['squat', 'hpush', 'hpull', 'hinge', 'lat', 'core1', 'bi']],
  full_b: ['Cuerpo completo B', ['hinge', 'vpull', 'ipush', 'lunge', 'rear', 'core2', 'tri']],
  full_c: ['Cuerpo completo C', ['lunge', 'hpush', 'vpull', 'glute', 'calf', 'core3', 'bi']],
  upper_a: ['Tren superior A', ['hpush', 'hpull', 'vpush', 'vpull', 'lat', 'bi', 'tri']],
  upper_b: ['Tren superior B', ['ipush', 'vpull', 'hpull', 'vpush', 'rear', 'tri', 'bi']],
  lower_a: ['Tren inferior A', ['squat', 'hinge', 'lunge', 'curl', 'calf', 'core1', 'abd']],
  lower_b: ['Tren inferior B', ['hinge', 'squat', 'glute', 'knee', 'calf', 'core2', 'abd']],
  push: ['Empuje', ['hpush', 'vpush', 'ipush', 'lat', 'tri', 'fly', 'core3']],
  pull: ['Tracción', ['vpull', 'hpull', 'rear', 'bi', 'scap', 'core1', 'grip']],
  legs: ['Pierna', ['squat', 'hinge', 'lunge', 'curl', 'calf', 'core2', 'glute']],
  power: ['Potencia y prevención', ['jump', 'power', 'hipx', 'lunge', 'rc', 'core2', 'scap']]
};
const SPLIT = { 2: ['full_a', 'full_b'], 3: ['full_a', 'full_b', 'full_c'], 4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'], 5: ['upper_a', 'lower_a', 'upper_b', 'lower_b', 'full_c'], 6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] };
const SPLIT_TENNIS = { 2: ['full_a', 'full_b'], 3: ['lower_a', 'upper_a', 'power'], 4: ['lower_a', 'upper_a', 'power', 'upper_b'], 5: ['lower_a', 'upper_a', 'power', 'lower_b', 'upper_b'], 6: ['lower_a', 'upper_a', 'power', 'lower_b', 'upper_b', 'power'] };
const PREF = {
  beg: ['Máquina', 'Polea', 'Mancuernas', 'Smith', 'Peso corporal', 'Kettlebell', 'Barra Z', 'Barra', 'Balón medicinal', 'Cajón', 'Banco', 'Banda', 'Barra hexagonal'],
  int: ['Mancuernas', 'Barra', 'Polea', 'Máquina', 'Barra Z', 'Smith', 'Peso corporal', 'Kettlebell', 'Balón medicinal', 'Cajón', 'Barra hexagonal', 'Banco', 'Banda'],
  adv: ['Barra', 'Barra hexagonal', 'Mancuernas', 'Polea', 'Máquina', 'Barra Z', 'Smith', 'Peso corporal', 'Kettlebell', 'Balón medicinal', 'Cajón', 'Banco', 'Banda'],
  home: ['Mancuernas', 'Banda', 'Peso corporal', 'Banco']
};
const BEG_FIRST = new Set(['Prensa de piernas', 'Press de pecho en máquina', 'Remo sentado en polea', 'Jalón al pecho agarre neutro', 'Press de hombro en máquina', 'Peso muerto rumano con mancuernas', 'Hip thrust en máquina', 'Curl femoral sentado', 'Zancadas con mancuernas', 'Sentadilla goblet']);
function prescribe(slot, lvl, name) {
  if (['jump', 'power', 'hipx'].includes(slot)) return { sets: lvl === 'beg' ? 3 : 4, reps: slot === 'jump' ? '4' : '6', rir: '', rest: 90 };
  if (['rc', 'scap', 'grip'].includes(slot)) return { sets: lvl === 'beg' ? 2 : 3, reps: '12-15', rir: '2', rest: 45 };
  if (/plancha/i.test(name)) return { sets: 3, reps: '30-45 s', rir: '', rest: 45 };
  if (/^core/.test(slot)) return { sets: lvl === 'beg' ? 2 : 3, reps: '10-12', rir: '2', rest: 45 };
  const c = COMPOUND.has(slot);
  if (lvl === 'beg') return { sets: c ? 3 : 2, reps: c ? '10-12' : '12-15', rir: '3', rest: c ? 90 : 60 };
  if (lvl === 'int') return { sets: c ? 4 : 3, reps: c ? '8-10' : '10-12', rir: '2', rest: c ? 120 : 75 };
  return { sets: c ? 4 : 3, reps: c ? '6-8' : '8-12', rir: '1-2', rest: c ? 150 : 75 };
}
function buildRoutine(d, t) {
  const home = d.lugar === 'Casa';
  const eq = d.equipo || [];
  const allow = home ? new Set(['Peso corporal', ...(eq.includes('Mancuernas') ? ['Mancuernas'] : []), ...(eq.includes('Bandas elásticas') ? ['Banda'] : []), ...(eq.includes('Banco') ? ['Banco'] : [])]) : null;
  const bar = eq.includes('Barra de dominadas');
  const pref = home ? PREF.home : PREF[t.level];
  const rank = x => { const i = pref.indexOf(x.equipment); return (i < 0 ? 50 : i) - (t.level === 'beg' && BEG_FIRST.has(x.name) ? 0.5 : 0); };
  const ok = x => !allow || (allow.has(x.equipment) && (!/Dominadas$|colgado|paralelas|Remo invertido|Curl nórdico/.test(x.name) || (bar && /Dominadas$|colgado|Remo invertido/.test(x.name))));
  const usage = {};
  const pick = (slot, usedDay) => {
    let s = slot;
    for (let k = 0; k < 3 && s; k++) {
      const c = S.exercises.filter(x => x.family === FAM[s] && ok(x) && !usedDay.has(x.id)).sort((a, b) => rank(a) - rank(b));
      if (c.length) { const n = usage[s] = (usage[s] || 0) + 1; return { ex: c[(n - 1) % Math.min(c.length, 2)], slot: s }; }
      s = FALLBACK[s];
    }
    return null;
  };
  const split = (t.tennis ? SPLIT_TENNIS : SPLIT)[t.days];
  const perDay = { '30 min': 4, '45 min': 5, '60 min': 6, '90 min': 7 }[d.minutos] || 6;
  const weekdays = (d.dias || []).slice(0, 6);
  return split.map((key, i) => {
    let slots = DAY_T[key][1].slice();
    if (t.tennis && /upper/.test(key)) slots.splice(4, 0, 'rc');
    slots = slots.slice(0, perDay);
    const usedDay = new Set();
    const items = slots.map(sl => { const p = pick(sl, usedDay); if (!p) return null; usedDay.add(p.ex.id); return { exercise_id: p.ex.id, ...prescribe(p.slot, t.level, p.ex.name) }; }).filter(Boolean);
    return { name: (weekdays[i] || 'Día ' + (i + 1)) + ' · ' + DAY_T[key][0], items };
  });
}
async function insertRoutine(cid, days, active) {
  const [r] = await DB.insert('routines', { client_id: cid, is_template: false, review: true, active, name: 'Rutina · Fase 1', notes: S.settings.routine_notes || DEFAULT_ROUTINE_NOTES });
  for (let i = 0; i < days.length; i++) {
    const [dd] = await DB.insert('routine_days', { routine_id: r.id, name: days[i].name, position: i });
    await DB.insert('routine_exercises', days[i].items.map((x, j) => ({ day_id: dd.id, exercise_id: x.exercise_id, position: j, sets: x.sets, reps: x.reps, rir: x.rir, rest_seconds: x.rest, notes: '' })));
  }
  return r.id;
}
async function generateAll(cid, d, t, active) {
  const built = await buildNutrition(d, t);
  const planId = await insertNutritionPlan(cid, t, built, active);
  const routineId = await insertRoutine(cid, buildRoutine(d, t), active);
  return { planId, routineId, log: built.log };
}

/* =====================================================================
   ASESORADO · Asistente de valoración inicial
   ===================================================================== */
function intakeDraftKey() { return 'dp_intake_' + S.profile.id; }
function fieldHtml(f, v, missing) {
  if (f.show && !f.show(v)) return '';
  const val = v[f.id]; const req = f.req ? ' <span class="req">*</span>' : '';
  const miss = missing === f.id ? ' missing' : '';
  const lbl = `<span class="ob-l">${esc(f.label)}${req}</span>`;
  switch (f.type) {
    case 'h': return `<h3 class="ob-h">${esc(f.label)}</h3>`;
    case 'note': return `<p class="small muted">${esc(f.label)}</p>`;
    case 'text': case 'tel': case 'date': case 'time': case 'number':
      return `<label class="field ob-f${f.half ? ' half' : ''}${miss}" data-fid="${f.id}">${lbl}<div class="unit-w"><input class="input" data-k="${f.id}" type="${f.type === 'number' ? 'text' : f.type}" ${f.type === 'number' ? 'inputmode="decimal"' : ''}${f.type === 'tel' ? ' inputmode="tel" autocomplete="tel"' : ''} value="${esc(val ?? '')}" placeholder="${esc(f.ph || '')}">${f.unit ? `<span>${f.unit}</span>` : ''}</div></label>`;
    case 'textarea': return `<label class="field ob-f${miss}" data-fid="${f.id}">${lbl}<textarea class="input" data-k="${f.id}" rows="${f.small ? 2 : 3}" placeholder="${esc(f.ph || '')}">${esc(val ?? '')}</textarea></label>`;
    case 'radio': case 'yn': {
      const opts = f.type === 'yn' ? SI_NO : f.opts;
      return `<div class="field ob-f${f.type === 'yn' ? ' yn' : ''}${miss}" data-fid="${f.id}">${lbl}<div class="chips">${opts.map(o => `<button type="button" class="chip${val === o ? ' on' : ''}" data-act="pick" data-k="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
    }
    case 'scale': return `<div class="field ob-f${miss}" data-fid="${f.id}">${lbl}<div class="chips scale">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(o => `<button type="button" class="chip${String(val) === String(o) ? ' on' : ''}" data-act="pick" data-k="${f.id}" data-v="${o}">${o}</button>`).join('')}</div><div class="scale-ends"><span>1 · ${esc(f.ends[0])}</span><span>10 · ${esc(f.ends[1])}</span></div></div>`;
    case 'checks': return `<div class="field ob-f${miss}" data-fid="${f.id}">${lbl}<div class="chips">${f.opts.map(o => `<button type="button" class="chip${(val || []).includes(o) ? ' on' : ''}" data-act="toggle" data-k="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
    case 'consent': return `<label class="consent${miss}" data-fid="${f.id}"><input type="checkbox" data-k="${f.id}" ${val === 'Sí' ? 'checked' : ''}><span>${esc(f.label)}${f.req ? ' *' : ''}</span></label>`;
  }
  return '';
}
function vOnboarding() {
  document.body.classList.add('onboarding');
  let st = { step: 0, v: {}, missing: null };
  try { st = Object.assign(st, JSON.parse(localStorage.getItem(intakeDraftKey()) || '{}')); } catch (e) { }
  if (!st.v.nombre) st.v.nombre = S.profile.full_name || '';
  if (!st.v.whatsapp && S.profile.phone) st.v.whatsapp = S.profile.phone;
  const save = () => { try { localStorage.setItem(intakeDraftKey(), JSON.stringify({ step: st.step, v: st.v })); } catch (e) { } };
  const fieldById = id => INTAKE.flatMap(s => s.f).find(f => f.id === id);
  const validate = () => {
    for (const f of INTAKE[st.step].f) {
      if (!f.id || (f.show && !f.show(st.v))) continue;
      const v = st.v[f.id];
      if (f.req && (v == null || v === '' || (Array.isArray(v) && !v.length) || (f.type === 'consent' && v !== 'Sí'))) return f;
      if (f.type === 'number' && v !== '' && v != null && (num(v) < (f.min ?? -1e9) || num(v) > (f.max ?? 1e9))) return f;
    }
    return null;
  };
  const draw = () => {
    const sec = INTAKE[st.step]; const n = INTAKE.length;
    paint(`<div class="ob">
      <div class="ob-prog"><div style="width:${((st.step + 1) / n * 100).toFixed(1)}%"></div></div>
      <p class="small muted">Paso ${st.step + 1} de ${n}</p>
      <h2 class="sec">${esc(sec.t)}</h2><p class="small muted">${esc(sec.d)}</p>
      <div class="card ob-card">${sec.f.map(f => fieldHtml(f, st.v, st.missing)).join('')}</div>
      <div class="row-btns ob-nav">${st.step ? '<button class="btn" data-act="prev">Anterior</button>' : ''}<button class="btn primary" data-act="${st.step === n - 1 ? 'submit' : 'next'}">${st.step === n - 1 ? 'Enviar valoración' : 'Siguiente'}</button></div>
      <p class="small muted center">Tus respuestas se guardan en este dispositivo mientras completas la valoración. <button class="linkbtn" data-act="logout">Cerrar sesión</button></p>
    </div>`, {
      click: {
        logout: async () => { await Auth.signOut(); S.profile = null; document.body.classList.remove('onboarding'); location.hash = ''; afterAuth(); },
        pick: el => { st.v[el.dataset.k] = el.dataset.v; st.missing = null; save(); keepScroll(async () => draw()); },
        toggle: el => {
          const f = fieldById(el.dataset.k); let a = (st.v[f.id] || []).slice(); const o = el.dataset.v;
          if (a.includes(o)) a = a.filter(x => x !== o); else { a.push(o); if (f.none) a = o === f.none ? [o] : a.filter(x => x !== f.none); }
          st.v[f.id] = a; st.missing = null; save(); keepScroll(async () => draw());
        },
        prev: () => { st.step--; st.missing = null; save(); draw(); window.scrollTo(0, 0); },
        next: () => { const bad = validate(); if (bad) { st.missing = bad.id; draw(); toast('Completa: ' + bad.label, 'error'); const el = document.querySelector(`[data-fid="${bad.id}"]`); if (el) el.scrollIntoView({ block: 'center' }); return; } st.step++; st.missing = null; save(); draw(); window.scrollTo(0, 0); },
        submit: async el => { const bad = validate(); if (bad) { st.missing = bad.id; draw(); toast('Completa: ' + bad.label, 'error'); return; } el.disabled = true; el.textContent = 'Generando tu plan…'; await submitIntake(st.v); }
      },
      input: t => { if (t.dataset.k && t.type !== 'checkbox') { st.v[t.dataset.k] = t.value; save(); } },
      change: t => { if (t.dataset.k && t.type === 'checkbox') { st.v[t.dataset.k] = t.checked ? 'Sí' : ''; save(); } }
    }, 'Valoración inicial');
  };
  draw();
}
async function submitIntake(d) {
  const cid = S.profile.id;
  document.body.classList.remove('onboarding');
  const t = computeTargets(d);
  const auto = !!S.settings.auto_publish && !blocking(t.flags);
  try {
    await DB.update('profiles', cid, { full_name: d.nombre.trim(), phone: d.whatsapp.trim() });
    Object.assign(S.profile, { full_name: d.nombre.trim(), phone: d.whatsapp.trim() });
    const g = await generateAll(cid, d, t, auto);
    const calc = { ...t, flags: undefined, plan_id: g.planId, routine_id: g.routineId, log: g.log };
    const [it] = await DB.insert('intakes', { client_id: cid, data: d, calc, flags: t.flags, status: auto ? 'approved' : 'pending' });
    S.intake = it; S.needsIntake = false;
    await DB.insert('body_logs', { client_id: cid, log_date: todayStr(), weight_kg: num(d.peso), waist_cm: num(d.cintura) || null, body_fat: null, notes: 'Valoración inicial' });
    try { localStorage.removeItem(intakeDraftKey()); } catch (e) { }
    const parq = t.flags.some(f => /PAR-Q/.test(f.text));
    paint(`<div class="card done-card">
      <h2>${auto ? 'Tu plan está listo' : 'Valoración enviada'}</h2>
      <p>${auto ? 'Tu plan nutricional y tu rutina de entrenamiento ya están disponibles.' : 'Tu entrenador revisará tus respuestas y tu plan. Cuando lo apruebe, aparecerá en las secciones Hoy y Entreno.'}</p>
      ${parq ? '<p class="warn-box">Por tus respuestas en la sección de salud, se recomienda contar con autorización médica antes de iniciar el entrenamiento.</p>' : ''}
      <a class="btn primary block" href="#/hoy">Continuar</a>
      ${waBtn(S.settings.whatsapp, `Hola, soy ${d.nombre}. Acabo de enviar mi valoración inicial en Deuce Point.`, 'Avisar a mi entrenador por WhatsApp', 'btn block')}
    </div>`, {}, auto ? 'Plan listo' : 'Valoración enviada');
  } catch (e) {
    console.error(e);
    paint(`<div class="card"><p>No se pudo completar el envío: ${esc(errMsg(e))}</p><p class="small muted">Tus respuestas siguen guardadas en este dispositivo.</p><button class="btn primary" onclick="vOnboarding()">Volver a intentar</button></div>`);
  }
}

/* =====================================================================
   Documento de la valoración (PDF / HTML)
   ===================================================================== */
function intakeAnswersHtml(d, cls = '') {
  return INTAKE.map(sec => {
    const rows = sec.f.filter(f => f.id && (!f.show || f.show(d)) && d[f.id] != null && fmtAns(d[f.id]) !== '').map(f => `<tr><td>${esc(f.label)}</td><td>${esc(fmtAns(d[f.id]))}${f.unit ? ' ' + f.unit : ''}</td></tr>`).join('');
    return rows ? `<h2>${esc(sec.t)}</h2><table class="doc-t ${cls}"><tbody>${rows}</tbody></table>` : '';
  }).join('');
}
function calcRows(c) {
  return [['Edad', c.age + ' años'], ['IMC', fmtN(c.bmi)], ['Objetivo', GOAL_LBL[c.goal]], ['Factor de actividad', String(c.fa).replace('.', ',')], ['Gasto en reposo (Mifflin-St Jeor)', fmtInt(c.ree) + ' kcal'], ['Gasto total', fmtInt(c.tdee) + ' kcal'], ['Ajuste', (c.adj > 0 ? '+' : '') + c.adj + ' %'], ['Calorías del plan', fmtInt(c.kcal) + ' kcal'],
    ['Proteína', `${fmtInt(c.protein)} g (${fmtN(c.pg)} g/kg sobre ${fmtN(c.refW)} kg)`], ['Grasa', fmtInt(c.fat) + ' g'], ['Carbohidratos', fmtInt(c.carbs) + ' g'], ['Comidas', c.meals], ['Agua', (c.water / 1000).toLocaleString('es-CO') + ' L'],
    ['Entrenamiento', `${c.days} días · nivel ${{ beg: 'principiante', int: 'intermedio', adv: 'avanzado' }[c.level]}${c.tennis ? ' · enfoque tenis' : ''}`]];
}
function intakeDocHtml(client, it, forCoach, logo) {
  const c = it.calc || {};
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Valoración inicial</h1><p><b>${esc(client.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · ${new Date(it.created_at || Date.now()).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div></div>`;
  if (forCoach) {
    if ((it.flags || []).length) h += `<h2>Alertas</h2><ul class="doc-repl">${it.flags.map(f => `<li><b>${esc(f.level === 'alta' ? 'Alta' : f.level === 'media' ? 'Media' : 'Informativa')}:</b> ${esc(f.text)}</li>`).join('')}</ul>`;
    if (c.kcal) h += `<h2>Cálculo de requerimientos</h2><table class="doc-t"><tbody>${calcRows(c).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
  }
  return h + intakeAnswersHtml(it.data || {}) + `<p class="doc-foot">Documento confidencial. Datos tratados conforme a la Ley 1581 de 2012 con fines exclusivos de la asesoría.</p>`;
}
/* Imprime solo el documento (PDF), sin la interfaz de la app */
function printDoc(html, name) {
  ensureDocCss();
  let pa = document.getElementById('print-area');
  if (!pa) { pa = document.createElement('div'); pa.id = 'print-area'; document.body.appendChild(pa); }
  pa.innerHTML = `<div class="doc">${html}</div>`;
  document.body.classList.add('print-doc');
  const t = document.title; document.title = name;
  const done = () => { document.body.classList.remove('print-doc'); pa.innerHTML = ''; document.title = t; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
function docButtons(name, bodyFn) {
  return {
    pdf: () => printDoc(bodyFn(BRAND.logoFull || BRAND.logo), name),
    html: async () => { const logo = BRAND.logoFull || BRAND.logo; const body = bodyFn(logo ? await toDataUrl(logo) : ''); downloadFile(name + '.html', `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title><style>body{margin:0;background:#f3f5f1}.wrap{max-width:820px;margin:0 auto;padding:16px}${DOC_CSS}</style></head><body><div class="wrap"><div class="doc">${body}</div></div></body></html>`, 'text/html'); }
  };
}
async function vMiValoracion() {
  const it = (await DB.select('intakes', { eq: { client_id: S.profile.id } }))[0];
  if (!it) return vOnboarding();
  ensureDocCss();
  const name = 'Valoración inicial - ' + S.profile.full_name;
  const b = docButtons(name, logo => intakeDocHtml(S.profile, it, false, logo));
  paint(`<div class="row-btns no-print"><a class="btn" href="#/perfil">← Perfil</a><button class="btn primary" data-act="pdf">Descargar PDF</button><button class="btn" data-act="html">Descargar HTML</button></div>
    <div class="doc">${intakeDocHtml(S.profile, it, false, BRAND.logoFull || BRAND.logo)}</div>`, { click: b });
}

/* =====================================================================
   ENTRENADOR · Pestaña Valoración del asesorado
   ===================================================================== */
async function coachValoracionTab(cid) {
  const it = (await DB.select('intakes', { eq: { client_id: cid } }))[0];
  const client = (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  if (!it) return { html: '<div class="card empty"><p>Este asesorado aún no ha completado la valoración inicial.</p><p class="small muted">Se le solicita automáticamente al iniciar sesión si no tiene plan ni rutina asignados.</p></div>' };
  const c = it.calc || {};
  const plans = await DB.select('nutrition_plans', { eq: { client_id: cid }, order: 'created_at', asc: false });
  const routines = await DB.select('routines', { eq: { client_id: cid }, order: 'created_at', asc: false });
  const pp = plans.find(p => p.review) || plans.find(p => p.id === c.plan_id);
  const rr = routines.find(r => r.review) || routines.find(r => r.id === c.routine_id);
  const lvl = { alta: 'Alta', media: 'Media', info: 'Informativa' };
  ensureDocCss();
  const name = 'Valoración inicial - ' + (client.full_name || '');
  const docs = docButtons(name, logo => intakeDocHtml(client, it, true, logo));
  const html = `
    <div class="card"><div class="day-h"><div><h3>Valoración inicial</h3><small class="muted">Enviada ${fmtDateShort(it.created_at)}${it.reviewed_at ? ' · aprobada ' + fmtDateShort(it.reviewed_at) : ''}</small></div><span class="badge ${it.status === 'approved' ? 'ok' : 'warnb'}">${it.status === 'approved' ? 'Aprobada' : 'Por revisar'}</span></div>
      ${(it.flags || []).length ? `<div class="flags">${it.flags.map(f => `<div class="flag ${f.level}"><b>${lvl[f.level]}</b> ${esc(f.text)}</div>`).join('')}</div>` : '<p class="small muted">Sin alertas de seguridad.</p>'}
      ${(c.log || []).length ? `<p class="small muted">${esc(c.log.join(' '))}</p>` : ''}
      <div class="row-btns">${it.status !== 'approved' ? '<button class="btn primary" data-act="vApprove">Aprobar y publicar</button>' : ''}<button class="btn" data-act="vRegen">Regenerar con ajustes</button>${waBtn(client.phone, `Hola ${firstName(client.full_name)}, revisé tu valoración en Deuce Point.`)}</div></div>
    <div class="card"><h3>Plan y rutina generados</h3>
      ${pp ? `<div class="day-h"><div><b>${esc(pp.name)}</b><small class="muted"> · ${esc(targetsLine(pp))}</small></div><span class="badge ${pp.active ? 'ok' : ''}">${pp.review ? 'Borrador' : pp.active ? 'Activo' : 'Inactivo'}</span></div><div class="row-btns"><a class="btn sm primary" href="#/plan-nutri/${pp.id}">Revisar plan</a><a class="btn sm" href="#/plan-ver/${pp.id}">Ver / PDF</a></div>` : '<p class="small muted">Sin plan generado.</p>'}
      ${rr ? `<div class="day-h" style="margin-top:12px"><div><b>${esc(rr.name)}</b></div><span class="badge ${rr.active ? 'ok' : ''}">${rr.review ? 'Borrador' : rr.active ? 'Activa' : 'Inactiva'}</span></div><div class="row-btns"><a class="btn sm primary" href="#/rutina/${rr.id}">Revisar rutina</a></div>` : '<p class="small muted">Sin rutina generada.</p>'}
    </div>
    ${c.kcal ? `<div class="card"><h3>Cálculo de requerimientos</h3><table class="tbl"><tbody>${calcRows(c).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(String(b))}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="row-btns no-print"><button class="btn" data-act="pdf">Descargar PDF</button><button class="btn" data-act="html">Descargar HTML</button></div>
    <div class="doc ans">${intakeAnswersHtml(it.data || {}, 'compact')}</div>`;
  return {
    html, click: {
      ...docs,
      vApprove: async () => {
        if (!confirm('¿Aprobar y publicar el plan y la rutina? El asesorado los verá de inmediato.')) return;
        await approveGenerated(cid, it.id); toast('Plan y rutina publicados'); route();
      },
      vRegen: () => regenModal(cid, it)
    }
  };
}
async function approveGenerated(cid, intakeId) {
  const plans = await DB.select('nutrition_plans', { eq: { client_id: cid, review: true }, order: 'created_at', asc: false });
  if (plans[0]) { await deactivatePlans(cid, plans[0].id); await DB.update('nutrition_plans', plans[0].id, { active: true, review: false }); }
  const rs = await DB.select('routines', { eq: { client_id: cid, review: true }, order: 'created_at', asc: false });
  if (rs[0]) {
    for (const r of await DB.select('routines', { eq: { client_id: cid, active: true } })) if (r.id !== rs[0].id) await DB.update('routines', r.id, { active: false });
    await DB.update('routines', rs[0].id, { active: true, review: false });
  }
  if (intakeId) await DB.update('intakes', intakeId, { status: 'approved', reviewed_at: new Date().toISOString() });
}
function regenModal(cid, it) {
  const c = it.calc || {};
  const defAdj = g => ({ perdida: -num(S.settings.deficit_pct ?? 22), recomp: -num(S.settings.recomp_pct ?? 10), ganancia: num(S.settings.surplus_pct ?? 12), mant: 0 })[g];
  modal(`${modalHead('Regenerar con ajustes')}
    <p class="small muted">Se eliminan los borradores pendientes y se generan de nuevo con estos parámetros.</p>
    <label class="field"><span>Objetivo</span><select class="input" id="rg-goal">${Object.entries(GOAL_LBL).map(([k, l]) => `<option value="${k}"${k === c.goal ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <div class="rex-grid three"><label><span>Factor actividad</span><select class="input" id="rg-fa">${FA_OPTS.map(([v, l]) => `<option value="${v}"${v === c.fa ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label><span>Ajuste %</span><input class="input" id="rg-adj" inputmode="numeric" value="${c.adj ?? ''}"></label><label><span>Comidas</span><select class="input" id="rg-meals"><option${c.meals === 5 ? ' selected' : ''}>5</option><option${c.meals === 4 ? ' selected' : ''}>4</option></select></label></div>
    <div class="rex-grid three"><label><span>Proteína g/kg</span><input class="input" id="rg-pg" inputmode="decimal" value="${c.pg ?? ''}"></label><label><span>Grasa g/kg</span><input class="input" id="rg-fg" inputmode="decimal" value="${c.fg ?? ''}"></label><label><span>Días entreno</span><select class="input" id="rg-days">${[2, 3, 4, 5, 6].map(n => `<option${n === c.days ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <label class="check"><input type="checkbox" id="rg-plan" checked> Regenerar plan nutricional</label>
    <label class="check"><input type="checkbox" id="rg-rut" checked> Regenerar rutina</label>
    <button class="btn primary block" data-act="go">Regenerar</button>`, {
    change: t => { if (t.id === 'rg-goal') $('#rg-adj').value = defAdj(t.value); },
    click: {
      go: async el => {
        el.disabled = true; el.textContent = 'Generando…';
        const ov = { goal: $('#rg-goal').value, fa: num($('#rg-fa').value), adjPct: $('#rg-adj').value.trim(), meals: num($('#rg-meals').value), proteinGkg: num($('#rg-pg').value), fatGkg: num($('#rg-fg').value) };
        const t = computeTargets(it.data, ov); t.days = num($('#rg-days').value) || t.days;
        const calc = Object.assign({}, c, t, { flags: undefined });
        if ($('#rg-plan').checked) {
          for (const p of await DB.select('nutrition_plans', { eq: { client_id: cid, review: true } })) await DB.remove('nutrition_plans', p.id);
          const built = await buildNutrition(it.data, t); calc.plan_id = await insertNutritionPlan(cid, t, built, false); calc.log = built.log;
        }
        if ($('#rg-rut').checked) {
          for (const r of await DB.select('routines', { eq: { client_id: cid, review: true } })) await DB.remove('routines', r.id);
          calc.routine_id = await insertRoutine(cid, buildRoutine(it.data, t), false);
        }
        await DB.update('intakes', it.id, { calc, flags: t.flags, status: 'pending' });
        closeModal(); toast('Borradores regenerados'); route();
      }
    }
  });
}

/* =====================================================================
   Check-in semanal
   ===================================================================== */
const CK_SCALES = [['adherence', 'Cumplimiento del plan de alimentación', 'Cumplimiento'], ['performance', 'Rendimiento en los entrenamientos', 'Rendimiento'], ['energy', 'Energía durante el día', 'Energía'], ['sleep', 'Calidad del sueño', 'Sueño'], ['hunger', 'Nivel de hambre', 'Hambre'], ['stress', 'Nivel de estrés', 'Estrés']];
async function checkinStatus(cid) {
  const cks = await DB.select('checkins', { eq: { client_id: cid }, order: 'check_date', asc: false, limit: 5 });
  const it = S.intake || (await DB.select('intakes', { eq: { client_id: cid } }))[0];
  const last = cks[0];
  const ref = last ? last.check_date : (it ? dateStr(new Date(it.created_at)) : null);
  const due = !!ref && daysBetween(ref, todayStr()) >= (last ? 7 : 6);
  const reply = cks.find(c => c.coach_reply && c.reviewed_at && daysBetween(dateStr(new Date(c.reviewed_at)), todayStr()) <= 10);
  return { due, last, reply };
}
async function checkinCardsHtml(cid) {
  const s = await checkinStatus(cid); let h = '';
  if (s.reply) h += `<div class="card reply"><small class="muted">Mensaje de tu entrenador · check-in del ${fmtDM(parseDay(s.reply.check_date))}</small><p class="pre">${esc(s.reply.coach_reply)}</p></div>`;
  if (s.due) h += `<a class="card row-link ck-due" href="#/checkin"><div><b>Check-in semanal pendiente</b><small class="muted">Registra tu peso y cómo te sentiste esta semana (1 minuto).</small></div><span class="chev">›</span></a>`;
  return h;
}
async function vCheckin() {
  const v = {};
  const draw = () => paint(`<p class="small muted">Responde con base en los últimos 7 días. Tu entrenador revisa esta información para ajustar tu plan.</p>
    <div class="card">
      <div class="rex-grid"><label><span>Peso kg</span><input class="input" id="ck-w" inputmode="decimal" value="${esc(v.w || '')}"></label><label><span>Cintura cm</span><input class="input" id="ck-c" inputmode="decimal" value="${esc(v.c || '')}"></label></div>
      <p class="small muted">Pésate en ayunas, después de ir al baño y con ropa ligera.</p>
      ${CK_SCALES.map(([k, l]) => `<div class="field"><span class="ob-l">${esc(l)}</span><div class="chips scale">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button type="button" class="chip${v[k] === n ? ' on' : ''}" data-act="pick" data-k="${k}" data-v="${n}">${n}</button>`).join('')}</div></div>`).join('')}
      <label class="field"><span>Comentarios para tu entrenador</span><textarea class="input" id="ck-n" rows="3" placeholder="Dificultades, molestias, cambios en tu rutina…">${esc(v.n || '')}</textarea></label>
      <button class="btn primary block" data-act="send">Enviar check-in</button>
    </div>`, {
    input: t => { if (t.id === 'ck-w') v.w = t.value; if (t.id === 'ck-c') v.c = t.value; if (t.id === 'ck-n') v.n = t.value; },
    click: {
      pick: el => { v[el.dataset.k] = +el.dataset.v; keepScroll(async () => draw()); },
      send: async () => {
        if (!num(v.w)) return toast('Indica tu peso', 'error');
        const missing = CK_SCALES.find(([k]) => !v[k]); if (missing) return toast('Responde: ' + missing[1], 'error');
        const rec = { client_id: S.profile.id, check_date: todayStr(), weight_kg: num(v.w), waist_cm: num(v.c) || null, notes: (v.n || '').trim() || null, status: 'pending' };
        CK_SCALES.forEach(([k]) => { rec[k] = v[k]; });
        await DB.insert('checkins', rec);
        await DB.insert('body_logs', { client_id: S.profile.id, log_date: todayStr(), weight_kg: num(v.w), waist_cm: num(v.c) || null, body_fat: null, notes: 'Check-in semanal' });
        toast('Check-in enviado'); location.hash = '#/hoy';
      }
    }
  }, 'Check-in semanal');
  draw();
}

/* Análisis y sugerencia de ajuste */
function dayCompletion(plan, dayLogs, daily) {
  if (!plan) return null;
  const ch = (daily && daily.choices) || {}; let total = 0, done = 0;
  plan.meals.forEach(me => { const o = me.options.find(x => x.id === ch[me.id]) || me.options[0]; if (!o) return; total += o.items.length; done += o.items.filter(i => dayLogs.some(l => l.plan_item_id === i.id)).length; });
  return total ? Math.round(done / total * 100) : null;
}
function suggestAdjust(goal, ck, prev, adh) {
  if (!prev || !num(ck.weight_kg) || !num(prev.weight_kg)) return { delta: 0, text: 'Sin peso de referencia anterior: no se sugiere ajuste.' };
  const days = Math.max(1, daysBetween(prev.date, ck.check_date));
  const wk = (num(ck.weight_kg) - num(prev.weight_kg)) / num(prev.weight_kg) * 100 * 7 / days;
  const r = `${wk > 0 ? '+' : ''}${fmtN(wk)} % del peso por semana`;
  if (adh != null && adh < 60) return { delta: 0, wk, text: `Cumplimiento registrado de ${adh} %: antes de modificar las calorías se recomienda mejorar la adherencia al plan actual (${r}).` };
  if (goal === 'perdida' || goal === 'recomp') {
    if (wk > (goal === 'recomp' ? 0.3 : -0.25)) return { delta: -150, wk, text: `El peso no disminuye al ritmo esperado (${r}). Se sugiere reducir 150 kcal, principalmente de carbohidratos.` };
    if (wk < -1.2) return { delta: 100, wk, text: `Pérdida de peso más rápida de lo recomendado (${r}). Se sugiere aumentar 100 kcal.` };
  } else if (goal === 'ganancia') {
    if (wk < 0.1) return { delta: 150, wk, text: `El peso no aumenta al ritmo esperado (${r}). Se sugiere aumentar 150 kcal.` };
    if (wk > 0.6) return { delta: -100, wk, text: `Aumento de peso más rápido de lo recomendado (${r}). Se sugiere reducir 100 kcal.` };
  } else if (Math.abs(wk) > 0.5) return { delta: wk > 0 ? -100 : 100, wk, text: `Variación de peso fuera del rango de mantenimiento (${r}). Se sugiere ajustar ${wk > 0 ? '−' : '+'}100 kcal.` };
  return { delta: 0, wk, text: `Progreso dentro del rango esperado (${r}). Se sugiere mantener el plan.` };
}
async function applyKcalDelta(cid, delta) {
  const base = await activePlanFor(cid); if (!base) throw new Error('El asesorado no tiene un plan activo.');
  const t = targetsOf(base); const tot = planAvgTotals(base);
  const nt = { kcal: (t.kcal || tot.kcal) + delta, protein: t.protein || tot.protein, fat: t.fat || tot.fat, carbs: (t.carbs || tot.carbs) + delta / 4 };
  if (nt.carbs < 60) { nt.fat += (nt.carbs - 60) * 4 / 9; nt.carbs = 60; }
  const fac = macroFactors(base.meals, nt);
  for (const m of base.meals) for (const o of m.options) for (const i of o.items) { const f = foodOf(i.food_id); if (!f) continue; const g = Math.max(1, roundG(num(i.grams) * fac[MACRO_GROUP(f.category)])); if (g !== num(i.grams)) await DB.update('plan_items', i.id, { grams: g }); }
  await DB.update('nutrition_plans', base.id, { kcal: Math.round(nt.kcal / 10) * 10, protein_g: Math.round(nt.protein), carbs_g: Math.round(nt.carbs), fat_g: Math.round(nt.fat) });
}
async function coachCheckinsTab(cid) {
  const cks = await DB.select('checkins', { eq: { client_id: cid }, order: 'check_date', asc: false, limit: 12 });
  if (!cks.length) return { html: '<div class="card empty"><p>Sin check-ins registrados.</p><p class="small muted">Al asesorado se le solicita el check-in cada 7 días en su pantalla Hoy.</p></div>' };
  const it = (await DB.select('intakes', { eq: { client_id: cid } }))[0];
  const goal = (it && it.calc && it.calc.goal) || 'mant';
  const plan = await activePlanFor(cid);
  const start = addDays(cks[cks.length - 1].check_date, -7);
  const [logs, dailies, ws, bodies] = await Promise.all([DB.select('food_logs', { eq: { client_id: cid }, gte: { log_date: start } }), DB.select('daily_logs', { eq: { client_id: cid }, gte: { log_date: start } }), DB.select('workouts', { eq: { client_id: cid }, gte: { started_at: parseDay(start).toISOString() } }), DB.select('body_logs', { eq: { client_id: cid }, order: 'log_date' })]);
  const client = (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  const analyses = {};
  const rows = cks.map((ck, i) => {
    const prevCk = cks[i + 1];
    const prevBody = bodies.filter(b => b.log_date < ck.check_date && num(b.weight_kg)).pop();
    const prev = prevCk ? { date: prevCk.check_date, weight_kg: prevCk.weight_kg } : prevBody ? { date: prevBody.log_date, weight_kg: prevBody.weight_kg } : null;
    const days = Array.from({ length: 7 }, (_, k) => addDays(ck.check_date, -7 + k));
    const comps = days.map(dd => dayCompletion(plan, logs.filter(l => l.log_date === dd), dailies.find(x => x.log_date === dd))).filter(x => x != null);
    const logged = days.filter(dd => logs.some(l => l.log_date === dd)).length;
    const adh = comps.length && plan ? Math.round(comps.reduce((a, b) => a + b, 0) / comps.length) : null;
    const sess = ws.filter(w => { const d = dateStr(new Date(w.started_at)); return d >= days[0] && d < ck.check_date; }).length;
    const sug = suggestAdjust(goal, ck, prev, adh);
    analyses[ck.id] = sug;
    const dw = prev ? num(ck.weight_kg) - num(prev.weight_kg) : null;
    return `<div class="card ck ${ck.status}">
      <div class="day-h"><div><h3>Check-in · ${esc(fmtDayLong(ck.check_date))}</h3><small class="muted">${prev ? 'Comparado con ' + fmtDM(parseDay(prev.date)) : 'Primer registro'}</small></div><span class="badge ${ck.status === 'reviewed' ? 'ok' : 'warnb'}">${ck.status === 'reviewed' ? 'Revisado' : 'Pendiente'}</span></div>
      <div class="stats3"><div><b>${fmtN(ck.weight_kg)} kg</b><small>${dw == null ? 'Peso' : (dw > 0 ? '+' : '') + fmtN(dw) + ' kg'}</small></div><div><b>${adh == null ? '—' : adh + ' %'}</b><small>Cumplimiento registrado · ${logged}/7 días</small></div><div><b>${sess}</b><small>Sesiones de entrenamiento</small></div></div>
      ${hbars(CK_SCALES.filter(([k]) => ck[k] != null).map(([k, , sl]) => ({ label: sl, value: ck[k], text: ck[k] + '/10' })))}
      ${ck.notes ? `<p class="pre note">«${esc(ck.notes)}»</p>` : ''}
      <div class="suggest ${sug.delta ? 'act' : ''}"><b>Sugerencia:</b> ${esc(sug.text)}</div>
      ${ck.status === 'pending' ? `
        <label class="field"><span>Respuesta para el asesorado</span><textarea class="input" rows="3" data-reply="${ck.id}" placeholder="Indicaciones para la próxima semana…"></textarea></label>
        <div class="row-btns">${sug.delta && plan ? `<button class="btn" data-act="ckApply" data-id="${ck.id}">Aplicar ${sug.delta > 0 ? '+' : '−'}${Math.abs(sug.delta)} kcal al plan</button>` : ''}<button class="btn primary" data-act="ckDone" data-id="${ck.id}">Enviar respuesta y marcar revisado</button></div>`
      : (ck.coach_reply ? `<p class="small"><b>Tu respuesta:</b> ${esc(ck.coach_reply)}</p>` : '')}
    </div>`;
  }).join('');
  const wts = cks.slice().reverse().filter(c => num(c.weight_kg));
  const fl = wts.length ? Math.max(0, Math.floor(Math.min(...wts.map(c => num(c.weight_kg))) - 3)) : 0;
  const html = `<div class="card"><h3>Peso en los check-ins (kg)</h3>${vbars(wts.map((c, i) => ({ label: fmtDM(parseDay(c.check_date)), value: num(c.weight_kg), text: fmtN(c.weight_kg), hi: i === wts.length - 1 })), 'Sin datos.', fl)}<p class="small muted">Objetivo: ${esc(GOAL_LBL[goal])}. El eje inicia en ${fl} kg.</p></div>${rows}`;
  return {
    html, click: {
      ckApply: async el => {
        const s = analyses[el.dataset.id];
        if (!confirm(`¿Aplicar ${s.delta > 0 ? '+' : ''}${s.delta} kcal al plan activo? Las porciones se recalculan automáticamente.`)) return;
        await applyKcalDelta(cid, s.delta);
        const ta = document.querySelector(`[data-reply="${el.dataset.id}"]`);
        if (ta && !ta.value.trim()) ta.value = `Ajusté tu plan ${s.delta > 0 ? 'aumentando' : 'reduciendo'} ${Math.abs(s.delta)} kcal. Revisa las nuevas porciones en tu plan.`;
        toast('Plan ajustado'); el.disabled = true;
      },
      ckDone: async el => {
        const ta = document.querySelector(`[data-reply="${el.dataset.id}"]`);
        await DB.update('checkins', el.dataset.id, { coach_reply: (ta && ta.value.trim()) || null, status: 'reviewed', reviewed_at: new Date().toISOString() });
        toast('Check-in revisado'); route();
      }
    }
  };
}

/* =====================================================================
   ENTRENADOR · Bandeja de pendientes
   ===================================================================== */
async function inboxHtml(clients) {
  if (S.needsMigration) return `<div class="card warn-box"><b>Actualización pendiente de la base de datos.</b> Para activar la valoración inicial, los check-ins, la bandeja de pendientes y las fotos, ejecuta el archivo <code>supabase/migracion-v3.sql</code> en Supabase › SQL Editor.</div>`;
  try { return await inboxInner(clients); } catch (e) { console.error(e); return ''; }
}
async function inboxInner(clients) {
  const byId = Object.fromEntries(clients.map(c => [c.id, c]));
  const [intakes, cks, plans] = await Promise.all([
    DB.select('intakes', { eq: { status: 'pending' }, order: 'created_at' }),
    DB.select('checkins', { eq: { status: 'pending' }, order: 'check_date' }),
    DB.select('nutrition_plans', { eq: { active: true } })]);
  const withPlan = new Set(plans.map(p => p.client_id));
  const lastAct = {};
  const bump = (cid, d) => { if (d && (!lastAct[cid] || d > lastAct[cid])) lastAct[cid] = d; };
  let viaRpc = false;
  if (!DEMO) { try { (await DB.rpc('client_last_activity')).forEach(r => bump(r.client_id, r.last_date)); viaRpc = true; } catch (e) { console.warn(e); } }
  if (!viaRpc) {
    const since = addDays(todayStr(), -21);
    (await DB.select('food_logs', { gte: { log_date: since }, order: 'log_date', asc: false, limit: 5000 })).forEach(l => bump(l.client_id, l.log_date));
    (await DB.select('workouts', { gte: { started_at: parseDay(since).toISOString() }, limit: 5000 })).forEach(w => bump(w.client_id, dateStr(new Date(w.started_at))));
    (await DB.select('checkins', { gte: { check_date: since } })).forEach(c => bump(c.client_id, c.check_date));
  }
  const inactive = clients.filter(c => withPlan.has(c.id) && (!lastAct[c.id] || daysBetween(lastAct[c.id], todayStr()) >= 5));
  const rows = [];
  intakes.filter(i => byId[i.client_id]).forEach(i => rows.push(`<a class="ib-row" href="#/asesorado/${i.client_id}/valoracion"><span class="ib-tag v">Valoración</span><span class="ib-n">${esc(byId[i.client_id].full_name || byId[i.client_id].email)}</span><span class="ib-m">${(i.flags || []).filter(f => f.level !== 'info').length ? `<span class="warn">${(i.flags || []).filter(f => f.level !== 'info').length} alertas</span>` : 'Sin alertas'}</span></a>`));
  cks.filter(c => byId[c.client_id]).forEach(c => rows.push(`<a class="ib-row" href="#/asesorado/${c.client_id}/checkins"><span class="ib-tag c">Check-in</span><span class="ib-n">${esc(byId[c.client_id].full_name || '')}</span><span class="ib-m">${fmtDM(parseDay(c.check_date))}</span></a>`));
  inactive.forEach(c => rows.push(`<div class="ib-row"><span class="ib-tag i">Inactivo</span><a class="ib-n" href="#/asesorado/${c.id}/seguimiento">${esc(c.full_name || c.email)}</a><span class="ib-m">${lastAct[c.id] ? daysBetween(lastAct[c.id], todayStr()) + ' días' : 'sin registros'} ${waBtn(c.phone, `Hola ${firstName(c.full_name)}, ¿cómo vas con tu plan esta semana? Recuerda registrar tus comidas y entrenamientos en Deuce Point.`, 'WhatsApp', 'chip wa')}</span></div>`));
  return `<div class="card inbox"><div class="day-h"><h3>Pendientes</h3><a class="btn sm" href="#/ajustes">Ajustes</a></div>
    ${rows.length ? rows.join('') : '<p class="small muted">Sin pendientes. Las valoraciones nuevas, los check-ins y los asesorados sin registros durante 5 días aparecen aquí.</p>'}</div>`;
}

/* =====================================================================
   ENTRENADOR · Ajustes de automatización
   ===================================================================== */
async function vAjustes() {
  const s = S.settings;
  const tpls = await DB.select('nutrition_plans', { eq: { is_template: true }, order: 'name' });
  const sel = k => `<select class="input" data-s="${k}"><option value="">${k === 'tpl_default' ? 'Plan base del sistema (5 comidas)' : 'Igual que la plantilla general'}</option>${tpls.map(p => `<option value="${p.id}"${s[k] === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
  const n = (k, l) => `<label><span>${l}</span><input class="input" data-s="${k}" data-num="1" inputmode="decimal" value="${esc(s[k] ?? '')}"></label>`;
  paint(`<a class="linkbtn" href="#/asesorados">← Asesorados</a>
    <div class="card"><h3>Publicación</h3>
      <label class="check"><input type="checkbox" data-s="auto_publish" ${s.auto_publish ? 'checked' : ''}> Publicar automáticamente el plan y la rutina generados</label>
      <p class="small muted">Activado: las valoraciones sin alertas reciben su plan de inmediato y tú lo revisas después. Las valoraciones con alertas de salud (PAR-Q, conducta alimentaria, embarazo, menores de edad, lesiones, alergias o condiciones diagnosticadas) siempre quedan en revisión.<br>Desactivado: todos los planes esperan tu aprobación en la bandeja de pendientes.</p></div>
    <div class="card"><h3>Cálculo de requerimientos</h3>
      <div class="rex-grid three">${n('deficit_pct', 'Déficit %')}${n('recomp_pct', 'Recomposición %')}${n('surplus_pct', 'Superávit %')}</div>
      <div class="rex-grid">${n('protein_gkg', 'Proteína g/kg')}${n('fat_gkg', 'Grasa g/kg')}</div>
      <p class="small muted">Mifflin-St Jeor × factor de actividad. En reducción de grasa con IMC mayor a 25, la proteína se calcula sobre el peso correspondiente a IMC 25.</p></div>
    <div class="card"><h3>Plantillas usadas por la generación automática</h3>
      <label class="field"><span>Plantilla general</span>${sel('tpl_default')}</label>
      <label class="field"><span>Pérdida de grasa</span>${sel('tpl_perdida')}</label>
      <label class="field"><span>Recomposición</span>${sel('tpl_recomp')}</label>
      <label class="field"><span>Ganancia de peso</span>${sel('tpl_ganancia')}</label>
      <label class="field"><span>Mantenimiento y rendimiento</span>${sel('tpl_mant')}</label>
      <p class="small muted">La plantilla define comidas, opciones y alimentos. Las porciones se ajustan a la proteína, grasa y carbohidratos de cada persona, y los alimentos excluidos se reemplazan por equivalentes.</p></div>
    <div class="card"><h3>Textos por defecto</h3>
      <label class="field"><span>Indicaciones del plan nutricional</span><textarea class="input" rows="4" data-s="plan_notes">${esc(s.plan_notes || DEFAULT_PLAN_NOTES)}</textarea></label>
      <label class="field"><span>Indicaciones de la rutina</span><textarea class="input" rows="4" data-s="routine_notes">${esc(s.routine_notes || DEFAULT_ROUTINE_NOTES)}</textarea></label></div>
    <div class="card"><h3>Contacto</h3><label class="field"><span>Tu número de WhatsApp</span><input class="input" data-s="whatsapp" inputmode="tel" value="${esc(s.whatsapp || '')}" placeholder="3001234567"></label><p class="small muted">Se muestra a los asesorados para escribirte directamente.</p></div>
    ${typeof coachKeyCardHtml === 'function' ? await coachKeyCardHtml() : ''}`, {
    change: async t => {
      const k = t.dataset.s; if (!k) return;
      const v = t.type === 'checkbox' ? t.checked : t.dataset.num ? (t.value.trim() === '' ? null : num(t.value)) : t.value.trim();
      await saveSettings({ [k]: v }); toast('Guardado');
    },
    click: typeof coachKeyHandlers === 'function' ? coachKeyHandlers() : {}
  }, 'Ajustes');
}

/* =====================================================================
   Sugerencia de progresión de cargas (sesión de entrenamiento)
   ===================================================================== */
function progressionHint(e) {
  const p = e.prev || []; const t = e.target || {};
  if (!p.length) return null;
  const m = String(t.reps || '').match(/(\d+)\s*[-–]\s*(\d+)/);
  const top = m ? +m[2] : parseInt(t.reps, 10); const low = m ? +m[1] : top;
  if (!top || /s$/.test(String(t.reps).trim())) return null;
  const maxW = Math.max(...p.map(s => num(s.w)));
  if (!(maxW > 0)) return null;
  const work = p.filter(s => num(s.w) === maxW);
  if (work.every(s => s.r >= top)) {
    const inc = Math.max(maxW * 0.025, maxW >= 40 ? 2.5 : 1);
    const nw = Math.round((maxW + inc) * 2) / 2;
    return { w: nw, up: true, text: `La sesión anterior completaste ${top} repeticiones en todas las series con ${fmtN(maxW)} kg: sube a ${fmtN(nw)} kg.` };
  }
  if (work.some(s => s.r < low)) return { w: maxW, text: `Mantén ${fmtN(maxW)} kg hasta completar ${low}–${top} repeticiones en todas las series.` };
  return { w: maxW, text: `Mantén ${fmtN(maxW)} kg e intenta sumar repeticiones hasta ${top}.` };
}

/* =====================================================================
   Datos de demostración
   ===================================================================== */
function buildAutoDemo(d) {
  const iso = new Date().toISOString(); const today = todayStr();
  Object.assign(d, { intakes: [], checkins: [], photo_vaults: [], progress_photos: [], app_settings: [] });
  d.profiles.push({ id: 'demo-laura', email: 'laura@demo.app', full_name: 'Laura Gómez', role: 'client', goal: '', phone: '', created_at: iso });
  const ana = d.profiles.find(p => p.id === 'demo-ana'), juan = d.profiles.find(p => p.id === 'demo-juan');
  if (ana) ana.phone = '3001112233'; if (juan) juan.phone = '3004445566';
  const tpl = d.nutrition_plans.find(p => p.is_template);
  d.app_settings.push({ id: 1, data: { auto_publish: false, deficit_pct: 22, surplus_pct: 12, recomp_pct: 10, protein_gkg: 2, fat_gkg: 0.9, whatsapp: '3009998877', tpl_default: tpl ? tpl.id : '' }, updated_at: iso });
  const base = { ciudad: 'Bogotá', trabajo: 'Sentado la mayor parte del día', pq1: 'No', pq2: 'No', pq3: 'No', pq4: 'No', pq5: 'No', pq6: 'No', pq7: 'No', enfermedades: ['Ninguna'], sc1: 'No', sc2: 'No', sc3: 'No', sc4: 'No', sc5: 'No', restricciones: ['Ninguna'], sueno: '7 a 8', lugar: 'Gimnasio', minutos: '60 min', consentimiento: 'Sí', datos: 'Sí', importancia: '9' };
  const dA = { ...base, nombre: 'Ana Torres', fecha_nac: '2009-03-14', whatsapp: '3001112233', sexo: 'Femenino', embarazo: 'No', ocupacion: 'Estudiante', peso: '57.6', talla: '166', objetivo: ['Rendimiento deportivo'], resultado: 'Mejorar potencia de saque y resistencia en partidos de tres sets.', comidas: '4', pasos: '7.000 a 10.000', experiencia: '6 meses a 2 años', dias: ['Lunes', 'Miércoles', 'Viernes'], deporte: 'Tenis', nivel_deporte: 'Juvenil federado', sesiones_deporte: '4 a 5', deportes: 'Tenis' };
  const dJ = { ...base, nombre: 'Juan Pérez', fecha_nac: '1990-07-02', whatsapp: '3004445566', sexo: 'Masculino', ocupacion: 'Contador', peso: '92.4', talla: '178', cintura: '101', objetivo: ['Reducir grasa corporal'], resultado: 'Bajar 8 kg y reducir la talla del pantalón.', comidas: '3', pasos: '4.000 a 7.000', experiencia: 'Menos de 6 meses', dias: ['Martes', 'Jueves'], barreras: ['Comidas fuera de casa', 'Fines de semana'] };
  const saved = S.settings; S.settings = d.app_settings[0].data;
  [['demo-ana', dA, -42], ['demo-juan', dJ, -50]].forEach(([cid, data, ago]) => {
    const t = computeTargets(data);
    d.intakes.push({ id: uid(), client_id: cid, data, calc: { ...t, flags: undefined }, flags: t.flags, status: 'approved', created_at: parseDay(addDays(today, ago)).toISOString(), reviewed_at: parseDay(addDays(today, ago + 1)).toISOString() });
  });
  S.settings = saved;
  const ck = (cid, ago, w, sc, status, reply, notes) => d.checkins.push({ id: uid(), client_id: cid, check_date: addDays(today, ago), weight_kg: w, waist_cm: null, adherence: sc[0], performance: sc[1], energy: sc[2], sleep: sc[3], hunger: sc[4], stress: sc[5], notes, coach_reply: reply, status, created_at: iso, reviewed_at: status === 'reviewed' ? parseDay(addDays(today, ago + 1)).toISOString() : null });
  ck('demo-juan', -15, 90.1, [8, 7, 7, 6, 5, 6], 'reviewed', 'Buen avance. Mantén el plan y procura llegar a 8.000 pasos diarios.', '');
  ck('demo-juan', -8, 89.8, [7, 7, 6, 6, 6, 7], 'reviewed', 'La pérdida es lenta pero constante. Prioriza la proteína en la cena.', 'Semana con dos almuerzos fuera de casa.');
  ck('demo-juan', -1, 89.7, [8, 8, 7, 7, 5, 5], 'pending', null, 'Me he sentido bien, algo de hambre en la tarde.');
  ck('demo-ana', -2, 58.6, [9, 8, 8, 8, 6, 4], 'pending', null, 'Torneo el fin de semana, llegué a semifinal.');
}
