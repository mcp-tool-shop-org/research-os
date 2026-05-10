<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.3.3"><img src="https://img.shields.io/badge/version-0.3.3-blue" alt="version 0.3.3"></a>
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

Frozen packs（凍結されたパッケージ）は、[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)にアーカイブされており、ライブで公開されています。最初の2つのパッケージが含まれています。v1.0のロードマップについては、[`docs/roadmap.md`](docs/roadmap.md)を参照してください。

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

**v0.3.3** — npmに `@mcptoolshop/research-os@0.3.3` として公開されました。2026年5月10日。Pack-3（Godotのエクスポート/ランタイムの安定性、実験3のパック#3のうち3つ目）によって獲得された、ゲートセマンティクスの明確化が含まれています。ゲートの出力には、セクションごとの発行者と主要なカウントに加えて、全体的なカウントが表示されるようになりました（F-43）。`no_source_cluster_monopoly` は、警告から情報診断に変更されました（F-41）。**合格/不合格の動作は変更されていません。既存の固定されたパックは、バイト単位で完全に同一であることを検証します。** 570/570 の vitest が合格しました。詳細は [CHANGELOG.md](CHANGELOG.md) および [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) を参照してください。

**v0.3.2** — 2026年5月9日に、`@mcptoolshop/research-os@0.3.2`としてnpmに公開されました。`pack publish`の許可に関する、正規化された承認処理が実装されました。`claim-reviews.jsonl`と`pack-audit.json::accepted_claims`の厳密な一致チェックは、効果的な集合比較に置き換えられました。承認されたクレームは、最新の正当なレビュー結果が`accepted_for_synthesis`である一意の`claim_id`の集合です（`claim_id`ごとに最新の決定が優先されます）。以前の監査数が効果的な集合と異なる凍結されたパッケージは、拒否する代わりに警告を表示します。古い監査ファイルは変更せずに保持されます（ルール15）、ただし、アーカイブのマニフェストには正規化された数が反映されます。フェイクの`claim_id`、互換性のない重複した決定、および合成対象外の条件に対する拒否は引き続き適用されます。Experiment 3 XRPLパッケージのSession Kで、実際のクロージャー・レジャーの不一致により、パッケージの公開が拒否されました（セクション07には24件の`accepted_for_synthesis`の行がありましたが、重複するレビュー担当者によるため、一意の`claim_id`は19件のみでした）。558/558のvitestが成功しました。詳細については、[CHANGELOG.md](CHANGELOG.md)と[`docs/pack-publish.md`](docs/pack-publish.md)を参照してください。

**v0.3.1** — 2026年5月9日に、`@mcptoolshop/research-os@0.3.1`としてnpmに公開されました。セクションごとに適用されるソースコードの免除（`primary_source_waiver.section_waivers[]`）と、レビュー担当者による確認機能が追加されました。これにより、セクション全体で`source_cluster_monopoly`の違反が検出された場合でも、自動的にすべてのクレームを`needs_source_repair`に振り分けるのではなく、注意点として表示されるようになりました。Experiment 3 XRPLパッケージのSession 2で、canonical-protocolセクション（単一の基盤チェーン、クローズドなAPI仕様、標準化団体のドキュメント）において、パブリッシャーの多様性が真の品質の指標であるという前提が覆されました。当時、540/540のvitestが成功しました。詳細については、[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)を参照してください。

**セクションごとのソースコード免除** — パブリッシャーの多様性がセクションの真のソースと構造的に互換性がない場合にのみ使用します。セクションが単に十分なソースを見つけられなかった場合ではありません。スキーマによって強制される`reason`と、空でない`compensating_controls[]`が必要です。パッケージポリシー`primary_source_waiver_allowed: false`は、パッケージレベルおよびセクションごとの免除の両方をブロックします。v0.3.1以前のパッケージレベルの`min_independent_publishers: 0`の回避策は、現在非推奨です。既存の凍結されたパッケージは、既存のレシートに基づいて有効です。詳細については、[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)と、[research-packsオペレータープレイブック](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)を参照してください。

**v0.3.0** — 2026年5月9日に公開されました。`contradict map`に、`--detector <auto|heuristic|ollama-intern>`フラグが追加されました（Experiment 3 Session 1、XRPLパッケージのF-09チェーンブロッカーの修正）。当時、527/527のvitestが成功しました。検出器の選択は、以前の状態に依存する環境変数ではなく、オペレーターが明示的に選択するようになりました。モードは、実行ごとに可視化されます。詳細については、[`docs/contradict-map.md`](docs/contradict-map.md)を参照してください。

**v0.2.0** — 2026年5月9日に公開。`research-os pack publish` (実験2) と、Pattern 2 の準備状態に関する問題を修正しました。515件中515件の vitest テストが合格しました。詳細は [CHANGELOG.md](CHANGELOG.md) を参照してください。パッケージの公開は、単一のコマンドで標準の `research-packs` アーカイブにエクスポートされます。契約の遵守は、チェックリストではなくコードによって強制されます。詳細は [`docs/pack-publish.md`](docs/pack-publish.md) を参照してください。

