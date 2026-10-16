import { Component, ElementRef, inject, viewChild } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { RoutineFacade } from '@core/state/routine.facade';
import { WorkoutFacade } from '@core/state/workout.facade';
import {
  RoutineDay,
  SessionTotals,
  WorkoutSession,
} from '@domain/models/training.model';
import { friendlyDate } from '@shared/utils/date.util';
import { ExerciseProgressCardComponent } from './exercise-progress-card.component';
import { RoutineEditorModalComponent } from './routine-editor-modal.component';
import { RoutineImportModalComponent } from './routine-import-modal.component';
import { SessionModalComponent } from './session-modal.component';

/**
 * Training tab. Empty until the user imports a routine (PDF, photo or text) or
 * builds one by hand; after that it is the launcher for logging a session and
 * the home of the per-exercise progress chart.
 */
@Component({
  selector: 'app-deporte',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonIcon,
    IonSkeletonText,
    ExerciseProgressCardComponent,
    TranslocoModule,
  ],
  templateUrl: './deporte.page.html',
  styleUrl: './deporte.page.scss',
})
export class DeportePage {
  routines = inject(RoutineFacade);
  workouts = inject(WorkoutFacade);

  private modalCtrl = inject(ModalController);
  private sheets = inject(ActionSheetController);
  private alerts = inject(AlertController);
  private toast = inject(ToastController);
  private t = inject(TranslocoService);

  /** Hidden file input, clicked programmatically (the settings-import pattern). */
  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('routineInput');

  /** Absent until a routine exists, since the chart card is behind an @if. */
  private readonly progress = viewChild(ExerciseProgressCardComponent);

  readonly skeletonRows = [0, 1];

  async ionViewWillEnter(): Promise<void> {
    await this.reloadAll();
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.reloadAll();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  /** Reload both facades and the chart (which also re-reads the theme tokens). */
  private async reloadAll(): Promise<void> {
    await Promise.all([this.routines.load(), this.workouts.load()]);
    await this.progress()?.reload();
  }

  pickRoutineFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  async onRoutineFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file later
    if (!file) return;

    const modal = await this.modalCtrl.create({
      component: RoutineImportModalComponent,
      componentProps: { file },
      presentingElement: this.presentingElement(),
      // The import runs two AI calls; a half-finished one must not be dismissed.
      backdropDismiss: false,
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.reloadAll();
  }

  /** Create a routine from scratch, then open the editor on it. */
  async createByHand(): Promise<void> {
    const alert = await this.alerts.create({
      header: this.t.translate('deporte.createTitle'),
      message: this.t.translate('deporte.createMsg'),
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: this.t.translate('deporte.namePlaceholder'),
        },
      ],
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.create'),
          handler: (data: { name: string }) => {
            const name = (data.name ?? '').trim();
            void this.doCreate(name || this.t.translate('deporte.defaultName'));
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async openEditor(): Promise<void> {
    const routineId = this.routines.active()?.id;
    if (!routineId) return;
    const modal = await this.modalCtrl.create({
      component: RoutineEditorModalComponent,
      componentProps: { routineId },
      presentingElement: this.presentingElement(),
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.routines.load();
  }

  /** Start logging a routine day. */
  async trainDay(day: RoutineDay): Promise<void> {
    if (!day.exercises.length) {
      await this.notify(this.t.translate('deporteMsg.dayEmpty'));
      return;
    }
    await this.workouts.openForDay(day);
    await this.openSessionModal();
  }

  async openSession(session: WorkoutSession): Promise<void> {
    if (!session.id) return;
    await this.workouts.openExisting(session.id);
    await this.openSessionModal();
  }

  /** Overflow menu for the active routine. */
  async routineMenu(): Promise<void> {
    const routine = this.routines.active();
    if (!routine?.id) return;
    const routineId = routine.id;

    const sheet = await this.sheets.create({
      header: routine.name,
      buttons: [
        {
          text: this.t.translate('deporte.menuEdit'),
          icon: 'create-outline',
          handler: () => void this.openEditor(),
        },
        {
          text: this.t.translate('deporte.menuRename'),
          icon: 'text-outline',
          handler: () => void this.renameRoutine(routineId, routine.name),
        },
        {
          text: this.t.translate('deporte.menuImport'),
          icon: 'document-attach-outline',
          handler: () => this.pickRoutineFile(),
        },
        ...(this.routines.headers().length > 1
          ? [
              {
                text: this.t.translate('deporte.menuSwitch'),
                icon: 'repeat-outline',
                handler: () => void this.switchRoutine(),
              },
            ]
          : []),
        {
          text: this.t.translate('deporte.menuDelete'),
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => void this.confirmDeleteRoutine(routineId, routine.name),
        },
        { text: this.t.translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async confirmDeleteSession(session: WorkoutSession): Promise<void> {
    if (!session.id) return;
    const sessionId = session.id;
    const alert = await this.alerts.create({
      header: this.t.translate('deporte.deleteSessionTitle'),
      message: this.t.translate('deporte.deleteSessionMsg', {
        day: session.day_name,
        date: friendlyDate(session.date),
      }),
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.delete'),
          role: 'destructive',
          handler: () => {
            void this.workouts.removeSession(sessionId);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** "hace 3 días" for a routine day, or '' when never trained. */
  lastTrained(day: RoutineDay): string {
    const date = day.id ? this.workouts.lastDates().get(day.id) : undefined;
    return date ? friendlyDate(date) : '';
  }

  dateLabel(dateKey: string): string {
    return friendlyDate(dateKey);
  }

  totals(session: WorkoutSession): SessionTotals {
    return this.workouts.sessionTotals(session);
  }

  private async openSessionModal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SessionModalComponent,
      presentingElement: this.presentingElement(),
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.reloadAll();
  }

  private async doCreate(name: string): Promise<void> {
    await this.routines.createEmpty(name);
    await this.openEditor();
  }

  private async renameRoutine(routineId: number, current: string): Promise<void> {
    const alert = await this.alerts.create({
      header: this.t.translate('deporte.menuRename'),
      inputs: [{ name: 'name', type: 'text', value: current }],
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.save'),
          handler: (data: { name: string }) => {
            const name = (data.name ?? '').trim();
            if (!name) return false;
            void this.routines.renameRoutine(routineId, name);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async switchRoutine(): Promise<void> {
    const sheet = await this.sheets.create({
      header: this.t.translate('deporte.menuSwitch'),
      buttons: [
        ...this.routines.headers().map((h) => ({
          text: `${h.name} · ${h.day_count}${this.t.translate('deporte.daysShort')}`,
          icon: h.is_active ? 'checkmark-circle' : 'barbell-outline',
          handler: () => void this.routines.selectRoutine(h.id),
        })),
        { text: this.t.translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmDeleteRoutine(routineId: number, name: string): Promise<void> {
    const alert = await this.alerts.create({
      header: this.t.translate('deporte.deleteTitle'),
      message: this.t.translate('deporte.deleteMsg', { name }),
      buttons: [
        { text: this.t.translate('common.cancel'), role: 'cancel' },
        {
          text: this.t.translate('common.delete'),
          role: 'destructive',
          handler: () => {
            void this.routines.removeRoutine(routineId);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** The root router outlet, so modals present as native iOS cards. */
  private presentingElement(): HTMLElement | undefined {
    return (document.querySelector('ion-router-outlet') as HTMLElement) ?? undefined;
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 2000, position: 'bottom' });
    await t.present();
  }
}
