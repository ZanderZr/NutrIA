import { Routes } from '@angular/router';
import { onboardingGuard, noProfileGuard } from '@core/guards/onboarding.guard';

export const APP_ROUTES: Routes = [
  {
    path: 'onboarding',
    canActivate: [noProfileGuard],
    loadComponent: () =>
      import('@features/onboarding/onboarding.page').then(
        (m) => m.OnboardingPage,
      ),
  },
  {
    path: 'tabs',
    canActivate: [onboardingGuard],
    loadChildren: () =>
      import('@features/tabs/tabs.routes').then((m) => m.TABS_ROUTES),
  },
  { path: '', redirectTo: 'tabs/chat', pathMatch: 'full' },
  { path: '**', redirectTo: 'tabs/chat' },
];
