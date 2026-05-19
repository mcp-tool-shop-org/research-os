<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` 将研究成果从一份生成的文档转化为一份固定证据包。它保留了原始数据，将论点与综合分析区分开来，通过流程环节确保研究的完整性，记录了评审人员的意见和免责声明，并发布了一个可追溯和验证的成果包。

它不要求您盲目信任模型。它为您提供工具和方法，以便您能够自行判断模型、数据来源以及分析结果是否值得信任。

## 它是什么

`research-os` 是“我想研究 X”和“一个经过验证、可追溯证据的基础”之间的控制层。它将发现线索与获取证据分离，将原始提取与筛选后的主张分离，将矛盾检测与矛盾解决分离，并将审查决策与综合结果分离。每个步骤都会写入一个只追加的日志；每个就绪的判断都是基于这些日志计算得出，而不是主观声明。

它不是一个报告生成器。它不是一个 LLM 编排的框架。它不会为你编写综合报告。它强制执行综合分析开始的条件。

已冻结的软件包存档在 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) 仓库中，这些软件包是实时更新的，涵盖了六个已完成的内部测试项目。请参阅 [`docs/roadmap.md`](docs/roadmap.md) 以了解 v1.0 的发展路线。

v0.1 版本已经在两个内部测试阶段进行了压力测试。第一次测试——`research-os` 研究自身的规范——在 v0.1.0 发布之前发现了七个正确性问题，每个问题都需要实际的代码修复，并衍生出相应的规则或集成模式。第二次测试（v1 实验 1：ComfyUI 工作流程的稳定性，11 个会话，一个与 `research-os` 没有任何词汇重叠的领域）于 2026-05-09 结束：研究包已冻结，归档已上线，模式 2 的执行通过提交 `22b5dba` 完成。v0.1 版本的验证记录位于 [`docs/dogfood-proof.md`](docs/dogfood-proof.md)；实验 1 的验证记录位于 [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md)。 详细文档：<https://mcp-tool-shop-org.github.io/research-os/handbook/>。

## 安装

**要求：** Node.js ≥ 20。

```bash
npm install -g @mcptoolshop/research-os
```

对于从源代码构建的贡献者：

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## 快速开始

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

> **关于 `freeze` 命令的说明。** `research-os freeze` 命令在扫描所有标准文件并计算内容哈希时，会静默运行，因此该命令没有增量进度显示。对于大型软件包，它可能需要几秒钟的时间才能输出任何内容。完成后，它会打印一个结果块（`PASS` / `REFUSED`，以及收据的路径）。不要将这段时间间隔误解为程序卡死。

> **`--force` 警告。** `--force` 参数会清除并替换目标软件包目录。请勿将手动创建的文件保存在生成的软件包输出目录中。请编辑上游文件（例如，声明、源代码、合成结果）或兄弟文件。完整的入职协议和拒绝案例：[`docs/pack-publish.md`](docs/pack-publish.md)。

**要查看一个实际的示例**，请参阅 `research-os-packs/research-os-spec/` 目录下的研究包——每个文件、每个记录、每个结论、每个冻结的指纹，都以只追加的日志形式存储在磁盘上。该研究包生成了 `docs/dogfood-proof.md`。

**需要本地运行 [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp)**，用于LLM的提取、分诊、审查和发现。MCP服务器通过环境变量 `OLLAMA_INTERN_MCP_BIN` 或 PATH 自动发现。默认模型为 `hermes3:8b`；可以通过设置 `OLLAMA_INTERN_MODEL=<模型名称>`（或通过 `--model <名称>` 参数）进行覆盖。如果Ollama没有安装在默认的 `localhost:11434` 上，请设置 `OLLAMA_HOST`。

## 16 条核心规则

| # | 规则 |
|---|-----|
| 1 | 在获得原始数据之前，不能进行综合分析。 |
| 2 | 获取是证据；提取是解释。 |
| 3 | 模型可以解释原始数据，但不能生成证据。 |
| 4 | 提取可能会产生过多的信息；综合分析不能继承这种过剩。 |
| 5 | 矛盾映射会暴露潜在的冲突，但它不会解决、综合或决定哪个主张是正确的。 |
| 6 | 网关决定一个部分是否符合综合分析的条件。它们既不进行综合分析，也不隐藏失败。 |
| 7 | 对抗性审查用于评估研究的完整性。它既不进行综合分析，也不重写原始数据。 |
| 8 | 索引可以使研究结果可查询。它既不创建新的事实，也不成为原始记录。 |
| 9 | Cowork 协作模式将研究结果转化为可操作的指令。它既不创建事实，也不绕过网关。 |
| 10 | 综合分析工作区用于组织 Cowork 协作模式中接受的研究结果。它既不进行综合分析，也不绕过协作模式。 |
| 11 | 研究包审计汇总现有的研究结果。它既不创建新的事实，也不隐藏部分级别的证据。 |
| 12 | 发现阶段提出线索；只有获取才能产生证据。 |
| 13 | 只有在经过多次失败测试证明其可回溯性后，才能信任审查者。 |
| 14 | 声称拥有大量信息并不代表研究质量。在进行综合分析之前，必须对这些信息进行筛选。 |
| 15 | “冻结”状态锁定已完成的研究成果，但不会完成未完成的研究，也不会将修复状态转化为证据。 |
| 16 | 豁免可以放宽对来源的限制，但不能用于伪造证据。 |

**第三条规则**：大型语言模型（LLM）绝不会生成证据文本。`research-os` 构建一个确定性的摘录记录（具有稳定 ID，例如 `ex_<source_id_hex>_001`）；LLM 选择摘录 ID；`research-os` 复制原始文本。 “释义作为引用”的错误类型在结构上是无法实现的。

**第十四条规则**：在提取和审查阶段，`research-os claim triage`（研究主张筛选）会去除重复项，限制每个来源的贡献，并将低价值的主张放入待处理队列。筛选过程不会修改 `claims.jsonl` 文件；待处理的主张仍然保留在原始记录中。

## v0.1 工作流程链

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

每个步骤都是一个命令行指令。每个步骤都会写入只追加的记录文件。任何步骤都不会进行综合、解决或创建新的真理——这些原则是强制执行的，而不是被信任的。审查人员可以接受、拒绝或要求修复候选主张；“门禁”系统会根据审查结果计算 `synthesis_eligible`（是否符合综合条件）；“冻结”是最终的完整性锁定，只有当所有层级都同意时，才会标记一个项目为已完成。请参阅 [docs/dogfood-proof.md](docs/dogfood-proof.md)，了解 v0.1 的完整证明，该证明表明整个链条是端到端的。

这是 *搜索 → 总结 → 生成报告* 的结构性替代方案。整个链条是最终产品。

## 术语

| 术语 | 含义 |
|------|---------|
| `research-os` | 控制平面 / 命令行 / 门禁 / 编排规则（此仓库） |
| `research-pack` | 用于单个研究项目的生成仓库文件 |
| `research section` | 在项目中，一个受限的调查单元 |
| `research receipt` | 证明某个部分通过了来源/主张/门禁检查 |

## 安全性

`research-os` 是一个本地优先的命令行工具。它在您指定的“研究包”目录中读取和写入文件，并在使用 `gather` 命令时，会向外部发送 HTTP 请求以获取您提供的来源 URL。它不会：运行服务器、接受传入连接、存储凭据或发送遥测数据。任何敏感信息都不会写入到包文件中。请参阅 [SECURITY.md](SECURITY.md)，了解漏洞报告政策。

## 评审员校准

v0.5.0 版本使评审员校准更加稳定。评审员配置文件不会因为只运行一次而被信任，而是通过结构化的、带有模拟失败的收据以及多次运行的聚合来获得信任状态。v0.6.0 版本为生产评审流程和校准工具添加了确定性的评审员选项。

**目前没有任何配置文件被认为是 `trusted_baseline`。** 仓库中的标准收据显示：`hermes-two-pass=failed`，`mistral-nemo-two-pass=conditional_pass`，`hermes-single-pass=comparison_only`，`hermes-two-pass-deterministic=failed`。这是有意为之：信任是通过重复的、带有模拟失败的证据获得的，而不是默认信任。`hermes-two-pass-deterministic` 收据存在结构模型能力上的差距（生成了 2/6 种决策类型，需要 3/6 种），这并非是方差问题。

校准结果文件位于`calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`。每个结果文件记录了针对七个方面的PASS/FAIL（通过/失败）结果，四个状态标签（`trusted_baseline`、`conditional_pass`、`failed`、`comparison_only`），并诚实地披露了测试框架无法测试的内容（`needs_contradiction_mapping`无法从`seeded-v1`访问）。请参阅[CHANGELOG.md](CHANGELOG.md)。

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

当使用`--runs <n>`参数时，每个运行的结果文件会被写入到`<profile>/runs/run-NNN.json`，并且会生成一个聚合结果文件（包含基于中位数的PASS/FAIL结果，以及重复失败检测），写入到`<profile>/seeded-v1.{json,md}`。聚合结果文件包含`receipt_kind: 'aggregate'`，用于区分单次运行的结果文件。单次运行模式（`--runs 1`或省略）会保留现有的直接写入行为。

**确定性的评审员配置文件** — 在 `research.yaml` 文件中使用 `review_profiles.<name>.reviewer_options` 来将 `temperature`、`seed` 以及其他 Ollama 采样参数传递到生产评审流程中的每个 `OllamaInternReviewer` 实例。`hermes-two-pass-deterministic` 配置文件作为内置示例提供。请参阅 [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) 以及 [评审员校准手册](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/) 页面。

## 新版本 v0.13.1 — R-024：提取阶段的层级预算权限（Path C 补丁）

v0.13.1 是一个基于 v0.13.0 的单次修复补丁。它解决了 v0.5 Track-C 的问题（R-019 在提取阶段存在范围上的差距），通过将 R-019 的层级预算权限扩展到 `claim extract` 期间的每个 `ollama_extract` MCP 调用，来实现这一点，包括：每个窗口的提取器、每个请求的 R-011 章节证据评估器，以及每个备选救援对象的 R-012 救援评估器。其架构与 R-019 的合成文本覆盖范围相同。这是一个单仓库补丁（仅适用于 research-os）；`ollama-intern-mcp@2.6.0` 的 `tier_budget_ms_override` 模式字段是服务器端的默认配置。

此版本发布的原因是，针对已发布的 `@mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0` 的 v0.5 独立运行测试返回了 **PASS_WITH_CONDITIONS，而不是完全通过** (`operator_aloneness_dst_v0.5`)。所有 v0.13 的功能（R-018 + R-019 + R-020 + R-021）在实际运行中没有出现错误；防御机制保持有效；在出现已知错误时，会进行明确的拒绝，并提供恢复操作的文档。但是，在第 02 部分（`02-safety-and-economic`）的 8 个来源中，有 3 个在提取过程中触发了内部的 15000 毫秒的层级超时（TIER_TIMEOUT），并且没有用户可用的覆盖设置。R-019 在 v0.13.0 中已经发布了用于合成文本的覆盖设置；v0.13.1 将其扩展到提取阶段。

> **R-024 实现了完整的层级预算规则：在扩展层级预算时，该预算必须覆盖该阶段的所有 LLM 调用，这些调用都可能触发相同的内部超时。部分覆盖意味着补丁针对的是错误的调用层级。**
> **R-024 还实现了关于实时回放测试的规则：当实时回放的验收测试由于测试框架的原因（例如：时间、捕获、测试环境状态）而不是机制原因而失败时，应该修复测试框架，而不是跳过、降级或使用手动检查来代替。**

v0.5 的处理方式是 Path D（多路径分流）。v0.13.1 解决了 Track C。Track A 在构建过程中已解决（内存门限挂钩路径白名单）。Track B（源发现构建）将在 v0.13.1 发布后进行单独的测试。v0.6 的门限设置将遵循 Track B。Admissibility Slice 1 仍然是 **未授权** 状态，直到 v0.6 通过。

### 您可以运行的内容

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

优先级：CLI 标志 > 环境变量 > 默认值（未指定；`ollama-intern-mcp` 的配置文件默认值生效）。限制在 `[1, 600000]` 毫秒（10 分钟的安全上限）。无效的值会明确地失败，并返回非零的退出码，同时会显示出错的表面和错误值。

### 有什么新内容？

**R-024 — 在所有 3 个 `ollama_extract` 调用位置上，实现了提取阶段的层级预算权限。** 在 `claim extract` 上，添加了一个新的 `--tier-budget-ms <N>` 标志（以及对应的 `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS` 环境变量），它会将用户控制的、每个调用的层级预算覆盖，传递给 `ollama-intern-mcp@>=2.6.0`，并在每个 `ollama_extract` 调用工具的执行过程中，将其作为 `tier_budget_ms_override` 传递：`MCPClaimExtractor.extractOnePage`（每个窗口的提取器）、`runCritic`（R-011 每个请求的章节证据评估器，每个窗口一个调用），以及 `runRescueCritic`（R-012 用于源内容不匹配的备选救援对象的救援评估器）。 实际生效的预算会在标准错误输出中显示（`[extract] tier_budget_ms=N source=... section=<id>`，在每个源循环之前显示），在提取接收器的元数据中显示（`tier_budget_ms` + `tier_budget_overridden_by`，位于 `audits/<section>-claim-extract.json`），以及在已关闭的枚举 `EXTRACT_TIER_BUDGET_SOURCES` 中（`['default', 'cli_flag', 'env_var']`）。默认行为与 v0.13.0 相同（没有标志，没有环境变量，则使用配置文件的默认值；接收器不包含新的字段）。

### 架构说明

R-024 的架构与 R-019 类似，但处于不同的阶段。R-019 通过 `runProseSynthesis` 将覆盖机制连接到规划器 + 文本生成器 + 验证器（3 个 `ollama_extract` 调用点）；R-024 通过 `extract()` 协调器 → `MCPClaimExtractor.extract` → 分发到 `extractOnePage` + `runCritic` + `runRescueCritic`（3 个提取阶段的 `ollama_extract` 调用点）。完整的资源预算规则现在是一个关键原则：当为面向操作员的接口扩展资源预算时，阶段 B 的报告必须列出该阶段的所有与相同超时时间相关的 LLM 调用点。部分覆盖会导致在调用点覆盖层产生一个 `MISTARGETED-PATCH`，其自证否定的签名与 R-018 的包装器/内部机制 `MISTARGETED-PATCH` 相同：记录会记录覆盖机制，并且在未覆盖的调用点处，命名的超时机制会被触发，所有这些都发生在同一个组件中。

没有对 `ollama-intern-mcp` 进行任何更改。v2.6.0 的 `tier_budget_ms_override` 模式字段自 R-019 的协调发布以来一直存在；v0.13.1 提供了研究操作系统端的提取阶段客户端连接。

### 安全底线保持稳定

R-024 是一个面向操作员的可配置项的添加，而不是架构上的改变。R-002 到 R-021 的所有组件均未修改。`accepted_claim_floor` 仍然是不可放弃的。已关闭的枚举类型未更改（`FailureShape` 为 9；`RECOVERY_ACTIONS` 为 8；`REGENERATION_REASONS` 为 3；`PLANNER_TIMEOUT_SOURCES` 为 3；`POLICY_KEYWORDS` 为 8；`POLICY_RELEVANT_SOURCE_TYPES` 为 1）。R-024 添加了新的已关闭枚举类型 `EXTRACT_TIER_BUDGET_SOURCES`（3 个值），但未修改任何现有的枚举类型。AI 恢复建议的提示模板未修改。MCP 架构以增量方式扩展。R-010 的回退原因正则表达式形状保持不变。R-015 的提取 `--resume / --progress` 形状保持不变（R-024 添加了新的 stderr 日志行 + 新的记录字段；现有的日志格式 + 跳过行为 + 输出形状未更改）。

所有四个冻结包的回归测试与 v0.3.3 的基线完全一致——**这是连续的第十九次发布**。1630 → 1663，vitest 通过测试 (+33 个 R-024 的合成验收 + 1 个始终开启的保护机制；6 个跳过 — 实时回放测试受环境变量控制)。

### v0.13.1 不声称的内容：

- v1 的可用性。
- v0.6 的独立运行门控的验证结果。v0.6 的配置遵循 R-023（源发现框架）；v0.13.1 是 Track-C 完成的前提，而不是证明。
- 可接受性切片 1。受 v0.6 通过测试的限制。
- 延迟的 v0.13.x 版本候选者（F-2 R-009 审计↔提取的差异；F-3 协作交接的陈旧性；F-4 R-017 `POLICY_KEYWORDS` 的局限性）。

请参阅 [CHANGELOG.md](CHANGELOG.md) 以获取完整的发布说明。

## 版本 0.13.0 的新功能：最终确认流程阻碍问题排查模块（R-019 + R-020，仅限 D 选项 + R-021）

v0.13.0 版本修复了在对 `@mcptoolshop/research-os@0.12.1` 进行 v0.4 版本的重新测试后，由于流水线上的一个关键问题而被阻止的最终版本问题。这次修复通过路径 D（一个独立的、与路径 C 上的“命名补丁”不同的多重关键问题修复流程）完成，结果显示为“条件通过”，而非“授权级别”。

该版本包含三个独立的最终版本关键问题修复，分别位于流水线的三个不同层级。这三个独立的“命名参数”共同解决了以下问题：解锁合成文本的最终版本功能，恢复“无答案集群”功能，以及启用“矛盾映射”的自动模式。

来自 v0.10 / v0.11 / v0.12 / v0.12.1 版本的防御机制和覆盖范围恢复功能保持不变；没有进行任何“封闭枚举”的更改；也没有对现有功能进行破坏性修改。

> **v0.4版本的重新运行结果表明，模拟测试可以验证底层架构的正确性，而实时回放则揭示了目标机制的错误。**
> **v0.13版本解决了运行时控制方面的最终问题：R-019解决了内部MCP层级的预算问题；R-020实现了对“无答案集群”的诚实拒绝，并提供了恢复措施；R-021解决了“矛盾映射”自动模式的RPC层级问题。**

v0.5版本的“独立操作员”功能在独立的会话中进行测试，版本为v0.13.0。 “可访问性切片1”的权限状态仍然是“**未授权**”，直到v0.5版本通过测试。

### 您可以运行的内容

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

### 有什么新内容？

**R-019 — 内部 MCP 层的预算客户端配置。** R-018 的 `--planner-timeout-ms <N>` 参数（以及 `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS` 环境变量）现在已扩展到规划器/草稿生成器/验证器，并最终通过 `ollama_extract.tier_budget_ms_override` 传递到 `runWithTimeoutAndFallback` 函数，该函数位于 `ollama-intern-mcp/src/guardrails/timeouts.ts:61`。 之前导致 v0.4 版本重跑时出现 `elapsed=15018ms budget=15000ms` 错误的内部、针对每个层的超时机制，现在会直接遵循操作员设定的预算。 R-018 的包装器仍然保留，作为一种外部的强制措施，以防止未决 Promise 导致的程序挂起（其他类型的错误可以通过专门的包装器捕获）。 需要 `ollama-intern-mcp@>=2.6.0` 版本；旧版本会静默地忽略新的 schema 字段（R-018 包装器仍然可以在其原始层正常工作，实现降级）。

**R-020 (仅限 D 选项) — `no_answer_cluster` 错误恢复机制。** 当规划器拒绝将角色设置为 "answer" 的任何已接受的请求时，现在会在 `section-synthesis.json` 文件中的 `recovery_actions[]` 字段（包含 `narrow_section_purpose` 和 `add_on_topic_sources`）中显示恢复操作；在 `section-synthesis.md` 文件中会渲染一个 "## 恢复操作" 的 Markdown 块（包含 action_id 标题、解释文本以及用代码块包裹的命令提示）；还会显示一条单行 stderr 提示信息（`[synth] no_answer_cluster — 请参阅 section-synthesis.md 文件中的 "恢复操作" 块，以获取可执行步骤`）。 动作列表是唯一的数据来源，与动作图恢复路径共享；独立命令路径和内联错误信息路径之间不会出现偏差。 **R-020 的规划器提示调整（A 部分）曾尝试过，但已被撤销。** 第 1 轮迭代产生了错误的合成结果（LLM 在对抗性测试用例中，从正面效果的请求中生成了无效答案；验证器错误地将反向否定视为 "符合事实"）；第 2 轮迭代的严格限制未能阻止这种幻觉。 按照操作员的单轮迭代规则，提示信息和 3 个固定版本的测试文件已被撤销；`PROSE_PROMPT_VERSION` 保持在 `section-prose-v3`。 经验教训：即使结构上可以正常运行，合成的内容也可能存在错误；需要对对抗性测试用例进行手动文本检查，以发现否定、范围或谓词的错误。

R-021：自动模式下的冲突检测功能，增加了超时机制、启发式降级策略以及进度显示。
新增了 `--auto-mode-pair-timeout-ms <N>` 参数（默认为 90000 毫秒；之前是硬编码的 120 秒，但在 v0.4 版本中，通过测量 hermes3:8b 的性能，发现 6.2 秒到 8.8 秒的范围，因此默认为 90 秒，留有至少 81 秒的余量）。
新增了 `--auto-mode-fall-through-after-n-timeouts <N>` 参数（默认为 5；连续失败的次数，超过此次数则触发启发式降级；成功的 `type:none` 分类会重置计数器）。
匹配的环境变量。
每次调用时，都会在标准输出中显示一条新的起始行（`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`），始终可见，即使在非 TTY 环境下也能显示。
强制触发的 stderr 降级事件会绕过 TTY 限制和 `--progress` 选项，因为操作人员需要看到模式切换。
当阈值被触发时，`contradictions.md` 文件中会新增一个 `## Auto-mode fall-through` 的 Markdown 块。
启发式算法只在未处理的对上重新运行（不会对已经由 LLM 完成分类的对进行重复分类）。

