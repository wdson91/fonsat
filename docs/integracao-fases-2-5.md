# Integração operacional — fases 2 a 5

Contratos entre os módulos operacionais das fases 2–5 e os módulos financeiros das fases 6–7, implementados em paralelo.

- Fonte real: `backend/src/billing/operational-invoice-source.ts`, classe `OperationalInvoiceSource`, exportada por `BillingModule`. Implementa `InvoiceSource` sem SQL de domínio: clientes, vínculo explícito `Client.userId`, versões atuais e preços com vigência.
- Os writes de catálogo, sincronização e correção chamam `lockCompanyFinance` dentro da transação. A emissão deve usar o mesmo lock. Não resolve autorização nem substitui `expectedVersion`.
- Fase 5 tem rascunho recalculável via `POST /api/billing/drafts`, modelo Prisma `BillingDraft`/tabela `billing_drafts`; exclusões imutáveis via `POST /api/billing/drafts/:id/exclusions`, associadas ao rascunho, com motivo e auditoria. Uma exclusão só vale para esse rascunho/mês.
- O cálculo usa `computeInvoice` da implementação financeira paralela. O histórico de emitidas é lido através do modelo Prisma `IssuedFinancialDocument`, mapeado à tabela `financial_invoices` da migração 006. Assim, trabalho faturado não reaparece como novo.
- A emissão já consome as exclusões operacionais através de `source.exclusions(tx, clientId, period)`. `InvoicesService.compute` copia motivos, autores e datas para o snapshot e inclui as exclusões na confirmação do conteúdo. O módulo principal usa `InvoicesModule.withSource` com o adaptador real exportado pelo `BillingModule`. Os seis testes de `invoices-operational.test.ts` passaram com PostgreSQL real, incluindo exclusão após revisão, emissão parcial e recuperação do registo no mês seguinte.
- Ficheiros da entrega operacional: `catalog/`, `planning/`, `attendance/`, `billing/`, migrações 001–004 de 20261016, componentes `operations`, `worker-clock`, `team` e `billing`.

Validação executada e âmbito registados em `docs/fases-2-5.md`.