**v0.1.0** — 2026年5月8日に固定されました。`research-os-packs/research-os-spec/` (関連リポジトリ) にある「dogfood」パッケージでは、8つのセクションで296件の主張が承認され、17件が処理され、30件がオペレーターによって修正され、未解決の矛盾は0件、すべてのゲートで `synthesis_eligible=true` となりました。463件中463件のvitestテストが合格しました。16個の重要なルールが実装されています。詳細については、[docs/dogfood-proof.md](docs/dogfood-proof.md) を参照してください。このドキュメントには、7つの発見事項と、固定状態のフィンガープリントが記載されています。

**research-packs アーカイブ (モノレポ)** — [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) で公開されており、リリース時に2つのパッケージが提供されています。`comfyui-workflow-durability` (実験1、302件の承認済みクレーム、8セクション) と `research-os-self-dogfood` (v0.1 のドッグフード版、296件の承認済みクレーム、8セクション)。どちらのパッケージも `verify-pack.mjs` をパスしています。

**v1 実験1 (ComfyUI ワークフローの安定性)** — 2026年5月9日に終了。8つのセクションすべてが Terminal A で完了し、パッケージは凍結され、アーカイブは公開されました。詳細は [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) と [`docs/roadmap.md`](docs/roadmap.md) を参照してください。

### v0.1の制限事項

- 外部ユーザーによる実戦テストは行われていません。3つの内部テストフェーズが終了しました。1つは自己参照型、2つは外部ドメイン型です。実験3（外部からのプレッシャー下でのAPIの安定性）は、**2026年5月10日に完了しました**。3つのパック（ComfyUI、XRPL、Godot）は、v0.3.xのCLIインターフェースに変更を加えることなく、安定版に到達しました。このフェーズでは、v0.3.0の`--detector`（F-09）、v0.3.1のセクションごとの免責事項（F-10/F-11）、v0.3.2の標準化された承認済みトランザクション処理（F-36）、およびv0.3.3のゲートセマンティクスの明確化（F-43/F-41）が実現されました。
- 合成テキストの生成機能はありません。`synth workspace` コマンドは、構造化されたワークスペースを生成します。人間（または Cowork）が、承認されたトランザクションIDに基づいてテキストを作成します。
- セマンティックバージョニング（semver）に基づくAPIの安定性はありません。v1.0.0 は、予定日ではなく、達成すべき目標です。詳細については、[`docs/roadmap.md`](docs/roadmap.md) を参照してください。このドキュメントには、その目標を達成するための6つの実験が記載されています。

### 既知の制限事項

- **抽出元の情報が、ゲートシームでは表示されません。** セクションは、キャリブレーションされた抽出器 (Ollama と設定されたモデル) が利用できない場合に、ヒューリスティックに基づく代替クレームに依存して、承認済みクレームの基準を満たすことができます。これは、ロードマップの実験4として記録されています。今後の改善により、承認済みクレームは抽出器ごとに報告され、基準を満たす数の承認済みクレームが、キャリブレーションされたパスから取得されるようになります。
- **キャリブレーションされた `hermes-two-pass` を基準とする、レビューモデルの選択は未解決です。** ドッグフードテストでは、1つのレビュー設定が検証されました。代替モデルは、信頼できるようになる前に、独自のシードされた失敗の再現キャリブレーションが必要です。これは、ロードマップの実験5です。
- **v0.1 の自己ドッグフードパッケージでは、抽出に `mistral-nemo:12b` が使用されました (標準のデフォルトは `hermes3:8b`)。** v0.1 のテスト期間中、この環境では `hermes3:8b` が利用できませんでした。この代替の使用に関する情報は、`hermes3` ベースの記録が作成されるまで有効です。`hermes3:8b` が利用できない環境では、`OLLAMA_INTERN_MODEL` を利用可能なモデルに設定してください。オペレーターが事前に設定した URL と、クエリの精度に関するルール (ハンドブックを参照) を使用することで、あいまいなトピックに関する誤った情報の検出を軽減できます。

## v1.0 へのロードマップ

v1.0は、単なるリリース日ではなく、達成される状態です。v0.1からv1.0までの間に、6つの実験段階があります。これには、自己参照を含まない内部テスト（現在はComfyUIワークフローの安定性向上パックとして進行中）、`research-os pack publish`コマンドによる、標準的な`research-packs`モノレポへの自動エクスポート（実験2。実験1の手動での完了処理の後に行われる）、外部からのプレッシャーに対するAPIの安定性、抽出元の追跡機能の確立、`hermes-two-pass`を超えるレビューアの調整の一般化、そして`hermes3:8b`上でのクリーンなベースラインの実行が含まれます。実験1は、パッケージの最終版が作成される前に完了しません。これは、v0.1の内部テストが完了し、`research-packs`モノレポの最初のパッケージとしてリリースされる際に終了します。詳細な計画は、[`docs/roadmap.md`](docs/roadmap.md)に記載されています。アーキテクチャの設計は一貫して維持され、v1.0は、v0.1で検証された内容をさらに深めるものであり、以前の段階を再検討するものではありません。

## ライセンス

MIT
