import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';

/** Persistence for daily water intake (one upserted row per date, in ml). */
@Injectable({ providedIn: 'root' })
export class WaterRepository {
  private db = inject(DatabaseService);

  /** Total millilitres logged for a date (0 if none). */
  async getForDate(date: string): Promise<number> {
    const rows = await this.db.query<{ ml: number }>(
      'SELECT ml FROM water_logs WHERE date=?;',
      [date],
    );
    return rows[0]?.ml ?? 0;
  }

  /** Add (or subtract) millilitres for a date; never drops below zero. */
  async add(date: string, deltaMl: number): Promise<number> {
    const current = await this.getForDate(date);
    const next = Math.max(0, current + deltaMl);
    await this.setForDate(date, next);
    return next;
  }

  /** Set the exact total for a date. */
  async setForDate(date: string, ml: number): Promise<void> {
    await this.db.run(
      `INSERT INTO water_logs (date, ml, updated_at)
       VALUES (?,?,?)
       ON CONFLICT(date) DO UPDATE SET ml = excluded.ml, updated_at = excluded.updated_at;`,
      [date, Math.max(0, Math.round(ml)), new Date().toISOString()],
    );
  }

  /** All rows (for backups). */
  async list(): Promise<{ date: string; ml: number }[]> {
    return this.db.query<{ date: string; ml: number }>(
      'SELECT date, ml FROM water_logs ORDER BY date ASC;',
    );
  }
}
