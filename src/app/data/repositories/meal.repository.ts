import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';
import {
  DailySummary,
  Meal,
  MealItem,
  computeMealTotals,
  emptySummary,
} from '@domain/models/meal.model';
import {
  MealItemRow,
  MealRow,
  rowToMeal,
  rowToMealItem,
} from '../mappers/meal.mapper';

/** Persistence and aggregation for meals and their items. */
@Injectable({ providedIn: 'root' })
export class MealRepository {
  private db = inject(DatabaseService);

  /** Insert a meal and its items atomically; returns the new meal id. */
  async add(meal: Omit<Meal, 'id'>): Promise<number> {
    const totals = computeMealTotals(meal.items);
    let mealId = 0;

    await this.db.transaction(async (db) => {
      const res = await db.run(
        `INSERT INTO meals
           (date, logged_at, meal_type, raw_text,
            total_calories, total_protein_g, total_fat_g, total_carbs_g, total_fiber_g,
            total_sugar_g, total_sat_fat_g, total_sodium_mg)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?);`,
        [
          meal.date,
          meal.logged_at,
          meal.meal_type,
          meal.raw_text,
          totals.total_calories,
          totals.total_protein_g,
          totals.total_fat_g,
          totals.total_carbs_g,
          totals.total_fiber_g,
          totals.total_sugar_g,
          totals.total_sat_fat_g,
          totals.total_sodium_mg,
        ],
        false,
      );
      mealId = res.changes?.lastId ?? 0;
      await this.insertItems(db, mealId, meal.items);
    });

    return mealId;
  }

  /** Replace a meal's items and recompute totals (used by inline edits). */
  async updateItems(mealId: number, items: MealItem[]): Promise<void> {
    const totals = computeMealTotals(items);
    await this.db.transaction(async (db) => {
      await db.run('DELETE FROM meal_items WHERE meal_id=?;', [mealId], false);
      await this.insertItems(db, mealId, items);
      await db.run(
        `UPDATE meals SET total_calories=?, total_protein_g=?,
           total_fat_g=?, total_carbs_g=?, total_fiber_g=?,
           total_sugar_g=?, total_sat_fat_g=?, total_sodium_mg=? WHERE id=?;`,
        [
          totals.total_calories,
          totals.total_protein_g,
          totals.total_fat_g,
          totals.total_carbs_g,
          totals.total_fiber_g,
          totals.total_sugar_g,
          totals.total_sat_fat_g,
          totals.total_sodium_mg,
          mealId,
        ],
        false,
      );
    });
  }

  async delete(mealId: number): Promise<void> {
    // meal_items rows are removed via ON DELETE CASCADE.
    await this.db.run('DELETE FROM meals WHERE id=?;', [mealId]);
  }

  /** All meals for a day, most recent first, with their items loaded. */
  async getByDate(date: string): Promise<Meal[]> {
    const mealRows = await this.db.query<MealRow>(
      'SELECT * FROM meals WHERE date=? ORDER BY logged_at DESC;',
      [date],
    );
    if (!mealRows.length) return [];

    const ids = mealRows.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const itemRows = await this.db.query<MealItemRow>(
      `SELECT * FROM meal_items WHERE meal_id IN (${placeholders});`,
      ids,
    );

    const byMeal = new Map<number, MealItem[]>();
    for (const r of itemRows) {
      const list = byMeal.get(r.meal_id) ?? [];
      list.push(rowToMealItem(r));
      byMeal.set(r.meal_id, list);
    }

    return mealRows.map((m) => rowToMeal(m, byMeal.get(m.id) ?? []));
  }

  /** Every meal with its items, oldest first (used for full backups). */
  async getAll(): Promise<Meal[]> {
    const mealRows = await this.db.query<MealRow>(
      'SELECT * FROM meals ORDER BY date ASC, logged_at ASC;',
    );
    if (!mealRows.length) return [];

    const itemRows = await this.db.query<MealItemRow>(
      'SELECT * FROM meal_items;',
    );
    const byMeal = new Map<number, MealItem[]>();
    for (const r of itemRows) {
      const list = byMeal.get(r.meal_id) ?? [];
      list.push(rowToMealItem(r));
      byMeal.set(r.meal_id, list);
    }
    return mealRows.map((m) => rowToMeal(m, byMeal.get(m.id) ?? []));
  }

