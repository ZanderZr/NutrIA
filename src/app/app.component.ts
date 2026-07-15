import { Component, inject, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet, ModalController } from '@ionic/angular/standalone';
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
  languageOutline,
} from 'ionicons/icons';

import { DatabaseService } from '@core/database/database.service';
import { ProfileFacade } from '@core/state/profile.facade';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import { ThemeService } from '@core/theme/theme.service';
import { ReminderSettingsService } from '@core/notifications/reminder-settings.service';
import { AutoBackupService } from '@core/backup/auto-backup.service';
import { LanguageService } from '@core/i18n/language.service';
import { LanguagePickerModalComponent } from '@shared/components/language-picker-modal.component';

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
  private language = inject(LanguageService);
  private modalCtrl = inject(ModalController);

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
      languageOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.theme.init();
    // Apply the saved language; on first run (nothing stored) offer the picker.
    const hadLang = await this.language.init();
    if (!hadLang) await this.presentLanguagePicker();
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

  /** First-run language chooser, shown before the rest of the UI loads. */
  private async presentLanguagePicker(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: LanguagePickerModalComponent,
      backdropDismiss: false,
    });
    await modal.present();
    await modal.onDidDismiss();
  }
}
