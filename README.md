# Deuce Point · Guía de la aplicación

Aplicación de entrenamiento y nutrición para los asesorados de Deuce Point. Funciona en el navegador (celular o computador) y se puede instalar en la pantalla de inicio desde el mismo enlace.

Dirección: https://samiro3014-svg.github.io/deuce-point/

---

## Novedades de la versión 10 · alimentación, entrenamiento, seguimiento y negocio

**Alimentación**
- Lista de compras: **comparación por supermercado** (precio por kg en cada uno; total por tienda y compra combinada), **opciones para ahorrar** con equivalentes más baratos y **personas del hogar** (adultos y niños).
- Al reemplazar un alimento: costo de cada porción, opción económica y aviso **«Excluido en la valoración»** (alergias, restricciones, «no me gusta»).
- **Modo viaje** (avión, carretera, torneo fuera): kit de refrigerios calculado con los macronutrientes de tus refrigerios del plan y lista para empacar.
- **Comer fuera de casa:** comida típica, mexicana y buffet, y registro rápido de la comida según la guía (80 / 100 / 130 %).
- **Video de la receta** por opción del menú (editor del plan). **Escáner:** alérgenos, equivalencia con la comida del plan y fibra/azúcar/sodio.
- **Ajuste por tendencia de peso** (Pendientes): regresión de los pesos de 3–4 semanas; aplica ±kcal y avisa al asesorado.
- **Carga de carbohidratos** de 48 h por torneo (g/kg configurable). **Hidratación por clima** con la ciudad del asesorado (Open-Meteo). **Alcohol** con su energía y bebidas estándar.
- **Fibra, sodio y azúcares** del día (sodio y azúcar se registran en Biblioteca › Alimentos). **Refrigerios de torneo** con calculadora por duración. **Medidas caseras** (pocillo, cucharón, tajada…) editables en Ajustes; botón «Casera» en Hoy.

**Entrenamiento**
- **Bloques de periodización** con línea de tiempo, rutina por bloque y activación en Pendientes o automática. El asesorado ve el bloque y la semana en Entreno.
- **Fuerza estimada por mes** (4 ejercicios principales). **VFC, pulso en reposo y horas de sueño** en el bienestar; la VFC baja activa la sugerencia de ajuste de la sesión.
- **Calentamiento RAMP de tenis**, movilidad de cadera y hombro, recuperación y respiración **guiados con temporizador**. **Saques y golpes** por sesión con aviso de aumento brusco.
- **Monotonía y tensión** (Foster) en Carga. **Video propio** por ejercicio (archivo privado). **Entrenar en casa** con el equipo disponible. **Progresión por RIR objetivo**.

**Experiencia del asesorado**
- **Registro sin conexión** (cola local que se envía al volver la señal). **Contador** de comidas pendientes en el ícono y **accesos directos** (mantener pulsado el ícono en Android).
- «Solo avisar lo que falta» en las notificaciones. **Logros clínicos** (sueño, proteína, fibra, bienestar, pasos, metas). **Notas del día** con estado de ánimo.
- **Fotos y audios en el chat**. **Calendario mensual** por cumplimiento. **Meta semanal** propuesta por el asesorado y aprobada o ajustada por el entrenador. **Tutoriales** (videos en Ajustes y guía rápida).

**Seguimiento y análisis**
- **Panel del grupo**, **informe para el entrenador del club** (requiere confirmar la autorización), **perfiles similares**, **riesgo de abandono**, ciclo menstrual cruzado con calorías, saciedad y volumen.
- **Laboratorios** con rangos de referencia y gráfica por examen; **bioimpedancia** comparando solo mediciones en las mismas condiciones.
- **Tipo de informe mensual** por asesorado (tenista, pérdida de peso, ganancia, solo nutrición). **Check-in en un toque** con respuestas guardadas. **Agenda de citas** con horarios, solicitudes, confirmación y avisos 24 h y 2 h antes.

