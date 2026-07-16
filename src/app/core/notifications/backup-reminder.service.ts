import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { TranslocoService } from '@jsverse/transloco';

const CHANNEL_ID = 'backup';
const NOTIF_ID = 1005;

/**
 * Weekly reminder to make a backup (Saturday 12:00). Mirrors the other
 * notification services: native-only, dedicated channel, stable id so it's
 * replaced instead of stacked.
 */
@Injectable({ providedIn: 'root' })
export class BackupReminderService {
  private t = inject(TranslocoService);

  async schedule(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      if (Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: this.t.translate('notif.backupChannel'),
          description: this.t.translate('notif.backupChannelDesc'),
          importance: 3,
        });
      }

      await this.cancel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_ID,
            title: this.t.translate('notif.backupTitle'),
            body: this.t.translate('notif.backupBody'),
            channelId: CHANNEL_ID,
            schedule: {
              on: { weekday: 7, hour: 12, minute: 0 }, // Saturday
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
