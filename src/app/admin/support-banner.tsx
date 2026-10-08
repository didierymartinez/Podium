import { ShieldAlert } from "lucide-react";
import { exitSupportAction } from "./actions";

/** Banner visible mientras un super admin ve una escuela en modo soporte (solo lectura). */
export function SupportBanner({ schoolId, reason }: { schoolId: string; reason: string }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl bg-violet/15 px-4 py-3 text-sm"
    >
      <ShieldAlert className="size-4 shrink-0 text-violet" />
      <span className="flex-1">
        <strong>Modo soporte de Podium · solo lectura.</strong> Motivo: {reason}
      </span>
      <form action={exitSupportAction.bind(null, schoolId)}>
        <button type="submit" className="font-semibold text-violet underline">
          Salir del modo soporte
        </button>
      </form>
    </div>
  );
}
