<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` 将研究从生成的文档转化为一个固定的证据包。它保留原始数据，将主张与综合分析分离，通过关卡强制进行准备工作，记录审核者和弃权决策，并发布一个可以追溯和验证其主张的软件包。

它不会要求您信任模型。它为您提供了一种机制，以决定模型、来源以及综合分析是否值得信赖。

## 它的作用是什么？

`research-os` 是“我想研究 X”与一个固定的、可追溯主张的证据库之间的控制平面。它将发现线索与提取证据、原始提取与筛选后的主张、矛盾检测与矛盾解决以及审核决策与综合分析结果分离。每个步骤都会写入仅追加的日志；每个准备就绪的结论都从这些日志中计算得出，而不是简单地断言。

它不是一个报告生成器。它也不是一个 LLM 编排框架。它不会为您撰写综合分析。它强制执行综合分析可以开始的条件。

固定的软件包已存档在 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) 中——实时可用，包含六个封闭的内部测试实验中的四个软件包。有关 v1.0 版本的路线图，请参阅 [`docs/roadmap.md`](docs/roadmap.md)。

v0.1 版本已在两个内部测试周期中进行了压力测试。第一个——`research-os` 研究自身的规范——在 v0.1.0 版本发布之前发现了七个正确性问题，每个问题都需要进行实际的代码修复，并形成一条规则或集成模式。第二个（v1 实验 1：ComfyUI 工作流程的持久性，11 个会话，一个与 `research-os` 没有词汇重叠的领域）于 2026-05-09 关闭：软件包已冻结，存档已上线，通过提交 `22b5dba` 完成了模式 2 的强制执行。v0.1 版本的验证过程记录在 [`docs/dogfood-proof.md`](docs/dogfood-proof.md) 中；实验 1 的验证过程记录在 [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) 中。在线手册：<https://mcp-tool-shop-org.github.io/research-os/handbook/>。

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

## 快速入门

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

> **关于 `freeze` 输出的说明。** `research-os freeze` 在遍历每个规范工件并计算内容哈希时，不会显示任何信息——此命令没有增量进度。对于大型软件包，它可能需要运行数十秒后才会打印任何内容。完成时，它会打印一个单独的验证块（`PASS`/`REFUSED` 以及收据路径）。请不要将这段时间理解为程序卡住。

> **`--force` 警告。** `--force` 会清除并替换目标软件包目录。请勿在生成的软件包输出中保留手动编写的文件。而是编辑上游工件（主张、来源、综合分析）或相关的文件。完整的许可协议 + 拒绝案例：[`docs/pack-publish.md`](docs/pack-publish.md)。

**要查看实际的示例，** 请参阅 `research-os-packs/research-os-spec/` 中的内部测试软件包——每个工件、每个收据、每个结果以及每个冻结指纹，所有内容都以仅追加日志的形式存储在磁盘上。该软件包生成了 `docs/dogfood-proof.md`。

**需要本地运行 [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp)**，用于 LLM 提取、筛选、审核和发现。MCP 服务器通过 `OLLAMA_INTERN_MCP_BIN` 环境变量或 PATH 进行发现。默认模型为 `hermes3:8b`；可以通过 `OLLAMA_INTERN_MODEL=<model>`（或每次调用时使用 `--model <name>`）进行覆盖。如果 Ollama 不在默认的 `localhost:11434` 上，请设置 `OLLAMA_HOST`。

## 16 条关键规则

| # | 规则 |
|---|-----|
| 1 | 在有原始数据之前，不能进行综合分析。 |
| 2 | 提取是证据；解释是解读。 |
| 3 | 模型可以解读来源片段；它们不能编写证据片段。 |
| 4 | 提取可能会过度生成；综合分析不能继承过多的内容。 |
| 5 | 矛盾映射会显示紧张关系；它不会解决、综合或决定哪个主张获胜。 |
| 6 | 关卡决定一个部分是否适合进行综合分析。它们不会进行综合分析或隐藏失败。 |
| 7 | 对抗性审核用于评估研究的完整性。它不会进行综合分析或重写原始数据。 |
| 8 | 索引使研究结果可查询。它不会创建新的结果，也不会成为记录来源。 |
| 9 | 协同工作交接从研究结果中提取操作指令。它不会创建结果或绕过关卡。 |
| 10 | 综合分析工作区组织接受的研究结果以供协同工作使用。它不会创建综合分析，也不会绕过交接模式。 |
| 11 | 软件包审核汇总现有的研究结果。它不会创建新的结果，也不会隐藏部分级别的证据。 |
| 12 | 发现提出线索；只有提取才能产生证据。 |
| 13 | 在经过种子失败证明其召回率之前，审核者不值得信任。 |
| 14 | 主张的数量多并不代表研究质量高。必须对主张进行筛选后，它们才能参与综合分析竞争。 |
| 15 | 冻结锁定已完成的研究结果。它不会完成未完成的研究，也不会将修复状态转换为证据。 |
| 16 | 弃权可以放宽来源约束；但不能凭空制造证据。 |

**规则 3**——LLM 不会编写证据文本。`research-os` 构建一个确定性的摘录日志（稳定的 ID，如 `ex_<source_id_hex>_001`）；LLM 选择摘录 ID；`research-os` 复制字面文本。“释义为引用”的失败类型在结构上是不可能的。

**规则 14**——在提取和审查之间，`research-os claim triage` 会进行重复数据删除、限制每个来源的贡献量，并将优先级较低的候选方案搁置。Triage 不会修改 `claims.jsonl`；已搁置的声明将保留在规范账本中。

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

每个步骤都是一个 CLI 命令。每个步骤都会写入只追加型工件。没有一个步骤会合成、解析或创建新的事实——这些不变性会被强制执行，而不是依赖于信任。审查会接受/拒绝/请求修复候选声明；网关会使用这些审查决策来计算 `synthesis_eligible`；冻结是最终的完整性锁定，除非每一层都同意，否则它将拒绝标记一个包为已完成。请参阅 [docs/dogfood-proof.md](docs/dogfood-proof.md)，了解 v0.1 的端到端证明。

这是 *搜索 → 总结 → 生成漂亮的报告* 的结构性替代方案。该链是产品。

## 词汇表

| 术语 | 含义 |
|------|---------|
| `research-os` | 控制平面 / CLI / 网关 / 编排规则（此仓库） |
| `research-pack` | 为一项研究工作生成的仓库工件 |
| `research section` | 包中一个有界的研究单元 |
| `research receipt` | 证明某个部分通过了来源/声明/网关检查 |

## 安全性

`research-os` 是一个本地优先的 CLI。它读取和写入您指向它的研究包目录中的文件，并且（在使用 `gather` 时）发出传出 HTTP 请求以获取您提供的来源 URL。它不会：运行服务器、接受传入连接、存储凭据或发送遥测数据。没有秘密被写入包工件中。请参阅 [SECURITY.md](SECURITY.md)，了解漏洞报告策略。

## 审查员校准

v0.5.0 使审查员校准具有持久性。一个审查员配置文件不会因为只运行一次而被信任；它通过结构化的种子失败记录和多轮聚合来获得状态。v0.6.0 将确定性的审查员选项添加到生产审查路径和校准工具中。

**目前没有配置文件被认定为 `trusted_baseline`。** 仓库中的规范记录显示 `hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`。这是有意的：信任是通过重复的种子失败证据获得的，而不是假定的。

校准记录位于 `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`。每个记录都会针对七个指标、四个状态标签（`trusted_baseline`、`conditional_pass`、`failed`、`comparison_only`）记录 PASS/FAIL，并诚实地披露测试工具无法测试的内容（`needs_contradiction_mapping` 无法从 `seeded-v1` 访问）。请参阅 [CHANGELOG.md](CHANGELOG.md)。

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

当使用 `--runs <n>` 时，每个运行的记录将被写入 `<profile>/runs/run-NNN.json`，并且一个聚合记录（带有基于中值的指标和重复失败检测）将被写入 `<profile>/seeded-v1.{json,md}`。聚合记录携带 `receipt_kind: 'aggregate'` 以与单次运行的记录区分开来。单次运行模式（`--runs 1` 或省略）会保留现有的直接写入行为。

**确定性的审查员配置文件**——在 `research.yaml` 中使用 `review_profiles.<name>.reviewer_options` 来携带 `temperature`、`seed` 和其他 Ollama 采样参数到生产审查路径中的每个 `OllamaInternReviewer` 的构造中。`hermes-two-pass-deterministic` 配置文件作为内置示例提供。请参阅 [docs/experiment-6-proof.md](docs/experiment-6-proof.md) 和 [reviewer calibration handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/)。

## v0.13.1 中的新增内容——R-024 提取阶段分层预算权限（路径 C 补丁）

v0.13.1 是在 v0.13.0 之上的一个单次修复补丁。它通过将 R-019 的分层预算权限扩展到 `claim extract` 期间进行的每个 `ollama_extract` MCP 调用，从而解决了 v0.5 Track-C 条件（R-019 在声明提取阶段的范围差距），包括：每个窗口的提取器、每个声明的 R-011 部分证据评估器以及每个救援候选者的 R-012 救援评估器。与 R-019 的合成散文覆盖具有相同的架构。单个仓库补丁（仅限 research-os）；ollama-intern-mcp@2.6.0 的 `tier_budget_ms_override` 模式字段是未更改的服务器端接口。

该版本存在的原因是，v0.5 操作员独立性网关针对已发布的 `@mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0` 返回 **PASS_WITH_CONDITIONS，而不是授权级别** (`operator_aloneness_dst_v0.5`)。所有 v0.13 表面（R-018 + R-019 + R-020 + R-021）都正常运行且没有错误；防御底线得到保留；在已命名的失败处进行诚实的拒绝，并提供记录的恢复操作。但是，第 02 部分（`02-safety-and-economic`）中的 8 个来源中有 3 个在提取过程中达到了内部 15000ms 的即时分层 TIER_TIMEOUT，并且没有面向操作员的覆盖。R-019 在 v0.13.0 中提供了用于合成散文的类似覆盖；v0.13.1 将其扩展到提取阶段。

> **R-024 实现了完整的分层预算规则：在扩展分层预算时，该预算必须达到该阶段中可以产生相同内部超时时间的所有 LLM 调用。部分覆盖 = 在调用站点覆盖层上的目标不正确的补丁。**
> **R-024 还实现了实时重放测试的脆弱性规则：当实时重放验收测试由于工具原因（时序、捕获、测试夹具状态）而不是机制原因而失败时，请修复测试工具——不要跳过、降级或替换手动工件检查。**

v0.5 版本采用路径 D（多轨道分流）。v0.13.1 关闭了轨道 C。轨道 A 在搭建阶段关闭（内存门控钩子路径白名单）。轨道 B（源发现搭建）在 v0.13.1 发布后，在一个单独的会话中启动。v0.6 门控设置紧随轨道 B 之后。可接受性切片 1 在 v0.6 通过之前仍然**未授权**。

### 您可以运行的内容

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

优先级：CLI 标志 > 环境变量 > 默认值（省略；ollama-intern-mcp 配置文件的默认值生效）。限制为 `[1, 600000]` 毫秒（10 分钟上限安全阈值）。无效的值会清晰地报错，并返回一个非零的退出代码，其中包含表面信息 + 违规值。

### 新内容

**R-024 — 在所有 3 个 `ollama_extract` 调用站点中提取阶段层级预算权限。** `claim extract` 命令中的新的 `--tier-budget-ms <N>` 标志（以及匹配的 `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS` 环境变量）会将操作员控制的每个调用的层级预算覆盖传递给 `ollama-intern-mcp@>=2.6.0`，作为在提取运行期间对每个 `ollama_extract` 调用工具调用中的 `tier_budget_ms_override`：`MCPClaimExtractor.extractOnePage`（每个窗口的提取器）、`runCritic`（R-011 每个声明的部分证据评估器，每个草稿一个调用），以及 `runRescueCritic`（R-012 每个救援候选对象的救援评估器，用于处理 source_content_mismatch 草稿）。活动的预算信息会显示在 stderr 中（在每个源循环之前输出：`[extract] tier_budget_ms=N source=... section=<id>`），提取收据的元数据中（`tier_budget_ms` + `tier_budget_overridden_by`，位于 `audits/<section>-claim-extract.json`），以及封闭枚举 `EXTRACT_TIER_BUDGET_SOURCES` 中（`['default', 'cli_flag', 'env_var']`）。默认行为与 v0.13.0 相同（没有标志，也没有环境变量 → 使用配置文件默认值；收据省略新的字段）。

### 架构说明

R-024 模仿 R-019 的架构，但位于不同的阶段。R-019 通过 `runProseSynthesis` 将覆盖传递给规划器 + 草稿编写器 + 验证器（3 个合成文本 `ollama_extract` 调用站点）；R-024 通过 `extract()` 协调器 → `MCPClaimExtractor.extract` → 分发到 extractOnePage + runCritic + runRescueCritic（3 个提取阶段的 `ollama_extract` 调用站点）。完整的层级预算规则现在是一个重要的原则：当扩展操作员可见表面的层级预算时，B 阶段的报告必须列举该阶段中共享相同内部超时时间的所有 LLM 调用站点。部分覆盖会导致在调用站点覆盖层上出现 MISTARGETED-PATCH，其自证否定的签名与 R-018 的包装器/内部机制 MISTARGETED-PATCH 相同：收据记录了覆盖以及命名的超时时间在一个未覆盖的调用站点触发，并且都在同一个工件中。

ZERO ollama-intern-mcp 更改。v2.6.0 的 `tier_budget_ms_override` 架构字段自 R-019 的协调发布以来一直存在；v0.13.1 提供研究操作系统侧的提取阶段客户端连接。

### 防御底线保持不变

R-024 是一个操作员控制旋钮的添加，而不是架构上的更改。R-002 到 R-021 表面均未更改。`accepted_claim_floor` 仍然无法被修改。封闭枚举没有变化（`FailureShape` 为 9；`RECOVERY_ACTIONS` 为 8；`REGENERATION_REASONS` 为 3；`PLANNER_TIMEOUT_SOURCES` 为 3；`POLICY_KEYWORDS` 为 8；`POLICY_RELEVANT_SOURCE_TYPES` 为 1）。R-024 添加了新的封闭枚举 `EXTRACT_TIER_BUDGET_SOURCES`（3 个值），而没有触及任何现有的枚举。AI 回复顾问提示模板未更改。MCP 架构以累积的方式扩展。R-010 回退原因正则表达式形状保持不变。R-015 提取 `--resume / --progress` 形状保持不变（R-024 添加了新的 stderr 日志行 + 新的收据字段；现有的日志格式 + 跳过行为 + 输出形状未更改）。

对于所有四个冻结包，与 v0.3.3 基准相比，冻结包回归结果完全一致——**连续第十九次发布**都保持了这一点。1630 → 1663 个 vitest 通过（+33 个 R-024 合成验收测试 + 1 个始终开启的保护；6 个跳过——实时重放测试受限于环境变量）。

### v0.13.1 不会声明以下内容

- v1 就绪。
- v0.6 操作员独立性门控的最终结果。v0.6 设置紧随 R-023 之后（源发现搭建）；v0.13.1 是轨道 C 关闭的前提条件，而不是证明。
- 可接受性切片 1。取决于 v0.6 通过。
- 推迟的 v0.13.x 候选对象（F-2 R-009 audit↔extract 差异；F-3 cowork-handoff 停滞；F-4 R-017 POLICY_KEYWORDS 狭隘性）。

有关完整发布条目的信息，请参阅 [CHANGELOG.md](CHANGELOG.md)。

## 之前：v0.13.0 — 最终化阻碍分流阶段（R-019 + R-020 D-only + R-021）

v0.13.0 关闭了在 v0.4 重新运行后，针对 `@mcptoolshop/research-os@0.12.1` 返回 **PASS_WITH_CONDITIONS，而不是授权级别** 的 v0.13 最终化阻碍分流阶段（通过路径 D，多阻碍分流阶段，与命名补丁的路径 C 不同）。三个独立的最终化阻碍位于三个不同的流水线层；三个独立的命名旋钮，它们共同取消了合成文本最终化 + no_answer_cluster 回复表面的阻止，并抵消了自动模式。从 v0.10 / v0.11 / v0.12 / v0.12.1 获得的防御底线和覆盖恢复表面保持不变；没有封闭枚举的更改；没有破坏性表面更改。

> **v0.4 重新运行证明，合成验收可以验证管道，而实时重放会否定目标机制。**
> **v0.13 解决了最终化运行时控制：R-019 取消了内部 MCP 层级预算层的阻止；R-020 显示了诚实的 no_answer_cluster 拒绝以及回复操作；R-021 取消了矛盾映射自动模式 RPC 层的阻止。**

v0.5 操作员独立性门控针对已发布的 v0.13.0 在一个单独的会话中触发。在 v0.5 通过之前，可接受性切片 1 仍然**未授权**。

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

### 新内容

**R-019——内部 MCP 分层预算客户端的连接。** R-018 的 `--planner-timeout-ms <N>` 参数（以及 `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS` 环境变量）现在贯穿于规划器/草稿编写器/验证器，最终到达 `ollama_extract.tier_budget_ms_override`，并在 `ollama-intern-mcp/src/guardrails/timeouts.ts:61` 的 `runWithTimeoutAndFallback` 处生效。导致 v0.4 重复运行失败的内部分层超时机制（`elapsed=15018ms budget=15000ms`），现在直接遵循操作员设定的预算。R-018 包装器保留为外部硬性限制，以防止未解决的 Promise 导致程序挂起（正交故障模式包装器实际上可以捕获这些问题）。需要 `ollama-intern-mcp@>=2.6.0`；旧版本会静默忽略新的架构字段（R-018 包装器仍然在其原始层级上工作——优雅降级）。

**R-020（仅 D 版本）——`no_answer_cluster` 的恢复机制。** 当规划器拒绝将 `role=answer` 分配给任何已接受的声明时，故障现在会以行内形式显示 `recovery_actions[]`（`narrow_section_purpose` + `add_on_topic_sources`）在 `section-synthesis.json` 中，并在 `section-synthesis.md` 中呈现一个带有标题为 `## Recovery actions` 的 Markdown 代码块（包含 action_id 标题 + 原因文本 + 带围栏的代码提示），以及一条单行 stderr 提示（`[synth] no_answer_cluster — see section-synthesis.md "Recovery actions" block for actionable steps`）。操作列表是与动作图恢复路径共享的单一事实来源；不存在独立命令和行内故障主体路径之间的差异。**R-020 的规划器提示调整（A 部分）已尝试并回滚**——第一次迭代产生无声错误的合成结果（LLM 从对抗性测试用例中的正面效应声明中虚构出无效答案；验证器将反向否定视为“可靠”）；第二次迭代的硬性限制未能覆盖幻觉。根据操作员的一轮迭代规则，提示和 3 个已固定 v3 版本的测试文件已被回滚；`PROSE_PROMPT_VERSION` 保持在 `section-prose-v3`。该原则得到了加强：结构化实时重放可以成功进行，但合成内容可能存在无声错误；需要对对抗性测试用例进行手动散文检查，以捕获否定/范围/谓词反转。

