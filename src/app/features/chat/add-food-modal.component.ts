import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonSpinner,
  IonNote,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';

import { ChatFacade } from '@core/state/chat.facade';
import {
  BARCODE_FOOD_PORT,
  BarcodeLookupError,
} from '@core/food/barcode-food.port';
import { BarcodePer100g } from '@domain/models/barcode.model';
import {
  MealType,
  MEAL_TYPE_LABELS,
  inferMealType,
} from '@domain/models/meal.model';

/**
 * Structured "add food" form. Fill macros by hand, or type name + weight and
 * tap "Autocalcular" to have the AI estimate them (reusing the chat pipeline).
 */
@Component({
  selector: 'app-add-food-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonIcon,
    IonSpinner,
    IonNote,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Añadir alimento</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Cerrar</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="content-wrap">
        <div class="barcode-row">
          <ion-input
            class="barcode-input"
            label="Código de barras"
            labelPlacement="stacked"
            inputmode="numeric"
            [(ngModel)]="barcode"
            placeholder="Escanea o escribe el código"
          ></ion-input>
          <ion-button
            class="barcode-btn"
            [disabled]="!barcode.trim() || busy()"
            (click)="lookupBarcode()"
          >
            @if (busy()) {
              <ion-spinner name="dots"></ion-spinner>
            } @else {
              <ion-icon slot="icon-only" name="barcode-outline"></ion-icon>
            }
          </ion-button>
        </div>
        @if (foundNote) {
          <ion-note class="hint found">{{ foundNote }}</ion-note>
        }

        <div class="item-group">
          <ion-item>
            <ion-input
              label="Alimento o plato"
              labelPlacement="stacked"
              [(ngModel)]="name"
              placeholder="Ej: Pechuga de pollo a la plancha"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Cantidad (g)"
              labelPlacement="stacked"
              type="number"
              inputmode="decimal"
              [(ngModel)]="quantity"
              (ngModelChange)="onQuantityChange()"
              placeholder="Ej: 150"
            ></ion-input>
          </ion-item>
        </div>

        <ion-button
          expand="block"
          fill="outline"
          class="autocalc"
          [disabled]="!canAutoCalc() || busy()"
          (click)="autoCalc()"
        >
          @if (busy()) {
            <ion-spinner name="dots"></ion-spinner>
          } @else {
            <ion-icon slot="start" name="sparkles-outline"></ion-icon>
            Autocalcular con IA
          }
        </ion-button>
        <ion-note class="hint">
          Rellena las kcal y macros a mano, o pon el alimento y la cantidad y
          pulsa “Autocalcular” para que la IA los estime.
        </ion-note>

        <h2 class="section-title">Valores nutricionales</h2>
        <div class="macros-grid">
          <div class="item-group">
            <ion-item>
              <ion-input label="Kcal" labelPlacement="stacked" type="number" [(ngModel)]="calories"></ion-input>
            </ion-item>
          </div>
          <div class="item-group">
            <ion-item>
              <ion-input label="Proteína (g)" labelPlacement="stacked" type="number" [(ngModel)]="protein"></ion-input>
            </ion-item>
          </div>
          <div class="item-group">
            <ion-item>
              <ion-input label="Hidratos (g)" labelPlacement="stacked" type="number" [(ngModel)]="carbs"></ion-input>
            </ion-item>
          </div>
          <div class="item-group">
            <ion-item>
              <ion-input label="Grasa (g)" labelPlacement="stacked" type="number" [(ngModel)]="fat"></ion-input>
            </ion-item>
          </div>
          <div class="item-group">
            <ion-item>
              <ion-input label="Fibra (g)" labelPlacement="stacked" type="number" [(ngModel)]="fiber"></ion-input>
            </ion-item>
          </div>
          <div class="item-group">
            <ion-item>
              <ion-select label="Comida" labelPlacement="stacked" [(ngModel)]="mealType" interface="popover">
                @for (t of mealKeys; track t) {
                  <ion-select-option [value]="t">{{ mealLabels[t] }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </div>
        </div>

        <ion-button
          expand="block"
          class="save-btn"
          [disabled]="!canSave() || busy()"
          (click)="save()"
        >
          Añadir al día
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .barcode-row {
        display: flex;
        align-items: flex-end;
        gap: var(--sp-2);
        margin-bottom: var(--sp-2);
      }
      .barcode-input {
        flex: 1;
        --background: var(--app-surface-2);
        --padding-start: var(--sp-3);
        --padding-end: var(--sp-3);
        border-radius: var(--r-sm);
      }
      .barcode-btn { flex: 0 0 auto; margin: 0; height: 48px; }
      .found { color: var(--app-primary) !important; }
      .autocalc { margin: var(--sp-4) 0 var(--sp-2); }
      .hint { display: block; margin-bottom: var(--sp-2); font-size: var(--app-text-sm); line-height: var(--app-leading-snug); }
      .macros-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--sp-3);
      }
      .save-btn { margin-top: var(--sp-5); }
    `,
  ],
})
export class AddFoodModalComponent {
  private chat = inject(ChatFacade);
  private barcodeFood = inject(BARCODE_FOOD_PORT);
  private modalCtrl = inject(ModalController);
  private toast = inject(ToastController);

  readonly busy = signal(false);
  readonly mealKeys = Object.keys(MEAL_TYPE_LABELS) as MealType[];
  readonly mealLabels = MEAL_TYPE_LABELS;

  barcode = '';
  foundNote = '';
  /** Set after a barcode lookup so macros re-scale when the quantity changes. */
  private per100g?: BarcodePer100g;

  name = '';
  quantity?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  mealType: MealType = inferMealType(new Date().getHours());

  canAutoCalc(): boolean {
    return this.name.trim().length > 0 && !!this.quantity && this.quantity > 0;
  }

  canSave(): boolean {
    return this.name.trim().length > 0 && this.calories != null && this.calories >= 0;
  }

  /** Look up the barcode and fill the form from the product (macros per 100 g). */
  async lookupBarcode(): Promise<void> {
    if (!this.barcode.trim() || this.busy()) return;
    this.busy.set(true);
    this.foundNote = '';
    try {
      const food = await this.barcodeFood.lookup(this.barcode);
      if (!food) {
        await this.notify('Producto no encontrado. Puedes rellenarlo a mano.');
        return;
      }
      this.name = food.brand ? `${food.name} (${food.brand})` : food.name;
      this.per100g = food.per100g;
      if (!this.quantity || this.quantity <= 0) this.quantity = 100;
      this.applyPer100g();
      this.foundNote = `Encontrado: ${food.per100g.calories} kcal /100 g. Ajusta la cantidad.`;
    } catch (err) {
      const msg =
        err instanceof BarcodeLookupError
          ? err.message
          : 'No se pudo buscar el producto.';
      await this.notify(msg);
    } finally {
      this.busy.set(false);
    }
  }

  /** Re-scale macros from the stored per-100g values whenever the quantity changes. */
  onQuantityChange(): void {
    if (this.per100g) this.applyPer100g();
  }

  private applyPer100g(): void {
    if (!this.per100g || !this.quantity) return;
    const f = Number(this.quantity) / 100;
    this.calories = Math.round(this.per100g.calories * f);
    this.protein = Math.round(this.per100g.protein_g * f);
    this.carbs = Math.round(this.per100g.carbs_g * f);
    this.fat = Math.round(this.per100g.fat_g * f);
    this.fiber = Math.round(this.per100g.fiber_g * f);
  }

  async autoCalc(): Promise<void> {
    if (!this.canAutoCalc()) return;
    // AI estimate replaces any barcode-scaled values.
    this.per100g = undefined;
    this.foundNote = '';
    this.busy.set(true);
    try {
      const item = await this.chat.estimateMacros(
        this.name.trim(),
        Number(this.quantity),
      );
      if (!item) {
        await this.notify('No he podido identificar ese alimento.');
        return;
      }
      this.calories = Math.round(item.calories);
      this.protein = Math.round(item.protein_g);
      this.carbs = Math.round(item.carbs_g);
      this.fat = Math.round(item.fat_g);
      this.fiber = Math.round(item.fiber_g);
    } catch (err) {
      await this.notify(this.chat.describeError(err));
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    await this.modalCtrl.dismiss();
    await this.chat.logManualMeal(
      {
        name: this.name.trim(),
        quantity_g: Number(this.quantity) || 0,
        calories: Number(this.calories) || 0,
        protein_g: Number(this.protein) || 0,
        fat_g: Number(this.fat) || 0,
        carbs_g: Number(this.carbs) || 0,
        fiber_g: Number(this.fiber) || 0,
        confidence: 1,
      },
      this.mealType,
    );
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 2200, position: 'bottom' });
    await t.present();
  }
}
