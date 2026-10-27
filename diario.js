/* =====================================================================
   Deuce Point v9 · Registro rápido, alimentación e interfaz del asesorado
   ===================================================================== */

/* ---------- apariencia: modo oscuro y letra grande ---------- */
function applyLook() {
  let th = 'auto', big = false; try { th = localStorage.getItem('dp_theme') || 'auto'; big = localStorage.getItem('dp_big') === '1'; } catch (e) { }
  const dark = th === 'dark' || (th === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark); document.documentElement.classList.toggle('big', big);
}
applyLook();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook); } catch (e) { }
function lookCardHtml() {
  let th = 'auto', big = false; try { th = localStorage.getItem('dp_theme') || 'auto'; big = localStorage.getItem('dp_big') === '1'; } catch (e) { }
  return `<div class="card"><h3>Apariencia</h3><div class="seg">${[['auto', 'Automática'], ['light', 'Clara'], ['dark', 'Oscura']].map(([k, l]) => `<button class="${th === k ? 'on' : ''}" data-act="lookTh" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" data-big ${big ? 'checked' : ''}> Letra grande</label></div>`;
}
const lookHandlers = { lookTh: el => { try { localStorage.setItem('dp_theme', el.dataset.v); } catch (e) { } applyLook(); el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); } };
document.addEventListener('change', e => { if (e.target && 'big' in (e.target.dataset || {})) { try { localStorage.setItem('dp_big', e.target.checked ? '1' : '0'); } catch (x) { } applyLook(); } });

