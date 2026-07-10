import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
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
  IonSegment,
  IonSegmentButton,
  IonRadio,
  IonRadioGroup,
  IonNote,
  IonProgressBar,
} from '@ionic/angular/standalone';

import { ProfileFacade } from '@core/state/profile.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import {
  DAILY_ACTIVITY_LABELS,
  DAILY_ACTIVITY_DESCRIPTIONS,
  DailyActivity,
  Objective,
  OBJECTIVE_LABELS,
  Pace,
  PACE_LABELS,
  ProfileInput,
  Sex,
  objectiveNeedsTargetWeight,
} from '@domain/models/user-profile.model';
import { calcTargets } from '@domain/nutrition/nutrition-calculator';
import { computeGoalProgress } from '@domain/nutrition/goal-progress';
import { friendlyDate } from '@shared/utils/date.util';
import {
  GEMINI_API_KEY_URL,
  openExternal,
} from '@shared/utils/external-link.util';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
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
    IonSegment,
    IonSegmentButton,
    IonRadio,
    IonRadioGroup,
    IonNote,
    IonProgressBar,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Bienvenido a NutriControl</ion-title>
      </ion-toolbar>
      <ion-progress-bar [value]="step() / 2"></ion-progress-bar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="content-wrap onb">
        @if (step() === 0) {
          <div class="onb-intro animate-rise">
            <div class="onb-badge"><ion-icon name="leaf-outline"></ion-icon></div>
            <h1 class="page-title">Cuéntanos sobre ti</h1>
            <p class="text-secondary">
              Con estos datos calcularemos tus objetivos diarios. Podrás editarlos
              cuando quieras.
            </p>
          </div>

          <ion-segment [(ngModel)]="sex">
            <ion-segment-button value="male"><ion-label>Hombre</ion-label></ion-segment-button>
            <ion-segment-button value="female"><ion-label>Mujer</ion-label></ion-segment-button>
          </ion-segment>

          <div class="item-group">
            <ion-item>
              <ion-input label="Edad" type="number" inputmode="numeric" [(ngModel)]="age"></ion-input>
            </ion-item>
            <ion-item>
              <ion-input label="Peso (kg)" type="number" inputmode="decimal" [(ngModel)]="weight"></ion-input>
            </ion-item>
            <ion-item>
              <ion-input label="Altura (cm)" type="number" inputmode="numeric" [(ngModel)]="height"></ion-input>
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
              <ion-input
                label="Días por semana"
                type="number"
                inputmode="numeric"
                min="0"
                max="7"
                [(ngModel)]="trainingDays"
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-input
                label="Minutos por sesión"
                type="number"
                inputmode="numeric"
                min="0"
                [(ngModel)]="trainingMinutes"
              ></ion-input>
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
                <ion-input
                  label="Peso objetivo (kg)"
                  type="number"
                  inputmode="decimal"
                  [(ngModel)]="targetWeight"
                ></ion-input>
              </ion-item>
            }
          </div>

          @if (needsTarget()) {
            <ion-segment [(ngModel)]="pace" class="pace-seg">
              @for (p of paceKeys; track p) {
                <ion-segment-button [value]="p"><ion-label>{{ paceLabels[p] }}</ion-label></ion-segment-button>
              }
            </ion-segment>
          }

          @if (previewValid()) {
            <div class="app-card preview animate-rise">
              <span class="preview-title"><ion-icon name="sparkles-outline"></ion-icon> Tus objetivos estimados</span>
              <div class="targets">
                <div class="t cal"><span class="num">{{ preview().calories | number:'1.0-0' }}</span><small>kcal</small></div>
                <div class="t"><span class="num">{{ preview().protein_g }}</span><small>proteína</small></div>
                <div class="t"><span class="num">{{ preview().carbs_g }}</span><small>hidratos</small></div>
                <div class="t"><span class="num">{{ preview().fat_g }}</span><small>grasa</small></div>
              </div>
              @if (goalHint()) {
                <p class="goal-hint">{{ goalHint() }}</p>
              }
              <p class="goal-note">Proteína alta para conservar músculo.</p>
            </div>
          }

          <ion-button expand="block" class="onb-cta" [disabled]="!previewValid()" (click)="next()">
            Continuar
            <ion-icon slot="end" name="arrow-forward"></ion-icon>
          </ion-button>
        } @else {
          <div class="onb-intro animate-rise">
            <div class="onb-badge"><ion-icon name="sparkles-outline"></ion-icon></div>
            <h1 class="page-title">Conecta la IA</h1>
            <p class="text-secondary">
              NutriControl usa Gemini para interpretar lo que escribes. Pega tu
              clave gratuita de Google AI Studio. Se guarda cifrada solo en tu
              dispositivo.
            </p>
          </div>

          <ion-button expand="block" fill="outline" class="ion-margin-bottom" (click)="getApiKey()">
            <ion-icon slot="start" name="open-outline"></ion-icon>
            Conseguir mi clave gratis
          </ion-button>

          <div class="item-group">
            <ion-item>
              <ion-input
                label="Clave de API de Gemini"
                type="password"
                [(ngModel)]="apiKey"
                placeholder="AIza..."
              ></ion-input>
            </ion-item>
          </div>
          <ion-note class="section-note">
            Pulsa el botón, crea una clave en Google AI Studio, cópiala y pégala
            aquí. Puedes añadirla más tarde en Ajustes.
          </ion-note>

          <ion-button expand="block" class="onb-cta" (click)="finish()">Empezar</ion-button>
          <ion-button expand="block" fill="clear" (click)="finish()">Omitir por ahora</ion-button>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .onb { padding-top: var(--sp-4); }
      .onb-intro { text-align: center; margin-bottom: var(--sp-6); }
      .onb-badge {
        width: 64px;
        height: 64px;
        border-radius: var(--r-lg);
        background: var(--app-primary-soft);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--sp-3);
      }
      .onb-badge ion-icon { font-size: 2rem; color: var(--app-primary); }
      .onb-intro p { margin: var(--sp-1) auto 0; max-width: 34ch; line-height: var(--app-leading-normal); }
      ion-segment { margin-bottom: var(--sp-4); }
      .section-note { display: block; padding: var(--sp-2) var(--sp-1) 0; font-size: var(--app-text-sm); line-height: var(--app-leading-snug); }
      .onb-cta { margin-top: var(--sp-5); }

      .preview { margin-top: var(--sp-5); padding: var(--sp-5); }
      .preview-title {
        display: inline-flex;
        align-items: center;
        gap: var(--sp-2);
        font-size: var(--app-text-sm);
        font-weight: var(--app-weight-semibold);
        color: var(--app-text-2);
      }
      .preview-title ion-icon { color: var(--app-primary); }
      .targets {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--sp-2);
        margin-top: var(--sp-4);
        text-align: center;
      }
      .t span { display: block; font-size: var(--app-text-lg); font-weight: var(--app-weight-bold); color: var(--app-text); }
      .t small { color: var(--app-text-3); font-size: var(--app-text-2xs); }
      .t.cal span { color: var(--app-primary); }
      .pace-seg { margin-bottom: var(--sp-3); }
      .train-seg { margin-bottom: var(--sp-2); }
      .act-radio { width: 100%; }
      .act-radio::part(label) { margin-inline-end: var(--sp-3); }
      .act-title { font-size: var(--app-text-md); font-weight: var(--app-weight-semibold); color: var(--app-text); }
      .act-desc { font-size: var(--app-text-sm); color: var(--app-text-3); white-space: normal; margin-top: 2px; }
      .goal-hint {
        margin: var(--sp-3) 0 0;
        font-size: var(--app-text-sm);
        font-weight: var(--app-weight-semibold);
        color: var(--app-primary);
        text-align: center;
      }
      .goal-note {
        margin: var(--sp-1) 0 0;
        font-size: var(--app-text-2xs);
        color: var(--app-text-3);
        text-align: center;
      }
    `,
  ],
})
export class OnboardingPage {
  private profile = inject(ProfileFacade);
  private config = inject(SecureConfigService);
  private router = inject(Router);

  readonly step = signal(0);

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

  previewValid(): boolean {
    return this.isValid();
  }

  preview() {
    if (!this.isValid()) {
      return { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
    }
    return calcTargets(this.currentInput());
  }

  /** Human summary of the weekly rate + estimated arrival date, if applicable. */
  goalHint(): string | null {
    if (!this.isValid() || !this.needsTarget() || !this.targetWeight) {
      return null;
    }
    const progress = computeGoalProgress({
      objective: this.objective,
      pace: this.pace,
      targetWeightKg: Number(this.targetWeight),
      currentWeightKg: Number(this.weight),
      startWeightKg: Number(this.weight),
    });
    if (!progress) return null;
    const rate = Math.abs(progress.ratePerWeekKg).toFixed(2);
    const verb = progress.ratePerWeekKg < 0 ? 'Perderás' : 'Ganarás';
    const eta = progress.etaDate ? ` · llegarías el ${friendlyDate(progress.etaDate)}` : '';
    return `${verb} ~${rate} kg/semana${eta}`;
  }

  private isValid(): boolean {
    const bodyOk =
      !!this.age &&
      this.age > 0 &&
      !!this.weight &&
      this.weight > 0 &&
      !!this.height &&
      this.height > 0;
    if (!bodyOk) return false;
    // Target-weight objectives require a valid target.
    return !this.needsTarget() || (!!this.targetWeight && this.targetWeight > 0);
  }

  private currentInput(): ProfileInput {
    return {
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
    };
  }

  getApiKey(): void {
    openExternal(GEMINI_API_KEY_URL);
  }

  /** If a key is already available (embedded), skip the key step entirely. */
  async next(): Promise<void> {
    if (this.config.hasKey()) {
      await this.finish();
    } else {
      this.step.set(1);
    }
  }

  async finish(): Promise<void> {
    await this.profile.createFromInput(this.currentInput());
    if (this.apiKey.trim()) {
      await this.config.setApiKey(this.apiKey);
    }
    await this.router.navigateByUrl('/tabs/chat', { replaceUrl: true });
  }
}
