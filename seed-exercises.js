/* Biblioteca inicial de ejercicios.
   Cada bloque es una "familia de variantes": los ejercicios de una misma familia
   se ofrecen como sustitutos cuando la máquina está ocupada o no está disponible.
   g = grupo muscular · f = familia · x = [nombre, equipo] */
window.SEED_FAMILIES = [
  // PECHO
  { g: 'Pecho', f: 'Press horizontal', x: [
    ['Press de banca con barra', 'Barra'], ['Press de banca con mancuernas', 'Mancuernas'],
    ['Press de pecho en máquina', 'Máquina'], ['Press de banca en Smith', 'Smith'],
    ['Press de pecho en polea', 'Polea'], ['Flexiones de pecho', 'Peso corporal']] },
  { g: 'Pecho', f: 'Press inclinado', x: [
    ['Press inclinado con barra', 'Barra'], ['Press inclinado con mancuernas', 'Mancuernas'],
    ['Press inclinado en máquina', 'Máquina'], ['Press inclinado en Smith', 'Smith']] },
  { g: 'Pecho', f: 'Aperturas', x: [
    ['Aperturas con mancuernas', 'Mancuernas'], ['Pec deck', 'Máquina'],
    ['Cruce de poleas', 'Polea'], ['Aperturas en polea baja', 'Polea']] },
  { g: 'Pecho', f: 'Fondos y press declinado', x: [
    ['Fondos en paralelas', 'Peso corporal'], ['Fondos asistidos en máquina', 'Máquina'],
    ['Press declinado con barra', 'Barra']] },

  // ESPALDA
  { g: 'Espalda', f: 'Tracción vertical', x: [
    ['Dominadas', 'Peso corporal'], ['Dominadas asistidas en máquina', 'Máquina'],
    ['Jalón al pecho agarre abierto', 'Polea'], ['Jalón al pecho agarre neutro', 'Polea'],
    ['Jalón unilateral en polea', 'Polea']] },
  { g: 'Espalda', f: 'Remo horizontal', x: [
    ['Remo con barra', 'Barra'], ['Remo con mancuerna a una mano', 'Mancuernas'],
    ['Remo sentado en polea', 'Polea'], ['Remo en máquina con apoyo de pecho', 'Máquina'],
    ['Remo en T', 'Barra'], ['Remo invertido', 'Peso corporal']] },
  { g: 'Espalda', f: 'Pullover', x: [
    ['Pullover en polea alta', 'Polea'], ['Pullover con mancuerna', 'Mancuernas']] },

  // HOMBROS
  { g: 'Hombros', f: 'Press vertical', x: [
    ['Press militar con barra', 'Barra'], ['Press de hombro con mancuernas', 'Mancuernas'],
    ['Press de hombro en máquina', 'Máquina'], ['Press Arnold', 'Mancuernas'],
    ['Press de hombro en Smith', 'Smith']] },
  { g: 'Hombros', f: 'Elevaciones laterales', x: [
    ['Elevaciones laterales con mancuernas', 'Mancuernas'], ['Elevaciones laterales en polea', 'Polea'],
    ['Elevaciones laterales en máquina', 'Máquina']] },
  { g: 'Hombros', f: 'Deltoide posterior', x: [
    ['Face pull en polea', 'Polea'], ['Pájaros con mancuernas', 'Mancuernas'],
    ['Reverse pec deck', 'Máquina']] },
  { g: 'Hombros', f: 'Trapecio', x: [
    ['Encogimientos con barra', 'Barra'], ['Encogimientos con mancuernas', 'Mancuernas'],
    ['Encogimientos en Smith', 'Smith']] },

  // BÍCEPS
  { g: 'Bíceps', f: 'Curl de bíceps', x: [
    ['Curl con barra', 'Barra'], ['Curl con barra Z', 'Barra Z'], ['Curl con mancuernas', 'Mancuernas'],
    ['Curl martillo', 'Mancuernas'], ['Curl en polea', 'Polea'],
    ['Curl predicador en máquina', 'Máquina'], ['Curl inclinado con mancuernas', 'Mancuernas']] },

  // TRÍCEPS
  { g: 'Tríceps', f: 'Extensión de tríceps', x: [
    ['Extensión de tríceps en polea con cuerda', 'Polea'], ['Extensión de tríceps en polea con barra', 'Polea'],
    ['Press francés con barra Z', 'Barra Z'], ['Extensión sobre la cabeza con mancuerna', 'Mancuernas'],
    ['Extensión sobre la cabeza en polea', 'Polea'], ['Extensión de tríceps en máquina', 'Máquina']] },
  { g: 'Tríceps', f: 'Press de tríceps', x: [
    ['Press de banca agarre cerrado', 'Barra'], ['Fondos en banco', 'Peso corporal'],
    ['Fondos de tríceps en máquina', 'Máquina']] },

  // CUÁDRICEPS
  { g: 'Cuádriceps', f: 'Sentadilla y prensa', x: [
    ['Sentadilla trasera con barra', 'Barra'], ['Sentadilla frontal con barra', 'Barra'],
    ['Sentadilla en Smith', 'Smith'], ['Sentadilla hack', 'Máquina'],
    ['Prensa de piernas', 'Máquina'], ['Sentadilla goblet', 'Mancuernas'],
    ['Sentadilla péndulo', 'Máquina']] },
  { g: 'Cuádriceps', f: 'Unilateral de pierna', x: [
    ['Zancadas con mancuernas', 'Mancuernas'], ['Sentadilla búlgara', 'Mancuernas'],
    ['Step-up al cajón', 'Mancuernas'], ['Zancada en Smith', 'Smith'],
    ['Zancada inversa con barra', 'Barra']] },
  { g: 'Cuádriceps', f: 'Extensión de rodilla', x: [
    ['Extensión de cuádriceps en máquina', 'Máquina'], ['Extensión de cuádriceps unilateral', 'Máquina'],
    ['Sissy squat', 'Peso corporal']] },

  // ISQUIOTIBIALES
  { g: 'Isquiotibiales', f: 'Bisagra de cadera', x: [
    ['Peso muerto rumano con barra', 'Barra'], ['Peso muerto rumano con mancuernas', 'Mancuernas'],
    ['Peso muerto convencional', 'Barra'], ['Peso muerto con barra hexagonal', 'Barra hexagonal'],
    ['Buenos días con barra', 'Barra'], ['Hiperextensiones a 45°', 'Banco']] },
  { g: 'Isquiotibiales', f: 'Curl femoral', x: [
    ['Curl femoral tumbado', 'Máquina'], ['Curl femoral sentado', 'Máquina'],
    ['Curl femoral de pie unilateral', 'Máquina'], ['Curl nórdico', 'Peso corporal'],
    ['Curl femoral con fitball', 'Fitball']] },

  // GLÚTEOS
  { g: 'Glúteos', f: 'Empuje de cadera', x: [
    ['Hip thrust con barra', 'Barra'], ['Hip thrust en máquina', 'Máquina'],
    ['Hip thrust en Smith', 'Smith'], ['Puente de glúteo', 'Peso corporal']] },
  { g: 'Glúteos', f: 'Abducción y extensión de cadera', x: [
    ['Abducción de cadera en máquina', 'Máquina'], ['Abducción de cadera en polea', 'Polea'],
    ['Patada de glúteo en polea', 'Polea'], ['Patada de glúteo en máquina', 'Máquina'],
    ['Abducción con banda elástica', 'Banda']] },

  // PANTORRILLAS
  { g: 'Pantorrillas', f: 'Elevación de talones', x: [
    ['Elevación de talones de pie en máquina', 'Máquina'], ['Elevación de talones en prensa', 'Máquina'],
    ['Elevación de talones sentado', 'Máquina'], ['Elevación de talones en Smith', 'Smith'],
    ['Elevación de talones unilateral con mancuerna', 'Mancuernas']] },

  // CORE
  { g: 'Core', f: 'Anti-extensión', x: [
    ['Plancha frontal', 'Peso corporal'], ['Rueda abdominal', 'Rueda'], ['Dead bug', 'Peso corporal']] },
  { g: 'Core', f: 'Flexión de tronco', x: [
    ['Crunch en polea', 'Polea'], ['Elevación de piernas colgado', 'Peso corporal'],
    ['Crunch en máquina', 'Máquina'], ['Crunch abdominal', 'Peso corporal']] },
  { g: 'Core', f: 'Anti-rotación y rotación', x: [
    ['Pallof press', 'Polea'], ['Plancha lateral', 'Peso corporal'],
    ['Leñador en polea', 'Polea'], ['Rotación rusa con disco', 'Disco']] },

  // ANTEBRAZO
  { g: 'Antebrazo', f: 'Muñeca y agarre', x: [
    ['Curl de muñeca con mancuerna', 'Mancuernas'], ['Extensión de muñeca con mancuerna', 'Mancuernas'],
    ['Pronación-supinación con mancuerna', 'Mancuernas'], ['Paseo del granjero', 'Mancuernas']] },

  // POTENCIA (enfoque tenis)
  { g: 'Potencia', f: 'Lanzamientos con balón medicinal', x: [
    ['Lanzamiento lateral con balón medicinal', 'Balón medicinal'],
    ['Lanzamiento sobre la cabeza con balón medicinal', 'Balón medicinal'],
    ['Lanzamiento de pecho con balón medicinal', 'Balón medicinal'],
    ['Slam con balón medicinal', 'Balón medicinal']] },
  { g: 'Potencia', f: 'Saltos', x: [
    ['Salto al cajón', 'Cajón'], ['Salto vertical con contramovimiento', 'Peso corporal'],
    ['Salto lateral sobre valla', 'Vallas'], ['Saltos laterales patinador', 'Peso corporal']] },
  { g: 'Potencia', f: 'Extensión explosiva de cadera', x: [
    ['Kettlebell swing', 'Kettlebell'], ['Cargada de potencia con barra', 'Barra'],
    ['Salto con barra hexagonal', 'Barra hexagonal']] },

  // MANGUITO ROTADOR (prevención en tenis)
  { g: 'Manguito rotador', f: 'Rotación de hombro', x: [
    ['Rotación externa en polea', 'Polea'], ['Rotación interna en polea', 'Polea'],
    ['Rotación externa con banda', 'Banda'], ['Rotación externa tumbado con mancuerna', 'Mancuernas']] },
  { g: 'Manguito rotador', f: 'Estabilidad escapular', x: [
    ['Y-T-W en banco inclinado', 'Mancuernas'], ['Remo con banda y rotación externa', 'Banda'],
    ['Serrato en polea', 'Polea']] },

  // MOVILIDAD (screening funcional)
  { g: 'Movilidad', f: 'Movilidad de tobillo', x: [
    ['Movilidad de tobillo en pared', 'Peso corporal'], ['Estiramiento de gastrocnemio y sóleo', 'Peso corporal']] },
  { g: 'Movilidad', f: 'Patrón de bisagra', x: [
    ['Bisagra de cadera con palo', 'Peso corporal'], ['Estiramiento activo de isquiotibiales', 'Peso corporal']] },
  { g: 'Movilidad', f: 'Movilidad torácica y escapular', x: [
    ['Wall angels', 'Peso corporal'], ['Movilidad torácica en cuadrupedia', 'Peso corporal'], ['Dislocaciones de hombro con banda', 'Banda']] },
  { g: 'Movilidad', f: 'Movilidad de cadera', x: [
    ['Apertura de cadera 90/90', 'Peso corporal'], ['Sentadilla profunda asistida', 'Peso corporal']] },

  // CARDIO ZONA 2
  { g: 'Cardio', f: 'Cardio Zona 2', x: [
    ['Caminata inclinada en banda (Zona 2)', 'Máquina'], ['Bicicleta estática (Zona 2)', 'Máquina'], ['Elíptica (Zona 2)', 'Máquina'],
    ['Remo ergómetro (Zona 2)', 'Máquina'], ['Caminata al aire libre (Zona 2)', 'Peso corporal']] }
];
