# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NutrIA — local-first nutrition tracker (Angular 18 standalone + signals, Ionic 8, Capacitor 6). The user types a meal in natural language, Gemini parses it into structured items, everything is stored in on-device SQLite. No backend, no accounts, BYOK (each user supplies their own Gemini key).

The **Deporte** tab adds training on the same model: the user uploads a routine document (PDF, photo, `.txt`/`.md`/`.csv`), it becomes Markdown (by code for text, via Gemini for PDFs and images), a second AI call structures that Markdown into routine → days → exercises, and the user then logs sets/reps/weight per session.

## Commands

```bash
npm start                 # ng serve → http://localhost:4200 (full app works on web via jeep-sqlite)
npm run build             # production build to /www
npm run test:ci           # Karma + Jasmine, headless Chrome
npm test                  # watch mode
npx ng test --include='**/streak.spec.ts' --watch=false --browsers=ChromeHeadless   # single spec
npm run cap:android       # build + cap sync android + open Android Studio
```

- `npm run lint` (`ng lint`) is **not usable**: `@angular-eslint` is not installed and there is no eslint config. Don't run it; it triggers an interactive `ng add` prompt. Type safety comes from `strict` + `strictTemplates` at build time.
- `android/` and `ios/` are gitignored and absent from a fresh clone — run `npx cap add android` (or `ios`) before `cap:android`/`cap:ios`.
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml) publishes `/www` to GitHub Pages on every push to `master`; `--base-href` is derived from the repo name, so a rename stays correct. The public demo runs the **real** Gemini adapter (BYOK) — visitors paste their own key.

## Architecture

Hexagonal-ish layering. Dependencies point **downward only**; nothing in `domain/` imports Angular.

```
features/*     Ionic standalone pages/components  → inject facades only
core/state/*   Facades: signal-based app state    → repositories + domain + AI port
domain/*       Pure rules & models (no Angular, no I/O) — the heavily-tested layer
data/*         Repositories + row↔model mappers over SQLite
core/*         Infrastructure: database, ai, food, training, backup, notifications,
               config, i18n, theme, diet, haptics, guards
```

Path aliases (`tsconfig.json`): `@core/*`, `@domain/*`, `@data/*`, `@shared/*`, `@features/*`. Use them instead of deep relative imports (`../../..`); relative imports are only used for siblings inside the same folder.

### Ports and adapters

Two external dependencies are behind `InjectionToken` ports, bound in [main.ts](src/main.ts):

- `AI_NUTRITION_PORT` → `GeminiNutritionAdapter` ([ai-nutrition.port.ts](src/app/core/ai/ai-nutrition.port.ts)). Swap to `MockNutritionAdapter` in `main.ts` to exercise the whole pipeline offline with no API key and no token spend — this is the intended dev/demo mode.
- `BARCODE_FOOD_PORT` → `OpenFoodFactsAdapter`.

Anything touching AI must go through the port interface, never call Gemini directly. `AiNutritionPort` is seven methods — `parseMeal`, `parseMealImage` (multimodal, base64 + MIME), `recommendNextMeal`, `weeklyCoach`, `verifyKey` (validates a key without spending generation quota), `documentToMarkdown` and `parseRoutine` — and both adapters implement all seven.

### AI call contract

[gemini-nutrition.adapter.ts](src/app/core/ai/gemini-nutrition.adapter.ts) is the only place that talks HTTP to Gemini. Every call: system prompt + `responseSchema` (guaranteed JSON shape) → Zod validation in [ai-response.validator.ts](src/app/core/ai/ai-response.validator.ts) → one corrective retry on `ZodError` → typed `AiError`. Failures are always an `AiError` with `kind: 'no-key' | 'auth' | 'rate-limit' | 'network' | 'invalid-response' | 'unknown'`; `ChatFacade.errorText()` maps each kind to a translated message. Requests are aborted after 30 s via `AbortController`.

When adding an AI capability: add the method to the port, add prompt + response schema in [prompts/nutrition.prompts.ts](src/app/core/ai/prompts/nutrition.prompts.ts), add a Zod validator, then implement it in *both* adapters (mock included) so offline mode keeps working.

