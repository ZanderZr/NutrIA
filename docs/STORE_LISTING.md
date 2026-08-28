# Ficha de Google Play — NutrIA

Textos listos para pegar en Play Console. Respetan los límites de caracteres.
Hay versión en **español** e **inglés** (la app es bilingüe).

---

## 🇪🇸 Español

### Título (máx. 30)
```
NutrIA: Nutrición con IA
```
*(24/30. Alternativas: `NutrIA · Tu nutrición con IA` = 28, `NutrIA · Nutrición IA` = 21)*

### Descripción corta (máx. 80)
```
Registra lo que comes escribiéndolo. La IA calcula tus calorías y macros.
```
*(73 caracteres)*

### Descripción completa (máx. 4000)
```
Controlar tu alimentación nunca fue tan fácil. Escribe lo que has comido con tus propias palabras —"dos huevos, una tostada con aguacate y un café con leche"— y la inteligencia artificial se encarga del resto: calcula las calorías, la proteína, los hidratos y las grasas por ti.

Sin menús interminables ni buscar cada alimento en una base de datos. Hablas, y NutrIA lo entiende.

▸ REGISTRO POR CHAT CON IA
Describe tu comida en lenguaje natural y obtén sus valores al instante. También puedes hacer una foto del plato o escanear un código de barras.

▸ TUS OBJETIVOS, CALCULADOS PARA TI
Introduce tu peso, altura y meta, y NutrIA calcula tus calorías y macros diarios. Además, ajusta tu objetivo de forma inteligente según tu peso real semana a semana.

▸ TODO EN UNA PANTALLA
Anillos de macros, calorías restantes del día, agua, tu racha de constancia y un resumen semanal de tu progreso.

▸ TU PESO Y TU EVOLUCIÓN
Registra tu peso y sigue tu evolución con una gráfica clara y una estimación de cuándo llegarás a tu meta.

▸ 100% PRIVADO Y SIN CUENTAS
No hay registro ni inicio de sesión. Todos tus datos se guardan ÚNICAMENTE en tu móvil. Sin servidores, sin publicidad, sin rastreadores. Puedes exportar una copia de seguridad cuando quieras.

▸ GRATIS
NutrIA usa tu propia clave gratuita de Google Gemini (se crea en 1 minuto, sin tarjeta). Sin suscripciones ni límites.

▸ EN ESPAÑOL E INGLÉS
Elige tu idioma al abrir la app y cámbialo cuando quieras.

IMPORTANTE: para usar la IA necesitas una clave gratuita de Google AI Studio. La app te guía paso a paso para conseguirla en menos de un minuto.

Aviso: NutrIA es una herramienta de apoyo. Las estimaciones son aproximadas y no sustituyen el consejo de un profesional de la salud.
```

---

## 🇬🇧 English

### Title (max 30)
```
NutrIA: AI Nutrition
```
*(20 characters)*

### Short description (max 80)
```
Log what you eat by typing it. AI works out your calories and macros.
```
*(69 characters)*

### Full description (max 4000)
```
Tracking your food has never been this easy. Type what you ate in your own words —"two eggs, avocado toast and a latte"— and AI does the rest: it works out the calories, protein, carbs and fat for you.

No endless menus, no searching every food in a database. You speak, NutrIA understands.

▸ AI CHAT LOGGING
Describe your meal in plain language and get its values instantly. You can also take a photo of your plate or scan a barcode.

▸ YOUR GOALS, CALCULATED FOR YOU
Enter your weight, height and goal, and NutrIA works out your daily calories and macros. It even adjusts your target intelligently based on your real weight, week by week.

▸ EVERYTHING ON ONE SCREEN
Macro rings, calories left for the day, water, your logging streak and a weekly summary of your progress.

▸ YOUR WEIGHT AND TREND
Log your weight and follow your progress with a clear chart and an estimate of when you'll reach your goal.

▸ 100% PRIVATE, NO ACCOUNTS
No sign-up, no login. All your data is stored ONLY on your phone. No servers, no ads, no trackers. You can export a backup whenever you want.

▸ FREE
NutrIA uses your own free Google Gemini key (created in 1 minute, no card required). No subscriptions, no limits.

▸ ENGLISH AND SPANISH
Pick your language when you open the app and switch it anytime.

IMPORTANT: to use the AI you need a free key from Google AI Studio. The app walks you through getting one in under a minute.

Disclaimer: NutrIA is a support tool. Estimates are approximate and are not a substitute for professional medical advice.
```

---

## Notas para Play Console

- **Categoría:** Salud y bienestar.
- **Formulario "Seguridad de los datos":** marca que **no se recopilan ni comparten** datos con terceros por tu parte. Menciona que el texto/foto que el usuario envía va a Google Gemini **con la clave del propio usuario** (según la política de Google), y que la app no tiene servidores propios. Enlaza tu política de privacidad (ver `docs/PRIVACY.md`, hospédala en una URL pública).
- **Contenido:** apto para todos los públicos (PEGI 3).
- **Capturas:** mínimo 2 (recomendado 4-8). Usa las de la guía del README, en modo oscuro. Añade el gráfico de cabecera (1024×500) y el icono (512×512).
- **Anuncios:** No.

---

## Generar el build firmado (lo haces tú)

```bash
# 1. Crear un keystore (una sola vez — GUÁRDALO, sin él no puedes actualizar la app)
keytool -genkey -v -keystore nutria.keystore -alias nutria \
  -keyalg RSA -keysize 2048 -validity 10000

# 2. Configurar la firma en android/app/build.gradle (signingConfigs) o vía
#    android/keystore.properties + gradle. (Guía oficial de Capacitor/Android.)

# 3. Generar el App Bundle (.aab) para subir a Play Console
npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
#    → android/app/build/outputs/bundle/release/app-release.aab
```

Si quieres, te preparo el `signingConfigs` en `build.gradle` y un
`keystore.properties` de ejemplo para que solo tengas que meter tu keystore.
