'use strict';
/* =====================================================================
   Deuce Point · Fotos de progreso cifradas
   - Cada asesorado tiene una llave AES-256 propia, generada en su dispositivo.
   - La llave se guarda cifrada con su contraseña de fotos (PBKDF2-SHA256, 310.000 iteraciones).
   - Las fotos se cifran en el dispositivo antes de subirlas: el servidor solo almacena datos cifrados.
   - Compartir con el entrenador: la llave se cifra con la llave pública RSA-OAEP del entrenador.
     El entrenador la abre con su propia contraseña. El asesorado puede dejar de compartir en cualquier momento.
   ===================================================================== */
const PHOTO_BUCKET = 'progress-photos';
const POSES = ['Frente', 'Perfil', 'Espalda'];
S.photoKey = null; S.photoRaw = null; S.coachPriv = null; S.photoCache = {}; S.clientKeys = {}; S.cmp = {};

/* ---------- criptografía ---------- */
const textEnc = new TextEncoder();
function b64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pwKey(pw, salt) {
  const base = await crypto.subtle.importKey('raw', textEnc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function sealWithPassword(pw, bytes) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pwKey(pw, salt), bytes);
  return { salt: b64(salt), iv: b64(iv), wrapped: b64(ct) };
}
async function openWithPassword(pw, row) {
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, await pwKey(pw, unb64(row.salt)), unb64(row.wrapped))); }
  catch (e) { throw new Error('Contraseña incorrecta.'); }
}
const aesImport = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function wrapForCoach(raw) {
  const jwk = S.settings.coach_public_key; if (!jwk) return null;
  const pub = await crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  return b64(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw));
}

/* ---------- almacenamiento de archivos (Supabase Storage o IndexedDB en la demo) ---------- */
const demoFiles = (() => {
  let p;
  const db = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('dp_demo_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('f', mode); const rq = fn(t.objectStore('f')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); };
  return { put: (k, v) => tx('readwrite', s => s.put(v, k)), get: k => tx('readonly', s => s.get(k)), del: k => tx('readwrite', s => s.delete(k)) };
})();
const Files = {
  async put(path, bytes) {
    if (DEMO) return demoFiles.put(path, bytes.buffer.slice(0));
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, new Blob([bytes], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' });
    if (error) throw error;
  },
  async get(path) {
    if (DEMO) { const v = await demoFiles.get(path); if (!v) throw new Error('Archivo no encontrado.'); return new Uint8Array(v); }
    const { data, error } = await sb.storage.from(PHOTO_BUCKET).download(path); if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  },
  async del(path) {
    if (DEMO) return demoFiles.del(path);
    const { error } = await sb.storage.from(PHOTO_BUCKET).remove([path]); if (error) throw error;
  }
};

/* ---------- imágenes ---------- */
async function resizeImage(file, max = 1280) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('No se pudo leer la imagen. Usa una foto en formato JPG o PNG.')); im.src = URL.createObjectURL(file); }); }
  const w = src.width, h = src.height, s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('No se pudo procesar la imagen.')), 'image/jpeg', 0.85));
}
async function decryptPhoto(key, row) {
  if (S.photoCache[row.id]) return S.photoCache[row.id];
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, key, await Files.get(row.path));
  return (S.photoCache[row.id] = URL.createObjectURL(new Blob([pt], { type: 'image/jpeg' })));
}
function fillPhotos(key) {
  document.querySelectorAll('img[data-ph]').forEach(async img => {
    try { img.src = await decryptPhoto(key, JSON.parse(img.dataset.ph)); }
    catch (e) { img.replaceWith(Object.assign(document.createElement('div'), { className: 'ph-err', textContent: 'No se pudo abrir' })); }
  });
}
const phData = r => esc(JSON.stringify({ id: r.id, path: r.path, iv: r.iv }));

