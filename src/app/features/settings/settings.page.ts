import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonRadio,
  IonRadioGroup,
  IonToggle,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';

import { ProfileFacade } from '@core/state/profile.facade';
import { FavoritesFacade } from '@core/state/favorites.facade';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import { ThemeService, ThemeMode } from '@core/theme/theme.service';
import { BackupService } from '@core/backup/backup.service';
import { ReminderSettingsService } from '@core/notifications/reminder-settings.service';
import { MealTimes } from '@core/notifications/meal-reminder.service';
import {
  DAILY_ACTIVITY_LABELS,
  DAILY_ACTIVITY_DESCRIPTIONS,
  DailyActivity,
  Objective,
  OBJECTIVE_LABELS,
  Pace,
  PACE_LABELS,
  Sex,
  objectiveNeedsTargetWeight,
} from '@domain/models/user-profile.model';
import { MEAL_TYPE_LABELS } from '@domain/models/meal.model';
import { ApiKeyGuideModalComponent } from '@shared/components/api-key-guide-modal.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    FormsModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonNote,
    IonSegment,
    IonSegmentButton,
    IonRadio,
    IonRadioGroup,
    IonToggle,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  profile = inject(ProfileFacade);
  config = inject(SecureConfigService);
  favorites = inject(FavoritesFacade);
  theme = inject(ThemeService);
  reminders = inject(ReminderSettingsService);
  private dashboard = inject(DashboardFacade);
  private backup = inject(BackupService);
  private alerts = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private toast = inject(ToastController);

  readonly mealLabels = MEAL_TYPE_LABELS;
  readonly busy = signal(false);
  readonly mealKeys: (keyof MealTimes)[] = ['breakfast', 'lunch', 'dinner'];
  readonly mealTimeLabels: Record<keyof MealTimes, string> = {
    breakfast: 'Desayuno',
    lunch: 'Comida',
    dinner: 'Cena',
  };

  onMealsToggle(ev: CustomEvent): void {
    void this.reminders.setMealsEnabled(!!ev.detail.checked);
  }

  onWeighInToggle(ev: CustomEvent): void {
    void this.reminders.setWeighInEnabled(!!ev.detail.checked);
  }

  /** ion-datetime value (ISO) for a meal's stored 'HH:MM'. */
  mealIso(meal: keyof MealTimes): string {
    return `2001-01-01T${this.reminders.mealTimes()[meal]}:00`;
  }

  onMealTime(meal: keyof MealTimes, ev: CustomEvent): void {
    const value = ev.detail.value as string | undefined;
    const hhmm = value ? value.slice(11, 16) : '';
    if (hhmm) void this.reminders.setMealTime(meal, hhmm);
  }
  private readonly importInput =
    viewChild<ElementRef<HTMLInputElement>>('importInput');

  /** Persist the chosen appearance (system / light / dark). */
  setTheme(ev: CustomEvent): void {
    void this.theme.set(ev.detail.value as ThemeMode);
  }

  /** Export a full backup (share sheet on device, download on web). */
  async exportData(): Promise<void> {
    this.busy.set(true);
    try {
      await this.backup.exportData();
    } catch {
      await this.notify('No se pudo exportar la copia.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Open the file picker for restoring a backup. */
  pickImportFile(): void {
    this.importInput()?.nativeElement.click();
  }

  /** Read the chosen file, confirm, then replace all data with its contents. */
  async onImportFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file later
    if (!file) return;

    try {
      const data = this.backup.parse(await file.text());
      const alert = await this.alerts.create({
        header: 'Restaurar copia',
        message:
          `Esto reemplazará todos tus datos actuales por los de la copia ` +
          `(${data.meals.length} comidas, ${data.weights.length} pesos). ` +
          `¿Continuar?`,
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Restaurar',
            role: 'destructive',
            handler: () => void this.doRestore(data),
          },
        ],
      });
      await alert.present();
    } catch (err) {
      await this.notify(
        err instanceof Error ? err.message : 'Archivo no válido.',
      );
    }
  }

  private async doRestore(data: Parameters<BackupService['restore']>[0]): Promise<void> {
    this.busy.set(true);
    try {
      const res = await this.backup.restore(data);
      // Reload everything the UI reads from the DB.
      await Promise.all([
        this.profile.load(),
        this.favorites.load(),
        this.dashboard.refresh(),
      ]);
      await this.ionViewWillEnter();
      await this.notify(
        `Restaurado: ${res.meals} comidas, ${res.weights} pesos, ${res.favorites} favoritos.`,
      );
    } catch {
      await this.notify('No se pudo restaurar la copia.');
    } finally {
      this.busy.set(false);
    }
  }

  sex: Sex = 'male';
  age?: number;
  weight?: number;
  height?: number;
  dailyActivity: DailyActivity = 'light';
  trainingDays = 3;
  trainingMinutes = 45;
  objective: Objective = 'lose_fat';
  pace: Pace = 'moderate';
  targetWeight?: number;
  apiKey = '';

  readonly dailyKeys = Object.keys(DAILY_ACTIVITY_LABELS) as DailyActivity[];
  readonly objectiveKeys = Object.keys(OBJECTIVE_LABELS) as Objective[];
  readonly paceKeys = Object.keys(PACE_LABELS) as Pace[];
  readonly dailyLabels = DAILY_ACTIVITY_LABELS;
  readonly dailyDescriptions = DAILY_ACTIVITY_DESCRIPTIONS;
  readonly objectiveLabels = OBJECTIVE_LABELS;
  readonly paceLabels = PACE_LABELS;

  needsTarget(): boolean {
    return objectiveNeedsTargetWeight(this.objective);
  }

  async ionViewWillEnter(): Promise<void> {
    const p = this.profile.profile();
    if (p) {
      this.sex = p.sex;
      this.age = p.age;
      this.weight = p.weight_kg;
      this.height = p.height_cm;
      this.dailyActivity = p.daily_activity;
      this.trainingDays = p.training_days;
      this.trainingMinutes = p.training_minutes;
      this.objective = p.objective;
      this.pace = p.pace;
      this.targetWeight = p.target_weight_kg ?? undefined;
    }
    await this.favorites.load();
  }

  async removeFavorite(id: number): Promise<void> {
    await this.favorites.remove(id);
    await this.notify('Favorito eliminado.');
  }

  async saveProfile(): Promise<void> {
    if (!this.age || !this.weight || !this.height) {
      await this.notify('Completa edad, peso y altura.');
      return;
    }
    if (this.needsTarget() && (!this.targetWeight || this.targetWeight <= 0)) {
      await this.notify('Indica tu peso objetivo.');
      return;
    }
    await this.profile.updateInput({
      sex: this.sex,
      age: Number(this.age),
      weight_kg: Number(this.weight),
      height_cm: Number(this.height),
      daily_activity: this.dailyActivity,
      training_days: Number(this.trainingDays) || 0,
      training_minutes: Number(this.trainingMinutes) || 0,
      objective: this.objective,
      pace: this.pace,
      target_weight_kg: this.needsTarget() ? Number(this.targetWeight) : null,
    });
    await this.notify('Perfil actualizado.');
  }

  /** Open the step-by-step guide to get a free Gemini API key. */
  async getApiKey(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ApiKeyGuideModalComponent,
      presentingElement:
        (document.querySelector('ion-router-outlet') as HTMLElement) ?? undefined,
    });
    await modal.present();
  }

  async saveKey(): Promise<void> {
    await this.config.setApiKey(this.apiKey);
    this.apiKey = '';
    await this.notify('Clave guardada.');
  }

  async clearKey(): Promise<void> {
    await this.config.clear();
    await this.notify('Clave eliminada.');
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 1800, position: 'bottom' });
    await t.present();
  }
}
