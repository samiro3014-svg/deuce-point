'use strict';
/* =====================================================================
   App de entrenamiento · lógica principal
   - Con SUPABASE_URL y SUPABASE_ANON_KEY en config.js usa la base de datos real.
   - Sin ellas funciona en MODO DEMO (datos guardados solo en este dispositivo).
   ===================================================================== */

const CFG = window.APP_CONFIG || {};
const BRAND = Object.assign({ name: 'Tu Marca', short: 'TM', tagline: 'Entrenamiento personalizado', primary: '#E4572E', logo: '' }, CFG.BRAND || {});
const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
const MUSCLES = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Core', 'Antebrazo', 'Potencia', 'Manguito rotador'];
let sb = null;
const S = { profile: null, exercises: [], exById: {}, tick: null };

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const view = () => document.getElementById('view');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const r1 = n => Math.round(n * 10) / 10;
const fmtN = n => r1(num(n)).toLocaleString('es-CO');
const fmtKg = n => Math.round(num(n)).toLocaleString('es-CO') + ' kg';
const fmtDate = d => new Date(d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDM = d => { const x = new Date(d); return x.getDate() + '/' + (x.getMonth() + 1); };
const fmtDateShort = d => new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const e1rm = (w, r) => (w > 0 && r > 0) ? (r === 1 ? w : w * (1 + Math.min(r, 12) / 30)) : 0;
const firstName = s => String(s || '').trim().split(/\s+/)[0] || '';
function fmtClock(ms) { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
function fmtDur(ms) { const m = Math.round(ms / 60000); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; }
function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (e && e.code === '23503') return 'No se puede eliminar: el elemento está en uso en planes, rutinas o registros.';
  if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  return m;
}
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
}
async function safe(fn) { try { await fn(); } catch (err) { console.error(err); toast(errMsg(err), 'error'); } }

/* =====================================================================
   Capa de datos (Supabase o demo local)
   ===================================================================== */
const DEMO_KEY = 'dp_demo_db_v3';
let demoData = null;
function dd() {
  if (demoData) return demoData;
  try { const s = localStorage.getItem(DEMO_KEY); if (s) demoData = JSON.parse(s); } catch (e) { }
  if (!demoData) { demoData = buildDemoData(); saveDemo(); }
  return demoData;
}
function saveDemo() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demoData)); } catch (e) { } }
function matchRow(row, o) {
  for (const [k, v] of Object.entries(o.eq || {})) if (row[k] !== v) return false;
  for (const [k, v] of Object.entries(o.inn || {})) if (!v.includes(row[k])) return false;
  for (const [k, v] of Object.entries(o.gte || {})) if (!(row[k] >= v)) return false;
  return true;
}
const CASCADE = {
  routines: [['routine_days', 'routine_id']], routine_days: [['routine_exercises', 'day_id']], workouts: [['workout_sets', 'workout_id']],
  nutrition_plans: [['plan_meals', 'plan_id']], plan_meals: [['plan_options', 'meal_id']], plan_options: [['plan_items', 'option_id']],
  profiles: [['routines', 'client_id'], ['workouts', 'client_id'], ['nutrition_plans', 'client_id'], ['food_logs', 'client_id'], ['daily_logs', 'client_id'], ['body_logs', 'client_id'], ['intakes', 'client_id'], ['checkins', 'client_id'], ['progress_photos', 'client_id'], ['photo_vaults', 'owner_id'], ['memberships', 'client_id'], ['reports', 'client_id']]
};
const RESTRICT = { exercises: [['routine_exercises', 'exercise_id'], ['workout_sets', 'exercise_id']], foods: [['plan_items', 'food_id']] };
function cascadeDelete(d, table, id) {
  if ((RESTRICT[table] || []).some(([t, k]) => (d[t] || []).some(r => r[k] === id))) {
    const e = new Error('No se puede eliminar: el elemento está en uso en planes, rutinas o registros.'); e.code = '23503'; throw e;
  }
  if (table === 'foods') (d.food_logs || []).forEach(l => { if (l.food_id === id) l.food_id = null; });
  for (const [t, k] of CASCADE[table] || []) for (const r of (d[t] || []).filter(x => x[k] === id)) cascadeDelete(d, t, r.id);
  d[table] = (d[table] || []).filter(x => x.id !== id);
}

const DB = {
  async select(table, o = {}) {
    if (o.inn && Object.values(o.inn).some(a => !a.length)) return [];
    if (DEMO) {
      let rows = (dd()[table] || []).filter(r => matchRow(r, o)).map(r => ({ ...r }));
      if (o.order) { const k = o.order, dir = o.asc === false ? -1 : 1; rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); }
      if (o.limit) rows = rows.slice(0, o.limit);
      return rows;
    }
    let q = sb.from(table).select('*');
    for (const [k, v] of Object.entries(o.eq || {})) q = q.eq(k, v);
    for (const [k, v] of Object.entries(o.inn || {})) q = q.in(k, v);
    for (const [k, v] of Object.entries(o.gte || {})) q = q.gte(k, v);
    if (o.order) q = q.order(o.order, { ascending: o.asc !== false });
    if (o.limit) q = q.limit(o.limit);
    const { data, error } = await q; if (error) throw error; return data || [];
  },
  async insert(table, rows) {
    const arr = Array.isArray(rows) ? rows : [rows]; if (!arr.length) return [];
    if (DEMO) {
      const d = dd(); d[table] = d[table] || [];
      const out = arr.map(r => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
      d[table].push(...out); saveDemo(); return out.map(r => ({ ...r }));
    }
    const { data, error } = await sb.from(table).insert(arr).select(); if (error) throw error; return data;
  },
  async update(table, id, patch, key = 'id') {
    if (DEMO) { const r = (dd()[table] || []).find(x => x[key] === id); if (r) Object.assign(r, patch); saveDemo(); return r ? { ...r } : null; }
    const { data, error } = await sb.from(table).update(patch).eq(key, id).select(); if (error) throw error; return data && data[0];
  },
  async remove(table, id, key = 'id') {
    if (DEMO) { if (key === 'id') cascadeDelete(dd(), table, id); else dd()[table] = (dd()[table] || []).filter(x => x[key] !== id); saveDemo(); return; }
    const { error } = await sb.from(table).delete().eq(key, id); if (error) throw error;
  },
  async rpc(name, args = {}) {
    const { data, error } = await sb.rpc(name, args); if (error) throw error; return data || [];
  }
};

const Auth = {
  async session() {
    if (DEMO) { const id = localStorage.getItem('ent_demo_user'); return id ? { user: { id } } : null; }
    const { data } = await sb.auth.getSession(); return data.session;
  },
  async signIn(email, pw) { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; },
  async signUp(email, pw, name) {
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { full_name: name }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error; return data;
  },
  async reset(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; },
  async signOut() {
    // Borra de la memoria las llaves de fotos y las imágenes descifradas
    Object.values(S.photoCache || {}).forEach(u => URL.revokeObjectURL(u));
    Object.assign(S, { photoKey: null, photoRaw: null, coachPriv: null, clientKeys: {}, photoCache: {}, cmp: {}, intake: null, needsIntake: false });
    if (DEMO) localStorage.removeItem('ent_demo_user'); else await sb.auth.signOut();
  }
};

/* =====================================================================
   Datos de demostración
   ===================================================================== */
function buildDemoData() {
  const d = { profiles: [], exercises: [], routines: [], routine_days: [], routine_exercises: [], workouts: [], workout_sets: [] };
  const now = new Date();
  for (const f of (window.SEED_FAMILIES || [])) for (const [name, equipment] of f.x)
    d.exercises.push({ id: uid(), name, muscle_group: f.g, family: f.f, equipment, instructions: '', video_url: '', created_at: now.toISOString() });
  const ex = n => { const e = d.exercises.find(x => x.name === n); if (!e) throw new Error('Falta ejercicio demo: ' + n); return e.id; };
  d.profiles.push(
    { id: 'demo-coach', email: 'entrenador@demo.app', full_name: 'Entrenador (demo)', role: 'coach', goal: '', created_at: now.toISOString() },
    { id: 'demo-ana', email: 'ana@demo.app', full_name: 'Ana Torres', role: 'client', goal: 'Tenista juvenil · fuerza y potencia para la temporada', created_at: now.toISOString() },
    { id: 'demo-juan', email: 'juan@demo.app', full_name: 'Juan Pérez', role: 'client', goal: 'Recomposición corporal · reducir grasa y ganar masa muscular', created_at: now.toISOString() });

  const plans = [
    { client: 'demo-ana', name: 'Fuerza para tenis · Fase 1', notes: 'Tres sesiones por semana. Calentamiento de 10 minutos antes de cada sesión.', days: [
      ['Día A · Tren inferior', [['Sentadilla trasera con barra', 4, '6-8', '2', 150, 60], ['Peso muerto rumano con barra', 3, '8-10', '2', 120, 60], ['Sentadilla búlgara', 3, '8-10', '2', 90, 14], ['Curl femoral tumbado', 3, '10-12', '1', 75, 30], ['Elevación de talones de pie en máquina', 3, '12-15', '1', 60, 50], ['Pallof press', 3, '10-12', '', 45, 10]]],
      ['Día B · Tren superior', [['Press de banca con mancuernas', 4, '6-8', '2', 120, 18], ['Remo con mancuerna a una mano', 4, '8-10', '2', 90, 20], ['Press de hombro con mancuernas', 3, '8-10', '2', 90, 12], ['Jalón al pecho agarre neutro', 3, '10-12', '2', 75, 40], ['Rotación externa en polea', 3, '12-15', '2', 45, 5], ['Curl de muñeca con mancuerna', 2, '15', '2', 45, 8]]],
      ['Día C · Potencia y core', [['Salto al cajón', 4, '4', '', 90, 0], ['Lanzamiento lateral con balón medicinal', 4, '6', '', 75, 4], ['Kettlebell swing', 3, '10', '', 60, 16], ['Hip thrust con barra', 3, '8-10', '2', 90, 70], ['Plancha lateral', 3, '30', '', 45, 0], ['Rueda abdominal', 3, '8-10', '2', 60, 0]]]] },
    { client: 'demo-juan', name: 'Recomposición · Fase 1', notes: 'Dos sesiones de cuerpo completo y 8.000 pasos diarios.', days: [
      ['Día 1 · Cuerpo completo A', [['Prensa de piernas', 3, '10-12', '2', 90, 100], ['Press de pecho en máquina', 3, '10-12', '2', 90, 35], ['Remo sentado en polea', 3, '10-12', '2', 90, 40], ['Elevaciones laterales con mancuernas', 3, '12-15', '1', 60, 6], ['Plancha frontal', 3, '30', '', 45, 0]]],
      ['Día 2 · Cuerpo completo B', [['Peso muerto rumano con mancuernas', 3, '10-12', '2', 90, 16], ['Jalón al pecho agarre abierto', 3, '10-12', '2', 90, 40], ['Press inclinado con mancuernas', 3, '10-12', '2', 90, 14], ['Curl femoral sentado', 3, '12-15', '1', 60, 30], ['Crunch en polea', 3, '12-15', '1', 45, 25]]]] }];

  for (const p of plans) {
    const rid = uid();
    d.routines.push({ id: rid, client_id: p.client, name: p.name, notes: p.notes, active: true, created_at: new Date(now - 25 * 864e5).toISOString() });
    p.days.forEach(([dname, items], di) => {
      const did = uid();
      d.routine_days.push({ id: did, routine_id: rid, name: dname, position: di, created_at: now.toISOString() });
      items.forEach(([n, sets, reps, rir, rest], i) => d.routine_exercises.push({ id: uid(), day_id: did, exercise_id: ex(n), position: i, sets, reps, rir, rest_seconds: rest, notes: '', created_at: now.toISOString() }));
    });
    // historial de ejemplo
    const schedule = p.client === 'demo-ana' ? [20, 18, 16, 13, 11, 9, 6, 4, 2] : [19, 15, 12, 8, 5, 1];
    schedule.forEach((ago, si) => {
      const di = si % p.days.length; const [dname, items] = p.days[di];
      const dayRow = d.routine_days.filter(x => x.routine_id === rid)[di];
      const week = Math.floor((schedule[0] - ago) / 7);
      const start = new Date(now); start.setDate(start.getDate() - ago); start.setHours(7, 0, 0, 0);
      const end = new Date(start.getTime() + (55 + si % 3 * 8) * 60000);
      const wid = uid(); let vol = 0;
      items.forEach(([n, sets, reps, , , base], ei) => {
        const reps0 = parseInt(reps, 10) || 10; const w = base ? Math.round(base * (1 + 0.05 * week) * 2) / 2 : 0;
        for (let s = 1; s <= sets; s++) {
          const r = Math.max(1, reps0 + (s === sets ? 0 : 1) - (s > 2 ? 1 : 0));
          vol += w * r;
          d.workout_sets.push({ id: uid(), workout_id: wid, client_id: p.client, exercise_id: ex(n), routine_exercise_id: null, exercise_order: ei, set_number: s, weight_kg: w, reps: r, rir: 2, created_at: end.toISOString() });
        }
      });
      d.workouts.push({ id: wid, client_id: p.client, routine_id: rid, day_id: dayRow.id, day_name: dname, started_at: start.toISOString(), finished_at: end.toISOString(), total_volume: r1(vol), notes: '', created_at: end.toISOString() });
    });
  }
  if (window.buildNutritionDemo) buildNutritionDemo(d);
  if (window.buildAutoDemo) buildAutoDemo(d);
  return d;
}

