<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.13.0"><img src="https://img.shields.io/badge/version-0.13.0-blue" alt="version 0.13.0"></a>
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

## v0.13.0の新機能 — 最終化ブロック解除トライアル（R-019 + R-020 (Dのみ) + R-021）

v0.13.0では、v0.4の再実行後に開始された、最終化ブロック解除トライアルが完了しました。このトライアルは、`@mcptoolshop/research-os@0.12.1`に対する再実行の結果、**条件付きで合格（PASS_WITH_CONDITIONS）**となり、認証レベルには達しませんでした。このトライアルは、Path D（マルチブロック解除トライアル、Path Cのネームドパッチとは異なる）で行われました。3つの独立した最終化ブロック解除機能が、3つの異なるパイプライン層で動作します。また、3つの独立した設定項目が連携し、合成テキストの最終化、`no_answer_cluster`の復旧、および矛盾マップの自動モードをブロック解除します。v0.10 / v0.11 / v0.12 / v0.12.1で導入された防御機能と、カバレッジ復旧機能は維持されており、非推奨の列挙型変更や、既存の機能に影響を与える変更はありません。

> **v0.4の再実行では、合成された結果がシステムの動作を検証できることを示しましたが、実際の再実行では、ターゲットの仕組みが誤っていることが判明しました。**
> **v0.13では、最終化時の実行制御に焦点を当てています。R-019は、内部MCPのティア予算層をブロック解除します。R-020は、`no_answer_cluster`の復旧機能を実装し、問題発生時の対応策を提供します。R-021は、矛盾マップの自動モードRPC層をブロック解除します。**

v0.5のオペレーター連携機能は、別のセッションで公開されたv0.13.0に対して実行されます。Admissibility Slice 1は、v0.5で合格するまで**未認証**の状態です。

### 実行可能なもの

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

### 新機能

**R-019 — 内部MCPのティア予算クライアントの接続。** R-018で導入された`--planner-timeout-ms <N>`フラグ（および`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`環境変数）が、プランナー/ドラフター/バリファイアを介して`ollama_extract.tier_budget_ms_override`に伝播し、`ollama-intern-mcp/src/guardrails/timeouts.ts:61`の`runWithTimeoutAndFallback`に到達します。v0.4の再実行で発生した`elapsed=15018ms budget=15000ms`というエラーを引き起こしていた、内部のティアごとのタイムアウト機構が、オペレーターの予算を直接反映するように変更されました。R-018のラッパーは、未解決のプロミスによるハングに対する安全策として維持されます（別の種類の障害を検出できる場合があります）。`ollama-intern-mcp@>=2.6.0`が必要です。古いバージョンでは、新しいスキーマフィールドを無視します（R-018のラッパーは、元の層で引き続き動作します）。

**R-020 (Dのみ) — `no_answer_cluster`の復旧機能。** プランナーが、どの肯定的な要求に対しても`role=answer`を割り当てられない場合、エラーが発生すると、`section-synthesis.json`にインラインで`recovery_actions[]`（`narrow_section_purpose` + `add_on_topic_sources`）が表示されます。また、`section-synthesis.md`に、アクションIDのヘッダー、理由の説明、および実行可能なコマンドのヒントを含むMarkdownブロック（`## Recovery actions`）が表示され、さらに、`stderr`に1行のヒント（`[synth] no_answer_cluster — see section-synthesis.md "Recovery actions" block for actionable steps`）が表示されます。アクションリストは、アクショングラフの復旧パスと共有される単一の情報源です。スタンドアロンコマンドとインラインエラーメッセージの間で、情報が一致するように設計されています。**R-020のプランナープロンプトの調整（A-half）は試行されましたが、ロールバックされました。** iter-1では、LLMが、敵対的なデータセットに対して、肯定的な効果を持つ要求から、実際には効果がない回答を生成しました（バリファイアは、この否定を「正しい」と判断しました）。iter-2では、ハードガードレールがこの誤りを修正できませんでした。オペレーターの1イテレーションルールに従い、プロンプトと3つのv3に固定されたテストファイルをロールバックしました。`PROSE_PROMPT_VERSION`は、`section-prose-v3`のままです。この結果、以下の教訓が得られました。構造的な実際の再実行は合格する可能性がありますが、合成されたコンテンツが誤っている可能性があります。敵対的なデータセットに対して、手動でテキストを検査することで、否定、範囲、述語の誤りを検出する必要があります。

