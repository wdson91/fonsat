# FONSAT — Decisões de Arquitetura, Negócio e Ambiguidades

16 de outubro de 2026 · Síntese da implementação final. O documento inicial foi preservado em [docs/historico/DECISOES-inicial.md](docs/historico/DECISOES-inicial.md).

---

## 1. Arquitetura e Identidade

Monorepositório npm com Next.js, NestJS, TypeScript, Prisma e PostgreSQL 16. Docker Compose prepara aplicação, migrações e exemplos; outro projeto Compose usa um banco efémero para testes. Node 22 é o runtime validado.

A seleção «Quem está a usar?» simula a identidade, sem login ou palavras-passe. O browser envia apenas `X-User-Id`; o servidor resolve empresa, papel e âmbito. Clientes comerciais têm vínculo explícito ao utilizador (`clients.user_id`). A listagem pública contém apenas as pessoas fictícias necessárias ao seletor.

As tabelas operacionais usam Row-Level Security (RLS), chaves estrangeiras compostas `(company_id, id)` e uma conta da aplicação sem privilégios de proprietário ou `BYPASSRLS`. O contexto da empresa fica limitado à transação (`app.company_id`). O encarregado atua nas obras sob responsabilidade ativa; transferências entre clientes requerem o administrativo.

---

## 2. Tempo, Períodos e Correções

A grelha do trabalhador segue a referência fornecida: dias, intervalos, categoria Trabalho/Pausa e localização. Cada novo período gera UUIDs próprios para os dois extremos e um identificador de turno comum. Trabalho e pausas são períodos separados; pausas não são faturáveis. A distribuição define obras, não horários. Oito horas são o limiar de aviso: a grelha pede confirmação acima desse total diário, lembra as pausas e preserva as horas confirmadas.

Os instantes são preservados. O cálculo trunca os extremos ao minuto; o dia e o preço seguem o início no fuso da empresa. Um turno pode atravessar a meia-noite. Na introdução manual, horas inexistentes ou ambíguas na mudança de hora são recusadas com explicação; nesses casos, é necessária uma correção pelo encarregado.

Factos são imutáveis. Uma correção acrescenta versão, motivo, autor e data; a versão esperada protege contra concorrência. Trabalhadores acrescentam marcações, mas não apagam nem corrigem factos enviados. Uma marcação tardia não substitui uma correção manual. Desvios do planeamento e atrasos de receção são avisos. A correção confirma a exceção e resolve os avisos dos eventos já revistos; novos eventos, preço ausente e períodos incompletos continuam pendentes.

---

## 3. Offline e Autoria

Após uma primeira utilização online, o service worker guarda a estrutura da aplicação e os assets do build. As respostas da API ficam fora desse cache. IndexedDB guarda o contexto mínimo do trabalhador, a fila e o turno local por empresa/utilizador. A escolha fica no browser; trocar ou limpar a seleção preserva a fila original.

Cada envio fixa a identidade antes de qualquer espera. A troca interrompe novos lotes; um pedido iniciado mantém a identidade original e só confirma a respetiva fila. Respostas antigas não atualizam outra pessoa. Uma recusa de identidade invalida o contexto offline e pede nova seleção sem apagar eventos. Reconexão, tentativa automática e sincronização manual reenviam os mesmos UUIDs.

---

## 4. Dinheiro e Emissão

Minutos e cêntimos são inteiros, com aritmética intermédia exata (`BigInt`). Os preços têm vigência sem sobreposição (`starts_on` / `ends_on`). Incompletos e preços ausentes bloqueiam a emissão; exclusões exigem motivo, pertencem ao rascunho/mês e deixam o trabalho elegível no período seguinte.

A emissão revalida o conteúdo revisto (`expectedHash`), atribui o número sequencial por empresa/ano e grava o snapshot na mesma transação. Um bloqueio financeiro por empresa (`pg_advisory_xact_lock`) coordena emissão, correções, preços e exclusões. Snapshots conservam nomes, valores, preços, versões e justificações; o banco impede alterar documentos emitidos via trigger.

O ajuste é o total corrigido arredondado menos o acumulado efetivamente faturado, por origem e cliente. A transferência conserva crédito e débito independentes. Clientes veem apenas os seus documentos emitidos. O exercício admite documentos negativos apenas com ajustes.

---

## 5. Ambiguidades Encontradas no Sistema e Decisões Tomadas

### 5.1. Identidade, Permissões e Isolamento Multi-Empresa

