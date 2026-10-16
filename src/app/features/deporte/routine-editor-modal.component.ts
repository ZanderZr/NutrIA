import { Component, Input, inject } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  AlertInput,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { RoutineFacade } from '@core/state/routine.facade';
import { PlannedExerciseDraft } from '@data/repositories/routine.repository';
import {
  EXERCISE_UNITS,
  ExerciseUnit,
  PlannedExercise,
  RoutineDay,
} from '@domain/models/training.model';

/** Fields the add/edit alert collects, keyed by the alert input names. */
interface ExerciseForm {
  name: string;
  sets: string;
  reps: string;
  measure: string;
  seconds: string;
  rest: string;
}

/**
 * Edit a routine by hand: add, rename and remove days and exercises. Also the
 * surface behind "create from scratch". Exercise forms use AlertController
 * inputs rather than a fourth modal, with a preceding action sheet for the
 * unit — an alert cannot mix a select with text inputs.
 */
@Component({
  selector: 'app-routine-editor-modal',
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
    TranslocoModule,
  ],
  templateUrl: './routine-editor-modal.component.html',
  styleUrl: './routine-editor-modal.component.scss',
})
export class RoutineEditorModalComponent {
  @Input() routineId!: number;

  routines = inject(RoutineFacade);
  private modalCtrl = inject(ModalController);
  private sheets = inject(ActionSheetController);
  private alerts = inject(AlertController);
  private t = inject(TranslocoService);

  /** "4 × 8-12 · 60 kg · 90s" — symbols only, so it needs no translation. */
  summary(ex: PlannedExercise): string {
    const parts: string[] = [];
    switch (ex.unit) {
      case 'time':
        parts.push(`${ex.target_sets} × ${ex.target_seconds || ex.target_reps || '—'}s`);
        break;
      case 'dist':
        parts.push(`${ex.target_distance_m || '—'} m`);
        break;
      default:
        parts.push(`${ex.target_sets} × ${ex.target_reps || '—'}`);
        if (ex.target_weight_kg) parts.push(`${ex.target_weight_kg} kg`);
    }
    if (ex.rest_seconds) parts.push(`${ex.rest_seconds}s`);
    return parts.join(' · ');
  }

  unitLabel(unit: ExerciseUnit): string {
    return this.t.translate(`deporte.unit.${unit}`);
  }