**Negocio**
- **Pago reportado** por el asesorado con comprobante y cupón; al confirmarlo se registra el pago, se renueva la membresía y se avisa. **Retos pagos** e **inscripción**; **asignar una plantilla a varios asesorados**.
- **Cupones** y **promoción de temporada** (también en la página de captación). **Afiliados** con enlace, prospectos, asesorados y comisión. **Recibos de pago** numerados (no son factura electrónica).
- **Testimonios publicados** en la página de captación (solo con autorización). **NPS por mes**. **Contrato de servicio** con firma en la app y versión. **Asistentes** con asesorados asignados (Ajustes › Equipo y la ficha). **Marca propia** (nombre, colores y logo).

## Actualización a la versión 10
1. **Supabase › SQL Editor:** ejecutar `supabase/migracion-v10.sql` (requiere la v9).
2. **Supabase › Edge Functions › enviar-notificaciones:** reemplazar el código por `supabase/functions/enviar-notificaciones/index.ts` y publicar (solo avisos de lo que falta, citas, pagos y metas).
3. **Ajustes:** supermercados, medidas caseras, horarios de agenda, cupones, afiliados, datos de recibos, contrato y marca.

## Novedades de la versión 9 · registro rápido, días difíciles y seguimiento

**Para el asesorado (pantalla Hoy)**
- **Más** en cada comida: copiar otra comida del día (porciones ajustadas a las kcal de la comida de destino; cuenta como comida cumplida), repetir lo de ayer, comidas guardadas, porción 75 / 100 / 125 % y «¿Cómo te sentó?» (saciedad y digestión).
- **Siguiente comida** arriba, con «Marcar todo». **Gramos o Mano** (palmas, puños, pulgares; equivalencias en Ajustes). **Botella propia** para el agua.
- **Acciones rápidas:** semana del plan, repetir el día de ayer, evento social (cuenta la comida y compensa hasta 15 % de las kcal en los 3 días siguientes, configurable), otras actividades (carrera, bicicleta, clase, etc., suman al gasto) y «No pude seguir el plan» (motivo y detalle; llega a tu bandeja).
- **Recorrido inicial** de 4 pasos, **resumen semanal** (domingo y lunes), **modo competencia** (línea de tiempo del protocolo con la hora de inicio y alarmas en el calendario), **modo oscuro** y **letra grande** (Perfil).
- **Preparación en lote:** cantidades a cocinar en cada día de preparación, en cocido y en crudo.
- **Modo cocina** en Preparación: pasos grandes, pantalla encendida y temporizadores.
- **Entreno:** sugerencia de ajuste si el bienestar del día está en amarillo o rojo, calentamiento según los grupos musculares, aviso de récord al completar una serie, alternativas por equipo (máquina ocupada) y **video de técnica** para enviar al entrenador.
- **Perfil:** videos de técnica, acceso para acudientes (enlace de solo lectura revocable), autorización para mostrar resultados y **Mis datos** en PDF, HTML y Excel.
- **Notificaciones con acción:** «Marcar como hecha» en comidas, «+250 ml» en agua y «Tomado» en suplementos (hora del recordatorio en el protocolo de suplementos).

**Para el entrenador**
- **Semáforo** en la lista de asesorados (registro, bienestar, molestias, días sin seguir el plan) con el motivo.
- **Bandeja:** mensajes sugeridos o automáticos por regla (3 días sin registro, 7 días cumpliendo hábitos, meta alcanzada, check-in atrasado), plan para revisar por antigüedad, próximo control, metas vencidas, «no siguió el plan», videos y cuestionarios respondidos.
- **Ficha:** próximo control, notas privadas, cuestionarios (plantillas propias con puntaje y rangos en Ajustes), videos de técnica con respuesta, hábitos de alimentación (reemplazos frecuentes, comidas reemplazadas, saciedad y digestión), comparación entre expedientes y tarjeta de resultados (solo con autorización).
- **Editor:** copiar una comida en otra o en otro tipo de día. **Anexo:** `IGUAL: Almuerzo` para repetir una comida sin reescribir los alimentos.
- El paquete para la IA incluye reemplazos, comidas reemplazadas, saciedad, días sin seguir el plan y cuestionarios.