/* =====================================================================
   Arranque, sesión y navegación
   ===================================================================== */
function applyBrand() {
  document.documentElement.style.setProperty('--brand', BRAND.primary);
  if (BRAND.accent) document.documentElement.style.setProperty('--accent', BRAND.accent);
  document.title = BRAND.name;
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = '#ffffff';
  const logoHtml = BRAND.logo ? `<img src="${esc(BRAND.logo)}" alt="">` : `<span>${esc(BRAND.short || BRAND.name.slice(0, 2))}</span>`;
  document.querySelectorAll('.logo').forEach(el => { el.innerHTML = logoHtml; el.classList.toggle('has-img', !!BRAND.logo); });
  document.querySelectorAll('.brand-name').forEach(el => { el.textContent = BRAND.name; });
}

async function boot() {
  applyBrand();
  if (!DEMO) {
    S.recovery = /type=recovery/.test(location.hash);
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') { S.recovery = true; renderRecovery(); return; }
      if (event === 'SIGNED_IN' && !S.profile && !S.recovery) afterAuth();
    });
  }
  window.addEventListener('hashchange', route);
  await afterAuth();
}

/* Pantalla para definir una nueva contraseña (enlace de recuperación recibido por correo) */
function renderRecovery() {
  document.body.classList.remove('authed');
  document.getElementById('nav').innerHTML = '';
  const m = view();
  m.innerHTML = `<div class="login">
    ${BRAND.logoFull ? `<img class="login-logo" src="${esc(BRAND.logoFull)}" alt="${esc(BRAND.name)}">` : '<div class="logo big"></div>'}
    <div class="card"><h2>Nueva contraseña</h2>
      <form id="rec-form">
        <label class="field"><span>Nueva contraseña</span><input class="input" name="pw" type="password" required minlength="6" autocomplete="new-password"></label>
        <label class="field"><span>Confirmar contraseña</span><input class="input" name="pw2" type="password" required minlength="6" autocomplete="new-password"></label>
        <button class="btn primary block" type="submit">Guardar contraseña</button>
      </form></div></div>`;
  applyBrand();
  m.onclick = m.oninput = m.onchange = null;
  m.onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (f.get('pw') !== f.get('pw2')) return toast('Las contraseñas no coinciden', 'error');
    safe(async () => {
      const { error } = await sb.auth.updateUser({ password: f.get('pw') });
      if (error) throw error;
      S.recovery = false; m.onsubmit = null;
      history.replaceState(null, '', location.pathname + '#/');
      toast('Contraseña actualizada');
      await afterAuth();
    });
  };
}

async function afterAuth() {
  try {
    const s = await Auth.session();
    if (S.recovery && s) return renderRecovery();
    if (!s) { S.profile = null; document.body.classList.remove('authed'); return renderLogin(); }
    const p = await DB.select('profiles', { eq: { id: s.user.id } });
    if (!p[0]) { renderNotice('No se encontró tu perfil. Verifica que el archivo schema.sql se ejecutó completo en Supabase.'); return; }
    S.profile = p[0];
    await Promise.all([loadExercises(), loadFoods(), loadSettings()]);
    S.needsIntake = false; S.intake = null;
    if (S.profile.role === 'client' && !S.needsMigration) {
      S.intake = (await DB.select('intakes', { eq: { client_id: S.profile.id } }))[0] || null;
      if (!S.intake) {
        const [np, rt] = await Promise.all([DB.select('nutrition_plans', { eq: { client_id: S.profile.id }, limit: 1 }), DB.select('routines', { eq: { client_id: S.profile.id }, limit: 1 })]);
        S.needsIntake = !np.length && !rt.length;
      }
    }
    document.body.classList.add('authed');
    renderNav();
    route();
  } catch (e) { renderNotice(errMsg(e)); }
}

async function loadExercises() {
  S.exercises = await DB.select('exercises', { order: 'name' });
  S.exercises.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  S.exById = Object.fromEntries(S.exercises.map(e => [e.id, e]));
}
const exName = id => (S.exById[id] || {}).name || 'Ejercicio eliminado';
const exGroup = id => (S.exById[id] || {}).muscle_group || 'Otro';

