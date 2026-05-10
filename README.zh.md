<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.3.2"><img src="https://img.shields.io/badge/version-0.3.2-blue" alt="version 0.3.2"></a>
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

已冻结的研究包被归档在 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) 仓库中，其中包含两个初始版本。请参阅 [`docs/roadmap.md`](docs/roadmap.md) 以了解 v1.0 的发展路线图。

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

## 状态

**v0.3.2** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.2`，发布日期为 2026年5月9日。该版本对已接受的声明进行了标准化处理，考虑了 `pack publish` 的准入情况。 严格的 `claim-reviews.jsonl` 文件与 `pack-audit.json::accepted_claims` 之间的相等性检查已被替换为集合比较——已接受的声明是具有唯一 `claim_id`，且其最新的规范审查决定为 `accepted_for_synthesis`（每个 `claim_id`，最新决定优先）。 对于那些其历史审计计数与集合比较结果不同的已冻结的包，现在会发出警告而不是拒绝； 原始的审计文件将被完整保留（第15条），而归档清单会反映标准化后的计数。 对于虚构的 `claim_id`、不兼容的重复决策以及不符合合成条件的场景，仍然会拒绝。 这是通过实验 3 XRPL pack Session K 获得的，该实验在实际的账本边界不一致时，`pack publish` 被拒绝（第07部分有24行原始的 `accepted_for_synthesis` 数据，但由于审查员窗口的重叠，只有19个唯一的 `claim_id`）。 558/558 个 vitest 测试通过。 详情请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/pack-publish.md`](docs/pack-publish.md)。

**v0.3.1** — 已发布到 npm，版本号为 `@mcptoolshop/research-os@0.3.1`，发布日期：2026-05-09。 包含按章节划分的来源豁免 (`primary_source_waiver.section_waivers[]`)，以及审查人员的确认，因此，如果某个章节的“来源垄断”被豁免，则该豁免会成为一个可见的提示，而不是自动将所有主张都标记为“需要修复来源”。 这是通过实验 3 XRPL 包的第二阶段实现的——针对“标准协议”部分的分析（包括单链、封闭式 API 规范和标准机构文档）推翻了“发布者多样性是衡量真理质量的指标”的假设。 540/540 个 vitest 测试通过。 请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)。

**按章节划分的来源豁免**：当发布者多样性与该章节的真理来源结构上不兼容时，才使用这些豁免，而不是仅仅因为某个章节未能找到足够的来源。 豁免必须包含经过模式验证的 `reason`（原因）以及非空 `compensating_controls[]`（补偿控制）。 包策略 `primary_source_waiver_allowed: false` 会阻止包级别和章节级别的豁免。 之前的 v0.3.1 版本中，包级别的 `min_independent_publishers: 0` 是一种解决方法，现在已弃用；现有的已冻结的包仍然在现有记录下有效。 请参阅 [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) 和 [research-packs 操作手册](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)。

**v0.3.0** — 发布于 2026-05-09。 针对 `contradict map`，发布了 `--detector <auto|heuristic|ollama-intern>` 标志（来自 Experiment 3 Session 1，XRPL pack 的 F-09 chain-blocker 修复）。 此时，527/527 个 vitest 测试通过。 检测器的选择现在是明确的操作员选择，而不是依赖于状态的环境变量；模式会在每次运行时显式显示。 参见 [`docs/contradict-map.md`](docs/contradict-map.md)。

**v0.2.0** — 发布于 2026-05-09。 发布了 `research-os pack publish`（Experiment 2）以及 Pattern 2 的就绪谓词修复。 此时，515/515 个 vitest 测试通过。 参见 [CHANGELOG.md](CHANGELOG.md)。 冻结的软件包导出到标准的 `research-packs` 归档，只需一个命令即可完成； 许可协议由代码强制执行，而不是检查清单。 参见 [`docs/pack-publish.md`](docs/pack-publish.md)。

**v0.1.0** — 2026-05-08 冻结了内部测试软件包。 位于 `research-os-packs/research-os-spec/`（兄弟仓库）的软件包已冻结，共包含 8 个部分，有 296 个已接受的声明，17 个已处理，30 个被操作员覆盖，0 个活动修复阻止器，0 个未解决的矛盾，所有条件 `synthesis_eligible=true`。 共有 16 条关键规则。 参见 [`docs/dogfood-proof.md`](docs/dogfood-proof.md)，其中包含七个发现和冻结确认的指纹。

