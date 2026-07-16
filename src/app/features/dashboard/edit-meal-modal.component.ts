import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonInput,
  IonIcon,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslocoModule } from '@jsverse/transloco';

import { DashboardFacade } from '@core/state/dashboard.facade';
import { Meal, MealItem } from '@domain/models/meal.model';

/**
 * Edit a logged meal: correct each item's amount and macros, add or remove
 * foods. Persists via DashboardFacade.updateMealItems, which recomputes the
 * meal totals and refreshes the day.
 */
@Component({
  selector: 'app-edit-meal-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonInput,
    IonIcon,
    TranslocoModule,
  ],
  templateUrl: './edit-meal-modal.component.html',
  styleUrl: './edit-meal-modal.component.scss',
})
export class EditMealModalComponent implements OnInit {
  @Input() meal!: Meal;

  private dashboard = inject(DashboardFacade);
  private modalCtrl = inject(ModalController);
  private toast = inject(ToastController);

  /** Working copies so edits are discarded if the user cancels. */
  items: MealItem[] = [];

  ngOnInit(): void {
    this.items = this.meal.items.map((it) => ({ ...it }));
  }

  addItem(): void {
    this.items.push({
      name: '',
      quantity_g: 0,
      calories: 0,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
      fiber_g: 0,
      confidence: 1,
    });
  }

  removeItem(index: number): void {
    this.items.splice(index, 1);
  }

  canSave(): boolean {
    return (
      this.items.length > 0 && this.items.every((it) => it.name.trim().length > 0)
    );
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const clean: MealItem[] = this.items.map((it) => ({
      ...it,
      name: it.name.trim(),
      quantity_g: Number(it.quantity_g) || 0,
      calories: Number(it.calories) || 0,
      protein_g: Number(it.protein_g) || 0,
      fat_g: Number(it.fat_g) || 0,
      carbs_g: Number(it.carbs_g) || 0,
      fiber_g: Number(it.fiber_g) || 0,
    }));
    await this.modalCtrl.dismiss();
    await this.dashboard.updateMealItems(this.meal.id!, clean);
    await this.notify('Comida actualizada.');
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 1600,
      position: 'bottom',
    });
    await t.present();
  }
}
