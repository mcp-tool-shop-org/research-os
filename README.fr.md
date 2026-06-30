<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` transforme les résultats d’une recherche, initialement présentés sous forme de document, en un ensemble de preuves figées. Il préserve la vérité des sources, sépare les affirmations de la synthèse, impose une validation par étapes, enregistre les décisions des évaluateurs et les dérogations, et publie un ensemble dont les affirmations peuvent être suivies et vérifiées.

Il ne vous demande pas de faire confiance au modèle. Il vous fournit les outils nécessaires pour déterminer si le modèle, les sources et la synthèse méritent d’être considérés comme fiables.

## En quoi cela consiste

`research-os` est l’interface de contrôle entre « Je souhaite effectuer une recherche sur X » et une base de données de preuves figée, où chaque affirmation peut être retracée. Il sépare les pistes de découverte de la collecte des preuves, l’extraction brute des affirmations triées, la détection des contradictions de leur résolution, et les décisions d’évaluation des conclusions de la synthèse. Chaque étape est enregistrée dans un registre auquel on ne peut qu’ajouter des éléments ; chaque validation est calculée à partir de ces registres, et non simplement affirmée.

Il ne s’agit pas d’un générateur de rapports ni d’une infrastructure d’orchestration de LLM. Il ne rédige pas votre synthèse pour vous. Il impose les conditions dans lesquelles la synthèse peut commencer.

Les ensembles figés sont archivés dans [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — en direct, avec quatre ensembles couvrant les six expériences de test internes. Consultez [`docs/roadmap.md`](docs/roadmap.md) pour connaître la feuille de route de la version 1.0.

La version 0.1 a été soumise à des tests intensifs lors de deux cycles d’expérimentation interne. Le premier — `research-os` effectuant une recherche sur ses propres spécifications — a révélé sept incohérences avant la sortie de la version 0.1.0, chacune nécessitant une correction réelle du code et donnant lieu à une règle ou un modèle d’intégration. Le second (Expérience 1 de la version 1 : durabilité du flux de travail ComfyUI, 11 sessions, domaine sans chevauchement de vocabulaire avec `research-os`) s’est terminé le 2026-05-09 : ensemble figé, archive en ligne, application complète de la règle 2 via la validation `22b5dba`. Les résultats de la preuve de la version 0.1 sont disponibles dans [`docs/dogfood-proof.md`](docs/dogfood-proof.md) ; les résultats de l’expérience 1 sont disponibles dans [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Manuel en ligne : <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Installation

**Prérequis :** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Pour les contributeurs qui effectuent la compilation à partir du code source :

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## Démarrage rapide

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

> **Remarque sur la sortie de `freeze`.** `research-os freeze` fonctionne silencieusement en parcourant chaque artefact canonique et en calculant les hachages de contenu. Il n’y a pas d’affichage progressif pour cette commande. Pour les ensembles volumineux, cela peut prendre plusieurs dizaines de secondes avant qu’il n’affiche quoi que ce soit. Une fois terminé, il affiche un seul bloc de validation (`PASS` / `REFUSED`, ainsi que le chemin du reçu). N’interprétez pas cette pause comme un blocage.

> **Avertissement concernant l’option `--force`.** L’option `--force` efface et remplace le répertoire de l’ensemble cible. Ne conservez pas les fichiers que vous avez créés manuellement dans la sortie de l’ensemble généré. Modifiez plutôt les artefacts en amont (affirmations, sources, synthèse) ou les fichiers associés. Contrat d’admission complet + cas de refus : [`docs/pack-publish.md`](docs/pack-publish.md).

**Pour un exemple concret**, consultez l’ensemble de test interne à `research-os-packs/research-os-spec/` — chaque artefact, chaque reçu, chaque conclusion, chaque empreinte de figement, le tout stocké sur disque dans des registres auxquels on ne peut qu’ajouter des éléments. Cet ensemble est celui qui a produit `docs/dogfood-proof.md`.

**Nécessite [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) en cours d’exécution localement** pour l’extraction, le tri, l’évaluation et la découverte par LLM. Le serveur MCP est détecté via la variable d’environnement `OLLAMA_INTERN_MCP_BIN` ou PATH. Le modèle par défaut est `hermes3:8b`; remplacez-le avec `OLLAMA_INTERN_MODEL=<model>` (ou par appel, `--model <name>`). Définissez `OLLAMA_HOST` si Ollama ne se trouve pas à l’adresse par défaut `localhost:11434`.

## Les 16 règles fondamentales

| # | Règle |
|---|-----|
| 1 | Pas de synthèse avant la vérité des sources. |
| 2 | La collecte est une preuve ; l’extraction est une interprétation. |
| 3 | Les modèles peuvent interpréter des extraits de source, mais ils ne peuvent pas créer des extraits de preuves. |
| 4 | L’extraction peut produire un surplus ; la synthèse ne doit pas hériter de cet excédent. |
| 5 | La cartographie des contradictions met en évidence les tensions ; elle ne résout, ne synthétise ni ne décide quelle affirmation est la plus valable. |
| 6 | Les étapes valident si une section est éligible à la synthèse. Elles ne synthétisent pas et n’occultent pas l’échec. |
| 7 | L’évaluation contradictoire juge l’intégrité de la recherche. Elle ne synthétise ni ne réécrit la vérité des sources. |
| 8 | L’indexation rend les résultats de la recherche consultables. Elle ne crée pas une nouvelle vérité et ne devient pas la source d’enregistrement. |
| 9 | Le transfert aux collaborateurs permet de créer des instructions opérationnelles à partir de la vérité des recherches. Il ne crée pas de vérité ni ne contourne pas les étapes de validation. |
| 10 | L’espace de travail de synthèse organise la vérité des recherches acceptées pour les collaborateurs. Il ne crée pas de synthèse et ne contourne pas le mode de transfert. |
| 11 | L’audit de l’ensemble agrège la vérité des recherches existantes. Il ne crée pas une nouvelle vérité ni n’occulte les preuves au niveau de la section. |
| 12 | La découverte propose des pistes ; seule la collecte produit des preuves. |
| 13 | Un évaluateur n’est considéré comme fiable que si des défaillances initiales prouvent sa capacité à identifier les erreurs. |
| 14 | L’abondance des affirmations ne reflète pas la qualité de la recherche. Les affirmations doivent être triées avant de pouvoir concourir à la synthèse. |
| 15 | Le figement verrouille la vérité des recherches achevées. Il n’achève pas les recherches inachevées et ne transforme pas l’état de réparation en preuve. |
| 16 | Les dérogations assouplissent les contraintes sur les sources ; elles ne peuvent pas créer des preuves. |

**Règle 3** — le LLM n’est jamais l’auteur du texte de la preuve. `research-os` crée un registre déterministe d’extraits (identifiants stables tels que `ex_<source_id_hex>_001`) ; le LLM sélectionne les identifiants des extraits ; `research-os` copie le texte littéral. La classe d’échec « paraphrase sous forme de citation » est structurellement impossible.

**Loi 14** – entre l’extraction et la révision, `research-os claim triage` effectue une déduplication, limite la contribution par source et met de côté les candidats peu prometteurs. La phase de tri ne modifie PAS le fichier `claims.jsonl`; les revendications mises de côté restent dans le registre principal.

## La chaîne de flux v0.1

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

Chaque étape est une commande CLI. Chaque étape écrit dans des artefacts en ajout uniquement. Aucune étape ne synthétise, ne résout ou ne crée de nouvelles données – ces invariants sont appliqués et non supposés. La révision accepte/rejette/demande une correction pour les revendications candidates ; la passerelle utilise ces décisions de révision pour calculer `synthesis_eligible` ; le blocage est le verrou d’intégrité final qui refuse de marquer un ensemble comme terminé à moins que chaque couche ne soit d’accord. Voir [docs/dogfood-proof.md](docs/dogfood-proof.md) pour la preuve v0.1 que la chaîne fonctionne de bout en bout.

Il s’agit de l’alternative structurelle à *recherche → résumé → rapport clair*. La chaîne est le produit.

## Vocabulaire

| Terme | Signification |
|------|---------|
| `research-os` | Le plan de contrôle / CLI / passerelles / loi d’orchestration (ce dépôt) |
| `research-pack` | L’artefact de dépôt généré pour un effort de recherche |
| `research section` | Une unité d’investigation délimitée dans un ensemble |
| `research receipt` | Preuve qu’une section a passé les vérifications source/revendication/passerelle |

## Sécurité

`research-os` est une CLI axée sur le local. Il lit et écrit des fichiers dans le répertoire du pack de recherche que vous lui indiquez, et (lorsque `gather` est utilisé) effectue des requêtes HTTP sortantes pour récupérer les URL de source que vous fournissez. Il ne : n’exécute pas un serveur, n’accepte pas de connexions entrantes, ne stocke pas d’informations d’identification ou n’envoie pas de données de télémétrie. Aucun secret n’est écrit dans les artefacts du pack. Voir [SECURITY.md](SECURITY.md) pour la politique de signalement des vulnérabilités.

## Calibration des réviseurs

La version v0.5.0 rend la calibration des réviseurs durable. Un profil de réviseur n’est pas considéré comme fiable simplement parce qu’il a été exécuté une fois ; il obtient un statut grâce à des reçus structurés de défaillance simulée et à une agrégation multi-exécution. La version v0.6.0 ajoute des options de réviseur déterministes au flux de révision de production et à l’environnement de calibration.

**Aucun profil n’est actuellement admis comme `trusted_baseline`.** Les reçus canoniques dans le dépôt montrent `hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`. Ceci est intentionnel : la confiance se gagne grâce à des preuves répétées de défaillance simulée, et non en étant présumée. Le reçu `hermes-two-pass-deterministic` présente un écart structurel dans les capacités du modèle (2 types de décisions produits ; nécessite 3/6) qui n’est pas un problème de variance.

Les reçus de calibration se trouvent à l’adresse `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`. Chaque reçu enregistre PASS/FAIL par rapport à sept critères, quatre étiquettes d’état (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`) et divulgue honnêtement ce que le dispositif ne peut pas tester (`needs_contradiction_mapping` est inaccessible depuis `seeded-v1`). Voir [CHANGELOG.md](CHANGELOG.md).

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

