import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonSpinner,
  IonNote,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';

import { ChatFacade } from '@core/state/chat.facade';
import {
  BARCODE_FOOD_PORT,
  BarcodeLookupError,
} from '@core/food/barcode-food.port';
import { BarcodeScannerService } from '@core/food/barcode-scanner.service';
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
    IonInput,
    IonSelect,
    IonSelectOption,
    IonIcon,
    IonSpinner,
    IonNote,
  ],
  templateUrl: './add-food-modal.component.html',
  styleUrl: './add-food-modal.component.scss',
})
export class AddFoodModalComponent implements OnInit {
  private chat = inject(ChatFacade);
  private barcodeFood = inject(BARCODE_FOOD_PORT);
  private scanner = inject(BarcodeScannerService);
  private modalCtrl = inject(ModalController);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);

  readonly busy = signal(false);
  readonly scanSupported = signal(false);
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

  async ngOnInit(): Promise<void> {
    const supported = await this.scanner.isSupported();
    this.scanSupported.set(supported);
    // Ask for camera access in context, so the OS prompt shows before the user
    // taps "scan" (instead of failing silently later).
    if (supported) await this.scanner.primePermission();
  }

  /** Open the camera scanner; on success, look up the scanned code. */
  async scanBarcode(): Promise<void> {
    if (this.busy()) return;
    try {
      const code = await this.scanner.scan();
      if (!code) return;
      this.barcode = code;
      await this.lookupBarcode();
    } catch (err) {
      if (err instanceof Error && err.message === 'permission') {
        await this.promptOpenSettings();
      } else {
        await this.notify('No se pudo abrir el escáner.');
      }
    }
  }

  /** Camera denied → offer to open the app's settings to grant it. */
  private async promptOpenSettings(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Sin permiso de cámara',
      message:
        'Para escanear códigos necesitas dar acceso a la cámara. Ábrelo en los ajustes de la app.',
      buttons: [
        { text: 'Ahora no', role: 'cancel' },
        {
          text: 'Abrir ajustes',
          handler: () => void this.scanner.openSettings(),
        },
      ],
    });
    await alert.present();
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
