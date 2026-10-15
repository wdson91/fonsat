# FONSAT — Assiduidade e faturação

Implementação em Next.js, NestJS, TypeScript, Prisma e PostgreSQL. O desenvolvimento começa pela base executável e pela seleção de utilizadores com isolamento entre empresas.

## Organização

- `frontend/`: aplicação Next.js.
- `backend/`: API NestJS e persistência Prisma.
- `ecras/`: cinco referências visuais do produto.
- `plan.md`: plano por fases; a estrutura de execução usa `frontend/` e `backend/`.
- `plano_conceitual_v2.md`: referência conceptual original.
- `docs/enunciado.pdf`: enunciado oficial do exercício.
- Os restantes documentos originais são preservados como histórico de planeamento.

A pasta local `fonsat/` contém o projeto anterior usado como referência de comportamento e não integra esta implementação.

## Primeira entrega

Preparar o ambiente reproduzível e implementar «Quem está a usar?», seleção dos quatro perfis, identidade resolvida no servidor e isolamento entre empresas. A seleção é própria de uma demonstração sem login.

O histórico será construído com commits durante o desenvolvimento, por entrega validada. As fases de distribuição, marcações e faturação serão implementadas em entregas posteriores.

A primeira entrega está concluída. As instruções e os resultados de validação estão abaixo e em `docs/progresso.md`.

## Executar

Requisito: Docker com Compose. Na raiz do repositório:

```bash
docker compose up --build
```

Frontend: http://localhost:3000. API: http://localhost:3001/api/health. Os dados ficam num volume próprio; o arranque aplica migrações e carrega os exemplos sem duplicá-los. As credenciais padrão são exclusivas da demonstração local e podem ser substituídas com `.env`, a partir de `.env.example`.

```bash
docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
```

Os testes usam outro projeto Compose e PostgreSQL efémero, sem portas publicadas, independente dos dados da demonstração. Para libertar os recursos de teste depois da execução: `docker compose -f compose.test.yml down`.

## Desenvolvimento local

Node 22.12 ou superior da série 22, npm e PostgreSQL 16. O banco deve ter o papel `fonsat_app` preparado pelo script `db/init/01-app-role.sh`; no arranque por Docker isso é automático. Na raiz: `npm ci` e `npm run db:generate`. Configurar `DATABASE_URL` para o papel de aplicação e `ADMIN_DATABASE_URL` para migrações/dados; depois executar `npm run db:migrate` e `npm run db:seed`. Em terminais separados: `npm run dev:backend` e `npm run dev:frontend`.

`npm run build` compila as duas aplicações. `npm run typecheck` valida os tipos. A conexão do backend usa um papel distinto do proprietário das tabelas. A conta de migrações é usada pelo serviço `setup`, separado da API.

## Selecionar utilizadores

O ecrã «Quem está a usar?» agrupa os utilizadores por empresa. Na FONSAT, João Silva é trabalhador, Carlos Mendes e Rita Santos são encarregados, Sofia Ramos é administrativa, Mota Obras e Teixeira Construções são clientes. Na Construções Horizonte existem perfis equivalentes.

A escolha fica guardada no browser e pode ser trocada no topo ou limpa em «Escolher outro utilizador». A identidade é enviada em `X-User-Id`; a API resolve o papel e a empresa. O administrativo vê as obras da empresa, e cada encarregado só as obras sob a sua responsabilidade ativa. As duas empresas têm obras de nomes iguais para tornar o teste de isolamento mais evidente.

Nesta entrega, o trabalhador e o cliente têm o seu ambiente de entrada. O registo de ponto e a consulta de faturas ainda não estão implementados. As regras da identidade e do banco estão em [docs/identidade-e-isolamento.md](docs/identidade-e-isolamento.md).

## Testes no navegador

Com a aplicação em execução e as dependências npm instaladas:

```bash
npx playwright install chromium
npm run test:e2e
```

Validam os quatro perfis, seleção por teclado, persistência após reload, troca entre empresas, 404 por identificador de outra empresa e layout móvel. Os testes desta fase não emitem documentos nem apagam dados operacionais. Relatórios, screenshots e traces ficam em `frontend/playwright-report` e `frontend/test-results`, fora do Git. Para usar um Chromium já instalado, definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE` com o caminho do executável.

## Histórico para revisão

```bash
git log --reverse --oneline
```

O histórico local foi reorganizado em commits menores por responsabilidade após a revisão do tamanho das entregas. O histórico original está preservado na branch `backup/entrega-1-antes-da-divisao`. Esta divisão organiza alterações já existentes para revisão; os resultados dos testes correspondem à versão final. Nas próximas entregas, cada comportamento será concluído, validado e registado num commit pequeno antes de começar o seguinte. O estado e a validação estão em [docs/progresso.md](docs/progresso.md).
