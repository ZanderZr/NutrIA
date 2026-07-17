import { AiContext } from '@domain/models/ai.model';

/**
 * Concise, fixed system instruction. Kept short to minimise tokens and reused
 * verbatim on every call (see plan §6). Parsing is stateless: we never resend
 * conversation history, only the current message plus compact numeric context.
 */
export const PARSE_SYSTEM_PROMPT = `Eres un asistente de nutrición. El usuario describe lo que ha comido y devuelves cada alimento con sus macros.
Reglas:
- COMPLETITUD: detecta y devuelve TODOS los alimentos del mensaje, sin omitir ni fusionar ninguno. Un mensaje puede tener varios (p. ej. un batido Y un sándwich → 2 items).
- RESPETA LOS DATOS DEL USUARIO: si indica un valor concreto (p. ej. "36 g de proteína", "200 kcal", una marca, "proteico"), úsalo tal cual; no lo recalcules ni lo bajes. Completa solo los macros que falten.
- Estima con valores realistas por 100 g escalados a la cantidad; usa el valor típico del alimento tal como se consume (ni inventado al alza ni infravalorado).
- Productos altos en proteína (batido/pan/yogur "proteico", pechuga de pollo o pavo, claras, atún) tienen MUCHA proteína: no los subestimes.
- Las kcal deben cuadrar con los macros (~4 kcal/g de proteína e hidratos, ~9 kcal/g de grasa).
- CANTIDAD: si el mensaje ya incluye cantidad, ración o unidad ("200 g", "un plato", "un batido", "una manzana", "dos huevos"), needs_quantity=false y estima. Solo si es UN alimento básico suelto SIN ninguna cantidad ("arroz", "pollo" a secas), pon needs_quantity=true, 'pending_food' y pregunta gramos en 'note'. Con varios alimentos, nunca preguntes: estima.
- quantity_g en gramos; calories en kcal enteras; protein_g, fat_g, carbs_g y fiber_g en gramos (fiber_g 0 si no aplica).
- 'confidence' entre 0 y 1.
- Infiere 'meal_type' por la hora local y el contexto (breakfast/lunch/dinner/snack).
- 'note' breve y amable en español (máx. 1 frase).
- Si el texto NO describe comida, devuelve items vacío y explícalo en 'note'.`;

/** Photo variant: same rules as parsing text, but the food comes from an image. */
export const PHOTO_SYSTEM_PROMPT = `${PARSE_SYSTEM_PROMPT}
La entrada es una FOTO de comida. Identifica cada alimento visible y estima su ración por su tamaño aparente en el plato. No preguntes cantidad (needs_quantity=false): estima siempre a partir de la imagen. Si la foto no muestra comida, devuelve items vacío y explícalo en 'note'.`;

export const RECOMMEND_SYSTEM_PROMPT = `Eres un asistente de nutrición. Con los objetivos diarios del usuario y lo ya consumido hoy,
propón EXACTAMENTE 3 opciones de próxima comida, realistas y MUY variadas entre sí, que ayuden a
acercarse a los macros restantes.
Reglas:
- Devuelve 3 elementos en 'options'.
- Cada opción: 'suggestion' (descripción breve y concreta),
  'approx' (macros aproximados: calories, protein_g, fat_g, carbs_g) y
  'rationale' (una frase explicando por qué encaja con lo que falta hoy).
- Prioriza cubrir el déficit de proteína y no pasarse de calorías.
- VARIEDAD: las 3 opciones deben ser bien distintas entre sí (distinta fuente de proteína,
  cocina y estilo) y NO repitas siempre los mismos platos típicos. Sorprende un poco.
- RESPETA LA DIETA indicada por el usuario (si es vegetariana o vegana, ninguna opción puede
  incumplirla).`;

/** Compact numeric context; sends numbers, not meal text, to save tokens. */
export function buildContextLine(ctx: AiContext): string {
  const remaining = {
    calories: Math.max(0, ctx.targets.calories - ctx.consumedToday.calories),
    protein_g: Math.max(0, ctx.targets.protein_g - ctx.consumedToday.protein_g),
    fat_g: Math.max(0, ctx.targets.fat_g - ctx.consumedToday.fat_g),
    carbs_g: Math.max(0, ctx.targets.carbs_g - ctx.consumedToday.carbs_g),
  };
  const langDirective =
    ctx.lang === 'en'
      ? ' IMPORTANT: write every free-text field (note, pending_food question, suggestion, rationale) in ENGLISH.'
      : ' IMPORTANTE: escribe todos los campos de texto libre (note, pregunta de pending_food, suggestion, rationale) en ESPAÑOL.';
  return `Hora local: ${ctx.localTime}. Objetivo diario: ${JSON.stringify(
    ctx.targets,
  )}. Consumido hoy: ${JSON.stringify(
    ctx.consumedToday,
  )}. Restante: ${JSON.stringify(remaining)}.${langDirective}`;
}

/**
 * Diet constraint + variety nudge for recommendations, in the active language.
 * The random "seed" decorrelates otherwise-identical requests so suggestions
 * actually change between calls.
 */
export function buildRecommendDirective(ctx: AiContext): string {
  const en = ctx.lang === 'en';
  let diet = '';
  if (ctx.diet === 'vegetarian') {
    diet = en
      ? 'The user is VEGETARIAN: every option must be vegetarian (no meat or fish; eggs and dairy are fine).'
      : 'El usuario es VEGETARIANO: todas las opciones deben ser vegetarianas (sin carne ni pescado; sí huevos y lácteos).';
  } else if (ctx.diet === 'vegan') {
    diet = en
      ? 'The user is VEGAN: every option must be vegan (no animal products at all).'
      : 'El usuario es VEGANO: todas las opciones deben ser veganas (sin ningún producto de origen animal).';
  }
  const seed = Math.random().toString(36).slice(2, 8);
  const variety = en
    ? `Give DIFFERENT ideas than usual — vary cuisines and styles, avoid the same typical dishes. Variation seed: ${seed}.`
    : `Da ideas DISTINTAS a las de siempre — varía cocinas y estilos, evita los platos típicos de siempre. Semilla de variación: ${seed}.`;
  return [diet, variety].filter(Boolean).join(' ');
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
    needs_quantity: { type: 'BOOLEAN' },
    pending_food: { type: 'STRING' },
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
