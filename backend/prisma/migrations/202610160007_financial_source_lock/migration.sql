-- Operational clients now exist; enforce the same composite tenant references.
ALTER TABLE financial_drafts ADD FOREIGN KEY (company_id, client_id) REFERENCES clients(company_id, id);
ALTER TABLE financial_invoices ADD FOREIGN KEY (company_id, client_id) REFERENCES clients(company_id, id);

-- BEFORE STATEMENT locks run before scanning/changing the source rows. They also
-- protect source writes from services that don't yet call lockCompanyFinance.
CREATE FUNCTION public.financial_source_write_lock() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE tenant_id integer;
BEGIN
  tenant_id := nullif(current_setting('app.company_id', true), '')::integer;
  IF tenant_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(160006, tenant_id);
  END IF;
  RETURN NULL;
END;
$$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies', 'demo_users', 'clients', 'sites', 'trades', 'workers', 'work_entries', 'entry_versions', 'clock_events', 'rates', 'billing_drafts', 'draft_exclusions'] LOOP
    EXECUTE format('CREATE TRIGGER financial_source_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION public.financial_source_write_lock()', t);
  END LOOP;
END;
$$;
