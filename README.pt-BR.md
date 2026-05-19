<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.13.1"><img src="https://img.shields.io/badge/version-0.13.1-blue" alt="version 0.13.1"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

`research-os` transforma a pesquisa, que antes era um documento gerado, em um conjunto de evidências consolidadas. Ele preserva a veracidade das fontes, separa as afirmações da síntese, exige a preparação através de etapas, registra as decisões dos revisores e as isenções, e publica um pacote cujas afirmações podem ser rastreadas e verificadas.

Ele não exige que você confie no modelo. Ele oferece as ferramentas para que você possa decidir se o modelo, as fontes e a síntese merecem confiança.

## O que é

`research-os` é a camada de controle entre "quero pesquisar X" e uma base de evidências precisa e rastreável. Ele separa as etapas de descoberta das etapas de coleta de evidências, a extração bruta da análise crítica, a detecção de contradições da resolução de contradições e as decisões de revisão das etapas de síntese. Cada etapa registra as informações em um registro de auditoria imutável; cada verificação de prontidão é calculada a partir desses registros, e não baseada em afirmações.

Não é um gerador de relatórios. Não é um framework de orquestração de LLMs (Large Language Models). Não escreve a síntese para você. Ele impõe as condições sob as quais a síntese pode começar.

Os pacotes congelados são armazenados em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — e estão disponíveis, contendo quatro pacotes que abrangem os seis experimentos internos (dogfood) concluídos. Consulte [`docs/roadmap.md`](docs/roadmap.md) para o caminho da versão 1.0.

A versão 0.1 foi extensivamente testada em duas fases de testes internos. A primeira — em que o próprio "research-os" analisou suas próprias especificações — identificou sete inconsistências antes do lançamento da versão 0.1.0, cada uma exigindo uma correção no código e resultando em uma regra ou padrão de integração. A segunda (Experimento 1 da versão 1: durabilidade do fluxo de trabalho ComfyUI, 11 sessões, um domínio sem sobreposição de vocabulário com "research-os") foi concluída em 09 de maio de 2026: o pacote foi congelado, o arquivo está disponível e a aplicação do Padrão 2 foi concluída através do commit `22b5dba`. A documentação dos testes da versão 0.1 está disponível em [`docs/dogfood-proof.md`](docs/dogfood-proof.md); a documentação do Experimento 1 está disponível em [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). O manual está disponível em: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Instalação

**Requisitos:** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Para colaboradores que estão construindo a partir do código-fonte:

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## Início rápido

```bash
# Create a new research-pack
research-os init "How should X be structured?"

# Add a section
research-os section add 01-landscape --purpose "Map the current landscape"

# Discover and approve sources, then gather
research-os discover run 01-landscape
research-os discover approve 01-landscape --top 8
research-os gather 01-landscape --approved

# Run the per-section chain
research-os claim extract 01-landscape
research-os claim audit-density 01-landscape
research-os claim triage 01-landscape
research-os contradict map 01-landscape --triaged-only
research-os review 01-landscape --triaged-only --preset hermes-two-pass --profile hermes-two-pass
research-os review-promote 01-landscape --profile hermes-two-pass
research-os gate 01-landscape
research-os section report 01-landscape

# Pack-level finish
research-os audit
research-os index build --all
research-os cowork handoff
research-os synth workspace   # only if handoff returned synthesis_ready
research-os freeze

# Export to the research-packs archive
research-os pack publish \
  --to <research-packs>/packages/<name>
```

> **Observação sobre a saída de `freeze`.** O comando `research-os freeze` funciona silenciosamente, percorrendo todos os artefatos e calculando hashes de conteúdo — não há indicação de progresso incremental para este comando. Em pacotes grandes, ele pode levar dezenas de segundos antes de exibir qualquer coisa. Ao finalizar, ele imprime um único bloco de resultado (`PASS` / `REFUSED` e o caminho do arquivo de registro). Não interprete a ausência de saída como um travamento.

> **Aviso sobre `--force`.** A opção `--force` limpa e substitui o diretório do pacote de destino. Não mantenha arquivos criados manualmente dentro da saída do pacote gerado. Edite os artefatos originais (declarações, fontes, síntese) ou arquivos relacionados. Contrato completo de admissão + casos de rejeição: [`docs/pack-publish.md`](docs/pack-publish.md).

**Para um exemplo prático**, veja o pacote de teste em `research-os-packs/research-os-spec/` — todos os arquivos, todos os registros, todas as disposições, todas as "impressões digitais" do "freeze", tudo armazenado em arquivos que só podem ser adicionados. Esse pacote gerou o arquivo `docs/dogfood-proof.md`.

**Requer [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) em execução localmente** para extração, triagem, revisão e descoberta de LLMs. O servidor MCP é descoberto através da variável de ambiente `OLLAMA_INTERN_MCP_BIN` ou do PATH. O modelo padrão é `hermes3:8b`; substitua por `OLLAMA_INTERN_MODEL=<modelo>` (ou por chamada com `--model <nome>`). Defina `OLLAMA_HOST` se o Ollama não estiver no endereço padrão `localhost:11434`.

## As 16 leis fundamentais

| # | Lei |
|---|-----|
| 1 | Nenhuma síntese antes da verificação da fonte original. |
| 2 | Coleta é evidência; interpretação é análise. |
| 3 | Os modelos podem interpretar trechos da fonte; eles não podem criar trechos de evidência. |
| 4 | A extração pode gerar informações em excesso; a síntese não pode herdar essa abundância. |
| 5 | O mapeamento de contradições revela tensões; ele não resolve, sintetiza ou decide qual afirmação é válida. |
| 6 | Os "gates" (portões) decidem se uma seção é elegível para síntese. Eles não sintetizam nem escondem falhas. |
| 7 | A revisão crítica avalia a integridade da pesquisa. Ela não sintetiza nem reescreve a fonte original. |
| 8 | A indexação torna a pesquisa acessível por consulta. Ela não cria novas informações nem se torna a fonte oficial. |
| 9 | A transferência para o Cowork transforma as informações da pesquisa em instruções operacionais. Ela não cria informações nem ignora os "gates". |
| 10 | O espaço de trabalho de síntese organiza as informações da pesquisa aceitas para o Cowork. Ele não cria a síntese nem ignora a etapa de transferência. |
| 11 | A auditoria do pacote agrega as informações da pesquisa existentes. Ela não cria novas informações nem oculta as evidências de cada seção. |
| 12 | A descoberta propõe hipóteses; apenas a coleta produz evidências. |
| 13 | Um revisor não é considerado confiável até que falhas simuladas comprovem a precisão. |
| 14 | A quantidade de afirmações não é sinônimo de qualidade da pesquisa. As afirmações devem ser analisadas criticamente antes de poderem ser consideradas para a síntese. |
| 15 | O "freeze" (congelamento) fixa as informações da pesquisa concluídas. Ele não completa pesquisas inacabadas nem converte o estado de correção em evidências. |
| 16 | As "waivers" (dispensas) relaxam as restrições da fonte original; elas não podem criar evidências. |

**Lei 3** — o LLM nunca cria o texto da evidência. A `research-os` cria um registro de trechos determinístico (com IDs estáveis como `ex_<source_id_hex>_001`); o LLM escolhe os IDs dos trechos; a `research-os` copia o texto literal. A classe de falha "paráfrase como citação" é estruturalmente impossível.

**Lei 14** — entre a extração e a revisão, a `research-os claim triage` (triagem de afirmações) remove duplicatas, limita a contribuição por fonte e armazena temporariamente candidatos de baixo valor. A triagem NÃO modifica o arquivo `claims.jsonl`; as afirmações armazenadas temporariamente permanecem no registro oficial.

## O fluxo de trabalho da versão 0.1

```
discover
→ gather
→ claim extract
→ claim audit-density
→ claim triage
→ contradict map
→ contradict resolve
→ review
→ review-promote
→ gate
→ section report
→ audit
→ index build
→ cowork handoff
→ synth workspace
→ freeze
```

Cada etapa é um comando de linha de comando (CLI). Cada etapa grava informações em arquivos que só podem ser adicionados, não modificados. Nenhuma etapa sintetiza, resolve ou cria novas informações — esses princípios são aplicados, não confiados. A revisão aceita, rejeita ou solicita correções em relação às afirmações candidatas; o sistema de "gates" utiliza essas decisões de revisão para calcular a elegibilidade para síntese; o "freeze" é o bloqueio final de integridade que impede que um pacote seja considerado finalizado, a menos que todas as camadas concordem. Consulte [docs/dogfood-proof.md](docs/dogfood-proof.md) para a documentação da versão 0.1 que comprova que a cadeia funciona de ponta a ponta.

Esta é a alternativa estrutural para *pesquisar → resumir → gerar relatório detalhado*. A cadeia é o produto.

## Vocabulário

| Termo | Significado |
|------|---------|
| `research-os` | O plano de controle / CLI / sistema de "gates" / a lei da orquestração (este repositório) |
| `research-pack` | O arquivo gerado para um esforço de pesquisa. |
| `research section` | Uma unidade de investigação delimitada dentro de um pacote. |
| `research receipt` | Comprovação de que uma seção passou nas verificações de origem/afirmação/sistema de "gates". |

## Segurança

