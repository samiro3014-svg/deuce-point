// =====================================================================
//  Deuce Point · Función «convertir-plan» (Supabase Edge Function)
//  Convierte el texto de un informe (PDF sin anexo «Datos de carga») al formato
//  del anexo usando la API de Anthropic. Solo la puede usar el entrenador.
//  Secretos requeridos: ANTHROPIC_API_KEY. Opcional: ANTHROPIC_MODEL
//  (por defecto claude-sonnet-5-5). SUPABASE_URL, SUPABASE_ANON_KEY y
//  SUPABASE_SERVICE_ROLE_KEY los provee Supabase.
//  La llave de la API nunca llega al navegador.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!KEY) return json({ error: 'Falta el secreto ANTHROPIC_API_KEY en Supabase › Edge Functions › Secrets.' }, 500);
    // Solo el entrenador
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401);
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!prof || prof.role !== 'coach') return json({ error: 'Solo el entrenador puede convertir documentos.' }, 403);

    const { text, catalog, spec } = await req.json();
    const doc = String(text || '').slice(0, 150000);
    if (doc.trim().length < 200) return json({ error: 'El documento no tiene texto suficiente para convertir.' }, 400);

    const system = 'Conviertes informes de nutrición deportiva al formato de datos de carga de la aplicación Deuce Point. '
      + 'No agregas ni cambias información clínica: transcribes lo que dice el informe (metas, comidas, gramos, fechas, alertas, preguntas). '
      + 'Si un dato no está en el informe, lo dejas vacío. Respondes únicamente con el bloque, desde «=== DEUCE POINT DATOS ===» hasta «=== FIN ===», sin texto adicional.\n\n'
      + String(spec || '').slice(0, 20000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 16000, system,
        // Sin razonamiento previo: la conversión es una transcripción y todo el presupuesto de tokens va a la respuesta.
        // En los modelos actuales se indica con «between_tools» (con ANTHROPIC_THINKING=disabled se usa el valor anterior).
        thinking: { type: Deno.env.get('ANTHROPIC_THINKING') || 'between_tools' },
        messages: [{ role: 'user', content: `Catálogo de alimentos de la aplicación (usa estos nombres cuando haya equivalente; los demás van con ALIMENTO_NUEVO): ${String(catalog || '').slice(0, 20000)}\n\nInforme:\n${doc}` }]
      })
    });
    const out = await r.json();
    if (!r.ok) return json({ error: 'API de Anthropic: ' + (out?.error?.message || r.status) }, 502);
    const types = (out.content || []).map((c: any) => c.type);
    const txt = (out.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    console.log(JSON.stringify({ model: out.model, stop: out.stop_reason, usage: out.usage, types, chars: txt.length, input_chars: doc.length }));
    if (!txt.trim()) return json({ error: `La IA terminó sin texto (motivo: ${out.stop_reason || 'desconocido'}; bloques: ${types.join(', ') || 'ninguno'}; tokens de salida: ${out.usage?.output_tokens ?? 0}).`, usage: out.usage, model: out.model || MODEL, stop: out.stop_reason }, 502);
    return json({ text: txt, usage: out.usage, model: out.model || MODEL, stop: out.stop_reason });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
