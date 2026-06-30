<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.14.0"><img src="https://img.shields.io/badge/version-0.14.0-blue" alt="version 0.14.0"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

`research-os` transforma a pesquisa, partindo de um documento gerado, em um conjunto de evidências fixo e imutável. Preserva a fonte original, separa as afirmações da síntese, garante o cumprimento dos requisitos por meio de etapas controladas, registra as decisões do revisor e as renúncias, e publica um pacote cujas afirmações podem ser rastreadas e verificadas.

Não exige que você confie no modelo. Ele fornece as ferramentas para decidir se o modelo, as fontes e a síntese realmente merecem confiança.

## O que é

`research-os` é a camada de controle entre "Eu quero pesquisar X" e uma base de evidências fixa e imutável, com rastreamento das afirmações. Ele separa as descobertas iniciais da coleta de evidências, a extração bruta das afirmações selecionadas, a detecção de contradições da resolução de contradições e as decisões de revisão das disposições da síntese. Cada etapa é registrada em um livro-razão que só permite adições; cada verificação de cumprimento dos requisitos é calculada a partir desses livros-razões, não apenas declarada.

Não é um gerador de relatórios. Não é uma estrutura de orquestração de LLMs. Não escreve a síntese por você. Ele impõe as condições sob as quais a síntese pode começar.

Os pacotes fixos são arquivados em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — ativos, com quatro pacotes abrangendo os seis experimentos de teste fechados. Consulte [`docs/roadmap.md`](docs/roadmap.md) para o plano da versão 1.0.

