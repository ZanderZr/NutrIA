/** Google AI Studio page where the user creates a free Gemini API key. */
export const GEMINI_API_KEY_URL = 'https://aistudio.google.com/app/apikey';

/**
 * Open a URL in the system browser. On web it opens a new tab; inside a
 * Capacitor webview `_blank` is routed to the OS browser by default, so no extra
 * plugin is required.
 */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener');
}
