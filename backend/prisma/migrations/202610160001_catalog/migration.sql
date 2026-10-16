CREATE TABLE trades (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), name TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT true, UNIQUE(company_id,id), UNIQUE(company_id,name)
);
CREATE TABLE clients (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), name TEXT NOT NULL,
 tax_id TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT true, UNIQUE(company_id,id), UNIQUE(company_id,name)
);
ALTER TABLE sites ADD COLUMN client_id INTEGER, ADD COLUMN location TEXT NOT NULL DEFAULT '', ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sites ADD FOREIGN KEY(company_id,client_id) REFERENCES clients(company_id,id);
CREATE TABLE workers (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), name TEXT NOT NULL,
 trade_id INTEGER NOT NULL, user_id INTEGER UNIQUE, active BOOLEAN NOT NULL DEFAULT true,
 UNIQUE(company_id,id), UNIQUE(company_id,name), UNIQUE(company_id,user_id),
 FOREIGN KEY(company_id,trade_id) REFERENCES trades(company_id,id),
 FOREIGN KEY(company_id,user_id) REFERENCES demo_users(company_id,id)
);
CREATE TABLE allocations (
 id SERIAL PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), worker_id INTEGER NOT NULL,
 site_id INTEGER NOT NULL, trade_id INTEGER, day DATE NOT NULL, changed_by INTEGER NOT NULL, changed_at TIMESTAMP(3) NOT NULL,
 UNIQUE(company_id,id), UNIQUE(company_id,worker_id,day),
 FOREIGN KEY(company_id,worker_id) REFERENCES workers(company_id,id),
 FOREIGN KEY(company_id,site_id) REFERENCES sites(company_id,id),
 FOREIGN KEY(company_id,trade_id) REFERENCES trades(company_id,id),
 FOREIGN KEY(company_id,changed_by) REFERENCES demo_users(company_id,id)
);
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON trades USING (company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK (company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON trades TO fonsat_app;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clients USING (company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK (company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO fonsat_app;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workers USING (company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK (company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON workers TO fonsat_app;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON allocations USING (company_id = nullif(current_setting('app.company_id',true),'')::integer) WITH CHECK (company_id = nullif(current_setting('app.company_id',true),'')::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON allocations TO fonsat_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO fonsat_app;
