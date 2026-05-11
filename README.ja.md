<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os`は、オープンエンドなテーマを、構造化されたリポジトリである「**research-pack**」へと変換する、ローカルファーストのCLIツールです。このリポジトリでは、Claude、Cowork、または複数のエージェントが、誤った情報を生成したり、調査を単純化したりすることなく、何時間も作業することができます。

## 概要

`research-os`は、「Xについて調査したい」という意図と、検証可能な証拠に基づいた成果物との間の制御システムです。これは、調査のヒントと証拠の収集、生の抽出と検証済みの主張、矛盾の検出と解決、そしてレビューの判断と統合の準備状況を分離します。各ステップは、追記のみ可能なログに記録され、すべての準備完了の判断は、これらのログに基づいて計算され、断定的に主張されるものではありません。

これはレポート生成ツールではありません。また、LLMのオーケストレーションのフレームワークでもありません。あなたの統合作業を自動化するものでもありません。`research-os`は、統合作業を開始するための条件を強制します。

Frozen packs は、[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) にアーカイブされており、現在利用可能です。これには、6つのクローズドな内部テスト（dogfood）実験で作成された4つのパッケージが含まれています。v1.0 のロードマップについては、[`docs/roadmap.md`](docs/roadmap.md) を参照してください。

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

> **`freeze` コマンドの出力に関する注意点:** `research-os freeze` コマンドは、すべての関連ファイルをスキャンし、コンテンツハッシュを計算するため、実行中は何も表示されません。このコマンドは、大きなパッケージの場合、何も出力しない状態で数十秒かかることがあります。完了すると、単一の判定ブロック (`PASS` / `REFUSED` と、関連ファイルのパス) が表示されます。この間隔を、プログラムが停止したと解釈しないでください。

> **`--force` オプションに関する警告:** `--force` オプションは、ターゲットのパッケージディレクトリをクリアし、新しい内容で置き換えます。生成されたパッケージの内容に、手動で作成したファイルを含めないでください。代わりに、元のファイル（クレーム、ソース、合成）または関連ファイルを編集してください。完全な契約と拒否のケースについては、[`docs/pack-publish.md`](docs/pack-publish.md) を参照してください。

**具体的な使用例**については、`research-os-packs/research-os-spec/` にある「dogfood」と呼ばれるパッケージを参照してください。このパッケージには、すべてのファイル、すべての記録、すべての処理結果、すべての固定状態のフィンガープリントなどが、追記のみ可能なファイルとして保存されています。このパッケージによって、`docs/dogfood-proof.md` が生成されました。

**LLM（大規模言語モデル）の抽出、トリアージ、レビュー、および発見には、ローカルで実行されている [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) が必要です。** デフォルトのモデルは `hermes3:8b` です。別のモデルを使用する場合は、`OLLAMA_INTERN_MODEL=<モデル名>` で指定してください。Ollamaがデフォルトの `localhost:11434` 以外の場所で実行されている場合は、`OLLAMA_HOST` 環境変数を設定してください。

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

## ステータス

**v1.0.0** — 2026年5月11日に、`@mcptoolshop/research-os@1.0.0` として npm に公開されました。v1.0.0 は、契約に基づいたリリースです。ワークフローは検証済みであり、エラーが発生する可能性は開示されており、合成は証拠に基づいてのみ許可されます。**`research-os` は、デフォルトでは信頼できるレビューアモデルを搭載していません。** レビューアプロファイルを検証、拒否、または条件付きで許可するための仕組みを提供します。 4段階の内部テスト（A: バグ/セキュリティ、B: 積極的な安定性、C: 運用者の使いやすさ、D: プレゼンテーションの改善）を実施し、23のプロダクションコードファイルに188個の新しいテストを追加し、+14個のドキュメント/サイトファイル、+2個の新しいヘルパーモジュール (`src/cli/help-topics.ts`, `src/util/progress.ts`) を追加しました。 2つの修正による改善（A-RE-001: コールマイグレーション、C2-RE-001: クロスドメインの取得）に基づいて、クロスドメインの連携に関するドキュメントを策定しました。 `--force` オプションの動作は、8つの箇所で完全に一致するように検証テストで確認されています。12個の `ResearchOSError` サブクラスに対して、エラーハンドブックへのポインタを付与しました。 `research-os help <topic>` コマンドで、静的なリカバリー機能（4つのトピックがロックされています）を提供します。 `--no-progress` / `--progress` オプションで、TTY検出によるスレッド制御を、レビュー/収集/矛盾検出/パッケージ公開の各段階で、ミューテックスセマンティクスを適用します。 **信頼できるベースラインは許可されていません。** **4つの frozen packs は、すべて v0.3.3 のベースラインに対して、バイト単位で検証されています。** 901/901 の vitest が合格しました。既知の制限事項は、[CHANGELOG.md](CHANGELOG.md) および [`handbook/known-limitations.md`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) に記載されています。 frozen-pack のバージョン情報（B-E-001）、npm のプロビナンス認証（B-E-004）、インデックススキーマのバージョン移行は、自動移行ではなく、情報公開ベース（B-A-003）です。 [`docs/release-notes/v1.0.0.md`](docs/release-notes/v1.0.0.md) および [`docs/v1-dogfood-swarm-proof.md`](docs/v1-dogfood-swarm-proof.md) を参照してください。

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

**research-packs アーカイブモノレポ** — [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) で公開されており、以下の4つのパッケージが含まれています: `research-os-self-dogfood` (v0.1 の内部テストのバックフィル、296件のクレームが承認、8つのセクション)、`comfyui-workflow-durability` (実験1、302件のクレームが承認、8つのセクション)、`xrpl-creator-token-durability` (実験3 のパッケージ #2)、および `godot-export-runtime-durability` (実験3 のパッケージ #3)。 すべてのパッケージは、`verify-pack.mjs` を `PASS` しています。

**v1 実験1 (ComfyUI ワークフローの安定性)** — 2026年5月9日に終了。8つのセクションすべてが Terminal A で完了し、パッケージは凍結され、アーカイブは公開されました。詳細は [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) と [`docs/roadmap.md`](docs/roadmap.md) を参照してください。

### v0.1の制限事項

- 外部ユーザーによる実戦テストは、内部テスト段階にとどまっています。6つの内部テストが完了しました（自己参照型1つ、外部ドメイン関連型5つ：ComfyUI、XRPL、Godot、レビュー担当者調整、決定論的レビュー担当者）、しかし、大規模な外部オペレーターの利用は今後の課題です。
- これは、コンテンツ生成AIではありません。`synth workspace` コマンドは、構造化された作業環境を生成します。コンテンツは、人間（またはCowork）が、承認されたクレームIDに基づいて記述します。
- いかなるレビュー担当者モデルも推奨するものではありません。v1.0には、デフォルトで`trusted_baseline`という信頼できるレビュー担当者プロファイルは含まれていません。キャリブレーションの記録は、推奨を意味するものではありません。詳細は、[レビュー担当者調整に関するマニュアルページ](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/) を参照してください。
- 過去のアーティファクトが、一部のパッケージに含まれている可能性があります。v1.0以前のパッケージには、`research_os_version: '0.1.0'`というバージョン情報が含まれています。これは、v0.4以前の初期設定によるものです。この問題は修正されましたが、過去のパッケージはLaw 15により変更できません（[`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) を参照）。
- npm上でのプロヴェナンス認証は、v1.x以降で実装予定です。v1.0のnpmパッケージは、package-shasumとGitHubのリリースコミットを使用して検証してください。