/* ---------- utilidades ---------- */
const hm2min = s => { const m = String(s || '').match(/(\d{1,2})[:.h](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const rowsKcal = rows => rows.reduce((a, r) => a + (r.food ? macrosFor(r.food, r.grams).kcal : num(r.kcal) * (r.k || 1)), 0);
async function setChoice(cid, date, patchFn) {
  const d = (await DB.select('daily_logs', { eq: { client_id: cid, log_date: date } }))[0];
  const ch = Object.assign({}, (d && d.choices) || {}); patchFn(ch); await upsertDaily(cid, date, { choices: ch }); return ch;
}
/* Inserta registros de alimentos: rows = [{ food, grams } o { name, kcal, protein, carbs, fat, grams }] */
async function insertLogRows(cid, date, meal, rows, k = 1) {
  const recs = rows.map(r => {
    if (r.food) { const g = Math.max(1, roundG(num(r.grams) * k)); const m = macrosFor(r.food, g); return { client_id: cid, log_date: date, meal_id: meal.id || null, meal_name: meal.name, food_id: r.food.id, plan_item_id: r.plan_item_id || null, name: r.food.name, grams: r1(g), kcal: r1(m.kcal), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) }; }
    return { client_id: cid, log_date: date, meal_id: meal.id || null, meal_name: meal.name, food_id: null, plan_item_id: null, name: r.name, grams: r.grams ? r1(num(r.grams) * k) : null, kcal: r1(num(r.kcal) * k), protein: r1(num(r.protein) * k), carbs: r1(num(r.carbs) * k), fat: r1(num(r.fat) * k) };
  });
  if (recs.length) await DB.insert('food_logs', recs);
}
const logToRow = l => l.food_id && foodOf(l.food_id) ? { food: foodOf(l.food_id), grams: num(l.grams), plan_item_id: l.plan_item_id } : { name: l.name, grams: l.grams, kcal: l.kcal, protein: l.protein, carbs: l.carbs, fat: l.fat };

/* ---------- medidas con la mano ---------- */
function handText(f, g) {
  if (!f) return ''; const s = S.settings || {}; const n = nrm(f.name); g = num(g);
  const u = (v, one, many) => { const x = Math.max(0.5, Math.round(v * 2) / 2); return `≈ ${fmtFrac(x)} ${x > 1 ? many : one}`; };
  if (/huevo/.test(n) && num(f.unit_grams)) return u(g / num(f.unit_grams), 'unidad', 'unidades');
  if (/aceite|mantequilla$/.test(n)) return u(g / 5, 'cucharadita', 'cucharaditas');
  switch (f.category) {
    case 'Proteínas': return u(g / (num(s.hand_palm_g) || 100), 'palma', 'palmas');
    case 'Cereales y tubérculos': case 'Leguminosas': return u(g / (num(s.hand_fist_g) || 150), 'puño', 'puños');
    case 'Frutas': return num(f.unit_grams) ? u(g / num(f.unit_grams), f.unit_name || 'unidad', (f.unit_name || 'unidad') + 'es') : u(g / 150, 'puño', 'puños');
    case 'Verduras': return u(g / 80, 'puño', 'puños');
    case 'Grasas': return u(g / (num(s.hand_thumb_g) || 10), 'pulgar', 'pulgares');
    case 'Lácteos': return u(g / 240, 'taza', 'tazas');
    default: return '';
  }
}
const handOn = () => lsGet('dp_hand', '0') === '1';

/* ---------- acciones de una comida: copiar, repetir, guardar, porción, cómo te sentó ---------- */
function mealMoreModal(x) {
  const { m, mk } = x; const rep = (x.choices.__rep || {})[mk]; const pf = num((x.choices.__pf || {})[mk]) || 1; const fb = (x.choices.__fb || {})[mk] || {};
  const others = x.meals.filter(o => o.mk !== mk);
  const yest = x.yLogs.filter(l => l.meal_name === m.name);
  const draw = saved => modal(`${modalHead(m.name)}
    ${rep ? `<div class="warn-box small">Esta comida está reemplazada: ${esc(rep.l || '')}. <button class="btn sm" data-act="mUnrep">Volver al plan</button></div>` : ''}
    <h3 class="sm-h">Copiar en esta comida</h3>
    <p class="small muted">Copia los alimentos de otra comida con las cantidades ajustadas a las calorías de esta comida en tu plan. Cuenta como comida cumplida.</p>
    <div class="pick-list">${others.map(o => `<button class="pick-item" data-act="mCopy" data-src="${o.mk}"><b>${esc(o.m.name)}</b><small>${o.logs.length ? 'Lo que registraste hoy' : 'Lo del plan'} · ${fmtInt(o.kcal)} kcal</small></button>`).join('')}</div>
    ${yest.length ? `<button class="btn block" data-act="mYest">Repetir lo de ayer en esta comida (${fmtInt(yest.reduce((a, l) => a + num(l.kcal), 0))} kcal)</button>` : ''}
    ${S.needsV9 ? '' : `<h3 class="sm-h">Mis comidas guardadas</h3>${saved.length ? `<div class="pick-list">${saved.map(s => `<div class="pick-row"><button class="pick-item" data-act="mSaved" data-id="${s.id}"><b>${esc(s.name)}</b><small>${fmtInt(rowsKcal(s.items.map(i => i.food_id && foodOf(i.food_id) ? { food: foodOf(i.food_id), grams: i.grams } : i)))} kcal · ${s.items.length} alimentos</small></button><button class="icon-btn danger" data-act="mSavedDel" data-id="${s.id}" aria-label="Eliminar">✕</button></div>`).join('')}</div>` : '<p class="small muted">Aún no tienes comidas guardadas.</p>'}
      ${x.mLogs.length ? '<button class="btn block" data-act="mSave">Guardar esta comida para repetirla</button>' : ''}`}
    ${x.hasPlan && !rep ? `<h3 class="sm-h">Porción de la comida</h3><div class="seg">${[0.75, 1, 1.25].map(v => `<button class="${pf === v ? 'on' : ''}" data-act="mPf" data-v="${v}">${Math.round(v * 100)} %</button>`).join('')}</div>` : ''}
    <h3 class="sm-h">¿Cómo te sentó?</h3>
    <div class="well-row"><span>Saciedad</span><div class="chips scale5">${[1, 2, 3, 4, 5].map(n => `<button class="chip${fb.s === n ? ' on' : ''}" data-act="mFb" data-k="s" data-v="${n}">${n}</button>`).join('')}</div></div>
    <div class="well-row"><span>Digestión</span><div class="chips">${['Bien', 'Regular', 'Mal'].map(n => `<button class="chip${fb.d === n ? ' on' : ''}" data-act="mFb" data-k="d" data-v="${n}">${n}</button>`).join('')}</div></div>`, {
    click: {
      mCopy: async el => { const s = x.meals.find(o => o.mk === el.dataset.src); await replaceMeal(x, s.logs.length ? s.logs.map(logToRow) : s.planned, 'Copia de ' + s.m.name, true); },
      mYest: async () => { await replaceMeal(x, yest.map(logToRow), 'Igual que ayer', false); },
      mSaved: async el => { const s = saved.find(v => v.id === el.dataset.id); await replaceMeal(x, s.items.map(i => i.food_id && foodOf(i.food_id) ? { food: foodOf(i.food_id), grams: i.grams } : i), s.name, false); },
      mSavedDel: async el => { if (!confirm('¿Eliminar esta comida guardada?')) return; await DB.remove('saved_meals', el.dataset.id); draw(saved.filter(s => s.id !== el.dataset.id)); },
      mSave: async () => { const n = prompt('Nombre de la comida guardada:', m.name); if (!n || !n.trim()) return; await DB.insert('saved_meals', { client_id: x.cid, name: n.trim().slice(0, 80), items: x.mLogs.map(l => l.food_id ? { food_id: l.food_id, grams: num(l.grams) } : { name: l.name, grams: l.grams, kcal: l.kcal, protein: l.protein, carbs: l.carbs, fat: l.fat }) }); toast('Comida guardada'); closeModal(); },
      mPf: async el => { await setPortion(x, num(el.dataset.v)); closeModal(); x.after(); },
      mFb: async el => { await setChoice(x.cid, x.date, ch => { const all = Object.assign({}, ch.__fb || {}); const cur = Object.assign({}, all[mk] || {}); cur[el.dataset.k] = el.dataset.k === 's' ? +el.dataset.v : el.dataset.v; all[mk] = cur; ch.__fb = all; }); fb[el.dataset.k] = el.dataset.k === 's' ? +el.dataset.v : el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); },
      mUnrep: async () => { for (const l of x.mLogs) await DB.remove('food_logs', l.id); await setChoice(x.cid, x.date, ch => { const r = Object.assign({}, ch.__rep || {}); delete r[mk]; ch.__rep = r; }); closeModal(); x.after(); }
    }
  });
  if (S.needsV9) draw([]); else DB.select('saved_meals', { eq: { client_id: x.cid }, order: 'name' }).then(draw).catch(() => draw([]));
}
/* Reemplaza la comida por otros alimentos; con scale ajusta a las kcal del plan para esta comida */
async function replaceMeal(x, rows, label, scale) {
  if (!rows.length) return toast('No hay alimentos para copiar', 'error');
  if (x.mLogs.length && !confirm(`Se reemplazan los ${x.mLogs.length} registros de ${x.m.name}. ¿Continuar?`)) return;
  const sk = rowsKcal(rows); let k = 1;
  if (scale && x.plannedKcal > 0 && sk > 0) k = Math.min(2, Math.max(0.5, x.plannedKcal / sk));
  for (const l of x.mLogs) await DB.remove('food_logs', l.id);
  await insertLogRows(x.cid, x.date, x.m, rows.map(r => Object.assign({}, r, { plan_item_id: null })), k);
  await setChoice(x.cid, x.date, ch => { ch.__rep = Object.assign({}, ch.__rep || {}, { [x.mk]: { l: label + (k !== 1 ? ` (porciones al ${Math.round(k * 100)} %)` : '') } }); });
  closeModal(); toast(k !== 1 ? `Copiado y ajustado a ${fmtInt(x.plannedKcal)} kcal` : 'Comida registrada'); x.after();
}
async function setPortion(x, f) {
  await setChoice(x.cid, x.date, ch => { const p = Object.assign({}, ch.__pf || {}); if (f === 1) delete p[x.mk]; else p[x.mk] = f; ch.__pf = p; });
  for (const l of x.mLogs) { const it = x.planItems.find(i => i.id === l.plan_item_id); if (!it || l.food_id !== it.food_id) continue; const food = foodOf(l.food_id); if (!food) continue; const g = Math.max(1, roundG(it.baseGrams * f)); const mm = macrosFor(food, g); await DB.update('food_logs', l.id, { grams: r1(g), kcal: r1(mm.kcal), protein: r1(mm.protein), carbs: r1(mm.carbs), fat: r1(mm.fat) }); }
}
/* Repite todo lo registrado ayer en las comidas de hoy (por nombre de comida) */
async function repeatYesterday(x) {
  if (!x.yLogs.length) return toast('Ayer no hay registros', 'error');
  if (!confirm('Se copian en hoy todas las comidas registradas ayer, con las mismas cantidades. Las comidas de hoy con registros se reemplazan. ¿Continuar?')) return;
  const rep = {};
  for (const o of x.meals) {
    const yl = x.yLogs.filter(l => l.meal_name === o.m.name); if (!yl.length) continue;
    for (const l of o.logs) await DB.remove('food_logs', l.id);
    await insertLogRows(x.cid, x.date, o.m, yl.map(l => Object.assign(logToRow(l), { plan_item_id: null })));
    rep[o.mk] = { l: 'Igual que ayer' };
  }
  await setChoice(x.cid, x.date, ch => { ch.__rep = Object.assign({}, ch.__rep || {}, rep); });
  toast('Día copiado'); x.after();
}

/* ---------- «Hoy no pude seguir el plan» ---------- */
const OFF_REASONS = ['Viaje', 'Trabajo u horario', 'Sin tiempo para cocinar', 'Hambre o ansiedad', 'Evento social', 'Enfermedad', 'Presupuesto', 'Otro'];
function offPlanModal(cid, date, choices, after) {
  const cur = choices.__off || { r: [], n: '' }; const sel = new Set(cur.r || []);
  modal(`${modalHead('No pude seguir el plan')}<p class="small muted">Tu entrenador lo recibe para ajustar el plan a tu situación. No afecta tus registros.</p>
    <div class="chips">${OFF_REASONS.map(r => `<button class="chip${sel.has(r) ? ' on' : ''}" data-act="offR" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    <label class="field"><span>Detalle (opcional)</span><textarea class="input" id="off-n" rows="2">${esc(cur.n || '')}</textarea></label>
    <button class="btn primary block" data-act="offOk">Enviar</button>${choices.__off ? '<button class="btn block" data-act="offDel">Quitar el aviso</button>' : ''}`, {
    click: {
      offR: el => { const v = el.dataset.v; if (sel.has(v)) sel.delete(v); else sel.add(v); el.classList.toggle('on'); },
      offOk: async () => { if (!sel.size) return toast('Elige al menos un motivo', 'error'); await setChoice(cid, date, ch => { ch.__off = { r: [...sel], n: $('#off-n').value.trim(), at: new Date().toISOString() }; }); closeModal(); toast('Enviado a tu entrenador'); after(); },
      offDel: async () => { await setChoice(cid, date, ch => { delete ch.__off; }); closeModal(); after(); }
    }
  });
}

/* ---------- evento social: estimación y compensación ---------- */
const EVENT_PRESETS = [['Restaurante', 900], ['Comida rápida', 1200], ['Celebración o fiesta', 1500], ['Asado o parrilla', 1300]];
async function eventModal(cid, full, after) {
  if (!full) return toast('Necesitas un plan nutricional activo', 'error');
  let date = todayStr();
  const draw = () => {
    const pl = planForDate(full, date);
    modal(`${modalHead('Evento social')}<p class="small muted">Registra con anticipación una comida fuera del plan. La app la cuenta en tu día y, si eliges compensar, reduce un poco los carbohidratos de los días siguientes.</p>
      <label class="field"><span>Fecha</span><input class="input" type="date" id="ev-d" value="${date}"></label>
      <label class="field"><span>Comida que reemplaza</span><select class="input" id="ev-m">${pl.meals.map(m => `<option value="${m.id}">${esc(m.name)}${m.time_label ? ' · ' + esc(m.time_label) : ''}</option>`).join('')}</select></label>
      <div class="chips">${EVENT_PRESETS.map(([l, k]) => `<button class="chip" data-act="evP" data-l="${esc(l)}" data-k="${k}">${esc(l)} · ${fmtInt(k)}</button>`).join('')}</div>
      <div class="rex-grid two"><label><span>kcal estimadas</span><input class="input" id="ev-k" inputmode="numeric" value="900"></label><label><span>Descripción</span><input class="input" id="ev-l" value="Restaurante"></label></div>
      <label class="check"><input type="checkbox" id="ev-c" checked> Compensar en los 3 días siguientes (máximo ${num(S.settings.event_max_pct) || 15} % de las calorías de cada día)</label>
      <button class="btn primary block" data-act="evOk">Guardar evento</button>`, {
      change: t => { if (t.id === 'ev-d' && t.value) { date = t.value; draw(); } },
      click: {
        evP: el => { $('#ev-k').value = el.dataset.k; $('#ev-l').value = el.dataset.l; },
        evOk: async () => {
          const kcal = num($('#ev-k').value); if (!(kcal > 0)) return toast('Indica las kcal estimadas', 'error');
          const meal = pl.meals.find(m => m.id === $('#ev-m').value); const lbl = $('#ev-l').value.trim() || 'Evento';
          const opt = defaultOption(meal, date); const planned = opt ? optionTotals(opt).kcal : 0;
          const old = (await DB.select('food_logs', { eq: { client_id: cid, log_date: date } })).filter(l => l.meal_id === meal.id);
          for (const l of old) await DB.remove('food_logs', l.id);
          await insertLogRows(cid, date, meal, [{ name: 'Evento social · ' + lbl, kcal, protein: kcal * 0.15 / 4, carbs: kcal * 0.45 / 4, fat: kcal * 0.40 / 9 }]);
          await setChoice(cid, date, ch => { ch.__rep = Object.assign({}, ch.__rep || {}, { [meal.id]: { l: 'Evento social: ' + lbl } }); ch.__ev = { meal: meal.id, l: lbl, kcal }; });
          const extra = kcal - planned;
          if ($('#ev-c').checked && extra > 50) {
            const maxPct = (num(S.settings.event_max_pct) || 15) / 100;
            for (let i = 1; i <= 3; i++) { const d = addDays(date, i); const k = Math.round(Math.min(extra / 3, num(planForDate(full, d).kcal) * maxPct)); await setChoice(cid, d, ch => { ch.__cmp = { k, from: date, l: lbl }; }); }
          }
          closeModal(); toast('Evento guardado'); after();
        }
      }
    });
  };
  draw();
}

/* ---------- otras actividades (suman a la carga y al gasto del día) ---------- */
const ACT_KINDS = [['Partido', 'Partido de tenis', 8], ['Práctica', 'Práctica de tenis', 7], ['Carrera', 'Carrera', 9], ['Bicicleta', 'Bicicleta', 7], ['Clase grupal', 'Clase grupal', 6.5], ['Natación', 'Natación', 7], ['Caminata', 'Caminata rápida', 4.3], ['Fútbol', 'Fútbol', 8], ['Otro deporte', 'Otro deporte', 6]];
const actMet = kind => (ACT_KINDS.find(k => k[0] === kind) || [0, 0, 6])[2];
function activityModal(cid, date, after) {
  if (S.needsV6) return toast('Requiere la migración v6', 'error');
  modal(`${modalHead('Registrar actividad')}<p class="small muted">Actividades fuera de la rutina: suman a tu carga semanal y al gasto del día.</p>
    <label class="field"><span>Actividad</span><select class="input" id="ac-k">${ACT_KINDS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
    <div class="rex-grid two"><label><span>Minutos</span><input class="input" id="ac-m" inputmode="numeric" value="60"></label><label><span>Esfuerzo 0–10</span><input class="input" id="ac-r" inputmode="numeric" value="6"></label></div>
    <label class="field"><span>Nota (opcional)</span><input class="input" id="ac-n"></label>
    <button class="btn primary block" data-act="acOk">Guardar</button>`, {
    click: { acOk: async () => { const mi = Math.round(num($('#ac-m').value)), rpe = Math.round(num($('#ac-r').value)); if (!(mi > 0) || rpe < 0 || rpe > 10) return toast('Revisa los minutos y el esfuerzo', 'error'); await DB.insert('tennis_sessions', { client_id: cid, log_date: date, kind: $('#ac-k').value, minutes: mi, rpe, notes: $('#ac-n').value.trim() || null }); closeModal(); toast('Actividad registrada'); after(); } }
  });
}

/* ---------- siguiente comida ---------- */
function nextMealCardHtml(meals) {
  const now = nowMin(); const list = meals.filter(o => o.pending > 0 && !o.rep);
  if (!list.length) return '';
  const nx = list.find(o => { const t = hm2min(o.m.time_label); return t != null && t >= now - 45; }) || list[0];
  const t = hm2min(nx.m.time_label); const dif = t != null ? t - now : null;
  return `<div class="card next-meal"><div class="meal-h"><div><small class="muted">Siguiente comida</small><h3>${esc(nx.m.name)}${nx.m.time_label ? ' · ' + esc(nx.m.time_label) : ''}</h3><small class="muted">${dif != null ? (dif > 0 ? `En ${dif >= 60 ? Math.floor(dif / 60) + ' h ' : ''}${dif % 60} min · ` : 'Ahora · ') : ''}${fmtInt(nx.kcal)} kcal · ${nx.pending} ${nx.pending === 1 ? 'alimento' : 'alimentos'}</small></div></div>
    <div class="row-btns"><button class="btn sm primary" data-act="all" data-meal="${nx.mk}">Marcar todo</button><a class="btn sm" href="#meal-${nx.mk}" data-act="goMeal" data-meal="${nx.mk}">Ver</a><button class="btn sm" data-act="more" data-meal="${nx.mk}">Copiar o cambiar</button></div></div>`;
}

/* ---------- recorrido inicial ---------- */
const TOUR = [
  ['Tu día', 'Arriba ves el tipo de día (por ejemplo A, B o C) con sus metas de calorías y macronutrientes. Cambia según tu entrenamiento y las fechas especiales del plan.'],
  ['Marca lo que comes', 'Toca ✓ en cada alimento o «Marcar todo» en la comida. Con «Más» copias otra comida, repites lo de ayer, usas una comida guardada o ajustas la porción.'],
  ['Reemplazos', 'Toca un alimento o ⇄ para cambiarlo por un equivalente con la misma cantidad del nutriente principal.'],
  ['Mi plan y hábitos', 'En «Mi plan» está tu informe completo, tus metas y las preguntas de tu entrenador. Los hábitos del día se marcan aquí en Hoy.']];
function tourModal(key) {
  let i = 0;
  const draw = () => modal(`<div class="tour"><small class="muted">${i + 1} de ${TOUR.length}</small><h3>${esc(TOUR[i][0])}</h3><p>${esc(TOUR[i][1])}</p>
    <div class="row-btns">${i ? '<button class="btn" data-act="tPrev">Anterior</button>' : '<button class="btn" data-act="tEnd">Omitir</button>'}<button class="btn primary" data-act="${i === TOUR.length - 1 ? 'tEnd' : 'tNext'}">${i === TOUR.length - 1 ? 'Empezar' : 'Siguiente'}</button></div></div>`, {
    click: { tPrev: () => { i--; draw(); }, tNext: () => { i++; draw(); }, tEnd: () => { lsSet(key, '1'); closeModal(); } }
  });
  draw();
}

/* ---------- resumen semanal (domingo y lunes) ---------- */
async function weeklyCardHtml(cid, full) {
  const dow = new Date().getDay(); if (dow !== 0 && dow !== 1) return '';
  const end = dow === 0 ? todayStr() : addDays(todayStr(), -1); const start = addDays(end, -6);
  const key = 'dp_week_' + end; if (lsGet(key, '') === 'x') return '';
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const q = (t, o) => DB.select(t, o).catch(() => []);
  const [logs, dailies, ws, bodies] = await Promise.all([q('food_logs', { eq: { client_id: cid }, gte: { log_date: start } }), q('daily_logs', { eq: { client_id: cid }, gte: { log_date: start } }), q('workouts', { eq: { client_id: cid }, gte: { started_at: parseDay(start).toISOString() } }), q('body_logs', { eq: { client_id: cid }, order: 'log_date' })]);
  const inW = d => d >= start && d <= end;
  const logged = dates.filter(d => logs.some(l => l.log_date === d));
  const comps = full ? logged.map(d => dayCompletion(full, logs.filter(l => l.log_date === d), dailies.find(x => x.log_date === d), d)).filter(v => v != null) : [];
  const comp = comps.length ? Math.round(comps.reduce((a, b) => a + b, 0) / comps.length) : 0;
  const rep = typeof activeCasePlan === 'function' ? await activeCasePlan(cid, true) : null; const hs = (rep && rep.data.habits) || [];
  const hp = hs.map(h => habitPct(h, dailies, dates)).filter(v => v != null); const hab = hp.length ? Math.round(hp.reduce((a, b) => a + b, 0) / hp.length) : null;
  const w = bodies.filter(b => num(b.weight_kg)); const w1 = w.filter(b => inW(b.log_date)).pop(); const w0 = w.filter(b => b.log_date < start).pop();
  const nextTypes = {}; if (full && hasDayTypes(full)) for (let i = 1; i <= 7; i++) { const v = planForDate(full, addDays(end, i)); const k = v.day_code || dayLabel(v); nextTypes[k] = (nextTypes[k] || 0) + 1; }
  const bars = [{ label: 'Días con registro', value: logged.length / 7 * 100, text: `${logged.length}/7` }, { label: 'Cumplimiento del plan', value: comp, text: comp + ' %' }];
  if (hab != null) bars.push({ label: 'Hábitos', value: hab, text: hab + ' %' });
  bars.push({ label: 'Sesiones de entrenamiento', value: Math.min(100, ws.filter(x => inW(dateStr(new Date(x.started_at)))).length / 5 * 100), text: String(ws.filter(x => inW(dateStr(new Date(x.started_at)))).length) });
  return `<div class="card week-sum"><div class="meal-h"><h3>Tu semana · ${esc(fmtDM(parseDay(start)))} a ${esc(fmtDM(parseDay(end)))}</h3><button class="icon-btn" data-act="weekX" data-k="${key}" aria-label="Cerrar">✕</button></div>
    <div class="gbars">${bars.map(b => `<div class="gb-row"><div class="gb-h"><b>${esc(b.label)}</b><span>${esc(b.text)}</span></div><div class="hb-t"><div class="hb-f" style="width:${Math.max(2, Math.min(100, b.value)).toFixed(1)}%"></div></div></div>`).join('')}</div>
    ${w1 && w0 ? `<p class="small">Peso: ${fmtN(w0.weight_kg)} → ${fmtN(w1.weight_kg)} kg (${num(w1.weight_kg) - num(w0.weight_kg) > 0 ? '+' : ''}${fmtN(num(w1.weight_kg) - num(w0.weight_kg))} kg).</p>` : ''}
    ${Object.keys(nextTypes).length ? `<p class="small">Próxima semana: ${Object.entries(nextTypes).map(([k, n]) => `${esc(k)} × ${n}`).join(' · ')}. <a href="#/semana">Ver la semana</a></p>` : ''}</div>`;
}

/* ---------- semana del plan ---------- */
async function vSemana() {
  const cid = S.profile.id; const full = await activePlanFor(cid);
  if (!full) return paint('<div class="card empty"><p>No tienes un plan nutricional activo.</p></div>', {}, 'Semana');
  let h = `<p class="small muted">Tipo de día, metas y opción que corresponde a cada comida en los próximos 7 días.</p>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(todayStr(), i); const v = planForDate(full, d); const ov = dayOverride(full, d);
    h += `<a class="card row-link wk-day" href="#/hoy/${d}"><div><b>${esc(fmtDayLong(d))}</b><small class="muted">${hasDayTypes(full) ? esc(dayLabel(v)) + ' · ' : ''}${fmtInt(num(v.kcal))} kcal · P ${fmtInt(num(v.protein_g))} · C ${fmtInt(num(v.carbs_g))} · G ${fmtInt(num(v.fat_g))}${ov && ov.n ? ' · ' + esc(ov.n) : ''}</small>
      <small>${v.meals.filter(m => m.options.length > 1 && m.options.some(o => (o.weekdays || []).length)).map(m => `${esc(m.name)}: ${esc(defaultOption(m, d).name)}`).join(' · ')}</small></div><span class="chev">›</span></a>`;
  }
  h += `<div class="row-btns"><a class="btn" href="#/compras/${full.id}/lote">Preparación en lote</a><a class="btn" href="#/compras/${full.id}">Lista de compras</a></div>`;
  paint(h, {}, 'Semana');
}

/* ---------- preparación en lote ---------- */
const COOKABLE = ['Proteínas', 'Cereales y tubérculos', 'Leguminosas', 'Verduras'];
async function vLote(id) {
  const plan = await loadPlanFull(id); if (!plan) return paint('<div class="card empty"><p>Plan no encontrado.</p></div>');
  const per = WEEKDAYS.slice(1).concat('Domingo');
  let days = []; try { days = JSON.parse(lsGet('dp_lote_days', '["Domingo","Miércoles"]')); } catch (e) { days = ['Domingo', 'Miércoles']; }
  const start = todayStr(); const dates = Array.from({ length: 10 }, (_, i) => addDays(start, i));
  const isBatch = d => days.includes(WEEKDAYS[parseDay(d).getDay()]);
  const sessions = [];
  for (let i = 0; i < 7; i++) { const d = dates[i]; if (!isBatch(d)) continue; let j = i + 1; while (j < dates.length && !isBatch(dates[j])) j++; sessions.push({ d, cover: dates.slice(i, Math.min(j, i + 4)) }); }
  const rot = m => m.options.some(o => (o.weekdays || []).length);
  let h = `<div class="chips no-print"><a class="chip" href="#/compras/${id}">Mercado</a><a class="chip on" href="#/compras/${id}/lote">Preparación en lote</a></div>
    <div class="field"><span>Días de preparación</span><div class="chips">${per.map(dn => `<button class="chip${days.includes(dn) ? ' on' : ''}" data-act="lDay" data-v="${dn}">${dn.slice(0, 3)}</button>`).join('')}</div></div>
    <p class="small muted">Cantidades para cocinar en cada preparación, según el tipo de día y la rotación de cada fecha (máximo 4 días por preparación, por conservación). Peso en crudo aproximado para lo que el plan indica cocido.</p>`;
  if (!sessions.length) h += '<div class="card empty"><p>Elige al menos un día de preparación.</p></div>';
  for (const s of sessions) {
    const agg = {};
    for (const d of s.cover) { const v = planForDate(plan, d); v.meals.forEach(m => { const os = rot(m) ? [defaultOption(m, d)].filter(o => o && o.items.length) : m.options.filter(o => o.items.length); os.forEach(o => o.items.forEach(i => { const f = foodOf(i.food_id); if (!f || !COOKABLE.includes(f.category) || (f.category === 'Verduras' && !/cocid/i.test(f.name)) || (f.category === 'Proteínas' && !/cocid|cocinad|asad/i.test(f.name) && !/huevo/i.test(f.name))) return; agg[f.id] = (agg[f.id] || 0) + num(i.grams) / os.length; })); }); }
    const rows = Object.entries(agg).map(([fid, g]) => { const f = foodOf(fid); const rfac = /cocid/i.test(f.name) ? (RAW_FACTORS.find(([k]) => f.name.includes(k)) || [])[1] : null; return { f, g, raw: rfac ? g * rfac : null }; }).sort((a, b) => a.f.category.localeCompare(b.f.category) || a.f.name.localeCompare(b.f.name, 'es'));
    h += `<div class="card"><h3>${esc(fmtDayLong(s.d))}</h3><p class="small muted">Para ${s.cover.map(d => WEEKDAYS[parseDay(d).getDay()].toLowerCase()).join(', ')}.</p>
      ${rows.length ? `<table class="tbl"><thead><tr><th>Alimento</th><th>Cocido</th><th>Crudo</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.f.name.replace(/\s*cocid[oa]s?/i, ''))}</td><td>${/huevo/i.test(r.f.name) && num(r.f.unit_grams) ? Math.ceil(r.g / num(r.f.unit_grams)) + ' u' : fmtInt(Math.round(r.g / 10) * 10) + ' g'}</td><td>${r.raw ? fmtInt(Math.round(r.raw / 10) * 10) + ' g' : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">Sin alimentos para cocinar en esos días.</p>'}</div>`;
  }
  h += '<div class="row-btns no-print"><button class="btn" data-act="print">Imprimir / PDF</button></div>';
  paint(h, { click: { print: () => window.print(), lDay: el => { const v = el.dataset.v; days = days.includes(v) ? days.filter(x => x !== v) : days.concat(v); lsSet('dp_lote_days', JSON.stringify(days)); vLote(id); } } }, 'Preparación en lote');
}

/* ---------- modo cocina (pantalla encendida y temporizadores) ---------- */
let wakeLock = null;
async function cookMode(title, steps) {
  let i = 0, timer = null, left = 0;
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { }
  const stopT = () => { clearInterval(timer); timer = null; };
  const draw = () => {
    const m = steps[i].match(/(\d+)\s*(?:a\s*\d+\s*)?min/i);
    modal(`${modalHead('Modo cocina · ' + title)}<div class="cook"><small class="muted">Paso ${i + 1} de ${steps.length}</small><p class="cook-s">${esc(steps[i])}</p>
      ${m ? `<button class="btn block" data-act="cT" data-m="${m[1]}">${timer ? 'Temporizador: <b id="ck-t">' + fmtClock(left * 1000) + '</b> · detener' : 'Temporizador de ' + m[1] + ' min'}</button>` : ''}
      <div class="row-btns"><button class="btn" data-act="cP" ${i ? '' : 'disabled'}>Anterior</button><button class="btn primary" data-act="${i === steps.length - 1 ? 'cE' : 'cN'}">${i === steps.length - 1 ? 'Terminar' : 'Siguiente'}</button></div></div>`, {
      click: {
        cP: () => { i--; draw(); }, cN: () => { i++; draw(); }, cE: () => { stopT(); try { wakeLock && wakeLock.release(); } catch (e) { } closeModal(); },
        cT: el => { if (timer) { stopT(); return draw(); } left = num(el.dataset.m) * 60; timer = setInterval(() => { left--; const t = $('#ck-t'); if (t) t.textContent = fmtClock(left * 1000); if (left <= 0) { stopT(); try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) { } toast('Tiempo cumplido: ' + steps[i].slice(0, 60)); draw(); } }, 1000); draw(); }
      }
    });
  };
  draw();
}

