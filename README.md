# Deuce Point · Guía de instalación y uso

Aplicación de entrenamiento y nutrición para los asesorados de Deuce Point. Funciona en el navegador (celular o computador) y se puede instalar como app en Android y iPhone desde el mismo enlace. La cuenta y los datos son los mismos en ambos casos.

---

## Funciones

### Asesorado

**Hoy (diario)**
- Calorías consumidas, restantes y objetivo; barras de proteína, carbohidratos y grasa.
- Agua: registro en tomas de 250 o 500 ml frente al objetivo del plan.
- Entrenamiento sugerido del día (siguiente día de su rutina) con acceso directo para iniciarlo.
- Comidas del plan con sus opciones de menú (Opción 1, Opción 2…). Cada alimento muestra gramos, medida casera y kcal.
- Marcar alimentos consumidos uno a uno o «Marcar todo».
- **Reemplazar**: lista de equivalentes del mismo grupo con la cantidad calculada para aportar el mismo nutriente principal; también permite ajustar los gramos consumidos.
- Añadir alimentos fuera del plan (búsqueda en la base) o registro rápido con los datos de una etiqueta.
- Navegación por días anteriores.
- Plan completo descargable en PDF y HTML; lista de compras de 3, 7 o 14 días.

**Entreno**
- Rutinas asignadas, registro de series (kg, repeticiones, RIR) con referencia de la sesión anterior, temporizador de descanso, variantes por máquina ocupada, resumen con récords.

**Progreso**
- Entrenamiento: volumen semanal, sesiones por semana, series por grupo muscular.
- Ejercicios: 1RM estimado, peso máximo, volumen por sesión, récords.
- Cuerpo: peso, cintura y % de grasa con gráficas de barras.
- Nutrición: calorías por día, cumplimiento del plan, promedio de 7 días frente al objetivo.

### Entrenador

- **Asesorados**: lista con alertas de «sin rutina activa» y «sin plan nutricional».
- Ficha del asesorado con pestañas: Entreno · Nutrición · Seguimiento · Sesiones · Ejercicios.
- **Editor del plan nutricional**:
  - Objetivos de kcal, macronutrientes y agua; distribución porcentual automática.
  - Calculadora de requerimientos (Mifflin-St Jeor × factor de actividad, ajuste % y proteína/grasa por kg).
  - Comidas con hora, instrucciones y varias opciones de menú; alimentos en gramos con medida casera y aporte.
  - «Objetivos = totales del plan» y «Ajustar porciones a las kcal objetivo».
- **Plantillas**: planes nutricionales y rutinas reutilizables. Al asignar una plantilla nutricional se indican las kcal del asesorado y las porciones se escalan proporcionalmente.
- **Seguimiento**: cumplimiento nutricional de 14 días, diario de cualquier día del asesorado, peso y medidas.
- **Biblioteca**: 133 ejercicios con familias de variantes y 99 alimentos con valores por 100 g y medida casera. Ambas se amplían desde la app.

> Los valores de la base de alimentos son de referencia (tablas USDA y tablas de composición colombianas). Revísalos en Biblioteca › Alimentos y ajústalos según las marcas o preparaciones que uses.

---

## Paso 1 · GitHub

1. Crear un repositorio nuevo **público** llamado `deuce-point`.
2. Subir todos los archivos de esta carpeta (la carpeta `supabase` es opcional).
3. **Settings → Pages → Branch: main / (root) → Save**. En 1–2 minutos queda disponible en `https://samiro3014-svg.github.io/deuce-point/`.

## Paso 2 · Supabase (base de datos)

1. Crear cuenta en https://supabase.com y un proyecto nuevo (`deuce-point`, región *South America (São Paulo)*).
2. **SQL Editor → New query**: pegar todo `supabase/schema.sql` → **Run**. Debe terminar en *Success*.
3. **Authentication → URL Configuration**: en *Site URL* y en *Redirect URLs* poner la dirección del paso 1.
4. **Project Settings → API**: copiar *Project URL* y la clave **anon public**.

## Paso 3 · Conectar la app

En `config.js`:

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

Nunca usar la clave `service_role` en la app.

## Paso 4 · Activar la cuenta de entrenador

1. Abrir la app → **Crear cuenta** con tu correo → confirmar el correo.
2. En Supabase → **SQL Editor**:

```sql
update public.profiles set role = 'coach' where email = 'tucorreo@gmail.com';
```

3. Cerrar sesión y volver a entrar.

## Paso 5 · Invitar asesorados

**Asesorados → Copiar enlace de la app.** Cada asesorado crea su cuenta y aparece en la lista para asignarle rutina y plan.

- Navegador: basta con abrir el enlace e iniciar sesión.
- Instalar en Android (Chrome): menú ⋮ → *Agregar a la pantalla principal*.
- Instalar en iPhone (Safari): Compartir → *Agregar a inicio*.

---

## Seguridad

- Cada asesorado solo ve y registra sus propios datos (políticas RLS en la base de datos, verificadas).
- Solo el entrenador crea planes, rutinas, plantillas y modifica las bibliotecas.
- El rol de entrenador solo se asigna desde el SQL Editor de Supabase.
- No se puede eliminar un alimento o ejercicio que esté en uso en un plan o rutina.

## Modo demostración

Con `SUPABASE_URL` vacío la app abre en modo demo con un entrenador y dos asesorados de ejemplo (datos guardados solo en el dispositivo).

## Plan gratuito de Supabase

500 MB de base de datos, suficiente para cientos de asesorados con años de registros. Un proyecto gratuito se pausa tras 7 días sin actividad; con uso semanal normal no ocurre.
