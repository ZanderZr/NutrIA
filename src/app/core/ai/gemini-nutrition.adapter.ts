import { Injectable, inject } from '@angular/core';
import { ZodError } from 'zod';

import { environment } from '../../../environments/environment';
import { SecureConfigService } from '../config/secure-config.service';
import { AiError, AiNutritionPort, MealImage } from './ai-nutrition.port';
import {
  validateParsedMeal,
  validateRecommendation,
} from './ai-response.validator';
import {
  PARSE_RESPONSE_SCHEMA,
  PARSE_SYSTEM_PROMPT,
  PHOTO_SYSTEM_PROMPT,
  RECOMMEND_RESPONSE_SCHEMA,
  RECOMMEND_SYSTEM_PROMPT,
  buildContextLine,
} from './prompts/nutrition.prompts';
import {
  AiContext,
  ParsedMeal,
  Recommendation,
} from '@domain/models/ai.model';

interface GeminiPart {
  text: string;
}

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
    ];
    return this.callWithRetry(
      RECOMMEND_SYSTEM_PROMPT,
      contents,
      RECOMMEND_RESPONSE_SCHEMA,
      (data) => validateRecommendation(data),
    );
  }

  private async callWithRetry<T>(
    system: string,
    contents: unknown,
    schema: unknown,
    validate: (data: unknown) => T,
  ): Promise<T> {
    const first = await this.generate(system, contents, schema);
    try {
      return validate(first);
    } catch (err) {
      if (!(err instanceof ZodError)) throw err;
      // One corrective retry: ask the model to fix its own malformed output.
      const retrySystem = `${system}\nIMPORTANTE: Devuelve EXCLUSIVAMENTE JSON válido con el esquema requerido.`;
      const second = await this.generate(retrySystem, contents, schema);
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
  ): Promise<unknown> {
    const apiKey = await this.config.getApiKey();
    if (!apiKey) {
      throw new AiError('No hay clave de API configurada.', 'no-key');
    }

    const url = `${environment.gemini.baseUrl}/${environment.gemini.model}:generateContent`;
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
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
      });
    } catch {
      throw new AiError('Sin conexión con el servicio de IA.', 'network');
    }

    if (res.status === 400 || res.status === 403) {
      throw new AiError('Clave de API inválida o sin permisos.', 'auth');
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
}
