<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.11.0"><img src="https://img.shields.io/badge/version-0.11.0-blue" alt="version 0.11.0"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

`research-os`は、生成されたドキュメントを、検証可能な証拠の集合として保存するツールです。これにより、元の情報源を保持し、主張と分析を分離し、段階的な検証プロセスを強制し、レビュー担当者および免責事項の決定を記録し、主張が追跡および検証可能なパッケージとして公開されます。

このツールは、モデル自体を信頼することを要求しません。モデル、情報源、および分析が信頼に値するかどうかを判断するための仕組みを提供します。

## 概要

`research-os`は、「Xについて調査したい」という意図と、検証可能な証拠に基づいた成果物との間の制御システムです。これは、調査のヒントと証拠の収集、生の抽出と検証済みの主張、矛盾の検出と解決、そしてレビューの判断と統合の準備状況を分離します。各ステップは、追記のみ可能なログに記録され、すべての準備完了の判断は、これらのログに基づいて計算され、断定的に主張されるものではありません。

これはレポート生成ツールではありません。また、LLMのオーケストレーションのフレームワークでもありません。あなたの統合作業を自動化するものでもありません。`research-os`は、統合作業を開始するための条件を強制します。

Frozen packsは、[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)にアーカイブされており、現在利用可能です。これには、6つのクローズドな内部テスト（dogfood）実験の4つのパッケージが含まれています。v1.0へのロードマップについては、[`docs/roadmap.md`](docs/roadmap.md)を参照してください。

v0.1は、2つの内部テスト（dogfood）で検証されました。最初のテストでは、research-os自体の仕様を調査した結果、v0.1.0のリリース前に7つの問題点が発見され、それぞれにコード修正が必要となり、新たなルールや統合パターンが導入されました。2番目のテスト（v1 Experiment 1：ComfyUIワークフローの安定性、11セッション、research-osとの語彙の重複がない環境）は、2026年5月9日に完了し、パッケージが凍結され、アーカイブが公開され、パターン2の適用がコミット`22b5dba`によって完了しました。v0.1の検証結果は、[`docs/dogfood-proof.md`](docs/dogfood-proof.md)に、Experiment 1の検証結果は、[`docs/experiment-1-proof.md`](docs/experiment-1-proof.md)に記載されています。ハンドブックは、<https://mcp-tool-shop-org.github.io/research-os/handbook/>で確認できます。

## インストール

**必要条件:** Node.js ≥ 20

```bash
npm install -g @mcptoolshop/research-os
```

ソースコードからビルドする場合：

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## クイックスタート

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

> **`freeze`コマンドの出力に関する注意点:** `research-os freeze`コマンドは、すべてのアーティファクトを処理し、コンテンツハッシュを計算する際に、通常は何も表示せずに動作します。このコマンドは、大きなパッケージの場合、何も出力しない状態で数十秒かかることがあります。完了すると、単一の判定ブロック（`PASS`または`REFUSED`と、レシートのパス）が表示されます。この間隔をハングアップと解釈しないでください。

> **`--force`オプションに関する警告:** `--force`オプションは、ターゲットのパッケージディレクトリをクリアし、置き換えます。生成されたパッケージの出力内に、手動で作成したファイルを保存しないでください。代わりに、アップストリームのアーティファクト（クレーム、ソース、合成）または関連ファイルを編集してください。完全な利用規約と拒否のケースについては、[`docs/pack-publish.md`](docs/pack-publish.md)を参照してください。

**具体的な使用例**については、`research-os-packs/research-os-spec/` にある「dogfood」と呼ばれるパッケージを参照してください。このパッケージには、すべてのファイル、すべての記録、すべての処理結果、すべての固定状態のフィンガープリントなどが、追記のみ可能なファイルとして保存されています。このパッケージによって、`docs/dogfood-proof.md` が生成されました。

**ローカルで [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) が必要**。これは、LLMの抽出、分類、レビュー、および発見に使用されます。MCPサーバーは、`OLLAMA_INTERN_MCP_BIN`環境変数またはPATHから検出されます。デフォルトのモデルは `hermes3:8b` です。必要に応じて、`OLLAMA_INTERN_MODEL=<モデル名>` (または、コマンドラインオプション `--model <モデル名>`) で上書きできます。Ollamaがデフォルトの `localhost:11434` にない場合は、`OLLAMA_HOST` を設定してください。

## 16の重要な原則

| # | 原則 |
|---|-----|
| 1 | ソースの真実が確立される前に、統合作業は行われない。 |
| 2 | 証拠の収集は事実の取得であり、抽出は解釈である。 |
| 3 | モデルはソースの範囲を解釈できるが、証拠の範囲を生成することはできない。 |
| 4 | 抽出は過剰な情報を生み出す可能性があるが、統合作業は必ずしもそのすべてを受け入れるわけではない。 |
| 5 | 矛盾の検出は、対立を表面化させるだけであり、解決したり、統合したり、どの主張が正しいかを判断したりするものではない。 |
| 6 | ゲートは、セクションが統合作業の対象となるかどうかを判断する。統合作業を行うわけでも、失敗を隠すわけでもない。 |
| 7 | レビューは、研究の信頼性を評価する。統合作業を行うわけでも、ソースの真実を書き換えるわけでもない。 |
| 8 | インデックスを作成することで、研究の真実を検索可能にする。新しい真実を作成するわけでも、公式記録となるわけでもない。 |
| 9 | Coworkへの引き継ぎは、研究の真実に基づいて運用手順を提供する。真実を作成するわけでも、ゲートを回避するわけでもない。 |
| 10 | 統合作業のワークスペースは、Coworkのために受け入れられた研究の真実を整理する。統合作業を行うわけでも、引き継ぎプロセスを回避するわけでもない。 |
| 11 | リポジトリの監査は、既存の研究の真実をまとめる。新しい真実を作成するわけでも、セクションレベルの証拠を隠すわけでもない。 |
| 12 | 調査は、可能性のあるヒントを提案する。証拠を生み出すのは、収集作業だけである。 |
| 13 | レビュー担当者は、誤りを検出できるまで信頼されない。 |
| 14 | 主張の数が多いからといって、それが研究の質が高いとは限らない。主張は、統合作業の対象となる前に、検証される必要がある。 |
| 15 | 固定（Freeze）は、完了した研究の真実を保護する。未完了の研究を完了させるわけでも、修正状態を証拠として扱うわけでもない。 |
| 16 | 制限の緩和は、ソースの制約を緩和するだけであり、証拠を捏造することはできない。 |