## Actualización a la versión 9
1. **Supabase › SQL Editor:** ejecutar `supabase/migracion-v9.sql` (incluye v4 a v7).
2. Si usas notificaciones push: volver a publicar `enviar-notificaciones` con el archivo actualizado (acciones en las notificaciones, recordatorio de suplementos y resumen semanal).
3. Ajustes: plantillas de cuestionarios, reglas de mensajes automáticos, semanas para revisar el plan, compensación máxima por evento y medidas con la mano.
4. En tu IA: reemplazar la instrucción por el nuevo «Formato del informe» (agrega `IGUAL:` y la hora en `SUPLEMENTO:`).

## Novedades de la versión 8 · personalización y experiencia

- **Hábitos diarios:** el anexo admite `HABITO: acción | frecuencia`. El asesorado los marca en Hoy y el cumplimiento de 7 días aparece en el expediente y en el paquete para la IA. También se agregan o quitan desde el expediente.
- **Metas medibles:** `META: variable | inicial | meta | unidad | fecha`. Peso, cintura, % grasa, pasos, agua, cumplimiento del plan y hábitos se actualizan solos con los registros; las demás se actualizan desde el expediente. Se muestran como barras de avance en Hoy y en Mi plan.
- **Visibilidad por sección:** botones Visible/Oculto en cada sección del expediente; ajuste automático para asesorías de solo nutrición o solo entrenamiento.
- **Módulos por asesorado:** en la ficha, «Módulos visibles para el asesorado» (bienestar, pasos, suplementos, rendimiento deportivo, ciclo, racha y logros, lecciones, retos, fotos).
- **Hoy simplificado:** máximo dos pendientes arriba, después las metas del día (macronutrientes, hábitos, metas, agua), entrenamiento y comidas; lo secundario al final.
- **Mi plan** en la barra principal del asesorado.
- **Ficha agrupada:** Expediente · Plan · Seguimiento · Mensajes.
- **Uso de la API** en Ajustes: documentos convertidos y costo por mes.
- **Consentimiento:** la autorización de datos menciona el procesamiento por proveedores tecnológicos (aplica a las nuevas valoraciones).

No requiere migración nueva: funciona con la v7.

## Novedades de la versión 7 · individualización

### Tipos de día en el plan nutricional
- Cada plan puede tener varios **tipos de día** (por ejemplo A = doble sesión, B = sesión normal, C = descanso), cada uno con metas propias (kcal, proteína, carbohidratos, grasa, agua), indicaciones y menú completo.
- Cada tipo se asigna a días de la semana. Las **fechas especiales** cambian el tipo de día en periodos concretos (taper, carga de carbohidratos, competencia) o el porcentaje de las porciones de carbohidratos (progresión, por ejemplo 80 % la primera semana).
- **Rotaciones:** una opción de comida se puede asignar a días de la semana (por ejemplo, la proteína de la cena: pollo lunes, miércoles y sábado; lenteja martes y viernes). En Hoy aparece seleccionada la opción del día.
- **Editor:** «+ Tipo de día» copia el menú de otro tipo y ajusta las porciones a las nuevas metas por grupo (proteína, carbohidratos y grasa).
- **Hoy:** el asesorado ve el tipo de día de la fecha, sus metas y el menú correspondiente; puede elegir otro tipo si su día cambió.
- El documento del plan (PDF/HTML) incluye la tabla de requerimientos por tipo de día, gráficas de barras de energía y carbohidratos, la semana tipo, las fechas especiales y el menú de cada tipo. Lista de compras, cumplimiento, check-ins, informe mensual, ajuste de calorías y recordatorios push usan el tipo de día de cada fecha.

