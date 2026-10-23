# Deuce Point · Guía de la aplicación

Aplicación de entrenamiento y nutrición para los asesorados de Deuce Point. Funciona en el navegador (celular o computador) y se puede instalar en la pantalla de inicio desde el mismo enlace.

Dirección: https://samiro3014-svg.github.io/deuce-point/

---

## Flujo automatizado

1. **Registro.** El asesorado crea su cuenta con el enlace de la app.
2. **Valoración inicial.** Se le presenta el cuestionario en 6 pasos: datos personales, objetivo, salud (PAR-Q y tamizaje de conducta alimentaria), alimentación, actividad y descanso, y autorizaciones (Ley 1581 de 2012).
3. **Cálculo.** Mifflin-St Jeor × factor de actividad (según pasos, trabajo, días de entrenamiento y sesiones deportivas). Ajuste por objetivo: déficit 22 %, recomposición −10 %, superávit 12 % (configurables). Proteína en g/kg; en reducción de grasa con IMC mayor a 25 se usa el peso correspondiente a IMC 25.
4. **Generación del plan nutricional.** Se toma la plantilla asignada al objetivo (o el plan base de 5 comidas), se retiran los alimentos excluidos (restricciones, alergias, alimentos que no consume) reemplazándolos por equivalentes, y se ajustan las porciones por grupo para cumplir proteína, grasa y carbohidratos.
5. **Generación de la rutina.** Según días disponibles, lugar (gimnasio o casa con su equipamiento), experiencia, tiempo por sesión y deporte. Con tenis se agregan potencia y prevención de hombro.
6. **Revisión.** El plan y la rutina quedan como borrador en **Asesorados › Pendientes**. El entrenador revisa, edita si es necesario y pulsa **Aprobar y publicar**. Opcionalmente, en **Ajustes** se activa la publicación automática para valoraciones sin alertas.
7. **Seguimiento semanal.** Cada 7 días el asesorado recibe el check-in (peso, cintura, cumplimiento, energía, sueño, hambre, estrés, rendimiento). El entrenador ve el análisis con la sugerencia de ajuste calórico, aplica el ajuste con un botón y responde. La respuesta aparece en la pantalla Hoy del asesorado.

### Alertas que siempre requieren revisión del entrenador
PAR-Q con alguna respuesta «Sí» (se le indica al asesorado buscar autorización médica), tamizaje de conducta alimentaria positivo (sin déficit), embarazo o lactancia (sin déficit), menores de 18 años (sin déficit), lesiones, alergias, condiciones diagnosticadas, alimentación vegana, IMC menor a 18,5 con objetivo de pérdida y calorías por debajo del mínimo seguro.

---

## Funciones

### Asesorado
- **Hoy:** calorías y macronutrientes frente al objetivo, agua, entrenamiento sugerido, check-in pendiente, mensaje del entrenador y comidas del plan con opciones de menú, reemplazos equivalentes y registro de alimentos.
- **Entreno:** rutinas, registro de series, temporizador de descanso, variantes y **sugerencia de carga**: si en la sesión anterior completó el máximo de repeticiones en todas las series, la app propone subir entre 2,5 y 5 %.
- **Progreso:** entrenamiento, ejercicios, cuerpo (peso y medidas), nutrición (cumplimiento) y **fotos**.
- **Perfil:** valoración inicial en PDF y HTML, check-in, fotos y contacto por WhatsApp con el entrenador.

### Entrenador
- **Asesorados:** bandeja de pendientes (valoraciones nuevas, check-ins por revisar y asesorados sin registros durante 5 días con botón de WhatsApp).
- **Ficha del asesorado:** Valoración · Entreno · Nutrición · Seguimiento · Check-ins · Fotos · Sesiones · Ejercicios.
- **Valoración:** alertas, cálculo de requerimientos, sustituciones aplicadas, borradores generados, **Aprobar y publicar**, **Regenerar con ajustes** (objetivo, factor de actividad, ajuste %, número de comidas, proteína, grasa, días) y descarga en PDF y HTML.
- **Plantillas, Biblioteca, editor de planes y rutinas:** como en la versión anterior.
- **Ajustes:** publicación automática, porcentajes y g/kg del cálculo, plantilla por objetivo, textos por defecto, WhatsApp y llave de fotos.

---

## Fotos de progreso: privacidad

- Las fotos se cifran en el teléfono del asesorado (AES-256) antes de subirse. El servidor solo guarda archivos cifrados.
- Para verlas se necesita la **contraseña de fotos** del asesorado. Ni el entrenador ni el administrador del sistema pueden abrirlas sin ella.
- El asesorado decide si comparte sus fotos con el entrenador. Al compartir, su llave se cifra con la llave pública del entrenador; el entrenador las abre con **su propia** contraseña de fotos. Puede dejar de compartir en cualquier momento.
- Si el asesorado olvida su contraseña de fotos, las fotos no se pueden recuperar (solo eliminarlas y empezar de nuevo).
- Incluye comparación lado a lado por fecha y pose (frente, perfil, espalda).

---

## Actualización a esta versión (una sola vez)

1. **Supabase › SQL Editor › New query:** pegar todo `supabase/migracion-v3.sql` → **Run**. Debe terminar en *Success*. Se puede ejecutar de nuevo sin causar errores.
2. **Supabase › Storage:** verificar que aparece el bucket privado `progress-photos` (lo crea el script).
3. **En la app, como entrenador › Perfil › Ajustes:**
   - Escribir tu número de WhatsApp.
   - Activar la recepción de fotos (crear tu contraseña de fotos del entrenador, mínimo 10 caracteres).
   - Elegir la plantilla general y, si se desea, una plantilla por objetivo.
   - Decidir si se activa la publicación automática.

Para una instalación nueva, `supabase/schema.sql` ya incluye todo.

---

## Instalación inicial (referencia)

1. Supabase: proyecto nuevo, ejecutar `supabase/schema.sql`, desactivar «Confirm email» (Authentication › Sign In / Providers › Email), configurar Site URL y Redirect URLs con la dirección de la app.
2. `config.js`: Project URL y clave pública (anon).
3. GitHub Pages: Settings › Pages › main / (root).
4. Cuenta de entrenador: crear la cuenta en la app y ejecutar
   `update public.profiles set role = 'coach' where email = 'tucorreo@gmail.com';`
5. Correo de recuperación de contraseña: Authentication › Emails › SMTP Settings con Gmail (smtp.gmail.com, puerto 465, contraseña de aplicación).

## Seguridad

- Cada asesorado solo ve y registra sus propios datos (políticas RLS verificadas).
- El asesorado solo puede crear sus propios borradores generados por la valoración; no puede publicarlos ni modificarlos si la publicación automática está desactivada.
- Solo el entrenador modifica planes aprobados, rutinas, plantillas, bibliotecas y ajustes.
- El entrenador no puede modificar ni borrar las fotos ni las llaves de los asesorados.
- Al cerrar sesión se eliminan de la memoria las llaves de fotos y las imágenes descifradas.

## Modo demostración

Con `SUPABASE_URL` vacío la app abre en modo demo: un entrenador, dos asesorados con historial y una asesorada nueva (Laura) para probar la valoración inicial.
