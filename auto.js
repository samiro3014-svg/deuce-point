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
const ACT_LVL = ['Sedentario', 'Leve', 'Moderado', 'Intenso'];
const FA_SEX = { M: [1.3, 1.6, 1.7, 2.1], F: [1.3, 1.5, 1.6, 1.9] };
const RELIABLE_COMP = ['InBody o bioimpedancia profesional', 'Pliegues cutáneos', 'DEXA', 'Evaluación del entrenador'];
const COMP_METHODS = ['InBody o bioimpedancia profesional', 'Pliegues cutáneos', 'DEXA', 'Báscula casera', 'No sé'];
const SETTINGS_DEF = { auto_publish: false, loss_rate_pct: 0.75, deficit_min: 300, deficit_max: 750, recomp_deficit: 250, surplus_beg: 500, surplus_int: 350, surplus_adv: 250, protein_gkg: 2, fat_gkg: 0.9, rest_carb_cut: 125, rest_carb_min_gkg: 2, peri_carb_pct: 60, cardio_z2: true, adapt_weeks: 4, menu_source: 'generador', menu_options: 3, renew_days: 7, match_carb_gkg: 7, pre_carb_gkg: 6, taper_days: 7, taper_pct: 60, sweat_na_mgl: 900, sweat_na_salty: 1500 };
const DEFAULT_PLAN_NOTES = 'Pesar los alimentos en el estado indicado en el plan (cocido o crudo).\nDistribuir el agua indicada a lo largo del día.\nUsar la opción «Reemplazar» para cambiar un alimento por un equivalente del mismo grupo.';
const DEFAULT_ROUTINE_NOTES = 'Calentamiento de 8 a 10 minutos: movilidad articular y 2 series de aproximación en el primer ejercicio.\nRIR: repeticiones que quedan en reserva al terminar la serie.\nProgresión: cuando completes el máximo de repeticiones en todas las series con el RIR indicado, aumenta la carga entre 2,5 y 5 %.';

