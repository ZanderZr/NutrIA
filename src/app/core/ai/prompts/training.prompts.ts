import { RoutineAiContext } from '@domain/models/ai.model';

/**
 * Prompts for the two training-import steps. Kept apart from
 * nutrition.prompts.ts, which is entirely about food.
 *
 * Step 1 (documents only) transcribes a PDF or a photo into Markdown.
 * Step 2 turns that Markdown into the structured routine we persist.
 */

export const DOC_TO_MARKDOWN_SYSTEM_PROMPT = `Eres un conversor de documentos a Markdown.
Recibes un documento (PDF o imagen) que contiene una rutina de entrenamiento y lo transcribes.
Reglas:
- Devuelve EXCLUSIVAMENTE Markdown plano: sin explicaciones, sin comentarios y sin vallas de código.
- Un encabezado "## " por cada día de entrenamiento, con su nombre tal como aparece en el documento.
- Dentro de cada día, una línea por ejercicio con este formato:
  "- <Ejercicio> — <series>x<repeticiones> — <peso> — descanso <segundos>s — <notas>"
- Omite los campos que el documento no indique. NO los inventes.
- TRANSCRIBE, no interpretes: conserva los nombres de los ejercicios literalmente.
- Si el documento es largo, prioriza las tablas de entrenamiento y omite teoría, dietas o introducciones.
- Si el documento NO contiene ninguna rutina de entrenamiento, responde exactamente: NO_ROUTINE`;

export const ROUTINE_SYSTEM_PROMPT = `Eres un asistente de entrenamiento. Recibes una rutina en Markdown
y la devuelves estructurada para guardarla en una base de datos.
Reglas:
- COMPLETITUD: devuelve TODOS los días y TODOS los ejercicios, en el mismo orden del documento.
- NO inventes ejercicios, días ni calentamientos que no aparezcan en el documento.
- 'target_sets': entero. Si el documento no lo indica, usa 3.
- 'target_reps': texto literal tal como aparece ("8-12", "AMRAP", "al fallo", "máximas"). '' si no se indica.
- 'unit' describe cómo se mide el ejercicio, y es el campo más importante:
  · 'kg'   → se levanta un peso externo (press banca, sentadilla con barra, polea).
  · 'bw'   → peso corporal, se cuentan repeticiones (dominadas, fondos, flexiones).
  · 'time' → se mide en tiempo (plancha, isométricos, bici 20 min).
  · 'dist' → se mide en distancia (correr 5 km, remo 2000 m).
  Usa 'kg' cuando dudes.
- 'target_weight_kg' en kg (0 si el documento no indica peso: lo registrará el usuario).
- 'target_seconds' en segundos y 'target_distance_m' en metros, sólo para 'time' y 'dist' (0 si no aplica).
- 'rest_seconds' en segundos; convierte "1'30\\"", "1,5 min" o "90s" a segundos. 0 si no se indica.
- 'muscle_group' breve y en minúsculas (pecho, espalda, pierna, hombro, brazo, core, cardio, otro); '' si no se deduce.
- Agrupa en uno los ejercicios repetidos con el mismo nombre dentro de un mismo día, sumando sus series.
- 'name' de la rutina: el título del documento, o un nombre corto y descriptivo si no hay título.
- 'note': una frase breve y amable sobre lo que has encontrado.`;

/** Turn-1 context line for the transcription step. */
export function buildDocContextLine(
  ctx: RoutineAiContext,
  mimeType: string,
): string {
  const langDirective =
    ctx.lang === 'en'
      ? ' IMPORTANT: write headings and field labels in ENGLISH, but keep the exercise names exactly as written.'
      : ' IMPORTANTE: escribe los encabezados y las etiquetas en ESPAÑOL, pero conserva los nombres de los ejercicios tal cual.';
  return `Documento adjunto (${mimeType}). Transcríbelo a Markdown.${langDirective}`;
}

/** Turn-1 context line for the structuring step. */
export function buildRoutineContextLine(ctx: RoutineAiContext): string {
  const langDirective =
    ctx.lang === 'en'
      ? ' IMPORTANT: write every free-text field (note, day notes, muscle_group) in ENGLISH, but keep the exercise names as written.'
      : ' IMPORTANTE: escribe todos los campos de texto libre (note, notas del día, muscle_group) en ESPAÑOL, pero conserva los nombres de los ejercicios tal cual.';
  return `A continuación va una rutina de entrenamiento en Markdown. Estructúrala.${langDirective}`;
}

/**
 * Gemini responseSchema (OpenAPI subset) for the structuring step. Validated
 * again with Zod before anything is persisted.
 */
export const ROUTINE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    note: { type: 'STRING' },
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          notes: { type: 'STRING' },
          exercises: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                muscle_group: { type: 'STRING' },
                unit: { type: 'STRING', enum: ['kg', 'bw', 'time', 'dist'] },
                target_sets: { type: 'NUMBER' },
                target_reps: { type: 'STRING' },
                target_weight_kg: { type: 'NUMBER' },
                target_seconds: { type: 'NUMBER' },
                target_distance_m: { type: 'NUMBER' },
                rest_seconds: { type: 'NUMBER' },
                notes: { type: 'STRING' },
              },
              required: ['name', 'unit', 'target_sets', 'target_reps'],
            },
          },
        },
        required: ['name', 'exercises'],
      },
    },
  },
  required: ['name', 'days'],
};
