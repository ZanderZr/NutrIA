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
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
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
