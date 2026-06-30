<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` は、生成されたドキュメントから研究を、検証可能な証拠のセットに変換します。ソースとなる情報を保持し、主張と統合を分離し、ゲートを通じて準備状況を強制し、レビュー担当者と免責に関する決定を記録し、その主張が追跡および検証できるパッケージを発行します。

モデルを信頼するように求められることはありません。モデル、ソース、統合のいずれが信頼に値するかを判断するためのツールを提供します。

## 概要

`research-os` は、「Xについて研究したい」という意図と、検証可能な主張を含む固定された証拠ベースとの間の制御プレーンです。調査の初期段階から証拠の取得、生データ抽出から優先順位付けされた主張、矛盾の検出から矛盾の解決、レビューの決定から統合の結果へと、プロセスを分離します。すべてのステップで、追記専用の台帳に書き込まれ、準備状況の検証は、その台帳に基づいて計算され、単なる断定ではありません。

レポート生成ツールではありません。LLMオーケストレーションフレームワークでもありません。統合を自動的に行うものではありません。統合を開始するための条件を強制します。

固定されたパッケージは、[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) にアーカイブされています。6回のクローズドな犬食いテストで使用された4つのパッケージが公開されており、最新版です。v1.0の計画については、[`docs/roadmap.md`](docs/roadmap.md) を参照してください。

v0.1は、2回の犬食いテストで検証されています。最初のテストでは、`research-os` が自身の仕様を調査し、v0.1.0 リリース前に7つの正確性の問題を特定しました。それぞれに対して実際のコード修正が必要であり、ルールまたは統合パターンが確立されました。2番目のテスト（v1 実験 1：ComfyUI ワークフローの耐久性、11セッション、`research-os` と語彙的な重複がないドメイン）は、2026年5月9日に終了し、パッケージが固定され、アーカイブが公開され、パターン2の強制がコミット `22b5dba` を通じて完了しました。v0.1 の検証証跡は [`docs/dogfood-proof.md`](docs/dogfood-proof.md) に、実験 1 の検証証跡は [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) にあります。ライブハンドブック：<https://mcp-tool-shop-org.github.io/research-os/handbook/>。

## インストール

**要件:** Node.js ≥ 20。

```bash
npm install -g @mcptoolshop/research-os
```

ソースコードからビルドする場合（コントリビューター向け）：

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

> **`freeze` 出力に関する注意点。** `research-os freeze` は、すべての標準的な成果物を処理し、コンテンツハッシュを計算する間は、何も出力しません。このコマンドには、段階的な進捗状況の表示はありません。大規模なパッケージの場合、何かを出力するまでに数十秒かかることがあります。完了すると、単一の検証ブロック（`PASS` / `REFUSED` とともに、証拠ファイルのパス）が出力されます。その間隔を処理が停止した状態と解釈しないでください。

> **`--force` オプションに関する警告。** `--force` は、ターゲットパッケージディレクトリをクリアして置き換えます。生成されたパッケージの出力内に、手動で作成したファイルを保存しないでください。代わりに、上位レベルの成果物（主張、ソース、統合）または関連ファイルに編集してください。完全な承認契約と拒否ケース：[`docs/pack-publish.md`](docs/pack-publish.md)。

**実際の使用例については**、`research-os-packs/research-os-spec/` にある犬食いパッケージを参照してください。すべての成果物、証拠ファイル、結果、フリーズフィンガープリントが、追記専用の台帳に保存されています。このパッケージは、`docs/dogfood-proof.md` を生成するために使用されました。

**LLMによる抽出、優先順位付け、レビュー、および調査のために、ローカルで [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) を実行する必要があります。** MCPサーバーは、`OLLAMA_INTERN_MCP_BIN` 環境変数または PATH から検出されます。デフォルトのモデルは `hermes3:8b` です。`OLLAMA_INTERN_MODEL=<model>` (または個別の呼び出しで `--model <name>`) を使用してオーバーライドできます。Ollama がデフォルトの `localhost:11434` で実行されていない場合は、`OLLAMA_HOST` を設定します。

## 16の重要なルール

| # | ルール |
|---|-----|
| 1 | ソースとなる情報が確認される前に統合は行われません。 |
| 2 | 取得したデータは証拠であり、抽出は解釈です。 |
| 3 | モデルはソースの一部を解釈できますが、証拠となるテキストを作成することはできません。 |
| 4 | 抽出では過剰なデータを生成する可能性がありますが、統合ではその過剰なデータを利用することはできません。 |
| 5 | 矛盾の検出は、問題点を明らかにしますが、解決したり、統合したり、どちらの主張を採用するかを決定することはありません。 |
| 6 | ゲートは、セクションが統合に適しているかどうかを決定します。統合を行ったり、失敗を隠蔽することはありません。 |
| 7 | 批判的なレビューは、研究の整合性を評価します。統合を行ったり、ソースとなる情報を書き換えることはありません。 |
| 8 | インデックス作成により、研究結果を検索できるようになります。新しい情報を作成したり、公式な記録のソースになったりすることはありません。 |
| 9 | 共同作業による引き継ぎは、研究結果から運用手順を作成します。新しい情報を生成したり、ゲートを迂回したりすることはありません。 |
| 10 | 統合ワークスペースは、受け入れられた研究結果を共同作業用に整理します。統合を行ったり、引き継ぎモードを迂回したりすることはありません。 |
| 11 | パッケージ監査は、既存の研究結果を集約します。新しい情報を生成したり、セクションレベルの証拠を隠蔽したりすることはありません。 |
| 12 | 調査では仮説が提案され、取得によってのみ証拠が得られます。 |
| 13 | レビュー担当者は、初期段階での失敗を通じて検証されるまで信頼されません。 |
| 14 | 主張の多さは、研究の質を意味しません。統合に使用する前に、主張は優先順位付けする必要があります。 |
| 15 | フリーズにより、完了した研究結果が固定されます。未完成の研究を完了したり、修正状態を証拠に変換することはありません。 |
| 16 | 免責事項は、ソースの制約を緩和しますが、証拠を作成することはできません。 |

**ルール3** — LLM は証拠となるテキストを作成しません。`research-os` は、決定的な抜粋台帳（安定したID、例：`ex_<source_id_hex>_001`）を構築します。LLMは抜粋IDを選択し、`research-os` が実際のテキストをコピーします。「言い換えによる引用」という失敗パターンは、構造的に不可能です。

**ルール14** - 抽出とレビューの間で、`research-os claim triage` は重複を排除し、ソースごとの貢献量を制限し、優先度の低い候補を一時的に保留します。トリアージは `claims.jsonl` を変更しません。保留されたクレームは、標準の台帳に保持されます。

## v0.1 ワークフローチェーン

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

各ステップは CLI コマンドです。各ステップは、追記専用の成果物に書き込みます。どのステップも新しい情報を合成、解決、または作成しません。これらの不変性は強制され、信頼されるものではありません。レビューでは、候補となるクレームを承認/拒否/修正要求し、ゲートはそのレビュー結果を受け取り、`synthesis_eligible` を計算します。フリーズは最終的な整合性ロックであり、すべてのレイヤーが合意しない限り、パックの完了としてマークすることを拒否します。v0.1 がエンドツーエンドで機能することを示す証拠については、[docs/dogfood-proof.md](docs/dogfood-proof.md) を参照してください。

これは、*検索 → 要約 → きれいなレポート* に対する構造的な代替手段です。このチェーンが製品です。

## 語彙

| 用語 | 意味 |
|------|---------|
| `research-os` | 制御プレーン / CLI / ゲート / オーケストレーションルール（このリポジトリ） |
| `research-pack` | 1つの調査プロジェクトの生成されたリポジトリ成果物 |
| `research section` | パック内の調査の境界単位 |
| `research receipt` | セクションがソース/クレーム/ゲートチェックに合格したことを証明する |

## セキュリティ

`research-os` は、ローカルを優先する CLI です。指定された調査パックディレクトリ内のファイルを読み書きし、（`gather` を使用する場合）提供されたソース URL を取得するためにアウトバウンド HTTP リクエストを発行します。サーバーの実行、インバウンド接続の受け入れ、認証情報の保存、またはテレメトリの送信は行いません。秘密情報はパック成果物に書き込まれません。脆弱性報告ポリシーについては、[SECURITY.md](SECURITY.md) を参照してください。

## レビュー担当者の調整

v0.5.0 では、レビュー担当者の調整が永続化されます。レビュー担当者プロファイルは信頼されません。なぜなら、一度実行されたというだけでは不十分であり、構造化された意図的な失敗の記録と複数回の実行による集計を通じてステータスを獲得するからです。v0.6.0 では、本番環境のレビューパスと調整ハーネスに決定論的なレビュー担当者オプションが追加されました。

**現在、`trusted_baseline` として認められているプロファイルはありません。** リポジトリ内の標準的な記録には、`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed` と表示されます。これは意図的なものであり、信頼は仮定するのではなく、繰り返しの意図的な失敗の証拠を通じて獲得されます。`hermes-two-pass-deterministic` の記録には、構造モデルの機能ギャップ（2/6 種類の決定が生成されました。3/6 が必要です）があり、これは変動の問題ではありません。

調整記録は、`calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}` に保存されます。各記録には、7つのバーに対する PASS/FAIL と、4つのステータスラベル（`trusted_baseline`、`conditional_pass`、`failed`、`comparison_only`）が記録され、フィクスチャでテストできない内容が正直に開示されます（`needs_contradiction_mapping` は `seeded-v1` から到達できません）。[CHANGELOG.md](CHANGELOG.md) を参照してください。

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

`--runs <n>` が使用される場合、各実行の記録は `<profile>/runs/run-NNN.json` に書き込まれ、集計された記録（中央値に基づくバーと繰り返し発生する失敗の検出を含む）が `<profile>/seeded-v1.{json,md}` に書き込まれます。集計された記録には、`receipt_kind: 'aggregate'` が含まれており、単一実行の記録と区別されます。単一実行モード（`--runs 1` または省略）では、既存の直接書き込み動作が維持されます。

**決定論的なレビュー担当者プロファイル** - `research.yaml` の `review_profiles.<name>.reviewer_options` を使用して、`temperature`、`seed`、およびその他の Ollama サンプリングパラメータを本番環境のレビューパス内のすべての `OllamaInternReviewer` 構築に渡します。`hermes-two-pass-deterministic` プロファイルは、組み込みの例として提供されます。[docs/experiment-6-proof.md] と [reviewer calibration handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/) を参照してください。

## v0.13.1 での新機能 - R-024 抽出段階のティア予算権限（パス C パッチ）

v0.13.1 は、v0.13.0 の上に適用される単一の修正パッチです。v0.5 トラック C の条件（R-019 でのクレーム抽出段階におけるワイヤーアップ範囲のギャップ）を解消するために、R-019 のティア予算権限を、`claim extract` 中に行われるすべての `ollama_extract` MCP 呼び出しに拡張します。これには、ウィンドウごとのエクストラクター、クレームごとの R-011 セクション証拠クリティック、およびレスキュー候補ごとの R-012 レスキュークリティックが含まれます。アーキテクチャは R-019 の合成プロースカバレッジと同じです。単一のリポジトリパッチ（research-os のみ）。ollama-intern-mcp@2.6.0 の `tier_budget_ms_override` スキーマフィールドは、サーバー側の変更されない部分です。

このリリースが存在するのは、v0.5 でのオペレーター単独ゲートが、公開された `@mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0` に対して **PASS_WITH_CONDITIONS, NOT authorization-grade** (`operator_aloneness_dst_v0.5`) を返したためです。すべての v0.13 の表面（R-018 + R-019 + R-020 + R-021）は、バグなしでライブに実行されました。防御の基盤は維持され、文書化された `recovery_actions` を使用して、名前が付けられた失敗に対して正直な拒否が行われました。ただし、セクション 02（`02-safety-and-economic`）内の 8 つのソースのうち 3 つは、抽出中にオペレーター向けのオーバーライドなしで、内部 15000ms のインスタントティア TIER_TIMEOUT に達しました。R-019 は v0.13.0 で合成プロース用の同様のオーバーライドをリリースしました。v0.13.1 では、これを抽出段階に拡張します。

> **R-024 は、完全なカバレッジのティア予算ルールを実現します。ティア予算を拡張する場合、その予算は、同じ内部タイムアウトを生成できる、その段階でのすべての LLM 呼び出しに到達する必要があります。部分的なカバレッジ = 呼び出しサイトのカバレッジ層における誤ったパッチ。**
> **R-024 はまた、ライブリプレイテストの脆弱性ルールを実現します。ライブリプレイ受け入れテストが、メカニズム上の理由ではなく、ハーネス上の理由（タイミング、キャプチャ、フィクスチャの状態）で失敗した場合、テストハーネスを修正してください。手動による成果物の検査に置き換えたり、スキップしたり、ダウングレードしたりしないでください。**

v0.5の段階は、パスD（マルチトラック・トリアージ）です。v0.13.1でトラックCを閉じます。トラックAは、スキャフォールディング（メモリゲートフックパスホワイトリスト）で閉じられました。トラックB（ソース検出スキャフォールディング）は、v0.13.1のリリース後に別のセッションで実行されます。v0.6のゲート設定は、トラックBに続きます。許容性スライス1は、v0.6 PASSになるまで**許可されません**。

### 実行できること

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

優先順位：CLIフラグ > 環境変数 > デフォルト（省略；ollama-intern-mcpプロファイルのデフォルトが適用されます）。制限時間：[1, 600000]ミリ秒（最大10分）。無効な値は、ゼロ以外の終了コードで明確にエラーとなり、問題のある表面と値を表示します。

### 新機能

**R-024 — すべての3つの`ollama_extract`呼び出しサイトで、抽出段階のティア予算権限を適用します。** `claim extract`（および対応する`RESEARCH_OS_EXTRACT_TIER_BUDGET_MS`環境変数）の新しい`--tier-budget-ms <N>`フラグは、オペレーターが制御できる1回の呼び出しごとのティア予算の上書きを、抽出実行中のすべての`ollama_extract`呼び出しツールへの呼び出し時に`ollama-intern-mcp@>=2.6.0`に`tier_budget_ms_override`として転送します：`MCPClaimExtractor.extractOnePage`（1ウィンドウごとの抽出器）、`runCritic`（R-011、ドラフトごとに1回の呼び出しで、クレームごとのセクション証拠を評価するクリティック）、および`runRescueCritic`（R-012、ソースコンテンツの不一致を示すドラフトに対して、レスキュー候補ごとのレスキュークリティック）。アクティブな予算は、標準エラー出力に表示されます（各ソースのループ前に`[extract] tier_budget_ms=N source=... section=<id>`が出力され）、抽出結果のメタデータにも記録されます（`audits/<section>-claim-extract.json`の`tier_budget_ms` + `tier_budget_overridden_by`）。また、クローズド列挙型`EXTRACT_TIER_BUDGET_SOURCES`（`['default', 'cli_flag', 'env_var']`）にも記録されます。デフォルトの動作は、v0.13.0とバイト単位で同一です（フラグなし、環境変数なし→プロファイルのデフォルトが適用され、新しいフィールドは結果に含められません）。

### アーキテクチャに関する注記

R-024は、R-019のアーキテクチャを模倣していますが、異なる段階で実行されます。R-019では、上書きが`runProseSynthesis`を通じてプランナー+ドラフター+ベリファイア（3つの合成プロセスの`ollama_extract`呼び出しサイト）に渡されました。R-024では、`extract()`オーケストレーター→`MCPClaimExtractor.extract`→抽出OnePage + runCritic + runRescueCriticへのファンアウト（3つの抽出段階の`ollama_extract`呼び出しサイト）を通じて実行されます。完全な範囲をカバーするティア予算ルールは、現在、重要な要素となっています。オペレーターが使用する表面に対してティア予算を拡張する場合、フェーズBのレポートバックでは、その段階で同じ内部タイムアウトを共有するすべてのLLM呼び出しサイトを列挙する必要があります。部分的な範囲では、R-018のラッパー/内部メカニズムと同様に、自己矛盾した署名を持つ、呼び出しサイトのカバレッジ層でのMISTARGETED-PATCHが発生します。結果には、上書きと、カバーされていない呼び出しサイトで指定されたタイムアウトがトリガーされたことが記録されます（同じ成果物）。

`ollama-intern-mcp`の変更はゼロです。v2.6.0の`tier_budget_ms_override`スキーマフィールドは、R-019で調整されたリリース以降から存在していました。v0.13.1では、リサーチOS側の抽出段階クライアントの接続が提供されます。

### 防御レベルは維持されています

R-024は、アーキテクチャの変更ではなく、オペレーターが調整できる機能を追加するものです。R-002からR-021までの表面はすべて変更されていません。`accepted_claim_floor`は引き続き変更できません。クローズド列挙型も変更されていません（`FailureShape`は9、`RECOVERY_ACTIONS`は8、`REGENERATION_REASONS`は3、`PLANNER_TIMEOUT_SOURCES`は3、`POLICY_KEYWORDS`は8、`POLICY_RELEVANT_SOURCE_TYPES`は1）。R-024では、新しいクローズド列挙型`EXTRACT_TIER_BUDGET_SOURCES`（3つの値）が追加されますが、既存の列挙型には影響しません。AIリカバリーアドバイザープロンプトテンプレートは変更されていません。MCPアーキテクチャは付加的に拡張されています。R-010のフォールバック原因正規表現の形状は維持されています。R-015の抽出`--resume / --progress`の形状も維持されています（R-024では、新しい標準エラー出力ログ行と新しい結果フィールドが追加されます。既存のレジャー形式、スキップ動作、および出力形状は変更されていません）。

すべての4つのフローズンパックに対して、v0.3.3のベースラインと比較してバイト単位で同一の結果が得られます。これは**19回連続でこの状態が維持されています**。1630から1663にvitestの合格数が増加しました（+33はR-024による合成受け入れテスト、+1は常に実行されるガード）。6つのテストはスキップされました（ライブリプレイテストは、リグ環境変数によって制御されます）。

### v0.13.1では、以下のことは保証されません

- v1の準備完了。
- v0.6オペレーター単独ゲートの判定。v0.6の設定はR-023（ソース検出スキャフォールディング）に続きます。v0.13.1は、トラックCを閉じるための前提条件であり、その証拠ではありません。
- 許容性スライス1。v0.6 PASSになるまで有効になりません。
- 遅延されたv0.13.xの候補（F-2 R-009監査↔抽出の相違点、F-3共同作業ハンドオフの停滞、F-4 R-017 POLICY_KEYWORDSの狭さ）。

完全なリリースエントリについては、[CHANGELOG.md](CHANGELOG.md)を参照してください。

## 前回のバージョン：v0.13.0 — 最終化ブロック・トリアージアーク（R-019 + R-020 Dのみ + R-021）

v0.13.0は、v0.4を`@mcptoolshop/research-os@0.12.1`に対して再実行した結果、**条件付きでPASS、ただし承認レベルには達しない**という結果を受け、パスD（マルチブロック・トリアージアーク、名前付きパッチとは異なる）で開始されたv0.13の最終化ブロック・トリアージアークを閉じます。3つの独立したパイプライン層に3つの独立した最終化ブロックがあり、それらがすべて組み合わさることで、合成プロセスの最終化とno_answer_clusterリカバリー表面、および矛盾マップ自動モードが解除されます。v0.10 / v0.11 / v0.12 / v0.12.1からの防御レベルとカバレッジ・リカバリー表面は維持されており、クローズド列挙型の変更や、破壊的な表面の変更はありません。

> **v0.4の再実行により、合成受け入れテストが配管を検証し、ライブリプレイがターゲットメカニズムを偽造することが証明されました。**
> **v0.13は、最終化ランタイム制御に対処します：R-019は内部MCPティア予算層を解除し、R-020は正直なno_answer_cluster拒否とリカバリーアクションを提供し、R-021は矛盾マップ自動モードRPC層を解除します。**

v0.5のオペレーター単独ゲートは、公開されたv0.13.0に対して別のセッションで実行されます。許容性スライス1は、v0.5 PASSになるまで**許可されません**。

### 実行できること

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

**R-019 — インナーMCPティア予算クライアントの接続。** R-018の`--planner-timeout-ms <N>`フラグ（および`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`環境変数）は、プランナー/ドラフター/ベリファイアーを通じて`ollama_extract.tier_budget_ms_override`に渡り、`ollama-intern-mcp/src/guardrails/timeouts.ts:61`の`runWithTimeoutAndFallback`に到達する。v0.4のリランで発生した`elapsed=15018ms budget=15000ms`というエラーを引き起こした、ティアごとのインナータイムアウトメカニズムは、現在、オペレーターが設定した予算を直接尊重する。R-018のラッパーは、未解決のPromiseによるハングに対するアウターハードレールとして保持される（直交的な失敗モードを捕捉できる）。`ollama-intern-mcp@>=2.6.0`が必要。古いバージョンでは、新しいスキーマフィールドが無視される（R-018ラッパーは元のレイヤーで引き続き機能する—正常なデグレード）。

**R-020（Dのみ）— `no_answer_cluster`リカバリーサーフェス。** プランナーが、承認されたクレームのいずれにもrole=answerを割り当てない場合、エラーはインラインの`recovery_actions[]`（`narrow_section_purpose` + `add_on_topic_sources`）として`section-synthesis.json`に表示され、レンダリングされた`## Recovery actions`マークダウンブロックが`section-synthesis.md`に表示される（アクションIDヘッダー+理由テキスト+フェンスで囲まれたコマンドヒントコードブロック）。また、単一行のstderrヒント（`[synth] no_answer_cluster — see section-synthesis.md "Recovery actions" block for actionable steps`）が表示される。アクションリストは、アクショングラフリカバリーパスと共有される唯一の情報源であり、スタンドアロンコマンドとインライン失敗ボディのパスの間にはずれがない。**R-020のプランナープロンプト調整（Aハーフ）が試行され、ロールバックされた**—iter-1では、サイレントな誤った合成が行われた（LLMは、敵対的なフィクスチャー上の肯定的な効果を持つクレームから、効果のない回答を捏造した。ベリファイアーは、反転した否定を`faithful`として承認した）。iter-2のHARD GUARDRAILは、幻覚を上書きしなかった。オペレーターの一回のイテレーションルールに従い、プロンプトと3つのv3に固定されたテストファイルがロールバックされた。`PROSE_PROMPT_VERSION`は`section-prose-v3`のまま。この教訓として、構造的なライブリプレイは、合成されたコンテンツがサイレントな誤りであってもパスできる。敵対的なフィクスチャーに対する手動による散文検査が必要であり、否定/範囲/述語の反転を捕捉する必要がある。