  async addDay(): Promise<void> {
    const alert = await this.alerts.create({
      header: this.t.translate('deporte.editor.addDay'),
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: this.t.translate('deporte.editor.dayPlaceholder'),
        },
      ],
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.add'),
          handler: (data: { name: string }) => {
            const name = (data.name ?? '').trim();
            if (!name) return false;
            void this.routines.addDay(this.routineId, name);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** Overflow menu for one day. */
  async dayMenu(day: RoutineDay): Promise<void> {
    if (!day.id) return;
    const dayId = day.id;
    const sheet = await this.sheets.create({
      header: day.name,
      buttons: [
        {
          text: this.t.translate('deporte.editor.addExercise'),
          icon: 'add-outline',
          handler: () => void this.addExercise(dayId),
        },
        {
          text: this.t.translate('deporte.editor.renameDay'),
          icon: 'create-outline',
          handler: () => void this.renameDay(dayId, day.name),
        },
        {
          text: this.t.translate('deporte.editor.deleteDay'),
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => void this.confirmDeleteDay(dayId, day.name),
        },
        { text: this.t.translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** Overflow menu for one exercise. */
  async exerciseMenu(ex: PlannedExercise): Promise<void> {
    if (!ex.id) return;
    const sheet = await this.sheets.create({
      header: ex.name,
      subHeader: this.unitLabel(ex.unit),
      buttons: [
        {
          text: this.t.translate('common.edit'),
          icon: 'create-outline',
          handler: () => void this.editExercise(ex),
        },
        {
          text: this.t.translate('deporte.editor.changeUnit'),
          icon: 'swap-vertical-outline',
          handler: () => void this.changeUnit(ex),
        },
        {
          text: this.t.translate('common.delete'),
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => void this.confirmDeleteExercise(ex),
        },
        { text: this.t.translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }

  /** Ask how the exercise is measured, then collect its fields. */
  private async addExercise(dayId: number): Promise<void> {
    const unit = await this.askUnit(this.t.translate('deporte.editor.addExercise'));
    if (!unit) return;
    const form = await this.askExercise(
      this.t.translate('deporte.editor.addExercise'),
      unit,
      null,
    );
    if (!form) return;
    await this.routines.addExercise(dayId, this.toDraft(form, unit));
  }

  private async editExercise(ex: PlannedExercise): Promise<void> {
    const form = await this.askExercise(ex.name, ex.unit, ex);
    if (!form) return;
    const draft = this.toDraft(form, ex.unit);
    // Keep the history's name in sync: a rename means "same exercise, better
    // name", and otherwise its chart series would split in two.
    await this.routines.updateExercise({ ...ex, ...draft }, true);
  }

  private async changeUnit(ex: PlannedExercise): Promise<void> {
    const unit = await this.askUnit(this.t.translate('deporte.editor.changeUnit'));
    if (!unit || unit === ex.unit) return;
    await this.routines.updateExercise({ ...ex, unit }, true);
  }

  /** Resolves on dismiss, so a backdrop tap cancels instead of hanging. */
  private async askUnit(header: string): Promise<ExerciseUnit | null> {
    let picked: ExerciseUnit | null = null;
    const sheet = await this.sheets.create({
      header,
      subHeader: this.t.translate('deporte.editor.unitQuestion'),
      buttons: [
        ...EXERCISE_UNITS.map((unit) => ({
          text: this.unitLabel(unit),
          icon: UNIT_ICONS[unit],
          handler: () => {
            picked = unit;
          },
        })),
        { text: this.t.translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
    await sheet.onDidDismiss();
    return picked;
  }

  private askExercise(
    header: string,
    unit: ExerciseUnit,
    current: PlannedExercise | null,
  ): Promise<ExerciseForm | null> {
    const inputs: AlertInput[] = [
      {
        name: 'name',
        type: 'text',
        value: current?.name ?? '',
        placeholder: this.t.translate('deporte.editor.namePlaceholder'),
      },
    ];

    if (unit !== 'dist') {
      inputs.push({
        name: 'sets',
        type: 'number',
        value: current?.target_sets ?? 3,
        min: 1,
        max: 30,
        placeholder: this.t.translate('deporte.editor.setsPlaceholder'),
      });
    }
    if (unit === 'kg' || unit === 'bw') {
      inputs.push({
        name: 'reps',
        type: 'text',
        value: current?.target_reps ?? '',
        placeholder: this.t.translate('deporte.editor.repsPlaceholder'),
      });
      inputs.push({
        name: 'measure',
        type: 'number',
        value: current?.target_weight_kg || '',
        placeholder: this.t.translate(
          unit === 'bw' ? 'deporte.session.extraKg' : 'deporte.session.kg',
        ),
      });
    }
    if (unit === 'time') {
      inputs.push({
        name: 'seconds',
        type: 'number',
        value: current?.target_seconds || '',
        placeholder: this.t.translate('deporte.session.seconds'),
      });
    }
    if (unit === 'dist') {
      inputs.push({
        name: 'measure',
        type: 'number',
        value: current?.target_distance_m || '',
        placeholder: this.t.translate('deporte.session.metres'),
      });
      inputs.push({
        name: 'seconds',
        type: 'number',
        value: current?.target_seconds || '',
        placeholder: this.t.translate('deporte.session.seconds'),
      });
    }
    inputs.push({
      name: 'rest',
      type: 'number',
      value: current?.rest_seconds || '',
      placeholder: this.t.translate('deporte.editor.restPlaceholder'),
    });

    return this.presentForm(header, unit, inputs);
  }

  /** Resolves on dismiss, so a backdrop tap cancels instead of hanging. */
  private async presentForm(
    header: string,
    unit: ExerciseUnit,
    inputs: AlertInput[],
  ): Promise<ExerciseForm | null> {
    let form: ExerciseForm | null = null;
    const alert = await this.alerts.create({
      header,
      subHeader: this.unitLabel(unit),
      inputs,
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.save'),
          handler: (data: ExerciseForm) => {
            if (!(data.name ?? '').trim()) return false;
            form = data;
            return true;
          },
        },
      ],
    });
    await alert.present();
    await alert.onDidDismiss();
    return form;
  }

  private toDraft(form: ExerciseForm, unit: ExerciseUnit): PlannedExerciseDraft {
    const num = (value: string | undefined): number => {
      const parsed = parseFloat((value ?? '').toString().replace(',', '.'));
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };
    return {
      name: form.name.trim(),
      muscle_group: '',
      unit,
      target_sets: unit === 'dist' ? 1 : Math.round(num(form.sets)) || 3,
      target_reps: (form.reps ?? '').trim(),
      target_weight_kg: unit === 'kg' || unit === 'bw' ? num(form.measure) : 0,
      target_seconds: Math.round(num(form.seconds)),
      target_distance_m: unit === 'dist' ? num(form.measure) : 0,
      rest_seconds: Math.round(num(form.rest)),
      notes: '',
    };
  }

  private async renameDay(dayId: number, current: string): Promise<void> {
    const alert = await this.alerts.create({
      header: this.t.translate('deporte.editor.renameDay'),
      inputs: [{ name: 'name', type: 'text', value: current }],
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.save'),
          handler: (data: { name: string }) => {
            const name = (data.name ?? '').trim();
            if (!name) return false;
            void this.routines.renameDay(dayId, name);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async confirmDeleteDay(dayId: number, name: string): Promise<void> {
    const alert = await this.alerts.create({
      header: this.t.translate('deporte.editor.deleteDay'),
      message: this.t.translate('deporte.editor.deleteDayMsg', { name }),
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.delete'),
          role: 'destructive',
          handler: () => {
            void this.routines.removeDay(dayId);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async confirmDeleteExercise(ex: PlannedExercise): Promise<void> {
    if (!ex.id) return;
    const exerciseId = ex.id;
    const hasHistory = await this.routines.exerciseHasHistory(exerciseId);
    const alert = await this.alerts.create({
      header: this.t.translate('common.delete'),
      message: this.t.translate(
        hasHistory
          ? 'deporte.editor.deleteExerciseKeptMsg'
          : 'deporte.editor.deleteExerciseMsg',
        { name: ex.name },
      ),
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.delete'),
          role: 'destructive',
          handler: () => {
            void this.routines.removeExercise(exerciseId);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }
}

/** Icon per measurement type, for the unit action sheet. */
const UNIT_ICONS: Record<ExerciseUnit, string> = {
  kg: 'barbell-outline',
  bw: 'body-outline',
  time: 'time-outline',
  dist: 'walk-outline',
};