| # | Ambiguidade | Decisão Adotada | Justificação / Impacto |
| :- | :--- | :--- | :--- |
| **1** | **Identificação do cliente comercial sem login real** | Vínculo explícito por chave estrangeira (`clients.user_id`) resolvido no servidor. | Evita depender da comparação de nomes, que quebraria o acesso caso o administrativo editasse o nome do cliente comercial. |
| **2** | **Alcance do encarregado e múltiplos encarregados por obra** | Uma obra aceita coencarregados simultâneos (`site_responsibilities`), sem sobreposição de datas para o mesmo encarregado. O encarregado só atua em obras sob responsabilidade ativa; transferências entre clientes distintos exigem `admin`. | Permite transição suave ou gestão partilhada de canteiros de obra sem permitir que um encarregado afete obras ou clientes fora da sua alçada. |
| **3** | **Necessidade de `company_id` em tabelas filhas com ID único** | `company_id` presente em todas as tabelas com chaves estrangeiras compostas `(company_id, id)` e políticas RLS diretas. | Impede fisicamente no PostgreSQL associar registos de empresas distintas (ex.: obra da Empresa A com encarregado da Empresa B) e permite filtragem RLS indexada sem `JOIN` adicional. |

### 5.2. Planeamento (Distribuição Semanal) vs. Realidade em Obra

| # | Ambiguidade | Decisão Adotada | Justificação / Impacto |
| :- | :--- | :--- | :--- |
| **4** | **Distribuição semanal: definir horários ou apenas obras?** | A grelha de distribuição define apenas `Trabalhador × Dia → Obra` (e opcionalmente um ofício alternativo). Não exige horários de entrada/saída planeados. | Foca na distribuição geográfica da equipa; as horas faturáveis decorrem exclusivamente das marcações reais. |
| **5** | **Ofício habitual vs. ofício exercido no dia (`trade_id` nulo em `allocations`)** | Na alocação, `trade_id = NULL` indica uso do ofício padrão do trabalhador (`workers.trade_id`). Se preenchido, sobrepõe o ofício naquele dia (`allocation.tradeId ?? worker.tradeId`). | O cliente paga pela função efetivamente desempenhada no dia sem obrigar o encarregado a preencher manualmente o ofício quando o trabalhador exerce a sua função habitual. |
| **6** | **Trabalhador bate ponto em obra diferente da planeada (ou sem alocação)** | A marcação é aceite na obra onde ocorreu e gera um alerta de divergência. O planeamento nunca reescreve horas reais. Após revisão manual do encarregado, o alerta passa a observação confirmada. | Mudanças de última hora ocorrem no terreno; bloquear o ponto impediria o registo do facto real. |
| **7** | **Edição do planeamento no passado e cópia da semana anterior** | A distribuição em datas passadas é bloqueada no servidor. A cópia da semana anterior preserva células já preenchidas e ignora dias passados ou cadastros inativos. | Evita reescrever o histórico de planeamento e previne sobrescrita acidental de alocações já ajustadas para a semana seguinte. |

### 5.3. Tempo, Pausas, Turnos Noturnos e Fuso Horário

| # | Ambiguidade | Decisão Adotada | Justificação / Impacto |
| :- | :--- | :--- | :--- |
| **8** | **Tratamento de pausas vs. períodos de trabalho** | Trabalho (`work`) e pausa (`break`) são períodos separados (`work_entries.activity`). Pausas não são faturáveis e não descontam automaticamente um período de trabalho aberto. | Preserva os factos tal como foram registados e evita recortes automáticos opacos em turnos reais. |
| **9** | **Limite diário de 8 horas (horas extras)** | Acima de 480 minutos diários, o sistema exige confirmação do trabalhador, lembra as pausas e sinaliza `overtime`, mas preserva as horas confirmadas e aplica a tarifa horária contratada do ofício. | O contrato comercial é estritamente horário por ofício; não se inventam multiplicadores financeiros não contratados, mantendo o alerta operacional. |
| **10** | **Turnos que cruzam a meia-noite e mudanças de hora (DST)** | O dia de trabalho (`worked_on`) e a tarifa aplicável seguem o instante de início do turno no fuso da empresa (`company.time_zone`). Horas manuais inexistentes ou ambíguas em mudanças de hora são recusadas com explicação. | Mantém o turno inteiro unido no dia de início da jornada e evita ambiguidades silenciosas na transição de horário de verão/inverno. |
| **11** | **Segundos nos eventos vs. cálculo em minutos** | Os instantes originais (`occurred_at`) são preservados, mas o cálculo trunca início e fim ao minuto inteiro antes de subtrair (`floor(end/60000) - floor(start/60000)`). | Garante que a duração em minutos bate sempre certo com os horários de minuto apresentados na interface e na fatura. |

### 5.4. Operação Offline, Sincronização e Concorrência

