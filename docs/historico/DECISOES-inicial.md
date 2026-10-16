# DECISÕES DE ARQUITETURA E NEGÓCIO (DECISOES.md)

**Exercício Técnico:** Assiduidade e Faturação (Multi-empresa)  
**Data:** Outubro de 2026  
**Contexto:** Subempreitadas de construção civil (FONSAT como piloto inicial; preparado para SaaS/Whitelabel).

---

## 1. Princípios Estruturais

A regra de ouro do enunciado é: **o dinheiro tem de bater certo hoje e daqui a dois anos**. Para garantir essa rastreabilidade sem inflacionar a complexidade do sistema, adotaram-se quatro princípios:

1. **Facto ≠ Correção ≠ Fatura (Separação Rígida de Entidades):**
   - _Facto:_ A marcação de ponto (`Marcacao`) registada no telemóvel é imutável. Representa o que aconteceu no terreno.
   - _Correção:_ Quando o encarregado corrige um registo, nunca sobrescreve o original. Cria uma nova versão (`RegistoVersao`) com motivo e autoria.
   - _Fatura:_ Ao emitir uma fatura, congelam-se snapshots imutáveis (`DetalheLinha`) com a versão exata do registo, os minutos e o preço em cêntimos aplicado. Daqui a 2 anos, a fatura não é recalculada: lê-se o snapshot.
2. **Planeamento (Distribuição) ≠ Faturação:**
   - A grelha semanal de turnos define onde o trabalhador _deveria_ estar.
   - A fatura apura única e exclusivamente as _marcações reais_.
   - Divergências entre o planeado e o executado geram avisos visuais, mas **nunca bloqueiam** o registo nem alteram a fatura automaticamente.
3. **Resiliência Offline (Tolerância ao Terreno):**
   - O sistema nunca recusa um facto vindo de uma obra sem rede. Inconsistências viram tarefas para resolução pelo encarregado.
4. **Isolamento de Dados ao Nível do Banco:**
   - `empresa_id` obrigatório em todas as entidades e chaves estrangeiras compostas `(empresa_id, id)`. É fisicamente impossível uma obra de uma empresa apontar para o cliente de outra.

---

## 2. Decisões Perante as Ambiguidades do Domínio

| #      | Ambiguidade                               | Decisão Tomada                                                                                                                                                                              | Justificação / Impacto                                                                                                         |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **1**  | **Hora do telemóvel vs. Servidor**        | Usa-se a hora do aparelho como hora de trabalho (`hora_aparelho`); guarda-se a `hora_recebida` no servidor para auditoria. Desvios > 10 min são sinalizados.                                | Sem rede, o servidor não sabe quando a marcação ocorreu. Rejeitar ou alterar a hora do dispositivo distorceria turnos reais.   |
| **2**  | **Sincronização offline duplicada**       | UUID gerado localmente no telemóvel para cada marcação (`client_generated_id`).                                                                                                             | Idempotência pura no backend: pacotes repetidos por reconexão instável são descartados sem gerar registos fantasmas.           |
| **3**  | **Saída esquecida (ponto aberto)**        | O registo fica no estado `Incompleto`. O trabalhador vê um aviso no telemóvel e o encarregado recebe um alerta na caixa de pendências para fechar o registo.                                | O sistema nunca "inventa" uma hora de saída. Horas não validadas não entram em faturação.                                      |
| **4**  | **Trabalhador em obra não planeada**      | A marcação é aceite, atribuída à obra onde o trabalhador picou, e sinalizada a vermelho na grelha do encarregado.                                                                           | Mudanças de última hora acontecem em obra. Bloquear a marcação faria o trabalhador deixar de registar o ponto.                 |
| **5**  | **Ofício exercido diferente do habitual** | Preço segue o ofício efetivamente exercido no dia (indicado na grelha ou na correção do encarregado). O ofício habitual do trabalhador é apenas fallback.                                   | O cliente paga pelo trabalho executado (ex: servente a fazer trabalho de pedreiro fatura taxa de pedreiro).                    |
| **6**  | **Preço alterado a meio do mês**          | Vigência estrita por intervalo de datas (`valido_de`, `valido_ate`). Turnos antes da data usam a taxa antiga; turnos posteriores usam a nova.                                               | Gera linhas distintas na fatura agrupadas por `(Obra × Ofício × Preço)`. A explicação desce ao detalhe dia a dia.              |
| **7**  | **Preço retroativo / faturado**           | Um preço já associado a uma fatura emitida fica bloqueado para edição. Ajustes de negociação exigem nova vigência ou ajuste manual.                                                         | Impede que a renegociação de uma tabela de preços reescreva o passado contábil.                                                |
| **8**  | **Arredondamento e Moeda**                | Todos os cálculos monetários usam cêntimos inteiros. Tempo ao minuto exato. Arredondamento (`round-half-up`) feito **uma vez por linha da fatura** (não por marcação).                      | Evita propagação de dízimas e perdas por arredondamentos fracionários acumulados. O total da fatura é a soma exata das linhas. |
| **9**  | **Turno que cruza a meia-noite**          | O turno conta integralmente para o dia de início da jornada (fuso horário da empresa).                                                                                                      | Elimina a complexidade de partir registos a meio da noite e mantém a jornada associada ao dia de planeamento.                  |
| **10** | **Correção de horas após fatura emitida** | Fatura emitida é imutável. A correção cria uma nova versão do registo. A diferença entra como **Ajuste (-antigo / +novo)** na fatura seguinte do cliente com referência à fatura de origem. | Preserva a integridade contábil. O cliente e o administrativo percebem o valor em aberto sem violar a regra de imutabilidade.  |
| **11** | **Registos sem preço ou incompletos**     | Bloqueiam a emissão da fatura do cliente até que o administrativo resolva a inconsistência ou exclua o registo (adiando-o para o mês seguinte).                                             | Impossibilita faturar horas a 0,00 € por omissão ou esquecimento de cadastro.                                                  |
| **12** | **Alocação semanal vs. horários**         | Grelha diária (Trabalhador × Dia → Obra) sem exigir horas de início/fim planeadas.                                                                                                          | Foco na distribuição geográfica do efetivo; a carga horária real decorre do ponto.                                             |
| **13** | **Visibilidade do Cliente**               | O cliente acede apenas a faturas no estado `Emitida` das suas próprias obras, com detalhe nominal de quem trabalhou e quantas horas.                                                        | Dá transparência total à fatura sem expor rascunhos internos da subempreitada.                                                 |
| **14** | **Âmbito de ação do Encarregado**         | Restrito às obras onde está alocado como responsável ativo. Pode alocar trabalhadores livres ou já sob sua alçada; nunca retira trabalhadores de obras alheias.                             | Previne conflitos de gestão entre diferentes encarregados no terreno.                                                          |