**原則3**：LLMは、証拠となるテキストを生成しない。`research-os`は、決定論的な抽出ログ（`ex_<source_id_hex>_001`のような安定したID）を構築する。LLMは、抽出IDを選択するだけで、`research-os`が元のテキストをコピーする。したがって、「言い換えを引用として使用する」という誤りは、構造的に不可能な。

**原則14**：抽出とレビューの間に、`research-os claim triage`は、重複を排除し、ソースごとの貢献量を制限し、重要度の低い候補を一時的に保留する。このトリエイジプロセスは、`claims.jsonl`を直接変更するものではなく、保留された主張は、元のログに保持される。

## v0.1のワークフローの概要

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

各ステップはCLIコマンドです。各ステップは、追記のみ可能なファイルに書き込みます。どのステップも、新しい情報を生成したり、解決したり、作成したりすることはありません。これらの制約は、信頼するのではなく、強制されます。レビューでは、候補となる主張に対して、承認/拒否/修正依頼が行われます。そして、そのレビュー結果に基づいて、`synthesis_eligible`（合成可能かどうか）が計算されます。最後に、すべてのレイヤーが合意した場合にのみ、処理が完了とみなされる「freeze」（固定）という最終的な整合性チェックがあります。詳細については、[docs/dogfood-proof.md](docs/dogfood-proof.md) を参照してください。このドキュメントには、このプロセス全体が正常に機能することを示す検証結果が記載されています。

これは、*検索 → 要約 → 報告書作成* という従来のプロセスに対する構造的な代替手段です。このプロセス全体が「チェーン」として機能し、その結果が製品となります。

## 用語集

| 用語 | 意味 |
|------|---------|
| `research-os` | 制御システム / CLI / ゲート / 動作ルール (このリポジトリ) |
| `research-pack` | 研究プロジェクトの結果として生成されるリポジトリのファイル |
| `research section` | パッケージ内の調査対象となる範囲 |
| `research receipt` | 特定のセクションが、ソースコード、主張、およびゲートのチェックを通過したことを示す証拠 |

## セキュリティ

`research-os` は、ローカル環境で動作するCLIです。このツールは、指定された研究パッケージのディレクトリ内のファイルを読み書きし、`gather` コマンドを使用する場合、提供されたソースコードのURLから情報を取得するために、HTTPリクエストを送信します。このツールは、サーバーを起動したり、外部からの接続を受け付けたり、認証情報を保存したり、テレメトリデータを送信したりすることはありません。また、機密情報はパッケージのファイルに書き込まれません。脆弱性に関する報告については、[SECURITY.md](SECURITY.md) を参照してください。

## レビュー担当者のキャリブレーション

v0.5.0では、レビュー担当者のキャリブレーションがより堅牢になりました。レビュー担当者のプロファイルは、単に一度実行されたというだけで信頼されるわけではありません。構造化された意図的なエラーの記録と、複数回の実行による集計によって、信頼度を獲得します。v0.6.0では、本番環境のレビュープロセスとキャリブレーション環境に、再現性のあるレビュー担当者オプションが追加されました。

**現在、どのプロファイルも`trusted_baseline`として認められていません。** リポジトリ内の標準的な記録には、`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`と記載されています。これは意図的なものです。信頼は、仮定ではなく、繰り返しの検証による証拠によって獲得されます。`hermes-two-pass-deterministic`の記録には、構造的なモデルの能力ギャップ（6種類の判断のうち2種類しか生成できない。3種類が必要）があり、これはばらつきの問題ではありません。

キャリブレーションの記録は、`calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`に保存されています。各記録は、7つの項目に対するPASS/FAILの結果、4つのステータスラベル（`trusted_baseline`、`conditional_pass`、`failed`、`comparison_only`）、および、テストできない内容を正直に開示しています（`needs_contradiction_mapping`は`seeded-v1`からはアクセスできません）。詳細は[CHANGELOG.md](CHANGELOG.md)を参照してください。

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

`--runs <n>`オプションを使用すると、各実行の記録が`<profile>/runs/run-NNN.json`に書き込まれ、集計された記録（中央値に基づいた項目と、再発するエラーの検出を含む）が`<profile>/seeded-v1.{json,md}`に書き込まれます。集計された記録には、`receipt_kind: 'aggregate'`という情報が含まれており、これにより単一実行の記録と区別できます。単一実行モード（`--runs 1`または省略）では、既存の直接書き込みの動作が維持されます。

**再現性のあるレビュー担当者プロファイル** — `research.yaml`の`review_profiles.<name>.reviewer_options`を使用して、`temperature`、`seed`、およびその他のOllamaのサンプリングパラメータを、本番環境のレビュープロセスにおけるすべての`OllamaInternReviewer`の構築に適用します。`hermes-two-pass-deterministic`プロファイルは、組み込みのサンプルとして提供されています。詳細は[`docs/experiment-6-proof.md`](docs/experiment-6-proof.md)と、[レビュー担当者キャリブレーションハンドブック](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/)を参照してください。

## 新機能 v0.11.0 — オペレーター単独運用対応の改善リリース（第2弾）

v0.11.0では、2026年5月15日に発生したv0.2のオペレーター単独運用におけるエラー条件を修正します (`operator_aloneness_dst_v0.2`)。この修正には、スコープ/境界の調整 (R-007)、発見時のURLの関連性チェック (R-008)、抽出およびフレーム評価層におけるペアリングされたソースコンテンツの防御 (R-009 + R-011)、およびアドバイザーのフォールバック原因の可視化 (R-010) の4つの改善が含まれます。v0.2では、3つの独立した汚染経路がv0.10.0の防御を突破したため、認証に失敗しました。具体的には、`repair-scope --auto` コマンドが `scope` を設定しましたが、`not` が null のままだったため、トリエイジによってクレームが `needs_scope_repair` として再分類されました。また、`llm-heuristic` が、実際には関連性のないPMCのURLを高い信頼度を持つ候補として提示し、抽出器とフレーム評価の組み合わせが、DST形式のテキストを含む11件の癌関連論文からのクレームを許可してしまいました。設計された防御機能のうち、`accept-floor` のみが構造的に有効でしたが、v0.11.0ではこれらの問題を修正し、v0.3のゲートがオペレーターの実行に対して正常に機能するようにします。

