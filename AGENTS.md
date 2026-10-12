# FitPlan — Especificación para Codex

App web personal (PWA instalada en la pantalla de inicio del iPhone; un solo usuario: Héctor) que organiza la semana de entrenamiento combinando **gimnasio (hipertrofia), carrera y natación**, usando los datos de Apple Salud — recibidos a través de un atajo de la app **Atajos** — para medir la recuperación y adaptar el plan.

> **Decisión (9 oct 2026):** sin Mac y sin pagar el Apple Developer Program, se cambia la app nativa por una **PWA + Atajos**. Las secciones 3–13 siguen vigentes; donde digan SwiftUI/SwiftData/HealthKit, léase el equivalente web de la sección 2.

> Objetivo principal: **organización**. Que cada domingo la app proponga la semana según los días disponibles, y que cada mañana diga qué toca hoy y si conviene bajar la intensidad.
> No es una app médica: nunca da diagnósticos ni objetivos de calorías.

Nombre provisional: **FitPlan** (cambiable). Idioma de la interfaz: **español**. Código, identificadores y comentarios: **inglés**.

---

## 1. Usuario y objetivos

| Dato | Valor |
|---|---|
| Altura | 165 cm |
| Peso inicial | 71,4 kg (octubre 2026) |
| FC máxima observada | 179 lpm (carreras de abril–agosto 2026) |
| Pulso en reposo (media reciente) | 60–67 lpm |
| VFC SDNN (media reciente) | 60–70 ms |
| Sueño (media reciente) | ~8 h |
| Pasos (media últimos 28 días) | ~15.400/día, 75 % de días ≥ 10.000 |

**Objetivos**
1. **Fuerza / hipertrofia** mientras baja grasa: mantener o subir cargas al perder peso.
2. **Resistencia general.**
3. **Correr 5K seguidos** (hoy hace intervalos correr/caminar, ~9–10 min/km de media, salidas de 22–38 min).
4. **Nadar más metros seguidos** (última sesión: 1,15 km en 55 min, FC media 119).
5. **10.000 pasos o más al día.**
6. **Bajar grasa** (seguimiento por tendencia de peso semanal, sin objetivos calóricos).

**Rutina base de gimnasio (5 días):** Empuje A, Tracción A, Pierna, Empuje B, Tracción B.
**Realidad actual:** ~3 sesiones/semana rotando Empuje → Tracción → Pierna. En sep–oct 2026: 6 tracción, 5 empuje, 2 pierna (pierna claramente por debajo).

**Apps que usa hoy**
- Gimnasio: **Symmetry** (actual) y **Hevy** (histórico). Ninguna pasa series/pesos a Salud, solo la sesión.
- Carrera: **Runna** (escribe en Salud).
- Natación: **Apple Watch** (app Entreno nativa).

---

## 2. Stack técnico

- **PWA**: Vite + **React** + **TypeScript** (estricto). Instalada en la pantalla de inicio (iOS 17+, Safari). Hosting estático gratuito (GitHub Pages o Cloudflare Pages).
- **Persistencia**: IndexedDB en el dispositivo (envoltorio propio, sin librerías). **Copia de seguridad** exportable/importable en JSON (p. ej. a iCloud Drive), porque si se borran los datos de Safari se pierde el historial.
- **Datos de Salud vía Atajos** (no hay HealthKit en la web): un atajo lee Salud y produce un `HealthPayload` JSON versionado (ver `src/data/health/payload.ts`). El transporte es intercambiable:
  1. **Portapapeles** (fase 1): el atajo copia el JSON; la app muestra "Pegar datos de Salud" (un toque).
  2. **Archivo** (alternativa): el atajo guarda el JSON en iCloud Drive y la app lo importa con el selector de archivos.
  3. **Sincronización silenciosa** (implementada, principal): el atajo hace POST a `/health` del Worker propio `fitplan-sync` (Cloudflare Workers + D1, carpeta `worker/`) y cada dispositivo lo descarga e importa al sincronizar.
