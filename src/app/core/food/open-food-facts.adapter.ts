import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { BarcodeFood } from '@domain/models/barcode.model';
import { BarcodeFoodPort, BarcodeLookupError } from './barcode-food.port';

const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

/**
 * Free, key-less barcode lookup via Open Food Facts. Good coverage of European
 * packaged products. Returns nutrition per 100 g; the caller scales by grams.
 */
@Injectable({ providedIn: 'root' })
export class OpenFoodFactsAdapter implements BarcodeFoodPort {
  private t = inject(TranslocoService);

  async lookup(barcode: string): Promise<BarcodeFood | null> {
    const code = barcode.trim();
    if (!code) return null;

    const url = `${BASE_URL}/${encodeURIComponent(
      code,
    )}.json?fields=product_name,brands,nutriments`;

    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new BarcodeLookupError(this.t.translate('errors.barcodeNetwork'), 'network');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new BarcodeLookupError(
        this.t.translate('errors.barcodeService', { status: res.status }),
        'unknown',
      );
    }

    const json = await res.json();
    if (json?.status !== 1 || !json.product) return null;

    const p = json.product;
    const n = p.nutriments ?? {};
    const num = (v: unknown): number =>
      typeof v === 'number' && isFinite(v) ? v : 0;

    return {
      barcode: code,
      name: (p.product_name || '').trim() || 'Producto sin nombre',
      brand: (p.brands || '').split(',')[0]?.trim() || undefined,
      per100g: {
        calories: Math.round(num(n['energy-kcal_100g'])),
        protein_g: num(n['proteins_100g']),
        fat_g: num(n['fat_100g']),
        carbs_g: num(n['carbohydrates_100g']),
        fiber_g: num(n['fiber_100g']),
      },
    };
  }
}