**R-021——矛盾映射自动模式的挂起超时 + 启发式回退 + 可见进度。** 新增 `--auto-mode-pair-timeout-ms <N>`（默认值为 90000；低于 R-021 之前的硬编码值 120 秒，这是在对 v0.4 测试用例进行门控测量后的结果：使用 warm hermes3:8b 时，最小为 6.2 秒，中位数为 8.4 秒，最大为 8.8 秒 → 默认值为 90 秒，具有 ≥81 秒的余量）。新增 `--auto-mode-fall-through-after-n-timeouts <N>`（默认值为 5；连续失败阈值，用于自动启发式回退；成功的 `type:none` 分类会重置计数器）。相应的环境变量。每次调用时都会发出新的 stdout 开头行（`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`），始终可见，即使在非 TTY 环境下也能显示。强制发出的 stderr 回退触发事件会绕过 TTY 门控/`--progress`，因为操作员必须看到模式切换。当达到阈值时，会在 `contradictions.md` 中添加一个新的 `## Auto-mode fall-through` Markdown 代码块。启发式重新运行仅针对未处理的配对（LLM 不会对已完成的配对进行重复分类）。

### 架构说明

R-019 跨越 research-os ↔ ollama-intern-mcp 的边界。Research-os 将 `tier_budget_ms_override` 传递到 `ollama_extract` 架构中；ollama-intern-mcp v2.6.0 在内部限制处遵循该设置。管道已经存在；v2.6.0 提供了客户端入口点；v0.13.0 提供了 research-os 端客户端的连接。R-018 的 Promise.race 包装器被保留，因为它防止了正交故障模式（未解决的 Promise 导致程序挂起——包装器可以捕获这些问题；内部预算无法触及的结构化 `isError:true` 有效负载属于 R-019 的范畴）。