`research-os` é uma ferramenta de linha de comando que opera localmente. Ela lê e grava arquivos dentro do diretório do pacote de pesquisa que você especificar e, quando usa o comando `gather`, faz solicitações HTTP para buscar URLs de origem que você fornecer. Ela não: executa um servidor, aceita conexões de entrada, armazena credenciais ou envia dados de telemetria. Nenhum segredo é gravado nos arquivos do pacote. Consulte [SECURITY.md](SECURITY.md) para a política de relatório de vulnerabilidades.

## Calibração de revisores

v0.5.0 torna a calibração dos revisores mais robusta. Um perfil de revisor não é considerado confiável apenas porque foi executado uma vez; ele adquire um status através de relatórios estruturados de falhas simuladas e agregação de múltiplas execuções. v0.6.0 adiciona opções de revisor determinísticas ao fluxo de revisão de produção e ao sistema de calibração.

**Nenhum perfil é atualmente aceito como `baseline confiável`.** Os relatórios canônicos no repositório mostram `hermes-two-pass=falha`, `mistral-nemo-two-pass=aprovação condicional`, `hermes-single-pass=comparação apenas`, `hermes-two-pass-deterministic=falha`. Isso é intencional: a confiança é conquistada através de evidências repetidas de falhas simuladas, e não é presumida. O relatório `hermes-two-pass-deterministic` apresenta uma lacuna estrutural na capacidade do modelo (2/6 tipos de decisão produzidos; requer 3/6) que não é um problema de variância.

