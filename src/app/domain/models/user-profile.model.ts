export type Sex = 'male' | 'female';

/** Legacy single-axis activity — kept only for the old NOT NULL DB column. */
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

/** Axis 1: everyday movement / NEAT, independent of workouts. */
export type DailyActivity = 'desk' | 'light' | 'on_feet' | 'physical';

/** Specific, weight-oriented goals. */
export type Objective = 'lose_fat' | 'gain_muscle' | 'recomp' | 'maintain';

/** How fast to approach the target weight (maps to a %-bodyweight/week rate). */
export type Pace = 'gentle' | 'moderate' | 'aggressive';

/** Legacy 3-value goal — kept only to satisfy the old NOT NULL DB column. */
export type Goal = 'fat_loss' | 'maintenance' | 'muscle_gain';

/** Macro/calorie targets the whole app measures progress against. */
export interface NutritionTargets {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface UserProfile extends NutritionTargets {
  id: number;
  sex: Sex;
  age: number;
  weight_kg: number;
  height_cm: number;
  daily_activity: DailyActivity;
  /** Structured training: sessions per week (0-7) and minutes per session. */
  training_days: number;
  training_minutes: number;
  objective: Objective;
  pace: Pace;
  /** Goal weight for lose_fat / gain_muscle; null for recomp / maintain. */
  target_weight_kg: number | null;
  /** When true, targets were edited manually and must not be auto-recalculated. */
  targets_overridden: boolean;
  updated_at: string;
}

/** Data captured during onboarding, before targets are computed. */
export interface ProfileInput {
  sex: Sex;
  age: number;
  weight_kg: number;
  height_cm: number;
  daily_activity: DailyActivity;
  training_days: number;
  training_minutes: number;
  objective: Objective;
  pace: Pace;
  target_weight_kg: number | null;
}

/** True when the objective is driven by a target weight. */
export function objectiveNeedsTargetWeight(objective: Objective): boolean {
  return objective === 'lose_fat' || objective === 'gain_muscle';
}

/** Map a new objective back to the legacy Goal value (for the old DB column). */
export function legacyGoal(objective: Objective): Goal {
  switch (objective) {
    case 'lose_fat':
      return 'fat_loss';
    case 'gain_muscle':
      return 'muscle_gain';
    default:
      return 'maintenance';
  }
}

/** Base activity factor from everyday movement alone (no structured exercise). */
export const BASE_NEAT: Record<DailyActivity, number> = {
  desk: 1.2,
  light: 1.3,
  on_feet: 1.4,
  physical: 1.55,
};

/**
 * Training increment per weekly minute (≈ exercise kcal as a fraction of BMR).
 * Calibrated so ~4 sessions × 45 min (180 min/week) adds ≈ 0.14 — the old
 * "3-4 days" bucket — but now varies continuously with real volume.
 */
export const EXERCISE_FACTOR_PER_MIN = 0.14 / 180;

export const DAILY_ACTIVITY_LABELS: Record<DailyActivity, string> = {
  desk: 'Sentado casi todo el día',
  light: 'Algo de movimiento',
  on_feet: 'En pie o andando mucho',
  physical: 'Trabajo físico',
};

export const DAILY_ACTIVITY_DESCRIPTIONS: Record<DailyActivity, string> = {
  desk: 'Oficina, conduces… te mueves poco fuera del ejercicio.',
  light: 'De pie o andando a ratos durante el día.',
  on_feet: 'Andas 1 h o más al día, o de pie gran parte de la jornada.',
  physical: 'Obra, reparto, hostelería… esfuerzo físico continuo.',
};

/**
 * Combined activity factor: everyday NEAT base + a training increment computed
 * from real weekly volume (days × minutes). Two independent axes remove the
 * classic ambiguity (trains 4×/week AND walks 1 h/day) without over-estimating.
 * Clamped to a sane range.
 */
export function activityFactor(
  daily: DailyActivity,
  trainingDays: number,
  trainingMinutes: number,
): number {
  const weeklyMinutes =
    Math.max(0, trainingDays || 0) * Math.max(0, trainingMinutes || 0);
  const factor = BASE_NEAT[daily] + weeklyMinutes * EXERCISE_FACTOR_PER_MIN;
  return Math.min(1.95, Math.max(1.2, factor));
}

/** Map the axes back to the nearest legacy ActivityLevel (for the DB column). */
export function legacyActivityLevel(
  daily: DailyActivity,
  trainingDays: number,
  trainingMinutes: number,
): ActivityLevel {
  const f = activityFactor(daily, trainingDays, trainingMinutes);
  if (f < 1.3) return 'sedentary';
  if (f < 1.45) return 'light';
  if (f < 1.65) return 'moderate';
  if (f < 1.8) return 'active';
  return 'very_active';
}

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  lose_fat: 'Perder grasa hasta un peso',
  gain_muscle: 'Ganar músculo hasta un peso',
  recomp: 'Recomposición (mismo peso)',
  maintain: 'Mantenimiento',
};

export const PACE_LABELS: Record<Pace, string> = {
  gentle: 'Suave',
  moderate: 'Moderado',
  aggressive: 'Agresivo',
};

/** Legacy labels — retained for any old references. */
export const GOAL_LABELS: Record<Goal, string> = {
  fat_loss: 'Pérdida de grasa',
  maintenance: 'Mantenimiento',
  muscle_gain: 'Ganancia muscular',
};