**R-021 — 矛盾マップ自動モードハングタイムアウト + ヒューリスティックフォールスルー + 可視化された進捗状況。** 新しい`--auto-mode-pair-timeout-ms <N>`（デフォルト90000；v0.4のフィクスチャーでゲート測定されたwarm hermes3:8bの後、R-021以前にハードコードされていた120秒から短縮：最小6.2秒、中央値8.4秒、最大8.8秒→デフォルト90秒には≥81秒の余裕がある）。新しい`--auto-mode-fall-through-after-n-timeouts <N>`（デフォルト5；連続した失敗に対する自動ヒューリスティックフォールスルーの閾値。成功した`type:none`分類はカウンターをリセットする）。対応する環境変数。すべての呼び出しで、新しいstdout開始行（`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`）が出力される—常に表示され、非TTYコンテキストでも維持される。強制的にstderrにフォールスルーのトリガーイベントを出力することで、TTYゲーティング/`--progress`をバイパスする。オペレーターはモードスイッチを目にする必要があるため。閾値を超えた場合に、`contradictions.md`に新しい`## Auto-mode fall-through`マークダウンブロックが表示される。ヒューリスティック再実行は、処理されていないペアに対してのみ行われる（LLMがすでに完了したペアの重複した再分類は行われない）。

### アーキテクチャに関する注記