- **Sincronización entre dispositivos** (PC ↔ iPhone): `src/data/sync/syncClient.ts` + Worker. Registros editados por el usuario (perfil, sesiones, ejercicios, datos iniciales) viajan por una cola local (`outbox`) con "gana la última escritura"; los datos de Salud viajan como payloads crudos y se derivan en cada dispositivo. Token Bearer en el secreto `SYNC_TOKEN` (`npm run sync:token`). Nuevos stores que deban sincronizarse: añadirlos a `SYNCED_STORES` del Worker y usar `db.writeSynced`.
  La app de pantalla de inicio tiene almacenamiento separado de Safari, así que **no** se usa "abrir URL con datos".
- Automatización diaria en Atajos (mañana) para leer Salud; las notificaciones ("hoy toca…", pasos que faltan) las muestra el propio atajo.
- **Gráficas**: SVG propio (sin librería) salvo que haga falta.
- **Capturas/PDF**: `<input type="file" accept="image/*,application/pdf" multiple>`; PDF a imágenes con pdf.js (única dependencia permitida para eso), cargado bajo demanda.
- **Anthropic Messages API** con `fetch` directo desde el navegador (cabecera `anthropic-dangerous-direct-browser-access: true`). API key introducida en Ajustes y guardada solo en el dispositivo. Modelo configurable (por defecto un Sonnet actual con visión).
- **Sin dependencias de terceros** salvo que sea imprescindible (React, Vite, Vitest; pdf.js en fase 3).
- Toda la lógica (planificador, recuperación, fuerza) es **determinista, en TypeScript puro, en el dispositivo y con tests (Vitest)**. Codex solo: (a) lee capturas de Symmetry, (b) redacta explicaciones y responde preguntas. **Codex nunca decide cargas ni cambia números del plan.**

### Estructura de carpetas

```
src/
  app/                  main.tsx, App.tsx (barra de pestañas), estilos
  features/
    today/              Vista de hoy: sesión del día + semáforo + pasos
    week/               Planificación semanal (disponibilidad, plan, reajustes)
    gym/                Historial, registro manual, importación de capturas
    cardio/             Planes 5K y natación, historial de sesiones
    progress/           Gráficas: fuerza (1RM), volumen, peso, VFC, pasos
    settings/           Perfil, objetivos, API key, plantillas, umbrales, copia de seguridad
  domain/               TypeScript puro, sin React ni APIs del navegador
    recovery/           recoveryEngine + recoveryConfig
    planner/            weekPlanner + plannerRules + gymTemplates
    strength/           oneRepMax, volume, progression
    cardioPlans/        fiveKPlan, swimPlan, heartRateZones
    load/               trainingLoad (TRIMP / sRPE, ACWR)
    health/             sleepAggregator, dailyMetrics
  data/
    health/             payload.ts (esquema HealthPayload), healthImporter
    import/             screenshotImporter, sessionGrouper, importValidator
    ai/                 anthropicClient, prompts, explanationService
    db/                 IndexedDB, modelos, backup
  resources/
    seedData.json       Biblioteca de ejercicios + historial inicial (sección 10)
shortcuts/              Instrucciones paso a paso del atajo "FitPlan sync"
public/                 manifest.webmanifest, iconos, service worker
tests junto al código   *.test.ts (fixtures en __fixtures__/)
```

---

## 3. Modelo de datos (IndexedDB, tipos TypeScript)