R-021: contradict-mapの自動モードにおけるハングタイムの調整、ヒューリスティックによるフォールバック機能の追加、および進行状況の可視化。
新しいオプション `--auto-mode-pair-timeout-ms <N>` (デフォルト値: 90000ms。以前は120秒という固定値でしたが、v0.4のテスト環境（hermes3:8b）で、最小6.2秒、中央値8.4秒、最大8.8秒という結果から、90秒というデフォルト値に変更され、余裕が81秒あります)。
新しいオプション `--auto-mode-fall-through-after-n-timeouts <N>` (デフォルト値: 5。自動ヒューリスティックによるフォールバックを行うための、連続的な失敗の閾値。`type:none` の分類が成功すると、このカウンタがリセットされます)。
対応する環境変数も追加。
新しい標準出力の開始行 (`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`) が、すべての実行時に表示されます。常に可視であり、TTY環境以外でも表示されます。
強制的に標準エラー出力にフォールバックトリガーイベントを出力することで、TTY環境の制限や `--progress` オプションの影響を受けずに、モードの切り替えをオペレーターに通知します。
`contradictions.md` ファイルに、閾値を超えた場合に表示される新しい `## Auto-mode fall-through` というマークダウンブロックを追加しました。
ヒューリスティックの再実行は、未処理のペアに対してのみ行われます（既にLLMによって処理済みのペアの再分類は行われません）。

### アーキテクチャに関する注意

R-019 は、research-os と ollama-intern-mcp の境界を越えます。
research-os は、`ollama_extract` スキーマで `tier_budget_ms_override` を受け渡します。ollama-intern-mcp v2.6.0 は、内部のガードレールでこれを有効にします。
必要なインフラは既に存在しており、v2.6.0 がクライアント側のエントリーポイントを提供し、v0.13.0 が research-os 側のクライアント側の設定を行います。
R-018 の Promise.race ラッパーは、別の種類の障害（未解決プロミスのハング）に対する対策として保持されます。ラッパーはこれらの問題を検出し、構造化された `isError:true` のエラーペイロードを内部の予算を超えない範囲で通知しますが、R-019 の範囲はこれらとは異なります。

R-021 は、research-os のみで動作します。
contradict-map の自動モードは、ollama-intern-mcp を経由しません。Ollama の HTTP `/api/chat` エンドポイントを直接呼び出します。
MCP のトランスポートは使用されず、`tier_budget_ms_override` の設定も適用されません。また、R-018 のラッパーも使用されません。
four-hard-laws の起動プロトコルにおいて、R-021 の起動時に、パッチコードが書かれる前に、フレームの誤りが見つかりました。起動メッセージで「MCP RPC layer」と表示されていましたが、Phase A の読み込みフェーズでそれが誤りであることが判明しました。

### 防御機能は維持されています

R-019 + R-020 (D-only) + R-021 は、アーキテクチャの変更ではなく、オペレーター向けの機能追加です。
R-002 から R-018 までの変更点はすべてそのまま引き継がれています。
`accepted_claim_floor` は変更できません。
既存の enum も変更されていません (`FailureShape` は 9、`RECOVERY_ACTIONS` は 8、`REGENERATION_REASONS` は 3、`PLANNER_TIMEOUT_SOURCES` は 3、`POLICY_KEYWORDS` は 8、`POLICY_RELEVANT_SOURCE_TYPES` は 1)。
AI 回復アドバイザーのプロンプルトemplate は変更されていません。
MCP のアーキテクチャは、追加的に拡張されています。
R-010 で定義されたフォールバック原因の正規表現の形状は維持されています。

