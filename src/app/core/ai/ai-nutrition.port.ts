import { InjectionToken } from '@angular/core';
import {
  AiContext,
  ParsedMeal,
  Recommendation,
} from '@domain/models/ai.model';

/**
 * Port (hexagonal architecture) that the rest of the app depends on instead of
 * a concrete AI provider. GeminiNutritionAdapter is the production binding;
 * MockNutritionAdapter is used in tests and offline development.
 */
/** A base64-encoded image plus its MIME type, for multimodal requests. */
export interface MealImage {
  data: string;
  mimeType: string;
}

export interface AiNutritionPort {
  /** Interpret a natural-language meal description into structured items. */
  parseMeal(text: string, context: AiContext): Promise<ParsedMeal>;

  /** Identify the foods in a meal photo and estimate their macros. */
  parseMealImage(image: MealImage, context: AiContext): Promise<ParsedMeal>;

  /** Suggest the next meal to move the user toward their remaining targets. */
  recommendNextMeal(context: AiContext): Promise<Recommendation>;
}

export const AI_NUTRITION_PORT = new InjectionToken<AiNutritionPort>(
  'AI_NUTRITION_PORT',
);

/** Raised when the AI provider cannot be reached or returns unusable data. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-key' | 'network' | 'invalid-response' | 'auth' | 'unknown',
  ) {
    super(message);
    this.name = 'AiError';
  }
}
