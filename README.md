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

As instruções de execução e resultados de validação serão acrescentados à medida que cada entrega estiver concluída.

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

Node 22.12 ou superior da série 22, npm e PostgreSQL 16. Na raiz: `npm ci` e `npm run db:generate`. Configurar `DATABASE_URL` para o papel de aplicação e `ADMIN_DATABASE_URL` para migrações/dados; depois executar `npm run db:migrate` e `npm run db:seed`. Em terminais separados: `npm run dev:backend` e `npm run dev:frontend`.

`npm run build` compila as duas aplicações. `npm run typecheck` valida os tipos. A conexão do backend usa um papel distinto do proprietário das tabelas. A conta de migrações é usada pelo serviço `setup`, separado da API.