### 実行可能なもの

```sh
research-os claim repair-scope <section-id> [--auto | --interactive]
                                              # now fills BOTH scope AND not when both are null (R-007)
research-os discover run <section-id>          # now fetches URL <title> + relevance-checks vs query (R-008)
research-os discover approve <section-id> --candidate <id>
                                              # explicit override for topic_mismatch candidates (R-008)
research-os source-card audit                  # new severity source_identity_mismatch (R-009)
research-os recover pack                       # MD now surfaces fallback cause + timing (R-010)
```

### 3層のソースコンテンツ保護

v0.11.0では、3つの独立した段階でソースコンテンツの汚染に対する防御を強化します。

```
discover  →  R-008  fetches each URL's <title>, computes keyword overlap vs the discover query
              ↓     topic_mismatch quarantined from `approve --top N`; override via `approve --candidate <id>`
extract   →  R-009  compares emitted card.title against fetched HTML <title>
              ↓     mismatch → source_identity_mismatch (HARD FAIL); override via clear_severities[]
critic    →  R-011  computes source-content signature once per source; precheck vs claim asserts
              ↓     mismatch → frame_excluded with reason source_content_mismatch (LLM critic short-circuited)
accept-floor       → unchanged; remains the floor of safety, not the only designed defense
```

各層の機能は独立して動作し、いずれか1つが無効化される（環境設定によるオプトアウト）か、上書きされる（オペレーターによる上書き）場合でも、他の2つは引き続き防御機能を維持します。`RESEARCH_OS_DISCOVER_RELEVANCE=0` を設定すると、R-008が無効化され、`RESEARCH_OS_FRAME_SOURCE_CONTENT=0` を設定すると、R-011の事前チェックが無効化されます。

### スコープの調整

```
gate blocked on accepted_claim_floor  →  recover  →  repair_claim_scope rank-1
                                          ↓
                                          claim repair-scope --auto
                                          ↓        fills BOTH scope AND not (R-007)
                                          ↓
                                          claim triage re-runs cleanly; claims promote without
                                                hand-editing claims.jsonl
```

v0.10のR-001でCLIが導入されました。R-007は、トリエイジによって引き起こされた修正の原因に合わせて、修正結果を調整します。`evidence/claim-scope-repairs.jsonl` にあるログには、`applied_scope` と共に `applied_not` が記録されます。

### MDフォールバックの可視化

AI回復アドバイザーが、タイムアウト、MCPエラー、または検証拒否（2回）などの理由で、決定的な回復にフォールバックした場合、`recovery/blocked-section-recovery.md` に、その原因が明確に表示されるようになりました。新しいクローズドなenum `FALLBACK_CAUSES` (3つの値: `tier_timeout | mcp_error | retry_exhausted`) が、その経路を分類します。`ollama-intern-mcp` が `elapsed=NNNNms budget=NNNNms` を出力する場合、オプションの構造化されたタイミング情報 `prose_error.timing_ms = { elapsed_ms, budget_ms }` が設定されます。MDは、v0.2の場合、以下の情報を表示します。

```
### Why the AI advisor fell back

**Cause:** AI advisor timed out (TIER_TIMEOUT) — elapsed 15012ms over 15000ms budget.

The recovery guidance below was generated deterministically from pack law
rather than the AI advisor. The fallback recovery action and pack-law
forbiddings are unchanged.
```

回復の選択ロジックは変更されていません。これは、オペレーターの理解を助けるためのものであり、オペレーターの作業を妨げるものではありません。

### 制約

修正は段階的に追加されます。既存の制限事項は維持されます。`accepted_claim_floor` は依然として変更できません。回復アドバイザーは、依然として、変更できないエラーに対して `apply_waiver` を推奨しません。クローズドな `FailureShape` enum は変更されていません（9つの値のままです）。`RECOVERY_ACTIONS` は8つの値のまま変更されていません。新しいアドバイザーのアクションはありません。R-007は、既存のアクション (`repair_claim_scope`) を拡張し、R-010は、`prose_error` の新しいenum `FALLBACK_CAUSES` を使用して、メタデータを追加するだけです。重大度に関する隔離は、明示的なオペレーターによる上書きがない限り、監査ゲートを通過しません（`clear_severities[]` フィールドは、オペレーターの決定を記録したものであり、変更できません）。

v0.3.3を基準とした、すべての4つのフローズンパックにおいて、バイト単位で完全に同一の状態を維持しています。 これは、今回で7回目の連続となります。

### v0.11.0で主張されていないこと

- v1の対応。
- v0.2のオペレーター単独作業ゲートの検証結果。 v0.2は、`@mcptoolshop/research-os@0.10.0`を使用して、別のセッションで実行されます。
- 許容基準に関する作業。 v0.2でPASSになることが前提です。
- クラウドベースの研究ツールとの連携。
- 完全な信頼できるレビューアのキャリブレーションモデル。

v0.11.0は、オペレーター単独運用ゲートのv0.3の前提条件であり、検証ではありません。

[`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) および [CHANGELOG.md](CHANGELOG.md) を参照してください。

## 以前のバージョン: v0.10.0 — オペレーター単独運用対応リリース

v0.10.0では、2026年5月15日に発生したv0.1のオペレーター単独運用におけるエラー条件を修正しました (`operator_aloneness_dst_v0.1`, FAIL)。これには、回復ルーティングの調整 (R-002)、スコープ修正のCLI (R-001)、ペアリングされたソースカードの監査強化 (R-003 + R-005)、および正直な収集ステータス (R-004) の改善が含まれます。[`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) を参照してください。

## 以前のバージョン：v0.9.0 — 製品成果物関連

