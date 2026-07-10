import { InjectionToken } from '@angular/core';
import { BarcodeFood } from '@domain/models/barcode.model';

/**
 * Port for resolving a barcode into a food with per-100g nutrition.
 * OpenFoodFactsAdapter is the production binding; swap freely (USDA, a mock…).
 */
export interface BarcodeFoodPort {
  /** Returns the product, or null if the barcode is unknown. */
  lookup(barcode: string): Promise<BarcodeFood | null>;
}

export const BARCODE_FOOD_PORT = new InjectionToken<BarcodeFoodPort>(
  'BARCODE_FOOD_PORT',
);

/** Raised when the food database cannot be reached. */
export class BarcodeLookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'unknown',
  ) {
    super(message);
    this.name = 'BarcodeLookupError';
  }
}
