import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/ui";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Sin conexión" };

/** Se guarda en el celular al instalar el service worker y se muestra cuando no hay señal. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo />
      <span className="grid size-14 place-items-center rounded-full bg-muted text-ink-soft">
        <WifiOff className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold">Sin conexión</h1>
      <p className="text-ink-soft">
        Esta página no está guardada en el celular. Las listas de asistencia que abriste con señal sí
        funcionan sin conexión: lo que marques se envía solo cuando vuelva la señal.
      </p>
      <RetryButton />
    </main>
  );
}
