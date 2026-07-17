import { Component, inject, signal } from '@angular/core';
import { IonContent, IonIcon, IonButton, ModalController } from '@ionic/angular/standalone';

import {
  LanguageService,
  Lang,
  AVAILABLE_LANGS,
  LANG_LABELS,
} from '@core/i18n/language.service';

/**
 * First-run language chooser. Shown once, before onboarding, when no language has
 * been stored yet. Neutral/bilingual copy so it reads for both audiences.
 */
@Component({
  selector: 'app-language-picker-modal',
  standalone: true,
  imports: [IonContent, IonIcon, IonButton],
  templateUrl: './language-picker-modal.component.html',
  styleUrl: './language-picker-modal.component.scss',
})
export class LanguagePickerModalComponent {
  private language = inject(LanguageService);
  private modalCtrl = inject(ModalController);

  readonly langs = AVAILABLE_LANGS;
  readonly labels = LANG_LABELS;
  readonly selected = signal<Lang>(this.language.lang());

  /** Highlight the choice; persistence happens on confirm (or here, immediately). */
  async choose(lang: Lang): Promise<void> {
    this.selected.set(lang);
    await this.language.set(lang);
  }

  /**
   * Persist the selected language before closing — even if the user tapped
   * "Continue" straight away without picking an option, so the picker never
   * reappears on the next launch.
   */
  async confirm(): Promise<void> {
    await this.language.set(this.selected());
    await this.modalCtrl.dismiss();
  }
}
