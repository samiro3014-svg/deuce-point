/* =====================================================================
   Deuce Point · Importación del plan individual (análisis externo o IA) y expediente del asesorado
   Flujo: paquete de análisis → IA o herramienta del entrenador → bloque de datos (JSON) → vista previa → aplicar
   ===================================================================== */
const IMP_TYPE = 'deucepoint-plan';
const nrm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const WD_CANON = Object.fromEntries(WEEKDAYS.map(d => [nrm(d), d]));
const canonWd = s => { const n = nrm(s).replace(/\.$/, ''); return WD_CANON[n] || (n.length >= 2 ? WEEKDAYS.find(d => nrm(d).startsWith(n.slice(0, 3))) : null) || null; };
const wdList = a => [...new Set((Array.isArray(a) ? a : String(a || '').split(/\s*(?:,|;|\by\b|\be\b)\s*/)).map(canonWd).filter(Boolean))];
const pick = (o, ks, d = undefined) => { if (!o || typeof o !== 'object') return d; for (const k of ks) if (o[k] != null && o[k] !== '') return o[k]; return d; };
const arrOf = v => Array.isArray(v) ? v : v ? [v] : [];
const txt = v => v == null ? '' : Array.isArray(v) ? v.map(txt).filter(Boolean).join('\n') : typeof v === 'object' ? Object.values(v).map(txt).filter(Boolean).join(' · ') : String(v).trim();
function isoDate(s) {
  s = String(s || '').trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
const fmtUsd = v => num(v).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const docSafe = s => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();

/* ---------- lectura del bloque de datos ---------- */
function parseImportText(text) {
  text = String(text || '');
  if (hasAnnex(text)) { const r = parseAnnex(text); if (r) return r; }
  const m = text.match(/<script[^>]*id=["']deucepoint-plan["'][^>]*>([\s\S]*?)<\/script>/i) || text.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
  let src = m ? m[1] : text;
  if (!m) { const f = src.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) src = f[1]; }
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No se encontró el bloque de datos. Pide a la IA el archivo HTML con el bloque «deucepoint-plan» o el JSON.');
  let data;
  try { data = JSON.parse(src.slice(a, b + 1)); } catch (e) { throw new Error('El bloque de datos tiene un error de formato (' + e.message + '). Pide a la IA que lo corrija y vuelva a generarlo.'); }
  if (data.tipo && data.tipo !== IMP_TYPE) throw new Error('El bloque no corresponde al formato de Deuce Point («tipo»: «' + IMP_TYPE + '»).');
  return normalizeImport(data);
}
/* ---------- anexo «Datos de carga» del PDF: lectura directa, sin costo de API ---------- */
const ANX_START = /={2,}\s*DEUCE\s*POINT\s*DATOS\s*={2,}/i, ANX_END = /={2,}\s*FIN\s*={2,}/i;
const ANX_KEYS = new Set(['HABITO', 'META', 'ASESORADO', 'FECHA', 'TITULO', 'OBJETIVO', 'RESUMEN', 'INDICADOR', 'ALERTA', 'FAVORABLE', 'PENDIENTE', 'PLAN', 'TIPO', 'COMIDA', 'OPCION', 'FECHA_ESPECIAL', 'ALIMENTO_NUEVO', 'SUPLEMENTO', 'COMPETENCIA', 'RUTINA', 'SESION', 'EJERCICIO', 'MONITOREO', 'LABORATORIO', 'LAB_INDICACIONES', 'SECCION']);
const hasAnnex = t => ANX_START.test(String(t || ''));
function annexRecords(text) {
  text = String(text || ''); const s = text.search(ANX_START); if (s < 0) return null;
  let body = text.slice(s).replace(ANX_START, ''); const e = body.search(ANX_END); if (e >= 0) body = body.slice(0, e);
  const recs = [];
  for (let ln of body.split(/\r?\n/)) {
    ln = ln.replace(/\s+/g, ' ').trim(); if (!ln || /^(p[aá]gina|pag\.?)\s*\d+(\s*(de|\/)\s*\d+)?$/i.test(ln)) continue;
    const m = ln.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ_ ]{2,20})\s*:\s?(.*)$/);
    const key = m ? nrm(m[1]).toUpperCase().replace(/ /g, '_') : null;
    if (key && ANX_KEYS.has(key)) recs.push({ k: key, v: m[2].trim() });
    else if (/^[-•–]\s/.test(ln)) recs.push({ k: '-', v: ln.replace(/^[-•–]\s+/, '') });
    else if (recs.length) recs[recs.length - 1].v += ' ' + ln;   // continuación de una línea larga
  }
  return recs;
}
const anxNum = v => { v = String(v ?? '').trim(); if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ''); return num(v); };
const anxText = v => String(v || '').split(/\s*\/\/\s*/).map(x => x.trim()).filter(Boolean).join('\n');
/* Convierte el anexo en la misma estructura del bloque JSON */
function parseAnnex(text) {
  const recs = annexRecords(text); if (!recs || !recs.length) return null;
  const d = { tipo: IMP_TYPE, version: 1, indicadores: [], alertas: [], favorables: [], pendientes: [], suplementos: [], competencias: [], monitoreo: [], secciones: [], alimentos_nuevos: {} };
  const res = []; const labs = { examenes: [], indicaciones: '' };
  let plan = null, ty = null, meal = null, opt = null, tr = null, ses = null;
  const P = () => plan || (plan = { nombre: '', agua_ml: 0, indicaciones: '', tipos_de_dia: [], fechas: [] });
  const T = () => ty || (ty = (P().tipos_de_dia.push({ codigo: '', nombre: '', dias: [], comidas: [] }), plan.tipos_de_dia[plan.tipos_de_dia.length - 1]));
  for (const { k, v } of recs) {
    const f = v.split('|').map(x => x.trim()); const rest = i => f.slice(i).filter(Boolean).join(' · ');
    switch (k) {
      case 'ASESORADO': d.asesorado = v; break;
      case 'FECHA': d.fecha = v; break;
      case 'TITULO': d.titulo = v; break;
      case 'OBJETIVO': d.objetivo = v; break;
      case 'RESUMEN': res.push(anxText(v)); break;
      case 'INDICADOR': d.indicadores.push({ nombre: f[0], valor: f[1], unidad: f[2], referencia: rest(3) }); break;
      case 'ALERTA': d.alertas.push({ prioridad: f[0], titulo: f[1] || f[0], detalle: anxText(rest(2)) }); break;
      case 'FAVORABLE': d.favorables.push(...v.split(';').map(x => x.trim()).filter(Boolean)); break;
      case 'PENDIENTE': d.pendientes.push({ pregunta: f[0], motivo: rest(1) }); break;
      case 'HABITO': (d.habitos = d.habitos || []).push({ habito: f[0], frecuencia: f[1] || 'Diario' }); break;
      case 'META': (d.metas = d.metas || []).push({ variable: f[0], inicial: f[1], meta: f[2], unidad: f[3] || '', fecha: f[4] || '' }); break;
      case 'PLAN': Object.assign(P(), { nombre: f[0], agua_ml: anxNum(f[1]), indicaciones: anxText(rest(2)) }); break;
      case 'TIPO': ty = { codigo: f[0], nombre: f[1], dias: f[2] || '', kcal: anxNum(f[3]), proteina_g: anxNum(f[4]), carbohidratos_g: anxNum(f[5]), grasa_g: anxNum(f[6]), agua_ml: anxNum(f[7]), indicaciones: anxText(rest(8)), comidas: [] }; P().tipos_de_dia.push(ty); meal = opt = null; break;
      case 'COMIDA': meal = { hora: f[0], nombre: f[1] || f[0], indicaciones: anxText(rest(2)), opciones: [] }; T().comidas.push(meal); opt = null; break;
      case 'OPCION': if (!meal) break; opt = { nombre: f[0] || 'Opción ' + (meal.opciones.length + 1), dias: f[1] || '', preparacion: anxText(rest(2)), alimentos: [] }; meal.opciones.push(opt); break;
      case '-': if (!meal) break; if (!opt) { opt = { nombre: 'Opción 1', alimentos: [] }; meal.opciones.push(opt); } opt.alimentos.push({ alimento: f[0], gramos: anxNum(f[1]), nota: rest(2) }); break;
      case 'FECHA_ESPECIAL': P().fechas.push({ desde: f[0], hasta: f[1] || f[0], dias: f[2] || '', codigo: f[3] || '', porcentaje_carbohidratos: anxNum(f[4]) || 100, motivo: rest(5) }); break;
      case 'ALIMENTO_NUEVO': if (f[0]) d.alimentos_nuevos[f[0]] = { kcal: anxNum(f[1]), proteina: anxNum(f[2]), carbohidratos: anxNum(f[3]), grasa: anxNum(f[4]), fibra: anxNum(f[5]), categoria: f[6] || '' }; break;
      case 'SUPLEMENTO': d.suplementos.push({ nombre: f[0], dosis: f[1], momento: f[2], indicaciones: rest(3) }); break;
      case 'COMPETENCIA': d.competencias.push({ nombre: f[0], fecha_inicio: f[1], fecha_fin: f[2], ciudad: f[3], notas: anxText(rest(4)) }); break;
      case 'RUTINA': tr = { nombre: f[0] || 'Rutina', indicaciones: anxText(rest(1)), sesiones: [] }; ses = null; break;
      case 'SESION': tr = tr || { nombre: 'Rutina', sesiones: [] }; ses = { nombre: f[0], ejercicios: [] }; tr.sesiones.push(ses); break;
      case 'EJERCICIO': if (!ses) { tr = tr || { nombre: 'Rutina', sesiones: [] }; ses = { nombre: 'Sesión 1', ejercicios: [] }; tr.sesiones.push(ses); } ses.ejercicios.push({ ejercicio: f[0], grupo: f[1], series: anxNum(f[2]), repeticiones: f[3], rir: f[4], descanso_s: anxNum(f[5]), notas: rest(6) }); break;
      case 'MONITOREO': d.monitoreo.push({ variable: f[0], frecuencia: f[1], criterio: rest(2) }); break;
      case 'LABORATORIO': labs.examenes.push(...v.split(';').map(x => x.trim()).filter(Boolean)); break;
      case 'LAB_INDICACIONES': labs.indicaciones = anxText(v); break;
      case 'SECCION': d.secciones.push({ titulo: f[0], contenido: anxText(rest(1)) }); break;
    }
  }
  if (res.length) d.resumen = res.join('\n\n');
  if (plan) { if (!plan.nombre) plan.nombre = d.titulo || 'Plan nutricional'; d.plan_nutricional = plan; }
  if (tr) d.entrenamiento = tr;
  if (labs.examenes.length || labs.indicaciones) d.laboratorios = labs;
  return normalizeImport(d);
}

/* ---------- texto de un PDF (pdf.js en el navegador) ---------- */
let pdfjsP = null;
function loadPdfJs() {
  if (pdfjsP) return pdfjsP;
  const V = '4.10.38', srcs = [`https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/`, `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/`];
  pdfjsP = (async () => {
    for (const b of srcs) { try { const L = await import(b + 'pdf.min.mjs'); L.GlobalWorkerOptions.workerSrc = b + 'pdf.worker.min.mjs'; return L; } catch (e) { console.warn('pdf.js', b, e); } }
    pdfjsP = null; throw new Error('No se pudo cargar el lector de PDF. Revisa la conexión e inténtalo de nuevo.');
  })();
  return pdfjsP;
}
async function pdfToText(file) {
  const L = await loadPdfJs();
  const pdf = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent(); const rows = [];
    for (const it of tc.items) {
      if (!it.str) continue; const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      let r = rows.find(q => Math.abs(q.y - y) < Math.max(1.5, h * 0.45)); if (!r) rows.push(r = { y, its: [] });
      r.its.push({ x, s: it.str, w: it.width || 0, h });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.its.sort((a, b) => a.x - b.x); let s = '', end = null;
      for (const i of r.its) { if (end != null && i.x - end > i.h * 0.15 && !/\s$/.test(s) && !/^\s/.test(i.s)) s += ' '; s += i.s; end = i.x + i.w; }
      out.push(s);
    }
    out.push('');
  }
  return out.join('\n');
}

/* ---------- conversión con la API (solo si el PDF no trae el anexo) ---------- */
const API_PRICE = { 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20], 'claude-haiku-5-5': [1, 5] };
async function aiConvert(text) {
  if (DEMO) throw new Error('La conversión con IA requiere la conexión con Supabase (no funciona en modo demostración).');
  const catalog = S.foods.map(f => f.name).join('; ');
  let { data, error } = await sb.functions.invoke('convertir-plan', { body: { text: String(text).slice(0, 150000), catalog, spec: ANNEX_SPEC } });
  if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) { } throw new Error(/not found|404/i.test(m) ? 'La función «convertir-plan» no está publicada en Supabase. Revisa la guía de activación.' : m); }
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { throw new Error('Respuesta no válida de la función: ' + data.slice(0, 160)); } }
  if (data && data.error) throw new Error(data.error);
  if (data && data.text && typeof logApiUse === 'function') { const md0 = String(data.model || ''); const pr0 = /opus/.test(md0) ? [4, 20] : /haiku/.test(md0) ? [1, 5] : [2, 10]; const u0 = data.usage || {}; logApiUse({ usd: (num(u0.input_tokens) * pr0[0] + num(u0.output_tokens) * pr0[1]) / 1e6, input: num(u0.input_tokens), output: num(u0.output_tokens), model: md0 }); }
  if (!data || !data.text) throw new Error('La IA no devolvió datos' + (data && data.stop ? ` (motivo: ${data.stop})` : '') + '. Revisa Supabase › Edge Functions › convertir-plan › Logs.');
  const md = String(data.model || ''); const pr = /opus/.test(md) ? API_PRICE['claude-opus-5-5'] : /haiku/.test(md) ? API_PRICE['claude-haiku-5-5'] : API_PRICE['claude-sonnet-5-5']; const u = data.usage || {};
  const usd = (num(u.input_tokens) * pr[0] + num(u.output_tokens) * pr[1]) / 1e6;
  return { text: data.text, usage: { input: num(u.input_tokens), output: num(u.output_tokens), usd, model: data.model, cut: data.stop === 'max_tokens' } };
}

