ALTER TABLE fee_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fee_plans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON fee_plans
  USING (school_id = app_school_id())
  WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE fee_plans ADD CONSTRAINT fee_plans_amount_positive CHECK (monthly_amount > 0);
