import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';
import {
  ExercisePoint,
  WorkoutSession,
  WorkoutSet,
} from '@domain/models/training.model';
import {
  WorkoutSessionRow,
  WorkoutSetRow,
  rowToWorkoutSession,
  rowToWorkoutSet,
} from '../mappers/training.mapper';

/** See the note in routine.repository.ts: transactions need `false` per run. */
type TxRunner = {
  run: (
    statement: string,
    values: unknown[],
    transaction: boolean,
  ) => Promise<{ changes?: { lastId?: number } }>;
};

/** Persistence and aggregation for performed workouts and their sets. */
@Injectable({ providedIn: 'root' })
export class WorkoutRepository {
  private db = inject(DatabaseService);

  /** Insert a session and its sets atomically; returns the new session id. */
  async startSession(session: Omit<WorkoutSession, 'id'>): Promise<number> {
    let sessionId = 0;
    await this.db.transaction(async (db) => {
      const res = await db.run(
        `INSERT INTO workout_sessions
           (routine_id, routine_day_id, day_name, date, started_at, completed_at, notes)
         VALUES (?,?,?,?,?,?,?);`,
        [
          session.routine_id ?? null,
          session.routine_day_id ?? null,
          session.day_name,
          session.date,
          session.started_at,
          session.completed_at ?? null,
          session.notes,
        ],
        false,
      );
      sessionId = res.changes?.lastId ?? 0;
      await this.insertSets(db, sessionId, session.sets);
    });
    return sessionId;
  }

  /**
   * Replace a session's sets. Delete-then-reinsert (the `updateItems` pattern)
   * keeps `set_index` dense after the user removes a row.
   */
  async saveSets(
    sessionId: number,
    sets: WorkoutSet[],
    notes: string,
    completedAt: string | null,
  ): Promise<void> {
    await this.db.transaction(async (db) => {
      await db.run(
        'DELETE FROM workout_sets WHERE session_id=?;',
        [sessionId],
        false,
      );
      await this.insertSets(db, sessionId, sets);
      await db.run(
        'UPDATE workout_sessions SET notes=?, completed_at=? WHERE id=?;',
        [notes, completedAt, sessionId],
        false,
      );
    });
  }

  async getSession(sessionId: number): Promise<WorkoutSession | null> {
    const rows = await this.db.query<WorkoutSessionRow>(
      'SELECT * FROM workout_sessions WHERE id=?;',
      [sessionId],
    );
    const row = rows[0];
    if (!row) return null;
    const setRows = await this.db.query<WorkoutSetRow>(
      'SELECT * FROM workout_sets WHERE session_id=? ORDER BY id ASC;',
      [sessionId],
    );
    return rowToWorkoutSession(row, setRows.map(rowToWorkoutSet));
  }

  /** Recent sessions, newest first, with their sets loaded. */
  async listSessions(limit = 60): Promise<WorkoutSession[]> {
    const rows = await this.db.query<WorkoutSessionRow>(
      'SELECT * FROM workout_sessions ORDER BY date DESC, id DESC LIMIT ?;',
      [limit],
    );
    return this.withSets(rows);
  }

  async getByDate(date: string): Promise<WorkoutSession[]> {
    const rows = await this.db.query<WorkoutSessionRow>(
      'SELECT * FROM workout_sessions WHERE date=? ORDER BY id DESC;',
      [date],
    );
    return this.withSets(rows);
  }

  /** Every session with its sets, oldest first (used for full backups). */
  async getAll(): Promise<WorkoutSession[]> {
    const rows = await this.db.query<WorkoutSessionRow>(
      'SELECT * FROM workout_sessions ORDER BY date ASC, id ASC;',
    );
    return this.withSets(rows);
  }

  async deleteSession(sessionId: number): Promise<void> {
    // workout_sets rows are removed via ON DELETE CASCADE.
    await this.db.run('DELETE FROM workout_sessions WHERE id=?;', [sessionId]);
  }

