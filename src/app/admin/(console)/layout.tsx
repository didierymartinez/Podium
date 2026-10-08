import Link from "next/link";
import { LogoMark } from "@/components/ui";
import { requirePlatformAdmin } from "@/modules/auth/session";

/** Consola de Podium (#17): solo super admins con segundo factor. */
export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requirePlatformAdmin();
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 p-3 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/admin" className="flex items-center gap-2 font-bold">
          <LogoMark className="size-8" /> Consola de Podium
        </Link>
        <span className="ml-auto text-sm text-ink-soft">{admin.email}</span>
      </header>
      {children}
    </div>
  );
}