const ICON = {
  plan: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  hist: '<path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/>',
  prog: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .7 3.2 2.3 3.8 5"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  hoy: '<path d="M12 8c-1.2-1.8-3.4-2.6-5.4-1.6C3.8 7.8 3.6 12.3 5.6 16c1.3 2.5 3 4.3 4.5 3.9.8-.2 1.2-.6 1.9-.6s1.1.4 1.9.6c1.5.4 3.2-1.4 4.5-3.9 2-3.7 1.8-8.2-1-9.6-2-1-4.2-.2-5.4 1.6z"/><path d="M12 8c0-2 .8-3.6 2.8-4.6"/>',
  dumb: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  tpl: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

function renderNav() {
  const items = S.profile.role === 'coach'
    ? [['asesorados', 'Asesorados', 'users'], ['plantillas', 'Plantillas', 'tpl'], ['biblioteca', 'Biblioteca', 'book'], ['perfil', 'Perfil', 'user']]
    : [['hoy', 'Hoy', 'hoy'], ['plan', 'Entreno', 'dumb'], ['historial', 'Progreso', 'prog'], ['perfil', 'Perfil', 'user']];
  document.getElementById('nav').innerHTML = items.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${svg(i)}<span>${l}</span></a>`).join('');
  document.getElementById('demo-flag').hidden = !DEMO;
}

function setActiveNav(name) {
  const coach = S.profile.role === 'coach';
  const map = coach
    ? { '': 'asesorados', asesorado: 'asesorados', rutina: 'asesorados', resumen: 'asesorados', diario: 'asesorados', 'plan-nutri': 'asesorados', 'plan-ver': 'asesorados', compras: 'asesorados', ajustes: 'asesorados', informe: 'asesorados', ejercicio: 'biblioteca', alimentos: 'biblioteca', alimento: 'biblioteca', videos: 'biblioteca' }
    : { '': 'hoy', entreno: 'plan', resumen: 'historial', progreso: 'historial', cuerpo: 'historial', adherencia: 'historial', fotos: 'historial', 'plan-ver': 'hoy', compras: 'hoy', checkin: 'hoy', valoracion: 'perfil', informe: 'perfil', informes: 'perfil', recordatorios: 'perfil' };
  const key = map[name] ?? name;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === key));
  const pill = document.getElementById('live-pill');
  pill.hidden = !(S.profile.role === 'client' && getDraft() && name !== 'entreno');
}

async function route() {
  if (!S.profile) return;
  clearInterval(S.tick); S.tick = null; closeModal();
  document.body.classList.remove('onboarding');
  const parts = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  const [name = '', a, b, c] = /^(access_token|type|error)/.test(parts[0] || '') ? [] : parts;
  setActiveNav(name);
  window.scrollTo(0, 0);
  view().innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
  const coach = S.profile.role === 'coach';
  try {
    if (coach) {
      if (name === 'asesorado') return await vAsesorado(a, b || 'rutinas', c);
      if (name === 'rutina') return await vRutina(a);
      if (name === 'plantillas') return await vPlantillas();
      if (name === 'biblioteca') return vBiblioteca();
      if (name === 'ejercicio') return vEjercicio(a);
      if (name === 'alimentos') return vAlimentos();
      if (name === 'alimento') return vAlimento(a);
      if (name === 'plan-nutri') return await vPlanEditor(a);
      if (name === 'plan-ver') return await vPlanDoc(a);
      if (name === 'compras') return await vCompras(a, b);
      if (name === 'diario') return await vHoy(b, a);
      if (name === 'resumen') return await vResumen(a);
      if (name === 'ajustes') return await vAjustes();
      if (name === 'informe') return await vInforme(a, b, c);
      if (name === 'videos') return vVideos();
      if (name === 'perfil') return vPerfil();
      return await vAsesorados();
    }
    if (S.needsIntake && name !== 'perfil') return vOnboarding();
    if (name === 'plan') return await vPlan();
    if (name === 'valoracion') return await vMiValoracion();
    if (name === 'checkin') return await vCheckin();
    if (name === 'fotos') return await vFotos();
    if (name === 'informe') return await vInforme(a, b, c);
    if (name === 'informes') return await vMisInformes();
    if (name === 'recordatorios') return await vRecordatorios();
    if (name === 'entreno') return vEntreno();
    if (name === 'historial') return paint(progSeg('historial') + await historialHtml(S.profile.id), {}, 'Progreso');
    if (name === 'progreso') return await vProgreso(S.profile.id, '#/progreso', a, 'Progreso', progSeg('progreso'));
    if (name === 'cuerpo') return await vCuerpo();
    if (name === 'adherencia') return await vAdherencia();
    if (name === 'plan-ver') return await vPlanDoc(a);
    if (name === 'compras') return await vCompras(a, b);
    if (name === 'resumen') return await vResumen(a);
    if (name === 'perfil') return vPerfil();
    return await vHoy(name === 'hoy' ? a : null);
  } catch (e) { console.error(e); paint(`<div class="card"><p>${esc(errMsg(e))}</p><button class="btn" onclick="route()">Reintentar</button></div>`); }
}

/* ---------- pintado de vistas y delegación de eventos ---------- */
function paint(html, h = {}, title) {
  const m = view();
  m.innerHTML = (title ? `<h1 class="vt">${esc(title)}</h1>` : '') + html;
  m.onsubmit = null;
  m.onclick = h.click ? ev => { const el = ev.target.closest('[data-act]'); if (!el || !m.contains(el)) return; const fn = h.click[el.dataset.act]; if (fn) { ev.preventDefault(); safe(() => fn(el, ev)); } } : null;
  m.oninput = h.input ? ev => safe(() => h.input(ev.target, ev)) : null;
  m.onchange = h.change ? ev => safe(() => h.change(ev.target, ev)) : null;
}
function renderNotice(msg) { document.getElementById('view').innerHTML = `<div class="card"><p>${esc(msg)}</p><button class="btn" onclick="Auth.signOut().then(()=>location.reload())">Salir</button></div>`; }

function modal(html, h = {}) {
  const w = document.getElementById('modal');
  w.innerHTML = `<div class="modal-bg" data-close></div><div class="modal-card">${html}</div>`;
  w.hidden = false; document.body.classList.add('noscroll');
  w.onclick = ev => {
    if (ev.target.closest('[data-close]')) return closeModal();
    const el = ev.target.closest('[data-act]'); if (el && h.click && h.click[el.dataset.act]) { ev.preventDefault(); safe(() => h.click[el.dataset.act](el, ev)); }
  };
  w.oninput = h.input ? ev => h.input(ev.target) : null;
  w.onchange = h.change ? ev => h.change(ev.target) : null;
}
function closeModal() { const w = document.getElementById('modal'); if (!w) return; w.hidden = true; w.innerHTML = ''; document.body.classList.remove('noscroll'); }
const modalHead = t => `<div class="modal-h"><h3>${esc(t)}</h3><button class="x" data-close aria-label="Cerrar">✕</button></div>`;

/* ---------- gráficos de barras ---------- */
function hbars(items, empty = 'Sin datos todavía.') {
  if (!items.length) return `<p class="muted small">${esc(empty)}</p>`;
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="hbars">${items.map(i => `<div class="hb-row"><span class="hb-l">${esc(i.label)}</span><div class="hb-t"><div class="hb-f" style="width:${Math.max(2, i.value / max * 100).toFixed(1)}%"></div></div><span class="hb-v">${esc(i.text ?? i.value)}</span></div>`).join('')}</div>`;
}
/* floor: valor desde el que inicia el eje (útil para peso corporal, donde las diferencias son pequeñas) */
function vbars(items, empty = 'Sin datos todavía.', floor = 0) {
  if (!items.some(i => i.value > 0)) return `<p class="muted small">${esc(empty)}</p>`;
  const max = Math.max(floor + 1, ...items.map(i => i.value));
  return `<div class="vbars${items.length > 10 ? ' dense' : ''}">${items.map(i => `<div class="vb-col"><span class="vb-v">${esc(i.text ?? i.value)}</span><div class="vb-t"><div class="vb-f${i.hi ? ' hi' : ''}" style="height:${(i.value > 0 ? Math.max(3, (i.value - floor) / (max - floor) * 100) : 0).toFixed(1)}%"></div></div><span class="vb-l">${esc(i.label)}</span></div>`).join('')}</div>`;
}

/* =====================================================================
   Login
   ===================================================================== */
function renderLogin() {
  document.getElementById('nav').innerHTML = '';
  const m = view();
  if (DEMO) {
    m.innerHTML = `<div class="login">
      ${BRAND.logoFull ? `<img class="login-logo" src="${esc(BRAND.logoFull)}" alt="${esc(BRAND.name)}">` : '<div class="logo big"></div>'}<h1 class="brand-name"></h1><p class="muted">${esc(BRAND.tagline)}</p>
      <div class="card"><p class="small"><b>Modo demostración.</b> Los datos se guardan solo en este dispositivo. Para usar la app con tus asesorados, conecta Supabase en <code>config.js</code>.</p>
      <button class="btn primary block" data-demo="demo-coach">Entrar como entrenador</button>
      <button class="btn block" data-demo="demo-ana">Entrar como asesorada (Ana)</button>
      <button class="btn block" data-demo="demo-juan">Entrar como asesorado (Juan)</button>
      <button class="btn block" data-demo="demo-laura">Entrar como asesorada nueva (Laura · valoración inicial)</button></div></div>`;
    applyBrand();
    m.onclick = ev => { const b = ev.target.closest('[data-demo]'); if (b) { localStorage.setItem('ent_demo_user', b.dataset.demo); afterAuth(); } };
    m.oninput = m.onchange = null;
    return;
  }
  let mode = 'in';
  const draw = () => {
    m.innerHTML = `<div class="login">
      ${BRAND.logoFull ? `<img class="login-logo" src="${esc(BRAND.logoFull)}" alt="${esc(BRAND.name)}">` : '<div class="logo big"></div>'}<h1 class="brand-name"></h1><p class="muted">${esc(BRAND.tagline)}</p>
      <div class="card">
        <div class="seg"><button class="${mode === 'in' ? 'on' : ''}" data-mode="in">Iniciar sesión</button><button class="${mode === 'up' ? 'on' : ''}" data-mode="up">Crear cuenta</button></div>
        <form id="auth-form">
          ${mode === 'up' ? '<label class="field"><span>Nombre completo</span><input class="input" name="name" required autocomplete="name"></label>' : ''}
          <label class="field"><span>Correo</span><input class="input" name="email" type="email" required autocomplete="email"></label>
          <label class="field"><span>Contraseña</span><input class="input" name="pw" type="password" required minlength="6" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}"></label>
          <button class="btn primary block" type="submit">${mode === 'up' ? 'Crear cuenta' : 'Entrar'}</button>
        </form>
        ${mode === 'in' ? '<button class="linkbtn" data-forgot>¿Olvidaste tu contraseña?</button>' : ''}
      </div></div>`;
    applyBrand();
  };
  draw();
  m.onclick = ev => {
    const md = ev.target.closest('[data-mode]'); if (md) { mode = md.dataset.mode; draw(); return; }
    if (ev.target.closest('[data-forgot]')) {
      const email = $('#auth-form [name=email]').value.trim();
      if (!email) return toast('Escribe tu correo primero', 'error');
      safe(async () => { await Auth.reset(email); toast('Te enviamos un correo para restablecer la contraseña'); });
    }
  };
  m.onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target); const email = f.get('email').trim(), pw = f.get('pw');
    safe(async () => {
      if (mode === 'up') {
        const r = await Auth.signUp(email, pw, f.get('name').trim());
        if (r.session) return afterAuth();
        m.innerHTML = `<div class="login"><div class="card"><h2>Revisa tu correo</h2><p>Enviamos un enlace de confirmación a <b>${esc(email)}</b>. Después de confirmarlo, vuelve aquí e inicia sesión.</p><button class="btn block" onclick="location.reload()">Volver</button></div></div>`;
      } else { await Auth.signIn(email, pw); await afterAuth(); }
    });
  };
}

/* =====================================================================
   ASESORADO · Mi plan
   ===================================================================== */
const draftKey = () => 'ent_draft_' + (S.profile && S.profile.id);
function getDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { return null; } }
function saveDraft(d) { localStorage.setItem(draftKey(), JSON.stringify(d)); }
function clearDraft() { localStorage.removeItem(draftKey()); }

async function vPlan() {
  const cid = S.profile.id;
  const routines = await DB.select('routines', { eq: { client_id: cid, active: true }, order: 'created_at', asc: false });
  const days = await DB.select('routine_days', { inn: { routine_id: routines.map(r => r.id) }, order: 'position' });
  const rex = await DB.select('routine_exercises', { inn: { day_id: days.map(d => d.id) }, order: 'position' });
  const recent = await DB.select('workouts', { eq: { client_id: cid }, order: 'started_at', asc: false, limit: 20 });
  const draft = getDraft();
  const lastByDay = {}; recent.forEach(w => { if (w.day_id && !lastByDay[w.day_id]) lastByDay[w.day_id] = w; });
  const weekStart = startOfWeek(new Date()).toISOString();
  const thisWeek = recent.filter(w => w.started_at >= weekStart);

  let html = '';
  if (draft) html += `<div class="card live"><div><b>Sesión en curso</b><div class="small">${esc(draft.day_name || 'Sesión libre')} · iniciada ${new Date(draft.started_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div></div><a class="btn primary" href="#/entreno">Continuar</a></div>`;
  html += `<div class="stats3"><div><b>${thisWeek.length}</b><small>Sesiones esta semana</small></div><div><b>${fmtKg(thisWeek.reduce((a, w) => a + num(w.total_volume), 0))}</b><small>Volumen semanal</small></div><div><b>${recent.length ? fmtDateShort(recent[0].started_at) : '—'}</b><small>Última sesión</small></div></div>`;

  if (!routines.length) html += S.intake && S.intake.status === 'pending'
    ? `<div class="card empty"><p>Tu entrenador está revisando tu valoración y tu rutina.</p><p class="small muted">Cuando la apruebe aparecerá aquí con tus días de entrenamiento.</p></div>`
    : `<div class="card empty"><p>Tu entrenador todavía no te ha asignado una rutina.</p><p class="small muted">Cuando la asigne aparecerá aquí con tus días de entrenamiento.</p></div>`;
  for (const r of routines) {
    html += `<h2 class="sec">${esc(r.name)}</h2>${r.notes ? `<p class="note">${esc(r.notes)}</p>` : ''}`;
    for (const d of days.filter(x => x.routine_id === r.id)) {
      const items = rex.filter(x => x.day_id === d.id);
      const last = lastByDay[d.id];
      html += `<div class="card day">
        <div class="day-h"><div><h3>${esc(d.name)}</h3><small class="muted">${items.length} ejercicios${last ? ' · última vez ' + fmtDateShort(last.started_at) : ''}</small></div>
        <button class="btn primary" data-act="start" data-id="${d.id}">Iniciar</button></div>
        <ul class="ex-list">${items.map(i => `<li><span>${esc(exName(i.exercise_id))}</span><small>${i.sets || '-'} × ${esc(i.reps || '-')}${i.rir ? ' · RIR ' + esc(i.rir) : ''}</small></li>`).join('')}</ul></div>`;
    }
  }
  html += `<button class="btn ghost block" data-act="free">Iniciar sesión libre</button>`;
  paint(html, { click: { start: el => startWorkout(el.dataset.id), free: () => startWorkout(null) } }, 'Entreno');
}

async function startWorkout(dayId) {
  if (getDraft() && !confirm('Ya tienes una sesión en curso. ¿Descartarla e iniciar una nueva?')) return;
  let draft = { id: uid(), client_id: S.profile.id, routine_id: null, day_id: null, day_name: 'Sesión libre', started_at: new Date().toISOString(), notes: '', exercises: [] };
  if (dayId) {
    const day = (await DB.select('routine_days', { eq: { id: dayId } }))[0];
    const rex = await DB.select('routine_exercises', { eq: { day_id: dayId }, order: 'position' });
    draft = Object.assign(draft, { routine_id: day.routine_id, day_id: day.id, day_name: day.name });
    draft.exercises = rex.map(r => ({
      key: uid(), rex_id: r.id, exercise_id: r.exercise_id, original_id: r.exercise_id,
      target: { sets: r.sets, reps: r.reps, rir: r.rir, rest: r.rest_seconds, notes: r.notes },
      sets: Array.from({ length: Math.max(1, r.sets || 1) }, () => ({ w: '', r: '', rir: '', done: false }))
    }));
    await attachPrevious(draft.exercises);
  }
  saveDraft(draft);
  location.hash = '#/entreno';
}

