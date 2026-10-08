"use client";

import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "./ui";

/** Mensaje de resultado de un formulario; el de éxito se oculta solo. */
export function FormStatus({ state }: { state: { ok?: boolean; message?: string } }) {
  const [visible, setVisible] = useState(true);
  const [prev, setPrev] = useState(state);
  if (prev !== state) {
    setPrev(state);
    setVisible(true);
  }

  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [state]);

  if (!state.message || !visible) return null;
  if (state.ok) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
        <CircleCheck className="size-4" /> {state.message}
      </span>
    );
  }
  return <Alert>{state.message}</Alert>;
}
