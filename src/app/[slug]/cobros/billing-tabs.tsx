"use client";

import { FileText, Inbox, LayoutDashboard, Package, Receipt, TrendingDown, Vault } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export function BillingTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const tabs: { href: string; label: string; icon: typeof Inbox; exact?: boolean; exclude?: string }[] = [
    { href: `/${slug}/cobros`, label: "Cartera", icon: LayoutDashboard, exact: true },
    { href: `/${slug}/cobros/cuentas`, label: "Cuentas", icon: FileText },
    {
      href: `/${slug}/cobros/pagos`,
      label: "Pagos",
      icon: Receipt,
      exclude: `/${slug}/cobros/pagos/por-verificar`,
    },
    { href: `/${slug}/cobros/pagos/por-verificar`, label: "Por verificar", icon: Inbox },
    { href: `/${slug}/cobros/caja`, label: "Caja", icon: Vault },
    { href: `/${slug}/cobros/egresos`, label: "Egresos", icon: TrendingDown },
    { href: `/${slug}/cobros/inventario`, label: "Inventario", icon: Package },
  ];
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Cobros">
      {tabs.map(({ href, label, icon: Icon, exact, exclude }) => {
        const active = exact
          ? pathname === href
          : pathname.startsWith(href) && !(exclude && pathname.startsWith(exclude));
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