### Importar el plan individual desde tu análisis (IA)
1. **Ficha › Expediente › Paquete para la IA:** descarga (o copia) un archivo con la valoración, las preguntas adicionales, mediciones, check-ins, registros, bienestar, competencias, molestias, el plan actual, las respuestas del asesorado y el catálogo de alimentos y ejercicios de la app, junto con las instrucciones de salida.
2. Tu IA entrega el documento completo en HTML con el bloque de datos `deucepoint-plan` (o un JSON). Las instrucciones para configurarla están en **Instrucciones IA** (archivo `.md`).
3. **Importar plan:** carga el HTML o el JSON y, si quieres, el PDF del informe. La vista previa muestra los tipos de día con la meta y lo que suma el menú, los alimentos emparejados con la base (✓ igual, ≈ aproximado, + nuevo, ✗ sin equivalente) y las advertencias. Elige qué aplicar: plan nutricional, expediente, preguntas pendientes, suplementos, competencias, rutina, objetivo del perfil y mensaje al asesorado.
4. Las equivalencias de alimentos que corrijas se recuerdan para las siguientes importaciones.

### Carga desde el PDF (anexo «Datos de carga»)
- El informe en PDF lleva en la última página un anexo de texto con formato fijo (`=== DEUCE POINT DATOS ===` … `=== FIN ===`). La app lo lee directamente: carga inmediata y sin costo.
- La especificación completa está en **Expediente › Instrucciones IA** (archivo «Formato del informe - Deuce Point.md»), con el catálogo de alimentos y ejercicios. Se carga una sola vez como instrucción permanente en la IA de análisis.
- Si el PDF no trae el anexo, la app ofrece **Convertir con IA** (API de Anthropic, ≈ 0,05–0,15 USD por documento con Sonnet). Requiere activar la función `convertir-plan`.

### Activar la conversión con IA (opcional)
1. **console.anthropic.com:** crear la cuenta, cargar créditos en *Billing* y crear una llave en *API Keys*. Recomendado: definir un límite de gasto mensual en *Limits*.
2. **Supabase › Edge Functions › Secrets:** agregar `ANTHROPIC_API_KEY` con la llave. Opcional: `ANTHROPIC_MODEL` (por defecto `claude-sonnet-5-5`).
3. **Supabase › Edge Functions › Deploy a new function › Via Editor:** nombre `convertir-plan`; pegar el contenido de `supabase/functions/convertir-plan/index.ts`; **Deploy** (dejar activada la verificación de JWT).
4. La llave queda solo en Supabase. La función solo responde a la cuenta del entrenador.

### Expediente del asesorado
- Resumen, indicadores, prioridades (alta, media, baja), factores favorables, monitoreo, laboratorios, suplementación, secciones libres (protocolo de competencia, taper, preparación en lote, mercado) y el documento original (PDF o HTML) en almacenamiento privado.
- El asesorado lo ve en **Perfil › Mi plan integral** cuando está marcado como visible, responde las preguntas pendientes y el entrenador recibe las respuestas en la bandeja.
- Expediente en PDF y HTML.

### Valoración inicial
- **Ajustes › Preguntas adicionales:** preguntas propias (abiertas o de opción) que se agregan como un paso de la valoración. Las respuestas aparecen en la valoración, en el Excel y en el paquete para la IA.

## Actualización a la versión 7

1. **Supabase › SQL Editor › New query:** pegar todo `supabase/migracion-v7.sql` → **Run**. Incluye v4, v5 y v6: si no habías ejecutado la v6, basta con este archivo. Se puede ejecutar de nuevo sin errores.
2. Recargar la app.
3. Si usas las notificaciones push, volver a publicar la función `enviar-notificaciones` con el contenido actualizado de `supabase/functions/enviar-notificaciones/index.ts` (los recordatorios de comidas usan el tipo de día y la rotación).
4. Ajustes de la versión 6 que siguen pendientes si no se hicieron: enlaces de pago, página de captación, lecciones base y llaves push.