async function attachPrevious(list) {
  const ids = [...new Set(list.map(e => e.exercise_id))];
  const sets = await DB.select('workout_sets', { eq: { client_id: S.profile.id }, inn: { exercise_id: ids }, order: 'created_at', asc: false, limit: 600 });
  for (const e of list) {
    const mine = sets.filter(s => s.exercise_id === e.exercise_id);
    if (!mine.length) { e.prev = []; continue; }
    const wid = mine[0].workout_id;
    e.prev = mine.filter(s => s.workout_id === wid).sort((a, b) => a.set_number - b.set_number).map(s => ({ w: num(s.weight_kg), r: s.reps }));
  }
}

/* =====================================================================
   ASESORADO · Sesión en curso
   ===================================================================== */
function draftStats(d) {
  let vol = 0, sets = 0;
  d.exercises.forEach(e => e.sets.forEach(s => { if (s.done) { sets++; vol += num(s.w) * num(s.r); } }));
  return { vol, sets };
}
function updateWkStats() {
  const d = getDraft(); if (!d) return;
  const st = draftStats(d);
  const v = $('#wk-vol'), s = $('#wk-sets'), t = $('#wk-time');
  if (v) v.textContent = fmtKg(st.vol); if (s) s.textContent = st.sets;
  if (t) t.textContent = fmtClock(Date.now() - new Date(d.started_at));
}

function exCard(e, ei) {
  const ex = S.exById[e.exercise_id] || { name: 'Ejercicio eliminado', muscle_group: '' };
  const orig = e.original_id && e.original_id !== e.exercise_id ? S.exById[e.original_id] : null;
  const t = e.target || {};
  const tline = [t.sets ? `${t.sets} × ${t.reps || '-'}` : '', t.rir ? `RIR ${t.rir}` : '', t.rest ? `Descanso ${t.rest} s` : ''].filter(Boolean).join(' · ');
  const doneCount = e.sets.filter(s => s.done).length;
  const hint = typeof progressionHint === 'function' ? progressionHint(e) : null;
  return `<div class="card ex-card${doneCount && doneCount === e.sets.length ? ' complete' : ''}">
    <div class="ex-title"><button class="link-title" data-act="info" data-id="${esc(e.exercise_id)}">${esc(ex.name)}</button>${ex.video_url ? `<button class="vid-btn" data-act="info" data-id="${esc(e.exercise_id)}" aria-label="Ver video de la técnica">▶ Técnica</button>` : ''}<span class="tag">${esc(ex.muscle_group)}</span></div>
    ${orig ? `<div class="swapped">Sustituye a: ${esc(orig.name)}</div>` : ''}
    ${tline ? `<div class="target">Objetivo: ${esc(tline)}</div>` : ''}
    ${hint ? `<div class="hint${hint.up ? ' up' : ''}">${esc(hint.text)}</div>` : ''}
    ${t.notes ? `<div class="note">${esc(t.notes)}</div>` : ''}
    <div class="set-grid set-head"><span>Serie</span><span>Anterior</span><span>${ex.muscle_group === 'Cardio' ? '—' : 'kg'}</span><span>${ex.muscle_group === 'Cardio' ? 'Min' : ex.muscle_group === 'Movilidad' ? 'Reps/s' : 'Reps'}</span><span>RIR</span><span></span></div>
    ${e.sets.map((s, si) => {
      const p = (e.prev || [])[si];
      return `<div class="set-grid set-row${s.done ? ' done' : ''}">
        <span class="set-n">${si + 1}</span>
        <span class="prev">${p ? `${fmtN(p.w)} × ${p.r}` : '—'}</span>
        <input inputmode="decimal" data-ei="${ei}" data-si="${si}" data-f="w" value="${esc(s.w)}" placeholder="${hint ? esc(fmtN(hint.w)) : p ? esc(fmtN(p.w)) : '0'}" aria-label="Kilos serie ${si + 1}">
        <input inputmode="numeric" data-ei="${ei}" data-si="${si}" data-f="r" value="${esc(s.r)}" placeholder="${p ? esc(p.r) : esc(String(t.reps || '').split('-')[0])}" aria-label="Repeticiones serie ${si + 1}">
        <input inputmode="decimal" data-ei="${ei}" data-si="${si}" data-f="rir" value="${esc(s.rir)}" placeholder="${esc(t.rir || '')}" aria-label="RIR serie ${si + 1}">
        <button class="chk" data-act="check" data-ei="${ei}" data-si="${si}" aria-label="Completar serie ${si + 1}">✓</button>
      </div>`;
    }).join('')}
    <div class="ex-actions">
      <button class="btn sm" data-act="addSet" data-ei="${ei}">+ Serie</button>
      <button class="btn sm" data-act="delSet" data-ei="${ei}">− Serie</button>
      <button class="btn sm accent" data-act="swap" data-ei="${ei}">Variantes</button>
      <button class="btn sm" data-act="removeEx" data-ei="${ei}" aria-label="Quitar ejercicio">Quitar</button>
    </div>
  </div>`;
}

function vEntreno() {
  const d = getDraft();
  if (!d) { location.hash = '#/plan'; return; }
  const html = `
    <div class="wk-head">
      <div class="wk-stats"><span><b id="wk-time">0:00</b><small>Duración</small></span><span><b id="wk-vol">0 kg</b><small>Volumen</small></span><span><b id="wk-sets">0</b><small>Series</small></span></div>
      <button class="btn primary" data-act="finish">Finalizar</button>
    </div>
    <p class="muted day-name">${esc(d.day_name || 'Sesión libre')}</p>
    ${d.exercises.length ? d.exercises.map(exCard).join('') : '<div class="card empty"><p>Añade ejercicios para empezar a registrar.</p></div>'}
    <button class="btn ghost block" data-act="addEx">+ Añadir ejercicio</button>
    <label class="field"><span>Notas de la sesión</span><textarea class="input" data-wnote rows="2" placeholder="Sensaciones, molestias u observaciones para tu entrenador">${esc(d.notes || '')}</textarea></label>
    <button class="btn danger-outline block" data-act="discard">Descartar sesión</button>`;

  const mut = fn => { const dr = getDraft(); fn(dr); saveDraft(dr); vEntreno(); };
  paint(html, {
    click: {
      check: el => {
        const dr = getDraft(); const e = dr.exercises[+el.dataset.ei]; const si = +el.dataset.si; const s = e.sets[si];
        if (s.done) { s.done = false; }
        else {
          const p = (e.prev || [])[si];
          const hint = typeof progressionHint === 'function' ? progressionHint(e) : null;
          if (s.w === '' && hint) s.w = String(hint.w);
          else if (s.w === '' && p) s.w = String(p.w);
          if (s.r === '' && p) s.r = String(p.r);
          if (s.r === '' || num(s.r) <= 0) { toast('Indica las repeticiones de la serie', 'error'); return; }
          if (s.w === '') s.w = '0';
          s.done = true;
          startRest(num(e.target && e.target.rest) || 90);
        }
        saveDraft(dr); vEntreno();
      },
      addSet: el => mut(dr => { const e = dr.exercises[+el.dataset.ei]; const last = e.sets[e.sets.length - 1] || {}; e.sets.push({ w: last.w || '', r: '', rir: '', done: false }); }),
      delSet: el => { const dr = getDraft(); const e = dr.exercises[+el.dataset.ei]; if (e.sets.length <= 1) return; if (e.sets[e.sets.length - 1].done && !confirm('La última serie ya está completada. ¿Eliminarla?')) return; e.sets.pop(); saveDraft(dr); vEntreno(); },
      removeEx: el => { if (!confirm('¿Quitar este ejercicio de la sesión?')) return; mut(dr => dr.exercises.splice(+el.dataset.ei, 1)); },
      swap: el => swapModal(+el.dataset.ei),
      info: el => exInfoModal(el.dataset.id),
      addEx: () => pickExercise('Añadir ejercicio', async id => {
        const dr = getDraft();
        const e = { key: uid(), rex_id: null, exercise_id: id, original_id: id, target: {}, extra: true, sets: [0, 1, 2].map(() => ({ w: '', r: '', rir: '', done: false })) };
        await attachPrevious([e]); dr.exercises.push(e); saveDraft(dr); vEntreno();
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50);
      }),
      finish: finishWorkout,
      discard: () => { if (!confirm('¿Descartar la sesión? Las series registradas no se guardarán.')) return; clearDraft(); stopRest(); location.hash = '#/plan'; }
    },
    input: t => {
      const dr = getDraft(); if (!dr) return;
      if (t.dataset.f) { dr.exercises[+t.dataset.ei].sets[+t.dataset.si][t.dataset.f] = t.value; }
      else if ('wnote' in t.dataset) dr.notes = t.value;
      saveDraft(dr); updateWkStats();
    }
  });
  updateWkStats();
  clearInterval(S.tick); S.tick = setInterval(updateWkStats, 1000);
}

function swapModal(ei) {
  const d = getDraft(); const e = d.exercises[ei];
  const base = S.exById[e.original_id] || S.exById[e.exercise_id];
  const fam = base && base.family;
  const alts = S.exercises.filter(x => fam && x.family === fam && x.id !== e.exercise_id);
  const choose = async id => {
    const dr = getDraft(); const ex = dr.exercises[ei];
    ex.exercise_id = id; await attachPrevious([ex]); saveDraft(dr); closeModal(); vEntreno();
    toast('Ejercicio sustituido');
  };
  modal(`${modalHead('Variantes')}
    <p class="small muted">Si la máquina está ocupada o no está disponible, elige una variante que trabaje el mismo patrón${fam ? ` (${esc(fam)})` : ''}.</p>
    ${e.original_id !== e.exercise_id ? `<button class="pick-item orig" data-act="pick" data-id="${esc(e.original_id)}"><b>Volver al original: ${esc(exName(e.original_id))}</b></button>` : ''}
    <div class="pick-list">${alts.map(x => `<button class="pick-item" data-act="pick" data-id="${x.id}"><b>${esc(x.name)}</b><small>${esc(x.equipment || '')}</small></button>`).join('') || '<p class="muted small">Este ejercicio no tiene variantes registradas.</p>'}</div>
    <button class="btn block" data-act="lib">Buscar en toda la biblioteca</button>`, {
    click: { pick: el => choose(el.dataset.id), lib: () => pickExercise('Sustituir por…', choose, { group: base && base.muscle_group }) }
  });
}

function exInfoModal(id) {
  const e = S.exById[id]; if (!e) return;
  const alts = S.exercises.filter(x => e.family && x.family === e.family && x.id !== e.id);
  modal(`${modalHead(e.name)}
    <div class="chips"><span class="tag">${esc(e.muscle_group)}</span>${e.equipment ? `<span class="tag">${esc(e.equipment)}</span>` : ''}</div>
    ${e.video_url && typeof videoEmbed === 'function' ? videoEmbed(e.video_url) : ''}
    ${e.instructions ? `<p class="pre">${esc(e.instructions)}</p>` : (e.video_url ? '' : '<p class="muted small">Sin indicaciones técnicas registradas.</p>')}
    ${e.video_url ? `<a class="btn block" href="${esc(e.video_url)}" target="_blank" rel="noopener">Abrir el video en otra ventana</a>` : ''}
    ${alts.length ? `<h4>Variantes</h4><ul class="plain">${alts.map(a => `<li>${esc(a.name)} <small class="muted">${esc(a.equipment || '')}</small></li>`).join('')}</ul>` : ''}`);
}