```swift
UserProfile        heightCm, startWeightKg, hrMaxObserved, stepGoal (10000),
                   gymBaseDays (5), threeDayTemplate (enum), goals
Exercise           id, name, aliases [String], primaryMuscle, secondaryMuscles,
                   equipment (barbell|smith|machine|cable|dumbbell|bodyweight),
                   loadMode (total|perDumbbell)          // ver 7.3
GymSession         id, date, templateName ("Empuje A"…), source (symmetry|hevy|app|health),
                   durationMin, healthWorkoutUUID?, sets [SetEntry]
SetEntry           exercise, order, weightKg (normalizado), reps, rir?, skipped (Bool)
CardioSession      id, kind (run|swim|walk), date, durationMin, distanceM?, avgHR?, maxHR?,
                   source, healthWorkoutUUID?, plannedSession?
PlannedSession     id, date, kind (gym|run|swim|rest|activeRecovery), gymTemplate?,
                   cardioPrescription?, intensity (easy|moderate|hard),
                   status (planned|done|moved|skipped|downgraded), rationale
WeekPlan           weekStart, availability [DayAvailability], sessions, summaryText
DayAvailability    weekday, allowed Set<kind>, maxMinutes?
DailyMetrics       date, steps, sleepHours, hrvSDNN, restingHR, respiratoryRate,
                   wristTempDelta?, bodyMassKg?, recoveryState, recoveryReasons [String]
```

---

## 4. HealthKit

### Lectura
| Tipo | Uso |
|---|---|
| `stepCount` | Pasos diarios y semanales |
| `heartRateVariabilitySDNN` | Recuperación |
| `restingHeartRate` | Recuperación |
| `respiratoryRate`, `appleSleepingWristTemperature` | Avisos (posible enfermedad, mala noche) |
| `sleepAnalysis` (categoría) | Horas dormidas y fases |
| `bodyMass` | Tendencia de peso |
| `activeEnergyBurned`, `heartRate` | Carga de entrenos (TRIMP) |
| `distanceWalkingRunning`, `distanceSwimming`, `swimmingStrokeCount` | Cardio |
| `HKWorkoutType` + `HKSeriesType.workoutRoute()` | Entrenos y rutas GPS |
| `vo2Max` | Tendencia de forma (si existe) |

- Onboarding claro para crear el atajo y conceder a Atajos acceso a Salud. La automatización diaria del atajo sustituye a la entrega en segundo plano.
- **Sueño — lección aprendida con sus datos reales:** iPhone y Watch registran intervalos solapados. Si se suman, salen 13 h por noche. Hay que:
  1. Tomar solo valores `asleepCore`, `asleepDeep`, `asleepREM`, `asleepUnspecified`.
  2. **Fusionar intervalos solapados** (unión), priorizando el Apple Watch como fuente.
  3. Asignar la noche a la **fecha de despertar**.
- **Entrenos de fuerza en Salud** (fuentes "Hevy", "Symmetry") solo traen duración/energía/FC. Se vinculan a la `GymSession` importada de capturas si coinciden en fecha y ±60 min; si no, se crea una `GymSession` "solo resumen" sin series.
- **Salud no tiene todas sus sesiones** (del 8 al 18 sep 2026 había 7 en Symmetry que no estaban en Salud). La fuente de verdad del gimnasio son las capturas/registro de la app.
- **Distancia de carrera:** el atributo `totalDistance` del workout puede venir vacío; calcular desde la ruta GPS o desde las muestras `distanceWalkingRunning` dentro del intervalo del entreno.

### Escritura (opcional, fase 5)
Solo entrenos registrados en la propia app. Nunca duplicar los que ya escriben Symmetry/Runna/Watch.

---

## 5. Motor de recuperación (`Domain/Recovery`)

Se calcula cada mañana y al abrir la app. Todos los umbrales en `RecoveryConfig` (editables en Ajustes).

**Valores diarios**
- `hrv`: media de las lecturas SDNN de la noche (ventana de sueño); si no hay, las del día.
- `rhr`: valor diario de Salud.
- `sleep`: horas dormidas de la última noche (ver 4).

**Líneas base** (necesitan datos mínimos; si no, estado "Calibrando" y se planifica sin ajuste):
- VFC: media móvil 7 días de `ln(SDNN)` (mín. 3 valores) frente a media y desviación de 28 días (mín. 10 valores). `z = (ln7 − mean28) / sd28`.
- Pulso en reposo: `delta = hoy − media28`.
- Sueño: media de 14 días.
- Carga: ACWR = carga 7 días / (carga 28 días / 4).

