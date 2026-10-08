import { HeartHandshake, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui";

/** Pestañas Alumnos | Acudientes. */
export function PeopleTabs({ slug, active }: { slug: string; active: "athletes" | "guardians" }) {
  const tabs = [
    { key: "athletes", href: `/${slug}/alumnos`, label: "Alumnos", icon: Users },
    { key: "guardians", href: `/${slug}/acudientes`, label: "Acudientes", icon: HeartHandshake },
  ] as const;
  return (
    <nav className="flex gap-1.5" aria-label="Personas">
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
            active === key
              ? "bg-brand/8 text-ink shadow-[inset_0_0_0_1px_rgb(47_107_255/0.25),0_4px_14px_-8px_rgb(47_107_255/0.6)]"
              : "border border-line bg-surface text-ink-soft shadow-pill hover:text-ink",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}
