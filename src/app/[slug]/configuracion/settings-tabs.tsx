"use client";

import { Building, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export function SettingsTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/${slug}/configuracion`, label: "Perfil", icon: Building },
    { href: `/${slug}/configuracion/cobros`, label: "Cobros", icon: Wallet },
  ];
  return (
    <nav className="flex gap-1.5" aria-label="Configuración">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
              active
                ? "bg-brand/8 text-ink shadow-[inset_0_0_0_1px_rgb(47_107_255/0.25),0_4px_14px_-8px_rgb(47_107_255/0.6)]"
                : "border border-line bg-surface text-ink-soft shadow-pill hover:text-ink",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
