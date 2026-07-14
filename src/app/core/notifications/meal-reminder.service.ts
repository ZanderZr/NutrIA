import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** Reminder time per meal, as 'HH:MM' strings. */
export interface MealTimes {
  breakfast: string;
  lunch: string;
  dinner: string;
}

const CHANNEL_ID = 'meals';

/** Fixed ids per meal so re-scheduling replaces rather than stacks. */
const IDS: Record<keyof MealTimes, number> = {
  breakfast: 1002,
  lunch: 1003,
  dinner: 1004,
};

const TITLES: Record<keyof MealTimes, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
};

/**
 * Daily meal reminders at fixed times. Mirrors WeighInNotificationService:
 * native-only (no-op on web), a dedicated channel, and stable ids so schedules
 * are replaced instead of duplicated.
 */
@Injectable({ providedIn: 'root' })
export class MealReminderService {
  /** Schedule the three daily reminders at the given times. */
  async schedule(times: MealTimes): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      if (Capacitor.getPlatform() === 'android') {
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: 'Recordatorios de comidas',
          description: 'Avisos para registrar tus comidas',
          importance: 3, // IMPORTANCE_DEFAULT — audible
        });
      }

      await this.cancelAll();
      const notifications = (Object.keys(IDS) as (keyof MealTimes)[]).map(
        (meal) => {
          const [hour, minute] = times[meal].split(':').map(Number);
          return {
            id: IDS[meal],
            title: `¿Ya registraste tu ${TITLES[meal].toLowerCase()}?`,
            body: 'Toca para anotarlo en NutriControl.',
            channelId: CHANNEL_ID,
            schedule: {
              on: { hour: hour || 0, minute: minute || 0 },
              allowWhileIdle: true,
            },
          };
        },
      );
      await LocalNotifications.schedule({ notifications });
    } catch {
      // Reminders are a nice-to-have; never break the app over them.
    }
  }

  /** Cancel all three meal reminders (native only). */
  async cancelAll(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.cancel({
        notifications: Object.values(IDS).map((id) => ({ id })),
      });
    } catch {
      /* no-op */
    }
  }
}