---

## 3. O que foi Recusado Propositadamente (Trade-offs)

1. **Horas Extras e Noturnas no Cálculo de Faturação:**
   - _Motivo:_ O enunciado estipula claramente: _"o cliente paga à hora, e o preço depende do ofício"_. Adicionar multiplicadores de extras/noturnos sem parametrização contratual elevaria o risco de distorção de valores. A interface exibe etiquetas informativas de horas extras para suporte operacional, mas a base de faturação mantém-se estritamente horária por ofício.
2. **Workflow Complexo de Aprovação em Cadeia:**
   - _Motivo:_ O enunciado define que o encarregado _corrige_ erros e o administrativo _emite_ a fatura. Criou-se um fluxo de exceção (aprova-se por omissão o ponto completo; apenas registos anómalos exigem ação ativa do encarregado), reduzindo atrito burocrático diário.
3. **Autenticação com Login / Senhas Complexas:**
   - _Motivo:_ Conforme orientado no _Fora de Âmbito_, a avaliação foca em papéis e autorização, não no método de prova de identidade. Implementou-se um alternador de utilizador/papel com escopo estrito validado em sessão no backend.
4. **Validação Síncrona de Marcação no Terreno:**
   - _Motivo:_ Em obras sem rede, qualquer bloqueio síncrono impediria o trabalhador de bater o ponto. Privilegiou-se **capturar o facto primeiro, validar e sinalizar depois**.

---

## 4. Multi-empresa e Whitelabel

- **Modelo Lógico:** Base de dados única compartilhada (baixo custo e manutenção simples para PMEs de construção), com segregação lógica mandatória via chave discriminadora (`empresa_id`).
- **Segurança no Banco:** Todas as consultas, índices e restrições de integridade iniciam por `empresa_id`. Mesmo em caso de falha de filtro na camada de apresentação, chaves estrangeiras compostas impedem injeção ou cruzamento de entidades entre empresas distintas.
- **Whitelabel:** Cada registo de `Empresa` isola a sua paleta de cores, logotipo e denominação social, sem necessidade de deploys isolados.

---

## 5. Enquadramento Fiscal e Regulatório (AT, SAF-T, IVA)

> _Em ambiente produtivo certificado pela Autoridade Tributária (AT), a emissão da fatura não ocorreria de forma interna isolada:_  
> O modelo foi concebido para que o nosso registo de `Fatura` sirva de base de integração com um motor certificado (ex: via webservice/API do software de faturação). No ato de emissão, a nossa fatura recebe o `hash`, `ATCUD` e número sequencial legal da AT. As correções posteriores mapeadas no nosso modelo como linhas de ajuste (`fatura_origem_id`) gerariam, no motor fiscal, **Notas de Crédito** ou **Notas de Débito** oficiais referenciando o documento original, cumprindo a estrutura formal do ficheiro SAF-T (PT) sem alterar faturas emitidas.

---

## 6. O que Ficou por Fazer e Como Seria Completado

_(Secção a atualizar no encerramento da entrega com o balanço do código desenvolvido)_

- **Motor PWA / Cache Local no Navegador:** Para o ecrã do trabalhador funcionar 100% desconectado num browser real, complementaria com Service Workers e IndexedDB para persistir a fila de marcações offline.
- **Testes de Concorrência Extrema na Numeração:** Garantir bloqueio pessimista ou sequence nativa do banco no fecho simultâneo de faturas pelo administrativo.
- **Exportação Estruturada:** Endpoint para gerar CSV/JSON pré-formatado para importar nos ERPs certificados (ex: Primavera, PHC, Moloni).
