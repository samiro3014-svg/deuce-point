/* =====================================================================
   CONFIGURACIÓN · lo único que hay que editar
   ===================================================================== */
window.APP_CONFIG = {
  // Supabase > Project Settings > API. Si se dejan vacíos, la app abre en MODO DEMO.
  SUPABASE_URL: 'https://ebxdfjnngnkuwguipbah.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVieGRmam5uZ25rdXdndWlwYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NTc1MTMsImV4cCI6MjEwODMzMzUxM30.WdAfxeJVnHHGWY_8vdGCaU2iE0U4qvPWP2Gd2_WeNSg',   // usar la clave "anon public". NUNCA la "service_role".

  // Marca
  BRAND: {
    name: 'Deuce Point',
    short: 'DP',
    tagline: 'Preparación física y nutrición',
    primary: '#0B406C',      // azul marino del logo
    accent: '#6FB232',       // verde del logo
    logo: 'logo-mark.png',   // anillos (cabecera)
    logoFull: 'logo.png'     // logo completo (pantalla de inicio de sesión)
  }
};
