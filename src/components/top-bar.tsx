import { Bell } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { Avatar, LogoMark } from "./ui";

/** Barra superior flotante: contenido a la izquierda, usuario a la derecha. */
export function TopBar({
  userName,
  children,
  actions,
  showLogo = false,
  notifications,
}: {
  userName: string;
  children?: ReactNode;
  actions?: ReactNode;
  showLogo?: boolean;
  /** Campana con avisos de la escuela actual. */
  notifications?: { href: string; unread: number };
}) {
  return (
    <header className="sticky top-3 z-10 flex h-16 items-center gap-3 rounded-[24px] border border-white/70 bg-glass px-3 shadow-soft backdrop-blur dark:border-line">
      {showLogo && (
        <Link href="/escuelas" aria-label="Mis escuelas" className="shrink-0">
          <LogoMark />
        </Link>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {actions}
      {notifications && (
        <Link
          href={notifications.href}
          className="relative grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-pill hover:text-ink"
          aria-label={
            notifications.unread ? `Notificaciones (${notifications.unread} sin leer)` : "Notificaciones"
          }
        >
          <Bell className="size-4" />
          {notifications.unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {notifications.unread > 9 ? "9+" : notifications.unread}
            </span>
          )}
        </Link>
      )}
      <span title={userName}>
        <Avatar name={userName} size={40} />
      </span>
      <LogoutButton />
    </header>
  );
}

/** Contenedor para páginas fuera de una escuela (mis escuelas, crear escuela). */
export function PlainShell({ userName, children }: { userName: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-3 sm:p-4">
      <TopBar userName={userName} showLogo>
        <span className="font-bold tracking-tight">Podium</span>
      </TopBar>
      <main className="flex-1 px-1 pb-10">{children}</main>
    </div>
  );
}