/* Galería y comparación (compartida entre asesorado y entrenador) */
function galleryHtml(photos, canDelete) {
  if (!photos.length) return '<div class="card empty"><p>Sin fotos registradas.</p></div>';
  const dates = [...new Set(photos.map(p => p.taken_on))].sort().reverse();
  const pose = S.cmp.pose || POSES[0];
  const withPose = [...new Set(photos.filter(p => p.pose === pose).map(p => p.taken_on))].sort();
  const a = withPose.includes(S.cmp.a) ? S.cmp.a : withPose[0], b = withPose.includes(S.cmp.b) ? S.cmp.b : withPose[withPose.length - 1];
  const ph = (d) => photos.find(p => p.pose === pose && p.taken_on === d);
  const cmp = withPose.length >= 2 ? `<div class="card"><h3>Comparar</h3>
      <div class="chips">${POSES.map(p => `<button class="chip${p === pose ? ' on' : ''}" data-act="cmpPose" data-v="${p}">${p}</button>`).join('')}</div>
      <div class="cmp">${[['a', a], ['b', b]].map(([k, d]) => `<div><select class="input" data-cmp="${k}">${withPose.map(x => `<option value="${x}"${x === d ? ' selected' : ''}>${esc(fmtDayLong(x))}</option>`).join('')}</select><img data-ph="${phData(ph(d))}" alt="Foto ${esc(pose)} ${esc(d)}"></div>`).join('')}</div></div>`
    : `<div class="card"><h3>Comparar</h3><div class="chips">${POSES.map(p => `<button class="chip${p === pose ? ' on' : ''}" data-act="cmpPose" data-v="${p}">${p}</button>`).join('')}</div><p class="small muted">Se necesitan al menos dos fechas con fotos de ${esc(pose.toLowerCase())} para comparar.</p></div>`;
  return cmp + dates.map(d => `<div class="card"><h3>${esc(fmtDayLong(d))}</h3><div class="ph-grid">${photos.filter(p => p.taken_on === d).map(p => `<figure><img data-ph="${phData(p)}" alt="Foto ${esc(p.pose || '')}"><figcaption>${esc(p.pose || '')}${canDelete ? ` <button class="icon-btn danger" data-act="phDel" data-id="${p.id}" aria-label="Eliminar foto">✕</button>` : ''}</figcaption></figure>`).join('')}</div></div>`).join('');
}
const cmpHandlers = (rerender) => ({ cmpPose: el => { S.cmp.pose = el.dataset.v; S.cmp.a = S.cmp.b = null; rerender(); } });
const cmpChange = (t, rerender) => { if (t.dataset.cmp) { S.cmp[t.dataset.cmp] = t.value; rerender(); return true; } return false; };

/* =====================================================================
   ASESORADO · Progreso › Fotos
   ===================================================================== */