function normItem(it) {
  if (Array.isArray(it)) return { name: String(it[0] || '').trim(), grams: anxNum(it[1]), note: txt(it[2] || ''), per100: null, cat: '' };
  if (typeof it === 'string') { const g = it.match(/(\d+(?:[.,]\d+)?)\s*(?:g|ml)\b/i); return { name: it.replace(/[:\-–]\s*\d.*$/, '').trim(), grams: g ? num(g[1]) : 0, note: '' }; }
  const p = pick(it, ['por_100g', 'macros_100g', 'por100g', 'per_100g']);
  return {
    name: String(pick(it, ['alimento', 'nombre', 'food', 'name'], '')).trim(),
    grams: num(pick(it, ['gramos', 'g', 'cantidad_g', 'grams', 'ml'], 0)),
    note: txt(pick(it, ['nota', 'notas', 'note'], '')),
    per100: p ? { kcal: num(pick(p, ['kcal', 'energia', 'calorias'])), protein: num(pick(p, ['proteina', 'proteina_g', 'protein'])), carbs: num(pick(p, ['carbohidratos', 'carbohidratos_g', 'carbs'])), fat: num(pick(p, ['grasa', 'grasa_g', 'fat'])), fiber: num(pick(p, ['fibra', 'fibra_g', 'fiber'], 0)) } : null,
    cat: pick(it, ['categoria', 'category'], '') || (p && pick(p, ['categoria'])) || ''
  };
}
function normOption(o, i) {
  if (Array.isArray(o)) o = { alimentos: o };
  return { name: String(pick(o, ['nombre', 'name'], 'Opción ' + (i + 1))).trim(), days: wdList(pick(o, ['dias', 'días', 'days'], [])), recipe: txt(pick(o, ['preparacion', 'preparación', 'receta'], '')), items: arrOf(pick(o, ['alimentos', 'items', 'foods'], [])).map(normItem).filter(x => x.name) };
}
function normMeal(m, i) {
  const opts = pick(m, ['opciones', 'options']);
  return { name: String(pick(m, ['nombre', 'comida', 'name'], 'Comida ' + (i + 1))).trim(), time: String(pick(m, ['hora', 'time'], '')).trim(), notes: txt(pick(m, ['indicaciones', 'instrucciones', 'notas'], '')), options: opts ? arrOf(opts).map(normOption) : [normOption({ alimentos: pick(m, ['alimentos', 'items'], []), preparacion: pick(m, ['preparacion', 'preparación']) }, 0)] };
}
function normType(t, P) {
  return {
    code: String(pick(t, ['codigo', 'código', 'code'], '')).trim().toUpperCase().slice(0, 3), name: String(pick(t, ['nombre', 'name'], '')).trim(), days: wdList(pick(t, ['dias', 'días', 'days'], [])),
    kcal: num(pick(t, ['kcal', 'energia_kcal', 'energia'])), p: num(pick(t, ['proteina_g', 'proteina', 'protein_g'])), c: num(pick(t, ['carbohidratos_g', 'carbohidratos', 'carbs_g'])), f: num(pick(t, ['grasa_g', 'grasa', 'fat_g'])),
    water: num(pick(t, ['agua_ml', 'agua'])) || num(pick(P, ['agua_ml', 'agua'])) || 0, notes: txt(pick(t, ['indicaciones', 'notas'], '')),
    meals: arrOf(pick(t, ['comidas', 'meals'], [])).map(normMeal)
  };
}
function normalizeImport(d) {
  const P = pick(d, ['plan_nutricional', 'plan', 'nutricion']);
  let plan = null;
  if (P) {
    let types = arrOf(pick(P, ['tipos_de_dia', 'tipos_dia', 'tipos', 'dias_tipo'], [])).map(t => normType(t, P));
    if (!types.length && pick(P, ['comidas'])) types = [normType(Object.assign({}, P, { codigo: '' }), P)];
    plan = {
      name: String(pick(P, ['nombre', 'name'], '') || pick(d, ['titulo'], 'Plan nutricional')).trim().slice(0, 120), notes: txt(pick(P, ['indicaciones', 'indicaciones_generales', 'notas'], '')), water: num(pick(P, ['agua_ml', 'agua'])),
      types,
      dates: arrOf(pick(P, ['fechas', 'fechas_especiales', 'calendario'], [])).map(x => ({ from: isoDate(pick(x, ['desde', 'fecha', 'inicio'])), to: isoDate(pick(x, ['hasta', 'fin'])) || isoDate(pick(x, ['desde', 'fecha', 'inicio'])), days: wdList(pick(x, ['dias', 'días'], [])), code: String(pick(x, ['codigo', 'código', 'tipo'], '')).trim().toUpperCase(), pct: num(pick(x, ['porcentaje_carbohidratos', 'porcentaje_porciones', 'porcentaje'], 100)) || 100, why: txt(pick(x, ['motivo', 'nota', 'indicacion'], '')) })).filter(x => x.from)
    };
  }
  // Composición de alimentos fuera del catálogo, declarada una sola vez
  const nuevos = pick(d, ['alimentos_nuevos', 'alimentos_fuera_catalogo']);
  if (plan && nuevos && typeof nuevos === 'object') {
    const mp = Object.fromEntries(Object.entries(nuevos).map(([k, v]) => [nrm(k), Array.isArray(v) ? { kcal: anxNum(v[0]), protein: anxNum(v[1]), carbs: anxNum(v[2]), fat: anxNum(v[3]), fiber: anxNum(v[4]), cat: v[5] || '' } : { kcal: num(pick(v, ['kcal'])), protein: num(pick(v, ['proteina', 'protein'])), carbs: num(pick(v, ['carbohidratos', 'carbs'])), fat: num(pick(v, ['grasa', 'fat'])), fiber: num(pick(v, ['fibra', 'fiber'], 0)), cat: pick(v, ['categoria'], '') }]));
    for (const t of plan.types) for (const m of t.meals) for (const o of m.options) for (const it of o.items) { const x = mp[nrm(it.name)]; if (x && !it.per100) { it.per100 = { kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat, fiber: x.fiber }; it.cat = it.cat || x.cat; } }
  }
  const tr = pick(d, ['entrenamiento', 'rutina', 'training']);
  const sess = tr ? arrOf(pick(tr, ['sesiones', 'dias', 'días', 'sessions'], [])) : [];
  return {
    title: String(pick(d, ['titulo', 'título', 'title'], 'Plan integral')).trim(), date: isoDate(pick(d, ['fecha', 'date'])) || todayStr(), client: String(pick(d, ['asesorado', 'nombre', 'paciente'], '')).trim(),
    goal: txt(pick(d, ['objetivo', 'goal'], '')), summary: txt(pick(d, ['resumen', 'resumen_ejecutivo', 'summary'], '')),
    indicators: arrOf(pick(d, ['indicadores'], [])).map(x => ({ name: txt(pick(x, ['nombre', 'indicador'])), value: txt(pick(x, ['valor'])), unit: txt(pick(x, ['unidad'])), ref: txt(pick(x, ['referencia', 'meta'])), status: nrm(pick(x, ['estado'], '')) })).filter(x => x.name),
    alerts: arrOf(pick(d, ['alertas', 'problemas', 'detector'], [])).map(x => typeof x === 'string' ? { level: 'media', title: x, detail: '' } : { level: nrm(pick(x, ['prioridad', 'nivel'], 'media')).replace(/[^a-z]/g, '') || 'media', title: txt(pick(x, ['titulo', 'título', 'problema'])), detail: txt(pick(x, ['detalle', 'descripcion', 'descripción', 'accion'])) }).filter(x => x.title),
    favorables: arrOf(pick(d, ['favorables', 'factores_favorables'], [])).map(txt).filter(Boolean),
    pending: arrOf(pick(d, ['pendientes', 'preguntas_pendientes', 'datos_pendientes'], [])).map(x => typeof x === 'string' ? { q: x, why: '' } : { q: txt(pick(x, ['pregunta'])), why: txt(pick(x, ['motivo'])) }).filter(x => x.q),
    plan,
    supplements: arrOf(pick(d, ['suplementos', 'suplementacion'], [])).map(x => typeof x === 'string' ? { name: x } : { name: txt(pick(x, ['nombre', 'suplemento'])), dose: txt(pick(x, ['dosis'])), timing: txt(pick(x, ['momento', 'horario'])), note: txt(pick(x, ['indicaciones', 'nota', 'notas'])) }).filter(x => x.name),
    competitions: arrOf(pick(d, ['competencias', 'torneos', 'eventos'], [])).map(x => ({ name: txt(pick(x, ['nombre', 'evento'])), start: isoDate(pick(x, ['fecha_inicio', 'fecha', 'inicio'])), end: isoDate(pick(x, ['fecha_fin', 'fin'])), city: txt(pick(x, ['ciudad'])), category: txt(pick(x, ['categoria', 'categoría', 'prioridad'])), notes: txt(pick(x, ['notas', 'protocolo'])) })).filter(x => x.name && x.start),
    training: sess.length ? { name: String(pick(tr, ['nombre'], 'Rutina')).trim(), notes: txt(pick(tr, ['indicaciones', 'notas'], '')), sessions: sess.map((s, i) => ({ name: String(pick(s, ['nombre', 'dia', 'día'], 'Día ' + (i + 1))).trim(), exercises: arrOf(pick(s, ['ejercicios'], [])).map(e => ({ name: txt(pick(e, ['ejercicio', 'nombre'])), group: txt(pick(e, ['grupo', 'grupo_muscular'])), sets: Math.round(num(pick(e, ['series']))) || null, reps: txt(pick(e, ['repeticiones', 'reps', 'tiempo'])), rir: txt(pick(e, ['rir', 'rpe'])), rest: Math.round(num(pick(e, ['descanso_s', 'descanso']))) || null, notes: txt(pick(e, ['notas', 'indicaciones'])) })).filter(e => e.name) })) } : null,
    monitoring: arrOf(pick(d, ['monitoreo', 'seguimiento'], [])).map(x => typeof x === 'string' ? { variable: x, freq: '', criterion: '' } : { variable: txt(pick(x, ['variable'])), freq: txt(pick(x, ['frecuencia'])), criterion: txt(pick(x, ['criterio', 'meta'])) }).filter(x => x.variable),
    labs: (() => { const l = pick(d, ['laboratorios', 'examenes']); if (!l) return null; if (Array.isArray(l)) return { tests: l.map(x => typeof x === 'string' ? x : txt(pick(x, ['examen', 'nombre']))).filter(Boolean), notes: '' }; return { tests: arrOf(pick(l, ['examenes', 'exámenes', 'lista'], [])).map(txt).filter(Boolean), notes: txt(pick(l, ['indicaciones', 'notas'], '')) }; })(),
    sections: arrOf(pick(d, ['secciones', 'anexos'], [])).map(x => ({ title: txt(pick(x, ['titulo', 'título'])), content: txt(pick(x, ['contenido', 'texto'])) })).filter(x => x.title || x.content),
    habits: arrOf(pick(d, ['habitos', 'hábitos'], [])).map((x, i) => { const t = typeof x === 'string' ? x : txt(pick(x, ['habito', 'hábito', 'nombre', 'texto'])); const f = typeof x === 'string' ? 'Diario' : txt(pick(x, ['frecuencia'], 'Diario')); return t ? Object.assign({ k: habKey(t, i), text: t, freq: f }, parseFreq(f)) : null; }).filter(Boolean),
    goals: arrOf(pick(d, ['metas'], [])).map((x, i) => ({ k: 'g' + i, variable: txt(pick(x, ['variable', 'nombre'])), start: anxNum(pick(x, ['inicial', 'valor_inicial'])), target: anxNum(pick(x, ['meta', 'objetivo'])), unit: txt(pick(x, ['unidad'])), date: isoDate(pick(x, ['fecha', 'fecha_limite'])), current: null })).filter(g => g.variable && String(g.target) !== ''),
    html: typeof d.documento_html === 'string' ? d.documento_html : ''
  };
}

