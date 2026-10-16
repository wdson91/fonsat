CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE clients ADD COLUMN user_id INTEGER UNIQUE;
ALTER TABLE clients ADD UNIQUE(company_id,user_id);
ALTER TABLE clients ADD FOREIGN KEY(company_id,user_id) REFERENCES demo_users(company_id,id);
CREATE TABLE rates (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), client_id INTEGER NOT NULL, trade_id INTEGER NOT NULL,
 cents INTEGER NOT NULL CHECK(cents >= 0), starts_on DATE NOT NULL, ends_on DATE,
 UNIQUE(company_id,id), CHECK(ends_on IS NULL OR ends_on >= starts_on),
 FOREIGN KEY(company_id,client_id) REFERENCES clients(company_id,id), FOREIGN KEY(company_id,trade_id) REFERENCES trades(company_id,id),
 EXCLUDE USING gist(company_id WITH =,client_id WITH =,trade_id WITH =,daterange(starts_on,ends_on,'[]') WITH &&)
);
CREATE TABLE billing_drafts (
 id UUID PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id),client_id INTEGER NOT NULL,
 period TEXT NOT NULL CHECK(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), snapshot JSONB NOT NULL,
 generated_by INTEGER NOT NULL, generated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,id), UNIQUE(company_id,client_id,period),
 FOREIGN KEY(company_id,client_id) REFERENCES clients(company_id,id), FOREIGN KEY(company_id,generated_by) REFERENCES demo_users(company_id,id)
);
CREATE TABLE draft_exclusions (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id),draft_id UUID NOT NULL,entry_id UUID NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),author_id INTEGER NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,draft_id,entry_id), FOREIGN KEY(company_id,draft_id) REFERENCES billing_drafts(company_id,id),
 FOREIGN KEY(company_id,entry_id) REFERENCES work_entries(company_id,id), FOREIGN KEY(company_id,author_id) REFERENCES demo_users(company_id,id)
);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON draft_exclusions FOR EACH ROW EXECUTE FUNCTION public.reject_fact_change();
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rates USING(company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK(company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT,INSERT ,UPDATE ON rates TO fonsat_app;
ALTER TABLE billing_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_drafts USING(company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK(company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT,INSERT ,UPDATE ON billing_drafts TO fonsat_app;
ALTER TABLE draft_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON draft_exclusions USING(company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK(company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT,INSERT  ON draft_exclusions TO fonsat_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO fonsat_app;
