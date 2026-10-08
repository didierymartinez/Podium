/** Enlace para abrir WhatsApp con un mensaje listo (modo "manual asistido", docs/WHATSAPP_COMUNICACIONES.md). */
export function whatsappLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}