/* ---------- emparejamiento con la base de alimentos y ejercicios ---------- */
const STOPW = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'o', 'sin', 'con', 'a', 'al', 'un', 'una', 'tipo', 'ml', 'g', 'gr', 'casera', 'paquete', 'unidad', 'unidades', 'porcion']);
const stem2 = w => { if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2); else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1); return w.length > 3 && /[ao]$/.test(w) ? w.slice(0, -1) : w; };
const toks = s => nrm(s).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w && !STOPW.has(w)).map(stem2);
function bestMatch(name, list) {
  const A = toks(name); if (!A.length) return null; let best = null;
  for (const x of list) {
    const B = toks(x.name); if (!B.length) continue;
    const c = A.filter(w => B.includes(w)).length; if (!c) continue;
    let s = 2 * c / (A.length + B.length);
    if (B.every(w => A.includes(w)) || A.every(w => B.includes(w))) s += 0.1;
    if (A[0] === B[0]) s += 0.05;
    if (!best || s > best.s) best = { x, s, same: c === A.length && c === B.length };
  }
  return best;
}
function matchByName(name, list, aliases) {
  const al = (aliases || {})[nrm(name)]; if (al && list.some(x => x.id === al)) return { id: al, st: 'ok' };
  const n1 = nrm(name), n2 = nrm(String(name).replace(/\([^)]*\)/g, ''));
  const ex = list.find(x => nrm(x.name) === n1) || list.find(x => nrm(x.name) === n2); if (ex) return { id: ex.id, st: 'ok' };
  const b = bestMatch(name, list);
  return b && (b.same || b.s >= 0.6) ? { id: b.x.id, st: b.same ? 'ok' : 'ap' } : { id: null, st: 'no' };
}
const per100Food = p => ({ kcal: num(p.kcal), protein: num(p.protein), carbs: num(p.carbs), fat: num(p.fat), fiber: num(p.fiber) });
function guessCat(p) { const k = num(p.protein) * 4, c = num(p.carbs) * 4, f = num(p.fat) * 9; if (num(p.kcal) < 45 && num(p.carbs) < 9) return 'Verduras'; if (f > k && f > c) return 'Grasas'; if (k >= c) return 'Proteínas'; return 'Cereales y tubérculos'; }

function buildImportState(cid, data) {
  const foods = {}, exs = {};
  const aliases = S.settings.food_aliases || {};
  const allItems = data.plan ? data.plan.types.flatMap(t => t.meals.flatMap(m => m.options.flatMap(o => o.items))) : [];
  for (const it of allItems) {
    const k = nrm(it.name); const fx = foods[k] || (foods[k] = Object.assign({ key: k, name: it.name, n: 0, per100: null, cat: '' }, matchByName(it.name, S.foods, aliases)));
    fx.n++; if (!fx.per100 && it.per100) { fx.per100 = it.per100; fx.cat = it.cat; }
  }
  // Con composición propia y sin coincidencia exacta: se crea el alimento indicado en lugar de aproximarlo
  for (const fx of Object.values(foods)) if (fx.per100 && fx.st !== 'ok') { fx.id = null; fx.st = 'no'; }
  if (data.training) for (const s of data.training.sessions) for (const e of s.exercises) {
    const k = nrm(e.name); const x = exs[k] || (exs[k] = Object.assign({ key: k, name: e.name, group: e.group, n: 0 }, matchByName(e.name, S.exercises, S.settings.exercise_aliases)));
    x.n++;
  }
  const P = data.plan;
  return {
    cid, data, foods, exs, doc: null,
    opts: { plan: !!(P && P.types.length), publish: true, kase: true, visible: true, supp: !!data.supplements.length && !S.needsV6, comp: !!data.competitions.length && !S.needsV6, train: !!data.training, goal: !!data.goal, ask: !!data.pending.length, msg: !S.needsV6 }
  };
}
const impFood = (st, it) => { const fx = st.foods[nrm(it.name)]; if (!fx) return null; if (fx.id) return foodOf(fx.id); return fx.per100 ? per100Food(fx.per100) : null; };
function typeTotals(st, ty) {
  return ty.meals.reduce((a, m) => {
    const os = m.options.filter(o => o.items.length); if (!os.length) return a;
    const avg = os.reduce((b, o) => addM(b, o.items.reduce((c, it) => { const f = impFood(st, it); return f ? addM(c, macrosFor(f, it.grams)) : c; }, ZERO())), ZERO());
    return addM(a, scaleM(avg, 1 / os.length));
  }, ZERO());
}
function importWarnings(st, client) {
  const d = st.data, w = [];
  if (d.client && client && client.full_name && nrm(firstName(d.client)) !== nrm(firstName(client.full_name))) w.push(`El documento es para «${d.client}» y estás importando en la ficha de «${client.full_name}».`);
  if (d.plan) {
    const seen = {};
    for (const t of d.plan.types) {
      const lbl = 'Tipo ' + (t.code || t.name || 'sin código');
      if (!t.kcal) w.push(`${lbl}: no tiene meta de energía (kcal).`);
      if (!t.meals.length) w.push(`${lbl}: no tiene comidas.`);
      const tt = typeTotals(st, t);
      if (t.kcal && tt.kcal && Math.abs(tt.kcal - t.kcal) / t.kcal > 0.1) w.push(`${lbl}: el menú suma ${fmtInt(tt.kcal)} kcal frente a la meta de ${fmtInt(t.kcal)} kcal (${tt.kcal > t.kcal ? '+' : ''}${Math.round((tt.kcal - t.kcal) / t.kcal * 100)} %).`);
      for (const dn of t.days) { if (seen[dn]) w.push(`El ${dn.toLowerCase()} está asignado a dos tipos de día (${seen[dn]} y ${t.code || t.name}); se usa el primero.`); else seen[dn] = t.code || t.name; }
    }
    const codes = new Set(d.plan.types.map(t => t.code));
    d.plan.dates.forEach(x => { if (x.code && !codes.has(x.code)) w.push(`Fecha ${x.from}: el tipo de día «${x.code}» no existe en el plan.`); });
    if (d.plan.types.length > 1 && d.plan.types.some(t => !t.code)) w.push('Hay tipos de día sin código: asigna A, B, C… para poder usarlos en las fechas especiales.');
  }
  const unres = Object.values(st.foods).filter(f => !f.id && !f.per100);
  if (unres.length) w.push(`${unres.length} alimento${unres.length > 1 ? 's' : ''} sin equivalente en la base y sin composición: elige uno en la lista o se omitirá${unres.length > 1 ? 'n' : ''}.`);
  return w;
}

