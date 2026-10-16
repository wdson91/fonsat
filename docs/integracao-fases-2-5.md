# Integração operacional — fases 2 a 5

Implementação em curso nesta conversa. Não alterar ficheiros de `invoices/`, nem incluí-los nos commits desta entrega: pertencem à conversa paralela das fases 6 e 7.

- Fonte real: `backend/src/billing/operational-invoice-source.ts`, classe `OperationalInvoiceSource`, exportada por `BillingModule`. Implementa `InvoiceSource` sem SQL de domínio: clientes, vínculo explícito `Client.userId`, versões atuais e preços com vigência.
- Os writes de catálogo, sincronização e correção chamam `lockCompanyFinance` dentro da transação. A emissão deve usar o mesmo lock. Não resolve autorização nem substitui `expectedVersion`.
- Fase 5 tem rascunho recalculável via `POST /api/billing/drafts`, modelo Prisma `BillingDraft`/tabela `billing_drafts`; exclusões imutáveis via `POST /api/billing/drafts/:id/exclusions`, associadas ao rascunho, com motivo e auditoria. Uma exclusão só vale para esse rascunho/mês.
- O cálculo usa `computeInvoice` da implementação financeira paralela. O histórico de emitidas é lido através do modelo Prisma `IssuedFinancialDocument`, mapeado à tabela `financial_invoices` da migração 006. Assim, trabalho faturado não reaparece como novo.
- A ligação da emissão deve consumir o rascunho operacional e as suas exclusões. `InvoicesService.compute` ainda usa apenas `source.entries(tx, companyId)` e, por isso, não recebe o contexto de exclusões de um mês. Não ligar a emissão de um rascunho excluído sem alinhar esse contrato.
- Ficheiros da entrega operacional: `catalog/`, `planning/`, `attendance/`, `billing/`, migrações 001–003 de 20261016, componentes `operations`, `worker-clock`, `team` e `billing`.

Validação final e limitações serão registadas em `docs/fases-2-5.md`.
