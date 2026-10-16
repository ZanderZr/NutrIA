/**
 * Versioned schema. Add a new object with an incremented `toVersion` to evolve
 * the DB without breaking existing data (see plan §4). The upgrade statements run
 * in order for any device below the target version.
 */
/**
 * SQLite database filename. Deliberately keeps the pre-rename value: it is the
 * physical file/IndexedDB store name, so changing it would make every existing
 * install start from an empty database. Not user-visible.
 */
export const DB_NAME = 'nutricontrol';

export const SCHEMA_UPGRADES = [
  {
    toVersion: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sex TEXT NOT NULL,
        age INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        height_cm REAL NOT NULL,
        activity_level TEXT NOT NULL,
        goal TEXT NOT NULL,
        target_calories INTEGER NOT NULL,
        target_protein_g INTEGER NOT NULL,
        target_fat_g INTEGER NOT NULL,
        target_carbs_g INTEGER NOT NULL,
        targets_overridden INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS meals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        logged_at TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        total_calories INTEGER NOT NULL DEFAULT 0,
        total_protein_g REAL NOT NULL DEFAULT 0,
        total_fat_g REAL NOT NULL DEFAULT 0,
        total_carbs_g REAL NOT NULL DEFAULT 0
      );`,
      `CREATE TABLE IF NOT EXISTS meal_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity_g REAL NOT NULL DEFAULT 0,
        calories INTEGER NOT NULL DEFAULT 0,
        protein_g REAL NOT NULL DEFAULT 0,
        fat_g REAL NOT NULL DEFAULT 0,
        carbs_g REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 1,
        FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);`,
      `CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);`,
    ],
  },
  {
    toVersion: 2,
    statements: [
      `ALTER TABLE meal_items ADD COLUMN fiber_g REAL NOT NULL DEFAULT 0;`,
      `ALTER TABLE meals ADD COLUMN total_fiber_g REAL NOT NULL DEFAULT 0;`,
    ],
  },
  {
    toVersion: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        total_calories INTEGER NOT NULL DEFAULT 0,
        total_protein_g REAL NOT NULL DEFAULT 0,
        total_fat_g REAL NOT NULL DEFAULT 0,
        total_carbs_g REAL NOT NULL DEFAULT 0,
        total_fiber_g REAL NOT NULL DEFAULT 0
      );`,
      `CREATE TABLE IF NOT EXISTS favorite_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        favorite_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity_g REAL NOT NULL DEFAULT 0,
        calories INTEGER NOT NULL DEFAULT 0,
        protein_g REAL NOT NULL DEFAULT 0,
        fat_g REAL NOT NULL DEFAULT 0,
        carbs_g REAL NOT NULL DEFAULT 0,
        fiber_g REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 1,
        FOREIGN KEY (favorite_id) REFERENCES favorites(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_favorite_items_fav ON favorite_items(favorite_id);`,
    ],
  },
  {
    toVersion: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS weight_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        weight_kg REAL NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_weight_logs_date ON weight_logs(date);`,
    ],
  },
  {
    toVersion: 5,
    statements: [
      `ALTER TABLE user_profile ADD COLUMN objective TEXT NOT NULL DEFAULT 'maintain';`,
      `ALTER TABLE user_profile ADD COLUMN pace TEXT NOT NULL DEFAULT 'moderate';`,
      `ALTER TABLE user_profile ADD COLUMN target_weight_kg REAL;`,
      `UPDATE user_profile SET objective = CASE goal
         WHEN 'fat_loss' THEN 'lose_fat'
         WHEN 'muscle_gain' THEN 'gain_muscle'
         ELSE 'maintain' END;`,
    ],
  },
  {
    toVersion: 6,
    statements: [
      `ALTER TABLE user_profile ADD COLUMN daily_activity TEXT NOT NULL DEFAULT 'light';`,
      `ALTER TABLE user_profile ADD COLUMN training_freq TEXT NOT NULL DEFAULT 'mid';`,
      // Approximate backfill from the old single-axis activity_level.
      `UPDATE user_profile SET daily_activity = CASE activity_level
         WHEN 'sedentary' THEN 'desk'
         WHEN 'physical' THEN 'physical'
         WHEN 'very_active' THEN 'physical'
         ELSE 'light' END;`,
      `UPDATE user_profile SET training_freq = CASE activity_level
         WHEN 'sedentary' THEN 'none'
         WHEN 'light' THEN 'low'
         WHEN 'moderate' THEN 'mid'
         WHEN 'active' THEN 'high'
         WHEN 'very_active' THEN 'high'
         ELSE 'mid' END;`,
    ],
  },
  {
    toVersion: 7,
    statements: [
      `ALTER TABLE user_profile ADD COLUMN training_days INTEGER NOT NULL DEFAULT 3;`,
      `ALTER TABLE user_profile ADD COLUMN training_minutes INTEGER NOT NULL DEFAULT 45;`,
      // Turn the old frequency bucket into a representative exact day count.
      `UPDATE user_profile SET training_days = CASE training_freq
         WHEN 'none' THEN 0
         WHEN 'low' THEN 2
         WHEN 'mid' THEN 3
         WHEN 'high' THEN 5
         WHEN 'daily' THEN 7
         ELSE 3 END;`,
    ],
  },
  {
    toVersion: 8,
    statements: [
      `CREATE TABLE IF NOT EXISTS water_logs (
        date TEXT PRIMARY KEY,
        ml INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );`,
    ],
  },
  {
    toVersion: 9,
    statements: [
      `CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlocked_at TEXT NOT NULL
      );`,
    ],
  },
  {
    toVersion: 10,
    statements: [
      `ALTER TABLE meal_items ADD COLUMN sugar_g REAL NOT NULL DEFAULT 0;`,
      `ALTER TABLE meal_items ADD COLUMN sat_fat_g REAL NOT NULL DEFAULT 0;`,
      `ALTER TABLE meal_items ADD COLUMN sodium_mg REAL NOT NULL DEFAULT 0;`,
      `ALTER TABLE meals ADD COLUMN total_sugar_g REAL NOT NULL DEFAULT 0;`,
      `ALTER TABLE meals ADD COLUMN total_sat_fat_g REAL NOT NULL DEFAULT 0;`,
      `ALTER TABLE meals ADD COLUMN total_sodium_mg REAL NOT NULL DEFAULT 0;`,
    ],
  },
  {
    toVersion: 11,
    statements: [
      // Training: a routine (program) holds ordered days, each day ordered
      // exercises. Sessions and sets are the performed log, kept separate from
      // the plan so editing the routine never rewrites history.
      `CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS routine_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routine_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_routine_days_routine ON routine_days(routine_id);`,
      // target_reps is TEXT on purpose: real routines say "8-12", "AMRAP",
      // "al fallo". archived_at soft-deletes an exercise that already has
      // logged sets, so its chart history survives.
      `CREATE TABLE IF NOT EXISTS routine_exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routine_day_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        exercise_key TEXT NOT NULL,
        muscle_group TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT 'kg',
        target_sets INTEGER NOT NULL DEFAULT 3,
        target_reps TEXT NOT NULL DEFAULT '',
        target_weight_kg REAL NOT NULL DEFAULT 0,
        target_seconds INTEGER NOT NULL DEFAULT 0,
        target_distance_m REAL NOT NULL DEFAULT 0,
        rest_seconds INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        FOREIGN KEY (routine_day_id) REFERENCES routine_days(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_routine_exercises_day ON routine_exercises(routine_day_id);`,
      // day_name is a denormalised snapshot so a session stays readable after
      // the routine it came from is renamed or deleted.
      `CREATE TABLE IF NOT EXISTS workout_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routine_id INTEGER,
        routine_day_id INTEGER,
        day_name TEXT NOT NULL,
        date TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        notes TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE SET NULL,
        FOREIGN KEY (routine_day_id) REFERENCES routine_days(id) ON DELETE SET NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(date);`,
      `CREATE TABLE IF NOT EXISTS workout_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        routine_exercise_id INTEGER,
        exercise_name TEXT NOT NULL,
        exercise_key TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        set_index INTEGER NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 0,
        weight_kg REAL NOT NULL DEFAULT 0,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        distance_m REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (routine_exercise_id) REFERENCES routine_exercises(id) ON DELETE SET NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_workout_sets_session ON workout_sets(session_id);`,
      `CREATE INDEX IF NOT EXISTS idx_workout_sets_key ON workout_sets(exercise_key);`,
    ],
  },
];

/** Latest schema version = highest declared upgrade. */
export const DB_VERSION = SCHEMA_UPGRADES.reduce(
  (max, u) => Math.max(max, u.toVersion),
  1,
);
