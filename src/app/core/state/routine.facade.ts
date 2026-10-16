import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { AI_NUTRITION_PORT, AiError } from '@core/ai/ai-nutrition.port';
import { HapticsService } from '@core/haptics/haptics.service';
import { LanguageService } from '@core/i18n/language.service';
import {
  DocumentMarkdownService,
  MAX_FILE_MB,
  TrainingFileError,
} from '@core/training/document-markdown.service';
import {
  PlannedExerciseDraft,
  RoutineRepository,
} from '@data/repositories/routine.repository';
import { ParsedRoutine } from '@domain/models/ai.model';
import {
  PlannedExercise,
  Routine,
  RoutineHeader,
  countExercises,
  normalizeExerciseKey,
} from '@domain/models/training.model';

/** Where the import pipeline currently is, so the modal can show progress. */
export type ImportStep =
  | 'idle'
  | 'reading'
  | 'converting'
  | 'structuring'
  | 'saving'
  | 'done'
  | 'error';

/** What an import produced, for the success message. */
export interface ImportSummary {
  name: string;
  days: number;
  exercises: number;
}

/**
 * Owns the routine catalogue (the plan) and the document import pipeline.
 * The performed log lives in WorkoutFacade.
 */
@Injectable({ providedIn: 'root' })
export class RoutineFacade {
  private repo = inject(RoutineRepository);
  private docs = inject(DocumentMarkdownService);
  private ai = inject(AI_NUTRITION_PORT);
  private language = inject(LanguageService);
  private haptics = inject(HapticsService);
  private tr = inject(TranslocoService);

  private readonly _headers = signal<RoutineHeader[]>([]);
  private readonly _active = signal<Routine | null>(null);
  private readonly _loaded = signal(false);
  private readonly _step = signal<ImportStep>('idle');
  /** Which step was running when the import failed, for the progress list. */
  private readonly _failedStep = signal<ImportStep>('idle');
  private readonly _error = signal('');
  private readonly _summary = signal<ImportSummary | null>(null);

  readonly headers = this._headers.asReadonly();
  readonly active = this._active.asReadonly();
  /** False until the first load completes — drives loading skeletons. */
  readonly loaded = this._loaded.asReadonly();
  readonly step = this._step.asReadonly();
  readonly failedStep = this._failedStep.asReadonly();
  readonly error = this._error.asReadonly();
  readonly summary = this._summary.asReadonly();

  readonly hasRoutines = computed(() => this._headers().length > 0);
  readonly activeDays = computed(() => this._active()?.days ?? []);
  readonly activeExerciseCount = computed(() => {
    const active = this._active();
    return active ? countExercises(active) : 0;
  });
  readonly importing = computed(() => {
    const step = this._step();
    return step === 'reading' || step === 'converting' || step === 'structuring' || step === 'saving';
  });

  async load(): Promise<void> {
    const [headers, active] = await Promise.all([
      this.repo.listHeaders(),
      this.repo.getActive(),
    ]);
    this._headers.set(headers);
    this._active.set(active);
    this._loaded.set(true);
  }

  async selectRoutine(routineId: number): Promise<void> {
    await this.repo.setActive(routineId);
    await this.load();
  }

  /**
   * The whole import: file → Markdown → structured routine → rows. The
   * Markdown only ever exists as a local here; it is never stored.
   */
  async importFromFile(file: File): Promise<void> {
    this._step.set('reading');
    this._failedStep.set('idle');
    this._error.set('');
    this._summary.set(null);
    const context = { lang: this.language.lang() };

    try {
      this._step.set(this.docs.needsAi(file) ? 'converting' : 'reading');
      const markdown = await this.docs.toMarkdown(file, context);

      this._step.set('structuring');
      const parsed = await this.ai.parseRoutine(markdown, context);

      this._step.set('saving');
      const routine = this.toRoutine(parsed);
      const routineId = await this.repo.add(routine);
      await this.repo.setActive(routineId);
      await this.load();

      this._summary.set({
        name: routine.name,
        days: routine.days.length,
        exercises: countExercises(routine),
      });
      this._step.set('done');
      void this.haptics.success();
    } catch (err) {
      this._failedStep.set(this._step());
      this._error.set(this.describeError(err));
      this._step.set('error');
      void this.haptics.warning();
    }
  }

  /** Reset the import state when the modal closes. */
  resetImport(): void {
    this._step.set('idle');
    this._failedStep.set('idle');
    this._error.set('');
    this._summary.set(null);
  }

  /** Create an empty routine with one day, for building one by hand. */
  async createEmpty(name: string): Promise<number> {
    const now = new Date().toISOString();
    const routineId = await this.repo.add({
      name,
      source: 'manual',
      is_active: true,
      created_at: now,
      updated_at: now,
      days: [
        {
          name: this.tr.translate('deporte.editor.firstDay'),
          notes: '',
          position: 0,
          exercises: [],
        },
      ],
    });
    await this.repo.setActive(routineId);
    await this.load();
    return routineId;
  }

