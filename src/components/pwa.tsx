"use client";

import { CloudOff, Download, RefreshCw, Share, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveAttendanceAction } from "@/app/[slug]/asistencia/actions";
import { allPending, isNetworkError, markFailed, OUTBOX_EVENT, removePending } from "@/lib/offline/outbox";
import { Button } from "./ui";

/** Registra el service worker (solo en producción o con NEXT_PUBLIC_ENABLE_SW). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "true") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** true cuando el navegador reporta que no hay red. */
export function useIsOffline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
}

/** Cantidad de asistencias guardadas en el celular pendientes de enviar. */
export function usePendingCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () =>
      void allPending()
        .then((items) => setCount(items.length))
        .catch(() => {});
    refresh();
    window.addEventListener(OUTBOX_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_EVENT, refresh);
  }, []);
  return count;
}

/**
 * Envía la asistencia guardada sin conexión al volver la señal (y al abrir la app).
 * Errores de red: se reintenta. Rechazos del servidor: quedan marcados para revisar.
 */
export function SyncAgent() {
  const offline = useIsOffline();
  const pending = usePendingCount();
  const running = useRef(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (offline || pending === 0 || running.current) return;
    running.current = true;
    setSyncing(true);
    (async () => {
      for (const item of await allPending()) {
        if (item.lastError) continue;
        const form = new FormData();
        form.set("entries", JSON.stringify(item.entries));
        form.set("recordedAt", item.recordedAt);
        try {
          const result = await saveAttendanceAction(item.slug, item.sessionId, {}, form);
          if (result.ok) await removePending(item.sessionId);
          else await markFailed(item, result.message ?? "No se pudo guardar");
        } catch (err) {
          if (!isNetworkError(err)) await markFailed(item, "No se pudo guardar");
          break;
        }
      }
    })()
      .catch(() => {})
      .finally(() => {
        running.current = false;
        setSyncing(false);
      });
  }, [offline, pending]);

  if (!offline && pending === 0) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-md items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-soft md:bottom-4"
    >
      {offline ? (
        <CloudOff className="size-4 shrink-0" />
      ) : (
        <RefreshCw className={syncing ? "size-4 shrink-0 animate-spin" : "size-4 shrink-0"} />
      )}
      <span>
        {offline ? "Sin conexión." : syncing ? "Sincronizando…" : "Por revisar."}
        {pending > 0 &&
          ` ${pending} ${pending === 1 ? "lista pendiente" : "listas pendientes"} de sincronizar.`}
      </span>
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = "podium:install-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Invita a instalar la app en el celular (Android: botón; iPhone: instrucciones). */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || readDismissed()) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const small = window.matchMedia("(max-width: 768px)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende del navegador
    setIos(isIos && small);
    setDismissed(!(isIos && small));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  if (dismissed || (!event && !ios)) return null;
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-brand/20 bg-brand/8 p-3 text-sm">
      <Download className="size-5 shrink-0 text-brand" />
      <p className="min-w-0 flex-1">
        <strong>Instala Podium</strong> para abrirlo como una app y tomar asistencia aunque no haya señal.
        {ios && !event && (
          <span className="mt-1 flex items-center gap-1 text-ink-soft">
            Toca <Share className="inline size-4" /> y luego “Agregar a inicio”.
          </span>
        )}
      </p>
      {event && (
        <Button
          className="h-9 px-4"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
            dismiss();
          }}
        >
          Instalar
        </Button>
      )}
      <button type="button" onClick={dismiss} aria-label="Cerrar" className="text-ink-soft">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Pide al service worker guardar estas páginas (p. ej. las listas de las clases del día). */
export function CachePages({ urls }: { urls: string[] }) {
  const key = urls.join("|");
  useEffect(() => {
    if (!key || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: "cache-pages", urls: key.split("|") }))
      .catch(() => {});
  }, [key]);
  return null;
}
