# NutriControl

App móvil de control nutricional con IA. Registras lo que comes en lenguaje
natural (experiencia tipo chat) y la app interpreta el texto con **Gemini**,
calcula calorías y macros, guarda todo **localmente** (SQLite) y te da
recomendaciones hacia tu objetivo (pérdida de grasa / mantenimiento / ganancia).

- **Sin backend**: los datos viven en el dispositivo.
- **BYOK**: tú pones tu clave de Gemini (gratis en Google AI Studio), guardada cifrada.
- **Stack**: Angular 18 (standalone + signals) · Ionic 8 · Capacitor 6 · SQLite · Zod · Chart.js.

## Arquitectura (clean architecture pragmática)

```
Presentation (features/*, componentes Ionic)
   → Application (core/state/*  facades con signals)
      → Domain (domain/*  cálculo nutricional puro)
         → Data/Infra (data/repositories · core/database · core/ai)
```

Carpetas clave en `src/app/`:

| Carpeta | Rol |
|---|---|
| `domain/` | Modelos + reglas puras (`nutrition-calculator`, `goal.strategy`). Sin Angular. |
| `data/` | `MealRepository`, `ProfileRepository` (patrón Repository) + mappers. |
| `core/database/` | `DatabaseService` + migraciones versionadas. |
| `core/ai/` | Puerto `AiNutritionPort`, `GeminiNutritionAdapter`, `MockNutritionAdapter`, prompts, validador Zod. |
| `core/config/` | `SecureConfigService` (clave API en secure storage). |
| `core/state/` | Facades: `ProfileFacade`, `DashboardFacade`, `ChatFacade`. |
| `core/guards/` | `onboardingGuard`. |
| `shared/` | Componentes (`macro-ring`, `nutrient-bar`), utilidades de fecha. |
| `features/` | `onboarding`, `chat`, `dashboard`, `history`, `stats`, `settings`, `tabs`. |

## Scripts

```bash
npm install            # instalar dependencias
npm start              # ionic/ng serve en web (http://localhost:4200)
npm run test:ci        # tests unitarios de dominio + validador (headless)
npm run build          # build de producción a /www
npm run cap:android    # build + sync + abrir Android Studio
npm run cap:ios        # build + sync + abrir Xcode
```

> En web, SQLite corre sobre `jeep-sqlite` (IndexedDB) para poder desarrollar el
> flujo completo sin dispositivo.

## Desarrollo sin gastar tokens

Para probar el pipeline (parse → persistir → dashboard) sin llamar a Gemini,
cambia el binding del puerto en `src/main.ts`:

```ts
// import { GeminiNutritionAdapter } from './app/core/ai/gemini-nutrition.adapter';
import { MockNutritionAdapter } from './app/core/ai/mock-nutrition.adapter';
{ provide: AI_NUTRITION_PORT, useClass: MockNutritionAdapter },
```

## Integración con IA

- Salida JSON garantizada con `responseSchema` de Gemini + validación **Zod**
  (`core/ai/ai-response.validator.ts`), con un reintento correctivo.
- Llamadas *stateless*: el chat es UX; a la IA solo se envían el mensaje actual y
  números compactos de contexto (objetivo/consumido/restante) para minimizar tokens.
- Modelo por defecto: `gemini-flash-lite-latest` (configurable en `environments/`).

## Cómo conseguir la clave de Gemini

1. Entra en https://aistudio.google.com/app/apikey
2. Crea una API key (gratis).
3. Pégala en el onboarding o en **Ajustes → IA**.

## Añadir plataformas nativas

```bash
npm i @capacitor/android @capacitor/ios   # ya en package.json
npx cap add android
npx cap add ios
npm run cap:android
```

## Escáner de código de barras

- Búsqueda de macros: **Open Food Facts** (gratis, sin clave) —
  [open-food-facts.adapter.ts](src/app/core/food/open-food-facts.adapter.ts).
- Cámara: **@capacitor-mlkit/barcode-scanning** (ML Kit) —
  [barcode-scanner.service.ts](src/app/core/food/barcode-scanner.service.ts).
  Solo nativo; en web el botón de cámara se oculta y se busca escribiendo el código.

Config nativa requerida (tras `cap add`):
- **iOS** — añade a `ios/App/App/Info.plist`:
  `NSCameraUsageDescription` = "Para escanear códigos de barras de alimentos".
- **Android** — el plugin declara el permiso de cámara; el escáner usa el módulo
  de Google Code Scanner (Play Services), que la app instala bajo demanda la
  primera vez (`installGoogleBarcodeScannerModule`).

## Escalabilidad prevista

Foto de platos / código de barras (nuevos adaptadores del puerto), favoritos y
recetas (tablas vía migración), Google Fit / Apple Health, exportación de datos y
sincronización opcional — todo encaja sin refactor mayor gracias a los puertos y
repositorios.