R-019は、research-os ↔ ollama-intern-mcpの境界を越える。Research-osは`tier_budget_ms_override`を`ollama_extract`スキーマに渡し、ollama-intern-mcp v2.6.0はそれをインナーガードレールで尊重する。配管はすでに存在していた。v2.6.0はクライアント側のエントリポイントを提供し、v0.13.0はresearch-os側のクライアント接続を提供する。R-018のPromise.raceラッパーは保持される。これは、直交的な失敗モード（未解決のPromiseによるハング—ラッパーで捕捉できる）から保護するためである。構造化された`isError:true`ペイロードがインナー予算に到達し、ラッパーが到達できない場合、それはR-019の領域となる。

R-021はresearch-osのみで使用される。矛盾マップ自動モードは、ollama-intern-mcpを介してルーティングされない—Ollama HTTP `/api/chat`に直接呼び出す。MCPトランスポートはチェーンに含まれない。`tier_budget_ms_override`の配管も、R-018ラッパーもない。4つのハードルールキックオフプロトコルにより、R-021のキックオフ前に誤ったフレームが捕捉された（キックオフでは「MCP RPCレイヤー」と表示されていた。フェーズAの読み取りフェーズでそれが否定された）。

### 防御レベルは維持されています

R-019 + R-020 Dのみ + R-021は、オペレーターノブの追加であり、アーキテクチャの変更ではない。R-002からR-018までの表面はすべて変更されていない。`accepted_claim_floor`は譲歩できないまま。クローズド列挙型は変更されない（`FailureShape`は9、`RECOVERY_ACTIONS`は8、`REGENERATION_REASONS`は3、`PLANNER_TIMEOUT_SOURCES`は3、`POLICY_KEYWORDS`は8、`POLICY_RELEVANT_SOURCE_TYPES`は1）。AIリカバリーアドバイザープロンプトテンプレートは変更されていない。MCPアーキテクチャは付加的に拡張される。R-010のフォールバック原因正規表現形状は保持される。

