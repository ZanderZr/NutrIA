import {
  ExerciseUnit,
  PlannedExercise,
  WorkoutSet,
  bestEstimatedOneRm,
  bestSet,
  computeSessionTotals,
  countExercises,
  estimateOneRm,
  isMeaningfulSet,
  metricsFor,
  metricValue,
  normalizeExerciseKey,
  prefillSets,
  reindexPositions,
  setVolume,
  suggestedFrom,
} from './training.model';

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    exercise_name: 'Press banca',
    exercise_key: 'press banca',
    unit: 'kg',
    set_index: 0,
    reps: 0,
    weight_kg: 0,
    duration_seconds: 0,
    distance_m: 0,
    ...over,
  };
}

function planned(over: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    name: 'Press banca',
    exercise_key: 'press banca',
    muscle_group: 'pecho',
    unit: 'kg',
    target_sets: 3,
    target_reps: '8-12',
    target_weight_kg: 0,
    target_seconds: 0,
    target_distance_m: 0,
    rest_seconds: 90,
    notes: '',
    position: 0,
    ...over,
  };
}

describe('normalizeExerciseKey', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeExerciseKey('  Press   Militar ')).toBe('press militar');
  });

  it('strips accents so renames and typos still group together', () => {
    expect(normalizeExerciseKey('Dominádas')).toBe(normalizeExerciseKey('dominadas'));
    expect(normalizeExerciseKey('Elevación lateral')).toBe('elevacion lateral');
  });
});

describe('computeSessionTotals', () => {
  it('sums sets, reps, volume, seconds and distance', () => {
    const totals = computeSessionTotals([
      set({ reps: 10, weight_kg: 60 }),
      set({ reps: 8, weight_kg: 65, set_index: 1 }),
      set({ unit: 'time', duration_seconds: 60, set_index: 2 }),
      set({ unit: 'dist', distance_m: 2000, duration_seconds: 600, set_index: 3 }),
    ]);
    expect(totals.total_sets).toBe(4);
    expect(totals.total_reps).toBe(18);
    expect(totals.total_volume_kg).toBe(1120);
    expect(totals.total_seconds).toBe(660);
    expect(totals.total_distance_m).toBe(2000);
  });

  it('is all zeros for an empty session', () => {
    const totals = computeSessionTotals([]);
    expect(totals.total_sets).toBe(0);
    expect(totals.total_volume_kg).toBe(0);
    expect(totals.total_distance_m).toBe(0);
  });

  it('rounds volume to one decimal', () => {
    const totals = computeSessionTotals([set({ reps: 3, weight_kg: 20.555 })]);
    expect(totals.total_volume_kg).toBe(61.7);
  });
});

describe('setVolume', () => {
  it('multiplies reps by weight', () => {
    expect(setVolume(set({ reps: 5, weight_kg: 40 }))).toBe(200);
  });

  it('is zero for a bodyweight set with no added load', () => {
    expect(setVolume(set({ unit: 'bw', reps: 12 }))).toBe(0);
  });
});

describe('isMeaningfulSet', () => {
  it('drops an untouched prefilled row', () => {
    expect(isMeaningfulSet(set())).toBe(false);
    expect(isMeaningfulSet(set({ unit: 'time' }))).toBe(false);
  });

  it('keeps a weighted set with only reps or only weight', () => {
    expect(isMeaningfulSet(set({ reps: 8 }))).toBe(true);
    expect(isMeaningfulSet(set({ weight_kg: 50 }))).toBe(true);
  });

  it('judges each unit by what it measures', () => {
    expect(isMeaningfulSet(set({ unit: 'bw', weight_kg: 10 }))).toBe(false);
    expect(isMeaningfulSet(set({ unit: 'bw', reps: 6 }))).toBe(true);
    expect(isMeaningfulSet(set({ unit: 'time', duration_seconds: 45 }))).toBe(true);
    expect(isMeaningfulSet(set({ unit: 'dist', distance_m: 1500 }))).toBe(true);
    expect(isMeaningfulSet(set({ unit: 'dist', duration_seconds: 900 }))).toBe(true);
  });
});

describe('bestSet', () => {
  it('returns null for no sets', () => {
    expect(bestSet([])).toBeNull();
  });

  it('picks the heaviest weighted set', () => {
    const best = bestSet([
      set({ reps: 12, weight_kg: 50 }),
      set({ reps: 6, weight_kg: 70, set_index: 1 }),
    ]);
    expect(best?.weight_kg).toBe(70);
  });

  it('breaks a weight tie on reps, keeping the first on a full tie', () => {
    expect(
      bestSet([
        set({ reps: 8, weight_kg: 60 }),
        set({ reps: 10, weight_kg: 60, set_index: 1 }),
      ])?.set_index,
    ).toBe(1);
    expect(
      bestSet([
        set({ reps: 8, weight_kg: 60 }),
        set({ reps: 8, weight_kg: 60, set_index: 1 }),
      ])?.set_index,
    ).toBe(0);
  });

  it('compares bodyweight sets by reps and timed sets by duration', () => {
    expect(
      bestSet([
        set({ unit: 'bw', reps: 8 }),
        set({ unit: 'bw', reps: 14, set_index: 1 }),
      ])?.reps,
    ).toBe(14);
    expect(
      bestSet([
        set({ unit: 'time', duration_seconds: 45 }),
        set({ unit: 'time', duration_seconds: 90, set_index: 1 }),
      ])?.duration_seconds,
    ).toBe(90);
  });
});

