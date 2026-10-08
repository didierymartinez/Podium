"use client";

import {
  Baby,
  ChartColumn,
  CalendarCheck,
  GraduationCap,
  House,
  Layers,
  Megaphone,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

type Audience = "all" | "manager" | "admin" | "coach" | "family";
type NavItem = { path: string; label: string; icon: LucideIcon; ready: boolean; audience: Audience };

/** Qué ve cada persona: administración (propietario, admin, coordinador), profesores y familias. */
export type NavAccess = { manager: boolean; admin: boolean; coach: boolean; family?: boolean };

const visible = (access: NavAccess) => (item: NavItem) =>
  item.audience === "all" ||
  (item.audience === "manager" && access.manager) ||
  (item.audience === "admin" && access.admin) ||
  (item.audience === "coach" && (access.coach || access.manager)) ||
  (item.audience === "family" && Boolean(access.family) && !access.manager);

/** Secciones de la escuela; las que aún no existen se muestran deshabilitadas. */
const HOME: NavItem = { path: "", label: "Inicio", icon: House, ready: true, audience: "all" };
const ATHLETES: NavItem = {
  path: "/alumnos",
  label: "Alumnos",
  icon: Users,
  ready: true,
  audience: "manager",
};
const GROUPS: NavItem = { path: "/grupos", label: "Grupos", icon: Layers, ready: true, audience: "manager" };
const COACHES: NavItem = {
  path: "/profesores",
  label: "Profesores",
  icon: GraduationCap,
  ready: true,
  audience: "admin",
};
const ATTENDANCE: NavItem = {
  path: "/asistencia",
  label: "Asistencia",
  icon: CalendarCheck,
  ready: true,
  audience: "coach",
};
const BILLING: NavItem = {
  path: "/cobros",
  label: "Cobros",
  icon: Wallet,
  ready: true,
  audience: "manager",
};
const REPORTS: NavItem = {
  path: "/reportes",
  label: "Reportes",
  icon: ChartColumn,
  ready: true,
  audience: "manager",
};
const MY_PAYMENTS: NavItem = {
  path: "/mis-pagos",
  label: "Mis pagos",
  icon: Wallet,
  ready: true,
  audience: "family",
};
const MY_KIDS: NavItem = {
  path: "/mis-hijos",
  label: "Mis hijos",
  icon: Baby,
  ready: true,
  audience: "family",
};
const MY_DATA: NavItem = {
  path: "/mis-datos",
  label: "Mis datos",
  icon: UserRound,
  ready: true,
  audience: "all",
};
const NOTICES: NavItem = {
  path: "/avisos",
  label: "Avisos",
  icon: Megaphone,
  ready: true,
  audience: "all",
};
const SETTINGS: NavItem = {
  path: "/configuracion",
  label: "Configuración",
  icon: Settings,
  ready: true,
  audience: "manager",
};

/** Secciones de la escuela; las que aún no existen se muestran deshabilitadas. */
export const SCHOOL_NAV: NavItem[] = [
  HOME,
  ATHLETES,
  GROUPS,
  COACHES,
  ATTENDANCE,
  BILLING,
  REPORTS,
  MY_KIDS,
  MY_PAYMENTS,
  NOTICES,
  MY_DATA,
];

function useActive(slug: string) {
  const pathname = usePathname();
  return (item: NavItem) => {
    if (item.path === "") return pathname === `/${slug}`;
    // Acudientes vive dentro de la sección Alumnos.
    if (item.path === "/alumnos" && pathname.startsWith(`/${slug}/acudientes`)) return true;
    return pathname.startsWith(`/${slug}${item.path}`);
  };
}

function RailLink({ slug, item, active }: { slug: string; item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const className = cn(
    "grid size-11 place-items-center rounded-full transition",
    active
      ? "bg-surface text-brand shadow-pill ring-1 ring-brand/15"
      : "text-ink-soft hover:bg-surface hover:text-ink",
    !item.ready && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-ink-soft",
  );
  const label = item.ready ? item.label : `${item.label} · próximamente`;
  return item.ready ? (
    <Link href={`/${slug}${item.path}`} className={className} title={label} aria-label={label}>
      <Icon className="size-5" />
    </Link>
  ) : (
    <span className={className} title={label} aria-label={label} aria-disabled>
      <Icon className="size-5" />
    </span>
  );
}

/** Barra lateral de íconos (escritorio). */
export function SideRail({ slug, logo, access }: { slug: string; logo: React.ReactNode; access: NavAccess }) {
  const isActive = useActive(slug);
  return (
    <aside className="sticky top-3 hidden h-[calc(100dvh-1.5rem)] w-[72px] shrink-0 flex-col items-center rounded-[28px] border border-white/70 bg-glass py-4 shadow-soft backdrop-blur md:flex dark:border-line">
      <Link href="/escuelas" aria-label="Mis escuelas">
        {logo}
      </Link>
      <nav className="flex flex-1 flex-col justify-center gap-2" aria-label="Secciones">
        {SCHOOL_NAV.filter(visible(access)).map((item) => (
          <RailLink key={item.label} slug={slug} item={item} active={isActive(item)} />
        ))}
      </nav>
      {visible(access)(SETTINGS) && <RailLink slug={slug} item={SETTINGS} active={isActive(SETTINGS)} />}
    </aside>
  );
}

/** Pestañas tipo píldora de la barra superior (escritorio). */
export function TopTabs({ slug, access }: { slug: string; access: NavAccess }) {
  const isActive = useActive(slug);
  const tabs = [HOME, ATHLETES, GROUPS, ATTENDANCE].filter(visible(access));
  if (tabs.length < 2) return null;
  return (
    <nav className="hidden items-center gap-1.5 lg:flex" aria-label="Accesos rápidos">
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        const className = cn(
          "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
          active
            ? "bg-brand/8 text-ink shadow-[inset_0_0_0_1px_rgb(47_107_255/0.25),0_4px_14px_-8px_rgb(47_107_255/0.6)]"
            : "border border-line bg-surface text-ink-soft shadow-pill hover:text-ink",
          !item.ready && "cursor-not-allowed opacity-55 hover:text-ink-soft",
        );
        const content = (
          <>
            <Icon className="size-4" /> {item.label}
          </>
        );
        return item.ready ? (
          <Link key={item.label} href={`/${slug}${item.path}`} className={className}>
            {content}
          </Link>
        ) : (
          <span key={item.label} className={className} title="Próximamente" aria-disabled>
            {content}
          </span>
        );
      })}
    </nav>
  );
}

/** Navegación inferior para celular (PWA). */
export function BottomNav({ slug, access }: { slug: string; access: NavAccess }) {
  const isActive = useActive(slug);
  const items = [
    HOME,
    ATHLETES,
    GROUPS,
    ATTENDANCE,
    MY_KIDS,
    MY_PAYMENTS,
    { ...SETTINGS, label: "Ajustes" },
  ].filter(visible(access));
  if (items.length < 2) return null;
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-20 flex justify-around rounded-full border border-white/70 bg-glass px-2 py-1.5 shadow-soft backdrop-blur md:hidden dark:border-line"
      aria-label="Secciones"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        const className = cn(
          "flex flex-col items-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] font-semibold",
          active ? "text-brand" : "text-ink-soft",
          !item.ready && "opacity-45",
        );
        const content = (
          <>
            <Icon className="size-5" />
            {item.label}
          </>
        );
        return item.ready ? (
          <Link key={item.label} href={`/${slug}${item.path}`} className={className}>
            {content}
          </Link>
        ) : (
          <span key={item.label} className={className} aria-disabled title="Próximamente">
            {content}
          </span>
        );
      })}
    </nav>
  );
}
