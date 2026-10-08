"use client";

import { useEffect, useRef, type RefObject } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = SCRIPT;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")),
    );
    tag.addEventListener("error", () => reject(new Error("turnstile")));
  });
}

/**
 * Captcha invisible de Cloudflare Turnstile (#20). Solo se muestra un reto si Cloudflare lo necesita.
 * `getToken()` devuelve un token nuevo en cada envío (son de un solo uso), o null si no hay llave configurada.
 */
export function useTurnstile(siteKey: string, container: RefObject<HTMLDivElement | null>) {
  const widget = useRef<string | null>(null);
  const pending = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    const el = container.current;
    let cancelled = false;
    void loadScript()
      .then((api) => {
        if (cancelled) return;
        widget.current = api.render(el, {
          sitekey: siteKey,
          execution: "execute",
          appearance: "interaction-only",
          language: "es",
          callback: (token: string) => pending.current?.resolve(token),
          "error-callback": () => pending.current?.reject(new Error("turnstile")),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, container]);

  async function getToken(): Promise<string | null> {
    if (!siteKey) return null;
    const api = await loadScript();
    const id = widget.current;
    if (!id) throw new Error("turnstile");
    return new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
      api.reset(id);
      api.execute(id);
    });
  }

  return getToken;
}
