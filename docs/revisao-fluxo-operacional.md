# Revisão do fluxo operacional — 16/10/2026

Correções dos problemas encontrados durante o roteiro de demonstração:

- Responsabilidades: adicionar permite mais de um encarregado por obra. Substituir escolhe uma responsabilidade existente e termina-a na véspera do início da nova. Editar permite corrigir utilizador e vigência. O mesmo encarregado não pode ter intervalos sobrepostos na mesma obra, incluindo o dia de fronteira. A validação ocorre no servidor, numa transação com bloqueio por empresa e auditoria. Períodos antigos sobrepostos são assinalados para ajuste das datas; não são apagados automaticamente.
- Distribuição: o ofício habitual aparece com o nome numa linha separada e não se repete nas opções alternativas. As alocações a outro ofício mostram «Fora da função» na célula e um aviso no formulário. Copiar a semana pede confirmação e mantém células preenchidas e dias passados.
- Picagem: a obra é pré-selecionada pela distribuição da data do período; a seleção continua alterável. As distribuições fazem parte do contexto guardado offline e correspondem à última sincronização. Sem distribuição válida, mantém-se a escolha manual (ou a única obra ativa). O seletor de dia seguinte atualiza a sugestão.
- Oito horas são o limiar de aviso deste produto, sem truncar os factos registados. O total diário de trabalho acima de 480 minutos exige confirmação no formulário da grelha e ao concluir uma entrada antiga. O aviso menciona as pausas e a grelha mostra o tempo extra. Pausas continuam separadas e não faturáveis; inserir uma pausa não desconta automaticamente um intervalo de trabalho já registado.
- Revisão: o ecrã explica o motivo concreto (obra diferente da distribuição, ausência de distribuição, marcação incompleta, preço ausente, atraso ou inconsistência). Ao guardar uma correção com motivo, o encarregado confirma a obra, o ofício e as horas da versão. Desvios da distribuição confirmados passam a observações; os alertas dos eventos originais anteriores à correção ficam preservados no histórico. Novos eventos recebidos depois da correção voltam a exigir revisão. Falta de preço e período incompleto continuam pendentes até resolução.
- O filtro Só pendências esconde registos resolvidos após a atualização. Desmarcar o filtro permite consultar todas as versões e observações.

Estas alterações usam as tabelas existentes; não exigem migrações nem apagam dados.

Validação: 101 testes backend e 44 frontend passaram em PostgreSQL efémero; verificação de tipos passou. Os casos novos cobrem sobreposição inclusiva, coencarregado, substituição atómica e rollback, edição, distribuição por data, confirmação/cancelamento da cópia e de horas extra, desaparecimento de pendências resolvidas e reaparecimento perante eventos tardios.

Dois testes Chromium passaram contra o build de produção com API simulada: conclusão de entrada antiga/persistência/sincronização da fila e obra pré-selecionada/confirmação de nove horas/aviso em ecrã móvel sem overflow. Builds backend e frontend passaram. A suíte HTTP/backend usa PostgreSQL real; os testes de navegador desta revisão não escrevem na base local do utilizador.
