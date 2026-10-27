// =====================================================================
//  Deuce Point · Función «enviar-notificaciones» (Supabase Edge Function)
//  Se ejecuta cada 5 minutos (Supabase › Integrations › Cron).
//  1. Recordatorios de cada asesorado según su configuración (comidas con el
//     menú vigente del plan, agua, entrenamiento, check-in y registro del día).
//  2. Mensajes nuevos entre entrenador y asesorado.
//  3. Avisos al entrenador: valoraciones, check-ins, pagos reportados, metas y citas.
//  4. Citas confirmadas: aviso 24 horas y 2 horas antes (v10).
//  «Solo lo que falta» (v10, activado por defecto): no se envían recordatorios de lo ya registrado.
//  Secretos requeridos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
//  SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los provee Supabase.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const WINDOW = 6; // minutos: la tarea corre cada 5
const SUPP_NAMES: Record<string, string> = { creatina: 'Creatina monohidratada', cafeina: 'Cafeína', betaalanina: 'Beta-alanina', nitratos: 'Nitratos (jugo de remolacha)', bicarbonato: 'Bicarbonato de sodio' };
const DAYS_ES: Record<string, string> = { Monday: 'Lunes', Tuesday: 'Martes', Wednesday: 'Miércoles', Thursday: 'Jueves', Friday: 'Viernes', Saturday: 'Sábado', Sunday: 'Domingo' };
const toMin = (s: string) => { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
function localNow(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, weekday: DAYS_ES[p.weekday] };
}
const isDue = (now: { min: number }, t: number | null) => t != null && ((now.min - t + 1440) % 1440) < WINDOW;

