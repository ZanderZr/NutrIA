import { Injectable, computed, inject, signal } from '@angular/core';
import { ProfileRepository } from '@data/repositories/profile.repository';
import {
  NutritionTargets,
  ProfileInput,
  UserProfile,
} from '@domain/models/user-profile.model';
import { calcTargets } from '@domain/nutrition/nutrition-calculator';

/**
 * Facade for the user profile and derived targets. Exposes read-only signals to
 * the UI and command methods that persist changes via the repository.
 */
@Injectable({ providedIn: 'root' })
export class ProfileFacade {
  private repo = inject(ProfileRepository);

  private readonly _profile = signal<UserProfile | null>(null);
  readonly profile = this._profile.asReadonly();

  readonly hasProfile = computed(() => this._profile() !== null);

  readonly targets = computed<NutritionTargets>(() => {
    const p = this._profile();
    return p
      ? { calories: p.calories, protein_g: p.protein_g, fat_g: p.fat_g, carbs_g: p.carbs_g }
      : { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  });

  async load(): Promise<void> {
    this._profile.set(await this.repo.get());
  }

  /** Compute targets from body data + goal, then persist. Used by onboarding. */
  async createFromInput(input: ProfileInput): Promise<void> {
    const targets = calcTargets(input);
    await this.repo.save({ ...input, ...targets, targets_overridden: false });
    await this.load();
  }

  /**
   * Update body data / goal. Recomputes targets unless the user has manually
   * overridden them (respects custom goals — see plan §5).
   */
  async updateInput(input: ProfileInput): Promise<void> {
    const current = this._profile();
    const overridden = current?.targets_overridden ?? false;
    const targets = overridden
      ? { calories: current!.calories, protein_g: current!.protein_g, fat_g: current!.fat_g, carbs_g: current!.carbs_g }
      : calcTargets(input);
    await this.repo.save({ ...input, ...targets, targets_overridden: overridden });
    await this.load();
  }

  /**
   * Apply data-derived (adaptive) targets while keeping the profile's goal.
   * Leaves the `targets_overridden` flag untouched, so "recalcular objetivos"
   * still works as expected and the estimate can be re-applied with newer data.
   */
  async applyAdaptiveTargets(targets: NutritionTargets): Promise<void> {
    const c = this._profile();
    if (!c) return;
    await this.repo.save({
      sex: c.sex,
      age: c.age,
      weight_kg: c.weight_kg,
      height_cm: c.height_cm,
      daily_activity: c.daily_activity,
      training_days: c.training_days,
      training_minutes: c.training_minutes,
      objective: c.objective,
      pace: c.pace,
      target_weight_kg: c.target_weight_kg,
      ...targets,
      targets_overridden: c.targets_overridden,
    });
    await this.load();
  }

  /** Manually override targets (marks them so they are not auto-recomputed). */
  async setCustomTargets(targets: NutritionTargets): Promise<void> {
    const current = this._profile();
    if (!current) return;
    await this.repo.save({
      sex: current.sex,
      age: current.age,
      weight_kg: current.weight_kg,
      height_cm: current.height_cm,
      daily_activity: current.daily_activity,
      training_days: current.training_days,
      training_minutes: current.training_minutes,
      objective: current.objective,
      pace: current.pace,
      target_weight_kg: current.target_weight_kg,
      ...targets,
      targets_overridden: true,
    });
    await this.load();
  }
}
