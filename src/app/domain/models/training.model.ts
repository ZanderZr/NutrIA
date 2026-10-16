/**
 * Training domain: the *plan* (routine → days → exercises) and the *log*
 * (sessions → sets). The two are deliberately separate — editing a routine must
 * never rewrite what the user already performed, so every logged row carries a
 * snapshot of the exercise name/unit it was performed as.
 */

/** How an exercise is measured, which decides the inputs and the chart metric. */
export type ExerciseUnit = 'kg' | 'bw' | 'time' | 'dist';

export const EXERCISE_UNITS: ExerciseUnit[] = ['kg', 'bw', 'time', 'dist'];

/** Where a routine came from (UI copy only). */
export type RoutineSource = 'ai' | 'manual';

/** One planned exercise inside a routine day. */
export interface PlannedExercise {
  id?: number;
  routine_day_id?: number;
  name: string;
  /** Normalised name, used to group performed sets across renames. */
  exercise_key: string;
  muscle_group: string;
  unit: ExerciseUnit;
  target_sets: number;
  /** Free text on purpose: "8-12", "AMRAP", "al fallo". */
  target_reps: string;
  target_weight_kg: number;
  target_seconds: number;
  target_distance_m: number;
  rest_seconds: number;
  notes: string;
  position: number;
  /** Set when soft-deleted: hidden from the plan, kept for chart history. */
  archived_at?: string | null;
}

/** One day of a routine: the unit the user taps to train. */
export interface RoutineDay {
  id?: number;
  routine_id?: number;
  name: string;
  notes: string;
  position: number;
  exercises: PlannedExercise[];
}

/** A whole training program. */
export interface Routine {
  id?: number;
  name: string;
  source: RoutineSource;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  days: RoutineDay[];
}

/** Compact routine row for lists and pickers (no days loaded). */
export interface RoutineHeader {
  id: number;
  name: string;
  source: RoutineSource;
  is_active: boolean;
  day_count: number;
  exercise_count: number;
}

/** One performed set. Only the fields matching its `unit` are meaningful. */
export interface WorkoutSet {
  id?: number;
  session_id?: number;
  routine_exercise_id?: number | null;
  /** Snapshots: survive the plan row being renamed or deleted. */
  exercise_name: string;
  exercise_key: string;
  unit: ExerciseUnit;
  set_index: number;
  reps: number;
  weight_kg: number;
  duration_seconds: number;
  distance_m: number;
}

/** One performed training = one routine day done on one date. */
export interface WorkoutSession {
  id?: number;
  routine_id?: number | null;
  routine_day_id?: number | null;
  /** Snapshot of the day name as it was when performed. */
  day_name: string;
  /** 'YYYY-MM-DD' local date. */
  date: string;
  started_at: string;
  completed_at?: string | null;
  notes: string;
  sets: WorkoutSet[];
}

/**
 * Aggregated totals for one session. Derived, never stored: unlike meals, the
 * app never aggregates every session by date, so persisted totals would only
 * add a drift surface.
 */
export interface SessionTotals {
  total_sets: number;
  total_reps: number;
  total_volume_kg: number;
  total_seconds: number;
  total_distance_m: number;
}

/** One chart point: a date with that day's aggregates for a single exercise. */
export interface ExercisePoint {
  date: string;
  volume_kg: number;
  top_weight_kg: number;
  total_reps: number;
  top_reps: number;
  total_seconds: number;
  top_seconds: number;
  total_distance_m: number;
  best_one_rm: number;
}

/** Selectable chart series. Which ones apply depends on the exercise unit. */
export type ExerciseMetric =
  | 'volume'
  | 'top_weight'
  | 'one_rm'
  | 'reps'
  | 'top_reps'
  | 'seconds'
  | 'top_seconds'
  | 'distance';

/**
 * Normalised grouping key for an exercise name: trimmed, lowercased, accents
 * stripped, whitespace collapsed. Stored as a column because SQLite's LOWER()
 * is ASCII-only (it would not fold "Dominadas"/"dominádas") and an expression
 * cannot use an index.
 */
export function normalizeExerciseKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Mechanical work of one set, in kg·reps. */
export function setVolume(s: WorkoutSet): number {
  return s.reps * s.weight_kg;
}

export function emptySessionTotals(): SessionTotals {
  return {
    total_sets: 0,
    total_reps: 0,
    total_volume_kg: 0,
    total_seconds: 0,
    total_distance_m: 0,
  };
}