Deno.serve(async () => {
  const { data: subs } = await sb.from('push_subscriptions').select('*');
  const byUser: Record<string, any[]> = {};
  (subs || []).forEach(s => { (byUser[s.user_id] = byUser[s.user_id] || []).push(s); });
  let sent = 0;
  const send = async (userId: string, key: string, day: string, payload: Record<string, string>) => {
    if (!byUser[userId]) return;
    const { error } = await sb.from('push_log').insert({ user_id: userId, key, sent_on: day });
    if (error) return; // ya enviado (clave única)
    for (const s of byUser[userId]) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)); sent++; }
      catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from('push_subscriptions').delete().eq('id', s.id); }
    }
  };

  // 1. Recordatorios
  const { data: prefs } = await sb.from('reminder_prefs').select('*');
  for (const r of prefs || []) {
    if (!byUser[r.user_id]) continue;
    const p = r.prefs || {}; const now = localNow(r.tz || 'America/Bogota');
    const smart = p.smart !== false;
    // Registros del día para omitir lo que ya se hizo
    let logged: Set<string> = new Set(); let water = 0;
    if (smart) {
      const { data: fl } = await sb.from('food_logs').select('meal_name').eq('client_id', r.user_id).eq('log_date', now.date);
      logged = new Set((fl || []).map((x: any) => x.meal_name));
      const { data: dly } = await sb.from('daily_logs').select('water_ml').eq('client_id', r.user_id).eq('log_date', now.date).maybeSingle();
      water = Number(dly && dly.water_ml) || 0;
    }
    if (p.meals) {
      const due = Object.entries(p.meals as Record<string, any>).filter(([, v]) => v && v.on && isDue(now, toMin(v.time)));
      if (due.length) {
        const { data: root } = await sb.from('nutrition_plans').select('*').eq('client_id', r.user_id).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
        // Tipo de día de la fecha (v7): elección del asesorado > fecha especial > día de la semana > tipo base
        let plan: any = root;
        if (root && 'day_overrides' in root) {
          const { data: vars } = await sb.from('nutrition_plans').select('id,day_code,weekdays').eq('variant_of', root.id);
          if (vars && vars.length) {
            const all = [root, ...vars];
            const { data: dl } = await sb.from('daily_logs').select('choices').eq('client_id', r.user_id).eq('log_date', now.date).maybeSingle();
            const pickId = dl && dl.choices && dl.choices.__dtype; const ov = (root.day_overrides || {})[now.date]; const code = ov && (typeof ov === 'string' ? ov : ov.c);
            plan = all.find(v => v.id === pickId) || (code && all.find(v => v.day_code === code)) || all.find(v => (v.weekdays || []).includes(now.weekday)) || root;
          }
        }
        for (const [name] of due) {
          if (smart && logged.has(name)) continue;
          let body = 'Revisa tu menú en la app y marca lo que consumas.';
          if (plan) {
            const { data: meal } = await sb.from('plan_meals').select('id').eq('plan_id', plan.id).eq('name', name).limit(1).maybeSingle();
            if (meal) {
              const { data: all } = await sb.from('plan_options').select('*').eq('meal_id', meal.id).order('position');
              const rot = (all || []).find((o: any) => (o.weekdays || []).includes(now.weekday));
              const opts = rot ? [rot] : (all || []).filter((o: any) => !(o.weekdays || []).length);
              const ids = (opts || []).map(o => o.id);
              const { data: items } = ids.length ? await sb.from('plan_items').select('option_id,grams,foods(name)').in('option_id', ids).order('position') : { data: [] };
              const txt = (opts || []).slice(0, 3).map(o => `${o.name}: ${(items || []).filter((i: any) => i.option_id === o.id).map((i: any) => `${i.foods?.name ?? ''} ${Math.round(i.grams)} g`).join(', ')}`).join(' · ');
              if (txt) body = txt.length > 230 ? txt.slice(0, 227) + '…' : txt;
            }
          }
          await send(r.user_id, 'meal-' + name, now.date, { title: name, body, url: './#/hoy', tag: 'meal', actions: [{ action: 'hecha', title: 'Marcar como hecha' }, { action: 'ver', title: 'Ver menú' }], urls: { hecha: './#/hoy?a=comida:' + encodeURIComponent(name), ver: './#/hoy' } });
        }
      }
    }
    let waterGoal = 2500;
    if (smart && p.water && p.water.on) { const { data: wp } = await sb.from('nutrition_plans').select('water_ml').eq('client_id', r.user_id).eq('active', true).is('variant_of', null).limit(1).maybeSingle(); waterGoal = Number(wp && wp.water_ml) || 2500; }
    if (p.water && p.water.on && !(smart && water >= waterGoal)) for (const t of String(p.water.times || '').split(/[,;\s]+/)) if (isDue(now, toMin(t))) await send(r.user_id, 'water-' + t, now.date, { title: 'Agua', body: 'Toma un vaso de agua (250 ml) y regístralo en la app.', url: './#/hoy', tag: 'water', actions: [{ action: 'agua', title: '+250 ml' }], urls: { agua: './#/hoy?a=agua250' } });
    if (p.train && p.train.on && (p.train.days || []).includes(now.weekday)) { const t = toMin(p.train.time); if (t != null && isDue(now, t - 30)) await send(r.user_id, 'train', now.date, { title: 'Entrenamiento en 30 minutos', body: 'Abre la sesión del día en Entreno y registra tus series.', url: './#/plan', tag: 'train' }); }
    let ckDone = false;
    if (smart && p.checkin && p.checkin.on && p.checkin.day === now.weekday && isDue(now, toMin(p.checkin.time))) { const since6 = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10); const { data: ck } = await sb.from('checkins').select('id').eq('client_id', r.user_id).gte('check_date', since6).limit(1); ckDone = !!(ck && ck.length); }
    if (!ckDone && p.checkin && p.checkin.on && p.checkin.day === now.weekday && isDue(now, toMin(p.checkin.time))) await send(r.user_id, 'checkin', now.date, { title: 'Check-in semanal', body: 'Pésate en ayunas y completa el check-in en la app.', url: './#/checkin', tag: 'checkin' });
    if (p.log && p.log.on && !(smart && logged.size >= Object.keys(p.meals || {}).filter(k => (p.meals as any)[k] && (p.meals as any)[k].on).length && logged.size > 0) && isDue(now, toMin(p.log.time))) await send(r.user_id, 'log', now.date, { title: 'Registro del día', body: 'Marca las comidas que consumiste hoy y el agua.', url: './#/hoy', tag: 'log' });
    // Resumen semanal: domingo 18:30
    if (p.weekly !== false && now.weekday === 'Domingo' && isDue(now, toMin('18:30'))) await send(r.user_id, 'weekly', now.date, { title: 'Tu resumen semanal', body: 'Revisa tu cumplimiento, tus hábitos y los tipos de día de la próxima semana.', url: './#/hoy', tag: 'weekly' });
    // Suplementos con hora de recordatorio (v9)
    const { data: sp } = await sb.from('supplement_plans').select('items').eq('client_id', r.user_id).maybeSingle();
    let suppDone: Set<string> = new Set();
    if (smart && ((sp && sp.items) || []).some((it: any) => it.hour && isDue(now, toMin(it.hour)))) { const { data: sl } = await sb.from('supplement_logs').select('supp_key').eq('client_id', r.user_id).eq('log_date', now.date); suppDone = new Set((sl || []).map((x: any) => x.supp_key)); }
    for (const it of ((sp && sp.items) || []) as any[]) {
      if (!it.hour || !isDue(now, toMin(it.hour)) || suppDone.has(it.key)) continue;
      const nm = it.name || SUPP_NAMES[it.key] || it.key;
      await send(r.user_id, 'supp-' + it.key, now.date, { title: 'Suplemento', body: `${nm}${it.dose ? ': ' + it.dose : ''}`, url: './#/hoy', tag: 'supp-' + it.key, actions: [{ action: 'tomado', title: 'Tomado' }], urls: { tomado: './#/hoy?a=supp:' + encodeURIComponent(it.key) } });
    }
  }

  // 2. Mensajes nuevos
  const since = new Date(Date.now() - 48 * 3600e3).toISOString();
  const { data: msgs } = await sb.from('messages').select('id,client_id,sender_id,body,created_at').is('notified_at', null).gte('created_at', since);
  const { data: staff } = await sb.from('profiles').select('id,role').in('role', ['coach', 'assistant']);
  const staffIds = (staff || []).map(s => s.id);
  const today = new Date().toISOString().slice(0, 10);
  for (const m of msgs || []) {
    const body = String(m.body).length > 160 ? String(m.body).slice(0, 157) + '…' : String(m.body);
    if (m.sender_id === m.client_id) {
      const { data: c } = await sb.from('profiles').select('full_name').eq('id', m.client_id).maybeSingle();
      for (const sid of staffIds) await send(sid, 'msg-' + m.id, today, { title: 'Mensaje de ' + (c?.full_name || 'un asesorado'), body, url: `./#/asesorado/${m.client_id}/mensajes`, tag: 'msg-' + m.client_id });
    } else await send(m.client_id, 'msg-' + m.id, today, { title: 'Mensaje de tu entrenador', body, url: './#/mensajes', tag: 'msg' });
    await sb.from('messages').update({ notified_at: new Date().toISOString() }).eq('id', m.id);
  }

  // 3. Valoraciones y check-ins nuevos para el entrenador
  const { data: its } = await sb.from('intakes').select('id,client_id,created_at,profiles(full_name)').gte('created_at', since);
  for (const i of its || []) for (const sid of staffIds) await send(sid, 'intake-' + i.id, today, { title: 'Nueva valoración inicial', body: ((i as any).profiles?.full_name || 'Un asesorado') + ' completó su valoración.', url: `./#/asesorado/${i.client_id}/valoracion`, tag: 'intake' });
  const { data: cks } = await sb.from('checkins').select('id,client_id,created_at,profiles(full_name)').gte('created_at', since);
  for (const c of cks || []) for (const sid of staffIds) await send(sid, 'ck-' + c.id, today, { title: 'Nuevo check-in', body: ((c as any).profiles?.full_name || 'Un asesorado') + ' envió su check-in semanal.', url: `./#/asesorado/${c.client_id}/checkins`, tag: 'ck' });

  // 3b. Pagos reportados, metas propuestas y citas solicitadas (v10; se omiten si las tablas no existen)
  const extra: [string, string, (x: any) => [string, string, string]][] = [
    ['payment_reports', 'id,client_id,amount,created_at,profiles(full_name)', x => ['Pago reportado', `${x.profiles?.full_name || 'Un asesorado'} reportó un pago de $${Math.round(Number(x.amount)).toLocaleString('es-CO')}.`, './#/asesorados']],
    ['weekly_goals', 'id,client_id,body,created_at,profiles(full_name)', x => ['Meta semanal propuesta', `${x.profiles?.full_name || 'Un asesorado'}: ${String(x.body).slice(0, 120)}`, './#/asesorados']],
    ['appointments', 'id,client_id,starts_at,status,created_at,profiles(full_name)', x => ['Cita solicitada', `${x.profiles?.full_name || 'Un asesorado'} pidió una cita.`, './#/agenda']]];
  for (const [t, cols, fmt] of extra) {
    const { data, error } = await sb.from(t).select(cols).gte('created_at', since);
    if (error) continue;
    for (const x of (data || []) as any[]) { if (t === 'appointments' && x.status !== 'solicitada') continue; if (t === 'weekly_goals' && x.status && x.status !== 'propuesta') continue; const [title, body, url] = fmt(x); for (const sid of staffIds) await send(sid, t + '-' + x.id, today, { title, body, url, tag: t }); }
  }

  // 4. Citas confirmadas: 24 horas y 2 horas antes
  const nowMs = Date.now();
  const { data: aps, error: apErr } = await sb.from('appointments').select('id,client_id,starts_at,kind,profiles(full_name)').eq('status', 'confirmada').gte('starts_at', new Date(nowMs).toISOString()).lte('starts_at', new Date(nowMs + 25 * 3600e3).toISOString());
  if (!apErr) for (const a of (aps || []) as any[]) {
    const mins = (new Date(a.starts_at).getTime() - nowMs) / 60000;
    const when = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(a.starts_at));
    for (const [lo, key, label] of [[1440 - WINDOW, 'ap24-', 'mañana'], [120 - WINDOW, 'ap2-', 'en 2 horas']] as [number, string, string][]) {
      if (mins > lo && mins <= lo + WINDOW) {
        await send(a.client_id, key + a.id, today, { title: `Cita ${label}`, body: `${a.kind}: ${when}`, url: './#/agenda', tag: 'cita' });
        for (const sid of staffIds) await send(sid, key + a.id, today, { title: `Cita ${label}`, body: `${a.profiles?.full_name || 'Asesorado'} · ${a.kind}: ${when}`, url: './#/agenda', tag: 'cita' });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { 'Content-Type': 'application/json' } });
});
