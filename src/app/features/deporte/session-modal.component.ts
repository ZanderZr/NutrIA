import { Component, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { DraftGroup, WorkoutFacade } from '@core/state/workout.facade';

/**
 * Log one training session: a card per exercise, a row per set. Which inputs a
 * row shows depends on the exercise's unit (weight+reps, reps only, seconds or
 * metres). Weight is prefilled from the last performance as a suggestion.
 *
 * Values are committed on `ionChange` (blur/enter) rather than `ionInput`: the
 * draft is re-rendered from signals on every write, and re-binding [value] mid
 * keystroke would fight decimal input like "62.5".
 */
@Component({
  selector: 'app-session-modal',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
    IonIcon,
    IonInput,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    TranslocoModule,
  ],
  templateUrl: './session-modal.component.html',
  styleUrl: './session-modal.component.scss',
})
export class SessionModalComponent {
  workouts = inject(WorkoutFacade);
  private modalCtrl = inject(ModalController);
  private toast = inject(ToastController);
  private t = inject(TranslocoService);

  /** The date picker speaks ISO; the facade stores a 'YYYY-MM-DD' key. */
  dateIso(): string {
    return `${this.workouts.date()}T12:00:00`;
  }

  onDateChange(ev: CustomEvent): void {
    const value = this.detailValue(ev);
    if (value) this.workouts.setDate(value.slice(0, 10));
  }

  title(): string {
    return (
      this.workouts.day()?.name ??
      this.workouts.session()?.day_name ??
      this.t.translate('deporte.session.title')
    );
  }

  /** "4 × 8-12 · 90 s" from the plan, or '' for a free session. */
  targetLabel(group: DraftGroup): string {
    const planned = group.planned;
    if (!planned) return '';
    const parts: string[] = [];
    switch (group.unit) {
      case 'time':
        parts.push(
          planned.target_seconds
            ? `${planned.target_sets} × ${planned.target_seconds}s`
            : `${planned.target_sets} × ${planned.target_reps}`,
        );
        break;
      case 'dist':
        parts.push(
          planned.target_distance_m
            ? `${planned.target_distance_m} m`
            : `${planned.target_sets} × ${planned.target_reps}`,
        );
        break;
      default:
        parts.push(`${planned.target_sets} × ${planned.target_reps || '—'}`);
        if (planned.target_weight_kg) parts.push(`${planned.target_weight_kg} kg`);
    }
    if (planned.rest_seconds) {
      parts.push(this.t.translate('deporte.session.rest', { s: planned.rest_seconds }));
    }
    return parts.join(' · ');
  }

  onReps(index: number, ev: CustomEvent): void {
    this.workouts.setReps(index, this.detailValue(ev));
  }

  onWeight(index: number, ev: CustomEvent): void {
    this.workouts.setWeight(index, this.detailValue(ev));
  }

  onSeconds(index: number, ev: CustomEvent): void {
    this.workouts.setSeconds(index, this.detailValue(ev));
  }

  onDistance(index: number, ev: CustomEvent): void {
    this.workouts.setDistance(index, this.detailValue(ev));
  }

  /** Empty string instead of 0, so the input shows its placeholder. */
  show(value: number): string {
    return value ? `${value}` : '';
  }

  canSave(): boolean {
    return this.workouts.totals().total_sets > 0 && !this.workouts.saving();
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    await this.workouts.save();
    await this.modalCtrl.dismiss();
    const t = await this.toast.create({
      message: this.t.translate('deporteMsg.sessionSaved'),
      duration: 1800,
      position: 'bottom',
    });
    await t.present();
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }

  private detailValue(ev: CustomEvent): string | null {
    return (ev.detail as { value?: string | null })?.value ?? null;
  }
}