async function vFotos() {
  const cid = S.profile.id; const head = progSeg('fotos');
  const vault = (await DB.select('photo_vaults', { eq: { owner_id: cid } }))[0];
  const rerender = () => keepScroll(() => vFotos());
  const coachReady = !!S.settings.coach_public_key;

  if (!vault) {
    return paint(head + `<div class="card"><h3>Protege tus fotos con una contraseña</h3>
      <p class="small">Las fotos se cifran en tu teléfono antes de subirse. Sin esta contraseña nadie puede verlas: ni tu entrenador ni el administrador del sistema, salvo que tú decidas compartirlas.</p>
      <p class="warn-box small">Si olvidas esta contraseña, las fotos no se pueden recuperar. Guárdala en un lugar seguro. Puede ser distinta a la contraseña de tu cuenta.</p>
      <label class="field"><span>Contraseña de fotos (mínimo 8 caracteres)</span><input class="input" type="password" id="pv-1" autocomplete="new-password"></label>
      <label class="field"><span>Confirmar contraseña</span><input class="input" type="password" id="pv-2" autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" id="pv-share" ${coachReady ? '' : 'disabled'}> Permitir que mi entrenador vea mis fotos</label>
      ${coachReady ? '<p class="small muted">Puedes cambiar esta decisión en cualquier momento.</p>' : '<p class="small muted">Tu entrenador aún no ha activado la recepción de fotos. Podrás compartirlas más adelante.</p>'}
      <button class="btn primary block" data-act="create">Crear contraseña de fotos</button></div>`, {
      click: {
        create: async el => {
          const p1 = $('#pv-1').value, p2 = $('#pv-2').value;
          if (p1.length < 8) return toast('La contraseña debe tener mínimo 8 caracteres', 'error');
          if (p1 !== p2) return toast('Las contraseñas no coinciden', 'error');
          el.disabled = true; el.textContent = 'Creando…';
          const raw = crypto.getRandomValues(new Uint8Array(32));
          const sealed = await sealWithPassword(p1, raw);
          const share = $('#pv-share').checked && coachReady;
          await DB.insert('photo_vaults', { owner_id: cid, kind: 'client', ...sealed, coach_key: share ? await wrapForCoach(raw) : null, coach_key_id: share ? S.settings.coach_key_id : null });
          S.photoRaw = raw; S.photoKey = await aesImport(raw);
          toast('Contraseña de fotos creada'); rerender();
        }
      }
    }, 'Progreso');
  }

  if (!S.photoKey) {
    return paint(head + `<div class="card"><h3>Fotos protegidas</h3><p class="small muted">Escribe tu contraseña de fotos para verlas y subir nuevas.</p>
      <label class="field"><span>Contraseña de fotos</span><input class="input" type="password" id="pv-u" autocomplete="current-password"></label>
      <button class="btn primary block" data-act="unlock">Desbloquear</button>
      <button class="linkbtn" data-act="forgot">Olvidé mi contraseña de fotos</button></div>`, {
      click: {
        unlock: async el => {
          el.disabled = true; el.textContent = 'Verificando…';
          try { const raw = await openWithPassword($('#pv-u').value, vault); S.photoRaw = raw; S.photoKey = await aesImport(raw); rerender(); }
          catch (e) { el.disabled = false; el.textContent = 'Desbloquear'; toast(e.message, 'error'); }
        },
        forgot: async () => {
          if (!confirm('Sin la contraseña, las fotos actuales no se pueden recuperar. ¿Eliminar todas tus fotos y crear una contraseña nueva?')) return;
          if (!confirm('Esta acción es definitiva. ¿Confirmas que deseas eliminar todas tus fotos de progreso?')) return;
          for (const p of await DB.select('progress_photos', { eq: { client_id: cid } })) { await Files.del(p.path).catch(() => { }); await DB.remove('progress_photos', p.id); }
          await DB.remove('photo_vaults', cid, 'owner_id');
          toast('Fotos eliminadas. Crea una contraseña nueva.'); rerender();
        }
      }
    }, 'Progreso');
  }

  const photos = await DB.select('progress_photos', { eq: { client_id: cid }, order: 'taken_on', asc: false });
  const shared = !!vault.coach_key && vault.coach_key_id === S.settings.coach_key_id;
  S.cmp.upPose = S.cmp.upPose || POSES[0];
  paint(head + `
    <div class="card"><div class="day-h"><div><h3>Privacidad</h3><small class="muted">${shared ? 'Tu entrenador puede ver tus fotos.' : 'Solo tú puedes ver tus fotos.'}</small></div><span class="badge ${shared ? 'ok' : ''}">${shared ? 'Compartidas' : 'Privadas'}</span></div>
      <div class="row-btns">${shared ? '<button class="btn sm" data-act="unshare">Dejar de compartir</button>' : `<button class="btn sm primary" data-act="share" ${coachReady ? '' : 'disabled'}>Compartir con mi entrenador</button>`}<button class="btn sm" data-act="chpw">Cambiar contraseña</button><button class="btn sm" data-act="lock">Bloquear</button></div>
      ${!coachReady && !shared ? '<p class="small muted">Tu entrenador aún no ha activado la recepción de fotos.</p>' : ''}</div>
    <div class="card"><h3>Subir foto</h3>
      <p class="small muted">Misma luz, misma distancia y ropa similar en cada toma. Se recomienda una foto de frente, perfil y espalda cada 2 a 4 semanas.</p>
      <label class="field"><span>Fecha</span><input class="input" type="date" id="up-d" value="${todayStr()}"></label>
      <div class="chips">${POSES.map(p => `<button class="chip${p === S.cmp.upPose ? ' on' : ''}" data-act="upPose" data-v="${p}">${p}</button>`).join('')}</div>
      <label class="btn block file-btn">Elegir o tomar foto<input type="file" id="up-f" accept="image/*" hidden></label>
      <p class="small muted" id="up-msg"></p></div>
    ${galleryHtml(photos, true)}`, {
    click: {
      ...cmpHandlers(rerender),
      upPose: el => { S.cmp.upPose = el.dataset.v; document.querySelectorAll('[data-act=upPose]').forEach(c => c.classList.toggle('on', c.dataset.v === S.cmp.upPose)); },
      lock: () => { S.photoKey = S.photoRaw = null; rerender(); },
      share: async () => { await DB.update('photo_vaults', cid, { coach_key: await wrapForCoach(S.photoRaw), coach_key_id: S.settings.coach_key_id, updated_at: new Date().toISOString() }, 'owner_id'); toast('Fotos compartidas con tu entrenador'); rerender(); },
      unshare: async () => { await DB.update('photo_vaults', cid, { coach_key: null, coach_key_id: null, updated_at: new Date().toISOString() }, 'owner_id'); toast('Tu entrenador ya no tiene acceso a tus fotos'); rerender(); },
      chpw: () => modal(`${modalHead('Cambiar contraseña de fotos')}
          <label class="field"><span>Nueva contraseña (mínimo 8 caracteres)</span><input class="input" type="password" id="np-1" autocomplete="new-password"></label>
          <label class="field"><span>Confirmar</span><input class="input" type="password" id="np-2" autocomplete="new-password"></label>
          <button class="btn primary block" data-act="save">Guardar</button>`, {
        click: { save: async () => { const a = $('#np-1').value; if (a.length < 8) return toast('Mínimo 8 caracteres', 'error'); if (a !== $('#np-2').value) return toast('Las contraseñas no coinciden', 'error'); await DB.update('photo_vaults', cid, { ...(await sealWithPassword(a, S.photoRaw)), updated_at: new Date().toISOString() }, 'owner_id'); closeModal(); toast('Contraseña actualizada'); } }
      }),
      phDel: async el => {
        if (!confirm('¿Eliminar esta foto?')) return;
        const p = photos.find(x => x.id === el.dataset.id); await Files.del(p.path).catch(() => { }); await DB.remove('progress_photos', p.id); rerender();
      }
    },
    change: async t => {
      if (cmpChange(t, rerender)) return;
      if (t.id !== 'up-f' || !t.files[0]) return;
      const msg = $('#up-msg'); msg.textContent = 'Cifrando y subiendo…';
      try {
        const blob = await resizeImage(t.files[0]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, S.photoKey, await blob.arrayBuffer()));
        const path = `${cid}/${uid()}.bin`;
        await Files.put(path, ct);
        try { await DB.insert('progress_photos', { client_id: cid, taken_on: $('#up-d').value || todayStr(), pose: S.cmp.upPose, path, iv: b64(iv) }); }
        catch (e) { await Files.del(path).catch(() => { }); throw e; }
        toast('Foto guardada'); rerender();
      } catch (e) { msg.textContent = ''; toast(errMsg(e), 'error'); }
    }
  }, 'Progreso');
  fillPhotos(S.photoKey);
}

