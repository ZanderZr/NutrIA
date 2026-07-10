/** Nutritional values per 100 g, as returned by a barcode food database. */
export interface BarcodePer100g {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
}

/** A product resolved from a barcode. */
export interface BarcodeFood {
  barcode: string;
  name: string;
  brand?: string;
  per100g: BarcodePer100g;
}