describe('estimateOneRm', () => {
  it('is zero when reps or weight are missing', () => {
    expect(estimateOneRm(0, 100)).toBe(0);
    expect(estimateOneRm(5, 0)).toBe(0);
    expect(estimateOneRm(-2, 80)).toBe(0);
  });

  it('is the lifted weight for a single rep', () => {
    expect(estimateOneRm(1, 100)).toBe(100);
  });

  it('applies Epley above one rep', () => {
    expect(estimateOneRm(10, 60)).toBe(80);
  });

  it('takes the best estimate across sets', () => {
    expect(
      bestEstimatedOneRm([
        set({ reps: 10, weight_kg: 60 }),
        set({ reps: 1, weight_kg: 85, set_index: 1 }),
      ]),
    ).toBe(85);
  });
});

describe('suggestedFrom', () => {
  it('returns zeros with no history', () => {
    expect(suggestedFrom([])).toEqual({
      reps: 0,
      weight_kg: 0,
      duration_seconds: 0,
      distance_m: 0,
    });
  });

  it('carries over the hardest set of the previous performance', () => {
    const s = suggestedFrom([
      set({ reps: 12, weight_kg: 50 }),
      set({ reps: 8, weight_kg: 62.5, set_index: 1 }),
    ]);
    expect(s.weight_kg).toBe(62.5);
    expect(s.reps).toBe(8);
  });
});

describe('prefillSets', () => {
  it('builds one row per target set, numbered from zero', () => {
    const rows = prefillSets(planned({ target_sets: 4 }), suggestedFrom([]));
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.set_index)).toEqual([0, 1, 2, 3]);
  });

  it('always yields at least one row and never more than twelve', () => {
    expect(prefillSets(planned({ target_sets: 0 }), suggestedFrom([])).length).toBe(1);
    expect(prefillSets(planned({ target_sets: 99 }), suggestedFrom([])).length).toBe(12);
  });

  it('prefills the suggested weight, falling back to the planned target', () => {
    const suggested = suggestedFrom([set({ reps: 8, weight_kg: 70 })]);
    expect(prefillSets(planned(), suggested)[0].weight_kg).toBe(70);
    expect(
      prefillSets(planned({ target_weight_kg: 40 }), suggestedFrom([]))[0].weight_kg,
    ).toBe(40);
  });

  it('copies the exercise identity and unit onto every row', () => {
    const rows = prefillSets(planned({ id: 7, unit: 'time' }), suggestedFrom([]));
    expect(rows[0].routine_exercise_id).toBe(7);
    expect(rows[0].exercise_key).toBe('press banca');
    expect(rows.every((r) => r.unit === 'time')).toBe(true);
  });
});

describe('metricsFor / metricValue', () => {
  it('offers weight-based series for loaded exercises only', () => {
    expect(metricsFor('kg')).toEqual(['volume', 'top_weight', 'one_rm']);
    expect(metricsFor('bw')).toEqual(['reps', 'top_reps']);
    expect(metricsFor('time')).toEqual(['seconds', 'top_seconds']);
    expect(metricsFor('dist')).toEqual(['distance', 'seconds']);
  });

  it('never offers a metric that would plot a flat zero', () => {
    const units: ExerciseUnit[] = ['kg', 'bw', 'time', 'dist'];
    for (const u of units) {
      expect(metricsFor(u).length).toBeGreaterThan(0);
    }
    expect(metricsFor('time')).not.toContain('volume');
    expect(metricsFor('bw')).not.toContain('volume');
  });

  it('reads the matching field off a point', () => {
    const point = {
      date: '2026-10-16',
      volume_kg: 1200,
      top_weight_kg: 80,
      total_reps: 30,
      top_reps: 12,
      total_seconds: 180,
      top_seconds: 90,
      total_distance_m: 5000,
      best_one_rm: 95.5,
    };
    expect(metricValue(point, 'volume')).toBe(1200);
    expect(metricValue(point, 'top_weight')).toBe(80);
    expect(metricValue(point, 'one_rm')).toBe(95.5);
    expect(metricValue(point, 'reps')).toBe(30);
    expect(metricValue(point, 'top_reps')).toBe(12);
    expect(metricValue(point, 'seconds')).toBe(180);
    expect(metricValue(point, 'top_seconds')).toBe(90);
    expect(metricValue(point, 'distance')).toBe(5000);
  });
});

describe('reindexPositions', () => {
  it('renumbers to array order without mutating the input', () => {
    const input = [{ position: 5 }, { position: 2 }, { position: 9 }];
    expect(reindexPositions(input).map((i) => i.position)).toEqual([0, 1, 2]);
    expect(input[0].position).toBe(5);
  });
});

describe('countExercises', () => {
  it('adds up the exercises of every day', () => {
    expect(
      countExercises({
        name: 'R',
        source: 'ai',
        is_active: true,
        created_at: '',
        updated_at: '',
        days: [
          { name: 'A', notes: '', position: 0, exercises: [planned(), planned()] },
          { name: 'B', notes: '', position: 1, exercises: [planned()] },
        ],
      }),
    ).toBe(3);
  });
});
