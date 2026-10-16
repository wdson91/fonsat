-- Financial documents are independent of the operational schema being built in parallel.
CREATE FUNCTION public.app_lock_finance(p_company_id integer) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF p_company_id IS DISTINCT FROM nullif(current_setting('app.company_id', true), '')::integer THEN
    RAISE EXCEPTION 'Contexto empresarial inválido' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(160006, p_company_id);
END;
$$;
REVOKE ALL ON FUNCTION public.app_lock_finance(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_lock_finance(integer) TO fonsat_app;

CREATE TABLE financial_drafts (
  id UUID PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  client_id INTEGER NOT NULL CHECK (client_id > 0),
  period TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  review_hash TEXT NOT NULL CHECK (review_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL,
  generated_by INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, id), UNIQUE (company_id, client_id, period),
  FOREIGN KEY (company_id, generated_by) REFERENCES demo_users(company_id, id)
);
CREATE TABLE financial_counters (
  company_id INTEGER NOT NULL REFERENCES companies(id),
  year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 9999),
  last_number INTEGER NOT NULL CHECK (last_number > 0),
  PRIMARY KEY (company_id, year)
);
CREATE TABLE financial_invoices (
  id UUID PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  client_id INTEGER NOT NULL CHECK (client_id > 0),
  period TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sequence_year INTEGER NOT NULL,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  number TEXT NOT NULL,
  review_hash TEXT NOT NULL CHECK (review_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL,
  total_cents BIGINT NOT NULL,
  issued_by INTEGER NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  UNIQUE (company_id, client_id, period),
  UNIQUE (company_id, sequence_year, sequence_number), UNIQUE (company_id, id),
  FOREIGN KEY (company_id, issued_by) REFERENCES demo_users(company_id, id),
  CHECK ((snapshot->>'totalCents')::bigint = total_cents)
);

CREATE FUNCTION public.financial_document_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Documento emitido é imutável' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER financial_invoices_immutable BEFORE UPDATE OR DELETE ON financial_invoices
FOR EACH ROW EXECUTE FUNCTION public.financial_document_immutable();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financial_drafts', 'financial_counters', 'financial_invoices'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::integer) WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::integer)', t);
  END LOOP;
END;
$$;
GRANT SELECT, INSERT, UPDATE ON financial_drafts, financial_counters TO fonsat_app;
GRANT SELECT, INSERT ON financial_invoices TO fonsat_app;
