-- WhatsApp por escuela y bandeja (Fase 3): por escuela; las familias no la ven.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_accounts', 'whatsapp_conversations', 'whatsapp_messages']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id())',
      t
    );
    EXECUTE format('CREATE POLICY portal_family ON %I AS RESTRICTIVE USING (app_portal_user_id() IS NULL)', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Mensaje entrante del webhook (sin escuela ni sesión): si el número que lo recibió es de una escuela, se guarda
-- en su bandeja y devuelve la escuela; si es el número de Podium, devuelve NULL.
CREATE OR REPLACE FUNCTION whatsapp_inbound(
  phone_number_id_input text, from_phone text, contact_name text, body_input text, wa_id text
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  school uuid;
  conversation uuid;
BEGIN
  SELECT school_id INTO school FROM whatsapp_accounts WHERE phone_number_id = phone_number_id_input AND enabled;
  IF school IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO whatsapp_conversations (school_id, contact_phone, contact_name, last_inbound_at, last_message_at, unread)
  VALUES (school, from_phone, contact_name, now(), now(), 1)
  ON CONFLICT (school_id, contact_phone) DO UPDATE
    SET contact_name = coalesce(excluded.contact_name, whatsapp_conversations.contact_name),
        last_inbound_at = now(),
        last_message_at = now(),
        unread = whatsapp_conversations.unread + 1
  RETURNING id INTO conversation;
  INSERT INTO whatsapp_messages (school_id, conversation_id, direction, body, wa_message_id)
  VALUES (school, conversation, 'IN', body_input, wa_id)
  ON CONFLICT DO NOTHING;
  RETURN school;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION whatsapp_inbound(text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION whatsapp_inbound(text, text, text, text, text) TO podium_app;
--> statement-breakpoint
-- Los estados de Meta también aplican a las respuestas enviadas desde la bandeja.
CREATE OR REPLACE FUNCTION whatsapp_status(message_id text, new_status text, error_text text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  updated integer;
  inbox integer;
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
  UPDATE whatsapp_messages
  SET status = new_status
  WHERE wa_message_id = message_id
    AND (
      new_status = 'failed'
      OR coalesce(array_position(ARRAY['sent', 'delivered', 'read'], status), 0)
         < coalesce(array_position(ARRAY['sent', 'delivered', 'read'], new_status), 0)
    );
  GET DIAGNOSTICS inbox = ROW_COUNT;
  RETURN updated + inbox;
END
$$;