すべての 4 つのフローズンパックについて、v0.3.3 のベースラインと比較して、バイト単位で完全に同一です。**18 回目の連続リリース**で、この状態が維持されています。
vitest の合格数は 1542 から 1630 に増加 (+88。3 つのテストで 4 件がスキップされました)。

### v0.13.0 が主張しないこと

- v1 の対応。
- v0.5 のオペレーターによる検証。v0.5 は `@mcptoolshop/research-os@0.13.0` に対して別のセッションで実行されます。v0.13.0 は最終的な検証のための前提条件であり、それ自体が証明ではありません。
- Admissibility Slice 1 の対応。v0.5 で PASS していることが前提です。
- 延期された v0.13.x の候補（F-2: R-009 の監査と抽出の乖離、F-3: cowork-handoff の陳腐化、F-4: R-017 の POLICY_KEYWORDS の範囲の狭さ、A-1 + A-2: アーキテクト側の調査結果を v0.5 のゲートの準備に組み込み）。

詳細については、[CHANGELOG.md](CHANGELOG.md)を参照してください。

## v0.12.1の新機能：シンセプランナーのタイムアウトオーバーライド（Path Cパッチ）

v0.12.1は、v0.12.0をベースにした単一の修正パッチです。R-018のみが含まれています。これは、研究OS側のラッパーによるタイムアウト機能であり、シンセプロセスのMCP `callTool`呼び出しを対象としています。この機能は、オペレーターが確認できるコマンドラインオプション（`synth section`および`synth workspace`で`--planner-timeout-ms <N>`）と、対応する環境変数（`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`）によって制御されます。優先順位は、コマンドラインオプション > 環境変数 > デフォルト値（15000ms）です。デフォルトの動作は、v0.12.0と完全に同じです。

このリリースが存在するのは、v0.4のオペレーター単独での検証において、`@mcptoolshop/research-os@0.12.0`に対して「条件付き合格」という結果が出たためです（「承認レベル」ではありませんでした: `operator_aloneness_dst_v0.4`）。v0.11の防御機能は、実際の負荷下でも維持されました。6つのすべてのv0.12のテスト項目が正常に完了し、オペレーターが通過しました。封じ込めテストの範囲は、許容基準（必須のサポート項目4/5 + 1つは部分的なもの; サポート項目2/3 + 1つは部分的なもの; トラップは0/3; 材料の故障は0/5）を満たしました。汚染マーカーはすべて無害でした。唯一の失敗モードは、最終処理でした。シンセプロセスが、オペレーターによるオーバーライドが明示的に行われていないにもかかわらず、約15010msで`TIER_TIMEOUT`エラーを再現的に発生させました（許容される最大時間は15秒）。セクションの要件は、封じ込めテストの基準を満たしていましたが、プログラムが正常に完了できませんでした。

**Path Cの判断基準**（v0.4で確立された新しい基準）：セッションBが、特定の失敗メカニズムを特定し、明示的な修正パスが存在し、かつ封じ込めテストの範囲が許容基準を満たし、防御機能が維持され、汚染が無害である場合、その判断は、パッチを適用し、同じオペレーターパスを修正後のバージョンに対して再実行し、再評価するというものです。封じ込めテストの再検証は行いません。人間の評価者はいません。v0.13のアーキテクチャ変更は行いません。

> **v0.4は、セクションの要件レベルで、研究OSのテスト範囲の基準を証明します。**
> **v0.12.1は、防御機能を弱めることなく、単一のプランナーのタイムアウトのボトルネックを解消することで、最終処理の基準を証明する必要があります。**

### 実行可能なもの

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

