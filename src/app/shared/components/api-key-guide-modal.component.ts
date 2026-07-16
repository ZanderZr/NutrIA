import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonInput,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { SecureConfigService } from '@core/config/secure-config.service';
import { GEMINI_API_KEY_URL, openExternal } from '@shared/utils/external-link.util';

interface GuideStep {
  icon: string;
  /** Translation-key prefix for this step (e.g. 'guide.step1'). */
  key: string;
  /** Optional illustration; leave empty to show the placeholder (swap later). */
  image?: string;
  /** True when this step renders the advantage bullets. */
  bullets?: boolean;
  /** Shows the "Open Google AI Studio" button on this step. */
  openLink?: boolean;
  /** Shows the paste-key field on this step (the last one). */
  paste?: boolean;
}

/**
 * Step-by-step guide to get a free Gemini API key (BYOK). Each step has an
 * illustration slot (placeholder for now, real images later), and the final
 * step lets the user paste and save the key — stored encrypted on-device.
 */
@Component({
  selector: 'app-api-key-guide-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
    IonIcon,
    IonInput,
    TranslocoModule,
  ],
  templateUrl: './api-key-guide-modal.component.html',
  styleUrl: './api-key-guide-modal.component.scss',
})
export class ApiKeyGuideModalComponent {
  private modalCtrl = inject(ModalController);
  private config = inject(SecureConfigService);
  private toast = inject(ToastController);
  private t = inject(TranslocoService);

  readonly step = signal(0);
  apiKey = '';

  readonly steps: GuideStep[] = [
    { icon: 'sparkles-outline', image: 'assets/tutorial/step-1.svg', key: 'guide.step1', bullets: true },
    { icon: 'open-outline', image: 'assets/tutorial/step-2.svg', key: 'guide.step2', openLink: true },
    { icon: 'key-outline', image: 'assets/tutorial/step-3.svg', key: 'guide.step3' },
    { icon: 'folder-open-outline', image: 'assets/tutorial/step-4.svg', key: 'guide.step4' },
    { icon: 'copy-outline', image: 'assets/tutorial/step-5.svg', key: 'guide.step5' },
    { icon: 'checkmark-circle-outline', image: 'assets/tutorial/step-6.svg', key: 'guide.step6', paste: true },
  ];

  readonly current = computed(() => this.steps[this.step()]);
  readonly isFirst = computed(() => this.step() === 0);
  readonly isLast = computed(() => this.step() === this.steps.length - 1);
  readonly progress = computed(() => (this.step() + 1) / this.steps.length);

  next(): void {
    if (!this.isLast()) this.step.update((s) => s + 1);
  }
  prev(): void {
    if (!this.isFirst()) this.step.update((s) => s - 1);
  }
  goTo(i: number): void {
    this.step.set(i);
  }

  openStudio(): void {
    openExternal(GEMINI_API_KEY_URL);
  }

  async save(): Promise<void> {
    const key = this.apiKey.trim();
    if (!key) return;
    await this.config.setApiKey(key);
    await this.notify(this.t.translate('guide.saved'));
    await this.modalCtrl.dismiss({ saved: true });
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }

  private async notify(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 1800, position: 'bottom' });
    await t.present();
  }
}
