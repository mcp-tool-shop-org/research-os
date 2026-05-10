<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.3.3"><img src="https://img.shields.io/badge/version-0.3.3-blue" alt="version 0.3.3"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

Uma ferramenta de linha de comando (CLI) que transforma um tópico amplo em um "pacote de pesquisa" estruturado — um repositório organizado onde Claude, Cowork ou um sistema podem trabalhar por horas sem gerar informações falsas ou comprometer a investigação.

## O que é

`research-os` é a camada de controle entre "quero pesquisar X" e uma base de evidências precisa e rastreável. Ele separa as etapas de descoberta das etapas de coleta de evidências, a extração bruta da análise crítica, a detecção de contradições da resolução de contradições e as decisões de revisão das etapas de síntese. Cada etapa registra as informações em um registro de auditoria imutável; cada verificação de prontidão é calculada a partir desses registros, e não baseada em afirmações.

Não é um gerador de relatórios. Não é um framework de orquestração de LLMs (Large Language Models). Não escreve a síntese para você. Ele impõe as condições sob as quais a síntese pode começar.

Os pacotes congelados são armazenados em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — e estão disponíveis, com dois pacotes iniciais. Consulte [`docs/roadmap.md`](docs/roadmap.md) para o caminho da versão 1.0.

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

**Para um exemplo prático**, veja o pacote de teste em `research-os-packs/research-os-spec/` — todos os arquivos, todos os registros, todas as disposições, todas as "impressões digitais" do "freeze", tudo armazenado em arquivos que só podem ser adicionados. Esse pacote gerou o arquivo `docs/dogfood-proof.md`.

**Requer que o [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) esteja em execução localmente** para extração, triagem, revisão e descoberta de modelos de linguagem (LLM). O modelo padrão é `hermes3:8b`; você pode alterá-lo definindo a variável de ambiente `OLLAMA_INTERN_MODEL=<modelo>`. Defina a variável de ambiente `OLLAMA_HOST` se o Ollama não estiver no endereço padrão `localhost:11434`.

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

## Status

