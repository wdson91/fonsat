# Identidade de demonstração e isolamento

Não há autenticação real nesta entrega. O utilizador escolhe uma pessoa da listagem de demonstração e o browser envia o seu identificador em `X-User-Id`. O servidor resolve empresa e papel a partir da base; cabeçalhos ou parâmetros de papel/empresa não concedem permissões.

`GET /api/demo-users` é público por desenho: devolve apenas id, nome, papel e empresa dos exemplos necessários ao seletor. `GET /api/me` devolve a identidade validada. Ausência de identidade, formato inválido ou id desconhecido devolvem 401.

As operações de obras estão disponíveis apenas ao administrativo e ao encarregado. O administrativo consulta as obras da sua empresa; o encarregado apenas aquelas sob responsabilidade ativa no calendário da empresa. Um recurso de outra empresa ou obra fora do âmbito devolve 404. Trabalhador e cliente recebem 403 neste módulo; as suas operações serão acrescentadas nas próximas fases.

## Persistência

A API usa `fonsat_app`, sem privilégios de proprietário, superutilizador ou BYPASSRLS. As tabelas de negócio têm políticas por empresa e referências compostas. As funções de resolução da identidade usam privilégios limitados do proprietário e devolvem só os campos declarados; o seu `search_path` é fixo e as tabelas são qualificadas.

Toda futura operação de negócio deve usar `TenantService.inCompany`, com a empresa da identidade resolvida pelo guard. O contexto é aplicado por `set_config(..., true)` na mesma transação e conexão que executa as consultas. Não transportar contexto empresarial por estado global ou `SET` de sessão. A conta de migrações e seed fica no serviço de arranque `setup`, fora da API.

Os testes provam consultas sem filtros, tentativas de escrita noutra empresa, referências cruzadas, rollback e operações concorrentes. Os dados e os identificadores mantêm-se ao repetir o seed.
