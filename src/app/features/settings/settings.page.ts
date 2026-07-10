import { Component, inject, signal } from '@angular/core';
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
  ToastController,
} from '@ionic/angular/standalone';

import { ProfileFacade } from '@core/state/profile.facade';
import { FavoritesFacade } from '@core/state/favorites.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import { ThemeService, ThemeMode } from '@core/theme/theme.service';
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
import {
  GEMINI_API_KEY_URL,
  openExternal,
} from '@shared/utils/external-link.util';

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
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Ajustes</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="content-wrap">
        <!-- Appearance -->
        <h2 class="section-title"><ion-icon name="contrast-outline"></ion-icon> Apariencia</h2>
        <div class="app-card theme-card">
          <ion-segment [value]="theme.mode()" (ionChange)="setTheme($event)">
            <ion-segment-button value="system">
              <ion-icon name="phone-portrait-outline"></ion-icon>
              <ion-label>Sistema</ion-label>
            </ion-segment-button>
            <ion-segment-button value="light">
              <ion-icon name="sunny-outline"></ion-icon>
              <ion-label>Claro</ion-label>
            </ion-segment-button>
            <ion-segment-button value="dark">
              <ion-icon name="moon-outline"></ion-icon>
              <ion-label>Oscuro</ion-label>
            </ion-segment-button>
          </ion-segment>
        </div>

        <!-- Profile -->
        <h2 class="section-title"><ion-icon name="person-outline"></ion-icon> Perfil</h2>
        <div class="item-group">
          <ion-item>
            <ion-select label="Sexo" [(ngModel)]="sex" interface="popover">
              <ion-select-option value="male">Hombre</ion-select-option>
              <ion-select-option value="female">Mujer</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input label="Edad" type="number" [(ngModel)]="age"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input label="Peso (kg)" type="number" [(ngModel)]="weight"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input label="Altura (cm)" type="number" [(ngModel)]="height"></ion-input>
          </ion-item>
        </div>

        <h2 class="section-title"><ion-icon name="walk-outline"></ion-icon> Tu día a día</h2>
        <ion-radio-group [(ngModel)]="dailyActivity">
          <div class="item-group">
            @for (d of dailyKeys; track d) {
              <ion-item>
                <ion-radio
                  [value]="d"
                  justify="space-between"
                  labelPlacement="start"
                  class="act-radio"
                >
                  <div class="act-title">{{ dailyLabels[d] }}</div>
                  <div class="act-desc">{{ dailyDescriptions[d] }}</div>
                </ion-radio>
              </ion-item>
            }
          </div>
        </ion-radio-group>

        <h2 class="section-title"><ion-icon name="barbell-outline"></ion-icon> Entrenamiento</h2>
        <div class="item-group">
          <ion-item>
            <ion-input label="Días por semana" type="number" inputmode="numeric" min="0" max="7" [(ngModel)]="trainingDays"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input label="Minutos por sesión" type="number" inputmode="numeric" min="0" [(ngModel)]="trainingMinutes"></ion-input>
          </ion-item>
        </div>

        <h2 class="section-title"><ion-icon name="flag-outline"></ion-icon> Objetivo</h2>
        <div class="item-group">
          <ion-item>
            <ion-select label="Objetivo" [(ngModel)]="objective" interface="action-sheet">
              @for (o of objectiveKeys; track o) {
                <ion-select-option [value]="o">{{ objectiveLabels[o] }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          @if (needsTarget()) {
            <ion-item>
              <ion-input label="Peso objetivo (kg)" type="number" [(ngModel)]="targetWeight"></ion-input>
            </ion-item>
            <ion-item>
              <ion-select label="Ritmo" [(ngModel)]="pace" interface="popover">
                @for (p of paceKeys; track p) {
                  <ion-select-option [value]="p">{{ paceLabels[p] }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          }
        </div>
        <ion-button expand="block" class="section-action" (click)="saveProfile()">
          Guardar y recalcular objetivos
        </ion-button>

        <!-- AI -->
        <h2 class="section-title"><ion-icon name="key-outline"></ion-icon> IA (Gemini)</h2>
        <div class="item-group">
          <ion-item>
            <ion-input
              label="Clave de API"
              type="password"
              [(ngModel)]="apiKey"
              placeholder="{{ config.hasKey() ? '•••••• (guardada)' : 'AIza...' }}"
            ></ion-input>
          </ion-item>
        </div>
        <ion-note class="section-note">
          @if (config.usingEmbedded()) {
            Usando la clave integrada de la app. Puedes introducir tu propia
            clave abajo para sustituirla.
          } @else {
            Se guarda cifrada solo en este dispositivo.
          }
        </ion-note>
        <div class="stack-sm section-action">
          <ion-button expand="block" fill="outline" (click)="getApiKey()">
            <ion-icon slot="start" name="open-outline"></ion-icon>
            Conseguir mi clave gratis
          </ion-button>
          <ion-button expand="block" (click)="saveKey()" [disabled]="!apiKey.trim()">
            Guardar clave
          </ion-button>
          @if (config.hasKey()) {
            <ion-button expand="block" fill="clear" color="danger" (click)="clearKey()">
              Eliminar clave
            </ion-button>
          }
        </div>

        <!-- Favorites -->
        <h2 class="section-title"><ion-icon name="star-outline"></ion-icon> Favoritos</h2>
        @if (!favorites.favorites().length) {
          <ion-note class="section-note">
            Guarda una comida como favorita desde la pantalla “Hoy” (botón ⋮ →
            Guardar como favorito) para reutilizarla con un toque.
          </ion-note>
        } @else {
          <div class="item-group">
            @for (fav of favorites.favorites(); track fav.id) {
              <ion-item>
                <ion-icon slot="start" name="star" color="warning"></ion-icon>
                <ion-label>
                  <h2>{{ fav.name }}</h2>
                  <p>{{ fav.total_calories }} kcal · {{ mealLabels[fav.meal_type] }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  (click)="removeFavorite(fav.id!)"
                >
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-button>
              </ion-item>
            }
          </div>
        }

        <p class="app-signature text-muted">NutriControl · Diseñado para tu día a día</p>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .theme-card { padding: var(--sp-2); }
      .theme-card ion-segment-button { flex-direction: column; gap: 2px; --padding-top: 6px; --padding-bottom: 6px; min-height: 52px; }
      .theme-card ion-segment-button ion-icon { font-size: 1.2rem; }
      .theme-card ion-segment-button ion-label { font-size: var(--app-text-2xs); margin: 0; }
      .section-action { margin-top: var(--sp-4); }
      .act-radio { width: 100%; }
      .act-radio::part(label) { margin-inline-end: var(--sp-3); }
      .act-title { font-size: var(--app-text-md); font-weight: var(--app-weight-semibold); color: var(--app-text); }
      .act-desc { font-size: var(--app-text-sm); color: var(--app-text-3); white-space: normal; margin-top: 2px; }
      .section-note { display: block; padding: var(--sp-2) var(--sp-1) 0; font-size: var(--app-text-sm); line-height: var(--app-leading-snug); }
      .app-signature { text-align: center; font-size: var(--app-text-xs); margin: var(--sp-10) 0 var(--sp-4); }
    `,
  ],
})
export class SettingsPage {
  profile = inject(ProfileFacade);
  config = inject(SecureConfigService);
  favorites = inject(FavoritesFacade);
  theme = inject(ThemeService);
  private toast = inject(ToastController);

  readonly mealLabels = MEAL_TYPE_LABELS;

  /** Persist the chosen appearance (system / light / dark). */
  setTheme(ev: CustomEvent): void {
    void this.theme.set(ev.detail.value as ThemeMode);
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

  getApiKey(): void {
    openExternal(GEMINI_API_KEY_URL);
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