4つのフローズンパックすべてに対して、v0.3.3ベースラインに対するフローズンパック回帰バイトが同一である—**これは18回目の連続リリースであり、この状態が維持されている**。1542 → 1630 vitestパス（3つのスライス全体で+88。4つはスキップされた—ライブリプレイテストはrig環境変数によって制御される）。

### v0.13.0では、以下のことは主張されない

- v1の準備完了。
- v0.5オペレーターアローンネスゲートの判定。v0.5は、`@mcptoolshop/research-os@0.13.0`に対して別のセッションで実行される。v0.13.0は、最終化グレードの前段階であり、その証明ではない。
- 許容性スライス1。v0.5のPASSに依存する。
- 保留中のv0.13.x候補（F-2 R-009監査↔抽出の相違点、F-3共同作業ハンドオフの停滞、F-4 R-017 POLICY_KEYWORDSの狭さ、A-1 + A-2アーキテクト側の調査結果はv0.5ゲートスキャフォールディング準備に組み込まれる）。

完全なリリースエントリについては、[CHANGELOG.md](CHANGELOG.md)を参照してください。

## 以前：v0.12.1 — Synth Planner Timeout Override（パスCパッチ）

v0.12.1は、v0.12.0をベースとした単一の修正パッチです。R-018のみが含まれており、これは合成プロセスのMCP `callTool`呼び出しにおけるリサーチOS側のタイムアウトに関するものです。オペレーターがCLIフラグ（`synth section`および`synth workspace`で`--planner-timeout-ms <N>`）を使用して制御し、対応する環境変数（`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`）と一致します。優先順位は、CLIフラグ > 環境変数 > デフォルト値（15000ミリ秒）です。デフォルトの動作はv0.12.0と完全に同じに保たれます。

このリリースが存在するのは、v0.4におけるオペレーター単独でのゲートが`@mcptoolshop/research-os@0.12.0`に対して**条件付きでPASS（完全な承認レベルではない）**を返したためです（`operator_aloneness_dst_v0.4`）。v0.11の防御基盤は、実際の負荷の下でも維持されました。6つのv0.12のカバレッジ回復メカニズムがすべて作動し、オペレーターをサポートしました。封印されたエンベロープカバレッジはPASSの閾値に達しました（4/5のSUPPORTED + 1 PARTIAL が必須；2/3のSUPPORTED + 1 PARTIAL のモデレーター；0/3のトラップ；0/5のマテリアル故障が発生）。汚染マーカーはすべてHARMLESSでした。単一の失敗モードは最終処理段階でした。合成プロセスが約15010ミリ秒で`TIER_TIMEOUT`に到達し、これはオペレーターによるオーバーライドがない状態で、15秒のInstantティア予算に対して再現性がありました。セクション概要はエンベロープに準拠していましたが、パックはフリーズに到達できませんでした。

**パスCの処理**（v0.4で獲得した新しいパターン）：セッションBが、明示的なパッチパスを持つ単一の名前付きの失敗メカニズムを特定し、かつエンベロープカバレッジがPASSの閾値に達し、防御基盤が維持され、汚染がHARMLESSである場合、処理は次のようになります。パッチを適用し、同じオペレーターパスをパッチされたバージョンに対して再実行し、再評価します。エンベロープの再作成は行いません。人間の評価者は必要ありません。v0.13のアーキテクチャ変更も行いません。

> **v0.4は、セクション概要レベルでのカバレッジ基準を満たすResearch-OSを証明します。**
> **v0.12.1は、防御基盤を弱めることなく、単一のプランナータイムアウトのボトルネックを取り除くことで、最終処理段階における基準を満たすことを証明する必要があります。**

### 実行できること

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

アクティブな予算設定は、`section-synthesis.json`（`planner_timeout_ms`は常に設定され、`planner_timeout_overridden_by`はオーバーライドされた場合にのみ存在）、ProseBlockメタデータ、およびstderrにあります（プロセスの生成前に`[synth] planner_timeout_ms=N source=… section=<id>`が出力されます）。`synth section --help`コマンドでフラグ、デフォルト値、上限（600000ミリ秒の安全マージン）、および環境変数による代替方法が説明されています。無効な値（負の値、ゼロ、数値以外の値、単位が付いた文字列、600000を超える値）は、エラーコードとともに明確に失敗し、設定項目と問題のある値を表示します。サイレントフォールバックはありません。

### アーキテクチャに関する注記

v0.4のゲートで確認された15000ミリ秒の予算は、`ollama-intern-mcp`（`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`）に存在し、リサーチOSにはありません。R-018より前のリサーチOSでは、プランナータイムアウトは強制されていませんでした。タイムアウトは、ollama-intern-mcpのティアポリシーでサーバー側で発生していました。R-018の解決策により、リサーチOSがMCP `callTool`の周りに`Promise.race`ラッパーを配置することで、予算に対する独自の権限を持ちます。デフォルトでは、事実上観察されたInstantティア番号（15000ミリ秒）になり、デフォルトの動作は維持されます。R-018のラッパーは、R-010の`classifyFallbackCause`正規表現（`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`）と一致する`TIER_TIMEOUT`形状のエラーを生成し、デフォルトパスでの実行時に下流のAIアドバイザーが可視性を維持できるようにします。

### 防御レベルは維持されています

R-018は、アーキテクチャの変更ではなく、オペレーターが調整できるパッチです。R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017はすべて変更されていません。`accepted_claim_floor`は引き続き変更できません。クローズドな列挙型も変更されていません（`FailureShape`は9、`RECOVERY_ACTIONS`は8、`REGENERATION_REASONS`は3、`POLICY_KEYWORDS`は8、`POLICY_RELEVANT_SOURCE_TYPES`は1）。AIによる回復アドバイザーのプロンプトテンプレートも変更されていません。MCPアーキテクチャも変更されていません。`ollama-intern-mcp@^2.4.0`が引き続き使用されます。R-018は、新しいオペレーター管理用の語彙として`PLANNER_TIMEOUT_SOURCES`（3）を追加し、ゲートルーティングの列挙型とは区別されます。

フローズンパックの回帰は、すべての4つのフローズンパックに対してv0.3.3のベースラインと完全に同じです。**16回目の連続リリース**で、この状態が維持されています。1542 → 1586 vitestテストに合格（+44 R-018受け入れテスト）。

### v0.12.1では、以下のことは主張しません

- v1の準備完了。
- v0.4オペレーター単独ゲートの再実行結果。v0.4は、別のセッションで`@mcptoolshop/research-os@0.12.1`に対して再実行されます。v0.12.1は、最終処理段階における基準を満たすための前提条件であり、その証明ではありません。
- 許容スライス1。これは、v0.4の再実行でPASSになることが前提です。v0.4のドクトリンラチェット（防御レベルでの単独性の証明；セクション概要レベルでのカバレッジレベルでの単独性の実質的な証明；v0.12.1による最終処理段階における基準の保留）が、ロックされたテストとして残ります。
- v0.13候補（F-2 R-009監査↔抽出の相違点；F-3共同作業ハンドオフの停滞；F-4 R-017 POLICY_KEYWORDSの狭さ）。これらは最終処理とは独立しています。

完全なリリースエントリについては、[CHANGELOG.md](CHANGELOG.md)を参照してください。

## 以前：v0.12.0 — カバレッジ回復リリース

v0.12.0は、2026年5月16日に発見されたv0.3オペレーター単独ゲートに関する問題を解決します（`operator_aloneness_dst_v0.3`, PASS_WITH_CONDITIONSですが、完全な承認レベルではありません）。4つのスライスにわたる6つの名前付きの問題：v0.4をブロックするカバレッジのギャップを解消する3つのアーキテクチャ修正（R-012、R-013、R-014）、およびv0.4ゲートでテストされるオペレーターサーフェスを改善する3つの人間工学的な修正（R-015、R-016、R-017）。v0.3が失敗したのは、防御機能が低下したためではありません。すべての5つのv0.11の防御メカニズムは、設計どおりに正確に作動し、サイレントエラーのないクリーンな合成を行い、パックは実際のデータに基づいてフリーズしました。ただし、同じ防御機能が正しく動作することで、許容される主張の基盤から重要なプライマリソースのカバレッジが削除されました。v0.3で得られたドクトリンラチェット：

> **v0.11は、システムをサイレントエラーのない合成を行うのに十分なほど安全にしました。**
> **v0.12は、防御機能を損なうことなく、カバレッジを回復する能力を高めます。**

本論文の主張：**保守的な防御策は、無効な合成を防ぐことができるが、同時に必要なカバレッジを不足させる可能性もある。** v0.12 は、カバレッジ回復のための解決策である。v0.11 の防御レベルは変更されない — すべての R-007 から R-011 までの表面において、引き続き有効な動作をする。v0.12 では、これに加えて、合法的な証拠に基づいた回復パスが追加される。