  async countSessions(): Promise<number> {
    const rows = await this.db.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM workout_sessions;',
    );
    return rows[0]?.c ?? 0;
  }

  /**
   * The sets of the most recent session that contains this exercise, so the
   * log form can suggest the weight the user actually managed last time.
   */
  async lastPerformance(
    exerciseKey: string,
    excludeSessionId?: number,
  ): Promise<{ date: string; sets: WorkoutSet[] } | null> {
    const rows = await this.db.query<WorkoutSetRow & { date: string }>(
      `SELECT ws.*, s.date AS date
         FROM workout_sets ws
         JOIN workout_sessions s ON s.id = ws.session_id
        WHERE ws.exercise_key = ? AND s.id <> ?
        ORDER BY s.date DESC, s.id DESC, ws.set_index ASC
        LIMIT 60;`,
      [exerciseKey, excludeSessionId ?? 0],
    );
    if (!rows.length) return null;
    // Keep only the first session's rows (filtering in TS rather than writing a
    // correlated subquery, as getRecentItems() does for foods).
    const first = rows[0];
    return {
      date: first.date,
      sets: rows
        .filter((r) => r.session_id === first.session_id)
        .map(rowToWorkoutSet),
    };
  }

  /** One aggregated point per date for a single exercise (chart series). */
  async exerciseHistory(exerciseKey: string): Promise<ExercisePoint[]> {
    return this.db.query<ExercisePoint>(
      `SELECT s.date AS date,
         COALESCE(SUM(ws.reps * ws.weight_kg), 0) AS volume_kg,
         COALESCE(MAX(ws.weight_kg), 0) AS top_weight_kg,
         COALESCE(SUM(ws.reps), 0) AS total_reps,
         COALESCE(MAX(ws.reps), 0) AS top_reps,
         COALESCE(SUM(ws.duration_seconds), 0) AS total_seconds,
         COALESCE(MAX(ws.duration_seconds), 0) AS top_seconds,
         COALESCE(SUM(ws.distance_m), 0) AS total_distance_m,
         COALESCE(MAX(ws.weight_kg * (1 + ws.reps / 30.0)), 0) AS best_one_rm
       FROM workout_sets ws
       JOIN workout_sessions s ON s.id = ws.session_id
      WHERE ws.exercise_key = ?
      GROUP BY s.date
      ORDER BY s.date ASC;`,
      [exerciseKey],
    );
  }

  /** Distinct exercises that have any logged set, most recently used first. */
  async listLoggedExercises(): Promise<{ key: string; name: string; unit: string }[]> {
    return this.db.query<{ key: string; name: string; unit: string }>(
      `SELECT ws.exercise_key AS key,
              ws.exercise_name AS name,
              ws.unit AS unit
         FROM workout_sets ws
         JOIN workout_sessions s ON s.id = ws.session_id
        GROUP BY ws.exercise_key
        ORDER BY MAX(s.date) DESC, ws.exercise_name ASC;`,
    );
  }

  /** Most recent date each routine day was trained, for the day list. */
  async lastDatesByDay(): Promise<Map<number, string>> {
    const rows = await this.db.query<{ routine_day_id: number; date: string }>(
      `SELECT routine_day_id, MAX(date) AS date
         FROM workout_sessions
        WHERE routine_day_id IS NOT NULL
        GROUP BY routine_day_id;`,
    );
    return new Map(rows.map((r) => [r.routine_day_id, r.date]));
  }

  private async withSets(rows: WorkoutSessionRow[]): Promise<WorkoutSession[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const setRows = await this.db.query<WorkoutSetRow>(
      `SELECT * FROM workout_sets WHERE session_id IN (${placeholders}) ORDER BY id ASC;`,
      ids,
    );
    const bySession = new Map<number, WorkoutSet[]>();
    for (const r of setRows) {
      const list = bySession.get(r.session_id) ?? [];
      list.push(rowToWorkoutSet(r));
      bySession.set(r.session_id, list);
    }
    return rows.map((r) => rowToWorkoutSession(r, bySession.get(r.id) ?? []));
  }

  private async insertSets(
    db: TxRunner,
    sessionId: number,
    sets: WorkoutSet[],
  ): Promise<void> {
    for (const [i, s] of sets.entries()) {
      await db.run(
        `INSERT INTO workout_sets
           (session_id, routine_exercise_id, exercise_name, exercise_key, unit,
            set_index, reps, weight_kg, duration_seconds, distance_m)
         VALUES (?,?,?,?,?,?,?,?,?,?);`,
        [
          sessionId,
          s.routine_exercise_id ?? null,
          s.exercise_name,
          s.exercise_key,
          s.unit,
          s.set_index ?? i,
          s.reps,
          s.weight_kg,
          s.duration_seconds,
          s.distance_m,
        ],
        false,
      );
    }
  }
}