Os relatórios de calibração estão localizados em `calibration/reviewer-profiles/<perfil>/seeded-v1.{json,md}`. Cada relatório registra PASS/FAIL em relação a sete critérios, quatro rótulos de status (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`), e revela honestamente o que o teste não consegue verificar (`needs_contradiction_mapping` é inacessível a partir de `seeded-v1`). Consulte [CHANGELOG.md](CHANGELOG.md).

```bash
# Single-run calibration (quick local check)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass --profile hermes-two-pass

# Multi-run aggregate calibration (canonical evidence — 3 runs, median-based PASS/FAIL)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass --profile hermes-two-pass --runs 3

# Deterministic multi-run calibration (temperature + seed explicit in receipt)
node scripts/reviewer-calibration.mjs --model hermes3:8b --two-pass \
  --temperature 0 --seed 7 --runs 3 --profile hermes-two-pass-deterministic

# Promote a section's review — auto-populates calibration_summary from pack-relative receipt
research-os review-promote 01-section --pack <pack> --profile hermes-two-pass
```

Quando `--runs <n>` é usado, os relatórios de cada execução são gravados em `<perfil>/runs/run-NNN.json` e um relatório agregado (com critérios baseados na mediana e detecção de falhas recorrentes) é gravado em `<perfil>/seeded-v1.{json,md}`. O relatório agregado contém `receipt_kind: 'aggregate'` para diferenciá-lo dos relatórios de execução única. O modo de execução única (`--runs 1` ou omitido) preserva o comportamento de gravação direta existente.

**Perfis de revisor determinísticos** — utilize `review_profiles.<nome>.reviewer_options` em `research.yaml` para incluir os parâmetros de amostragem do Ollama, como `temperature` e `seed`, em cada instância de `OllamaInternReviewer` no fluxo de revisão de produção. O perfil `hermes-two-pass-deterministic` é fornecido como um exemplo integrado. Consulte [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) e a [página do manual de calibração do revisor](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Nova versão v0.13.1 — Autoridade de Orçamento de Nível para a Etapa de Extração (Correção R-024, Caminho C)

A versão v0.13.1 é uma correção pontual aplicada sobre a versão v0.13.0. Ela corrige a condição do Rastreamento C da versão v0.5 (lacuna na configuração do escopo do R-019 na etapa de extração de reclamações) estendendo a autoridade de orçamento de nível do R-019 para todas as chamadas `ollama_extract` feitas durante a "extração de reclamações" — o extrator por janela, o crítico de evidências de seção por reclamação (R-011) e o crítico de resgate por candidato (R-012). Possui a mesma estrutura arquitetural da cobertura de texto sintético do R-019. É uma correção para um único repositório (apenas para o sistema operacional de pesquisa); o campo de esquema `tier_budget_ms_override` do `ollama-intern-mcp@2.6.0` representa o alcance do servidor que não foi alterado.

Esta versão foi lançada porque o mecanismo de segurança da versão v0.5, que impede a publicação de versões do `@mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0`, retornou **PASS_WITH_CONDITIONS, NÃO autorização** (`operator_aloneness_dst_v0.5`). Todas as funcionalidades da versão v0.13 (R-018 + R-019 + R-020 + R-021) foram testadas e funcionaram corretamente; a camada de proteção foi mantida; houve recusa explícita em caso de falhas, com ações de recuperação documentadas. No entanto, 3 de 8 fontes na seção 02 (`02-segurança-e-economia`) atingiram o limite de tempo interno de 15000ms (TIER_TIMEOUT) durante a extração, sem a possibilidade de anulação por parte do operador. A versão v0.13.0 já havia introduzido a sobreposição para texto sintético; a versão v0.13.1 estende essa funcionalidade para a etapa de extração.

> **R-024 implementa a regra de orçamento de nível com cobertura total: ao estender um orçamento de nível, o orçamento deve atingir todas as chamadas de LLM nessa etapa que possam produzir o mesmo limite de tempo interno. Cobertura parcial = correção mal direcionada na camada de cobertura da chamada.**
> **R-024 também implementa a regra de fragilidade do teste de repetição em tempo real: quando um teste de aceitação de repetição em tempo real falha devido a razões relacionadas ao ambiente de teste (tempo, captura, estado da configuração) e não devido a problemas no mecanismo, corrija o ambiente de teste — NÃO ignore, reduza a versão ou substitua pela inspeção manual de artefatos.**

A avaliação da versão v0.5 segue o Caminho D (triagem de múltiplos níveis). A versão v0.13.1 fecha o Rastreamento C. O Rastreamento A foi fechado na fase de preparação (lista de permissões para o hook de controle de memória). O Rastreamento B (preparação para descoberta de fontes) será executado em uma sessão separada após a publicação da versão v0.13.1. A configuração da porta v0.6 seguirá o Rastreamento B. A "Fatia de Admissibilidade" 1 permanece **não autorizada** até a aprovação da versão v0.6.

### O que você pode executar

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

Precedência: Flag da linha de comando > variável de ambiente > padrão (omitido; os perfis padrão do `ollama-intern-mcp` são aplicados). Valor limitado a `[1, 600000]` ms (limite de segurança máximo de 10 minutos). Valores inválidos resultam em uma falha clara com um código de saída diferente de zero, indicando a superfície e o valor incorreto.

### O que há de novo

**R-024 — Autoridade de orçamento de nível para a etapa de extração em todos os 3 locais de chamada `ollama_extract`.** A nova flag `--tier-budget-ms <N>` na opção "extração de reclamações" (e a variável de ambiente correspondente `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS`) encaminha uma sobreposição de orçamento de nível controlada pelo operador para cada chamada para `ollama-intern-mcp@>=2.6.0` como `tier_budget_ms_override` em TODAS as chamadas da ferramenta `ollama_extract` durante a execução da extração: `MCPClaimExtractor.extractOnePage` (o extrator por janela), `runCritic` (o crítico de evidências de seção por reclamação R-011, uma chamada por rascunho por janela) e `runRescueCritic` (o crítico de resgate por candidato R-012 para rascunhos com incompatibilidade de conteúdo da fonte). O orçamento ativo é exibido no stderr (`[extract] tier_budget_ms=N source=... section=<id>` exibido antes do loop por fonte), nos metadados do recebimento da extração (`tier_budget_ms` + `tier_budget_overridden_by` em `audits/<section>-claim-extract.json`) e no enum fechado `EXTRACT_TIER_BUDGET_SOURCES` (`['default', 'cli_flag', 'env_var']`). O comportamento padrão é idêntico ao da versão v0.13.0 (sem flag, sem variável de ambiente → os perfis padrão são aplicados; o recebimento omite os novos campos).

### Observação arquitetural

R-024 espelha a arquitetura de R-019, mas em um estágio diferente. R-019 conecta a função de "override" através de `runProseSynthesis` para o planejador + redator + verificador (3 pontos de chamada `ollama_extract` para a síntese de texto); R-024 conecta através do orquestrador `extract()` → `MCPClaimExtractor.extract` → distribuição para `extractOnePage` + `runCritic` + `runRescueCritic` (3 pontos de chamada `ollama_extract` para a extração). A regra de orçamento de nível de cobertura total é agora um princípio fundamental: ao estender um orçamento de nível para uma interface voltada para o usuário, o relatório da Fase B deve listar todos os pontos de chamada de LLM naquele estágio que compartilham o mesmo tempo limite interno. Uma cobertura parcial resulta em um "MISTARGETED-PATCH" na camada de cobertura do ponto de chamada, com a mesma assinatura auto-contraditória do "MISTARGETED-PATCH" do wrapper/mecanismo interno do R-018: o registro registra a função de "override" E o tempo limite especificado é acionado em um ponto de chamada não coberto no mesmo artefato.

Nenhuma alteração interna relacionada ao "ollama-mcp". O campo de esquema `tier_budget_ms_override` da versão v2.6.0 existe desde a versão coordenada do R-019; a versão v0.13.1 fornece a conexão do cliente para a extração na camada de pesquisa do sistema operacional.

### Camada de defesa preservada

R-024 é uma adição de um parâmetro configurável para o usuário, e não uma mudança arquitetural. As versões de R-002 a R-021 permanecem inalteradas. O valor mínimo aceitável (`accepted_claim_floor`) permanece inalterado. Enumerações fechadas inalteradas (`FailureShape` com 9; `RECOVERY_ACTIONS` com 8; `REGENERATION_REASONS` com 3; `PLANNER_TIMEOUT_SOURCES` com 3; `POLICY_KEYWORDS` com 8; `POLICY_RELEVANT_SOURCE_TYPES` com 1). R-024 adiciona a nova enumeração fechada `EXTRACT_TIER_BUDGET_SOURCES` (com 3 valores) sem modificar nenhuma enumeração existente. O modelo de prompt do consultor de recuperação de IA permanece inalterado. A arquitetura do MCP foi estendida de forma aditiva. A forma de expressão regular da causa de fallback do R-010 foi preservada. A forma de extração com `--resume / --progress` do R-015 foi preservada (R-024 adiciona uma nova linha de log no stderr + novos campos no registro; o formato do registro existente + o comportamento de ignorar + a forma de emissão permanecem inalterados).

A regressão do pacote congelado é byte a byte idêntica aos pontos de referência da versão v0.3.3 para todos os quatro pacotes congelados — **19ª versão consecutiva** em que isso ocorre. 1630 → 1663 testes vitest aprovados (+33 aceitações sintéticas do R-024 + 1 guardião sempre ativo; 6 ignorados — testes de reprodução em tempo real dependem das variáveis de ambiente do sistema).

### O que a versão v0.13.1 NÃO afirma:

- Prontidão para a versão 1.
- Decisão de que a versão 0.6 é autossuficiente para o usuário. A configuração da versão 0.6 segue o R-023 (estrutura de descoberta de fontes); a versão 0.13.1 é um pré-requisito para a conclusão do "Track-C", e não uma prova.
- Admissibilidade da Fatia 1. Depende da aprovação da versão 0.6.
- Candidatos adiados para a versão 0.13.x (F-2 divergência de auditoria↔extração do R-009; F-3 obsolescência da transferência de trabalho colaborativo; F-4 restrição de `POLICY_KEYWORDS` do R-017).

Consulte [CHANGELOG.md](CHANGELOG.md) para a entrada completa da versão.

## Novidades na v0.13.0 — Finalização: Triagem de Bloqueadores (R-019 + R-020 (apenas D) + R-021)

A v0.13.0 fecha o ciclo de triagem de bloqueadores de finalização (v0.13) que foi aberto após a nova execução da v0.4 contra `@mcptoolshop/research-os@0.12.1`, que retornou **PASS_WITH_CONDITIONS, e não autorização**, através do Caminho D (triagem de múltiplos bloqueadores, distinto do Caminho C, que usa correções específicas). Três bloqueadores de finalização independentes em três camadas diferentes do pipeline; três controles independentes que, juntos, desbloqueiam a finalização da prosa, a recuperação do cluster "no_answer" e o modo automático do "contradict-map". As camadas de defesa e de recuperação de cobertura das versões v0.10 / v0.11 / v0.12 / v0.12.1 permanecem intactas; não houve alterações nos tipos de dados fechados; não houve alterações nas interfaces.

> **A nova execução da v0.4 demonstra que a aceitação sintética pode validar a infraestrutura, enquanto a replicação em tempo real falsifica o mecanismo alvo.**
> **A v0.13 aborda o controle de tempo de execução da finalização: R-019 desbloqueia a camada interna de orçamento de nível do MCP; R-020 expõe a recusa honesta do cluster "no_answer" com ações de recuperação; R-021 desbloqueia a camada RPC do modo automático do "contradict-map".**

O "gate" de isolamento do operador da v0.5 será ativado em uma sessão separada, contra a versão publicada v0.13.0. A "Admissibility Slice 1" permanece **não autorizada** até a versão v0.5 ser aprovada.

### O que você pode executar

```sh
# R-019 — inner MCP tier-budget override now reaches the underlying control point
#         (requires ollama-intern-mcp@>=2.6.0 for the override to land in the inner mechanism)
research-os synth section <id> --planner-timeout-ms 30000
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>

# R-021 — contradict-map auto-mode hang-timeout + heuristic fall-through
research-os contradict map <id> --detector auto \
  --auto-mode-pair-timeout-ms 90000 \
  --auto-mode-fall-through-after-n-timeouts 5
RESEARCH_OS_CONTRADICT_AUTO_PAIR_TIMEOUT_MS=90000 \
RESEARCH_OS_CONTRADICT_AUTO_FALL_THROUGH_AFTER_N=5 \
  research-os contradict map <id> --detector auto
```

### O que há de novo

**R-019 — Conexão interna do cliente de orçamento de nível do MCP.** A flag `--planner-timeout-ms <N>` (e a variável de ambiente `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`) agora é transmitida para o planejador/desenhista/verificador, alcançando `ollama_extract.tier_budget_ms_override` e, em seguida, `runWithTimeoutAndFallback` em `ollama-intern-mcp/src/guardrails/timeouts.ts:61`. O mecanismo interno de tempo limite por nível, que causou a falha `elapsed=15018ms budget=15000ms` na nova execução da v0.4, agora respeita diretamente o orçamento definido pelo operador. O wrapper R-018 é mantido como uma proteção externa contra travamentos devido a promessas não resolvidas (os wrappers de modo de falha ortogonal podem realmente detectar isso). Requer `ollama-intern-mcp@>=2.6.0`; versões mais antigas ignoram silenciosamente o novo campo do esquema (o wrapper R-018 ainda funciona na sua camada original — degradação gradual).

**R-020 (apenas D) — Superfície de recuperação do cluster "no_answer".** Quando o planejador não consegue atribuir o papel de "resposta" a nenhuma das afirmações aceitas, a falha agora exibe inline `recovery_actions[]` (`narrow_section_purpose` + `add_on_topic_sources`) em `section-synthesis.json`, um bloco de markdown renderizado `## Ações de recuperação` em `section-synthesis.md` (com o título `action_id` + texto explicativo + bloco de código `command_hint` delimitado), e uma dica de erro padrão em uma única linha (`[synth] no_answer_cluster — veja o bloco "Ações de recuperação" em section-synthesis.md para etapas que podem ser tomadas`). A lista de ações é uma única fonte de verdade compartilhada com o caminho de recuperação do grafo de ações; não há divergência entre os caminhos de comando independente e de falha inline. **O ajuste do prompt do planejador (A-half) da R-020 foi tentado e revertido** — a iteração 1 produziu uma síntese incorreta e silenciosa (o LLM fabricou respostas de efeito nulo a partir de afirmações de efeito positivo em exemplos adversários; o verificador validou a negação invertida como "confiável"); a proteção rígida (HARD GUARDRAIL) da iteração 2 não anulou a alucinação. De acordo com a regra de uma iteração do operador, o prompt e 3 arquivos de teste fixos da versão v3 foram revertidos; `PROSE_PROMPT_VERSION` permanece em `section-prose-v3`. A doutrina foi aprendida: a replicação em tempo real estruturada pode passar enquanto o conteúdo sintetizado está incorreto e silencioso; a inspeção manual da prosa em exemplos adversários é necessária para detectar inversões de negação/escopo/predicado.

R-021 — Modo automático do mapa de contradições: tempo limite de suspensão, heurística de fallback, progresso visível. Novo parâmetro `--auto-mode-pair-timeout-ms <N>` (padrão: 90000; reduzido de 120 segundos, valor fixo anterior, após medição do tempo de aquecimento em hermes3:8b no ambiente v0.4: mínimo 6,2 segundos, mediana 8,4 segundos, máximo 8,8 segundos → o padrão de 90 segundos oferece ≥81 segundos de margem). Novo parâmetro `--auto-mode-fall-through-after-n-timeouts <N>` (padrão: 5; limite de falhas consecutivas para fallback heurístico; classificações bem-sucedidas com `type:none` redefinem o contador). Variáveis de ambiente correspondentes. Nova linha de início da saída padrão (`auto-mode ativado: N pares candidatos; tempo limite por par=Xms; fallback após=Y`) exibida em cada execução — sempre visível, funciona mesmo em ambientes que não usam TTY. O evento de disparo do fallback, que normalmente é exibido no stderr, agora ignora a restrição do TTY/ `--progress`, pois o operador precisa ver a mudança de modo. Novo bloco de formatação Markdown `## Auto-mode fall-through` em `contradictions.md` quando o limite é atingido. A heurística é executada novamente apenas em pares não processados (evita a reclassificação duplicada de pares que já foram processados pelo LLM).

### Observação arquitetural

R-019: Integração entre research-os e ollama-intern-mcp. O research-os passa o parâmetro `tier_budget_ms_override` no esquema `ollama_extract`; o ollama-intern-mcp v2.6.0 o considera na camada de proteção interna. A infraestrutura já existia; o v2.6.0 forneceu o ponto de entrada do lado do cliente; o v0.13.0 fornece a configuração do cliente no lado do research-os. O wrapper `Promise.race` do R-018 é mantido porque protege contra um modo de falha diferente (suspensões devido a promises não resolvidas — os wrappers podem detectar isso; payloads estruturados com `isError:true` em um limite interno que o wrapper não consegue alcançar é a área de atuação do R-019).

R-021 é exclusivo para research-os. O modo automático do mapa de contradições NÃO passa pelo ollama-intern-mcp — ele chama diretamente a API HTTP `/api/chat` do Ollama. Não há transporte MCP na cadeia; não há configuração de `tier_budget_ms_override`; não há wrapper do R-018. O protocolo de inicialização das "quatro leis fundamentais" detectou um erro de formatação na inicialização do R-021 antes que qualquer código de correção fosse escrito: a inicialização indicava "camada RPC MCP"; a fase de leitura da fase A contradisse isso.

### Camada de defesa preservada

R-019 + R-020 (apenas D) + R-021 são adições de parâmetros para o operador, não mudanças arquiteturais. Todos os recursos do R-002 ao R-018 permanecem inalterados. O valor `accepted_claim_floor` continua inalterável. Enumerações fechadas permanecem inalteradas (`FailureShape` em 9; `RECOVERY_ACTIONS` em 8; `REGENERATION_REASONS` em 3; `PLANNER_TIMEOUT_SOURCES` em 3; `POLICY_KEYWORDS` em 8; `POLICY_RELEVANT_SOURCE_TYPES` em 1). O modelo de prompt do consultor de recuperação de IA permanece inalterado. A arquitetura do MCP foi estendida de forma aditiva. A forma de regex de fallback-cause do R-010 foi preservada.

O pacote congelado tem a mesma estrutura de bytes em relação às versões de referência v0.3.3 para todos os quatro pacotes congelados — **décima oitava versão consecutiva** com essa característica. 1542 → 1630 testes vitest aprovados (+88 nos três conjuntos de testes; 4 ignorados — testes de replay em tempo real dependem das variáveis de ambiente do ambiente de teste).

### O que a versão v0.13.0 NÃO promete:

- Prontidão para a versão v1.
- Decisão do gate de "operador único" para a versão v0.5. A versão v0.5 é executada contra `@mcptoolshop/research-os@0.13.0` em uma sessão separada; a versão v0.13.0 é um pré-requisito para a finalização, não uma prova.
- Admissibilidade da Fatia 1. Depende da aprovação na versão v0.5.
- Candidatos v0.13.x pendentes (F-2: divergência entre auditoria e extração; F-3: obsolescência da transferência de trabalho; F-4: restrição de `POLICY_KEYWORDS` no R-017; A-1 + A-2: descobertas do lado da arquitetura incorporadas na preparação do gate da versão v0.5).

Consulte [CHANGELOG.md](CHANGELOG.md) para a entrada completa da versão.

## Novidade na v0.12.1 — Substituição do Tempo Limite do Planejador (Patch do Caminho C)

A v0.12.1 é uma correção única, baseada na v0.12.0. Ela inclui apenas a correção R-018: um wrapper no lado do sistema de pesquisa que define um tempo limite para as chamadas `callTool` do MCP de geração de texto, controlado por uma flag de linha de comando que pode ser descoberta pelo operador (`--planner-timeout-ms <N>` em `synth section` e `synth workspace`) e pela variável de ambiente correspondente (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`). A ordem de prioridade é: flag da linha de comando > variável de ambiente > padrão (15000ms). O comportamento padrão é mantido, idêntico ao da v0.12.0.

Esta versão foi lançada porque o teste de "isolamento do operador" da v0.4, aplicado à versão `@mcptoolshop/research-os@0.12.0`, retornou **PASS_WITH_CONDITIONS, e não uma aprovação total** (`operator_aloneness_dst_v0.4`). A camada de defesa da v0.11 permaneceu estável sob carga real; todas as seis áreas de recuperação de cobertura da v0.12 foram ativadas e passaram no teste, a cobertura do "envelope" atingiu os limites (4/5 SUPORTADAS + 1 PARCIAL obrigatória; 2/3 SUPORTADAS + 1 PARCIAL para moderadores; 0/3 armadilhas; 0/5 falhas de material ativadas); os indicadores de contaminação foram todos classificados como INOFENSIVOS. A única falha foi na finalização: a geração de texto atingiu o `TIER_TIMEOUT` de forma reproduzível em aproximadamente 15010ms, em comparação com o limite de 15 segundos para a camada "Instant", sem que o operador tivesse definido uma substituição. Os resumos das seções estavam em conformidade com o "envelope"; o pacote simplesmente não conseguiu finalizar.

**Decisão do Caminho C** (novo padrão definido na v0.4): quando a Sessão B identifica um único mecanismo de falha específico com um caminho de correção explícito E a cobertura do "envelope" está nos limites, E a camada de defesa permanece estável E a contaminação é INOFENSIVA, a decisão é aplicar a correção, executar o mesmo caminho do operador na versão corrigida e reavaliar. Não há reescrita do "envelope". Não há avaliador humano. Não há desenvolvimento arquitetural para a v0.13.

> **A v0.4 comprova a qualidade da cobertura do Research-OS no nível dos resumos das seções.**
> **A v0.12.1 deve comprovar a qualidade da finalização, removendo o gargalo do tempo limite do planejador, sem enfraquecer a camada de defesa.**

### O que você pode executar

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

Os parâmetros ativos estão disponíveis em `section-synthesis.json` (`planner_timeout_ms` sempre preenchido + `planner_timeout_overridden_by` presente apenas em caso de substituição), nos metadados do ProseBlock e no stderr (`[synth] planner_timeout_ms=N source=… section=<id>` exibido antes da geração do texto). O comando `synth section --help` documenta a flag, o valor padrão, o limite máximo (600000ms como medida de segurança) e a alternativa da variável de ambiente. Valores inválidos (negativos, zero, não numéricos, strings com sufixo de unidade, > 600000) resultam em uma mensagem de erro clara, com um código de saída diferente de zero, indicando o parâmetro e o valor incorreto. Não há fallback silencioso.

### Observação arquitetural

O limite de 15000ms que o teste da v0.4 atingiu está em `ollama-intern-mcp` (`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`), e não no Research-OS. Antes da R-018, o Research-OS não impunha um tempo limite para o planejador; o tempo limite era definido no servidor, na política de camadas do ollama-intern-mcp. A correção R-018 introduziu a autoridade do Research-OS sobre o limite, usando um wrapper `Promise.race` em torno da chamada MCP `callTool`, com o valor padrão observado para a camada "Instant" (15000ms), preservando assim o comportamento padrão. O wrapper da R-018 gera erros do tipo `TIER_TIMEOUT` que correspondem à expressão regular `classifyFallbackCause` da R-010 (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`), preservando a visibilidade do "AI-advisor" sobre as execuções no caminho padrão.

### Camada de defesa preservada

R-018 é uma pequena alteração na interface do usuário, não uma mudança na arquitetura. R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 permanecem inalterados. O valor `accepted_claim_floor` continua sendo inalterável. As enumerações fechadas permanecem inalteradas (`FailureShape` em 9; `RECOVERY_ACTIONS` em 8; `REGENERATION_REASONS` em 3; `POLICY_KEYWORDS` em 8; `POLICY_RELEVANT_SOURCE_TYPES` em 1). O modelo de prompt do consultor de recuperação de IA permanece inalterado. A arquitetura do MCP permanece inalterada — `ollama-intern-mcp@^2.4.0` continua sendo utilizada. R-018 adiciona `PLANNER_TIMEOUT_SOURCES` (3) como um novo vocabulário de registro do operador, distinto de qualquer enumeração de roteamento.

A regressão do pacote congelado é byte a byte idêntica às versões de referência v0.3.3 para todos os quatro pacotes congelados — **a décima sexta versão consecutiva** em que isso ocorre. 1542 → 1586 testes vitest aprovados (+44 testes de aceitação de R-018).

### O que a versão v0.12.1 NÃO afirma:

- Prontidão para a versão v1.
- Verificação de nova execução do "gate" de isolamento do operador v0.4. A nova execução do v0.4 é feita contra `@mcptoolshop/research-os@0.12.1` em uma sessão separada; a versão v0.12.1 é um pré-requisito para a finalização, não a prova.
- Admissibilidade da Fatia 1. Depende da aprovação da nova execução do v0.4 — o "ratchet" do v0.4 (isolamento comprovado para fins de defesa; isolamento comprovado substancialmente para fins de cobertura no nível do resumo; isolamento para fins de finalização pendente da versão v0.12.1) continua sendo o teste bloqueador.
- Candidatos para a versão v0.13 (F-2 divergência de auditoria↔extração R-009; F-3 obsolescência da transferência de colaboração; F-4 restrição de `POLICY_KEYWORDS` em R-017). Independente da finalização.

Consulte [CHANGELOG.md](CHANGELOG.md) para a entrada completa da versão.

## Anteriormente: v0.12.0 — Versão de Recuperação e Cobertura

A versão v0.12.0 corrige as falhas identificadas em 2026-05-16 relacionadas à "solidão do operador" (gate `operator_aloneness_dst_v0.3`), que estavam pendentes (PASS_WITH_CONDITIONS, mas não com nível de autorização). Existem seis problemas identificados em quatro áreas: três correções arquiteturais que eliminam as lacunas de cobertura que impediam o avanço para a versão v0.4 (R-012, R-013, R-014), e três melhorias de usabilidade que aprimoram a interface do operador para as etapas do gate v0.4 (R-015, R-016, R-017). A versão v0.3 não falhou devido a regressões nas defesas; todas as cinco camadas de defesa da v0.11 funcionaram exatamente como projetado, produzindo uma síntese limpa e precisa, sem conteúdo incorreto silencioso, e o sistema permaneceu estável com base em evidências reais, embora limitadas. A falha ocorreu porque as mesmas defesas, funcionando corretamente, removeram a cobertura essencial da base de reivindicações aceitas. O princípio fundamental estabelecido na versão v0.3:

> **A versão v0.11 tornou o sistema seguro o suficiente para evitar a síntese de informações incorretas silenciosas.**
> **A versão v0.12 aumenta a capacidade de recuperação de cobertura sem enfraquecer essas defesas.**

A tese: **defesas conservadoras podem impedir a síntese de informações incorretas silenciosas, mas também podem privar o sistema da cobertura necessária.** A versão v0.12 é a solução para a recuperação de cobertura. A base de defesas da versão v0.11 permanece inalterada; todas as camadas R-007 a R-011 continuam ativas. A versão v0.12 adiciona caminhos de recuperação seguros e verificados.

### O que você pode executar

```sh
research-os claim rescue <section-id> [--llm | --operator]
                                              # NEW: post-extraction rescue of frame-excluded
                                              # source_content_mismatch claims with peer evidence (R-012)
research-os source-card audit --apply --from <file> --rebuild-cards
                                              # NEW: overrides materialize into persisted card raw JSON
                                              # without re-fetching (closes C2+C3 architectural trap) (R-013)
research-os recover pack --regenerate-action-graph
                                              # NEW: re-runs advisor against current state when
                                              # recovery artifact has gone stale (R-014)
research-os claim extract <section-id> [--resume] [--progress]
                                              # NEW: per-source resume + stderr progress lines (R-015)
```

### As três correções arquiteturais (base que impede o avanço para a versão v0.4)

```
extract critic  →  R-012  source_content_mismatch claims with ≥2 on-topic peers from same source
                    ↓     become rescue-eligible; LLM critic rescues or operator decides via
                    ↓     `claim rescue` CLI; append-only evidence/claim-frame-rescues.jsonl ledger
                    ↓     witnesses every state change; original claim.scope/not NEVER rewritten
source-card     →  R-013  audit --apply --rebuild-cards routes persisted cards through SAME
                    ↓     buildCard() gather uses; raw card.source_type == effective post-rebuild;
                    ↓     reviewer reads pass; no HTTP, no re-fetch; defense floor preserved
                    ↓     (R-003/R-005/R-009 still fire during rebuild on cached bodies)
recover advisor →  R-014  needs_repair_claims partitioned into scope_repair_blocked +
                    ↓     source_repair_blocked; v0.3 regression replay (0 scope + 5 source) now
                    ↓     recommends add_on_topic_sources (the actual unblock), NOT repair_claim_scope;
                    ↓     --regenerate-action-graph with SHA-256 input_state_hash freshness detection
```

### As três melhorias de usabilidade (melhorias na experiência do usuário ao passar pelo gate v0.4)

```
claim extract    →  R-015  always-on evidence/extract-completion.jsonl ledger (NEW persistent
                    ↓     artifact); --resume skips ledger-completed sources (failed re-attempted);
                    ↓     --progress emits per-source [extract N/M] stderr lines; canonical stdout
                    ↓     unchanged; default behavior byte-identical except for the new ledger
override docs    →  R-016  examples/source-card-override.example.json shipped in tarball with
                    ↓     2 realistic entries (effective_source_type-only + clear_severities);
                    ↓     converts C1 schema-discovery-by-runtime-error from operator-friction
                    ↓     to TRIVIAL
policy coverage  →  R-017  audits/missing-policy-sources.{json,md} informational pack-level audit;
                    ↓     fires when policy keyword in research.yaml topic+decision AND zero
                    ↓     docs sources; honors R-013 rebuild via getEffectiveSourceType;
                    ↓     INFORMATIONAL ONLY — never affects verdict/freeze/pack-publish
```

### Limite legal

As restrições do sistema permanecem válidas. O `accepted_claim_floor` continua inalterável. O enum `FailureShape`, que define os tipos de falha, permanece com seus nove valores. O enum `RECOVERY_ACTIONS` permanece com seus 8 valores; não há novas ações para o sistema de aconselhamento; a heurística de forma distinta de R-014 amplia o roteamento das ações existentes. O modelo de prompt para o sistema de aconselhamento de recuperação não foi alterado (os novos campos `EvidenceState` podem ser observados em arquivos JSON persistidos, mas NÃO são exibidos no prompt). As regras do verificador de recuperação permanecem inalteradas. A arquitetura do MCP não foi alterada; `ollama-intern-mcp@^2.4.0` continua em uso; não houve alterações na forma das chamadas do MCP durante a extração. O aviso de R-017 é informativo e NÃO afeta a decisão do gate, o recebimento de falhas ou a publicação do sistema. Todas as defesas das versões v0.10 e v0.11 foram preservadas; a base de defesas é a base, e a versão v0.12 é construída sobre ela.

A versão compilada do sistema é byte a byte idêntica às versões de referência v0.3.3 para todos os quatro pacotes congelados — **décimo quinto lançamento consecutivo** em que isso ocorre (v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12).

### O que a versão v0.12.0 NÃO afirma

- Estar pronta para a versão v1.
- Ter resolvido o problema da "solidão do operador" para o gate v0.4. Os testes para a versão v0.4 são executados contra o pacote npm `@mcptoolshop/research-os@0.12.0` em uma sessão separada.
- Ter validado a "Fatia de Admissibilidade" 1. Essa etapa está bloqueada na versão v0.4 (PASS), e o princípio fundamental da versão v0.3 (defesa comprovada contra "solidão do operador", mas ainda não a cobertura) permanece como o teste bloqueador.
- Ter superado as ferramentas de pesquisa baseadas em nuvem.
- Ter um modelo completo e calibrado para revisores.

A versão v0.12.0 é um pré-requisito para a versão v0.4 do gate de "solidão do operador", não a prova de que ela foi alcançada.

Consulte o arquivo [CHANGELOG.md](CHANGELOG.md) e o exemplo de substituição da interface do operador em [`examples/source-card-override.example.json`](examples/source-card-override.example.json).

## Versão anterior: v0.11.0 — Segundo lançamento para correção da "solidão do operador"

A versão v0.11.0 corrigiu as condições de falha do gate de "solidão do operador" da versão v0.2: alinhamento do escopo/limite (R-007), verificação de relevância da URL no momento da descoberta (R-008), defesa contra contaminação do conteúdo da fonte em camadas de extração e de análise crítica (R-009 + R-011), e visibilidade do motivo de fallback do sistema de aconselhamento (R-010). A camada de proteção de conteúdo da fonte (R-008 na admissão + R-009 na extração + R-011 na análise crítica) é implementada aqui. Consulte [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md).

## Versão anterior: v0.10.0 — Lançamento de correção para operação individual

A versão v0.10.0 corrigiu as condições de falha do cenário de operação individual da versão v0.1, identificadas em 15 de maio de 2026 (`operator_aloneness_dst_v0.1`, FALHA): alinhamento do roteamento de recuperação (R-002), interface de linha de comando (CLI) para reparo de escopo (R-001), endurecimento da auditoria de cartões de conteúdo de origem (R-003 + R-005) e status de coleta confiável (R-004). Consulte [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

## Versão anterior: v0.9.0 — Arquitetura de Artefatos do Produto

A versão v0.9.0 transformou a estrutura de evidências da versão v0.8 em artefatos úteis para operadores: síntese de texto em nível de seção (`synth section`), síntese de "pacotes" parciais (`synth pack --partial`) e o sistema de recuperação confiável (`recover pack`). Consulte o arquivo [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## Anteriormente: v0.8.0 — Recuperação da Arquitetura

A versão 0.8.0 reconectou o research-os ao seu substrato local de LLM declarado (`ollama-intern-mcp@^2.4.0`) para extração de afirmações, adicionou a aplicação de relevância da seção com base em limites e adicionou a síntese de citações de evidências com escopo de seção para seções elegíveis para "gate" em pacotes que requerem reparo. Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Status

**v0.11.0 — Segunda versão de correção do problema de "operador isolado"** — publicada no npm como `@mcptoolshop/research-os@0.11.0`, em 15 de maio de 2026. A versão v0.11.0 corrige as condições de falha do "gate" de "operador isolado" da versão v0.2 (`operator_aloneness_dst_v0.2`), que antes resultava em uma mensagem de "não autorizado" em 15 de maio de 2026. A correção envolve uma estrutura de 4 etapas que abrange 5 problemas identificados.

**R-007** (alinhamento de escopo/limite): O comando `claim repair-scope --auto` agora preenche tanto o campo `scope` quanto o campo `not` quando ambos estão vazios em uma reivindicação durante o processo de correção. Isso corrige um problema na versão v0.10, onde o comando R-001 preenchia apenas o campo `scope`, e o processo de triagem das reivindicações corrigidas as classificava como "necessitando de correção de escopo". O limite (boundary) agora reflete a forma de degradação do modelo de escopo. O registro de dados, que só permite adições, agora registra `applied_not` juntamente com `applied_scope`.

**R-008** (defesa contra URLs inventados): O comando `discover run` agora busca o `<title>` de cada URL candidato (com um limite de 64KB para o conteúdo, um tempo limite de 5 segundos e processamento paralelo de 4 threads) e calcula a sobreposição de palavras-chave determinística em relação à consulta de descoberta. Cada candidato recebe um bloco de "relevância" (`verificado | não verificado | incompatibilidade de tópico`); o comando `approve --top N` coloca os candidatos com "incompatibilidade de tópico" em quarentena; o operador pode substituir essa decisão usando `approve --candidate <id>`. Isso corrige um problema na versão v0.2, onde o "llm-heuristic" retornou 3 URLs reais do PMC que apontavam para artigos completamente diferentes sobre câncer, bioquímica ou HIV/linfoma.

**R-009** (proteção da identidade da fonte): Uma nova severidade para o cartão da fonte, `source_identity_mismatch` (falha grave), é definida quando o título (`card.title`) emitido pelo extrator não corresponde ao `<title>` extraído do HTML. Isso corrige o problema da versão v0.2 conhecido como "confabulação de ratos e clonidina". Reutiliza a função de sobreposição do R-008; a substituição é feita através de `clear_severities[]`.

**R-011** (verificação prévia do conteúdo da fonte pelo "frame critic"): Uma nova razão para a exclusão do "frame", `source_content_mismatch`, foi adicionada. O "frame critic" agora calcula uma assinatura do conteúdo da fonte uma vez por fonte e executa uma verificação prévia determinística antes de chamar o "LLM critic". Se o resultado estiver abaixo de um determinado limite, a chamada do "LLM" é interrompida e o "frame" é marcado como excluído (`frame_excluded: true`). Isso corrige um problema na versão v0.2, onde 11 reivindicações derivadas de artigos sobre câncer, com texto formatado em "DST", foram aceitas pelo "LLM critic".

**R-010** (recuperação da visibilidade do fallback do MD): Um novo enum `FALLBACK_CAUSES` foi adicionado (com as opções `tier_timeout | mcp_error | retry_exhausted`) e um campo opcional `FallbackTiming { elapsed_ms, budget_ms }` foi adicionado aos metadados de `prose_error`. Isso permite que o MD (modelo de dados) exiba uma seção "Por que o consultor de IA fez um fallback" e um resumo da causa principal. Isso corrige uma lacuna na versão v0.2, onde o "TIER_TIMEOUT" era invisível em JSON.

**A proteção contra contaminação do conteúdo da fonte em três camadas agora está completa** (R-008: admissão, R-009: extração, R-011: critic), com a independência da camada de defesa verificada. **Requer `ollama-intern-mcp@^2.4.0`** (inalterado desde a versão v0.8.0). 1448 testes passaram (de 1344 para 1448, +104 testes). **Todos os quatro pacotes "congelados" verificam a identidade dos bytes em relação às referências da versão v0.3.3** (décima primeira versão consecutiva). **Não é uma versão v1. Não é uma avaliação do "gate" de "operador isolado" da versão v0.3** — a versão v0.3 será testada contra esta versão do npm em uma sessão separada. O trabalho na doutrina de admissibilidade depende da aprovação da versão v0.3. Consulte [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.10.0 — Lançamento de Correção de Falhas de Isolamento do Operador** — publicado no npm como `@mcptoolshop/research-os@0.10.0`, 15 de maio de 2026. A versão v0.10.0 corrige as condições de falha do "gate" de isolamento do operador da versão v0.1 (`operator_aloneness_dst_v0.1`), que resultou em uma falha em 15 de maio de 2026, através de um processo de correção em 4 etapas. **R-001** (`research-os claim repair-scope <seção> [--auto | --interativo]`): Nova interface de linha de comando (CLI) para corrigir reivindicações cujo campo `scope` chegou como `null` durante a extração; registro de apenas adição (`evidence/claim-scope-repairs.jsonl`); nova ação `repair_claim_scope` em `RECOVERY_ACTIONS` (o enum expandido de 7 para 8 elementos). O sistema exibe isso como a prioridade mais alta em `accepted_claim_floor` quando ≥3 reivindicações estão em `needs_repair_claims`. **R-002** (roteamento de recuperação): A camada de diagnóstico agora lê `gate.json:blocking_reasons[]` como a fonte de informações mais confiável para o roteamento, antes de recorrer à pesquisa tradicional em `failures[].check` — os sinais de bloqueio do "gate" têm precedência sobre sinais subsequentes, como `source_card_classification_gap`. **R-003 + R-005** (fortalecimento da auditoria de cartões de origem, em conjunto): Novas severidades `bot_check_or_captcha_detected` (FALHA GRAVE — sinal composto: marcadores + formato do corpo) e `extraction_suspect_word_count_mismatch` (AVISO E QUARENTENA — corpo com ≤200 palavras E extração com ≥800 palavras E razão ≥4). Substituição do operador via novo campo `clear_severities[]` no esquema do registro de substituição da versão v0.4. Bloco opcional `audit.severity_thresholds` em `research.yaml` para ajuste individual de cada pacote. **R-004** (`gather_outcome` preciso): Enum de 5 valores em `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`); a frase confusa da versão v0.1 `"Failed (ok HTTP 200)"` foi removida. Consulte [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Product Artifact Arc** — publicado no npm como `@mcptoolshop/research-os@0.9.0`, em 13 de maio de 2026. A versão v0.9.0 transforma a estrutura de evidências da versão v0.8 em artefatos úteis para os operadores. A síntese de texto por seção (`research-os synth section <id>`) produz Markdown legível, com pacotes de suporte por parágrafo que apontam para as afirmações aceitas. A síntese de pacotes parciais (`research-os synth pack --partial`) utiliza o texto das seções (nunca as afirmações brutas) e revela as seções excluídas, com razões estruturadas; um planejador de pacotes determinístico pré-seleciona o suporte transversal necessário quando ≥2 seções são incluídas. O consultor de recuperação (`research-os recover pack`) fornece orientações para os operadores em relação às seções bloqueadas, utilizando uma arquitetura de quatro camadas: diagnóstico determinístico + grafo de ações válidas + aconselhamento de IA + verificador, com três caminhos de aconselhamento (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) e enumerações fechadas para nove tipos de falhas e sete ações de recuperação. As orientações de recuperação estão incorporadas em `partial-pack-synthesis.{md,json}` em cada seção excluída, através de uma projeção compacta do objeto de recuperação canônico — uma única fonte de verdade entre as interfaces independentes e as interfaces integradas; um estado de união discriminada `recovery_unavailable` expõe explicitamente os casos de falha do motor (sem omissões silenciosas). A semântica de congelamento e publicação permanece inalterada: os artefatos parciais legíveis não tornam um pacote incompleto congelável ou publicável. O `accepted_claim_floor` permanece inalterável; o consultor de recuperação se recusa a recomendar a ação `apply_waiver` para falhas inalteráveis. **Requer `ollama-intern-mcp@^2.4.0`** (inalterado da versão v0.8.0). 1266/1266 testes vitest aprovados (de 1013 para 1266, +253 testes em toda a versão). **Todos os quatro pacotes congelados verificam a identidade dos bytes em relação às referências da versão v0.3.3** (sexta versão consecutiva). **Não é uma versão v1.** A versão v0.9.0 torna a camada de artefatos uma realidade; a prontidão para a versão v1, a capacidade do operador de trabalhar sozinho com um novo pacote, um modelo de revisor confiável e a garantia de uma linha de base na nuvem são explicitamente não incluídas nesta versão. Consulte [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Recuperação da Arquitetura + Relevância Restrita a Seções** — publicado no npm como `@mcptoolshop/research-os@0.8.0`, 12 de maio de 2026. A v0.8.0 é uma versão de recuperação da arquitetura: o research-os agora usa `ollama-intern-mcp@^2.4.0` como a base local para o processamento de evidências, utilizada para extração de afirmações (anteriormente, o README declarava a dependência, mas o código tinha "stubs" internos que ignoravam essa dependência desde a versão 0.1 — a v0.8.0 corrige essa inconsistência). Adiciona: base do cliente MCP (`OLLAMA_INTERN_MCP_BIN` variável de ambiente + descoberta via PATH + ciclo de vida do `StdioClientTransport`); avaliação de evidências por seção para cada afirmação, via `ollama_extract`, com um esquema de 4 rótulos (`supports_section` / `off_topic` / `background_only` / `source_chrome`); novo `ReviewDecision` `frame_excluded` (a revisão ignora o LLM para afirmações excluídas, emitindo um `ClaimReview` sintético); o `ClaimSchema` ganha `frame_excluded` + `frame_exclusion_reason` (enumeração com 4 valores, incluindo `critic_unavailable` para falhas no estado do sistema) + `frame_exclusion_rationale`; síntese de evidências com escopo de seção via `synth section <id>` para seções elegíveis para avaliação em pacotes que requerem correção (índice de citação de evidências — ID da afirmação → asserção → trecho de evidência → URL da fonte — NÃO texto narrativo); o sistema de avaliação respeita o registro de substituição da fonte via `getEffectivePublisher` / `getEffectiveSourceType` (incorporando o objetivo da v0.7.1); o valor padrão de `DEFAULT_WINDOW_CHARS` é alterado de 5000 para 3000 (tamanho adequado para `hermes3:8b` com um contexto de trabalho de 8K no perfil `dev-rtx5080`); a política de "falha suave" na chamada do avaliador é invertida (qualquer um dos 5 modos de falha — transporte / análise / rótulo inválido / justificativa vazia / tempo limite — resulta em `frame_excluded: true` com a razão `critic_unavailable`, em vez de aceitação); a semântica de promoção: afirmações `frame_excluded` não bloqueiam a promoção da seção; a transferência de trabalho expõe `frame_excluded` como um bucket separado, distinto dos buckets de afirmações aceitas, em correção ou rejeitadas. **Requer `ollama-intern-mcp@^2.4.0`**. 1013 testes passaram (de 901 para 1013, +112 testes). **Todos os quatro pacotes "frozen" são verificados byte a byte em relação às versões base da v0.3.3.** **Não é uma versão 1** — o trabalho para a versão 1 continua; consulte [`docs/roadmap.md`](docs/roadmap.md). Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Reforço da Plataforma (Dogfood Swarm)** — Publicada no npm como `@mcptoolshop/research-os@0.7.0`, em 11 de maio de 2026. Um processo de testes internos em quatro etapas (correção de bugs/segurança, resiliência proativa, melhoria da experiência do usuário e refinamento da apresentação) foi realizado na versão v0.6.0. A versão v0.7.0 inclui as seguintes melhorias de segurança: coleta de dados mais segura (tratamento de erros por URL com captura de exceções e preservação dos IDs das fontes em execução em caso de falha parcial); indexador mais resiliente (ignora e avisa sobre registros/arquivos/seções com JSONL malformado); tratamento estruturado de erros (12 subclasses de `ResearchOSError` com referências ao manual); feedback de progresso (`--no-progress` / `--progress` com detecção automática do terminal em diferentes etapas: revisão, coleta, mapeamento de conflitos, empacotamento e publicação); correções para facilitar a ação do usuário (`pack publish --force` com uma frase padrão que substitui completamente o conteúdo existente, com testes de regressão; correção de um erro de digitação no texto do comando `IndexNotBuiltError` e adição de um teste para o registro de texto do comando; adição de referências ao manual para cada uma das 12 subclasses de `ResearchOSError`); higiene da cadeia de suprimentos (fixação de hashes dos arquivos de ação do CI + negação padrão de permissões de leitura do conteúdo; cobertura do ecossistema Dependabot `/site` + `github-actions`); duas novas páginas no manual (`recovery.md`, `known-limitations.md`); refinamento da apresentação (testes de regressão de frases padrão, reordenação da barra lateral, avisos `:::caution` para ações destrutivas). 901/901 testes vitest aprovados (de 713 para 901, +188 testes). **Todos os quatro pacotes "frozen" são verificados byte a byte em relação às versões base v0.3.3.** **Não é uma versão 1.0** — O trabalho para preparar a versão 1.0 continua; consulte [`docs/roadmap.md`](docs/roadmap.md) e [`docs/swarm-hardening-proof.md`](docs/swarm-hardening-proof.md). Consulte [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — publicado no npm como `@mcptoolshop/research-os@0.6.0`, 10 de maio de 2026. v0.6.0 finaliza o Experimento 6 com evidências de confiança do revisor: o research-os agora pode produzir uma baseline canônica de modelo reproduzível e rastreável. Inclui: opções de revisor determinísticas no fluxo de revisão de produção (`review_profiles.<nome>.reviewer_options` em `research.yaml`); compatibilidade retroativa do esquema de "gate" para artefatos congelados anteriores à versão 0.3.3 (F-53); a saída da revisão revela as condições de amostragem diretamente nos arquivos `review.json` e `review.md` (F-54); relatório agregado determinístico canônico incluído (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **Nenhum baseline confiável aceito.** `hermes-two-pass-deterministic=falha` (lacuna estrutural na capacidade do modelo no vocabulário de decisão, não variância). **Hermes não é promovido a `baseline confiável`.** O ganho é o mecanismo, não um relatório de aprovação. Não houve alterações nos "gates", no processo de congelamento ou nas leis de síntese. Todos os quatro pacotes congelados são idênticos em termos de bytes. 713/713 testes vitest passaram. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — publicado no npm como `@mcptoolshop/research-os@0.5.0`, 10 de maio de 2026. A versão v0.5.0 torna a calibração de revisores mais robusta. Um perfil de revisor não é considerado confiável apenas porque foi executado uma vez; ele adquire um status através de relatórios estruturados de falhas simuladas e agregação de múltiplas execuções. Inclui: esquema de relatório de calibração estruturado (`seeded-v1.{json,md}`, validado com Zod, quatro rótulos de status); sistema de execução de múltiplas execuções (`--runs <n>`, isolamento por execução, critérios PASS/FAIL baseados na mediana, detecção de falhas recorrentes); critério de avaliação baseado na arquitetura; pesquisa de relatórios relativa ao pacote em `review-promote`. **Nenhum baseline confiável admitido:** `hermes-two-pass=failed` (agregado, 3 execuções), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. O research-os agora pode recusar a confiança em um perfil de revisor quando falhas simuladas repetidas não suportam a confiança. **Nenhuma alteração nos gates, congelamentos ou leis de síntese. Todos os quatro pacotes congelados verificam a identidade dos bytes.** 671/671 testes vitest aprovados. Consulte [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — Publicada no npm como `@mcptoolshop/research-os@0.4.0`, 10 de maio de 2026. A versão 0.4.0 garante a durabilidade da identidade da fonte. Regras determinísticas para o tipo de fonte lidam com a maioria repetível, os registros de substituição preservam as correções do operador durante a re-coleta, e o comando `source-card audit` substitui as verificações de derivação de scripts por uma interface de linha de comando (CLI) completa. Inclui: um classificador centralizado de tipo de fonte (Componente B — `classifySourceType`, 11 fornecedores padrão, `source-type-rules.json`); um registro de substituição de cartão de fonte (Componente A — `source-card-overrides.jsonl`, subcomandos `validate` e `list`); e uma CLI para auditoria de cartão de fonte (Componente D — `research-os source-card audit --pack <dir>`, 7 tipos de detecção, artefatos JSON + Markdown, opções `--apply --from` para aplicar o caminho). Correção estética F-46: os arquivos de manifesto agora indicam a versão binária em execução, em vez da versão fixada no arquivo `research.yaml` durante a inicialização da criação do pacote. **Não há alterações nas regras de validação, congelamento ou síntese. Todos os quatro pacotes existentes passam na verificação de integridade byte a byte.** 620/620 testes vitest aprovados. Consulte o arquivo [CHANGELOG.md](CHANGELOG.md) e a página do manual de auditoria de cartão de fonte: [https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — Publicado no npm como `@mcptoolshop/research-os@0.3.3`, 10 de maio de 2026. Inclui melhorias na clareza da semântica das "gates" obtidas com o Pack-3 (durabilidade da exportação/runtime do Godot, Experimento 3, pacote nº 3 de 3). A saída da "gate" agora inclui contadores específicos da seção, além dos contadores globais (F-43); a mensagem `no_source_cluster_monopoly` foi alterada de um aviso para um diagnóstico informativo (F-41). **O comportamento de aprovação/reprovação não foi alterado; os pacotes congelados existentes são verificados byte a byte.** 570/570 testes do vitest passaram. Consulte o arquivo [CHANGELOG.md](CHANGELOG.md) e o arquivo [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — Publicado no npm como `@mcptoolshop/research-os@0.3.2`, 09 de maio de 2026. Inclui a normalização das reivindicações aceitas, levando em consideração a aprovação para publicação do pacote. A verificação estrita de igualdade entre `claim-reviews.jsonl` e `pack-audit.json::accepted_claims` foi substituída por uma comparação de conjuntos efetivos — as reivindicações aceitas são os `claim_id`s únicos cuja última decisão de revisão canônica é "aceita para síntese" (a última decisão prevalece para cada `claim_id`). Pacotes congelados cuja contagem de auditoria legada difere do conjunto efetivo agora são aceitos com um aviso, em vez de serem rejeitados; o arquivo de auditoria legada é preservado integralmente (Lei 15), enquanto o manifesto do arquivo reflete a contagem normalizada. A rejeição permanece intransigente para `claim_id`s inexistentes, decisões duplicadas incompatíveis e restrições não elegíveis para síntese. Obtido através do Experimento 3 XRPL pack Session K — a publicação do pacote foi rejeitada devido a uma divergência real no registro de fechamento (a Seção 07 continha 24 linhas brutas de "aceito para síntese", mas apenas 19 `claim_id`s únicos devido a janelas de revisores sobrepostas). 558/558 testes vitest passaram. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — publicado no npm como `@mcptoolshop/research-os@0.3.1`, em 09 de maio de 2026. Inclui isenções de direitos autorais de seção (`primary_source_waiver.section_waivers[]`) e um reconhecimento por parte do revisor, de modo que uma descoberta de "monopólio da fonte" em toda a seção seja um aviso visível, em vez de direcionar automaticamente todas as reclamações para "needs_source_repair". Isso foi obtido no Experimento 3, pacote XRPL, Sessão 2 — as seções do protocolo canônico (cadeias de base única, especificações de API fechadas, documentação de órgãos de padronização) inverteram a suposição de que a diversidade de publicadores é um indicador da qualidade da informação. 540/540 testes vitest passaram. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Isenções de direitos autorais por seção** — Use-as quando a diversidade de publicadores é estruturalmente incompatível com a fonte de informação da seção, e não quando uma seção simplesmente não conseguiu encontrar fontes suficientes. Inclui um campo "reason" (motivo) com validação de esquema e um array "compensating_controls" (controles compensatórios) que não pode estar vazio. A política do pacote `primary_source_waiver_allowed: false` bloqueia tanto as isenções de nível de pacote quanto as isenções de seção. O "workaround" (solução alternativa) anterior à versão 0.3.1, que permitia `min_independent_publishers: 0`, está agora obsoleto; os pacotes congelados existentes permanecem válidos sob seus recibos existentes. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) e o [manual do operador do repositório "research-packs"](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publicado em 09 de maio de 2026. Inclui a flag `--detector <auto|heuristic|ollama-intern>` no comando `contradict map` (correção F-09 do bloqueador de cadeia do Experimento 3, Sessão 1, pacote XRPL). 527/527 testes vitest passaram. A seleção do detector agora é uma escolha explícita do operador, em vez de uma dança dependente do estado com variáveis de ambiente; o modo é anunciado de forma visível em cada execução. Consulte [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publicado em 09 de maio de 2026. Inclui o comando `research-os pack publish` (Experimento 2) e a correção do predicado de prontidão para o Padrão 2. 515/515 testes vitest passaram. Consulte [CHANGELOG.md](CHANGELOG.md). Os pacotes congelados são exportados para o repositório canônico "research-packs" com um único comando; o contrato de admissão é aplicado por código, e não por uma lista de verificação. Consulte [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — bloqueado em 2026-05-08. O pacote de teste em `research-os-packs/research-os-spec/` (repositório relacionado) atingiu o estado de bloqueio com 296 afirmações aceitas em 8 seções, 17 dispostas, 30 substituídas por operadores, 0 bloqueadores de correção ativos, 0 contradições não resolvidas, todos os "gates" com `synthesis_eligible=true`. 463/463 testes "vitest" passaram. Dezesseis leis fundamentais foram implementadas. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para as sete descobertas e as "impressões digitais" dos registros de bloqueio.

**Repositório monorepo `research-packs`** — disponível em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs), contendo quatro pacotes: `research-os-self-dogfood` (backfill do dogfood da versão 0.1, 296 declarações aceitas, 8 seções), `comfyui-workflow-durability` (Experimento 1, 302 declarações aceitas, 8 seções), `xrpl-creator-token-durability` (Experimento 3, pacote #2) e `godot-export-runtime-durability` (Experimento 3, pacote #3). Todos os pacotes passam no `verify-pack.mjs`.

**Experimento 1 da versão 1 (durabilidade do fluxo de trabalho ComfyUI)** — FINALIZADO em 09 de maio de 2026. Todas as 8 seções em Terminal A, pacote congelado, arquivo disponível. Consulte [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) e [`docs/roadmap.md`](docs/roadmap.md).

### O que `research-os` não é (e o que a versão v0.12.1 não afirma ser)

- Não comprovado o funcionamento independente do operador em novas instalações. A versão v0.12.0 resolveu as questões identificadas na fase v0.3 (o funcionamento independente do operador foi COMPROVADO para fins de segurança; o funcionamento independente do operador para fins de cobertura ainda NÃO foi alcançado – a melhoria implementada na versão v0.3); o teste da fase v0.4 contra a versão v0.12.0 resultou em "APROVADO COM CONDIÇÕES" (não atende aos requisitos de autorização) – a segurança básica foi mantida, o funcionamento independente do operador foi SUBSTANCIALMENTE comprovado no nível de resumo da seção, com um único ponto de falha na finalização. A versão v0.12.1 corrige esse único ponto de falha (R-018). A nova execução do teste v0.4 contra esta versão do npm é realizada em uma sessão separada e é um pré-requisito para a finalização.
- Não foi testado em condições reais por usuários externos, além dos testes internos e das quatro fases de teste do funcionamento independente do operador. Seis experimentos internos foram concluídos – um de referência, cinco em domínios externos (ComfyUI, XRPL, Godot, calibração do revisor, revisor determinístico) – além das fases de teste do funcionamento independente do operador nas versões v0.1, v0.2, v0.3 e v0.4, que revelaram 18 problemas identificados (R-001 a R-005 resolvidos na versão v0.10.0, R-007 a R-011 resolvidos na versão v0.11.0, R-012 a R-017 resolvidos na versão v0.12.0, R-018 resolvido na versão v0.12.1). O uso do sistema por vários operadores ainda é um trabalho futuro.
- Não é um gerador completo de pacotes. A versão v0.12.1 herda as funcionalidades de escopo de seção (`synth section`) e de escopo parcial de pacote (`synth pack --partial`) da versão v0.9, cada uma com uma declaração explícita de prontidão do pacote. A geração completa de pacotes ainda requer um pacote com a marca `synthesis_ready` e a criação manual (ou colaborativa) com base nos IDs de reclamação aceitos, utilizando o ambiente `synth workspace`.
- Não é uma validação de nenhum modelo de revisor. A versão v0.12.1 não inclui, por padrão, um perfil de revisor "confiável" (`trusted_baseline`); os registros de calibração são evidências, não validações. Os registros de calibração existentes da versão v0.6.0 são anteriores à arquitetura MCP da versão v0.8.0 e não foram reavaliados sob o caminho MCP. Consulte a página do manual de calibração do revisor: [https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Não está livre de artefatos históricos em pacotes congelados. Os pacotes congelados anteriores à versão v0.4 contêm a informação `research_os_version: '0.1.0'`, devido a uma constante fixa pré-v0.4; a correção foi implementada na versão v0.4.0, mas os pacotes congelados anteriores são imutáveis de acordo com a Lei 15 (veja [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Não possui informações de rastreabilidade no npm. A validação de rastreabilidade via Sigstore será implementada em uma versão futura; verifique os pacotes npm da versão v0.12.1 usando `package-shasum` e o commit da versão no GitHub.
- Não representa uma melhoria em relação à solução baseada em nuvem. O estudo comparativo entre a solução local e a baseada em nuvem, realizado nas versões v0.7.x, identificou as vantagens da nuvem em termos de legibilidade e carga de trabalho do operador; a versão v0.12.1 não afirma que essas vantagens foram superadas.

### Limitações conhecidas

A versão v0.12.1 é distribuída com três limitações conhecidas, visíveis ao operador, que foram mantidas de versões anteriores. Cada uma delas está documentada na página de limitações conhecidas do manual: [https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) e no arquivo [CHANGELOG.md](CHANGELOG.md). Nenhuma delas impede a distribuição; todas possuem um caminho definido para recuperação ou mitigação.

- **B-E-001 — A marcação de versão "frozen-pack" anterior à v0.4 é um artefato histórico.** Os pacotes "frozen" publicados nas versões de v0.3.3 a v0.6.0 contêm `research_os_version: "0.1.0"` nos arquivos `pack.manifest.json` e `pack/research.yaml` devido a uma constante fixa (hardcoded) anterior à v0.4. A correção foi implementada na versão v0.4.0 (o sistema de scaffolding agora importa a versão ativa de `RESEARCH_OS_VERSION`); os pacotes "frozen" anteriores são imutáveis de acordo com a Lei 15. Os arquivos JSON de auditoria dentro dos pacotes afetados já contêm suas versões correspondentes.
- **B-E-004 — A autenticação de "provenance" do npm será implementada em uma versão futura.** O arquivo "tarball" do npm v0.12.1 verifica apenas através de "package-shasum". A migração do fluxo de publicação para um fluxo de trabalho de CI com o OIDC do sigstore conflita com a disciplina de "traduzir antes de publicar" (o TranslateGemma 12B é executado localmente); a migração está planejada para uma versão futura. Verifique os pacotes npm v0.12.1 através de "package-shasum" e do commit da versão no GitHub.
- **B-A-003 — A migração do esquema de versão do indexador está documentada, mas não é obrigatória.** A versão v0.12.1 inclui um inteiro `SCHEMA_VERSION` para escrita, mas não possui um mecanismo de migração para leitura. Ao atualizar a versão documentada do `SCHEMA_VERSION`, exclua o arquivo `.research-os/index.sqlite` e execute novamente `research-os index build --all`. O próprio pacote não é afetado; o indexador é uma camada de aceleração sobre evidências + declarações (Lei 8); a reconstrução é idempotente.

**Não é permitido nenhum perfil de revisor de "trusted_baseline" na versão v0.12.1.** Isso é uma postura de confiança intencional, não uma lacuna: os recibos de calibração no repositório (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) registram as evidências. A confiança é conquistada através de testes repetidos de recuperação de falhas simuladas, e não é presumida. Esses recibos são anteriores à arquitetura MCP v0.8.0 e não foram redefinidos no caminho do MCP.

## Roteiro para a versão 1.0

A versão 1.0 é um estado alcançado, não uma data de lançamento. Todos os seis experimentos internos foram concluídos (Exp1–Exp6, de 08 de maio de 2026 a 11 de maio de 2026), e cada um deles gerou um pacote de pesquisa que foi incluído em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). O projeto alcançou a versão v0.2.0 com a funcionalidade `research-os pack publish` + Padrão 2 (Experimento 2), a versão v0.3.0 com a flag `--detector` (F-09), a versão v0.3.1 com as permissões específicas para seções (F-10/F-11), a versão v0.3.2 com a contabilização normalizada das aprovações (F-36), a versão v0.3.3 com maior clareza na semântica dos controles (F-43/F-41), a versão v0.4.0 com a disciplina de verificação da fonte (F-27/F-47/F-46), a versão v0.5.0 com a calibração dos revisores como um contrato de confiança duradouro (F-48/F-49/F-50) e a versão v0.6.0 com uma linha de base determinística para os revisores (F-53/F-54). A preparação para o lançamento da versão 1.0 está em andamento por meio de um processo de refinamento em várias etapas; a arquitetura está bloqueada durante todo o processo. O plano completo está disponível em [`docs/roadmap.md`](docs/roadmap.md).

## Licença

MIT.
