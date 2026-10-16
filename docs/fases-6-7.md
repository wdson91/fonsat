# Fases 6 e 7 — emissão e ajustes

## Integração com as fases 2 a 5 em paralelo

O módulo está em `backend/src/invoices/`. Não cria cadastros, preços nem versões de registos alternativos. A integração usa `InvoiceSource`, em `invoice-source.ts`:

- `clients(tx, actor)`: clientes da empresa, resolvidos no servidor, incluindo clientes inativos com saldos por regularizar.
- `clientForUser(tx, actor)`: vínculo explícito entre o utilizador cliente e o seu cliente comercial. Não inferir pelo nome.
- `entries(tx, companyId)`: versões atuais dos registos da empresa, com nomes e preços resolvidos, incluindo registos anulados e transferidos. Nunca omitir um registo já faturado.
- `exclusions(tx, clientId, period)`: exclusões do rascunho operacional desse cliente/mês, com motivo, autor e data. São copiadas para o snapshot da fatura; não podem excluir trabalho já faturado.

Todas as leituras usam a transação recebida. O ofício é o exercido no registo; o preço e `workedOn` seguem o início do turno no fuso da empresa. Valores são minutos e cêntimos inteiros.

O módulo principal já regista `InvoicesModule.withSource({ provide: INVOICE_SOURCE, useExisting: OperationalInvoiceSource }, [BillingModule])`. O adaptador operacional encontra-se em `backend/src/billing/operational-invoice-source.ts`; resolve o cliente pelo vínculo explícito `Client.userId`, sem comparação de nomes. O provider por omissão, usado apenas quando o módulo é importado sem adaptador, devolve 503 ao tentar preparar faturação.

**Obrigatório para concorrência:** antes de ler ou alterar dados relevantes à faturação, correções, sincronização de marcações, preços e cadastros devem chamar `lockCompanyFinance(tx, companyId)` na sua transação existente. O contador, a emissão e os rascunhos usam o mesmo bloqueio por empresa. O bloqueio não substitui a verificação da versão esperada da correção.

A migração 007 acrescenta também triggers de instrução aos dados de origem, incluindo preços e exclusões, para adquirir o mesmo bloqueio antes das escritas da aplicação. As transações financeiras usam `ReadCommitted`: cada leitura posterior ao bloqueio vê o commit do pedido anterior. Um snapshot `Serializable` fixado antes de esperar pelo bloqueio impedia a resposta idempotente ao segundo pedido; esse cenário tem teste de concorrência.

## Regras financeiras

A primeira emissão associa os registos faturados no mesmo grupo a uma origem financeira estável. O grupo distingue cliente, obra, ofício, preço e vigência. Essa origem é preservada nas correções; as linhas emitidas guardam os registos e versões que compõem o total corrigido, as versões anteriores, referências aos documentos do próprio cliente e o acumulado já faturado.

Para cada origem e grupo, o valor a emitir é `arredonda(total atual de minutos × preço / 60) − soma dos cêntimos efetivamente emitidos`. A aritmética intermédia usa `bigint`; só são devolvidos inteiros seguros. Arredondar os minutos de diferença isoladamente produziria erros de cêntimos e não é utilizado.

Uma transferência conserva o crédito no cliente antigo e o débito no novo, mesmo que só um lado seja emitido. As referências e os registos apresentados num documento nunca incluem os documentos do outro cliente. Uma correção para uma data futura de trabalho já faturado bloqueia a emissão e exige revisão, evitando créditos antecipados.

## API

- `GET /api/invoices/clients`: clientes para preparar rascunhos, administrativo.
- `POST /api/invoices/drafts`: `{ clientId, period: "AAAA-MM" }`, administrativo.
- `POST /api/invoices/:id/issue`: `{ expectedHash }`, administrativo. Reenvios do mesmo pedido devolvem o documento existente.
- `GET /api/invoices` e `GET /api/invoices/:id`: administrativo ou cliente. Clientes só consultam documentos emitidos que lhes pertencem.

`expectedHash` corresponde ao conteúdo revisto. Alterações de versões, nomes, preços ou justificações devolvem 409 e exigem regenerar e rever o rascunho. Uma fatura por cliente/mês; a existência de um documento posterior impede emitir retroativamente. Um documento pode conter apenas ajustes, inclusive negativos, conforme o exercício.

O contador é por empresa/ano de emissão no fuso da empresa. A atribuição do número e a inserção de todos os snapshots acontecem na mesma transação; qualquer falha reverte ambos. Os documentos emitidos têm RLS e não podem ser alterados ou apagados pela conta da aplicação. Um trigger também impede alterações por uma conta proprietária.

## Validação

`invoice-engine.test.ts` cobre o cálculo independente da persistência, incluindo sequências de correções e transferências que fecham ao cêntimo. `invoices.test.ts` usa PostgreSQL real e um adaptador de entradas controladas para verificar emissão, concorrência, rollback, snapshots, ajustes e isolamento.

`invoices-operational.test.ts` cobre o caminho HTTP real das fases 2 a 7: cria cadastros e preços, recebe marcações, corrige versões, emite e consulta documentos, muda de ofício, desfaz correções, transfere entre clientes e adia trabalho por exclusão. Confirma que alterar uma exclusão invalida a revisão anterior e que o registo regressa no mês seguinte. Cada suíte financeira cria, migra e remove a sua própria base temporária para não poluir os dados dos testes de identidade.

No frontend, `invoices.test.tsx` verifica revisão e confirmação de emissão, detalhe de versões, permissões de apresentação, bloqueios e troca de utilizador. O painel apresenta exclusivamente os snapshots devolvidos pela API; não recalcula documentos emitidos com nomes ou preços atuais.

Resultados de 16 de outubro de 2026:

- Suíte conjunta: **92 testes backend e 24 frontend passaram**, com PostgreSQL 16 real, Node 22 e migrações aplicadas desde zero numa base isolada.
- `npm run typecheck`: passou nas duas aplicações.
- Builds de produção NestJS e Next.js: passaram.
- **2 testes Chromium financeiros passaram** contra o build de produção: emissão, correção, explicação, transferência com consulta por cliente e vista móvel a 390 px sem transbordar. A fatura com a explicação aberta foi também inspecionada visualmente.
- O teste de navegador encontrou uma expansão de detalhe herdada de outra fatura. Um teste de componente reproduziu a falha antes da correção; trocar de documento agora fecha o detalhe para o novo documento. Uma resposta de emissão perdida permite repetir a mesma confirmação.

Comando dirigido para os cenários financeiros, com a aplicação de teste já iniciada: `npm run test:e2e --workspace frontend -- invoices.spec.ts`. Os testes criam os seus próprios clientes e documentos na instalação de teste.
