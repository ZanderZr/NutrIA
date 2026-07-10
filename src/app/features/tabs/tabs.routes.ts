import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const TABS_ROUTES: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'chat',
        loadComponent: () =>
          import('@features/chat/chat.page').then((m) => m.ChatPage),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@features/dashboard/dashboard.page').then(
            (m) => m.DashboardPage,
          ),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('@features/history/history.page').then((m) => m.HistoryPage),
      },
      {
        path: 'stats',
        loadComponent: () =>
          import('@features/stats/stats.page').then((m) => m.StatsPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('@features/settings/settings.page').then(
            (m) => m.SettingsPage,
          ),
      },
      { path: '', redirectTo: 'chat', pathMatch: 'full' },
    ],
  },
];
