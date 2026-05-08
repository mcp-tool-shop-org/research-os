<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` 是一个本地优先的命令行工具，它将一个开放性的主题转化为一个结构化的**研究包**，在这个结构化的代码仓库中，Claude、Cowork或其他系统可以工作数小时，而不会出现幻觉或偏离研究方向。

## 它是什么

`research-os` 是“我想研究 X”和“一个经过验证、可追溯证据的基础”之间的控制层。它将发现线索与获取证据、原始提取与筛选后的论点、矛盾检测与矛盾解决、审查决策与综合结论等环节分开。每个步骤都会写入一个只追加的日志；每个准备就绪的判断都是基于这些日志计算得出的，而不是主观臆断。

它不是一个报告生成器。它不是一个大型语言模型（LLM）编排的**框架**。它不会为你自动生成综合结论。它强制执行在开始综合之前必须满足的条件。

**v0.1 版本** 仅被使用过一次：它本身被用于测试自身。这次测试发现了 `research-os` 中的七个正确性问题，并在本次**发布**之前都已修复。完整的验证过程——七个会话、两种集成模式、463 个 `vitest` 测试用例、一个冻结的**研究包**——都记录在 [`docs/dogfood-proof.md`](docs/dogfood-proof.md) 文件中。 详细指南：<https://mcp-tool-shop-org.github.io/research-os/handbook/>。

## 16 条核心原则

| # | 原则 |
|---|-----|
| 1 | 在获得原始数据之前，不能进行综合。 |
| 2 | 获取是证据；提取是解释。 |
| 3 | 模型可以解释原始数据的片段，但不能生成证据片段。 |
| 4 | 提取可能会产生过多的信息；综合不能简单地继承这些信息。 |
| 5 | 矛盾映射会暴露潜在的冲突，但它不会解决、综合或决定哪个论点更胜一筹。 |
| 6 | 闸门决定一个部分是否符合综合的条件。它们不进行综合，也不隐藏失败。 |
| 7 | 对抗性审查用于评估研究的完整性。它不进行综合，也不重写原始数据。 |
| 8 | 索引使研究结果可以被查询。它不创造新的事实，也不成为官方记录。 |
| 9 | Cowork 模式将研究结果转化为可操作的指令。它不创造事实，也不绕过闸门。 |
| 10 | 综合工作区用于组织 Cowork 模式中接受的研究结果。它不进行综合，也不绕过 Cowork 模式。 |
| 11 | **研究包**审计汇总现有的研究结果。它不创造新的事实，也不隐藏部分级别的证据。 |
| 12 | 发现阶段提出线索；只有获取阶段才能产生证据。 |
| 13 | 只有当经过测试证明其能够准确回忆时，审查者才会被信任。 |
| 14 | 论点的数量并不能代表研究的质量。在进行综合之前，必须对论点进行筛选。 |
| 15 | 冻结锁定已完成的研究结果。它不完成未完成的研究，也不将修复状态转化为证据。 |
| 16 | 豁免可以放宽对原始数据的限制，但不能制造证据。 |

**第 3 条原则**：大型语言模型（LLM）绝不能生成证据文本。`research-os` 构建了一个确定性的摘录日志（具有稳定 ID，例如 `ex_<source_id_hex>_001`）；大型语言模型选择摘录 ID；`research-os` 复制原始文本。 “释义作为引用”的错误类型在结构上是无法实现的。

**第 14 条原则**：在提取和审查之间，`research-os claim triage`（论点筛选）会去重、限制每个来源的贡献，并将低价值的候选论点放入待处理队列。 论点筛选不会修改 `claims.jsonl` 文件；待处理的论点仍然保留在原始日志中。

## v0.1 的工作流程链

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

每个步骤都是一个命令行指令。每个步骤都会写入只追加的记录。没有哪个步骤会合成、解决或创建新的事实——这些不变性是被强制执行的，而不是被信任的。审查环节会接受、拒绝或要求修复候选声明；“gate”会根据审查结果计算“synthesis_eligible”（合成资格）。“freeze”（冻结）是最终的完整性锁，只有当所有层都同意时，才会标记一个包为完成。请参阅[docs/dogfood-proof.md](docs/dogfood-proof.md)，了解v0.1版本的证明，该证明表明整个流程是端到端的。

这是一种替代 *搜索 → 摘要 → 精美报告* 的结构化方法。这个流程是最终产品。

## 安装

**要求：** Node.js ≥ 20。

```bash
# From source (v0.1.0 is not yet published to npm)
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link   # makes `research-os` available on your PATH
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
```

**要查看一个实际的示例，**请查看 `research-os-packs/research-os-spec/` 目录下的“dogfood”包——每个记录、每个凭证、每个处理结果、每个冻结指纹，都存储在只追加的日志文件中。该包生成了 `docs/dogfood-proof.md`。

**需要本地运行 [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp)**，用于LLM提取、分诊、审查和发现。默认模型是 `hermes3:8b`；可以使用 `OLLAMA_INTERN_MODEL=<模型>` 来覆盖。如果Ollama没有安装在默认的 `localhost:11434` 上，请设置 `OLLAMA_HOST`。

## 词汇表

| 术语 | 含义 |
|------|---------|
| `research-os` | 控制平面 / 命令行 / 闸门 / 编排规则 (此仓库) |
| `research-pack` | 用于一个研究项目的生成的仓库记录 |
| `research section` | 在某个包内部的有限的调查单元 |
| `research receipt` | 证明某个部分通过了源/声明/闸门检查 |

## 安全性

`research-os` 是一个本地优先的命令行工具。它在您指定的 research-pack 目录下读取和写入文件，并在使用 `gather` 命令时，会向您提供的源 URL 发送 HTTP 请求。它不会：运行服务器、接受入站连接、存储凭据或发送遥测数据。任何敏感信息都不会写入到包的记录中。请参阅 [SECURITY.md](SECURITY.md)，了解漏洞报告政策。

## 状态

**v0.1.0** — 冻结于 2026-05-08。`research-os-packs/research-os-spec/` (兄弟仓库) 中的“dogfood”包已完成冻结，共接受了 8 个部分中的 296 个声明，17 个已处理，30 个被操作员覆盖，0 个活动修复阻塞，0 个未解决的矛盾，所有闸门 `synthesis_eligible=true`。463/463 个 vitest 测试通过。共有 16 条关键规则。请参阅 [`docs/dogfood-proof.md`](docs/dogfood-proof.md)，了解 7 个发现和冻结凭证指纹。

### v0.1 的局限性

- 尚未经过外部用户的严格测试。在一次内部测试中发现了 7 个 bug。
- 尚未发布到 npm。在 `npm publish` 之前，请从源代码安装。
- 不是一个合成器。`synth workspace` 命令会生成结构化的工作区；人类（或 Cowork）会根据已接受的声明 ID 编写文本内容。
- 在语义版本控制下，API 稳定性尚未确定。v1.0.0 版本将在外部用户验证了该接口之后发布。

### 已知限制

- **提取器的来源信息在网关接缝处不可见。** 在校准后的提取器（配置了模型的 Ollama）不可用时，某些部分可能会通过“可接受声明”的阈值，但这依赖于启发式方法的备用方案。这被记录为已知的弱点；未来的改进将报告提取器提供的“可接受声明”数量，并要求校准路径必须达到阈值所需的“可接受声明”数量。
- **关于超出校准的 `hermes-two-pass` 基准线的评审模型选择问题尚未解决。** 内部测试验证了一种评审模型配置；其他模型需要在被信任之前，进行独立的、基于预设失败情况的校准。
- **内部测试使用的提取模型是 `mistral-nemo:12b`（默认配置是 `hermes3:8b`）。** 在发现过程中，系统会产生与当前主题不相关的错误结果，针对自指部分名称的问题，通过查询精度控制（参见手册）以及操作员预先设置的 URL 来进行修正，以解决模糊主题的问题。

## 许可证

MIT