| # | Ambiguidade | Decisão Adotada | Justificação / Impacto |
| :- | :--- | :--- | :--- |
| **12** | **Relógio do telemóvel (`occurred_at`) vs. servidor (`received_at`)** | O cálculo usa `occurred_at` (hora do dispositivo) e preserva `received_at`. Desfasamentos superiores a 24h geram alerta de atraso de receção ou relógio desviado. | Sem rede, apenas o dispositivo conhece o instante real da picagem; desvios anómalos ficam sinalizados para auditoria do encarregado. |
| **13** | **Reenvios em rede instável e troca de utilizador num browser com fila offline** | UUIDs gerados no cliente garantem idempotência (mesmo UUID e dados = aceite como duplicado; mesmo UUID e dados diferentes = `409`). Fila IndexedDB isolada por empresa/utilizador com identidade fixada no início do envio. | Impede duplicação de marcações em reconexões e evita que a troca de pessoa no seletor contamine ou apague a fila offline de outro trabalhador. |
| **14** | **Marcação offline tardia recebida após correção manual do encarregado** | O evento tardio é gravado em `clock_events`, mas não sobrescreve a versão manual ativa (`source = 'manual'`). O registo volta a exibir o alerta *"Marcação tardia após correção manual: requer revisão"*. | Protege a decisão humana já tomada pelo encarregado enquanto o obriga a tomar conhecimento do novo facto chegado do telemóvel. |
| **15** | **Correção simultânea por dois utilizadores** | Controlo de concorrência otimista por `expectedVersion`. Se a versão atual divergir, devolve `409 Conflict` e exige recarregar a equipa. | Evita que um encarregado sobrescreva silenciosamente a correção ou justificação acabada de gravar por outro. |

### 5.5. Preços, Vigências, Exclusões e Arredondamento

| # | Ambiguidade | Decisão Adotada | Justificação / Impacto |
| :- | :--- | :--- | :--- |
| **16** | **Tabela de preços por vigência (`starts_on` / `ends_on`) e fecho no passado** | Preços modelados como intervalos sem sobreposição. Fechar uma vigência numa data anterior a trabalho **já faturado** é bloqueado (`409`). Se o trabalho ainda não foi faturado, permite o fecho e os dias descobertos passam a acusar *"Sem preço"* até nova vigência. | Permite alterações de preço a meio do mês e sincronizações retroativas determinísticas sem depender de logs de auditoria para calcular faturas. |
| **17** | **Registos incompletos ou sem preço no momento de emitir a fatura** | Bloqueiam a emissão do mês. Para emitir sem eles, o administrativo deve corrigi-los ou excluí-los explicitamente do rascunho (`draft_exclusions`) com motivo obrigatório. | Impede esquecimentos ou faturação a `0,00 €`. O registo excluído não é apagado e volta automaticamente a ser elegível no mês seguinte. |
| **18** | **Momento do arredondamento monetário** | Soma-se o total de minutos por linha agrupada `(Origem × Cliente × Obra × Ofício × Preço)` e arredonda-se uma única vez por linha (meio cêntimo para longe de zero). | Evita acumulação de desvios de arredondamento turno a turno. |

### 5.6. Imutabilidade de Faturas e Ajustes Pós-Emissão

| # | Ambiguidade | Decisão Adotada | Justificação / Impacto |
| :- | :--- | :--- | :--- |
| **19** | **Correção de horas, ofício, obra ou cliente após a fatura estar emitida** | A fatura emitida é imutável (protegida por trigger SQL). Na fatura seguinte, gera-se uma linha de **Ajuste (`adjustment`)** igual a `Total Corrigido Arredondado − Total Acumulado Já Faturado` para a mesma origem financeira. | Garante fecho ao cêntimo sem editar documentos emitidos. Mudanças de cliente geram crédito no cliente antigo (sem expor o novo cliente) e débito no novo. |
| **20** | **Mudança de cliente no cadastro de uma obra que já possui horas** | Bloqueado no servidor (`"Obra com horas: transfira os registos para outra obra em vez de mudar o cliente"`). | Impede que uma alteração cadastral mude retroativamente o cliente de horas passadas sem passar pelo fluxo auditado de transferência e ajuste financeiro. |

---

## 6. Enquadramento Fiscal, Limites e Verificação

Não há autenticação real, certificação fiscal, IVA/AT/SAF-T, integrações ERP, deploy ou CI nesta entrega. Em produção com certificação da Autoridade Tributária (AT), cada fatura emitida (`financial_invoices`) integraria com um motor fiscal certificado para atribuição de `ATCUD`, assinatura criptográfica e exportação SAF-T (PT), enquanto as linhas de ajuste pós-emissão (`references`) corresponderiam formalmente a **Notas de Crédito** ou **Notas de Débito** referenciando o documento original.

Offline exige uma primeira preparação online e armazenamento disponível no browser; limpar os dados do site ou usar sessões privadas pode eliminar esse armazenamento. Operações administrativas e consulta de faturas exigem rede.

A validação usa PostgreSQL real, testes HTTP, componentes e Chromium contra build de produção. O roteiro e os resultados finais estão em [docs/ROTEIRO_DEMONSTRACAO.md](docs/ROTEIRO_DEMONSTRACAO.md) e [docs/fases-8-9.md](docs/fases-8-9.md). O histórico mantém as entregas e correções reais, sem reconstruir ciclos TDD retroativamente.