v0.9.0では、v0.8の証拠データを、オペレーターにとって役立つ成果物へと変換しました。 具体的には、セクションレベルのテキスト合成（`synth section`）、部分的なデータセット合成（`synth pack --partial`）、そして、適切な回復アドバイザー（`recover pack`）が実装されました。 詳細については、[`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md)を参照してください。

## 以前のバージョン：v0.8.0 — アーキテクチャ・リカバリ

v0.8.0 は、research-os を、主張抽出のための宣言されたローカル LLM 基盤 (`ollama-intern-mcp@^2.4.0`) に再接続し、フレームに制約されたセクションの関連性適用機能を追加し、修復が必要なパッケージ内のゲート対象セクションに対して、セクション範囲の証拠引用合成機能を追加しました。詳細は、[`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) を参照してください。

## ステータス

**v0.11.0 — 2回目のオペレーター単独作業に関する修正リリース** — 2026年5月15日にnpmで `@mcptoolshop/research-os@0.11.0` として公開されました。v0.11.0では、v0.2におけるオペレーター単独作業の障害条件（`operator_aloneness_dst_v0.2`、2026年5月15日に認証レベルに達していない）を、5つの特定の問題を網羅する4つの修正によって解消しました。

**R-007** (スコープ/境界の修正): `claim repair-scope --auto` コマンドは、修正時に実質的なクレームにおいて、両方の `scope` と `not` がnullの場合に、両方を同時に設定するようになりました。これにより、v0.10のR-001で `scope` のみが設定され、`claim triage` が修正されたクレームを `needs_scope_repair` として再分類していた問題を解決しました。テンプレート境界は、スコープテンプレートの劣化形状を反映しています。追記専用のログは、`applied_scope` に加えて `applied_not` も記録するようになりました。

**R-008** (幻のURLに対する防御): `discover run` コマンドは、各候補URLの `<title>` を取得し（最大64KBの本文、5秒のタイムアウト、4並列処理）、取得した `<title>` とdiscoverクエリとの間の決定的なキーワードの一致を計算します。各候補には、`relevance` ブロック（`verified`、`unverified`、`topic_mismatch`）が追加されます。`approve --top N` コマンドは、`topic_mismatch` の候補を隔離し、`approve --candidate <id>` コマンドでオペレーターによるオーバーライドが可能です。これにより、v0.2において `llm-heuristic` が、全く関連性のない癌/生化学/HIVリンパ腫に関する論文を指す3つの実際のPMC URLを返していた問題を解決しました。

**R-009** (抽出器のID保護): 新しいソースカードの重大度 `source_identity_mismatch` (重大なエラー) が追加されました。これは、抽出器が生成した `card.title` と、取得したHTMLの `<title>` が一致しない場合に発生します。これにより、v0.2における「ネズミとクロニジン」に関する誤った情報を生成していた問題を解決しました。R-008のオーバーラップ処理を再利用し、`clear_severities[]` でオーバーライドが可能です。

**R-011** (フレームクリティックによるソースコンテンツの事前チェック): 新しいフレーム除外理由 `source_content_mismatch` が追加されました。フレームクリティックは、各ソースに対して一度だけソースコンテンツのシグネチャを計算し、LLMクリティックを呼び出す前に決定的な事前チェックを実行します。閾値を下回った場合は、LLMクリティックの呼び出しをスキップし、`frame_excluded: true` を設定します。これにより、v0.2において、DSTフレームテキストを持つ11件の癌関連論文から派生したクレームがLLMクリティックによって受け入れられていた問題を解決しました。

**R-010** (MDフォールバックの可視性の回復): 新しい `FALLBACK_CAUSES` 列挙子（`tier_timeout`、`mcp_error`、`retry_exhausted`）と、`prose_error` メタデータにオプションの `FallbackTiming { elapsed_ms, budget_ms }` が追加されました。これにより、MDフォールバックが発生した場合に、「AIアドバイザーがフォールバックした理由」というセクションと、主要な原因の概要が表示されるようになります。v0.2におけるJSONのみで表示される `TIER_TIMEOUT` の可視性に関する問題を解決しました。

