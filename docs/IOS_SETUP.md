# Configuración iOS (checklist)

La plataforma iOS **no está añadida** en el repo (requiere macOS + Xcode). Cuando
la montes en un Mac, sigue estos pasos. La lógica de la app ya es multiplataforma
(Capacitor); solo falta la configuración nativa de iOS.

## 1. Añadir la plataforma

```bash
npm install @capacitor/ios     # ya está en package.json
npx cap add ios
npm run build && npx cap sync ios
```

## 2. Permiso de cámara (obligatorio)

El escáner de códigos y el registro por foto usan la cámara. iOS **rechaza el
build en App Store** si falta la descripción de uso. Añade a
`ios/App/App/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Para escanear códigos de barras y fotografiar tus comidas.</string>
```

## 3. Notificaciones locales

`@capacitor/local-notifications` pide permiso en tiempo de ejecución (ya lo
hacen los servicios de recordatorios). No requiere clave en `Info.plist`, pero
si más adelante añades notificaciones push, harán falta capacidades y APNs.

## 4. SQLite en iOS

Ya configurado en `capacitor.config.ts`:

```ts
iosDatabaseLocation: 'Library/CapacitorDatabase',
iosIsEncryption: false,
```

## 5. Abrir y ejecutar

```bash
npx cap open ios     # abre Xcode
```

En Xcode: selecciona un equipo de firma (Signing & Capabilities), elige un
simulador o dispositivo y pulsa Run.

## Notas

- La copia de seguridad automática usa `Directory.Documents`; en iOS los
  archivos quedan en el contenedor de la app (visibles en la app Archivos si
  activas `UIFileSharingEnabled` / `LSSupportsOpeningDocumentsInPlace`, opcional).
- El escáner ML Kit (`@capacitor-mlkit/barcode-scanning`) soporta iOS; revisa su
  documentación por si requiere pasos de CocoaPods adicionales.