### 実行できること

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

### アーキテクチャに関する3つの修正（v0.4の防御レベル）

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

### 人間工学に基づいた3つの改善点（v0.4ゲート体験の向上）

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

### 法的境界

パックルールは維持される。`accepted_claim_floor` は変更不可である。クローズドな `FailureShape` 列挙型は、9つの値で不変である。`RECOVERY_ACTIONS` 列挙型も8つの値で不変 — 新しいアドバイザーアクションはない。R-014 の異なる形状のヒューリスティックにより、既存のアクションへのルーティングが拡大される。AI 回復アドバイザープロンプトテンプレートは変更なし（新しい `EvidenceState` フィールドは、保存された JSON で確認できるが、プロンプトには表示されない）。回復検証ルールも変更なし。MCP アーキテクチャも変更なし — `ollama-intern-mcp@^2.4.0` が引き続き使用される。抽出時の MCP 呼び出しの形状も変更はない。R-017 の警告は情報提供のみであり、ゲートの判定、フリーズレシート、またはパック公開には影響しない。すべての v0.10 および v0.11 の防御策は維持され、防御レベルはそのままに、v0.12 がその上に構築される。

フローズンパックの回帰テストでは、4つのフローズンパックすべてに対して、v0.3.3 を基準としたバイト単位で完全に一致する — **これは15回目の連続リリース**であり、この状態が維持されている（v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12）。

### v0.12.0 での主張ではないこと

- v1 への準備。
- v0.4 のオペレーター単独ゲート判定。v0.4 は、別のセッションで npm `@mcptoolshop/research-os@0.12.0` に対して実行される。
- Admissibility Slice 1。v0.4 で合格する必要がある — v0.3 の原則（防御レベルでのオペレーター単独の証明済み、カバレッジレベルでのオペレーター単独はまだではない）がロックされたテストとして維持される。
- クラウドベースの研究ツールに対する優位性。
- 完全に信頼できるレビュー担当者のキャリブレーションモデル。

v0.12.0 は、オペレーター単独ゲートの v0.4 の前提条件であり、証明ではない。

[CHANGELOG.md] および、オペレーター向けのオーバーライド例（[`examples/source-card-override.example.json`](examples/source-card-override.example.json)）を参照のこと。

## 以前：v0.11.0 — オペレーター単独の修正リリース2回目

v0.11.0 は、v0.2 のオペレーター単独ゲートの失敗条件を解消した。具体的には、スコープ/境界の修正アライメント（R-007）、検出時の URL 関連性のチェック（R-008）、抽出時およびフレームクリティックレイヤーでのペアリングされたソースコンテンツ汚染防御（R-009 + R-011）、および回復アドバイザーのフォールバック原因の可視性（R-010）である。3層のソースコンテンツガード（v0.3 の合格時に R-008、抽出時に R-009、フレームクリティックで R-011）がここに実装された。[`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) を参照のこと。

## 以前：v0.10.0 — オペレーター単独の修正リリース

v0.10.0 は、2026年5月15日に表面化した v0.1 のオペレーター単独ゲートの失敗条件を解消した。具体的には、回復ルーティングのアライメント（R-002）、スコープ修正 CLI（R-001）、ペアリングされたソースカード監査の強化（R-003 + R-005）、および正直な収集ステータス（R-004）である。[`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) を参照のこと。

## 以前：v0.9.0 — プロダクトアーティファクトアーク

v0.9.0 は、v0.8 のエビデンススパイーンをオペレーターが利用できるアーティファクトに変換した。具体的には、セクションレベルの文章合成（`synth section`）、部分パック合成（`synth pack --partial`）、および合法的な回復アドバイザー（`recover pack`）である。[`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) を参照のこと。

## 以前：v0.8.0 — アーキテクチャ回復

v0.8.0 は、リサーチOSを宣言されたローカルLLMサブストレート（`ollama-intern-mcp@^2.4.0`）に再接続し、クレーム抽出のためにフレーム境界セクション関連性の強制を追加し、修正が必要なパック内のゲート適格セクションに対して、セクション範囲の証拠引用合成を追加した。[`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) を参照のこと。

## ステータス

**v0.11.0 — 2回目のオペレーター単独処理の修正リリース** — npmに`@mcptoolshop/research-os@0.11.0`として公開、2026年5月15日。v0.11.0は、5つの特定された問題に対応する4段階の修正サイクルを通じて、v0.2オペレーター単独処理ゲートの失敗条件（`operator_aloneness_dst_v0.2`、2026年5月15日にPASS_WITH_CONDITIONSとして承認されない）を解消します。**R-007**（スコープ/境界の修正アライメント）：`claim repair-scope --auto`は、修正時に実質的なクレームの両方の値がnullの場合に、`scope`と`not`の両方を設定するようになりました。これにより、v0.2で発生していた、v0.10のR-001による修正が`scope`のみを埋め、`claim triage`が修正されたクレームを`needs_scope_repair`として再分類していた問題が解消されます。テンプレート化された境界は、スコープテンプレートの劣化形状を反映します。追加専用のログには、`applied_not`と`applied_scope`の両方が記録されます。**R-008**（幻覚的なURLに対する防御策）：`discover run`は、各候補URLの`<title>`を取得するようになりました（制限：64KBの本文、5秒のタイムアウト、4並列）。取得したタイトルと発見クエリに対して、決定論的なキーワードの重複を計算します。各候補には`relevance`ブロックが追加されます（`verified | unverified | topic_mismatch`）。`approve --top N`は`topic_mismatch`を隔離し、オペレーターは`approve --candidate <id>`でオーバーライドできます。これにより、v0.2で`llm-heuristic`が、全く関係のない癌/生化学/HIVリンパ腫に関する3つの実際のPMC URLを返していた問題が解消されます。**R-009**（抽出器のIDガード）：新しいソースカードの重大度`source_identity_mismatch`（ハードフェイル）を追加します。これは、抽出器が出力する`card.title`と取得したHTML`<title>`が一致しない場合に発生します。「ラットとクロニジン」に関する誤った情報を生成していたv0.2の問題を解消します。R-008の重複チェックヘルパーを再利用し、`clear_severities[]`でオーバーライドできます。**R-011**（フレームクリティックによるソースコンテンツの事前チェック）：新しいフレーム除外理由`source_content_mismatch`を追加します。フレームクリティックは、各ソースに対して一度だけソースコンテンツのシグネチャを計算し、LLMクリティック呼び出し前に決定論的な事前チェックを実行します。閾値以下の場合は、LLM呼び出しをスキップし、`frame_excluded: true`とマークします。これにより、DSTフレーム化されたテキストを持つ11個の癌に関するクレームがLLMクリティックによって承認されていたv0.2の問題が解消されます。**R-010**（MDフォールバックの可視性の回復）：新しい`FALLBACK_CAUSES`列挙型（`tier_timeout | mcp_error | retry_exhausted`）と、オプションの`FallbackTiming { elapsed_ms, budget_ms }`を`prose_error`メタデータに追加します。MDは、「AIアドバイザーがフォールバックした理由」セクションと、主要な原因の概要を表示するようになります。これにより、JSONのみでTIER_TIMEOUTが表示されなかったv0.2の問題が解消されます。**3層のソースコンテンツ汚染ガードが完了しました**（R-008による承認 + R-009による抽出 + R-011によるクリティック）。各防御層は独立して機能します。**`ollama-intern-mcp@^2.4.0`が必要です**（v0.8.0から変更なし）。1448/1448のvitestテストに合格しました（1344 → 1448、+104テスト）。**4つのフローズンパックはすべて、v0.3.3のベースラインとバイト単位で完全に一致することを確認します**（11回目の連続リリース）。**v1リリースではありません。v0.3オペレーター単独処理ゲートの最終的な結果ではありません** — v0.3は、このnpmバージョンとは別のセッションで実行されます。許容性に関する研究は、v0.3 PASSに基づいて行われます。詳細については、[`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md)および[CHANGELOG.md](CHANGELOG.md)を参照してください。

**v0.10.0 — オペレーター単独処理の修正リリース** — npmに`@mcptoolshop/research-os@0.10.0`として公開、2026年5月15日。v0.10.0は、4段階の修正サイクルを通じて、v0.1オペレーター単独処理ゲートの失敗条件（`operator_aloneness_dst_v0.1`、2026年5月15日にFAIL）を解消します。**R-001**（`research-os claim repair-scope <section> [--auto | --interactive]`）：抽出から`scope`フィールドが`null`で到着したクレームを修正するための新しいCLIコマンド。追加専用の`evidence/claim-scope-repairs.jsonl`ログを追加します。新しい`repair_claim_scope`アクションを`RECOVERY_ACTIONS`に追加します（閉じた列挙型は7から8に増加）。アドバイザーは、`accepted_claim_floor`で3つ以上のクレームが`needs_repair_claims`にある場合に、これをランク1として表示します。**R-002**（リカバリルーティング）：診断レイヤーは、レガシーの`failures[].check`ルックアップにフォールバックする前に、`gate.json:blocking_reasons[]`を権限のあるルーティングサーフェスとして読み込むようになりました。ゲートブロック信号が、`source_card_classification_gap`などの下流の信号よりも優先されます。**R-003 + R-005**（ソースカード監査の強化、ペア）：新しい重大度`bot_check_or_captcha_detected`（ハードフェイル — 複合信号：マーカー + 本文の形状）と`extraction_suspect_word_count_mismatch`（警告および隔離 — 本文≤200語 AND 抽出≥800語 AND 比率≥4）を追加します。v0.4のオーバーライド-ledgerスキーマにある新しい`clear_severities[]`フィールドを使用して、オペレーターがオーバーライドできます。`research.yaml`にオプションの`audit.severity_thresholds`ブロックを追加し、パックごとに調整できるようにします。**R-004**（正直な`gather_outcome`）：`FetchReceipt`に5つの値を持つ列挙型（`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`）を追加します。v0.1で混乱を招いていた「Failed (ok HTTP 200)」というフレーズはなくなりました。詳細については、[`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md)および[CHANGELOG.md](CHANGELOG.md)を参照してください。

