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
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
};