R-021 仅适用于 research-os。矛盾映射自动模式不通过 ollama-intern-mcp 进行路由——它直接调用 Ollama HTTP `/api/chat`。链中没有 MCP 传输；没有 `tier_budget_ms_override` 管道；也没有 R-018 包装器。在编写任何补丁代码之前，四项硬性规则启动协议捕获了 R-021 启动中的一个错误：启动时显示“MCP RPC 层”；阶段 A 读取阶段证实了这一点是错误的。

### 防御底线保持不变

R-019 + R-020（仅 D 版本）+ R-021 是操作员控制的添加项，而不是架构更改。R-002 到 R-018 的所有内容保持不变。`accepted_claim_floor` 仍然无法被修改。封闭枚举未更改（`FailureShape` 为 9；`RECOVERY_ACTIONS` 为 8；`REGENERATION_REASONS` 为 3；`PLANNER_TIMEOUT_SOURCES` 为 3；`POLICY_KEYWORDS` 为 8；`POLICY_RELEVANT_SOURCE_TYPES` 为 1）。AI 恢复顾问提示模板未更改。MCP 架构以累积方式扩展。R-010 回退原因正则表达式形状保持不变。

所有四个冻结包与 v0.3.3 基线进行字节级比较，结果完全相同——**连续第十八次发布**都保持了这一点。1542 → 1630 个 vitest 测试通过（增加了 88 个，分布在三个切片中；跳过了 4 个——实时重放测试受到 rig 环境变量的限制）。