**v0.9.0 — プロダクト成果物アーク** — npmに`@mcptoolshop/research-os@0.9.0`として公開、2026年5月14日。v0.9.0は、v0.8の証拠基盤をオペレーターが利用できる成果物に変換します。セクションレベルの文章合成（`research-os synth section <id>`）により、段落レベルのサポートバンドルを参照する、読みやすいMarkdown形式で出力されます。部分的なパッケージ合成（`research-os synth pack --partial`）は、セクションの文章（生の主張ではない）を消費し、除外されたセクションとその理由を構造化して表示します。決定論的なバンドルプランナーは、2つ以上のセクションが含まれている場合に、必要なクロスセクションサポートを事前に選択します。適切なリカバリーアドバイザー（`research-os recover pack`）は、4層のアーキテクチャ（決定論的診断 + 妥当なアクショングラフ + AIによるアドバイス + 検証者）を使用して、ブロックされたセクションに対するオペレーター向けガイダンスを提供します。3つのアドバイザーパス（`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`）と、9種類の障害タイプおよび7種類のリカバリーアクションに対応するクローズドな列挙型を使用します。リカバリーガイダンスは、各除外されたセクションの下の`partial-pack-synthesis.{md,json}`に、標準的なリカバリーオブジェクトからのコンパクトな投影として埋め込まれます（スタンドアロンと組み込みの両方の表面における唯一の情報源）。識別可能なユニオンである`recovery_unavailable`状態は、エンジン障害の場合を明示的に表示します（サイレントスキップはありません）。フリーズおよび公開のセマンティクスは変更されていません。読みやすい部分的な成果物であっても、不完全なパッケージをフリーズまたは公開することはできません。`accepted_claim_floor`は引き続き変更不可であり、リカバリーアドバイザーは、変更不可の障害に対して`apply_waiver`を推奨しません。**`ollama-intern-mcp@^2.4.0`が必要です**（v0.8.0からの変更はありません）。1266/1266件のvitestテストに合格（1013 → 1266、+253件のテストがアーク全体で追加されました）。**フリーズされたすべての4つのパッケージは、v0.3.3のベースラインに対してバイト単位で検証されます**（6回目の連続リリース）。**v1リリースではありません。** v0.9.0は成果物レイヤーを実際に機能させます。v1への準備、新しいパッケージオペレーター、信頼できるレビューアーモデル、クラウドベースラインでの優位性を示すことは、明示的に今回のリリースには含まれていません。[`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md)および[CHANGELOG.md](CHANGELOG.md)を参照してください。

**v0.8.0 — アーキテクチャリカバリー + フレーム境界のトピック性** — npmに`@mcptoolshop/research-os@0.8.0`として公開、2026年5月12日。v0.8.0はアーキテクチャリカバリーリリースです。research-osは現在、主張抽出のためにローカルの証拠ワーカー基盤として`ollama-intern-mcp@^2.4.0`を使用します（以前はREADMEで依存関係が宣言されていましたが、コードにはv0.1のスケルトン以降、それをバイパスする内部の直接Ollamaスタブがありました。v0.8.0はこのずれを解消します）。追加機能：MCPクライアント基盤（`OLLAMA_INTERN_MCP_BIN`環境変数 + PATH検出 + StdioClientTransportライフサイクル）、4ラベルスキーマ（`supports_section` / `off_topic` / `background_only` / `source_chrome`）を使用した、主張ごとのセクション証拠クリティック`ollama_extract`、新しい`ReviewDecision` `frame_excluded`（レビューは除外された主張に対してLLMをスキップし、合成ClaimReviewを出力します）、`ClaimSchema`に`frame_excluded` + `frame_exclusion_reason`（4値の列挙型で、システム状態障害の場合は`critic_unavailable`が含まれます）+ `frame_exclusion_rationale`が追加されました。セクション範囲の証拠合成は、修復が必要なパッケージ内のゲート対象セクションに対して、`synth section <id>`を使用して行われます（証拠引用インデックス — 主張ID → アサーション → 証拠抜粋 → ソースURL — ナラティブ文章ではありません）。ゲートは、`getEffectivePublisher` / `getEffectiveSourceType`を介してソースカードオーバーライドレジストリを尊重します（v0.7.1のターゲットが吸収されました）。`DEFAULT_WINDOW_CHARS`デフォルト値を5000から3000に変更しました（hermes3:8b用に、`dev-rtx5080`プロファイルの下で8Kのワークホースコンテキストに合わせて調整）。クリティック呼び出しに対するソフトフェイルポリシーが反転しました（5つの障害モードのうちいずれか — トランスポート / 解析 / 無効なラベル / 空の理由 / タイムアウト — デフォルトでは、`critic_unavailable`の理由とともに`frame_excluded: true`になります。アドミッションは行われません）。プロモーションセマンティクス：`frame_excluded`の主張は、セクションのプロモーションをブロックしません。共同作業ハンドオフは、`frame_excluded`を承認済み / 修復 / 却下とは別の独自のバケットとして表示します。**`ollama-intern-mcp@^2.4.0`が必要です**。1013/1013件のvitestテストに合格（901 → 1013、+112件のテスト）。**フリーズされたすべての4つのパッケージは、v0.3.3のベースラインに対してバイト単位で検証されます**。**v1リリースではありません** — v1への準備作業が継続中です。[`docs/roadmap.md`](docs/roadmap.md)を参照してください。[`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md)および[CHANGELOG.md](CHANGELOG.md)を参照してください。

**v0.7.0 — ドッグフード・スウォームによる堅牢性の強化** — npmに`@mcptoolshop/research-os@0.7.0`として公開、2026年5月11日。4段階のドッグフード・スウォーム（バグ/セキュリティ、積極的な回復力、オペレーターの人間化、プレゼンテーションの改善）をv0.6.0ツリーに対して実行。v0.7.0では、以下の堅牢性の強化が行われる：より安全な収集（URLごとのtry/catch + 例外ごとのフラッシュによる、部分的な失敗時のインフライト・ソースIDの保持）；回復力のあるインデクサー（レコードごと／ファイルごと／セクションごとの、不正なJSONLに対するスキップと警告）；構造化されたリカバリーエラー（ハンドブックへの参照を含む12種類のResearchOSErrorサブクラス）；進捗状況フィードバック（`--no-progress`/`--progress`フラグ。レビュー/収集/矛盾マップ/パック・パブリッシュ中にTTYを自動検出）；オペレーター向けの操作性の改善（`pack publish --force`による、8つの表面にわたる回帰テストと破壊的な置換；`IndexNotBuiltError`コマンドテキストのタイプミス修正と、コマンドテキストレジストリテストの追加；12種類のResearchOSErrorサブクラスに対する、エラーごとのハンドブック参照の追加）；サプライチェーンの衛生管理（CIアクションにおけるSHAピンニング + `permissions: contents: read`によるデフォルト拒否；Dependabot `/site` + `github-actions`エコシステムのカバレッジ）；新しいハンドブックページを2つ追加（`recovery.md`、`known-limitations.md`）；プレゼンテーションの改善（標準的な文の回帰テスト、サイドバーの再配置、破壊的アクションに対する`:::caution`による注意喚起）。901/901件のvitestテストに合格（713 → 901、+188件のテスト）。**4つのフローズンパックすべてが、v0.3.3のベースラインに対してバイト単位で検証-パックが一致する。** **v1リリースではない** — v1への準備作業は継続中；詳細は[`docs/roadmap.md`](docs/roadmap.md)および[`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md)を参照。詳細については、[`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md)と[CHANGELOG.md](CHANGELOG.md)を参照。