A versão 0.1 foi testada em duas fases de testes. A primeira — `research-os` pesquisando sua própria especificação — encontrou sete lacunas de correção antes do lançamento da versão 0.1.0, cada uma exigindo uma correção real no código e resultando em uma lei ou padrão de integração. A segunda (Experimento 1 da v1: durabilidade do fluxo de trabalho ComfyUI, 11 sessões, um domínio sem sobreposição de vocabulário com `research-os`) foi concluída em 09/05/2026: pacote fixo, arquivo ativo, implementação do Padrão 2 concluída por meio do commit `22b5dba`. O registro da prova da versão 0.1 está em [`docs/dogfood-proof.md`](docs/dogfood-proof.md); a prova do Experimento 1 está em [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Manual online: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Instalação

**Requisitos:** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Para colaboradores que estão construindo a partir do código fonte:

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

> **Observação sobre a saída de `freeze`.** `research-os freeze` opera silenciosamente enquanto percorre cada artefato canônico e calcula os hashes de conteúdo — não há progresso incremental para este comando. Em pacotes grandes, pode levar dezenas de segundos antes de imprimir qualquer coisa. Quando termina, imprime um único bloco de verificação (`PASS` / `REFUSED` mais o caminho do recibo). Não interprete a pausa como uma falha.

> **Aviso sobre `--force`.** `--force` limpa e substitui o diretório do pacote de destino. Não mantenha arquivos criados manualmente dentro da saída do pacote gerado. Edite os artefatos upstream (afirmações, fontes, síntese) ou arquivos relacionados em vez disso. Contrato completo de admissão + casos de recusa: [`docs/pack-publish.md`](docs/pack-publish.md).

**Para um exemplo prático**, consulte o pacote de teste em `research-os-packs/research-os-spec/` — todos os artefatos, todos os recibos, todas as disposições, todas as impressões digitais de fixação, tudo armazenado em disco em livros-razões que só permitem adições. Esse pacote é o que gerou `docs/dogfood-proof.md`.

**Requer [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) em execução localmente** para extração, triagem, revisão e descoberta de LLMs. O servidor MCP é descoberto por meio da variável de ambiente `OLLAMA_INTERN_MCP_BIN` ou do PATH. O modelo padrão é `hermes3:8b`; substitua com `OLLAMA_INTERN_MODEL=<model>` (ou por chamada, `--model <name>`). Defina `OLLAMA_HOST` se o Ollama não estiver no endereço padrão `localhost:11434`.

## As 16 leis fundamentais

| # | Lei |
|---|-----|
| 1 | Nenhuma síntese antes da fonte original. |
| 2 | A coleta é evidência; a extração é interpretação. |
| 3 | Os modelos podem interpretar trechos de texto; eles não podem criar trechos de evidência. |
| 4 | A extração pode gerar em excesso; a síntese não pode herdar o excesso. |
| 5 | O mapeamento de contradições revela tensão; não resolve, sintetiza ou decide qual afirmação vence. |
| 6 | As etapas controladas decidem se uma seção é elegível para síntese. Elas não sintetizam nem ocultam falhas. |
| 7 | A revisão adversarial avalia a integridade da pesquisa. Não sintetiza nem reescreve a fonte original. |
| 8 | A indexação torna a verdade da pesquisa pesquisável. Não cria nova verdade nem se torna a fonte de registro. |
| 9 | O repasse entre colegas gera instruções operacionais a partir da verdade da pesquisa. Não cria verdade nem ignora as etapas controladas. |
| 10 | O espaço de trabalho de síntese organiza a verdade da pesquisa aceita para o repasse entre colegas. Não cria síntese nem ignora o modo de repasse. |
| 11 | A auditoria do pacote agrega a verdade da pesquisa existente. Não cria nova verdade nem oculta evidências em nível de seção. |
| 12 | A descoberta propõe pistas; apenas a coleta produz evidência. |
| 13 | Um revisor não é confiável até que falhas detectadas provem sua capacidade de recuperação. |
| 14 | O excesso de afirmações não é qualidade da pesquisa. As afirmações devem ser selecionadas antes de poderem competir pela síntese. |
| 15 | A fixação bloqueia a verdade da pesquisa concluída. Não conclui pesquisas inacabadas nem converte o estado de reparo em evidência. |
| 16 | As renúncias relaxam as restrições da fonte; elas não podem fabricar evidências. |

**Lei 3** — o LLM nunca cria texto de evidência. `research-os` constrói um livro-razão determinístico de excertos (IDs estáveis, como `ex_<source_id_hex>_001`); o LLM seleciona os IDs dos excertos; `research-os` copia o texto literal. A classe de falha "paráfrase como citação" é estruturalmente impossível.

**Lei nº 14** – entre a extração e a revisão, o `research-os claim triage` elimina duplicatas, define limites para a contribuição por fonte e arquiva candidatos de baixa relevância. O processo de triagem NÃO altera o arquivo `claims.jsonl`; as reivindicações arquivadas permanecem no registro canônico.

## O fluxo de trabalho v0.1

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

Cada etapa é um comando CLI. Cada etapa grava em artefatos com apenas anexação. Nenhuma etapa sintetiza, resolve ou cria novas informações – essas invariantes são aplicadas, não confiadas. A revisão aceita/rejeita/solicita reparos nas reivindicações candidatas; o "gate" processa essas decisões de revisão para calcular `synthesis_eligible`; a fase final é o bloqueio de integridade que se recusa a marcar um pacote como concluído, a menos que todas as camadas concordem. Consulte [docs/dogfood-proof.md](docs/dogfood-proof.md) para obter a prova da v0.1 de que o fluxo de trabalho funciona de ponta a ponta.

Esta é a alternativa estrutural a *pesquisa → resumo → relatório detalhado*. O fluxo de trabalho é o produto.

## Vocabulário

| Termo | Significado |
|------|---------|
| `research-os` | O plano de controle / CLI / "gates" / lei de orquestração (este repositório) |
| `research-pack` | O artefato do repositório gerado para um projeto de pesquisa |
| `research section` | Uma unidade limitada de investigação dentro de um pacote |
| `research receipt` | Prova de que uma seção passou pelas verificações de fonte/reivindicação/"gate" |

## Segurança

O `research-os` é um CLI com foco no uso local. Ele lê e grava arquivos dentro do diretório "research-pack" que você especificar, e (ao usar o comando `gather`) emite solicitações HTTP para buscar URLs de fonte que você fornecer. Ele não: executa um servidor, aceita conexões de entrada, armazena credenciais ou envia dados de telemetria. Nenhum segredo é gravado nos artefatos do pacote. Consulte [SECURITY.md](SECURITY.md) para obter a política de notificação de vulnerabilidades.

## Calibração do revisor

A v0.5.0 torna a calibração do revisor persistente. Um perfil de revisor não é considerado confiável apenas porque foi executado uma vez; ele ganha um status por meio de recibos estruturados de falhas simuladas e agregação em várias execuções. A v0.6.0 adiciona opções determinísticas para o revisor ao caminho de revisão de produção e ao conjunto de calibração.

**Atualmente, nenhum perfil é admitido como `trusted_baseline`.** Os recibos canônicos no repositório mostram `hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`. Isso é intencional: a confiança é conquistada por meio de evidências repetidas de falhas simuladas, não presumida. O recibo `hermes-two-pass-deterministic` tem uma lacuna estrutural no modelo de capacidade (2 dos 6 tipos de decisão produzidos; requer 3 de 6) que não é um problema de variação.

Os recibos de calibração estão localizados em `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`. Cada recibo registra PASS/FAIL em relação a sete parâmetros, quatro rótulos de status (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`) e divulga honestamente o que o teste não consegue verificar (`needs_contradiction_mapping` é inatingível a partir de `seeded-v1`). Consulte [CHANGELOG.md](CHANGELOG.md).

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

Quando `--runs <n>` é usado, os recibos por execução são gravados em `<profile>/runs/run-NNN.json` e um recibo agregado (com parâmetros baseados na mediana e detecção de falhas recorrentes) é gravado em `<profile>/seeded-v1.{json,md}`. O recibo agregado contém `receipt_kind: 'aggregate'` para diferenciar dos recibos de execução única. O modo de execução única (`--runs 1` ou omitido) preserva o comportamento existente de gravação direta.

**Perfis de revisor determinísticos** – use `review_profiles.<name>.reviewer_options` em `research.yaml` para incluir `temperature`, `seed` e outros parâmetros de amostragem do Ollama em cada construção de `OllamaInternReviewer` no caminho de revisão de produção. O perfil `hermes-two-pass-deterministic` é fornecido como um exemplo integrado. Consulte [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) e a [página do manual de calibração do revisor](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Novo na v0.13.1 – R-024 Autoridade de Orçamento de Nível da Fase de Extração (Patch do Caminho C)

A v0.13.1 é um patch de correção única sobre a v0.13.0. Ela corrige a condição do Track-C v0.5 (R-019 lacuna no escopo da fase de extração da reivindicação) estendendo a autoridade de orçamento de nível do R-019 para cada chamada MCP `ollama_extract` feita durante a `extração da reivindicação` – o extrator por janela, o crítico de evidências de seção R-011 por reivindicação e o crítico de resgate R-012 por candidato a resgate. A mesma estrutura arquitetural do R-019 para cobertura de síntese de prosa. Patch de repositório único (apenas research-os); o campo de esquema `tier_budget_ms_override` do ollama-intern-mcp@2.6.0 é o alcance inalterado no lado do servidor.

O lançamento existe porque o "gate" de isolamento do operador v0.5 em relação ao `@mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0` publicado retornou **PASS_WITH_CONDITIONS, NÃO com nível de autorização** (`operator_aloneness_dst_v0.5`). Todas as superfícies da v0.13 (R-018 + R-019 + R-020 + R-021) foram executadas ao vivo sem erros; o limite de defesa foi preservado; recusa honesta em falhas nomeadas com ações de recuperação documentadas. No entanto, 3 das 8 fontes na seção 02 (`02-safety-and-economic`) atingiram o tempo limite instantâneo de 15000 ms do nível TIER_TIMEOUT durante a extração sem nenhuma substituição visível para o operador. O R-019 havia fornecido a substituição analógica para a síntese de prosa na v0.13.0; a v0.13.1 estende isso à fase de extração.

> **O R-024 implementa a regra completa do orçamento de nível: ao estender um orçamento de nível, o orçamento deve abranger todas as chamadas LLM naquele estágio que podem produzir o mesmo tempo limite interno. Cobertura parcial = patch mal direcionado na camada de cobertura do local da chamada.**
> **O R-024 também implementa a regra de fragilidade do teste de repetição ao vivo: quando um teste de aceitação de repetição ao vivo falha por motivos de infraestrutura (tempo, captura, estado do dispositivo) em vez de motivos mecânicos, corrija o conjunto de testes – NÃO ignore, rebaixe ou substitua pela inspeção manual do artefato.**

A versão v0.5 define o caminho D (triagem de múltiplas faixas). A v0.13.1 encerra a faixa C. A faixa A foi encerrada durante a fase de configuração (lista de permissões do caminho de ativação do mecanismo de memória). A faixa B (configuração de descoberta da fonte) é ativada em uma sessão separada após a publicação da v0.13.1. A configuração do gatilho v0.6 segue a faixa B. O segmento de admissibilidade 1 permanece **não autorizado** até que a v0.6 seja aprovada.

### O que você pode executar

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

Prioridade: sinalizador da CLI > variável de ambiente > padrão (omitido; os padrões do perfil ollama-intern-mcp são aplicados). Limite de `[1, 600000]` ms (limite máximo de segurança de 10 minutos). Valores inválidos falham claramente com um código de saída diferente de zero, indicando a superfície + o valor problemático.

### O que há de novo

**R-024 — autoridade do orçamento por nível na fase de extração em todos os 3 locais de chamada `ollama_extract`.** O novo sinalizador `--tier-budget-ms <N>` em `claim extract` (e a variável de ambiente correspondente `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS`) encaminha um orçamento por nível controlado pelo operador para cada chamada para `ollama-intern-mcp@>=2.6.0` como `tier_budget_ms_override` em TODAS as invocações de `ollama_extract` durante a execução da extração: `MCPClaimExtractor.extractOnePage` (o extrator por janela), `runCritic` (crítico de seção por reivindicação R-011, uma chamada por rascunho por janela) e `runRescueCritic` (crítico de resgate por candidato de resgate R-012 em rascunhos com incompatibilidade do conteúdo da fonte). O orçamento ativo é exibido em stderr (`[extract] tier_budget_ms=N source=... section=<id>`) antes do loop por fonte, nos metadados do recibo de extração (`tier_budget_ms` + `tier_budget_overridden_by` em `audits/<section>-claim-extract.json`) e no enum fechado `EXTRACT_TIER_BUDGET_SOURCES` (`['default', 'cli_flag', 'env_var']`). O comportamento padrão é idêntico à v0.13.0 (sem sinalizador, sem variável de ambiente → os padrões do perfil são aplicados; o recibo omite os novos campos).

### Observação arquitetural

R-024 espelha a arquitetura de R-019, mas em uma fase diferente. R-019 conectou o override por meio de `runProseSynthesis` ao planejador + rascunhista + verificador (3 locais de chamada `ollama_extract` para síntese de prosa); R-024 conecta-o por meio do orquestrador `extract()` → `MCPClaimExtractor.extract` → distribuição para extractOnePage + runCritic + runRescueCritic (3 locais de chamada `ollama_extract` na fase de extração). A regra de orçamento por nível com cobertura total é agora um princípio fundamental: ao estender um orçamento por nível para uma superfície voltada para o operador, o relatório da Fase B deve enumerar todos os locais de chamada LLM nessa fase que compartilham o mesmo tempo limite interno. Cobertura parcial resulta em um PATCH MAL DIRECCIONADO na camada de cobertura do local de chamada com a mesma assinatura auto-falsificadora do PATCH MAL DIRECCIONADO do wrapper/mecanismo interno de R-018: o recibo registra o override E o tempo limite nomeado é acionado em um local de chamada não coberto no mesmo artefato.

ZERO alterações em ollama-intern-mcp. O campo de esquema `tier_budget_ms_override` da v2.6.0 já estava disponível desde o lançamento coordenado de R-019; a v0.13.1 fornece a conexão do cliente da fase de extração do lado da pesquisa.

### Limite de defesa preservado

R-024 é uma adição de controle pelo operador, não uma alteração arquitetural. R-002 até R-021 permanecem inalterados. `accepted_claim_floor` permanece inegociável. Enums fechados inalterados (`FailureShape` em 9; `RECOVERY_ACTIONS` em 8; `REGENERATION_REASONS` em 3; `PLANNER_TIMEOUT_SOURCES` em 3; `POLICY_KEYWORDS` em 8; `POLICY_RELEVANT_SOURCE_TYPES` em 1). R-024 adiciona o novo enum fechado `EXTRACT_TIER_BUDGET_SOURCES` (3 valores) sem alterar nenhum enum existente. O modelo de prompt do consultor de recuperação de IA permanece inalterado. A arquitetura MCP é estendida de forma aditiva. A forma da expressão regular de fallback-cause de R-010 é preservada. A forma de extração `--resume / --progress` de R-015 é preservada (R-024 adiciona UMA NOVA linha de log stderr + NOVOS campos de recibo; o formato do ledger existente + comportamento de salto + forma de emissão permanecem inalterados).

Regressão de pacote congelado byte a byte em relação às linhas de base da v0.3.3 para todos os quatro pacotes congelados — **décima nona versão consecutiva** em que isso se mantém. 1630 → 1663 testes vitest aprovados (+33 aceitação sintética R-024 + 1 proteção sempre ativa; 6 ignorados — testes de reprodução ao vivo dependem de variáveis de ambiente do rig).

### O que a v0.13.1 NÃO afirma

- Prontidão para v1.
- Verificação do gatilho de autonomia do operador da v0.6. A configuração da v0.6 segue R-023 (configuração de descoberta da fonte); a v0.13.1 é o pré-requisito para o encerramento da faixa C, não a prova.
- Segmento de admissibilidade 1. Depende da aprovação da v0.6.
- Candidatos adiados da v0.13.x (F-2 R-009 divergência auditoria↔extração; F-3 estagnação do handoff de colaboração; F-4 estreiteza das PALAVRAS-CHAVE DE POLÍTICA de R-017).

Consulte [CHANGELOG.md](CHANGELOG.md) para a entrada completa da versão.

## Anteriormente: v0.13.0 — Arco de Triagem do Bloqueador de Finalização (R-019 + R-020 somente D + R-021)

A v0.13.0 encerra o arco de triagem do bloqueador de finalização da v0.13, aberto após a execução da v0.4 contra `@mcptoolshop/research-os@0.12.1`, que retornou **PASS_WITH_CONDITIONS, não autorização**, por meio do caminho D (arco de triagem de múltiplos bloqueadores, distinto do caminho C com patch nomeado). Três bloqueadores de finalização independentes em três camadas diferentes da linha de processamento; três controles nomeados independentes que, juntos, desbloqueiam a síntese de prosa e a superfície de recuperação de cluster sem resposta e o modo automático do mapa de contradição. O limite de defesa e as superfícies de recuperação de cobertura das versões v0.10 / v0.11 / v0.12 / v0.12.1 permanecem intactos; nenhuma alteração nos enums fechados; nenhuma alteração nas superfícies.

> **A execução da v0.4 prova que a aceitação sintética pode validar o encanamento, enquanto a reprodução ao vivo falsifica o mecanismo de destino.**
> **A v0.13 aborda o controle de tempo de execução da finalização: R-019 desbloqueia a camada interna do orçamento por nível da MCP; R-020 apresenta uma recusa honesta do cluster sem resposta com ações de recuperação; R-021 desbloqueia a camada RPC do modo automático do mapa de contradição.**

O gatilho de autonomia do operador da v0.5 é ativado em relação à v0.13.0 publicada em uma sessão separada. O segmento de admissibilidade 1 permanece **não autorizado** até que a v0.5 seja aprovada.

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

**R-019 — Configuração do cliente de orçamento por nível no MCP.** A flag `--planner-timeout-ms <N>` de R-018 (e a variável de ambiente `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`) agora é transmitida através do planejador/redator/verificador para `ollama_extract.tier_budget_ms_override`, alcançando `runWithTimeoutAndFallback` em `ollama-intern-mcp/src/guardrails/timeouts.ts:61`. O mecanismo de tempo limite interno por nível que gerou a falha da nova execução v0.4 (`elapsed=15018ms budget=15000ms`) agora respeita diretamente o orçamento definido pelo operador. O wrapper de R-018 é mantido como uma barreira externa para evitar travamentos causados por promessas não resolvidas (os wrappers do modo de falha ortogonal podem, na verdade, detectar esses problemas). Requer `ollama-intern-mcp@>=2.6.0`; versões mais antigas ignoram silenciosamente o novo campo de esquema (o wrapper de R-018 ainda funciona em sua camada original — degradação graciosa).

**R-020 (apenas para D) — Superfície de recuperação do `no_answer_cluster`.** Quando o planejador se recusa a atribuir o papel `role=answer` a qualquer afirmação aceita, a falha agora é exibida diretamente em `recovery_actions[]` (`narrow_section_purpose` + `add_on_topic_sources`) em `section-synthesis.json`, um bloco markdown renderizado `## Recovery actions` em `section-synthesis.md` (com cabeçalho action_id + texto "por quê" + bloco de código fenced command_hint) e uma dica de erro padrão de uma linha (`[synth] no_answer_cluster — veja o bloco "Recovery actions" em section-synthesis.md para obter etapas acionáveis`). A lista de ações é uma única fonte de verdade compartilhada com o caminho de recuperação do gráfico de ações; não há divergência entre os caminhos de comando independente e corpo de falha inline. **O ajuste do prompt do planejador de R-020 (metade A) foi tentado e revertido** — a iteração 1 produziu uma síntese silenciosamente incorreta (o LLM fabricou respostas com efeito nulo a partir de afirmações com efeito positivo em casos de teste adversários; o verificador validou a negação invertida como `faithful`); o HARD GUARDRAIL da iteração 2 não substituiu a alucinação. De acordo com a regra de uma única iteração do operador, o prompt e os 3 arquivos de teste fixados na versão v3 foram revertidos; `PROSE_PROMPT_VERSION` permanece em `section-prose-v3`. A doutrina foi reforçada: a reprodução estrutural ao vivo pode ser bem-sucedida enquanto o conteúdo sintetizado estiver silenciosamente incorreto; é necessária uma inspeção manual da prosa em casos de teste adversários para detectar inversão de negação/escopo/predicado.

**R-021 — Tempo limite de travamento do modo automático contradict-map + fallback heurístico + progresso visível.** Novo `--auto-mode-pair-timeout-ms <N>` (padrão 90000; reduzido em relação aos 120 segundos codificados anteriormente em R-021 após a medição da taxa de aquecimento do hermes3:8b na versão v0.4: mínimo de 6,2 s, mediana de 8,4 s, máximo de 8,8 s → padrão de 90 s tem ≥81 s de margem). Novo `--auto-mode-fall-through-after-n-timeouts <N>` (padrão 5; limite de falha consecutiva para fallback heurístico automático; classificações bem-sucedidas do tipo `type:none` redefinem o contador). Variáveis de ambiente correspondentes. Nova linha de início stdout (`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`) emitida em cada invocação — sempre visível, sobrevive em contextos não TTY. A emissão forçada do evento de gatilho de fallback stderr ignora o gating TTY / `--progress` porque o operador deve ver a mudança de modo. Novo bloco markdown `## Auto-mode fall-through` em `contradictions.md` quando o limite é atingido. Novas execuções heurísticas apenas em pares não processados (sem nova classificação duplicada de pares que o LLM já concluiu).

### Observação arquitetural

R-019 cruza a fronteira research-os ↔ ollama-intern-mcp. Research-os passa `tier_budget_ms_override` no esquema `ollama_extract`; ollama-intern-mcp v2.6.0 o respeita na barreira interna. A infraestrutura já estava lá; v2.6.0 forneceu o ponto de entrada do lado do cliente; v0.13.0 fornece a configuração do cliente do lado do research-os. O wrapper Promise.race de R-018 é mantido porque protege contra um modo de falha ortogonal (travamentos de promessas não resolvidas — os wrappers podem detectar esses problemas; cargas úteis estruturadas `isError:true` em um orçamento interno que o wrapper não pode alcançar são o domínio de R-019).

R-021 é apenas para research-os. O modo automático contradict-map NÃO passa pelo ollama-intern-mcp — ele chama diretamente a API HTTP da Ollama `/api/chat`. Sem transporte MCP na cadeia; sem infraestrutura `tier_budget_ms_override`; sem wrapper R-018. O protocolo de inicialização das quatro leis duras detectou um erro no início de R-021 antes que qualquer código de correção fosse escrito: o início dizia "camada RPC do MCP"; a fase A da leitura falsificou isso.

### Limite de defesa preservado

R-019 + R-020 (apenas para D) + R-021 são adições controladas pelo operador, não alterações arquiteturais. R-002 até R-018 permanecem inalterados. `accepted_claim_floor` permanece inegociável. Enums fechados inalterados (`FailureShape` em 9; `RECOVERY_ACTIONS` em 8; `REGENERATION_REASONS` em 3; `PLANNER_TIMEOUT_SOURCES` em 3; `POLICY_KEYWORDS` em 8; `POLICY_RELEVANT_SOURCE_TYPES` em 1). Modelo de prompt do consultor de recuperação de IA inalterado. A arquitetura MCP é estendida de forma aditiva. A forma da regex de fallback-cause preservada.

Regressão de pacote congelado byte a byte em relação às linhas de base v0.3.3 para todos os quatro pacotes congelados — **décima oitava versão consecutiva** em que isso se mantém. 1542 → 1630 testes vitest aprovados (+88 nos três segmentos; 4 ignorados — testes de reprodução ao vivo com gating nas variáveis de ambiente do rig).

### O que v0.13.0 NÃO afirma:

- Prontidão para v1.
- Verificação do gate de "operador sozinho" da v0.5. A v0.5 é executada contra `@mcptoolshop/research-os@0.13.0` em uma sessão separada; v0.13.0 é o pré-requisito para a finalização, não a prova.
- Admissibilidade do Slice 1. Com gating na aprovação da v0.5.
- Candidatos diferidos de v0.13.x (F-2 divergência audit↔extract em R-009; F-3 estagnação no handoff de colaboração; F-4 estreiteza das POLICY_KEYWORDS em R-017; A-1 + A-2 descobertas do lado do arquiteto incorporadas na preparação do gate da v0.5).

Consulte [CHANGELOG.md](CHANGELOG.md) para a entrada completa da versão.

## Anteriormente: v0.12.1 — Substituição do tempo limite do planejador de síntese (patch do caminho C)

v0.12.1 foi uma atualização pontual para corrigir um único problema, aplicada sobre a versão v0.12.0. Ela incluiu apenas o R-018 — um wrapper do lado da pesquisa que define um tempo limite para chamadas `callTool` na sintaxe MCP, controlado por uma flag CLI detectável pelo operador (`--planner-timeout-ms <N>` em `synth section` e `synth workspace`) e pela variável de ambiente correspondente (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`). Prioridade: flag CLI > variável de ambiente > padrão (15000 ms). O comportamento padrão é preservado, sendo idêntico ao da v0.12.0.

Esta versão foi lançada porque o teste v0.4 para verificar se o operador funciona sozinho em relação a `@mcptoolshop/research-os@0.12.0` retornou **PASS_WITH_CONDITIONS, e não um resultado de nível de autorização** (`operator_aloneness_dst_v0.4`). A proteção da v0.11 foi mantida sob carga real; todas as seis áreas de cobertura/recuperação da v0.12 foram ativadas e suportaram o operador; a cobertura do envelope selado atingiu os limites mínimos (4/5 SUPORTADOS + 1 PARCIAL obrigatório; 2/3 SUPORTADOS + 1 PARCIAL moderadores; 0/3 armadilhas; 0/5 falhas de material detectadas); os marcadores de contaminação foram todos INOFENSIVOS. O único modo de falha foi a finalização: a sintaxe atingiu `TIER_TIMEOUT` de forma consistente em aproximadamente 15010 ms, em comparação com o limite de 15 segundos do nível Instant, sem nenhuma alteração documentada pelo operador. Os resumos da seção estavam em conformidade com o envelope; o pacote simplesmente não conseguiu alcançar a fase final.

**Disposição do caminho C** (novo padrão obtido na v0.4): quando a sessão B identifica um único mecanismo de falha nomeado com um caminho de correção explícito E a cobertura do envelope está nos limites mínimos E a proteção é mantida E a contaminação é inofensiva, a disposição é: lançar a atualização, executar novamente o mesmo caminho do operador na versão corrigida e reavaliar. Não há necessidade de refazer a autorização do envelope. Não há avaliador humano. Não há mudança arquitetural para a v0.13.

> **A v0.4 comprova o nível de cobertura do Research-OS no nível do resumo da seção.**
> **A v0.12.1 deve comprovar o nível de finalização, removendo o único gargalo do tempo limite do planejador sem enfraquecer a proteção.**

### O que você pode executar

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

Os limites ativos estão em `section-synthesis.json` (`planner_timeout_ms` sempre preenchido + `planner_timeout_overridden_by` presente apenas quando há alteração), metadados ProseBlock e stderr (`[synth] planner_timeout_ms=N source=… section=<id>` emitido antes da geração da sintaxe). `synth section --help` documenta a flag, o padrão, o limite superior (600000 ms de segurança) e a alternativa da variável de ambiente. Valores inválidos (negativos, zero, não numéricos, strings com sufixos de unidade, > 600000) falham claramente com um código de saída diferente de zero, indicando a área + o valor problemático. Não há fallback silencioso.

### Observação arquitetural

O limite de 15000 ms que o teste v0.4 utilizou está em `ollama-intern-mcp` (`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`), e não no research-os. Antes do R-018, o research-os não aplicava nenhum tempo limite para o planejador — o tempo limite era acionado no lado do servidor na política de nível do ollama-intern-mcp. A resolução do R-018 introduz a própria autoridade do research-os sobre o limite por meio de um wrapper `Promise.race` em torno do `callTool` da MCP, com o padrão sendo o número observado de fato para o nível Instant (15000 ms), de modo que o comportamento padrão seja preservado. O wrapper do R-018 produz erros no formato `TIER_TIMEOUT`, que correspondem à expressão regular `classifyFallbackCause` do R-010 (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`), preservando a visibilidade do consultor de IA em execuções no caminho padrão.

### Limite de defesa preservado

O R-018 é uma atualização pontual simples, não uma mudança arquitetural. R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 permanecem inalterados. `accepted_claim_floor` permanece inflexível. Enums fechados não foram alterados (`FailureShape` em 9; `RECOVERY_ACTIONS` em 8; `REGENERATION_REASONS` em 3; `POLICY_KEYWORDS` em 8; `POLICY_RELEVANT_SOURCE_TYPES` em 1). O modelo de prompt do consultor de recuperação de IA permanece inalterado. A arquitetura da MCP não foi alterada — `ollama-intern-mcp@^2.4.0` é mantida. O R-018 adiciona `PLANNER_TIMEOUT_SOURCES` (3) como um novo vocabulário para o registro do operador, distinto de qualquer enumeração de roteamento de teste.

A regressão do pacote congelado é idêntica às linhas de base da v0.3.3 para todos os quatro pacotes congelados — **décima sexta versão consecutiva** em que isso ocorre. 1542 → 1586 testes vitest aprovados (+44 testes de aceitação do R-018).

### O que a v0.12.1 NÃO afirma:

- Prontidão para a v1.
- Resultado da execução novamente do teste de operador independente da v0.4. As execuções da v0.4 são realizadas em relação a `@mcptoolshop/research-os@0.12.1` em uma sessão separada; a v0.12.1 é o pré-requisito para o nível de finalização, e não a prova.
- Fatia de Admissibilidade 1. Depende da aprovação na execução novamente da v0.4 — a doutrina da v0.4 (independência comprovada no nível de proteção; independência substancialmente comprovada no nível do resumo da seção; finalização pendente na v0.12.1) permanece como o teste bloqueado.
- Candidatos para a v0.13 (divergência F-2 R-009 audit↔extract; estagnação F-3 cowork-handoff; restrição F-4 R-017 POLICY_KEYWORDS). Independente da finalização.

Consulte [CHANGELOG.md](CHANGELOG.md) para a entrada completa da versão.

## Anteriormente: v0.12.0 — Lançamento de Cobertura e Recuperação

A v0.12.0 encerra as descobertas do teste de independência do operador v0.3, que surgiram em 16-05-2026 (`operator_aloneness_dst_v0.3`, PASS_WITH_CONDITIONS, mas não no nível de autorização). Seis descobertas nomeadas em quatro fatias: três correções arquiteturais que encerram as lacunas de cobertura que bloqueiam a v0.4 (R-012, R-013, R-014) e três melhorias ergonômicas que aprimoram a superfície do operador que o teste da v0.4 irá avaliar (R-015, R-016, R-017). A v0.3 não falhou porque as defesas regrediram — todas as cinco superfícies de defesa da v0.11 foram ativadas exatamente como projetado, produzindo uma síntese limpa e honesta, sem conteúdo silenciosamente incorreto, e o pacote foi congelado com base em evidências reais, mas limitadas. Falhou porque as mesmas defesas, funcionando corretamente, removeram a cobertura primária de fontes importantes da base de reivindicações aceitas. A doutrina obtida na v0.3:

> **A v0.11 tornou o sistema seguro o suficiente para evitar sínteses silenciosamente incorretas.**
> **A v0.12 torna-o mais capaz de recuperar a cobertura sem enfraquecer essas defesas.**

A tese: **as defesas conservadoras podem prevenir a síntese silenciosa incorreta, mas também podem privar o conjunto da cobertura necessária.** A versão 0.12 é a solução para recuperar a cobertura. O limite de defesa da versão 0.11 permanece inalterado — todas as superfícies R-007 até R-011 ainda são ativadas. A versão 0.12 adiciona caminhos de recuperação legais e verificados.

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

### As três correções arquiteturais (limite de bloqueio da v0.4)

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

### Os três mecanismos ergonômicos de proteção (melhorias na experiência do portão da v0.4)

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

As proibições das regras do conjunto são preservadas. `accepted_claim_floor` permanece inegociável. O enum fechado `FailureShape` permanece inalterado, com nove valores. O enum `RECOVERY_ACTIONS` permanece inalterado, com 8 valores — nenhuma nova ação de consultor; a heurística de forma distinta do R-014 amplia o roteamento das ações existentes. O modelo de prompt do consultor de recuperação de IA permanece inalterado (os novos campos `EvidenceState` são observáveis no JSON persistente, mas NÃO são renderizados no prompt). As regras do verificador de recuperação permanecem inalteradas. A arquitetura MCP permanece inalterada — `ollama-intern-mcp@^2.4.0` é mantida; nenhuma alteração na forma da chamada MCP durante a extração. O aviso do R-017 é informativo e NÃO afeta o veredicto do portão, o recibo de congelamento ou a publicação do conjunto. Todas as defesas da v0.10 + v0.11 são preservadas; o limite de defesa é o limite e a v0.12 se baseia nele.

A regressão do conjunto congelado é idêntica em termos de bytes às linhas de base da v0.3.3 para todos os quatro conjuntos congelados — **décima quinta versão consecutiva** em que isso ocorre (v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12).

### O que a v0.12.0 NÃO afirma

- Prontidão para a v1.
- Veredicto do portão de "operador sozinho" da v0.4. A v0.4 é executada em relação ao npm `@mcptoolshop/research-os@0.12.0` em uma sessão separada.
- Fatia de Admissibilidade 1. Condicionada à aprovação na v0.4 — a regra da doutrina da v0.3 (isolamento de nível de defesa COMPROVADO; isolamento de nível de cobertura AINDA NÃO) permanece como o teste bloqueado.
- Uma vitória sobre ferramentas de pesquisa baseadas em nuvem.
- Um modelo completo de calibração de revisores confiáveis.

A v0.12.0 é um pré-requisito para a v0.4 do portão de "operador sozinho", não a prova.

Consulte [CHANGELOG.md](CHANGELOG.md) e o exemplo de substituição voltado para o operador em [`examples/source-card-override.example.json`](examples/source-card-override.example.json).

## Anteriormente: v0.11.0 — Segunda versão com correção do mecanismo de "operador sozinho"

A v0.11.0 corrigiu as condições de falha do portão de "operador sozinho" da v0.2: alinhamento de reparo de escopo/limite (R-007), verificação de relevância da URL no momento da descoberta (R-008), defesa contra contaminação de conteúdo de origem pareada na extração e nas camadas de crítica de quadros (R-009 + R-011) e visibilidade da causa de fallback do consultor de recuperação (R-010). A proteção de conteúdo de origem em três camadas (R-008 na admissão + R-009 na extração + R-011 na crítica de quadros) é implementada aqui. Consulte [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md).

## Anteriormente: v0.10.0 — Versão com correção do mecanismo de "operador sozinho"

A v0.10.0 corrigiu as condições de falha do portão de "operador sozinho" da v0.1 que surgiram em 15 de maio de 2026 (`operator_aloneness_dst_v0.1`, FALHA): alinhamento do roteamento de recuperação (R-002), CLI de reparo de escopo (R-001), fortalecimento da auditoria de cartão de origem pareado (R-003 + R-005) e status honesto de coleta (R-004). Consulte [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

## Anteriormente: v0.9.0 — Arco do Artefato de Produto

A v0.9.0 transformou a espinha dorsal de evidências da v0.8 em artefatos úteis para o operador: síntese de prosa em nível de seção (`synth section`), síntese parcial do conjunto (`synth pack --partial`) e o consultor de recuperação legal (`recover pack`). Consulte [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## Anteriormente: v0.8.0 — Recuperação da Arquitetura

A v0.8.0 reconectou o research-os ao seu substrato local de LLM declarado (`ollama-intern-mcp@^2.4.0`) para extração de afirmações, adicionou a aplicação de relevância da seção limitada ao quadro e adicionou a síntese de citação de evidências com escopo de seção para seções elegíveis do portão em conjuntos que precisam de reparo. Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Status

**v0.11.0 — Segunda versão de correção para o problema de “Operador em Isolamento”** — publicada no npm como `@mcptoolshop/research-os@0.11.0`, 15 de maio de 2026. A v0.11.0 corrige as condições de falha do mecanismo de “operador em isolamento” da v0.2 (`operator_aloneness_dst_v0.2`, PASS_WITH_CONDITIONS não atende aos critérios de autorização em 15 de maio de 2026) por meio de um ciclo de correção de 4 etapas, abrangendo 5 descobertas nomeadas. **R-007** (alinhamento do escopo/limite da correção): `claim repair-scope --auto` agora preenche TANTO o campo `scope` QUANTO o campo `not` quando ambos estiverem nulos em uma alegação relevante no momento da correção — corrige o problema de loop travado da v0.2, onde a correção R-001 da v0.10 preenchia apenas o campo `scope`, e a reclassificação das alegações corrigidas como `needs_scope_repair` era feita por meio do comando `claim triage`. O limite modelado espelha a forma de degradação do modelo de escopo. O registro somente-adição agora registra `applied_not` juntamente com `applied_scope`. **R-008** (detecção de defesa contra URL alucinado): `discover run` agora busca o `<title>` de cada URL candidato (limite: corpo de 64 KB, tempo limite de 5 segundos, concorrência de 4 vias) e calcula a sobreposição determinística de palavras-chave em relação à consulta de descoberta. Cada candidato recebe um bloco de `relevance` (`verificado | não verificado | incompatibilidade de tópico`); `approve --top N` coloca em quarentena os casos de `incompatibilidade de tópico`; o operador pode substituir por meio do comando `approve --candidate <id>`. Corrige o caso da v0.2, no qual `llm-heuristic` retornou 3 URLs reais do PMC que apontavam para artigos totalmente não relacionados sobre câncer/bioquímica/linfoma HIV. **R-009** (proteção de identidade do extrator): nova severidade de cartão de origem: `source_identity_mismatch` (FALHA GRAVE) quando o campo `card.title` emitido pelo extrator não corresponde ao `<title>` HTML buscado. Corrige o caso de “ratos e clonidina” da v0.2. Reutiliza o auxiliar de sobreposição do R-008; substituição por meio do comando `clear_severities[]`. **R-011** (pré-verificação do conteúdo da fonte no crítico de quadro): nova razão para exclusão de quadro: `source_content_mismatch`. O crítico de quadro agora calcula uma assinatura de conteúdo da fonte uma vez por fonte e executa uma pré-verificação determinística antes da chamada do crítico LLM; abaixo do limite, a chamada LLM é interrompida e o campo `frame_excluded: true` é marcado. Corrige o caso da v0.2, no qual 11 alegações derivadas de artigos sobre câncer com texto formatado DST foram aceitas pelo crítico LLM. **R-010** (recuperação da visibilidade do fallback MD): novo enum fechado `FALLBACK_CAUSES` (`tier_timeout | mcp_error | retry_exhausted`) + campo opcional `FallbackTiming { elapsed_ms, budget_ms}` nos metadados de `prose_error`; a recuperação MD ganha uma seção “Por que o consultor de IA fez fallback” + resumo da causa principal. Corrige a lacuna da v0.2 em que o TIER_TIMEOUT era invisível no JSON. **Agora, a proteção contra contaminação do conteúdo da fonte em três camadas está completa** (admissão R-008 + extração R-009 + crítico R-011) com defesa de camada verificada e independente. **Requer `ollama-intern-mcp@^2.4.0`** (inalterado em relação à v0.8.0). 1448/1448 testes Vitest aprovados (1344 → 1448, +104 testes no ciclo). **Todos os quatro pacotes congelados são idênticos em termos de bytes aos baselines da v0.3** (décima primeira versão consecutiva). **Não é uma versão v1. Não é um veredicto do mecanismo de “operador em isolamento” da v0.3** — a v0.3 é executada nesta versão do npm em uma sessão separada. O trabalho sobre o princípio de admissibilidade está vinculado à aprovação na v0.3. Consulte [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.10.0 — Versão de correção para o problema de “Operador em Isolamento”** — publicada no npm como `@mcptoolshop/research-os@0.10.0`, 15 de maio de 2026. A v0.10.0 corrige as condições de falha do mecanismo de “operador em isolamento” da v0.1 (`operator_aloneness_dst_v0.1`, FALHA em 15 de maio de 2026) por meio de um ciclo de correção de 4 etapas. **R-001** (`research-os claim repair-scope <section> [--auto | --interactive]`): novo CLI para corrigir alegações cujo campo `scope` chegou como `null` da extração; registro somente-adição em `evidence/claim-scope-repairs.jsonl`; nova ação `repair_claim_scope` em `RECOVERY_ACTIONS` (o enum fechado aumenta de 7 para 8); o consultor a apresenta como classificação 1 em `accepted_claim_floor` quando ≥3 alegações estão em `needs_repair_claims`. **R-002** (roteamento de recuperação): a camada de diagnóstico agora lê `gate.json:blocking_reasons[]` como a superfície de roteamento autoritária antes de fazer fallback para a pesquisa legada `failures[].check` — os sinais de bloqueio do mecanismo têm precedência sobre os sinais downstream, como `source_card_classification_gap`. **R-003 + R-005** (endurecimento da auditoria do cartão de origem, pareados): novas severidades: `bot_check_or_captcha_detected` (FALHA GRAVE — sinal composto: marcadores + forma do corpo) e `extraction_suspect_word_count_mismatch` (AVISO E QUARENTENA — corpo ≤200 palavras E extraído ≥800 palavras E proporção ≥4). Substituição do operador por meio do novo campo `clear_severities[]` no esquema de registro de substituição da v0.4. Bloco opcional `audit.severity_thresholds` em `research.yaml` para ajuste por pacote. **R-004** (`gather_outcome` honesto): enum de 5 valores em `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`); a frase confusa da v0.1, “Failed (ok HTTP 200)”, desapareceu. Consulte [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Ciclo de Artefatos do Produto** — publicado no npm como `@mcptoolshop/research-os@0.9.0`, 14 de maio de 2026. A v0.9.0 transforma a base de evidências da v0.8 em artefatos úteis para o operador. A síntese de prosa em nível de seção (`research-os synth section <id>`) produz Markdown legível com pacotes de suporte em nível de parágrafo, que apontam para as alegações aceitas. A síntese parcial (`research-os synth pack --partial`) consome a prosa da seção (nunca as alegações brutas) e revela as seções excluídas com justificativas estruturadas; um planejador determinístico de pacotes pré-seleciona o suporte transversal necessário quando ≥2 seções estiverem incluídas. O consultor de recuperação legal (`research-os recover pack`) produz orientações para o operador sobre as seções bloqueadas, usando uma arquitetura de quatro camadas — diagnóstico determinístico + gráfico de ação legal + aconselhamento de IA + verificador —, com três caminhos de consultoria (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) e enums fechados para nove tipos de falha e sete ações de recuperação. A orientação de recuperação é incorporada em `partial-pack-synthesis.{md,json}` sob cada seção excluída, por meio de uma projeção compacta do objeto de recuperação canônico — fonte única de verdade entre superfícies autônomas e incorporadas; um estado discriminado-união `recovery_unavailable` apresenta explicitamente os casos de falha do mecanismo (sem omissões silenciosas). A semântica de congelamento e publicação permanece inalterada: artefatos parciais legíveis não tornam um pacote incompleto passível de ser congelado ou publicado. O `accepted_claim_floor` permanece inegociável; o consultor de recuperação se recusa a recomendar `apply_waiver` para falhas inegociáveis. **Requer `ollama-intern-mcp@^2.4.0`** (inalterado em relação à v0.8.0). 1266/1266 testes vitest aprovados (1013 → 1266, +253 testes ao longo do ciclo). **Todos os quatro pacotes congelados verificam-pack byte a byte em relação às linhas de base da v0.3.3** (sexta versão consecutiva). **Não é uma versão v1.** A v0.9.0 torna a camada de artefatos real; o estado de prontidão para a v1, a operação com pacotes novos e autônomos, um modelo de revisor confiável e uma alegação de vitória na nuvem não são explicitamente incluídos. Consulte [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Recuperação da Arquitetura + Temporalidade Delimitada por Quadro** — publicado no npm como `@mcptoolshop/research-os@0.8.0`, 12 de maio de 2026. A v0.8.0 é uma versão de recuperação da arquitetura: o research-os agora usa `ollama-intern-mcp@^2.4.0` como o substrato local para o trabalhador de evidências, para a extração de alegações (anteriormente, o README declarava a dependência, mas o código tinha stubs diretos internos do Ollama que a ignoravam desde o esqueleto da v0.1 — a v0.8.0 encerra essa divergência). Adiciona: substrato de cliente MCP (`OLLAMA_INTERN_MCP_BIN` env + descoberta PATH + ciclo de vida StdioClientTransport); crítico de evidências por seção, por alegação, via `ollama_extract`, com esquema de 4 rótulos (`supports_section` / `off_topic` / `background_only` / `source_chrome`); novo `ReviewDecision` `frame_excluded` (a revisão ignora o LLM para as alegações excluídas, emite uma síntese ClaimReview); `ClaimSchema` ganha `frame_excluded` + `frame_exclusion_reason` (enum de 4 valores, incluindo `critic_unavailable` para falhas no estado do sistema) + `frame_exclusion_rationale`; síntese de evidências com escopo de seção via `synth section <id>` para seções elegíveis para o portão em pacotes que precisam ser reparados (índice de citação de evidências — ID da alegação → afirmação → trecho de evidência → URL da fonte — NÃO prosa narrativa); o portão honra a substituição do registro de origem via `getEffectivePublisher` / `getEffectiveSourceType` (absorvido da versão 0.7.1); `DEFAULT_WINDOW_CHARS` padrão 5000 → 3000 (dimensionado para hermes3:8b em um contexto de trabalho de 8K sob o perfil `dev-rtx5080`); política de falha suave na chamada do crítico invertida (qualquer uma das 5 modalidades de falha — transporte / análise / rótulo inválido / justificativa vazia / tempo limite — padrão para `frame_excluded: true` com a razão `critic_unavailable`, não admissão); semântica de promoção: as alegações `frame_excluded` não bloqueiam a promoção da seção; o handoff de trabalho em equipe apresenta `frame_excluded` como seu próprio bucket, separado de aceito / reparo / rejeitado. **Requer `ollama-intern-mcp@^2.4.0`**. 1013/1013 testes vitest aprovados (901 → 1013, +112 testes). **Todos os quatro pacotes congelados verificam-pack byte a byte em relação às linhas de base da v0.3.3.** **Não é uma versão v1** — o trabalho para a prontidão da v1 continua; consulte [`docs/roadmap.md`](docs/roadmap.md). Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Reforço da segurança do conjunto de testes (dogfood swarm)** — publicado no npm como `@mcptoolshop/research-os@0.7.0`, 11 de maio de 2026. Um conjunto de testes em quatro etapas (erros/segurança, resiliência proativa, humanização do operador, aprimoramento da apresentação) foi executado na versão v0.6.0. A v0.7.0 inclui as melhorias de segurança: coleta mais segura (tentativa/captura por URL + preservação do fluxo de IDs de origem em caso de falha parcial); indexador resiliente (ignorar e avisar por registro/arquivo/seção em caso de JSONL malformado); erros estruturados de recuperação (12 subclasses de ResearchOSError com referências ao manual); feedback de progresso (`--no-progress` / `--progress` com detecção automática do TTY durante a revisão/coleta/mapeamento de contradições/publicação); correções de ações voltadas para o operador (`pack publish --force`, frase canônica de substituição destrutiva ancorada em 8 superfícies com teste de regressão; correção da digitação no texto do comando `IndexNotBuiltError` e adição de um teste de registro do texto do comando; atualização das referências ao manual por erro nas 12 subclasses de ResearchOSError); higiene da cadeia de suprimentos (fixação SHA da ação CI + `permissions: contents: read`, negação padrão; cobertura dos ecossistemas Dependabot `/site` e `github-actions`); duas novas páginas do manual (`recovery.md`, `known-limitations.md`); aprimoramento da apresentação (frase canônica de regressão, reorganização da barra lateral, chamadas `:::caution` em ações destrutivas). 901/901 testes Vitest aprovados (713 → 901, +188 testes). **Os quatro conjuntos congelados verificam a identidade dos bytes em relação às versões de referência v0.3.3.** **Não é uma versão v1** — o trabalho para preparar a v1 continua; consulte [`docs/roadmap.md`](docs/roadmap.md) e [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md). Consulte [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — publicado no npm como `@mcptoolshop/research-os@0.6.0`, 10 de maio de 2026. A v0.6.0 encerra o Experimento 6 com evidências da confiança do revisor: o research-os agora pode produzir uma linha de base canônica, reproduzível e rastreável. Inclui: opções determinísticas do revisor no caminho de revisão de produção (`review_profiles.<name>.reviewer_options` em `research.yaml`); compatibilidade retroativa do esquema para artefatos congelados anteriores à v0.3.3 (F-53); a saída da revisão divulga as condições de amostragem diretamente em `review.json` e `review.md` (F-54); envio de recibo agregado determinístico canônico (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **Nenhuma linha de base confiável aceita.** `hermes-two-pass-deterministic=failed` (lacuna na capacidade do modelo estrutural no vocabulário de decisão, não variância). **Hermes não é promovido para `trusted_baseline`.** O sucesso está no mecanismo, não em um recibo aprovado. Sem alterações nos portões, congelamentos ou leis de síntese. Os quatro conjuntos congelados verificam a identidade dos bytes. 713/713 testes Vitest aprovados. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — publicado no npm como `@mcptoolshop/research-os@0.5.0`, 10 de maio de 2026. A v0.5.0 torna a calibração do revisor duradoura. Um perfil de revisor não é confiável apenas porque foi executado uma vez; ele ganha um status por meio de recibos estruturados de falhas simuladas e agregação em várias execuções. Inclui: esquema estruturado de recibo de calibração (`seeded-v1.{json,md}`, validado com Zod, quatro rótulos de status); conjunto de testes em várias execuções (`--runs <n>`, isolamento por execução, barras PASS/FAIL baseadas na mediana, rebaixamento em caso de falhas recorrentes); barra do vocabulário de decisão consciente da arquitetura; pesquisa de recibo relativa ao pacote em `review-promote`. **Nenhuma linha de base confiável aceita:** `hermes-two-pass=failed` (agregado, 3 execuções), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. O research-os agora pode recusar a confiança em um perfil de revisor quando falhas simuladas repetidas não sustentam a confiança. **Sem alterações nos portões, congelamentos ou leis de síntese. Os quatro conjuntos congelados verificam a identidade dos bytes.** 671/671 testes Vitest aprovados. Consulte [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — publicado no npm como `@mcptoolshop/research-os@0.4.0`, 10 de maio de 2026. A v0.4.0 torna a identidade da fonte duradoura. Regras determinísticas do tipo de origem tratam da maioria repetível, os registros de substituição preservam as correções do operador em novas coletas e `source-card audit` substitui as verificações de desvio de script por uma superfície CLI de primeira classe. Inclui: classificador centralizado do tipo de origem (Componente B — `classifySourceType`, 11 fornecedores canônicos, `source-type-rules.json`); registro de substituição da ficha de origem (Componente A — `source-card-overrides.jsonl`, subcomandos `validate` e `list`); e CLI de auditoria da ficha de origem (Componente D — `research-os source-card audit --pack <dir>`, 7 tipos de descobertas, artefatos JSON + Markdown, `--apply --from` caminho de aplicação). F-46: correção cosmética: os manifestos do pacote agora marcam a versão binária ativa em vez da versão congelada em `research.yaml` na inicialização do pacote. **Sem alterações nos portões, congelamentos ou leis de síntese. Todos os quatro conjuntos congelados existentes verificam a identidade dos bytes.** 620/620 testes Vitest aprovados. Consulte [CHANGELOG.md](CHANGELOG.md) e a [página do manual de auditoria da ficha de origem](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — publicado no npm como `@mcptoolshop/research-os@0.3.3`, 10 de maio de 2026. Inclui a clareza da semântica do portão obtida pelo Pacote 3 (durabilidade da exportação/tempo de execução do Godot, pacote #3 de 3 do Experimento 3). A saída do portão agora carrega contagens por seção do editor + primárias, juntamente com as contagens em todo o pacote (F-43); `no_source_cluster_monopoly` foi reformulado de AVISO para diagnóstico informativo (F-41). **O comportamento de aprovação/reprovação não foi alterado; os conjuntos congelados existentes verificam a identidade dos bytes.** 570/570 testes Vitest aprovados. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — publicado no npm como `@mcptoolshop/research-os@0.3.2`, 2026-05-09. Inclui a contabilização normalizada das alegações aceitas, considerando a admissão em `pack publish`. A verificação de igualdade estrita entre `claim-reviews.jsonl` e `pack-audit.json::accepted_claims` é substituída por uma comparação de conjuntos efetivos — as alegações aceitas são identificadores exclusivos (`claim_id`) cuja decisão mais recente da revisão canônica é `accepted_for_synthesis` (a decisão mais recente prevalece para cada `claim_id`). Os pacotes congelados, cujo número de auditorias legadas difere do conjunto efetivo, agora são admitidos com um aviso em vez de serem rejeitados; o arquivo de auditoria legado é preservado integralmente (Lei 15), enquanto o manifesto do arquivo reflete a contagem normalizada. A recusa permanece rigorosa para `claim_id`s fantasmas, decisões duplicadas incompatíveis e critérios não elegíveis para síntese. Obtido no Experimento 3, sessão K do pacote XRPL — a publicação do pacote foi recusada devido a uma divergência real na junção do livro-razão de fechamento (a seção 07 tinha 24 linhas brutas com `accepted_for_synthesis`, mas apenas 19 `claim_id`s exclusivos devido à sobreposição das janelas dos revisores). 558/558 testes vitest aprovados. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — publicado no npm como `@mcptoolshop/research-os@0.3.1`, 2026-05-09. Inclui isenções de fonte com escopo de seção (`primary_source_waiver.section_waivers[]`) e reconhecimento do lado do revisor, para que uma descoberta de `source_cluster_monopoly` em todo o escopo da seção se torne um aviso visível em vez de rotear automaticamente todas as alegações para `needs_source_repair`. Obtido no Experimento 3, sessão 2 do pacote XRPL — as seções do protocolo canônico (cadeias de fundação única, especificações de API de jardim murado, documentos de órgãos de padronização) inverteram a suposição de que a diversidade de publicadores é um indicador da qualidade da verdade. 540/540 testes vitest aprovados. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Isenções de fonte com escopo de seção** — Use-as quando a diversidade de publicadores for estruturalmente incompatível com a fonte de verdade da seção, e não apenas quando uma seção não conseguir encontrar fontes suficientes. `reason` imposto pelo esquema + `compensating_controls[]` não vazio. A política do pacote `primary_source_waiver_allowed: false` bloqueia as isenções em nível de pacote e com escopo de seção. O workaround em nível de pacote pré-v0.3.1, `min_independent_publishers: 0`, agora está obsoleto; os pacotes congelados existentes permanecem válidos sob seus recibos existentes. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) e o [manual do operador de pesquisa de pacotes](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publicado em 2026-05-09. Incluiu a flag `--detector <auto|heuristic|ollama-intern>` no `contradict map` (correção do bloqueador de cadeia F-09 do Experimento 3, sessão 1, pacote XRPL). 527/527 testes vitest aprovados. A seleção do detector agora é uma escolha explícita do operador, em vez de uma dança dependente do estado da variável de ambiente; o modo é anunciado visivelmente em cada execução. Consulte [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publicado em 2026-05-09. Incluiu o `research-os pack publish` (Experimento 2) e a correção do predicado de prontidão do Padrão 2. 515/515 testes vitest aprovados. Consulte [CHANGELOG.md](CHANGELOG.md). Os pacotes congelados são exportados para o arquivo canônico `research-packs` com um único comando; o contrato de admissão é imposto pelo código, e não por uma lista de verificação. Consulte [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — pacote de teste congelado em 2026-05-08. O pacote em `research-os-packs/research-os-spec/` (repositório irmão) atingiu o estado de congelamento com 296 alegações aceitas em 8 seções, 17 com disposição definida, 30 substituídas pelo operador, 0 bloqueadores ativos de reparo, 0 contradições não resolvidas, todos os critérios `synthesis_eligible=true`. Dezesseis leis cumulativas que sustentam a estrutura. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para as sete descobertas e as impressões digitais do recibo de congelamento.

**Repositório monorepo do arquivo research-packs** — disponível em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) com quatro pacotes: `research-os-self-dogfood` (v0.1, pacote de teste, 296 alegações aceitas, 8 seções), `comfyui-workflow-durability` (Experimento 1, 302 alegações aceitas, 8 seções), `xrpl-creator-token-durability` (pacote #2 do Experimento 3) e `godot-export-runtime-durability` (pacote #3 do Experimento 3). Todos os pacotes PASSAM o `verify-pack.mjs`.

**Experimento 1 da v1 (Durabilidade do fluxo de trabalho ComfyUI)** — ENCERRADO em 2026-05-09. Todas as 8 seções no Terminal A, pacote congelado, arquivo disponível. Consulte [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) e [`docs/roadmap.md`](docs/roadmap.md).

### O que o research-os não é (e a v0.12.1 não pretende ser)

- Não foi comprovado que funciona sozinho em novos pacotes. A versão 0.12.0 encerrou as descobertas da fase 0.3 (comprovadamente seguro; ainda não foi comprovada a segurança para cobertura — a doutrina evoluiu na versão 0.3); a fase 0.4 contra a versão 0.12.0 resultou em PASS_WITH_CONDITIONS (não é de nível de autorização) — o limite mínimo de segurança foi preservado, a segurança para cobertura foi SUBSTANCIALMENTE COMPROVADA no nível da seção, um único modo de falha na fase final. A versão 0.12.1 corrige esse único modo de falha (R-018). A nova execução da versão 0.4 contra esta versão do npm é executada em uma sessão separada e é um pré-requisito para a fase final.
- Não foi testado em batalha por usuários externos além das fases de teste interno e das quatro execuções da fase de segurança para operação individual. Seis experimentos de teste interno foram concluídos — um autorreferencial, cinco de domínio externo (ComfyUI, XRPL, Godot, calibração do avaliador, avaliador determinístico) — mais as execuções da fase de segurança para operação individual das versões 0.1 / 0.2 / 0.3 / 0.4, que revelaram 18 descobertas nomeadas (R-001 a R-005 foram resolvidas na versão 0.10.0, R-007 a R-011 foram resolvidas na versão 0.11.0, R-012 a R-017 foram resolvidas na versão 0.12.0, R-018 foi resolvida na versão 0.12.1). O uso externo em grande escala ainda é um trabalho futuro.
- Não é um gerador de síntese completa de pacotes. A versão 0.12.1 herda o escopo da seção (`synth section`) e o escopo parcial do pacote (`synth pack --partial`) da versão 0.9, cada um com uma divulgação explícita sobre a prontidão do pacote. A síntese completa do pacote ainda requer um pacote `synthesis_ready` e a criação por um humano (ou Cowork) em relação aos IDs de reivindicação aceitos via `synth workspace`.
- Não é um endosso de nenhum modelo de avaliador. A versão 0.12.1 não inclui, por padrão, um perfil de avaliador `trusted_baseline`; os recibos de calibração são evidências, não um endosso. Os recibos de calibração existentes da versão 0.6.0 são anteriores à arquitetura MCP da versão 0.8.0 e não foram recalibrados no caminho MCP. Consulte a [página do manual de calibração do avaliador](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Não está livre de artefatos históricos em pacotes congelados. Os pacotes congelados anteriores à versão 0.4 contêm `research_os_version: '0.1.0'` devido a uma constante de estrutura codificada na versão anterior à 0.4; a correção foi implementada na versão 0.4.0, mas os pacotes congelados anteriores são imutáveis sob a Lei 15 (consulte [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Não tem a comprovação de procedência no npm. A comprovação de procedência do Sigstore é adiada para uma versão futura; verifique os pacotes npm da versão 0.12.1 por meio do package-shasum e do commit de lançamento do GitHub.
- Não é uma vantagem em relação à arquitetura baseada na nuvem. A prova do produto em `local-first-vs-cloud-research/` da versão 0.7.x identificou as vantagens da nuvem em termos de legibilidade e carga de trabalho do operador; a versão 0.12.1 não afirma que esses problemas foram superados.

### Limitações conhecidas

A versão 0.12.1 é lançada com três limitações conhecidas visíveis para o operador, herdadas de versões anteriores. Cada uma está documentada na [página de limitações conhecidas do manual](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) e em [CHANGELOG.md](CHANGELOG.md). Nenhuma impede o lançamento; todas têm um caminho definido para recuperação ou mitigação.

- **B-E-001 — a marca de versão do pacote congelado anterior à versão 0.4 é um artefato histórico.** Os pacotes congelados publicados nas versões 0.3.3 a 0.6.0 contêm `research_os_version: "0.1.0"` em `pack.manifest.json` e `pack/research.yaml` devido a uma constante de estrutura codificada na versão anterior à 0.4. A correção foi implementada na versão 0.4.0 (a estrutura agora importa o `RESEARCH_OS_VERSION` ativo); os pacotes congelados anteriores são imutáveis sob a Lei 15. Os arquivos JSON dentro dos pacotes afetados já contêm suas versões contemporâneas.
- **B-E-004 — a comprovação de procedência do npm é adiada para uma versão futura.** O arquivo tarball do npm da versão 0.12.1 é verificado apenas por meio do package-shasum. A migração do fluxo de publicação para um fluxo de trabalho de CI com o Sigstore OIDC entra em conflito com a disciplina de tradução antes da publicação (TranslateGemma 12B é executado localmente); a migração está planejada para uma versão futura. Verifique os pacotes npm da versão 0.12.1 por meio do package-shasum e do commit de lançamento do GitHub.
- **B-A-003 — a migração da versão do esquema do indexador é documentada, mas não aplicada.** A versão 0.12.1 inclui um inteiro `SCHEMA_VERSION` no lado da gravação, mas não um executor de migração no lado da leitura. Em uma atualização documentada do `SCHEMA_VERSION`, exclua `.research-os/index.sqlite` e execute novamente `research-os index build --all`. O próprio pacote não é afetado — o indexador é uma camada de aceleração sobre evidências + reivindicações (Lei 8); a reconstrução é idempotente.

**Nenhum perfil de avaliador `trusted_baseline` é admitido na versão 0.12.1.** Esta é uma postura de confiança intencional, não uma lacuna: os recibos de calibração no repositório (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) registram as evidências. A confiança é conquistada por meio de recalls repetidos de falhas simuladas, não presumida. Esses recibos são anteriores à arquitetura MCP da versão 0.8.0 e não foram recalibrados no caminho MCP.

## Roteiro para a versão 1.0

A versão 1.0 é um estado conquistado, não uma data de lançamento. Todos os seis experimentos de teste interno foram concluídos (Exp1–Exp6, de 8 de maio de 2026 a 11 de maio de 2026), cada um produzindo um pacote de pesquisa congelado admitido em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). A fase rendeu a versão 0.2.0 `research-os pack publish` + Padrão 2 (Experimento 2), a flag `--detector` da versão 0.3.0 (F-09), as isenções com escopo de seção da versão 0.3.1 (F-10/F-11), o rastreamento normalizado de reivindicações aceitas da versão 0.3.2 (F-36), a clareza da semântica da fase da versão 0.3.3 (F-43/F-41), a disciplina de fonte de verdade da versão 0.4.0 (F-27/F-47/F-46), a calibração do avaliador como contrato de confiança duradouro da versão 0.5.0 (F-48/F-49/F-50) e a linha de base determinística do avaliador da versão 0.6.0 (F-53/F-54). A preparação para o lançamento da versão 1.0 está em andamento por meio de uma série de etapas de saúde/polimento; o bloqueio da arquitetura é mantido durante todo o processo. Plano completo em [`docs/roadmap.md`](docs/roadmap.md).

## Licença

MIT
