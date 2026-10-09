# Atajo "FitPlan sync"

Lee Apple Salud y copia al portapapeles un JSON (`HealthPayload` v1) que FitPlan importa con el botón **Pegar**.
El formato exacto está en `src/data/health/payload.ts`. La app tolera comas decimales, números como texto
y nombres en español ("Núcleo", "Profundo", "Carrera"…), así que no hace falta formatear nada a mano.

> ⚠️ Estos pasos aún no se han probado en un iPhone real. Si algún nombre de acción no coincide, dímelo y lo ajusto.

## Estructura del JSON

```json
{
  "version": 1,
  "generatedAt": "2026-10-08T07:30:00+02:00",
  "steps":     [{ "date": "2026-10-08", "value": 15400 }],
  "sleep":     [{ "start": "…", "end": "…", "value": "Núcleo", "source": "Apple Watch de Ana" }],
  "hrv":       [{ "start": "…", "value": 64.5 }],
  "restingHR": [{ "start": "…", "value": 61 }],
  "bodyMass":  [{ "start": "…", "value": 71.2 }],
  "workouts":  [{ "start": "…", "end": "…", "type": "Carrera", "source": "Runna", "durationMin": 30 }]
}
```

Todas las fechas en **ISO 8601** (acción *Formatear fecha* → formato *ISO 8601*, con hora).

## Pasos para crearlo (app Atajos)

1. **Nuevo atajo** → nombre `FitPlan sync`.
2. **Pasos** (un valor por día):
   - *Buscar muestras de Salud* → Tipo: **Pasos**, Fecha de inicio: *en los últimos 7 días*, **Agrupar por: Día**.
   - *Repetir con cada* elemento:
     - *Formatear fecha* (Fecha de inicio del elemento) → formato personalizado `yyyy-MM-dd`.
     - *Texto*: `{"date":"[Fecha formateada]","value":"[Valor]"}`
   - Fin de la repetición → *Combinar texto* (Resultados de la repetición) con separador **personalizado `,`** → variable `Pasos`.
3. **Sueño** (muestras individuales, NO agrupar):
   - *Buscar muestras de Salud* → Tipo: **Análisis del sueño**, últimos 7 días.
   - *Repetir con cada*: *Texto* `{"start":"[Fecha de inicio ISO]","end":"[Fecha de finalización ISO]","value":"[Valor]","source":"[Fuente]"}`
   - *Combinar texto* con `,` → variable `Sueño`.
4. **VFC** (Variabilidad de la frecuencia cardiaca), **Pulso en reposo** y **Peso**: igual que los pasos,
   **agrupados por día** (`{"date":"[yyyy-MM-dd]","value":"[Valor]"}`) → variables `VFC`, `Reposo`, `Peso`.
   Los días sin dato llegan como `0` y la app los ignora. También acepta muestras sueltas
   (`{"start":"[Fecha de inicio ISO]","value":"[Valor]"}`), que permiten usar solo la VFC medida durante el sueño.
   Para VFC y pulso en reposo usa *en los últimos 35 días* la primera vez (la app necesita 28 días de línea base); después basta con 7.
5. **Entrenos**: *Buscar muestras de Salud* → Tipo: **Entrenamientos**, últimos 7 días →
   `{"start":"[Fecha de inicio ISO]","end":"[Fecha de finalización ISO]","type":"[Tipo de entrenamiento]","source":"[Fuente]"}` → variable `Entrenos`.
6. **Montar el JSON** con una acción *Texto*:
   ```
   {"version":1,"generatedAt":"[Fecha actual ISO]","steps":[[Pasos]],"sleep":[[Sueño]],"hrv":[[VFC]],"restingHR":[[Reposo]],"bodyMass":[[Peso]],"workouts":[[Entrenos]]}
   ```
7. **Enviar a tu servidor** (recomendado; así llega al iPhone y al ordenador sin hacer nada):
   - *Obtener contenido de URL* → URL `https://fitplan-sync.fitplan.workers.dev/health`
   - Método: **POST**
   - Encabezados: `Authorization` = `Bearer TU_CLAVE` (la clave de `private/sync-token.txt`) y `Content-Type` = `application/json`
   - Cuerpo de la solicitud: **Archivo** → el Texto del paso 6.
   - *Mostrar notificación* "FitPlan: datos de Salud enviados".
8. **Alternativa sin servidor**: en lugar del paso 7, *Copiar al portapapeles* el Texto y *Mostrar notificación*
   "Datos copiados: abre FitPlan y pulsa Pegar".

## Automatización diaria

Atajos → **Automatización** → *Nueva* → **Hora del día** (p. ej. 7:30, diaria) → *Ejecutar inmediatamente* → acción *Ejecutar atajo* `FitPlan sync`.

La primera vez, iOS pedirá permiso para que Atajos lea cada tipo de dato de Salud: acéptalos todos.