All of that lives in one private `post(body, timeoutMs, model)`. `generate()` is `post()` + `JSON.parse`; `generateText()` is `post()` with no `responseSchema`, and is used **only** by `documentToMarkdown` — a transcribed document is returned as plain text, because making the model JSON-escape pages of newlines and table rules is the single most common way a lite model invalidates an entire response. The two training calls also pass `DOC_TIMEOUT_MS` (60 s, vs the chat's 30 s) and `documentToMarkdown` retries once on `environment.gemini.fallbackModel` if the lite model rejects the document outright; `parseRoutine` can still burn its one Zod retry, so a bad import can occupy ~3 min in the worst case.

AI calls are **stateless** — the chat log is UI-only state and is never sent back to the model. `ChatFacade` stitches context manually (see `pendingFood` / `asQuantity`, which re-attaches a bare "150 g" reply to the food it belongs to).

### Database and migrations

[database.service.ts](src/app/core/database/database.service.ts) owns the single connection, boots `jeep-sqlite` on web (IndexedDB) and calls `saveToStore` after every write. `init()` is idempotent; repositories `await this.db.init()` implicitly through `query`/`run`/`transaction`.

Schema changes: **append a new `{ toVersion: N+1, statements: [...] }` block to `SCHEMA_UPGRADES`** in [migrations.ts](src/app/core/database/migrations.ts). Never edit an existing block — installed devices have already run it. `DB_VERSION` is derived from the highest `toVersion`. Backfill new columns with `ALTER TABLE ... DEFAULT` plus an `UPDATE` that derives values from old columns (see versions 5–7 for the pattern). Adding a persisted field usually also means: migration → mapper → repository insert/update columns → `BackupData` shape in [backup.service.ts](src/app/core/backup/backup.service.ts).

Meal totals are **derived, not supplied**: `MealRepository.add()` recomputes them with `computeMealTotals(items)`, so callers pass `total_*: 0` and only the items matter. Training is the opposite: session totals are **never stored**, only computed by `computeSessionTotals(sets)`.

### Training: the plan vs the log

v11 added two independent groups of tables — `routines` → `routine_days` → `routine_exercises` (the plan) and `workout_sessions` → `workout_sets` (what was performed). Editing the plan must never rewrite history, which rests on three things that must not be "normalised away":

- **Snapshots.** `workout_sessions.day_name` and `workout_sets.exercise_name`/`exercise_key`/`unit` duplicate the plan on purpose, so a session stays readable after its routine is renamed or deleted.
- **`archived_at`.** Deleting an exercise that already has logged sets is a *soft* delete, so its chart keeps every point; only one with no sets is deleted outright (`RoutineRepository.deleteExercise` picks via `countSetsFor`).
- **Explicit FK null-out.** `deleteRoutine`/`deleteDay` run `UPDATE … SET …=NULL` inside the deleting transaction instead of trusting `ON DELETE SET NULL`, since `PRAGMA foreign_keys` may differ between the native plugin and jeep-sqlite.

`exercise_key` is a stored normalised name (`normalizeExerciseKey`) because it is the chart's `GROUP BY` key: SQLite's `LOWER()` is ASCII-only and an expression cannot use an index. Renaming an exercise therefore rewrites the key on its logged sets too, or the series would split in two.

`routine_exercises.unit` (`'kg' | 'bw' | 'time' | 'dist'`) decides which inputs the session form shows and which chart metrics `metricsFor()` offers — a plank charts seconds, not a flat-zero volume.

### Where state is persisted

Three stores, and which one a new setting belongs in is a real decision:

- **SQLite** — user data: `user_profile`, `meals`/`meal_items`, `favorites`/`favorite_items`, `weight_logs`, `water_logs`, `achievements`. Reached only through `data/repositories/`.
- **Capacitor Preferences** — device-level settings that deliberately do *not* travel with the user: theme, language, diet, reminder settings, last-backup timestamps, one-shot UI flags (`streak_celebrated`). Each owning service has its own `init()` that reads the key back on boot.
- **Secure storage** — the Gemini API key only, via `SecureConfigService` (see below).

`BackupData` covers the SQLite tables **except `achievements`**, which is intentional: `AchievementsFacade.check()` re-derives unlocks from the restored meals/weights. Import is a **full replace, not a merge** — it wipes current data first.

Training is the one replay in [backup.service.ts](src/app/core/backup/backup.service.ts) that needs **id remapping**: replaying through the repositories mints new ids, and a logged set holds a foreign key to a planned exercise. So routines go first via `addWithIdMap()`, and sessions are then remapped through the returned old→new maps (unresolvable ids become `null`, which the snapshots make harmless).

### Bootstrap and routing

[app.routes.ts](src/app/app.routes.ts) has three entries plus redirects: `onboarding` (behind `noProfileGuard`), `tabs` (behind `onboardingGuard`, lazy `TABS_ROUTES`), `legal`. A missing profile is what sends a user to onboarding — both guards in [onboarding.guard.ts](src/app/core/guards/onboarding.guard.ts) key off that.

`AppComponent.ngOnInit` is the startup sequence and its order matters: theme → language (first run opens the language picker modal before anything else renders) → `db.init()` → profile/config/dashboard in parallel → reminders + auto-backup and achievements fired off unawaited. A new root service needing `init()` is wired there, not in `main.ts`.

### Naming (post-rename invariants)

The app was renamed from NutriControl to **NutrIA**. Three identifiers deliberately keep the old value or accept it, and must not be "tidied up":

- `DB_NAME = 'nutricontrol'` — the physical SQLite file / IndexedDB store name. Renaming it would hand every existing install an empty database.
- `BackupData.app` — new exports write `'nutria'`, but `parse()` accepts `'nutricontrol'` too so pre-rename backup files still restore.
- `AutoBackupService.LEGACY_FILE` — the old auto-backup filename is still read (never written) for restore-after-reinstall.

### State (facades)

Every facade in `core/state/` follows the same shape: private `signal()` fields exposed as `.asReadonly()`, `computed()` for derived values, `async` mutators that write through a repository and then call `refresh()`. Pages inject facades and read signals directly in templates; they never touch repositories or the DB.

`DashboardFacade` owns the "active day"; `ChatFacade` calls `dashboard.refresh()` after persisting so both screens stay in sync.

### UI conventions

- Standalone components, `changeDetection: OnPush` (schematics default), SCSS, `templateUrl`/`styleUrl` in separate files.
- Ionic runs in `mode: 'ios'` with `scrollAssist`/`scrollPadding` disabled — keyboard avoidance is delegated to the Capacitor Keyboard plugin. Don't re-enable them.
- **Ionicons must be registered** in the `addIcons({...})` call in [app.component.ts](src/app/app.component.ts); an icon used in a template but missing there renders blank.
- Styling uses the design-token system in [src/theme/variables.scss](src/theme/variables.scss): semantic `--app-*`, `--sp-*`, `--r-*` custom properties, with Ionic's own variables mapped onto them. Never hardcode hex colors or pixel spacing in a component. Theming is `data-theme="light" | "dark"` on the root, absent = follow OS.
- Component styles have a 6 kB warning / 12 kB error budget.
- The app icon's master is [src/assets/icon/icon.svg](src/assets/icon/icon.svg) (an otter — the app is *NutrIA*, and *nutria* is Spanish for otter). The PNGs beside it and in `resources/` are rasterised from it, not hand-drawn: strip the `rx` on the plate for a full-bleed square (native masks apply their own corners) and render with headless Chrome. `resources/icon.png` is the 1024×1024 source `@capacitor/assets` expects once native platforms are added.

### i18n

Transloco with `es` (default) and `en` in [src/assets/i18n/](src/assets/i18n/). All user-visible strings go through translation keys — in templates via `TranslocoModule`, in facades/services via `TranslocoService.translate()`. Add every new key to **both** `es.json` and `en.json`. (The README's roadmap still lists i18n as pending; it is implemented.)

### API key handling

`SecureConfigService` resolves the key as: user-stored key (platform secure storage on native, `localStorage` on web for dev) → `environment.gemini.apiKey` → none. Keep `environment.gemini.apiKey` as `''` in commits; it exists only as a local personal-use convenience.

## Testing

Karma + Jasmine, no TestBed for the domain layer — specs import pure functions and assert directly ([streak.spec.ts](src/app/domain/insights/streak.spec.ts) is representative). Coverage is deliberately concentrated in `domain/` (nutrition calculator, adaptive TDEE, streak, weekly insights, achievements, meal/profile/training models) plus `core/ai/ai-response.validator.spec.ts` — nine spec files in total, and no others exist anywhere in `src/`.

Repository SQL has no specs (it would need a DB). When changing a migration or a non-trivial query, the cheap way to verify it is to run the real statements against `sql.js` (already a dependency) in a throwaway Node script: transpile [migrations.ts](src/app/core/database/migrations.ts) with the bundled esbuild, apply every `SCHEMA_UPGRADES` block to an in-memory DB, then exercise the queries. That is how v11's schema, the chart aggregate, the soft delete and the two delete paths were checked. New domain rules and new Zod validators should come with specs; pages and facades are not unit-tested.
