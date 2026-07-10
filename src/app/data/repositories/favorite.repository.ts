import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';
import { Favorite } from '@domain/models/favorite.model';
import { MealItem, MealType, computeMealTotals } from '@domain/models/meal.model';

interface FavoriteRow {
  id: number;
  name: string;
  meal_type: string;
  total_calories: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carbs_g: number;
  total_fiber_g: number;
}

interface FavoriteItemRow {
  favorite_id: number;
  name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  confidence: number;
}

/** Persistence for saved meals (favorites), mirroring the meals schema. */
@Injectable({ providedIn: 'root' })
export class FavoriteRepository {
  private db = inject(DatabaseService);

  async add(
    name: string,
    mealType: MealType,
    items: MealItem[],
  ): Promise<number> {
    const totals = computeMealTotals(items);
    let favId = 0;

    await this.db.transaction(async (db) => {
      const res = await db.run(
        `INSERT INTO favorites
           (name, meal_type, created_at,
            total_calories, total_protein_g, total_fat_g, total_carbs_g, total_fiber_g)
         VALUES (?,?,?,?,?,?,?,?);`,
        [
          name,
          mealType,
          new Date().toISOString(),
          totals.total_calories,
          totals.total_protein_g,
          totals.total_fat_g,
          totals.total_carbs_g,
          totals.total_fiber_g,
        ],
        false,
      );
      favId = res.changes?.lastId ?? 0;
      for (const it of items) {
        await db.run(
          `INSERT INTO favorite_items
             (favorite_id, name, quantity_g, calories, protein_g, fat_g, carbs_g, fiber_g, confidence)
           VALUES (?,?,?,?,?,?,?,?,?);`,
          [
            favId,
            it.name,
            it.quantity_g,
            it.calories,
            it.protein_g,
            it.fat_g,
            it.carbs_g,
            it.fiber_g,
            it.confidence,
          ],
          false,
        );
      }
    });

    return favId;
  }

  async list(): Promise<Favorite[]> {
    const favRows = await this.db.query<FavoriteRow>(
      'SELECT * FROM favorites ORDER BY name COLLATE NOCASE ASC;',
    );
    if (!favRows.length) return [];

    const ids = favRows.map((f) => f.id);
    const placeholders = ids.map(() => '?').join(',');
    const itemRows = await this.db.query<FavoriteItemRow>(
      `SELECT * FROM favorite_items WHERE favorite_id IN (${placeholders});`,
      ids,
    );

    const byFav = new Map<number, MealItem[]>();
    for (const r of itemRows) {
      const list = byFav.get(r.favorite_id) ?? [];
      list.push({
        name: r.name,
        quantity_g: r.quantity_g,
        calories: r.calories,
        protein_g: r.protein_g,
        fat_g: r.fat_g,
        carbs_g: r.carbs_g,
        fiber_g: r.fiber_g,
        confidence: r.confidence,
      });
      byFav.set(r.favorite_id, list);
    }

    return favRows.map((f) => ({
      id: f.id,
      name: f.name,
      meal_type: f.meal_type as MealType,
      total_calories: f.total_calories,
      total_protein_g: f.total_protein_g,
      total_fat_g: f.total_fat_g,
      total_carbs_g: f.total_carbs_g,
      total_fiber_g: f.total_fiber_g,
      items: byFav.get(f.id) ?? [],
    }));
  }

  async delete(id: number): Promise<void> {
    await this.db.run('DELETE FROM favorites WHERE id=?;', [id]);
  }
}
