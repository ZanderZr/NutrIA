# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NutrIA — local-first nutrition tracker (Angular 18 standalone + signals, Ionic 8, Capacitor 6). The user types a meal in natural language, Gemini parses it into structured items, everything is stored in on-device SQLite. No backend, no accounts, BYOK (each user supplies their own Gemini key).

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

## Architecture

Hexagonal-ish layering. Dependencies point **downward only**; nothing in `domain/` imports Angular.

```
features/*     Ionic standalone pages/components  → inject facades only
core/state/*   Facades: signal-based app state    → repositories + domain + AI port
domain/*       Pure rules & models (no Angular, no I/O) — the heavily-tested layer
data/*         Repositories + row↔model mappers over SQLite
core/*         Infrastructure: database, ai, food, backup, notifications, config, i18n, theme
```

Path aliases (`tsconfig.json`): `@core/*`, `@domain/*`, `@data/*`, `@shared/*`, `@features/*`. Use them instead of deep relative imports (`../../..`); relative imports are only used for siblings inside the same folder.

### Ports and adapters

Two external dependencies are behind `InjectionToken` ports, bound in [main.ts](src/main.ts):

- `AI_NUTRITION_PORT` → `GeminiNutritionAdapter` ([ai-nutrition.port.ts](src/app/core/ai/ai-nutrition.port.ts)). Swap to `MockNutritionAdapter` in `main.ts` to exercise the whole pipeline offline with no API key and no token spend — this is the intended dev/demo mode.
- `BARCODE_FOOD_PORT` → `OpenFoodFactsAdapter`.

Anything touching AI must go through the port interface, never call Gemini directly.

### AI call contract

[gemini-nutrition.adapter.ts](src/app/core/ai/gemini-nutrition.adapter.ts) is the only place that talks HTTP to Gemini. Every call: system prompt + `responseSchema` (guaranteed JSON shape) → Zod validation in [ai-response.validator.ts](src/app/core/ai/ai-response.validator.ts) → one corrective retry on `ZodError` → typed `AiError`. Failures are always an `AiError` with `kind: 'no-key' | 'auth' | 'rate-limit' | 'network' | 'invalid-response' | 'unknown'`; `ChatFacade.errorText()` maps each kind to a translated message. Requests are aborted after 30 s via `AbortController`.

When adding an AI capability: add the method to the port, add prompt + response schema in [prompts/nutrition.prompts.ts](src/app/core/ai/prompts/nutrition.prompts.ts), add a Zod validator, then implement it in *both* adapters (mock included) so offline mode keeps working.

AI calls are **stateless** — the chat log is UI-only state and is never sent back to the model. `ChatFacade` stitches context manually (see `pendingFood` / `asQuantity`, which re-attaches a bare "150 g" reply to the food it belongs to).

### Database and migrations

[database.service.ts](src/app/core/database/database.service.ts) owns the single connection, boots `jeep-sqlite` on web (IndexedDB) and calls `saveToStore` after every write. `init()` is idempotent; repositories `await this.db.init()` implicitly through `query`/`run`/`transaction`.

Schema changes: **append a new `{ toVersion: N+1, statements: [...] }` block to `SCHEMA_UPGRADES`** in [migrations.ts](src/app/core/database/migrations.ts). Never edit an existing block — installed devices have already run it. `DB_VERSION` is derived from the highest `toVersion`. Backfill new columns with `ALTER TABLE ... DEFAULT` plus an `UPDATE` that derives values from old columns (see versions 5–7 for the pattern). Adding a persisted field usually also means: migration → mapper → repository insert/update columns → `BackupData` shape in [backup.service.ts](src/app/core/backup/backup.service.ts).

Meal totals are **derived, not supplied**: `MealRepository.add()` recomputes them with `computeMealTotals(items)`, so callers pass `total_*: 0` and only the items matter.

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

Karma + Jasmine, no TestBed for the domain layer — specs import pure functions and assert directly ([streak.spec.ts](src/app/domain/insights/streak.spec.ts) is representative). Coverage is deliberately concentrated in `domain/` (nutrition calculator, adaptive TDEE, streak, insights, achievements) and `core/ai/ai-response.validator.spec.ts`. New domain rules and new Zod validators should come with specs; pages and facades are not unit-tested.
