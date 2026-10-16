# FONSAT — Decisões da entrega

16 de outubro de 2026 · Síntese da implementação. O documento inicial foi preservado em [docs/historico/DECISOES-inicial.md](docs/historico/DECISOES-inicial.md).

## Arquitetura e identidade

Monorepositório npm com Next.js, NestJS, TypeScript, Prisma e PostgreSQL 16. Docker Compose prepara aplicação, migrações e exemplos; outro projeto Compose usa um banco efémero para testes. Node 22 é o runtime validado.

A seleção «Quem está a usar?» simula a identidade, sem login ou palavras-passe. O browser envia apenas `X-User-Id`; o servidor resolve empresa, papel e âmbito. Clientes comerciais têm vínculo explícito ao utilizador. A listagem pública contém apenas as pessoas fictícias necessárias ao seletor.

As tabelas operacionais usam RLS, referências compostas e uma conta da aplicação sem privilégios de proprietário ou BYPASSRLS. O contexto da empresa fica limitado à transação. O encarregado atua nas obras sob responsabilidade ativa; transferências entre clientes requerem o administrativo.

## Tempo, períodos e correções

A grelha do trabalhador segue a referência fornecida: dias, intervalos, categoria Trabalho/Pausa e localização. Cada novo período gera UUIDs próprios para os dois extremos e um identificador de turno comum. Trabalho e pausas são períodos separados; pausas não são faturáveis. Não se inventa uma meta diária de oito horas: a distribuição define obras, não horários.

Os instantes são preservados. O cálculo trunca os extremos ao minuto; o dia e o preço seguem o início no fuso da empresa. Um turno pode atravessar a meia-noite. Na introdução manual, horas inexistentes ou ambíguas na mudança de hora são recusadas com explicação; a marcação da hora atual continua a preservar o instante real.

Factos são imutáveis. Uma correção acrescenta versão, motivo, autor e data; a versão esperada protege contra concorrência. Trabalhadores acrescentam marcações, mas não apagam nem corrigem factos enviados. Uma marcação tardia não substitui uma correção manual. Desvios do planeamento e atrasos de receção são avisos, sem presumir que provam erro no relógio.

## Offline e autoria

Após uma primeira utilização online, o service worker guarda a estrutura da aplicação e os assets do build. As respostas da API ficam fora desse cache. IndexedDB guarda o contexto mínimo do trabalhador, a fila e o turno local por empresa/utilizador. A escolha fica no browser; trocar ou limpar a seleção preserva a fila original.

Cada envio fixa a identidade antes de qualquer espera. A troca interrompe novos lotes; um pedido iniciado mantém a identidade original e só confirma a respetiva fila. Respostas antigas não atualizam outra pessoa. Uma recusa de identidade invalida o contexto offline e pede nova seleção sem apagar eventos. Reconexão, tentativa automática e sincronização manual reenviam os mesmos UUIDs.

## Dinheiro e emissão

Minutos e cêntimos são inteiros, com aritmética intermédia exata. Os preços têm vigência sem sobreposição. Incompletos e preços ausentes bloqueiam a emissão; exclusões exigem motivo, pertencem ao rascunho/mês e deixam o trabalho elegível no período seguinte.

A emissão revalida o conteúdo revisto, atribui o número por empresa/ano e grava o snapshot na mesma transação. Um bloqueio financeiro por empresa coordena emissão, correções, preços e exclusões. Snapshots conservam nomes, valores, preços, versões e justificações; o banco impede alterar documentos emitidos.

O ajuste é o total corrigido arredondado menos o acumulado efetivamente faturado, por origem e cliente. A transferência conserva crédito e débito independentes. Clientes veem apenas os seus documentos emitidos. O exercício admite documentos negativos apenas com ajustes.

## Limites e verificação

Não há autenticação real, certificação fiscal, IVA/AT/SAF-T, integrações ERP, deploy ou CI nesta entrega. Offline exige uma primeira preparação online e armazenamento disponível no browser; limpar os dados do site ou usar sessões privadas pode eliminar esse armazenamento. Operações administrativas e consulta de faturas exigem rede.

A validação usa PostgreSQL real, testes HTTP, componentes e Chromium contra build de produção. O roteiro e os resultados finais estão em [docs/ROTEIRO_DEMONSTRACAO.md](docs/ROTEIRO_DEMONSTRACAO.md) e [docs/fases-8-9.md](docs/fases-8-9.md). O histórico mantém as entregas e correções reais, sem reconstruir ciclos TDD retroativamente.
