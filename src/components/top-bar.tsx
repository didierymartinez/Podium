import { Bell } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { Avatar, IconButton, LogoMark } from "./ui";

/** Barra superior flotante: contenido a la izquierda, usuario a la derecha. */
export function TopBar({
  userName,
  children,
  actions,
  showLogo = false,
}: {
  userName: string;
  children?: ReactNode;
  actions?: ReactNode;
  showLogo?: boolean;
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
      <span className="hidden sm:block">
        <IconButton disabled title="Notificaciones · próximamente" aria-label="Notificaciones">
          <Bell className="size-4" />
        </IconButton>
      </span>
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
