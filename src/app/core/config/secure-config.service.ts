import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { environment } from '../../../environments/environment';

const KEY = 'gemini_api_key';

/**
 * Resolves the Gemini API key. Priority:
 *   1. A key the user saved in the platform secure store (BYOK override).
 *   2. The key embedded in environment.gemini.apiKey (personal-use default).
 * On web the stored key falls back to localStorage for development only.
 * The key is never written to SQLite or logs.
 */
@Injectable({ providedIn: 'root' })
export class SecureConfigService {
  private readonly isWeb = Capacitor.getPlatform() === 'web';
  private readonly embedded = environment.gemini.apiKey?.trim() || '';

  /** True when any key (stored or embedded) is available. */
  readonly hasKey = signal(false);
  /** True when the active key comes from the app config, not from the user. */
  readonly usingEmbedded = signal(false);

  async load(): Promise<void> {
    const stored = await this.getStoredKey();
    this.hasKey.set(!!stored || !!this.embedded);
    this.usingEmbedded.set(!stored && !!this.embedded);
  }

  /** The key to use for requests: user key wins, else the embedded one. */
  async getApiKey(): Promise<string | null> {
    const stored = await this.getStoredKey();
    return stored || this.embedded || null;
  }

  async setApiKey(value: string): Promise<void> {
    const trimmed = value.trim();
    if (this.isWeb) {
      localStorage.setItem(KEY, trimmed);
    } else {
      await SecureStoragePlugin.set({ key: KEY, value: trimmed });
    }
    this.hasKey.set(!!trimmed || !!this.embedded);
    this.usingEmbedded.set(!trimmed && !!this.embedded);
  }

  /** Remove the user key; the embedded key (if any) becomes active again. */
  async clear(): Promise<void> {
    try {
      if (this.isWeb) {
        localStorage.removeItem(KEY);
      } else {
        await SecureStoragePlugin.remove({ key: KEY });
      }
    } finally {
      this.hasKey.set(!!this.embedded);
      this.usingEmbedded.set(!!this.embedded);
    }
  }

  private async getStoredKey(): Promise<string | null> {
    try {
      if (this.isWeb) {
        return localStorage.getItem(KEY);
      }
      const { value } = await SecureStoragePlugin.get({ key: KEY });
      return value ?? null;
    } catch {
      return null;
    }
  }
}
