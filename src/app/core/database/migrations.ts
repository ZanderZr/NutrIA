/**
 * Versioned schema. Add a new object with an incremented `toVersion` to evolve
 * the DB without breaking existing data (see plan §4). The upgrade statements run
 * in order for any device below the target version.
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
];

/** Latest schema version = highest declared upgrade. */
export const DB_VERSION = SCHEMA_UPGRADES.reduce(
  (max, u) => Math.max(max, u.toVersion),
  1,
);
