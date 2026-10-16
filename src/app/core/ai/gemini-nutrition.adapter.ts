import { Injectable, inject } from '@angular/core';
import { ZodError } from 'zod';

import { environment } from '../../../environments/environment';
import { SecureConfigService } from '../config/secure-config.service';
import {
  AiDocument,
  AiError,
  AiNutritionPort,
  MealImage,
  NO_ROUTINE,
} from './ai-nutrition.port';
import {
  validateCoachAdvice,
  validateParsedMeal,
  validateParsedRoutine,
  validateRecommendation,
} from './ai-response.validator';
import {
  DOC_TO_MARKDOWN_SYSTEM_PROMPT,
  ROUTINE_RESPONSE_SCHEMA,
  ROUTINE_SYSTEM_PROMPT,
  buildDocContextLine,
  buildRoutineContextLine,
} from './prompts/training.prompts';
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
  ParsedRoutine,
  Recommendation,
  RoutineAiContext,
} from '@domain/models/ai.model';

interface GeminiPart {
  text: string;
}

/** Give up on a single request after this long, so the chat never hangs. */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Reading a whole routine document takes longer than a chat message: a
 * multi-page or scanned PDF plausibly runs 20-45 s. Raising the global timeout
 * would weaken the chat's "never hangs" guarantee, so only these calls wait.
 */
const DOC_TIMEOUT_MS = 60000;

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

  /**
   * Transcribe a document to Markdown. Plain text, not JSON: a multi-page
   * document full of newlines, quotes and table rules would have to be
   * JSON-escaped perfectly, and a single bad escape invalidates the whole
   * response with no partial recovery.
   */
  async documentToMarkdown(
    doc: AiDocument,
    context: RoutineAiContext,
  ): Promise<string> {
    const contents = [
      { role: 'user', parts: [{ text: buildDocContextLine(context, doc.mimeType) }] },
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: doc.mimeType, data: doc.data } },
          { text: 'Transcribe este documento a Markdown.' },
        ],
      },
    ];
    const raw = await this.generateText(
      DOC_TO_MARKDOWN_SYSTEM_PROMPT,
      contents,
      0.1,
      DOC_TIMEOUT_MS,
      true,
    );
    const md = raw
      .replace(/^```(?:markdown|md)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    if (md === NO_ROUTINE) return NO_ROUTINE;
    if (md.length < 20) {
      throw new AiError('El documento no se pudo leer.', 'invalid-response');
    }
    return md;
  }

  async parseRoutine(
    markdown: string,
    context: RoutineAiContext,
  ): Promise<ParsedRoutine> {
    const contents = [
      { role: 'user', parts: [{ text: buildRoutineContextLine(context) }] },
      { role: 'user', parts: [{ text: markdown }] },
    ];
    return this.callWithRetry(
      ROUTINE_SYSTEM_PROMPT,
      contents,
      ROUTINE_RESPONSE_SCHEMA,
      (data) => validateParsedRoutine(data),
      0.1,
      DOC_TIMEOUT_MS,
    );
  }

  private async callWithRetry<T>(
    system: string,
    contents: unknown,
    schema: unknown,
    validate: (data: unknown) => T,
    temperature = 0.2,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const first = await this.generate(system, contents, schema, temperature, timeoutMs);
    try {
      return validate(first);
    } catch (err) {
      if (!(err instanceof ZodError)) throw err;
      // One corrective retry: ask the model to fix its own malformed output.
      const retrySystem = `${system}\nIMPORTANTE: Devuelve EXCLUSIVAMENTE JSON válido con el esquema requerido.`;
      const second = await this.generate(
        retrySystem,
        contents,
        schema,
        temperature,
        timeoutMs,
      );
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
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    const textOut = await this.post(
      {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      },
      timeoutMs,
      environment.gemini.model,
    );

    try {
      return JSON.parse(textOut);
    } catch {
      throw new AiError('La IA no devolvió JSON válido.', 'invalid-response');
    }
  }

  /**
   * Free-text generation (no responseSchema). With `allowModelFallback`, a 400
   * is retried once on `fallbackModel` before surfacing: the lite model may
   * refuse an inline PDF, and that must not be a dead end for the user.
   */
  private async generateText(
    system: string,
    contents: unknown,
    temperature = 0.2,
    timeoutMs = REQUEST_TIMEOUT_MS,
    allowModelFallback = false,
  ): Promise<string> {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature },
    };
    try {
      return await this.post(body, timeoutMs, environment.gemini.model);
    } catch (err) {
      const rejected = err instanceof AiError && err.kind === 'auth';
      if (!allowModelFallback || !rejected) throw err;
      return this.post(body, timeoutMs, environment.gemini.fallbackModel);
    }
  }

  /**
   * The single HTTP call: auth, timeout, status→AiError mapping and text
   * extraction. Everything that talks to Gemini goes through here.
   */
  private async post(
    body: unknown,
    timeoutMs: number,
    model: string,
  ): Promise<string> {
    const apiKey = await this.config.getApiKey();
    if (!apiKey) {
      throw new AiError('No hay clave de API configurada.', 'no-key');
    }

    const url = `${environment.gemini.baseUrl}/${model}:generateContent`;
    // Abort a stalled request so the UI never hangs on "thinking…" forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
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
    return textOut;
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