## Novedades de la versión 6

### Rendimiento en tenis (Progreso › Rendimiento y ficha › Rendimiento)
- **Carga de entrenamiento:** al terminar cada sesión de fuerza el asesorado registra el esfuerzo percibido (RPE 0–10); la carga es RPE × minutos. Los partidos y prácticas de tenis se registran con minutos, superficie y RPE. Relación aguda:crónica (7 días ÷ promedio semanal de 4 semanas) con zonas: menor a 0,8 baja, 0,8–1,3 óptima, 1,3–1,5 precaución, mayor a 1,5 riesgo alto. Gráficos de barras por semana.
- **Bienestar diario** en Hoy (sueño, energía, dolor muscular, estrés, ánimo; 1–5) con semáforo. Rojo aparece en Pendientes.
- **Torneos y periodización:** 7 días antes del torneo el volumen de fuerza baja al 60 % de las series (40 % durante el torneo) y la sesión lo indica. La víspera los carbohidratos suben a 6 g/kg y en días de torneo a 7 g/kg, con las porciones de Hoy ajustadas. Valores en Ajustes.
- **Partidos y práctica en Hoy:** el gasto del tenis (MET 7 práctica, 8 partido) se suma a las calorías del día, descontando las sesiones semanales ya incluidas en el factor de actividad de la valoración.
- **Prueba de sudoración y plan de hidratación** (PDF y HTML): tasa de sudor en L/h, % de peso perdido, líquido por hora y por cambio de lado, sodio por hora y reposición posterior.
- **Protocolo de día de torneo** (PDF y HTML): cronograma según la hora del partido (comida previa, hidratación, refrigerio, durante el juego, entre partidos y recuperación) con ejemplos en gramos.
- **Pruebas físicas** (CMJ, sprints 5/10/20 m, 5-0-5, spider, hexágono, Yo-Yo IR1, balón medicinal, prensión) con referencias por sexo y categoría del metaanálisis de 8.008 tenistas juveniles (2025), clasificación ±5 %, barras de evolución e informe PDF y HTML. Se incluyen en el informe mensual.
- **Molestias con mapa corporal:** con intensidad de 3 o más, los ejercicios que cargan la zona se marcan durante la sesión con alternativas; el entrenador recibe el aviso en Pendientes.
- **Bloques de prevención** (hombro, codo, muñeca, tobillo, aductores) que se agregan a cualquier día de la rutina con un botón.

### Nutrición
- **Recetas:** cada opción de menú muestra la preparación paso a paso (automática según los alimentos y porciones, o escrita por el entrenador en el editor del plan). También en el documento del plan.
- **Antropometría ISAK** (ficha › Antropometría): 8 pliegues, 6 perímetros y 3 diámetros; % de grasa con Yuhasz, Durnin-Womersley + Siri y Faulkner; masa muscular esquelética (Lee); somatotipo Heath-Carter; índices cintura/cadera y cintura/talla; evolución en barras e informe PDF y HTML. «Aplicar al seguimiento» deja el % de grasa listo para «Recalcular con datos actuales».
- **Suplementación con protocolo** (ficha › Suplementos): creatina, cafeína, beta-alanina, nitratos y bicarbonato con dosis por kg, momento e indicaciones; registro de tomas en Hoy; documento PDF y HTML.
- **Ciclo menstrual** (asesoradas): fase y día del ciclo en Hoy con recomendaciones por fase, y barras de energía, ánimo, hambre y rendimiento por fase.
- **Costo de la lista de compras:** precio por kg editable (en la lista o en Biblioteca › Alimentos) y costo por días, por día y por mes.
- **Comer fuera de casa:** guía para corrientazo, asadero, comida rápida, panadería, comida asiática y tienda, con porciones calculadas con el almuerzo del plan.
- **Código de barras:** en «Añadir alimento» › Escanear, con la cámara o escribiendo el número; los datos vienen de Open Food Facts.

