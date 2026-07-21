import { Injectable, inject } from '@angular/core';
import { ZodError } from 'zod';

import { environment } from '../../../environments/environment';
import { SecureConfigService } from '../config/secure-config.service';
import { AiError, AiNutritionPort, MealImage } from './ai-nutrition.port';
import {
  validateCoachAdvice,
  validateParsedMeal,
  validateRecommendation,
} from './ai-response.validator';
import {
  COACH_RESPONSE_SCHEMA,
  COACH_SYSTEM_PROMPT,
  PARSE_RESPONSE_SCHEMA,
  PARSE_SYSTEM_PROMPT,
  PHOTO_SYSTEM_PROMPT,
  RECOMMEND_RESPONSE_SCHEMA,
  RECOMMEND_SYSTEM_PROMPT,
  buildCoachContextLine,
  buildContextLine,
  buildRecommendDirective,
} from './prompts/nutrition.prompts';
import {
  AiContext,
  CoachAdvice,
  CoachContext,
  ParsedMeal,
  Recommendation,
} from '@domain/models/ai.model';

interface GeminiPart {
  text: string;
}

/** Give up on a single request after this long, so the chat never hangs. */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Production AI adapter. Calls the Gemini REST `generateContent` endpoint with a
 * responseSchema so the model always returns JSON of the expected shape, then
 * validates with Zod. Retries once on a validation failure before giving up.
 */
@Injectable({ providedIn: 'root' })
export class GeminiNutritionAdapter implements AiNutritionPort {
  private config = inject(SecureConfigService);

  async parseMeal(text: string, context: AiContext): Promise<ParsedMeal> {
    const contents = [
      { role: 'user', parts: [{ text: buildContextLine(context) }] },
      { role: 'user', parts: [{ text }] },
    ];
    const raw = await this.callWithRetry(
      PARSE_SYSTEM_PROMPT,
      contents,
      PARSE_RESPONSE_SCHEMA,
      (data) => validateParsedMeal(data),
    );
    return raw;
  }

  async parseMealImage(
    image: MealImage,
    context: AiContext,
  ): Promise<ParsedMeal> {
    const contents = [
      { role: 'user', parts: [{ text: buildContextLine(context) }] },
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: 'Analiza esta foto de comida.' },
        ],
      },
    ];
    return this.callWithRetry(
      PHOTO_SYSTEM_PROMPT,
      contents,
      PARSE_RESPONSE_SCHEMA,
      (data) => validateParsedMeal(data),
    );
  }

  async recommendNextMeal(context: AiContext): Promise<Recommendation> {
    const contents = [
      { role: 'user', parts: [{ text: buildContextLine(context) }] },
      { role: 'user', parts: [{ text: buildRecommendDirective(context) }] },
    ];
    // Higher temperature so suggestions actually vary between requests.
    return this.callWithRetry(
      RECOMMEND_SYSTEM_PROMPT,
      contents,
      RECOMMEND_RESPONSE_SCHEMA,
      (data) => validateRecommendation(data),
      0.95,
    );
  }

  async weeklyCoach(context: CoachContext): Promise<CoachAdvice> {
    const contents = [
      { role: 'user', parts: [{ text: buildCoachContextLine(context) }] },
    ];
    return this.callWithRetry(
      COACH_SYSTEM_PROMPT,
      contents,
      COACH_RESPONSE_SCHEMA,
      (data) => validateCoachAdvice(data),
      0.7,
    );
  }

  private async callWithRetry<T>(
    system: string,
    contents: unknown,
    schema: unknown,
    validate: (data: unknown) => T,
    temperature = 0.2,
  ): Promise<T> {
    const first = await this.generate(system, contents, schema, temperature);
    try {
      return validate(first);
    } catch (err) {
      if (!(err instanceof ZodError)) throw err;
      // One corrective retry: ask the model to fix its own malformed output.
      const retrySystem = `${system}\nIMPORTANTE: Devuelve EXCLUSIVAMENTE JSON válido con el esquema requerido.`;
      const second = await this.generate(retrySystem, contents, schema, temperature);
      try {
        return validate(second);
      } catch {
        throw new AiError(
          'La IA devolvió una respuesta no válida.',
          'invalid-response',
        );
      }
    }
  }

  private async generate(
    system: string,
    contents: unknown,
    schema: unknown,
    temperature = 0.2,
  ): Promise<unknown> {
    const apiKey = await this.config.getApiKey();
    if (!apiKey) {
      throw new AiError('No hay clave de API configurada.', 'no-key');
    }

    const url = `${environment.gemini.baseUrl}/${environment.gemini.model}:generateContent`;
    // Abort a stalled request so the UI never hangs on "thinking…" forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            temperature,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
        signal: controller.signal,
      });
    } catch {
      throw new AiError(
        controller.signal.aborted
          ? 'La IA tardó demasiado en responder. Inténtalo de nuevo.'
          : 'Sin conexión con el servicio de IA.',
        'network',
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 400 || res.status === 403) {
      throw new AiError('Clave de API inválida o sin permisos.', 'auth');
    }
    if (res.status === 429) {
      throw new AiError(
        'Has alcanzado el límite de uso de tu clave gratuita. Espera un momento e inténtalo de nuevo.',
        'rate-limit',
      );
    }
    if (!res.ok) {
      throw new AiError(`Error del servicio de IA (${res.status}).`, 'unknown');
    }

    const json = await res.json();
    const parts: GeminiPart[] =
      json?.candidates?.[0]?.content?.parts ?? [];
    const textOut = parts.map((p) => p.text ?? '').join('').trim();
    if (!textOut) {
      throw new AiError('Respuesta vacía de la IA.', 'invalid-response');
    }

    try {
      return JSON.parse(textOut);
    } catch {
      throw new AiError('La IA no devolvió JSON válido.', 'invalid-response');
    }
  }

  /**
   * Validate a key with a lightweight metadata GET (no generation, no quota
   * cost). 200 → accepted; 429 → accepted but rate-limited (the key works);
   * 400/403 → rejected. Network failures surface as an AiError.
   */
  async verifyKey(key: string): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) return false;
    const url = `${environment.gemini.baseUrl}/${environment.gemini.model}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'x-goog-api-key': trimmed },
        signal: controller.signal,
      });
    } catch {
      throw new AiError('Sin conexión para comprobar la clave.', 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.ok || res.status === 429) return true;
    if (res.status === 400 || res.status === 403) return false;
    throw new AiError(`No se pudo comprobar la clave (${res.status}).`, 'unknown');
  }
}
