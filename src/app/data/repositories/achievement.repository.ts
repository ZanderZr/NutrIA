import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '@core/database/database.service';

/** Persistence for unlocked achievements (id → ISO unlock timestamp). */
@Injectable({ providedIn: 'root' })
export class AchievementRepository {
  private db = inject(DatabaseService);

  /** All unlocked achievement ids mapped to when they were unlocked. */
  async getUnlocked(): Promise<Map<string, string>> {
    const rows = await this.db.query<{ id: string; unlocked_at: string }>(
      'SELECT id, unlocked_at FROM achievements;',
    );
    return new Map(rows.map((r) => [r.id, r.unlocked_at]));
  }

  /** Record an achievement as unlocked. No-op if it already was. */
  async unlock(id: string, at: string): Promise<void> {
    await this.db.run(
      'INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?);',
      [id, at],
    );
  }
}
