"use client";

import { BellRing } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { registerPushTokenAction } from "@/app/[slug]/mis-datos/actions";
import { publicEnv } from "@/lib/public-env";
import { Button } from "./ui";

/** Activa las notificaciones push de este dispositivo con Firebase Cloud Messaging (#43). */
export function PushToggle({ slug }: { slug: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const supported = useSyncExternalStore(
    () => () => {},
    () => "Notification" in window && "serviceWorker" in navigator && Boolean(publicEnv.vapidKey),
    () => false,
  );

  if (!supported) {
    return (
      <p className="text-sm text-ink-soft">
        Las notificaciones en este dispositivo aún no están disponibles. En iPhone, primero instala la app
        (Compartir → Agregar a inicio).
      </p>
    );
  }

  function enable() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus("Permiso denegado. Puedes activarlo en la configuración del navegador.");
          return;
        }
        const [{ getApps, initializeApp }, { getMessaging, getToken }] = await Promise.all([
          import("firebase/app"),
          import("firebase/messaging"),
        ]);
        const app = getApps()[0] ?? initializeApp(publicEnv.firebase);
        const registration = await navigator.serviceWorker.ready;
        const token = await getToken(getMessaging(app), {
          vapidKey: publicEnv.vapidKey,
          serviceWorkerRegistration: registration,
        });
        const result = await registerPushTokenAction(slug, token, navigator.userAgent);
        setStatus(
          result.ok
            ? "Notificaciones activadas en este dispositivo."
            : (result.message ?? "No se pudo activar."),
        );
      } catch {
        setStatus("No se pudieron activar las notificaciones en este dispositivo.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={enable} disabled={pending}>
        <BellRing className="size-4" />{" "}
        {pending ? "Activando…" : "Activar notificaciones en este dispositivo"}
      </Button>
      {status && <span className="text-sm text-ink-soft">{status}</span>}
    </div>
  );
}