  async renameRoutine(routineId: number, name: string): Promise<void> {
    await this.repo.rename(routineId, name);
    await this.load();
  }

  async removeRoutine(routineId: number): Promise<void> {
    await this.repo.deleteRoutine(routineId);
    await this.load();
  }

  async addDay(routineId: number, name: string): Promise<void> {
    await this.repo.addDay(routineId, name);
    await this.load();
  }

  async renameDay(dayId: number, name: string): Promise<void> {
    await this.repo.renameDay(dayId, name);
    await this.load();
  }

  async removeDay(dayId: number): Promise<void> {
    await this.repo.deleteDay(dayId);
    await this.load();
  }

  async addExercise(dayId: number, ex: PlannedExerciseDraft): Promise<void> {
    await this.repo.addExercise(dayId, ex);
    await this.load();
  }

  /**
   * `syncHistoryName` also rewrites the name on already-logged sets. Default it
   * to true in the UI: a rename almost always means "same exercise, better
   * name", and without it the exercise's chart series splits in two.
   */
  async updateExercise(
    ex: PlannedExercise,
    syncHistoryName: boolean,
  ): Promise<void> {
    await this.repo.updateExercise(ex, syncHistoryName);
    await this.load();
  }

  async removeExercise(exerciseId: number): Promise<void> {
    await this.repo.deleteExercise(exerciseId);
    await this.load();
  }

  /** Whether an exercise has logged sets, so the UI can warn before deleting. */
  exerciseHasHistory(exerciseId: number): Promise<boolean> {
    return this.repo.countSetsFor(exerciseId).then((n) => n > 0);
  }

  /** Map an error to a translated message (the ChatFacade.errorText pattern). */
  describeError(err: unknown): string {
    if (err instanceof TrainingFileError) {
      switch (err.kind) {
        case 'unsupported':
          return this.tr.translate('deporteMsg.fileUnsupported');
        case 'too-large':
          return this.tr.translate('deporteMsg.fileTooLarge', { mb: MAX_FILE_MB });
        case 'empty':
          return this.tr.translate('deporteMsg.fileEmpty');
        case 'not-a-routine':
          return this.tr.translate('deporteMsg.notARoutine');
        default:
          return this.tr.translate('deporteMsg.fileUnreadable');
      }
    }
    if (err instanceof AiError) {
      switch (err.kind) {
        // The generic aiError.noKey text talks about meals, so this one case
        // gets its own key; the rest are domain-neutral and reused as-is.
        case 'no-key':
          return this.tr.translate('deporteMsg.noKey');
        case 'auth':
          return this.tr.translate('aiError.auth');
        case 'rate-limit':
          return this.tr.translate('aiError.rateLimit');
        case 'network':
          return this.tr.translate('aiError.network');
        default:
          return this.tr.translate('deporteMsg.parseFail');
      }
    }
    return this.tr.translate('aiError.unexpected');
  }

  /** Parsed AI output → the shape the repository persists. */
  private toRoutine(parsed: ParsedRoutine): Omit<Routine, 'id'> {
    const now = new Date().toISOString();
    return {
      name: parsed.name.trim() || this.tr.translate('deporte.defaultName'),
      source: 'ai',
      is_active: true,
      created_at: now,
      updated_at: now,
      days: parsed.days.map((day, dayIndex) => ({
        name: day.name.trim() || `${this.tr.translate('deporte.day')} ${dayIndex + 1}`,
        notes: day.notes,
        position: dayIndex,
        exercises: this.dedupe(day.exercises).map((ex, i) => ({
          name: ex.name.trim(),
          exercise_key: normalizeExerciseKey(ex.name),
          muscle_group: ex.muscle_group,
          unit: ex.unit,
          target_sets: ex.target_sets,
          target_reps: ex.target_reps,
          target_weight_kg: ex.target_weight_kg,
          target_seconds: ex.target_seconds,
          target_distance_m: ex.target_distance_m,
          rest_seconds: ex.rest_seconds,
          notes: ex.notes,
          position: i,
        })),
      })),
    };
  }

  /** Merge exercises repeated within one day, adding their sets together. */
  private dedupe(
    exercises: ParsedRoutine['days'][number]['exercises'],
  ): ParsedRoutine['days'][number]['exercises'] {
    const byKey = new Map<string, ParsedRoutine['days'][number]['exercises'][number]>();
    for (const ex of exercises) {
      const key = normalizeExerciseKey(ex.name);
      const seen = byKey.get(key);
      if (seen) {
        seen.target_sets += ex.target_sets;
      } else {
        byKey.set(key, { ...ex });
      }
    }
    return [...byKey.values()];
  }
}