/* ---------- Screening funcional (lo completan el asesorado y el entrenador) ---------- */
const SCREEN_FIELDS = [
  { id: 'sc_tobillo', type: 'number', label: 'Prueba de rodilla a la pared', unit: 'cm', min: 0, max: 25, help: 'Frente a una pared, con un pie adelante. Lleva la rodilla a tocar la pared sin levantar el talón y aleja el pie poco a poco. Mide la mayor distancia, en cm, entre la punta del dedo gordo y la pared. Registra el lado con menor distancia. Déjalo vacío si no puedes medirlo.' },
  { id: 'sc_sentadilla', type: 'checks', label: 'Sentadilla profunda con los brazos estirados por encima de la cabeza: ¿qué ocurre?', none: ['Bajo completo sin compensaciones', 'No sé'], req: 1, opts: ['Bajo completo sin compensaciones', 'Se levantan los talones', 'Las rodillas se van hacia adentro', 'Se redondea la espalda baja', 'Los brazos se van hacia adelante', 'No sé'] },
  { id: 'sc_bisagra', type: 'checks', label: 'Bisagra de cadera: con un palo apoyado en la cabeza, la espalda alta y los glúteos, inclínate hacia adelante llevando la cadera atrás. ¿Qué ocurre?', none: ['Mantengo los 3 puntos de contacto hasta unos 45°', 'No sé'], req: 1, opts: ['Mantengo los 3 puntos de contacto hasta unos 45°', 'Pierdo el contacto en la espalda baja', 'Doblo mucho las rodillas', 'Siento tirantez fuerte detrás de las piernas antes de 45°', 'No sé'] },
  { id: 'sc_wall', type: 'checks', label: 'Wall angels: espalda, cabeza y glúteos contra la pared. Sube y baja los brazos formando una «W» y una «Y». ¿Qué ocurre?', none: ['Brazos y manos tocan la pared en todo el recorrido', 'No sé'], req: 1, opts: ['Brazos y manos tocan la pared en todo el recorrido', 'Los brazos o las manos se separan de la pared', 'La espalda baja se separa de la pared', 'Siento dolor en el hombro', 'No sé'] }
];

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
    { id: 'cintura', type: 'number', label: 'Perímetro de cintura (opcional)', unit: 'cm', half: 1, min: 40, max: 200 },
    { type: 'h', label: 'Composición corporal (opcional)' },
    { type: 'note', label: 'Si tienes una medición reciente (InBody, bioimpedancia, pliegues o DEXA), registra los datos. Si no la tienes, deja estos campos vacíos.' },
    { id: 'grasa_pct', type: 'number', label: 'Grasa corporal', unit: '%', half: 1, min: 3, max: 65 },
    { id: 'masa_magra', type: 'number', label: 'Masa libre de grasa', unit: 'kg', half: 1, min: 20, max: 150, help: 'En InBody aparece como «Masa libre de grasa» (FFM). No es la masa muscular esquelética.' },
    { id: 'masa_muscular', type: 'number', label: 'Masa muscular esquelética', unit: 'kg', half: 1, min: 10, max: 90 },
    { id: 'metodo_comp', type: 'radio', label: 'Método de medición', opts: COMP_METHODS, req: 1, show: v => !!(num(v.grasa_pct) || num(v.masa_magra) || num(v.masa_muscular)) }]},
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
    { id: 'creatina', type: 'radio', label: '¿Consumes creatina monohidratada?', opts: ['Sí, actualmente', 'No', 'La voy a empezar'] },
    { id: 'suplementos_ok', type: 'radio', label: '¿Estarías dispuesto o dispuesta a usar suplementos si se te indican?', opts: ['Sí', 'No', 'Prefiero consultarlo'] }]},
  { t: 'Movilidad', d: 'Pruebas sencillas para elegir los ejercicios adecuados para ti. Hazlas descalzo o descalza, sin calentar y sin forzar. Si no puedes hacerlas ahora, elige «No sé»: tu entrenador puede evaluarlas en persona.', f: SCREEN_FIELDS },
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
  S.needsV4 = !(r && r.data && num(r.data.schema_version) >= 4);
  S.needsV5 = !(r && r.data && num(r.data.schema_version) >= 5);
  S.needsV6 = !(r && r.data && num(r.data.schema_version) >= 6);
  S.settings = Object.assign({}, SETTINGS_DEF, r ? r.data || {} : {});
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
  const cfg = Object.assign({}, SETTINGS_DEF, S.settings || {});
  const flags = []; const flag = (level, text) => flags.push({ level, text });
  const sex = d.sexo === 'Femenino' ? 'F' : 'M';
  const age = ageFrom(d.fecha_nac) || 30;
  const w = num(d.peso), h = num(d.talla);
  const bmi = w && h ? w / Math.pow(h / 100, 2) : 0;
  const obj = d.objetivo || [];
  let goal = obj.includes('Reducir grasa corporal') ? (obj.includes('Ganar peso y masa muscular') ? 'recomp' : 'perdida')
    : obj.includes('Recomposición corporal') ? 'recomp' : obj.includes('Ganar peso y masa muscular') ? 'ganancia' : 'mant';
  if (ov.goal) goal = ov.goal;
  const level = ['Nunca he entrenado', 'Menos de 6 meses'].includes(d.experiencia) ? 'beg' : d.experiencia === 'Más de 2 años' ? 'adv' : 'int';
  const nDays = (d.dias || []).length;
  const sportN = { '0 a 1': 0.5, '2 a 3': 2.5, '4 a 5': 4.5, '6 o más': 6 }[d.sesiones_deporte] || 0;
  const sessions = r1(nDays + sportN);

  // 1. Tasa metabólica basal
  const bf = num(d.grasa_pct);
  const lbm = num(d.masa_magra) || (bf && w ? w * (1 - bf / 100) : 0);
  const reliable = !!lbm && RELIABLE_COMP.includes(d.metodo_comp);
  const athlete = obj.includes('Rendimiento deportivo') || sportN >= 2.5 || (level === 'adv' && nDays >= 4);
  let tmb, method;
  if (reliable) { if (athlete) { tmb = 500 + 22 * lbm; method = 'Cunningham'; } else { tmb = 370 + 21.6 * lbm; method = 'Katch-McArdle'; } }
  else {
    tmb = 10 * w + 6.25 * h - 4.92 * age + (sex === 'M' ? 5 : -161); method = 'Mifflin-St Jeor';
    if (lbm) flag('info', `Composición corporal medida con «${d.metodo_comp || 'método no indicado'}»: se usa Mifflin-St Jeor. Para calcular con masa magra, registre una medición con InBody, pliegues o DEXA.`);
  }

  // 2. Nivel de actividad y gasto total
  const steps = { 'Menos de 4.000': 0, '4.000 a 7.000': 1, '7.000 a 10.000': 2, 'Más de 10.000': 3 }[d.pasos];
  const job = { 'Sentado la mayor parte del día': 0, 'De pie o caminando': 1, 'Físicamente exigente': 2 }[d.trabajo] ?? 0;
  let act = sessions < 1 ? 0 : sessions <= 3 ? 1 : sessions <= 5 ? 2 : 3;
  if ((steps ?? job) >= 2 && act < 3) act++;
  if (ov.act != null && ov.act !== '') act = Math.min(3, Math.max(0, Math.round(num(ov.act))));
  const fa = FA_SEX[sex][act];
  const tdee = tmb * fa;

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
  if ((d.sc_wall || []).includes('Siento dolor en el hombro')) flag('media', 'Dolor de hombro en wall angels: se retiran los empujes verticales. Revisar antes de progresar.');
  if (bmi && bmi < 18.5 && (goal === 'perdida' || goal === 'recomp')) { flag('media', `IMC ${r1(bmi)} con objetivo de reducción de grasa: se cambia a mantenimiento.`); goal = 'mant'; }

  // 3. Déficit o superávit
  let adj, rate = null;
  if (ov.adjKcal != null && ov.adjKcal !== '') adj = num(ov.adjKcal);
  else if (goal === 'perdida') { rate = num(cfg.loss_rate_pct); adj = -Math.min(num(cfg.deficit_max), Math.max(num(cfg.deficit_min), w * rate / 100 * 7700 / 7)); }
  else if (goal === 'recomp') adj = -num(cfg.recomp_deficit);
  else if (goal === 'ganancia') adj = num(cfg['surplus_' + level]);
  else adj = 0;
  if (adj < 0 && (scoff >= 2 || preg || age < 18)) adj = 0;
  adj = Math.round(adj / 10) * 10;
  let kcal = Math.round((tdee + adj) / 10) * 10;
  const minK = Math.max(Math.round(tmb / 10) * 10, sex === 'F' ? 1200 : 1500);
  if (kcal < minK) { flag('media', `Las calorías calculadas eran menores al mínimo seguro; se ajustan a ${fmtInt(minK)} kcal.`); kcal = minK; adj = kcal - Math.round(tdee); }

  // 4. Macronutrientes (día de entreno)
  const refW = (goal === 'perdida' || goal === 'recomp') && bmi > 25 ? 25 * Math.pow(h / 100, 2) : w;
  const pg = num(ov.proteinGkg) || num(cfg.protein_gkg);
  const fg = num(ov.fatGkg) || num(cfg.fat_gkg);
  const protein = Math.round(refW * pg);
  let fat = Math.round(w * fg);
  if (fat * 9 < kcal * 0.2) fat = Math.round(kcal * 0.2 / 9);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  if (carbs < 80) { fat = Math.round(kcal * 0.22 / 9); carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)); }

  // Ciclado: días de descanso con menos carbohidratos (mínimo configurable en g/kg)
  const minRest = Math.round(num(cfg.rest_carb_min_gkg) * w);
  let restCarbs = carbs - num(cfg.rest_carb_cut);
  if (restCarbs < minRest) restCarbs = Math.min(carbs, minRest);
  restCarbs = Math.round(restCarbs);
  const restKcal = kcal - (carbs - restCarbs) * 4;
  if (restCarbs >= carbs) flag('info', `Sin ciclado de carbohidratos: los ${fmtInt(carbs)} g del día de entreno ya están en el mínimo de ${String(num(cfg.rest_carb_min_gkg)).replace('.', ',')} g/kg para los días de descanso.`);
  const trainDays = Math.min(7, Math.max(nDays, Math.round(sessions)));
  const weekAvg = Math.round((kcal * trainDays + restKcal * (7 - trainDays)) / 7);

  const meals = num(ov.meals) || (['1 o 2', '3'].includes(d.comidas) ? 4 : 5);
  const water = Math.max(1500, Math.round(w * 35 / 250) * 250);
  const tennis = d.deporte === 'Tenis' || /tenis/i.test(d.deportes || '');
  if (nDays < 2) flag('info', 'Seleccionó menos de 2 días de entrenamiento: se generaron 2 sesiones.');
  return { sex, age, weight: w, height: h, bmi: r1(bmi), goal, level, act, actLbl: ACT_LVL[act], sessions, fa, method, tmb: Math.round(tmb), lbm: r1(lbm), bf, compMethod: d.metodo_comp || '', reliable, athlete,
    tdee: Math.round(tdee), adj, rate, kcal, refW: r1(refW), pg, fg, protein, fat, carbs, restCarbs, restKcal, trainDays, weekAvg, meals, water, tennis,
    days: Math.min(6, Math.max(2, nDays || 3)), trainWeekdays: (d.dias || []).slice(), horario: d.horario || '', creatina: d.creatina || '', flags };
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
async function buildNutrition(d, t, opts = {}) {
  const src = opts.source || S.settings.menu_source || 'generador';
  if (src === 'generador' && typeof generateMenus === 'function') return generateMenus(d, t, opts);
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
  // Concentrar los carbohidratos en las comidas pre y post entrenamiento
  const peri = periMeals(meals, t.horario);
  if (peri) {
    const share = num(S.settings.peri_carb_pct ?? 60) / 100;
    redistributeCarbs(meals, [peri.pre, peri.post].filter(i => i != null), share);
    notes.push(`Carbohidratos concentrados (${Math.round(share * 100)} %) en ${[peri.pre, peri.post].filter(i => i != null).map(i => meals[i].name.toLowerCase()).join(' y ')} según el horario de entrenamiento (${t.horario.toLowerCase()}).`);
  }
  if (swapped.length) notes.push('Sustituciones por restricciones o preferencias: ' + swapped.join('; ') + '.');
  return { meals, notes: st.notes || S.settings.plan_notes || DEFAULT_PLAN_NOTES, log: notes, peri: peri ? { pre: peri.pre != null ? meals[peri.pre].name : null, post: peri.post != null ? meals[peri.post].name : null } : null };
}
const TRAIN_TIME = { 'Mañana': 7 * 60, 'Mediodía': 12 * 60 + 30, 'Tarde': 17 * 60 + 30, 'Noche': 19 * 60 + 30 };
const mealMin = m => { const x = String(m.time_label || '').match(/(\d{1,2}):(\d{2})/); return x ? +x[1] * 60 + +x[2] : null; };
const minToLabel = t => Math.floor(t / 60) + ':' + pad2(t % 60);
/* Comida previa (al menos 30 min antes) y posterior (al terminar, sesión de ~60 min) al entrenamiento */
function periMeals(meals, horario) {
  const tt = TRAIN_TIME[horario]; if (tt == null) return null;
  const timed = meals.map((m, i) => ({ i, t: mealMin(m) })).filter(x => x.t != null);
  if (!timed.length) return null;
  const pre = timed.filter(x => x.t <= tt - 30).pop() || null;
  let post = timed.find(x => x.t >= tt + 60) || null;
  if (!post) { // sin comida posterior: la última comida pasa a después del entrenamiento
    const last = timed[timed.length - 1];
    if (last && (!pre || last.i !== pre.i)) { meals[last.i].time_label = minToLabel(tt + 90); post = last; }
  }
  return pre || post ? { pre: pre ? pre.i : null, post: post ? post.i : null } : null;
}
function redistributeCarbs(meals, idxs, share) {
  const cOf = m => { const os = m.options.filter(o => o.items.length); if (!os.length) return 0; return os.reduce((a, o) => a + o.items.reduce((b, i) => { const f = foodOf(i.food_id); return f && MACRO_GROUP(f.category) === 'C' ? b + macrosFor(f, i.grams).carbs : b; }, 0), 0) / os.length; };
  const per = meals.map(cOf); const tot = per.reduce((a, b) => a + b, 0);
  const cp = idxs.reduce((a, i) => a + per[i], 0), co = tot - cp;
  if (!cp || !co || cp / tot >= share) return;
  const ka = Math.min(2.5, share * tot / cp), kb = Math.max(0.35, (tot - ka * cp) / co);
  meals.forEach((m, i) => { const k = idxs.includes(i) ? ka : kb; m.options.forEach(o => o.items.forEach(it => { const f = foodOf(it.food_id); if (f && MACRO_GROUP(f.category) === 'C') it.grams = Math.max(1, roundG(num(it.grams) * k)); })); });
}
async function insertNutritionPlan(cid, t, built, active) {
  const rec = { client_id: cid, is_template: false, review: true, active, name: 'Plan nutricional · Fase 1', kcal: t.kcal, protein_g: t.protein, carbs_g: t.carbs, fat_g: t.fat, water_ml: t.water, notes: built.notes };
  if (!S.needsV4) Object.assign(rec, { rest_carbs_g: t.restCarbs < t.carbs ? t.restCarbs : null, train_days: t.trainWeekdays || [], peri_meals: built.peri });
  const [p] = await DB.insert('nutrition_plans', rec);
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
function prescribe(slot, lvl, name, phase) {
  if (['jump', 'power', 'hipx'].includes(slot)) return { sets: lvl === 'beg' ? 3 : 4, reps: slot === 'jump' ? '4' : '6', rir: '', rest: 90 };
  if (['rc', 'scap', 'grip'].includes(slot)) return { sets: lvl === 'beg' ? 2 : 3, reps: '12-15', rir: '2', rest: 45 };
  if (/plancha/i.test(name)) return { sets: 3, reps: '30-45 s', rir: '', rest: 45 };
  if (/^core/.test(slot)) return { sets: lvl === 'beg' ? 2 : 3, reps: '10-12', rir: '2', rest: 45 };
  const c = COMPOUND.has(slot);
  if (phase === 1) return { sets: c ? 3 : 2, reps: '12-15', rir: '3-4', rest: 60 };  // adaptación anatómica
  if (lvl === 'beg') return { sets: c ? 3 : 2, reps: c ? '10-12' : '12-15', rir: '3', rest: c ? 90 : 60 };
  if (lvl === 'int') return { sets: c ? 4 : 3, reps: c ? '8-10' : '10-12', rir: '2', rest: c ? 120 : 75 };
  return { sets: c ? 4 : 3, reps: c ? '6-8' : '8-12', rir: '1-2', rest: c ? 150 : 75 };
}
/* Hallazgos del screening funcional */
function screening(d) {
  const sq = d.sc_sentadilla || [], hg = d.sc_bisagra || [], wa = d.sc_wall || [];
  const ank = num(d.sc_tobillo);
  return {
    ankle: (d.sc_tobillo !== '' && d.sc_tobillo != null && ank < 10) || sq.includes('Se levantan los talones'),
    valgus: sq.includes('Las rodillas se van hacia adentro'),
    lumbarSq: sq.includes('Se redondea la espalda baja'),
    hinge: hg.includes('Pierdo el contacto en la espalda baja') || hg.includes('Doblo mucho las rodillas'),
    hams: hg.includes('Siento tirantez fuerte detrás de las piernas antes de 45°'),
    thoracic: wa.includes('Los brazos o las manos se separan de la pared') || wa.includes('La espalda baja se separa de la pared') || sq.includes('Los brazos se van hacia adelante'),
    shoulderPain: wa.includes('Siento dolor en el hombro')
  };
}
const DEEP_SQUAT = /Sentadilla (trasera|frontal) con barra|Sentadilla en Smith|Sentadilla hack|Sentadilla péndulo/;
const HEAVY_HINGE = /Peso muerto (convencional|rumano con barra|con barra hexagonal)|Buenos días/;
const OVERHEAD_BAR = /Press militar con barra|Press de hombro en Smith/;
const LOWER = ['squat', 'lunge', 'knee', 'hinge', 'curl', 'glute', 'calf'];
const UPPER = ['hpush', 'ipush', 'vpush', 'hpull', 'vpull', 'lat', 'rear', 'fly'];
function buildRoutine(d, t, opts = {}) {
  const cfg = Object.assign({}, SETTINGS_DEF, S.settings || {});
  const phase = opts.phase || (t.level === 'beg' ? 1 : 0);
  const sc = screening(d);
  const home = d.lugar === 'Casa';
  const eq = d.equipo || [];
  const allow = home ? new Set(['Peso corporal', ...(eq.includes('Mancuernas') ? ['Mancuernas'] : []), ...(eq.includes('Bandas elásticas') ? ['Banda'] : []), ...(eq.includes('Banco') ? ['Banco'] : [])]) : null;
  const bar = eq.includes('Barra de dominadas');
  const pref = home ? PREF.home : PREF[t.level];
  const rank = x => { const i = pref.indexOf(x.equipment); return (i < 0 ? 50 : i) - (t.level === 'beg' && BEG_FIRST.has(x.name) ? 0.5 : 0); };
  const ok = x => !allow || (allow.has(x.equipment) && (!/Dominadas$|colgado|paralelas|Remo invertido|Curl nórdico/.test(x.name) || (bar && /Dominadas$|colgado|Remo invertido/.test(x.name))));
  const restrict = (slot, x) => !((slot === 'squat' && (sc.ankle || sc.lumbarSq) && DEEP_SQUAT.test(x.name)) || (slot === 'hinge' && sc.hinge && HEAVY_HINGE.test(x.name)) || (slot === 'vpush' && sc.thoracic && OVERHEAD_BAR.test(x.name)));
  const noteFor = slot => slot === 'squat' && (sc.ankle || sc.lumbarSq) ? 'Profundidad controlada: baja solo hasta donde mantengas los talones apoyados y la espalda neutra. Puedes elevar los talones sobre un disco.'
    : slot === 'squat' && sc.valgus ? 'Mantén las rodillas alineadas con la punta de los pies.'
    : slot === 'hinge' && sc.hinge ? 'Carga mínima hasta dominar el patrón: cadera atrás y espalda neutra en todo el recorrido.'
    : slot === 'vpush' && sc.thoracic ? 'Rango cómodo, sin arquear la espalda baja.' : '';
  const usage = {};
  const pick = (slot, usedDay) => {
    let s = slot;
    for (let k = 0; k < 3 && s; k++) {
      const c = S.exercises.filter(x => x.family === FAM[s] && ok(x) && restrict(s, x) && !usedDay.has(x.id)).sort((a, b) => rank(a) - rank(b));
      if (c.length) { const n = usage[s] = (usage[s] || 0) + 1; return { ex: c[(n - 1) % Math.min(c.length, 2)], slot: s }; }
      s = FALLBACK[s];
    }
    return null;
  };
  const byName = n => S.exercises.find(x => x.name === n);
  const mob = (n, reps = '8-10') => { const x = byName(n); return x && ok(x) ? { exercise_id: x.id, sets: 2, reps, rir: '', rest: 20, notes: 'Movilidad previa' } : null; };

  let split;
  if (phase === 1) split = Array.from({ length: t.days }, (_, i) => ['full_a', 'full_b', 'full_c'][i % 3]);
  else split = (t.tennis ? SPLIT_TENNIS : SPLIT)[t.days];
  const perDay = { '30 min': 4, '45 min': 5, '60 min': 6, '90 min': 7 }[d.minutos] || 6;
  const weekdays = (d.dias || []).slice(0, 6);
  const sportLoad = { '4 a 5': 1, '6 o más': 1 }[d.sesiones_deporte];
  const cardioOn = cfg.cardio_z2 !== false && !(t.tennis && sportLoad);
  const cardio = cardioOn ? byName(home ? 'Caminata al aire libre (Zona 2)' : 'Caminata inclinada en banda (Zona 2)') : null;
  const cardioReps = t.goal === 'perdida' || t.goal === 'recomp' ? '25-30 min' : '20-25 min';

  return split.map((key, i) => {
    let slots = DAY_T[key][1].slice();
    if (t.tennis && /upper/.test(key)) slots.splice(4, 0, 'rc');
    if (sc.shoulderPain) slots = slots.map(x => x === 'vpush' ? 'scap' : x);
    slots = slots.slice(0, perDay);
    const usedDay = new Set();
    const items = [];
    // Movilidad según el screening, al inicio de la sesión (máximo 3 ejercicios, por prioridad)
    const warm = [];
    const legs = slots.some(x => ['squat', 'lunge'].includes(x));
    if (sc.ankle && legs) warm.push(mob('Movilidad de tobillo en pared'));
    if (sc.hinge && slots.includes('hinge')) warm.push(mob('Bisagra de cadera con palo'));
    if (sc.thoracic && slots.some(x => UPPER.includes(x))) warm.push(mob('Wall angels'));
    if (sc.valgus && legs) { const b = byName('Abducción con banda elástica'); if (b && ok(b)) warm.push({ exercise_id: b.id, sets: 2, reps: '15', rir: '', rest: 20, notes: 'Activación: rodillas alineadas con la punta de los pies' }); }
    if (sc.hams && slots.some(x => ['hinge', 'curl'].includes(x))) warm.push(mob('Estiramiento activo de isquiotibiales', '30 s'));
    if (sc.ankle && legs) warm.push(mob('Estiramiento de gastrocnemio y sóleo', '30 s'));
    if (sc.thoracic && slots.some(x => UPPER.includes(x))) warm.push(mob('Movilidad torácica en cuadrupedia'));
    items.push(...warm.filter(Boolean).slice(0, 3));
    slots.forEach(sl => { const p = pick(sl, usedDay); if (!p) return; usedDay.add(p.ex.id); items.push({ exercise_id: p.ex.id, ...prescribe(p.slot, t.level, p.ex.name, phase), notes: noteFor(p.slot) }); });
    if (cardio) items.push({ exercise_id: cardio.id, sets: 1, reps: cardioReps, rir: '', rest: 0, notes: 'Zona 2: ritmo que permite conversar (aprox. 60–70 % de la frecuencia cardiaca máxima).' });
    return { name: (weekdays[i] || 'Día ' + (i + 1)) + ' · ' + DAY_T[key][0], items: items.filter(Boolean) };
  });
}
async function insertRoutine(cid, days, active, meta = {}) {
  const phase = meta.phase || 0;
  const notes = (phase === 1 ? `Fase 1 · Adaptación anatómica (${S.settings.adapt_weeks || 4} semanas): técnica y fortalecimiento de tendones y ligamentos antes de buscar hipertrofia. Realiza los ejercicios en circuito, con el descanso indicado entre ejercicios.\n` : '') + (S.settings.routine_notes || DEFAULT_ROUTINE_NOTES);
  const rec = { client_id: cid, is_template: false, review: meta.review !== false, active, name: meta.name || (phase === 1 ? 'Fase 1 · Adaptación anatómica' : phase === 2 ? 'Fase 2 · Desarrollo' : 'Rutina · Bloque 1'), notes };
  if (!S.needsV4) Object.assign(rec, { phase: phase || null, phase_weeks: phase === 1 ? num(S.settings.adapt_weeks) || 4 : null });
  const [r] = await DB.insert('routines', rec);
  for (let i = 0; i < days.length; i++) {
    const [dd] = await DB.insert('routine_days', { routine_id: r.id, name: days[i].name, position: i });
    await DB.insert('routine_exercises', days[i].items.map((x, j) => ({ day_id: dd.id, exercise_id: x.exercise_id, position: j, sets: x.sets, reps: x.reps, rir: x.rir, rest_seconds: x.rest, notes: x.notes || '' })));
  }
  return r.id;
}
async function generateAll(cid, d, t, active) {
  const built = await buildNutrition(d, t);
  const planId = await insertNutritionPlan(cid, t, built, active);
  const phase = t.level === 'beg' ? 1 : 0;
  const routineId = await insertRoutine(cid, buildRoutine(d, t, { phase }), active, { phase });
  return { planId, routineId, log: built.log };
}
/* Genera la Fase 2 al terminar la adaptación anatómica (acción del entrenador: queda publicada) */
async function generatePhase2(cid) {
  const it = (await DB.select('intakes', { eq: { client_id: cid } }))[0];
  if (!it) throw new Error('El asesorado no tiene valoración inicial.');
  const t = computeTargets(it.data, { goal: (it.calc || {}).goal });
  const days = buildRoutine(it.data, t, { phase: 2 });
  for (const r of await DB.select('routines', { eq: { client_id: cid, active: true } })) await DB.update('routines', r.id, { active: false });
  return insertRoutine(cid, days, true, { phase: 2, review: false });
}

/* =====================================================================
   ASESORADO · Asistente de valoración inicial
   ===================================================================== */
function intakeDraftKey() { return 'dp_intake_' + S.profile.id; }
function fieldHtml(f, v, missing) {
  if (f.show && !f.show(v)) return '';
  const val = v[f.id]; const req = f.req ? ' <span class="req">*</span>' : '';
  const miss = missing === f.id ? ' missing' : '';
  const lbl = `<span class="ob-l">${esc(f.label)}${req}</span>${f.help ? `<span class="ob-help">${esc(f.help)}</span>` : ''}`;
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
function toggleOpt(f, arr, o) {
  const ex = [].concat(f.none || []);
  if (arr.includes(o)) return arr.filter(x => x !== o);
  if (ex.includes(o)) return [o];
  return arr.filter(x => !ex.includes(x)).concat(o);
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
          st.v[f.id] = toggleOpt(f, a, o); st.missing = null; save(); keepScroll(async () => draw());
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
const dash = v => (v == null || v === '' || Number.isNaN(v)) ? '—' : v;
function calcRows(c) {
  const lv = { beg: 'principiante', int: 'intermedio', adv: 'avanzado' }[c.level] || '—';
  const rows = [['Edad', c.age + ' años'], ['IMC', fmtN(c.bmi)],
    ['Composición corporal', c.lbm ? `${c.bf ? fmtN(c.bf) + ' % grasa · ' : ''}${fmtN(c.lbm)} kg masa libre de grasa (${c.compMethod || 'método no indicado'})` : 'No registrada'],
    ['Objetivo', GOAL_LBL[c.goal]],
    ['Tasa metabólica basal', `${fmtInt(c.tmb ?? c.ree)} kcal · ${c.method || 'Mifflin-St Jeor'}`],
    ['Nivel de actividad', c.actLbl ? `${c.actLbl} (${fmtN(c.sessions)} sesiones/semana) · factor ${String(c.fa).replace('.', ',')}` : 'Factor ' + String(c.fa).replace('.', ',')],
    ['Gasto energético total', fmtInt(c.tdee) + ' kcal'],
    ['Ajuste', c.adj > 100 || c.adj < -100 || c.adj === 0 ? `${c.adj > 0 ? '+' : ''}${fmtInt(c.adj)} kcal${c.rate ? ` (objetivo ${String(c.rate).replace('.', ',')} % del peso por semana)` : ''}` : c.adj + ' %'],
    ['Día de entreno', `${fmtInt(c.kcal)} kcal · P ${fmtInt(c.protein)} g · C ${fmtInt(c.carbs)} g · G ${fmtInt(c.fat)} g`]];
  if (c.restCarbs != null && c.restCarbs < c.carbs) rows.push(['Día de descanso', `${fmtInt(c.restKcal)} kcal · P ${fmtInt(c.protein)} g · C ${fmtInt(c.restCarbs)} g · G ${fmtInt(c.fat)} g`], ['Promedio semanal', `${fmtInt(c.weekAvg)} kcal (${c.trainDays} días de entreno)`]);
  rows.push(['Proteína', `${fmtN(c.pg)} g/kg sobre ${fmtN(c.refW)} kg`], ['Grasa', `${fmtN(c.fg)} g/kg`], ['Comidas', c.meals], ['Agua', (c.water / 1000).toLocaleString('es-CO') + ' L'],
    ['Entrenamiento', `${c.days} días · nivel ${lv}${c.tennis ? ' · enfoque tenis' : ''}`]);
  return rows;
}
function macroCompareHtml(c, doc) {
  if (c.restCarbs == null || c.restCarbs >= c.carbs) return '';
  const cls = doc ? 'doc-t' : 'tbl';
  return `<table class="${cls}"><thead><tr><th></th><th class="n">Día de entreno</th><th class="n">Día de descanso</th></tr></thead><tbody>
    <tr><td>Energía</td><td class="n">${fmtInt(c.kcal)} kcal</td><td class="n">${fmtInt(c.restKcal)} kcal</td></tr>
    <tr><td>Proteína</td><td class="n">${fmtInt(c.protein)} g</td><td class="n">${fmtInt(c.protein)} g</td></tr>
    <tr><td>Carbohidratos</td><td class="n">${fmtInt(c.carbs)} g</td><td class="n">${fmtInt(c.restCarbs)} g</td></tr>
    <tr><td>Grasa</td><td class="n">${fmtInt(c.fat)} g</td><td class="n">${fmtInt(c.fat)} g</td></tr></tbody></table>`;
}

/* =====================================================================
   Proyección mensual (rangos)
   ===================================================================== */
function projection(c, months = 3) {
  if (!c || !c.weight || !c.tdee) return [];
  const gain = { beg: [0.8, 1.0], int: [0.3, 0.5], adv: [0.15, 0.25] }[c.level] || [0.3, 0.5];
  const mf = { ganancia: 1, recomp: 0.5, mant: 0.25, perdida: 0 }[c.goal] ?? 0;
  const weekAvg = c.weekAvg || c.kcal;
  const bal = (weekAvg - c.tdee) * 30.4;               // kcal/mes (negativo = déficit)
  const crea = c.creatina === 'La voy a empezar' ? [1.0, 1.5] : [0, 0];
  const out = [{ m: 0, wMin: c.weight, wMax: c.weight, fatMin: 0, fatMax: 0, musMin: 0, musMax: 0 }];
  for (let m = 1; m <= months; m++) {
    const mus = [gain[0] * mf * m, gain[1] * mf * m];
    let fat;
    if (bal < 0) { const f = -bal * m / 7700; fat = [-f, -f * 0.7]; }     // pérdida: rango con adaptación metabólica
    else { const tot = bal * m / 7700; fat = [Math.max(0, tot * 0.7 - mus[1]), Math.max(0, tot - mus[0])]; }
    const cr = m >= 1 ? crea : [0, 0];
    out.push({ m, fatMin: fat[0], fatMax: fat[1], musMin: mus[0], musMax: mus[1], wMin: c.weight + fat[0] + mus[0] + cr[0], wMax: c.weight + fat[1] + mus[1] + cr[1] });
  }
  return out;
}
function projectionHtml(c, doc) {
  const p = projection(c); if (!p.length) return '';
  const lo = Math.min(...p.map(x => Math.min(x.wMin, x.wMax))), floor = Math.max(0, Math.floor(lo - 3));
  const sign = v => (v > 0 ? '+' : '') + fmtN(v);
  const rows = p.slice(1).map(x => `<tr><td>Mes ${x.m}</td><td class="n">${fmtN(Math.min(x.wMin, x.wMax))}–${fmtN(Math.max(x.wMin, x.wMax))} kg</td><td class="n">${x.fatMin === x.fatMax ? sign(x.fatMin) : sign(Math.min(x.fatMin, x.fatMax)) + ' a ' + sign(Math.max(x.fatMin, x.fatMax))} kg</td><td class="n">${x.musMax ? '+' + fmtN(x.musMin) + ' a +' + fmtN(x.musMax) : '0'} kg</td></tr>`).join('');
  const bars = vbars(p.map((x, i) => ({ label: i ? 'Mes ' + x.m : 'Inicio', value: (x.wMin + x.wMax) / 2, text: fmtN((x.wMin + x.wMax) / 2), hi: i === p.length - 1 })), '', floor);
  const note = `Estimación con cumplimiento del plan. Balance energético semanal promedio: ${fmtInt(c.weekAvg || c.kcal)} kcal frente a un gasto de ${fmtInt(c.tdee)} kcal. Pérdida de grasa: 1 kg ≈ 7.700 kcal, con un margen de hasta 30 % menos por adaptación metabólica. Ganancia muscular según nivel (${{ beg: '0,8–1,0', int: '0,3–0,5', adv: '0,15–0,25' }[c.level]} kg/mes)${c.goal === 'recomp' ? ', al 50 % en recomposición' : ''}.${c.creatina === 'La voy a empezar' ? ' Incluye 1,0–1,5 kg de agua intramuscular por inicio de creatina.' : ''}`;
  const table = `<table class="${doc ? 'doc-t' : 'tbl'}"><thead><tr><th>Periodo</th><th class="n">Peso estimado</th><th class="n">Grasa</th><th class="n">Músculo</th></tr></thead><tbody>${rows}</tbody></table>`;
  return doc ? `<h2>Proyección a 3 meses</h2>${table}<p class="doc-sub">${esc(note)}</p>` : `<div class="card"><h3>Proyección a 3 meses (peso estimado, kg)</h3>${bars}${table}<p class="small muted">${esc(note)} El eje inicia en ${floor} kg.</p></div>`;
}
function intakeDocHtml(client, it, forCoach, logo) {
  const c = it.calc || {};
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Valoración inicial</h1><p><b>${esc(client.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · ${new Date(it.created_at || Date.now()).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div></div>`;
  if (forCoach) {
    if ((it.flags || []).length) h += `<h2>Alertas</h2><ul class="doc-repl">${it.flags.map(f => `<li><b>${esc(f.level === 'alta' ? 'Alta' : f.level === 'media' ? 'Media' : 'Informativa')}:</b> ${esc(f.text)}</li>`).join('')}</ul>`;
    if (c.kcal) h += `<h2>Cálculo de requerimientos</h2><table class="doc-t"><tbody>${calcRows(c).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(String(b))}</td></tr>`).join('')}</tbody></table>${macroCompareHtml(c, true)}${projectionHtml(c, true)}`;
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
const COACH_EVAL = [
  { type: 'h', label: 'Composición corporal' },
  { id: 'grasa_pct', type: 'number', label: 'Grasa corporal', unit: '%', half: 1 },
  { id: 'masa_magra', type: 'number', label: 'Masa libre de grasa', unit: 'kg', half: 1 },
  { id: 'masa_muscular', type: 'number', label: 'Masa muscular esquelética', unit: 'kg', half: 1 },
  { id: 'metodo_comp', type: 'radio', label: 'Método', opts: [...RELIABLE_COMP, 'Báscula casera', 'No sé'] },
  { type: 'h', label: 'Screening funcional' }, ...SCREEN_FIELDS.map(f => ({ ...f, req: 0 }))
];
async function coachValoracionTab(cid) {
  const it = (await DB.select('intakes', { eq: { client_id: cid } }))[0];
  const client = (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  if (!it) return { html: '<div class="card empty"><p>Este asesorado aún no ha completado la valoración inicial.</p><p class="small muted">Se le solicita automáticamente al iniciar sesión si no tiene plan ni rutina asignados.</p></div>' };
  const c = it.calc || {};
  const plans = await DB.select('nutrition_plans', { eq: { client_id: cid }, order: 'created_at', asc: false });
  const routines = await DB.select('routines', { eq: { client_id: cid }, order: 'created_at', asc: false });
  const pp = plans.find(p => p.review) || plans.find(p => p.active) || plans.find(p => p.id === c.plan_id);
  const rr = routines.find(r => r.review) || routines.find(r => r.active) || routines.find(r => r.id === c.routine_id);
  const lvl = { alta: 'Alta', media: 'Media', info: 'Informativa' };
  ensureDocCss();
  const name = 'Valoración inicial - ' + (client.full_name || '');
  const docs = docButtons(name, logo => intakeDocHtml(client, it, true, logo));
  const ev = Object.assign({}, it.data); // copia editable para la evaluación del entrenador
  const evHtml = () => COACH_EVAL.map(f => fieldHtml(f, ev)).join('');
  const sc = screening(it.data); const found = [sc.ankle && 'dorsiflexión limitada', sc.valgus && 'valgo de rodilla', sc.lumbarSq && 'flexión lumbar en sentadilla', sc.hinge && 'bisagra de cadera deficiente', sc.hams && 'isquiotibiales acortados', sc.thoracic && 'movilidad torácica y escapular limitada', sc.shoulderPain && 'dolor de hombro'].filter(Boolean);
  const phase1 = routines.find(r => r.active && r.phase === 1);
  const html = `
    <div class="card"><div class="day-h"><div><h3>Valoración inicial</h3><small class="muted">Enviada ${fmtDateShort(it.created_at)}${it.reviewed_at ? ' · aprobada ' + fmtDateShort(it.reviewed_at) : ''}${c.recalc_at ? ' · recalculada ' + fmtDateShort(c.recalc_at) : ''}</small></div><span class="badge ${it.status === 'approved' ? 'ok' : 'warnb'}">${it.status === 'approved' ? 'Aprobada' : 'Por revisar'}</span></div>
      ${(it.flags || []).length ? `<div class="flags">${it.flags.map(f => `<div class="flag ${f.level}"><b>${lvl[f.level]}</b> ${esc(f.text)}</div>`).join('')}</div>` : '<p class="small muted">Sin alertas de seguridad.</p>'}
      ${(c.log || []).length ? `<p class="small muted">${esc(c.log.join(' '))}</p>` : ''}
      <p class="small"><b>Screening:</b> ${found.length ? esc(found.join(', ')) + '.' : 'sin hallazgos registrados.'}</p>
      <div class="row-btns">${it.status !== 'approved' ? '<button class="btn primary" data-act="vApprove">Aprobar y publicar</button>' : ''}<button class="btn" data-act="vRegen">Regenerar con ajustes</button><button class="btn" data-act="vRecalc">Recalcular con datos actuales</button>${waBtn(client.phone, `Hola ${firstName(client.full_name)}, revisé tu valoración en Deuce Point.`)}</div></div>
    <div class="card"><h3>Plan y rutina</h3>
      ${pp ? `<div class="day-h"><div><b>${esc(pp.name)}</b><small class="muted"> · ${esc(targetsLine(pp))}${cycles(pp) ? ' · descanso C ' + fmtInt(pp.rest_carbs_g) + ' g' : ''}</small></div><span class="badge ${pp.review ? 'warnb' : pp.active ? 'ok' : ''}">${pp.review ? 'Borrador' : pp.active ? 'Activo' : 'Inactivo'}</span></div><div class="row-btns"><a class="btn sm primary" href="#/plan-nutri/${pp.id}">Revisar plan</a><a class="btn sm" href="#/plan-ver/${pp.id}">Ver / PDF</a></div>` : '<p class="small muted">Sin plan generado.</p>'}
      ${rr ? `<div class="day-h" style="margin-top:12px"><div><b>${esc(rr.name)}</b>${rr.phase === 1 ? `<small class="muted"> · desde ${fmtDateShort(rr.created_at)}</small>` : ''}</div><span class="badge ${rr.review ? 'warnb' : rr.active ? 'ok' : ''}">${rr.review ? 'Borrador' : rr.active ? 'Activa' : 'Inactiva'}</span></div><div class="row-btns"><a class="btn sm primary" href="#/rutina/${rr.id}">Revisar rutina</a>${phase1 ? '<button class="btn sm" data-act="vPhase2">Generar Fase 2</button>' : ''}</div>` : '<p class="small muted">Sin rutina generada.</p>'}
    </div>
    ${c.kcal ? `<div class="card"><h3>Cálculo de requerimientos</h3><table class="tbl"><tbody>${calcRows(c).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(String(b))}</td></tr>`).join('')}</tbody></table>${macroCompareHtml(c)}</div>${projectionHtml(c)}` : ''}
    <div class="card"><h3>Evaluación del entrenador</h3><p class="small muted">Registra la composición corporal medida en la evaluación presencial y corrige el screening funcional. Después usa «Regenerar con ajustes» o «Recalcular con datos actuales».</p>
      <div class="ob-card" id="ev-box">${evHtml()}</div>
      <button class="btn primary" data-act="evSave">Guardar evaluación</button></div>
    <div class="row-btns no-print"><button class="btn" data-act="pdf">Descargar PDF</button><button class="btn" data-act="html">Descargar HTML</button></div>
    <div class="doc ans">${intakeAnswersHtml(it.data || {}, 'compact')}</div>`;
  const syncEv = () => document.querySelectorAll('#ev-box input[data-k]').forEach(i => { ev[i.dataset.k] = i.value.trim(); });
  const redrawEv = () => { syncEv(); const b = document.getElementById('ev-box'); if (b) b.innerHTML = evHtml(); };
  return {
    html, click: {
      ...docs,
      pick: el => { ev[el.dataset.k] = el.dataset.v; redrawEv(); },
      toggle: el => { const f = COACH_EVAL.find(x => x.id === el.dataset.k); ev[f.id] = toggleOpt(f, (ev[f.id] || []).slice(), el.dataset.v); redrawEv(); },
      evSave: async () => {
        syncEv();
        if ((num(ev.grasa_pct) || num(ev.masa_magra)) && !ev.metodo_comp) ev.metodo_comp = 'Evaluación del entrenador';
        await DB.update('intakes', it.id, { data: Object.assign({}, it.data, ev, { evaluado_por_entrenador: 'Sí' }) });
        toast('Evaluación guardada'); route();
      },
      vApprove: async () => {
        if (!confirm('¿Aprobar y publicar el plan y la rutina? El asesorado los verá de inmediato.')) return;
        await approveGenerated(cid, it.id); toast('Plan y rutina publicados'); route();
      },
      vRegen: () => regenModal(cid, it),
      vRecalc: () => recalcModal(cid, it),
      vPhase2: async () => { if (!confirm('¿Generar y publicar la Fase 2? La Fase 1 quedará inactiva.')) return; const id = await generatePhase2(cid); toast('Fase 2 publicada'); location.hash = '#/rutina/' + id; }
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
  const c = it.calc || {}; const sex = it.data.sexo === 'Femenino' ? 'F' : 'M';
  const actOpts = ACT_LVL.map((l, i) => `<option value="${i}"${i === c.act ? ' selected' : ''}>${l} · ${String(FA_SEX[sex][i]).replace('.', ',')}</option>`).join('');
  modal(`${modalHead('Regenerar con ajustes')}
    <p class="small muted">Se eliminan los borradores pendientes y se generan de nuevo con estos parámetros. «Ajuste kcal» vacío usa la regla configurada para el objetivo.</p>
    <label class="field"><span>Objetivo</span><select class="input" id="rg-goal">${Object.entries(GOAL_LBL).map(([k, l]) => `<option value="${k}"${k === c.goal ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <div class="rex-grid three"><label><span>Actividad</span><select class="input" id="rg-act">${actOpts}</select></label><label><span>Ajuste kcal</span><input class="input" id="rg-adj" inputmode="numeric" placeholder="Automático"></label><label><span>Comidas</span><select class="input" id="rg-meals"><option${c.meals === 5 ? ' selected' : ''}>5</option><option${c.meals === 4 ? ' selected' : ''}>4</option></select></label></div>
    <div class="rex-grid three"><label><span>Proteína g/kg</span><input class="input" id="rg-pg" inputmode="decimal" value="${c.pg ?? ''}"></label><label><span>Grasa g/kg</span><input class="input" id="rg-fg" inputmode="decimal" value="${c.fg ?? ''}"></label><label><span>Días entreno</span><select class="input" id="rg-days">${[2, 3, 4, 5, 6].map(n => `<option${n === c.days ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <label class="field"><span>Menús del plan</span><select class="input" id="rg-src"><option value="generador"${(S.settings.menu_source || 'generador') === 'generador' ? ' selected' : ''}>Generador personalizado (nueva variación)</option><option value="plantilla"${S.settings.menu_source === 'plantilla' ? ' selected' : ''}>Plantilla asignada al objetivo</option></select></label>
    <label class="field"><span>Fase de la rutina</span><select class="input" id="rg-phase"><option value="auto">Automática según nivel</option><option value="1">Fase 1 · Adaptación anatómica</option><option value="2">Fase 2 · Desarrollo</option></select></label>
    <label class="check"><input type="checkbox" id="rg-plan" checked> Regenerar plan nutricional</label>
    <label class="check"><input type="checkbox" id="rg-rut" checked> Regenerar rutina</label>
    <button class="btn primary block" data-act="go">Regenerar</button>`, {
    click: {
      go: async el => {
        el.disabled = true; el.textContent = 'Generando…';
        const ov = { goal: $('#rg-goal').value, act: $('#rg-act').value, adjKcal: $('#rg-adj').value.trim(), meals: num($('#rg-meals').value), proteinGkg: num($('#rg-pg').value), fatGkg: num($('#rg-fg').value) };
        const t = computeTargets(it.data, ov); t.days = num($('#rg-days').value) || t.days;
        const calc = Object.assign({}, c, t, { flags: undefined });
        if ($('#rg-plan').checked) {
          for (const p of await DB.select('nutrition_plans', { eq: { client_id: cid, review: true } })) await DB.remove('nutrition_plans', p.id);
          const built = await buildNutrition(it.data, t, { source: $('#rg-src').value, seed: Date.now() & 0xffffffff }); calc.plan_id = await insertNutritionPlan(cid, t, built, false); calc.log = built.log;
        }
        if ($('#rg-rut').checked) {
          for (const r of await DB.select('routines', { eq: { client_id: cid, review: true } })) await DB.remove('routines', r.id);
          const ph = $('#rg-phase').value === 'auto' ? (t.level === 'beg' ? 1 : 0) : +$('#rg-phase').value;
          calc.routine_id = await insertRoutine(cid, buildRoutine(it.data, t, { phase: ph }), false, { phase: ph });
        }
        await DB.update('intakes', it.id, { calc, flags: t.flags, status: 'pending' });
        closeModal(); toast('Borradores regenerados'); route();
      }
    }
  });
}
/* Recalibración: nuevo peso o composición corporal → nuevos requerimientos aplicados al plan activo */
async function recalcModal(cid, it) {
  const c = it.calc || {};
  const bl = (await DB.select('body_logs', { eq: { client_id: cid }, order: 'log_date', asc: false, limit: 20 }));
  const lastW = bl.find(b => num(b.weight_kg)), lastF = bl.find(b => num(b.body_fat));
  let preview = null;
  const read = () => ({ peso: $('#rc-w').value.trim(), grasa_pct: $('#rc-f').value.trim(), masa_magra: $('#rc-l').value.trim(), metodo_comp: $('#rc-m').value });
  const show = () => {
    const v = read(); if (!num(v.peso)) return;
    preview = computeTargets(Object.assign({}, it.data, v, num(v.grasa_pct) || num(v.masa_magra) ? {} : { grasa_pct: '', masa_magra: '' }), { goal: c.goal, act: c.act });
    const row = (l, a, b) => `<tr><td>${l}</td><td class="n">${a}</td><td class="n"><b>${b}</b></td></tr>`;
    $('#rc-out').innerHTML = `<table class="tbl"><thead><tr><th></th><th class="n">Actual</th><th class="n">Nuevo</th></tr></thead><tbody>
      ${row('TMB', fmtInt(c.tmb ?? c.ree) + ' · ' + (c.method || 'Mifflin'), fmtInt(preview.tmb) + ' · ' + preview.method)}
      ${row('Entreno kcal', fmtInt(c.kcal), fmtInt(preview.kcal))}${row('Proteína g', fmtInt(c.protein), fmtInt(preview.protein))}${row('Carbohidratos g', fmtInt(c.carbs), fmtInt(preview.carbs))}${row('Grasa g', fmtInt(c.fat), fmtInt(preview.fat))}
      ${row('Descanso C g', dash(c.restCarbs), fmtInt(preview.restCarbs))}</tbody></table>`;
  };
  modal(`${modalHead('Recalcular con datos actuales')}
    <p class="small muted">Recalibración mensual: con el peso o la composición corporal actuales se recalculan los requerimientos y se ajustan las porciones del plan activo.</p>
    <div class="rex-grid three"><label><span>Peso kg</span><input class="input" id="rc-w" inputmode="decimal" value="${lastW ? r1(num(lastW.weight_kg)) : it.data.peso || ''}"></label><label><span>% grasa</span><input class="input" id="rc-f" inputmode="decimal" value="${lastF ? r1(num(lastF.body_fat)) : it.data.grasa_pct || ''}"></label><label><span>Masa libre de grasa kg</span><input class="input" id="rc-l" inputmode="decimal" value=""></label></div>
    <label class="field"><span>Método de la medición</span><select class="input" id="rc-m">${[...RELIABLE_COMP, 'Báscula casera', 'No sé'].map(m => `<option${m === (it.data.metodo_comp || 'Evaluación del entrenador') ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <div id="rc-out"></div>
    <button class="btn primary block" data-act="apply">Aplicar al plan activo</button>`, {
    input: () => show(), change: () => show(),
    click: {
      apply: async el => {
        show(); if (!preview) return toast('Indica el peso', 'error');
        const plan = await activePlanFor(cid); if (!plan) return toast('El asesorado no tiene un plan activo', 'error');
        el.disabled = true; el.textContent = 'Aplicando…';
        const fac = macroFactors(plan.meals, preview);
        for (const m of plan.meals) for (const o of m.options) for (const i of o.items) { const f = foodOf(i.food_id); if (!f) continue; const g = Math.max(1, roundG(num(i.grams) * fac[MACRO_GROUP(f.category)])); if (g !== num(i.grams)) await DB.update('plan_items', i.id, { grams: g }); }
        const patch = { kcal: preview.kcal, protein_g: preview.protein, carbs_g: preview.carbs, fat_g: preview.fat, water_ml: preview.water };
        if (!S.needsV4) patch.rest_carbs_g = preview.restCarbs < preview.carbs ? preview.restCarbs : null;
        await DB.update('nutrition_plans', plan.id, patch);
        const v = read();
        await DB.update('intakes', it.id, { data: Object.assign({}, it.data, v), calc: Object.assign({}, c, preview, { flags: undefined, recalc_at: new Date().toISOString() }) });
        if (num(v.peso) && (!lastW || num(lastW.weight_kg) !== num(v.peso) || lastW.log_date !== todayStr())) await DB.insert('body_logs', { client_id: cid, log_date: todayStr(), weight_kg: num(v.peso), waist_cm: null, body_fat: num(v.grasa_pct) || null, notes: 'Recalibración' });
        closeModal(); toast('Requerimientos actualizados'); route();
      }
    }
  });
  show();
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
    if (wk > (goal === 'recomp' ? 0.3 : -0.25)) return { delta: -150, cardio: 10, wk, text: `El peso no disminuye al ritmo esperado (${r}). Opciones: reducir 150 kcal (principalmente carbohidratos) o aumentar 10 minutos el cardio en Zona 2.` };
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
  const patch = { kcal: Math.round(nt.kcal / 10) * 10, protein_g: Math.round(nt.protein), carbs_g: Math.round(nt.carbs), fat_g: Math.round(nt.fat) };
  if (base.rest_carbs_g != null) patch.rest_carbs_g = Math.max(0, Math.round(num(base.rest_carbs_g) + (nt.carbs - (t.carbs || tot.carbs))));
  await DB.update('nutrition_plans', base.id, patch);
}
/* Ajusta los minutos de cardio en Zona 2 de la rutina activa */
async function applyCardio(cid, minutes) {
  const rs = await DB.select('routines', { eq: { client_id: cid, active: true } }); if (!rs.length) throw new Error('El asesorado no tiene una rutina activa.');
  const days = await DB.select('routine_days', { inn: { routine_id: rs.map(r => r.id) } });
  const rex = await DB.select('routine_exercises', { inn: { day_id: days.map(d => d.id) } });
  const cardio = rex.filter(x => (S.exById[x.exercise_id] || {}).muscle_group === 'Cardio');
  if (!cardio.length) {
    const ex = S.exercises.find(x => x.name === 'Caminata inclinada en banda (Zona 2)');
    for (const dd of days) await DB.insert('routine_exercises', { day_id: dd.id, exercise_id: ex.id, position: 99, sets: 1, reps: `${minutes + 10}-${minutes + 15} min`, rir: '', rest_seconds: 0, notes: 'Zona 2: ritmo que permite conversar (aprox. 60–70 % de la frecuencia cardiaca máxima).' });
    return;
  }
  for (const x of cardio) {
    const n = String(x.reps || '').match(/\d+/g) || ['20'];
    const nr = n.map(v => Math.min(60, +v + minutes)).join('-') + ' min';
    await DB.update('routine_exercises', x.id, { reps: nr });
  }
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
        <div class="row-btns">${sug.delta && plan ? `<button class="btn" data-act="ckApply" data-id="${ck.id}">Aplicar ${sug.delta > 0 ? '+' : '−'}${Math.abs(sug.delta)} kcal al plan</button>` : ''}${sug.cardio ? `<button class="btn" data-act="ckCardio" data-id="${ck.id}">Aplicar +${sug.cardio} min de cardio Zona 2</button>` : ''}<button class="btn primary" data-act="ckDone" data-id="${ck.id}">Enviar respuesta y marcar revisado</button></div>`
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
      ckCardio: async el => {
        const s = analyses[el.dataset.id];
        if (!confirm(`¿Aumentar ${s.cardio} minutos el cardio en Zona 2 de cada sesión?`)) return;
        await applyCardio(cid, s.cardio);
        const ta = document.querySelector(`[data-reply="${el.dataset.id}"]`);
        if (ta && !ta.value.trim()) ta.value = `Aumenté ${s.cardio} minutos el cardio en Zona 2 al final de cada sesión. Revisa tu rutina.`;
        toast('Rutina ajustada'); el.disabled = true;
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
  // Fin de la fase de adaptación y recalibración mensual
  const [p1, approved] = await Promise.all([S.needsV4 ? [] : DB.select('routines', { eq: { active: true, phase: 1 } }), DB.select('intakes', { eq: { status: 'approved' } })]);
  const phaseEnd = p1.filter(r => byId[r.client_id] && daysBetween(dateStr(new Date(r.created_at)), todayStr()) >= (num(r.phase_weeks) || 4) * 7);
  const recal = approved.filter(i => byId[i.client_id] && withPlan.has(i.client_id) && daysBetween(dateStr(new Date((i.calc && i.calc.recalc_at) || i.reviewed_at || i.created_at)), todayStr()) >= 28);
  phaseEnd.forEach(r => rows.push(`<div class="ib-row"><span class="ib-tag f">Fin de fase</span><a class="ib-n" href="#/asesorado/${r.client_id}/valoracion">${esc(byId[r.client_id].full_name || '')}</a><span class="ib-m"><button class="chip" data-act="ibPhase2" data-id="${r.client_id}">Generar Fase 2</button></span></div>`));
  recal.forEach(i => rows.push(`<a class="ib-row" href="#/asesorado/${i.client_id}/valoracion"><span class="ib-tag r">Recalibrar</span><span class="ib-n">${esc(byId[i.client_id].full_name || '')}</span><span class="ib-m">Recalibración mensual</span></a>`));
  if (typeof inboxManagementRows === 'function') rows.push(...await inboxManagementRows(byId, approved));
  if (typeof inboxTenisRows === 'function') rows.push(...await inboxTenisRows(byId));
  intakes.filter(i => byId[i.client_id]).forEach(i => rows.push(`<a class="ib-row" href="#/asesorado/${i.client_id}/valoracion"><span class="ib-tag v">Valoración</span><span class="ib-n">${esc(byId[i.client_id].full_name || byId[i.client_id].email)}</span><span class="ib-m">${(i.flags || []).filter(f => f.level !== 'info').length ? `<span class="warn">${(i.flags || []).filter(f => f.level !== 'info').length} alertas</span>` : 'Sin alertas'}</span></a>`));
  cks.filter(c => byId[c.client_id]).forEach(c => rows.push(`<a class="ib-row" href="#/asesorado/${c.client_id}/checkins"><span class="ib-tag c">Check-in</span><span class="ib-n">${esc(byId[c.client_id].full_name || '')}</span><span class="ib-m">${fmtDM(parseDay(c.check_date))}</span></a>`));
  inactive.forEach(c => rows.push(`<div class="ib-row"><span class="ib-tag i">Inactivo</span><a class="ib-n" href="#/asesorado/${c.id}/seguimiento">${esc(c.full_name || c.email)}</a><span class="ib-m">${lastAct[c.id] ? daysBetween(lastAct[c.id], todayStr()) + ' días' : 'sin registros'} ${waBtn(c.phone, `Hola ${firstName(c.full_name)}, ¿cómo vas con tu plan esta semana? Recuerda registrar tus comidas y entrenamientos en Deuce Point.`, 'WhatsApp', 'chip wa')}</span></div>`));
  return `<div class="card inbox"><div class="day-h"><h3>Pendientes</h3><a class="btn sm" href="#/ajustes">Ajustes</a></div>
    ${rows.length ? rows.join('') : '<p class="small muted">Sin pendientes. Las valoraciones nuevas, los check-ins, las renovaciones, los informes mensuales y los asesorados sin registros durante 5 días aparecen aquí.</p>'}</div>${S.needsV5 && typeof V5_NOTICE === 'string' ? V5_NOTICE : ''}`;
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
      <p class="small muted">TMB: Katch-McArdle (370 + 21,6 × masa libre de grasa) o Cunningham para deportistas (500 + 22 × masa libre de grasa) cuando la composición corporal proviene de InBody, pliegues, DEXA o tu evaluación; en otro caso, Mifflin-St Jeor. Factores de actividad: sedentario 1,3; leve 1,6 H / 1,5 M; moderado 1,7 H / 1,6 M; intenso 2,1 H / 1,9 M.</p>
      <h4>Pérdida de grasa</h4>
      <div class="rex-grid three">${n('loss_rate_pct', '% del peso por semana')}${n('deficit_min', 'Déficit mínimo kcal')}${n('deficit_max', 'Déficit máximo kcal')}</div>
      <p class="small muted">Déficit = peso × % semanal × 7.700 / 7, dentro del mínimo y el máximo.</p>
      <h4>Recomposición y ganancia</h4>
      <div class="rex-grid">${n('recomp_deficit', 'Déficit recomposición kcal')}${n('surplus_beg', 'Superávit principiante')}${n('surplus_int', 'Superávit intermedio')}${n('surplus_adv', 'Superávit avanzado')}</div>
      <h4>Macronutrientes</h4>
      <div class="rex-grid">${n('protein_gkg', 'Proteína g/kg')}${n('fat_gkg', 'Grasa g/kg')}${n('peri_carb_pct', '% carbs pre/post')}</div>
      <p class="small muted">Proteína 1,8–2,2 g/kg (en pérdida de grasa con IMC mayor a 25 se usa el peso de IMC 25). Grasa 0,8–1,2 g/kg con mínimo del 20 % de la energía. Carbohidratos: el resto de las calorías del día de entreno.</p>
      <h4>Días de descanso</h4>
      <div class="rex-grid">${n('rest_carb_cut', 'Reducción de carbs (g)')}${n('rest_carb_min_gkg', 'Mínimo carbs g/kg')}</div>
      <h4>Entrenamiento</h4>
      <div class="rex-grid">${n('adapt_weeks', 'Semanas adaptación')}</div>
      <label class="check"><input type="checkbox" data-s="cardio_z2" ${s.cardio_z2 !== false ? 'checked' : ''}> Agregar cardio en Zona 2 (20–30 min) al final de cada sesión</label>
      <p class="small muted">No se agrega a tenistas con 4 o más sesiones de cancha por semana.</p></div>
    <div class="card"><h3>Menús del plan generado</h3>
      <label class="field"><span>Origen de los menús</span><select class="input" data-s="menu_source"><option value="generador"${s.menu_source !== 'plantilla' ? ' selected' : ''}>Generador personalizado</option><option value="plantilla"${s.menu_source === 'plantilla' ? ' selected' : ''}>Plantilla asignada al objetivo</option></select></label>
      <div class="rex-grid">${n('menu_options', 'Opciones por comida (1–5)')}</div>
      <p class="small muted">Generador personalizado: cada comida se arma con alimentos de la base según su estructura (desayuno, refrigerio, almuerzo, cena), los alimentos preferidos, el presupuesto, las exclusiones y el momento del día con más hambre. Las porciones de cada opción cumplen la proteína, los carbohidratos y la grasa de esa comida. El costo y el uso de cada alimento se ajustan en Biblioteca › Alimentos.</p></div>
    <div class="card"><h3>Plantillas usadas por la generación automática</h3>
      <label class="field"><span>Plantilla general</span>${sel('tpl_default')}</label>
      <label class="field"><span>Pérdida de grasa</span>${sel('tpl_perdida')}</label>
      <label class="field"><span>Recomposición</span>${sel('tpl_recomp')}</label>
      <label class="field"><span>Ganancia de peso</span>${sel('tpl_ganancia')}</label>
      <label class="field"><span>Mantenimiento y rendimiento</span>${sel('tpl_mant')}</label>
      <p class="small muted">Se usan cuando el origen de los menús es «Plantilla». La plantilla define comidas, opciones y alimentos. Las porciones se ajustan a la proteína, grasa y carbohidratos de cada persona, y los alimentos excluidos se reemplazan por equivalentes.</p></div>
    <div class="card"><h3>Textos por defecto</h3>
      <label class="field"><span>Indicaciones del plan nutricional</span><textarea class="input" rows="4" data-s="plan_notes">${esc(s.plan_notes || DEFAULT_PLAN_NOTES)}</textarea></label>
      <label class="field"><span>Indicaciones de la rutina</span><textarea class="input" rows="4" data-s="routine_notes">${esc(s.routine_notes || DEFAULT_ROUTINE_NOTES)}</textarea></label></div>
    <div class="card"><h3>Torneos y periodización</h3><div class="rex-grid">${n('pre_carb_gkg', 'Carbs víspera g/kg')}${n('match_carb_gkg', 'Carbs día de torneo g/kg')}${n('taper_days', 'Días de descarga previa')}${n('taper_pct', '% de series en la descarga')}</div>
      <p class="small muted">Valores por defecto: 6 g/kg la víspera, 7 g/kg en días de torneo, 7 días de descarga con el 60 % de las series (40 % durante el torneo).</p>
      <h4>Hidratación</h4><div class="rex-grid">${n('sweat_na_mgl', 'Sodio en sudor mg/L')}${n('sweat_na_salty', 'Sudor salado mg/L')}</div></div>
    <div class="card"><h3>Membresías</h3><div class="rex-grid">${n('renew_days', 'Aviso de renovación (días antes)')}</div><p class="small muted">Las renovaciones próximas y vencidas aparecen en Pendientes con el mensaje de WhatsApp listo para enviar.</p></div>
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
  Object.assign(d, { intakes: [], checkins: [], photo_vaults: [], progress_photos: [], app_settings: [], memberships: [], reports: [] });
  d.profiles.push({ id: 'demo-laura', email: 'laura@demo.app', full_name: 'Laura Gómez', role: 'client', goal: '', phone: '', created_at: iso });
  const ana = d.profiles.find(p => p.id === 'demo-ana'), juan = d.profiles.find(p => p.id === 'demo-juan');
  if (ana) ana.phone = '3001112233'; if (juan) juan.phone = '3004445566';
  const tpl = d.nutrition_plans.find(p => p.is_template);
  d.app_settings.push({ id: 1, data: Object.assign({}, SETTINGS_DEF, { whatsapp: '3009998877', tpl_default: tpl ? tpl.id : '', schema_version: 6 }), updated_at: iso });
  d.memberships.push({ id: uid(), client_id: 'demo-juan', plan_name: 'Mensual', start_date: addDays(today, -27), end_date: addDays(today, 3), amount: 180000, notes: 'Pago por transferencia', archived: false, updated_at: iso },
    { id: uid(), client_id: 'demo-ana', plan_name: 'Trimestral', start_date: addDays(today, -42), end_date: addDays(today, 48), amount: null, notes: null, archived: false, updated_at: iso });
  const base = { ciudad: 'Bogotá', trabajo: 'Sentado la mayor parte del día', pq1: 'No', pq2: 'No', pq3: 'No', pq4: 'No', pq5: 'No', pq6: 'No', pq7: 'No', enfermedades: ['Ninguna'], sc1: 'No', sc2: 'No', sc3: 'No', sc4: 'No', sc5: 'No', restricciones: ['Ninguna'], sueno: '7 a 8', lugar: 'Gimnasio', minutos: '60 min', consentimiento: 'Sí', datos: 'Sí', importancia: '9' };
  base.sc_sentadilla = ['Bajo completo sin compensaciones']; base.sc_bisagra = ['Mantengo los 3 puntos de contacto hasta unos 45°']; base.sc_wall = ['Brazos y manos tocan la pared en todo el recorrido'];
  const dA = { ...base, grasa_pct: '21', metodo_comp: 'InBody o bioimpedancia profesional', creatina: 'La voy a empezar', horario: 'Tarde', sc_tobillo: '12', nombre: 'Ana Torres', fecha_nac: '2009-03-14', whatsapp: '3001112233', sexo: 'Femenino', embarazo: 'No', ocupacion: 'Estudiante', peso: '57.6', talla: '166', objetivo: ['Rendimiento deportivo'], resultado: 'Mejorar potencia de saque y resistencia en partidos de tres sets.', comidas: '4', pasos: '7.000 a 10.000', experiencia: '6 meses a 2 años', dias: ['Lunes', 'Miércoles', 'Viernes'], deporte: 'Tenis', nivel_deporte: 'Juvenil federado', sesiones_deporte: '4 a 5', deportes: 'Tenis' };
  const dJ = { ...base, horario: 'Noche', creatina: 'No', sc_tobillo: '7', sc_sentadilla: ['Se levantan los talones', 'Las rodillas se van hacia adentro'], sc_bisagra: ['Pierdo el contacto en la espalda baja'], nombre: 'Juan Pérez', fecha_nac: '1990-07-02', whatsapp: '3004445566', sexo: 'Masculino', ocupacion: 'Contador', peso: '92.4', talla: '178', cintura: '101', objetivo: ['Reducir grasa corporal'], resultado: 'Bajar 8 kg y reducir la talla del pantalón.', comidas: '3', pasos: '4.000 a 7.000', experiencia: 'Menos de 6 meses', dias: ['Martes', 'Jueves'], barreras: ['Comidas fuera de casa', 'Fines de semana'] };
  const saved = S.settings; S.settings = d.app_settings[0].data;
  [['demo-ana', dA, -42], ['demo-juan', dJ, -50]].forEach(([cid, data, ago]) => {
    const t = computeTargets(data);
    d.intakes.push({ id: uid(), client_id: cid, data, calc: { ...t, flags: undefined }, flags: t.flags, status: 'approved', created_at: parseDay(addDays(today, ago)).toISOString(), reviewed_at: parseDay(addDays(today, ago + 1)).toISOString() });
    const pl = d.nutrition_plans.find(p => p.client_id === cid && p.active);
    if (pl) Object.assign(pl, { rest_carbs_g: Math.max(Math.round(2 * t.weight), num(pl.carbs_g) - 125), train_days: data.dias, peri_meals: null });
  });
  S.settings = saved;
  const ck = (cid, ago, w, sc, status, reply, notes) => d.checkins.push({ id: uid(), client_id: cid, check_date: addDays(today, ago), weight_kg: w, waist_cm: null, adherence: sc[0], performance: sc[1], energy: sc[2], sleep: sc[3], hunger: sc[4], stress: sc[5], notes, coach_reply: reply, status, created_at: iso, reviewed_at: status === 'reviewed' ? parseDay(addDays(today, ago + 1)).toISOString() : null });
  ck('demo-juan', -15, 90.1, [8, 7, 7, 6, 5, 6], 'reviewed', 'Buen avance. Mantén el plan y procura llegar a 8.000 pasos diarios.', '');
  ck('demo-juan', -8, 89.8, [7, 7, 6, 6, 6, 7], 'reviewed', 'La pérdida es lenta pero constante. Prioriza la proteína en la cena.', 'Semana con dos almuerzos fuera de casa.');
  ck('demo-juan', -1, 89.7, [8, 8, 7, 7, 5, 5], 'pending', null, 'Me he sentido bien, algo de hambre en la tarde.');
  ck('demo-ana', -2, 58.6, [9, 8, 8, 8, 6, 4], 'pending', null, 'Torneo el fin de semana, llegué a semifinal.');
}
