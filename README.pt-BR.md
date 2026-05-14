<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.9.0"><img src="https://img.shields.io/badge/version-0.9.0-blue" alt="version 0.9.0"></a>
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

## Novo no v0.9.0 — Artefato do Produto Arc

O research-os agora produz artefatos legíveis de seções e pacotes parciais, preservando a rastreabilidade e a integridade do pacote.

### O que você pode executar

```sh
research-os synth section <section-id>       # readable section prose + paragraph-level provenance
research-os synth pack --partial              # cross-section partial-pack synthesis from section prose
research-os recover pack                      # lawful recovery guidance for blocked sections
```

### A cadeia de artefatos

```
claims → section prose → partial-pack synthesis → recovery guidance
```

Cada camada consome a camada anterior como evidência. O pipeline de seção-texto executa um planejador determinístico sobre as afirmações aceitas, um redator que escreve texto com base em clusters pré-definidos e um verificador de nível de parágrafo que aprova antes da saída. A síntese de pacotes parciais lê o texto da seção (nunca as afirmações brutas) e divulga as seções excluídas com motivos estruturados. A orientação de recuperação lê o grafo de ações determinístico calculado para cada seção excluída; a IA escreve texto dentro desse espaço de ação definido; um verificador aprova antes da saída. O mesmo objeto de recuperação que alimenta o comando independente `recover pack` é projetado em `partial-pack-synthesis.{md,json}` sob cada seção excluída, para que o operador veja "o que está bloqueado + o que fazer a seguir" no mesmo local.

### Limite legal

Artefatos legíveis não tornam um pacote incompleto congelável ou publicável. Os comandos `pack freeze` e `pack publish` continuam a rejeitar pacotes com seções não executadas, bloqueadas ou que requerem reparo. O produto produz uma saída parcial e honesta em vez de fingir que o pacote está completo.

### O que o v0.9.0 NÃO afirma

- Prontidão para a versão 1.
- Uma vitória sobre as ferramentas de pesquisa baseadas na nuvem.
- Um modelo completo de calibração de revisores confiáveis.
- Que um operador possa executar um pacote novo para gerar um único artefato útil.

O "arc" tornou a camada de artefatos real. A questão da operação individual permanece em aberto e será testada separadamente após o lançamento desta versão.

Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) e [CHANGELOG.md](CHANGELOG.md).

## Anteriormente: v0.8.0 — Recuperação da Arquitetura

A versão 0.8.0 reconectou o research-os ao seu substrato local de LLM declarado (`ollama-intern-mcp@^2.4.0`) para extração de afirmações, adicionou a aplicação de relevância da seção com base em limites e adicionou a síntese de citações de evidências com escopo de seção para seções elegíveis para "gate" em pacotes que requerem reparo. Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Status

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

### O que o research-os não é (e o que a versão v0.7.0 não pretende ser)

