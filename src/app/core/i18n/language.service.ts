import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Preferences } from '@capacitor/preferences';
import { setDateLang } from '@shared/utils/date.util';

export type Lang = 'es' | 'en';
export const AVAILABLE_LANGS: Lang[] = ['es', 'en'];
export const LANG_LABELS: Record<Lang, string> = {
  es: 'Español',
  en: 'English',
};

const STORAGE_KEY = 'app_lang';

/**
 * Owns the active UI language: applies it to Transloco, persists the choice, and
 * exposes it as a signal. First run is detected by the absence of a stored value.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private transloco = inject(TranslocoService);

  readonly lang = signal<Lang>('es');

  /**
   * Apply the persisted language (or a device-based default on first run) and
   * preload its dictionary. Returns true when a choice was already stored, so the
   * caller knows whether to show the first-run picker.
   */
  async init(): Promise<boolean> {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    const stored: Lang | null = value === 'en' || value === 'es' ? value : null;
    const lang = stored ?? this.deviceDefault();
    await this.apply(lang);
    return stored != null;
  }

  /** Change and persist the active language. */
  async set(lang: Lang): Promise<void> {
    await this.apply(lang);
    await Preferences.set({ key: STORAGE_KEY, value: lang });
  }

  private async apply(lang: Lang): Promise<void> {
    // Ensure the dictionary is loaded before switching so the UI never flashes keys.
    await this.transloco.load(lang).toPromise();
    this.transloco.setActiveLang(lang);
    setDateLang(lang);
    this.lang.set(lang);
  }

  private deviceDefault(): Lang {
    const nav =
      typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
    return nav.toLowerCase().startsWith('en') ? 'en' : 'es';
  }
}
