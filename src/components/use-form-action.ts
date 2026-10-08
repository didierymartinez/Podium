"use client";

import { startTransition, type FormEvent } from "react";

/**
 * `onSubmit` que llama a la acción de `useActionState` sin el restablecimiento automático
 * que React aplica a los `<form action>`: con campos controlados ese reinicio deja los
 * `<select>` mostrando su primer valor aunque el estado diga otra cosa.
 */
export function submitWithoutReset(dispatch: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Incluye el botón que envió el formulario (p. ej. name="to" value="ACTIVE").
    const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(form));
  };
}
