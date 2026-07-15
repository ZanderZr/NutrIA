import { Component } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
  ],
  templateUrl: './legal.page.html',
  styleUrl: './legal.page.scss',
})
export class LegalPage {
  /** Bumped alongside the app version so the shown "last updated" stays honest. */
  readonly updated = '15 de julio de 2026';
  readonly version = '0.1.0';
  readonly contactEmail = 'jc.zr88@gmail.com';
  readonly appName = 'com.nutricontrol.app';
}
