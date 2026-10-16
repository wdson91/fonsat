# Entrega — fases 2 a 5

Implementação e validação em 16/10/2026. Mantida a stack Next.js + NestJS + Prisma + PostgreSQL, seleção de pessoas sem login e RLS. Os serviços usam injeção pelo construtor e consultas Prisma; controllers delegam a lógica aos serviços. `PrismaService` trata da ligação; `TenantService` aplica o contexto empresarial dentro da transação.

## Funcionalidades

| Fase | Entrega e utilização                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | Administrativo: **Cadastros** de trabalhadores, ofícios, clientes e obras; vínculos explícitos de utilizador; responsabilidades por obra com datas. Administrativo e encarregado: **Distribuição** semanal, ofício alternativo, libertar célula e copiar a semana anterior. Células preenchidas não são sobrescritas pela cópia; dias passados e obras fora do âmbito são protegidos no servidor. |
| 3    | Trabalhador: **Relógio de ponto**, sugestão da distribuição, escolha de obra, entrada/saída, pausas por períodos separados e horas da semana. UUID de evento e turno gerados no dispositivo, fila IndexedDB por pessoa e confirmação individual. Reenvios não duplicam factos; o mesmo UUID com outro conteúdo dá conflito; saída antes da entrada e turnos noturnos são suportados.              |
| 4    | **Equipa e pendências**: ausência de entrada na distribuição do dia, registos incompletos, divergências e preço ausente. Correções exigem motivo e versão esperada, preservam factos/versões anteriores e acrescentam auditoria. Conflitos obrigam a atualizar a equipa antes de repetir. Marcações tardias após uma correção ficam para revisão e não a substituem.                              |
| 5    | **Preços e rascunhos**: preços por cliente/ofício com vigência; sobreposição recusada também no banco. Rascunho por cliente/mês, trabalho anterior por faturar, bloqueios e detalhe das linhas. Exclusões imutáveis com motivo e autor, associadas ao rascunho; o registo volta a ser elegível no período seguinte.                                                                               |

Datas e preços seguem o início do turno no fuso da empresa; o ofício é o exercido. Tempos e valores são minutos e cêntimos inteiros. O motor financeiro partilhado soma os minutos por linha e arredonda uma vez, com aritmética inteira. Planeamento nunca reescreve horas reais. O encarregado precisa de responsabilidade ativa nas obras envolvidas; transferências entre clientes requerem administrativo.

O seed acrescenta exemplos sem duplicar os identificadores e preserva vínculos comerciais ou nomes editados. A consulta de um cliente não depende do nome apresentado: usa `Client.userId`.

## API operacional

- `GET /api/catalog`, `POST /api/catalog/:kind`, `PATCH /api/catalog/:kind/:id`, `POST /api/catalog/responsibilities`.
- `GET /api/planning?week=AAAA-MM-DD`, `PUT /api/planning`, `DELETE /api/planning/:id`, `POST /api/planning/copy`.
- `GET /api/attendance/bootstrap`, `POST /api/attendance/sync`, `GET /api/attendance/entries`, `GET /api/attendance/team`, `POST /api/attendance/:id/corrections`.
- `GET/POST /api/billing/rates`, `PATCH /api/billing/rates/:id`, `POST /api/billing/drafts`, `POST /api/billing/drafts/:id/exclusions`.

## Validação executada

- Oito migrações aplicadas desde zero em PostgreSQL 16 exclusivo dos testes; seed repetido e testado após edições de cadastros.
- `npm test`: **92 testes backend e 24 frontend passaram**, incluindo os módulos financeiros desenvolvidos na conversa paralela.
- `npm run typecheck`: passou nas duas aplicações.
- `npm run build`: builds de produção NestJS e Next.js passaram.
- Chromium: os **8 cenários de identidade e os 4 cenários operacionais passaram**. Os novos cenários cobrem cadastro/grelha, captura sem rede e persistência IndexedDB após reload/troca de pessoa, correção concorrente com atualização obrigatória e preços/rascunho mensal. O ecrã de ponto foi verificado a 390 px sem transbordamento horizontal.
- Os 2 cenários Chromium financeiros também passaram na repetição dirigida após a correção paralela da expansão de uma explicação. Total: 14 cenários verificados, com os 12 de identidade/operação aprovados na execução conjunta e os 2 financeiros aprovados na repetição.
- O histórico contém commits por comportamento. Testes, tipos e builds foram executados durante a entrega; não se afirma que houve um ciclo TDD anterior a cada implementação.

Os testes do navegador criam dados, incluindo factos imutáveis e documentos nos cenários financeiros. Usar uma instalação de teste. Os testes de identidade que verificam a quantidade inicial de exemplos precisam da base inicialmente migrada e sem dados adicionais de sessões de navegador.

## Integração e âmbito

A emissão e os ajustes são desenvolvidos na conversa paralela das fases 6/7. O adaptador real e as exclusões estão ligados pelo contrato descrito em [integração](integracao-fases-2-5.md). O rascunho operacional é recalculável; a emissão mantém a sua própria revisão e confirma novamente registos, preços e exclusões.

A fila funciona sem rede com o ecrã já aberto. A reabertura integral da aplicação sem rede pertence à fase 8; esta entrega não acrescenta cache da aplicação ou service worker. O acabamento visual completo pertence à fase 9.
