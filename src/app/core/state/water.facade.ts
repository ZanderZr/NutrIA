import { Injectable, computed, inject, signal } from '@angular/core';
import { WaterRepository } from '@data/repositories/water.repository';
import { ProfileFacade } from './profile.facade';
import { toLocalDateKey } from '@shared/utils/date.util';

/** Common quick-add sizes (ml). */
export const WATER_GLASS_ML = 250;
export const WATER_BOTTLE_ML = 500;

/**
 * Owns the water intake for a given day. The dashboard drives which date is
 * active; quick-add buttons add a glass/bottle and the goal is derived from
 * body weight (~35 ml/kg, sensible fallback otherwise).
 */
@Injectable({ providedIn: 'root' })
export class WaterFacade {
  private repo = inject(WaterRepository);
  private profile = inject(ProfileFacade);

  private readonly _date = signal(toLocalDateKey());
  private readonly _ml = signal(0);

  readonly ml = this._ml.asReadonly();

  /** Daily goal in ml, from body weight (~35 ml/kg), rounded to 100, min 1500. */
  readonly goalMl = computed(() => {
    const kg = this.profile.profile()?.weight_kg ?? 0;
    const derived = Math.round((kg * 35) / 100) * 100;
    return Math.max(1500, derived || 2000);
  });

  readonly progress = computed(() => {
    const goal = this.goalMl();
    return goal > 0 ? Math.min(1, this._ml() / goal) : 0;
  });

  /** Load the total for a date (defaults to today). */
  async load(date = toLocalDateKey()): Promise<void> {
    this._date.set(date);
    this._ml.set(await this.repo.getForDate(date));
  }

  async add(deltaMl: number): Promise<void> {
    this._ml.set(await this.repo.add(this._date(), deltaMl));
  }
}