**3層のソースコンテンツ汚染防御が完了** (R-008による受信、R-009による抽出、R-011によるクリティック) し、検証済みの防御層間の独立性が確保されています。**`ollama-intern-mcp@^2.4.0` が必要** (v0.8.0から変更なし)。1448/1448のvitestが成功 (1344 → 1448、範囲全体で104件のテストを追加)。**すべての4つのフローズンパックが、v0.3.3のベースラインに対してバイト単位で完全に一致** (11回目のリリース)。**これはv1のリリースではありません。また、v0.3におけるオペレーター単独作業のゲート判定ではありません**。v0.3は、このnpmバージョンに対して別のセッションで実行されます。アドミシビリティの原則に関する作業は、v0.3のPASSに依存します。詳細は、[`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) および [CHANGELOG.md](CHANGELOG.md) を参照してください。

**v0.10.0 — オペレーター単独状態の修正リリース** — `npm`に `@mcptoolshop/research-os@0.10.0` として公開。2026年5月15日。v0.10.0では、v0.1におけるオペレーター単独状態の障害条件 (`operator_aloneness_dst_v0.1`) を、4つの修正箇所による修正で解消しました (2026年5月15日にFAIL)。**R-001** (`research-os claim repair-scope <section> [--auto | --interactive]`): 抽出によって `scope` フィールドが `null` になったクレームを修正するための新しいCLIを追加。追記専用のログファイル `evidence/claim-scope-repairs.jsonl` を追加。`RECOVERY_ACTIONS` に新しいアクション `repair_claim_scope` を追加しました (enum の要素数が 7 から 8 に増加)。アドバイザーは、`needs_repair_claims` に3つ以上のクレームが含まれている場合に、このアクションを `accepted_claim_floor` のランク1として表示します。**R-002** (リカバリールーティング): 診断レイヤーは、従来の `failures[].check` の参照にフォールバックする前に、`gate.json:blocking_reasons[]` を信頼できるルーティング情報として読み込むようになりました。これにより、`source_card_classification_gap` などの下流からの信号よりも、ゲートをブロックする信号が優先されます。**R-003 + R-005** (ソースカード監査の強化、ペア): 新しい深刻度レベルとして、`bot_check_or_captcha_detected` (HARD FAIL — 複合信号: マーカーとボディの形状) と `extraction_suspect_word_count_mismatch` (WARN AND QUARANTINE — ボディが200語以下で、抽出された単語が800語以上で、その比率が4以上) を追加しました。オペレーターは、v0.4のオーバーライドログスキーマに新しい `clear_severities[]` フィールドを使用して、これらの深刻度レベルを上書きできます。`research.yaml` に、各パッケージごとに調整するためのオプションの `audit.severity_thresholds` ブロックを追加しました。**R-004** (信頼性の高い `gather_outcome`): `FetchReceipt` の enum を 5 つ (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`) に変更しました。v0.1 であった `"Failed (ok HTTP 200)"` という誤解を招くメッセージは削除されました。詳細は、[`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) および [CHANGELOG.md](CHANGELOG.md) を参照してください。

**v0.9.0 — Product Artifact Arc** — npmに `@mcptoolshop/research-os@0.9.0` として公開。2026年5月14日。v0.9.0では、v0.8の証拠構造を、オペレーターにとって有用な成果物へと変換します。セクションレベルの文章合成機能 (`research-os synth section <id>`) は、読みやすいMarkdown形式で、段落レベルのサポート情報と、承認された主張へのリンクを提供します。部分的なパッケージ合成機能 (`research-os synth pack --partial`) は、セクションの文章（生の主張は使用しません）を処理し、除外されたセクションとその理由を構造的に示します。また、2つ以上のセクションが含まれる場合、決定論的なバンドルプランナーが、必要な横断的なサポート情報を事前に選択します。法的な復旧アドバイザー (`research-os recover pack`) は、ブロックされたセクションに対して、オペレーター向けのガイダンスを提供します。このガイダンスは、4層のアーキテクチャ（決定論的な診断 + 法的なアクショングラフ + AIによるアドバイス + 検証器）に基づいており、3つのアドバイスパス (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) と、9種類の障害パターンと7種類の復旧アクションに対応した定義済みの列挙型を使用します。復旧ガイダンスは、各除外されたセクションの `partial-pack-synthesis.{md,json}` ファイルに、標準的な復旧オブジェクトからの簡潔な情報として埋め込まれています。これにより、スタンドアロン環境と組み込み環境の間で、単一の情報源として機能します。`recovery_unavailable` 状態は、エンジンエラーを明示的に示し、サイレントなスキップは行われません。フリーズおよび公開の動作は変更されていません。読みやすい部分的な成果物は、不完全なパッケージがフリーズ可能または公開可能になるわけではありません。`accepted_claim_floor` は依然として変更できません。復旧アドバイザーは、変更できないエラーに対して `apply_waiver` を推奨しません。**`ollama-intern-mcp@^2.4.0` が必要です**（v0.8.0からの変更なし）。1266/1266のvitestテストが成功しました（1013 → 1266、全アーキテクチャで+253件のテスト）。**すべての4つのフリーズされたパッケージが、v0.3.3のベースラインに対して、バイト単位で完全に一致します**（6回目の連続リリース）。**これはv1のリリースではありません。** v0.9.0では、成果物層が実用化されます。v1のリリース、新しいパッケージのオペレーター単独での利用可能性、信頼できるレビューモデル、およびクラウドベースの基準を満たす主張の実現は、今回のリリースには含まれていません。詳細は、[`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) および [CHANGELOG.md](CHANGELOG.md) を参照してください。

**v0.8.0 — アーキテクチャの改善 + トピックの関連性のフレーム制限** — npm で `@mcptoolshop/research-os@0.8.0` として公開されました (2026-05-12)。v0.8.0 は、アーキテクチャの改善を目的としたリリースです。`research-os` は、主張の抽出のためのローカル証拠処理基盤として、`ollama-intern-mcp@^2.4.0` を使用するようになりました (以前はREADMEで依存関係が宣言されていましたが、コードはv0.1の初期バージョンから、それを回避する内部の直接Ollamaのスタブを使用しており、v0.8.0でその乖離を解消しました)。 以下の機能が追加されました。MCPクライアント基盤 (`OLLAMA_INTERN_MCP_BIN` 環境変数 + PATH検出 + StdioClientTransportライフサイクル); `ollama_extract` を使用した、各主張に対するセクション証拠の評価 (4つのラベル: `supports_section` / `off_topic` / `background_only` / `source_chrome`); 新しい `ReviewDecision` の `frame_excluded` (除外された主張に対してLLMの処理をスキップし、合成された `ClaimReview` を生成); `ClaimSchema` に `frame_excluded` + `frame_exclusion_reason` (システムの状態異常の場合に `critic_unavailable` を含む4つの値のenum) + `frame_exclusion_rationale` が追加; 修正が必要なパッケージ内の、ゲートの対象となるセクションに対して、セクション範囲の証拠合成機能 (証拠の参照インデックス: 主張ID → アサーション → 証拠の抜粋 → ソースURL — これは、記述的な文章ではありません); ゲートは、`getEffectivePublisher` / `getEffectiveSourceType` を使用した、ソースカードのオーバーライドレジスタを尊重します (v0.7.1 の目標を吸収)。`DEFAULT_WINDOW_CHARS` のデフォルト値が 5000 から 3000 に変更されました (dev-rtx5080 プロファイルにおける、8Kのコンテキストサイズを持つ `hermes3:8b` に最適化)。評価者の呼び出しに対する、ソフトフェイルポリシーが反転されました (5つの失敗モードのうちのいずれか — トランスポート / 解析 / 無効なラベル / 空の理由 / タイムアウト — の場合、デフォルトでは `frame_excluded: true` となり、理由として `critic_unavailable` が設定されます。ただし、正常な状態ではありません)。プロモーションのセマンティクス: `frame_excluded` の主張は、セクションのプロモーションをブロックしません。コワークハンドオフでは、`frame_excluded` が、受け入れられた/修正が必要な/拒否されたものとは別の、独自のバケットとして表示されます。**`ollama-intern-mcp@^2.4.0` が必要です。** 1013/1013 の vitest が成功しました (901 → 1013、+112 テスト)。**すべての4つの凍結されたパッケージが、v0.3.3 のベースラインに対して、バイト単位で完全に一致します。** **これは、v1 リリースではありません** — v1 のための作業は継続中です。詳細については、[`docs/roadmap.md`](docs/roadmap.md) を参照してください。詳細については、[`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) および [CHANGELOG.md](CHANGELOG.md) を参照してください。

**v0.7.0 — Dogfood Swarm Hardening（内部テストの強化）** — npmに`@mcptoolshop/research-os@0.7.0`として公開されました。2026年5月11日。v0.6.0のコードベースに対して、4段階の内部テスト（バグ/セキュリティ、積極的な耐性向上、オペレーターの使いやすさ向上、プレゼンテーションの改善）を実施しました。v0.7.0では、以下の強化が施されています。より安全なデータ収集（URLごとのtry/catchと、例外ごとのエラー処理による、部分的な失敗時のソースIDの保持）、堅牢なインデクサー（不正なJSONL形式のレコード/ファイル/セクションをスキップして警告）、構造化されたリカバリーエラー（12種類の`ResearchOSError`サブクラスと、それらに関するハンドブックへのリンク）、進捗状況のフィードバック（`--no-progress` / `--progress`フラグによるTTYの自動検出）、オペレーター向けの操作性の改善（`pack publish --force`コマンドによる、破壊的な置換処理の標準化と、8つの箇所での回帰テスト、`IndexNotBuiltError`コマンドのテキストの修正と、コマンドテキストのレジストリテストの追加、12種類の`ResearchOSError`サブクラスに対するハンドブックへのリンクの追加）、サプライチェーンのセキュリティ強化（CIアクションのSHAピンニングと、`permissions: contents: read`のデフォルト拒否、Dependabot /site + github-actionsによるエコシステム対応）、新しいハンドブックのページ2ページ（`recovery.md`、`known-limitations.md`）、プレゼンテーションの改善（標準的な文の回帰テスト、サイドバーの再配置、破壊的な操作に対する`:::caution`の注意喚起）。901/901のvitestテストが成功しました（713 → 901、+188テスト）。**すべての4つのfrozen packsが、v0.3.3のベースラインに対して、バイト単位で完全に一致します。** **これはv1のリリースではありません**。v1の準備作業は継続中です。[`docs/roadmap.md`](docs/roadmap.md)と[`docs/swarm-hardening-proof.md`](docs/swarm-hardening-proof.md)を参照してください。[`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md)と[CHANGELOG.md](CHANGELOG.md)も参照してください。