**v0.3.3** — Publicado no npm como `@mcptoolshop/research-os@0.3.3`, 10 de maio de 2026. Inclui melhorias na clareza da semântica das "gates" obtidas com o Pack-3 (durabilidade da exportação/runtime do Godot, Experimento 3, pacote nº 3 de 3). A saída da "gate" agora inclui contadores específicos da seção, além dos contadores globais (F-43); a mensagem `no_source_cluster_monopoly` foi alterada de um aviso para um diagnóstico informativo (F-41). **O comportamento de aprovação/reprovação não foi alterado; os pacotes congelados existentes são verificados byte a byte.** 570/570 testes do vitest passaram. Consulte o arquivo [CHANGELOG.md](CHANGELOG.md) e o arquivo [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — Publicado no npm como `@mcptoolshop/research-os@0.3.2`, 09 de maio de 2026. Inclui a normalização das reivindicações aceitas, levando em consideração a aprovação para publicação do pacote. A verificação estrita de igualdade entre `claim-reviews.jsonl` e `pack-audit.json::accepted_claims` foi substituída por uma comparação de conjuntos efetivos — as reivindicações aceitas são os `claim_id`s únicos cuja última decisão de revisão canônica é "aceita para síntese" (a última decisão prevalece para cada `claim_id`). Pacotes congelados cuja contagem de auditoria legada difere do conjunto efetivo agora são aceitos com um aviso, em vez de serem rejeitados; o arquivo de auditoria legada é preservado integralmente (Lei 15), enquanto o manifesto do arquivo reflete a contagem normalizada. A rejeição permanece intransigente para `claim_id`s inexistentes, decisões duplicadas incompatíveis e restrições não elegíveis para síntese. Obtido através do Experimento 3 XRPL pack Session K — a publicação do pacote foi rejeitada devido a uma divergência real no registro de fechamento (a Seção 07 continha 24 linhas brutas de "aceito para síntese", mas apenas 19 `claim_id`s únicos devido a janelas de revisores sobrepostas). 558/558 testes vitest passaram. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — publicado no npm como `@mcptoolshop/research-os@0.3.1`, em 09 de maio de 2026. Inclui isenções de direitos autorais de seção (`primary_source_waiver.section_waivers[]`) e um reconhecimento por parte do revisor, de modo que uma descoberta de "monopólio da fonte" em toda a seção seja um aviso visível, em vez de direcionar automaticamente todas as reclamações para "needs_source_repair". Isso foi obtido no Experimento 3, pacote XRPL, Sessão 2 — as seções do protocolo canônico (cadeias de base única, especificações de API fechadas, documentação de órgãos de padronização) inverteram a suposição de que a diversidade de publicadores é um indicador da qualidade da informação. 540/540 testes vitest passaram. Consulte [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Isenções de direitos autorais por seção** — Use-as quando a diversidade de publicadores é estruturalmente incompatível com a fonte de informação da seção, e não quando uma seção simplesmente não conseguiu encontrar fontes suficientes. Inclui um campo "reason" (motivo) com validação de esquema e um array "compensating_controls" (controles compensatórios) que não pode estar vazio. A política do pacote `primary_source_waiver_allowed: false` bloqueia tanto as isenções de nível de pacote quanto as isenções de seção. O "workaround" (solução alternativa) anterior à versão 0.3.1, que permitia `min_independent_publishers: 0`, está agora obsoleto; os pacotes congelados existentes permanecem válidos sob seus recibos existentes. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) e o [manual do operador do repositório "research-packs"](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publicado em 09 de maio de 2026. Inclui a flag `--detector <auto|heuristic|ollama-intern>` no comando `contradict map` (correção F-09 do bloqueador de cadeia do Experimento 3, Sessão 1, pacote XRPL). 527/527 testes vitest passaram. A seleção do detector agora é uma escolha explícita do operador, em vez de uma dança dependente do estado com variáveis de ambiente; o modo é anunciado de forma visível em cada execução. Consulte [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publicado em 09 de maio de 2026. Inclui o comando `research-os pack publish` (Experimento 2) e a correção do predicado de prontidão para o Padrão 2. 515/515 testes vitest passaram. Consulte [CHANGELOG.md](CHANGELOG.md). Os pacotes congelados são exportados para o repositório canônico "research-packs" com um único comando; o contrato de admissão é aplicado por código, e não por uma lista de verificação. Consulte [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — bloqueado em 2026-05-08. O pacote de teste em `research-os-packs/research-os-spec/` (repositório relacionado) atingiu o estado de bloqueio com 296 afirmações aceitas em 8 seções, 17 dispostas, 30 substituídas por operadores, 0 bloqueadores de correção ativos, 0 contradições não resolvidas, todos os "gates" com `synthesis_eligible=true`. 463/463 testes "vitest" passaram. Dezesseis leis fundamentais foram implementadas. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para as sete descobertas e as "impressões digitais" dos registros de bloqueio.

**Repositório monolítico "research-packs"** — está disponível em [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs), com dois pacotes iniciais. `comfyui-workflow-durability` (Experimento 1, 302 reclamações aceitas, 8 seções) e `research-os-self-dogfood` (backfill do teste interno da versão 0.1, 296 reclamações aceitas, 8 seções). Ambos os pacotes PASSAM `verify-pack.mjs`.

**Experimento 1 da versão 1 (durabilidade do fluxo de trabalho ComfyUI)** — FINALIZADO em 09 de maio de 2026. Todas as 8 seções em Terminal A, pacote congelado, arquivo disponível. Consulte [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) e [`docs/roadmap.md`](docs/roadmap.md).

### O que a versão 0.1 não é

- Não foi testado em condições reais por usuários externos. Três ciclos de testes internos foram concluídos — um autoreferencial e dois relacionados a domínios externos — e o Experimento 3 (estabilidade da API sob pressão externa) foi **CONCLUÍDO em 10 de maio de 2026**: todos os três pacotes (ComfyUI, XRPL, Godot) atingiram o estado de "freeze" sem alterações disruptivas na interface da linha de comando (CLI) v0.3.x. Este ciclo de testes resultou nas versões v0.3.0 com o recurso `--detector` (F-09), v0.3.1 com as opções de isenção de responsabilidade específicas da seção (F-10/F-11), v0.3.2 com a normalização da contabilidade de "accepted claims" (F-36) e v0.3.3 com a clareza da semântica das "gates" (F-43/F-41).
- Não é um gerador de texto. O comando `synth workspace` gera o ambiente de trabalho estruturado; os humanos (ou o Cowork) escrevem o texto com base nos IDs de "accepted claims".
- A estabilidade da API não é garantida pela versão semântica. A versão 1.0.0 é um estado alcançado, não uma data no calendário — consulte o arquivo [`docs/roadmap.md`](docs/roadmap.md) para os seis experimentos que preencherão essa lacuna.

### Limitações conhecidas

- **A origem do extrator não é visível na junção da interface.** Uma seção pode passar pelo limite de reivindicações aprovadas, mesmo que utilize reivindicações de fallback heurísticas quando o extrator calibrado (Ollama com o modelo configurado) não estiver disponível. Isso foi registrado como o Experimento 4 no roteiro; aprimoramentos futuros indicarão as reivindicações aprovadas por extrator e exigirão o número mínimo de reivindicações aprovadas do caminho calibrado.
- **A seleção do modelo de revisão além da linha de base calibrada `hermes-two-pass` não foi resolvida.** O ciclo de testes internos validou uma configuração de revisão; modelos alternativos precisam de sua própria calibração de recall de falhas simuladas antes de poderem ser confiáveis. Isso é o Experimento 5 no roteiro.
- **O pacote de testes internos v0.1 utilizou `mistral-nemo:12b` para a extração (o padrão é `hermes3:8b`).** O modelo `hermes3:8b` não estava disponível neste ambiente durante o ciclo v0.1. Essa substituição será mantida até que seja disponibilizado um modelo baseado em hermes3 — isso é o Experimento 6 no roteiro. Para operadores em ambientes sem `hermes3:8b`, defina `OLLAMA_INTERN_MODEL` para um modelo disponível; URLs pré-configuradas pelo operador e disciplina na precisão das consultas (consulte o manual) ajudam a mitigar alucinações em tópicos ambíguos.

## Roteiro para a versão 1.0

A versão v1.0 é um estado alcançado, não uma data de lançamento. Seis experimentos estão em andamento entre as versões v0.1 e v1.0 — testes internos não de referência (atualmente em andamento como o pacote de durabilidade do fluxo de trabalho ComfyUI), um comando `research-os pack publish` que automatiza a exportação para o monorepository canônico `research-packs` (Experimento 2, com escopo definido após a conclusão manual do Experimento 1), estabilidade da API sob pressão externa, fechamento da lacuna de rastreabilidade do extrator, generalização da calibração do revisor além de `hermes-two-pass` e uma execução de linha de base limpa em `hermes3:8b`. O Experimento 1 não está concluído no momento do congelamento do pacote; ele é finalizado quando o pacote congelado é lançado como o primeiro pacote no monorepository `research-packs`, juntamente com o pacote de testes internos da versão v0.1. O plano completo está em [`docs/roadmap.md`](docs/roadmap.md). A arquitetura permanece bloqueada; a versão v1.0 aprofunda o que a versão v0.1 comprovou, em vez de reabri-lo.

## Licença

MIT
