import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { HapticsService } from '@core/haptics/haptics.service';
import { WorkoutRepository } from '@data/repositories/workout.repository';
import {
  ExerciseMetric,
  ExercisePoint,
  ExerciseUnit,
  PlannedExercise,
  RoutineDay,
  SessionTotals,
  WorkoutSession,
  WorkoutSet,
  bestSet,
  computeSessionTotals,
  isMeaningfulSet,
  prefillSets,
  suggestedFrom,
} from '@domain/models/training.model';
import { friendlyDate, toLocalDateKey } from '@shared/utils/date.util';

/** One exercise's rows inside the draft, with their index into it. */
export interface DraftGroup {
  key: string;
  name: string;
  unit: ExerciseUnit;
  planned: PlannedExercise | null;
  rows: { index: number; set: WorkoutSet }[];
}

/**
 * Owns the workout log: the session currently being filled in, the recent
 * session list and the per-exercise chart series.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutFacade {
  private repo = inject(WorkoutRepository);
  private haptics = inject(HapticsService);
  private tr = inject(TranslocoService);

  private readonly _sessions = signal<WorkoutSession[]>([]);
  private readonly _lastDates = signal<Map<number, string>>(new Map());
  private readonly _loaded = signal(false);

  /** The session being edited, or null while logging a brand new one. */
  private readonly _session = signal<WorkoutSession | null>(null);
  private readonly _day = signal<RoutineDay | null>(null);
  private readonly _date = signal(toLocalDateKey());
  private readonly _draft = signal<WorkoutSet[]>([]);
  private readonly _previous = signal<Map<string, { date: string; sets: WorkoutSet[] }>>(
    new Map(),
  );
  private readonly _saving = signal(false);

  readonly sessions = this._sessions.asReadonly();
  readonly lastDates = this._lastDates.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly session = this._session.asReadonly();
  readonly day = this._day.asReadonly();
  readonly date = this._date.asReadonly();
  readonly draft = this._draft.asReadonly();
  readonly saving = this._saving.asReadonly();

  readonly totals = computed<SessionTotals>(() =>
    computeSessionTotals(this._draft().filter(isMeaningfulSet)),
  );

  /** The draft grouped per exercise, in the order the rows appear. */
  readonly groups = computed<DraftGroup[]>(() => {
    const planned = new Map(
      (this._day()?.exercises ?? []).map((ex) => [ex.exercise_key, ex]),
    );
    const groups: DraftGroup[] = [];
    const byKey = new Map<string, DraftGroup>();
    this._draft().forEach((set, index) => {
      let group = byKey.get(set.exercise_key);
      if (!group) {
        group = {
          key: set.exercise_key,
          name: set.exercise_name,
          unit: set.unit,
          planned: planned.get(set.exercise_key) ?? null,
          rows: [],
        };
        byKey.set(set.exercise_key, group);
        groups.push(group);
      }
      group.rows.push({ index, set });
    });
    return groups;
  });

  async load(): Promise<void> {
    const [sessions, lastDates] = await Promise.all([
      this.repo.listSessions(),
      this.repo.lastDatesByDay(),
    ]);
    this._sessions.set(sessions);
    this._lastDates.set(lastDates);
    this._loaded.set(true);
  }

  /** Start logging a routine day: one prefilled row per planned set. */
  async openForDay(day: RoutineDay, date = toLocalDateKey()): Promise<void> {
    this._session.set(null);
    this._day.set(day);
    this._date.set(date);

    const previous = new Map<string, { date: string; sets: WorkoutSet[] }>();
    const draft: WorkoutSet[] = [];
    for (const ex of day.exercises) {
      const last = await this.repo.lastPerformance(ex.exercise_key);
      if (last) previous.set(ex.exercise_key, last);
      draft.push(...prefillSets(ex, suggestedFrom(last?.sets ?? [])));
    }
    this._previous.set(previous);
    this._draft.set(draft);
  }

  /** Reopen a saved session for editing. */
  async openExisting(sessionId: number): Promise<void> {
    const session = await this.repo.getSession(sessionId);
    if (!session) return;
    this._session.set(session);
    this._day.set(null);
    this._date.set(session.date);
    this._draft.set(session.sets);

    const previous = new Map<string, { date: string; sets: WorkoutSet[] }>();
    for (const key of new Set(session.sets.map((s) => s.exercise_key))) {
      const last = await this.repo.lastPerformance(key, sessionId);
      if (last) previous.set(key, last);
    }
    this._previous.set(previous);
  }

  setDate(date: string): void {
    this._date.set(date);
  }

  setReps(index: number, value: string | number | null): void {
    this.patch(index, { reps: Math.round(this.num(value)) });
  }

  setWeight(index: number, value: string | number | null): void {
    this.patch(index, { weight_kg: this.num(value) });
  }

  setSeconds(index: number, value: string | number | null): void {
    this.patch(index, { duration_seconds: Math.round(this.num(value)) });
  }

  setDistance(index: number, value: string | number | null): void {
    this.patch(index, { distance_m: this.num(value) });
  }

  /** Append one more set to an exercise, copying the last row's load. */
  addSet(exerciseKey: string): void {
    this._draft.update((draft) => {
      const rows = draft.filter((s) => s.exercise_key === exerciseKey);
      const last = rows[rows.length - 1];
      if (!last) return draft;
      const copy: WorkoutSet = { ...last, id: undefined, set_index: rows.length, reps: 0 };
      // Keep rows of the same exercise together.
      const lastIndex = draft.lastIndexOf(last);
      return [...draft.slice(0, lastIndex + 1), copy, ...draft.slice(lastIndex + 1)];
    });
    void this.haptics.tap();
  }

  removeSet(index: number): void {
    this._draft.update((draft) => {
      const next = draft.filter((_unused, i) => i !== index);
      return this.renumber(next);
    });
    void this.haptics.tap();
  }

  /** Persist the draft. Rows the user never filled in are dropped. */
  async save(): Promise<void> {
    if (this._saving()) return;
    const sets = this.renumber(this._draft().filter(isMeaningfulSet));
    if (!sets.length) return;

    this._saving.set(true);
    try {
      const existing = this._session();
      const completedAt = new Date().toISOString();
      if (existing?.id) {
        await this.repo.saveSets(existing.id, sets, existing.notes, completedAt);
      } else {
        const day = this._day();
        await this.repo.startSession({
          routine_id: day?.routine_id ?? null,
          routine_day_id: day?.id ?? null,
          day_name: day?.name ?? this.tr.translate('deporte.session.freeTitle'),
          date: this._date(),
          started_at: new Date().toISOString(),
          completed_at: completedAt,
          notes: '',
          sets,
        });
      }
      await this.load();
      void this.haptics.success();
    } finally {
      this._saving.set(false);
    }
  }

  async removeSession(sessionId: number): Promise<void> {
    await this.repo.deleteSession(sessionId);
    await this.load();
    void this.haptics.medium();
  }

  /** "3×10 @ 60 kg · ayer", or '' when the exercise has no history. */
  lastLabel(exerciseKey: string): string {
    const last = this._previous().get(exerciseKey);
    if (!last || !last.sets.length) return '';
    const best = bestSet(last.sets);
    if (!best) return '';
    const when = friendlyDate(last.date);
    switch (best.unit) {
      case 'time':
        return `${last.sets.length}×${best.duration_seconds}s · ${when}`;
      case 'dist':
        return `${this.round(best.distance_m)} m · ${when}`;
      case 'bw':
        return `${last.sets.length}×${best.reps} · ${when}`;
      default:
        return `${last.sets.length}×${best.reps} @ ${this.round(best.weight_kg)} kg · ${when}`;
    }
  }

  /** Totals of one saved session, for the recent list. */
  sessionTotals(session: WorkoutSession): SessionTotals {
    return computeSessionTotals(session.sets);
  }

  history(exerciseKey: string): Promise<ExercisePoint[]> {
    return this.repo.exerciseHistory(exerciseKey);
  }

  loggedExercises(): Promise<{ key: string; name: string; unit: string }[]> {
    return this.repo.listLoggedExercises();
  }

  /** Axis/label unit suffix for a chart metric. */
  metricSuffix(metric: ExerciseMetric): string {
    switch (metric) {
      case 'volume':
      case 'top_weight':
      case 'one_rm':
        return 'kg';
      case 'seconds':
      case 'top_seconds':
        return 's';
      case 'distance':
        return 'm';
      default:
        return '';
    }
  }

  private patch(index: number, change: Partial<WorkoutSet>): void {
    this._draft.update((draft) =>
      draft.map((s, i) => (i === index ? { ...s, ...change } : s)),
    );
  }

  /** Keep `set_index` dense per exercise after an add or a delete. */
  private renumber(sets: WorkoutSet[]): WorkoutSet[] {
    const seen = new Map<string, number>();
    return sets.map((s) => {
      const next = seen.get(s.exercise_key) ?? 0;
      seen.set(s.exercise_key, next + 1);
      return { ...s, set_index: next };
    });
  }

  /** Tolerant number parse: ion-input hands back strings, and ',' decimals. */
  private num(value: string | number | null): number {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
    const parsed = parseFloat((value ?? '').toString().replace(',', '.'));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  private round(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
