import { Injectable } from '@angular/core';
import { AiNutritionPort } from './ai-nutrition.port';
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
        },
      ],
    };
  }

  async recommendNextMeal(context: AiContext): Promise<Recommendation> {
    await this.delay();
    const remainingProtein = Math.max(
      0,
      context.targets.protein_g - context.consumedToday.protein_g,
    );
    const why = `Aporta proteína para las ${Math.round(
      remainingProtein,
    )} g que te faltan hoy (modo demo).`;
    return {
      options: [
        {
          suggestion: 'Pechuga de pollo a la plancha con ensalada y arroz integral',
          approx: { calories: 450, protein_g: 40, fat_g: 10, carbs_g: 45 },
          rationale: why,
        },
        {
          suggestion: 'Salmón al horno con quinoa y verduras',
          approx: { calories: 520, protein_g: 38, fat_g: 22, carbs_g: 35 },
          rationale: why,
        },
        {
          suggestion: 'Tortilla de claras con pan integral y requesón',
          approx: { calories: 400, protein_g: 42, fat_g: 8, carbs_g: 38 },
          rationale: why,
        },
      ],
    };
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