**Estado**
| Estado | Condición (cualquiera) |
|---|---|
| 🔴 Rojo | `z < −1.5` · `delta RHR ≥ +7` · sueño < 5 h · dos o más condiciones amarillas a la vez |
| 🟡 Amarillo | `z < −0.5` · `delta RHR ≥ +4` · sueño < 6,5 h o < media14 − 1 h · resp. ≥ media + 2 · temp. muñeca ≥ +0,5 °C · ACWR > 1,5 |
| 🟢 Verde | Ninguna de las anteriores |

Guardar `recoveryReasons` en texto legible ("Dormiste 5 h 40 min, 1 h 50 min menos que tu media").

**Efecto en el plan del día**
- 🟢: sesión tal cual.
- 🟡: gimnasio con RIR +1 y −1 serie por ejercicio; cardio solo suave (Z2); sesiones "hard" pasan a "easy".
- 🔴: gimnasio → mover a otro día de la semana si hay hueco; si no, sesión ligera (2 series, RIR 3) o descanso. Cardio → recuperación activa (paseo, natación muy suave) o descanso.

---

## 6. Planificador semanal (`Domain/Planner`)

> **Prioridad (decisión del 9 oct 2026):** el objetivo principal es el gimnasio y bajar grasa. Carrera y natación solo complementan los días sin gimnasio: si no caben o el 5K no avanza, no pasa nada. Nunca se recorta el gimnasio para meter cardio ni por el límite de carga (se recorta antes todo el cardio). Las sesiones deben ser lo más eficaces posible para el tiempo disponible.

### Entrada (cada domingo, o al pulsar "Planificar semana")
- Para cada día: qué puede hacer (gimnasio / correr / nadar / nada) y minutos disponibles opcionales.
- Número máximo de días de gimnasio esta semana (por defecto 5).
- Estado de recuperación y carga de las últimas 4 semanas.
- Fase actual de los planes de 5K y natación.

### Paso 1 — Plantilla de gimnasio según días
| Días gym | Sesiones |
|---|---|
| 5 | Empuje A, Tracción A, Pierna, Empuje B, Tracción B (su rutina actual) |
| 4 | Empuje, Tracción, Pierna, Tren superior |
| 3 | **Por defecto:** Tren superior, Pierna, Cuerpo completo. **Alternativa (ajuste):** Empuje, Tracción, Pierna |
| 2 | Cuerpo completo A, Cuerpo completo B |
| 1 | Cuerpo completo + aviso |
| 0 | Aviso "riesgo de perder músculo" y propuesta de 2 cuerpo completo cortos (40 min) |

- La **Pierna nunca se elimina** si hay ≥ 2 días de gimnasio (es el grupo con menos volumen ahora mismo).
- Las sesiones "Tren superior" y "Cuerpo completo" se construyen con los ejercicios de su biblioteca (sección 10), priorizando los básicos: press banca, press inclinado Smith, jalón, remo, prensa, curl femoral.

### Paso 2 — Colocar el gimnasio
- Repartir con la máxima separación posible.
- No dos días seguidos con los mismos grupos principales.

### Paso 3 — Colocar cardio en los días libres disponibles
Prioridad: **carrera** (objetivo 5K, hasta 3/semana) > **natación** (hasta 2/semana).
Reglas:
- Ninguna carrera "hard" (test, tempo, series) el día antes ni el día después de Pierna.
- Carrera suave sí puede ir después de tren superior.
- Natación preferente el día después de Pierna o de la carrera más larga.
- Máximo **1 sesión de cardio "hard" por semana**.
- Semana con 5 días de gym: máximo 1–2 de cardio suave.
- Semana sin gym: 2 carreras + 2 nataciones, una de ellas moderada.