### 既知の制限事項

v1.0には、オペレーターが認識する既知の制限事項が3つ含まれています。それぞれの制限事項は、[既知の制限事項に関するマニュアルページ](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) および [CHANGELOG.md](CHANGELOG.md) に記載されています。これらの制限事項は、リリースを妨げるものではなく、それぞれに復旧または軽減策が定義されています。

- **B-E-001 — v1.0以前のパッケージのバージョン情報は、過去の遺物です。** v0.3.3からv0.6.0までに公開されたパッケージには、`pack.manifest.json` および `pack/research.yaml` に `research_os_version: "0.1.0"` が含まれています。これは、v0.4以前の初期設定における固定値によるものです。この問題はv1.0で修正されました（scaffoldは現在、実行中の `RESEARCH_OS_VERSION` をインポートします）。既存のパッケージは、Law 15により変更できません。影響を受けるパッケージ内のJSONファイルには、それぞれの最新バージョン情報が含まれています。
- **B-E-004 — npmのプロヴェナンス認証は、v1.x以降で実装予定です。** v1.0のnpm tarballは、package-shasumのみで検証できます。公開プロセスをCIワークフローに移行し、sigstore OIDCを統合することは、公開前の翻訳という原則（TranslateGemma 12Bはローカルで実行）と競合するため、この移行はv1.xで計画されています。v1.0のnpmパッケージは、package-shasumとGitHubのリリースコミットを使用して検証してください。
- **B-A-003 — インデックスのスキーマバージョンの移行は、文書化されていますが、強制されていません。** v1.0には、書き込み側の`SCHEMA_VERSION`という整数型パラメータが含まれていますが、読み込み側の移行ツールはありません。文書化された`SCHEMA_VERSION`の変更があった場合、`.research-os/index.sqlite`を削除し、`research-os index build --all` を再実行してください。パッケージ自体には影響はありません。インデックスは、エビデンスとクレームに対する加速レイヤーであり（Law 8）、再構築は冪等です。

**v1.0では、`trusted_baseline`という信頼できるレビュー担当者プロファイルは提供されていません。** これは、意図的な信頼性の設定であり、欠陥ではありません。リポジトリ内のキャリブレーション記録（`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`）は、その証拠を記録しています。信頼は、繰り返し行われる意図的な失敗の再現によって得られるものであり、当然のことではありません。

## v1.0 へのロードマップ

v1.0は、リリース日ではなく、達成される状態です。6つの内部テスト（Exp1～Exp6、2026年5月8日～2026年5月11日）が完了し、それぞれが[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)に登録される研究用パッケージを生成しました。このプロジェクトは、v0.2.0の`research-os pack publish`機能とパターン2（実験2）、v0.3.0の`--detector`フラグ（F-09）、v0.3.1のセクションごとの免責事項（F-10/F-11）、v0.3.2の標準化された承認申請処理（F-36）、v0.3.3のゲートのセマンティクスに関する明確化（F-43/F-41）、v0.4.0のソースコードの整合性（F-27/F-47/F-46）、v0.5.0のレビュー担当者の調整（F-48/F-49/F-50）、およびv0.6.0のレビュー担当者向けの基準値（F-53/F-54）を達成しました。v1.0のリリース準備は、複数の段階で構成される品質向上プロセスを通じて現在進行中です。アーキテクチャの固定は、このプロセス全体を通して維持されます。詳細な計画は[`docs/roadmap.md`](docs/roadmap.md)に記載されています。

## ライセンス

MIT