アクティブな設定は、`section-synthesis.json`ファイル（`planner_timeout_ms`は常に設定され、`planner_timeout_overridden_by`はオーバーライドされた場合にのみ表示）、ProseBlockのメタデータ、および標準エラー出力（`[synth] planner_timeout_ms=N source=… section=<id>`は、プロセスの生成前に出力されます）にあります。`synth section --help`コマンドは、このフラグ、デフォルト値、上限値（安全のための600000ms）、および環境変数の代替方法を説明しています。無効な値（負の値、ゼロ、数値以外の文字列、単位付きの文字列、600000を超える値）が入力された場合、エラーメッセージが非ゼロの終了コードで表示され、問題のある設定項目と値が示されます。デフォルトのフォールバックはありません。

### アーキテクチャに関する注意

v0.4の検証で確認された15000msの制限値は、`ollama-intern-mcp`（`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`）に設定されており、研究OSには設定されていません。R-018以前の研究OSでは、プランナーのタイムアウトは設定されていませんでした。タイムアウトは、ollama-intern-mcpのティアポリシーでサーバー側で適用されていました。R-018の修正により、研究OSがMCPの`callTool`の呼び出しに対して、`Promise.race`ラッパーを通じて独自の制限値を設定できるようになりました。デフォルト値は、実質的に観測されているInstantティアの制限値（15000ms）に設定されており、デフォルトの動作が維持されます。R-018のラッパーは、R-010の`classifyFallbackCause`正規表現（`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`）に一致する`TIER_TIMEOUT`型のエラーを生成し、デフォルトパスでのAIアドバイザーによる可視性を維持します。

### 防御機能は維持されています

R-018は、アーキテクチャの変更ではなく、オペレーター操作用の設定項目に関する変更です。R-002、R-003、R-005、R-007、R-008、R-009、R-010、R-011、R-012、R-013、R-014、R-015、R-016、R-017は、いずれも変更されていません。`accepted_claim_floor`は、引き続き変更できません。変更された列挙型はありません（`FailureShape`は9、`RECOVERY_ACTIONS`は8、`REGENERATION_REASONS`は3、`POLICY_KEYWORDS`は8、`POLICY_RELEVANT_SOURCE_TYPES`は1）。AIによる復旧に関するアドバイスのテンプレートは、変更されていません。MCPのアーキテクチャは変更されていません。`ollama-intern-mcp@^2.4.0`が引き続き適用されます。R-018では、`PLANNER_TIMEOUT_SOURCES`（3）が、他のゲートルーティングの列挙型とは異なる、新しいオペレーター関連の設定項目として追加されました。

すべての4つのフローズンパックについて、v0.3.3のベースラインと比較して、バイト単位で同一です。**16回目の連続リリース**で、この状態が維持されています。1542 → 1586。vitestの合格数が増加しました（+44）。R-018の受け入れテストも合格しました。

### v0.12.1で提供される機能

- v1の対応。
- v0.4のオペレーター関連機能の再テストの結果。v0.4の再テストは、`@mcptoolshop/research-os@0.12.1`を使用して、別のセッションで行われます。v0.12.1は、最終的な検証のための前提条件であり、それ自体が証明ではありません。
- Admissibility Slice 1。v0.4の再テストで合格したことが前提です。v0.4の基準（防御レベルの独立性が証明され、カバレッジレベルの独立性がセクションレベルで大幅に証明され、最終的な検証はv0.12.1待ち）は、引き続き固定されたテストです。
- v0.13の候補（F-2 R-009の監査↔抽出の差異、F-3の共同作業の引き継ぎの遅延、F-4 R-017の`POLICY_KEYWORDS`の範囲の狭さ）。最終的な検証とは独立しています。

詳細については、[CHANGELOG.md](CHANGELOG.md)を参照してください。

## 以前のバージョン: v0.12.0 — カバレッジと復旧に関するリリース

