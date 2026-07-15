import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_ID = 'backup';
const NOTIF_ID = 1005;

/**
 * Weekly reminder to make a backup (Saturday 12:00). Mirrors the other
 * notification services: native-only, dedicated channel, stable id so it's
 * replaced instead of stacked.
 */
@Injectable({ providedIn: 'root' })
export class BackupReminderService {
  async schedule(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      if (Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: 'Recordatorio de copia',
          description: 'Aviso para guardar una copia de seguridad',
          importance: 3,
        });
      }

      await this.cancel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_ID,
            title: 'Haz una copia de seguridad',
            body: 'Guarda tus datos en Drive por si cambias de móvil. Solo tarda un momento.',
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
