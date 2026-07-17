import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';

import { MealRepository } from '@data/repositories/meal.repository';
import { AchievementRepository } from '@data/repositories/achievement.repository';
import { HapticsService } from '@core/haptics/haptics.service';
import { computeStreak } from '@domain/insights/streak';
import {
  ACHIEVEMENTS,
  AchievementStats,
  evaluateUnlocked,
  isGoalReached,
} from '@domain/gamification/achievements';
import { ProfileFacade } from './profile.facade';
import { WeightFacade } from './weight.facade';

/**
 * Owns achievement state: loads what's unlocked, re-evaluates on demand, and
 * persists + celebrates anything newly earned. Achievements are derived from the
 * user's real data, so they self-heal after a restore (just call check()).
 */
@Injectable({ providedIn: 'root' })
export class AchievementsFacade {
  private meals = inject(MealRepository);
  private repo = inject(AchievementRepository);
  private profile = inject(ProfileFacade);
  private weight = inject(WeightFacade);
  private toast = inject(ToastController);
  private tr = inject(TranslocoService);
  private haptics = inject(HapticsService);

  private readonly _unlocked = signal<Map<string, string>>(new Map());
  /** Map of unlocked id → ISO unlock timestamp. */
  readonly unlocked = this._unlocked.asReadonly();
  readonly unlockedCount = computed(() => this._unlocked().size);
  readonly total = ACHIEVEMENTS.length;

  /** Load persisted unlock state (no evaluation). */
  async load(): Promise<void> {
    this._unlocked.set(await this.repo.getUnlocked());
  }

  /**
   * Re-evaluate against current data, persist any newly-earned achievements and
   * celebrate them. Safe to call often (after logging a meal, a weight, etc.).
   */
  async check(): Promise<void> {
    const stats = await this.gatherStats();
    const earned = evaluateUnlocked(stats);
    const current = await this.repo.getUnlocked();
    const newIds = earned.filter((id) => !current.has(id));

    if (!newIds.length) {
      this._unlocked.set(current);
      return;
    }
    const now = new Date().toISOString();
    for (const id of newIds) await this.repo.unlock(id, now);
    await this.load();
    await this.celebrate(newIds);
  }

  private async gatherStats(): Promise<AchievementStats> {
    await this.weight.load();
    const [loggedDays, totalMeals, dates] = await Promise.all([
      this.meals.countLoggedDays(),
      this.meals.countMeals(),
      this.meals.getLoggedDates(),
    ]);
    const p = this.profile.profile();
    const latest = this.weight.latest()?.weight_kg ?? p?.weight_kg ?? 0;
    return {
      loggedDays,
      totalMeals,
      currentStreak: computeStreak(dates),
      goalReached: p
        ? isGoalReached(p.objective, p.target_weight_kg, latest)
        : false,
    };
  }

  private async celebrate(newIds: string[]): Promise<void> {
    void this.haptics.success();
    const title = this.tr.translate(`ach.${newIds[0]}.title`);
    const message =
      newIds.length > 1
        ? this.tr.translate('ach.unlockedMulti', {
            title,
            count: newIds.length - 1,
          })
        : this.tr.translate('ach.unlockedOne', { title });
    const t = await this.toast.create({
      message: `🏆 ${message}`,
      duration: 2800,
      position: 'top',
    });
    await t.present();
  }
}
