<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.3.1"><img src="https://img.shields.io/badge/version-0.3.1-blue" alt="version 0.3.1"></a>
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

Frozen packs（凍結されたパッケージ）は、[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) にアーカイブされており、公開されており、初期の2つのパッケージが含まれています。v1.0のロードマップについては、[`docs/roadmap.md`](docs/roadmap.md) を参照してください。

v0.1は、2つの内部テスト（dogfood）で検証されました。最初のテストでは、research-osが自身の仕様を調査する中で、v0.1.0 リリース前に7つの問題（正当性の欠如）が発見され、それぞれにコードの修正が必要となり、関連するルールまたは統合パターンが確立されました。2番目のテスト（v1 Experiment 1: ComfyUIワークフローの安定性、11セッション、research-osとの語彙の重複がない環境）は、2026年5月9日に完了し、パッケージが凍結され、アーカイブが公開され、Pattern 2の適用がコミット `22b5dba` によって完了しました。v0.1の検証結果は、[`docs/dogfood-proof.md`](docs/dogfood-proof.md) に、Experiment 1の検証結果は、[`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) に記載されています。ハンドブックは、<https://mcp-tool-shop-org.github.io/research-os/handbook/> で確認できます。

## インストール

**必要条件:** Node.js ≥ 20

```bash
npm install -g @mcptoolshop/research-os
```

ソースコードからビルドする開発者の皆様へ：

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

## ステータス

**v0.3.1** — 2026年5月9日に、npmで `@mcptoolshop/research-os@0.3.1` として公開されました。セクションごとに適用されるソースコードの免責条項 (`primary_source_waiver.section_waivers[]`) と、レビュアーによる承認が含まれています。これにより、セクション全体で `source_cluster_monopoly` の問題が発見された場合でも、それが明示的な注意点として表示され、すべての問題を `needs_source_repair` に自動的に振り分けることはありません。これは、Experiment 3 XRPL パッケージの Session 2 で得られた成果です。この成果により、パブリッシャーの多様性が真の品質の指標であるという前提が覆されました。540/540 の vitest が合格しました。詳細については、[CHANGELOG.md](CHANGELOG.md) および [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) を参照してください。

**セクションごとのソースコード免責条項** — これは、パブリッシャーの多様性がセクションの真のソースと構造的に相容れない場合にのみ使用します。単にセクションが十分なソースを見つけられなかった場合に適用するものではありません。スキーマによって強制される `reason` と、空でない `compensating_controls[]` が必要です。パッケージポリシー `primary_source_waiver_allowed: false` は、パッケージレベルおよびセクションごとの免責条項の両方をブロックします。v0.3.1以前のパッケージレベルの `min_independent_publishers: 0` という回避策は、現在は非推奨です。既存の凍結されたパッケージは、既存の条件で引き続き有効です。詳細については、[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) および [research-packs オペレータープレイブック](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md) を参照してください。

**v0.3.0** — 2026年5月9日に公開されました。`contradict map` コマンドに、`--detector <auto|heuristic|ollama-intern>` フラグが追加されました（Experiment 3 Session 1 の XRPL パッケージからの F-09 チェーンブロッカーの修正）。この時点で、527/527 の vitest が合格しました。検出器の選択は、以前の状態依存の環境変数設定ではなく、オペレーターが明示的に選択するようになりました。モードは、実行ごとに可視化されます。詳細については、[`docs/contradict-map.md`](docs/contradict-map.md) を参照してください。

**v0.2.0** — 2026年5月9日に公開されました。`research-os pack publish` コマンド（Experiment 2）と、Pattern 2 の準備状態に関する修正が追加されました。この時点で、515/515 の vitest が合格しました。詳細については、[CHANGELOG.md](CHANGELOG.md) を参照してください。凍結されたパッケージは、単一のコマンドで、標準の `research-packs` アーカイブにエクスポートされます。承認プロセスは、チェックリストではなく、コードによって強制されます。詳細については、[`docs/pack-publish.md`](docs/pack-publish.md) を参照してください。

**v0.1.0** — 2026年5月8日に固定されました。`research-os-packs/research-os-spec/` (関連リポジトリ) にある「dogfood」パッケージでは、8つのセクションで296件の主張が承認され、17件が処理され、30件がオペレーターによって修正され、未解決の矛盾は0件、すべてのゲートで `synthesis_eligible=true` となりました。463件中463件のvitestテストが合格しました。16個の重要なルールが実装されています。詳細については、[docs/dogfood-proof.md](docs/dogfood-proof.md) を参照してください。このドキュメントには、7つの発見事項と、固定状態のフィンガープリントが記載されています。

**research-packs アーカイブモノレポ** — [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) で公開されており、初期の2つのパッケージが含まれています。`comfyui-workflow-durability`（Experiment 1、302件のクレームが承認、8セクション）と、`research-os-self-dogfood`（v0.1 の内部テストの補完、296件のクレームが承認、8セクション）。両方のパッケージは、`verify-pack.mjs` に合格しています。

**v1 Experiment 1 (ComfyUIワークフローの安定性)** — 2026年5月9日に完了しました。Terminal A のすべての8セクションで検証され、パッケージが凍結され、アーカイブが公開されました。詳細については、[`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) および [`docs/roadmap.md`](docs/roadmap.md) を参照してください。

