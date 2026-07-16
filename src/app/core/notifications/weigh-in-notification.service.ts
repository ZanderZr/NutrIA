import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { TranslocoService } from '@jsverse/transloco';

/** Fixed id so re-scheduling replaces the reminder instead of stacking copies. */
const NOTIF_ID = 1001;
const CHANNEL_ID = 'weigh-in';

/**
 * Schedules a weekly, silent reminder to weigh in fasted every Sunday at 05:00.
 * Uses Capacitor Local Notifications — native only; a no-op on the web build.
 * "Silent" = no sound: a LOW-importance channel on Android and no sound key on
 * iOS, so it appears quietly in the tray without a chime or heads-up banner.
 */
@Injectable({ providedIn: 'root' })
export class WeighInNotificationService {
  private t = inject(TranslocoService);

  async schedule(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      // Android: a dedicated low-importance channel = silent, no heads-up.
      if (Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: this.t.translate('notif.weighChannel'),
          description: this.t.translate('notif.weighChannelDesc'),
          importance: 2, // IMPORTANCE_LOW — visible but silent
          vibration: false,
        });
      }

      // Replace any previous schedule to avoid duplicates.
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_ID,
            title: this.t.translate('notif.weighTitle'),
            body: this.t.translate('notif.weighBody'),
            channelId: CHANNEL_ID,
            // No `sound` key → silent on iOS. Repeats every Sunday at 05:00.
            schedule: {
              on: { weekday: 1, hour: 5, minute: 0 }, // weekday 1 = Sunday
              allowWhileIdle: true,
            },
          },
        ],
      });
    } catch {
      // A reminder is a nice-to-have; never let it break app startup.
    }
  }

  /** Turn the weekly reminder off (native only). */
  async cancel(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    } catch {
      /* no-op */
    }
  }
}
