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

import { SecureConfigService } from '@core/config/secure-config.service';
import { GEMINI_API_KEY_URL, openExternal } from '@shared/utils/external-link.util';

interface GuideStep {
  icon: string;
  title: string;
  body: string;
  /** Optional bullet points (e.g. the advantages on the intro step). */
  bullets?: string[];
  /** Optional illustration; leave empty to show the placeholder (swap later). */
  image?: string;
  /** Shows the "Abrir Google AI Studio" button on this step. */
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
  ],
  templateUrl: './api-key-guide-modal.component.html',
  styleUrl: './api-key-guide-modal.component.scss',
})
export class ApiKeyGuideModalComponent {
  private modalCtrl = inject(ModalController);
  private config = inject(SecureConfigService);
  private toast = inject(ToastController);

  readonly step = signal(0);
  apiKey = '';

  readonly steps: GuideStep[] = [
    {
      icon: 'sparkles-outline',
      image: 'assets/tutorial/step-1.svg',
      title: 'Es 100% gratis',
      body: 'Conectar la IA no cuesta nada y se hace en 1 minuto. Ventajas de usar tu propia clave:',
      bullets: [
        'Sin tarjeta ni pagos: usas la capa gratuita de Google, de sobra para el día a día.',
        'Privado: tus datos se quedan en tu móvil; solo tu clave habla con Gemini.',
        'Sin suscripciones ni límites de la app.',
        'Tú mandas: puedes cambiarla o borrarla cuando quieras.',
      ],
    },
    {
      icon: 'open-outline',
      image: 'assets/tutorial/step-2.svg',
      title: 'Abre Google AI Studio',
      body: 'Entra en Google AI Studio (es gratis) e inicia sesión con tu cuenta de Google.',
      openLink: true,
    },
    {
      icon: 'key-outline',
      image: 'assets/tutorial/step-3.svg',
      title: 'Crea tu clave',
      body: 'Pulsa “Create API key” (Crear clave de API).',
    },
    {
      icon: 'folder-open-outline',
      image: 'assets/tutorial/step-4.svg',
      title: 'Elige un proyecto',
      body: 'Selecciona un proyecto existente o crea uno nuevo si te lo pide. Tarda unos segundos.',
    },
    {
      icon: 'copy-outline',
      image: 'assets/tutorial/step-5.svg',
      title: 'Copia la clave',
      body: 'Se generará una clave que empieza por “AIza…”. Cópiala al portapapeles.',
    },
    {
      icon: 'checkmark-circle-outline',
      image: 'assets/tutorial/step-6.svg',
      title: 'Pégala aquí',
      body: 'Pega tu clave y guárdala. Se guarda cifrada solo en tu dispositivo; nunca sale de él salvo para hablar con Gemini.',
      paste: true,
    },
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
    await this.notify('Clave guardada. ¡Listo para usar la IA!');
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
