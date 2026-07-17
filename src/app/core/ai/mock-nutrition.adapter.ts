import { Injectable } from '@angular/core';
import { AiNutritionPort, MealImage } from './ai-nutrition.port';
import {
  AiContext,
  ParsedMeal,
  Recommendation,
} from '@domain/models/ai.model';
import { MealType } from '@domain/models/meal.model';

/**
 * Offline/dev implementation of the AI port. Produces plausible structured data
 * without calling Gemini, so the full pipeline (parse → persist → dashboard) can
 * be developed and tested without an API key or spending tokens.
 * Bind it in place of GeminiNutritionAdapter in main.ts during development.
 */
@Injectable({ providedIn: 'root' })
export class MockNutritionAdapter implements AiNutritionPort {
  async parseMeal(text: string, context: AiContext): Promise<ParsedMeal> {
    await this.delay();

    // Mirror the real behaviour: a lone basic ingredient with no amount asks
    // for grams; anything with a number or several words is estimated.
    const words = text.trim().split(/\s+/).filter(Boolean);
    const hasNumber = /\d/.test(text);
    if (!hasNumber && words.length === 1) {
      const food = words[0];
      return {
        meal_type: this.inferMealType(context.localTime),
        note: `¿Cuántos gramos de ${food}? Dímelo y lo registro. (modo demo)`,
        needs_quantity: true,
        pending_food: food,
        items: [],
      };
    }

    return {
      meal_type: this.inferMealType(context.localTime),
      note: `Registrado (modo demo): "${text.slice(0, 40)}"`,
      items: [
        {
          name: text.slice(0, 30) || 'Alimento',
          quantity_g: 150,
          calories: 320,
          protein_g: 25,
          fat_g: 12,
          carbs_g: 28,
          fiber_g: 4,
          confidence: 0.5,
          range: {
            calories: { min: 285, max: 360 },
            protein_g: { min: 20, max: 30 },
            carbs_g: { min: 24, max: 33 },
            fat_g: { min: 9, max: 15 },
          },
        },
      ],
    };
  }

  async parseMealImage(
    _image: MealImage,
    context: AiContext,
  ): Promise<ParsedMeal> {
    await this.delay(700);
    return {
      meal_type: this.inferMealType(context.localTime),
      note: 'Detectado en la foto (modo demo): plato combinado.',
      items: [
        {
          name: 'Plato de la foto',
          quantity_g: 350,
          calories: 540,
          protein_g: 32,
          fat_g: 20,
          carbs_g: 55,
          fiber_g: 6,
          confidence: 0.5,
          range: {
            calories: { min: 470, max: 620 },
            protein_g: { min: 26, max: 38 },
            carbs_g: { min: 45, max: 65 },
            fat_g: { min: 15, max: 26 },
          },
        },
      ],
    };
  }

  /** Pool of demo suggestions tagged by diet, so the mock shows variety + diet. */
  private readonly recPool: {
    suggestion: string;
    approx: { calories: number; protein_g: number; fat_g: number; carbs_g: number };
    diet: 'omnivore' | 'vegetarian' | 'vegan';
  }[] = [
    { suggestion: 'Pechuga de pollo a la plancha con arroz integral', approx: { calories: 450, protein_g: 40, fat_g: 10, carbs_g: 45 }, diet: 'omnivore' },
    { suggestion: 'Salmón al horno con quinoa y verduras', approx: { calories: 520, protein_g: 38, fat_g: 22, carbs_g: 35 }, diet: 'omnivore' },
    { suggestion: 'Wok de ternera magra con brócoli y fideos', approx: { calories: 480, protein_g: 36, fat_g: 14, carbs_g: 48 }, diet: 'omnivore' },
    { suggestion: 'Tacos de atún con maíz y aguacate', approx: { calories: 430, protein_g: 34, fat_g: 15, carbs_g: 40 }, diet: 'omnivore' },
    { suggestion: 'Tortilla de claras con pan integral y requesón', approx: { calories: 400, protein_g: 42, fat_g: 8, carbs_g: 38 }, diet: 'vegetarian' },
    { suggestion: 'Bowl de garbanzos, huevo cocido y aguacate', approx: { calories: 470, protein_g: 26, fat_g: 20, carbs_g: 45 }, diet: 'vegetarian' },
    { suggestion: 'Yogur griego con frutos rojos, avena y nueces', approx: { calories: 380, protein_g: 24, fat_g: 12, carbs_g: 42 }, diet: 'vegetarian' },
    { suggestion: 'Tofu salteado con arroz y edamame', approx: { calories: 440, protein_g: 28, fat_g: 16, carbs_g: 46 }, diet: 'vegan' },
    { suggestion: 'Lentejas estofadas con verduras y quinoa', approx: { calories: 420, protein_g: 24, fat_g: 8, carbs_g: 62 }, diet: 'vegan' },
    { suggestion: 'Ensalada de garbanzos, quinoa y tahini', approx: { calories: 460, protein_g: 22, fat_g: 18, carbs_g: 52 }, diet: 'vegan' },
  ];

  async recommendNextMeal(context: AiContext): Promise<Recommendation> {
    await this.delay();
    const remainingProtein = Math.max(
      0,
      context.targets.protein_g - context.consumedToday.protein_g,
    );
    const why = `Aporta proteína para las ${Math.round(
      remainingProtein,
    )} g que te faltan hoy (modo demo).`;
    const allowed = this.recPool.filter((o) => this.dietOk(o.diet, context.diet));
    const picked = [...allowed].sort(() => Math.random() - 0.5).slice(0, 3);
    return {
      options: picked.map((o) => ({
        suggestion: o.suggestion,
        approx: o.approx,
        rationale: why,
      })),
    };
  }

  /** Whether a dish fits the user's diet (vegetarian allows vegan too). */
  private dietOk(
    dish: 'omnivore' | 'vegetarian' | 'vegan',
    user: 'omnivore' | 'vegetarian' | 'vegan',
  ): boolean {
    if (user === 'omnivore') return true;
    if (user === 'vegetarian') return dish !== 'omnivore';
    return dish === 'vegan';
  }

  async verifyKey(_key: string): Promise<boolean> {
    await this.delay(200);
    return true;
  }

  private inferMealType(localTime: string): MealType {
    const hour = parseInt(localTime.split(':')[0] ?? '12', 10);
    if (hour < 11) return 'breakfast';
    if (hour < 16) return 'lunch';
    if (hour < 22) return 'dinner';
    return 'snack';
  }

  private delay(ms = 400): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
