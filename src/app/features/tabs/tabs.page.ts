import { Component } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="chat">
          <ion-icon name="chatbubble-ellipses-outline"></ion-icon>
          <ion-label>Registrar</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="dashboard">
          <ion-icon name="today-outline"></ion-icon>
          <ion-label>Hoy</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="history">
          <ion-icon name="calendar-outline"></ion-icon>
          <ion-label>Historial</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="stats">
          <ion-icon name="stats-chart-outline"></ion-icon>
          <ion-label>Progreso</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings">
          <ion-icon name="settings-outline"></ion-icon>
          <ion-label>Ajustes</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {}