/* ---------- modo competencia ---------- */
async function competitionToday(cid) {
  if (typeof tournamentsOf !== 'function') return null;
  const t0 = todayStr(), t1 = addDays(t0, 1);
  return (await tournamentsOf(cid)).find(x => (x.start_date <= t1 && (x.end_date || x.start_date) >= t0)) || null;
}
function protocolSteps(rep) {
  const s = rep && ((rep.data || {}).sections || []).find(x => /protocolo.*(competencia|partido|torneo|prueba)|d[ií]a de (la )?competencia/i.test(x.title || ''));
  if (!s) return null;
  return String(s.content).split(/\n|\s\/\/\s/).map(x => x.trim()).filter(Boolean);
}
function stepOffset(txt) {
  const n = nrm(txt);
  let m = n.match(/(\d+(?:[.,]\d+)?)\s*(?:[–-]\s*(\d+(?:[.,]\d+)?))?\s*(h|hora|horas|min|minutos)\s*antes/);
  if (m) { const v = num(m[2] || m[1]); return -(/^h/.test(m[3]) ? v * 60 : v); }
  if (/^durante/.test(n)) return 0;
  if (/^despues|^al terminar/.test(n)) return null;
  return undefined;
}
async function vCompetencia(tid) {
  const cid = S.profile.id; const ts = typeof tournamentsOf === 'function' ? await tournamentsOf(cid) : [];
  const t = ts.find(x => x.id === tid) || await competitionToday(cid);
  if (!t) return paint('<div class="card empty"><p>No hay una competencia hoy ni mañana.</p></div>', {}, 'Modo competencia');
  const rep = typeof activeCasePlan === 'function' ? (await casesOf(cid)).filter(r => r.visible).map(clientCase)[0] : null;
  const steps = protocolSteps(rep) || ['3–4 h antes: comida principal alta en carbohidratos, baja en grasa y fibra, con 400–500 ml de agua', '60 min antes: refrigerio con carbohidratos de fácil digestión', 'Durante: agua o bebida con carbohidratos según el protocolo de tu plan', 'Después: comida de recuperación dentro de la primera hora'];
  const key = 'dp_comp_' + t.id; const start = lsGet(key, '');
  const smin = hm2min(start);
  const rows = steps.map(s => { const off = stepOffset(s); const at = smin != null && off != null && off !== undefined ? smin + off : null; return { s, at, off }; });
  const fmt = mm => `${String(Math.floor(((mm % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((mm % 60) + 60) % 60).padStart(2, '0')}`;
  const date = t.start_date > todayStr() ? t.start_date : todayStr();
  paint(`<div class="card"><h3>${esc(t.name)}</h3><p class="small muted">${esc(fmtDayLong(date))}${t.city ? ' · ' + esc(t.city) : ''}</p>
      <label class="field"><span>Hora de inicio de tu prueba o partido</span><input class="input" type="time" id="cp-h" value="${esc(start)}"></label></div>
    <div class="card"><h3>Protocolo del día</h3>${rows.map(r => `<div class="tl-row"><b>${r.at != null ? fmt(r.at) : r.off === 0 ? 'Inicio' : r.off === null ? 'Al terminar' : '—'}</b><span>${esc(r.s)}</span></div>`).join('')}
      ${smin == null ? '<p class="small muted">Escribe la hora de inicio para ver la hora de cada paso.</p>' : ''}</div>
    ${smin != null ? '<button class="btn primary block" data-act="cpIcs">Agregar alarmas al calendario</button>' : ''}
    <p class="small muted">El protocolo sale de tu plan integral. Si cambia la hora de inicio, actualízala aquí.</p>`, {
    change: el => { if (el.id === 'cp-h') { lsSet(key, el.value); vCompetencia(t.id); } },
    click: {
      cpIcs: () => {
        const ev = rows.filter(r => r.at != null).map((r, i) => { const hh = fmt(r.at); return ['BEGIN:VEVENT', `UID:${t.id}-${i}@deucepoint`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${icsLocal(date, hh)}`, `DURATION:PT15M`, icsFold('SUMMARY:' + icsEsc(r.s.slice(0, 60))), icsFold('DESCRIPTION:' + icsEsc(r.s)), 'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(t.name), 'END:VALARM', 'END:VEVENT'].join('\r\n'); });
        downloadFile(docSafe('Protocolo ' + t.name) + '.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${BRAND.name}//Competencia//ES`, 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
      }
    }
  }, 'Modo competencia');
}

/* ---------- acciones que llegan desde una notificación (#/hoy?a=…) ---------- */
async function runNavAct(x) {
  const a = S.navAct; S.navAct = null; if (!a) return false;
  if (a === 'agua250') { await upsertDaily(x.cid, x.date, { water_ml: x.water + 250 }); toast('+250 ml de agua'); return true; }
  if (a.startsWith('comida:')) {
    const n = decodeURIComponent(a.slice(7)); const o = x.meals.find(v => v.m.name === n); if (!o) return false;
    for (const it of o.planned) if (!o.logs.some(l => l.plan_item_id === it.plan_item_id)) await insertLogRows(x.cid, x.date, o.m, [it]);
    toast(n + ' registrada'); return true;
  }
  if (a.startsWith('supp:')) { const k = a.slice(5); const ex = (await DB.select('supplement_logs', { eq: { client_id: x.cid, log_date: x.date, supp_key: k } }))[0]; if (!ex) await DB.insert('supplement_logs', { client_id: x.cid, log_date: x.date, supp_key: k }); toast('Suplemento registrado'); return true; }
  return false;
}
