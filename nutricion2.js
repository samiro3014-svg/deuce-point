'use strict';
/* =====================================================================
   Deuce Point · Nutrición avanzada
   Recetas por opción de menú, antropometría ISAK (pliegues, perímetros,
   diámetros, % de grasa, masa muscular, somatotipo), suplementación con
   protocolo, ciclo menstrual, costo de la lista de compras, guía para
   comer fuera de casa y registro por código de barras (Open Food Facts).
   Depende de app.js, nutri.js, auto.js, menus.js, gestion.js y tenis.js.
   ===================================================================== */

/* =====================================================================
   Recetas
   ===================================================================== */
function rawOf(f, g) { const rf = /cocid/i.test(f.name) ? (RAW_FACTORS.find(([k]) => f.name.includes(k)) || [])[1] : null; return rf ? roundG(g * rf) : null; }
const COOK_TEMP = { 'Pechuga de pollo cocida': 74, 'Muslo de pollo sin piel cocido': 74, 'Carne molida de res magra cocida': 71, 'Carne de res magra cocida': 63, 'Lomo de cerdo cocido': 63, 'Hígado de res cocido': 71 };
function recipeSteps(o, rf = 1) {
  if (o.recipe && String(o.recipe).trim()) return String(o.recipe).split(/\n+/).map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  const items = o.items.map(i => { const f = foodOf(i.food_id); if (!f) return null; const g = rf !== 1 && isCarbFood(f) ? Math.max(1, roundG(num(i.grams) * rf)) : num(i.grams); return { f, g, m: typeof foodMeta === 'function' ? foodMeta(f) : { sub: '' }, u: unitText(f, g).replace('≈ ', '') }; }).filter(Boolean);
  const by = subs => items.filter(x => subs.includes(x.m.sub));
  const nm = x => `${x.f.name.replace(/\s+(cocid[oa]s?|escurrid[oa]s?)$/i, '').toLowerCase()} (${fmtN(x.g)} g${x.u ? ', ' + x.u : ''})`;
  const steps = [];
  const oil = by(['aceite'])[0];
  by(['carne', 'pescado', 'tofu']).forEach(x => {
    const t = COOK_TEMP[x.f.name];
    steps.push(`Sazonar ${nm(x)} con sal, ajo, cebolla y especias al gusto. Cocinar a la plancha, al horno a 180 °C o asado${oil ? ` con ${fmtN(oil.g)} g de ${oil.f.name.toLowerCase()}` : ' en sartén antiadherente'}${t ? ` hasta que el centro alcance ${t} °C` : x.m.sub === 'pescado' ? ' hasta que la carne se separe con facilidad (63 °C)' : ' hasta dorar'}. El peso indicado es en cocido.`);
  });
  by(['atun']).forEach(x => steps.push(`Escurrir el ${nm(x)} y mezclar con limón, cebolla y tomate picados.`));
  const eggs = by(['huevo', 'clara']);
  if (eggs.length) steps.push(`Preparar ${eggs.map(nm).join(' y ')} revueltos o en pericos (con tomate y cebolla) en sartén antiadherente${oil && !by(['carne', 'pescado', 'tofu']).length ? ` con ${fmtN(oil.g)} g de ${oil.f.name.toLowerCase()}` : ' sin grasa adicional'}.`);
  by(['arroz', 'pasta', 'grano']).forEach(x => { const r = rawOf(x.f, x.g); steps.push(`Servir ${nm(x)}${r ? `: equivale a unos ${fmtInt(r)} g en crudo` : ''}${x.m.sub === 'grano' ? '. Si se prepara en casa, remojar el grano 8 a 12 horas y cocinar en olla a presión' : ''}.`); });
  by(['tuberculo']).forEach(x => steps.push(`Cocinar ${nm(x)} en agua con sal, al vapor o al horno hasta que esté blando.`));
  by(['arepa']).forEach(x => steps.push(`Asar ${nm(x)} en sartén o parrilla sin grasa.`));
  by(['pan', 'tortilla', 'galleta', 'cereal']).forEach(x => steps.push(`Servir ${nm(x)}${x.m.sub === 'tortilla' ? ', calentada en sartén' : ''}.`));
  const av = by(['avena'])[0], milk = by(['leche'])[0], wh = by(['whey'])[0];
  if (av) steps.push(`Cocinar ${nm(av)} ${milk ? `en ${nm(milk)}` : 'en agua'} a fuego bajo durante 3 a 5 minutos, o dejar en remojo la noche anterior.${wh ? ` Agregar ${nm(wh)} al final, fuera del fuego.` : ''}`);
  else if (wh) steps.push(`Licuar ${nm(wh)} con ${milk ? nm(milk) : '250 ml de agua fría'}${by(['fruta']).length ? ' y la fruta' : ''}.`);
  else if (milk) steps.push(`Servir ${nm(milk)}.`);
  by(['yogur', 'kumis']).forEach(x => steps.push(`Servir ${nm(x)}${by(['fruta']).length ? ' con la fruta picada' : ''}.`));
  by(['queso', 'fiambre']).forEach(x => steps.push(`Acompañar con ${nm(x)}.`));
  const veg = by(['verdura']);
  if (veg.length) steps.push(`Lavar y preparar ${veg.map(nm).join(' y ')} en ensalada, al vapor o salteadas${oil && !by(['carne', 'pescado', 'tofu']).length && !eggs.length ? ` con ${fmtN(oil.g)} g de ${oil.f.name.toLowerCase()}` : ''}.`);
  by(['fruta']).filter(() => !wh || av).forEach(x => steps.push(`Servir ${nm(x)} entera o picada.`));
  by(['aguacate', 'fruto_seco', 'semilla', 'untable']).forEach(x => steps.push(`Agregar ${nm(x)} al servir.`));
  items.filter(x => !x.m.sub || ['Bebidas', 'Dulces y otros'].includes(x.f.category)).forEach(x => steps.push(`Incluir ${nm(x)}.`));
  if (oil && !steps.some(s => s.includes(oil.f.name.toLowerCase()))) steps.push(`Usar ${fmtN(oil.g)} g de ${oil.f.name.toLowerCase()} para cocinar o aderezar.`);
  return steps;
}
function recipeModal(o, rf) {
  const st = recipeSteps(o, rf);
  modal(`${modalHead('Preparación · ' + o.name)}<ol class="recipe">${st.map(s => `<li>${esc(s)}</li>`).join('')}</ol>${o.recipe ? '' : '<p class="small muted">Preparación sugerida a partir de los alimentos y porciones de la opción. Pesar los alimentos en el estado indicado.</p>'}`);
}
const recipeDocHtml = o => { const st = recipeSteps(o); return st.length ? `<p class="small"><b>Preparación</b></p><ol class="doc-repl">${st.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''; };

/* =====================================================================
   Antropometría ISAK
   ===================================================================== */
const ISAK_FIELDS = [
  ['Básicas', [['peso', 'Peso', 'kg'], ['talla', 'Talla', 'cm']]],
  ['Pliegues cutáneos (mm)', [['tri', 'Tríceps'], ['sub', 'Subescapular'], ['bi', 'Bíceps'], ['cresta', 'Cresta ilíaca'], ['supra', 'Supraespinal'], ['abd', 'Abdominal'], ['muslo', 'Muslo frontal'], ['pant', 'Pantorrilla medial']]],
  ['Perímetros (cm)', [['p_brazo', 'Brazo relajado'], ['p_brazof', 'Brazo flexionado y contraído'], ['p_cintura', 'Cintura (mínima)'], ['p_cadera', 'Cadera (máxima)'], ['p_muslo', 'Muslo medio'], ['p_pant', 'Pantorrilla (máxima)']]],
  ['Diámetros (cm)', [['d_humero', 'Húmero (biepicondilar)'], ['d_femur', 'Fémur (bicondilar)'], ['d_muneca', 'Muñeca (biestiloideo)']]]];
const DW = { M: [[19, 1.162, 0.063], [29, 1.1631, 0.0632], [39, 1.1422, 0.0544], [49, 1.162, 0.07], [999, 1.1715, 0.0779]], F: [[19, 1.1549, 0.0678], [29, 1.1599, 0.0717], [39, 1.1423, 0.0632], [49, 1.1333, 0.0612], [999, 1.1339, 0.0645]] };
const FAT_FORMULAS = { yuhasz: 'Yuhasz (Σ6 pliegues)', dw: 'Durnin-Womersley + Siri (Σ4 pliegues)', faulkner: 'Faulkner (Σ4 pliegues)' };
function isakCalc(m, sex, age) {
  const v = k => num(m[k]); const w = v('peso'), h = v('talla'); const r = {};
  if (w && h) { r.imc = w / Math.pow(h / 100, 2); }
  if (v('p_cintura') && v('p_cadera')) r.icc = v('p_cintura') / v('p_cadera');
  if (v('p_cintura') && h) r.ict = v('p_cintura') / h;
  const s6 = ['tri', 'sub', 'supra', 'abd', 'muslo', 'pant']; if (s6.every(k => v(k))) r.sum6 = s6.reduce((a, k) => a + v(k), 0);
  const s8 = ['tri', 'sub', 'bi', 'cresta', 'supra', 'abd', 'muslo', 'pant']; if (s8.every(k => v(k))) r.sum8 = s8.reduce((a, k) => a + v(k), 0);
  if (r.sum6) r.yuhasz = sex === 'F' ? 0.1548 * r.sum6 + 3.58 : 0.1051 * r.sum6 + 2.585;
  if (['bi', 'tri', 'sub', 'cresta'].every(k => v(k)) && age) { const s = v('bi') + v('tri') + v('sub') + v('cresta'); const [, c, mm] = DW[sex].find(x => age <= x[0]); const D = c - mm * Math.log10(s); r.dens = D; r.dw = 495 / D - 450; }
  if (['tri', 'sub', 'supra', 'abd'].every(k => v(k))) r.faulkner = 0.153 * (v('tri') + v('sub') + v('supra') + v('abd')) + 5.783;
  // Masa muscular esquelética (Lee et al., 2000)
  if (h && v('p_brazo') && v('tri') && v('p_muslo') && v('muslo') && v('p_pant') && v('pant') && age) {
    const cag = v('p_brazo') - Math.PI * v('tri') / 10, ctg = v('p_muslo') - Math.PI * v('muslo') / 10, ccg = v('p_pant') - Math.PI * v('pant') / 10;
    r.mme = h / 100 * (0.00744 * cag * cag + 0.00088 * ctg * ctg + 0.00441 * ccg * ccg) + 2.4 * (sex === 'M' ? 1 : 0) - 0.048 * age + 7.8;
    if (w) r.mme_pct = r.mme / w * 100;
  }
  // Somatotipo de Heath-Carter
  if (h && ['tri', 'sub', 'supra'].every(k => v(k))) { const X = (v('tri') + v('sub') + v('supra')) * 170.18 / h; r.endo = -0.7182 + 0.1451 * X - 0.00068 * X * X + 0.0000014 * X * X * X; }
  if (h && v('d_humero') && v('d_femur') && v('p_brazof') && v('p_pant') && v('tri') && v('pant')) r.meso = 0.858 * v('d_humero') + 0.601 * v('d_femur') + 0.188 * (v('p_brazof') - v('tri') / 10) + 0.161 * (v('p_pant') - v('pant') / 10) - 0.131 * h + 4.5;
  if (h && w) { const hwr = h / Math.cbrt(w); r.ecto = hwr >= 40.75 ? 0.732 * hwr - 28.58 : hwr > 38.25 ? 0.463 * hwr - 17.63 : 0.1; }
  if (r.endo != null && r.meso != null && r.ecto != null) r.somato = somatoName(r.endo, r.meso, r.ecto);
  return r;
}
function somatoName(en, me, ec) {
  const c = [['endo', en, 'Endomorfo', 'endomórfico'], ['meso', me, 'Mesomorfo', 'mesomórfico'], ['ecto', ec, 'Ectomorfo', 'ectomórfico']].sort((a, b) => b[1] - a[1]);
  if (c[0][1] - c[2][1] <= 1) return 'Central';
  if (c[0][1] - c[1][1] <= 0.5) return `${c[1][2].replace('morfo', '')}-${c[0][2].toLowerCase()}`;
  if (c[1][1] - c[2][1] <= 0.5) return `${c[0][2]} balanceado`;
  return `${c[0][2]} ${c[1][3]}`;
}
const fatOf = (r, f) => r[f] ?? r.yuhasz ?? r.dw ?? r.faulkner ?? null;
function isakDocHtml(info, rows, f, logo) {
  const last = rows[rows.length - 1]; if (!last) return '';
  const age = ageFrom(info.d.fecha_nac); const r = isakCalc(last.data, info.sex, age); const prev = rows[rows.length - 2]; const rp = prev ? isakCalc(prev.data, info.sex, ageFrom(info.d.fecha_nac)) : null;
  const row = (l, k, u, d = 1) => r[k] == null ? '' : `<tr><td>${l}</td><td class="n"><b>${fmtN(r[k])}${u}</b></td><td class="n">${rp && rp[k] != null ? fmtN(rp[k]) + u : '—'}</td></tr>`;
  let h = `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Informe antropométrico</h1><p><b>${esc(info.c.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · ${esc(fmtDateLong(last.measure_date))} · protocolo ISAK${age ? ` · ${age} años` : ''}</p></div></div>
    <h2>Medidas</h2>`;
  ISAK_FIELDS.forEach(([g, fs]) => { const xs = fs.filter(([k]) => num(last.data[k])); if (xs.length) h += `<h3>${esc(g)}</h3><table class="doc-t"><tbody>${xs.map(([k, l, u]) => `<tr><td>${esc(l)}</td><td class="n">${fmtN(last.data[k])} ${u || (g.includes('mm') ? 'mm' : 'cm')}</td><td class="n">${prev && num(prev.data[k]) ? 'anterior ' + fmtN(prev.data[k]) : ''}</td></tr>`).join('')}</tbody></table>`; });
  const fat = fatOf(r, f), w = num(last.data.peso);
  h += `<h2>Composición corporal</h2><table class="doc-t"><thead><tr><th>Indicador</th><th class="n">Actual</th><th class="n">Anterior</th></tr></thead><tbody>
    ${row('Σ 6 pliegues', 'sum6', ' mm')}${row('Σ 8 pliegues', 'sum8', ' mm')}${row('% grasa Yuhasz', 'yuhasz', ' %')}${row('% grasa Durnin-Womersley', 'dw', ' %')}${row('% grasa Faulkner', 'faulkner', ' %')}
    ${fat != null && w ? `<tr><td>Masa grasa (${esc(FAT_FORMULAS[f] || 'Yuhasz')})</td><td class="n"><b>${fmtN(w * fat / 100)} kg</b></td><td></td></tr><tr><td>Masa libre de grasa</td><td class="n"><b>${fmtN(w * (1 - fat / 100))} kg</b></td><td></td></tr>` : ''}
    ${row('Masa muscular esquelética (Lee)', 'mme', ' kg')}${row('Masa muscular (% del peso)', 'mme_pct', ' %')}${row('IMC', 'imc', '')}${row('Índice cintura/cadera', 'icc', '')}${row('Índice cintura/talla', 'ict', '')}</tbody></table>`;
  if (r.somato) h += `<h2>Somatotipo (Heath-Carter)</h2><table class="doc-t"><tbody><tr><td>Endomorfia</td><td class="n">${fmtN(r.endo)}</td></tr><tr><td>Mesomorfia</td><td class="n">${fmtN(r.meso)}</td></tr><tr><td>Ectomorfia</td><td class="n">${fmtN(r.ecto)}</td></tr><tr><td><b>Clasificación</b></td><td class="n"><b>${esc(r.somato)}</b></td></tr></tbody></table>${docBars([{ label: 'Endo', value: r.endo, text: fmtN(r.endo) }, { label: 'Meso', value: r.meso, text: fmtN(r.meso), hi: 1 }, { label: 'Ecto', value: r.ecto, text: fmtN(r.ecto) }])}`;
  const series = rows.slice(-6).map(x => ({ d: x.measure_date, r: isakCalc(x.data, info.sex, age) }));
  const bars = (k, l, u) => { const pts = series.filter(x => x.r[k] != null); return pts.length ? `<h3>${l}</h3>${docBars(pts.map((x, i) => ({ label: fmtDM(parseDay(x.d)), value: x.r[k], text: fmtN(x.r[k]) + u, hi: i === pts.length - 1 })))}` : ''; };
  h += `<h2>Evolución</h2>${bars('sum6', 'Σ 6 pliegues (mm)', '')}${bars(f, '% de grasa (' + (FAT_FORMULAS[f] || '') + ')', '')}${bars('mme', 'Masa muscular esquelética (kg)', '')}`;
  h += `<p class="doc-sub">Ecuaciones: Yuhasz (1974): hombres 0,1051 × Σ6 + 2,585; mujeres 0,1548 × Σ6 + 3,580. Durnin y Womersley (1974) con Siri (1961): densidad por edad y sexo con Σ bíceps, tríceps, subescapular y cresta ilíaca. Faulkner (1968): 0,153 × (tríceps + subescapular + supraespinal + abdominal) + 5,783. Masa muscular esquelética: Lee et al. (2000) con perímetros corregidos por pliegue. Somatotipo: Heath-Carter (1990).</p><p class="doc-foot">Documento de ${esc(BRAND.name)}. Confidencial (Ley 1581 de 2012).</p>`;
  return h;
}
async function antropometriaTab(cid) {
  if (S.needsV6) return { html: V6_NOTICE };
  const info = await clientInfo(cid); const age = ageFrom(info.d.fecha_nac);
  const rows = await DB.select('anthropometry', { eq: { client_id: cid }, order: 'measure_date' });
  const coach = S.profile.role === 'coach' || S.profile.role === 'assistant';
  let f = S.isakF || 'yuhasz';
  const last = rows[rows.length - 1]; const r = last ? isakCalc(last.data, info.sex, age) : null;
  const w0 = await latestWeight(cid);
  const docs = reportDocButtons(`Informe antropométrico - ${info.c.full_name || ''}${last ? ' - ' + last.measure_date : ''}`.replace(/[\\/:*?"<>|]/g, ''), logo => isakDocHtml(info, rows, f, logo));
  const html = `${coach ? `<div class="card"><h3>Nueva medición ISAK</h3><label class="field"><span>Fecha</span><input class="input" type="date" id="is-d" value="${todayStr()}"></label>
      ${ISAK_FIELDS.map(([g, fs]) => `<h4>${esc(g)}</h4><div class="rex-grid">${fs.map(([k, l, u]) => `<label><span>${esc(l)}${u ? ' (' + u + ')' : ''}</span><input class="input" data-is="${k}" inputmode="decimal" value="${k === 'peso' && w0 ? r1(w0) : k === 'talla' && info.d.talla ? esc(info.d.talla) : ''}"></label>`).join('')}</div>`).join('')}
      <p class="small muted">Promedio o mediana de 2–3 tomas por sitio, lado derecho, según el protocolo ISAK. Los cálculos se hacen con los sitios disponibles.</p>
      <button class="btn primary block" data-act="isSave">Guardar medición</button></div>` : ''}
    ${r ? `<div class="card"><div class="day-h"><h3>Última medición · ${esc(fmtDayMonth(last.measure_date))}</h3></div>
      <label class="field"><span>Ecuación de % de grasa</span><select class="input" id="is-f">${Object.entries(FAT_FORMULAS).map(([k, l]) => `<option value="${k}"${k === f ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="stats3"><div><b>${fatOf(r, f) != null ? fmtN(fatOf(r, f)) + ' %' : '—'}</b><small>Grasa corporal</small></div><div><b>${r.mme != null ? fmtN(r.mme) + ' kg' : '—'}</b><small>Masa muscular</small></div><div><b>${r.sum6 != null ? fmtN(r.sum6) : '—'}</b><small>Σ 6 pliegues (mm)</small></div></div>
      ${r.somato ? `<p class="small"><b>Somatotipo:</b> ${fmtN(r.endo)} – ${fmtN(r.meso)} – ${fmtN(r.ecto)} · ${esc(r.somato)}</p>` : ''}
      <div class="row-btns"><button class="btn primary" data-act="pdf">PDF</button><button class="btn" data-act="html">HTML</button>${coach && fatOf(r, f) != null ? '<button class="btn" data-act="isApply">Aplicar al seguimiento</button>' : ''}</div>
      <p class="small muted">«Aplicar al seguimiento» registra el peso y el % de grasa en Cuerpo y en la valoración con el método «Pliegues cutáneos», para usarlos en «Recalcular con datos actuales».</p></div>
      ${['sum6', 'fat', 'mme'].map(k => { const kk = k === 'fat' ? f : k; const pts = rows.slice(-8).map(x => ({ d: x.measure_date, v: (isakCalc(x.data, info.sex, age))[kk] })).filter(x => x.v != null); return pts.length ? `<div class="card"><h3>${{ sum6: 'Σ 6 pliegues (mm)', fat: '% de grasa', mme: 'Masa muscular esquelética (kg)' }[k]}</h3>${vbars(pts.map((x, i) => ({ label: fmtDM(parseDay(x.d)), value: x.v, text: fmtN(x.v), hi: i === pts.length - 1 })))}</div>` : ''; }).join('')}
      ${coach ? `<button class="btn danger-outline block" data-act="isDel" data-id="${last.id}">Eliminar la última medición</button>` : ''}` : '<div class="card empty"><p>Sin mediciones antropométricas registradas.</p></div>'}`;
  return {
    html, click: {
      ...docs,
      isSave: async () => {
        const data = {}; document.querySelectorAll('[data-is]').forEach(i => { if (i.value.trim()) data[i.dataset.is] = num(i.value); });
        if (!data.peso || !data.talla) return toast('Indica peso y talla', 'error');
        await DB.insert('anthropometry', { client_id: cid, measure_date: $('#is-d').value || todayStr(), data }); toast('Medición guardada'); route();
      },
      isApply: async () => {
        const fat = fatOf(r, f); const w = num(last.data.peso);
        await DB.insert('body_logs', { client_id: cid, log_date: last.measure_date, weight_kg: w, waist_cm: num(last.data.p_cintura) || null, body_fat: r1(fat), notes: 'Antropometría ISAK · ' + FAT_FORMULAS[f] });
        const it = (await DB.select('intakes', { eq: { client_id: cid } }))[0];
        if (it) await DB.update('intakes', it.id, { data: Object.assign({}, it.data, { grasa_pct: String(r1(fat)), masa_magra: String(r1(w * (1 - fat / 100))), metodo_comp: 'Pliegues cutáneos', peso: String(w) }) });
        toast('Aplicado: usa «Recalcular con datos actuales» en Valoración'); route();
      },
      isDel: async el => { if (!confirm('¿Eliminar la última medición?')) return; await DB.remove('anthropometry', el.dataset.id); route(); }
    },
    change: t => { if (t.id === 'is-f') { S.isakF = t.value; route(); return true; } return false; }
  };
}

/* =====================================================================
   Suplementación con protocolo (Australian Institute of Sport, grupo A; ISSN; COI 2018)
   ===================================================================== */
const SUPPS = {
  creatina: { name: 'Creatina monohidratada', dose: w => `${w >= 70 ? 5 : 3} g al día (0,03–0,1 g/kg)`, load: w => `Carga opcional: ${fmtInt(w * 0.3)} g al día (0,3 g/kg) en 4 tomas durante 5 a 7 días`, timing: 'Diario, con una comida (cualquier hora)', when: 'diario', note: 'Puede aumentar 1–2 kg el peso por agua intramuscular. Sin necesidad de ciclos.' },
  cafeina: { name: 'Cafeína', dose: w => `${fmtInt(w * 3)} mg (3 mg/kg; rango 3–6 mg/kg)`, timing: '30–60 min antes del partido o la sesión principal', when: 'competencia', note: 'Probar primero en entrenamiento. Evitar después de las 3 p. m. por el sueño. No se recomienda en menores de 18 años.', minor: true },
  betaalanina: { name: 'Beta-alanina', dose: w => `${fmtN(Math.min(6.4, Math.max(3.2, w * 0.065)))} g al día (≈65 mg/kg; 3,2–6,4 g) en tomas de 0,8–1,6 g`, timing: 'Repartida en las comidas, mínimo 4 semanas', when: 'diario', note: 'Puede producir hormigueo (parestesia) transitorio; las tomas pequeñas o de liberación sostenida lo reducen.' },
  nitratos: { name: 'Nitratos (jugo de remolacha)', dose: () => '6–8 mmol de nitrato (≈370–500 mg; 70–140 ml de jugo concentrado)', timing: '2–3 h antes de la competencia; en torneos, a diario desde 3 días antes', when: 'competencia', note: 'Evitar enjuague bucal antibacteriano, porque reduce la conversión del nitrato. Puede colorear la orina.' },
  bicarbonato: { name: 'Bicarbonato de sodio', dose: w => `${fmtN(w * 0.2)}–${fmtN(w * 0.3)} g (0,2–0,3 g/kg)`, timing: '60–180 min antes, fraccionado y con una comida rica en carbohidratos', when: 'competencia', note: 'Riesgo de molestias gastrointestinales: probar siempre en entrenamiento. Aporta sodio (27 % del peso).' }
};
/* Suplemento del catálogo o personalizado (importado del plan o agregado por el entrenador) */
const suppOf = x => SUPPS[x.key] || (x.custom && x.name ? { name: x.name, dose: () => x.dose || '', timing: x.timing || '', note: '' } : null);
async function supplementPlan(cid) { if (S.needsV6) return null; try { return (await DB.select('supplement_plans', { eq: { client_id: cid } }))[0] || null; } catch (e) { return null; } }
function suppDocHtml(info, plan, w, logo) {
  const items = (plan.items || []).filter(x => suppOf(x));
  return `<div class="doc-h">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}<div><h1>Protocolo de suplementación</h1><p><b>${esc(info.c.full_name || '')}</b></p><p class="doc-sub">${esc(BRAND.name)} · ${esc(fmtDateLong(todayStr()))} · peso de referencia ${fmtN(w)} kg</p></div></div>
    <table class="doc-t"><thead><tr><th>Suplemento</th><th>Dosis</th><th>Momento</th><th>Indicaciones</th></tr></thead><tbody>${items.map(x => { const s = suppOf(x); return `<tr><td><b>${esc(s.name)}</b></td><td>${esc(x.dose || s.dose(w))}${x.loading && s.load ? `<br><small>${esc(s.load(w))}</small>` : ''}</td><td>${esc(x.timing || s.timing)}</td><td>${esc([s.note, x.note].filter(Boolean).join(' '))}</td></tr>`; }).join('')}</tbody></table>
    ${plan.notes ? `<h2>Indicaciones</h2><p class="pre">${esc(plan.notes)}</p>` : ''}
    <p class="doc-sub">Usar productos con certificación de terceros (Informed Sport, NSF Certified for Sport) para reducir el riesgo de contaminación con sustancias prohibidas. Referencias: Australian Institute of Sport, marco de suplementos (grupo A); International Society of Sports Nutrition; consenso del Comité Olímpico Internacional (2018).</p>
    <p class="doc-foot">Documento de ${esc(BRAND.name)}. Confidencial (Ley 1581 de 2012).</p>`;
}
async function suplementosTab(cid) {
  if (S.needsV6) return { html: V6_NOTICE };
  const info = await clientInfo(cid); const w = await latestWeight(cid) || 60; const age = ageFrom(info.d.fecha_nac);
  const plan = await supplementPlan(cid) || { items: [], notes: '' };
  const items = Object.fromEntries((plan.items || []).map(x => [x.key, x]));
  const logs = await DB.select('supplement_logs', { eq: { client_id: cid }, gte: { log_date: addDays(todayStr(), -13) } });
  const coach = S.profile.role === 'coach';
  const html = `<p class="small muted">Peso de referencia: ${fmtN(w)} kg. ${info.d.suplementos_ok ? 'Disposición del asesorado a usar suplementos: ' + esc(info.d.suplementos_ok) + '.' : ''}${info.d.creatina ? ' Creatina: ' + esc(info.d.creatina) + '.' : ''}</p>
    ${Object.entries(SUPPS).map(([k, s]) => { const x = items[k]; const done = logs.filter(l => l.supp_key === k).length; return `<div class="card supp${x ? ' on' : ''}">
      <label class="check"><input type="checkbox" data-sp="${k}" ${x ? 'checked' : ''} ${coach ? '' : 'disabled'}> <b>${esc(s.name)}</b>${s.minor && age && age < 18 ? ' <span class="badge bad">No recomendada en menores de 18</span>' : ''}</label>
      <div class="rex-grid"><label><span>Dosis</span><input class="input" data-sd="${k}" value="${esc(x && x.dose || s.dose(w))}" ${coach ? '' : 'disabled'}></label><label><span>Momento</span><input class="input" data-st="${k}" value="${esc(x && x.timing || s.timing)}" ${coach ? '' : 'disabled'}></label></div>
      ${s.load ? `<label class="check small"><input type="checkbox" data-sl="${k}" ${x && x.loading ? 'checked' : ''} ${coach ? '' : 'disabled'}> ${esc(s.load(w))}</label>` : ''}
      <p class="small muted">${esc(s.note)}</p>${x ? `<p class="small">Tomas registradas en 14 días: <b>${done}</b></p>` : ''}</div>`; }).join('')}
    ${(plan.items || []).filter(x => x.custom).map((x, i) => `<div class="card supp on">
      <label class="check"><input type="checkbox" data-cx="${i}" checked ${coach ? '' : 'disabled'}> <b>${esc(x.name)}</b> <span class="badge">Personalizado</span></label>
      <div class="rex-grid"><label><span>Dosis</span><input class="input" data-cxd="${i}" value="${esc(x.dose || '')}" ${coach ? '' : 'disabled'}></label><label><span>Momento</span><input class="input" data-cxt="${i}" value="${esc(x.timing || '')}" ${coach ? '' : 'disabled'}></label></div>
      ${x.note ? `<p class="small muted">${esc(x.note)}</p>` : ''}<p class="small">Tomas registradas en 14 días: <b>${logs.filter(l => l.supp_key === x.key).length}</b></p></div>`).join('')}
    ${coach ? '<div class="row-btns"><button class="btn sm" data-act="spCustom">+ Otro suplemento</button></div>' : ''}
    <label class="field"><span>Indicaciones generales</span><textarea class="input" id="sp-n" rows="3" ${coach ? '' : 'disabled'}>${esc(plan.notes || '')}</textarea></label>
    ${coach ? '<button class="btn primary block" data-act="spSave">Guardar protocolo</button>' : ''}
    ${(plan.items || []).length ? '<div class="row-btns"><button class="btn" data-act="pdf">PDF</button><button class="btn" data-act="html">HTML</button></div>' : ''}`;
  const docs = reportDocButtons(`Protocolo de suplementación - ${info.c.full_name || ''}`.replace(/[\\/:*?"<>|]/g, ''), logo => suppDocHtml(info, plan, w, logo));
  return {
    html, click: {
      ...docs,
      spSave: async () => {
        const its = Object.keys(SUPPS).filter(k => $(`[data-sp=${k}]`).checked).map(k => ({ key: k, dose: $(`[data-sd=${k}]`).value.trim(), timing: $(`[data-st=${k}]`).value.trim(), loading: !!($(`[data-sl=${k}]`) && $(`[data-sl=${k}]`).checked) }));
        (plan.items || []).filter(x => x.custom).forEach((x, i) => { if ($(`[data-cx="${i}"]`).checked) its.push(Object.assign({}, x, { dose: $(`[data-cxd="${i}"]`).value.trim(), timing: $(`[data-cxt="${i}"]`).value.trim() })); });
        const rec = { items: its, notes: $('#sp-n').value.trim() || null, updated_at: new Date().toISOString() };
        const ex = await supplementPlan(cid);
        if (ex) await DB.update('supplement_plans', cid, rec, 'client_id'); else await DB.insert('supplement_plans', Object.assign({ client_id: cid }, rec));
        toast('Protocolo guardado'); route();
      },
      spCustom: async () => {
        const name = prompt('Nombre del suplemento:', ''); if (!name || !name.trim()) return;
        const dose = prompt('Dosis:', '') || ''; const timing = prompt('Momento de la toma:', '') || '';
        const its = (plan.items || []).concat({ key: 'x_' + name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 30), custom: true, name: name.trim(), dose: dose.trim(), timing: timing.trim() });
        const ex = await supplementPlan(cid); const rec = { items: its, notes: plan.notes || null, updated_at: new Date().toISOString() };
        if (ex) await DB.update('supplement_plans', cid, rec, 'client_id'); else await DB.insert('supplement_plans', Object.assign({ client_id: cid }, rec));
        route();
      }
    }
  };
}
async function supplementCardHtml() {
  const plan = await supplementPlan(S.profile.id); if (!plan || !(plan.items || []).length) return '';
  const logs = await DB.select('supplement_logs', { eq: { client_id: S.profile.id, log_date: todayStr() } });
  return `<div class="card supp-today"><h3>Suplementos de hoy</h3>${plan.items.filter(x => suppOf(x)).map(x => { const done = logs.some(l => l.supp_key === x.key); return `<div class="fi${done ? ' done' : ''}"><button class="chk" data-act="supTick" data-k="${x.key}" aria-label="Marcar ${esc(suppOf(x).name)}">✓</button><div class="fi-b"><b>${esc(suppOf(x).name)}</b><small>${esc(x.dose)} · ${esc(x.timing)}</small></div></div>`; }).join('')}
    <a class="small" href="#/suplementos">Ver protocolo completo</a></div>`;
}
const supplementHandlers = after => ({
  supTick: async el => {
    const ex = (await DB.select('supplement_logs', { eq: { client_id: S.profile.id, log_date: todayStr(), supp_key: el.dataset.k } }))[0];
    if (ex) await DB.remove('supplement_logs', ex.id); else await DB.insert('supplement_logs', { client_id: S.profile.id, log_date: todayStr(), supp_key: el.dataset.k });
    after();
  }
});
async function vSuplementos() { const r = await suplementosTab(S.profile.id); paint(`<a class="linkbtn" href="#/hoy">← Hoy</a>` + r.html, { click: r.click }, 'Suplementación'); }

/* =====================================================================
   Ciclo menstrual
   ===================================================================== */
const PHASES = { menstrual: ['Menstrual', 'Priorizar alimentos con hierro (carnes rojas, hígado, leguminosas acompañadas de vitamina C) y la hidratación. Ajustar la intensidad del entrenamiento según los síntomas.'], folicular: ['Folicular', 'Fase con buena tolerancia a cargas altas en la mayoría de las deportistas. Mantener el plan.'], ovulatoria: ['Ovulatoria', 'Mantener el plan. Cuidar el calentamiento y la técnica en los cambios de dirección.'], lutea: ['Lútea', 'El gasto en reposo puede aumentar ligeramente y el apetito suele ser mayor: priorizar proteína y fibra en las comidas; si el hambre es alta, agregar un refrigerio de 100 a 200 kcal. La temperatura corporal es más alta: reforzar la hidratación y el sodio en calor.'] };
function cycleState(starts, date) {
  const s = starts.map(x => x.start_date).filter(d => d <= date).sort(); if (!s.length) return null;
  const gaps = s.slice(1).map((d, i) => daysBetween(s[i], d)).filter(g => g >= 20 && g <= 45).slice(-6);
  const len = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 28;
  const day = daysBetween(s[s.length - 1], date) + 1; const ov = len - 14;
  const phase = day <= 5 ? 'menstrual' : day < ov - 1 ? 'folicular' : day <= ov + 1 ? 'ovulatoria' : 'lutea';
  return { day, len, phase, next: addDays(s[s.length - 1], len), late: day > len + 7 };
}
const isFemale = d => d && d.sexo === 'Femenino' && d.embarazo !== 'Embarazo' && d.ciclo !== 'Ausente';
async function cycleCardHtml() {
  if (S.needsV6 || !S.intake || !isFemale(S.intake.data)) return '';
  try {
    const starts = await DB.select('cycle_logs', { eq: { client_id: S.profile.id }, order: 'start_date' });
    const st = cycleState(starts, todayStr());
    if (!st) return `<div class="card cyc"><b>Ciclo menstrual</b><small class="muted">Registra el primer día de tu periodo para ver la fase del ciclo y las recomendaciones de cada fase.</small><button class="btn sm" data-act="cycStart">Hoy inició mi periodo</button></div>`;
    const [nm, tip] = PHASES[st.phase];
    return `<div class="card cyc"><div class="day-h"><b>Fase ${esc(nm.toLowerCase())} · día ${st.day}</b><span class="badge">Ciclo de ${st.len} días</span></div><small class="muted">${esc(tip)}</small>${st.late ? '<small class="warn">El periodo lleva más de 7 días de retraso respecto al promedio.</small>' : ''}<button class="btn sm" data-act="cycStart">Hoy inició mi periodo</button></div>`;
  } catch (e) { return ''; }
}
const cycleHandlers = after => ({ cycStart: async () => { const ex = (await DB.select('cycle_logs', { eq: { client_id: S.profile.id, start_date: todayStr() } }))[0]; if (!ex) await DB.insert('cycle_logs', { client_id: S.profile.id, start_date: todayStr() }); toast('Inicio del periodo registrado'); after(); } });
async function rendCiclo(cid, info) {
  if (!isFemale(info.d)) return { html: '<div class="card empty"><p>El seguimiento del ciclo menstrual aplica a asesoradas.</p></div>' };
  const starts = await DB.select('cycle_logs', { eq: { client_id: cid }, order: 'start_date' });
  const since = starts.length ? starts[0].start_date : todayStr();
  const [wells, cks] = await Promise.all([DB.select('wellness', { eq: { client_id: cid }, gte: { log_date: since } }), DB.select('checkins', { eq: { client_id: cid }, gte: { check_date: since } })]);
  const agg = {}; Object.keys(PHASES).forEach(p => { agg[p] = { energy: [], mood: [], sore: [], hunger: [], perf: [] }; });
  wells.forEach(w => { const st = cycleState(starts, w.log_date); if (!st) return; const a = agg[st.phase]; a.energy.push(num(w.fatigue)); a.mood.push(num(w.mood)); a.sore.push(num(w.soreness)); });
  cks.forEach(c => { const st = cycleState(starts, c.check_date); if (!st) return; agg[st.phase].hunger.push(num(c.hunger)); agg[st.phase].perf.push(num(c.performance)); });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const chart = (k, l, scale) => `<div class="card"><h3>${l} por fase (1–${scale})</h3>${vbars(Object.keys(PHASES).map(p => ({ label: PHASES[p][0], value: avg(agg[p][k]), text: agg[p][k].length ? fmtN(avg(agg[p][k])) : '' })), 'Sin registros suficientes.')}</div>`;
  const st = cycleState(starts, todayStr());
  const html = `${st ? `<div class="stats3"><div><b>${esc(PHASES[st.phase][0])}</b><small>Fase actual</small></div><div><b>${st.day}</b><small>Día del ciclo</small></div><div><b>${st.len}</b><small>Duración promedio</small></div></div>` : ''}
    <div class="card"><h3>Inicios de periodo</h3><div class="rex-grid"><label><span>Fecha</span><input class="input" type="date" id="cy-d" value="${todayStr()}"></label></div><button class="btn primary block" data-act="cyAdd">Registrar</button>
      ${starts.length ? `<p class="small">${starts.slice(-8).reverse().map(s => `${fmtDM(parseDay(s.start_date))} <button class="linkbtn" data-act="cyDel" data-id="${s.id}">eliminar</button>`).join(' · ')}</p>` : ''}
      <p class="small muted">Fases estimadas por calendario: menstrual días 1–5, ovulatoria alrededor del día (duración − 14), lútea hasta el siguiente periodo. Es una estimación; la respuesta individual varía.</p></div>
    ${chart('energy', 'Energía (bienestar diario)', 5)}${chart('mood', 'Ánimo (bienestar diario)', 5)}${chart('hunger', 'Hambre (check-in)', 10)}${chart('perf', 'Rendimiento (check-in)', 10)}`;
  return {
    html, click: {
      cyAdd: async () => { const d = $('#cy-d').value; if (!d) return; if (!starts.some(s => s.start_date === d)) await DB.insert('cycle_logs', { client_id: cid, start_date: d }); toast('Registrado'); route(); },
      cyDel: async el => { await DB.remove('cycle_logs', el.dataset.id); route(); }
    }
  };
}

/* =====================================================================
   Guía para comer fuera de casa
   ===================================================================== */
async function vFuera() {
  const plan = await activePlanFor(S.profile.id);
  const lunch = plan ? plan.meals.find(m => /almuerzo/i.test(m.name)) || plan.meals[Math.floor(plan.meals.length / 2)] : null;
  const t = lunch ? mealAvg(lunch) : null;
  const palms = t ? Math.max(1, Math.round(t.protein / 28 * 2) / 2) : 1;
  const cups = t ? Math.max(0.5, Math.round((t.carbs * 0.75) / 45 * 2) / 2) : 1;
  const fr = x => String(x).replace('.5', '½').replace(/^0½/, '½');
  const P = `${fr(palms)} ${palms > 1 ? 'palmas' : 'palma'} de proteína (≈ ${fmtInt(palms * 110)} g en cocido)`;
  const C = `${fr(cups)} ${cups > 1 ? 'tazas' : 'taza'} de arroz, pasta o tubérculo (≈ ${fmtInt(cups * 160)} g)`;
  const S_ = [
    ['Corrientazo o menú del día', [`Proteína a la plancha, asada o sudada: ${P}.`, `Un solo carbohidrato: ${C}. Si trae arroz, papa y plátano, elegir uno.`, 'Ensalada o verduras: la mitad del plato.', 'Fríjol o lenteja: ½ taza en lugar de parte del arroz.', 'Bebida: agua o limonada sin azúcar. Sopa: preferir de verduras, sin crema.'], ['Fritos (chicharrón, carne apanada, papa frita, patacón frito)', 'Jugo con azúcar y postre en la misma comida']],
    ['Asadero o parrilla', [`Pollo sin piel, lomo de res o cerdo: ${P}.`, `Papa salada, arepa o yuca cocida: ${C}.`, 'Ensalada sin salsas cremosas; ají o limón.'], ['Chorizo, morcilla, chunchullo', 'Salsas a base de mayonesa']],
    ['Comida rápida', ['Hamburguesa sencilla o de pollo a la plancha, sin papas; agregar ensalada.', 'Sándwich o wrap de pollo con vegetales, sin salsas o con salsa aparte.', 'Pizza: 2 porciones de masa delgada con proteína (pollo, jamón) y vegetales, más ensalada.', 'Bebida sin azúcar.'], ['Combos agrandados', 'Doble queso, tocineta, salsas cremosas', 'Perro caliente con papitas y salsas']],
    ['Panadería', ['Huevos pericos o revueltos con 1 arepa o 1 pan.', 'Calentado: porción pequeña con huevo y sin chicharrón.', 'Café o chocolate en leche sin azúcar adicional.', 'Pandebono o almojábana: máximo 1 unidad, acompañada de proteína (huevo, queso, yogur).'], ['Buñuelos, empanadas y pasteles fritos', 'Roscones y tortas']],
    ['Comida china, wok o sushi', [`Wok de pollo, res o camarón con vegetales: ${P}.`, `Arroz blanco en lugar de arroz frito: ${C}.`, 'Sushi: 8–10 piezas de rollos sin tempura ni queso crema, o sashimi.'], ['Lumpias, tempura, arroz frito, salsas agridulces']],
    ['Tienda o estación de servicio (refrigerio)', ['Yogur griego o kumis + fruta.', 'Queso o maní (un puñado) + fruta.', 'Atún en lata + galletas de arroz.', 'Bebida: agua o bebida hidratante después de entrenar.'], ['Paquetes, gaseosas, galletas rellenas, chocolatinas']]];
  paint(`<a class="linkbtn" href="#/hoy">← Hoy</a>
    <p class="small muted">${t ? `Porciones calculadas con tu almuerzo del plan (${fmtInt(t.kcal)} kcal · P ${fmtInt(t.protein)} g · C ${fmtInt(t.carbs)} g · G ${fmtInt(t.fat)} g). Palma = tamaño y grosor de la palma de la mano sin dedos.` : 'Sin plan activo: porciones generales.'} Registra la comida en Hoy con «+ Añadir alimento» o «Registro rápido».</p>
    ${S_.map(([h, ok, no]) => `<div class="card"><h3>${esc(h)}</h3><ul class="plain ok">${ok.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="small"><b>Evitar:</b> ${esc(no.join('; '))}.</p></div>`).join('')}`, {}, 'Comer fuera de casa');
}

/* =====================================================================
   Registro por código de barras (Open Food Facts)
   ===================================================================== */
async function offLookup(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_es,brands,nutriments,serving_quantity,quantity`);
  if (!r.ok) throw new Error('No se pudo consultar Open Food Facts.');
  const j = await r.json(); if (!j || j.status !== 1 || !j.product) return null;
  const p = j.product, n = p.nutriments || {};
  const kcal = num(n['energy-kcal_100g']) || (num(n.energy_100g) ? num(n.energy_100g) / 4.184 : 0);
  return { code, name: [p.product_name_es || p.product_name, p.brands && p.brands.split(',')[0]].filter(Boolean).join(' · ') || 'Producto ' + code, kcal, protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), fat: num(n.fat_100g), serving: num(p.serving_quantity) || 0 };
}
function stopCamera() { if (S.camStream) { try { S.camStream.getTracks().forEach(t => t.stop()); } catch (e) { } S.camStream = null; } if (S.camCtl) { try { S.camCtl.stop(); } catch (e) { } S.camCtl = null; } clearInterval(S.camTick); }
async function startScanner(video, onCode) {
  stopCamera();
  if ('BarcodeDetector' in window) {
    const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    S.camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = S.camStream; await video.play();
    S.camTick = setInterval(async () => { try { const c = await det.detect(video); if (c[0]) { stopCamera(); onCode(c[0].rawValue); } } catch (e) { } }, 350);
    return;
  }
  if (!window.ZXingBrowser) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js'; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el lector de códigos.')); document.head.appendChild(s); });
  const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
  S.camCtl = await reader.decodeFromVideoDevice(undefined, video, (res) => { if (res) { stopCamera(); onCode(res.getText()); } });
}
function barcodeModal(o) {
  let prod = null;
  const draw = () => modal(`${modalHead('Escanear código de barras')}
    ${prod ? `<div class="card flat"><b>${esc(prod.name)}</b><div class="small muted">Por 100 g: ${fmtInt(prod.kcal)} kcal · P ${fmtN(prod.protein)} g · C ${fmtN(prod.carbs)} g · G ${fmtN(prod.fat)} g</div>
        <label class="field"><span>Cantidad (g o ml)</span><input class="input" id="bc-g" inputmode="decimal" value="${prod.serving || 100}"></label>
        <button class="btn primary block" data-act="bcSave">Añadir a ${esc(o.meal.name)}</button><button class="btn block" data-act="bcAgain">Escanear otro</button></div>
        <p class="small muted">Datos de Open Food Facts (base colaborativa). Verifica que coincidan con la etiqueta del empaque.</p>`
      : `<video id="bc-v" class="scan" playsinline muted></video><p class="small muted" id="bc-s">Apunta la cámara al código de barras del empaque.</p>
        <div class="vid-in"><input class="input" id="bc-c" inputmode="numeric" placeholder="O escribe el número del código"><button class="btn sm" data-act="bcFind">Buscar</button></div>`}`, h);
  const find = async code => {
    code = String(code || '').replace(/\D/g, ''); if (code.length < 8) return toast('Código no válido', 'error');
    $('#bc-s') && ($('#bc-s').textContent = 'Buscando ' + code + '…');
    try { prod = await offLookup(code); } catch (e) { return toast(errMsg(e), 'error'); }
    if (!prod || !prod.kcal) { prod = null; toast('Producto no encontrado o sin información nutricional. Usa «Registro rápido».', 'error'); return; }
    draw();
  };
  const h = {
    click: {
      bcFind: () => find($('#bc-c').value),
      bcAgain: () => { prod = null; draw(); begin(); },
      bcSave: async () => {
        const g = num($('#bc-g').value); if (g <= 0) return toast('Indica la cantidad', 'error'); const k = g / 100;
        await DB.insert('food_logs', { client_id: o.cid, log_date: o.date, meal_id: o.meal.id || null, meal_name: o.meal.name, food_id: null, plan_item_id: null, name: prod.name, grams: r1(g), kcal: r1(prod.kcal * k), protein: r1(prod.protein * k), carbs: r1(prod.carbs * k), fat: r1(prod.fat * k) });
        closeModal(); toast('Registrado'); await o.after();
      }
    }
  };
  const begin = () => { const v = $('#bc-v'); if (!v || !navigator.mediaDevices) return; startScanner(v, find).catch(e => { const s = $('#bc-s'); if (s) s.textContent = 'Cámara no disponible (' + errMsg(e) + '). Escribe el número del código.'; }); };
  draw(); begin();
}

/* =====================================================================
   Datos de demostración
   ===================================================================== */
function buildNutri2Demo(d) {
  const t = todayStr(); const iso = new Date().toISOString();
  Object.assign(d, { anthropometry: [], supplement_plans: [], supplement_logs: [], cycle_logs: [] });
  const base = { peso: 92.4, talla: 178, tri: 18, sub: 24, bi: 9, cresta: 30, supra: 22, abd: 34, muslo: 21, pant: 12, p_brazo: 34.5, p_brazof: 36.5, p_cintura: 101, p_cadera: 108, p_muslo: 60, p_pant: 39, d_humero: 7.1, d_femur: 10.2, d_muneca: 5.9 };
  d.anthropometry.push({ id: uid(), client_id: 'demo-juan', measure_date: addDays(t, -45), data: base, created_at: iso },
    { id: uid(), client_id: 'demo-juan', measure_date: addDays(t, -4), data: Object.assign({}, base, { peso: 89.6, tri: 16, sub: 21, supra: 19, abd: 30, muslo: 19, cresta: 27, p_cintura: 97, p_cadera: 106 }), created_at: iso });
  d.supplement_plans.push({ id: uid(), client_id: 'demo-ana', items: [{ key: 'creatina', dose: '3 g al día (0,03–0,1 g/kg)', timing: 'Diario, con una comida (cualquier hora)', loading: false }, { key: 'nitratos', dose: '6–8 mmol de nitrato (≈370–500 mg; 70–140 ml de jugo concentrado)', timing: '2–3 h antes de la competencia; en torneos, a diario desde 3 días antes', loading: false }], notes: 'Iniciar la creatina en la semana de descarga del torneo.', updated_at: iso });
  [-50, -22].forEach(o => d.cycle_logs.push({ id: uid(), client_id: 'demo-ana', start_date: addDays(t, o), created_at: iso }));
}