### v0.13.0 不会声明以下内容：

- v1 的准备就绪。
- v0.5 操作员独立性门控判决。v0.5 在单独的会话中针对 `@mcptoolshop/research-os@0.13.0` 进行测试；v0.13.0 是最终化级别的先决条件，而不是证明。
- 可接受切片 1。取决于 v0.5 通过。
- 推迟的 v0.13.x 候选版本（F-2 R-009 audit↔extract 差异；F-3 cowork-handoff 停滞；F-4 R-017 POLICY_KEYWORDS 的狭隘性；A-1 + A-2 架构端发现已合并到 v0.5 门控支架准备中）。

有关完整发布条目的信息，请参阅 [CHANGELOG.md](CHANGELOG.md)。

## 之前：v0.12.1——合成规划器超时覆盖（路径 C 补丁）

v0.12.1 是在 v0.12.0 的基础上进行的一次单次修复补丁。它只发布了 R-018，这是一个研究操作系统侧的超时机制，用于处理合成文本 MCP `callTool` 调用。该机制由操作员可发现的 CLI 标志控制（`synth section` 和 `synth workspace` 中的 `--planner-timeout-ms <N>`）以及匹配的环境变量 (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`)。优先级：CLI 标志 > 环境变量 > 默认值 (15000 毫秒)。默认行为与 v0.12.0 完全一致。

此版本的发布是因为 v0.4 操作员独立性测试（针对 `@mcptoolshop/research-os@0.12.0`）返回了 **PASS_WITH_CONDITIONS，而不是授权级别** (`operator_aloneness_dst_v0.4`)。在实际负载下，v0.11 的防御基线保持稳定；所有六个 v0.12 覆盖恢复表面都触发并支持了操作员；密封信封覆盖达到了通过阈值（4/5 支持 + 1 必须包含的；2/3 支持 + 1 部分支持的审核者；0/3 陷阱；0/5 材料故障）。所有污染标记均为无害。唯一的失败模式是最终确定：合成文本可重复地在 ~15010 毫秒时触发 `TIER_TIMEOUT`，而即时层级的预算为 15 秒，并且没有记录的操作员覆盖。章节摘要符合信封要求；该包只是无法达到冻结状态。

**路径 C 处理方式**（在 v0.4 中获得的新的模式）：当会话 B 识别出单个命名的故障机制并具有明确的补丁路径，并且信封覆盖达到通过阈值，并且防御基线保持稳定，并且污染无害时，处理方式为——发布该补丁，针对已打补丁的版本重新运行相同的操作员路径，然后重新评估。无需重新编写信封。无需人工审核者。无需 v0.13 架构。

> **v0.4 证明了在章节摘要级别具有覆盖级研究操作系统。**
> **v0.12.1 必须通过消除单个规划器超时瓶颈来证明其最终确定能力，同时不能削弱防御基线。**

### 您可以运行的内容

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

`section-synthesis.json` 中存在活动预算表面（`planner_timeout_ms` 始终填充 + `planner_timeout_overridden_by` 仅在覆盖时才存在），ProseBlock 元数据以及 stderr（在生成文本之前输出 `[synth] planner_timeout_ms=N source=… section=<id>`）。`synth section --help` 文档说明了该标志、默认值、上限（600000 毫秒的安全阈值）和环境变量替代方案。无效值（负数、零、非数字、带有单位后缀的字符串、> 600000）会明确失败，并返回一个非零退出代码，其中包含表面 + 违规值。没有静默回退。

### 架构说明

v0.4 测试中使用的 15000 毫秒预算位于 `ollama-intern-mcp` 中（`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`），而不是研究操作系统。在 R-018 之前，研究操作系统不强制执行规划器超时——超时是在 ollama-intern-mcp 的层级策略中由服务器端触发的。R-018 的解决方案通过围绕 MCP `callTool` 的 `Promise.race` 包装器引入了研究操作系统对预算自身的控制权，默认值为实际观察到的即时层级数字（15000 毫秒），因此保留了默认行为。R-018 的包装器生成具有 `TIER_TIMEOUT` 形状的错误，这些错误与 R-010 的 `classifyFallbackCause` 正则表达式 (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`) 相匹配，从而保留了下游 AI 顾问在默认路径运行中对错误的可见性。

### 防御底线保持不变

R-018 是一个简单的操作员控制补丁，而不是架构更改。R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 均未更改。`accepted_claim_floor` 仍然无法被放弃。封闭枚举保持不变（`FailureShape` 为 9；`RECOVERY_ACTIONS` 为 8；`REGENERATION_REASONS` 为 3；`POLICY_KEYWORDS` 为 8；`POLICY_RELEVANT_SOURCE_TYPES` 为 1）。AI 恢复顾问提示模板未更改。MCP 架构未更改——`ollama-intern-mcp@^2.4.0` 继续使用。R-018 添加了 `PLANNER_TIMEOUT_SOURCES`（3）作为新的操作员记录词汇，与任何门控路由枚举不同。

针对所有四个冻结包的冻结包回归与 v0.3.3 基线完全一致——**连续第十六个版本**都保持了这一点。1542 → 1586 个 vitest 通过（+44 R-018 验收测试）。

### v0.12.1 不会声明以下内容：

- v1 就绪状态。
- v0.4 操作员独立性测试的重新运行结果。v0.4 将在单独的会话中针对 `@mcptoolshop/research-os@0.12.1` 运行；v0.12.1 是最终确定能力的前提条件，而不是证明。
- 可接受切片 1。取决于 v0.4 重新运行通过——v0.4 原则的阶梯式提升（防御级独立性已得到证明；覆盖级独立性在章节摘要级别上得到了实质性的证明；最终确定能力有待 v0.12.1）。
- v0.13 候选版本（F-2 R-009 审核↔提取差异；F-3 协同工作交接停滞；F-4 R-017 POLICY_KEYWORDS 狭隘性）。与最终确定无关。

有关完整发布条目的信息，请参阅 [CHANGELOG.md](CHANGELOG.md)。

## 之前：v0.12.0——覆盖恢复版本

v0.12.0 解决了 v0.3 操作员独立性测试中发现的问题，这些问题是在 2026-05-16 提出的（`operator_aloneness_dst_v0.3`，PASS_WITH_CONDITIONS 但不是授权级别）。六个命名的问题分布在四个切片中：三个架构修复，解决了 v0.4 阻止的覆盖差距（R-012、R-013、R-014），以及三个符合人体工程学方面的改进，以提高操作员表面，这是 v0.4 测试将要测试的内容（R-015、R-016、R-017）。v0.3 并非因为防御系统退化而失败——所有五个 v0.11 防御表面都完全按照设计触发，生成了干净且真实的合成结果，并且没有静默错误内容，并且该包在真实但狭窄的证据上冻结。它之所以失败，是因为相同的防御系统（工作正常）从可接受的主张基线中删除了承载主要来源的覆盖范围。在 v0.3 中获得的原则：