### Paso 4 — Límites de carga
- Carga semanal planificada ≤ 1,1 × media de las 3 semanas anteriores (salvo vuelta tras parón: empezar al 70 %).
- Cada 4.ª semana: **descarga** (−40 % de series, cardio solo suave).
- Si hay ≥ 6 sesiones, al menos un día de descanso completo (solo pasos).

### Paso 5 — Pasos
- Objetivo diario 10.000. Si la semana tiene poco cardio, sugerir 12.000 en los días sin sesión.
- Aviso por la tarde si faltan > 3.000 pasos.

### Reajuste durante la semana
- Sesión no hecha → se mueve al siguiente día disponible que cumpla las reglas; si no cabe, se descarta la de menor prioridad (orden: natación < carrera suave < gimnasio de tren superior < Pierna).
- Estado 🔴 → aplicar sección 5.
- Todo cambio guarda `rationale` en texto ("Movida al jueves porque el miércoles estabas en rojo").

### Salida
`WeekPlan` con sesiones y razones. Después, `ExplanationService` (Codex) redacta un resumen corto a partir del JSON del plan. El texto **no puede añadir ni cambiar sesiones**.

---

## 7. Gimnasio: importación de capturas y análisis de fuerza

### 7.1 Importación (`Data/Import`)
1. El usuario elige varias capturas (PhotosPicker) o un PDF (fileImporter → páginas renderizadas con PDFKit). También vía "Compartir" desde Fotos/Symmetry (Share Extension, fase 5).
2. Cada imagen se envía a Codex (visión) pidiendo **JSON estricto** (usar tool use / esquema):
   ```json
   {
     "has_header": true,
     "header": {"date": "2026-09-08", "name": "Tracción A", "duration_min": 50,
                "volume_kg": 5749.5, "sets_total": 16},
     "exercises": [
       {"name": "Jalón Al Pecho Agarre Neutro Abierto (Máquina)",
        "sets": [{"index": 1, "weight_kg": 52.5, "reps": 10}],
        "cut_at_top": false, "cut_at_bottom": true}
     ]
   }
   ```
   Formato de las capturas de Symmetry: pantalla "Detalle de Entrenamiento", cabecera con usuario, fecha ("8 de septiembre, 2026"), nombre de sesión, Tiempo, Volumen, Series; después bloques de ejercicio con "Serie" y "Peso / Reps" (`52.5 kg × 10 reps`). También hay tarjetas resumen para compartir (sin ejercicios): reconocerlas e ignorarlas si ya hay detalle.
3. **Agrupación (`SessionGrouper`)** — problemas reales observados en su PDF:
   - Una sesión ocupa 2–3 capturas y **algunas no tienen cabecera**: se adjuntan a la sesión anterior.
   - Las capturas **se solapan** al hacer scroll (el mismo ejercicio con las mismas series aparece en dos capturas): deduplicar bloques idénticos (mismo nombre y mismas series) y unir bloques cortados (`cut_at_bottom` + `cut_at_top`).
   - Las capturas **no vienen en orden cronológico**: agrupar por cabecera, no por posición.
   - Si una página sin cabecera no encaja claramente, preguntar al usuario a qué sesión pertenece.
   - Validación cruzada: la suma de series y de volumen (kg × reps) debe coincidir con la cabecera; si no, marcar la sesión como "revisar".
4. **Pantalla de revisión** antes de guardar: el usuario corrige cualquier dato.
5. Detectar sesiones ya importadas (misma fecha y nombre) para no duplicar.

### 7.2 Reglas de validación (`ImportValidator`)
- **Ejercicio a 0 kg → no realizado** (`skipped = true`, no cuenta para volumen ni 1RM). Confirmado por el usuario: el hip thrust a 0 kg significa que no lo hizo.
- **Salto de peso > 40 %** respecto a la última vez en ese ejercicio → preguntar: "¿Es por mancuerna, el par, o era en máquina?".
- Permitir **reasignar** un registro a otro ejercicio (p. ej. "Elevaciones laterales sentado (Mancuerna)" registrado en Symmetry pero hecho en máquina).
- Mapear nombres a la biblioteca por coincidencia aproximada; la primera vez el usuario confirma y se guarda como alias.

