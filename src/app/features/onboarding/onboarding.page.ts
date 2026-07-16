import { Component, OnInit, inject, signal } from '@angular/core';
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
  AlertController,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { ProfileFacade } from '@core/state/profile.facade';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { FavoritesFacade } from '@core/state/favorites.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import { BackupService } from '@core/backup/backup.service';
import { AutoBackupService } from '@core/backup/auto-backup.service';
import { ApiKeyGuideModalComponent } from '@shared/components/api-key-guide-modal.component';
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
    TranslocoModule,
  ],
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export class OnboardingPage implements OnInit {
  private profile = inject(ProfileFacade);
  private dashboard = inject(DashboardFacade);
  private favorites = inject(FavoritesFacade);
  private config = inject(SecureConfigService);
  private backup = inject(BackupService);
  private autoBackup = inject(AutoBackupService);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private alerts = inject(AlertController);
  private t = inject(TranslocoService);

  readonly step = signal(0);

  /** On a fresh install, offer to restore from an on-device auto-backup. */
  async ngOnInit(): Promise<void> {
    if (!(await this.autoBackup.hasBackupFile())) return;
    const text = await this.autoBackup.readBackupFile();
    if (!text) return;
    let data;
    try {
      data = this.backup.parse(text);
    } catch {
      return;
    }
    const alert = await this.alerts.create({
      header: this.t.translate('onboarding.restoreTitle'),
      message: this.t.translate('onboarding.restoreMsg', {
        meals: data.meals.length,
      }),
      buttons: [
        { text: this.t.translate('onboarding.startFresh'), role: 'cancel' },
        {
          text: this.t.translate('common.restore'),
          handler: () => {
            void this.restore(data);
          },
        },
      ],
    });
    await alert.present();
  }

  private async restore(data: Parameters<BackupService['restore']>[0]): Promise<void> {
    await this.backup.restore(data);
    await Promise.all([
      this.profile.load(),
      this.favorites.load(),
      this.dashboard.refresh(),
    ]);
    await this.router.navigateByUrl('/tabs/chat', { replaceUrl: true });
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
    const verb = this.t.translate(
      progress.ratePerWeekKg < 0 ? 'goalHint.lose' : 'goalHint.gain',
    );
    const perWeek = this.t.translate('goalHint.perWeek', { rate });
    const eta = progress.etaDate
      ? this.t.translate('goalHint.eta', { date: friendlyDate(progress.etaDate) })
      : '';
    return `${verb} ${perWeek}${eta}`;
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

  /** Open the step-by-step guide to get a free Gemini API key. */
  async getApiKey(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ApiKeyGuideModalComponent,
    });
    await modal.present();
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
