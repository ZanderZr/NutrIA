/** A single body-weight measurement (one per calendar day). */
export interface WeightEntry {
  id?: number;
  /** 'YYYY-MM-DD' local date. */
  date: string;
  weight_kg: number;
}
