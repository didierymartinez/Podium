import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

const buttonVariants = {
  primary: "bg-brand text-white shadow-pill hover:bg-brand-strong",
  secondary: "border border-line bg-surface text-ink shadow-pill hover:bg-canvas",
  ghost: "text-ink-soft hover:bg-muted hover:text-ink",
  danger: "bg-danger text-white shadow-pill hover:opacity-90",
};

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cn(buttonBase, buttonVariants[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

/** Botón circular de solo ícono (campana, ajustes…). */
export function IconButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "grid size-10 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-pill transition hover:text-ink disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
      {error ? (
        <span className="block text-sm text-danger">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-ink-soft">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "block h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink shadow-[inset_0_1px_2px_rgb(16_24_40/0.04)] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cn(inputClass, "pr-8", props.className)} />;
}

/** Tarjeta principal: blanca, muy redondeada, sombra difusa. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/70 bg-surface p-6 shadow-soft dark:border-line",
        className,
      )}
      {...props}
    />
  );
}

/** Bloque interno sobre una tarjeta (fondo de lienzo). */
export function Tile({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line/70 bg-canvas p-4", className)} {...props} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

const chipTones = {
  neutral: "bg-muted text-ink-soft",
  brand: "bg-brand/12 text-brand-strong",
  violet: "bg-violet/12 text-violet",
  mint: "bg-mint/14 text-mint",
  sun: "bg-sun/30 text-ink",
  danger: "bg-danger/12 text-danger",
};

export type ChipTone = keyof typeof chipTones;

/** Chip de estado: "● Aprobado", "● Pendiente", "En 15 min"… */
export function Chip({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: ChipTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        chipTones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const AVATAR_COLORS = ["#2f6bff", "#7c5cff", "#16b364", "#f59e0b", "#e5484d", "#0ea5e9", "#db2777"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Avatar con iniciales y color estable por nombre. */
export function Avatar({
  name,
  size = 40,
  className,
  src,
}: {
  name: string;
  size?: number;
  className?: string;
  /** Foto (URL interna firmada); si no hay, iniciales. */
  src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover ring-2 ring-white", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-white",
        className,
      )}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-3.5 py-2.5 text-sm",
        tone === "danger" ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand-strong",
      )}
    >
      {children}
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="10" className="fill-brand" />
      <path d="M7 24h5v-7H7zM13.5 24h5V9h-5zM20 24h5v-10h-5z" fill="#fcd34d" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight text-ink", className)}>
      <LogoMark />
      Podium
    </span>
  );
}
