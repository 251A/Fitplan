// Descriptions to help the user pick a starting phase (no personal data here).

export const FIVEK_PHASES = [
  { phase: 1, session: '6–8 × (3 min corriendo + 1 min caminando)', whenToStart: 'Empiezas o te cuesta correr más de 3 min seguidos.' },
  { phase: 2, session: '4–5 × (5 min corriendo + 1 min caminando)', whenToStart: 'Ya haces salidas de 20–40 min alternando correr y caminar.' },
  { phase: 3, session: '3 × (8–10 min corriendo + 1 min caminando)', whenToStart: 'Corres 5–6 min seguidos sin problema.' },
  { phase: 4, session: '20–25 min seguidos', whenToStart: 'Aguantas 10 min seguidos a ritmo cómodo.' },
  { phase: 5, session: 'Test: 5 km o 30–35 min seguidos', whenToStart: 'Ya corres 25 min seguidos.' },
] as const;

export const SWIM_PHASES = [
  { phase: 1, session: 'Series de 100 m con 30 s de descanso (1.000–1.200 m)', whenToStart: 'Nadas ~1 km pero con paradas frecuentes.' },
  { phase: 2, session: 'Series de 200 m con 30 s de descanso', whenToStart: 'Haces 100 m seguidos cómodo.' },
  { phase: 3, session: 'Series de 300–400 m', whenToStart: 'Haces 200 m seguidos cómodo.' },
  { phase: 4, session: '500 m seguidos dentro de 1,5–2 km', whenToStart: 'Haces 400 m seguidos.' },
] as const;
