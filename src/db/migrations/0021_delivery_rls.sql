-- Tokens push: cada persona ve los suyos; la entrega los lee con una función acotada.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_tokens ON push_subscriptions
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION push_tokens_for(user_ids uuid[]) RETURNS TABLE (user_id uuid, token text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT user_id, token FROM push_subscriptions WHERE user_id = ANY(user_ids) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION push_tokens_for(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION push_tokens_for(uuid[]) TO podium_app;
--> statement-breakpoint
-- Tokens que FCM reporta como inválidos se borran desde la entrega.
CREATE OR REPLACE FUNCTION forget_push_token(token_input text) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$ DELETE FROM push_subscriptions WHERE token = token_input $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION forget_push_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION forget_push_token(text) TO podium_app;
--> statement-breakpoint
-- Registro de correos automáticos: solo la app del servidor (sin datos personales).
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY server_only ON email_log USING (true) WITH CHECK (true);
