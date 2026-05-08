<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.1.0"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="version 0.1.0"></a>
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

**A versão 0.1 foi usada apenas uma vez: por si só, em si mesma.** Essa única utilização identificou sete falhas na `research-os`, todas corrigidas antes desta versão. O histórico de validação — sete sessões, dois padrões de integração implementados, 463 casos de teste `vitest`, um pacote finalizado — está disponível em [`docs/dogfood-proof.md`](docs/dogfood-proof.md). Manual completo: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

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

## Instalação

**Requisitos:** Node.js ≥ 20.

```bash
# From source (v0.1.0 is not yet published to npm)
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link   # makes `research-os` available on your PATH
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
```

**Para um exemplo prático**, veja o pacote de teste em `research-os-packs/research-os-spec/` — todos os arquivos, todos os registros, todas as disposições, todas as "impressões digitais" do "freeze", tudo armazenado em arquivos que só podem ser adicionados. Esse pacote gerou o arquivo `docs/dogfood-proof.md`.

**Requer que o [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) esteja em execução localmente** para extração, triagem, revisão e descoberta de modelos de linguagem (LLM). O modelo padrão é `hermes3:8b`; você pode alterá-lo definindo a variável de ambiente `OLLAMA_INTERN_MODEL=<modelo>`. Defina a variável de ambiente `OLLAMA_HOST` se o Ollama não estiver no endereço padrão `localhost:11434`.

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

**v0.1.0** — bloqueado em 2026-05-08. O pacote de teste em `research-os-packs/research-os-spec/` (repositório relacionado) atingiu o estado de bloqueio com 296 afirmações aceitas em 8 seções, 17 dispostas, 30 substituídas por operadores, 0 bloqueadores de correção ativos, 0 contradições não resolvidas, todos os "gates" com `synthesis_eligible=true`. 463/463 testes "vitest" passaram. Dezesseis leis fundamentais foram implementadas. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para as sete descobertas e as "impressões digitais" dos registros de bloqueio.

### O que a versão 0.1 não é

- Não foi testada por usuários externos. A única execução de teste encontrou sete bugs.
- Ainda não está disponível no npm. Instale a partir do código-fonte até que a publicação no npm ocorra.
- Não é um gerador de conteúdo. O comando `synth workspace` gera o ambiente de trabalho estruturado; humanos (ou Cowork) escrevem o texto em relação aos IDs das afirmações aceitas.
- Não tem estabilidade de API compatível com a versão semântica. A versão 1.0.0 é um estado alcançado, não uma data no calendário — consulte [`docs/roadmap.md`](docs/roadmap.md) para os cinco experimentos que preencherão essa lacuna.

### Limitações conhecidas

- **A origem do extrator não é visível na junção da porta.** Uma seção pode passar pelo limite aceitável, mesmo utilizando mecanismos de fallback heurísticos, quando o extrator calibrado (Ollama com o modelo configurado) não está disponível. Isso foi registrado como uma vulnerabilidade conhecida; as futuras melhorias reportarão as reivindicações aceitas pelo extrator e exigirão um número de reivindicações aceitas equivalente ao limite definido, provenientes do caminho calibrado.
- **A seleção do modelo de revisão, além da linha de base calibrada `hermes-two-pass`, ainda não foi resolvida.** O ambiente de testes internos validou uma configuração de revisão; modelos alternativos precisam de sua própria calibração para cenários de falha simulada antes de poderem ser considerados confiáveis.
- **O pacote de testes internos utilizou `mistral-nemo:12b` para a extração (o padrão é `hermes3:8b`).** O sistema apresentou alucinações, gerando resultados para domínios incorretos para nomes de seções que se referiam a si mesmas. Isso foi corrigido através de uma disciplina de precisão na consulta (ver manual) e URLs pré-definidas pelos operadores para tópicos ambíguos.

## Roteiro para a versão 1.0

A versão 1.0 é um estado alcançado, não uma data de lançamento. Cinco experimentos estão em andamento entre a versão 0.1 e a versão 1.0: estabilidade da API sob pressão externa, um pacote de testes internos que não se refere a si mesmo, fechamento da lacuna de rastreabilidade do extrator, generalização da calibração do revisor além do `hermes-two-pass` e uma execução de linha de base limpa no `hermes3:8b`. O plano completo está disponível em [`docs/roadmap.md`](docs/roadmap.md). A arquitetura permanece fixa; a versão 1.0 aprofunda o que a versão 0.1 demonstrou, em vez de reabri-lo.

## Licença

MIT