/** Sum a session's sets. Single source of truth for session aggregation. */
export function computeSessionTotals(sets: WorkoutSet[]): SessionTotals {
  const totals = sets.reduce(
    (acc, s) => ({
      total_sets: acc.total_sets + 1,
      total_reps: acc.total_reps + s.reps,
      total_volume_kg: acc.total_volume_kg + setVolume(s),
      total_seconds: acc.total_seconds + s.duration_seconds,
      total_distance_m: acc.total_distance_m + s.distance_m,
    }),
    emptySessionTotals(),
  );
  return { ...totals, total_volume_kg: Math.round(totals.total_volume_kg * 10) / 10 };
}

/**
 * Whether a set carries real data for its unit. Prefilled draft rows the user
 * never touched fail this and are dropped on save.
 */
export function isMeaningfulSet(s: WorkoutSet): boolean {
  switch (s.unit) {
    case 'bw':
      return s.reps > 0;
    case 'time':
      return s.duration_seconds > 0;
    case 'dist':
      return s.distance_m > 0 || s.duration_seconds > 0;
    default:
      return s.reps > 0 || s.weight_kg > 0;
  }
}

/** The hardest set of a group, compared by whatever its unit measures. */
export function bestSet(sets: WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null;
  for (const s of sets) {
    if (!best || beats(s, best)) best = s;
  }
  return best;
}

function beats(a: WorkoutSet, b: WorkoutSet): boolean {
  switch (a.unit) {
    case 'bw':
      return a.reps !== b.reps ? a.reps > b.reps : a.weight_kg > b.weight_kg;
    case 'time':
      return a.duration_seconds > b.duration_seconds;
    case 'dist':
      return a.distance_m !== b.distance_m
        ? a.distance_m > b.distance_m
        : a.duration_seconds > b.duration_seconds;
    default:
      return a.weight_kg !== b.weight_kg ? a.weight_kg > b.weight_kg : a.reps > b.reps;
  }
}

/** Epley one-rep-max estimate, in kg. Returns 0 when it cannot be estimated. */
export function estimateOneRm(reps: number, weightKg: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** Best estimated 1RM across a group of sets. */
export function bestEstimatedOneRm(sets: WorkoutSet[]): number {
  return sets.reduce((max, s) => Math.max(max, estimateOneRm(s.reps, s.weight_kg)), 0);
}

/** The measures to prefill from a previous performance (its hardest set). */
export function suggestedFrom(previous: WorkoutSet[]): {
  reps: number;
  weight_kg: number;
  duration_seconds: number;
  distance_m: number;
} {
  const best = bestSet(previous);
  return {
    reps: best?.reps ?? 0,
    weight_kg: best?.weight_kg ?? 0,
    duration_seconds: best?.duration_seconds ?? 0,
    distance_m: best?.distance_m ?? 0,
  };
}

/**
 * Draft rows for logging one exercise, prefilled with the previous
 * performance. Capped at 12 rows so a nonsense `target_sets` cannot flood
 * the form; at least 1 row always appears.
 */
export function prefillSets(
  ex: PlannedExercise,
  suggested: ReturnType<typeof suggestedFrom>,
): WorkoutSet[] {
  const count = Math.max(1, Math.min(Math.round(ex.target_sets) || 1, 12));
  return Array.from({ length: count }, (_unused, i) => ({
    routine_exercise_id: ex.id ?? null,
    exercise_name: ex.name,
    exercise_key: ex.exercise_key,
    unit: ex.unit,
    set_index: i,
    reps: 0,
    weight_kg: suggested.weight_kg || ex.target_weight_kg,
    duration_seconds: 0,
    distance_m: 0,
  }));
}

/** Chart series that make sense for a unit, best first. */
export function metricsFor(unit: ExerciseUnit): ExerciseMetric[] {
  switch (unit) {
    case 'bw':
      return ['reps', 'top_reps'];
    case 'time':
      return ['seconds', 'top_seconds'];
    case 'dist':
      return ['distance', 'seconds'];
    default:
      return ['volume', 'top_weight', 'one_rm'];
  }
}

/** Read one metric off a chart point. */
export function metricValue(p: ExercisePoint, metric: ExerciseMetric): number {
  switch (metric) {
    case 'top_weight':
      return p.top_weight_kg;
    case 'one_rm':
      return p.best_one_rm;
    case 'reps':
      return p.total_reps;
    case 'top_reps':
      return p.top_reps;
    case 'seconds':
      return p.total_seconds;
    case 'top_seconds':
      return p.top_seconds;
    case 'distance':
      return p.total_distance_m;
    default:
      return p.volume_kg;
  }
}

/** Renumber `position` to match array order, after an add, delete or move. */
export function reindexPositions<T extends { position: number }>(items: T[]): T[] {
  return items.map((it, i) => ({ ...it, position: i }));
}

/** Total non-archived exercises across a routine's days. */
export function countExercises(routine: Routine): number {
  return routine.days.reduce((n, d) => n + d.exercises.length, 0);
}
