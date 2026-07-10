import { Injectable, inject, signal } from '@angular/core';
import { FavoriteRepository } from '@data/repositories/favorite.repository';
import { Favorite } from '@domain/models/favorite.model';
import { Meal } from '@domain/models/meal.model';

/** Facade for saved meals (favorites). Exposes a read-only list signal. */
@Injectable({ providedIn: 'root' })
export class FavoritesFacade {
  private repo = inject(FavoriteRepository);

  private readonly _favorites = signal<Favorite[]>([]);
  readonly favorites = this._favorites.asReadonly();

  async load(): Promise<void> {
    this._favorites.set(await this.repo.list());
  }

  /** Save an existing meal as a reusable favorite. */
  async saveFromMeal(name: string, meal: Meal): Promise<void> {
    await this.repo.add(name, meal.meal_type, meal.items);
    await this.load();
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
    await this.load();
  }
}
