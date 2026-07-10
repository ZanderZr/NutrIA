import { Injectable, computed, inject, signal } from '@angular/core';
import { WeightRepository } from '@data/repositories/weight.repository';
import { WeightEntry } from '@domain/models/weight.model';
import { toLocalDateKey } from '@shared/utils/date.util';
import { ProfileFacade } from './profile.facade';

/**
 * Facade for body-weight tracking. Logging a weight also updates the profile's
 * current weight, which recalculates calorie/macro targets (unless the user has
 * manually overridden them) so goals adapt to progress.
 */
@Injectable({ providedIn: 'root' })
export class WeightFacade {
  private repo = inject(WeightRepository);
  private profile = inject(ProfileFacade);

  private readonly _entries = signal<WeightEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  readonly latest = computed(() => {
    const list = this._entries();
    return list.length ? list[list.length - 1] : null;
  });

  /** First recorded weight — the baseline for goal-progress calculations. */
  readonly startWeight = computed(() => {
    const list = this._entries();
    return list.length ? list[0].weight_kg : null;
  });

  /** Net change between the first and last recorded weight (kg). */
  readonly change = computed(() => {
    const list = this._entries();
    if (list.length < 2) return 0;
    return list[list.length - 1].weight_kg - list[0].weight_kg;
  });

  async load(): Promise<void> {
    this._entries.set(await this.repo.list());
  }

  /** Record a weight (default today) and sync it into the profile. */
  async logWeight(weightKg: number, date = toLocalDateKey()): Promise<void> {
    await this.repo.upsert(date, weightKg);

    const p = this.profile.profile();
    if (p) {
      await this.profile.updateInput({
        sex: p.sex,
        age: p.age,
        weight_kg: weightKg,
        height_cm: p.height_cm,
        daily_activity: p.daily_activity,
        training_days: p.training_days,
        training_minutes: p.training_minutes,
        objective: p.objective,
        pace: p.pace,
        target_weight_kg: p.target_weight_kg,
      });
    }

    await this.load();
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
    await this.load();
  }
}