> **v0.11 使系统足够安全，可以避免静默错误合成。**
> **v0.12 提高了其在不削弱这些防御的情况下恢复覆盖的能力。**

论文：**保守的防御机制可以防止“静默错误”合成，但同时也可能导致系统缺乏必要的覆盖范围。** v0.12 版本旨在解决覆盖范围恢复问题。v0.11版本的防御底线保持不变——所有 R-007 到 R-011 的规则仍然有效。v0.12版本在此基础上增加了合法的、可验证的恢复路径。

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

### 三个架构修复（v0.4 阻止机制）

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

### 三个符合人体工程学的改进（v0.4 网关体验优化）

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

### 法律边界

保留了“包规则”的限制。`accepted_claim_floor` 仍然无法被修改。封闭的 `FailureShape` 枚举保持不变，值为九个。`RECOVERY_ACTIONS` 枚举也未更改，仍为八个值——没有新的顾问操作；R-014 的不同形状启发式方法扩大了现有操作的路由范围。AI 恢复顾问提示模板未进行修改（新的 `EvidenceState` 字段可以在持久化的 JSON 中观察到，但不会在提示中显示）。恢复验证规则未更改。MCP 架构未更改——`ollama-intern-mcp@^2.4.0` 版本继续使用；提取时没有改变 MCP 调用方式。R-017 的警告仅供参考，不影响网关判决、冻结收据或包的发布。所有 v0.10 + v0.11 版本的防御机制都已保留；防御底线就是底线，v0.12 版本在此基础上进行构建。

与 v0.3.3 基准版本相比，四个冻结包的回归测试结果完全一致——**这是连续第十五次发布**，结果保持如此（v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12）。

### v0.12.0 版本不包含以下内容

- v1 版本的准备。
- v0.4 操作者独立性网关判决。v0.4 版本在与 npm `@mcptoolshop/research-os@0.12.0` 的单独会话中运行。
- 可接受性切片 1。基于 v0.4 PASS 进行判断——v0.3 版本的规则（已证明的防御级独立性；尚未证明的覆盖范围级独立性）仍然是锁定的测试。
- 在云端研究工具方面的优势。
- 一个完整的、可信的审查员校准模型。

v0.12.0 版本是操作者独立性网关 v0.4 版本的先决条件，而不是证明。

请参阅 [CHANGELOG.md](CHANGELOG.md) 以及面向操作者的覆盖示例 [`examples/source-card-override.example.json`](examples/source-card-override.example.json)。

## 之前：v0.11.0 版本——第二次操作者独立性修复发布

v0.11.0 版本解决了 v0.2 操作者独立性网关失败条件：范围/边界修复对齐（R-007）、发现时 URL 相关性检查（R-008）、在提取和框架分析层进行配对的源内容污染防御（R-009 + R-011）以及恢复顾问回退原因可见性（R-010）。三层源内容保护机制（R-008 在准入时 + R-009 在提取时 + R-011 在框架分析时）在此版本中实现。请参阅 [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md)。

## 之前：v0.10.0 版本——操作者独立性修复发布

v0.10.0 版本解决了 2026-05-15 出现的 v0.1 操作者独立性网关失败条件（`operator_aloneness_dst_v0.1`，失败）：恢复路由对齐（R-002）、范围修复 CLI（R-001）、配对的源卡审计强化（R-003 + R-005）以及诚实收集状态（R-004）。请参阅 [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md)。

## 之前：v0.9.0 版本——产品构件弧线

v0.9.0 将 v0.8 版本的证据骨干转化为对操作者有用的构件：分段级别的文本合成（`synth section`）、部分包的合成（`synth pack --partial`）以及合法的恢复顾问（`recover pack`）。请参阅 [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md)。

## 之前：v0.8.0 版本——架构恢复

v0.8.0 将 research-os 重新连接到其声明的本地 LLM 子系统（`ollama-intern-mcp@^2.4.0`），用于提取信息；添加了基于框架的分段相关性强制执行；并为需要修复的包中的符合网关条件的片段添加了分段范围内的证据引用合成。请参阅 [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md)。

## 状态