### 架构说明

R-019 跨越了 research-os 和 ollama-intern-mcp 的边界。
research-os 在 `ollama_extract` 模式中传递了 `tier_budget_ms_override` 参数；ollama-intern-mcp v2.6.0 在内部安全机制中会处理该参数。
相关的底层机制已经存在；v2.6.0 提供了客户端的入口；v0.13.0 提供了 research-os 端的客户端连接。
R-018 的 Promise.race 包装器仍然保留，因为它能够防止一种独立的故障模式（未解决的 Promise 导致程序挂起；包装器可以捕获这些情况；而结构化的 `isError:true` 错误信息，如果超出内部预算范围，则属于 R-019 的处理范围）。

R-021 仅适用于 research-os。
冲突检测功能的自动模式不会经过 ollama-intern-mcp，而是直接调用 Ollama 的 HTTP `/api/chat` 接口。
没有 MCP 传输；没有 `tier_budget_ms_override` 相关的底层机制；没有 R-018 的包装器。
在 R-021 的启动协议中，四条硬性规则的检查发现了一个错误，这个错误在编写任何补丁代码之前就已经被检测到：启动协议中显示的是 "MCP RPC layer"，但在 A 阶段的读取过程中，这个信息被证明是错误的。

### 安全底线保持稳定

R-019 + R-020 (仅限 D) + R-021 都是操作人员可以调整的参数，而不是架构上的改变。
从 R-002 到 R-018 的所有功能都保持不变。
`accepted_claim_floor` 仍然是不可调整的。
枚举类型的值没有改变（`FailureShape` 为 9；`RECOVERY_ACTIONS` 为 8；`REGENERATION_REASONS` 为 3；`PLANNER_TIMEOUT_SOURCES` 为 3；`POLICY_KEYWORDS` 为 8；`POLICY_RELEVANT_SOURCE_TYPES` 为 1）。
AI 恢复建议的提示模板没有改变。
MCP 架构以附加的方式进行扩展。
R-010 中用于回退原因的正则表达式的形状保持不变。