### Entrenamiento y adherencia
- **Superseries y tempo** en el editor de rutina (letra de superserie y tempo por ejercicio). En la sesión, el descanso se activa al terminar la superserie. **Temporizador de intervalos** (trabajo, descanso, rondas) dentro de la sesión.
- **Mensajes** entre entrenador y asesorado dentro de la app, con respuestas guardadas (Ajustes) y aviso en Pendientes.
- **Rachas y logros** (Progreso › Logros) y aviso de logro nuevo en Hoy.
- **Lecciones semanales:** Biblioteca › Lecciones › «Cargar las 15 lecciones base» (12 generales y 3 para tenistas). Cada asesorado ve en Hoy la lección de su semana.
- **Retos grupales** (Perfil › Retos grupales): pasos, hidratación, registro de comidas o sesiones, con tabla de posiciones opcional. El asesorado registra los pasos en Hoy.

### Negocio
- **Panel de negocio** (Asesorados › Negocio): membresías vigentes, ingresos y pagos por mes, retención, conversión de prospectos, membresías por nivel, vencimientos y exportación a Excel.
- **Página de captación** (`inicio.html`): presentación, servicios y precios (Ajustes › Página de captación), calculadora de calorías y proteína y formulario que deja el prospecto en Pendientes y abre WhatsApp. Código QR descargable en Negocio › Página y QR.
- **Pagos:** enlaces de pago fijos de Wompi o Mercado Pago por plan (Ajustes). Se muestran al asesorado en el aviso de vencimiento y se agregan al mensaje de renovación. Los pagos se registran al guardar o renovar una membresía con valor, o en Negocio › Pagos.
- **Niveles de servicio** en la membresía: Completo, Nutrición (sin la sección Entreno) o Entrenamiento (sin el plan de alimentación en Hoy).
- **Referidos:** cada asesorado tiene su código y enlace (Perfil); Negocio › Referidos muestra los clientes y prospectos que trajo y el descuento sugerido.
- **Encuesta de satisfacción y testimonios:** a los 60 días y luego cada 3 meses; NPS, promedios por área y testimonios con autorización de uso.
- **Asistente:** cuenta con acceso de lectura a los asesorados, respuesta de check-ins y mensajes, y registro de mediciones; sin acceso a ajustes, membresías, pagos, planes ni rutinas.
- **Exportar a Excel:** ficha completa del asesorado (botón en la ficha y en Perfil del asesorado).
- **Notificaciones push:** recordatorios con el menú vigente del plan, mensajes nuevos y, para el entrenador, valoraciones y check-ins nuevos.

## Actualización a la versión 6 (incluida en la 7)

1. **Supabase › SQL Editor › New query:** pegar todo `supabase/migracion-v6.sql` → **Run**. Incluye las migraciones v4 y v5, así que basta con ejecutar este archivo. Conserva los valores de Ajustes y se puede ejecutar de nuevo sin errores.
2. **En la app › Perfil › Ajustes:** enlaces de pago, contenido de la página de captación, descuento por referido, respuestas guardadas y parámetros de torneos.
3. **Biblioteca › Lecciones:** «Cargar las 15 lecciones base».
4. **Asistente (opcional):** la persona crea su cuenta en la app y se ejecuta en SQL Editor:
   `update public.profiles set role = 'assistant' where email = 'correo@ejemplo.com';`

