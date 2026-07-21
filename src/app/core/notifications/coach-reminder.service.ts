import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { TranslocoService } from '@jsverse/transloco';

const CHANNEL_ID = 'coach';
const NOTIF_ID = 1006;

/**
 * Weekly nudge to open the AI coach (Sunday 18:00). Mirrors the other
 * notification services: native-only, dedicated channel, stable id so it's
 * replaced instead of stacked.
 */
@Injectable({ providedIn: 'root' })
export class CoachReminderService {
  private t = inject(TranslocoService);

  async schedule(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      if (Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: this.t.translate('notif.coachChannel'),
          description: this.t.translate('notif.coachChannelDesc'),
          importance: 3,
        });
      }

      await this.cancel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_ID,
            title: this.t.translate('notif.coachTitle'),
            body: this.t.translate('notif.coachBody'),
            channelId: CHANNEL_ID,
            schedule: {
              on: { weekday: 1, hour: 18, minute: 0 }, // Sunday evening
              allowWhileIdle: true,
            },
          },
        ],
      });
    } catch {
      /* nice-to-have; never break startup */
    }
  }

  async cancel(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    } catch {
      /* no-op */
    }
  }
}
