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

  private async ensurePermission(): Promise<boolean> {
    const status = await BarcodeScanner.requestPermissions();
    return status.camera === 'granted' || status.camera === 'limited';
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
