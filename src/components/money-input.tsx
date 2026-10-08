"use client";

import { useState, type ComponentProps } from "react";
import { cn, inputClass } from "./ui";

const groups = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function formatThousands(raw: string | number): string {
  const digits = String(raw).replace(/\D/g, "");
  return digits ? groups.format(Number(digits)) : "";
}

/** Campo de pesos con separador de miles mientras se escribe ("180.000"). */
export function MoneyInput({
  defaultValue,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<"input">, "defaultValue" | "onChange" | "value"> & {
  defaultValue?: number | null;
  onValueChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(defaultValue ? formatThousands(defaultValue) : "");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-ink-soft">
        $
      </span>
      <input
        {...props}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const formatted = formatThousands(e.target.value);
          setValue(formatted);
          onValueChange?.(Number(formatted.replace(/\D/g, "")) || 0);
        }}
        className={cn(inputClass, "pl-7 tabular-nums", className)}
      />
    </div>
  );
}
