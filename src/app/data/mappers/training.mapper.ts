import {
  ExerciseUnit,
  PlannedExercise,
  Routine,
  RoutineDay,
  RoutineSource,
  WorkoutSession,
  WorkoutSet,
} from '@domain/models/training.model';

export interface RoutineRow {
  id: number;
  name: string;
  source: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface RoutineDayRow {
  id: number;
  routine_id: number;
  name: string;
  notes: string;
  position: number;
}

export interface RoutineExerciseRow {
  id: number;
  routine_day_id: number;
  name: string;
  exercise_key: string;
  muscle_group: string;
  unit: string;
  target_sets: number;
  target_reps: string;
  target_weight_kg: number;
  target_seconds: number;
  target_distance_m: number;
  rest_seconds: number;
  notes: string;
  position: number;
  archived_at: string | null;
}

export interface WorkoutSessionRow {
  id: number;
  routine_id: number | null;
  routine_day_id: number | null;
  day_name: string;
  date: string;
  started_at: string;
  completed_at: string | null;
  notes: string;
}

export interface WorkoutSetRow {
  id: number;
  session_id: number;
  routine_exercise_id: number | null;
  exercise_name: string;
  exercise_key: string;
  unit: string;
  set_index: number;
  reps: number;
  weight_kg: number;
  duration_seconds: number;
  distance_m: number;
}

export function rowToPlannedExercise(row: RoutineExerciseRow): PlannedExercise {
  return {
    id: row.id,
    routine_day_id: row.routine_day_id,
    name: row.name,
    exercise_key: row.exercise_key,
    muscle_group: row.muscle_group,
    unit: row.unit as ExerciseUnit,
    target_sets: row.target_sets,
    target_reps: row.target_reps,
    target_weight_kg: row.target_weight_kg,
    target_seconds: row.target_seconds,
    target_distance_m: row.target_distance_m,
    rest_seconds: row.rest_seconds,
    notes: row.notes,
    position: row.position,
    archived_at: row.archived_at,
  };
}

export function rowToRoutineDay(
  row: RoutineDayRow,
  exercises: PlannedExercise[],
): RoutineDay {
  return {
    id: row.id,
    routine_id: row.routine_id,
    name: row.name,
    notes: row.notes,
    position: row.position,
    exercises,
  };
}

export function rowToRoutine(row: RoutineRow, days: RoutineDay[]): Routine {
  return {
    id: row.id,
    name: row.name,
    source: row.source as RoutineSource,
    // SQLite has no boolean: the flag is stored as 0/1.
    is_active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    days,
  };
}

export function rowToWorkoutSet(row: WorkoutSetRow): WorkoutSet {
  return {
    id: row.id,
    session_id: row.session_id,
    routine_exercise_id: row.routine_exercise_id,
    exercise_name: row.exercise_name,
    exercise_key: row.exercise_key,
    unit: row.unit as ExerciseUnit,
    set_index: row.set_index,
    reps: row.reps,
    weight_kg: row.weight_kg,
    duration_seconds: row.duration_seconds,
    distance_m: row.distance_m,
  };
}

export function rowToWorkoutSession(
  row: WorkoutSessionRow,
  sets: WorkoutSet[],
): WorkoutSession {
  return {
    id: row.id,
    routine_id: row.routine_id,
    routine_day_id: row.routine_day_id,
    day_name: row.day_name,
    date: row.date,
    started_at: row.started_at,
    completed_at: row.completed_at,
    notes: row.notes,
    sets,
  };
}
