import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { MealImage } from '@core/ai/ai-nutrition.port';

/**
 * Captures a meal photo as base64. On native it uses the camera/gallery picker;
 * on the web it falls back to a file input (so it also works in the PWA).
 */
@Injectable({ providedIn: 'root' })
export class CameraService {
  private readonly isNative = Capacitor.isNativePlatform();

  async pickPhoto(): Promise<MealImage | null> {
    if (this.isNative) {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        quality: 70,
        width: 1024,
        correctOrientation: true,
      });
      if (!photo.base64String) return null;
      return { data: photo.base64String, mimeType: `image/${photo.format || 'jpeg'}` };
    }
    return this.pickFromFile();
  }

  /** Web fallback: open a file picker (with camera capture hint on mobile). */
  private pickFromFile(): Promise<MealImage | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
      input.style.display = 'none';
      document.body.appendChild(input);
      const done = (result: MealImage | null) => {
        input.remove();
        resolve(result);
      };
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          done(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const url = reader.result as string; // data:<mime>;base64,<data>
          const comma = url.indexOf(',');
          done({
            data: comma >= 0 ? url.slice(comma + 1) : url,
            mimeType: file.type || 'image/jpeg',
          });
        };
        reader.onerror = () => done(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }
}
