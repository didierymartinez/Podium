/** WhatsApp automático (docs/WHATSAPP_COMUNICACIONES.md §2 F2): envío de plantillas aprobadas por Meta. */
export type TemplateMessage = {
  /** Número en formato internacional sin "+": "573001234567". */
  to: string;
  template: string;
  language: string;
  /** Variables {{1}}, {{2}}… del cuerpo de la plantilla. */
  params: string[];
};

export type WhatsAppResult = { ok: true; id: string } | { ok: false; error: string; invalidNumber?: boolean };

export interface WhatsAppSender {
  sendTemplate(message: TemplateMessage): Promise<WhatsAppResult>;
  /** Texto libre: solo dentro de la ventana de 24 h (respuestas a mensajes entrantes). */
  sendText(to: string, body: string): Promise<WhatsAppResult>;
}
