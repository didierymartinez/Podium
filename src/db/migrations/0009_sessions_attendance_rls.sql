DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['school_closures', 'sessions', 'attendance']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id())',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE school_closures ADD CONSTRAINT school_closures_range CHECK (end_date >= start_date);
--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_time_order CHECK (end_time > start_time);
