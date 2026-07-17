import { AfterViewChecked, Component, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonFooter,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { CameraService } from '@core/food/camera.service';
import { ChatFacade, ChatMessage, DayProgress } from '@core/state/chat.facade';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { FavoritesFacade } from '@core/state/favorites.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import { MealItem } from '@domain/models/meal.model';
import { MacroRingComponent } from '@shared/components/macro-ring.component';
import { ApiKeyGuideModalComponent } from '@shared/components/api-key-guide-modal.component';
import { EditMealModalComponent } from '@features/dashboard/edit-meal-modal.component';
import { FavoritesModalComponent } from './favorites-modal.component';
import { AddFoodModalComponent } from './add-food-modal.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonFooter,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
    MacroRingComponent,
    TranslocoModule,
  ],
  templateUrl: './chat.page.html',
  styleUrl: './chat.page.scss',
})
export class ChatPage implements AfterViewChecked {
  chat = inject(ChatFacade);
  dashboard = inject(DashboardFacade);
  favorites = inject(FavoritesFacade);
  config = inject(SecureConfigService);
  private modalCtrl = inject(ModalController);
  private camera = inject(CameraService);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);
  private t = inject(TranslocoService);

  @ViewChild('content') private content?: IonContent;

  draft = '';
  private lastCount = 0;

  async ionViewWillEnter(): Promise<void> {
    await Promise.all([this.favorites.load(), this.chat.loadRecent()]);
  }

  /** Pull-to-refresh: reload today's totals, favorites and recent foods. */
  async refresh(ev: CustomEvent): Promise<void> {
    await Promise.all([
      this.dashboard.refresh(),
      this.favorites.load(),
      this.chat.loadRecent(),
    ]);
    (ev.target as HTMLIonRefresherElement).complete();
  }

  /** The root router outlet, so modals present as native iOS cards. */
  private presentingElement(): HTMLElement | undefined {
    return document.querySelector('ion-router-outlet') as HTMLElement | undefined;
  }

  /** Open the step-by-step guide to get a free Gemini API key. */
  async openGuide(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ApiKeyGuideModalComponent,
      presentingElement: this.presentingElement(),
    });
    await modal.present();
  }

  /** Open the favorites picker modal (choose one to log, or delete). */
  async openFavorites(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: FavoritesModalComponent,
      presentingElement: this.presentingElement(),
    });
    await modal.present();
  }

  /** Open the structured "add food" form (manual entry or AI auto-calc). */
  async openAddFood(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddFoodModalComponent,
      presentingElement: this.presentingElement(),
    });
    await modal.present();
  }

  async send(): Promise<void> {
    const text = this.draft;
    this.draft = '';
    await this.chat.logMeal(text);
  }

  /** Log one of the recommended options straight through the parse pipeline. */
  async pick(suggestion: string): Promise<void> {
    await this.chat.logMeal(suggestion);
  }

  /** Re-log a recent food with one tap. */
  async logRecent(item: MealItem): Promise<void> {
    await this.chat.logRecent(item);
  }

  /** Open the editor to correct a meal's items/macros, then refresh the card. */
  async correctMeal(m: ChatMessage): Promise<void> {
    if (!m.meal) return;
    const modal = await this.modalCtrl.create({
      component: EditMealModalComponent,
      componentProps: { meal: m.meal },
      presentingElement: this.presentingElement(),
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.chat.refreshChatMeal(m.id);
  }

  /** Change a logged meal's total weight (recalculates macros proportionally). */
  async changeWeight(m: ChatMessage): Promise<void> {
    if (!m.meal) return;
    const current = this.chat.mealTotalGrams(m.meal);
    const alert = await this.alerts.create({
      header: this.t.translate('chat.changeWeightTitle'),
      message: this.t.translate('chat.changeWeightMsg'),
      inputs: [
        {
          name: 'grams',
          type: 'number',
          value: current,
          min: 1,
          placeholder: 'Ej: 250',
        },
      ],
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('chat.recalc'),
          handler: (data: { grams: string }) => {
            const g = parseFloat(data.grams);
            if (!g || g <= 0) return false;
            void this.chat.changeMealWeight(m.id, g);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** Delete a logged meal from its chat card (with confirmation). */
  async removeMeal(m: ChatMessage): Promise<void> {
    if (!m.meal) return;
    const alert = await this.alerts.create({
      header: this.t.translate('chat.removeTitle'),
      message: this.t.translate('chat.removeMsg'),
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.delete'),
          role: 'destructive',
          handler: () => void this.chat.deleteMealFromChat(m.id),
        },
      ],
    });
    await alert.present();
  }

  /** Capture a meal photo and let the AI identify it. */
  async onPhoto(): Promise<void> {
    if (this.chat.busy()) return;
    let image;
    try {
      image = await this.camera.pickPhoto();
    } catch {
      await this.notify(this.t.translate('chat.cameraFail'));
      return;
    }
    if (image) await this.chat.logMealPhoto(image);
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 2000, position: 'bottom' });
    await t.present();
  }

  /** Build the "what's left today" table rows. diff > 0 = falta, < 0 = exceso. */
  progressRows(p: DayProgress): {
    label: string;
    unit: string;
    target: number;
    consumed: number;
    diff: number;
    /** True when exceeding the target is a concern (energy macros). */
    overIsBad: boolean;
  }[] {
    const t = p.targets;
    const c = p.consumed;
    const L = (k: string) => this.t.translate(k);
    return [
      { label: L('macros.calories'), unit: '', target: t.calories, consumed: c.calories, diff: t.calories - c.calories, overIsBad: true },
      { label: L('macros.protein'), unit: 'g', target: t.protein_g, consumed: c.protein_g, diff: t.protein_g - c.protein_g, overIsBad: false },
      { label: L('macros.carbs'), unit: 'g', target: t.carbs_g, consumed: c.carbs_g, diff: t.carbs_g - c.carbs_g, overIsBad: true },
      { label: L('macros.fatSingular'), unit: 'g', target: t.fat_g, consumed: c.fat_g, diff: t.fat_g - c.fat_g, overIsBad: true },
      { label: L('macros.fiber'), unit: 'g', target: p.fiber.target, consumed: p.fiber.consumed, diff: p.fiber.target - p.fiber.consumed, overIsBad: false },
    ];
  }

  max0(v: number): number {
    return Math.max(0, v);
  }

  /** Format a macro span as "min–max", collapsing to one number when equal. */
  rangeText(span: { min: number; max: number }): string {
    const lo = Math.round(span.min);
    const hi = Math.round(span.max);
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  }

  ngAfterViewChecked(): void {
    const count = this.chat.messages().length;
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.content?.scrollToBottom(300);
    }
  }
}
