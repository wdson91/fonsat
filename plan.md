# FONSAT — Plano de implementação por fases com TDD

## 1. Objetivo e decisões fechadas

Implementar o caminho **distribuição → marcação → correção → faturação → explicação**, com isolamento entre empresas e histórico de commits que mostre entregas progressivas.

O plano parte do v2.1 e do enunciado, usando o mesmo modo de seleção de utilizadores do projeto `fonsat/`, sem login real, e incluindo funcionamento offline após reabrir a aplicação e correções que transferem trabalho entre clientes.

Referência: :codex-file-citation{path="C:/Users/Danrlei/Downloads/fonsat-20261014T195059Z-1-001/fonsat/FONSAT - Exercicio Tecnico (Parte 2).pdf" purpose="source"}

**Escolhas confirmadas:**

- Next.js, NestJS, TypeScript, Prisma e PostgreSQL.
- Docker Compose para execução reproduzível.
- Ecrã «Quem está a usar?» com utilizadores de demonstração agrupados por empresa, nome e papel, e seletor para trocar de utilizador no topo, como no projeto `fonsat/`.
- Interface baseada nos cinco mockups.
- TDD em ciclos pequenos e commits com testes passando.
- Sem login, senhas, sessões de autenticação, cadastro público, recuperação por email, deploy ou CI nesta entrega.

## 2. Organização técnica e método de trabalho

**Estrutura:** monorepositório com npm workspaces; frontend em `frontend/`, backend em `backend/`. NestJS concentra autorização, regras de negócio e persistência. Next.js apresenta os dados e gere a experiência offline.

