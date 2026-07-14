import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  BarcodeScanner,
  BarcodeFormat,
} from '@capacitor-mlkit/barcode-scanning';

/** Camera barcode scanning via Google ML Kit (native only; no-op on web). */
@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  private readonly isWeb = Capacitor.getPlatform() === 'web';

  /** True only where a real camera scanner is available (Android / iOS). */
  async isSupported(): Promise<boolean> {
    if (this.isWeb) return false;
    try {
      const { supported } = await BarcodeScanner.isSupported();
      return supported;
    } catch {
      return false;
    }
  }

  /**
   * Open the camera scanner and return the first retail barcode read, or null
   * if the user cancels. Throws 'permission' when camera access is denied.
   */
  async scan(): Promise<string | null> {
    const granted = await this.ensurePermission();
    if (!granted) throw new Error('permission');

    await this.ensureAndroidModule();

    try {
      const { barcodes } = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
        ],
      });
      return barcodes[0]?.rawValue ?? null;
    } catch {
      // User cancelled the scanner UI.
      return null;
    }
  }

  /**
   * Ask for camera permission early (e.g. when the add-food form opens) so the
   * OS prompt appears in context, before the user taps "scan". No-op if already
   * decided or on web.
   */
  async primePermission(): Promise<void> {
    if (this.isWeb) return;
    try {
      const cur = await BarcodeScanner.checkPermissions();
      if (cur.camera === 'prompt' || cur.camera === 'prompt-with-rationale') {
        await BarcodeScanner.requestPermissions();
      }
    } catch {
      /* best-effort */
    }
  }

  /** Open the app's system settings so the user can grant camera access. */
  async openSettings(): Promise<void> {
    if (this.isWeb) return;
    try {
      await BarcodeScanner.openSettings();
    } catch {
      /* no-op */
    }
  }

  private async ensurePermission(): Promise<boolean> {
    // Prompt only when the decision is still pending; otherwise reflect the
    // stored state (a previous "deny" won't re-prompt — the caller then guides
    // the user to Settings).
    let state = (await BarcodeScanner.checkPermissions()).camera;
    if (state === 'prompt' || state === 'prompt-with-rationale') {
      state = (await BarcodeScanner.requestPermissions()).camera;
    }
    return state === 'granted' || state === 'limited';
  }

  /** On Android the scanner uses a Google module that may need installing once. */
  private async ensureAndroidModule(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    try {
      const { available } =
        await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }
    } catch {
      // Best-effort; scan() will surface any hard failure.
    }
  }
}