/* =====================================================================
   ENTRENADOR · Llave de fotos (Ajustes)
   ===================================================================== */
async function coachKeyCardHtml() {
  const v = (await DB.select('photo_vaults', { eq: { owner_id: S.profile.id } }))[0];
  const active = v && S.settings.coach_public_key;
  return `<div class="card"><h3>Fotos de progreso</h3>
    <p class="small">Las fotos de los asesorados están cifradas. Solo puedes verlas si cada asesorado decide compartirlas contigo. Para recibirlas, crea tu llave de fotos protegida con una contraseña propia.</p>
    ${active ? `<p class="small"><span class="badge ok">Llave activa</span></p>
      <button class="btn sm danger-outline" data-act="ckReset">Crear una llave nueva</button>
      <p class="small muted">Úsalo solo si olvidaste tu contraseña de fotos: los asesorados que ya compartieron deberán volver a compartir.</p>`
    : `<label class="field"><span>Contraseña de fotos del entrenador (mínimo 10 caracteres)</span><input class="input" type="password" id="ck-1" autocomplete="new-password"></label>
      <label class="field"><span>Confirmar</span><input class="input" type="password" id="ck-2" autocomplete="new-password"></label>
      <button class="btn primary" data-act="ckCreate">Activar recepción de fotos</button>`}</div>`;
}
async function createCoachKey(pw) {
  const kp = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const sealed = await sealWithPassword(pw, priv);
  const ex = (await DB.select('photo_vaults', { eq: { owner_id: S.profile.id } }))[0];
  if (ex) await DB.update('photo_vaults', S.profile.id, { kind: 'coach', ...sealed, updated_at: new Date().toISOString() }, 'owner_id');
  else await DB.insert('photo_vaults', { owner_id: S.profile.id, kind: 'coach', ...sealed });
  await saveSettings({ coach_public_key: pub, coach_key_id: uid() });
  S.coachPriv = kp.privateKey; S.clientKeys = {};
}
function coachKeyHandlers() {
  return {
    ckCreate: async el => {
      const a = $('#ck-1').value; if (a.length < 10) return toast('Mínimo 10 caracteres', 'error'); if (a !== $('#ck-2').value) return toast('Las contraseñas no coinciden', 'error');
      el.disabled = true; el.textContent = 'Creando llave…'; await createCoachKey(a); toast('Recepción de fotos activada'); route();
    },
    ckReset: async () => {
      if (!confirm('Al crear una llave nueva, perderás acceso a las fotos compartidas hasta que cada asesorado vuelva a compartirlas. ¿Continuar?')) return;
      const a = prompt('Nueva contraseña de fotos del entrenador (mínimo 10 caracteres):'); if (!a) return;
      if (a.length < 10) return toast('Mínimo 10 caracteres', 'error');
      await createCoachKey(a); toast('Llave nueva creada'); route();
    }
  };
}

