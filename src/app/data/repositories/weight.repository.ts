import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';
import { WeightEntry } from '@domain/models/weight.model';

/** Persistence for body-weight logs (one row per date, upserted). */
@Injectable({ providedIn: 'root' })
export class WeightRepository {
  private db = inject(DatabaseService);

  /** Insert or replace the weight for a given date. */
  async upsert(date: string, weightKg: number): Promise<void> {
    await this.db.run(
      `INSERT INTO weight_logs (date, weight_kg, created_at)
       VALUES (?,?,?)
       ON CONFLICT(date) DO UPDATE SET weight_kg = excluded.weight_kg;`,
      [date, weightKg, new Date().toISOString()],
    );
  }

  /** Entries in chronological order (oldest first), most recent `limit` kept. */
  async list(limit = 52): Promise<WeightEntry[]> {
    const rows = await this.db.query<WeightEntry>(
      `SELECT id, date, weight_kg FROM weight_logs
       ORDER BY date DESC LIMIT ?;`,
      [limit],
    );
    return rows.reverse();
  }

  async latest(): Promise<WeightEntry | null> {
    const rows = await this.db.query<WeightEntry>(
      'SELECT id, date, weight_kg FROM weight_logs ORDER BY date DESC LIMIT 1;',
    );
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<void> {
    await this.db.run('DELETE FROM weight_logs WHERE id=?;', [id]);
  }
}
