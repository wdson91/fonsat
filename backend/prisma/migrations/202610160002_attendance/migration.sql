CREATE TABLE work_entries (
 id UUID PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), worker_id INTEGER NOT NULL,
 current_version INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,id), FOREIGN KEY(company_id,worker_id) REFERENCES workers(company_id,id)
);
CREATE TABLE clock_events (
 id UUID PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), entry_id UUID NOT NULL, site_id INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('in','out')), occurred_at TIMESTAMP(3) NOT NULL, received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,id), FOREIGN KEY(company_id,entry_id) REFERENCES work_entries(company_id,id), FOREIGN KEY(company_id,site_id) REFERENCES sites(company_id,id)
);
CREATE INDEX ON clock_events(company_id,entry_id);
CREATE TABLE entry_versions (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), entry_id UUID NOT NULL, number INTEGER NOT NULL CHECK(number > 0),
 site_id INTEGER NOT NULL, trade_id INTEGER NOT NULL, start_at TIMESTAMP(3), end_at TIMESTAMP(3), worked_on DATE NOT NULL,
 minutes INTEGER CHECK(minutes >= 0), source TEXT NOT NULL CHECK(source IN ('clock','manual')), reason TEXT, author_id INTEGER NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,id), UNIQUE(company_id,entry_id,number),
 FOREIGN KEY(company_id,entry_id) REFERENCES work_entries(company_id,id),
 FOREIGN KEY(company_id,site_id) REFERENCES sites(company_id,id), FOREIGN KEY(company_id,trade_id) REFERENCES trades(company_id,id),
 FOREIGN KEY(company_id,author_id) REFERENCES demo_users(company_id,id),
 CHECK(source <> 'manual' OR length(trim(reason)) > 0),
 CHECK((minutes IS NULL) OR (start_at IS NOT NULL AND end_at IS NOT NULL AND end_at >= start_at))
);
ALTER TABLE work_entries ADD CONSTRAINT current_version_exists FOREIGN KEY(company_id,id,current_version) REFERENCES entry_versions(company_id,entry_id,number) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE audit_events (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), author_id INTEGER NOT NULL,
 action TEXT NOT NULL, entity_id TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(company_id,author_id) REFERENCES demo_users(company_id,id)
);
CREATE FUNCTION public.reject_fact_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Registos imutáveis: acrescente uma nova versão.'; END $$;
ALTER TABLE work_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON work_entries USING(company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK(company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT ON work_entries TO fonsat_app;
ALTER TABLE clock_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clock_events USING(company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK(company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT ON clock_events TO fonsat_app;
ALTER TABLE entry_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON entry_versions USING(company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK(company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT ON entry_versions TO fonsat_app;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events USING(company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK(company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT ON audit_events TO fonsat_app;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON clock_events FOR EACH ROW EXECUTE FUNCTION public.reject_fact_change();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON entry_versions FOR EACH ROW EXECUTE FUNCTION public.reject_fact_change();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_fact_change();
GRANT UPDATE(current_version) ON work_entries TO fonsat_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fonsat_app;
