import { MealItem, MealType } from './meal.model';
import { NutritionTargets } from './user-profile.model';

/** A plausible min/max span for an estimated value (uncertainty shown in the UI). */
export interface Span {
  min: number;
  max: number;
}

/** Plausible ranges for the macros we surface to the user. */
export interface MacroRange {
  calories: Span;
  protein_g: Span;
  carbs_g: Span;
  fat_g: Span;
}

/**
 * A parsed food item: the representative (central) MealItem the app stores and
 * sums, plus an optional plausible range shown for transparency. The range is
 * display-only — daily totals always use the central values.
 */
export interface ParsedItem extends MealItem {
  range?: MacroRange;
}

/** Structured result of interpreting a natural-language meal description. */
export interface ParsedMeal {
  items: ParsedItem[];
  meal_type: MealType;
  /** Short, friendly note the assistant shows back to the user. */
  note: string;
  /**
   * True when a lone basic ingredient was given without an amount (e.g. "arroz")
   * so we must ask for grams instead of guessing. Composite dishes and countable
   * units ("un plato de cocido", "una manzana") are estimated, not flagged.
   */
  needs_quantity?: boolean;
  /** The basic food awaiting a quantity, remembered for the follow-up reply. */
  pending_food?: string;
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
