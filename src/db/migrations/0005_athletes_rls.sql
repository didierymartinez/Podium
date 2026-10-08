DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['athletes', 'guardians', 'athlete_guardians', 'groups', 'group_schedules', 'enrollments']
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
ALTER TABLE groups ADD CONSTRAINT groups_capacity_positive CHECK (capacity > 0);
--> statement-breakpoint
ALTER TABLE group_schedules ADD CONSTRAINT group_schedules_weekday_range CHECK (weekday BETWEEN 0 AND 6);
--> statement-breakpoint
ALTER TABLE group_schedules ADD CONSTRAINT group_schedules_time_order CHECK (end_time > start_time);
