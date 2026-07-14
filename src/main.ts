import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { AI_NUTRITION_PORT } from './app/core/ai/ai-nutrition.port';
import { GeminiNutritionAdapter } from './app/core/ai/gemini-nutrition.adapter';
import { BARCODE_FOOD_PORT } from './app/core/food/barcode-food.port';
import { OpenFoodFactsAdapter } from './app/core/food/open-food-facts.adapter';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // scrollAssist/scrollPadding off: they inject bottom padding and auto-scroll
    // on input focus (the "page jumps up" glitch). Native keyboard avoidance is
    // handled by the Capacitor Keyboard plugin at the webview level instead.
    provideIonicAngular({ mode: 'ios', scrollAssist: false, scrollPadding: false }),
    provideRouter(APP_ROUTES, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    provideCharts(withDefaultRegisterables()),
    // Bind the AI port to the real Gemini adapter. Swap for MockNutritionAdapter in dev/tests.
    { provide: AI_NUTRITION_PORT, useClass: GeminiNutritionAdapter },
    // Barcode lookups via Open Food Facts (free, no key).
    { provide: BARCODE_FOOD_PORT, useClass: OpenFoodFactsAdapter },
  ],
}).catch((err) => console.error(err));