v0.12.0では、2026年5月16日に報告されたv0.3における「オペレーターの単独作業」に関する問題が解決されました（`operator_aloneness_dst_v0.3`）。この問題は、条件付きで合格（PASS_WITH_CONDITIONS）でしたが、認証レベルには達していませんでした。このバージョンでは、4つの領域にわたる6つの問題が修正されました。具体的には、v0.4の評価基準をクリアするためのアーキテクチャの修正（R-012、R-013、R-014）が3つ、そして、v0.4の評価で使用されるオペレーターインターフェースを改善するためのユーザビリティの改善（R-015、R-016、R-017）が3つです。

v0.3で問題が発生したのは、防御機能が弱体化したためではありません。すべての防御機能は、設計通りに正しく動作し、誤った情報を含まない正確な結果を生成しました。問題は、これらの防御機能が正しく動作した結果、重要な情報源からのデータが、許容される範囲から除外されたことです。v0.3で獲得された知識体系は以下の通りです。

v0.11では、システムを十分に安全にし、意図しない誤った結果が生じる可能性を排除しました。
v0.12では、その安全性を損なうことなく、より効果的にデータ収集を再開できるようになりました。

この論文の主張は以下の通りです：**保守的な防御策は、意図しない誤った合成を防ぐことができますが、同時に、必要な防御範囲を著しく狭めてしまう可能性があります。** バージョン0.12は、この問題を解決するためのものです。 バージョン0.11で設定された防御の最低限の基準は変更されていません。R-007からR-011までのすべての表面は、引き続き機能します。バージョン0.12では、合法的な、そして監視下での復旧経路が追加されています。

### 実行可能なもの

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

### 建築関連の修正点（v0.4：床の修正）

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

### 人間工学に基づいた3つの改良点（v0.4版、ゲート操作の改善）

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

### 制約

既存の制限事項は維持されます。`accepted_claim_floor` の値は変更できません。`FailureShape` 列挙型は、引き続き9つの値で構成されています。`RECOVERY_ACTIONS` 列挙型も、8つの値で変更されていません。新しいアドバイザリーアクションは追加されていません。R-014の形状に基づくヒューリスティックにより、既存のアクションのルーティングが拡張されます。AIによる復旧アドバイザリーのプロンプトテンプレートは変更されていません（新しい `EvidenceState` フィールドは保存されたJSONファイルで確認できますが、プロンプトには表示されません）。復旧検証ルールは変更されていません。MCPアーキテクチャは変更されていません。`ollama-intern-mcp@^2.4.0` が引き続き使用されます。抽出処理におけるMCPの呼び出し形状は変更されていません。R-017の警告は情報提供のみを目的としており、ゲートの判定、フリーズの受信、またはパックの公開に影響を与えません。v0.10およびv0.11のすべての防御機能は維持されており、防御の基準値はそのまま、v0.12ではそれに基づいて機能が拡張されています。

すべての4つのフローズンパックにおいて、v0.3.3を基準とした際のデータは、バイナリレベルで完全に一致しています。これは、今回で**15回目の連続リリース**であり、この状態が維持されています（v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12）。

### バージョン0.12.0で謳っている内容（に含まれる）もの

- v1 の準備状況。
- v0.4 の単独動作に関する検証結果。v0.4 は、別のセッションで npm パッケージ `@mcptoolshop/research-os@0.12.0` を使用して実行されます。
- 許容範囲の第1段階。v0.4 で合格 - v0.3 の原則（防御レベルでの単独動作が証明済みだが、カバレッジレベルでの単独動作はまだ検証されていない）が、引き続き主要なテスト項目です。
- クラウドベースの研究ツールに対する優位性。
- 完全な、信頼性の高いレビュー担当者評価モデル。

v0.12.0 は、オペレーターの独立性に関する機能 v0.4 を利用するための前提条件であり、証明ではありません。

詳細については、[CHANGELOG.md](CHANGELOG.md) を参照してください。また、管理者向けのオーバーライドの例は、[`examples/source-card-override.example.json`](examples/source-card-override.example.json) で確認できます。