### v0.1の制限事項

- 外部ユーザーによる実証テストはまだ実施されていません。2つの内部テストフェーズが完了しました。1つは自己参照型、もう1つは外部ドメイン型です。また、実験3（外部からのプレッシャー下でのAPIの安定性）は進行中です。3つ目のパック（XRPLクリエイタートークンの耐久性）は、v0.3.0の`--detector`フラグとv0.3.1のセクションスコープ付きソース免除の条件を満たしました。実験3を完了するには、さらに2つの外部ドメインのパックが必要です。
- これは、コンテンツ生成AIではありません。`synth workspace`コマンドは、構造化された作業環境を生成します。人間（またはCowork）が、承認されたクレームIDに基づいて文章を作成します。
- APIは、セマンティックバージョニング（semver）に基づいて安定していません。v1.0.0は、特定の期日ではなく、達成すべき状態です。詳細については、[`docs/roadmap.md`](docs/roadmap.md)を参照してください。このドキュメントには、v1.0.0を達成するために必要な6つの実験が記載されています。

### 既知の制限事項

- **抽出元の情報が、ゲートの接合部分では表示されません。** セクションは、キャリブレーションされた抽出器（設定されたモデルを使用したOllama）が利用できない場合でも、ヒューリスティックに基づく代替クレームを利用して、承認されたクレームの基準を満たすことができます。これは、ロードマップの実験4として記録されており、今後の改善により、抽出器ごとに承認されたクレームが報告され、基準を満たす数の承認されたクレームが、キャリブレーションされたパスから取得されるようになります。
- **キャリブレーションされた`hermes-two-pass`を基準とする、レビューモデルの選択に関する問題は未解決です。** 内部テストフェーズでは、1つのレビュー設定が検証されました。代替モデルは、信頼できるようになる前に、独自のシードされた失敗の再現キャリブレーションが必要です。これは、ロードマップの実験5です。
- **v0.1の内部テストで使用されたのは、`mistral-nemo:12b`という抽出モデルです（標準のデフォルトは`hermes3:8b`）。** v0.1のテスト期間中、この環境では`hermes3:8b`が利用できませんでした。この代替モデルの使用については、`hermes3`ベースのモデルが利用可能になるまで、その旨が明記されます。`hermes3:8b`が利用できない環境では、`OLLAMA_INTERN_MODEL`を、利用可能なモデルに設定してください。オペレーターが事前に設定したURLを使用し、クエリの精度に注意することで、曖昧なトピックに関する誤った情報の生成を抑制できます（詳細は、ハンドブックを参照）。

## v1.0へのロードマップ

v1.0は、リリース日ではなく、達成すべき状態です。v0.1からv1.0までの間に、6つの実験が残されています。これには、自己参照ではない内部テスト（現在、ComfyUIワークフローの耐久性に関するパックとして進行中）、`research-os pack publish`コマンド（これは、`research-packs`という単一リポジトリへのエクスポートを自動化します。実験2であり、実験1の手動での完了の後に実施されます）、外部からのプレッシャー下でのAPIの安定性、抽出元の情報の可視化、`hermes-two-pass`を超えるレビューのキャリブレーションの一般化、そして`hermes3:8b`を使用したクリーンなベースラインの実行が含まれます。実験1は、パックが凍結される時点では完了していません。これは、凍結されたパックが、`research-packs`という単一リポジトリで、v0.1の内部テストパックと一緒に最初のパッケージとしてリリースされたときに完了します。詳細な計画については、[`docs/roadmap.md`](docs/roadmap.md)を参照してください。アーキテクチャのロックは、このプロセス全体を通して維持されます。v1.0は、v0.1で証明された内容をさらに深めるものであり、以前の内容を再検討するものではありません。

## ライセンス

MIT
