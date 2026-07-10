import { MealItem, MealType } from './meal.model';
import { NutritionTargets } from './user-profile.model';

/** Structured result of interpreting a natural-language meal description. */
export interface ParsedMeal {
  items: MealItem[];
  meal_type: MealType;
  /** Short, friendly note the assistant shows back to the user. */
  note: string;
}

/** Context passed to the AI to keep answers relevant and personalised. */
export interface AiContext {
  targets: NutritionTargets;
  /** Already consumed today, so the AI can reason about what's remaining. */
  consumedToday: NutritionTargets;
  /** Local time-of-day hint (e.g. "08:15") to infer meal type. */
  localTime: string;
}

/** A single next-meal option. */
export interface RecommendationOption {
  suggestion: string;
  /** Approximate macros the suggestion targets. */
  approx: NutritionTargets;
  rationale: string;
}

/** A next-meal recommendation: several valid alternatives to choose from. */
export interface Recommendation {
  options: RecommendationOption[];
}
