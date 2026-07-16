import { Component, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonIcon,
  ModalController,
  AlertController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { FavoritesFacade } from '@core/state/favorites.facade';
import { ChatFacade } from '@core/state/chat.facade';
import { Favorite } from '@domain/models/favorite.model';
import { MEAL_TYPE_LABELS } from '@domain/models/meal.model';

/**
 * Modal that lists saved favorites. Tap a row to log it (and close); use the
 * trash button to delete. Replaces the always-visible chips with an on-demand
 * picker, keeping the chat screen clean.
 */
@Component({
  selector: 'app-favorites-modal',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonItem,
    IonLabel,
    IonIcon,
    TranslocoModule,
  ],
  templateUrl: './favorites-modal.component.html',
  styleUrl: './favorites-modal.component.scss',
})
export class FavoritesModalComponent {
  favorites = inject(FavoritesFacade);
  private chat = inject(ChatFacade);
  private modalCtrl = inject(ModalController);
  private alerts = inject(AlertController);
  private t = inject(TranslocoService);

  readonly mealLabels = MEAL_TYPE_LABELS;

  /** Log the favorite and close the modal. */
  async pick(fav: Favorite): Promise<void> {
    await this.modalCtrl.dismiss();
    await this.chat.logFavorite(fav);
  }

  /** Delete a favorite (with confirmation); stopPropagation so the row isn't logged. */
  async remove(ev: Event, fav: Favorite): Promise<void> {
    ev.stopPropagation();
    const alert = await this.alerts.create({
      header: this.t.translate('favorites.removeTitle'),
      message: this.t.translate('favorites.removeMsg', { name: fav.name }),
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.delete'),
          role: 'destructive',
          handler: () => void this.favorites.remove(fav.id!),
        },
      ],
    });
    await alert.present();
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }
}
