import { AiContext } from '@domain/models/ai.model';

/**
 * Concise, fixed system instruction. Kept short to minimise tokens and reused
 * verbatim on every call (see plan §6). Parsing is stateless: we never resend
 * conversation history, only the current message plus compact numeric context.
 */
export const PARSE_SYSTEM_PROMPT = `Eres un asistente de nutrición. El usuario describe en lenguaje natural lo que ha comido.
Devuelve SOLO los alimentos detectados con cantidades y macros estimados.
Reglas:
- Da una estimación REALISTA y REPRESENTATIVA: usa el valor TÍPICO/MEDIO del alimento, NUNCA el máximo ni el mínimo del rango posible. No redondees sistemáticamente al alza; si dudas, tira al punto medio.
- Usa valores nutricionales estándar por 100 g y escálalos a la cantidad indicada.
- Asume el corte y la preparación más COMUNES salvo que se especifique (p. ej. "pollo" = mezcla habitual de pechuga y muslo, no la parte más magra posible).
- Interpreta el peso como el del alimento listo para comer (cocinado) salvo que se diga "crudo". Ante la ambigüedad crudo/cocinado, elige el punto medio razonable y baja 'confidence'.
- Las kcal deben ser coherentes con los macros (~4 kcal/g de proteína e hidratos, ~9 kcal/g de grasa).
- CANTIDAD: si el mensaje es UN alimento básico suelto SIN cantidad ni ración ni unidad (p. ej. "arroz", "pollo", "pan", "aceite"), NO lo registres: devuelve items vacío, pon 'needs_quantity'=true, 'pending_food' con ese alimento, y en 'note' pregunta amablemente cuántos gramos son. En cambio, SÍ estima (needs_quantity=false) cuando hay un plato compuesto o una ración/unidad implícita: "un plato de cocido", "un bocadillo de jamón", "una manzana", "dos huevos", "un puñado de almendras", "un vaso de leche". Si hay varios alimentos, no preguntes: estima.
- quantity_g en gramos; calories en kcal enteras; protein_g, fat_g, carbs_g y fiber_g en gramos.
- fiber_g es la fibra alimentaria del alimento (0 si no aplica).
- 'confidence' entre 0 y 1 (1 = cantidad y alimento claros; baja el valor cuanto mayor sea el rango posible).
- Además del valor central, rellena 'range' con el rango plausible (mínimo y máximo realistas) de calories, protein_g, carbs_g y fat_g. El valor central debe quedar DENTRO de su rango. Cuanto más claro el alimento, más estrecho el rango.
- Infiere 'meal_type' por la hora local y el contexto (breakfast/lunch/dinner/snack).
- 'note' es un mensaje breve y amable en español (máx. 1 frase).
- Si el texto NO describe comida, devuelve items vacío y explica en 'note'.
Ejemplo: "200 g de pollo" → protein_g 54 (central), protein_g_min 46, protein_g_max 62 (crudo vs cocinado). Central = punto medio, NO 62.`;

/** Photo variant: same rules as parsing text, but the food comes from an image. */
export const PHOTO_SYSTEM_PROMPT = `${PARSE_SYSTEM_PROMPT}
La entrada es una FOTO de comida. Identifica cada alimento visible y estima su ración por su tamaño aparente en el plato. No preguntes cantidad (needs_quantity=false): estima siempre a partir de la imagen. Si la foto no muestra comida, devuelve items vacío y explícalo en 'note'.`;

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
          range: {
            type: 'OBJECT',
            properties: {
              calories_min: { type: 'NUMBER' },
              calories_max: { type: 'NUMBER' },
              protein_g_min: { type: 'NUMBER' },
              protein_g_max: { type: 'NUMBER' },
              carbs_g_min: { type: 'NUMBER' },
              carbs_g_max: { type: 'NUMBER' },
              fat_g_min: { type: 'NUMBER' },
              fat_g_max: { type: 'NUMBER' },
            },
          },
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
