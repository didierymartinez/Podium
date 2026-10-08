# App nativa (Expo) frente a la PWA — decisión (#75)

> Fecha: octubre de 2026. Ítem de la épica Fase 3 (#13): "App nativa (Expo) solo si la PWA se queda corta".
> Esta evaluación responde si hoy se queda corta y deja criterios medibles para volver a decidir.

## 1. Decisión

**No construir una app nativa por ahora.** La PWA cubre todos los flujos de Podium (escuelas y el MVP de gimnasio)
sin brechas que bloqueen a clientes. Se revisa cuando se cumpla alguno de los criterios de la sección 4.

## 2. Qué cubre hoy la PWA (con evidencia)

| Necesidad | Cómo se resuelve | Evidencia |
|---|---|---|
| Instalar en el celular | Manifest con íconos y modo `standalone`; aviso "Instalar app" | `src/app/manifest.ts`, `InstallPrompt` en `src/components/pwa.tsx` |
| Tomar asistencia **sin señal** | Service worker (red primero, copia guardada) + cola en IndexedDB que sincroniza al volver la señal | `public/sw.js`, `SyncAgent`, `e2e/sin-conexion.spec.ts` |
| Notificaciones push | FCM / Web Push con el service worker; cascada push → WhatsApp → correo (#64) | `src/lib/notifier`, `src/modules/notifications/delivery.ts` |
| Uso en celular | Diseño celular primero, navegación inferior | `docs/DISENO.md`, `e2e/celular.spec.ts` |
| Cronómetro multi-alumno | `requestAnimationFrame` en el navegador, sin dependencias nativas | `src/app/[slug]/marcas/marks-recorder.tsx` (#57) |
| Check-in con QR | El QR lo muestra la clase o la recepción y se escanea con la **cámara del sistema** (abre el link); no hace falta lector dentro de la app | #66, #74 |
| Pagos | Wompi (PSE, Nequi, tarjeta) por redirección web | `src/modules/billing/online.ts` |
| Archivos y fotos | Subida desde el navegador (cámara o galería del celular) | `src/modules/files` |
| Lista de viaje sin conexión | Excel descargable al celular | #60 |

## 3. Brechas conocidas de la PWA

| Brecha | Impacto en Podium | Mitigación actual |
|---|---|---|
| **iOS: push solo con la PWA instalada** en la pantalla de inicio (iOS 16.4+) | Familias con iPhone que no instalan la app no reciben push | La cascada envía por WhatsApp o correo; el aviso de instalación explica el paso a paso |
| Sin presencia en App Store / Play Store | Algunas escuelas o gimnasios lo piden por confianza o costumbre | Instalación desde el navegador; se puede publicar la PWA en Play Store con TWA sin reescribir |
| Sin NFC ni Bluetooth para **torniquetes** | Solo afecta a gimnasios con control de acceso físico (fuera del MVP, #74) | Ingreso por QR en recepción o del socio |
| Sin tareas en segundo plano largas ni ubicación | No hay flujos de Podium que lo necesiten | — |

## 4. Criterios para volver a decidir (cualquiera activa la revisión)

1. **Push en iOS:** más del **35 %** de las familias activas usa iPhone **y** menos del **30 %** de ellas tiene la PWA
   instalada después de 3 meses de uso (medir con los tokens push registrados por plataforma).
2. **Ventas:** **3 o más** escuelas o gimnasios en negociación condicionan la compra a estar en App Store / Play Store.
3. **Gimnasios con torniquetes:** la vertical gimnasio (#74) se valida (EVALUACION_GIMNASIOS §7) y **2 o más** clientes
   necesitan abrir torniquetes con NFC/Bluetooth desde el celular.
4. **Rendimiento:** quejas recurrentes de la app en celulares de gama baja que no se resuelvan optimizando la PWA.

## 5. Si se activa: cómo hacerlo sin reescribir

- **Primer paso barato:** publicar la PWA en Play Store como **TWA** (Trusted Web Activity); en iOS, un contenedor
  WebView (Capacitor) que carga la misma PWA y agrega push nativo (APNs).
- **App Expo** solo para los flujos que lo exijan (torniquetes, push iOS sin instalación), consumiendo las mismas
  reglas de negocio: hoy viven en `src/modules` y se exponen por server actions; habría que agregar endpoints REST
  autenticados con el mismo token de sesión (`src/modules/auth/session-token.ts`).
- El modelo de datos, la seguridad por escuela (RLS) y los proveedores (`Notifier`, `PaymentProvider`, `Storage`)
  no cambian.