/* =====================================================================
   ENTRENADOR · Pestaña Fotos del asesorado
   ===================================================================== */
async function coachFotosTab(cid) {
  const vault = (await DB.select('photo_vaults', { eq: { owner_id: cid } }))[0];
  const count = (await DB.select('progress_photos', { eq: { client_id: cid } })).length;
  const msg = t => ({ html: `<div class="card empty"><p>${t}</p>${count ? `<p class="small muted">El asesorado tiene ${count} ${count === 1 ? 'foto protegida' : 'fotos protegidas'}.</p>` : ''}</div>` });
  if (!vault || !vault.coach_key) return msg('El asesorado no ha compartido sus fotos de progreso.');
  if (!S.settings.coach_public_key) return { html: '<div class="card empty"><p>Activa la recepción de fotos en Ajustes para poder verlas.</p><a class="btn" href="#/ajustes">Ir a Ajustes</a></div>' };
  if (vault.coach_key_id !== S.settings.coach_key_id) return msg('Las fotos se compartieron con una llave anterior. El asesorado debe volver a activar «Compartir con mi entrenador».');
  if (!S.coachPriv) {
    const mine = (await DB.select('photo_vaults', { eq: { owner_id: S.profile.id } }))[0];
    return {
      html: `<div class="card"><h3>Fotos compartidas</h3><p class="small muted">Escribe tu contraseña de fotos del entrenador para verlas.</p>
        <label class="field"><span>Contraseña</span><input class="input" type="password" id="cu-p" autocomplete="current-password"></label>
        <button class="btn primary" data-act="cUnlock">Desbloquear</button></div>`,
      click: {
        cUnlock: async el => {
          el.disabled = true;
          try { const pk = await openWithPassword($('#cu-p').value, mine); S.coachPriv = await crypto.subtle.importKey('pkcs8', pk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']); route(); }
          catch (e) { el.disabled = false; toast(e.message, 'error'); }
        }
      }
    };
  }
  if (!S.clientKeys[cid]) {
    const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, S.coachPriv, unb64(vault.coach_key)));
    S.clientKeys[cid] = await aesImport(raw);
  }
  const photos = await DB.select('progress_photos', { eq: { client_id: cid }, order: 'taken_on', asc: false });
  const rerender = () => keepScroll(() => route());
  return { html: galleryHtml(photos, false), click: cmpHandlers(rerender), change: t => cmpChange(t, rerender), after: () => fillPhotos(S.clientKeys[cid]) };
}
