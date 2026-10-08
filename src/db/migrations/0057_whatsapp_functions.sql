-- Webhook de WhatsApp (#64): llega sin escuela ni sesión, así que solo puede tocar lo justo.
-- Estado de un mensaje por su id de Meta; nunca retrocede (leído no vuelve a entregado).
CREATE OR REPLACE FUNCTION whatsapp_status(message_id text, new_status text, error_text text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE notifications
  SET whatsapp_status = new_status,
      whatsapp_error = coalesce(error_text, whatsapp_error)
  WHERE whatsapp_message_id = message_id
    AND (
      new_status = 'failed'
      OR coalesce(array_position(ARRAY['sent', 'delivered', 'read'], whatsapp_status), 0)
         < coalesce(array_position(ARRAY['sent', 'delivered', 'read'], new_status), 0)
    );
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION whatsapp_status(text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION whatsapp_status(text, text, text) TO podium_app;
--> statement-breakpoint
-- Baja COM-31: quien responde "SALIR" retira el consentimiento de WhatsApp en todas sus escuelas.
CREATE OR REPLACE FUNCTION whatsapp_opt_out(phone_input text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE legal_acceptances
  SET revoked_at = now()
  WHERE document = 'WHATSAPP'
    AND revoked_at IS NULL
    AND user_id IN (
      SELECT user_id FROM guardians WHERE phone = phone_input AND user_id IS NOT NULL
      UNION
      SELECT id FROM users WHERE phone = phone_input
    );
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION whatsapp_opt_out(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION whatsapp_opt_out(text) TO podium_app;
