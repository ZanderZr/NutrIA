import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';
import {
  PlannedExercise,
  Routine,
  RoutineDay,
  RoutineHeader,
  RoutineSource,
  normalizeExerciseKey,
} from '@domain/models/training.model';
import {
  RoutineDayRow,
  RoutineExerciseRow,
  RoutineRow,
  rowToPlannedExercise,
  rowToRoutine,
  rowToRoutineDay,
} from '../mappers/training.mapper';

/**
 * Minimal structural view of the connection handed to `db.transaction()`, so
 * this layer does not import the SQLite plugin's types. Every statement inside
 * a transaction must pass `false` as the third argument (it suppresses the
 * plugin's own auto-commit).
 */
type TxRunner = {
  run: (
    statement: string,
    values: unknown[],
    transaction: boolean,
  ) => Promise<{ changes?: { lastId?: number } }>;
};

/**
 * An exercise as callers supply it: identity columns the repository derives
 * itself (`id`, `routine_day_id`, `exercise_key`, `position`) are not required.
 */
export type PlannedExerciseDraft = Omit<
  PlannedExercise,
  'id' | 'routine_day_id' | 'exercise_key' | 'position'
>;

/** Old→new id maps produced by a routine insert, needed to replay backups. */
export interface RoutineIdMap {
  routineId: number;
  dayIds: Map<number, number>;
  exerciseIds: Map<number, number>;
}

/** Persistence for training routines: the plan, not the performed log. */
@Injectable({ providedIn: 'root' })
export class RoutineRepository {
  private db = inject(DatabaseService);

  /** Insert a routine with its days and exercises; returns the new id. */
  async add(routine: Omit<Routine, 'id'>): Promise<number> {
    const { routineId } = await this.addWithIdMap(routine);
    return routineId;
  }

  /**
   * Same as `add()`, but also reports how each incoming day/exercise id maps to
   * the id it was inserted with. Only the backup replay needs the maps: logged
   * sets hold foreign keys to *exercises*, so they must be remapped too.
   */
  async addWithIdMap(routine: Omit<Routine, 'id'>): Promise<RoutineIdMap> {
    const dayIds = new Map<number, number>();
    const exerciseIds = new Map<number, number>();
    let routineId = 0;

    await this.db.transaction(async (db) => {
      const res = await db.run(
        `INSERT INTO routines (name, source, is_active, created_at, updated_at)
         VALUES (?,?,?,?,?);`,
        [
          routine.name,
          routine.source,
          routine.is_active ? 1 : 0,
          routine.created_at,
          routine.updated_at,
        ],
        false,
      );
      routineId = res.changes?.lastId ?? 0;

      for (const [i, day] of routine.days.entries()) {
        const dayRes = await db.run(
          `INSERT INTO routine_days (routine_id, name, notes, position)
           VALUES (?,?,?,?);`,
          [routineId, day.name, day.notes, day.position ?? i],
          false,
        );
        const dayId = dayRes.changes?.lastId ?? 0;
        if (day.id) dayIds.set(day.id, dayId);

        for (const [j, ex] of day.exercises.entries()) {
          const exId = await this.insertExercise(db, dayId, ex, ex.position ?? j);
          if (ex.id) exerciseIds.set(ex.id, exId);
        }
      }
    });

    return { routineId, dayIds, exerciseIds };
  }