**v0.6.0** — npmに`@mcptoolshop/research-os@0.6.0`として公開されました。2026年5月10日。v0.6.0では、実験6が、レビュー担当者の信頼性に関する証拠とともに完了しました。これにより、research-osは、再現可能で、帰属可能な、標準的なモデルのベースラインを生成できるようになりました。変更点：本番環境のレビュープロセスにおける再現性のあるレビュー担当者オプション（`review_profiles.<name>.reviewer_options`を`research.yaml`に追加）、既存のv0.3.3以前のフローズンアーティファクトに対するゲートスキーマの互換性（F-53）、レビュー出力にサンプリング条件が直接`review.json`と`review.md`に表示されるように変更（F-54）、標準的な再現性のある集計記録がコミットされました（`hermes-two-pass-deterministic`、`temperature:0, seed:7`）。**どのプロファイルも`trusted_baseline`として認められていません。** `hermes-two-pass-deterministic=failed`（判断の語彙における構造的なモデルの能力ギャップ。ばらつきの問題ではない）。**Hermesは`trusted_baseline`として昇格しません。** 重要なのは、メカニズムであり、単に合格する記録ではありません。ゲート、フリーズ、または合成法の変更はありません。すべてのフローズンパックが、バイト単位で同一であることを確認しました。713/713のvitestが合格しました。詳細は[CHANGELOG.md](CHANGELOG.md)と[`docs/experiment-6-proof.md`](docs/experiment-6-proof.md)を参照してください。

