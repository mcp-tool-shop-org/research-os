<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os`は、オープンエンドなテーマを、構造化されたリポジトリである「**research-pack**」へと変換する、ローカルファーストのCLIツールです。このリポジトリでは、Claude、Cowork、または複数のエージェントが、誤った情報を生成したり、調査を単純化したりすることなく、何時間も作業することができます。

## 概要

`research-os`は、「Xについて調査したい」という意図と、検証可能な証拠に基づいた成果物との間の制御システムです。これは、調査のヒントと証拠の収集、生の抽出と検証済みの主張、矛盾の検出と解決、そしてレビューの判断と統合の準備状況を分離します。各ステップは、追記のみ可能なログに記録され、すべての準備完了の判断は、これらのログに基づいて計算され、断定的に主張されるものではありません。

これはレポート生成ツールではありません。また、LLMのオーケストレーションのフレームワークでもありません。あなたの統合作業を自動化するものでもありません。`research-os`は、統合作業を開始するための条件を強制します。

**v0.1は、これまでに一度だけ、自分自身に対して使用されました。** その単一の使用により、`research-os`の7つの問題点が発見され、今回の**リリース**前にすべて修正されました。その検証プロセス（7つのセッション、2つの統合パターン、463個のvitestテストケース、1つの固定されたリポジトリ）は、[`docs/dogfood-proof.md`](docs/dogfood-proof.md)に記録されています。詳細なドキュメントはこちら：<https://mcp-tool-shop-org.github.io/research-os/handbook/>。

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

## インストール

**必要条件:** Node.js ≥ 20

```bash
# From source (v0.1.0 is not yet published to npm)
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link   # makes `research-os` available on your PATH
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
```

**具体的な使用例**については、`research-os-packs/research-os-spec/` にある「dogfood」と呼ばれるパッケージを参照してください。このパッケージには、すべてのファイル、すべての記録、すべての処理結果、すべての固定状態のフィンガープリントなどが、追記のみ可能なファイルとして保存されています。このパッケージによって、`docs/dogfood-proof.md` が生成されました。

**LLM（大規模言語モデル）の抽出、トリアージ、レビュー、および発見には、ローカルで実行されている [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) が必要です。** デフォルトのモデルは `hermes3:8b` です。別のモデルを使用する場合は、`OLLAMA_INTERN_MODEL=<モデル名>` で指定してください。Ollamaがデフォルトの `localhost:11434` 以外の場所で実行されている場合は、`OLLAMA_HOST` 環境変数を設定してください。

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

**v0.1.0** — 2026年5月8日に固定されました。`research-os-packs/research-os-spec/` (関連リポジトリ) にある「dogfood」パッケージでは、8つのセクションで296件の主張が承認され、17件が処理され、30件がオペレーターによって修正され、未解決の矛盾は0件、すべてのゲートで `synthesis_eligible=true` となりました。463件中463件のvitestテストが合格しました。16個の重要なルールが実装されています。詳細については、[docs/dogfood-proof.md](docs/dogfood-proof.md) を参照してください。このドキュメントには、7つの発見事項と、固定状態のフィンガープリントが記載されています。

### v0.1の制限事項

- 外部ユーザーによる十分なテストは行われていません。初期のテストで7つのバグが見つかりました。
- まだnpmには登録されていません。`npm publish` が行われるまでは、ソースコードからインストールしてください。
- 合成処理を行う機能はありません。`synth workspace` コマンドは、構造化された作業環境を生成しますが、承認された主張IDに基づいて、人間（または Cowork）が文章を作成します。
- APIの安定性はありません（セマンティックバージョニングに準拠していません）。外部ユーザーによる検証が完了した後、v1.0.0 がリリースされます。

### 既知の制限事項

- **抽出器の信頼性情報が、ゲートの接合部分からは確認できません。** キャリブレーションされた抽出器（設定されたモデルを使用するOllama）が利用できない場合、システムはヒューリスティックに基づく代替的な方法で処理を進める可能性があります。これは既知の弱点として記録されており、今後の改善では、抽出器が提供する信頼性の高い情報と、キャリブレーションされた経路からの信頼性の高い情報の両方が必要になるように変更される予定です。
- **キャリブレーションされた`hermes-two-pass`を基準とした、レビューモデルの選択に関する問題は未解決です。** 内部テストでは、特定のレビュー設定が検証されましたが、他のモデルについては、信頼できるようになる前に、意図的なエラーを再現するキャリブレーションが必要です。
- **内部テストで使用されたパッケージは、抽出処理に`mistral-nemo:12b`を使用しました（標準設定は`hermes3:8b`です）。** システムは、自己参照的なセクション名に対して、誤ったドメインからの結果を生成する可能性がありましたが、クエリの精度を向上させるための対策（マニュアルを参照）と、曖昧なトピックに対するオペレーターによる事前準備されたURLを使用することで、この問題を修正しました。

## ライセンス

MIT
