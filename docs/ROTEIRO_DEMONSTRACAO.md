# Roteiro de demonstração

## Preparação

Na raiz: `docker compose up --build`. Abrir http://localhost:3000. O arranque aplica as migrações, gera o Prisma e prepara as duas empresas sem apagar dados. Para uma demonstração nova, usar outro projeto Compose com portas livres; não é necessário editar o banco.

Cada empresa tem dois clientes, duas obras, três trabalhadores, dois ofícios, preços e distribuição. João Silva e André Costa têm um período completo de oito horas; Miguel Sousa e Nuno Ferreira têm um exemplo com saída em falta. Os exemplos ficam ancorados à semana da primeira preparação e não se duplicam nem mudam de data ao reiniciar.

## Fluxo

1. **Identidade e distribuição.** Selecionar Sofia Ramos, abrir Distribuição e uma semana futura. Atribuir um trabalhador livre a uma obra/ofício ou copiar a semana anterior. Conferir o resultado e as células que não foram copiadas.
2. **Ponto na grelha.** Selecionar João Silva. Aguardar «Ponto disponível offline neste dispositivo». Em As minhas horas, usar Adicionar num dia livre. O formulário permite Trabalho/Pausa, horas, início no dia seguinte e obra. Um fim anterior ao início termina no dia seguinte.
3. **Sequência da referência visual.** Num dia livre, acrescentar Trabalho 09:00–13:30, Pausa 13:30–13:45, Trabalho 13:45–14:00, Pausa 14:00–15:00 e Trabalho 15:00–18:00. O resumo é 7h45 de trabalho e 1h15 de pausa. Não existe uma meta diária de oito horas no planeamento.
4. **Offline real.** Desligar a rede no navegador, acrescentar um período, recarregar e fechar/reabrir. As linhas e os eventos pendentes continuam disponíveis. Repor a rede e verificar a confirmação automática; Sincronizar agora é a alternativa manual.
5. **Troca de pessoa.** Com eventos pendentes, trocar para André Costa. A fila do João não aparece nem é enviada como André. Voltar ao João e confirmar que a fila está preservada. Limpar a seleção também a preserva.
6. **Correção.** Selecionar Sofia ou Rita Santos para o exemplo do Armazém Norte. Abrir Equipa e pendências, corrigir a saída esquecida com motivo e conferir o histórico. Uma segunda edição sobre uma versão antiga exige atualizar o ecrã. O trabalhador não recebe permissão de apagar ou alterar factos.
7. **Preços e revisão.** Em Preços e rascunhos, verificar cliente, ofício e vigência. Gerar o mês do trabalho. Resolver os bloqueios ou excluir com motivo. As exclusões só valem nesse mês e são copiadas para a emissão.
8. **Emissão e explicação.** Abrir Faturação, gerar/rever o rascunho do mesmo cliente/mês e emitir. Expandir Explicar linha: minutos, preço, total corrigido, acumulado faturado, versões e motivos. Um rascunho alterado depois da revisão devolve conflito e exige nova confirmação.
9. **Ajuste posterior.** Para demonstrar emissão e ajuste no mesmo dia, usar inicialmente trabalho de um mês anterior. Após emitir esse mês, corrigir um período com o administrativo; gerar o mês seguinte, já iniciado. O documento anterior mantém-se igual e só a diferença aparece no novo.
10. **Cliente e isolamento.** Selecionar Mota Obras ou Teixeira Construções e verificar apenas os seus documentos emitidos. Trocar para a Construções Horizonte: os nomes das obras podem coincidir, mas os registos e documentos pertencem a outra empresa.

## Ensaios automatizados

`npm run test:e2e` executa os cenários no navegador contra uma instalação de teste. `offline.spec.ts` verifica cache, fecho/reabertura, perda de resposta e troca durante um pedido iniciado. `demonstration.spec.ts` percorre a grelha, correção, preço, emissão e ajuste, guardando as cinco vistas para revisão visual. Os cenários criam factos e documentos imutáveis de demonstração.

O ensaio pequeno de regra foi exigir entre 1 e 100 marcações por lote. `attendance-batch.test.ts` falhou primeiro porque o lote vazio era aceite e passou após a alteração da validação. A fila nunca envia lotes vazios.