**v0.6.0** — npmに`@mcptoolshop/research-os@0.6.0`として公開、2026年5月10日。v0.6.0は、レビュー担当者の信頼性を示す証拠とともに、実験6を終了する。これにより、research-osは再現可能で、追跡可能な標準モデルのベースラインを作成できるようになる。以下の機能が追加される：本番環境でのレビューパスにおける決定的なレビューオプション（`research.yaml`の`review_profiles.<name>.reviewer_options`）；v0.3.3より前のフローズンアーティファクトに対するゲートスキーマの後方互換性（F-53）；レビュー出力に、`review.json`および`review.md`でサンプリング条件が直接開示される（F-54）；決定的な集約されたレシートがコミットされる（`hermes-two-pass-deterministic`、`temperature:0, seed:7`）。**信頼できるベースラインは認められない。** `hermes-two-pass-deterministic=failed`（意思決定語彙における構造モデルの能力ギャップであり、分散によるものではない）。**Hermesは`trusted_baseline`に昇格されない。** 重要なのは、合格したレシートではなく、そのメカニズムである。ゲート、フリーズ、または合成法の変更はない。4つのフローズンパックすべてがバイト単位で検証-パックが一致する。713/713件のvitestテストに合格。詳細については、[CHANGELOG.md](CHANGELOG.md)と[`docs/experiment-6-proof.md`](docs/experiment-6-proof.md)を参照。

**v0.5.0** — npmに`@mcptoolshop/research-os@0.5.0`として公開、2026年5月10日。v0.5.0は、レビュー担当者の校正を永続的にする。レビュープロファイルが一度実行されたからといって信頼されるわけではなく、構造化されたシードによる失敗レシートと複数回の集約を通じてステータスを獲得する。以下の機能が追加される：構造化された校正レシートスキーマ（`seeded-v1.{json,md}`、Zodで検証され、4つのステータスラベルを持つ）；複数回の実行ハーネス（`--runs <n>`、実行ごとの分離、中央値に基づくPASS/FAILバー、繰り返し発生する失敗に対する降格）；アーキテクチャを考慮した意思決定語彙バー；パック相対的なレシートの検索（`review-promote`内）。**信頼できるベースラインは認められない：** `hermes-two-pass=failed`（集約、3回の実行）、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`。research-osは、繰り返し発生するシードによる失敗が信頼を裏付けない場合、レビュープロファイルを信頼しないようにすることができる。**ゲート、フリーズ、または合成法の変更はない。4つのフローズンパックすべてがバイト単位で検証-パックが一致する。** 671/671件のvitestテストに合格。詳細については、[CHANGELOG.md](CHANGELOG.md)を参照。

**v0.4.0** — npmに`@mcptoolshop/research-os@0.4.0`として公開、2026年5月10日。v0.4.0は、ソースの識別を永続的にする。決定的なソースタイプルールは、反復可能な多数のケースを処理し、オーバーライドレジャーは再収集時にオペレーターによる修正を保持し、`source-card audit`はスクラッチスクリプトによるドリフトチェックを、第一級のCLIインターフェースに置き換える。以下の機能が追加される：集中化されたソースタイプ分類器（コンポーネントB — `classifySourceType`、11種類の標準ベンダー、`source-type-rules.json`）；ソースカードオーバーライドレジャー（コンポーネントA — `source-card-overrides.jsonl`、`validate` + `list`サブコマンド）；およびソースカード監査CLI（コンポーネントD — `research-os source-card audit --pack <dir>`、7種類の検出タイプ、JSON + Markdownアーティファクト、`--apply --from`適用パス）。F-46の軽微な修正：パックマニフェストは、`research.yaml`にパック初期化時にフリーズされたバージョンではなく、現在のバイナリバージョンを記録する。**ゲート、フリーズ、または合成法の変更はない。既存の4つのフローズンパックすべてがバイト単位で検証-パックが一致する。** 620/620件のvitestテストに合格。詳細については、[CHANGELOG.md](CHANGELOG.md)と[source-card audit handbook page](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/)を参照。

**v0.3.3** — npmに`@mcptoolshop/research-os@0.3.3`として公開、2026年5月10日。パック3（Godotのエクスポート／ランタイムの耐久性、実験3のパック#3）によって得られたゲートセマンティクスの明確性を実装する。ゲート出力には、パック全体でのカウントに加えて、セクションごとの発行者と主要なカウントが含まれるようになる（F-43）；`no_source_cluster_monopoly`は、警告から情報的な診断に変更される（F-41）。**合格／不合格の動作は変更されない。既存のフローズンパックはバイト単位で検証-パックが一致する。** 570/570件のvitestテストに合格。詳細については、[CHANGELOG.md](CHANGELOG.md)と[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)を参照。

**v0.3.2** — npmに`@mcptoolshop/research-os@0.3.2`として公開、2026年5月9日。`pack publish`による承認を考慮した正規化された承認済みクレームの会計処理を実装。`claim-reviews.jsonl`と`pack-audit.json::accepted_claims`間の厳密な等価性チェックは、効果的な集合比較に置き換えられました。承認済みクレームは、最新の標準的なレビュー決定が`accepted_for_synthesis`である一意の`claim_id`です（`claim_id`ごとに最新の決定が優先されます）。従来の監査カウントが効果的な集合と異なるフローズンパックは、拒否する代わりに警告を表示して承認されるようになりました。従来の監査ファイルは変更されずに保存され（ルール15）、アーカイブマニフェストには正規化されたカウントが反映されます。ファントム`claim_id`、互換性のない重複した決定、および合成に適さないゲートについては、引き続き厳格な拒否が行われます。実験3 XRPLパックセッションKで得られた結果：実際のクロージャー台帳の不一致により、`pack publish`が拒否されました（セクション07には24個の生の`accepted_for_synthesis`行がありましたが、レビュー担当者の期間が重複していたため、一意の`claim_id`は19個のみでした）。558/558件のvitestテストに合格。詳細については、[CHANGELOG.md](CHANGELOG.md)および[`docs/pack-publish.md`](docs/pack-publish.md)を参照してください。

**v0.3.1** — npmに`@mcptoolshop/research-os@0.3.1`として公開、2026年5月9日。セクションごとにスコープされたソースフロアの免除（`primary_source_waiver.section_waivers[]`）と、レビュー担当者側の承認を実装しました。これにより、免除されたセクション全体の`source_cluster_monopoly`に関する調査結果は、すべてのクレームを自動的に`needs_source_repair`にルーティングするのではなく、目に見える注意書きとして表示されます。実験3 XRPLパックセッション2で得られた結果：標準プロトコルセクション（単一の基盤チェーン、クローズドガーデンAPI仕様、標準化団体のドキュメント）は、発行者の多様性が真実性の品質の指標であるという仮定を覆しました。その後、540/540件のvitestテストに合格しました。詳細については、[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)を参照してください。

**セクションごとにスコープされたソース免除** — 発行者の多様性がセクションの真実性のソースと構造的に両立しない場合にのみ使用し、単にセクションが十分なソースを見つけられなかった場合には使用しないでください。スキーマで強制される`reason`と空でない`compensating_controls[]`が必要です。パックポリシー`primary_source_waiver_allowed: false`は、パックレベルとセクションごとにスコープされた免除の両方をブロックします。v0.3.1より前のパックレベルの`min_independent_publishers: 0`という回避策は廃止されました。既存のフローズンパックは、既存のリポジトリに基づいて有効なままです。詳細については、[`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md)および[research-packsオペレータープレイブック](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md)を参照してください。

**v0.3.0** — 2026年5月9日に公開。`contradict map`に`--detector <auto|heuristic|ollama-intern>`フラグを実装しました（実験3セッション1、XRPLパックからのF-09チェーンブロッカー修正）。その後、527/527件のvitestテストに合格しました。検出器の選択は、状態に依存する環境変数の操作ではなく、オペレーターが明示的に選択できるようになりました。モードはすべての実行で目に見える形で通知されます。詳細については、[`docs/contradict-map.md`](docs/contradict-map.md)を参照してください。

**v0.2.0** — 2026年5月9日に公開。`research-os pack publish`（実験2）と、パターン2の準備完了述語修正を実装しました。その後、515/515件のvitestテストに合格しました。詳細については、[CHANGELOG.md](CHANGELOG.md)を参照してください。フローズンパックは、単一のコマンドで標準的な`research-packs`アーカイブにエクスポートされます。承認契約はコードによって強制され、チェックリストではありません。詳細については、[`docs/pack-publish.md`](docs/pack-publish.md)を参照してください。

