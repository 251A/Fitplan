// Sends one screenshot to Claude (vision) and gets a validated ExtractedPage (spec 7.1 step 2, 11).
// Invalid output → one retry; if it still fails the page is left for manual review.

import { createMessage, responseText, type CallOptions, type ClaudeConfig } from '../ai/anthropicClient';
import { EXTRACTED_PAGE_SCHEMA, ExtractionError, validateExtractedPage, type ExtractedPage } from './extraction';

export interface PageImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Base64 without the data: prefix. */
  data: string;
}

export const SYMMETRY_PROMPT = `Extraes datos de capturas de pantalla de la app de gimnasio Symmetry (en español).

Tipos de captura:
- "detail": pantalla "Detalle de Entrenamiento". Arriba puede haber una cabecera con usuario, fecha ("8 de septiembre, 2026"), nombre de la sesión (p. ej. "Tracción A"), Tiempo, Volumen y Series. Debajo, bloques de ejercicio con filas "Serie" y "Peso / Reps" ("52.5 kg × 10 reps").
- "summary_card": tarjeta resumen para compartir, con fecha/nombre/totales pero sin ejercicios.
- "other": cualquier otra cosa.

Reglas:
- Copia los números exactamente como aparecen; no calcules ni corrijas nada. Un peso de 0 kg se escribe 0.
- Fecha en formato AAAA-MM-DD. duration_min en minutos. volume_kg y sets_total tal como los muestra la cabecera.
- has_header = true solo si la captura muestra la cabecera con fecha y nombre; si no, header = null.
- Nombre del ejercicio tal como aparece, incluido el paréntesis del equipo ("(Máquina)", "(Mancuerna)").
- index = número de la serie mostrado en la fila.
- cut_at_top = true si el bloque empieza cortado por arriba (faltan su título o sus primeras series en esta captura).
- cut_at_bottom = true si el bloque sigue por debajo del borde inferior de la captura.
- Si una fila está tapada o ilegible, omítela.`;

export async function extractPage(cfg: ClaudeConfig, image: PageImage, opts: CallOptions = {}): Promise<ExtractedPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await createMessage(
      cfg,
      {
        max_tokens: 8000,
        system: SYMMETRY_PROMPT,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXTRACTED_PAGE_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
              { type: 'text', text: 'Extrae los datos de esta captura.' },
            ],
          },
        ],
      },
      opts,
    );
    try {
      return validateExtractedPage(JSON.parse(responseText(msg)));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof ExtractionError
    ? lastError
    : new ExtractionError('Claude no devolvió datos válidos para esta captura. Introdúcela a mano.');
}
