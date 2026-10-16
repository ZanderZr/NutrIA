import { Injectable } from '@angular/core';
import { AiDocument, AiNutritionPort, MealImage } from './ai-nutrition.port';
import {
  AiContext,
  CoachAdvice,
  CoachContext,
  ParsedMeal,
  ParsedRoutine,
  ParsedRoutineExercise,
  Recommendation,
  RoutineAiContext,
} from '@domain/models/ai.model';
import { MealType } from '@domain/models/meal.model';
import { ExerciseUnit } from '@domain/models/training.model';

/** What the transcription step would return for a demo document. */
const MOCK_ROUTINE_MD_ES = `# Rutina demo (3 días)

## Día 1 — Empuje
- Press banca — 4x8-12 — descanso 90s
- Press inclinado con mancuernas — 3x10-12 — descanso 75s
- Press militar — 3x8-10 — descanso 90s
- Flexiones — 3x al fallo — descanso 60s

## Día 2 — Tirón
- Dominadas — 4x6-10 — descanso 120s
- Remo con barra — 4x8-10 — descanso 90s
- Curl de bíceps — 3x10-12 — descanso 60s
- Plancha — 3x45 s — descanso 45s

## Día 3 — Pierna
- Sentadilla con barra — 4x6-8 — descanso 150s
- Peso muerto rumano — 3x8-10 — descanso 120s
- Carrera en cinta — 3000 m`;

const MOCK_ROUTINE_MD_EN = `# Demo routine (3 days)

## Day 1 — Push
- Bench press — 4x8-12 — rest 90s
- Incline dumbbell press — 3x10-12 — rest 75s
- Overhead press — 3x8-10 — rest 90s
- Push-ups — 3x to failure — rest 60s

## Day 2 — Pull
- Pull-ups — 4x6-10 — rest 120s
- Barbell row — 4x8-10 — rest 90s
- Biceps curl — 3x10-12 — rest 60s
- Plank — 3x45 s — rest 45s

## Day 3 — Legs
- Back squat — 4x6-8 — rest 150s
- Romanian deadlift — 3x8-10 — rest 120s
- Treadmill run — 3000 m`;

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
          sugar_g: 9,
          sat_fat_g: 4,
          sodium_mg: 380,
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
          sugar_g: 14,
          sat_fat_g: 7,
          sodium_mg: 620,
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

  async weeklyCoach(ctx: CoachContext): Promise<CoachAdvice> {
    await this.delay(600);
    const es = ctx.lang !== 'en';
    const tips: string[] = [];
    if (ctx.days.length) {
      const avgP = ctx.days.reduce((a, d) => a + d.protein_g, 0) / ctx.days.length;
      const avgC = ctx.days.reduce((a, d) => a + d.calories, 0) / ctx.days.length;
      const max = Math.max(...ctx.days.map((d) => d.calories));
      if (avgP < ctx.targets.protein_g * 0.85) {
        tips.push(
          es
            ? 'Te quedas corto de proteína casi todos los días — añade una fuente (huevos, yogur griego o pollo) al desayuno.'
            : "You're short on protein most days — add a source (eggs, Greek yogurt or chicken) at breakfast.",
        );
      }
      if (max > avgC * 1.4) {
        tips.push(
          es
            ? 'Tienes días sueltos muy por encima de tu media — planea esas comidas con antelación para no dispararte.'
            : 'Some days spike well above your average — plan those meals ahead so you don’t overshoot.',
        );
      }
    }
    if (!tips.length) {
      tips.push(
        es
          ? '¡Buena semana! Mantén la constancia y sigue registrando a diario.'
          : 'Great week! Keep the consistency and keep logging every day.',
      );
    }
    return { tips: tips.slice(0, 2) };
  }

  async verifyKey(_key: string): Promise<boolean> {
    await this.delay(200);
    return true;
  }

  async documentToMarkdown(
    _doc: AiDocument,
    context: RoutineAiContext,
  ): Promise<string> {
    // Long enough that the import modal's step UI is actually visible.
    await this.delay(1200);
    return context.lang === 'en' ? MOCK_ROUTINE_MD_EN : MOCK_ROUTINE_MD_ES;
  }

  async parseRoutine(
    _markdown: string,
    context: RoutineAiContext,
  ): Promise<ParsedRoutine> {
    await this.delay(900);
    const en = context.lang === 'en';
    return {
      name: en ? 'Demo routine (3 days)' : 'Rutina demo (3 días)',
      note: en
        ? 'Found 3 days and 11 exercises (demo mode).'
        : 'He encontrado 3 días y 11 ejercicios (modo demo).',
      days: [
        {
          name: en ? 'Day 1 — Push' : 'Día 1 — Empuje',
          notes: '',
          exercises: [
            this.ex(en ? 'Bench press' : 'Press banca', 'pecho', 'kg', 4, '8-12', 90),
            this.ex(en ? 'Incline dumbbell press' : 'Press inclinado con mancuernas', 'pecho', 'kg', 3, '10-12', 75),
            this.ex(en ? 'Overhead press' : 'Press militar', 'hombro', 'kg', 3, '8-10', 90),
            this.ex(en ? 'Push-ups' : 'Flexiones', 'pecho', 'bw', 3, en ? 'to failure' : 'al fallo', 60),
          ],
        },
        {
          name: en ? 'Day 2 — Pull' : 'Día 2 — Tirón',
          notes: '',
          exercises: [
            this.ex(en ? 'Pull-ups' : 'Dominadas', 'espalda', 'bw', 4, '6-10', 120),
            this.ex(en ? 'Barbell row' : 'Remo con barra', 'espalda', 'kg', 4, '8-10', 90),
            this.ex(en ? 'Biceps curl' : 'Curl de bíceps', 'brazo', 'kg', 3, '10-12', 60),
            { ...this.ex('Plank', 'core', 'time', 3, '45 s', 45), target_seconds: 45 },
          ],
        },
        {
          name: en ? 'Day 3 — Legs' : 'Día 3 — Pierna',
          notes: '',
          exercises: [
            this.ex(en ? 'Back squat' : 'Sentadilla con barra', 'pierna', 'kg', 4, '6-8', 150),
            this.ex(en ? 'Romanian deadlift' : 'Peso muerto rumano', 'pierna', 'kg', 3, '8-10', 120),
            { ...this.ex(en ? 'Treadmill run' : 'Carrera en cinta', 'cardio', 'dist', 1, '', 0), target_distance_m: 3000 },
          ],
        },
      ],
    };
  }

  /** Demo exercise, so the routine above stays readable. */
  private ex(
    name: string,
    muscle: string,
    unit: ExerciseUnit,
    sets: number,
    reps: string,
    rest: number,
  ): ParsedRoutineExercise {
    return {
      name,
      muscle_group: muscle,
      unit,
      target_sets: sets,
      target_reps: reps,
      target_weight_kg: 0,
      target_seconds: 0,
      target_distance_m: 0,
      rest_seconds: rest,
      notes: '',
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
