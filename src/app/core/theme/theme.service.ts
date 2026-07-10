import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'app_theme_mode';

/** Theme-color meta values that match the app background per resolved theme. */
const THEME_COLOR = { light: '#f4f6f4', dark: '#0a0d0c' } as const;

/**
 * Owns the light/dark/system theme. Persists the user's choice, applies it by
 * toggling `data-theme` on <html>, keeps the browser/status-bar chrome in sync,
 * and — while in "system" mode — live-follows OS appearance changes.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** The user's preference: follows the OS, or a forced light/dark. */
  readonly mode = signal<ThemeMode>('system');
  /** The theme actually shown right now ('light' | 'dark'), after resolving "system". */
  readonly resolved = signal<'light' | 'dark'>('light');

  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    // Re-resolve whenever the OS appearance flips (only matters in "system").
    this.media.addEventListener('change', () => {
      if (this.mode() === 'system') this.apply('system');
    });
  }

  /** Load the saved preference (call once at startup) and apply it. */
  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    const mode = (value as ThemeMode) || 'system';
    this.apply(mode);
  }

  /** Change the theme and persist the choice. */
  async set(mode: ThemeMode): Promise<void> {
    this.apply(mode);
    await Preferences.set({ key: STORAGE_KEY, value: mode });
  }

  private apply(mode: ThemeMode): void {
    this.mode.set(mode);
    const resolved =
      mode === 'system' ? (this.media.matches ? 'dark' : 'light') : mode;
    this.resolved.set(resolved);

    const root = document.documentElement;
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[resolved]);
  }
}
