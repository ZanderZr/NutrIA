import { Component, inject, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chatbubbleEllipsesOutline,
  todayOutline,
  calendarOutline,
  statsChartOutline,
  settingsOutline,
  send,
  bulbOutline,
  trashOutline,
  createOutline,
  addOutline,
  removeOutline,
  keyOutline,
  personOutline,
  flameOutline,
  restaurantOutline,
  checkmarkCircle,
  arrowForward,
  chevronForwardOutline,
  chevronBackOutline,
  openOutline,
  repeatOutline,
  star,
  starOutline,
  ellipsisVertical,
  sparklesOutline,
  addCircleOutline,
  sunnyOutline,
  moonOutline,
  contrastOutline,
  phonePortraitOutline,
  nutritionOutline,
  leafOutline,
  barbellOutline,
  waterOutline,
  flame,
  close,
  closeOutline,
  bulb,
  chevronForward,
  arrowForwardOutline,
  scaleOutline,
  trendingUpOutline,
  timeOutline,
  flagOutline,
  walkOutline,
  barcodeOutline,
  scanOutline,
  saveOutline,
  downloadOutline,
  cloudUploadOutline,
  cameraOutline,
  notificationsOutline,
  alarmOutline,
  folderOpenOutline,
  copyOutline,
  checkmarkCircleOutline,
  shieldCheckmarkOutline,
  warningOutline,
  mailOutline,
  documentTextOutline,
  informationCircleOutline,
} from 'ionicons/icons';

import { DatabaseService } from '@core/database/database.service';
import { ProfileFacade } from '@core/state/profile.facade';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import { ThemeService } from '@core/theme/theme.service';
import { ReminderSettingsService } from '@core/notifications/reminder-settings.service';
import { AutoBackupService } from '@core/backup/auto-backup.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  private db = inject(DatabaseService);
  private profile = inject(ProfileFacade);
  private dashboard = inject(DashboardFacade);
  private config = inject(SecureConfigService);
  private theme = inject(ThemeService);
  private reminders = inject(ReminderSettingsService);
  private autoBackup = inject(AutoBackupService);

  constructor() {
    addIcons({
      chatbubbleEllipsesOutline,
      todayOutline,
      calendarOutline,
      statsChartOutline,
      settingsOutline,
      send,
      bulbOutline,
      trashOutline,
      createOutline,
      addOutline,
      removeOutline,
      keyOutline,
      personOutline,
      flameOutline,
      restaurantOutline,
      checkmarkCircle,
      arrowForward,
      chevronForwardOutline,
      chevronBackOutline,
      openOutline,
      repeatOutline,
      star,
      starOutline,
      ellipsisVertical,
      sparklesOutline,
      addCircleOutline,
      sunnyOutline,
      moonOutline,
      contrastOutline,
      phonePortraitOutline,
      nutritionOutline,
      leafOutline,
      barbellOutline,
      waterOutline,
      flame,
      close,
      closeOutline,
      bulb,
      chevronForward,
      arrowForwardOutline,
      scaleOutline,
      trendingUpOutline,
      timeOutline,
      flagOutline,
      walkOutline,
      barcodeOutline,
      scanOutline,
      saveOutline,
      downloadOutline,
      cloudUploadOutline,
      cameraOutline,
      notificationsOutline,
      alarmOutline,
      folderOpenOutline,
      copyOutline,
      checkmarkCircleOutline,
      shieldCheckmarkOutline,
      warningOutline,
      mailOutline,
      documentTextOutline,
      informationCircleOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.theme.init();
    await this.db.init();
    await Promise.all([
      this.profile.load(),
      this.config.load(),
      this.dashboard.refresh(),
    ]);

    // Apply reminder preferences, then run the daily on-device auto-backup.
    // Native-only; both are no-ops on the web.
    void this.reminders.init().then(() =>
      this.autoBackup.maybeRun(this.reminders.autoBackupEnabled()),
    );
  }
}
