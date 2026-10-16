# FONSAT — Assiduidade e faturação

Aplicação de demonstração multiempresa em Next.js, NestJS, TypeScript, Prisma e PostgreSQL. Implementa distribuição semanal, ponto online/offline, correções com histórico, preços, rascunhos, emissão imutável e ajustes sucessivos entre clientes. As fases 0 a 9 e a grelha de períodos pedida na revisão estão descritas em [plan.md](plan.md).

## Executar

Requisito: Docker com Compose. Na raiz:

```bash
docker compose up --build
```

Abrir http://localhost:3000. API: http://localhost:3001/api/health. O arranque aplica as migrações e prepara os exemplos num volume persistente. Credenciais e portas locais podem ser alteradas com `.env`, a partir de `.env.example`. Reiniciar preserva os factos, correções e nomes editados.

As duas empresas têm dois clientes, duas obras, três trabalhadores, dois ofícios, preços e distribuição. João Silva e André Costa têm um exemplo completo; Miguel Sousa e Nuno Ferreira têm uma saída em falta. Os exemplos operacionais ficam na semana da primeira preparação. A administração faz-se pela interface, sem editar o banco.

## Utilização

Escolher uma pessoa em «Quem está a usar?» e trocar no seletor do topo. A escolha é uma simulação de identidade; não existe login real. O servidor resolve papel, empresa e âmbito a partir de `X-User-Id`.

- **Trabalhador:** grelha semanal com cada intervalo numa linha, categoria Trabalho/Pausa, horas e obra. Adicionar abre o formulário da referência visual. Os períodos de pausa não são faturáveis. A grelha é a única forma de registo; entradas antigas abertas podem ser concluídas na própria linha.
- **Encarregado:** distribuição e equipa nas obras da sua responsabilidade ativa; corrige com motivo e versão esperada.
- **Administrativo:** cadastros, distribuição, correções, preços, exclusões, emissão e ajustes. Transferências entre clientes requerem este papel.
- **Cliente:** apenas os seus documentos emitidos e a explicação das linhas.

Uma correção nunca apaga o original. A emissão congela nomes, preços, valores, versões e justificações. Alterações posteriores entram apenas como diferença no documento seguinte. Crédito e débito de uma transferência mantêm-se independentes.

## Usar sem rede

Na primeira utilização online, escolher um trabalhador e aguardar «Ponto disponível offline neste dispositivo». Depois é possível desligar a rede, registar períodos, recarregar e fechar/reabrir o navegador com o mesmo perfil. A fila retoma automaticamente ao recuperar ligação; existe também Sincronizar agora.

Trocar ou limpar a seleção conserva a fila original. Outra pessoa não a vê nem a envia. Uma resposta perdida reenvia os mesmos UUIDs, sem duplicar factos. O cache da aplicação contém apenas a estrutura e os assets; respostas da API não são guardadas pelo service worker. Os dados mínimos e a fila ficam separados por empresa/utilizador.

Offline exige armazenamento disponível e uma primeira preparação online. Usar HTTPS ou localhost para o service worker. Limpar os dados do site ou fechar uma sessão privada pode eliminar o armazenamento local. Cadastros, administração e faturas exigem rede.

## Testes

Ambiente isolado, independente do volume da demonstração:

```bash
docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yml down
```

Com uma instalação de teste da aplicação já iniciada:

```bash
npx playwright install chromium
npm run test:e2e
```

`BASE_URL` altera o endereço do frontend; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite usar um Chromium instalado. Os testes de navegador criam factos e documentos de demonstração. Os cenários offline são executados contra o build de produção, com a rede efetivamente desligada, incluindo um perfil persistente fechado e reaberto.

Os testes HTTP e de isolamento usam PostgreSQL real; as suítes financeiras e do seed criam bases temporárias próprias. A conta indicada em `ADMIN_DATABASE_URL` no ambiente de teste precisa de permissão para as criar. Os testes de identidade usam a base inicialmente migrada, antes dos dados adicionais criados pelos cenários de navegador.

## Desenvolvimento local

Node 22.12 ou superior da série 22, npm e PostgreSQL 16. O papel `fonsat_app` é preparado por `db/init/01-app-role.sh`; pelo Compose isso é automático. Configurar `DATABASE_URL` para a conta da aplicação e `ADMIN_DATABASE_URL` para migrações e exemplos.

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:backend
# Noutro terminal:
npm run dev:frontend
```

O script do backend regenera o Prisma antes do arranque. Depois de alterar o schema com o servidor já em watch, executar novamente `npm run db:generate` e aplicar as migrações. `npm run build`, `npm run typecheck` e `npm test` verificam as duas aplicações. O build do frontend gera o service worker com os assets e a versão dessa compilação.

## Entrega e referências

- [Roteiro completo](docs/ROTEIRO_DEMONSTRACAO.md): distribuição → grelha offline → correção → preço → emissão → explicação → ajuste → isolamento.
- [Decisões](DECISOES.md): síntese de arquitetura, regras e limites.
- [Progresso e validação](docs/progresso.md), [fases 8 e 9](docs/fases-8-9.md).
- `ecras/`: cinco referências visuais; `docs/enunciado.pdf`: enunciado original.
- Os documentos de desenvolvimento estão preservados, incluindo a decisão inicial em `docs/historico/`.

Não inclui autenticação real, certificação fiscal, AT/SAF-T/IVA, integrações ERP, deploy ou CI. A pasta local `fonsat/` é o projeto anterior de referência e não integra a implementação.