**v0.11.0 — 第二次“独立操作者”修复版本发布** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.11.0`，日期：2026-05-15。v0.11.0 通过包含 5 个已命名的问题的 4 个修复环节，解决了 v0.2 “独立操作者”关卡失败的情况（`operator_aloneness_dst_v0.2`，PASS_WITH_CONDITIONS 在 2026-05-15 未达到授权级别）。**R-007**（范围/边界修复对齐）：`claim repair-scope --auto` 现在在修复时同时填充 `scope` 和 `not`，前提是两者都为 null——解决了 v0.2 循环问题，此前 v0.10 R-001 只填充了 `scope`，并且“声明分类”重新将已修复的声明归类为 `needs_scope_repair`。模板边界镜像范围模板的退化形状。仅追加日志现在记录 `applied_not` 以及 `applied_scope`。**R-008**（发现并防御幻觉 URL）：`discover run` 现在获取每个候选 URL 的 `<title>`（限制：64KB 响应体，5 秒超时，4 路并发），并针对“发现查询”计算确定性的关键词重叠度。每个候选结果都会获得一个 `relevance` 块（`verified | unverified | topic_mismatch`）；`approve --top N` 会隔离 `topic_mismatch`；操作者可以通过 `approve --candidate <id>` 进行覆盖。解决了 v0.2 的问题，当时 `llm-heuristic` 返回了 3 个真实的 PMC URL，指向完全不相关的癌症/生物化学/HIV-淋巴瘤论文。**R-009**（提取器身份保护）：新的来源卡严重程度 `source_identity_mismatch`（HARD FAIL），当提取器输出的 `card.title` 与获取到的 HTML `<title>` 不一致时触发。解决了 v0.2 的“老鼠和可乐定”混淆问题。重用了 R-008 的重叠辅助函数；可以通过 `clear_severities[]` 进行覆盖。**R-011**（框架批评器来源内容预检查）：新的框架排除原因 `source_content_mismatch`。框架批评器现在为每个来源计算一次来源内容签名，并在 LLM 批评器调用之前运行确定性的预检查；低于阈值时会直接跳过 LLM 调用，并标记 `frame_excluded: true`。解决了 v0.2 的问题，当时有 11 个基于癌症论文的声明，其 DST 框架文本被 LLM 批评器接受。**R-010**（恢复 MD 回退可见性）：新的 `FALLBACK_CAUSES` 关闭枚举（`tier_timeout | mcp_error | retry_exhausted`）+ 可选的 `FallbackTiming { elapsed_ms, budget_ms }`，位于 `prose_error` 元数据中；“为什么 AI 顾问回退”部分以及最重要的原因摘要已添加到恢复 MD 中。解决了 v0.2 中 JSON 中不可见的 TIER_TIMEOUT 问题。**现在已经完成了三层来源内容污染保护**（R-008 准入 + R-009 提取 + R-011 批评器），并且经过验证，各防御层之间相互独立。**需要 `ollama-intern-mcp@^2.4.0`**（与 v0.8.0 相同）。1448/1448 个 vitest 测试通过（从 1344 增加到 1448，整个修复环节增加了 104 个测试）。**所有四个冻结包都与 v0.3.3 基线完全一致**（连续发布第十一次）。**这不是 v1 版本。也不是 v0.3 “独立操作者”关卡判定的版本**——v0.3 在单独的会话中针对此 npm 版本运行。可接受性原则的工作取决于 v0.3 PASS。请参阅 [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.10.0 — “独立操作者”修复版本发布** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.10.0`，日期：2026-05-15。v0.10.0 通过 4 个修复环节解决了 v0.1 “独立操作者”关卡失败的情况（`operator_aloneness_dst_v0.1`，在 2026-05-15 上为 FAIL）。**R-001**（`research-os claim repair-scope <section> [--auto | --interactive]`）：新的 CLI 工具，用于修复从提取中获取的 `scope` 字段为空的声明；仅追加的 `evidence/claim-scope-repairs.jsonl` 日志；`RECOVERY_ACTIONS` 中的新 `repair_claim_scope` 操作（关闭枚举从 7 增加到 8）；当 ≥3 个声明处于 `needs_repair_claims` 中时，顾问将其作为 `accepted_claim_floor` 上的第一级结果呈现。**R-002**（恢复路由）：诊断层现在读取 `gate.json:blocking_reasons[]` 作为权威的路由表面，然后再回退到旧的 `failures[].check` 查找——关卡阻止信号优先于下游信号，例如 `source_card_classification_gap`。**R-003 + R-005**（来源卡审核强化，配对）：新的严重程度 `bot_check_or_captcha_detected`（HARD FAIL——复合信号：标记 + 响应体形状）和 `extraction_suspect_word_count_mismatch`（WARN AND QUARANTINE——响应体 ≤200 字且提取的字数 ≥800 字，并且比例 ≥4）。操作者可以通过 v0.4 覆盖日志模式中的新 `clear_severities[]` 字段进行覆盖。`research.yaml` 中的可选 `audit.severity_thresholds` 块，用于每个包的调整。**R-004**（诚实的 `gather_outcome`）：`FetchReceipt` 上的 5 值枚举（`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`）；v0.1 中令人困惑的短语“Failed (ok HTTP 200)”已消失。请参阅 [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.9.0 — 产品工件弧线** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.9.0`，发布日期：2026-05-14。v0.9.0 将 v0.8 的证据框架转化为对操作人员有用的工件。分节级别的文本合成 (`research-os synth section <id>`) 生成可读的 Markdown 文档，其中包含指向已接受的主张的段落级支持信息。部分包的合成 (`research-os synth pack --partial`) 使用分节文本（而非原始主张），并以结构化的理由形式披露排除的分节；确定性包规划器在包含 ≥2 个分节时，会预先选择所需的跨分节支持。合规恢复顾问 (`research-os recover pack`) 针对被阻止的分节生成操作人员指导，采用四层架构——确定性诊断 + 合规行动图 + AI 建议 + 验证器——具有三种顾问路径 (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) 和封闭枚举，用于表示九种故障类型和七种恢复操作。恢复指导嵌入在每个排除的分节的 `partial-pack-synthesis.{md,json}` 文件中，通过从规范恢复对象（独立版本和嵌入版本之间唯一的真理来源）进行紧凑投影来实现；一个区分联合体 `recovery_unavailable` 状态明确地显示了引擎故障情况（没有静默跳过）。冻结和发布语义未更改：可读的部分工件不会使不完整的包可以被冻结或发布。`accepted_claim_floor` 仍然不可修改；恢复顾问拒绝为无法修改的故障推荐 `apply_waiver`。**需要 `ollama-intern-mcp@^2.4.0`**（与 v0.8.0 相同）。1266/1266 个 vitest 测试通过（从 1013 增加到 1266，整个版本中增加了 253 个测试）。**所有四个冻结的包都与 v0.3.3 基准进行字节级别的验证**（连续发布的第六个版本）。**这不是 v1 版本。**v0.9.0 使工件层变为现实；v1 的准备工作、全新包的操作人员独立性、可信的审查模型以及云基准测试的成功，均未包含在本次发布中。请参阅 [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.8.0 — 架构恢复 + 基于框架的时效性** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.8.0`，发布日期：2026-05-12。v0.8.0 是一个架构恢复版本：research-os 现在使用 `ollama-intern-mcp@^2.4.0` 作为本地证据工作器子系统，用于提取主张（之前 README 中声明了该依赖项，但代码中存在内部的直接 Ollama 存根，绕过了它，从 v0.1 的框架开始——v0.8.0 解决了这个问题）。新增：MCP 客户端子系统 (`OLLAMA_INTERN_MCP_BIN` 环境变量 + PATH 发现 + StdioClientTransport 生命周期）；通过 `ollama_extract` 进行的每个主张的分节证据评估，采用 4 个标签模式（`supports_section` / `off_topic` / `background_only` / `source_chrome`）；新的 `ReviewDecision` 类型 `frame_excluded`（审查跳过对排除的主张进行 LLM 处理，并发出合成的 ClaimReview）；`ClaimSchema` 增加了 `frame_excluded` + `frame_exclusion_reason`（4 个值的枚举，包括用于系统状态故障的 `critic_unavailable`）+ `frame_exclusion_rationale`；通过 `synth section <id>` 进行的分节范围内的证据合成，用于在需要修复的包中的符合条件的分节（证据引用索引——主张 ID → 断言 → 证据摘录 → 来源 URL——而不是叙述性文本）；门控机制通过 `getEffectivePublisher` / `getEffectiveSourceType` 来尊重来源卡覆盖登记册（吸收了 v0.7.1 的目标）；`DEFAULT_WINDOW_CHARS` 默认值从 5000 更改为 3000（针对 hermes3:8b，在 `dev-rtx5080` 配置下，工作负载上下文为 8K）。对评估器调用的软失败策略进行了反转（任何 5 种故障模式——传输 / 解析 / 无效标签 / 空理由 / 超时——默认设置为 `frame_excluded: true`，理由为 `critic_unavailable`，而不是允许）；推广语义：`frame_excluded` 主张不会阻止分节的推广；协同工作切换界面将 `frame_excluded` 作为其自身的分组，与已接受/需要修复/拒绝的分组分开。**需要 `ollama-intern-mcp@^2.4.0`**。1013/1013 个 vitest 测试通过（从 901 增加到 1013，增加了 112 个测试）。**所有四个冻结的包都与 v0.3.3 基准进行字节级别的验证。** **这不是 v1 版本**——v1 的准备工作仍在继续；请参阅 [`docs/roadmap.md`](docs/roadmap.md)。请参阅 [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.7.0 — 犬试版集群强化** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.7.0`，发布日期：2026-05-11。针对 v0.6.0 版本进行了一轮包含四个阶段的犬试版测试（错误/安全、主动弹性、操作员人性化、演示优化）。v0.7.0 包含了以下强化内容：更安全的收集机制（每个 URL 的 try/catch + 每个异常的刷新，以保留部分失败时的源 ID）；具有弹性的索引器（对于格式错误的 JSONL，对每个记录/文件/部分进行跳过并发出警告）；结构化的恢复错误（12 个 ResearchOSError 子类，并提供手册中的相关链接）；进度反馈（`--no-progress`/`--progress` 标志，可在审查/收集/矛盾映射/打包发布过程中自动检测 TTY）；面向操作员的可操作性修复（`pack publish --force` 命令采用规范化的破坏性替换语句，该语句在 8 个界面上进行了回归测试；修复了 `IndexNotBuiltError` 命令文本中的拼写错误，并添加了命令文本注册测试；对 12 个 ResearchOSError 子类进行手册链接的补充）。901/901 个 vitest 测试通过（从 713 个增加到 901 个，增加了 188 个测试）。**所有四个冻结包都与 v0.3.3 基准版本进行了字节级别的验证。** **这不是 v1 版本** — v1 版本的准备工作仍在进行中；请参阅 [`docs/roadmap.md`](docs/roadmap.md) 和 [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md)。请参阅 [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) 和 [CHANGELOG.md](CHANGELOG.md)。

**v0.6.0** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.6.0`，发布日期：2026-05-10。v0.6.0 结束了实验 6，并提供了审查者信任的证据：research-os 现在可以生成可重现、可追溯的规范模型基准。包含以下内容：在生产审查路径上提供确定性的审查者选项（`review_profiles.<name>.reviewer_options` 在 `research.yaml` 中）；为 v0.3.3 之前的冻结工件提供网关模式向后兼容性（F-53）；审查输出直接在 `review.json` 和 `review.md` 上显示采样条件（F-54）；提交确定性的聚合结果（`hermes-two-pass-deterministic`，`temperature:0, seed:7`）。**没有可信的基准版本被接受。** `hermes-two-pass-deterministic=failed`（结构模型能力与决策词汇之间存在差距，而非差异）。**Hermes 没有被提升到 `trusted_baseline`。** 重点在于机制，而不是通过的结果。没有进行网关、冻结或合成规则的更改。所有四个冻结包都进行了字节级别的验证。713/713 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md)。

**v0.5.0** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.5.0`，发布日期：2026-05-10。v0.5.0 使审查者校准具有持久性。审查者配置文件不会因为只运行一次而被信任；它通过结构化的种子失败结果和多轮聚合来获得状态。包含以下内容：结构化的校准结果模式（`seeded-v1.{json,md}`，经过 Zod 验证，有四个状态标签）；多轮测试框架（`--runs <n>`，每个运行的隔离、基于中值的 PASS/FAIL 指标、重复失败的降级）；与架构相关的决策词汇指标；在 `review-promote` 中进行相对于包的接收结果查找。**没有可信的基准版本被接受：** `hermes-two-pass=failed`（聚合，3 轮运行），`mistral-nemo-two-pass=conditional_pass`，`hermes-single-pass=comparison_only`。research-os 现在可以在重复的种子失败不支持信任时拒绝信任审查者配置文件。**没有进行网关、冻结或合成规则的更改。所有四个冻结包都进行了字节级别的验证。** 671/671 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md)。

**v0.4.0** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.4.0`，发布日期：2026-05-10。v0.4.0 使源标识具有持久性。确定性的源类型规则处理可重复的多数情况，覆盖日志保留操作员在重新收集时的更正，并且 `source-card audit` 替换了临时脚本漂移检查，并提供了一个一流的 CLI 界面。包含以下内容：集中式源类型分类器（组件 B — `classifySourceType`，11 个规范供应商，`source-type-rules.json`）；源卡覆盖日志（组件 A — `source-card-overrides.jsonl`，`validate` + `list` 子命令）；以及源卡审核 CLI（组件 D — `research-os source-card audit --pack <dir>`，7 种发现类型，JSON + Markdown 工件，`--apply --from` 应用路径）。F-46 修复了外观问题：包清单现在会标记实时二进制版本，而不是在打包时冻结到 `research.yaml` 中的版本。**没有进行网关、冻结或合成规则的更改。所有四个现有的冻结包都进行了字节级别的验证。** 620/620 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [源卡审核手册页面](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/)。

**v0.3.3** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.3`，发布日期：2026-05-10。包含通过包 3（Godot 导出/运行时持久性，实验 3 的第 3 个包）获得的网关语义清晰度。网关输出现在携带与整个包范围计数一起的、按部分划分的发布者 + 主要计数（F-43）；`no_source_cluster_monopoly` 从 WARN 重命名为信息诊断（F-41）。**通过/失败行为未更改；现有的冻结包都进行了字节级别的验证。** 570/570 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)。

**v0.3.2** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.2`，发布日期为 2026 年 5 月 9 日。包含已归一化的已接受声明，用于处理 `pack publish` 的审核结果。将 `claim-reviews.jsonl` 和 `pack-audit.json::accepted_claims` 之间的严格相等性检查替换为有效的集合比较——已接受的声明是唯一的 `claim_id`，其最新的规范化审查决定为 `accepted_for_synthesis`（基于 `claim_id` 的最新决策优先）。对于旧版本审核计数与有效集合不同的冻结包，现在会发出警告而不是拒绝；旧版本的审核文件将按原样保留（法律 15），而存档清单将反映归一化的计数。对于虚假的 `claim_id`、不兼容的重复决策以及不符合合成条件的门控条件，仍然会严格拒绝。通过实验 3 XRPL 包会话 K 获得——在实际的关闭账本差异处拒绝了 `pack publish`（第 07 部分有 24 个原始的 `accepted_for_synthesis` 行，但由于审查窗口重叠，只有 19 个唯一的 `claim_id`）。558/558 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/pack-publish.md`](docs/pack-publish.md)。

**v0.3.1** — 发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.1`，发布日期为 2026 年 5 月 9 日。包含基于章节的来源豁免（`primary_source_waiver.section_waivers[]`），以及审查方确认，因此已豁免的整个章节范围内的 `source_cluster_monopoly` 发现将成为可见的警告，而不是自动将所有声明路由到 `needs_source_repair`。通过实验 3 XRPL 包会话 2 获得——规范协议章节（单一基础链、封闭花园 API 规范、标准机构文档）颠覆了发布者多样性是衡量真理质量的指标这一假设。之后，540/540 个 vitest 测试通过。请参阅 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)。

**基于章节的来源豁免** — 当发布者多样性在结构上与该章节的真理来源不兼容时使用，而不是仅当某个章节未能找到足够的来源时使用。强制执行模式的 `reason` + 非空 `compensating_controls[]`。包策略 `primary_source_waiver_allowed: false` 会阻止包级别和基于章节的豁免。旧版本 v0.3.1 的包级别 `min_independent_publishers: 0` 解决方法现在已弃用；现有的冻结包在现有收据下仍然有效。请参阅 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) 和 [research-packs 操作员手册](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)。