/* ---------- vista de importación ---------- */
/* Ajusta lo que se aplica y lo que ve el asesorado según su nivel de servicio */
async function applyTier(st) {
  st.tier = await tierOf(st.cid); st.hidden = new Set(tierHidden(st.tier, st.data));
  if (st.tier === 'nutricion') st.opts.train = false;
  if (st.tier === 'entrenamiento') { st.opts.plan = false; st.opts.supp = false; }
  return st;
}
function importModal(cid) { S.imp = null; S.impAi = null; location.hash = '#/importar/' + cid; }
async function readFileText(file) { return file.text ? file.text() : new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsText(file); }); }
async function vImport(cid) {
  if (S.needsV7) return paint(V7_NOTICE);
  const client = (await DB.select('profiles', { eq: { id: cid } }))[0];
  if (!client) return paint('<div class="card empty"><p>Asesorado no encontrado.</p></div>');
  const back = `<a class="linkbtn" href="#/asesorado/${cid}/expediente">← ${esc(client.full_name || '')}</a>`;
  if (!S.imp || S.imp.cid !== cid) {
    return paint(`${back}
      <div class="card"><h3>1. Prepara el análisis</h3>
        <p class="small">El paquete reúne la valoración, las preguntas adicionales, las mediciones, el seguimiento y el catálogo de alimentos y ejercicios de la aplicación, junto con las instrucciones de salida. Entrégalo a tu IA o herramienta de análisis.</p>
        <div class="row-btns"><button class="btn primary" data-act="pkg">Descargar paquete (.md)</button><button class="btn" data-act="pkgCopy">Copiar paquete</button><button class="btn" data-act="guide">Instrucciones para tu IA</button></div></div>
      <div class="card"><h3>2. Carga el informe</h3>
        <p class="small">PDF del informe con el anexo «Datos de carga» en la última página: la aplicación lo lee directamente, sin costo. También acepta el HTML con el bloque «deucepoint-plan», un JSON o el texto pegado. El PDF o el HTML queda guardado en el expediente.</p>
        <label class="field"><span>Informe (.pdf, .html o .json)</span><input class="input" type="file" id="imp-f" accept=".pdf,.json,.html,.htm,.txt,.md,application/pdf,application/json,text/html"></label>
        <label class="field"><span>O pega el anexo o el bloque de datos</span><textarea class="input code" id="imp-t" rows="6" placeholder="=== DEUCE POINT DATOS ===&#10;ASESORADO: …&#10;=== FIN ==="></textarea></label>
        <label class="field"><span>Documento para el expediente (opcional, si el informe va en otro archivo)</span><input class="input" type="file" id="imp-doc" accept=".pdf,.html,.htm,application/pdf,text/html"></label>
        <button class="btn primary block" data-act="parse">Analizar</button></div>
      ${S.impAi && S.impAi.cid === cid ? `<div class="card warn-box"><h3>El documento no tiene el anexo «Datos de carga»</h3>
        <p class="small">La IA puede leer el informe completo y generar el anexo. Texto del documento: ${fmtInt(S.impAi.text.length)} caracteres (≈ ${fmtInt(S.impAi.text.length / 3.2)} tokens de entrada). Costo estimado con Sonnet: ${fmtUsd(S.impAi.text.length / 3.2 * 2 / 1e6 + 6000 * 10 / 1e6)} a ${fmtUsd(S.impAi.text.length / 3.2 * 2 / 1e6 + 12000 * 10 / 1e6)} USD. Con el anexo en el PDF la carga no tiene costo.</p>
        <div class="row-btns"><button class="btn primary" data-act="aiGo">Convertir con IA</button><button class="btn" data-act="aiNo">Cancelar</button></div><p id="ai-prog" class="small muted"></p></div>` : ''}
      <p class="small muted">Nada se guarda hasta que revises la vista previa y elijas «Aplicar».</p>`, {
      click: {
        pkg: async el => { el.disabled = true; try { const t = await analysisPackage(cid); downloadFile(docSafe(`Paquete de análisis - ${client.full_name}`) + '.md', t, 'text/markdown'); } finally { el.disabled = false; } },
        pkgCopy: async el => { el.disabled = true; try { await copyText(await analysisPackage(cid)); toast('Paquete copiado'); } finally { el.disabled = false; } },
        guide: () => downloadFile('Formato del informe - Deuce Point.md', aiGuideFile(), 'text/markdown'),
        aiNo: () => { S.impAi = null; vImport(cid); },
        aiGo: async el => {
          const p = S.impAi; el.disabled = true; const t0 = Date.now(); const tick = setInterval(() => { const x = $('#ai-prog'); if (x) x.textContent = `Convirtiendo… ${Math.round((Date.now() - t0) / 1000)} s (suele tardar entre 30 y 90 s)`; }, 1000);
          try {
            const r = await aiConvert(p.text);
            const data = parseImportText(r.text);
            const st = buildImportState(cid, data); st.doc = p.doc; st.ai = r.usage; await applyTier(st); S.impAi = null; S.imp = st; vImport(cid);
          } catch (e) { toast(e.message, 'error'); el.disabled = false; } finally { clearInterval(tick); }
        },
        parse: async el => {
          const f = $('#imp-f').files[0], dfile = $('#imp-doc').files[0]; let text = $('#imp-t').value;
          el.disabled = true; el.textContent = 'Leyendo…';
          try {
            const isPdf = f && (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
            if (f) text = isPdf ? await pdfToText(f) : await readFileText(f);
            if (!text.trim()) throw new Error(isPdf ? 'El PDF no tiene texto seleccionable (puede ser una imagen escaneada). Pide a la IA el PDF generado como documento.' : 'Carga un archivo o pega el anexo.');
            const doc = dfile ? { type: /pdf$/i.test(dfile.type) || /\.pdf$/i.test(dfile.name) ? 'pdf' : 'html', name: dfile.name, file: dfile } : isPdf ? { type: 'pdf', name: f.name, file: f } : f && /html?$/i.test(f.name) ? { type: 'html', name: f.name, text } : null;
            const structured = hasAnnex(text) || /deucepoint-plan/.test(text) || (f && /\.json$/i.test(f.name)) || /^\s*[{`]/.test(text);
            if (!structured) { S.impAi = { cid, text, doc }; S.imp = null; return vImport(cid); }
            const data = parseImportText(text);
            const st = buildImportState(cid, data);
            st.doc = doc || (data.html ? { type: 'html', name: docSafe(data.title) + '.html', text: data.html } : null);
            await applyTier(st); S.impAi = null; S.imp = st; vImport(cid);
          } catch (e) { toast(e.message, 'error'); el.disabled = false; el.textContent = 'Analizar'; }
        }
      }
    }, 'Importar plan');
  }
  const st = S.imp, d = st.data, P = d.plan, o = st.opts;
  const warns = importWarnings(st, client);
  const fl = Object.values(st.foods), xl = Object.values(st.exs);
  const stIcon = x => x.id ? (x.st === 'ok' ? '<span class="st ok">✓</span>' : '<span class="st ap">≈</span>') : x.per100 ? '<span class="st ap">+</span>' : '<span class="st no">✗</span>';
  const chk = (k, l, dis) => `<label class="check"><input type="checkbox" data-o="${k}" ${o[k] ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${l}</label>`;
  let h = `${back}
    <div class="card"><h3>${esc(d.title)}</h3><p class="small muted">${esc(d.client || client.full_name || '')} · ${esc(fmtDateLong(d.date))}</p>
      <div class="imp-sum"><div><b>${P ? P.types.length : 0}</b><small>Tipos de día</small></div><div><b>${P ? P.types.reduce((a, t) => a + t.meals.length, 0) : 0}</b><small>Comidas</small></div><div><b>${fl.length}</b><small>Alimentos</small></div>
        <div><b>${d.alerts.length}</b><small>Alertas</small></div><div><b>${d.pending.length}</b><small>Preguntas</small></div><div><b>${d.supplements.length + d.competitions.length}</b><small>Suplementos y eventos</small></div></div></div>
    ${st.ai ? `<p class="small muted">Convertido con IA (${esc(st.ai.model || '')}): ${fmtInt(st.ai.input)} tokens de entrada y ${fmtInt(st.ai.output)} de salida · ${fmtUsd(st.ai.usd)} USD.${st.ai.cut ? ' <b>La respuesta se cortó por longitud: revisa que estén todos los tipos de día y comidas.</b>' : ''}</p>` : ''}
    ${warns.length ? `<div class="warn-box small"><b>Revisar antes de aplicar</b><ul>${warns.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`;
  if (P && P.types.length) {
    h += `<div class="card"><h3>Tipos de día</h3><table class="tbl"><thead><tr><th>Tipo</th><th>Días</th><th>Meta</th><th>Menú</th></tr></thead><tbody>${P.types.map(t => { const tt = typeTotals(st, t); const dv = t.kcal && tt.kcal ? Math.round((tt.kcal - t.kcal) / t.kcal * 100) : null; return `<tr><td><b>${esc(t.code || '—')}</b>${t.name ? '<br><small class="muted">' + esc(t.name) + '</small>' : ''}</td><td class="small">${esc(t.days.map(x => x.slice(0, 3)).join(', ') || '—')}</td><td class="small">${fmtInt(t.kcal)} kcal<br>P ${fmtInt(t.p)} · C ${fmtInt(t.c)} · G ${fmtInt(t.f)}</td><td class="small">${fmtInt(tt.kcal)} kcal${dv != null ? ` (${dv > 0 ? '+' : ''}${dv} %)` : ''}<br>P ${fmtInt(tt.protein)} · C ${fmtInt(tt.carbs)} · G ${fmtInt(tt.fat)}</td></tr>`; }).join('')}</tbody></table>
      ${P.types.length > 1 ? `<p class="small muted">Energía por tipo de día (kcal)</p>${hbars(P.types.map(t => ({ label: t.code || t.name, value: t.kcal, text: fmtInt(t.kcal) })))}` : ''}
      ${P.dates.length ? `<p class="small"><b>Fechas especiales:</b> ${P.dates.length} ${P.dates.length === 1 ? 'periodo' : 'periodos'} (${P.dates.map(x => `${fmtDM(parseDay(x.from))}${x.to !== x.from ? '–' + fmtDM(parseDay(x.to)) : ''} → ${esc(x.code || '—')}${x.pct !== 100 ? ' ' + x.pct + ' %' : ''}`).join(' · ')})</p>` : ''}
      <p class="small muted">«Menú» es el promedio diario calculado con la composición de la base de alimentos de la aplicación, con rotación equitativa de las opciones.</p></div>`;
    h += `<div class="card"><h3>Alimentos</h3><p class="small muted">✓ igual en la base · ≈ equivalente aproximado, revísalo · + se crea con la composición indicada · ✗ sin equivalente</p>
      ${fl.sort((a, b) => (a.id ? 1 : 0) - (b.id ? 1 : 0) || a.name.localeCompare(b.name, 'es')).map(x => `<div class="imp-row">${stIcon(x)}<div><b>${esc(x.name)}</b><small>${x.id ? '→ ' + esc(foodOf(x.id).name) : x.per100 ? `Nuevo alimento: ${fmtInt(x.per100.kcal)} kcal · P ${fmtN(x.per100.protein)} · C ${fmtN(x.per100.carbs)} · G ${fmtN(x.per100.fat)} por 100 g` : 'Se omitirá si no eliges un alimento'} · ${x.n} ${x.n === 1 ? 'vez' : 'veces'}</small></div><button class="btn sm" data-act="fPick" data-k="${esc(x.key)}">${x.id ? 'Cambiar' : 'Elegir'}</button></div>`).join('')}</div>`;
  }
  if (xl.length) h += `<div class="card"><h3>Ejercicios</h3>${xl.map(x => `<div class="imp-row">${x.id ? (x.st === 'ok' ? '<span class="st ok">✓</span>' : '<span class="st ap">≈</span>') : '<span class="st ap">+</span>'}<div><b>${esc(x.name)}</b><small>${x.id ? '→ ' + esc(exName(x.id)) : 'Se crea en la biblioteca' + (x.group ? ' (' + esc(x.group) + ')' : '')}</small></div><button class="btn sm" data-act="xPick" data-k="${esc(x.key)}">${x.id ? 'Cambiar' : 'Elegir'}</button></div>`).join('')}</div>`;
  if (d.alerts.length || d.summary) h += `<div class="card"><h3>Expediente</h3>${d.summary ? `<p class="small pre">${esc(d.summary.slice(0, 600))}${d.summary.length > 600 ? '…' : ''}</p>` : ''}${d.alerts.slice(0, 6).map(a => `<div class="alert-i ${esc(a.level)}"><b>${esc(a.title)}</b></div>`).join('')}${d.alerts.length > 6 ? `<p class="small muted">y ${d.alerts.length - 6} más.</p>` : ''}</div>`;
  h += `<div class="card"><h3>Qué aplicar</h3>
      ${(d.habits || []).length || (d.goals || []).length ? `<p class="small">Se crean ${d.habits.length} ${d.habits.length === 1 ? 'hábito' : 'hábitos'} para marcar cada día y ${d.goals.length} ${d.goals.length === 1 ? 'meta' : 'metas'} con seguimiento.</p>` : ''}
      ${P && P.types.length ? chk('plan', 'Crear el plan nutricional' + (P.types.length > 1 ? ` con ${P.types.length} tipos de día` : '')) + (o.plan ? `<label class="check sub"><input type="checkbox" data-o="publish" ${o.publish ? 'checked' : ''}> Activarlo ahora (reemplaza el plan activo); si no, queda inactivo para revisarlo</label>` : '') : ''}
      ${chk('kase', 'Guardar el expediente: resumen, alertas, monitoreo, laboratorios y documento')}
      ${o.kase ? `<label class="check sub"><input type="checkbox" data-o="visible" ${o.visible ? 'checked' : ''}> Visible para el asesorado en «Mi plan integral»</label>` : ''}
      ${d.pending.length ? chk('ask', `Pedir al asesorado las ${d.pending.length} preguntas pendientes`, !o.kase || !o.visible) : ''}
      ${d.supplements.length ? chk('supp', `Protocolo de suplementos (${d.supplements.length}); reemplaza el actual`, S.needsV6) : ''}
      ${d.competitions.length ? chk('comp', `Competencias (${d.competitions.length}) en Rendimiento › Torneos`, S.needsV6) : ''}
      ${d.training ? chk('train', `Rutina «${esc(d.training.name)}» con ${d.training.sessions.length} sesiones; se activa`) : ''}
      ${o.kase ? `<div class="field"><span>Lo que verá el asesorado${st.tier && st.tier !== 'completo' ? ` · asesoría de ${esc(TIERS[st.tier].toLowerCase())}: se ocultaron por defecto las secciones que no corresponden` : ''}</span>${caseBlocks(d, o.ask ? d.pending : [], !!st.doc).map(([k, l]) => `<label class="check sub"><input type="checkbox" data-hv="${k}" ${st.hidden && st.hidden.has(k) ? '' : 'checked'}> ${esc(l)}</label>`).join('')}</div>` : ''}
      ${st.tier === 'nutricion' && d.training ? '<p class="small muted">Asesoría de solo nutrición: la rutina no se crea por defecto.</p>' : ''}${st.tier === 'entrenamiento' && P ? '<p class="small muted">Asesoría de solo entrenamiento: el plan nutricional y los suplementos no se aplican por defecto.</p>' : ''}
      ${d.goal ? chk('goal', `Objetivo del perfil: «${esc(d.goal.slice(0, 90))}»`) : ''}
      ${S.needsV6 ? '' : chk('msg', 'Enviar un mensaje al asesorado avisando del plan nuevo')}
      <p class="small"><b>Documento:</b> ${st.doc ? esc(st.doc.name) + ` (${st.doc.type.toUpperCase()})` : 'sin documento adjunto'} <label class="linkbtn">${st.doc ? 'Cambiar' : 'Adjuntar'}<input type="file" id="imp-doc2" accept=".pdf,.html,.htm,application/pdf,text/html" hidden></label></p>
      <p id="imp-prog" class="small muted"></p>
      <div class="row-btns"><button class="btn primary" data-act="apply">Aplicar</button><button class="btn" data-act="cancel">Cancelar</button></div></div>`;
  paint(h, {
    change: async t => {
      if (t.dataset.o) { o[t.dataset.o] = t.checked; return keepScroll(() => vImport(cid)); }
      if (t.dataset.hv) { st.hidden = st.hidden || new Set(); if (t.checked) st.hidden.delete(t.dataset.hv); else st.hidden.add(t.dataset.hv); return; }
      if (t.id === 'imp-doc2' && t.files[0]) { const f = t.files[0]; st.doc = { type: /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? 'pdf' : 'html', name: f.name, file: f }; keepScroll(() => vImport(cid)); }
    },
    click: {
      cancel: () => { S.imp = null; vImport(cid); },
      fPick: el => { const x = st.foods[el.dataset.k]; pickFood('Alimento para «' + x.name + '»', fid => { Object.assign(x, { id: fid, st: 'ok', manual: true }); keepScroll(() => vImport(cid)); }); },
      xPick: el => { const x = st.exs[el.dataset.k]; pickExerciseFor(x.name, eid => { Object.assign(x, { id: eid, st: 'ok', manual: true }); keepScroll(() => vImport(cid)); }); },
      apply: async el => {
        el.disabled = true; const prog = m => { const p = $('#imp-prog'); if (p) p.textContent = m; };
        try { const r = await applyImport(st, client, prog); S.imp = null; toast('Plan importado'); location.hash = `#/asesorado/${cid}/expediente${r.reportId ? '/' + r.reportId : ''}`; }
        catch (e) { console.error(e); toast(errMsg(e), 'error'); el.disabled = false; prog(''); }
      }
    }
  }, 'Importar plan');
}
/* Selector simple de ejercicio de la biblioteca */
function pickExerciseFor(title, onPick) {
  const list = q => S.exercises.filter(e => !q || nrm(e.name).includes(nrm(q))).slice(0, 80).map(e => `<button class="pick-item" data-act="ex" data-id="${e.id}"><b>${esc(e.name)}</b><small>${esc(e.muscle_group)}</small></button>`).join('');
  modal(`${modalHead('Ejercicio para «' + title + '»')}<input class="input" id="pe-q" placeholder="Buscar" value="${esc(title.split(' ')[0])}"><div class="pick-list tall" id="pe-l">${list(title.split(' ')[0])}</div>`, {
    input: t => { if (t.id === 'pe-q') $('#pe-l').innerHTML = list(t.value); },
    click: { ex: el => { closeModal(); onPick(el.dataset.id); } }
  });
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return; } catch (e) { }
  const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } finally { a.remove(); }
}

/* ---------- aplicar ---------- */
const SUPP_RE = [[/creatin/, 'creatina'], [/cafein/, 'cafeina'], [/beta.?alanin/, 'betaalanina'], [/nitrat|remolacha/, 'nitratos'], [/bicarbonat/, 'bicarbonato']];
const slugOf = s => nrm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
async function applyImport(st, client, prog) {
  const d = st.data, o = st.opts, cid = st.cid; const out = { planId: null, reportId: null };
  // 1. Alimentos nuevos y equivalencias elegidas por el entrenador
  if (o.plan && d.plan) {
    prog('Alimentos…');
    let created = 0;
    for (const fx of Object.values(st.foods)) if (!fx.id && fx.per100) {
      const ex = S.foods.find(f => nrm(f.name) === nrm(fx.name));
      if (ex) { fx.id = ex.id; continue; }
      const p = fx.per100;
      const [f] = await DB.insert('foods', { name: fx.name.slice(0, 100), category: FOOD_CATS.includes(fx.cat) ? fx.cat : guessCat(p), kcal: r1(p.kcal), protein: r1(p.protein), carbs: r1(p.carbs), fat: r1(p.fat), fiber: r1(p.fiber) });
      fx.id = f.id; created++;
    }
    if (created) await loadFoods();
    const manual = Object.values(st.foods).filter(f => f.manual && f.id);
    if (manual.length && isCoach()) await saveSettings({ food_aliases: Object.assign({}, S.settings.food_aliases || {}, Object.fromEntries(manual.map(f => [f.key, f.id]))) });
    prog('Plan nutricional…');
    out.planId = await insertImportedPlan(st, cid, o.publish);
  }
  // 2. Suplementos
  if (o.supp && d.supplements.length && !S.needsV6) {
    prog('Suplementos…');
    const items = d.supplements.map(s => { const k = (SUPP_RE.find(([re]) => re.test(nrm(s.name))) || [])[1]; return k ? { key: k, dose: s.dose || '', timing: s.timing || '', loading: false, note: s.note || '' } : { key: 'x_' + slugOf(s.name), custom: true, name: s.name, dose: s.dose || '', timing: s.timing || '', note: s.note || '' }; });
    const ex = (await DB.select('supplement_plans', { eq: { client_id: cid } }))[0];
    const rec = { items, notes: ex && ex.notes ? ex.notes : null, updated_at: new Date().toISOString() };
    if (ex) await DB.update('supplement_plans', cid, rec, 'client_id'); else await DB.insert('supplement_plans', Object.assign({ client_id: cid }, rec));
  }
  // 3. Competencias
  if (o.comp && d.competitions.length && !S.needsV6) {
    prog('Competencias…');
    const cur = await DB.select('tournaments', { eq: { client_id: cid } });
    for (const c of d.competitions) if (!cur.some(x => nrm(x.name) === nrm(c.name) && x.start_date === c.start)) await DB.insert('tournaments', { client_id: cid, name: c.name, start_date: c.start, end_date: c.end && c.end > c.start ? c.end : null, city: c.city || null, category: c.category || null, notes: c.notes || null });
  }
  // 4. Rutina
  if (o.train && d.training) {
    prog('Rutina…');
    let newEx = 0;
    for (const x of Object.values(st.exs)) if (!x.id) { const [e] = await DB.insert('exercises', { name: x.name.slice(0, 100), muscle_group: x.group || 'Otro', equipment: null, instructions: '' }); x.id = e.id; newEx++; }
    if (newEx) await loadExercises();
    for (const r of await DB.select('routines', { eq: { client_id: cid, active: true } })) await DB.update('routines', r.id, { active: false });
    const [r] = await DB.insert('routines', { client_id: cid, is_template: false, name: d.training.name, notes: d.training.notes || '', active: true });
    for (const [i, s] of d.training.sessions.entries()) {
      const [dy] = await DB.insert('routine_days', { routine_id: r.id, name: s.name, position: i });
      await DB.insert('routine_exercises', s.exercises.map((e, j) => ({ day_id: dy.id, exercise_id: st.exs[nrm(e.name)].id, position: j, sets: e.sets, reps: e.reps || null, rir: e.rir || '', rest_seconds: e.rest, notes: e.notes || '' })));
    }
  }
  // 5. Objetivo del perfil
  if (o.goal && d.goal) await DB.update('profiles', cid, { goal: d.goal.slice(0, 300) });
  // 6. Expediente y documento
  if (o.kase && !S.needsV7) {
    prog('Expediente…');
    const [rep] = await DB.insert('case_reports', {
      client_id: cid, title: d.title, report_date: d.date, summary: d.summary || null, visible: !!o.visible, plan_id: out.planId,
      pending: o.ask ? d.pending : [], data: { indicators: d.indicators, alerts: d.alerts, favorables: d.favorables, monitoring: d.monitoring, labs: d.labs, sections: d.sections, supplements: d.supplements, competitions: d.competitions, goal: d.goal, plan_name: d.plan ? d.plan.name : '', pending_all: d.pending, hidden: [...(st.hidden || [])], habits: d.habits || [], goals: d.goals || [], ai: st.ai || null }
    });
    out.reportId = rep.id;
    if (st.doc) { prog('Documento…'); await attachCaseDoc(rep, st.doc); }
  }
  if (o.msg && !S.needsV6) await DB.insert('messages', { client_id: cid, sender_id: S.profile.id, body: `Hola ${firstName(client.full_name)}, ya está disponible tu plan actualizado${d.plan && d.plan.types.length > 1 ? ', con metas según el tipo de día' : ''}. Lo encuentras en Hoy y el documento completo en Perfil › Mi plan integral.${o.ask && d.pending.length ? ` Hay ${d.pending.length} preguntas para responder allí.` : ''}` }).catch(() => { });
  prog('');
  return out;
}
async function insertImportedPlan(st, cid, publish) {
  const P = st.data.plan; const types = P.types;
  if (publish) await deactivatePlans(cid);
  const ov = {};
  const canon = new Set(types.map(t => t.code));
  for (const x of P.dates) {
    if (x.code && !canon.has(x.code)) continue;
    for (let dd = x.from, k = 0; dd <= x.to && k < 370; dd = addDays(dd, 1), k++) {
      if (x.days.length && !x.days.includes(WEEKDAYS[parseDay(dd).getDay()])) continue;
      const r = {}; if (x.code) r.c = x.code; if (x.pct && x.pct !== 100) r.f = x.pct / 100; if (x.why) r.n = x.why.slice(0, 160); ov[dd] = r;
    }
  }
  const used = new Set(); let root = null;
  for (const [i, t] of types.entries()) {
    const days = t.days.filter(x => !used.has(x)); days.forEach(x => used.add(x));
    const rec = { client_id: cid, is_template: false, name: P.name, kcal: t.kcal || null, protein_g: t.p || null, carbs_g: t.c || null, fat_g: t.f || null, water_ml: t.water || P.water || 2500, notes: i === 0 ? P.notes || '' : '', active: i === 0 && !!publish, day_code: t.code || null, day_name: t.name || null, weekdays: days, day_notes: t.notes || null };
    if (i === 0) rec.day_overrides = ov; else rec.variant_of = root.id;
    const [p] = await DB.insert('nutrition_plans', rec); if (i === 0) root = p;
    for (const [mi, m] of t.meals.entries()) {
      const [pm] = await DB.insert('plan_meals', { plan_id: p.id, name: m.name.slice(0, 80), time_label: m.time, instructions: m.notes, position: mi });
      const opts = m.options.length ? m.options : [{ name: 'Opción 1', days: [], recipe: '', items: [] }];
      for (const [oi, op] of opts.entries()) {
        const [po] = await DB.insert('plan_options', Object.assign({ meal_id: pm.id, name: op.name.slice(0, 80), position: oi }, op.recipe && !S.needsV6 ? { recipe: op.recipe } : {}, op.days.length ? { weekdays: op.days } : {}));
        await DB.insert('plan_items', op.items.map((it, ii) => { const fx = st.foods[nrm(it.name)]; return fx && fx.id && it.grams > 0 ? { option_id: po.id, food_id: fx.id, grams: r1(it.grams), position: ii, note: it.note || '' } : null; }).filter(Boolean));
      }
    }
  }
  return root.id;
}

/* ---------- documentos privados del expediente (bucket «documents») ---------- */
const DOC_BUCKET = 'documents';
const DocFiles = {
  async put(path, blob, type) {
    if (DEMO) return demoFiles.put('doc/' + path, await blob.arrayBuffer());
    const { error } = await sb.storage.from(DOC_BUCKET).upload(path, blob, { contentType: type, upsert: true }); if (error) throw error;
  },
  async get(path, type) {
    if (DEMO) { const v = await demoFiles.get('doc/' + path); if (!v) throw new Error('Documento no encontrado.'); return new Blob([v], { type }); }
    const { data, error } = await sb.storage.from(DOC_BUCKET).download(path); if (error) throw error; return data;
  },
  async del(path) { if (DEMO) return demoFiles.del('doc/' + path); const { error } = await sb.storage.from(DOC_BUCKET).remove([path]); if (error) throw error; }
};
async function attachCaseDoc(rep, doc) {
  const type = doc.type === 'pdf' ? 'application/pdf' : 'text/html';
  const blob = doc.file ? doc.file : new Blob([doc.text], { type });
  if (blob.size > 15 * 1024 * 1024) throw new Error('El documento supera 15 MB.');
  const path = `${rep.client_id}/${rep.id}.${doc.type === 'pdf' ? 'pdf' : 'html'}`;
  if (rep.doc_path && rep.doc_path !== path) await DocFiles.del(rep.doc_path).catch(() => { });
  await DocFiles.put(path, blob, type);
  await DB.update('case_reports', rep.id, { doc_path: path, doc_type: doc.type, doc_name: String(doc.name || '').slice(0, 120) });
}
async function deleteCaseFiles(cid) {
  if (S.needsV7) return;
  for (const r of await DB.select('case_reports', { eq: { client_id: cid } }).catch(() => [])) if (r.doc_path) await DocFiles.del(r.doc_path).catch(() => { });
}

/* =====================================================================
   Expediente (entrenador) y «Mi plan integral» (asesorado)
   ===================================================================== */
const V7_NOTICE = '<div class="card warn-box"><p><b>Función pendiente de activar.</b> Ejecuta <code>supabase/migracion-v7.sql</code> en Supabase (SQL Editor) y recarga la aplicación.</p></div>';
async function casesOf(cid) { if (S.needsV7) return []; try { return await DB.select('case_reports', { eq: { client_id: cid }, order: 'created_at', asc: false }); } catch (e) { return []; } }
async function answersFor(ids) { if (!ids.length) return []; try { return await DB.select('case_answers', { inn: { report_id: ids } }); } catch (e) { return []; } }
const LVL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
/* ---------- visibilidad por sección (lo que ve el asesorado) ---------- */
const TRAIN_RE = /entrenamiento|rutina|ejercicio|fuerza|taper|series|periodizaci|sesi[oó]n(es)? de|carrera|movilidad/i;
const NUTRI_RE = /aliment|nutric|comida|mercado|hidrataci|men[uú]|preparaci[oó]n en lote|carbohidrat|suplement|dieta/i;
async function tierOf(cid) { if (S.needsV6) return 'completo'; try { const m = (await DB.select('memberships', { eq: { client_id: cid } }))[0]; return m && TIERS[m.tier] ? m.tier : 'completo'; } catch (e) { return 'completo'; } }
/* Bloques que se pueden ocultar, con su etiqueta */
function caseBlocks(d, pend, hasDoc) {
  const b = [['resumen', 'Resumen y objetivo']];
  if ((d.goals || []).length) b.push(['metas', 'Metas']);
  if ((d.habits || []).length) b.push(['habitos', 'Hábitos diarios']);
  if ((d.indicators || []).length) b.push(['indicadores', 'Indicadores']);
  if ((d.alerts || []).length) b.push(['alertas', 'Prioridades detectadas']);
  if ((d.favorables || []).length) b.push(['favorables', 'Factores favorables']);
  if ((pend || []).length) b.push(['preguntas', 'Preguntas pendientes']);
  if ((d.monitoring || []).length) b.push(['monitoreo', 'Monitoreo']);
  if (d.labs && ((d.labs.tests || []).length || d.labs.notes)) b.push(['laboratorios', 'Laboratorios']);
  if ((d.supplements || []).length) b.push(['suplementos', 'Suplementación']);
  (d.sections || []).forEach((s, i) => b.push(['sec' + i, s.title || 'Sección ' + (i + 1)]));
  if (hasDoc) b.push(['documento', 'Documento completo (PDF/HTML)']);
  return b;
}
/* Ocultos por defecto según el nivel de servicio del asesorado */
function tierHidden(tier, d) {
  const h = [];
  (d.sections || []).forEach((s, i) => { const t = (s.title || '') + ' ' + (s.content || '').slice(0, 300); if (tier === 'nutricion' && TRAIN_RE.test(s.title || '') && !NUTRI_RE.test(s.title || '')) h.push('sec' + i); if (tier === 'entrenamiento' && NUTRI_RE.test(t) && !TRAIN_RE.test(s.title || '')) h.push('sec' + i); });
  if (tier === 'entrenamiento') h.push('suplementos');
  return h;
}
/* Copia del expediente con solo lo visible para el asesorado */
function clientCase(rep) {
  const H = new Set(((rep.data || {}).hidden) || []); if (!H.size) return rep;
  const d = Object.assign({}, rep.data || {});
  if (H.has('resumen')) d.goal = ''; if (H.has('indicadores')) d.indicators = []; if (H.has('alertas')) d.alerts = []; if (H.has('favorables')) d.favorables = [];
  if (H.has('habitos')) d.habits = []; if (H.has('metas')) d.goals = [];
  if (H.has('monitoreo')) d.monitoring = []; if (H.has('laboratorios')) d.labs = null; if (H.has('suplementos')) d.supplements = [];
  d.sections = (d.sections || []).filter((s, i) => !H.has('sec' + i));
  return Object.assign({}, rep, { data: d, summary: H.has('resumen') ? null : rep.summary, pending: H.has('preguntas') ? [] : rep.pending, doc_path: H.has('documento') ? null : rep.doc_path });
}
function caseBlocksHtml(rep, ans, coach) {
  const d = rep.data || {}; const pend = rep.pending || []; const A = (ans && ans.answers) || [];
  const H = new Set(d.hidden || []);
  const tg = k => coach ? ` <button class="chip sm vis${H.has(k) ? '' : ' on'}" data-act="cSec" data-id="${rep.id}" data-k="${k}" title="Visible u oculto para el asesorado">${H.has(k) ? 'Oculto' : 'Visible'}</button>` : '';
  const cc = k => coach && H.has(k) ? 'card hid' : 'card';
  let h = '';
  if ((d.indicators || []).length) h += `<div class="${cc('indicadores')}"><h3>Indicadores${tg('indicadores')}</h3><table class="tbl"><tbody>${d.indicators.map(x => `<tr><td>${esc(x.name)}</td><td><b>${esc(x.value)}</b> ${esc(x.unit || '')}${x.ref ? `<br><small class="muted">Referencia: ${esc(x.ref)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  if ((d.alerts || []).length) h += `<div class="${cc('alertas')}"><h3>Prioridades detectadas${tg('alertas')}</h3>${d.alerts.map(a => `<div class="alert-i ${esc(a.level)}"><b>${esc(LVL[a.level] || a.level || '')} · ${esc(a.title)}</b>${a.detail ? `<span class="pre">${esc(a.detail)}</span>` : ''}</div>`).join('')}</div>`;
  if ((d.favorables || []).length) h += `<div class="${cc('favorables')}"><h3>Factores favorables${tg('favorables')}</h3><ul class="small">${d.favorables.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  if (pend.length) {
    if (coach) h += `<div class="${cc('preguntas')}"><h3>Preguntas para el asesorado${tg('preguntas')}</h3>${pend.map((p, i) => `<div class="pend-q"><p><b>${i + 1}. ${esc(p.q)}</b>${p.why ? `<br><small>${esc(p.why)}</small>` : ''}</p><p class="small">${A[i] && A[i].a ? esc(A[i].a) : '<span class="muted">Sin respuesta</span>'}</p></div>`).join('')}
      ${ans ? `<p class="small muted">Respondidas el ${esc(fmtDateLong(String(ans.updated_at || ans.created_at).slice(0, 10)))}.</p>` : ''}<div class="row-btns"><button class="btn sm" data-act="cqAdd" data-id="${rep.id}">+ Pregunta</button></div></div>`;
    else h += `<div class="card"><h3>Preguntas de tu entrenador</h3><p class="small muted">Tus respuestas permiten ajustar el plan a tu situación real.</p>${pend.map((p, i) => `<div class="pend-q"><p><b>${i + 1}. ${esc(p.q)}</b>${p.why ? `<br><small>${esc(p.why)}</small>` : ''}</p><textarea class="input" rows="2" data-pq="${i}">${esc(A[i] ? A[i].a : '')}</textarea></div>`).join('')}<button class="btn primary block" data-act="cqSend" data-id="${rep.id}">Enviar respuestas</button></div>`;
  } else if (coach) h += `<div class="row-btns"><button class="btn sm" data-act="cqAdd" data-id="${rep.id}">+ Pregunta para el asesorado</button></div>`;
  if ((d.monitoring || []).length) h += `<div class="${cc('monitoreo')}"><h3>Monitoreo${tg('monitoreo')}</h3><table class="tbl"><thead><tr><th>Variable</th><th>Frecuencia</th><th>Criterio</th></tr></thead><tbody>${d.monitoring.map(x => `<tr><td>${esc(x.variable)}</td><td class="small">${esc(x.freq)}</td><td class="small">${esc(x.criterion)}</td></tr>`).join('')}</tbody></table></div>`;
  if (d.labs && (d.labs.tests.length || d.labs.notes)) h += `<div class="${cc('laboratorios')}"><h3>Laboratorios${tg('laboratorios')}</h3>${d.labs.tests.length ? `<ul class="small">${d.labs.tests.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${d.labs.notes ? `<p class="small pre">${esc(d.labs.notes)}</p>` : ''}</div>`;
  if ((d.supplements || []).length) h += `<div class="${cc('suplementos')}"><h3>Suplementación${tg('suplementos')}</h3><table class="tbl"><tbody>${d.supplements.map(s => `<tr><td><b>${esc(s.name)}</b></td><td class="small">${esc([s.dose, s.timing, s.note].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>`;
  (d.sections || []).forEach((s, i) => { h += `<div class="${cc('sec' + i)}">${s.title || coach ? `<h3>${esc(s.title || 'Sección')}${tg('sec' + i)}</h3>` : ''}<p class="small pre">${esc(s.content)}</p></div>`; });
  return h;
}
function caseDocHtml(rep0, client, logo, ans) {
  const rep = clientCase(rep0); const d = rep.data || {}; const pend = rep.pending || []; const A = (ans && ans.answers) || [];
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>${esc(rep.title || 'Plan integral')}</h1><p><b>${esc(client.full_name || '')}</b>${d.plan_name ? ' · ' + esc(d.plan_name) : ''}</p><p class="doc-sub">${esc(BRAND.name)} · ${esc(fmtDateLong(rep.report_date))}</p></div></div>`;
  if (d.goal) h += `<p><b>Objetivo:</b> ${esc(d.goal)}</p>`;
  if (rep.summary) h += `<h2>Resumen</h2><p class="pre">${esc(rep.summary)}</p>`;
  if ((d.goals || []).length) h += `<h2>Metas</h2><table class="doc-t"><thead><tr><th>Variable</th><th class="n">Inicio</th><th class="n">Meta</th><th>Fecha</th></tr></thead><tbody>${d.goals.map(g => `<tr><td>${esc(g.variable)}</td><td class="n">${esc(fmtN(g.start))} ${esc(g.unit || '')}</td><td class="n">${esc(fmtN(g.target))} ${esc(g.unit || '')}</td><td>${g.date ? esc(fmtDateLong(g.date)) : '—'}</td></tr>`).join('')}</tbody></table>`;
  if ((d.habits || []).length) h += `<h2>Hábitos diarios</h2><table class="doc-t"><thead><tr><th>Hábito</th><th>Frecuencia</th></tr></thead><tbody>${d.habits.map(x => `<tr><td>${esc(x.text)}</td><td>${esc(freqText(x))}</td></tr>`).join('')}</tbody></table><p class="doc-sub">Se marcan cada día en la pantalla Hoy de la aplicación.</p>`;
  if ((d.indicators || []).length) h += `<h2>Indicadores</h2><table class="doc-t"><thead><tr><th>Indicador</th><th class="n">Valor</th><th>Referencia</th></tr></thead><tbody>${d.indicators.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${esc(x.value)} ${esc(x.unit || '')}</td><td>${esc(x.ref || '')}</td></tr>`).join('')}</tbody></table>`;
  if ((d.alerts || []).length) h += `<h2>Prioridades</h2><table class="doc-t"><thead><tr><th>Prioridad</th><th>Hallazgo</th></tr></thead><tbody>${d.alerts.map(a => `<tr><td><b>${esc(LVL[a.level] || a.level)}</b></td><td><b>${esc(a.title)}</b>${a.detail ? `<br>${esc(a.detail)}` : ''}</td></tr>`).join('')}</tbody></table>`;
  if ((d.favorables || []).length) h += `<p><b>Factores favorables:</b> ${d.favorables.map(esc).join('; ')}.</p>`;
  if (pend.length) h += `<h2>Datos pendientes</h2><table class="doc-t"><thead><tr><th>#</th><th>Pregunta</th><th>Respuesta</th></tr></thead><tbody>${pend.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.q)}${p.why ? `<br><small>${esc(p.why)}</small>` : ''}</td><td>${esc(A[i] && A[i].a || '—')}</td></tr>`).join('')}</tbody></table>`;
  if ((d.monitoring || []).length) h += `<h2>Monitoreo</h2><table class="doc-t"><thead><tr><th>Variable</th><th>Frecuencia</th><th>Criterio</th></tr></thead><tbody>${d.monitoring.map(x => `<tr><td>${esc(x.variable)}</td><td>${esc(x.freq)}</td><td>${esc(x.criterion)}</td></tr>`).join('')}</tbody></table>`;
  if (d.labs && (d.labs.tests.length || d.labs.notes)) h += `<h2>Laboratorios</h2>${d.labs.tests.length ? `<p>${d.labs.tests.map(esc).join(' · ')}</p>` : ''}${d.labs.notes ? `<p class="pre">${esc(d.labs.notes)}</p>` : ''}`;
  if ((d.supplements || []).length) h += `<h2>Suplementación</h2><table class="doc-t"><thead><tr><th>Suplemento</th><th>Dosis</th><th>Momento</th><th>Indicaciones</th></tr></thead><tbody>${d.supplements.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.dose || '')}</td><td>${esc(s.timing || '')}</td><td>${esc(s.note || '')}</td></tr>`).join('')}</tbody></table>`;
  if ((d.competitions || []).length) h += `<h2>Competencias</h2><table class="doc-t"><tbody>${d.competitions.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(fmtDateLong(c.start))}${c.end && c.end !== c.start ? ' – ' + esc(fmtDateLong(c.end)) : ''}</td><td>${esc([c.city, c.notes].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table>`;
  for (const s of d.sections || []) h += `${s.title ? `<h2>${esc(s.title)}</h2>` : ''}<p class="pre">${esc(s.content)}</p>`;
  h += `<p class="doc-foot">El plan de alimentación por tipo de día está en el documento «Plan nutricional». Documento de ${esc(BRAND.name)}. Confidencial (Ley 1581 de 2012).</p>`;
  return h;
}
async function openCaseDoc(rep) {
  const type = rep.doc_type === 'pdf' ? 'application/pdf' : 'text/html';
  const blob = await DocFiles.get(rep.doc_path, type);
  if (rep.doc_type === 'pdf') { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.download = rep.doc_name || 'documento.pdf'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 60000); return; }
  const html = await blob.text();
  modal(`${modalHead(rep.doc_name || 'Documento')}<iframe class="doc-frame" sandbox="allow-popups" referrerpolicy="no-referrer" title="Documento"></iframe><div class="row-btns"><button class="btn" data-act="dl">Descargar HTML</button></div>`, { click: { dl: () => downloadFile(rep.doc_name || 'documento.html', html, 'text/html') } });
  const fr = document.querySelector('.doc-frame'); if (fr) fr.srcdoc = html;
}
async function caseView(cid, sub, coach) {
  if (S.needsV7) return { html: V7_NOTICE };
  const client = cid === S.profile.id ? S.profile : (await DB.select('profiles', { eq: { id: cid } }))[0] || {};
  let reps = await casesOf(cid); if (!coach) reps = reps.filter(r => r.visible).map(clientCase);
  const ans = await answersFor(reps.map(r => r.id));
  const top = coach ? `<div class="row-btns"><a class="btn primary" href="#/importar/${cid}" data-act="impNew">Importar plan</a><button class="btn" data-act="pkg">Paquete para la IA</button><button class="btn" data-act="pkgCopy">Copiar paquete</button><button class="btn" data-act="guide">Instrucciones IA</button></div>` : '';
  if (!reps.length) return { html: top + `<div class="card empty"><p>${coach ? 'Sin expedientes. Importa el plan individual generado en tu análisis para llenar el perfil del asesorado, o descarga el paquete de análisis.' : 'Tu entrenador todavía no ha publicado tu plan integral.'}</p></div>`, click: caseHandlers(cid, client, reps, ans, coach) };
  const rep = reps.find(r => r.id === sub) || reps[0];
  const a = ans.find(x => x.report_id === rep.id);
  if (coach && a && !a.seen) DB.update('case_answers', a.id, { seen: true }).catch(() => { });
  const plan = rep.plan_id ? (await DB.select('nutrition_plans', { eq: { id: rep.plan_id } }).catch(() => []))[0] : null;
  let h = top;
  const H = new Set((rep.data || {}).hidden || []);
  const tier = coach ? await tierOf(cid) : 'completo';
  if (coach) h += rep.visible ? `<div class="card ok-box small"><b>Publicado:</b> el asesorado lo ve en Perfil › Mi plan integral${H.size ? ` (${H.size} ${H.size === 1 ? 'sección oculta' : 'secciones ocultas'})` : ''}. Usa los botones «Visible / Oculto» de cada sección para elegir qué ve.${tier !== 'completo' ? ` Nivel de servicio: ${esc(TIERS[tier])}.` : ''}</div>` : `<div class="card warn-box small"><b>No publicado:</b> el asesorado no ve este expediente. <button class="btn sm primary" data-act="cVis" data-id="${rep.id}">Publicar al asesorado</button></div>`;
  if (reps.length > 1) h += `<div class="chips scroll">${reps.map(r => `<a class="chip${r === rep ? ' on' : ''}" href="${coach ? `#/asesorado/${cid}/expediente/${r.id}` : `#/expediente/${r.id}`}">${esc(fmtDM(parseDay(r.report_date)))}${coach && !r.visible ? ' · oculto' : ''}</a>`).join('')}</div>`;
  h += `<div class="card"><div class="day-h"><div><h3>${esc(rep.title || 'Plan integral')}</h3><small class="muted">${esc(fmtDateLong(rep.report_date))}${plan ? ' · ' + esc(plan.name) : ''}</small></div>${coach ? `<span class="badge ${rep.visible ? 'ok' : ''}">${rep.visible ? 'Visible' : 'Oculto'}</span>` : ''}</div>
      ${coach ? `<p class="small">Resumen y objetivo: <button class="chip sm vis${H.has('resumen') ? '' : ' on'}" data-act="cSec" data-id="${rep.id}" data-k="resumen">${H.has('resumen') ? 'Oculto' : 'Visible'}</button>${rep.doc_path ? ` · Documento completo: <button class="chip sm vis${H.has('documento') ? '' : ' on'}" data-act="cSec" data-id="${rep.id}" data-k="documento">${H.has('documento') ? 'Oculto' : 'Visible'}</button>` : ''}</p>` : ''}
      ${(rep.data || {}).goal ? `<p class="small"><b>Objetivo:</b> ${esc(rep.data.goal)}</p>` : ''}
      ${rep.summary ? `<p class="small pre">${esc(rep.summary)}</p>` : ''}
      <div class="row-btns">${rep.doc_path ? `<button class="btn sm primary" data-act="cDoc" data-id="${rep.id}">Documento completo (${rep.doc_type === 'pdf' ? 'PDF' : 'HTML'})</button>` : ''}${plan ? `<a class="btn sm" href="#/plan-ver/${plan.id}">Plan nutricional</a>` : ''}<button class="btn sm" data-act="cPdf" data-id="${rep.id}">Expediente PDF</button><button class="btn sm" data-act="cHtml" data-id="${rep.id}">Expediente HTML</button></div>
      ${coach ? `<div class="row-btns"><button class="btn sm" data-act="cVis" data-id="${rep.id}">${rep.visible ? 'Ocultar al asesorado' : 'Mostrar al asesorado'}</button><label class="btn sm">${rep.doc_path ? 'Reemplazar documento' : 'Adjuntar documento'}<input type="file" data-cfile="${rep.id}" accept=".pdf,.html,.htm,application/pdf,text/html" hidden></label><button class="btn sm danger-outline" data-act="cDel" data-id="${rep.id}">Eliminar</button></div>` : ''}</div>`;
  if (typeof habitsGoalsBlocksHtml === 'function') h += habitsGoalsBlocksHtml(rep, await habitGoalCtx(cid, rep), coach);
  h += caseBlocksHtml(rep, a, coach);
  return { html: h, click: caseHandlers(cid, client, reps, ans, coach), change: t => { if (t.dataset.cfile && t.files[0]) { const f = t.files[0]; const r = reps.find(x => x.id === t.dataset.cfile); attachCaseDoc(r, { type: /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? 'pdf' : 'html', name: f.name, file: f }).then(() => { toast('Documento guardado'); route(); }).catch(e => toast(errMsg(e), 'error')); return true; } return false; } };
}
function caseHandlers(cid, client, reps, ans, coach) {
  const R = id => reps.find(r => r.id === id);
  const docs = id => reportDocButtons(docSafe(`Expediente - ${client.full_name || ''} - ${R(id).report_date}`), logo => caseDocHtml(R(id), client, logo, ans.find(x => x.report_id === id)));
  return {
    ...(coach && typeof habitGoalHandlers === 'function' ? habitGoalHandlers(reps) : {}),
    pkg: async el => { el.disabled = true; try { downloadFile(docSafe(`Paquete de análisis - ${client.full_name}`) + '.md', await analysisPackage(cid), 'text/markdown'); } finally { el.disabled = false; } },
    pkgCopy: async el => { el.disabled = true; try { await copyText(await analysisPackage(cid)); toast('Paquete copiado'); } finally { el.disabled = false; } },
    guide: () => downloadFile('Instrucciones IA - Deuce Point.md', aiGuideFile(), 'text/markdown'),
    impNew: () => { S.imp = null; location.hash = '#/importar/' + cid; },
    cDoc: async el => { el.disabled = true; try { await openCaseDoc(R(el.dataset.id)); } catch (e) { toast(errMsg(e), 'error'); } finally { el.disabled = false; } },
    cPdf: el => docs(el.dataset.id).pdf(),
    cHtml: el => docs(el.dataset.id).html(),
    cSec: async el => {
      const r = R(el.dataset.id); const d = Object.assign({}, r.data || {}); const H = new Set(d.hidden || []); const k = el.dataset.k;
      if (H.has(k)) H.delete(k); else H.add(k); d.hidden = [...H];
      await DB.update('case_reports', r.id, { data: d }); keepScroll(() => route());
    },
    cVis: async el => { const r = R(el.dataset.id); await DB.update('case_reports', r.id, { visible: !r.visible }); route(); },
    cDel: async el => { if (!confirm('¿Eliminar este expediente y su documento? El plan nutricional importado se conserva.')) return; const r = R(el.dataset.id); if (r.doc_path) await DocFiles.del(r.doc_path).catch(() => { }); await DB.remove('case_reports', r.id); toast('Expediente eliminado'); location.hash = `#/asesorado/${cid}/expediente`; },
    cqAdd: async el => {
      const q = prompt('Pregunta para el asesorado:'); if (!q || !q.trim()) return; const why = prompt('Motivo (opcional):') || '';
      const r = R(el.dataset.id); await DB.update('case_reports', r.id, { pending: (r.pending || []).concat({ q: q.trim(), why: why.trim() }) });
      if (!S.needsV6) await DB.insert('messages', { client_id: cid, sender_id: S.profile.id, body: `${firstName(client.full_name)}, agregué una pregunta en Perfil › Mi plan integral: ${q.trim()}` }).catch(() => { });
      toast('Pregunta agregada'); route();
    },
    cqSend: async el => {
      const r = R(el.dataset.id); const answers = (r.pending || []).map((p, i) => ({ q: p.q, a: (($(`[data-pq="${i}"]`) || {}).value || '').trim() }));
      if (!answers.some(x => x.a)) return toast('Escribe al menos una respuesta', 'error');
      el.disabled = true;
      const ex = ans.find(x => x.report_id === r.id); const rec = { answers, seen: false, updated_at: new Date().toISOString() };
      if (ex) await DB.update('case_answers', ex.id, rec); else await DB.insert('case_answers', Object.assign({ report_id: r.id, client_id: cid }, rec));
      toast('Respuestas enviadas a tu entrenador'); route();
    }
  };
}
async function expedienteTab(cid, sub) { return caseView(cid, sub, true); }
async function vMiExpediente(id) { const r = await caseView(S.profile.id, id, false); paint(r.html, { click: r.click || {} }, 'Mi plan integral'); }
async function caseCardHtml() {
  if (S.needsV7) return '';
  const reps = (await casesOf(S.profile.id)).filter(r => r.visible).map(clientCase); const rep = reps[0]; if (!rep) return '';
  const pend = rep.pending || []; if (!pend.length) return '';
  const a = (await answersFor([rep.id]))[0]; const done = a ? a.answers.filter(x => x.a).length : 0;
  if (done >= pend.length) return '';
  return `<a class="card row-link" href="#/expediente/${rep.id}"><div><b>Preguntas de tu entrenador</b><small class="muted">${pend.length - done} de ${pend.length} sin responder · ajustan tu plan</small></div><span class="kpi">${pend.length - done}</span></a>`;
}
async function inboxCaseRows(byId) {
  if (S.needsV7) return [];
  try { return (await DB.select('case_answers', { eq: { seen: false } })).filter(a => byId[a.client_id]).map(a => `<a class="ib-row" href="#/asesorado/${a.client_id}/expediente/${a.report_id}"><span class="ib-tag v">Respuestas</span><span class="ib-n">${esc(byId[a.client_id].full_name || '')}</span><span class="ib-d">${a.answers.filter(x => x.a).length} respuestas</span></a>`); } catch (e) { return []; }
}

/* =====================================================================
   Paquete de análisis e instrucciones para la IA
   ===================================================================== */
const ANNEX_SPEC = `## Anexo «Datos de carga» (última página del PDF)

La aplicación lee solo este anexo para llenar el perfil del asesorado. Si el anexo cumple el formato, la carga es inmediata y no consume la API.

### Formato
- Texto plano en una sola columna, sin tablas ni viñetas gráficas. Letra de 8 a 9 pt; monoespaciada si es posible.
- Primera línea: \`=== DEUCE POINT DATOS ===\`. Última línea: \`=== FIN ===\`.
- Un registro por línea. Cada línea empieza con una etiqueta en mayúsculas seguida de dos puntos, o con «- » para los alimentos.
- Campos separados por « | ». Un campo que no aplica se deja vacío entre barras. No usar « | » dentro de un texto.
- Números sin separador de miles (3106); decimales con coma o punto (3,3). Fechas AAAA-MM-DD.
- Días de la semana completos y separados por coma: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo.
- Salto de línea dentro de un texto (pasos de preparación, protocolos): « // ».

### Etiquetas, en este orden
\`\`\`
ASESORADO: nombre
FECHA: AAAA-MM-DD
TITULO: título del informe
OBJETIVO: objetivo en una línea (se copia al perfil)
RESUMEN: un párrafo por cada línea RESUMEN
INDICADOR: nombre | valor | unidad | referencia
ALERTA: Alta, Media o Baja | título | hallazgo y acción
FAVORABLE: factor; factor; factor
PENDIENTE: pregunta para el asesorado | motivo
HABITO: acción concreta para el asesorado | frecuencia (Diario; días: Lunes, Jueves; o «3 por semana»)
META: variable | valor inicial | meta | unidad | fecha límite
PLAN: nombre del plan | agua base ml | indicaciones generales
TIPO: código | nombre | días | kcal | proteína g | carbohidratos g | grasa g | agua ml | indicaciones del tipo de día
COMIDA: hora | nombre | indicaciones
OPCION: nombre | días (solo si es rotación) | preparación (pasos separados por //)
- alimento | gramos | nota
FECHA_ESPECIAL: desde | hasta | días (opcional) | código de tipo (vacío = según el día) | % de las porciones de carbohidratos (vacío = 100) | motivo
ALIMENTO_NUEVO: nombre | kcal | proteína | carbohidratos | grasa | fibra | categoría
SUPLEMENTO: nombre | dosis | momento | indicaciones
COMPETENCIA: nombre | fecha inicio | fecha fin | ciudad | notas
RUTINA: nombre | indicaciones
SESION: nombre de la sesión
EJERCICIO: nombre | grupo muscular | series | repeticiones | RIR | descanso en s | notas
MONITOREO: variable | frecuencia | criterio
LABORATORIO: examen; examen; examen
LAB_INDICACIONES: texto
SECCION: título | texto
\`\`\`

### Reglas de contenido
- Cada COMIDA pertenece al último TIPO, cada OPCION a la última COMIDA y cada «- alimento» a la última OPCION. Si la comida tiene una sola opción, OPCION se puede omitir.
- Cada TIPO lleva todas sus comidas, aunque se repitan en otro tipo.
- Gramos del alimento en el estado del nombre (cocido o crudo). Líquidos: gramos = ml. Huevo: 50 g por unidad (anotar las unidades en la nota).
- Rotaciones (por ejemplo, la proteína de la cena según el día): una OPCION por rotación con sus días. Variaciones (con o sin whey): una OPCION por variación; la primera es la recomendada.
- Nombres de alimentos: los del catálogo de la aplicación cuando exista equivalente. Los que no estén: una línea ALIMENTO_NUEVO con la composición por 100 g y la categoría (Proteínas, Lácteos, Cereales y tubérculos, Leguminosas, Frutas, Verduras, Grasas, Suplementos, Bebidas, Dulces y otros).
- HABITO: instrucciones que el asesorado marca cada día en la aplicación, redactadas como acción verificable («Acostarse a las 21:15», «Tomar la bebida de panela durante la sesión», «Toma de proteína antes de dormir»). Entre 3 y 6 hábitos, los de mayor impacto según las prioridades.
- META: resultados medibles con valor inicial y meta. Con las variables peso, cintura, % grasa, pasos, agua, cumplimiento del plan o hábitos, la aplicación calcula el avance con los registros del asesorado; las demás se actualizan manualmente.
- FECHA_ESPECIAL: taper, carga de carbohidratos, competencia o progresión (por ejemplo 80 % de las porciones de carbohidratos la primera semana).
- SECCION: lo que no tiene etiqueta propia (protocolo de competencia, taper, preparación en lote, mercado y costo, hidratación).
- RUTINA, SESION y EJERCICIO solo si el plan define el entrenamiento.
- Sin datos de contacto.

### Ejemplo
\`\`\`
=== DEUCE POINT DATOS ===
ASESORADO: Nombre
FECHA: 2026-10-24
TITULO: Informe de valoración y plan integral
OBJETIVO: Competencia 27-11: corregir la disponibilidad energética y llegar con glucógeno completo
RESUMEN: Entrena de lunes a sábado (11–12 h/semana) e ingiere 1.300–1.500 kcal/día.
INDICADOR: Disponibilidad energética actual | 9,0 | kcal/kg MLG | < 30 riesgo; ≥ 45 óptima
ALERTA: Alta | Baja disponibilidad energética | Ingesta de 1.350 kcal frente a un gasto de 3.000 kcal. Aumentar a 2.800–3.100 kcal.
FAVORABLE: Ciclo regular; prepara sus comidas; creatina 5 g/día
PENDIENTE: Hora de salida de la competencia | Horario de comidas del día de la competencia
HABITO: Acostarse a las 21:15 | Domingo, Lunes, Martes, Miércoles, Jueves, Viernes
HABITO: Bebida de panela durante la sesión | Lunes, Martes, Miércoles, Jueves, Viernes, Sábado
HABITO: Toma de proteína antes de dormir | Diario
META: Peso | 63,4 | 64,5 | kg | 2026-11-27
META: Cumplimiento del plan | 0 | 85 | % | 2026-11-27
PLAN: Plan competencia · noviembre | 3000 | Porciones en gramos de alimento cocido, excepto avena cruda.
TIPO: A | Doble sesión | Martes, Jueves | 3106 | 128 | 503 | 66 | 4000 | Bebida de panela durante la sesión.
COMIDA: 04:45 | Desayuno | Huevos con 5 ml de aceite.
- Huevo entero | 150 | 3 unidades
- Arepa de maíz | 120 |
- Banano | 120 |
COMIDA: 17:30 | Cena | Proteína según el día.
OPCION: Lenteja y huevo | Martes | Lenteja sin remojo // 25 min de cocción
- Lenteja cocida | 150 |
- Huevo entero | 50 | 1 unidad
- Arroz blanco cocido | 150 |
OPCION: Hígado | Jueves |
- Hígado de res cocido | 100 |
- Arroz blanco cocido | 150 |
TIPO: C | Descanso | Domingo | 2302 | 127 | 293 | 69 | 2500 |
COMIDA: 06:30 | Desayuno |
- Huevo entero | 150 | 3 unidades
- Leche semidescremada | 200 |
FECHA_ESPECIAL: 2026-10-26 | 2026-11-01 | | | 80 | Progresión
FECHA_ESPECIAL: 2026-11-16 | 2026-11-22 | Martes, Jueves | B | | Taper
ALIMENTO_NUEVO: Leche semidescremada | 46 | 3,3 | 4,8 | 1,5 | 0 | Lácteos
SUPLEMENTO: Creatina monohidratada | 5 g/día | Diario | Incluida la semana de competencia
COMPETENCIA: HYROX | 2026-11-27 | | Bogotá |
MONITOREO: Peso en ayunas | Diario | Si baja de peso: +150 kcal en días A y B
LABORATORIO: Ferritina; 25-OH vitamina D; TSH
LAB_INDICACIONES: En ayunas, sin entrenamiento intenso en las 24 h previas.
SECCION: Protocolo el día de la competencia | 3–4 h antes: 120 g de arepa + 2 huevos + 1 banano // 60 min antes: cafeína 3 mg/kg
=== FIN ===
\`\`\`
`;
const AI_GUIDE = `# Formato del informe para Deuce Point

Instrucción permanente para la IA de análisis de ${'${BRAND}'}. Cada informe se entrega en PDF con dos partes:

1. **Informe para el asesorado:** el formato habitual (resumen, detector de problemas, datos pendientes, requerimientos por tipo de día, plan de alimentación por comida con gramos, reemplazos, monitoreo, laboratorios, suplementación y referencias). Redacción técnica y directa. Gráficas de barras.
2. **Anexo «Datos de carga»:** la última página, con el formato exacto que se describe abajo. Es lo que la aplicación lee para llenar el perfil (plan por tipo de día, expediente, preguntas, suplementos, competencias y rutina).

` + ANNEX_SPEC;
const aiGuide = () => AI_GUIDE.replace('${BRAND}', BRAND.name);
function catalogMd(withEx) {
  let t = `## Catálogo de alimentos de la aplicación (valores por 100 g)\n\n| Alimento | Categoría | kcal | Proteína | Carbohidratos | Grasa |\n|---|---|---|---|---|---|\n`;
  t += S.foods.map(f => `| ${f.name} | ${f.category} | ${fmtInt(f.kcal)} | ${r1(num(f.protein))} | ${r1(num(f.carbs))} | ${r1(num(f.fat))} |`).join('\n') + '\n';
  if (withEx) {
    const g = {}; S.exercises.forEach(e => { (g[e.muscle_group] = g[e.muscle_group] || []).push(e.name); });
    t += `\n## Catálogo de ejercicios\n\n` + Object.entries(g).map(([k, v]) => `- **${k}:** ${v.join('; ')}`).join('\n') + '\n';
  }
  return t;
}
const aiGuideFile = () => aiGuide() + '\n' + catalogMd(true);
async function analysisPackage(cid) {
  const q = (t, o) => DB.select(t, o).catch(() => []);
  const [c] = await q('profiles', { eq: { id: cid } }); const it = (await q('intakes', { eq: { client_id: cid } }))[0];
  const d = (it && it.data) || {}; const k = (it && it.calc) || {};
  const L = []; const add = s => L.push(s);
  const today = todayStr();
  add(`# Paquete de análisis · ${firstName(c && c.full_name)} · ${fmtDateLong(today)}\n`);
  add(`Datos exportados de ${BRAND.name} para elaborar la valoración y el plan individual. Se excluyen correo y teléfono.\n`);
  add(aiGuide());
  add(`\n# Datos del asesorado\n`);
  add(`- Nombre: ${firstName(c && c.full_name)}\n- Objetivo registrado: ${(c && c.goal) || '—'}`);
  if (it) {
    add(`\n## Valoración inicial (${fmtDateLong(String(it.created_at || today).slice(0, 10))})\n`);
    for (const sec of INTAKE) {
      const rows = sec.f.filter(f => f.id && !['nombre', 'whatsapp', 'consentimiento', 'datos', 'fotos'].includes(f.id) && (!f.show || f.show(d)) && d[f.id] != null && fmtAns(d[f.id]) !== '');
      if (rows.length) add(`### ${sec.t}\n` + rows.map(f => `- ${f.label}: ${fmtAns(d[f.id])}${f.unit ? ' ' + f.unit : ''}`).join('\n'));
    }
    if ((d.extra || []).length) add(`### Preguntas adicionales\n` + d.extra.map(x => `- ${x.q}: ${x.a}`).join('\n'));
    if (k && Object.keys(k).length && typeof calcRows === 'function') { try { add(`\n## Cálculos de la aplicación\n` + calcRows(k).map(([a, b]) => `- ${a}: ${String(b).replace(/<[^>]+>/g, '')}`).join('\n')); } catch (e) { } }
  } else add('\nSin valoración inicial registrada.');
  const bodies = await q('body_logs', { eq: { client_id: cid }, order: 'log_date', asc: false, limit: 12 });
  if (bodies.length) add(`\n## Peso y medidas (últimos registros)\n\n| Fecha | Peso kg | Cintura cm | % grasa |\n|---|---|---|---|\n` + bodies.map(b => `| ${b.log_date} | ${b.weight_kg ?? ''} | ${b.waist_cm ?? ''} | ${b.body_fat ?? ''} |`).join('\n'));
  if (!S.needsV6) {
    const an = (await q('anthropometry', { eq: { client_id: cid }, order: 'measure_date', asc: false, limit: 1 }))[0];
    if (an) {
      add(`\n## Antropometría ISAK (${an.measure_date})\n` + Object.entries(an.data || {}).filter(([, v]) => v !== '' && v != null).map(([kk, v]) => `- ${kk}: ${v}`).join('\n'));
      if (typeof isakCalc === 'function') { try { const r = isakCalc(an.data || {}, d.sexo === 'Femenino' ? 'F' : 'M', ageFrom(d.fecha_nac)); add('Resultados: ' + Object.entries(r).filter(([, v]) => typeof v === 'number' && isFinite(v)).map(([kk, v]) => `${kk} ${r1(v)}`).join(' · ')); } catch (e) { } }
    }
  }
  const cks = await q('checkins', { eq: { client_id: cid }, order: 'check_date', asc: false, limit: 6 });
  if (cks.length) add(`\n## Check-ins semanales\n\n| Fecha | Peso | Cintura | Adherencia | Energía | Sueño | Hambre | Estrés | Rendimiento | Notas |\n|---|---|---|---|---|---|---|---|---|---|\n` + cks.map(x => `| ${x.check_date} | ${x.weight_kg ?? ''} | ${x.waist_cm ?? ''} | ${x.adherence ?? ''} | ${x.energy ?? ''} | ${x.sleep ?? ''} | ${x.hunger ?? ''} | ${x.stress ?? ''} | ${x.performance ?? ''} | ${String(x.notes || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`).join('\n'));
  const start = addDays(today, -13);
  const [logs, dailies, ws] = await Promise.all([q('food_logs', { eq: { client_id: cid }, gte: { log_date: start } }), q('daily_logs', { eq: { client_id: cid }, gte: { log_date: start } }), q('workouts', { eq: { client_id: cid }, gte: { started_at: parseDay(addDays(today, -27)).toISOString() } })]);
  const full = await activePlanFor(cid).catch(() => null);
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i)).filter(x => logs.some(l => l.log_date === x));
  if (days.length) {
    const tot = days.map(x => logs.filter(l => l.log_date === x).reduce((a, l) => addM(a, logM(l)), ZERO()));
    const avg = scaleM(tot.reduce((a, m) => addM(a, m), ZERO()), 1 / tot.length);
    const comps = full ? days.map(x => dayCompletion(full, logs.filter(l => l.log_date === x), dailies.find(y => y.log_date === x), x)).filter(v => v != null) : [];
    add(`\n## Registro de alimentación (14 días)\n- Días con registro: ${days.length}/14\n- Promedio en días con registro: ${fmtInt(avg.kcal)} kcal · P ${fmtInt(avg.protein)} g · C ${fmtInt(avg.carbs)} g · G ${fmtInt(avg.fat)} g${comps.length ? `\n- Cumplimiento del plan: ${Math.round(comps.reduce((a, b) => a + b, 0) / comps.length)} %` : ''}`);
  }
  const wv = dailies.filter(x => num(x.water_ml)); if (wv.length) add(`- Agua promedio: ${r1(wv.reduce((a, x) => a + num(x.water_ml), 0) / wv.length / 1000)} L/día`);
  const sv = dailies.filter(x => num(x.steps)); if (sv.length) add(`- Pasos promedio: ${fmtInt(sv.reduce((a, x) => a + num(x.steps), 0) / sv.length)}`);
  if (ws.length) add(`\n## Entrenamiento (28 días)\n- Sesiones registradas: ${ws.length}\n- Minutos totales: ${fmtInt(ws.reduce((a, w) => a + (w.finished_at ? (new Date(w.finished_at) - new Date(w.started_at)) / 60000 : 0), 0))}\n- Sesiones: ${ws.slice(0, 20).map(w => `${dateStr(new Date(w.started_at))} ${w.day_name || ''}`).join('; ')}`);
  if (!S.needsV6) {
    const [wel, ten, tor, pains, sp, cyc] = await Promise.all([q('wellness', { eq: { client_id: cid }, gte: { log_date: start } }), q('tennis_sessions', { eq: { client_id: cid }, gte: { log_date: addDays(today, -27) } }), q('tournaments', { eq: { client_id: cid } }), q('pain_reports', { eq: { client_id: cid } }), q('supplement_plans', { eq: { client_id: cid } }), q('cycle_logs', { eq: { client_id: cid }, order: 'start_date', asc: false, limit: 3 })]);
    if (wel.length) { const av = kk => r1(wel.reduce((a, x) => a + num(x[kk]), 0) / wel.length); add(`\n## Bienestar diario (${wel.length} registros, escala 1–5)\n- Sueño ${av('sleep')} · Fatiga ${av('fatigue')} · Dolor muscular ${av('soreness')} · Estrés ${av('stress')} · Ánimo ${av('mood')}`); }
    if (ten.length) add(`\n## Práctica deportiva y partidos (28 días)\n` + ten.map(x => `- ${x.log_date}: ${x.kind || ''} ${x.minutes || ''} min${x.rpe ? ', RPE ' + x.rpe : ''}`).join('\n'));
    const up = tor.filter(x => (x.end_date || x.start_date) >= today); if (up.length) add(`\n## Competencias próximas\n` + up.map(x => `- ${x.start_date}${x.end_date ? ' a ' + x.end_date : ''}: ${x.name}${x.city ? ', ' + x.city : ''}${x.category ? ' · ' + x.category : ''}`).join('\n'));
    const act = pains.filter(x => !x.resolved_at); if (act.length) add(`\n## Molestias activas\n` + act.map(x => `- ${x.report_date}: ${x.zone}${x.side ? ' ' + x.side : ''}, intensidad ${x.intensity}/10${x.notes ? ' · ' + x.notes : ''}`).join('\n'));
    if (cyc.length) add(`\n## Ciclo menstrual\n- Inicios registrados: ${cyc.map(x => x.start_date).join(', ')}`);
    if (sp[0] && (sp[0].items || []).length) add(`\n## Suplementación actual\n` + sp[0].items.map(x => `- ${(typeof suppOf === 'function' && suppOf(x) ? suppOf(x).name : x.name || x.key)}: ${x.dose || ''} ${x.timing ? '· ' + x.timing : ''}`).join('\n'));
  }
  if (full) add(`\n## Plan nutricional actual: ${full.name}\n` + dayVariants(full).map(v => `- ${dayLabel(v)}${(v.weekdays || []).length ? ' (' + v.weekdays.join(', ') + ')' : ''}: ${fmtInt(num(v.kcal))} kcal · P ${fmtInt(num(v.protein_g))} g · C ${fmtInt(num(v.carbs_g))} g · G ${fmtInt(num(v.fat_g))} g`).join('\n'));
  if (!S.needsV7) {
    const reps = await casesOf(cid); const ans = await answersFor(reps.map(r => r.id));
    const rows = reps.flatMap(r => { const a = ans.find(x => x.report_id === r.id); return a ? a.answers.filter(x => x.a).map(x => `- (${r.report_date}) ${x.q}: ${x.a}`) : []; });
    if (rows.length) add(`\n## Respuestas a las preguntas pendientes\n` + rows.join('\n'));
    const hgRep = reps.find(r => ((r.data || {}).habits || []).length || ((r.data || {}).goals || []).length);
    if (hgRep && typeof habitGoalCtx === 'function') {
      const ctx = await habitGoalCtx(cid, hgRep); const hs = hgRep.data.habits || [], gs = hgRep.data.goals || [];
      if (hs.length) add(`\n## Hábitos asignados (cumplimiento de los últimos 7 días)\n` + hs.map(x => { const p = ctx.habitPct(x); return `- ${x.text} (${freqText(x)}): ${p == null ? 'sin datos' : p + ' %'}`; }).join('\n'));
      if (gs.length) add(`\n## Metas\n` + gs.map(g => { const s = goalState(g, ctx); return `- ${g.variable}: inicio ${fmtG(num(g.start))}, actual ${fmtG(s.cur)}, meta ${fmtG(num(g.target))} ${g.unit || ''}${g.date ? ' al ' + g.date : ''}${s.p != null ? ` (${Math.round(s.p * 100)} % del camino)` : ''}`; }).join('\n'));
    }
    if (reps[0]) add(`\n## Último expediente: ${reps[0].title} (${reps[0].report_date})\n${reps[0].summary ? reps[0].summary.slice(0, 1500) : ''}`);
  }
  add('\n' + catalogMd(true));
  return L.join('\n') + '\n';
}

/* ---------- datos de demostración: preguntas adicionales de ejemplo ---------- */
function buildImportarDemo(d) {
  Object.assign(d, { case_reports: d.case_reports || [], case_answers: d.case_answers || [] });
}