- Não foi testado em condições reais por usuários externos, além dos testes internos. Seis experimentos internos foram concluídos — um de referência, cinco em domínios externos (ComfyUI, XRPL, Godot, calibração de revisores, revisor determinístico) — mas o uso em larga escala por operadores externos ainda é um trabalho futuro. A funcionalidade de operação independente em um novo conjunto de dados (uma pergunta de evidência não preparada, sem etapas iniciais pré-definidas) ainda não foi comprovada novamente em relação à versão 0.9.0.
- Não é um gerador de conteúdo completo. A versão 0.9.0 produz texto legível no escopo de uma seção (`synth section`) e no escopo de um conjunto parcial (`synth pack --partial`), cada um com uma declaração explícita de prontidão para uso. A geração de conteúdo completo ainda requer um conjunto de dados `synthesis_ready` e a criação de conteúdo por humanos (ou colaboradores) com base em IDs de reivindicações aprovados, usando o `synth workspace`.
- Não é uma validação de nenhum modelo de revisor. A versão 0.9.0 não inclui, por padrão, um perfil de revisor `trusted_baseline`; os registros de calibração são evidências, não validações. Os registros de calibração existentes da versão 0.6.0 são anteriores à arquitetura MCP da versão 0.8.0 e não foram reavaliados sob o caminho MCP. Consulte a [página do manual de calibração de revisores](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Não está livre de artefatos históricos em conjuntos de dados congelados. Os conjuntos de dados congelados anteriores à versão 0.4 contêm `research_os_version: '0.1.0'` devido a uma constante de estrutura codificada na versão anterior à 0.4; a correção foi implementada na versão 0.4.0, mas os conjuntos de dados congelados anteriores são imutáveis de acordo com a Lei 15 (veja [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Não possui certificação de origem no npm. A certificação de origem Sigstore será implementada em uma versão futura; verifique os pacotes npm da versão 0.9.0 usando `package-shasum` e o commit da versão no GitHub.
- Não representa uma vantagem em relação à nuvem. A análise comparativa em `local-first-vs-cloud-research/` da versão 0.7.x identificou as vantagens da nuvem em termos de legibilidade e carga de trabalho do operador; a versão 0.9.0 não afirma que essas vantagens foram superadas.

### Limitações conhecidas

A versão 1.0 inclui três limitações conhecidas que são visíveis aos usuários. Cada uma delas está documentada na [página de limitações conhecidas do manual](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) e no arquivo [CHANGELOG.md](CHANGELOG.md). Nenhuma delas impede a liberação; todas têm um caminho definido para recuperação ou mitigação.

- **B-E-001 — A versão do pacote congelado anterior à versão 1.0 é um artefato histórico.** Os pacotes congelados publicados nas versões de 0.3.3 a 0.6.0 contêm `research_os_version: "0.1.0"` nos arquivos `pack.manifest.json` e `pack/research.yaml` devido a uma constante de estrutura codificada antes da versão 0.4. A correção foi implementada na versão 1.0 (a estrutura agora importa a versão `RESEARCH_OS_VERSION` atual); os pacotes congelados existentes são imutáveis de acordo com a Lei 15. Os arquivos JSON dentro dos pacotes afetados já contêm suas versões correspondentes.
- **B-E-004 — A autenticação de origem no npm será implementada na versão 1.x.** A versão 1.0 do pacote npm é verificada apenas por meio do package-shasum. A migração do fluxo de publicação para um fluxo de trabalho de CI com o OIDC da Sigstore conflita com a disciplina de "traduzir antes de publicar" (o TranslateGemma 12B é executado localmente); a migração está planejada para a versão 1.x. Verifique os pacotes npm da versão 1.0 usando o package-shasum e o commit da versão no GitHub.
- **B-A-003 — A migração do esquema de versão do indexador está documentada, mas não é obrigatória.** A versão 1.0 inclui um inteiro `SCHEMA_VERSION` para escrita, mas não um executável de migração para leitura. Ao atualizar a `SCHEMA_VERSION` conforme documentado, exclua o arquivo `.research-os/index.sqlite` e execute novamente `research-os index build --all`. O próprio pacote não é afetado — o indexador é uma camada de aceleração sobre evidências e reivindicações (Lei 8); a reconstrução é idempotente.

**Nenhum perfil de revisor `trusted_baseline` é aceito na versão 0.9.0.** Isso é uma postura de confiança intencional, não uma lacuna: os registros de calibração no repositório (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) registram as evidências. A confiança é conquistada por meio de testes repetidos de recuperação de falhas simuladas, não é presumida. Esses registros são anteriores à arquitetura MCP da versão 0.8.0 e não foram reavaliados sob o caminho MCP.

## Roteiro para a versão 1.0

A versão 1.0 é um estado alcançado, não uma data de lançamento. Todos os seis experimentos internos foram concluídos (Exp1–Exp6, de 08 de maio de 2026 a 11 de maio de 2026), e cada um deles gerou um pacote de pesquisa que foi incluído em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). O projeto alcançou a versão v0.2.0 com a funcionalidade `research-os pack publish` + Padrão 2 (Experimento 2), a versão v0.3.0 com a flag `--detector` (F-09), a versão v0.3.1 com as permissões específicas para seções (F-10/F-11), a versão v0.3.2 com a contabilização normalizada das aprovações (F-36), a versão v0.3.3 com maior clareza na semântica dos controles (F-43/F-41), a versão v0.4.0 com a disciplina de verificação da fonte (F-27/F-47/F-46), a versão v0.5.0 com a calibração dos revisores como um contrato de confiança duradouro (F-48/F-49/F-50) e a versão v0.6.0 com uma linha de base determinística para os revisores (F-53/F-54). A preparação para o lançamento da versão 1.0 está em andamento por meio de um processo de refinamento em várias etapas; a arquitetura está bloqueada durante todo o processo. O plano completo está disponível em [`docs/roadmap.md`](docs/roadmap.md).

## Licença

MIT.
