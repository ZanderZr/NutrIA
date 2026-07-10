import { AiContext } from '@domain/models/ai.model';

/**
 * Concise, fixed system instruction. Kept short to minimise tokens and reused
 * verbatim on every call (see plan §6). Parsing is stateless: we never resend
 * conversation history, only the current message plus compact numeric context.
 */
export const PARSE_SYSTEM_PROMPT = `Eres un asistente de nutrición. El usuario describe en lenguaje natural lo que ha comido.
Devuelve SOLO los alimentos detectados con cantidades y macros estimados.
Reglas:
- Usa valores nutricionales estándar por alimento y la cantidad indicada.
- Si no se indica cantidad, estima una ración típica y baja la 'confidence'.
- quantity_g en gramos; calories en kcal enteras; protein_g, fat_g, carbs_g y fiber_g en gramos.
- fiber_g es la fibra alimentaria del alimento (0 si no aplica).
- 'confidence' entre 0 y 1 (1 = cantidad y alimento claros).
- Infiere 'meal_type' por la hora local y el contexto (breakfast/lunch/dinner/snack).
- 'note' es un mensaje breve y amable en español (máx. 1 frase).
- Si el texto NO describe comida, devuelve items vacío y explica en 'note'.`;

export const RECOMMEND_SYSTEM_PROMPT = `Eres un asistente de nutrición. Con los objetivos diarios del usuario y lo ya consumido hoy,
propón EXACTAMENTE 3 opciones de próxima comida, realistas y variadas entre sí, que ayuden a
acercarse a los macros restantes.
Reglas:
- Devuelve 3 elementos en 'options'.
- Cada opción: 'suggestion' (descripción breve y concreta en español),
  'approx' (macros aproximados: calories, protein_g, fat_g, carbs_g) y
  'rationale' (una frase explicando por qué encaja con lo que falta hoy).
- Prioriza cubrir el déficit de proteína y no pasarse de calorías.
- Que las 3 opciones sean distintas (p. ej. distinta fuente de proteína o estilo de plato).`;

/** Compact numeric context; sends numbers, not meal text, to save tokens. */
export function buildContextLine(ctx: AiContext): string {
  const remaining = {
    calories: Math.max(0, ctx.targets.calories - ctx.consumedToday.calories),
    protein_g: Math.max(0, ctx.targets.protein_g - ctx.consumedToday.protein_g),
    fat_g: Math.max(0, ctx.targets.fat_g - ctx.consumedToday.fat_g),
    carbs_g: Math.max(0, ctx.targets.carbs_g - ctx.consumedToday.carbs_g),
  };
  return `Hora local: ${ctx.localTime}. Objetivo diario: ${JSON.stringify(
    ctx.targets,
  )}. Consumido hoy: ${JSON.stringify(
    ctx.consumedToday,
  )}. Restante: ${JSON.stringify(remaining)}.`;
}

/**
 * Gemini responseSchema (OpenAPI subset) — forces a consistent JSON shape so we
 * never parse free-form text. Validated again with Zod before persisting.
 */
export const PARSE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity_g: { type: 'NUMBER' },
          calories: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' },
          fat_g: { type: 'NUMBER' },
          carbs_g: { type: 'NUMBER' },
          fiber_g: { type: 'NUMBER' },
          confidence: { type: 'NUMBER' },
        },
        required: [
          'name',
          'quantity_g',
          'calories',
          'protein_g',
          'fat_g',
          'carbs_g',
          'fiber_g',
          'confidence',
        ],
      },
    },
    meal_type: {
      type: 'STRING',
      enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    },
    note: { type: 'STRING' },
  },
  required: ['items', 'meal_type', 'note'],
};

export const RECOMMEND_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    options: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          suggestion: { type: 'STRING' },
          approx: {
            type: 'OBJECT',
            properties: {
              calories: { type: 'NUMBER' },
              protein_g: { type: 'NUMBER' },
              fat_g: { type: 'NUMBER' },
              carbs_g: { type: 'NUMBER' },
            },
            required: ['calories', 'protein_g', 'fat_g', 'carbs_g'],
          },
          rationale: { type: 'STRING' },
        },
        required: ['suggestion', 'approx', 'rationale'],
      },
    },
  },
  required: ['options'],
};
