import {
  validateParsedMeal,
  validateRecommendation,
} from './ai-response.validator';

describe('ai-response.validator', () => {
  it('accepts a well-formed parsed meal', () => {
    const result = validateParsedMeal({
      meal_type: 'breakfast',
      note: 'ok',
      items: [
        {
          name: 'Huevo',
          quantity_g: 100,
          calories: 155,
          protein_g: 13,
          fat_g: 11,
          carbs_g: 1,
          confidence: 0.9,
        },
      ],
    });
    expect(result.items.length).toBe(1);
    expect(result.meal_type).toBe('breakfast');
  });

  it('defaults confidence and note when missing', () => {
    const result = validateParsedMeal({
      meal_type: 'lunch',
      items: [
        {
          name: 'Arroz',
          quantity_g: 200,
          calories: 260,
          protein_g: 5,
          fat_g: 1,
          carbs_g: 57,
        },
      ],
    });
    expect(result.items[0].confidence).toBe(0.7);
    expect(result.note).toBe('');
  });

  it('rejects an invalid meal_type', () => {
    expect(() =>
      validateParsedMeal({ meal_type: 'brunch', items: [] }),
    ).toThrow();
  });

  it('rejects negative macros', () => {
    expect(() =>
      validateParsedMeal({
        meal_type: 'dinner',
        items: [
          {
            name: 'X',
            quantity_g: -5,
            calories: 10,
            protein_g: 0,
            fat_g: 0,
            carbs_g: 0,
          },
        ],
      }),
    ).toThrow();
  });

  it('validates a recommendation with several options', () => {
    const rec = validateRecommendation({
      options: [
        {
          suggestion: 'Pollo con arroz',
          approx: { calories: 450, protein_g: 40, fat_g: 10, carbs_g: 45 },
          rationale: 'cubre proteína',
        },
        {
          suggestion: 'Salmón con quinoa',
          approx: { calories: 520, protein_g: 38, fat_g: 22, carbs_g: 35 },
          rationale: 'grasa saludable',
        },
      ],
    });
    expect(rec.options.length).toBe(2);
    expect(rec.options[0].suggestion).toContain('Pollo');
  });

  it('rejects a recommendation with no options', () => {
    expect(() => validateRecommendation({ options: [] })).toThrow();
  });
});
