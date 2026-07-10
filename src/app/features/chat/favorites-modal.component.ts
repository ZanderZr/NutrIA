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
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Favoritos</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Cerrar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="content-wrap">
        @if (!favorites.favorites().length) {
          <div class="empty-state fav-empty">
            <div class="empty-badge"><ion-icon name="star-outline"></ion-icon></div>
            <p>
              Aún no tienes favoritos.<br />
              <span class="text-muted">Guarda una comida desde la pantalla “Hoy” (botón ⋮ → Guardar como favorito).</span>
            </p>
          </div>
        } @else {
          <div class="item-group">
            @for (fav of favorites.favorites(); track fav.id) {
              <ion-item button detail="false" (click)="pick(fav)">
                <ion-icon slot="start" name="star" color="warning"></ion-icon>
                <ion-label>
                  <h2>{{ fav.name }}</h2>
                  <p>{{ fav.total_calories }} kcal · {{ mealLabels[fav.meal_type] }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  (click)="remove($event, fav)"
                  aria-label="Eliminar favorito"
                >
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-button>
              </ion-item>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .fav-empty { margin-top: 14vh; }
      .fav-empty .empty-badge {
        width: 64px;
        height: 64px;
        border-radius: var(--r-lg);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--app-warning-soft);
      }
      .fav-empty .empty-badge ion-icon { font-size: 2rem; color: var(--app-warning); opacity: 1; }
      .fav-empty p { line-height: var(--app-leading-normal); }
    `,
  ],
})
export class FavoritesModalComponent {
  favorites = inject(FavoritesFacade);
  private chat = inject(ChatFacade);
  private modalCtrl = inject(ModalController);
  private alerts = inject(AlertController);

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
      header: 'Eliminar favorito',
      message: `¿Eliminar «${fav.name}»?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
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
