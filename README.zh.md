<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v1.0.0"><img src="https://img.shields.io/badge/version-1.0.0-blue" alt="version 1.0.0"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

`research-os` 是一个本地优先的命令行工具，它将一个开放式的主题转化为一个结构化的 **研究包**，在这个结构化的代码仓库中，Claude、Cowork 或其他工具可以在不产生幻觉或歪曲研究结果的情况下工作数小时。

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

**需要本地运行 [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp)**，用于 LLM 的提取、筛选、审查和发现。默认模型是 `hermes3:8b`；可以使用 `OLLAMA_INTERN_MODEL=<model>` 进行覆盖。如果 Ollama 不在默认的 `localhost:11434` 地址上，请设置 `OLLAMA_HOST`。

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

## 状态

**v1.0.0** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@1.0.0`，发布日期：2026-05-11。v1.0.0 是一个可靠的合约发布版本：工作流程已验证，潜在的故障模式已公开，并且合成过程仍然需要基于证据的验证。**research-os 默认情况下不包含任何经过信任验证的审查模型。** 它提供了用于验证、拒绝或有条件地接受审查者配置的机制。包含：四阶段的内部测试（阶段 A：错误/安全问题，B：主动增强鲁棒性，C：优化操作人员体验，D：完善界面），产生了 188 个新的测试用例，覆盖了 23 个生产代码文件，以及 14 个文档/网站文件，以及 2 个新的辅助模块 (`src/cli/help-topics.ts` 和 `src/util/progress.ts`)；跨域数据传输规范已编码，基于两次纠正后的数据传输（A-RE-001：调用方迁移，C2-RE-001：跨域数据接收）；`--force` 参数的用法在 8 个方面都进行了逐字节的回归测试；对 12 个 `ResearchOSError` 子类进行了错误处理手册的更新；`research-os help <topic>` 提供了静态的错误恢复界面（4 个主题已锁定）；`--no-progress` / `--progress` 参数实现了在审查、收集、冲突映射和打包发布过程中，基于 TTY 终端检测的线程控制，并使用了互斥锁机制。**不接受任何经过信任验证的基线版本。** **所有四个冻结版本的软件包都与 v0.3.3 的基线版本进行逐字节的验证。** 901/901 个 vitest 测试通过。 已知的限制请参考 [CHANGELOG.md](CHANGELOG.md) 和 [`handbook/known-limitations.md`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)：冻结版本的版本戳是一个历史遗留的配置（B-E-001），npm provenance 验证推迟到 v1.x 版本（B-E-004），索引模式版本迁移是基于公开的，而不是自动迁移（B-A-003）。请参考 [`docs/release-notes/v1.0.0.md`](docs/release-notes/v1.0.0.md) 和 [`docs/v1-dogfood-swarm-proof.md`](docs/v1-dogfood-swarm-proof.md)。

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

### v0.3 的局限性

- 未经外部用户的大规模测试，仅在内部测试阶段使用。六个内部测试项目已结束，其中一个涉及自我引用，五个涉及外部领域（ComfyUI、XRPL、Godot、评审员校准、确定性评审员），但外部用户的规模化使用仍有待进一步研究。
- 并非内容生成器。`synth workspace` 命令用于生成结构化的工作空间；人类（或 Cowork）根据已接受的声明 ID 编写内容。
- 不代表对任何评审模型的认可。v1.0 版本默认不包含预设的“可信基准”评审员配置文件；校准记录是证据，而非认可。请参阅[评审员校准手册页面](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/)。
- 冻结包中可能存在历史遗留信息。在 v1.0 之前的冻结包包含 `research_os_version: '0.1.0'`，这是由于一个在 v0.4 之前的构建模板。该问题已修复，但历史版本的包在第 15 条规定的条件下是不可变的（参见 [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)）。
- npm 上的来源信息未进行验证。Sigstore 来源验证将在 v1.x 版本中实现；请通过 package-shasum 和 GitHub 发布提交来验证 v1.0 版本的 npm 包。

### 已知的局限性

v1.0 版本包含三个用户可见的已知限制。每个限制都记录在[手册中的已知限制页面](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)以及[CHANGELOG.md](CHANGELOG.md) 中。没有一个限制会阻止发布；所有限制都有明确的恢复或缓解方案。

- **B-E-001 — v1.0 之前的冻结包版本信息是历史遗留信息。** 在 v0.3.3 到 v0.6.0 之间发布的冻结包，在 `pack.manifest.json` 和 `pack/research.yaml` 文件中包含 `research_os_version: "0.1.0"`，这是由于一个在 v0.4 之前的硬编码构建模板常量。该问题已在 v1.0 版本中修复（构建模板现在导入实时 `RESEARCH_OS_VERSION`）；现有的冻结包在第 15 条规定的条件下是不可变的。受影响的包中的 JSON 文件已经包含其对应的版本信息。
- **B-E-004 — npm 来源验证将在 v1.x 版本中实现。** v1.0 版本的 npm tarball 仅通过 package-shasum 进行验证。将发布流程迁移到具有 sigstore OIDC 的 CI 工作流，与“发布前翻译”的原则（TranslateGemma 12B 在本地运行）存在冲突；该迁移计划在 v1.x 版本中进行。请通过 package-shasum 和 GitHub 发布提交来验证 v1.0 版本的 npm 包。
- **B-A-003 — 索引器模式版本迁移已记录，但未强制执行。** v1.0 版本包含一个写入端的 `SCHEMA_VERSION` 整数，但没有读取端的迁移运行器。当 `SCHEMA_VERSION` 发生记录中的更改时，请删除 `.research-os/index.sqlite` 文件，然后重新运行 `research-os index build --all` 命令。这不会影响包本身——索引器是证据 + 声明的加速层（第 8 条）；重建操作是幂等的。

**v1.0 版本不包含任何预设的“可信基准”评审员配置文件。** 这是一种有意的信任策略，而不是一个缺陷：存储在仓库中的校准记录（`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`）记录了相关证据。信任是通过反复的、有针对性的失败测试来获得的，而不是默认信任。

## 通往 v1.0 的路线图

v1.0 并非一个发布日期，而是一个达成的状态。所有六个内部测试环节都已经完成（Exp1–Exp6，时间为2026年5月8日至2026年5月11日），每个环节都产出了一个已冻结的研究包，并被提交到 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) 仓库。该项目通过以下阶段达成了v0.2.0版本：`research-os pack publish` + 模式2（实验2），v0.3.0版本的`--detector`参数（F-09），v0.3.1版本的范围限定豁免（F-10/F-11），v0.3.2版本的标准化已批准声明处理（F-36），v0.3.3版本的门控语义清晰化（F-43/F-41），v0.4.0版本的源数据纪律（F-27/F-47/F-46），v0.5.0版本的评审员校准，作为一种持久的信任协议（F-48/F-49/F-50），以及v0.6.0版本的确定性评审员基线（F-53/F-54）。v1.0版本的发布准备工作正在进行中，通过一个多阶段的健康检查/优化流程，并且整个过程中架构锁定始终有效。完整计划请参考 [`docs/roadmap.md`](docs/roadmap.md)。

## 许可证

MIT