**v0.3.0** — 发布日期为 2026 年 5 月 9 日。在 `contradict map` 中添加了 `--detector <auto|heuristic|ollama-intern>` 标志（实验 3 会话 1，XRPL 包中的 F-09 链阻塞问题）。之后，527/527 个 vitest 测试通过。检测器选择现在是操作员的明确选择，而不是基于状态的环境变量操作；模式将在每次运行中以可见的方式进行声明。请参阅 [`docs/contradict-map.md`](docs/contradict-map.md)。

**v0.2.0** — 发布日期为 2026 年 5 月 9 日。添加了 `research-os pack publish`（实验 2）和模式 2 的就绪谓词修复。之后，515/515 个 vitest 测试通过。请参阅 [CHANGELOG.md](CHANGELOG.md)。冻结的包导出到规范的 `research-packs` 存档中，只需一个命令；审核合同由代码强制执行，而不是清单。请参阅 [`docs/pack-publish.md`](docs/pack-publish.md)。

**v0.1.0** — 内部测试包于 2026 年 5 月 8 日冻结。位于 `research-os-packs/research-os-spec/`（兄弟仓库）中的包，在 8 个章节中拥有 296 个已接受的声明，其中 17 个已确定结果、30 个由操作员覆盖、0 个处于活动修复阻塞状态、0 个未解决的矛盾，所有门控条件均为 `synthesis_eligible=true`。共有十六条关键法律。请参阅 [`docs/dogfood-proof.md`](docs/dogfood-proof.md)，了解七个发现和冻结收据指纹。

