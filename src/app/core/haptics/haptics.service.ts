import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Thin wrapper over Capacitor Haptics. Native-only — every method is a silent
 * no-op on the web, and any failure is swallowed so feedback never breaks a flow.
 * Call these at meaningful interaction points to make the app feel tactile.
 */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  private readonly native = Capacitor.isNativePlatform();

  /** Light tap — for small, frequent actions (adding water, selecting). */
  async tap(): Promise<void> {
    await this.run(() => Haptics.impact({ style: ImpactStyle.Light }));
  }

  /** Medium bump — for a committed action (deleting). */
  async medium(): Promise<void> {
    await this.run(() => Haptics.impact({ style: ImpactStyle.Medium }));
  }

  /** Success pattern — for a completed, positive action (meal logged, saved). */
  async success(): Promise<void> {
    await this.run(() => Haptics.notification({ type: NotificationType.Success }));
  }

  /** Warning pattern — for something that failed or was undone/removed. */
  async warning(): Promise<void> {
    await this.run(() => Haptics.notification({ type: NotificationType.Warning }));
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    if (!this.native) return;
    try {
      await fn();
    } catch {
      /* haptics are best-effort */
    }
  }
}
