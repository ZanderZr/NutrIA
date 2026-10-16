import { Injectable, inject } from '@angular/core';

import { AI_NUTRITION_PORT, NO_ROUTINE } from '@core/ai/ai-nutrition.port';
import { RoutineAiContext } from '@domain/models/ai.model';

/** What kind of document the user picked, which decides how we read it. */
export type DocKind = 'text' | 'csv' | 'pdf' | 'image' | 'unsupported';

export type TrainingFileErrorKind =
  | 'unsupported'
  | 'too-large'
  | 'empty'
  | 'unreadable'
  | 'not-a-routine';

/**
 * A problem with the *file*, as opposed to a problem with the AI provider.
 * Deliberately not folded into `AiError`: that type's `kind` is a provider
 * failure taxonomy whose `switch` statements would swallow these as "could not
 * interpret the message".
 */
export class TrainingFileError extends Error {
  constructor(readonly kind: TrainingFileErrorKind) {
    super(kind);
    this.name = 'TrainingFileError';
  }
}

/**
 * Raw-bytes cap. Gemini's inline-request limit is around 20 MB and base64
 * inflates bytes by ~1.37x, so 8 MB of file is ~11 MB of payload — enough
 * headroom for the prompt and the JSON envelope.
 */
export const MAX_FILE_MB = 8;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Text cap, so the structuring prompt cannot blow the context window. */
const MAX_TEXT_CHARS = 200_000;

const TEXT_EXTS = ['md', 'markdown', 'txt', 'text'];
const CSV_EXTS = ['csv', 'tsv'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'];

/** Extension → the MIME type Gemini accepts, since `file.type` is unreliable. */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Turns an uploaded routine document into Markdown: by code when the file is
 * already text, via the AI port when it is a PDF or a photo. Sits between the
 * facade and the AI port so the facade stays pure orchestration.
 */
@Injectable({ providedIn: 'root' })
export class DocumentMarkdownService {
  private ai = inject(AI_NUTRITION_PORT);

  /**
   * Classify by extension first and MIME second: Android's WebView reports
   * `file.type` as '' or application/octet-stream for .md/.csv far too often.
   */
  classify(file: File): DocKind {
    const ext = (file.name.toLowerCase().split('.').pop() ?? '').trim();
    if (TEXT_EXTS.includes(ext)) return 'text';
    if (CSV_EXTS.includes(ext)) return 'csv';
    if (ext === 'pdf') return 'pdf';
    if (IMAGE_EXTS.includes(ext)) return 'image';

    const type = (file.type || '').toLowerCase();
    if (type === 'text/csv' || type === 'text/tab-separated-values') return 'csv';
    if (type.startsWith('text/')) return 'text';
    if (type === 'application/pdf') return 'pdf';
    if (/^image\/(png|jpe?g|webp|heic|heif)$/.test(type)) return 'image';
    return 'unsupported';
  }

  /** True when turning this file into Markdown needs an AI call. */
  needsAi(file: File): boolean {
    const kind = this.classify(file);
    return kind === 'pdf' || kind === 'image';
  }

  /** The whole step 1: file → Markdown. Throws `TrainingFileError` on bad input. */
  async toMarkdown(file: File, context: RoutineAiContext): Promise<string> {
    if (file.size === 0) throw new TrainingFileError('empty');
    if (file.size > MAX_FILE_BYTES) throw new TrainingFileError('too-large');

    const kind = this.classify(file);
    if (kind === 'unsupported') throw new TrainingFileError('unsupported');

    if (kind === 'text' || kind === 'csv') {
      const text = await this.readText(file);
      // Throw rather than truncate: half a routine is worse than an error.
      if (text.length > MAX_TEXT_CHARS) throw new TrainingFileError('too-large');
      if (!text.trim()) throw new TrainingFileError('empty');
      // A .md is already Markdown and a .txt routine is close enough; only a
      // spreadsheet export really needs converting.
      return kind === 'csv' ? this.csvToMarkdown(text, file.name) : text;
    }

    const markdown = await this.ai.documentToMarkdown(
      {
        data: await this.readBase64(file),
        mimeType: kind === 'pdf' ? 'application/pdf' : this.imageMime(file),
      },
      context,
    );
    if (markdown === NO_ROUTINE) throw new TrainingFileError('not-a-routine');
    return markdown;
  }

  private imageMime(file: File): string {
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    return IMAGE_MIME[ext] ?? (file.type || 'image/jpeg');
  }

  private async readText(file: File): Promise<string> {
    try {
      return await file.text();
    } catch {
      throw new TrainingFileError('unreadable');
    }
  }

  /** Base64 without the `data:…;base64,` prefix (the CameraService idiom). */
  private readBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const comma = url.indexOf(',');
        resolve(comma >= 0 ? url.slice(comma + 1) : url);
      };
      reader.onerror = () => reject(new TrainingFileError('unreadable'));
      reader.readAsDataURL(file);
    });
  }

  /** Spreadsheet export → a Markdown table, the one literal conversion here. */
  private csvToMarkdown(text: string, filename: string): string {
    const delimiter = filename.toLowerCase().endsWith('.tsv') ? '\t' : ',';
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => this.splitRow(line, delimiter));
    if (!rows.length) throw new TrainingFileError('empty');

    const width = Math.max(...rows.map((r) => r.length));
    const render = (cells: string[]) =>
      `| ${Array.from({ length: width }, (_u, i) =>
        (cells[i] ?? '').replace(/\|/g, '\\|'),
      ).join(' | ')} |`;

    const [header, ...body] = rows;
    return [
      render(header),
      `|${' --- |'.repeat(width)}`,
      ...body.map(render),
    ].join('\n');
  }

  /** Split one CSV row, honouring double-quoted fields. */
  private splitRow(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === delimiter && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }
}
