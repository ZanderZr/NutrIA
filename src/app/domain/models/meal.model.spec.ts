import {
  MealItem,
  computeMealTotals,
  recommendedFiber,
  inferMealType,
  emptySummary,
} from './meal.model';

function item(over: Partial<MealItem>): MealItem {
  return {
    name: 'x',
    quantity_g: 100,
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    fiber_g: 0,
    confidence: 1,
    ...over,
  };
}

describe('computeMealTotals', () => {
  it('sums each macro across items', () => {
    const totals = computeMealTotals([
      item({ calories: 200, protein_g: 20, fat_g: 5, carbs_g: 15, fiber_g: 3 }),
      item({ calories: 100, protein_g: 10, fat_g: 2, carbs_g: 8, fiber_g: 1 }),
    ]);
    expect(totals.total_calories).toBe(300);
    expect(totals.total_protein_g).toBe(30);
    expect(totals.total_fat_g).toBe(7);
    expect(totals.total_carbs_g).toBe(23);
    expect(totals.total_fiber_g).toBe(4);
  });

  it('is all zeros for an empty meal', () => {
    const totals = computeMealTotals([]);
    expect(totals.total_calories).toBe(0);
    expect(totals.total_protein_g).toBe(0);
    expect(totals.total_sodium_mg).toBe(0);
  });

  it('sums micronutrients and treats missing ones as zero', () => {
    const totals = computeMealTotals([
      item({ sugar_g: 10, sat_fat_g: 3, sodium_mg: 200 }),
      item({ sugar_g: 5 }), // sat_fat_g / sodium_mg absent → 0
    ]);
    expect(totals.total_sugar_g).toBe(15);
    expect(totals.total_sat_fat_g).toBe(3);
    expect(totals.total_sodium_mg).toBe(200);
  });
});

describe('recommendedFiber', () => {
  it('is 14 g per 1000 kcal, rounded', () => {
    expect(recommendedFiber(2000)).toBe(28);
    expect(recommendedFiber(2500)).toBe(35);
    expect(recommendedFiber(0)).toBe(0);
  });
});

describe('inferMealType', () => {
  it('maps the hour of day to a meal', () => {
    expect(inferMealType(8)).toBe('breakfast');
    expect(inferMealType(10)).toBe('breakfast');
    expect(inferMealType(13)).toBe('lunch');
    expect(inferMealType(20)).toBe('dinner');
    expect(inferMealType(23)).toBe('snack');
    expect(inferMealType(3)).toBe('breakfast');
  });
});

describe('emptySummary', () => {
  it('zeros every total and keeps the date', () => {
    const s = emptySummary('2026-07-16');
    expect(s.date).toBe('2026-07-16');
    expect(s.calories).toBe(0);
    expect(s.meal_count).toBe(0);
  });
});