**v0.1.0** — 2026年5月8日にドッグフードパックをフリーズしました。`research-os-packs/research-os-spec/`にあるパック（関連リポジトリ）は、8つのセクションにわたる296件の承認済みクレーム、17件の決定済みのクレーム、30件のオペレーターによってオーバーライドされたクレーム、0件のアクティブな修復ブロック、0件の未解決の矛盾があり、すべてのゲートが`synthesis_eligible=true`で、フリーズ状態になりました。合計16個の重要なルールが累積されました。7つの調査結果とフリーズリポジトリフィンガープリントについては、[`docs/dogfood-proof.md`](docs/dogfood-proof.md)を参照してください。

**research-packsアーカイブモノリポ** — [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs)で公開されており、4つのパッケージが含まれています：`research-os-self-dogfood`（v0.1ドッグフードバックフィル、296件の承認済みクレーム、8つのセクション）、`comfyui-workflow-durability`（実験1、302件の承認済みクレーム、8つのセクション）、`xrpl-creator-token-durability`（実験3パック#2）、および`godot-export-runtime-durability`（実験3パック#3）。すべてのパッケージは`verify-pack.mjs`に合格します。

**v1 実験1（ComfyUIワークフローの耐久性）** — 2026年5月9日に終了。ターミナルAにあるすべての8つのセクションで、パックがフリーズされ、アーカイブが公開されました。詳細については、[`docs/experiment-1-proof.md`](docs/experiment-1-proof.md)および[`docs/roadmap.md`](docs/roadmap.md)を参照してください。

### research-osではないもの（そしてv0.12.1はそうであると主張しない）

- 新しいパッケージでのオペレーター単独での検証は完了していません。v0.12.0 は v0.3 のゲートで見つかった問題を解決しました（防御レベルのオペレーター単独での検証が完了、カバレッジレベルのオペレーター単独での検証はまだ未完了 — この原則は v0.3 で確立されました）。v0.4 のゲートで v0.12.0 をテストした結果、条件付きで合格となりました（承認レベルではありません）。防御の最低基準は維持され、セクションレベルでカバレッジレベルのオペレーター単独での検証が実質的に完了し、最終段階で単一の失敗モードが発生しました。v0.12.1 はその単一の失敗モードを修正するパッチです（R-018）。この npm リリースに対して v0.4 を再実行すると、別のセッションで実行され、最終的な検証に必要な前提条件となります。
- ドッグフードテストと 4 回のオペレーター単独でのゲートテスト以外では、外部ユーザーによる実戦テストは行われていません。6 つのドッグフード実験が完了しました — そのうち 1 つは自己参照型で、5 つは外部ドメイン（ComfyUI、XRPL、Godot、レビューアーのキャリブレーション、決定論的レビューアー）です — さらに v0.1 / v0.2 / v0.3 / v0.4 のオペレーター単独でのゲートテストにより、18 個の名前付きの問題が明らかになりました（R-001 から R-005 は v0.10.0 で解決、R-007 から R-011 は v0.11.0 で解決、R-012 から R-017 は v0.12.0 で解決、R-018 は v0.12.1 で解決）。大規模な外部オペレーターの使用は今後の課題です。
- 完全なパッケージの合成ライターではありません。v0.12.1 は v0.9 のセクション範囲（`synth section`）と部分的なパッケージ範囲（`synth pack --partial`）の記述形式を継承し、それぞれに明確なパッケージの準備状況が記載されています。完全なパッケージの合成には、依然として `synthesis_ready` パッケージが必要であり、受け入れられたクレーム ID を使用して `synth workspace` で人間（または Cowork）による作成が必要です。
- どのレビューアーモデルも推奨するものではありません。v0.12.1 はデフォルトで `trusted_baseline` レビューアープロファイルを同梱していません。キャリブレーションの記録は証拠であり、推奨ではありません。既存の v0.6.0 のキャリブレーション記録は、v0.8.0 の MCP アーキテクチャよりも前に作成されており、MCP パスで再ベースライン化されていません。[レビューアーのキャリブレーションハンドブック](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/) を参照してください。
- 凍結されたパッケージに過去の遺物が残っているわけではありません。v0.4 より前の凍結されたパッケージには、v0.4 より前のハードコードされたスキャフォールド定数のため、`research_os_version: '0.1.0'` が含まれています。修正は v0.4.0 に適用されましたが、それ以前の凍結されたパッケージは Law 15 の下では変更できません。影響を受けるパッケージ内の JSON を監査すると、すでに現在のバージョンが含まれています。
- npm でのプロビナンス認証は行われていません。Sigstore プロビナンス認証は将来のリリースに延期されます。v0.12.1 の npm パッケージは、package-shasum と GitHub リリースのコミットを使用して検証してください。
- クラウドベースラインで優位性があるわけではありません。v0.7.x の `local-first-vs-cloud-research/` での製品検証により、クラウドの可読性とオペレーターの負担に関する利点が明らかになりました。v0.12.1 は、これらの課題が克服されたとは主張していません。

### 既知の制限事項

v0.12.1 には、以前のリリースから引き継がれた 3 つのオペレーターにとって重要な既知の制限事項が含まれています。それぞれについて、[ハンドブックの既知の制限事項ページ](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) および [CHANGELOG.md] に記載されています。これらの制限事項はリリースを妨げるものではなく、それぞれに定義された回復または軽減策があります。

- **B-E-001 — v0.4 より前の凍結パッケージのバージョンスタンプは、過去の遺物です。** v0.3.3 から v0.6.0 で公開された凍結パッケージには、v0.4 より前のハードコードされたスキャフォールド定数のため、`pack.manifest.json` および `pack/research.yaml` に `research_os_version: "0.1.0"` が含まれています。修正は v0.4.0 に適用されました（スキャフォールドは現在、ライブの `RESEARCH_OS_VERSION` をインポートします）。それ以前の凍結パッケージは Law 15 の下では変更できません。影響を受けるパッケージ内の JSON を監査すると、すでに現在のバージョンが含まれています。
- **B-E-004 — npm プロビナンス認証は将来のリリースに延期されます。** v0.12.1 の npm tarball は、package-shasum だけで検証できます。公開フローを Sigstore OIDC を使用した CI ワークフローに移行すると、公開前の翻訳という原則（TranslateGemma 12B はローカルで実行されます）と矛盾するため、移行は将来のリリースで予定されています。v0.12.1 の npm パッケージは、package-shasum と GitHub リリースのコミットを使用して検証してください。
- **B-A-003 — インデクサーのスキーマバージョン移行はドキュメント化されていますが、強制されていません。** v0.12.1 には、書き込み側の `SCHEMA_VERSION` 整数が含まれていますが、読み取り側の移行ランナーは含まれていません。ドキュメントに記載されている `SCHEMA_VERSION` が変更された場合は、`.research-os/index.sqlite` を削除し、`research-os index build --all` を再実行してください。パッケージ自体には影響しません — インデクサーは、証拠とクレームのレイヤーです（Law 8）。再構築はべき等です。

**v0.12.1 では、`trusted_baseline` レビューアープロファイルは含まれていません。** これは意図的な信頼姿勢であり、ギャップではありません。リポジトリ内のキャリブレーション記録（`hermes-two-pass=failed`、`mistral-nemo-two-pass=conditional_pass`、`hermes-single-pass=comparison_only`、`hermes-two-pass-deterministic=failed`）は証拠を記録しています。信頼は、繰り返し行われるシードされた失敗の再現によって獲得されるものであり、仮定するものではありません。これらの記録は v0.8.0 の MCP アーキテクチャよりも前に作成されており、MCP パスで再ベースライン化されていません。

## v1.0 へのロードマップ

v1.0 は達成された状態であり、リリース日ではありません。6 つのドッグフード実験が完了しました（Exp1–Exp6、2026 年 5 月 8 日から 2026 年 5 月 11 日まで）。各実験では、凍結されたリサーチパックが作成され、[`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) に追加されました。この一連の実験により、v0.2.0 の `research-os pack publish` + パターン 2（実験 2）、v0.3.0 の `--detector` フラグ（F-09）、v0.3.1 のセクション範囲の免除（F-10/F-11）、v0.3.2 の正規化された受け入れられたクレームの会計処理（F-36）、v0.3.3 のゲートセマンティクスの明確化（F-43/F-41）、v0.4.0 のソースとしての真実性の原則（F-27/F-47/F-46）、v0.5.0 のレビューアーのキャリブレーションを永続的な信頼契約として（F-48/F-49/F-50）、および v0.6.0 の決定論的レビューアーベースライン（F-53/F-54）が実現されました。v1.0 リリースの準備は、多段階のヘルス/ポリッシュスウォームを通じて進行中です。アーキテクチャロックは、その間も維持されます。完全な計画については、[`docs/roadmap.md`](docs/roadmap.md) を参照してください。

## ライセンス

MIT
