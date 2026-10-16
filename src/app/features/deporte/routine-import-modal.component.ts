import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoModule } from '@jsverse/transloco';

import { RoutineFacade } from '@core/state/routine.facade';
import { DocumentMarkdownService } from '@core/training/document-markdown.service';

type StepState = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

/** The three rows of the progress list, in order. */
type StepRow = 'read' | 'convert' | 'structure';
const STEP_ROWS: StepRow[] = ['read', 'convert', 'structure'];

/** Which row each pipeline step lights up ('saving' finishes row 3). */
const STEP_OF = new Map<string, number>([
  ['reading', 0],
  ['converting', 1],
  ['structuring', 2],
  ['saving', 2],
]);

/** After this long on an AI step, show the elapsed time so it never looks stuck. */
const SLOW_AFTER_SECONDS = 10;

/**
 * Progress screen for the two-step routine import (document → Markdown → rows).
 * A long PDF can take a minute per AI call, so this shows which step is running
 * and how long it has been going, and offers a retry with the same file.
 */
@Component({
  selector: 'app-routine-import-modal',
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
    IonSpinner,
    TranslocoModule,
  ],
  templateUrl: './routine-import-modal.component.html',
  styleUrl: './routine-import-modal.component.scss',
})
export class RoutineImportModalComponent implements OnInit, OnDestroy {
  @Input() file!: File;

  routines = inject(RoutineFacade);
  private docs = inject(DocumentMarkdownService);
  private modalCtrl = inject(ModalController);

  readonly rows = STEP_ROWS;
  readonly elapsed = signal(0);
  private timer?: ReturnType<typeof setInterval>;
  /** Whether step 2 (AI transcription) applies to this file at all. */
  private needsAi = true;

  readonly slow = computed(
    () => this.routines.importing() && this.elapsed() >= SLOW_AFTER_SECONDS,
  );

  ngOnInit(): void {
    this.needsAi = this.docs.needsAi(this.file);
    void this.run();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.routines.resetImport();
  }

  async run(): Promise<void> {
    this.startTimer();
    await this.routines.importFromFile(this.file);
    this.stopTimer();
  }

  /** Icon/spinner state of one row in the step list. */
  stepState(row: StepRow): StepState {
    // A text file never needs the transcription call.
    if (row === 'convert' && !this.needsAi) return 'skipped';

    const current = this.routines.step();
    if (current === 'idle') return 'pending';
    if (current === 'done') return 'done';

    const rowIndex = STEP_ROWS.indexOf(row);
    const active =
      current === 'error' ? this.routines.failedStep() : current;
    const activeIndex = STEP_OF.get(active) ?? -1;

    if (rowIndex < activeIndex) return 'done';
    if (rowIndex > activeIndex) return 'pending';
    return current === 'error' ? 'failed' : 'running';
  }

  fileName(): string {
    return this.file?.name ?? '';
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }

  private startTimer(): void {
    this.stopTimer();
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.update((s) => s + 1), 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