### 7.3 Normalización de pesos
- `loadMode = perDumbbell`: se guarda y se muestra **peso por mancuerna**. Si el usuario indica "par", dividir entre 2.
- Ejemplos confirmados por el usuario:
  - Curl inclinado: 10 kg = una mancuerna; 24 kg = el par → 12 kg/mancuerna.
  - Curl martillo: 12 kg = una mancuerna; 20 kg = el par → 10 kg/mancuerna.
  - Elevaciones laterales sentado: 16 kg = el par → 8 kg/mancuerna. Los registros de 20–25 kg eran en **máquina**.
- Recordar la elección por ejercicio para no volver a preguntar.

### 7.4 Análisis (`Domain/Strength`)
- **1RM estimado (Epley):** `w × (1 + reps/30)`, solo con series de 1–12 reps. Mostrar la mejor estimación por sesión y su evolución.
- **Volumen semanal por grupo muscular:** series efectivas (no `skipped`) por músculo principal (1) y secundario (0,5). Avisar si un grupo queda < 8 series/semana o muy por debajo del resto.
- **Estancamiento:** sin mejora del 1RM estimado en 3 semanas → aviso.
- **Fuerza relativa:** 1RM / peso corporal (peso de Salud más cercano). Si baja 2 semanas seguidas mientras baja el peso → aviso de posible pérdida de músculo.
- **Doble progresión** como sugerencia: si todas las series llegan al tope de reps del rango, sugerir +2,5 kg (máquina/barra) o +1–2 kg (mancuerna).

---

## 8. Planes de cardio (`Domain/CardioPlans`)

### Zonas de FC (Karvonen)
`FCR = FCmax − FCreposo`. Z2 = FCreposo + 0,60–0,70 × FCR. Con FCmax 179 y reposo ~62 → Z2 ≈ 132–144 lpm. Recalcular con la media de reposo de 28 días.

### Plan 5K (2 sesiones/semana; ~9 semanas)
| Fase | Sesión |
|---|---|
| 1 (sem. 1–2) | 6–8 × (3 min corriendo + 1 min caminando) |
| 2 (sem. 3–4) | 4–5 × (5 min + 1 min caminando) |
| 3 (sem. 5–6) | 3 × (8–10 min + 1 min caminando) |
| 4 (sem. 7–8) | 20–25 min seguidos |
| 5 (sem. 9) | 5K o 30–35 min seguidos |

- Avanzar de fase solo si se completan **las 2 sesiones** de la fase con esfuerzo ≤ 6/10 y FC media ≤ techo de Z3. Si una semana solo cabe 1 carrera, se repite la fase.
- Sesiones suaves en Z2. La única "hard" de la semana puede ser la sesión más larga de la fase.

### Plan de natación
| Fase | Sesión tipo |
|---|---|
| 1 | Series de 100 m, 30 s descanso, 1.000–1.200 m totales |
| 2 | Series de 200 m, 30 s descanso |
| 3 | Series de 300–400 m |
| 4 | 500 m seguidos dentro de una sesión de 1,5–2 km |

- Siempre calentamiento y vuelta a la calma. Avanzar cuando complete la sesión sin parar fuera de los descansos y con FC moderada.
- Datos de la sesión desde Salud (Apple Watch): distancia, duración, FC, brazadas.

### Carga de entrenamiento (`Domain/Load`)
- Con FC: TRIMP por zonas (Edwards). Sin FC: sRPE = esfuerzo (1–10, pregunta rápida al terminar) × minutos.
- Gimnasio: sRPE por defecto 7 × duración si no se indica.

---

## 9. Pantallas

