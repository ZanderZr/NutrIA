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
} from 'ionicons/icons';

import { DatabaseService } from '@core/database/database.service';
import { ProfileFacade } from '@core/state/profile.facade';
import { DashboardFacade } from '@core/state/dashboard.facade';
import { SecureConfigService } from '@core/config/secure-config.service';
import { ThemeService } from '@core/theme/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  private db = inject(DatabaseService);
  private profile = inject(ProfileFacade);
  private dashboard = inject(DashboardFacade);
  private config = inject(SecureConfigService);
  private theme = inject(ThemeService);

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
  }
}