**research-packs 存档单仓库** — 位于 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)，包含四个包：`research-os-self-dogfood`（v0.1 内部测试回填，296 个已接受的声明，8 个章节）、`comfyui-workflow-durability`（实验 1，302 个已接受的声明，8 个章节）、`xrpl-creator-token-durability`（实验 3 包 #2）和 `godot-export-runtime-durability`（实验 3 包 #3）。所有包均通过 `verify-pack.mjs` 测试。

**v1 实验 1（ComfyUI 工作流持久性）** — 于 2026 年 5 月 9 日结束。所有 8 个章节位于终端 A，包已冻结，存档已上线。请参阅 [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) 和 [`docs/roadmap.md`](docs/roadmap.md)。

### research-os 不是什么（并且 v0.12.1 不声称是）：

- 未在新的软件包上进行“独立操作者”验证。v0.12.0 关闭了 v0.3 阶段的发现（已证明具有防御级别的独立性；尚未证明具有覆盖级别——在 v0.3 中获得的原则）；针对 v0.12.0 的 v0.4 阶段测试结果为“有条件通过”（不属于授权级别）——保留了最低防御标准，并在章节摘要级别实质性地证明了覆盖级别，最终确定时存在单一故障模式。v0.12.1 修复了该单一故障模式（R-018）。针对此 npm 发布版本的 v0.4 重复测试将在单独的会话中进行，并且是最终确定的前提条件。
- 除了内部测试阶段和四次“独立操作者”阶段测试之外，尚未由外部用户进行充分的实际测试。完成了六个内部测试实验——一个自引用，五个涉及外部领域（ComfyUI、XRPL、Godot、评审员校准、确定性评审员），以及 v0.1 / v0.2 / v0.3 / v0.4 “独立操作者”阶段测试，发现了 18 个已命名的发现（R-001 到 R-005 在 v0.10.0 中关闭，R-007 到 R-011 在 v0.11.0 中关闭，R-012 到 R-017 在 v0.12.0 中关闭，R-018 在 v0.12.1 中关闭）。大规模的外部操作者使用仍是未来的工作。
- 并非完整的软件包合成器。v0.12.1 继承了 v0.9 的章节范围（`synth section`）和部分软件包范围（`synth pack --partial`），每个范围都包含明确的软件包准备状态披露。完整的软件包合成仍然需要一个 `synthesis_ready` 软件包，以及通过 `synth workspace` 对已接受的声明 ID 进行的人工（或协同工作者）编写。
- 不认可任何评审员模型。v0.12.1 默认情况下不提供 `trusted_baseline` 评审员配置文件；校准记录是证据，而不是认可。现有的 v0.6.0 校准记录早于 v0.8.0 MCP 架构，并且尚未在 MCP 路径下重新进行基线测试。请参阅[评审员校准手册页面](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/)。
- 冻结的软件包中仍存在历史遗留问题。v0.4 之前的冻结软件包由于 v0.4 之前硬编码的脚手架常量，因此包含 `research_os_version: '0.1.0'`；该修复已在 v0.4.0 中实现，但较早的冻结软件包根据第 15 条规定是不可变的（请参阅[`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)）。受影响软件包内的 JSON 文件已经包含其当前的各个版本。
- 尚未在 npm 上进行来源证明。Sigstore 来源证明将推迟到未来的发布版本；通过软件包哈希值和 GitHub 发布提交来验证 v0.12.1 npm 软件包。
- 并非云端基线解决方案。v0.7.x 中的 `local-first-vs-cloud-research/` 产品演示表明，云端在可读性和操作者负担方面具有优势；v0.12.1 不声称这些优势已被克服。

### 已知限制

v0.12.1 包含三个从先前版本中延续的、对操作者可见的已知限制。每个限制都在[手册中的已知限制页面](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)和[CHANGELOG.md]中进行了记录。没有一个会阻止发布；所有这些都具有明确的恢复或缓解路径。

- **B-E-001 — v0.4 之前的冻结软件包版本戳是一个历史遗留问题。** 在 v0.3.3 到 v0.6.0 中发布的冻结软件包，由于 v0.4 之前硬编码的脚手架常量，因此在 `pack.manifest.json` 和 `pack/research.yaml` 中包含 `research_os_version: "0.1.0"`。该修复已在 v0.4.0 中实现（脚手架现在导入活动的 `RESEARCH_OS_VERSION`）；较早的冻结软件包根据第 15 条规定是不可变的。受影响软件包内的 JSON 文件已经包含其当前的各个版本。
- **B-E-004 — npm 来源证明将推迟到未来的发布版本。** v0.12.1 npm tarball 仅通过软件包哈希值进行验证。将发布流程迁移到带有 sigstore OIDC 的 CI 工作流与“先翻译后发布”原则（TranslateGemma 12B 本地运行）冲突；该迁移计划在未来的发布版本中进行。通过软件包哈希值和 GitHub 发布提交来验证 v0.12.1 npm 软件包。
- **B-A-003 — 索引模式版本迁移已记录，但未强制执行。** v0.12.1 提供了一个写入端的 `SCHEMA_VERSION` 整数，但没有读取端迁移运行程序。在记录的 `SCHEMA_VERSION` 更新时，请删除 `.research-os/index.sqlite` 并重新运行 `research-os index build --all`。软件包本身不受影响——索引是基于证据 + 声明（第 8 条）之上的加速层；重建操作是幂等的。

**v0.12.1 中未包含任何“受信任基线”评审员配置文件。** 这是一种有意的信任姿态，而不是一个差距：存储库中的校准记录（`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`）记录了证据。信任是通过重复的种子故障召回获得的，而不是假定的。这些记录早于 v0.8.0 MCP 架构，并且尚未在 MCP 路径下重新进行基线测试。

## v1.0 的路线图

v1.0 是一个通过努力获得的成果，而不是发布日期。所有六个内部测试实验（Exp1–Exp6，2026-05-08 到 2026-05-11）都已完成，每个实验都生成了一个冻结的研究软件包，并被纳入了[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)中。该阶段获得了 v0.2.0 `research-os pack publish` + 模式 2（实验 2）、v0.3.0 `--detector` 标志（F-09）、v0.3.1 基于章节范围的弃权（F-10/F-11）、v0.3.2 标准化的已接受声明核算（F-36）、v0.3.3 阶段语义清晰度（F-43/F-41）、v0.4.0 来源真实性原则（F-27/F-47/F-46）、v0.5.0 将评审员校准作为持久的信任契约（F-48/F-49/F-50）以及 v0.6.0 确定性评审员基线（F-53/F-54）。v1.0 发布准备工作正在通过多阶段的健康/优化流程中进行；架构锁定将贯穿始终。完整计划在[`docs/roadmap.md`](docs/roadmap.md)中。

## 许可证

MIT