function pickExercise(title, onPick, opts = {}) {
  let q = '', g = opts.group || '';
  const groups = [...new Set([...MUSCLES, ...S.exercises.map(e => e.muscle_group)])];
  const renderList = () => {
    const ql = norm(q);
    const list = S.exercises.filter(e => (!g || e.muscle_group === g) && (!ql || norm(e.name + ' ' + (e.equipment || '') + ' ' + (e.family || '')).includes(ql))).slice(0, 250);
    $('#pk-list').innerHTML = list.map(e => `<button class="pick-item" data-act="pick" data-id="${e.id}"><b>${esc(e.name)}</b><small>${esc(e.muscle_group)} · ${esc(e.equipment || '')}</small></button>`).join('') || '<p class="muted small">Sin resultados.</p>';
  };
  modal(`${modalHead(title)}
    <input class="input" id="pk-q" placeholder="Buscar ejercicio" autocomplete="off">
    <select class="input" id="pk-g"><option value="">Todos los grupos musculares</option>${groups.map(x => `<option${x === g ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
    <div id="pk-list" class="pick-list tall"></div>`, {
    click: { pick: el => { closeModal(); onPick(el.dataset.id); } },
    input: t => { if (t.id === 'pk-q') { q = t.value; renderList(); } },
    change: t => { if (t.id === 'pk-g') { g = t.value; renderList(); } }
  });
  renderList();
}

async function finishWorkout() {
  const d = getDraft();
  const done = d.exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  if (!done) { if (confirm('No hay series completadas. ¿Descartar la sesión?')) { clearDraft(); stopRest(); location.hash = '#/plan'; } return; }
  const pending = d.exercises.reduce((a, e) => a + e.sets.filter(s => !s.done).length, 0);
  if (!confirm(`¿Finalizar la sesión con ${done} series completadas?${pending ? `\n${pending} series sin marcar no se guardarán.` : ''}`)) return;
  const btn = $('[data-act=finish]'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const { vol } = draftStats(d);
    const [w] = await DB.insert('workouts', { client_id: d.client_id, routine_id: d.routine_id, day_id: d.day_id, day_name: d.day_name, started_at: d.started_at, finished_at: new Date().toISOString(), total_volume: r1(vol), notes: d.notes || null });
    const rows = [];
    d.exercises.forEach((e, ei) => { let n = 0; e.sets.forEach(s => { if (!s.done) return; n++; rows.push({ workout_id: w.id, client_id: d.client_id, exercise_id: e.exercise_id, routine_exercise_id: e.rex_id || null, exercise_order: ei, set_number: n, weight_kg: num(s.w), reps: Math.round(num(s.r)), rir: s.rir === '' ? null : num(s.rir) }); }); });
    try { await DB.insert('workout_sets', rows); }
    catch (err) { await DB.remove('workouts', w.id).catch(() => { }); throw err; }
    clearDraft(); stopRest();
    location.hash = '#/resumen/' + w.id;
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Finalizar'; }
    toast('No se pudo guardar. La sesión sigue en este dispositivo; inténtalo de nuevo. (' + errMsg(err) + ')', 'error');
  }
}

/* ---------- temporizador de descanso ---------- */
const Rest = { end: 0, total: 0, int: null, ctx: null };
function startRest(sec) {
  Rest.total = sec; Rest.end = Date.now() + sec * 1000;
  try { Rest.ctx = Rest.ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
  document.getElementById('rest').hidden = false;
  clearInterval(Rest.int); Rest.int = setInterval(tickRest, 250); tickRest();
}
function tickRest() {
  const left = Math.max(0, Math.ceil((Rest.end - Date.now()) / 1000));
  $('#rest-time').textContent = fmtClock(left * 1000);
  $('#rest-bar').style.width = (Rest.total ? left / Rest.total * 100 : 0) + '%';
  if (left <= 0) { stopRest(); beep(); if (navigator.vibrate) navigator.vibrate([250, 120, 250]); toast('Descanso finalizado'); }
}
function stopRest() { clearInterval(Rest.int); Rest.int = null; const r = document.getElementById('rest'); if (r) r.hidden = true; }
function beep() {
  try { const c = Rest.ctx; if (!c) return; [0, 0.25].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.2); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.21); }); } catch (e) { }
}
function restAdjust(s) { Rest.end += s * 1000; Rest.total = Math.max(Rest.total + s, 1); tickRest(); }

/* =====================================================================
   Resumen de sesión
   ===================================================================== */
async function vResumen(id) {
  const w = (await DB.select('workouts', { eq: { id } }))[0];
  if (!w) return paint('<div class="card"><p>Sesión no encontrada.</p></div>');
  const sets = (await DB.select('workout_sets', { eq: { workout_id: id } })).sort((a, b) => a.exercise_order - b.exercise_order || a.set_number - b.set_number);
  const exIds = [...new Set(sets.map(s => s.exercise_id))];
  const prior = (await DB.select('workout_sets', { eq: { client_id: w.client_id }, inn: { exercise_id: exIds }, order: 'created_at', asc: false, limit: 1000 })).filter(s => s.workout_id !== id && s.created_at < (sets[0] ? sets[0].created_at : w.finished_at));
  let client = null;
  if (S.profile.role === 'coach') client = (await DB.select('profiles', { eq: { id: w.client_id } }))[0];

  const vol = sets.reduce((a, s) => a + num(s.weight_kg) * s.reps, 0);
  const reps = sets.reduce((a, s) => a + s.reps, 0);
  const byMuscle = {};
  sets.forEach(s => { const g = exGroup(s.exercise_id); byMuscle[g] = byMuscle[g] || { vol: 0, sets: 0 }; byMuscle[g].vol += num(s.weight_kg) * s.reps; byMuscle[g].sets++; });
  const prs = [];
  const exCards = exIds.map(eid => {
    const ss = sets.filter(s => s.exercise_id === eid);
    const best = Math.max(...ss.map(s => e1rm(num(s.weight_kg), s.reps)));
    const maxW = Math.max(...ss.map(s => num(s.weight_kg)));
    const pp = prior.filter(s => s.exercise_id === eid);
    if (pp.length) {
      const pBest = Math.max(...pp.map(s => e1rm(num(s.weight_kg), s.reps)));
      const pMaxW = Math.max(...pp.map(s => num(s.weight_kg)));
      if (best > pBest + 0.01 && best > 0) prs.push(`${exName(eid)}: 1RM estimado ${fmtN(best)} kg (anterior ${fmtN(pBest)} kg)`);
      else if (maxW > pMaxW && maxW > 0) prs.push(`${exName(eid)}: peso máximo ${fmtN(maxW)} kg (anterior ${fmtN(pMaxW)} kg)`);
    }
    return `<div class="card"><div class="ex-title"><b>${esc(exName(eid))}</b><span class="tag">${esc(exGroup(eid))}</span></div>
      <table class="tbl"><thead><tr><th>Serie</th><th>Kg</th><th>Reps</th><th>RIR</th><th>Volumen</th></tr></thead><tbody>
      ${ss.map(s => `<tr><td>${s.set_number}</td><td>${fmtN(s.weight_kg)}</td><td>${s.reps}</td><td>${s.rir ?? '—'}</td><td>${fmtN(num(s.weight_kg) * s.reps)}</td></tr>`).join('')}
      </tbody></table>${best ? `<p class="small muted">1RM estimado (Epley): ${fmtN(best)} kg</p>` : ''}</div>`;
  }).join('');

  const html = `
    <p class="muted">${esc(client ? client.full_name + ' · ' : '')}${esc(w.day_name || 'Sesión libre')} · ${fmtDate(w.started_at)}</p>
    <div class="stats3"><div><b>${fmtKg(vol)}</b><small>Volumen total</small></div><div><b>${sets.length}</b><small>Series</small></div><div><b>${w.finished_at ? fmtDur(new Date(w.finished_at) - new Date(w.started_at)) : '—'}</b><small>Duración</small></div></div>
    <p class="small muted center">${reps} repeticiones totales</p>
    ${prs.length ? `<div class="card pr"><h3>Nuevos récords</h3><ul class="plain">${prs.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><h3>Volumen por grupo muscular (kg)</h3>${hbars(Object.entries(byMuscle).sort((a, b) => b[1].vol - a[1].vol).map(([g, v]) => ({ label: g, value: v.vol, text: fmtKg(v.vol) })))}</div>
    <div class="card"><h3>Series por grupo muscular</h3>${hbars(Object.entries(byMuscle).sort((a, b) => b[1].sets - a[1].sets).map(([g, v]) => ({ label: g, value: v.sets, text: v.sets + ' series' })))}</div>
    ${w.notes ? `<div class="card"><h3>Notas</h3><p class="pre">${esc(w.notes)}</p></div>` : ''}
    ${exCards}
    <div class="row-btns"><button class="btn" data-act="back">Volver</button>${S.profile.role === 'coach' || w.client_id === S.profile.id ? '<button class="btn danger-outline" data-act="del">Eliminar sesión</button>' : ''}</div>`;
  paint(html, {
    click: {
      back: () => { if (S.profile.role === 'coach') location.hash = '#/asesorado/' + w.client_id + '/historial'; else location.hash = '#/historial'; },
      del: async () => { if (!confirm('¿Eliminar esta sesión y todas sus series? Esta acción no se puede deshacer.')) return; await DB.remove('workouts', id); toast('Sesión eliminada'); history.back(); }
    }
  }, 'Resumen de la sesión');
}

/* =====================================================================
   Historial y volumen (asesorado o entrenador)
   ===================================================================== */
async function historialHtml(cid) {
  const weeks = []; const w0 = startOfWeek(new Date());
  for (let i = 7; i >= 0; i--) { const s = new Date(w0); s.setDate(s.getDate() - 7 * i); weeks.push({ start: s, value: 0, n: 0 }); }
  const since = weeks[0].start.toISOString();
  const ws = await DB.select('workouts', { eq: { client_id: cid }, order: 'started_at', asc: false, limit: 80 });
  const recentWs = await DB.select('workouts', { eq: { client_id: cid }, gte: { started_at: since } });
  recentWs.forEach(w => { const t = new Date(w.started_at); for (let i = weeks.length - 1; i >= 0; i--) if (t >= weeks[i].start) { weeks[i].value += num(w.total_volume); weeks[i].n++; break; } });
  const weekSets = await DB.select('workout_sets', { eq: { client_id: cid }, gte: { created_at: w0.toISOString() } });
  const byMuscle = {}; weekSets.forEach(s => { const g = exGroup(s.exercise_id); byMuscle[g] = (byMuscle[g] || 0) + 1; });

  return `
    <div class="card"><h3>Volumen semanal (kg)</h3>${vbars(weeks.map((w, i) => ({ label: fmtDM(w.start), value: w.value, text: w.value >= 1000 ? r1(w.value / 1000) + 't' : Math.round(w.value), hi: i === weeks.length - 1 })), 'Aún no hay sesiones registradas.')}
      <p class="small muted">Suma de kg × repeticiones de todas las series completadas, por semana (lunes a domingo).</p></div>
    <div class="card"><h3>Sesiones por semana</h3>${vbars(weeks.map((w, i) => ({ label: fmtDM(w.start), value: w.n, text: w.n, hi: i === weeks.length - 1 })), 'Aún no hay sesiones registradas.')}</div>
    <div class="card"><h3>Series por grupo muscular · esta semana</h3>${hbars(Object.entries(byMuscle).sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ label: g, value: n, text: n + ' series' })), 'Sin series registradas esta semana.')}</div>
    <h2 class="sec">Sesiones</h2>
    ${ws.length ? ws.map(w => `<a class="card row-link" href="#/resumen/${w.id}"><div><b>${esc(w.day_name || 'Sesión libre')}</b><small class="muted">${fmtDate(w.started_at)}${w.finished_at ? ' · ' + fmtDur(new Date(w.finished_at) - new Date(w.started_at)) : ''}</small></div><span class="kpi">${fmtKg(w.total_volume)}</span></a>`).join('') : '<p class="muted">Sin sesiones registradas.</p>'}`;
}
async function vHistorial(cid, base, title) { paint(await historialHtml(cid), {}, title); }

/* =====================================================================
   Progreso por ejercicio y récords
   ===================================================================== */
async function progresoHtml(cid, base, exId) {
  if (!exId) {
    const sets = await DB.select('workout_sets', { eq: { client_id: cid }, order: 'created_at', asc: false, limit: 5000 });
    const by = {};
    sets.forEach(s => { const b = by[s.exercise_id] = by[s.exercise_id] || { last: s.created_at, ws: new Set(), best: 0 }; b.ws.add(s.workout_id); b.best = Math.max(b.best, e1rm(num(s.weight_kg), s.reps)); });
    const list = Object.entries(by).sort((a, b) => (a[1].last < b[1].last ? 1 : -1));
    if (!list.length) return '<div class="card empty"><p>Cuando registres sesiones, aquí verás la progresión de cada ejercicio y tus récords.</p></div>';
    return `<input class="input" id="pf" placeholder="Buscar ejercicio">` + list.map(([id, b]) => `<a class="card row-link pf-item" data-n="${esc(norm(exName(id)))}" href="${base}/${id}"><div><b>${esc(exName(id))}</b><small class="muted">${b.ws.size} sesiones · última ${fmtDateShort(b.last)}</small></div><span class="kpi">${b.best ? fmtN(b.best) + ' kg' : '—'}</span></a>`).join('');
  }
  const sets = await DB.select('workout_sets', { eq: { client_id: cid, exercise_id: exId }, order: 'created_at' });
  const sessions = [];
  const map = {};
  sets.forEach(s => {
    let x = map[s.workout_id]; if (!x) { x = map[s.workout_id] = { date: s.created_at, sets: [], best: 0, maxW: 0, vol: 0, maxR: 0 }; sessions.push(x); }
    x.sets.push(s); const w = num(s.weight_kg);
    x.best = Math.max(x.best, e1rm(w, s.reps)); x.maxW = Math.max(x.maxW, w); x.vol += w * s.reps; x.maxR = Math.max(x.maxR, s.reps);
  });
  const last12 = sessions.slice(-12);
  const bodyweight = sessions.every(x => x.maxW === 0);
  const recBest = sessions.reduce((a, x) => x.best > a.best ? x : a, { best: 0 });
  const recW = sessions.reduce((a, x) => x.maxW > a.maxW ? x : a, { maxW: 0 });
  const recV = sessions.reduce((a, x) => x.vol > a.vol ? x : a, { vol: 0 });
  const recR = sessions.reduce((a, x) => x.maxR > a.maxR ? x : a, { maxR: 0 });
  const bestSet = sets.reduce((a, s) => (num(s.weight_kg) * s.reps > num(a.weight_kg) * a.reps ? s : a), sets[0] || { weight_kg: 0, reps: 0 });
  return `
    <a class="linkbtn" href="${base}">← Todos los ejercicios</a>
    <h2 class="sec">${esc(exName(exId))}</h2>
    <div class="stats3">
      ${bodyweight ? `<div><b>${recR.maxR || '—'}</b><small>Máx. repeticiones</small></div>` : `<div><b>${recBest.best ? fmtN(recBest.best) + ' kg' : '—'}</b><small>Mejor 1RM estimado</small></div><div><b>${recW.maxW ? fmtN(recW.maxW) + ' kg' : '—'}</b><small>Peso máximo</small></div>`}
      <div><b>${sessions.length}</b><small>Sesiones</small></div>
    </div>
    <div class="card"><h3>${bodyweight ? 'Repeticiones máximas por sesión' : '1RM estimado por sesión (kg)'}</h3>
      ${vbars(last12.map((x, i) => ({ label: fmtDM(x.date), value: bodyweight ? x.maxR : x.best, text: bodyweight ? x.maxR : Math.round(x.best), hi: i === last12.length - 1 })))}
      ${bodyweight ? '' : '<p class="small muted">Estimación de Epley: peso × (1 + repeticiones / 30).</p>'}</div>
    <div class="card"><h3>Volumen por sesión (kg)</h3>${vbars(last12.map((x, i) => ({ label: fmtDM(x.date), value: x.vol, text: Math.round(x.vol), hi: i === last12.length - 1 })))}</div>
    <div class="card"><h3>Récords</h3><table class="tbl"><tbody>
      ${bodyweight ? '' : `<tr><td>Mejor 1RM estimado</td><td>${fmtN(recBest.best)} kg</td><td>${recBest.date ? fmtDateShort(recBest.date) : ''}</td></tr>
      <tr><td>Peso máximo</td><td>${fmtN(recW.maxW)} kg</td><td>${recW.date ? fmtDateShort(recW.date) : ''}</td></tr>
      <tr><td>Mejor serie (kg × reps)</td><td>${fmtN(bestSet.weight_kg)} × ${bestSet.reps}</td><td>${bestSet.created_at ? fmtDateShort(bestSet.created_at) : ''}</td></tr>`}
      <tr><td>Mayor volumen en sesión</td><td>${fmtKg(recV.vol)}</td><td>${recV.date ? fmtDateShort(recV.date) : ''}</td></tr>
      <tr><td>Máx. repeticiones</td><td>${recR.maxR}</td><td>${recR.date ? fmtDateShort(recR.date) : ''}</td></tr>
    </tbody></table></div>
    <h2 class="sec">Registros</h2>
    ${sessions.slice().reverse().slice(0, 20).map(x => `<div class="card"><b>${fmtDate(x.date)}</b><div class="small">${x.sets.sort((a, b) => a.set_number - b.set_number).map(s => `${fmtN(s.weight_kg)} kg × ${s.reps}`).join(' · ')}</div></div>`).join('')}`;
}
async function vProgreso(cid, base, exId, title, prefix = '') {
  paint(prefix + await progresoHtml(cid, base, exId), { input: t => { if (t.id === 'pf') { const q = norm(t.value); document.querySelectorAll('.pf-item').forEach(a => { a.hidden = q && !a.dataset.n.includes(q); }); } } }, title);
}

/* =====================================================================
   Perfil
   ===================================================================== */
function vPerfil() {
  const p = S.profile; const client = p.role === 'client';
  paint(`<div class="card">
      <label class="field"><span>Nombre</span><input class="input" data-f="full_name" value="${esc(p.full_name || '')}"></label>
      <label class="field"><span>Correo</span><input class="input" value="${esc(p.email || '')}" disabled></label>
      <label class="field"><span>WhatsApp</span><input class="input" data-f="phone" inputmode="tel" value="${esc(p.phone || '')}" placeholder="3001234567"></label>
      <p class="small muted">Rol: ${p.role === 'coach' ? 'Entrenador' : 'Asesorado'}</p>
    </div>
    ${client ? `<a class="card row-link" href="#/valoracion"><div><b>Mi valoración inicial</b><small class="muted">Ver o descargar en PDF y HTML</small></div><span class="chev">›</span></a>
      <a class="card row-link" href="#/checkin"><div><b>Check-in semanal</b><small class="muted">Peso, cumplimiento y sensaciones de la semana</small></div><span class="chev">›</span></a>
      <a class="card row-link" href="#/fotos"><div><b>Fotos de progreso</b><small class="muted">Protegidas con tu contraseña de fotos</small></div><span class="chev">›</span></a>
      <a class="card row-link" href="#/informes"><div><b>Informes mensuales</b><small class="muted">Tu progreso del mes en PDF y HTML</small></div><span class="chev">›</span></a>
      <a class="card row-link" href="#/recordatorios"><div><b>Recordatorios en el celular</b><small class="muted">Comidas, agua, entrenamiento y check-in en tu calendario</small></div><span class="chev">›</span></a>
      ${waBtn(S.settings.whatsapp, `Hola, soy ${p.full_name || ''}, asesorado de ${BRAND.name}.`, 'Escribir a mi entrenador por WhatsApp', 'btn block')}`
      : '<a class="card row-link" href="#/ajustes"><div><b>Ajustes de automatización</b><small class="muted">Publicación de planes, cálculos, plantillas, WhatsApp y fotos</small></div><span class="chev">›</span></a>'}
    ${DEMO ? '<button class="btn block" data-act="reset">Restablecer datos de demostración</button>' : ''}
    <button class="btn danger-outline block" data-act="out">Cerrar sesión</button>
    <p class="small muted center">${esc(BRAND.name)} · ${esc(BRAND.tagline)}</p>`, {
    change: async t => { if (t.dataset.f) { await DB.update('profiles', p.id, { [t.dataset.f]: t.value.trim() }); S.profile[t.dataset.f] = t.value.trim(); toast('Guardado'); } },
    click: {
      out: async () => { await Auth.signOut(); S.profile = null; location.hash = ''; afterAuth(); },
      reset: () => { if (!confirm('¿Restablecer todos los datos de demostración?')) return; localStorage.removeItem(DEMO_KEY); Object.keys(localStorage).filter(k => /^(ent_draft_|dp_)/.test(k)).forEach(k => localStorage.removeItem(k)); demoData = null; location.reload(); }
    }
  }, 'Perfil');
}

/* =====================================================================
   ENTRENADOR · Asesorados
   ===================================================================== */
async function vAsesorados() {
  const all = await DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' });
  const mem = typeof loadMemberships === 'function' ? await loadMemberships() : {};
  const archived = all.filter(c => mem[c.id] && mem[c.id].archived);
  const showArch = !!S.showArchived && archived.length > 0;
  const clients = all.filter(c => !(mem[c.id] && mem[c.id].archived));
  const listed = showArch ? archived : clients;
  const recent = await DB.select('workouts', { order: 'started_at', asc: false, limit: 500 });
  const routines = await DB.select('routines', { eq: { active: true } });
  const nplans = await DB.select('nutrition_plans', { eq: { active: true } });
  const last = {}, wk = {}; const since = new Date(Date.now() - 7 * 864e5).toISOString();
  recent.forEach(w => { if (!last[w.client_id]) last[w.client_id] = w; if (w.started_at >= since) wk[w.client_id] = (wk[w.client_id] || 0) + 1; });
  const withRoutine = new Set(routines.map(r => r.client_id));
  const withPlan = new Set(nplans.map(p => p.client_id));
  const html = `${await inboxHtml(clients)}
    <div class="stats3"><div><b>${clients.length}</b><small>Asesorados</small></div><div><b>${Object.keys(wk).length}</b><small>Activos 7 días</small></div><div><b>${Object.values(wk).reduce((a, b) => a + b, 0)}</b><small>Sesiones 7 días</small></div></div>
    <input class="input" id="cf" placeholder="Buscar asesorado">
    ${archived.length ? `<div class="seg"><button class="${showArch ? '' : 'on'}" data-act="arch" data-v="0">Activos (${clients.length})</button><button class="${showArch ? 'on' : ''}" data-act="arch" data-v="1">Archivados (${archived.length})</button></div>` : ''}
    ${listed.length ? listed.map(c => { const st = typeof membStatus === 'function' ? membStatus(mem[c.id]) : null; return `<a class="card row-link cl-item" data-n="${esc(norm(c.full_name + ' ' + c.email))}" href="#/asesorado/${c.id}">
      <div><b>${esc(c.full_name || c.email)}</b><small class="muted">${last[c.id] ? 'Última sesión ' + fmtDateShort(last[c.id].started_at) : 'Sin sesiones registradas'}${withRoutine.has(c.id) ? '' : ' · <span class="warn">sin rutina activa</span>'}${withPlan.has(c.id) ? '' : ' · <span class="warn">sin plan nutricional</span>'}${st && (st.expired || st.soon) ? ` · <span class="${st.expired ? 'bad' : 'warn'}">${esc(st.label.toLowerCase())}</span>` : ''}</small></div>
      <span class="kpi">${wk[c.id] || 0}<small>7 días</small></span></a>`; }).join('')
      : '<div class="card empty"><p>Aún no hay asesorados registrados.</p></div>'}
    <div class="card"><h3>Añadir asesorados</h3><p class="small">Comparte el enlace de la app. Cada asesorado crea su cuenta, completa la valoración inicial y el sistema genera su plan nutricional y su rutina. Según tus ajustes, quedan en revisión en Pendientes o se publican automáticamente.</p>
      <button class="btn block" data-act="copy">Copiar enlace de la app</button></div>`;
  paint(html, {
    input: t => { if (t.id === 'cf') { const q = norm(t.value); document.querySelectorAll('.cl-item').forEach(a => { a.hidden = q && !a.dataset.n.includes(q); }); } },
    click: {
      arch: el => { S.showArchived = el.dataset.v === '1'; route(); },
      copy: async () => { const url = location.origin + location.pathname; try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch (e) { prompt('Copia este enlace:', url); } },
      ibPhase2: async el => { if (!confirm('¿Generar y publicar la Fase 2 de este asesorado? La Fase 1 quedará inactiva.')) return; el.disabled = true; const id = await generatePhase2(el.dataset.id); toast('Fase 2 publicada'); location.hash = '#/rutina/' + id; }
    }
  }, 'Asesorados');
}

async function vAsesorado(id, tab, sub) {
  const c = (await DB.select('profiles', { eq: { id } }))[0];
  if (!c) return paint('<div class="card"><p>Asesorado no encontrado.</p></div>');
  const base = '#/asesorado/' + id;
  const mh = typeof membershipHead === 'function' ? await membershipHead(c) : { html: '', click: {} };
  const tabs = `<div class="chips scroll tabs2">${[['valoracion', 'Valoración'], ['rutinas', 'Entreno'], ['nutricion', 'Nutrición'], ['seguimiento', 'Seguimiento'], ['checkins', 'Check-ins'], ['informes', 'Informes'], ['fotos', 'Fotos'], ['historial', 'Sesiones'], ['progreso', 'Ejercicios']].map(([k, l]) => `<a class="chip${tab === k ? ' on' : ''}" href="${base}/${k}">${l}</a>`).join('')}</div>`;
  const head = `<div class="card"><div class="day-h"><p class="small muted">${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</p>${waBtn(c.phone, `Hola ${firstName(c.full_name)}, `)}</div>
    <label class="field"><span>Objetivo del asesorado</span><textarea class="input" rows="2" data-goal placeholder="Ej.: Tenista juvenil · fuerza y potencia para la temporada">${esc(c.goal || '')}</textarea></label>
    ${mh.html}</div>`;
  let body = '';
  const handlers = { click: Object.assign({}, mh.click), change: async t => { if ('goal' in t.dataset) { await DB.update('profiles', id, { goal: t.value.trim() }); toast('Objetivo guardado'); } } };

  let after = null;
  const MODS = { nutricion: coachNutriTab, seguimiento: coachSeguimientoTab, valoracion: coachValoracionTab, checkins: coachCheckinsTab, fotos: coachFotosTab, informes: typeof coachInformesTab === 'function' ? coachInformesTab : null };
  if (tab === 'historial') body = await historialHtml(id);
  else if (MODS[tab]) {
    const r = await MODS[tab](id);
    body = r.html; Object.assign(handlers.click, r.click || {}); after = r.after || null;
    if (r.change) { const prev = handlers.change; handlers.change = async t => { if (!r.change(t)) await prev(t); }; }
  } else if (tab === 'progreso') {
    body = await progresoHtml(id, base + '/progreso', sub);
    handlers.input = t => { if (t.id === 'pf') { const q = norm(t.value); document.querySelectorAll('.pf-item').forEach(a => { a.hidden = q && !a.dataset.n.includes(q); }); } };
  } else {
    const routines = await DB.select('routines', { eq: { client_id: id }, order: 'created_at', asc: false });
    const days = await DB.select('routine_days', { inn: { routine_id: routines.map(r => r.id) } });
    body = `<button class="btn primary block" data-act="newR">+ Nueva rutina</button>
      ${routines.length ? routines.map(r => `<div class="card">
        <div class="day-h"><div><h3>${esc(r.name)}</h3><small class="muted">${days.filter(d => d.routine_id === r.id).length} días · creada ${fmtDateShort(r.created_at)}</small></div><span class="badge ${r.review ? 'warnb' : r.active ? 'ok' : ''}">${r.review ? 'Borrador' : r.active ? 'Activa' : 'Inactiva'}</span></div>
        <div class="row-btns"><a class="btn sm primary" href="#/rutina/${r.id}">Editar</a><button class="btn sm" data-act="toggle" data-id="${r.id}" data-on="${r.active ? 1 : 0}">${r.active ? 'Desactivar' : 'Activar'}</button><button class="btn sm" data-act="dup" data-id="${r.id}">Duplicar</button><button class="btn sm danger-outline" data-act="delR" data-id="${r.id}">Eliminar</button></div>
      </div>`).join('') : '<div class="card empty"><p>Este asesorado no tiene rutinas. Crea una nueva o duplica la de otro asesorado.</p></div>'}`;
    Object.assign(handlers.click, {
      newR: async () => { const name = prompt('Nombre de la rutina:', 'Rutina · Fase 1'); if (!name) return; const [r] = await DB.insert('routines', { client_id: id, name: name.trim(), notes: '', active: true }); await DB.insert('routine_days', { routine_id: r.id, name: 'Día 1', position: 0 }); location.hash = '#/rutina/' + r.id; },
      toggle: async el => { await DB.update('routines', el.dataset.id, { active: el.dataset.on !== '1' }); route(); },
      delR: async el => { if (!confirm('¿Eliminar la rutina? El historial de sesiones se conserva.')) return; await DB.remove('routines', el.dataset.id); toast('Rutina eliminada'); route(); },
      dup: el => duplicateModal(el.dataset.id)
    });
  }
  paint(head + tabs + body, handlers, c.full_name || c.email);
  if (after) after();
}

async function duplicateModal(routineId) {
  const clients = await DB.select('profiles', { eq: { role: 'client' }, order: 'full_name' });
  modal(`${modalHead('Duplicar o asignar rutina')}<p class="small muted">Elige a qué asesorado asignar una copia o guárdala como plantilla. Podrás ajustarla después.</p>
    <button class="pick-item tpl" data-act="to" data-id=""><b>Guardar como plantilla</b><small>Disponible en la sección Plantillas</small></button>
    <div class="pick-list tall">${clients.map(c => `<button class="pick-item" data-act="to" data-id="${c.id}"><b>${esc(c.full_name || c.email)}</b><small>${esc(c.email || '')}</small></button>`).join('')}</div>`, {
    click: { to: async el => { closeModal(); const nid = await duplicateRoutine(routineId, el.dataset.id || null); toast(el.dataset.id ? 'Rutina asignada' : 'Plantilla guardada'); location.hash = '#/rutina/' + nid; } }
  });
}
async function duplicateRoutine(rid, targetCid) {
  const r = (await DB.select('routines', { eq: { id: rid } }))[0];
  const name = targetCid ? r.name.replace(/^Plantilla\s*·\s*/, '') + (targetCid === r.client_id ? ' (copia)' : '') : 'Plantilla · ' + r.name.replace(/^Plantilla\s*·\s*/, '');
  const [nr] = await DB.insert('routines', { client_id: targetCid, is_template: !targetCid, name, notes: r.notes, active: !!targetCid });
  const days = await DB.select('routine_days', { eq: { routine_id: rid }, order: 'position' });
  for (const d of days) {
    const [nd] = await DB.insert('routine_days', { routine_id: nr.id, name: d.name, position: d.position });
    const rex = await DB.select('routine_exercises', { eq: { day_id: d.id }, order: 'position' });
    await DB.insert('routine_exercises', rex.map(x => ({ day_id: nd.id, exercise_id: x.exercise_id, position: x.position, sets: x.sets, reps: x.reps, rir: x.rir, rest_seconds: x.rest_seconds, notes: x.notes })));
  }
  return nr.id;
}

/* =====================================================================
   ENTRENADOR · Editor de rutina
   ===================================================================== */
async function vRutina(id) {
  const r = (await DB.select('routines', { eq: { id } }))[0];
  if (!r) return paint('<div class="card"><p>Rutina no encontrada.</p></div>');
  const c = r.client_id ? (await DB.select('profiles', { eq: { id: r.client_id } }))[0] || {} : null;
  const days = await DB.select('routine_days', { eq: { routine_id: id }, order: 'position' });
  const rex = await DB.select('routine_exercises', { inn: { day_id: days.map(d => d.id) }, order: 'position' });

  const html = `
    <a class="linkbtn" href="${c ? '#/asesorado/' + r.client_id : '#/plantillas'}">← ${esc(c ? c.full_name || 'Asesorado' : 'Plantillas')}</a>
    ${r.review ? `<div class="warn-box small">Borrador generado automáticamente a partir de la valoración inicial. Revísalo y publícalo con «Aprobar y publicar» en la pestaña <a href="#/asesorado/${r.client_id}/valoracion">Valoración</a>.</div>` : ''}
    <div class="card">
      <label class="field"><span>Nombre de la rutina</span><input class="input" data-tbl="routines" data-id="${r.id}" data-f="name" value="${esc(r.name)}"></label>
      <label class="field"><span>Indicaciones generales</span><textarea class="input" rows="2" data-tbl="routines" data-id="${r.id}" data-f="notes" placeholder="Frecuencia, calentamiento, progresión…">${esc(r.notes || '')}</textarea></label>
      ${c ? `<label class="check"><input type="checkbox" data-tbl="routines" data-id="${r.id}" data-f="active" ${r.active ? 'checked' : ''}> Rutina activa (visible para el asesorado)</label>` : ''}
    </div>
    ${days.map((d, di) => {
      const items = rex.filter(x => x.day_id === d.id);
      return `<div class="card day-ed">
        <div class="day-ed-h"><input class="input title-in" data-tbl="routine_days" data-id="${d.id}" data-f="name" value="${esc(d.name)}">
          <button class="icon-btn" data-act="mvDay" data-id="${d.id}" data-dir="-1" ${di === 0 ? 'disabled' : ''} aria-label="Subir día">↑</button>
          <button class="icon-btn" data-act="mvDay" data-id="${d.id}" data-dir="1" ${di === days.length - 1 ? 'disabled' : ''} aria-label="Bajar día">↓</button>
          <button class="icon-btn danger" data-act="delDay" data-id="${d.id}" aria-label="Eliminar día">✕</button></div>
        ${items.map((x, i) => `<div class="rex">
          <div class="rex-h"><b>${i + 1}. ${esc(exName(x.exercise_id))}</b>${(S.exById[x.exercise_id] || {}).video_url ? '<span class="tag vid-t" title="Tiene video de técnica">▶</span>' : ''}<span class="tag">${esc(exGroup(x.exercise_id))}</span>
            <span class="rex-btns"><button class="icon-btn" data-act="mvEx" data-id="${x.id}" data-day="${d.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button class="icon-btn" data-act="mvEx" data-id="${x.id}" data-day="${d.id}" data-dir="1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button><button class="icon-btn" data-act="chEx" data-id="${x.id}" aria-label="Cambiar ejercicio">⇄</button><button class="icon-btn danger" data-act="delEx" data-id="${x.id}" aria-label="Quitar">✕</button></span></div>
          <div class="rex-grid">
            <label><span>Series</span><input class="input" inputmode="numeric" data-tbl="routine_exercises" data-id="${x.id}" data-f="sets" data-type="int" value="${x.sets ?? ''}"></label>
            <label><span>Reps</span><input class="input" data-tbl="routine_exercises" data-id="${x.id}" data-f="reps" value="${esc(x.reps || '')}" placeholder="8-10"></label>
            <label><span>RIR</span><input class="input" data-tbl="routine_exercises" data-id="${x.id}" data-f="rir" value="${esc(x.rir || '')}" placeholder="2"></label>
            <label><span>Descanso (s)</span><input class="input" inputmode="numeric" data-tbl="routine_exercises" data-id="${x.id}" data-f="rest_seconds" data-type="int" value="${x.rest_seconds ?? ''}"></label>
          </div>
          <input class="input" data-tbl="routine_exercises" data-id="${x.id}" data-f="notes" value="${esc(x.notes || '')}" placeholder="Indicaciones: tempo, técnica, progresión…">
        </div>`).join('')}
        <button class="btn sm block" data-act="addEx" data-id="${d.id}" data-n="${items.length}">+ Añadir ejercicio</button>
      </div>`;
    }).join('')}
    <button class="btn ghost block" data-act="addDay">+ Añadir día</button>
    <p class="small muted center">Los cambios se guardan automáticamente.</p>`;

  const reorder = async (table, list, idx, dir) => {
    const j = idx + dir; if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    for (let i = 0; i < list.length; i++) if (list[i].position !== i) await DB.update(table, list[i].id, { position: i });
    route();
  };
  paint(html, {
    change: async t => {
      const { tbl, id: rid, f } = t.dataset; if (!tbl) return;
      let v = t.type === 'checkbox' ? t.checked : t.value.trim();
      if (t.dataset.type === 'int') v = t.value === '' ? null : Math.round(num(t.value));
      await DB.update(tbl, rid, Object.assign({ [f]: v }, tbl === 'routines' && f === 'active' && v ? { review: false } : {})); toast('Guardado');
    },
    click: {
      addDay: async () => { await DB.insert('routine_days', { routine_id: id, name: 'Día ' + (days.length + 1), position: days.length }); route(); },
      delDay: async el => { if (!confirm('¿Eliminar este día y sus ejercicios?')) return; await DB.remove('routine_days', el.dataset.id); route(); },
      mvDay: el => reorder('routine_days', days.slice(), days.findIndex(d => d.id === el.dataset.id), +el.dataset.dir),
      mvEx: el => { const list = rex.filter(x => x.day_id === el.dataset.day); return reorder('routine_exercises', list, list.findIndex(x => x.id === el.dataset.id), +el.dataset.dir); },
      delEx: async el => { await DB.remove('routine_exercises', el.dataset.id); route(); },
      chEx: el => pickExercise('Cambiar ejercicio', async exId => { await DB.update('routine_exercises', el.dataset.id, { exercise_id: exId }); route(); }),
      addEx: el => pickExercise('Añadir ejercicio', async exId => {
        await DB.insert('routine_exercises', { day_id: el.dataset.id, exercise_id: exId, position: +el.dataset.n, sets: 3, reps: '8-12', rir: '2', rest_seconds: 90, notes: '' }); route();
      })
    }
  }, c ? 'Editar rutina' : 'Plantilla de rutina');
}

/* =====================================================================
   ENTRENADOR · Biblioteca de ejercicios
   ===================================================================== */
function vBiblioteca() {
  const groups = [...new Set([...MUSCLES, ...S.exercises.map(e => e.muscle_group)])];
  let g = sessionStorage.getItem('lib_g') || '', q = '';
  const listHtml = () => {
    const ql = norm(q);
    const list = S.exercises.filter(e => (!g || e.muscle_group === g) && (!ql || norm(e.name + ' ' + (e.family || '') + ' ' + (e.equipment || '')).includes(ql)));
    return `<p class="small muted">${list.length} ejercicios · ${list.filter(e => e.video_url).length} con video</p>` + list.map(e => `<a class="card row-link" href="#/ejercicio/${e.id}"><div><b>${esc(e.name)}${e.video_url ? ' <span class="tag vid-t">▶ Video</span>' : ''}</b><small class="muted">${esc(e.muscle_group)} · ${esc(e.equipment || '—')}${e.family ? ' · ' + esc(e.family) : ''}</small></div><span class="chev">›</span></a>`).join('');
  };
  paint(`${libSeg('biblioteca')}<div class="row-btns"><a class="btn primary" href="#/ejercicio/nuevo">+ Nuevo ejercicio</a><a class="btn" href="#/videos">Videos de técnica</a></div>
    <input class="input" id="lq" placeholder="Buscar por nombre, equipo o familia">
    <div class="chips scroll">${['', ...groups].map(x => `<button class="chip${x === g ? ' on' : ''}" data-act="g" data-g="${esc(x)}">${esc(x || 'Todos')}</button>`).join('')}</div>
    <div id="lib-list">${listHtml()}</div>`, {
    input: t => { if (t.id === 'lq') { q = t.value; $('#lib-list').innerHTML = listHtml(); } },
    click: { g: el => { g = el.dataset.g; sessionStorage.setItem('lib_g', g); document.querySelectorAll('[data-act=g]').forEach(c => c.classList.toggle('on', c.dataset.g === g)); $('#lib-list').innerHTML = listHtml(); } }
  }, 'Biblioteca');
}

function vEjercicio(id) {
  const isNew = id === 'nuevo';
  const e = isNew ? { name: '', muscle_group: sessionStorage.getItem('lib_g') || 'Pecho', family: '', equipment: '', instructions: '', video_url: '' } : S.exById[id];
  if (!e) return paint('<div class="card"><p>Ejercicio no encontrado.</p></div>');
  const groups = [...new Set([...MUSCLES, ...S.exercises.map(x => x.muscle_group)])];
  const fams = [...new Set(S.exercises.map(x => x.family).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const equips = [...new Set(S.exercises.map(x => x.equipment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const alts = S.exercises.filter(x => e.family && x.family === e.family && x.id !== e.id);
  paint(`<a class="linkbtn" href="#/biblioteca">← Biblioteca</a>
    <form id="exf" class="card">
      <label class="field"><span>Nombre</span><input class="input" name="name" required value="${esc(e.name)}"></label>
      <label class="field"><span>Grupo muscular</span><select class="input" name="muscle_group">${groups.map(x => `<option${x === e.muscle_group ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field"><span>Equipo</span><input class="input" name="equipment" list="eq-list" value="${esc(e.equipment || '')}" placeholder="Máquina, Polea, Mancuernas…"></label>
      <datalist id="eq-list">${equips.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <label class="field"><span>Familia de variantes</span><input class="input" name="family" list="fam-list" value="${esc(e.family || '')}" placeholder="Ej.: Press horizontal"></label>
      <datalist id="fam-list">${fams.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <p class="small muted">Los ejercicios de la misma familia se ofrecen como sustitutos durante la sesión cuando la máquina está ocupada o no está disponible.</p>
      <label class="field"><span>Indicaciones técnicas</span><textarea class="input" name="instructions" rows="4" placeholder="Posición, recorrido, respiración, errores frecuentes…">${esc(e.instructions || '')}</textarea></label>
      <label class="field"><span>Video de la técnica (YouTube, Shorts o Vimeo)</span><input class="input" name="video_url" type="url" value="${esc(e.video_url || '')}" placeholder="https://youtu.be/…"></label>
      ${e.video_url && typeof videoEmbed === 'function' ? videoEmbed(e.video_url) : ''}
      ${!isNew && e.name ? `<a class="small" href="https://www.youtube.com/results?search_query=${encodeURIComponent('técnica ' + e.name)}" target="_blank" rel="noopener">Buscar videos de «${esc(e.name)}» en YouTube</a>` : ''}
      <button class="btn primary block" type="submit">${isNew ? 'Crear ejercicio' : 'Guardar cambios'}</button>
    </form>
    ${alts.length ? `<div class="card"><h3>Variantes (familia: ${esc(e.family)})</h3><ul class="plain">${alts.map(a => `<li><a href="#/ejercicio/${a.id}">${esc(a.name)}</a> <small class="muted">${esc(a.equipment || '')}</small></li>`).join('')}</ul></div>` : ''}
    ${isNew ? '' : '<button class="btn danger-outline block" data-act="del">Eliminar ejercicio</button>'}`, {
    click: { del: async () => { if (!confirm('¿Eliminar este ejercicio de la biblioteca?')) return; await DB.remove('exercises', id); await loadExercises(); toast('Ejercicio eliminado'); location.hash = '#/biblioteca'; } }
  }, isNew ? 'Nuevo ejercicio' : 'Editar ejercicio');
  $('#exf').onsubmit = ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target)); Object.keys(f).forEach(k => f[k] = String(f[k]).trim());
    if (!f.name) return toast('Escribe el nombre', 'error');
    if (S.exercises.some(x => norm(x.name) === norm(f.name) && x.id !== id)) return toast('Ya existe un ejercicio con ese nombre', 'error');
    safe(async () => {
      if (isNew) { const [n] = await DB.insert('exercises', f); await loadExercises(); toast('Ejercicio creado'); location.hash = '#/ejercicio/' + n.id; }
      else { await DB.update('exercises', id, f); await loadExercises(); toast('Cambios guardados'); route(); }
    });
  };
}

/* ---------- inicio ---------- */
document.addEventListener('DOMContentLoaded', () => {
  $('#rest-minus').onclick = () => restAdjust(-15);
  $('#rest-plus').onclick = () => restAdjust(15);
  $('#rest-skip').onclick = stopRest;
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  boot();
});