## 以前のバージョン: v0.11.0 — オペレーター単独での問題修正に関するリリース（第2弾）

v0.11.0では、v0.2におけるオペレーターの単独動作によるエラー条件を修正しました。具体的には、スコープ/境界の修正 (R-007)、発見時のURLの関連性チェック (R-008)、抽出時およびフレーム評価層におけるペアリングされたソースコンテンツの汚染対策 (R-009 + R-011)、およびアドバイザーのフォールバック原因の可視化 (R-010) を実現しました。このバージョンでは、3層のソースコンテンツ保護機構 (受信時: R-008、抽出時: R-009、フレーム評価時: R-011) が実装されました。詳細は、[`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) をご参照ください。

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

### research-osが提供しないもの（およびv0.12.1が提供すると主張しないもの）

- 新しいパッケージで、オペレーター単独での動作が検証されていません。v0.12.0では、v0.3の課題（防御レベルでの単独動作が検証済み。カバレッジレベルでの単独動作はまだ検証されていません。v0.3で獲得された原則に基づいています）が解決されました。v0.4のテストでv0.12.0を評価した結果は、条件付きで合格（認証レベルではありません）でした。防御レベルは維持され、カバレッジレベルでの検証がセクションレベルで大幅に進んでいますが、最終段階で単一の障害モードが存在します。v0.12.1では、この単一の障害モードが修正されました（R-018）。v0.4の再テストは、このnpmリリースとは別のセッションで行われ、最終段階の検証の前提条件となります。
- 外部ユーザーによる本格的なテストは、内部テスト（dogfood）と、オペレーター単独での動作を検証する4つのテストに限定されています。6つの内部テストが完了しました。内訳は、自己参照型1つ、外部ドメイン型5つ（ComfyUI、XRPL、Godot、レビューアのキャリブレーション、決定論的なレビューア）。また、v0.1 / v0.2 / v0.3 / v0.4のオペレーター単独での動作を検証するテストで、18の既知の問題が特定されました（R-001～R-005はv0.10.0で、R-007～R-011はv0.11.0で、R-012～R-017はv0.12.0で、R-018はv0.12.1で修正されました）。大規模なオペレーター利用は、今後の課題です。
- 完全なパッケージ生成ツールではありません。v0.12.1は、v0.9のセクション範囲（`synth section`）と、部分的なパッケージ範囲（`synth pack --partial`）の機能を引き継いでいます。それぞれに、パッケージの利用可能状態に関する明示的な情報が記載されています。完全なパッケージの生成には、`synthesis_ready`のパッケージと、`synth workspace`を通じて承認されたIDに基づいて、人間（またはCowork）による記述が必要です。
- 特定のレビューアモデルを推奨するものではありません。v0.12.1には、デフォルトで`trusted_baseline`のレビューアプロファイルは含まれていません。キャリブレーションの記録は、推奨を意味するものではありません。既存のv0.6.0のキャリブレーション記録は、v0.8.0のMCPアーキテクチャ以前のものであり、MCPのパスで再検証されていません。詳細については、[レビューアのキャリブレーションに関するハンドブック](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/)を参照してください。
- 過去のアーティファクトが、フリーズされたパッケージに残っている可能性があります。v0.4以前のフリーズされたパッケージには、`research_os_version: '0.1.0'`という情報が含まれています。これは、v0.4以前にハードコードされた定数によるものです。この修正はv0.4.0で実装されましたが、以前のフリーズされたパッケージは、Law 15により変更できません（[`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)を参照）。
- npm上でのプロベナンス認証は行われていません。Sigstoreによるプロベナンス認証は、今後のリリースで実装される予定です。v0.12.1のnpmパッケージは、package-shasumとGitHubのリリースコミットで検証してください。
- クラウドベースの利点を克服したわけではありません。v0.7.xの`local-first-vs-cloud-research/`にある製品の検証では、クラウドの読みやすさやオペレーターの負担軽減という利点が示されています。v0.12.1は、これらの利点が克服されたことを主張するものではありません。