**Testes:** Vitest para regras e integração; Supertest para API; Playwright para fluxos no navegador. Integração, isolamento e concorrência usam PostgreSQL real e separado dos dados de demonstração. Essas ferramentas têm integração documentada com [NestJS](https://docs.nestjs.com/fundamentals/testing) e [Next.js](https://nextjs.org/docs/app/guides/testing/playwright).

**Ciclo de cada comportamento:**

1. Escrever um teste que descreva um resultado observável.
2. Executá-lo e confirmar que falha pela ausência do comportamento.
3. Implementar o necessário para passar.
4. Refatorar mantendo os testes verdes.
5. Executar as verificações afetadas e fazer o commit.

Não criar todos os testes antecipadamente. Fixtures e migrations evoluem com cada funcionalidade. TDD concentra-se nas regras, permissões, persistência e fluxos; ajustes de espaçamento e cor recebem verificação visual.

**Histórico Git:**

- Commits pequenos por comportamento concluído; uma fase pode conter vários.
- Teste e implementação entram juntos no commit.
- Mensagens descrevem a regra entregue e, quando útil, o cenário validado.
- Refatorações relevantes ficam separadas das mudanças de comportamento.
- Preservar o histórico real, incluindo correções; não reconstruir commits posteriormente para simular TDD.

Exemplo:

```text
feat(attendance): aceita reenvio da mesma marcação sem duplicar

Valida reenvio após perda da resposta do servidor.
Preserva a marcação original e devolve confirmação ao dispositivo.
```

## 3. Fases de implementação

### Fase 0 — Repositório, ambiente e primeiro teste

**Implementar:** iniciar Git, preservar os documentos de planeamento e mockups, preparar workspaces, Docker, migrations e ferramentas de teste. Fixar dependências no lockfile.

**Verificar:** um teste HTTP real confirma que a API arranca e comunica com o banco. Disponibilizar:

```text
docker compose up --build
docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
```

O primeiro prepara a aplicação e dados iniciais; o segundo executa as verificações num ambiente isolado. Reiniciar a aplicação não apaga nem duplica dados.

**Commits sugeridos:** `docs: regista plano e decisões iniciais`, `chore: prepara aplicação e ambiente de testes`.

**Concluída quando:** um checkout limpo arranca e executa o primeiro teste pelos comandos documentados.

### Fase 1 — Seleção de utilizador, identidade e isolamento

**Testes primeiro:** lista de utilizadores agrupada por empresa; seleção dos quatro papéis; troca e limpeza da seleção; recuperação da escolha após recarregar; cabeçalho de utilizador ausente ou desconhecido; tentativa de forjar papel ou empresa; tentativa de consultar ou alterar dados de outra empresa.

**Implementar:**

- Ecrã «Quem está a usar?» com cartões agrupados por empresa e seletor «Trocar de utilizador» no topo. Usar `fonsat/frontend/src/shared/UserPicker.tsx` como referência de comportamento.
- `GET /api/demo-users` devolve apenas os dados de demonstração necessários ao seletor: identificador, nome, papel e identificação/nome da empresa. Esta listagem intencional das duas empresas não expõe os seus dados operacionais.
- Guardar o identificador selecionado no browser e enviá-lo no cabeçalho `X-User-Id`. `GET /api/me` devolve a identidade resolvida no servidor. Sem identificador ou com identificador desconhecido, as operações de negócio devolvem 401 e a interface pede nova seleção.
- Uma empresa e um dos quatro papéis por utilizador previamente criado nos dados de demonstração; email não é necessário para selecionar utilizadores.
- O servidor resolve empresa, papel e âmbito a partir do utilizador escolhido; não aceita estes valores como autoridade fornecida pelo browser. A seleção simula a identidade para a demonstração; as permissões e o isolamento dos dados operacionais continuam a ser aplicados.
- Chaves estrangeiras compostas e Row-Level Security nas tabelas de negócio. Contexto da empresa limitado à transação; conexão da aplicação sem privilégios para contornar as políticas. [Referência PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- Resolver o identificador do utilizador antes de abrir o contexto empresarial, com acesso limitado aos dados necessários à identidade e ao seletor. Não criar tabelas de credenciais ou sessões de autenticação.
- Ao trocar ou limpar a seleção, limpar o estado visível e os caches de consultas do utilizador anterior. Respostas de pedidos antigos não podem atualizar o ecrã do novo utilizador.

**Commits sugeridos:** `feat(identity): seleciona utilizadores de demonstração`, `feat(tenancy): isola dados por empresa`.

**Concluída quando:** os quatro papéis podem ser selecionados e trocados sem login, cada um vê apenas a operação permitida, e um teste de banco comprova isolamento mesmo numa consulta sem filtro explícito de empresa.

### Fase 2 — Cadastros e distribuição semanal

**Testes primeiro:** atribuir trabalhador livre; impedir edição de obra alheia; impedir alteração da grelha no passado; copiar semana respeitando permissões; usar ofício alternativo.

**Implementar:** cadastros mínimos de trabalhadores, ofícios, clientes e obras; responsabilidade por obra com vigência; grelha semanal e cópia da semana anterior. Cadastros administrativos têm formulários simples; não acrescentar gestão de contas.

A cópia preenche células vazias elegíveis e informa as que não foram copiadas. Divergências entre planeamento e marcações são avisos. Alterações de planeamento não reescrevem registos existentes.

**Commits sugeridos:** `feat(catalog): gere cadastros da empresa`, `feat(planning): distribui trabalhadores por semana`.

**Concluída quando:** o encarregado gere as suas obras pela interface e o administrativo gere todas as obras da empresa.

### Fase 3 — Marcações e primeiro fluxo do trabalhador

**Testes primeiro:** entrada e saída; reenvio duplicado; saída recebida antes da entrada; pausa; marcação fora da distribuição; turno atravessando meia-noite.

**Implementar:**

- Captura online e fila persistente em IndexedDB desde esta fase.
- UUID da marcação e identificador do turno gerados no dispositivo, permitindo relacionar entrada e saída sem depender da ordem de chegada.
- API de sincronização com confirmação individual; remover da fila apenas itens confirmados.
- Factos imutáveis e primeira versão do período trabalhado.
- Ecrã móvel com obra sugerida, botão de ponto, horas e estado de sincronização.

Marcações autorizadas com anomalias de negócio são preservadas. Payload inválido, identidade indevida e referências de outra empresa são recusados. O mesmo UUID com conteúdo diferente gera conflito, sem sobrescrever o original.

**Commits sugeridos:** `feat(attendance): regista turnos com idempotência`, `feat(worker): apresenta ponto e fila local`.

**Concluída quando:** um trabalhador regista um turno pelo navegador e reenvios não duplicam horas.

### Fase 4 — Correções, versões e pendências

**Testes primeiro:** motivo obrigatório; original preservado; trabalhador sem permissão para corrigir; encarregado fora do âmbito; duas correções concorrentes; marcação tardia após correção manual.

**Implementar:** novas versões imutáveis, auditoria e painel de pendências. Correções enviam a versão esperada; conflito exige atualizar o ecrã antes de repetir. Uma marcação tardia nunca substitui silenciosamente uma correção manual.

O encarregado precisa de responsabilidade ativa sobre as obras envolvidas. Transferências entre clientes ficam reservadas ao administrativo.

**Commits sugeridos:** `feat(attendance): corrige registos com histórico`, `feat(team): apresenta equipa e pendências`.

**Concluída quando:** uma saída esquecida pode ser resolvida e a interface explica quem corrigiu, quando e porquê.

### Fase 5 — Preços e rascunho de faturação

**Testes primeiro:** mudança de preço a meio do mês; ofício exercido; vigências sobrepostas; preço ausente; registo incompleto; exclusão; registo tardio; arredondamento por linha.

**Implementar:** preços com vigência, motor de cálculo independente da interface e rascunho por cliente/mês. Agrupar por obra, ofício e preço; incluir trabalho anterior ainda não faturado.

Bloqueios aparecem explicitamente. Exclusões exigem motivo, ficam associadas ao rascunho e tornam o registo elegível num período posterior.

**Commits sugeridos:** `feat(pricing): define preços por vigência`, `feat(billing): calcula rascunho com bloqueios`.

**Concluída quando:** o administrativo consegue gerar e verificar um rascunho com valores e bloqueios explicáveis.

### Fase 6 — Emissão imutável e explicação

**Testes primeiro:** emissão repetida; duas emissões simultâneas; falha a meio da transação; rascunho desatualizado; alteração posterior de nomes, preços e registos; acesso do cliente.

**Implementar:**

- Emissão atómica com contador transacional por empresa/ano, snapshots e identificação dos registos faturados.
- Serialização das operações que disputam o estado financeiro da empresa, incluindo correções relevantes.
- Revalidação antes de emitir; alterações desde a revisão devolvem conflito para nova confirmação.
- Snapshot dos valores, nomes, preços, versões e justificações necessários à explicação.
- Ecrã de fatura e detalhe das linhas; cliente vê apenas documentos emitidos que lhe pertencem.

**Commits sugeridos:** `feat(billing): emite faturas atomicamente`, `feat(invoices): explica valores emitidos`.

**Concluída quando:** a fatura continua igual após mudanças nos dados de origem, e concorrência não duplica cobrança.

### Fase 7 — Ajustes sucessivos e transferência entre clientes

**Testes primeiro:** correção após emissão; segunda correção após ajuste faturado; correção desfeita; mudança de ofício; mudança de cliente; documento apenas com ajustes; diferenças de arredondamento.

**Implementar:** histórico financeiro imutável que distingue o que já foi efetivamente faturado do que ainda está pendente, por cliente e origem.

O ajuste monetário será:

```text
total corrigido arredondado − total acumulado já faturado
```

A comparação mantém os grupos e referências de origem. A explicação apresenta versões retiradas e acrescentadas, incluindo eventual efeito do arredondamento.

Na transferência entre clientes, cada lado mantém o seu estado: crédito ao cliente original e débito ao novo. Emitir um lado não elimina a obrigação do outro. Um cliente não recebe acesso aos documentos do outro.

**Commits sugeridos:** `feat(billing): liquida ajustes sem repetição`, `feat(billing): transfere cobrança entre clientes`.

**Concluída quando:** gerar meses sucessivos não repete ajustes e os saldos fecham ao cêntimo.

### Fase 8 — Reabertura offline e troca de utilizador

**Testes primeiro:** primeiro acesso online seguido de reabertura offline com o último utilizador selecionado; fechar navegador com fila pendente; reconexão; resposta perdida; seleção ausente ou inválida; troca de utilizador com marcações pendentes e durante uma sincronização já iniciada; retorno ao utilizador original.

**Implementar:** service worker para a estrutura da aplicação e persistência da última seleção válida e dos dados mínimos do trabalhador. Após uma primeira utilização online, permitir reabrir offline com esse contexto guardado. Fila e dados locais separados por empresa/utilizador; sincronização automática ao recuperar conexão e alternativa manual.

Sem seleção válida, apresentar o seletor e preservar as marcações pendentes. Ao trocar ou limpar a seleção, deixar de apresentar os dados e de iniciar envios da fila anterior; a fila fica guardada para quando o utilizador original voltar a ser selecionado. Outro utilizador não vê nem envia essas marcações.

Cada sincronização fixa o contexto da empresa/utilizador da sua fila antes de operações assíncronas e envia o `X-User-Id` desse contexto, sem reler a seleção global durante o envio. Um pedido já iniciado mantém a identidade original; a confirmação só remove itens da fila correspondente e não atualiza o ecrã de outro utilizador. Se o servidor recusar o identificador, manter os itens e pedir nova seleção válida, sem os transferir para outra pessoa.

**Commits sugeridos:** `feat(offline): permite reabrir ponto sem rede`, `fix(offline): preserva autoria durante troca de utilizador`.

**Concluída quando:** o fluxo passa no navegador com rede desligada e após recarregamento, usando build de produção, e trocar de utilizador durante a sincronização não altera a autoria nem mistura dados ou filas.

### Fase 9 — Demonstração, revisão visual e entrega

**Implementar:** completar dados das duas empresas, rever os cinco ecrãs, estados vazios, erros, carregamento e navegação por papel.

Preparar roteiro: seleção de empresa/utilizador → distribuição → ponto offline → correção → preço → rascunho → emissão → explicação → ajuste posterior → troca de utilizador e demonstração de isolamento.

Finalizar README, plano de implementação e `DECISOES.md` com até duas páginas. Registar limitações reais e preservar documentos de desenvolvimento. Ensaiar uma pequena alteração de regra com teste antes do código.

**Commits sugeridos:** `test(e2e): cobre demonstração completa`, `docs: documenta execução e decisões finais`.

**Concluída quando:** o projeto funciona num ambiente limpo, a suíte completa passa e o roteiro pode ser demonstrado sem alterações manuais no banco.

## 4. Contratos e regras que complementam o v2.1

- **Identidade de demonstração:** `GET /api/demo-users` alimenta o seletor e `GET /api/me` resolve o utilizador indicado em `X-User-Id`. Não há login, senha ou sessão autenticada; nenhuma operação de negócio aceita papel ou empresa como autoridade enviada pelo browser.
- **Sincronização:** marcação inclui UUID, turno, tipo, obra e instante com offset. O servidor associa o trabalhador ao utilizador resolvido por `X-User-Id` e guarda a hora de receção. O cliente fixa a identidade de origem da fila para cada envio, mesmo que a seleção mude entretanto.
- **Tempo:** preservar timestamps originais; normalizar os extremos do cálculo ao minuto por truncagem, sem arredondamento adicional da duração. Dia e preço seguem o início do turno no fuso da empresa.
- **Desvios:** demora de receção pode decorrer de offline; apresentar como atraso de sincronização, sem afirmar que prova erro no relógio.
- **Dinheiro:** minutos e cêntimos inteiros, aritmética exata e arredondamento por linha. Ajustes usam diferença de totais arredondados.
- **Faturas:** uma por cliente/mês; documentos apenas com ajustes podem ter total negativo neste exercício, sem pretensão de certificação fiscal.
- **Interface:** o contexto vem do seletor de utilizadores agrupados por empresa, como no projeto `fonsat/`; o servidor resolve o papel e o âmbito. Os mockups orientam a apresentação; indicadores de atraso horário são omitidos porque a distribuição não define horários.

## 5. Critério de entrega e prioridade

Cada fase termina com comportamento demonstrável, testes pertinentes passando e commits feitos durante o trabalho.

A aceitação final exige:

- Seleção e troca dos quatro papéis sem login, com identidade resolvida no servidor.
- Isolamento entre empresas e permissões comprovados na API e no banco.
- Marcações offline preservadas e sincronizadas sem duplicação nem mudança de autoria ao trocar de utilizador.
- Faturas reproduzíveis ao cêntimo, mesmo após correções posteriores.
- Ajustes sucessivos e entre clientes contabilizados uma única vez.
- Arranque e testes pelos comandos documentados.
- Histórico legível e código que consigas explicar e alterar.

A ordem protege primeiro identidade, integridade e faturação. Se o tempo apertar, reduzir acabamentos e conveniências de cadastro; qualquer funcionalidade incompleta deve ficar explicitamente registada na entrega.