  /** Compact rows for lists and pickers, active routine first. */
  async listHeaders(): Promise<RoutineHeader[]> {
    const rows = await this.db.query<{
      id: number;
      name: string;
      source: string;
      is_active: number;
      day_count: number;
      exercise_count: number;
    }>(
      `SELECT r.id, r.name, r.source, r.is_active,
         (SELECT COUNT(*) FROM routine_days d WHERE d.routine_id = r.id) AS day_count,
         (SELECT COUNT(*) FROM routine_exercises e
            JOIN routine_days d2 ON d2.id = e.routine_day_id
           WHERE d2.routine_id = r.id AND e.archived_at IS NULL) AS exercise_count
       FROM routines r
      ORDER BY r.is_active DESC, r.updated_at DESC;`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      source: r.source as RoutineSource,
      is_active: r.is_active === 1,
      day_count: r.day_count,
      exercise_count: r.exercise_count,
    }));
  }

  /** A routine with its days and non-archived exercises, in plan order. */
  async getFull(routineId: number): Promise<Routine | null> {
    const rows = await this.db.query<RoutineRow>(
      'SELECT * FROM routines WHERE id=?;',
      [routineId],
    );
    const row = rows[0];
    if (!row) return null;
    return rowToRoutine(row, await this.loadDays(routineId, false));
  }

  /** The routine the user is currently training, if any. */
  async getActive(): Promise<Routine | null> {
    const rows = await this.db.query<RoutineRow>(
      'SELECT * FROM routines WHERE is_active=1 LIMIT 1;',
    );
    const row = rows[0];
    if (!row) return null;
    return rowToRoutine(row, await this.loadDays(row.id, false));
  }

  /** Every routine including archived exercises (used for full backups). */
  async getAll(): Promise<Routine[]> {
    const rows = await this.db.query<RoutineRow>(
      'SELECT * FROM routines ORDER BY id ASC;',
    );
    const out: Routine[] = [];
    for (const row of rows) {
      out.push(rowToRoutine(row, await this.loadDays(row.id, true)));
    }
    return out;
  }

  async countRoutines(): Promise<number> {
    const rows = await this.db.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM routines;',
    );
    return rows[0]?.c ?? 0;
  }

  /** Make one routine the active one (at most one is active at a time). */
  async setActive(routineId: number): Promise<void> {
    await this.db.transaction(async (db) => {
      await db.run('UPDATE routines SET is_active=0 WHERE is_active=1;', [], false);
      await db.run(
        'UPDATE routines SET is_active=1, updated_at=? WHERE id=?;',
        [new Date().toISOString(), routineId],
        false,
      );
    });
  }

  async rename(routineId: number, name: string): Promise<void> {
    await this.db.run('UPDATE routines SET name=?, updated_at=? WHERE id=?;', [
      name,
      new Date().toISOString(),
      routineId,
    ]);
  }

  /**
   * Delete a routine but keep its history: sessions and sets survive as
   * routine-less rows, readable through their name snapshots. The foreign keys
   * are nulled explicitly rather than relying on ON DELETE SET NULL, since
   * `PRAGMA foreign_keys` may differ between the native plugin and jeep-sqlite.
   */
  async deleteRoutine(routineId: number): Promise<void> {
    await this.db.transaction(async (db) => {
      await db.run(
        `UPDATE workout_sets SET routine_exercise_id=NULL
          WHERE routine_exercise_id IN (
            SELECT e.id FROM routine_exercises e
              JOIN routine_days d ON d.id = e.routine_day_id
             WHERE d.routine_id = ?);`,
        [routineId],
        false,
      );
      await db.run(
        'UPDATE workout_sessions SET routine_id=NULL, routine_day_id=NULL WHERE routine_id=?;',
        [routineId],
        false,
      );
      await db.run('DELETE FROM routines WHERE id=?;', [routineId], false);
    });
    await this.ensureActive();
  }

  /** Append a day to a routine; returns the new day id. */
  async addDay(routineId: number, name: string): Promise<number> {
    const next = await this.nextPosition('routine_days', 'routine_id', routineId);
    const id = await this.db.run(
      `INSERT INTO routine_days (routine_id, name, notes, position) VALUES (?,?,'',?);`,
      [routineId, name, next],
    );
    await this.touchRoutine(routineId);
    return id ?? 0;
  }

  async renameDay(dayId: number, name: string): Promise<void> {
    await this.db.run('UPDATE routine_days SET name=? WHERE id=?;', [name, dayId]);
    await this.touchRoutineByDay(dayId);
  }

  /** Delete a day and its exercises; logged sets keep their snapshots. */
  async deleteDay(dayId: number): Promise<void> {
    const owner = await this.db.query<{ routine_id: number }>(
      'SELECT routine_id FROM routine_days WHERE id=?;',
      [dayId],
    );
    const routineId = owner[0]?.routine_id;
    if (!routineId) return;

    const siblings = await this.db.query<{ id: number }>(
      'SELECT id FROM routine_days WHERE routine_id=? AND id<>? ORDER BY position ASC;',
      [routineId, dayId],
    );

    await this.db.transaction(async (db) => {
      await db.run(
        `UPDATE workout_sets SET routine_exercise_id=NULL
          WHERE routine_exercise_id IN (
            SELECT id FROM routine_exercises WHERE routine_day_id = ?);`,
        [dayId],
        false,
      );
      await db.run(
        'UPDATE workout_sessions SET routine_day_id=NULL WHERE routine_day_id=?;',
        [dayId],
        false,
      );
      await db.run('DELETE FROM routine_days WHERE id=?;', [dayId], false);
      await this.renumber(db, 'routine_days', siblings);
      await db.run(
        'UPDATE routines SET updated_at=? WHERE id=?;',
        [new Date().toISOString(), routineId],
        false,
      );
    });
  }

  /** Append an exercise to a day; returns the new exercise id. */
  async addExercise(dayId: number, ex: PlannedExerciseDraft): Promise<number> {
    const next = await this.nextPosition(
      'routine_exercises',
      'routine_day_id',
      dayId,
    );
    let id = 0;
    await this.db.transaction(async (db) => {
      id = await this.insertExercise(db, dayId, ex, next);
    });
    await this.touchRoutineByDay(dayId);
    return id;
  }

  /**
   * Update a planned exercise. `syncHistoryName` also rewrites the name
   * snapshot on its logged sets — without it a rename splits the exercise's
   * chart series in two, since the series is grouped by `exercise_key`.
   */
  async updateExercise(ex: PlannedExercise, syncHistoryName: boolean): Promise<void> {
    if (!ex.id) return;
    const key = normalizeExerciseKey(ex.name);
    await this.db.transaction(async (db) => {
      await db.run(
        `UPDATE routine_exercises SET
           name=?, exercise_key=?, muscle_group=?, unit=?,
           target_sets=?, target_reps=?, target_weight_kg=?,
           target_seconds=?, target_distance_m=?, rest_seconds=?, notes=?
         WHERE id=?;`,
        [
          ex.name,
          key,
          ex.muscle_group,
          ex.unit,
          ex.target_sets,
          ex.target_reps,
          ex.target_weight_kg,
          ex.target_seconds,
          ex.target_distance_m,
          ex.rest_seconds,
          ex.notes,
          ex.id,
        ],
        false,
      );
      if (syncHistoryName) {
        await db.run(
          `UPDATE workout_sets SET exercise_name=?, exercise_key=?, unit=?
            WHERE routine_exercise_id=?;`,
          [ex.name, key, ex.unit, ex.id],
          false,
        );
      }
    });
    await this.touchRoutineByExercise(ex.id);
  }

  /**
   * Remove an exercise from the plan. If it already has logged sets it is
   * soft-deleted (`archived_at`) so its chart history stays intact; otherwise
   * it is deleted outright and its siblings are renumbered.
   */
  async deleteExercise(exerciseId: number): Promise<void> {
    const logged = await this.countSetsFor(exerciseId);
    if (logged > 0) {
      await this.db.run('UPDATE routine_exercises SET archived_at=? WHERE id=?;', [
        new Date().toISOString(),
        exerciseId,
      ]);
      await this.touchRoutineByExercise(exerciseId);
      return;
    }

    const owner = await this.db.query<{ routine_day_id: number }>(
      'SELECT routine_day_id FROM routine_exercises WHERE id=?;',
      [exerciseId],
    );
    const dayId = owner[0]?.routine_day_id;
    if (!dayId) return;

    const siblings = await this.db.query<{ id: number }>(
      `SELECT id FROM routine_exercises
        WHERE routine_day_id=? AND id<>? AND archived_at IS NULL
        ORDER BY position ASC;`,
      [dayId, exerciseId],
    );

    await this.db.transaction(async (db) => {
      await db.run('DELETE FROM routine_exercises WHERE id=?;', [exerciseId], false);
      await this.renumber(db, 'routine_exercises', siblings);
    });
    await this.touchRoutineByDay(dayId);
  }

  /** How many logged sets reference a planned exercise. */
  async countSetsFor(exerciseId: number): Promise<number> {
    const rows = await this.db.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM workout_sets WHERE routine_exercise_id=?;',
      [exerciseId],
    );
    return rows[0]?.c ?? 0;
  }

  private async loadDays(
    routineId: number,
    includeArchived: boolean,
  ): Promise<RoutineDay[]> {
    const dayRows = await this.db.query<RoutineDayRow>(
      'SELECT * FROM routine_days WHERE routine_id=? ORDER BY position ASC, id ASC;',
      [routineId],
    );
    if (!dayRows.length) return [];

    const ids = dayRows.map((d) => d.id);
    const placeholders = ids.map(() => '?').join(',');
    const exRows = await this.db.query<RoutineExerciseRow>(
      `SELECT * FROM routine_exercises
        WHERE routine_day_id IN (${placeholders})
          ${includeArchived ? '' : 'AND archived_at IS NULL'}
        ORDER BY position ASC, id ASC;`,
      ids,
    );

    const byDay = new Map<number, PlannedExercise[]>();
    for (const r of exRows) {
      const list = byDay.get(r.routine_day_id) ?? [];
      list.push(rowToPlannedExercise(r));
      byDay.set(r.routine_day_id, list);
    }
    return dayRows.map((d) => rowToRoutineDay(d, byDay.get(d.id) ?? []));
  }

  private async insertExercise(
    db: TxRunner,
    dayId: number,
    ex: PlannedExerciseDraft,
    position: number,
  ): Promise<number> {
    const res = await db.run(
      `INSERT INTO routine_exercises
         (routine_day_id, name, exercise_key, muscle_group, unit,
          target_sets, target_reps, target_weight_kg, target_seconds,
          target_distance_m, rest_seconds, notes, position, archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
      [
        dayId,
        ex.name,
        normalizeExerciseKey(ex.name),
        ex.muscle_group,
        ex.unit,
        ex.target_sets,
        ex.target_reps,
        ex.target_weight_kg,
        ex.target_seconds,
        ex.target_distance_m,
        ex.rest_seconds,
        ex.notes,
        position,
        ex.archived_at ?? null,
      ],
      false,
    );
    return res.changes?.lastId ?? 0;
  }

  /** Dense `position` values after a delete, in the order given. */
  private async renumber(
    db: TxRunner,
    table: 'routine_days' | 'routine_exercises',
    rows: { id: number }[],
  ): Promise<void> {
    for (const [i, row] of rows.entries()) {
      await db.run(`UPDATE ${table} SET position=? WHERE id=?;`, [i, row.id], false);
    }
  }

  private async nextPosition(
    table: 'routine_days' | 'routine_exercises',
    parentColumn: 'routine_id' | 'routine_day_id',
    parentId: number,
  ): Promise<number> {
    const rows = await this.db.query<{ p: number | null }>(
      `SELECT MAX(position) AS p FROM ${table} WHERE ${parentColumn}=?;`,
      [parentId],
    );
    return (rows[0]?.p ?? -1) + 1;
  }

  private async touchRoutine(routineId: number): Promise<void> {
    await this.db.run('UPDATE routines SET updated_at=? WHERE id=?;', [
      new Date().toISOString(),
      routineId,
    ]);
  }

  private async touchRoutineByDay(dayId: number): Promise<void> {
    await this.db.run(
      'UPDATE routines SET updated_at=? WHERE id=(SELECT routine_id FROM routine_days WHERE id=?);',
      [new Date().toISOString(), dayId],
    );
  }

  private async touchRoutineByExercise(exerciseId: number): Promise<void> {
    await this.db.run(
      `UPDATE routines SET updated_at=? WHERE id=(
         SELECT d.routine_id FROM routine_days d
           JOIN routine_exercises e ON e.routine_day_id = d.id
          WHERE e.id=?);`,
      [new Date().toISOString(), exerciseId],
    );
  }

  /** After deleting the active routine, promote the most recent one. */
  private async ensureActive(): Promise<void> {
    const active = await this.db.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM routines WHERE is_active=1;',
    );
    if ((active[0]?.c ?? 0) > 0) return;
    await this.db.run(
      'UPDATE routines SET is_active=1 WHERE id=(SELECT MAX(id) FROM routines);',
    );
  }
}