### 既知の制限事項

v0.12.1には、以前のリリースから引き継がれた、オペレーターが認識する既知の制限事項が3つ含まれています。それぞれが、[既知の制限事項に関するハンドブック](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)と[CHANGELOG.md](CHANGELOG.md)に記載されています。これらの制限事項は、リリースをブロックするものではなく、それぞれに、復旧または軽減策が定義されています。

- **B-E-001 — v0.4以前の固定パッケージ版のバージョン番号は、過去の遺物です。** v0.3.3からv0.6.0までに公開された固定パッケージは、`pack.manifest.json`および`pack/research.yaml`ファイル内で`research_os_version: "0.1.0"`という記述を持っています。これは、v0.4以前に設定されていた固定値によるものです。この問題はv0.4.0で修正されました（現在は、`RESEARCH_OS_VERSION`の最新値を参照します）。v0.4以前の固定パッケージは、Law 15により変更できません。影響を受けるパッケージ内のJSONファイルには、それぞれの最新バージョン情報が記載されています。
- **B-E-004 — npmのプロビナンス認証は、今後のリリースで実装される予定です。** v0.12.1のnpm tarballは、package-shasumのみで検証されます。公開フローをCIワークフローに移行し、sigstore OIDCを統合すると、公開前の翻訳プロセス（TranslateGemma 12Bはローカルで実行されます）との競合が発生するため、この移行は今後のリリースで計画されています。v0.12.1のnpmパッケージは、package-shasumとGitHubのリリースコミットを使用して検証してください。
- **B-A-003 — インデクサのスキーマバージョンの移行は、ドキュメントに記載されていますが、強制ではありません。** v0.12.1には、書き込み側の`SCHEMA_VERSION`という整数値が含まれていますが、読み込み側の移行ツールはありません。ドキュメントに記載されている`SCHEMA_VERSION`の変更を行う場合は、`.research-os/index.sqlite`ファイルを削除し、`research-os index build --all`コマンドを再度実行してください。パッケージ自体には影響はありません。インデクサは、エビデンスとクレームを高速化するレイヤーであり（Law 8）、再構築は冪等です。

**v0.12.1では、`trusted_baseline`のレビューアプロファイルは許可されていません。** これは、意図的なセキュリティ設定であり、欠陥ではありません。リポジトリ内のキャリブレーションの記録（`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`）は、その証拠を示しています。信頼は、繰り返される意図的な失敗の再現によって得られるものであり、当然のことではありません。これらの記録は、v0.8.0のMCPアーキテクチャ以前のものであり、MCPのパスで再評価されていません。

## v1.0 へのロードマップ

v1.0は、リリース日ではなく、達成される状態です。6つの内部テスト（Exp1～Exp6、2026年5月8日～2026年5月11日）が完了し、それぞれが[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)に登録される研究用パッケージを生成しました。このプロジェクトは、v0.2.0の`research-os pack publish`機能とパターン2（実験2）、v0.3.0の`--detector`フラグ（F-09）、v0.3.1のセクションごとの例外規定（F-10/F-11）、v0.3.2の標準化された承認済み請求処理（F-36）、v0.3.3のゲートのセマンティクスに関する明確化（F-43/F-41）、v0.4.0のソースコードの整合性（F-27/F-47/F-46）、v0.5.0のレビュー担当者の調整（F-48/F-49/F-50）、およびv0.6.0の決定論的なレビュー担当者基準（F-53/F-54）を達成しました。v1.0のリリース準備は、複数の段階で構成される品質向上プロセスを通じて現在進行中です。アーキテクチャの固定は、このプロセス全体を通して維持されます。詳細な計画は[`docs/roadmap.md`](docs/roadmap.md)に記載されています。

## ライセンス

MIT