1. **Hoy:** semáforo con razones, sesión del día (ejercicios con último peso usado, o prescripción de carrera/natación), pasos de hoy vs objetivo, botón "Hecho" / "No puedo hoy".
2. **Semana:** entrada de disponibilidad por día → plan → resumen de Codex. Vista calendario con sesiones movibles (arrastrar).
3. **Gimnasio:** historial de sesiones, botón "Importar capturas", registro manual, detalle por ejercicio con gráfica de 1RM.
4. **Cardio:** fase actual del 5K y de natación, próximas sesiones, historial.
5. **Progreso:** fuerza (1RM de los básicos), volumen por músculo, peso, VFC y pulso en reposo con línea base, pasos.
6. **Ajustes:** perfil, objetivos, API key, modelo, plantilla de 3 días, umbrales de recuperación, notificaciones, calendario.

**Notificaciones:** sesión del día (por la mañana), pasos que faltan (por la tarde), recordatorio de planificar el domingo.

---

## 10. Datos iniciales (`Resources/SeedData.json`)

Biblioteca de ejercicios y mejores series recientes (Symmetry, 8 sep – 7 oct 2026, **ya normalizadas**). Usar para precargar el historial y mostrar "último peso" desde el primer día.

### Empuje
| Ejercicio | Equipo / modo | Mejor serie reciente | 1RM est. |
|---|---|---|---|
| Press de banca plano (barra recta) | barbell / total | 55 kg × 9 (22 sep) | ~72 kg |
| Press de banca inclinado (Smith) | smith / total | 70 kg × 7 (16 sep) | ~86 kg |
| Press de hombros (máquina) | machine / total | 25 kg × 10 | ~33 kg |
| Elevaciones laterales (máquina) | machine / total | 30 kg × 18 | — |
| Elevaciones laterales sentado con respaldo (mancuerna) | dumbbell / perDumbbell | 8 kg × 15 | — |
| Aperturas pec deck (máquina) | machine / total | 20 kg × 11 | ~27 kg |
| Extensión de tríceps agarre recto (polea) | cable / total | 22,5 kg × 14 | — |
| Extensión katana unilateral polea baja | cable / total | 7,5 kg × 10 | — |

### Tracción
| Ejercicio | Equipo / modo | Mejor serie reciente | 1RM est. |
|---|---|---|---|
| Jalón al pecho agarre prono (máquina) | machine / total | 60 kg × 7 (7 oct) | ~74 kg |
| Jalón al pecho agarre cerrado (máquina) | machine / total | 50 kg × 10 | ~67 kg |
| Jalón al pecho agarre neutro abierto (máquina) | machine / total | 52,5 kg × 10 (8 sep) | ~70 kg |
| Remo agarre neutro (máquina) | machine / total | 70 kg × 12 | ~98 kg |
| Curl de bíceps inclinado supino (mancuerna) | dumbbell / perDumbbell | 12 kg × 9 | ~15 kg |
| Curl martillo sentado alternando (mancuerna) | dumbbell / perDumbbell | 12 kg × 10 | ~16 kg |
| Curl de bíceps (polea) | cable / total | 15 kg × 12 | ~21 kg |
| Curl predicador unilateral (mancuerna) | dumbbell / perDumbbell | 12 kg × 10 | ~16 kg |
| Curl de concentración agarre inverso | dumbbell / **por confirmar** | 16 kg × 15 (7 oct) | — |
| Aperturas inversas banco inclinado (mancuerna) | dumbbell / **por confirmar** | 12 kg × 15 | — |

### Pierna
| Ejercicio | Equipo / modo | Mejor serie reciente | 1RM est. |
|---|---|---|---|
| Prensa 45° (máquina) | machine / total | 140 kg × 10 (9 sep) | ~187 kg |
| Curl femoral tumbado (mancuerna) | dumbbell / total | 20 kg × 11 | ~27 kg |
| Extensión de rodilla (máquina) | machine / total | 30 kg × 11 (40 kg × 6) | ~41 kg |
| Abducción de cadera (máquina) | machine / total | 50 kg × 12 | — |
| Hip thrust (máquina) | machine / total | **No realizado** (registrado a 0 kg) | — |