Lorsque `--runs <n>` est utilisé, les reçus par exécution sont écrits dans `<profile>/runs/run-NNN.json` et un reçu agrégé (avec des critères basés sur la médiane et une détection de défaillance récurrente) est écrit dans `<profile>/seeded-v1.{json,md}`. Le reçu agrégé contient `receipt_kind: 'aggregate'` pour le distinguer des reçus d’exécution unique. Le mode d’exécution unique (`--runs 1` ou omis) conserve le comportement d’écriture directe existant.

**Profils de réviseur déterministes** – utilisez `review_profiles.<name>.reviewer_options` dans `research.yaml` pour inclure `temperature`, `seed` et d’autres paramètres d’échantillonnage Ollama dans chaque construction `OllamaInternReviewer` du flux de révision de production. Le profil `hermes-two-pass-deterministic` est fourni en tant qu’exemple intégré. Voir [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) et la [page du manuel de calibration des réviseurs](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Nouveau dans v0.13.1 – Autorité budgétaire à plusieurs niveaux pour l’extraction et la mise en scène (correctif du chemin C)

La version v0.13.1 est un correctif unique appliqué sur la version v0.13.0. Elle résout la condition de la piste C de la version v0.5 (écart d’étendue R-019 au niveau de l’extraction des revendications) en étendant l’autorité budgétaire à plusieurs niveaux de R-019 à chaque appel MCP `ollama_extract` effectué pendant l’« extraction des revendications » – l’extracteur par fenêtre, le critique des preuves de section R-011 par revendication et le critique du candidat au sauvetage R-012. La même structure architecturale que la couverture synth-prose de R-019. Correctif pour un seul dépôt (uniquement research-os) ; le champ de schéma `tier_budget_ms_override` d’ollama-intern-mcp@2.6.0 est la portée côté serveur inchangée.

Cette version existe parce que l’opérateur seul de la version v0.5 par rapport à `@mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0` a renvoyé **PASS_WITH_CONDITIONS, PAS une autorisation complète** (`operator_aloneness_dst_v0.5`). Toutes les surfaces de la version v0.13 (R-018 + R-019 + R-020 + R-021) ont fonctionné en direct sans bug ; le seuil de sécurité a été maintenu ; refus honnête lors des défaillances nommées avec des actions de récupération documentées. Mais 3 des 8 sources de la section 02 (`02-safety-and-economic`) ont atteint le délai TIER_TIMEOUT instantané de 15 000 ms pendant l’extraction, sans possibilité d’annulation par l’opérateur. R-019 avait fourni l’annulation analogue pour la prose synthétique dans la version v0.13.0 ; la version v0.13.1 l’étend à l’étape d’extraction.

> **R-024 met en œuvre la règle budgétaire à plusieurs niveaux couvrant tous les aspects : lors de l’extension d’un budget à plusieurs niveaux, le budget doit atteindre chaque appel LLM à cette étape qui peut produire le même délai interne. Une couverture partielle = correctif mal ciblé au niveau de la couche de couverture des appels.**
> **R-024 met également en œuvre la règle de fragilité des tests de relecture en direct : lorsqu’un test d’acceptation de relecture en direct échoue pour des raisons liées à l’environnement (synchronisation, capture, état du dispositif) plutôt que pour des raisons mécaniques, corrigez le dispositif de test – ne supprimez pas, ne dégradez pas et n’utilisez pas d’inspection manuelle des artefacts.**

La version 0.5 est configurée sur le chemin D (tri multi-piste). La version 0.13.1 ferme le chemin C. Le chemin A a été fermé lors de la phase de préparation (liste blanche des chemins d’accès à la mémoire). Le chemin B (préparation pour la découverte de sources) s’exécute dans une session distincte après que la version 0.13.1 est publiée. La configuration du seuil de la version 0.6 suit le chemin B. La tranche d’admissibilité 1 reste **non autorisée** jusqu’à ce que la version 0.6 soit validée.

### Ce que vous pouvez exécuter

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

Priorité : indicateur CLI > variable d’environnement > valeur par défaut (omise ; les valeurs par défaut du profil ollama-intern-mcp sont utilisées). Limite de temps de 1 ms à 600 000 ms (limite de sécurité supérieure de 10 minutes). Les valeurs non valides entraînent une erreur claire avec un code de sortie différent de zéro, indiquant la surface et la valeur en cause.

### Nouveautés

**R-024 — autorisation du budget par niveau pour l’étape d’extraction dans les 3 sites d’appel `ollama_extract`.** Le nouveau paramètre `--tier-budget-ms <N>` sur `claim extract` (et la variable d’environnement correspondante `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS`) transmet un dépassement de budget par niveau contrôlé par l’opérateur pour chaque appel à `ollama-intern-mcp@>=2.6.0` sous forme de `tier_budget_ms_override` lors de TOUS les appels à `ollama_extract` pendant l’exécution de l’extraction : `MCPClaimExtractor.extractOnePage` (l’extracteur par fenêtre), `runCritic` (R-011, critique des sections d’une revendication, un appel par brouillon et par fenêtre) et `runRescueCritic` (R-012, critique de sauvetage pour chaque candidat au sauvetage dans les brouillons source_content_mismatch). Le budget actif apparaît dans stderr (`[extract] tier_budget_ms=N source=... section=<id>`) avant la boucle par source, dans les métadonnées du reçu d’extraction (`tier_budget_ms` + `tier_budget_overridden_by` dans `audits/<section>-claim-extract.json`) et dans l’énumération fermée `EXTRACT_TIER_BUDGET_SOURCES` (`['default', 'cli_flag', 'env_var']`). Le comportement par défaut est identique à celui de la version 0.13.0 (pas d’indicateur, pas de variable d’environnement -> les valeurs par défaut du profil sont utilisées ; le reçu omet les nouveaux champs).

### Note architecturale

R-024 reflète l’architecture de R-019 mais à une étape différente. R-019 a intégré le dépassement via `runProseSynthesis` vers le planificateur + le rédacteur + le vérificateur (3 sites d’appel `ollama_extract` pour la synthèse du texte) ; R-024 l’intègre via l’orchestrateur `extract()` → `MCPClaimExtractor.extract` → distribution à extractOnePage + runCritic + runRescueCritic (3 sites d’appel `ollama_extract` pour l’étape d’extraction). La règle de budget par niveau couvrant tous les cas est désormais un principe fondamental : lors de l’extension d’un budget par niveau pour une surface destinée à l’opérateur, le rapport de la phase B doit énumérer chaque site d’appel LLM à cette étape qui partage le même délai d’attente interne. Une couverture partielle entraîne une erreur MISTARGETED-PATCH au niveau de la couverture du site d’appel avec la même signature auto-invalide que l’erreur MISTARGETED-PATCH du wrapper/mécanisme interne de R-018 : le reçu enregistre le dépassement ET le délai d’attente nommé se déclenche dans un site d’appel non couvert dans le même artefact.

Aucun changement apporté à ollama-intern-mcp. Le champ de schéma `tier_budget_ms_override` de la version 2.6.0 est en place depuis la publication coordonnée de R-019 ; la version 0.13.1 fournit le câblage côté recherche-os pour le client de l’étape d’extraction.

### Le seuil de sécurité est maintenu

R-024 est un ajout de paramètre contrôlé par l’opérateur, et non une modification architecturale. R-002 à R-021 restent inchangés. `accepted_claim_floor` reste inamovible. Les énumérations fermées n’ont pas changé (`FailureShape` à 9 ; `RECOVERY_ACTIONS` à 8 ; `REGENERATION_REASONS` à 3 ; `PLANNER_TIMEOUT_SOURCES` à 3 ; `POLICY_KEYWORDS` à 8 ; `POLICY_RELEVANT_SOURCE_TYPES` à 1). R-024 ajoute la nouvelle énumération fermée `EXTRACT_TIER_BUDGET_SOURCES` (3 valeurs) sans modifier aucune énumération existante. Le modèle de requête du conseiller de récupération IA reste inchangé. L’architecture MCP est étendue de manière additive. La forme de l’expression régulière de repli R-010 est conservée. La forme d’extraction `--resume / --progress` de R-015 est conservée (R-024 ajoute une NOUVELLE ligne de journal stderr + de NOUVEAUX champs de reçu ; le format du registre existant + le comportement de saut + la forme d’émission restent inchangés).

La régression des packs figés est identique aux valeurs de référence de la version 0.3.3 pour les quatre packs figés — **dix-neuvième publication consécutive** où cela est vrai. 1630 → 1663 tests Vitest réussis (+33 tests d’acceptation synthétiques R-024 + 1 garde toujours active ; 6 ignorés — les tests de relecture en direct sont conditionnés par des variables d’environnement).

### Ce que la version 0.13.1 ne prétend pas faire

- Préparation pour la version 1.
- Validation du seuil d’opérateur autonome de la version 0.6. La configuration de la version 0.6 suit R-023 (préparation pour la découverte de sources) ; la version 0.13.1 est une condition préalable à la fermeture du chemin C, et non la preuve.
- Tranche d’admissibilité 1. Conditionnée par la validation de la version 0.6.
- Candidats différés de la version 0.13.x (F-2 R-009 divergence audit↔extraction ; F-3 stagnation du transfert de collaboration ; F-4 R-017 étroitesse des POLICY_KEYWORDS).

Consultez le fichier [CHANGELOG.md](CHANGELOG.md) pour obtenir l’entrée complète de la publication.

## Précédemment : version 0.13.0 — Arc de tri des bloqueurs de finalisation (R-019 + R-020 uniquement D + R-021)

La version 0.13.0 ferme l’arc de tri des bloqueurs de finalisation ouvert après que la réexécution de la version 0.4 sur `@mcptoolshop/research-os@0.12.1` a renvoyé **PASS_WITH_CONDITIONS, et non une autorisation complète**, via le chemin D (arc de tri multi-bloqueur, distinct du chemin C nommé). Trois bloqueurs de finalisation indépendants à trois couches différentes du pipeline ; trois paramètres nommés indépendants qui, ensemble, débloquent la synthèse du texte + la surface de récupération du cluster no_answer + le mode automatique de la carte des contradictions. Le seuil de sécurité et les surfaces de couverture-récupération des versions 0.10 / 0.11 / 0.12 / 0.12.1 restent intacts ; aucune modification des énumérations fermées ; aucune modification des surfaces.

> **La réexécution de la version 0.4 prouve que l’acceptation synthétique peut valider le câblage, tandis que la relecture en direct invalide le mécanisme cible.**
> **La version 0.13 traite du contrôle d’exécution de la finalisation : R-019 débloque la couche interne du budget par niveau MCP ; R-020 présente un refus honnête du cluster no_answer avec des actions de récupération ; R-021 débloque la couche RPC du mode automatique de la carte des contradictions.**

Le seuil d’opérateur autonome de la version 0.5 s’applique à la version 0.13.0 publiée dans une session distincte. La tranche d’admissibilité 1 reste **non autorisée** jusqu’à ce que la version 0.5 soit validée.

### Ce que vous pouvez exécuter

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

### Nouveautés

**R-019 : modification du câblage côté client pour le budget par niveau de l’MCP.** Le paramètre `--planner-timeout-ms <N>` de R-018 (et la variable d’environnement `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`) est désormais transmis via le planificateur/rédacteur/vérificateur à `ollama_extract.tier_budget_ms_override`, atteignant `runWithTimeoutAndFallback` dans `ollama-intern-mcp/src/guardrails/timeouts.ts:61`. Le mécanisme de délai d’attente par niveau qui a entraîné l’échec de la nouvelle exécution v0.4 (`elapsed=15018ms budget=15000ms`) respecte désormais directement le budget défini par l’opérateur. L’enveloppe R-018 est conservée en tant que limite externe pour éviter les blocages liés aux promesses non résolues (les enveloppes pour les modes d’échec orthogonaux peuvent effectivement intercepter ces problèmes). Nécessite `ollama-intern-mcp@>=2.6.0` ; les versions antérieures ignorent silencieusement le nouveau champ de schéma (l’enveloppe R-018 fonctionne toujours à son niveau d’origine — dégradation progressive).

**R-020 (uniquement pour D) : surface de récupération `no_answer_cluster`.** Lorsque le planificateur refuse d’attribuer le rôle « réponse » à une affirmation acceptée, l’échec est désormais signalé directement dans `recovery_actions[]` (`narrow_section_purpose` + `add_on_topic_sources`) dans `section-synthesis.json`, un bloc markdown rendu `## Recovery actions` dans `section-synthesis.md` (avec en-tête action_id + texte expliquant la raison + bloc de code command_hint délimité) et une indication d’une seule ligne dans stderr (`[synth] no_answer_cluster — voir le bloc "Recovery actions" dans section-synthesis.md pour les étapes à suivre`). La liste des actions est une source unique de vérité partagée avec le chemin de récupération du graphe d’actions ; il n’y a pas de divergence entre les chemins de commande autonomes et les corps d’échec en ligne. **Le réglage du prompt du planificateur R-020 (moitié A) a été tenté puis annulé** — l’itération 1 a produit une synthèse incorrecte silencieuse (le LLM a fabriqué des réponses à effet nul à partir d’affirmations à effet positif sur des éléments contradictoires ; le vérificateur a validé la négation inversée comme étant « fidèle ») ; le GARDE-ROUE DUR de l’itération 2 n’a pas annulé l’hallucination. Conformément à la règle d’une seule itération définie par l’opérateur, le prompt et les 3 fichiers de test v3 ont été restaurés ; `PROSE_PROMPT_VERSION` reste à `section-prose-v3`. La doctrine a progressé : une relecture en direct peut réussir alors que le contenu synthétisé est incorrect silencieusement ; une inspection manuelle du texte sur des éléments contradictoires est nécessaire pour détecter l’inversion de la négation/du champ d’application/du prédicat.

**R-021 : blocage dû au délai d’attente en mode automatique de `contradict-map` + gestion des exceptions heuristiques + affichage de la progression.** Nouveau paramètre `--auto-mode-pair-timeout-ms <N>` (valeur par défaut : 90 000 ; réduit par rapport aux 120 s codés en dur pré-R-021 après avoir mesuré les performances de hermes3:8b sur v0.4 : min. 6,2 s, médiane 8,4 s, max. 8,8 s → valeur par défaut de 90 s avec une marge d’au moins 81 s). Nouveau paramètre `--auto-mode-fall-through-after-n-timeouts <N>` (valeur par défaut : 5 ; seuil d’échec consécutif pour la gestion des exceptions heuristiques automatiques ; les classifications `type:none` réussies réinitialisent le compteur). Variables d’environnement correspondantes. Nouvelle ligne de début affichée dans stdout (`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`) à chaque invocation — toujours visible, fonctionne même en dehors des contextes TTY. L’émission forcée d’un événement de déclenchement de la gestion des exceptions contourne le filtrage TTY / `--progress` car l’opérateur doit voir le changement de mode. Nouveau bloc markdown `## Auto-mode fall-through` dans `contradictions.md` lorsque le seuil est atteint. Les nouvelles exécutions heuristiques ne concernent que les paires non traitées (pas de nouvelle classification des paires pour lesquelles le LLM a déjà terminé).

### Note architecturale

R-019 traverse la frontière research-os ↔ ollama-intern-mcp. Research-os transmet `tier_budget_ms_override` dans le schéma `ollama_extract` ; ollama-intern-mcp v2.6.0 l’applique au niveau du garde-fou interne. La plomberie était déjà en place ; la version v2.6.0 a fourni le point d’entrée côté client ; la version v0.13.0 fournit le câblage côté client de research-os. L’enveloppe Promise.race de R-018 est conservée car elle protège contre un mode d’échec orthogonal (blocages liés aux promesses non résolues — les enveloppes peuvent intercepter ces problèmes ; des charges utiles structurées `isError:true` à un niveau budgétaire interne que l’enveloppe ne peut pas atteindre relèvent du domaine de R-019).

R-021 est uniquement pour research-os. Le mode automatique de contradict-map ne passe PAS par ollama-intern-mcp — il appelle directement Ollama HTTP `/api/chat`. Pas de transport MCP dans la chaîne ; pas de plomberie `tier_budget_ms_override` ; pas d’enveloppe R-018. Le protocole de démarrage à quatre lois a détecté une erreur dans le lancement de R-021 avant que tout code correctif ne soit écrit : le lancement indiquait « couche RPC MCP » ; la phase A de lecture l’a contredit.

### Le seuil de sécurité est maintenu

R-019 + R-020 (uniquement pour D) + R-021 sont des ajouts contrôlables par l’opérateur, et non des modifications architecturales. R-002 à R-018 restent inchangés. `accepted_claim_floor` reste inamovible. Les énumérations fermées n’ont pas changé (`FailureShape` à 9 ; `RECOVERY_ACTIONS` à 8 ; `REGENERATION_REASONS` à 3 ; `PLANNER_TIMEOUT_SOURCES` à 3 ; `POLICY_KEYWORDS` à 8 ; `POLICY_RELEVANT_SOURCE_TYPES` à 1). Le modèle de prompt du conseiller de récupération IA n’a pas été modifié. L’architecture MCP est étendue de manière additive. La forme de l’expression régulière de cause de repli R-010 est conservée.

Régression sur les quatre paquets gelés, avec une identité parfaite par rapport aux références v0.3.3 — **dix-huitième version consécutive** où cela se produit. 1542 → 1630 tests vitest réussis (+88 dans les trois tranches ; 4 ignorés — tests de relecture en direct conditionnés par des variables d’environnement).

### Ce que v0.13.0 ne prétend pas faire :

- Être prêt pour la version 1.
- Valider le verdict du seuil « opérateur seul » de v0.5. v0.5 est exécuté sur `@mcptoolshop/research-os@0.13.0` dans une session distincte ; v0.13.0 est un prérequis pour la finalisation, et non la preuve.
- Admissibilité Tranche 1. Conditionné par le succès de v0.5.
- Candidats différés v0.13.x (F-2 divergence audit↔extraction R-009 ; F-3 stagnation du transfert de collaboration ; F-4 étroitesse des POLICY_KEYWORDS R-017 ; A-1 + A-2, les conclusions côté architecte intégrées à la préparation du seuil v0.5).

Consultez le fichier [CHANGELOG.md](CHANGELOG.md) pour obtenir l’entrée complète de la publication.

## Auparavant : v0.12.1 — remplacement du délai d’attente du planificateur de synthèse (correctif pour le chemin C)

v0.12.1 était une mise à jour correctrice unique appliquée sur v0.12.0. Elle incluait uniquement R-018, un module qui gère le délai d’attente du wrapper côté « research-os » pour les appels `callTool` de la prose synthétique MCP, contrôlé par un indicateur CLI accessible à l’opérateur (`--planner-timeout-ms <N>` sur `synth section` et `synth workspace`) et une variable d’environnement correspondante (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`). Priorité : indicateur CLI > variable d’environnement > valeur par défaut (15 000 ms). Le comportement par défaut est préservé, identique à v0.12.0.

Cette version a été publiée car le seuil de validation v0.4 pour l’opérateur, concernant `@mcptoolshop/research-os@0.12.0`, a renvoyé **PASS_WITH_CONDITIONS, et non une autorisation complète** (`operator_aloneness_dst_v0.4`). Le seuil de défense v0.11 a été maintenu sous charge réelle ; les six surfaces de couverture/récupération de v0.12 se sont activées et ont permis à l’opérateur de fonctionner ; la couverture scellée a atteint les seuils PASS (4/5 SUPPORTED + 1 PARTIAL requis ; 2/3 SUPPORTED + 1 PARTIAL pour les modérateurs ; 0/3 pièges ; 0/5 défaillances matérielles déclenchées) ; tous les marqueurs de contamination étaient HARMLESS. Le seul mode d’échec était la finalisation : la prose synthétique a atteint `TIER_TIMEOUT` de manière reproductible à environ 15 010 ms, par rapport au budget de 15 s pour le niveau Instant, sans qu’il y ait eu de remplacement d’opérateur documenté. Les résumés des sections étaient conformes aux exigences du dossier ; le pack n’a tout simplement pas pu atteindre l’état final.

**Disposition du chemin C** (nouveau modèle obtenu en v0.4) : lorsque la session B identifie un seul mécanisme d’échec nommé avec un chemin de correctif explicite ET que la couverture du dossier est au seuil PASS ET que le seuil de défense est maintenu ET que la contamination est HARMLESS, la disposition est la suivante : publier le correctif, relancer le même chemin d’opérateur sur la version corrigée et réévaluer. Pas de nouvelle autorisation du dossier. Pas d’évaluateur humain. Pas d’évolution architecturale v0.13.

> **v0.4 prouve que Research-OS est conforme aux exigences de couverture au niveau des résumés de section.**
> **v0.12.1 doit prouver qu’il est conforme aux exigences de finalisation en supprimant le seul goulot d’étranglement du délai d’attente du planificateur sans affaiblir le seuil de défense.**

### Ce que vous pouvez exécuter

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

Les surfaces budgétaires actives se trouvent dans `section-synthesis.json` (`planner_timeout_ms` est toujours renseigné + `planner_timeout_overridden_by` n’est présent que lors d’un remplacement), les métadonnées ProseBlock et stderr (`[synth] planner_timeout_ms=N source=… section=<id>`) qui sont émises avant la génération de la prose. `synth section --help` documente l’indicateur, la valeur par défaut, la limite supérieure (600 000 ms pour plus de sécurité) et l’alternative de variable d’environnement. Les valeurs non valides (négatives, zéro, non numériques, chaînes avec un suffixe d’unité, > 600 000) entraînent une erreur claire avec un code de sortie différent de zéro, indiquant la surface + la valeur fautive. Pas de retour en arrière silencieux.

### Note architecturale

Le budget de 15 000 ms que le seuil v0.4 a atteint se trouve dans `ollama-intern-mcp` (`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`), et non dans research-os. Avant R-018, research-os n’appliquait aucun délai d’attente du planificateur ; le délai d’attente était appliqué côté serveur dans la stratégie de niveau d’ollama-intern-mcp. La résolution de R-018 introduit l’autorité propre à research-os sur le budget via un wrapper `Promise.race` autour de `callTool` de MCP, avec une valeur par défaut correspondant au nombre observé de facto pour le niveau Instant (15 000 ms), afin que le comportement par défaut soit préservé. Le wrapper de R-018 produit des erreurs de type `TIER_TIMEOUT` qui correspondent à l’expression régulière `classifyFallbackCause` de R-010 (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`), ce qui permet de conserver la visibilité de l’IA-conseiller sur les exécutions du chemin par défaut.

### Le seuil de sécurité est maintenu

R-018 est une simple mise à jour correctrice pour l’opérateur, et non un changement architectural. R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 restent inchangés. `accepted_claim_floor` reste inamovible. Les énumérations fermées n’ont pas changé (`FailureShape` à 9 ; `RECOVERY_ACTIONS` à 8 ; `REGENERATION_REASONS` à 3 ; `POLICY_KEYWORDS` à 8 ; `POLICY_RELEVANT_SOURCE_TYPES` à 1). Le modèle de requête pour l’IA-conseiller en récupération n’a pas changé. L’architecture MCP n’a pas changé : `ollama-intern-mcp@^2.4.0` est conservée. R-018 ajoute `PLANNER_TIMEOUT_SOURCES` (3) comme nouveau vocabulaire pour le suivi des opérations, distinct de toute énumération de routage de seuil.

La régression du pack gelé est identique aux valeurs de référence v0.3.3 pour les quatre packs gelés : **seizième version consécutive** où cela se produit. 1542 → 1586 tests Vitest réussis (+44 tests d’acceptation R-018).

### Ce que v0.12.1 ne prétend PAS :

- Prêt pour la v1.
- Nouvelle exécution du seuil d’opérateur autonome v0.4. Les nouvelles exécutions de v0.4 sont effectuées sur `@mcptoolshop/research-os@0.12.1` dans une session distincte ; v0.12.1 est un prérequis pour la finalisation, et non la preuve.
- Tranche d’admissibilité 1. Validée lors de la nouvelle exécution v0.4 : le principe du seuil v0.4 (autonomie de niveau défense POUVÉE ; autonomie de niveau couverture SUBSTANTIELLEMENT POUVÉE au niveau des résumés de section ; finalisation en attente avec v0.12.1) reste le test verrouillé.
- Candidats pour la v0.13 (divergence F-2 R-009 audit↔extract ; stagnation F-3 du transfert de collaboration ; étroitesse F-4 des POLICY_KEYWORDS de R-017). Indépendant de la finalisation.

Consultez le fichier [CHANGELOG.md](CHANGELOG.md) pour obtenir l’entrée complète de la publication.

## Auparavant : v0.12.0 — Version axée sur la couverture et la récupération

v0.12.0 clôt les problèmes liés au seuil d’autonomie de l’opérateur v0.3, qui ont été détectés le 2026-05-16 (`operator_aloneness_dst_v0.3`, PASS_WITH_CONDITIONS mais pas une autorisation complète). Six problèmes nommés répartis sur quatre tranches : trois corrections architecturales qui comblent les lacunes de couverture bloquant la v0.4 (R-012, R-013, R-014), et trois améliorations ergonomiques qui améliorent la surface d’opérateur que le seuil v0.4 exercera (R-015, R-016, R-017). La v0.3 n’a pas échoué parce que les défenses ont régressé : les cinq surfaces de défense de la v0.11 se sont activées exactement comme prévu, produisant une synthèse propre et honnête sans aucun contenu silencieusement incorrect, et le pack s’est gelé sur des preuves réelles mais limitées. Elle a échoué parce que les mêmes défenses, fonctionnant correctement, ont supprimé la couverture principale de la source à partir de la base d’acceptation des revendications. Le principe du seuil obtenu avec v0.3 :

> **v0.11 a rendu le système suffisamment sûr pour éviter les synthèses silencieusement incorrectes.**
> **v0.12 le rend plus capable de récupérer la couverture sans affaiblir ces défenses.**

La thèse : les défenses conservatrices peuvent empêcher la synthèse silencieuse d’erreurs, mais elles peuvent aussi priver le système de la couverture nécessaire. La version 0.12 apporte une solution pour rétablir la couverture. Le seuil de défense de la version 0.11 reste inchangé : chaque surface R-007 à R-011 continue de fonctionner. La version 0.12 ajoute des chemins de récupération légaux et vérifiés.

### Ce que vous pouvez exécuter

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

### Les trois corrections architecturales (seuil de blocage v0.4)

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

### Les trois améliorations ergonomiques (amélioration du fonctionnement du système v0.4)

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

### Limite légale

Les interdictions liées aux règles du système sont préservées. Le paramètre `accepted_claim_floor` reste inamovible. L’énumération fermée `FailureShape` n’est pas modifiée et conserve ses neuf valeurs. L’énumération `RECOVERY_ACTIONS` n’est pas modifiée et conserve ses 8 valeurs : aucune nouvelle action de l’assistant n’est ajoutée ; l’heuristique de forme distincte de R-014 élargit le routage des actions existantes. Le modèle d’invite pour l’assistant de récupération IA reste inchangé (les nouveaux champs `EvidenceState` sont observables dans le JSON persistant, mais ne sont PAS affichés dans l’invite). Les règles du vérificateur de récupération restent inchangées. L’architecture MCP n’est pas modifiée : `ollama-intern-mcp@^2.4.0` est conservée ; aucune modification de la forme des appels MCP lors de l’extraction. L’avertissement de R-017 est informatif et N’AFFECTE PAS le verdict du système, le reçu de gel ou la publication du système. Toutes les défenses v0.10 + v0.11 sont préservées ; le seuil de défense reste le seuil et la version 0.12 s’appuie dessus.

La régression du système gelé est identique à celle des versions de référence v0.3.3 pour les quatre systèmes gelés : **quinzième version consécutive** où cela se vérifie (v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12).

### Ce que la version 0.12.0 ne prétend PAS faire

- Être prête pour la version 1.
- Valider le verdict du système concernant l’opérateur seul (v0.4). La version 0.4 s’exécute avec npm `@mcptoolshop/research-os@0.12.0` dans une session distincte.
- Admissibilité, tranche 1. Validée lors du passage de la version 0.4 : le seuil de la doctrine v0.3 (preuve d’autonomie au niveau de la défense ; l’autonomie au niveau de la couverture n’est pas encore prouvée) reste le test verrouillé.
- Être supérieure aux outils de recherche basés sur le cloud.
- Constituer un modèle complet et fiable pour calibrer les évaluateurs.

La version 0.12.0 est une condition préalable à la version 0.4 du système concernant l’opérateur seul, et non une preuve.

Voir [CHANGELOG.md](CHANGELOG.md) et l’exemple de remplacement orienté opérateur disponible à l’adresse [`examples/source-card-override.example.json`](examples/source-card-override.example.json).

## Précédemment : v0.11.0 – Deuxième version corrigeant le problème de l’opérateur seul

La version 0.11.0 a corrigé les conditions d’échec du système concernant l’opérateur seul (v0.2) : alignement de la réparation de la portée/limite (R-007), vérification de la pertinence de l’URL au moment de la découverte (R-008), défense contre la contamination des sources appariées lors de l’extraction et aux niveaux du cadre critique (R-009 + R-011) et visibilité de la cause de repli de l’assistant de récupération (R-010). La protection des sources à trois niveaux (R-008 à l’admission + R-009 à l’extraction + R-011 au niveau du cadre critique) est intégrée ici. Voir [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md).

## Précédemment : v0.10.0 – Version corrigeant le problème de l’opérateur seul

La version 0.10.0 a corrigé les conditions d’échec du système concernant l’opérateur seul (v0.1) qui sont apparues le 2026-05-15 (`operator_aloneness_dst_v0.1`, ÉCHEC) : alignement du routage de la récupération (R-002), CLI de réparation de la portée (R-001), renforcement de l’audit des cartes sources appariées (R-003 + R-005) et statut honnête de la collecte (R-004). Voir [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

## Précédemment : v0.9.0 – Arc de l’artefact produit

La version 0.9.0 a transformé la base de données des preuves v0.8 en artefacts utiles pour l’opérateur : synthèse du texte au niveau de la section (`synth section`), synthèse partielle du système (`synth pack --partial`) et assistant de récupération légal (`recover pack`). Voir [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## Précédemment : v0.8.0 – Récupération de l’architecture

La version 0.8.0 a reconnecté research-os à son substrat LLM local déclaré (`ollama-intern-mcp@^2.4.0`) pour l’extraction des revendications, a ajouté le renforcement de la pertinence de la section par rapport au cadre et a ajouté la synthèse des citations de preuves au niveau de la section pour les sections admissibles dans les systèmes nécessitant une réparation. Voir [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Statut

**v0.11.0 — Deuxième version corrigeant les problèmes liés à l’opérateur et à son isolement** — publiée sur npm sous le nom `@mcptoolshop/research-os@0.11.0`, le 2026-05-15. La v0.11.0 résout les conditions de défaillance liées au contrôle d’isolement de l’opérateur v0.2 (`operator_aloneness_dst_v0.2`, PASS_WITH_CONDITIONS, mais pas avec une autorisation suffisante le 2026-05-15) grâce à un cycle de correction en quatre étapes couvrant cinq problèmes identifiés. **R-007** (alignement de la portée/limite pour la correction) : `claim repair-scope --auto` remplit désormais TOUT `scope` ET `not` lorsque les deux sont nuls dans une revendication importante au moment de la correction — résout le problème du cycle bloqué v0.2 où la correction R-001 de la v0.10 ne remplissait que `scope`, et `claim triage` reclassait les revendications corrigées comme nécessitant une correction de portée (`needs_scope_repair`). Le modèle de limite reflète la forme de dégradation du modèle de portée. Le registre en ajout uniquement enregistre désormais `applied_not` ainsi que `applied_scope`. **R-008** (détection et défense contre les URL hallucinées) : `discover run` récupère désormais le `<title>` de chaque URL candidate (limite : corps de 64 Ko, délai d’attente de 5 s, concurrence à 4 voies) et calcule un chevauchement déterministe des mots-clés par rapport à la requête de découverte. Chaque candidat obtient un bloc `relevance` (`verified | unverified | topic_mismatch`) ; `approve --top N` met en quarantaine `topic_mismatch` ; l’opérateur peut remplacer cela via `approve --candidate <id>`. Résout le problème de la v0.2 où `llm-heuristic` renvoyait 3 URL PMC réelles pointant vers des articles totalement sans rapport sur le cancer, la biochimie et le lymphome lié au VIH. **R-009** (protection de l’identité de l’extracteur) : nouvelle gravité de la carte source `source_identity_mismatch` (ÉCHEC ABSOLU) lorsque `card.title` émis par l’extracteur ne correspond pas au `<title>` HTML récupéré. Résout le problème de la v0.2 concernant la confusion « rats and clonidine ». Réutilise l’outil de chevauchement de R-008 ; remplacement via `clear_severities[]`. **R-011** (pré-vérification du contenu source par le critique de cadre) : nouvelle raison d’exclusion de cadre `source_content_mismatch`. Le critique de cadre calcule désormais une signature de contenu source une fois par source et effectue une pré-vérification déterministe avant l’appel au critique LLM ; en dessous du seuil, l’appel au LLM est interrompu et `frame_excluded: true` est marqué. Résout le problème de la v0.2 où 11 revendications dérivées d’articles sur le cancer avec un texte encadré DST étaient acceptées par le critique LLM. **R-010** (restauration de la visibilité du MD en cas de repli) : nouveau type énuméré fermé `FALLBACK_CAUSES` (`tier_timeout | mcp_error | retry_exhausted`) + bloc optionnel `FallbackTiming { elapsed_ms, budget_ms }` dans les métadonnées `prose_error` ; le MD récupéré affiche une section « Pourquoi l’assistant IA est-il revenu en arrière » et un résumé des causes principales. Résout le problème de la v0.2 concernant l’absence de TIER_TIMEOUT dans le format JSON uniquement. **La protection du contenu source à trois niveaux est désormais complète** (admission R-008 + extraction R-009 + critique R-011) avec une indépendance vérifiée des couches de défense. **Nécessite `ollama-intern-mcp@^2.4.0`** (inchangé par rapport à la v0.8.0). 1 448/1 448 tests Vitest réussis (1 344 → 1 448, +104 tests dans le cycle). **Les quatre ensembles gelés vérifient byte-identiquement les bases de référence v0.3** (onzième version consécutive). **Il ne s’agit pas d’une version v1. Il ne s’agit pas d’un verdict sur le contrôle d’isolement de l’opérateur v0.3** — la v0.3 s’exécute par rapport à cette version npm dans une session distincte. Le travail sur la doctrine d’admissibilité est conditionné par PASS de la v0.3. Voir [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.10.0 — Version corrigeant les problèmes liés à l’opérateur et à son isolement** — publiée sur npm sous le nom `@mcptoolshop/research-os@0.10.0`, le 2026-05-15. La v0.10.0 résout les conditions de défaillance liées au contrôle d’isolement de l’opérateur v0.1 (`operator_aloneness_dst_v0.1`, ÉCHEC le 2026-05-15) grâce à un cycle de correction en quatre étapes. **R-001** (`research-os claim repair-scope <section> [--auto | --interactive]` : nouvelle interface de ligne de commande pour corriger les revendications dont le champ `scope` est arrivé avec la valeur `null` lors de l’extraction ; registre en ajout uniquement `evidence/claim-scope-repairs.jsonl` ; nouvelle action `repair_claim_scope` dans `RECOVERY_ACTIONS` (le type énuméré fermé passe de 7 à 8) ; l’assistant le présente comme étant de rang 1 sur `accepted_claim_floor` lorsqu’il y a ≥3 revendications dans `needs_repair_claims`. **R-002** (routage de la récupération) : la couche de diagnostic lit désormais `gate.json:blocking_reasons[]` comme surface de routage faisant autorité avant de revenir à la recherche héritée `failures[].check` — les signaux de blocage du contrôle l’emportent sur les signaux en aval tels que `source_card_classification_gap`. **R-003 + R-005** (durcissement de l’audit de la carte source, appariés) : nouvelles gravités `bot_check_or_captcha_detected` (ÉCHEC ABSOLU — signal composite : marqueurs + forme du corps) et `extraction_suspect_word_count_mismatch` (AVERTISSEMENT ET MISE EN QUARANTAINE — corps ≤200 mots ET extraction ≥800 mots ET ratio ≥4). L’opérateur peut remplacer cela via le nouveau champ `clear_severities[]` dans le schéma du registre de remplacement v0.4. Bloc optionnel `audit.severity_thresholds` dans `research.yaml` pour un réglage par paquet. **R-004** (`gather_outcome` honnête) : type énuméré à 5 valeurs sur `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`) ; la phrase confuse de la v0.1 « Échec (HTTP 200 OK) » a disparu. Voir [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Arc de l’artefact produit** — publié sur npm sous le nom `@mcptoolshop/research-os@0.9.0`, le 14 mai 2026. La version v0.9.0 transforme la base de données de preuves v0.8 en artefacts utiles pour les opérateurs. La synthèse au niveau des sections (`research-os synth section <id>`) produit un Markdown lisible avec des ensembles de supports au niveau du paragraphe, pointant vers les affirmations acceptées. La synthèse partielle (`research-os synth pack --partial`) utilise le contenu textuel des sections (jamais les affirmations brutes) et divulgue les sections exclues avec des justifications structurées ; un planificateur d’ensembles déterministe présélectionne les supports inter-sections requis lorsque ≥ 2 sections sont incluses. L’outil de récupération légal (`research-os recover pack`) produit des instructions pour les opérateurs concernant les sections bloquées, en utilisant une architecture à quatre niveaux : diagnostic déterministe + graphe d’actions légales + conseils basés sur l’IA + vérificateur, avec trois chemins de conseil (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) et des énumérations fermées pour neuf types d’échecs et sept actions de récupération. Les conseils de récupération sont intégrés dans `partial-pack-synthesis.{md,json}` sous chaque section exclue via une projection compacte à partir de l’objet de récupération canonique (source unique de vérité entre les surfaces autonomes et intégrées) ; un état d’union discriminée `recovery_unavailable` affiche explicitement les cas d’échec du moteur (pas de sauts silencieux). Les règles de gel et de publication restent inchangées : les artefacts partiels lisibles ne rendent pas un ensemble incomplet gelable ou publiable. `accepted_claim_floor` reste inamovible ; l’outil de récupération refuse de recommander `apply_waiver` pour les échecs inamovibles. **Nécessite `ollama-intern-mcp@^2.4.0`** (inchangé par rapport à la version v0.8.0). 1266/1266 tests Vitest réussis (1013 → 1266, +253 tests dans l’ensemble). **Les quatre ensembles gelés vérifient-pack et sont identiques au niveau des octets par rapport aux références de la version v0.3.3** (sixième version consécutive). **Ce n’est pas une version v1.** La version v0.9.0 rend la couche d’artefacts réelle ; la préparation pour la version v1, l’autonomie des ensembles frais pour les opérateurs, un modèle de révision fiable et une revendication de victoire par rapport à une base de données dans le cloud ne sont pas incluses explicitement. Voir [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Récupération de l’architecture + pertinence délimitée par un cadre** — publié sur npm sous le nom `@mcptoolshop/research-os@0.8.0`, le 12 mai 2026. La version v0.8.0 est une version axée sur la récupération de l’architecture : research-os utilise désormais `ollama-intern-mcp@^2.4.0` comme substrat local pour l’extraction des preuves (précédemment, le fichier README déclarait la dépendance, mais le code contenait des stubs directs vers Ollama en interne qui contournaient cette dépendance depuis la version v0.1 — la version v0.8.0 corrige cet écart). Ajoute : substrat client MCP (`OLLAMA_INTERN_MCP_BIN` dans l’environnement + découverte via PATH + cycle de vie StdioClientTransport) ; critique des preuves par section via `ollama_extract` avec un schéma à 4 étiquettes (`supports_section` / `off_topic` / `background_only` / `source_chrome`) ; nouvelle `ReviewDecision` `frame_excluded` (la révision ignore le LLM pour les affirmations exclues, émet une synthèse ClaimReview) ; `ClaimSchema` gagne `frame_excluded` + `frame_exclusion_reason` (énumération à 4 valeurs incluant `critic_unavailable` pour les défaillances de l’état du système) + `frame_exclusion_rationale` ; synthèse des preuves au niveau de la section via `synth section <id>` pour les sections éligibles dans les ensembles nécessitant une réparation (indexation des citations de preuves — ID d’affirmation → assertion → extrait de preuve → URL de la source — PAS un texte narratif) ; le contrôle honore le registre de remplacement de la source via `getEffectivePublisher` / `getEffectiveSourceType` (absorbé de la version v0.7.1) ; `DEFAULT_WINDOW_CHARS` par défaut 5000 → 3000 (taille pour hermes3:8b avec un contexte de travail de 8 Ko sous le profil `dev-rtx5080`) ; politique d’échec en douceur inversée lors de l’appel au critique (l’un des 5 modes d’échec — transport / analyse / étiquette non valide / justification vide / délai d’attente — par défaut `frame_excluded: true` avec la raison `critic_unavailable`, et non une admission) ; sémantique de promotion : les affirmations `frame_excluded` ne bloquent pas la promotion des sections ; le transfert du travail affiche `frame_excluded` comme un compartiment distinct des éléments acceptés / en réparation / rejetés. **Nécessite `ollama-intern-mcp@^2.4.0`**. 1013/1013 tests Vitest réussis (901 → 1013, +112 tests). **Les quatre ensembles gelés vérifient-pack et sont identiques au niveau des octets par rapport aux références de la version v0.3.3.** **Ce n’est pas une version v1** — les travaux de préparation pour la version v1 se poursuivent ; voir [`docs/roadmap.md`](docs/roadmap.md). Voir [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Renforcement de la sécurité du « dogfood swarm »** — publié sur npm sous le nom `@mcptoolshop/research-os@0.7.0`, le 11 mai 2026. Un « dogfood swarm » en quatre étapes (détection des bogues et des failles de sécurité, résilience proactive, amélioration de l’expérience utilisateur pour les opérateurs, optimisation de la présentation) a été exécuté sur la branche v0.6.0. La version v0.7.0 inclut les améliorations suivantes : collecte plus sûre (tentative/gestion des exceptions par URL + conservation en mémoire des identifiants des sources en cours en cas d’échec partiel) ; indexeur résilient (omission et avertissement par enregistrement/fichier/section en cas de JSONL malformé) ; erreurs de récupération structurées (12 sous-classes ResearchOSError avec liens vers le manuel) ; retour d’informations sur l’avancement (`--no-progress` / `--progress`, détection automatique du TTY pour les étapes de révision/collecte/comparaison/publication) ; corrections concernant les actions à la disposition des opérateurs (`pack publish --force`, phrase canonique remplaçant de manière destructive, ancrée dans 8 éléments avec test de régression ; correction d’une faute de frappe dans le texte de commande `IndexNotBuiltError` et ajout d’un test de registre pour ce texte de commande ; ajout rétroactif de liens vers le manuel pour chaque erreur dans les 12 sous-classes ResearchOSError) ; amélioration de l’intégrité de la chaîne d’approvisionnement (épinglage SHA des actions CI + `permissions: contents: read`, autorisation par défaut) ; deux nouvelles pages du manuel (`recovery.md`, `known-limitations.md`) ; optimisation de la présentation (phrase canonique pour les tests de régression, réorganisation de la barre latérale, appels à l’attention `:::caution` pour les actions destructrices). 901/901 tests Vitest réussis (713 → 901, +188 tests). **Les quatre ensembles gelés vérifient-pack et sont identiques au niveau des octets par rapport aux versions de référence v0.3.3.** **Il ne s’agit pas d’une version v1** — les travaux préparatoires à la version v1 se poursuivent ; voir [`docs/roadmap.md`](docs/roadmap.md) et [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md). Voir [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — publié sur npm sous le nom `@mcptoolshop/research-os@0.6.0`, le 10 mai 2026. La version v0.6.0 clôt l’Expérience 6 avec des preuves de confiance envers les évaluateurs : research-os peut désormais produire une base de référence canonique reproductible et attribuable. Inclut : options déterministes pour les évaluateurs dans le processus d’évaluation en production (`review_profiles.<name>.reviewer_options` dans `research.yaml`) ; compatibilité ascendante du schéma de validation pour les artefacts gelés antérieurs à la version v0.3.3 (F-53) ; l’affichage des résultats de l’évaluation inclut désormais les conditions d’échantillonnage directement dans `review.json` et `review.md` (F-54) ; engagement d’un reçu agrégé canonique déterministe (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **Aucune base de référence fiable n’est admise.** `hermes-two-pass-deterministic=failed` (écart entre les capacités du modèle structurel et le vocabulaire décisionnel, pas une question de variance). **Hermes n’est pas promu au statut de `trusted_baseline`.** Le succès réside dans le mécanisme, et non dans un simple résultat positif. Aucun changement apporté aux validations, aux gel ou aux lois de synthèse. Les quatre ensembles gelés vérifient-pack et sont identiques au niveau des octets. 713/713 tests Vitest réussis. Voir [CHANGELOG.md](CHANGELOG.md) et [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — publié sur npm sous le nom `@mcptoolshop/research-os@0.5.0`, le 10 mai 2026. La version v0.5.0 rend l’étalonnage des évaluateurs durable. Un profil d’évaluateur n’est pas considéré comme fiable simplement parce qu’il a été exécuté une fois ; il obtient un statut grâce à des reçus structurés de défaillance simulée et à une agrégation sur plusieurs exécutions. Inclut : schéma de reçu d’étalonnage structuré (`seeded-v1.{json,md}`, validé par Zod, quatre étiquettes d’état) ; ensemble d’exécution multiple (`--runs <n>`, isolation par exécution, barres PASS/FAIL basées sur la médiane, rétrogradation en cas de défaillance récurrente) ; barre du vocabulaire décisionnel tenant compte de l’architecture ; recherche des reçus relatifs à l’ensemble dans `review-promote`. **Aucune base de référence fiable n’est admise :** `hermes-two-pass=failed` (agrégé, 3 exécutions), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. research-os peut désormais refuser de considérer un profil d’évaluateur comme fiable lorsque des défaillances simulées répétées ne confirment pas la confiance. **Aucun changement apporté aux validations, aux gel ou aux lois de synthèse. Les quatre ensembles gelés vérifient-pack et sont identiques au niveau des octets.** 671/671 tests Vitest réussis. Voir [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — publié sur npm sous le nom `@mcptoolshop/research-os@0.4.0`, le 10 mai 2026. La version v0.4.0 rend l’identité de la source durable. Les règles déterministes du type de source gèrent la majorité répétable, les registres d’override conservent les corrections apportées par l’opérateur lors des nouvelles collectes et `source-card audit` remplace les vérifications manuelles par une interface CLI complète. Inclut : classificateur centralisé du type de source (Composant B — `classifySourceType`, 11 fournisseurs canoniques, `source-type-rules.json`) ; registre d’override des cartes sources (Composant A — `source-card-overrides.jsonl`, sous-commandes `validate` et `list`) ; et interface CLI d’audit des cartes sources (Composant D — `research-os source-card audit --pack <dir>`, 7 types de résultats, artefacts JSON + Markdown, `--apply --from` chemin d’application). Correction cosmétique F-46 : les manifestes des ensembles incluent désormais la version du binaire en cours plutôt que la version gelée dans `research.yaml` lors de l’initialisation de l’ensemble. **Aucun changement apporté aux validations, aux gel ou aux lois de synthèse. Les quatre ensembles gelés existants vérifient-pack et sont identiques au niveau des octets.** 620/620 tests Vitest réussis. Voir [CHANGELOG.md](CHANGELOG.md) et la [page du manuel sur l’audit des cartes sources](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — publié sur npm sous le nom `@mcptoolshop/research-os@0.3.3`, le 10 mai 2026. Inclut les améliorations de la clarté des sémantiques de validation obtenues grâce à l’Ensemble 3 (durabilité de l’exportation/exécution Godot, Ensemble 3, paquet n° 3 sur 3). Les résultats de la validation incluent désormais le nombre d’éditeurs et le nombre total par section, en plus du nombre total pour l’ensemble (F-43) ; `no_source_cluster_monopoly` a été reformulé, passant d’un avertissement à un diagnostic informatif (F-41). **Le comportement de réussite/échec n’a pas changé ; les ensembles gelés existants vérifient-pack et sont identiques au niveau des octets.** 570/570 tests Vitest réussis. Voir [CHANGELOG.md](CHANGELOG.md) et [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — publié sur npm sous le nom `@mcptoolshop/research-os@0.3.2`, le 9 mai 2026. Inclut une comptabilité normalisée des revendications acceptées, tenant compte de l’admission via `pack publish`. La vérification stricte de l’égalité entre `claim-reviews.jsonl` et `pack-audit.json::accepted_claims` est remplacée par une comparaison d’ensembles effectifs : les revendications acceptées sont des identifiants (`claim_id`) uniques dont la dernière décision d’évaluation canonique est `accepted_for_synthesis` (la dernière décision prévaut pour chaque `claim_id`). Les paquets figés dont le nombre d’audits hérités diffère de l’ensemble effectif sont désormais autorisés avec un avertissement plutôt que rejetés ; le fichier d’audit hérité est conservé tel quel (Loi 15), tandis que le manifeste d’archive reflète le nombre normalisé. Le refus reste strict pour les identifiants de revendication fantômes, les décisions incompatibles en double et les critères non éligibles à la synthèse. Obtenu lors de l’expérience 3, session K du paquet XRPL. La publication du paquet a été refusée en raison d’un désaccord réel sur une jonction de registre. (La section 07 contenait 24 lignes brutes `accepted_for_synthesis`, mais seulement 19 identifiants `claim_id` uniques en raison de périodes d’évaluation des évaluateurs qui se chevauchent). 558/558 tests Vitest réussis. Voir [CHANGELOG.md](CHANGELOG.md) et [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — publié sur npm sous le nom `@mcptoolshop/research-os@0.3.1`, le 9 mai 2026. Inclut des exemptions de sources à l’échelle de la section (`primary_source_waiver.section_waivers[]`) ainsi qu’une reconnaissance côté évaluateur, de sorte qu’une exemption concernant un critère `source_cluster_monopoly` à l’échelle de la section devienne une réserve visible plutôt que d’acheminer automatiquement toutes les revendications vers `needs_source_repair`. Obtenu lors de l’expérience 3, session 2 du paquet XRPL. Les sections du protocole canonique (chaînes à fondation unique, spécifications d’API en environnement clos, documents des organismes de normalisation) ont inversé l’hypothèse selon laquelle la diversité des éditeurs est un indicateur de la qualité de la vérité. 540/540 tests Vitest réussis. Voir [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Exemptions de sources à l’échelle de la section** — Utilisez-les lorsque la diversité des éditeurs est structurellement incompatible avec la source de vérité de la section, et non pas simplement lorsqu’une section n’a pas réussi à trouver suffisamment de sources. `reason` appliqué par schéma + `compensating_controls[]` non vide. La politique du paquet `primary_source_waiver_allowed: false` bloque les exemptions au niveau du paquet et au niveau de la section. Le correctif du niveau du paquet pré-v0.3.1, `min_independent_publishers: 0`, est désormais obsolète ; les paquets figés existants restent valides en fonction de leurs reçus actuels. Voir [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) et le [guide d’utilisation pour les opérateurs des paquets de recherche](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publié le 9 mai 2026. Inclut l’indicateur `--detector <auto|heuristic|ollama-intern>` dans `contradict map` (correction du blocage de chaîne F-09 de l’expérience 3, session 1, paquet XRPL). 527/527 tests Vitest réussis. La sélection du détecteur est désormais un choix explicite de l’opérateur au lieu d’une danse de variables d’environnement dépendantes de l’état ; le mode est annoncé de manière visible à chaque exécution. Voir [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publié le 9 mai 2026. Inclut `research-os pack publish` (expérience 2) et la correction du prédicat de préparation du modèle 2. 515/515 tests Vitest réussis. Voir [CHANGELOG.md](CHANGELOG.md). Les paquets figés sont exportés vers l’archive canonique `research-packs` à l’aide d’une seule commande ; le contrat d’admission est appliqué par le code, et non par une liste de contrôle. Voir [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — paquet de test gelé le 8 mai 2026. Le paquet situé à `research-os-packs/research-os-spec/` (dépôt frère) a atteint l’état gelé avec 296 revendications acceptées dans 8 sections, 17 ayant fait l’objet d’une décision, 30 ayant été modifiées par l’opérateur, 0 bloqueurs de réparation actifs, 0 contradictions non résolues, tous les critères `synthesis_eligible=true`. Seize lois cumulatives essentielles. Voir [`docs/dogfood-proof.md`](docs/dogfood-proof.md) pour les sept conclusions et les empreintes des reçus du gel.

**Dépôt monorepo d’archives research-packs** — disponible à l’adresse [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) avec quatre paquets : `research-os-self-dogfood` (v0.1, paquet de test, 296 revendications acceptées, 8 sections), `comfyui-workflow-durability` (expérience 1, 302 revendications acceptées, 8 sections), `xrpl-creator-token-durability` (paquet n° 2 de l’expérience 3) et `godot-export-runtime-durability` (paquet n° 3 de l’expérience 3). Tous les paquets PASSENT le test `verify-pack.mjs`.

**Expérience 1 de la v1 (Durabilité du flux de travail ComfyUI)** — TERMINÉE le 9 mai 2026. Les 8 sections au terminal A, le paquet est gelé, l’archive est disponible. Voir [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) et [`docs/roadmap.md`](docs/roadmap.md).

### Ce que research-os n’est pas (et ce que la v0.12.1 ne prétend pas être)

- Il n’a pas été prouvé que le système fonctionne de manière autonome sans opérateur sur les nouveaux ensembles de données. La version 0.12.0 a clôturé les tests de la version 0.3 (autonomie de niveau défense POUVÉE ; l’autonomie de niveau couverture N’EST pas encore disponible — le principe d’amélioration acquis à la version 0.3) ; le test de la version 0.4 par rapport à la version 0.12.0 a donné un résultat POSITIF AVEC DES CONDITIONS (PAS de niveau autorisation) — le seuil minimum de défense est maintenu, l’autonomie de niveau couverture est SUBSTANTIELLEMENT POUVÉE au niveau des sections, un seul mode d’échec à la phase finale. La version 0.12.1 corrige ce seul mode d’échec (R-018). Le nouveau test de la version 0.4 par rapport à cette publication npm est effectué dans une session distincte et constitue le prérequis pour la phase finale.
- Il n’a pas été suffisamment testé par des utilisateurs externes au-delà des phases de test internes et des quatre tests d’autonomie sans opérateur. Six expériences de test internes ont été clôturées — une autoréférentielle, cinq dans des domaines externes (ComfyUI, XRPL, Godot, calibration des évaluateurs, évaluation déterministe) — plus les tests d’autonomie sans opérateur des versions 0.1 / 0.2 / 0.3 / 0.4, qui ont révélé 18 problèmes identifiés (R-001 à R-005 résolus dans la version 0.10.0, R-007 à R-011 résolus dans la version 0.11.0, R-012 à R-017 résolus dans la version 0.12.0, R-018 résolu dans la version 0.12.1). L’utilisation externe du système à grande échelle reste un objectif futur.
- Il ne s’agit pas d’un outil complet de synthèse des données. La version 0.12.1 hérite des éléments de portée de section (`synth section`) et de portée partielle (`synth pack --partial`) de la version 0.9, chacun avec une indication explicite de la préparation des données. La synthèse complète des données nécessite toujours un ensemble de données `synthesis_ready` et une création par un humain (ou Cowork) à partir d’ID de revendications acceptées via `synth workspace`.
- Il ne s’agit pas d’une approbation de tout modèle d’évaluateur. La version 0.12.1 n’inclut pas, par défaut, un profil d’évaluateur `trusted_baseline` ; les reçus de calibration sont des preuves, et non une approbation. Les reçus de calibration existants de la version 0.6.0 précèdent l’architecture MCP de la version 0.8.0 et n’ont pas été réinitialisés dans le cadre de cette architecture. Voir la [page du manuel sur la calibration des évaluateurs](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Il ne contient pas d’artefacts historiques dans les ensembles de données figés. Les ensembles de données figés antérieurs à la version 0.4 contiennent `research_os_version: '0.1.0'` en raison d’une constante de base codée en dur antérieure à la version 0.4 ; la correction a été intégrée dans la version 0.4.0, mais les anciens ensembles de données figés sont immuables conformément à la loi 15 (voir [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Il n’est pas certifié en termes de provenance sur npm. La certification de la provenance par Sigstore est reportée à une version ultérieure ; vérifiez les packages npm de la version 0.12.1 via package-shasum et le commit de publication sur GitHub.
- Ce n’est pas un avantage décisif pour une architecture basée sur le cloud. La preuve du concept à `local-first-vs-cloud-research/` de la version 0.7.x a identifié les avantages du cloud en termes de lisibilité et de charge de travail de l’opérateur ; la version 0.12.1 ne prétend pas que ces problèmes ont été résolus.

### Limitations connues

La version 0.12.1 est livrée avec trois limitations connues visibles par l’opérateur, qui sont issues des versions précédentes. Chacune d’entre elles est documentée dans la [page sur les limitations connues du manuel](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) et dans le fichier [CHANGELOG.md]. Aucune ne bloque la publication ; toutes ont un chemin de récupération ou d’atténuation défini.

- **B-E-001 — l’horodatage de la version des ensembles de données figés antérieurs à la version 0.4 est un artefact historique.** Les ensembles de données figés publiés dans les versions 0.3.3 à 0.6.0 contiennent `research_os_version: "0.1.0"` dans `pack.manifest.json` et `pack/research.yaml` en raison d’une constante de base codée en dur antérieure à la version 0.4. La correction a été intégrée dans la version 0.4.0 (la base importe désormais la valeur actuelle de `RESEARCH_OS_VERSION`) ; les anciens ensembles de données figés sont immuables conformément à la loi 15. Les fichiers JSON des ensembles de données affectés contiennent déjà leurs versions actuelles.
- **B-E-004 — la certification de la provenance sur npm est reportée à une version ultérieure.** Le fichier tarball npm de la version 0.12.1 est vérifié uniquement via package-shasum. La migration du flux de publication vers un workflow CI avec Sigstore OIDC entre en conflit avec le principe de traduction avant publication (TranslateGemma 12B s’exécute localement) ; la migration est prévue pour une version ultérieure. Vérifiez les packages npm de la version 0.12.1 via package-shasum et le commit de publication sur GitHub.
- **B-A-003 — la migration du schéma de l’indexeur est documentée, mais pas appliquée.** La version 0.12.1 inclut un entier `SCHEMA_VERSION` côté écriture, mais pas d’outil de migration côté lecture. Lors d’une mise à jour documentée de `SCHEMA_VERSION`, supprimez `.research-os/index.sqlite` et relancez `research-os index build --all`. L’ensemble de données lui-même n’est pas affecté — l’indexeur est une couche d’accélération des preuves + des revendications (loi 8) ; la reconstruction est idempotente.

**Aucun profil d’évaluateur `trusted_baseline` n’est pris en charge dans la version 0.12.1.** Il s’agit d’une posture de confiance intentionnelle, et non d’une lacune : les reçus de calibration du dépôt (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) enregistrent les preuves. La confiance est acquise grâce à des rappels répétés en cas d’échec simulé, et non présumée. Ces reçus précèdent l’architecture MCP de la version 0.8.0 et n’ont pas été réinitialisés dans le cadre de cette architecture.

## Feuille de route vers la version 1.0

La version 1.0 est un état acquis, et non une date de publication. Les six expériences de test internes ont été clôturées (Exp1 à Exp6, du 8 au 11 mai 2026), chacune produisant un ensemble de données de recherche figé admis dans [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). La phase a permis d’obtenir la version 0.2.0 `research-os pack publish` + Pattern 2 (Expérience 2), le drapeau `--detector` de la version 0.3.0 (F-09), les dérogations à l’échelle des sections de la version 0.3.1 (F-10/F-11), la comptabilité normalisée des revendications acceptées de la version 0.3.2 (F-36), la clarté de la sémantique des portes de la version 0.3.3 (F-43/F-41), la discipline de la source de vérité de la version 0.4.0 (F-27/F-47/F-46), la calibration des évaluateurs en tant que contrat de confiance durable de la version 0.5.0 (F-48/F-49/F-50) et la base d’évaluateur déterministe de la version 0.6.0 (F-53/F-54). La préparation de la publication de la version 1.0 est en cours via une série d’étapes de vérification et d’amélioration ; le verrouillage de l’architecture est maintenu tout au long du processus. Le plan complet se trouve dans [`docs/roadmap.md`](docs/roadmap.md).

## Licence

MIT
