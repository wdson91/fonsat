# Entrega — fases 8 e 9 e grelha de períodos

Implementação em 16 de outubro de 2026. Stack e permissões das entregas anteriores preservadas.

## Ponto conforme a referência visual

A grelha semanal apresenta cada dia, horas de trabalho e de pausa, intervalos, categoria e localização. Adicionar abre Trabalho/Pausa, início/fim, início no dia seguinte e obra. O horário usa o fuso da empresa e admite turnos noturnos. A introdução manual impede sobreposição com os períodos apresentados; horas ambíguas ou inexistentes na mudança de hora não são adivinhadas.

Cada período guarda os dois eventos na mesma transação local, com um turno comum e UUIDs distintos. O backend distingue `work` e `break`; um turno não pode mudar de categoria ou misturar trabalho e pausa. Pausas aparecem no histórico mas são excluídas da fonte de faturação. As linhas não apagam nem alteram factos enviados: correções continuam sujeitas às permissões e à versão esperada.

Exemplo das imagens: 09:00–13:30 trabalho, 13:30–13:45 pausa, 13:45–14:00 trabalho, 14:00–15:00 pausa, 15:00–18:00 trabalho. Resultado: **7h45 de trabalho e 1h15 de pausa**. A distribuição não define uma meta diária de oito horas. Marcar a hora atual permanece como alternativa para capturar entrada/saída em tempo real.

## Reabertura offline e autoria

- O build gera um service worker com cache próprio da versão e todos os assets necessários. `/`, ícone e manifesto são públicos; **nenhuma resposta `/api/` entra nesse cache**. O Dockerfile publica também `frontend/public/`.
- IndexedDB guarda a última identidade de trabalhador validada, obras disponíveis e até 200 períodos recentes sem listas de factos/versões completas. A fila e o turno ativo usam a chave empresa/utilizador. O seletor público tem uma cópia mínima para abrir sem rede.
- O contexto é fixado antes de ler a fila. Trocar ou limpar a seleção cancela a autorização para novos lotes. Um pedido iniciado mantém `X-User-Id` e só confirma eventos enviados da sua própria fila; não atualiza a interface de outra pessoa.
- Apenas confirmações positivas eliminam eventos. Respostas perdidas conservam os UUIDs. Erros de identidade invalidam o contexto offline, preservam a fila e pedem nova seleção. Seleções ausentes, inválidas ou não preparadas apresentam o seletor.
- Reconexão retoma os envios; há uma tentativa periódica enquanto existem eventos e o navegador indica ligação, além de Sincronizar agora. A fila antiga é adotada apenas depois de verificar online o trabalhador e as obras da empresa.

## Demonstração e apresentação

As duas empresas têm exemplos completos: três trabalhadores, duas obras, dois clientes, dois ofícios, preços, distribuição, um registo completo e outro com saída em falta. Os exemplos usam identificadores estáveis e ficam na semana inicial; repetir o seed preserva factos, correções, nomes e vínculos editados. Um trabalhador livre permite demonstrar a atribuição pela grelha.

A navegação lateral e as áreas de trabalho seguem o papel. A apresentação usa as cinco referências em `ecras/`, com o ponto substituído pela grelha pedida nas imagens da revisão. Os estados de erro de equipa, cadastros e preços permitem tentar novamente e não continuam a mostrar carregamento permanente. A confirmação de uma correção é mantida depois da atualização da equipa.

[ROTEIRO_DEMONSTRACAO.md](ROTEIRO_DEMONSTRACAO.md) descreve o percurso sem editar o banco. README e plano apontam para a entrega atual; DECISOES.md tem uma síntese de 633 palavras, e o documento inicial foi preservado em `docs/historico/`.

## Verificações

- **97 testes backend e 38 frontend passaram**, com PostgreSQL 16 real e migrações desde zero numa base efémera.
- `npm run typecheck` passou nas duas aplicações; os builds NestJS e Next.js passaram em Node 22.
- `docker compose up --build -d`, com nome de projeto e portas isolados, preparou uma instalação nova e iniciou API e frontend.
- Os cenários de navegador cobrem o roteiro completo, os quatro papéis, persistência, resposta perdida, isolamento e recuperação de erros. O teste offline fecha e reabre um processo Chromium com perfil persistente, depois restabelece a rede.
- O ensaio de pequena regra foi executado com teste antes do código: um lote vazio era aceite, o teste falhou, a validação passou a exigir entre 1 e 100 marcações e o teste passou.

A regressão Chromium conjunta passou com **22 cenários**, contra as imagens finais de produção. Inclui a nova grelha, o roteiro completo, os quatro papéis, os cinco ensaios offline e os casos móveis a 390 px, incluindo nomes longos. As cinco capturas foram revistas; uma falha de largura no formulário móvel e a perda da confirmação de correção foram reproduzidas e corrigidas antes da execução final.

O comando oficial `docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from tests`, com um projeto de teste próprio, terminou com código 0: nove migrações, seed, 97 testes backend, 38 frontend e tipos. O arranque completo `docker compose up --build -d` foi também verificado num projeto e volume novos, com portas separadas da aplicação local.

## Correção do ambiente local

Os erros TypeScript apresentados durante a revisão vinham do cliente Prisma anterior ao campo `activity`. Foi regenerado e o backend compilou sem erros. Os ecrãs locais tinham apenas as migrações das fases 0/1 no banco; foram aplicadas as restantes, preservando os dados. Cadastros, equipa, preços, clientes de faturação e faturas foram verificados na API local com HTTP 200. O backend agora regenera o Prisma antes de iniciar em desenvolvimento.

## Limites

Offline exige preparação online, HTTPS ou localhost e armazenamento disponível no mesmo perfil do browser. Limpar dados do site ou encerrar uma sessão privada pode eliminar esse armazenamento. Administração e faturas exigem rede. A seleção é de demonstração, sem autenticação real. Não há certificação fiscal, AT/SAF-T/IVA, exportação ERP, deploy ou CI. Os ensaios de navegador usam uma instalação de teste porque criam factos e documentos imutáveis.
