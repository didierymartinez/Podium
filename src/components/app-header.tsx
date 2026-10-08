import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import { Logo } from "./ui";

export function AppHeader({ userName, children }: { userName: string; children?: ReactNode }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/escuelas" aria-label="Mis escuelas">
          <Logo />
        </Link>
        <div className="min-w-0 flex-1 truncate">{children}</div>
        <span className="hidden text-sm text-ink-soft sm:inline">{userName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
