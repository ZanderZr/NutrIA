import {
  validateParsedMeal,
  validateParsedRoutine,
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

describe('validateParsedRoutine', () => {
  const fullExercise = {
    name: 'Press banca',
    muscle_group: 'pecho',
    unit: 'kg',
    target_sets: 4,
    target_reps: '8-12',
    target_weight_kg: 60,
    target_seconds: 0,
    target_distance_m: 0,
    rest_seconds: 90,
    notes: 'controla la bajada',
  };

  it('accepts a well-formed routine', () => {
    const routine = validateParsedRoutine({
      name: 'Fuerza 3 días',
      note: 'ok',
      days: [{ name: 'Día 1', notes: '', exercises: [fullExercise] }],
    });
    expect(routine.days.length).toBe(1);
    expect(routine.days[0].exercises[0].target_reps).toBe('8-12');
  });

  it('defaults the optional fields when the model omits them', () => {
    const routine = validateParsedRoutine({
      name: 'Mínima',
      days: [
        {
          name: 'Día 1',
          exercises: [{ name: 'Sentadilla', unit: 'kg', target_sets: 3, target_reps: '' }],
        },
      ],
    });
    const ex = routine.days[0].exercises[0];
    expect(routine.note).toBe('');
    expect(routine.days[0].notes).toBe('');
    expect(ex.muscle_group).toBe('');
    expect(ex.rest_seconds).toBe(0);
    expect(ex.target_weight_kg).toBe(0);
  });

  it('falls back instead of throwing on a slightly wrong number or unit', () => {
    const routine = validateParsedRoutine({
      name: 'Rara',
      days: [
        {
          name: 'Día 1',
          exercises: [
            {
              name: 'Plancha',
              unit: 'segundos',
              target_sets: null,
              target_reps: '45 s',
              rest_seconds: 'mucho',
            },
          ],
        },
      ],
    });
    const ex = routine.days[0].exercises[0];
    expect(ex.unit).toBe('kg');
    expect(ex.target_sets).toBe(3);
    expect(ex.rest_seconds).toBe(0);
  });

  it('throws on an empty routine so the corrective retry fires', () => {
    expect(() => validateParsedRoutine({ name: 'Vacía', days: [] })).toThrow();
    expect(() =>
      validateParsedRoutine({
        name: 'Día sin ejercicios',
        days: [{ name: 'Día 1', exercises: [] }],
      }),
    ).toThrow();
  });

  it('throws on an exercise with no name', () => {
    expect(() =>
      validateParsedRoutine({
        name: 'Sin nombre',
        days: [
          { name: 'Día 1', exercises: [{ ...fullExercise, name: '' }] },
        ],
      }),
    ).toThrow();
  });
});
