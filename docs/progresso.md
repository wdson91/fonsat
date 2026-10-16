# Progresso de implementação

## Entrega 1 — Fases 0 e 1 concluídas

Validação executada em 15 de outubro de 2026.

### Entregue

- `frontend/`: Next.js e TypeScript, seletor «Quem está a usar?», pessoas agrupadas por empresa e troca de utilizador no topo.
- `backend/`: NestJS, Prisma e PostgreSQL, identidade resolvida no servidor a partir de `X-User-Id`.
- Duas empresas e 12 utilizadores fictícios, cobrindo trabalhador, encarregado, administrativo e cliente.
- Seleção persistida no browser, recuperação após reload, limpeza dos dados visíveis ao trocar e descarte de respostas antigas.
- Obras reais do exemplo: o administrativo vê as da sua empresa; cada encarregado só as da sua responsabilidade ativa. Trabalhador e cliente têm o seu ambiente de entrada, sem operações de obras.
- RLS por transação, referências compostas, papel da aplicação sem privilégios de proprietário ou BYPASSRLS e contexto separado em operações concorrentes.
- Migrações, seed idempotente, Docker Compose e base de testes efémera independente da demonstração.
- Código formatado para facilitar a leitura e alteração durante a revisão.

### Resultados

- 31 testes de backend com PostgreSQL 16 real: passaram.
- 17 testes de frontend: passaram.
- 8 testes Playwright com Chromium real: passaram contra o build de produção em Docker, incluindo os quatro perfis, teclado, reload, troca entre empresas e layout móvel.
- Tipos e build de produção das duas aplicações: passaram.
- `docker compose up --build -d`: passou; frontend na porta 3000 e API na 3001.
- `docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from tests`: terminou com código 0. Na execução final, o banco efémero foi iniciado de novo e aplicou as duas migrações desde zero.
- Vista móvel a 390 px inspecionada, sem scroll horizontal. Screenshots e relatório ficam nos artefactos locais do Playwright, fora do Git.

Os testes de RLS provocam deliberadamente erros de política e de chave estrangeira no log do PostgreSQL; a suite verifica que essas tentativas são recusadas.

### Histórico

Os cinco commits originais foram reorganizados em unidades menores por responsabilidade a pedido do utilizador. O histórico anterior está preservado na branch `backup/entrega-1-antes-da-divisao`. A importação inicial dos requisitos foi mantida.

Esta divisão organiza alterações já existentes para revisão; as datas dos novos commits são as da reorganização. Os resultados de validação registados acima correspondem à versão final. A execução original do primeiro teste de `/api/demo-users` continua documentada no histórico preservado.

Nas próximas entregas: um comportamento por commit, normalmente poucos ficheiros, com a validação pertinente antes de avançar. Formatar o código antes do commit da funcionalidade; manter refatorações separadas. Lockfiles gerados e importações de documentos podem ser maiores e não são repartidos artificialmente.

### Próximas fases

Cadastros operacionais completos e distribuição semanal; depois marcações e fila offline, correções, preços, faturação e ajustes. Não há autenticação real nesta entrega: a seleção de pessoas é uma simulação de identidade para o exercício, conforme o plano.

### Nota de ferramentas

A consulta `npm audit --omit=dev` efetuada durante a instalação reportou alertas transitivos do CLI Prisma 7.10.0 em `deepmerge-ts` e `mysql2`. A aplicação usa o adaptador PostgreSQL; o CLI é usado nas migrações e no seed. Não foi aplicado `npm audit fix --force`, que propunha uma troca de versão principal. Estes alertas ficam registados para revisão das dependências antes de uma entrega de produção.

## Entrega 2 — Fases 2 a 5

Validação de 16 de outubro de 2026: cadastros, distribuição semanal, ponto com fila IndexedDB, correções versionadas, pendências, preços e rascunhos foram implementados em commits por comportamento. A separação `PrismaService`/`TenantService` foi concluída mantendo RLS.

A verificação conjunta do checkout passou com 92 testes backend, 24 frontend, tipos e builds de produção. Os 8 cenários Chromium de identidade e os 4 operacionais passaram, incluindo captura sem rede, persistência da fila, troca de pessoa e conflito de correção. Os 2 cenários financeiros passaram na repetição dirigida após a correção paralela da expansão da explicação. A validação e o âmbito estão em [fases-2-5.md](fases-2-5.md). Emissão e ajustes são da implementação paralela das fases 6/7.

## Entrega 3 — Fases 6 e 7

Emissão atómica e imutável, contador por empresa/ano, revalidação do conteúdo revisto e snapshots de valores, nomes, preços, versões, correções e exclusões. Ajustes sucessivos usam o total corrigido arredondado menos o acumulado efetivamente faturado, por origem e cliente. Transferências mantêm o crédito e o débito independentes. O cliente consulta apenas os seus documentos emitidos, com detalhe das linhas.

Integração comprovada com as fontes reais das fases 2 a 5. A suíte conjunta passou com 92 testes backend e 24 frontend; tipos, builds e os 2 cenários Chromium financeiros passaram. Migrações limpas, rollback, concorrência, isolamento e vista móvel foram verificados. Contratos, regras e evidência em [fases-6-7.md](fases-6-7.md).

## Entrega 4 — Fases 8 e 9 e grelha de períodos

Reabertura offline após a preparação online, fila por empresa/utilizador, retoma automática, confirmação por evento e preservação de autoria durante a troca de pessoa. O trabalhador dispõe da grelha pedida na revisão: intervalos por dia, Trabalho/Pausa, horas e localização, com Adicionar e formulário próprio. As pausas não são faturáveis.

Dados completos nas duas empresas, navegação por papel, recuperação de erros, revisão dos cinco ecrãs e roteiro integral sem alterações manuais no banco. README, decisões e plano atualizados; documentos iniciais preservados. Os erros locais de Prisma e de tabelas em falta foram corrigidos e a API local foi verificada.

Validação final de 16/10/2026: **97 testes backend, 38 frontend e 22 cenários Chromium passaram**, além de tipos, builds e execução dos dois comandos Docker Compose documentados em ambientes isolados. O ensaio offline fechou e reabriu um processo Chromium com perfil persistente. Detalhes e limites em [fases-8-9.md](fases-8-9.md); utilização em [ROTEIRO_DEMONSTRACAO.md](ROTEIRO_DEMONSTRACAO.md).
