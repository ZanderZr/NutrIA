export const environment = {
  production: false,
  gemini: {
    // ── USO PERSONAL ──────────────────────────────────────────────
    // Pega aquí tu clave de Gemini (aistudio.google.com/app/apikey) y la app
    // arrancará ya conectada, sin pedir nada en el onboarding.
    // Déjala en '' si prefieres introducirla en la app (BYOK).
    apiKey: '',
    // ──────────────────────────────────────────────────────────────
    model: 'gemini-flash-lite-latest',
    // Used only when the lite model rejects a document (PDF) upload, so
    // importing a routine still works. Costs more quota: never the default.
    fallbackModel: 'gemini-flash-latest',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
};