所有四个冻结包的回归测试结果与 v0.3.3 的基线版本完全一致，这是**连续第十八次**发布的版本。
1542 个测试用例通过，1630 个测试用例通过（在三个模块中总共增加了 88 个通过的测试用例；4 个测试用例被跳过，因为它们依赖于运行环境的变量）。

### v0.13.0 不声称具备以下功能：

- v1 的可用性。
- v0.5 版本的独立运行的判定结果。v0.5 版本在单独的会话中针对 `@mcptoolshop/research-os@0.13.0` 进行测试；v0.13.0 是最终版本的基础，而不是证明。
- Admissibility Slice 1 的通过。该测试依赖于 v0.5 的通过结果。
- 延迟到 v0.13.x 的候选版本（F-2：research-os 审计与提取的差异；F-3：协作处理的延迟问题；F-4：R-017 中 `POLICY_KEYWORDS` 的范围限制；A-1 + A-2：架构方面的发现，已整合到 v0.5 的测试框架准备中）。

请参阅 [CHANGELOG.md](CHANGELOG.md) 以获取完整的发布说明。

## 新功能 v0.12.1 — 合成规划器超时设置（路径 C 补丁）

v0.12.1 是一个针对 v0.12.0 的单点修复补丁。它仅包含 R-018，即一个研究操作系统层面的包装超时设置，用于合成文本的 MCP `callTool` 调用。该设置由一个可供操作员发现的命令行标志控制（在 `synth section` 和 `synth workspace` 中使用 `--planner-timeout-ms <N>`），以及相应的环境变量 (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`)。优先级：命令行标志 > 环境变量 > 默认值 (15000 毫秒)。默认行为与 v0.12.0 完全相同。

此版本存在的原因是，针对 `@mcptoolshop/research-os@0.12.0` 的 v0.4 操作员独立性验证返回了 **PASS_WITH_CONDITIONS，而不是授权级别的通过** (`operator_aloneness_dst_v0.4`)。v0.11 的安全底线在实际负载下保持稳定；所有六个 v0.12 的覆盖范围恢复模块都已启动并承载了操作员；密封信封覆盖范围达到了通过阈值（必须包含 4/5 支持项 + 1 个部分项；2/3 支持项 + 1 个部分项的调节器；0/3 个陷阱；0/5 个材料故障触发）；所有污染标记均为无害。唯一的故障模式是最终化：合成文本在 ~15010 毫秒时可重复地触发 `TIER_TIMEOUT` 错误，而 15 秒的即时层级预算中没有记录任何操作员的覆盖设置。部分摘要符合信封要求；但该软件包无法进入冻结状态。

**路径 C 的处理方式**（在 v0.4 中获得的新的模式）：当会话 B 识别出一个明确的、命名的故障机制，并且信封覆盖范围达到通过阈值，安全底线保持稳定，且污染为无害时，处理方式是：发布补丁，重新运行相同的操作员路径，针对已修复的版本进行重新评估。不进行信封的重新授权。没有人工评估员。没有 v0.13 的架构升级。

> **v0.4 证明了研究操作系统在部分摘要级别的覆盖范围等级。**
> **v0.12.1 必须通过消除单个规划器超时瓶颈，同时保持安全底线，来证明最终化的等级。**

### 您可以运行的内容

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

活动预算信息位于 `section-synthesis.json` 文件中（`planner_timeout_ms` 始终已填充，`planner_timeout_overridden_by` 仅在覆盖时才存在），ProseBlock 元数据以及标准错误输出（在合成文本生成之前，会输出 `[synth] planner_timeout_ms=N source=… section=<id>`）。`synth section --help` 文档记录了该标志、默认值、上限（600000 毫秒的安全范围）以及环境变量的替代方案。无效值（负数、零、非数字、带有单位后缀的字符串、大于 600000）会明确地以非零退出码失败，并显示导致错误的表面信息和错误值。没有静默回退。

### 架构说明

v0.4 验证通过的 15000 毫秒预算位于 `ollama-intern-mcp` 中（`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`），而不是研究操作系统中。在 R-018 之前，研究操作系统没有强制执行规划器超时——超时是在 ollama-intern-mcp 的层级策略中服务器端触发的。R-018 的解决方案通过在 MCP `callTool` 周围使用 `Promise.race` 包装器，引入了研究操作系统对其预算的自主控制，默认值与实际观察到的即时层级数字（15000 毫秒）相同，从而保持了默认行为。R-018 的包装器会产生与 R-010 的 `classifyFallbackCause` 正则表达式匹配的 `TIER_TIMEOUT` 类型的错误（`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`），从而在默认路径运行中，保留了下游 AI 顾问对默认行为的可视性。

### 安全底线保持稳定

R-018 只是一个细微的、与操作相关的参数调整，不是架构上的改变。R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 均未进行修改。`accepted_claim_floor` 仍然是不可放弃的。枚举类型未进行更改（`FailureShape` 为 9；`RECOVERY_ACTIONS` 为 8；`REGENERATION_REASONS` 为 3；`POLICY_KEYWORDS` 为 8；`POLICY_RELEVANT_SOURCE_TYPES` 为 1）。AI 恢复建议的提示模板未进行修改。MCP 架构未发生变化——`ollama-intern-mcp@^2.4.0` 保持不变。R-018 增加了 `PLANNER_TIMEOUT_SOURCES` (3)，作为一种新的、与任何网关路由枚举类型都不同的操作相关词汇。

所有四个冻结包的回归测试与 v0.3.3 的基线版本完全一致——这是**连续第十六次**发布的版本，保持了这一特性。1542 → 1586，vitest 测试通过，增加了 44 个 R-018 的验收测试。

### v0.12.1 版本不包含的内容

- v1 版本的可用性。
- v0.4 版本的独立运行门禁的最终判定。v0.4 版本的运行是在 `@mcptoolshop/research-os@0.12.1` 环境下进行的，这是一个独立的会话；v0.12.1 是最终版本的基础，而不是证明。
- 可接受性 Slice 1。 依赖于 v0.4 版本的运行结果，如果通过，则通过。 v0.4 版本的策略（防御级别的独立性已证明；覆盖级别的独立性已在概要级别上实质性地证明；最终级别的独立性等待 v0.12.1 的验证）仍然是关键测试。
- v0.13 版本的候选内容（F-2 R-009 审计↔提取的差异；F-3 协作交接的陈旧性；F-4 R-017 `POLICY_KEYWORDS` 的局限性）。 与最终版本无关。

请参阅 [CHANGELOG.md](CHANGELOG.md) 以获取完整的发布说明。

## 之前版本：v0.12.0 — 覆盖范围恢复版本

v0.12.0 版本修复了 2026-05-16 发现的 v0.3 版本中的“独立操作员”问题（`operator_aloneness_dst_v0.3`），虽然通过了测试（PASS_WITH_CONDITIONS），但未达到授权级别的标准。本次发布包含四个方面的改进，共六个修复点：三个架构改进，解决了阻碍 v0.4 版本的覆盖范围不足问题（R-012、R-013、R-014）；三个用户体验改进，提升了 v0.4 版本测试环节的操作界面体验（R-015、R-016、R-017）。 v0.3 版本没有因为防御机制失效而失败——所有五个 v0.11 版本的防御机制都按预期运行，生成了干净、可靠的结果，没有隐藏的错误，并且系统在发现真实但范围较小的问题时停止了运行。 失败的原因是，即使防御机制正常工作，它们也会裁剪掉一些关键的、用于验证声明的基础数据覆盖范围。 v0.3 版本的核心原则是：

> **v0.11 版本使系统足够安全，可以避免产生隐藏的错误。**
> **v0.12 版本使其在不削弱这些防御机制的情况下，能够更好地恢复覆盖范围。**

核心思想：**保守的防御机制可以防止产生隐藏的错误，但它们也可能导致系统缺乏必要的覆盖范围。** v0.12 版本是解决覆盖范围问题的方案。 v0.11 版本的防御机制基础保持不变——所有 R-007 到 R-011 的防御机制仍然有效。 v0.12 版本在此基础上增加了合规、可验证的恢复机制。

### 您可以运行的内容

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

### 三个架构改进（解决了阻碍 v0.4 版本的底层问题）

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

### 三个用户体验改进（提升了 v0.4 版本测试环节的体验）

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

### 规范边界

所有既定规则得到维护。 `accepted_claim_floor`（可接受声明的最低标准）保持不变。 `FailureShape` 枚举类型的值保持在九个。 `RECOVERY_ACTIONS` 枚举类型的值保持在 8 个——没有添加新的辅助操作；R-014 的“形状区分”启发式方法扩展了现有操作的路由。 AI 恢复辅助提示模板未做修改（新的 `EvidenceState` 字段虽然在持久化的 JSON 文件中可见，但在提示中不会显示）。 恢复验证规则未做修改。 MCP 架构未做修改——`ollama-intern-mcp@^2.4.0` 保持不变；提取过程中的 MCP 调用形状没有变化。 R-017 的警告仅为信息提示，不影响测试结果、冻结状态或发布过程。 所有 v0.10 和 v0.11 版本的防御机制都得到保留；防御机制的基础保持不变，v0.12 版本在此基础上进行改进。

冻结版本的回归测试与 v0.3.3 版本的基准版本完全一致，这是连续的第十五次发布达到了这一标准（v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12）。

### v0.12.0 版本不声称具备以下功能：

- v1 版本的可用性。
- v0.4 版本的“独立操作员”测试结果。 v0.4 版本的测试运行在独立的会话中，使用 npm 包 `@mcptoolshop/research-os@0.12.0`。
- 可接受性测试的第一阶段。 该阶段已通过 v0.4 版本的测试，但 v0.3 版本的核心原则（已证明的防御级别独立性，但尚未证明的覆盖级别独立性）仍然是测试的关键。
- 优于基于云的研究工具。
- 完整的、经过校准的评审模型。

v0.12.0 版本是 v0.4 版本的“独立操作员”测试的先决条件，而不是最终结果。

请参阅 [CHANGELOG.md](CHANGELOG.md) 文件，以及面向操作员的覆盖示例，位于 [`examples/source-card-override.example.json`](examples/source-card-override.example.json)。

## 之前版本：v0.11.0 — 第二个“独立操作员”修复版本

v0.11.0 版本修复了 v0.2 版本中“独立操作员”测试失败的条件：范围/边界修复对齐（R-007）、发现时 URL 相关性检查（R-008）、提取和帧分析层中的配对源内容污染防御（R-009 + R-011），以及恢复辅助功能的故障原因可见性（R-010）。 三层源内容防护（在接收时进行 R-008 检查 + 在提取时进行 R-009 检查 + 在帧分析时进行 R-011 检查）在此版本中得到完善。 详情请参阅 [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md)。

## 之前版本：v0.10.0 — “独立操作员”修复版本

v0.10.0 版本修复了 v0.1 版本中存在的、与“单体操作员”相关的故障，这些问题于 2026 年 5 月 15 日被发现 (`operator_aloneness_dst_v0.1`, FAIL)。修复内容包括：恢复路由对齐 (R-002)、范围修复 CLI (R-001)、配对源卡审计加固 (R-003 + R-005)，以及可靠的状态收集 (R-004)。详情请参见 [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md)。

## 之前版本：v0.9.0 — 产品构件弧

v0.9.0 版本将 v0.8 版本的证据模块转化为对操作员有用的构件，包括：分段级文本合成 (`synth section`)、部分打包合成 (`synth pack --partial`)，以及合规的恢复建议器 (`recover pack`)。详情请参见 [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md)。

## 之前版本：v0.8.0 — 架构恢复

v0.8.0 将 research-os 重新连接到其声明的本地 LLM 基础 (`ollama-intern-mcp@^2.4.0`)，用于提取声明，增加了基于框架的章节相关性强制执行，并增加了面向需要修复的构件中，针对符合条件章节的、基于证据的引用合成。请参阅 [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md)。

## 状态

**v0.11.0 — 第二个“单体操作员”修复版本** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.11.0`，发布日期为 2026 年 5 月 15 日。v0.11.0 版本修复了 v0.2 版本中存在的“单体操作员”相关的故障 (`operator_aloneness_dst_v0.2`, PASS_WITH_CONDITIONS，但未达到授权级别，时间为 2026 年 5 月 15 日)，通过一个包含 5 个已识别问题的 4 阶段修复流程。**R-007** (范围/边界修复对齐): `claim repair-scope --auto` 现在会在修复时同时填充 `scope` 和 `not` 字段（如果这两个字段都为空），解决了 v0.10 版本中 R-001 修复后，`claim triage` 将修复后的声明重新分类为 `needs_scope_repair` 的问题。模板化的边界镜像了范围模板的降级形状。只读的账本现在会记录 `applied_not` 以及 `applied_scope`。**R-008** (发现虚构 URL 的防御): `discover run` 现在会获取每个候选 URL 的 `<title>`（限制：64KB 的正文，5 秒超时，4 并发），并计算与发现查询的确定性关键词重叠度。每个候选对象都会获得一个 `relevance` 字段（`verified | unverified | topic_mismatch`）；`approve --top N` 会隔离 `topic_mismatch`；可以通过 `approve --candidate <id>` 来覆盖操作员的设置。解决了 v0.2 版本中，`llm-heuristic` 返回 3 个真实的 PMC URL，但指向完全不相关的癌症/生物化学/HIV-淋巴瘤论文的问题。**R-009** (提取器身份保护): 引入了新的源卡严重级别 `source_identity_mismatch`（HARD FAIL），当提取器输出的 `card.title` 与获取的 HTML `<title>` 不一致时触发。解决了 v0.2 版本中的“老鼠和氯胺酮”的虚构问题。重用了 R-008 的重叠度辅助功能；可以通过 `clear_severities[]` 来覆盖。**R-011** (框架评论器源内容预检): 引入了新的框架排除原因 `source_content_mismatch`。框架评论器现在会为每个源计算一次源内容的签名，并在 LLM 评论器调用之前进行确定性的预检；如果低于阈值，则会跳过 LLM 调用，并将 `frame_excluded` 标记为 `true`。解决了 v0.2 版本中，11 个源自癌症论文的声明，其 DST 框架文本被 LLM 评论器接受的问题。**R-010** (恢复 MD 的备用方案可见性): 引入了新的枚举 `FALLBACK_CAUSES`（`tier_timeout | mcp_error | retry_exhausted`）和一个可选的 `FallbackTiming { elapsed_ms, budget_ms }`，用于 `prose_error` 元数据；恢复 MD 增加了“AI 建议器为何回退”的部分，以及顶级原因摘要。解决了 v0.2 版本中，JSON 中无法看到 `TIER_TIMEOUT` 的问题。**三层源内容污染防护现在已完成** (R-008 接受 + R-009 提取 + R-011 评论器)，并且经过验证，各层之间具有独立性。**需要 `ollama-intern-mcp@^2.4.0`** (与 v0.8.0 版本相同)。1448/1448 个 vitest 测试通过 (从 1344 增加到 1448，增加了 104 个测试用例)。**所有四个冻结的包都与 v0.3.3 的基线进行完全相同的字节比较**（连续第 11 个版本）。**这不是 v1 版本。也不是 v0.3 版本的“单体操作员”故障验证** — v0.3 版本将在单独的会话中针对此 npm 版本进行运行。关于可接受性的工作依赖于 v0.3 的通过。详情请参见 [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.10.0 — 修复独立操作者问题的版本** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.10.0`，发布日期：2026年5月15日。v0.10.0 版本通过一个包含 4 个部分的修复方案，解决了 v0.1 版本中独立操作者功能失效的情况 (`operator_aloneness_dst_v0.1`，于 2026年5月15日失效)。**R-001** (`research-os claim repair-scope <section> [--auto | --interactive]`): 引入新的命令行工具，用于修复 `scope` 字段为空的声明；新增只追加数据的日志文件 `evidence/claim-scope-repairs.jsonl`；在 `RECOVERY_ACTIONS` 中新增 `repair_claim_scope` 操作（枚举类型增加，从 7 变为 8）。系统会将其作为优先级最高的项目显示在 `accepted_claim_floor` 中，当 `needs_repair_claims` 中存在 3 个或更多需要修复的声明时。**R-002** (恢复路由): 诊断层现在将 `gate.json:blocking_reasons[]` 视为权威的路由信息，并在必要时回退到传统的 `failures[].check` 查找方式。与下游信号（如 `source_card_classification_gap`）相比，门禁阻止信号具有更高的优先级。**R-003 + R-005** (增强源卡审计，配对): 引入新的严重程度级别：`bot_check_or_captcha_detected` (严重失败 — 复合信号：标记 + 图像形状) 和 `extraction_suspect_word_count_mismatch` (警告并隔离 — 内容 ≤ 200 字，但提取的字数 ≥ 800 字，且比例 ≥ 4)。可以通过 v0.4 版本的覆盖日志模式中新增的 `clear_severities[]` 字段来覆盖这些设置。`research.yaml` 文件中可以选择性地添加 `audit.severity_thresholds` 块，以进行更精细的调整。**R-004** (可靠的 `gather_outcome`): `FetchReceipt` 枚举类型现在包含 5 个值：`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`；v0.1 版本中出现的错误信息 `"Failed (ok HTTP 200)"` 已被移除。请参阅 [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.9.0 — 产品构件层** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.9.0`，发布日期：2026年5月13日。v0.9.0 将 v0.8 中的证据链转化为对操作人员有用的构件。分节级别的文本合成功能 (`research-os synth section <id>`) 生成可读的 Markdown 格式文档，并提供段落级别的支持信息，指向已接受的论点。部分构件合成功能 (`research-os synth pack --partial`) 消耗分节文本（而非原始论点），并明确列出被排除的分节，并提供结构化的原因；一个确定性的构件规划器会在包含 2 个或更多分节时，预先选择所需的交叉支持信息。故障恢复建议器 (`research-os recover pack`) 为受阻的分节提供操作人员指导，采用四层架构——确定性诊断 + 合法操作图 + AI 建议 + 验证器，并提供三种建议路径 (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`)，以及针对九种故障模式和七种恢复操作的封闭枚举。恢复建议信息嵌入在每个被排除的分节下的 `partial-pack-synthesis.{md,json}` 文件中，通过从规范的恢复对象进行紧凑的投影，实现独立和嵌入式表面之间的单一数据源；`recovery_unavailable` 状态明确地暴露引擎故障情况（不进行静默跳过）。冻结和发布的语义保持不变：可读的部分构件不会使不完整的构件可以被冻结或发布。`accepted_claim_floor` 仍然是不可放弃的；恢复建议器拒绝推荐 `apply_waiver` 用于不可放弃的故障。**需要 `ollama-intern-mcp@^2.4.0`** (与 v0.8.0 相同)。1266/1266 个 vitest 测试通过 (从 1013 增加到 1266，增加了 253 个测试)。**所有四个冻结的构件都与 v0.3.3 的基线进行字节级别的完全一致性验证** (连续第六次发布)。**这不是 v1 版本。** v0.9.0 使构件层成为现实；v1 版本的可用性、全新的独立操作性构件、可信的评审模型以及基于云的基线验证声明，明确地未包含在本次发布中。请参阅 [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.8.0 — 架构恢复 + 框架边界内的相关性** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.8.0`，发布日期：2026年5月12日。v0.8.0 是一个架构恢复版本：research-os 现在使用 `ollama-intern-mcp@^2.4.0` 作为本地证据处理器的基础，用于提取论点（此前 README 中声明了该依赖，但代码中存在绕过它的内部直接 Ollama 接口，自 v0.1 版本以来一直存在，v0.8.0 解决了这个问题）。新增功能：MCP 客户端基础 (`OLLAMA_INTERN_MCP_BIN` 环境变量 + PATH 自动发现 + StdioClientTransport 生命周期）；通过 `ollama_extract` 和 4 标签模式（`supports_section` / `off_topic` / `background_only` / `source_chrome`）对每个论点进行分段证据评估；新的 `ReviewDecision` 状态 `frame_excluded`（如果论点被排除，则审查会跳过 LLM，并生成合成的 ClaimReview）；`ClaimSchema` 增加了 `frame_excluded` + `frame_exclusion_reason`（包含 4 个枚举值，包括 `critic_unavailable`，用于系统状态故障）+ `frame_exclusion_rationale`；通过 `synth section <id>` 实现基于分段的证据合成，适用于需要修复的包中的符合条件的段落（证据引用索引：论点 ID → 断言 → 证据摘录 → 来源 URL，而非叙述性文本）；审查机制通过 `getEffectivePublisher` / `getEffectiveSourceType` 尊重来源卡覆盖设置（吸收了 v0.7.1 的目标）；`DEFAULT_WINDOW_CHARS` 默认值从 5000 更改为 3000（针对 `dev-rtx5080` 配置文件下的 hermes3:8b 模型，上下文大小为 8K）；对评估器调用采用软失败策略（5 种失败模式：传输 / 解析 / 无效标签 / 空理由 / 超时，默认情况下设置为 `frame_excluded: true`，理由为 `critic_unavailable`，不予通过）；推广语义：`frame_excluded` 论点不会阻止分段的推广；协同工作流程将 `frame_excluded` 状态作为独立的桶，与已接受/需要修复/已拒绝的状态分开。**需要 `ollama-intern-mcp@^2.4.0`**。1013/1013 个 vitest 测试通过（从 901 增加到 1013，增加了 112 个测试）。**所有四个冻结的包都与 v0.3.3 的基线版本完全一致。** **这不是 v1 版本** — v1 版本的准备工作仍在进行中，请参阅 [`docs/roadmap.md`](docs/roadmap.md)。请参阅 [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.7.0 — 内部测试版本强化** — 已于2026年5月11日以 `@mcptoolshop/research-os@0.7.0` 的版本发布到 npm。 针对 v0.6.0 版本，进行了四阶段的内部测试（包括：错误/安全问题、主动增强稳定性、优化操作界面、完善界面设计）。 v0.7.0 版本包含以下强化改进：更安全的收集功能（针对每个 URL 采用 try/catch 机制，并在部分失败时保留正在处理的源 ID）；更具弹性的索引器（针对格式错误的 JSONL 文件，可以跳过并发出警告，针对每个记录/每个文件/每个部分）；结构化的错误恢复（12 个 `ResearchOSError` 子类，并提供参考手册链接）；进度反馈（通过 `--no-progress` 和 `--progress` 标志，自动检测终端环境，用于审查、收集、冲突映射和打包发布）；面向操作人员的可操作性改进（`pack publish --force` 命令的规范化和破坏性替换功能，已在 8 个方面进行了回归测试；修复了 `IndexNotBuiltError` 命令中的文本错误，并添加了命令文本注册测试；为 12 个 `ResearchOSError` 子类添加了错误参考手册链接）；供应链安全（CI 动作的 SHA 值固定，以及默认禁止读取文件内容；Dependabot 和 `github-actions` 生态系统覆盖）；新增了两个参考手册页面（`recovery.md` 和 `known-limitations.md`）；界面设计优化（规范化句子、重新排序侧边栏，并在破坏性操作处添加了警告提示）。 901 个 `vitest` 测试通过（从 713 个增加到 901 个，增加了 188 个测试）。 **所有四个冻结版本的打包文件都与 v0.3.3 版本的打包文件完全一致。** **这不是 v1 版本的发布** — v1 版本的准备工作仍在进行，详情请参见 [`docs/roadmap.md`](docs/roadmap.md) 和 [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md)。 更多信息请参见 [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.6.0** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.6.0`，发布日期：2026-05-10。v0.6.0 结束了实验 6，并提供了审查者信任的证据：research-os 现在可以生成可重现、可追溯的规范模型基线。包含：生产审查路径上的确定性审查器选项（`research.yaml` 文件中的 `review_profiles.<name>.reviewer_options`）；为在 v0.3.3 之前的冻结版本提供向后兼容的网关（F-53）；审查输出直接在 `review.json` 和 `review.md` 文件中公开了采样条件（F-54）；规范的确定性聚合接收已提交（`hermes-two-pass-deterministic`，`temperature:0, seed:7`）。**不接受任何经过信任验证的基线版本。** `hermes-two-pass-deterministic=failed`（结构模型能力在决策词汇表上的差距，而不是方差）。**Hermes 未被提升为 `trusted_baseline`。** 关键在于机制，而不是接收结果。没有对网关、冻结或合成规则进行任何更改。所有四个冻结版本的软件包都进行了逐字节的验证。 713/713 个 vitest 测试通过。请参考 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md)。

**v0.5.0** — 发布到npm，版本号为`@mcptoolshop/research-os@0.5.0`，发布日期：2026-05-10。v0.5.0版本使评审员校准更加可靠。评审员配置文件不会因为只运行一次而被信任，而是通过结构化的、带有预设错误的测试结果和多次运行的聚合来获得信任状态。包含：结构化的校准结果模式（`seeded-v1.{json,md}`，经过Zod验证，包含四个状态标签）；多运行测试框架（`--runs <n>`，每个运行隔离，基于中位数的PASS/FAIL结果，重复失败降级）；能够感知架构的决策词汇表；在`review-promote`中进行包相关的结果文件查找。**没有可信的基线：** `hermes-two-pass=failed`（聚合，3次运行），`mistral-nemo-two-pass=conditional_pass`，`hermes-single-pass=comparison_only`。research-os现在可以拒绝信任评审员配置文件，当反复的、带有预设错误的测试结果不支持信任时。**没有对网关、冻结或合成规则的更改。所有四个现有的冻结包都以字节级别的相同方式进行验证。** 671/671个vitest测试通过。请参阅[CHANGELOG.md](CHANGELOG.md)。

**v0.4.0** — 发布到npm，版本号为`@mcptoolshop/research-os@0.4.0`，发布日期：2026-05-10。v0.4.0版本使源代码身份更加可靠。基于确定性的源代码类型规则处理可重复的多数情况，覆盖账本保留了操作员的更正，并且`source-card audit`（源代码卡审计）取代了对临时脚本漂移的检查，提供了一个一流的命令行界面。包含：集中式的源代码类型分类器（组件B — `classifySourceType`，11个标准供应商，`source-type-rules.json`）；源代码卡覆盖账本（组件A — `source-card-overrides.jsonl`，`validate` + `list`子命令）；以及源代码卡审计命令行界面（组件D — `research-os source-card audit --pack <dir>`，7种发现类型，JSON + Markdown格式，`--apply --from`用于应用路径）。F-46：一个小的修复，现在包清单会记录实际的二进制版本，而不是冻结在`research.yaml`中的版本，该版本在包初始化时被冻结。**没有对网关、冻结或合成规则的更改。所有四个现有的冻结包都以字节级别的相同方式进行验证。** 620/620个vitest测试通过。请参阅[CHANGELOG.md](CHANGELOG.md)以及[源代码卡审计手册页面](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/)。

**v0.3.3** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.3`，发布日期：2026年5月10日。此版本改进了“门”机制的语义清晰度，这是Pack-3（Godot导出/运行时稳定性，实验3的第3个包）所取得的成果。现在，“门”的输出结果除了包含整个包的计数外，还包含按“门”划分的发布者和主要计数（F-43）；`no_source_cluster_monopoly` 的警告信息已更改为信息性诊断信息（F-41）。**通过/失败的行为未改变；现有的冻结包在字节级别上进行验证。** 570/570 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)。

**v0.3.2** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.2`，发布日期：2026年5月9日。此版本对“已接受的声明”进行了标准化处理，以适应“包发布”的流程。严格的 `claim-reviews.jsonl` 文件和 `pack-audit.json::accepted_claims` 之间的相等性检查已被替换为集合比较——已接受的声明是具有最新规范审查决策为 `accepted_for_synthesis` 的唯一 `claim_id`（`claim_id` 遵循“最新决策优先”原则）。对于那些其历史审计计数与集合比较结果不同的冻结包，现在会发出警告而不是拒绝；原始的审计文件将被完整保留（第15条规定），而归档清单会反映标准化后的计数。对于虚假 `claim_id`、不兼容的重复决策以及不符合合成条件的“门”，仍然会拒绝。这是 Experiment 3 XRPL pack Session K 的成果——由于实际的账本关闭时的差异，包发布被拒绝（第07部分有 24 行原始的 `accepted_for_synthesis` 数据，但由于审查窗口的重叠，只有 19 个唯一的 `claim_id`）。558/558 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/pack-publish.md`](docs/pack-publish.md)。

**v0.3.1** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.1`，发布日期：2026-05-09。 包含按章节划分的来源豁免 (`primary_source_waiver.section_waivers[]`)，以及审查人员的确认，因此，如果某个章节的“来源垄断”被豁免，则该豁免会成为一个可见的提示，而不是自动将所有主张都标记为“需要修复来源”。 这是通过实验 3 XRPL 包的第二阶段实现的——针对“标准协议”部分的分析（包括单链、封闭式 API 规范和标准机构文档）推翻了“发布者多样性是衡量真理质量的指标”的假设。 540/540 个 vitest 测试通过。 请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)。

**按章节划分的来源豁免**：当发布者多样性与该章节的真理来源结构上不兼容时，才使用这些豁免，而不是仅仅因为某个章节未能找到足够的来源。 豁免必须包含经过模式验证的 `reason`（原因）以及非空 `compensating_controls[]`（补偿控制）。 包策略 `primary_source_waiver_allowed: false` 会阻止包级别和章节级别的豁免。 之前的 v0.3.1 版本中，包级别的 `min_independent_publishers: 0` 是一种解决方法，现在已弃用；现有的已冻结的包仍然在现有记录下有效。 请参阅 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) 和 [research-packs 操作手册](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)。

**v0.3.0** — 发布于 2026-05-09。 针对 `contradict map`，发布了 `--detector <auto|heuristic|ollama-intern>` 标志（来自 Experiment 3 Session 1，XRPL pack 的 F-09 chain-blocker 修复）。 此时，527/527 个 vitest 测试通过。 检测器的选择现在是明确的操作员选择，而不是依赖于状态的环境变量；模式会在每次运行时显式显示。 参见 [`docs/contradict-map.md`](docs/contradict-map.md)。

**v0.2.0** — 发布于 2026-05-09。 发布了 `research-os pack publish`（Experiment 2）以及 Pattern 2 的就绪谓词修复。 此时，515/515 个 vitest 测试通过。 参见 [CHANGELOG.md](CHANGELOG.md)。 冻结的软件包导出到标准的 `research-packs` 归档，只需一个命令即可完成； 许可协议由代码强制执行，而不是检查清单。 参见 [`docs/pack-publish.md`](docs/pack-publish.md)。

**v0.1.0** — 2026-05-08 冻结了内部测试软件包。 位于 `research-os-packs/research-os-spec/`（兄弟仓库）的软件包已冻结，共包含 8 个部分，有 296 个已接受的声明，17 个已处理，30 个被操作员覆盖，0 个活动修复阻止器，0 个未解决的矛盾，所有条件 `synthesis_eligible=true`。 共有 16 条关键规则。 参见 [`docs/dogfood-proof.md`](docs/dogfood-proof.md)，其中包含七个发现和冻结确认的指纹。

**research-packs 归档代码仓库** — 位于 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)，包含四个软件包：`research-os-self-dogfood`（v0.1 内部测试版本，296 个已接受的声明，8 个部分），`comfyui-workflow-durability`（实验 1，302 个已接受的声明，8 个部分），`xrpl-creator-token-durability`（实验 3 的软件包 #2），以及 `godot-export-runtime-durability`（实验 3 的软件包 #3）。所有软件包都通过了 `verify-pack.mjs` 的验证。

**v1 Experiment 1 (ComfyUI 工作流程的稳定性)** — 已于 2026-05-09 结束。 终端 A 的所有 8 个部分已完成，软件包已冻结，归档已上线。 参见 [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) 和 [`docs/roadmap.md`](docs/roadmap.md)。

### research-os 的局限性（以及 v0.12.1 版本不声称具备的特性）

- 未经在全新安装包上验证的独立操作能力。v0.12.0 版本解决了 v0.3 版本的相关问题（已证明具有防御级别的独立操作能力；但尚未达到覆盖级别的独立操作能力——v0.3 版本获得的策略机制）。v0.4 版本的测试对 v0.12.0 版本的结果为“条件通过”（未达到授权级别），防御层得到了保留，覆盖级别在章节层面已基本得到证明，但在最终阶段存在单一故障模式。v0.12.1 版本修复了该单一故障模式（R-018）。针对此 npm 版本的重新测试将在单独的会话中进行，并且是达到最终版本级别的先决条件。
- 未经外部用户在实际使用中进行充分测试，仅限于内部测试和四个独立操作能力测试。六个内部测试已完成，包括一个自我参照测试，以及五个外部领域测试（ComfyUI、XRPL、Godot、评审人员校准、确定性评审）。此外，v0.1 / v0.2 / v0.3 / v0.4 的独立操作能力测试发现了 18 个问题（R-001 至 R-005 在 v0.10.0 版本中已解决，R-007 至 R-011 在 v0.11.0 版本中已解决，R-012 至 R-017 在 v0.12.0 版本中已解决，R-018 在 v0.12.1 版本中已解决）。在更大规模的外部操作方面仍有待进一步研究。
- 并非完整的合成器。v0.12.1 版本继承了 v0.9 版本的章节范围 (`synth section`) 和部分包范围 (`synth pack --partial`) 功能，每个功能都明确声明了包的可用性。完整的包合成仍然需要一个 `synthesis_ready` 级别的包，以及通过 `synth workspace` 使用人类（或协作者）编写，并基于已接受的声明 ID。
- 不代表对任何评审模型的认可。v0.12.1 版本默认不包含 `trusted_baseline` 评审人员配置文件；校准记录是证据，而非认可。现有的 v0.6.0 校准记录是在 v0.8.0 MCP 架构之前创建的，并且尚未在 MCP 路径下重新基准。请参阅 [评审人员校准手册页面](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/)。
- 冻结的包中可能包含历史遗留信息。在 v0.4 之前的冻结版本包含 `research_os_version: '0.1.0'`，这是由于 v0.4 之前的硬编码常量。该问题已在 v0.4.0 版本中修复，但较早的冻结版本由于 Law 15 的限制而无法修改（请参阅 [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)）。
- 未在 npm 上进行溯源验证。Sigstore 溯源验证将在未来的版本中实现；请通过 package-shasum 和 GitHub 发布提交来验证 v0.12.1 版本的 npm 包。
- 并非云端解决方案的优势。v0.7.x 版本的 `local-first-vs-cloud-research/` 报告指出了云端在可读性和操作负担方面的优势；v0.12.1 版本并未声称这些优势已被克服。

### 已知的局限性

v0.12.1 版本包含三个用户可见的已知限制，这些限制是从之前的版本中继承而来的。每个限制都记录在 [手册中的已知限制页面](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) 和 [CHANGELOG.md](CHANGELOG.md) 中。 没有任何限制会阻止发布；所有限制都有明确的恢复或缓解方案。

- **B-E-001 — 预 v0.4 版本的“frozen-pack”版本标记是一个历史遗留物。** 在 v0.3.3 到 v0.6.0 之间发布的“frozen pack”版本，由于一个预 v0.4 版本的硬编码常量，在 `pack.manifest.json` 和 `pack/research.yaml` 文件中包含 `research_os_version: "0.1.0"`。 此问题已在 v0.4.0 版本中修复（现在“scaffold”导入的是实时 `RESEARCH_OS_VERSION`）；更早版本的“frozen pack”在第 15 条规则下是不可变的。 受影响的“pack”内部的 JSON 文件已经包含了它们当时的版本信息。
- **B-E-004 — npm provenance 认证将在未来的版本中实现。** v0.12.1 版本的 npm tarball 仅通过 package-shasum 进行验证。 将发布流程迁移到具有 sigstore OIDC 的 CI 工作流，与“发布前翻译”的原则（TranslateGemma 12B 在本地运行）存在冲突；此迁移计划在未来的版本中进行。 请通过 package-shasum 和 GitHub 发布提交来验证 v0.12.1 版本的 npm 包。
- **B-A-003 — 索引器 schema-version 迁移已记录，但未强制执行。** v0.12.1 版本包含一个写入端的 `SCHEMA_VERSION` 整数，但没有读取端的迁移运行器。 当 `SCHEMA_VERSION` 发生记录中的更改时，请删除 `.research-os/index.sqlite` 文件，然后重新运行 `research-os index build --all` 命令。 “pack”本身不受影响——索引器是证据 + 声明的加速层（第 8 条规则）；重建是幂等的。

**在 v0.12.1 版本中，不接受任何“trusted_baseline”审查者配置文件。** 这是一个有意的信任策略，而不是一个缺陷：存储库中的校准记录（`hermes-two-pass=failed`，`mistral-nemo-two-pass=conditional_pass`，`hermes-single-pass=comparison_only`，`hermes-two-pass-deterministic=failed`）记录了相关证据。 信任是通过重复的、有预设失败情况的验证来获得的，而不是默认信任。 这些记录早于 v0.8.0 版本的 MCP 架构，并且尚未在 MCP 路径下重新基线。

## 通往 v1.0 的路线图

v1.0 并非一个发布日期，而是一个达成的状态。所有六个内部测试环节都已经完成（Exp1–Exp6，时间为2026年5月8日至2026年5月11日），每个环节都产出了一个已冻结的研究包，并被提交到 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) 仓库。该项目通过以下阶段达成了v0.2.0版本：`research-os pack publish` + 模式2（实验2），v0.3.0版本的`--detector`参数（F-09），v0.3.1版本的范围限定豁免（F-10/F-11），v0.3.2版本的标准化已批准声明处理（F-36），v0.3.3版本的门控语义清晰化（F-43/F-41），v0.4.0版本的源数据纪律（F-27/F-47/F-46），v0.5.0版本的评审员校准，作为一种持久的信任协议（F-48/F-49/F-50），以及v0.6.0版本的确定性评审员基线（F-53/F-54）。v1.0版本的发布准备工作正在进行中，通过一个多阶段的健康检查/优化流程，并且整个过程中架构锁定始终有效。完整计划请参考 [`docs/roadmap.md`](docs/roadmap.md)。

## 许可证

麻省理工学院。