**v0.5.0** — npmに `@mcptoolshop/research-os@0.5.0` として公開。2026年5月10日。v0.5.0では、レビュー担当者の評価の信頼性を高めるための機能が導入されました。レビュー担当者のプロファイルは、単に一度実行されたというだけで信頼されるわけではありません。構造化されたテストケースと複数回の実行結果を組み合わせることで、信頼度を評価します。同梱内容：構造化された評価結果スキーマ (`seeded-v1.{json,md}`、Zodによる検証、4つのステータスラベル）、複数回の実行をサポートする機能 (`--runs <n>`、各実行の分離、中央値に基づいた合否判定、繰り返し発生するエラーに対する評価の引き下げ）、アーキテクチャを考慮した意思決定のための語彙セット、`review-promote` 内でのパッケージ相対的な評価結果の参照機能。**信頼できる基準値は認められません:** `hermes-two-pass=failed` (集計、3回の実行)、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`。research-osは、繰り返し発生するテストの失敗が信頼を裏付けることができない場合、レビュー担当者のプロファイルを信頼しないようにすることができます。**ゲート、フリーズ、または合成規則に関する変更はありません。すべての4つのパッケージが、バイト単位で完全に同一であることを検証済みです。** 671/671のvitestテストが合格。詳細は [CHANGELOG.md](CHANGELOG.md) を参照してください。

**v0.4.0** — npmに`@mcptoolshop/research-os@0.4.0`として公開。2026年5月10日。v0.4.0では、ソースの同一性を維持できるようになりました。決定論的なソースタイプルールにより、再現可能な多数が処理され、オーバーライドされたレジャーにより、再収集時のオペレーターによる修正が保持され、`source-card audit`コマンドが、従来のスクリプトのずれチェックを置き換え、より使いやすいCLIインターフェースを提供します。同梱内容：集中型のソースタイプ分類器（コンポーネントB — `classifySourceType`、11種類のベンダー、`source-type-rules.json`）、ソースカードのオーバーライドレジャー（コンポーネントA — `source-card-overrides.jsonl`、`validate`および`list`サブコマンド）、およびソースカード監査CLI（コンポーネントD — `research-os source-card audit --pack <dir>`、7種類の検出結果、JSONおよびMarkdown形式のレポート、`--apply --from`による適用パス）。F-46：見た目の修正。パッケージのマニフェストには、`research.yaml`に固定されたバージョンではなく、実行中のバイナリのバージョンが記録されるようになりました。**ゲート、フリーズ、または合成に関する変更はありません。既存のすべてのパッケージは、バイト単位で同一であることを検証済みです。** 620/620のvitestテストが合格しました。詳細は[CHANGELOG.md](CHANGELOG.md)および[ソースカード監査に関するハンドブック](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/)を参照してください。

**v0.3.3** — npmに`@mcptoolshop/research-os@0.3.3`として公開。2026年5月10日。Pack-3（Godotのエクスポート/ランタイムの安定性、実験3のパッケージ#3）によって得られた、ゲートのセマンティクスに関する明確化が含まれています。ゲートの出力には、セクションごとのパブリッシャー数と主要なカウントに加えて、パッケージ全体のカウントも表示されます（F-43）。`no_source_cluster_monopoly`は、警告から情報診断に変更されました（F-41）。**合格/不合格の動作は変更されていません。既存のパッケージは、バイト単位で同一であることを検証済みです。** 570/570のvitestテストが合格しました。詳細は[CHANGELOG.md](CHANGELOG.md)および[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)を参照してください。

**v0.3.2** — 2026年5月9日に、`@mcptoolshop/research-os@0.3.2`としてnpmに公開されました。`pack publish`の許可に関する、正規化された承認処理が実装されました。`claim-reviews.jsonl`と`pack-audit.json::accepted_claims`の厳密な一致チェックは、効果的な集合比較に置き換えられました。承認されたクレームは、最新の正当なレビュー結果が`accepted_for_synthesis`である一意の`claim_id`の集合です（`claim_id`ごとに最新の決定が優先されます）。以前の監査数が効果的な集合と異なる凍結されたパッケージは、拒否する代わりに警告を表示します。古い監査ファイルは変更せずに保持されます（ルール15）、ただし、アーカイブのマニフェストには正規化された数が反映されます。フェイクの`claim_id`、互換性のない重複した決定、および合成対象外の条件に対する拒否は引き続き適用されます。Experiment 3 XRPLパッケージのSession Kで、実際のクロージャー・レジャーの不一致により、パッケージの公開が拒否されました（セクション07には24件の`accepted_for_synthesis`の行がありましたが、重複するレビュー担当者によるため、一意の`claim_id`は19件のみでした）。558/558のvitestが成功しました。詳細については、[CHANGELOG.md](CHANGELOG.md)と[`docs/pack-publish.md`](docs/pack-publish.md)を参照してください。

**v0.3.1** — 2026年5月9日に、`@mcptoolshop/research-os@0.3.1`としてnpmに公開されました。セクションごとに適用されるソースコードの免除（`primary_source_waiver.section_waivers[]`）と、レビュー担当者による確認機能が追加されました。これにより、セクション全体で`source_cluster_monopoly`の違反が検出された場合でも、自動的にすべてのクレームを`needs_source_repair`に振り分けるのではなく、注意点として表示されるようになりました。Experiment 3 XRPLパッケージのSession 2で、canonical-protocolセクション（単一の基盤チェーン、クローズドなAPI仕様、標準化団体のドキュメント）において、パブリッシャーの多様性が真の品質の指標であるという前提が覆されました。当時、540/540のvitestが成功しました。詳細については、[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)を参照してください。

**セクションごとのソースコード免除** — パブリッシャーの多様性がセクションの真のソースと構造的に互換性がない場合にのみ使用します。セクションが単に十分なソースを見つけられなかった場合ではありません。スキーマによって強制される`reason`と、空でない`compensating_controls[]`が必要です。パッケージポリシー`primary_source_waiver_allowed: false`は、パッケージレベルおよびセクションごとの免除の両方をブロックします。v0.3.1以前のパッケージレベルの`min_independent_publishers: 0`の回避策は、現在非推奨です。既存の凍結されたパッケージは、既存のレシートに基づいて有効です。詳細については、[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)と、[research-packsオペレータープレイブック](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)を参照してください。

**v0.3.0** — 2026年5月9日に公開されました。`contradict map`に、`--detector <auto|heuristic|ollama-intern>`フラグが追加されました（Experiment 3 Session 1、XRPLパッケージのF-09チェーンブロッカーの修正）。当時、527/527のvitestが成功しました。検出器の選択は、以前の状態に依存する環境変数ではなく、オペレーターが明示的に選択するようになりました。モードは、実行ごとに可視化されます。詳細については、[`docs/contradict-map.md`](docs/contradict-map.md)を参照してください。

**v0.2.0** — 2026年5月9日に公開。`research-os pack publish` (実験2) と、Pattern 2 の準備状態に関する問題を修正しました。515件中515件の vitest テストが合格しました。詳細は [CHANGELOG.md](CHANGELOG.md) を参照してください。パッケージの公開は、単一のコマンドで標準の `research-packs` アーカイブにエクスポートされます。契約の遵守は、チェックリストではなくコードによって強制されます。詳細は [`docs/pack-publish.md`](docs/pack-publish.md) を参照してください。

**v0.1.0** — 2026年5月8日に固定されました。`research-os-packs/research-os-spec/` (関連リポジトリ) にある「dogfood」パッケージでは、8つのセクションで296件の主張が承認され、17件が処理され、30件がオペレーターによって修正され、未解決の矛盾は0件、すべてのゲートで `synthesis_eligible=true` となりました。463件中463件のvitestテストが合格しました。16個の重要なルールが実装されています。詳細については、[docs/dogfood-proof.md](docs/dogfood-proof.md) を参照してください。このドキュメントには、7つの発見事項と、固定状態のフィンガープリントが記載されています。

**research-packs アーカイブモノレポ** — [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)で公開されており、以下の4つのパッケージが含まれています。`research-os-self-dogfood`（v0.1の内部テスト用、296件のクレームが承認済み、8つのセクション）、`comfyui-workflow-durability`（実験1、302件のクレームが承認済み、8つのセクション）、`xrpl-creator-token-durability`（実験3のパッケージ#2）、および`godot-export-runtime-durability`（実験3のパッケージ#3）。すべてのパッケージで`verify-pack.mjs`が`PASS`の結果となっています。

**v1 実験1 (ComfyUI ワークフローの安定性)** — 2026年5月9日に終了。8つのセクションすべてが Terminal A で完了し、パッケージは凍結され、アーカイブは公開されました。詳細は [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) と [`docs/roadmap.md`](docs/roadmap.md) を参照してください。

### research-os が何ではないか (そして v0.11.0 が主張しないこと)

- 新しいパッケージで、オペレーター単独での動作が検証されていません。v0.11.0では、v0.2のゲートに関するエラー条件が修正されました。v0.3のオペレーター単独のゲートは、別のセッションでこのnpmリリースに対して実行され、さらなる修正が見つかる可能性があります。v0.3を使用するには、v0.11.0が前提条件ですが、検証ではありません。
- ドッグフードテストや、オペレーター単独のゲートの2回の実行以外では、外部ユーザーによるテストは行われていません。6つのドッグフード実験が終了しました。そのうち、1つは自己参照型、5つは外部ドメイン（ComfyUI、XRPL、Godot、レビューア校正、決定論的レビューア）です。また、v0.1とv0.2のオペレーター単独のゲートの実行により、11件の既知の問題（R-001～R-005はv0.10.0で、R-007～R-011はv0.11.0で修正）が特定されました。大規模なオペレーター利用は今後の課題です。
- 完全なパッケージ合成ツールではありません。v0.11.0は、v0.9のセクション範囲（`synth section`）と部分パッケージ範囲（`synth pack --partial`）の機能を継承しています。それぞれに、パッケージの利用可能状態に関する明示的な記述が含まれています。完全なパッケージ合成には、`synthesis_ready`パッケージと、`synth workspace`を使用して承認されたクレームIDに対して人間（または共同作業者）が作成する必要があります。
- いかなるレビューアモデルも推奨するものではありません。v0.11.0には、デフォルトで`trusted_baseline`レビューアプロファイルは含まれていません。校正記録は、推奨を意味するものではありません。既存のv0.6.0の校正記録は、v0.8.0のMCPアーキテクチャ以前のものであり、MCPのパスでは再基準化されていません。詳細については、[レビューア校正ハンドブックのページ](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/)を参照してください。
- 凍結されたパッケージには、過去のアーティファクトが含まれています。v0.4以前の凍結されたパッケージには、`research_os_version: '0.1.0'`という記述が含まれています。これは、v0.4以前にハードコードされた定数によるものです。この修正はv0.4.0で導入されましたが、以前の凍結されたパッケージはLaw 15により変更できません（[`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)を参照）。
- npm上では、プロヴェナンス認証は行われていません。Sigstoreによるプロヴェナンス認証は、今後のリリースで実装予定です。v0.11.0のnpmパッケージは、package-shasumとGitHubのリリースコミットを使用して検証してください。
- クラウドベースの最適化ではありません。v0.7.xの`local-first-vs-cloud-research/`にある製品の検証では、クラウドの読みやすさやオペレーターの負担軽減という利点が示されました。v0.11.0は、これらの点が克服されたことを主張するものではありません。

### 既知の制限事項

v0.11.0には、以前のリリースから引き継がれた、オペレーターが認識する既知の制限事項が3つ含まれています。それぞれが[既知の制限事項のハンドブックページ](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)と[CHANGELOG.md](CHANGELOG.md)に記載されています。いずれもリリースをブロックするものではなく、すべてに復旧または軽減策が定義されています。

- **B-E-001 — v0.4以前の凍結パッケージのバージョン番号は、過去のアーティファクトです。** v0.3.3からv0.6.0までに公開された凍結パッケージには、`pack.manifest.json`と`pack/research.yaml`に`research_os_version: "0.1.0"`という記述が含まれています。これは、v0.4以前にハードコードされた定数によるものです。この修正はv0.4.0で導入されました（scaffoldは現在、ライブの`RESEARCH_OS_VERSION`をインポートします）。以前の凍結パッケージは、Law 15により変更できません。影響を受けるパッケージ内のJSONファイルには、それぞれの最新バージョンが記載されています。
- **B-E-004 — npmのプロヴェナンス認証は、今後のリリースで実装予定です。** v0.11.0のnpm tarballは、package-shasumのみで検証できます。公開フローをCIワークフローに移行すると、sigstore OIDCとの競合が発生し、TranslateGemma 12Bのローカル実行との整合性が取れなくなります。この移行は、今後のリリースで計画されています。v0.11.0のnpmパッケージは、package-shasumとGitHubのリリースコミットを使用して検証してください。
- **B-A-003 — インデクサのスキーマバージョンの移行は、文書化されていますが、強制されていません。** v0.11.0には、書き込み側の`SCHEMA_VERSION`という整数が含まれていますが、読み込み側の移行ツールはありません。文書化された`SCHEMA_VERSION`の変更があった場合、`.research-os/index.sqlite`を削除し、`research-os index build --all`を再実行してください。パッケージ自体には影響はありません。インデクサは、エビデンスとクレームの加速レイヤーです（Law 8）。再構築は冪等です。

**v0.11.0では、`trusted_baseline`のレビュー担当者プロファイルは認められていません。** これは、意図的なセキュリティ設定であり、欠陥ではありません。 リポジトリ内のキャリブレーション記録（`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`）には、その証拠が記録されています。 信頼は、繰り返し行われる意図的なエラー再現テストによって得られるものであり、当然のことではありません。 これらの記録は、v0.8.0のMCPアーキテクチャ以前のものであり、MCPのパス下では再評価されていません。

## v1.0 へのロードマップ

v1.0は、リリース日ではなく、達成される状態です。6つの内部テスト（Exp1～Exp6、2026年5月8日～2026年5月11日）が完了し、それぞれが[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)に登録される研究用パッケージを生成しました。このプロジェクトは、v0.2.0の`research-os pack publish`機能とパターン2（実験2）、v0.3.0の`--detector`フラグ（F-09）、v0.3.1のセクションごとの例外規定（F-10/F-11）、v0.3.2の標準化された承認済み請求処理（F-36）、v0.3.3のゲートのセマンティクスに関する明確化（F-43/F-41）、v0.4.0のソースコードの整合性（F-27/F-47/F-46）、v0.5.0のレビュー担当者の調整（F-48/F-49/F-50）、およびv0.6.0の決定論的なレビュー担当者基準（F-53/F-54）を達成しました。v1.0のリリース準備は、複数の段階で構成される品質向上プロセスを通じて現在進行中です。アーキテクチャの固定は、このプロセス全体を通して維持されます。詳細な計画は[`docs/roadmap.md`](docs/roadmap.md)に記載されています。

## ライセンス

MIT