  /**
   * Most recently logged distinct foods (by name), newest first, for quick
   * re-logging. Dedupes keeping the latest version of each item.
   */
  async getRecentItems(limit = 8): Promise<MealItem[]> {
    const rows = await this.db.query<MealItemRow & { logged_at: string }>(
      `SELECT mi.*, m.logged_at AS logged_at
         FROM meal_items mi
         JOIN meals m ON m.id = mi.meal_id
        ORDER BY m.logged_at DESC, mi.id DESC
        LIMIT 200;`,
    );
    const seen = new Set<string>();
    const out: MealItem[] = [];
    for (const r of rows) {
      const key = r.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rowToMealItem(r));
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Aggregated totals for a single day (computed via SQL). */
  async getDailySummary(date: string): Promise<DailySummary> {
    const rows = await this.db.query<{
      calories: number;
      protein_g: number;
      fat_g: number;
      carbs_g: number;
      fiber_g: number;
      sugar_g: number;
      sat_fat_g: number;
      sodium_mg: number;
      meal_count: number;
    }>(
      `SELECT
         COALESCE(SUM(total_calories),0) AS calories,
         COALESCE(SUM(total_protein_g),0) AS protein_g,
         COALESCE(SUM(total_fat_g),0) AS fat_g,
         COALESCE(SUM(total_carbs_g),0) AS carbs_g,
         COALESCE(SUM(total_fiber_g),0) AS fiber_g,
         COALESCE(SUM(total_sugar_g),0) AS sugar_g,
         COALESCE(SUM(total_sat_fat_g),0) AS sat_fat_g,
         COALESCE(SUM(total_sodium_mg),0) AS sodium_mg,
         COUNT(*) AS meal_count
       FROM meals WHERE date=?;`,
      [date],
    );
    const r = rows[0];
    return r ? { date, ...r } : emptySummary(date);
  }

  /** Per-day summaries within an inclusive date range (for stats/history). */
  async getRangeSummaries(from: string, to: string): Promise<DailySummary[]> {
    return this.db.query<DailySummary>(
      `SELECT date,
         SUM(total_calories) AS calories,
         SUM(total_protein_g) AS protein_g,
         SUM(total_fat_g) AS fat_g,
         SUM(total_carbs_g) AS carbs_g,
         SUM(total_fiber_g) AS fiber_g,
         SUM(total_sugar_g) AS sugar_g,
         SUM(total_sat_fat_g) AS sat_fat_g,
         SUM(total_sodium_mg) AS sodium_mg,
         COUNT(*) AS meal_count
       FROM meals WHERE date BETWEEN ? AND ?
       GROUP BY date ORDER BY date ASC;`,
      [from, to],
    );
  }

  /** Total number of distinct days with at least one meal. */
  async countLoggedDays(): Promise<number> {
    const rows = await this.db.query<{ c: number }>(
      'SELECT COUNT(DISTINCT date) AS c FROM meals;',
    );
    return rows[0]?.c ?? 0;
  }

  /** Total number of meals ever logged. */
  async countMeals(): Promise<number> {
    const rows = await this.db.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM meals;',
    );
    return rows[0]?.c ?? 0;
  }

  /** Distinct dates that have a food whose name matches the search term. */
  async searchLoggedDates(term: string): Promise<string[]> {
    const rows = await this.db.query<{ date: string }>(
      `SELECT DISTINCT m.date
         FROM meals m JOIN meal_items mi ON mi.meal_id = m.id
        WHERE LOWER(mi.name) LIKE ?
        ORDER BY m.date DESC;`,
      [`%${term.toLowerCase()}%`],
    );
    return rows.map((r) => r.date);
  }

  /** Distinct dates that have at least one meal (for the history list). */
  async getLoggedDates(limit = 60): Promise<string[]> {
    const rows = await this.db.query<{ date: string }>(
      'SELECT DISTINCT date FROM meals ORDER BY date DESC LIMIT ?;',
      [limit],
    );
    return rows.map((r) => r.date);
  }

  private async insertItems(
    db: {
      run: (s: string, v: unknown[], t: boolean) => Promise<unknown>;
    },
    mealId: number,
    items: MealItem[],
  ): Promise<void> {
    for (const it of items) {
      await db.run(
        `INSERT INTO meal_items
           (meal_id, name, quantity_g, calories, protein_g, fat_g, carbs_g, fiber_g,
            sugar_g, sat_fat_g, sodium_mg, confidence)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?);`,
        [
          mealId,
          it.name,
          it.quantity_g,
          it.calories,
          it.protein_g,
          it.fat_g,
          it.carbs_g,
          it.fiber_g,
          it.sugar_g ?? 0,
          it.sat_fat_g ?? 0,
          it.sodium_mg ?? 0,
          it.confidence,
        ],
        false,
      );
    }
  }
}