### Sesiones importadas (13)
Tracción: 8, 12, 15, 18 y 23 sep; 7 oct · Empuje: 11, 16 y 22 sep; 5 oct; + 1 sin fecha visible (press inclinado 70×6, 65×7, 70×5, 65×8; banca 30×12, 40×12, 45×9) · Pierna: 9 y 25 sep.

Los "por confirmar" se preguntan al usuario la primera vez que aparezcan en la app.

---

## 11. Uso de Codex (Anthropic API)

- `AnthropicClient`: POST a Messages API con `x-api-key` (guardada en el dispositivo), `anthropic-version`, modelo desde Ajustes. Reintentos con backoff, timeouts, errores mostrados al usuario en español.
- **Lectura de capturas:** imágenes en base64 + instrucciones del formato Symmetry (7.1). Respuesta forzada a JSON mediante tool use. Validar con `Codable`; si falla, reintentar una vez y si no, marcar para revisión manual.
- **Explicaciones:** input = JSON del plan + resumen de recuperación (agregados, no series crudas de Salud). Output = texto breve en español, tono directo. Prohibido inventar sesiones, cargas o diagnósticos.
- **Preguntas libres** ("¿puedo correr mañana?"): mismo contexto resumido + reglas del planificador como referencia.
- **Privacidad:** nunca enviar series crudas de HealthKit; solo agregados diarios/semanales y las capturas que el usuario elige.
- Funciona **sin API key** (todo menos importación de capturas y textos de Codex, que se sustituyen por textos de plantilla).

---

## 12. Fases de desarrollo

Cada fase termina con la app compilando, tests en verde y algo usable en el iPhone.

1. **Base + Salud:** proyecto Vite/React/PWA, IndexedDB, atajo "FitPlan sync" + importación del `HealthPayload`, pantalla Hoy con pasos, sueño (fusionado), VFC y pulso en reposo. Seed data cargado.
2. **Recuperación:** `RecoveryEngine` con tests, semáforo y razones en Hoy, gráficas de línea base en Progreso.
3. **Gimnasio:** biblioteca, registro manual, importación de capturas con agrupación/deduplicación/validación, pantalla de revisión, 1RM y volumen por músculo.
4. **Planificador:** entrada de disponibilidad, `WeekPlanner` con todas las reglas y tests, planes 5K y natación, reajuste diario por recuperación.
5. **Organización y pulido:** notificaciones, calendario (EventKit), resumen semanal planificado vs hecho, explicaciones y preguntas con Codex, Share Extension para capturas.
   - *Hecho (web):* notificaciones vía atajo + `GET /briefing` del Worker (misma lógica de dominio que la app); calendario como exportación `.ics`; resumen semanal planificado vs hecho; resumen del plan y preguntas con Codex (solo agregados). La Share Extension no es posible en una PWA de iOS: se usa "Importar capturas" (fototeca).

---

## 13. Convenciones y calidad

- Lógica de dominio en tipos puros (sin SwiftUI ni HealthKit) para poder testearla.
- Interfaces para la fuente de datos de Salud y `AnthropicClient` con implementaciones mock para tests y previews.
- **Tests obligatorios:** fusión de sueño (intervalos solapados de dos fuentes), estados de recuperación en los límites, reglas del planificador (Pierna vs carrera hard, máx. 1 hard, descarga), Epley, normalización mancuerna/par, agrupación y deduplicación de capturas (fixtures con páginas sin cabecera y solapadas).
- Modo demo con datos de ejemplo del seed (para desarrollo en el navegador del PC).
- Textos de interfaz en español; formatos de fecha/número con locale `es_ES`.
- No añadir funcionalidades fuera de esta especificación sin preguntar.