**research-packs 归档单库** — 位于 [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)，包含两个初始软件包。 `comfyui-workflow-durability`（Experiment 1，302 个已接受的声明，8 个部分）和 `research-os-self-dogfood`（v0.1 内部测试回填，296 个已接受的声明，8 个部分）。 这两个软件包都通过了 `verify-pack.mjs` 测试。

**v1 Experiment 1 (ComfyUI 工作流程的稳定性)** — 已于 2026-05-09 结束。 终端 A 的所有 8 个部分已完成，软件包已冻结，归档已上线。 参见 [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) 和 [`docs/roadmap.md`](docs/roadmap.md)。

### v0.3 的局限性

- 尚未经过外部用户的实际测试。 两个内部测试阶段已结束，一个为自指代，一个为外部领域，实验 3（在外部压力下的 API 稳定性）正在进行中：3个包中的第2个包（XRPL 创建者令牌的持久性）已冻结，包含来自 7 个部分的总计 251 个已接受的声明，等待通过 npm v0.3.2 的 `pack publish` 准入。 该阶段已经获得了 v0.3.0 的 `--detector` 标志（F-09 链阻塞器）、v0.3.1 的部分范围的源代码豁免（F-10/F-11 规范协议压力）以及 v0.3.2 的标准化已接受声明处理（F-36 账本边界）。 还需要一个外部领域的包才能完成实验 3。
- 不是合成内容生成器。 `synth workspace` 命令用于生成结构化的工作空间； 人类（或 Cowork）根据已接受的声明 ID 编写内容。
- 在语义版本控制下，API 稳定性尚未实现。 v1.0.0 是一个需要实现的阶段，而不是一个日历日期； 详情请参阅 [`docs/roadmap.md`](docs/roadmap.md)，其中列出了用于弥补差距的六个实验。

### 已知的局限性

- **提取器的来源信息在接口处不可见。** 一个部分可以满足已接受声明的最低要求，同时依赖于启发式回退声明，当经过校准的提取器（配置了模型的 Ollama）不可用时。 这已记录为路线图中的 Experiment 4； 未来的改进将报告每个提取器的已接受声明，并要求满足接口要求的已接受声明数量来自校准路径。
- **超出经过校准的 `hermes-two-pass` 基线的审查器模型选择尚未解决。** 内部测试阶段验证了一种审查器配置； 其他模型需要在它们被信任之前，进行种子失败召回校准。 这是路线图中的 Experiment 5。
- **v0.1 内部测试软件包使用了 `mistral-nemo:12b` 进行提取（标准的默认配置是 `hermes3:8b`）。** 在 v0.1 阶段，此设备上不可用 `hermes3:8b`。 此替代方案的说明将持续有效，直到生成基于 hermes3 的确认——这是路线图中的 Experiment 6。 对于在没有 `hermes3:8b` 的设备上的操作员，请将 `OLLAMA_INTERN_MODEL` 设置为可用的模型； 操作员预配置的 URL 和查询精度规范（参见手册）可以减轻对模糊主题的幻觉。

## 通往 v1.0 的路线图

v1.0 是一个需要达成的状态，而不是一个发布日期。在 v0.1 和 v1.0 之间，有六个正在进行的实验。这些实验包括：非自指的内部测试版本（目前正在进行中的 ComfyUI 工作流程稳定性包）、一个 `research-os pack publish` 命令，该命令可以自动将内容导出到标准的 `research-packs` 单仓库（实验 2，其范围受实验 1 的手动关闭影响）、在外部压力下的 API 稳定性、弥补提取器溯源方面的差距、将评审员校准推广到 `hermes-two-pass` 之外，以及在 `hermes3:8b` 上进行的干净基准测试。实验 1 在打包完成时尚未结束——它会在打包版本作为 `research-packs` 单仓库中的第一个软件包发布时完成，同时也会发布 v0.1 的内部测试版本补丁。完整计划请参见 [`docs/roadmap.md`](docs/roadmap.md)。整个过程中，架构保持不变；v1.0 旨在深化 v0.1 已经证明的内容，而不是重新开启新的方向。

## 许可证

MIT