### Activar las notificaciones push (una sola vez)
1. **App › Ajustes › Notificaciones push › Generar llaves.** Copiar los tres valores que aparecen.
2. **Supabase › Edge Functions › Secrets:** agregar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` con esos valores.
3. **Supabase › Edge Functions › Deploy a new function › Via Editor:** nombre `enviar-notificaciones`; pegar el contenido de `supabase/functions/enviar-notificaciones/index.ts`; **Deploy**.
4. **Supabase › Integrations › Cron:** activar la integración y crear una tarea: nombre `notificaciones`, programación `*/5 * * * *` (cada 5 minutos), tipo «Supabase Edge Function», método POST, función `enviar-notificaciones`.
5. Cada asesorado activa las notificaciones en **Perfil › Recordatorios y notificaciones**; el entrenador, en **Perfil**. En iPhone se requiere iOS 16.4 o superior y la app agregada a la pantalla de inicio.

## Novedades de la versión 5

- **Generador de menús propios.** Cada comida se arma con alimentos de la base según su estructura (desayuno, refrigerio, almuerzo, cena), los alimentos preferidos, el presupuesto (ajustado, moderado, amplio), las exclusiones y el momento del día con más hambre (más proteína en esa comida). Los horarios salen de la hora de despertar y de acostarse. Las porciones de cada opción se calculan para cumplir la proteína, los carbohidratos y la grasa de esa comida, con el 60 % de los carbohidratos en las comidas pre y post entreno. Por defecto, 3 opciones por comida y proteínas distintas entre opciones y entre almuerzo y cena. Si el promedio del día se aleja más de 8 % de algún macronutriente, aparece «Revisar porciones» en la valoración. En el editor del plan, **+ Opción automática** agrega una opción nueva con las mismas metas de la comida. En **Biblioteca › Alimentos** se define el costo y el uso (desayuno, refrigerios, almuerzo y cena) de cada alimento. En **Ajustes** se elige entre «Generador personalizado» y «Plantilla asignada al objetivo».
- **Informe mensual (PDF y HTML).** Ficha del asesorado › **Informes**: periodo (últimos 30 días, mes anterior, mes actual o fechas), comentarios y objetivos del próximo mes. Incluye peso y composición, proyección frente al resultado, cumplimiento del plan, macronutrientes frente al objetivo, agua, sesiones y volumen por semana, mejoras de fuerza (1RM estimado) y bienestar de los check-ins, todo en gráficos de barras. El asesorado lo ve en **Perfil › Informes mensuales** y recibe un aviso en Hoy. Pendientes muestra «Informe» cada 30 días.
- **Recordatorios en el celular.** Perfil › **Recordatorios**: comidas (con las opciones del menú y sus porciones), agua, entrenamiento (30 minutos antes), check-in semanal y registro del día. Se descargan como archivo de calendario (.ics) con alarma; suenan aunque la app esté cerrada (iPhone y Android).
- **Membresías.** En la ficha del asesorado: plan (mensual, trimestral, semestral, anual o personalizado), inicio, vencimiento, valor y notas; botón de renovación. Pendientes muestra «Renovación» desde 7 días antes (configurable en Ajustes) con el mensaje de WhatsApp listo. El asesorado ve el aviso en Hoy.
- **Archivar y eliminar asesorados.** «Archivar» oculta al asesorado de la lista y de Pendientes y conserva sus datos (filtro «Archivados» para restaurarlo). «Eliminar» borra de forma definitiva la cuenta, todos sus registros y los archivos de sus fotos; pide escribir ELIMINAR.
- **Videos de técnica.** Biblioteca › **Videos de técnica**: lista de ejercicios sin video, botón «Buscar» en YouTube y campo para pegar el enlace (YouTube, Shorts o Vimeo). El video se reproduce dentro de la app en la información del ejercicio y con el botón «▶ Técnica» durante la sesión.

## Motor de cálculo (v4)

- **TMB:** Katch-McArdle (370 + 21,6 × masa libre de grasa) o Cunningham para deportistas (500 + 22 × masa libre de grasa) cuando la composición corporal proviene de InBody, pliegues, DEXA o la evaluación del entrenador. En otro caso, Mifflin-St Jeor (10 × peso + 6,25 × talla − 4,92 × edad + 5 / −161).
- **Factor de actividad** (según sesiones de entrenamiento y deporte por semana, pasos y tipo de trabajo): sedentario 1,3; leve 1,6 H / 1,5 M; moderado 1,7 H / 1,6 M; intenso 2,1 H / 1,9 M.
- **Pérdida de grasa:** déficit = peso × 0,75 % semanal × 7.700 / 7, entre 300 y 750 kcal. **Recomposición:** −250 kcal. **Ganancia:** +500 / +350 / +250 kcal según nivel. Todo configurable en Ajustes.
- **Macronutrientes:** proteína 2,0 g/kg (1,8–2,2), grasa 0,9 g/kg (0,8–1,2, mínimo 20 % de la energía), carbohidratos con el resto del día de entreno; 60 % de los carbohidratos en las comidas pre y post entreno según el horario.
- **Ciclado:** días de descanso con 125 g menos de carbohidratos (100–150 g), sin bajar de 2 g/kg. El diario «Hoy» detecta el tipo de día y ajusta metas y porciones; el asesorado puede cambiarlo manualmente.
- **Entrenamiento:** principiantes inician con Fase 1 · Adaptación anatómica (4 semanas, Full Body en circuito). Al terminar aparece en Pendientes «Generar Fase 2». El screening funcional ajusta la selección de ejercicios y agrega hasta 3 ejercicios de movilidad al inicio de la sesión. Cardio en Zona 2 de 20–30 min al final de cada sesión (excepto tenistas con 4 o más sesiones de cancha).
- **Proyección a 3 meses** en rango (barras): pérdida de grasa con 7.700 kcal/kg y hasta 30 % menos por adaptación metabólica; ganancia muscular según nivel; +1,0–1,5 kg por inicio de creatina.
- **Recalibración mensual:** botón «Recalcular con datos actuales» en la valoración y aviso en Pendientes cada 28 días.

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

## Actualización a la versión 5

Supabase › SQL Editor › New query: pegar todo `supabase/migracion-v5.sql` → **Run**. Incluye la migración v4, así que no es necesario ejecutar la v4 por separado. Conserva los valores que ya tengas en Ajustes y se puede ejecutar de nuevo sin errores.

## Actualización a la versión 4

Incluida en `migracion-v5.sql`. Archivo independiente: `supabase/migracion-v4.sql`.

## Actualización a la versión 3 (ya realizada)

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
- El entrenador no puede abrir, modificar ni reemplazar las fotos ni las llaves de los asesorados. Solo puede borrar los archivos cifrados al eliminar definitivamente la cuenta de un asesorado.
- La eliminación de asesorados se hace con una función del servidor que verifica que quien la ejecuta es el entrenador y no permite eliminar cuentas de entrenador.
- Membresías e informes: el asesorado solo lee los suyos; solo el entrenador los crea o modifica.
- Mensajes: cada asesorado ve solo su conversación; nadie puede editar un mensaje enviado (solo marcarlo como leído).
- Pagos, prospectos, membresías y ajustes: solo el entrenador. El asistente solo lee los datos de los asesorados, responde check-ins y mensajes y registra mediciones.
- La página de captación solo puede crear prospectos a través de una función del servidor con validación (un registro por número cada 24 horas); no puede leer datos.
- Las llaves privadas de las notificaciones se guardan como secretos en Supabase, no en la app.
- Al cerrar sesión se eliminan de la memoria las llaves de fotos y las imágenes descifradas.

## Modo demostración

Con `SUPABASE_URL` vacío la app abre en modo demo: un entrenador, una asistente, dos asesorados con historial (Ana, tenista con torneo próximo, pruebas físicas, molestia y suplementación; Juan con antropometría, mensajes y membresía por vencer) y una asesorada nueva (Laura) para probar la valoración inicial y el generador de menús.
