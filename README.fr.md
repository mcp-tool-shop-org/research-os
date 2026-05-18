<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` transforme la recherche, à partir d'un document généré, en un ensemble de preuves figées. Il préserve la source originale, sépare les affirmations de la synthèse, impose la conformité grâce à des étapes intermédiaires, enregistre les décisions des examinateurs et les renonciations, et publie un ensemble dont les affirmations peuvent être retracées et vérifiées.

Il ne vous demande pas de faire confiance au modèle. Il vous fournit les outils pour décider si le modèle, les sources et la synthèse sont dignes de confiance.

## Qu'est-ce que c'est

`research-os` est la couche de contrôle entre "Je veux étudier X" et une base de preuves structurée et vérifiable. Il sépare les pistes de découverte de la collecte de preuves, l'extraction brute des affirmations triées, la détection des contradictions de la résolution des contradictions, et les décisions de révision des dispositions de synthèse. Chaque étape est enregistrée dans un registre en écriture seule ; chaque verdict de validation est calculé à partir de ces registres, et non affirmé.

Ce n'est pas un générateur de rapports. Ce n'est pas un framework d'orchestration de modèles de langage (LLM). Il ne rédige pas la synthèse pour vous. Il impose les conditions dans lesquelles la synthèse peut commencer.

Les ensembles de données figés sont archivés dans le dépôt [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — ils sont mis à jour en continu et comprennent quatre ensembles couvrant les six expériences internes terminées. Consultez [`docs/roadmap.md`](docs/roadmap.md) pour connaître la feuille de route de la version 1.0.

La version 0.1 a été testée en profondeur lors de deux phases de test utilisateur. La première — où "research-os" étudie sa propre spécification — a révélé sept erreurs avant la version 0.1.0, chacune nécessitant une correction de code et donnant lieu à une règle ou un modèle d'intégration. La deuxième (Expérience 1 : durabilité du flux de travail ComfyUI, 11 sessions, un domaine sans chevauchement de vocabulaire avec "research-os") a été finalisée le 2026-05-09 : l'ensemble de données figé est accessible en direct, l'application de la règle 2 est terminée via le commit `22b5dba`. La documentation de la version 0.1 est disponible dans [`docs/dogfood-proof.md`](docs/dogfood-proof.md) ; la documentation de l'Expérience 1 est disponible dans [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Le manuel est disponible à l'adresse suivante : <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Installation

**Prérequis :** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Pour les contributeurs qui construisent à partir du code source :

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

> **Note concernant la sortie de `freeze`.** La commande `research-os freeze` s'exécute silencieusement, en parcourant tous les artefacts et en calculant les hachages de contenu. Il n'y a donc pas d'indication de progression pour cette commande. Sur les ensembles de données volumineux, elle peut s'exécuter pendant plusieurs secondes avant d'afficher quoi que ce soit. Une fois terminée, elle affiche un seul bloc de verdict (`PASS` / `REFUSED`) ainsi que le chemin d'accès au fichier de réception. Ne considérez pas ce délai comme un blocage.

> **Avertissement concernant `--force`.** L'option `--force` efface et remplace le répertoire de l'ensemble de données cible. Ne conservez pas de fichiers créés manuellement dans le répertoire de sortie de l'ensemble de données généré. Modifiez plutôt les artefacts sources (revendications, sources, synthèse) ou les fichiers associés. Contrats d'admission complets et cas de refus : [`docs/pack-publish.md`](docs/pack-publish.md).

**Pour un exemple concret**, consultez l'ensemble de données "dogfood" situé dans `research-os-packs/research-os-spec/` : chaque fichier, chaque enregistrement, chaque disposition, chaque empreinte de "gel", le tout est stocké sur disque dans des fichiers qui ne peuvent être modifiés qu'en ajoutant des informations. Cet ensemble de données a généré le fichier `docs/dogfood-proof.md`.

**Nécessite [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) en cours d'exécution localement** pour l'extraction, le tri, l'examen et la découverte des LLM. Le serveur MCP est découvert via la variable d'environnement `OLLAMA_INTERN_MCP_BIN` ou via le PATH. Le modèle par défaut est `hermes3:8b`; vous pouvez le modifier avec `OLLAMA_INTERN_MODEL=<model>` (ou via l'option `--model <name>` pour chaque appel). Définissez `OLLAMA_HOST` si Ollama n'est pas sur l'adresse par défaut `localhost:11434`.

## Les 16 lois fondamentales

| # | Loi |
|---|-----|
| 1 | Pas de synthèse avant la vérification des sources. |
| 2 | La collecte est une preuve ; l'extraction est une interprétation. |
| 3 | Les modèles peuvent interpréter des extraits de sources ; ils ne peuvent pas créer de preuves. |
| 4 | L'extraction peut produire trop d'informations ; la synthèse ne peut pas en hériter. |
| 5 | La cartographie des contradictions révèle les tensions ; elle ne résout pas, ne synthétise pas et ne décide pas quelle affirmation est correcte. |
| 6 | Les mécanismes de contrôle déterminent si une section est éligible à la synthèse. Ils ne synthétisent pas et ne masquent pas les échecs. |
| 7 | L'examen par les pairs évalue l'intégrité de la recherche. Il ne synthétise pas et ne réécrit pas les sources vérifiées. |
| 8 | L'indexation rend la recherche vérifiable. Elle ne crée pas de nouvelles informations et ne devient pas la source de référence. |
| 9 | La transmission à Cowork transforme les instructions opérationnelles à partir des informations de recherche vérifiées. Elle ne crée pas de nouvelles informations et ne contourne pas les mécanismes de contrôle. |
| 10 | L'espace de travail de synthèse organise les informations de recherche vérifiées pour Cowork. Il ne crée pas de synthèse et ne contourne pas le mode de transmission. |
| 11 | L'audit de l'ensemble de ressources agrège les informations de recherche existantes. Il ne crée pas de nouvelles informations et ne masque pas les preuves au niveau des sections. |
| 12 | La découverte propose des pistes ; seule la collecte produit des preuves. |
| 13 | Un examinateur ne peut être considéré comme fiable tant que des échecs simulés n'ont pas prouvé sa capacité de rappel. |
| 14 | L'abondance des affirmations ne garantit pas la qualité de la recherche. Les affirmations doivent être triées avant de pouvoir être prises en compte pour la synthèse. |
| 15 | La "gelée" verrouille les informations de recherche vérifiées. Elle ne complète pas les recherches inachevées et ne convertit pas l'état de réparation en preuves. |
| 16 | Les dérogations assouplissent les contraintes des sources ; elles ne peuvent pas créer de preuves. |

**Loi 3** — le modèle de langage ne crée jamais de texte de preuve. `research-os` crée un registre d'extraits déterministes (identifiants stables comme `ex_<source_id_hex>_001`); le modèle de langage choisit les identifiants des extraits ; `research-os` copie le texte littéral. La classe d'erreur "paraphrase-as-quote" est structurellement impossible.

**Loi 14** — entre l'extraction et l'examen, `research-os claim triage` déduplique, limite la contribution par source et met de côté les candidats à faible valeur ajoutée. Le triage NE modifie PAS `claims.jsonl`; les affirmations mises de côté restent dans le registre canonique.

## La chaîne de flux de travail de la version 0.1

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

Chaque étape est une commande en ligne de commande. Chaque étape écrit des données dans des fichiers qui ne peuvent être modifiés qu'en ajoutant des informations. Aucune étape ne synthétise, ne résout ou ne crée de nouvelles informations vérifiées ; ces invariants sont appliqués, et non simplement considérés comme acquis. L'étape de revue accepte, rejette ou demande une correction des propositions candidates ; l'étape de validation utilise ces décisions pour calculer l'éligibilité à la synthèse ; l'étape de "gel" est le verrouillage final qui empêche de marquer un ensemble comme terminé, sauf si toutes les étapes sont d'accord. Consultez le fichier [docs/dogfood-proof.md](docs/dogfood-proof.md) pour la preuve de la version 0.1 qui démontre que la chaîne fonctionne de bout en bout.

Ceci est une alternative structurée à *recherche → résumé → rapport détaillé*. La chaîne est le produit.

## Vocabulaire

| Terme | Signification |
|------|---------|
| `research-os` | Le plan de contrôle / l'interface en ligne de commande / les étapes de validation / la loi d'orchestration (ce dépôt) |
| `research-pack` | L'artefact de dépôt généré pour un effort de recherche. |
| `research section` | Une unité d'investigation délimitée à l'intérieur d'un ensemble de données. |
| `research receipt` | Preuve qu'une section a passé les vérifications de source/proposition/étape de validation. |

## Sécurité

`research-os` est une interface en ligne de commande qui fonctionne localement. Elle lit et écrit des fichiers dans le répertoire de l'ensemble de données que vous lui spécifiez, et (lorsque vous utilisez la commande `gather`), elle effectue des requêtes HTTP sortantes pour récupérer les URL de sources que vous fournissez. Elle ne : ne fait pas fonctionner de serveur, n'accepte pas de connexions entrantes, ne stocke pas de mots de passe, ni n'envoie de données de télémétrie. Aucun mot de passe n'est écrit dans les fichiers de l'ensemble de données. Consultez le fichier [SECURITY.md](SECURITY.md) pour connaître la politique de signalement des vulnérabilités.

## Calibrage des évaluateurs

La version 0.5.0 rend le calibrage des évaluateurs plus fiable. Un profil d'évaluateur n'est pas considéré comme fiable simplement parce qu'il a été exécuté une fois ; il acquiert un statut grâce à des rapports structurés de défaillances simulées et à une agrégation sur plusieurs exécutions. La version 0.6.0 ajoute des options d'évaluateurs déterministes au processus de révision en production et à l'outil de calibrage.

**Aucun profil n'est actuellement accepté comme étant une "baseline de confiance".** Les rapports canoniques dans le dépôt indiquent `hermes-two-pass=échec`, `mistral-nemo-two-pass=succès conditionnel`, `hermes-single-pass=comparaison uniquement`, `hermes-two-pass-deterministic=échec`. Ceci est intentionnel : la confiance est acquise grâce à des preuves répétées de défaillances simulées, et non supposée. Le rapport `hermes-two-pass-deterministic` présente un écart de capacité du modèle (2 types de décision produits sur 6 requis ; il en faut 3 sur 6) qui n'est pas un problème de variance.

Les rapports de calibrage se trouvent dans le répertoire `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`. Chaque rapport enregistre les résultats PASS/FAIL pour sept critères, quatre étiquettes de statut (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`), et indique honnêtement ce que l'outil de test ne peut pas vérifier (`needs_contradiction_mapping` est inaccessible depuis `seeded-v1`). Consultez [CHANGELOG.md](CHANGELOG.md).

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

Lorsque l'option `--runs <n>` est utilisée, les rapports pour chaque exécution sont écrits dans `<profile>/runs/run-NNN.json`, et un rapport agrégé (avec des critères basés sur la médiane et la détection des défaillances récurrentes) est écrit dans `<profile>/seeded-v1.{json,md}`. Le rapport agrégé contient `receipt_kind: 'aggregate'` pour le distinguer des rapports d'une seule exécution. Le mode d'une seule exécution (`--runs 1` ou omis) conserve le comportement d'écriture directe existant.

**Profils d'évaluateurs déterministes** — utilisez `review_profiles.<name>.reviewer_options` dans `research.yaml` pour intégrer les paramètres d'échantillonnage d'Ollama tels que `temperature`, `seed`, et d'autres, dans chaque instance de `OllamaInternReviewer` dans le processus de révision en production. Le profil `hermes-two-pass-deterministic` est fourni comme exemple. Consultez [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) et la [page du manuel de calibrage des évaluateurs](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Nouvelle version v0.13.0 — Finalisation : Tri par arc bloquant (R-019 + R-020 uniquement pour le chemin D + R-021)

La version v0.13.0 clôt l'arc de tri bloquant de finalisation v0.13, ouvert après le second test de la version v0.4 contre `@mcptoolshop/research-os@0.12.1`, qui a retourné **PASS_WITH_CONDITIONS, et non un niveau d'autorisation**, via le chemin D (arc de tri multi-bloquant, distinct du chemin C avec correctifs nommés). Trois bloqueurs de finalisation indépendants, situés à trois niveaux différents du pipeline ; trois paramètres nommés indépendants qui, ensemble, débloquent la finalisation de la prose, la récupération des clusters sans réponse et le mode automatique de la carte de contradiction. Les mécanismes de défense et de récupération de couverture des versions v0.10, v0.11, v0.12 et v0.12.1 restent inchangés ; aucune modification des énumérations fermées ; aucune modification des surfaces d'interface.

> **Le second test de la version v0.4 prouve que l'acceptation synthétique peut valider le fonctionnement interne, tandis que la relecture en direct invalide le mécanisme cible.**
> **La version v0.13 améliore le contrôle de l'exécution de la finalisation : R-019 débloque la couche de budget interne du niveau MCP ; R-020 expose le refus honnête des clusters sans réponse avec des actions de récupération ; R-021 débloque la couche RPC du mode automatique de la carte de contradiction.**

La fonctionnalité "opérateur-aloneness" (fonctionnement autonome de l'opérateur) est activée dans une session distincte avec la version v0.13.0 publiée. La tranche d'admissibilité 1 reste **non autorisée** jusqu'à ce que la version v0.5 soit validée.

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

**R-019 — Connexion interne du client de budget de niveau MCP.** L'indicateur `--planner-timeout-ms <N>` (et la variable d'environnement `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`) est maintenant transmis au planificateur/au rédacteur/au vérificateur, et se retrouve dans `ollama_extract.tier_budget_ms_override`, atteignant `runWithTimeoutAndFallback` à `ollama-intern-mcp/src/guardrails/timeouts.ts:61`. Le mécanisme interne de délai par niveau, qui a provoqué l'échec `elapsed=15018ms budget=15000ms` lors du second test de la version v0.4, respecte désormais directement le budget défini par l'opérateur. L'enveloppe R-018 est conservée comme mécanisme de sécurité externe pour éviter les blocages liés aux promesses non résolues (les enveloppes pour les modes de défaillance orthogonaux peuvent réellement les détecter). Nécessite `ollama-intern-mcp@>=2.6.0`; les versions antérieures ignorent silencieusement le nouveau champ de schéma (l'enveloppe R-018 fonctionne toujours à son niveau d'origine, avec une dégradation contrôlée).

**R-020 (uniquement pour le chemin D) — Surface de récupération des clusters sans réponse.** Lorsque le planificateur refuse d'attribuer le rôle "réponse" à une affirmation acceptée, l'échec affiche maintenant en ligne les `recovery_actions[]` (`narrow_section_purpose` + `add_on_topic_sources`) dans `section-synthesis.json`, un bloc Markdown `## Recovery actions` rendu dans `section-synthesis.md` (avec l'en-tête `action_id` + le texte explicatif + le bloc de code `command_hint` délimité), et une indication en ligne dans la sortie d'erreur standard (`[synth] no_answer_cluster — voir le bloc "Recovery actions" dans section-synthesis.md pour les étapes à suivre`). La liste des actions est une source unique de vérité, partagée avec le chemin de récupération du graphe d'actions ; il n'y a pas de divergence entre les chemins de commande autonome et de défaillance intégrée. **L'ajustement de l'invite du planificateur (A-half) de R-020 a été tenté et annulé** — l'itération 1 a produit une synthèse incorrecte et silencieuse (le LLM a fabriqué des réponses de "null-effect" à partir d'affirmations à "positive-effect" sur des exemples adverses ; le vérificateur a validé la négation inversée comme "fidèle") ; le mécanisme de sécurité (HARD GUARDRAIL) de l'itération 2 n'a pas annulé cette hallucination. Conformément à la règle d'une seule itération de l'opérateur, l'invite et les 3 fichiers de test "v3-pinned" ont été annulés ; `PROSE_PROMPT_VERSION` reste à `section-prose-v3`. La doctrine acquise est la suivante : une relecture en direct structurée peut réussir alors que le contenu synthétisé est incorrect et silencieux ; une inspection manuelle de la prose sur des exemples adverses est nécessaire pour détecter les inversions de négation/de portée/de prédicat.

R-021 — Mode automatique de la carte de contradictions : délai d'attente, heuristique de repli, progression visible. Nouvelle option `--auto-mode-pair-timeout-ms <N>` (par défaut : 90000 ; réduite par rapport aux 120 secondes codées en dur dans les versions antérieures à R-021, après une mesure de performance sur hermes3:8b dans l'environnement v0.4 : minimum 6,2 secondes, médiane 8,4 secondes, maximum 8,8 secondes → le paramètre par défaut de 90 secondes offre une marge de sécurité d'au moins 81 secondes). Nouvelle option `--auto-mode-fall-through-after-n-timeouts <N>` (par défaut : 5 ; seuil de tentatives échouées consécutives pour le repli heuristique ; les classifications réussies de type `type:none` réinitialisent le compteur). Variables d'environnement correspondantes. Nouvelle ligne de début de la sortie standard (`auto-mode activé : N paires candidates ; délai par paire = X ms ; repli après Y`), affichée à chaque exécution, toujours visible et fonctionnant même en dehors des environnements TTY. L'émission forcée d'un événement de déclenchement du repli dans la sortie d'erreur contourne le contrôle TTY / l'option `--progress` car l'opérateur doit voir le changement de mode. Nouveau bloc Markdown `## Repli du mode automatique` dans `contradictions.md` lorsque le seuil est atteint. Les heuristiques sont réexécutées uniquement sur les paires non traitées (pas de reclassement en double des paires pour lesquelles le modèle de langage a déjà terminé son traitement).

### Note architecturale

R-019 franchit la frontière entre research-os et ollama-intern-mcp. Research-os transmet `tier_budget_ms_override` dans le schéma `ollama_extract` ; ollama-intern-mcp v2.6.0 le prend en compte au niveau de la protection interne. L'infrastructure nécessaire existait déjà ; v2.6.0 a fourni le point d'entrée côté client ; v0.13.0 fournit la configuration côté client pour research-os. La fonction `Promise.race` de R-018 est conservée car elle protège contre un mode de défaillance orthogonal (blocages liés aux promesses non résolues ; les wrappers peuvent détecter ces blocages ; les charges utiles structurées `isError:true` à un niveau de budget interne que le wrapper ne peut pas atteindre relèvent du domaine de R-019).

R-021 est réservé à research-os. Le mode automatique de la carte de contradictions NE passe PAS par ollama-intern-mcp ; il appelle directement l'API HTTP `/api/chat` d'Ollama. Pas de transport MCP dans la chaîne ; pas de configuration `tier_budget_ms_override` ; pas de wrapper de R-018. Le protocole de démarrage des quatre lois fondamentales a détecté une erreur de format dans le démarrage de R-021 avant même que tout code de correctif ne soit écrit : le démarrage indiquait "couche RPC MCP" ; la phase de lecture de la phase A a contredit cela.

### Niveau de sécurité maintenu

R-019 + R-020 (uniquement D) + R-021 sont des ajouts de paramètres pour l'opérateur, et non des modifications architecturales. Les versions de R-002 à R-018 sont inchangées. Les valeurs `accepted_claim_floor` restent immuables. Les énumérations inchangées (`FailureShape` à 9 ; `RECOVERY_ACTIONS` à 8 ; `REGENERATION_REASONS` à 3 ; `PLANNER_TIMEOUT_SOURCES` à 3 ; `POLICY_KEYWORDS` à 8 ; `POLICY_RELEVANT_SOURCE_TYPES` à 1). Le modèle de requête de l'assistant de récupération de l'IA est inchangé. L'architecture MCP est étendue de manière additive. La forme d'expression régulière de `fallback-cause` de R-010 est conservée.

La régression des paquets figés est identique en octets aux versions de base v0.3.3 pour les quatre paquets figés — **dix-huitième version consécutive** où cela est vrai. 1542 → 1630 tests vitest réussis (+88 sur les trois ensembles de tests ; 4 tests ignorés - les tests de relecture en direct sont conditionnés par les variables d'environnement de l'environnement de test).

### Ce que v0.13.0 NE prétend PAS

- Être prêt pour la version 1.
- Obtenir le verdict de "seul l'opérateur" pour la version 0.5. La version 0.5 est testée contre `@mcptoolshop/research-os@0.13.0` dans une session distincte ; la version 0.13.0 est une prérequis pour la finalisation, et non une preuve.
- Être admissible à la tranche 1. Conditionné par le passage de la version 0.5.
- Les candidats v0.13.x différés (F-2 divergence de l'audit et de l'extraction ; F-3 obsolescence de la transmission de la collaboration ; F-4 étroitesse de `POLICY_KEYWORDS` de R-017 ; A-1 + A-2 résultats côté architecte intégrés dans la préparation du cadre de validation de la version 0.5).

Consultez [CHANGELOG.md](CHANGELOG.md) pour l'intégralité de l'annonce de la version.

## Nouvelle fonctionnalité dans la version 0.12.1 : Dépassement de délai du planificateur (correctif du chemin C)

La version 0.12.1 est un correctif unique, basé sur la version 0.12.0. Elle inclut uniquement la correction R-018 : un wrapper côté système de recherche qui impose un délai maximal aux appels de la fonction `callTool` du module MCP de génération de texte, et qui est contrôlé par un indicateur CLI visible par l'opérateur (`--planner-timeout-ms <N>` pour les commandes `synth section` et `synth workspace`) et par une variable d'environnement correspondante (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`). La priorité est la suivante : indicateur CLI > variable d'environnement > valeur par défaut (15000 ms). Le comportement par défaut est conservé, identique à celui de la version 0.12.0.

Cette version a été publiée car le test de "seul l'opérateur" de la version 0.4, appliqué à `@mcptoolshop/research-os@0.12.0`, a renvoyé **PASS_WITH_CONDITIONS, et non une autorisation complète** (`operator_aloneness_dst_v0.4`). Le niveau de sécurité de la version 0.11 a été maintenu sous charge réelle ; les six surfaces de couverture et de récupération de la version 0.12 ont fonctionné correctement et ont permis à l'opérateur de continuer. La couverture des enveloppes a atteint les seuils requis (4/5 éléments obligatoires pris en charge + 1 élément partiel ; 2/3 éléments de modération pris en charge + 1 élément partiel ; 0/3 pièges ; 0/5 échecs matériels déclenchés) ; les indicateurs de contamination étaient tous inoffensifs. Le seul mode de défaillance était la finalisation : la génération de texte a rencontré un `TIER_TIMEOUT` de manière reproductible, environ 15010 ms, alors que le budget "Instant-tier" était de 15 secondes, sans qu'aucun opérateur n'ait pu contourner ce délai. Les briefs de section étaient conformes aux exigences de l'enveloppe ; le processus n'a tout simplement pas pu atteindre l'état de finalisation.

**Procédure du chemin C** (nouvelle approche adoptée dans la version 0.4) : lorsque la session B identifie un seul mécanisme de défaillance spécifique avec un chemin de correctif explicite, ET que la couverture de l'enveloppe atteint les seuils requis, ET que le niveau de sécurité est maintenu, ET que la contamination est inoffensive, la procédure est la suivante : appliquer le correctif, relancer le même chemin pour l'opérateur sur la version corrigée, et réévaluer. Aucune réécriture de l'enveloppe. Aucun évaluateur humain. Aucune évolution architecturale vers la version 0.13.

> **La version 0.4 valide la qualité de la couverture du système de recherche au niveau des briefs de section.**
> **La version 0.12.1 doit valider la qualité de la finalisation en supprimant le goulot d'étranglement du délai du planificateur, sans affaiblir le niveau de sécurité.**

### Ce que vous pouvez exécuter

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

Les paramètres actifs sont disponibles dans `section-synthesis.json` (`planner_timeout_ms` est toujours renseigné + `planner_timeout_overridden_by` est présent uniquement en cas de dépassement), dans les métadonnées du bloc de texte, et dans la sortie d'erreur standard (`stderr`) (`[synth] planner_timeout_ms=N source=… section=<id>` affiché avant la génération du texte). La commande `synth section --help` documente l'indicateur, la valeur par défaut, la limite supérieure (600000 ms, valeur de sécurité) et l'alternative de la variable d'environnement. Les valeurs non valides (négatives, nulles, non numériques, chaînes de caractères avec des unités, > 600000) génèrent une erreur claire avec un code de sortie non nul, indiquant le paramètre concerné et la valeur incorrecte. Il n'y a pas de solution de repli silencieuse.

### Note architecturale

Le budget de 15000 ms auquel le test de la version 0.4 a abouti se trouve dans `ollama-intern-mcp` (`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`), et non dans le système de recherche. Avant la correction R-018, le système de recherche n'imposait aucun délai pour le planificateur ; le délai était appliqué côté serveur par la politique de niveau dans `ollama-intern-mcp`. La correction R-018 introduit une autorité propre du système de recherche sur ce budget, via un wrapper `Promise.race` autour de l'appel `callTool` du module MCP, avec une valeur par défaut correspondant au nombre "Instant-tier" observé (15000 ms), afin de conserver le comportement par défaut. Le wrapper de R-018 génère des erreurs de type `TIER_TIMEOUT` qui correspondent à l'expression régulière `classifyFallbackCause` de la version R-010 (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`), ce qui permet à l'outil de conseil de l'IA de continuer à afficher les informations sur les exécutions par défaut.

### Niveau de sécurité maintenu

R-018 est une modification mineure, une simple adaptation de l'interface utilisateur, et non une modification architecturale. Les éléments R-002, R-003, R-005, R-007, R-008, R-009, R-010, R-011, R-012, R-013, R-014, R-015, R-016 et R-017 n'ont pas été modifiés. La valeur `accepted_claim_floor` reste inchangée. Les énumérations fermées n'ont pas été modifiées (`FailureShape` à 9 ; `RECOVERY_ACTIONS` à 8 ; `REGENERATION_REASONS` à 3 ; `POLICY_KEYWORDS` à 8 ; `POLICY_RELEVANT_SOURCE_TYPES` à 1). Le modèle de requête pour le conseiller de récupération basé sur l'IA n'a pas été modifié. L'architecture MCP n'a pas été modifiée — la version `ollama-intern-mcp@^2.4.0` est toujours utilisée. R-018 ajoute `PLANNER_TIMEOUT_SOURCES` (3) comme nouveau vocabulaire spécifique aux opérations, distinct de toute énumération de routage.

Les tests de régression des paquets figés sont identiques à la version v0.3.3 pour les quatre paquets figés — **c'est la seizième version consécutive** où cela est vrai. 1542 → 1586 tests vitest réussis (+44 tests d'acceptation R-018).

### Ce que la version v0.12.1 NE prétend PAS être :

- Prête pour la version 1.
- Verdict de nouvelle exécution de la porte "operator-aloneness" pour la version 0.4. Les nouvelles exécutions de la version 0.4 sont effectuées avec `@mcptoolshop/research-os@0.12.1` dans une session distincte ; la version 0.12.1 est une condition préalable pour la finalisation, et non une preuve.
- Admissibilité, tranche 1. Validée par le résultat POSITIF de la nouvelle exécution de la version 0.4. Le processus de validation de la version 0.4 (l'isolement de niveau défense est PROUVÉ ; l'isolement de niveau couverture est SUBSTANTIELLEMENT PROUVÉ au niveau des résumés de section ; la finalisation est en attente de la version 0.12.1) reste le test verrouillé.
- Candidats pour la version 0.13 (F-2 : divergence entre l'audit et l'extraction R-009 ; F-3 : obsolescence de la transmission collaborative ; F-4 : limitation des mots-clés de la politique R-017). Indépendant de la finalisation.

Consultez [CHANGELOG.md](CHANGELOG.md) pour l'intégralité de l'annonce de la version.

## Version précédente : v0.12.0 — Version axée sur la récupération de la couverture

La version v0.12.0 corrige les problèmes liés à l'isolement des opérateurs identifiés dans la version v0.3 (problème `operator_aloneness_dst_v0.3`). Ces problèmes, qui n'étaient pas considérés comme critiques (statut `PASS_WITH_CONDITIONS` mais pas de niveau d'autorisation), ont été résolus. Cette version comprend six corrections classées selon quatre catégories : trois corrections architecturales qui comblent les lacunes de couverture bloquant la version v0.4 (R-012, R-013, R-014), et trois améliorations ergonomiques qui optimisent l'interface utilisateur pour les tests de la version v0.4 (R-015, R-016, R-017). La version v0.3 n'a pas échoué en raison d'une régression des mécanismes de défense ; les cinq mécanismes de défense de la version v0.11 ont fonctionné comme prévu, produisant une synthèse propre et fiable sans contenu erroné, et le système a détecté des preuves réelles, bien que limitées. L'échec est dû au fait que ces mêmes mécanismes de défense, fonctionnant correctement, ont supprimé une partie de la couverture essentielle provenant de sources fiables, ce qui a affecté la validité des résultats. La règle fondamentale établie dans la version v0.3 :

> **La version v0.11 a rendu le système suffisamment sûr pour éviter la production de résultats erronés.**
> **La version v0.12 améliore la capacité de récupération de la couverture sans affaiblir ces mécanismes de défense.**

La thèse : **les mécanismes de défense conservateurs peuvent empêcher la production de résultats erronés, mais ils peuvent également priver le système de la couverture nécessaire.** La version v0.12 est la solution pour améliorer la couverture. Le niveau de défense de la version v0.11 reste inchangé ; les mécanismes R-007 à R-011 sont toujours actifs. La version v0.12 ajoute des chemins de récupération légaux et vérifiables.

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

### Les trois corrections architecturales (qui bloquaient la version v0.4)

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

### Les trois améliorations ergonomiques (améliorations de l'expérience utilisateur pour les tests de la version v0.4)

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

### Limites des règles

Les règles fondamentales du système sont maintenues. La valeur minimale acceptable (`accepted_claim_floor`) reste immuable. L'énumération `FailureShape`, qui définit les types d'erreurs, reste inchangée (neuf valeurs). L'énumération `RECOVERY_ACTIONS`, qui définit les actions de récupération, reste inchangée (8 valeurs) ; aucune nouvelle action de conseil n'a été ajoutée ; l'heuristique `distinct-shape` de R-014 élargit le champ d'application des actions existantes. Le modèle de requête pour le conseiller de récupération est inchangé (les nouveaux champs `EvidenceState` sont visibles dans les fichiers JSON persistants, mais ne sont PAS affichés dans la requête). Les règles de vérification de la récupération sont inchangées. L'architecture MCP est inchangée ; `ollama-intern-mcp@^2.4.0` est toujours utilisé ; la forme des appels MCP n'a pas changé lors de l'extraction. L'avertissement de R-017 est informatif et N'AFFECTE PAS le résultat du test, la réception des données de suspension ou la publication du système. Tous les mécanismes de défense des versions v0.10 et v0.11 sont conservés ; le niveau de défense de la version v0.11 est la base, et la version v0.12 s'y appuie.

La version empaquetée est identique à la version de référence v0.3.3 pour les quatre versions empaquetées. Il s'agit de la **quinzième version consécutive** où cela est vrai (v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12).

### Ce que la version v0.12.0 NE prétend PAS

- Être une version finale (v1).
- Valider le test d'isolement des opérateurs de la version v0.4. La version v0.4 est testée séparément avec npm `@mcptoolshop/research-os@0.12.0`.
- Être conforme à la section 1 des critères d'admissibilité. Ce test est bloqué en attente du résultat du test de la version v0.4 (la règle fondamentale de la version v0.3, qui prouve l'isolement des opérateurs au niveau de la défense, mais pas encore au niveau de la couverture), reste en vigueur.
- Être supérieure aux outils de recherche basés sur le cloud.
- Constituer un modèle complet de calibrage des examinateurs.

La version v0.12.0 est une condition préalable à la version v0.4 du test d'isolement des opérateurs, et non une preuve de sa conformité.

Consultez le fichier [CHANGELOG.md](CHANGELOG.md) et l'exemple de remplacement de l'interface utilisateur à l'adresse [`examples/source-card-override.example.json`](examples/source-card-override.example.json).

## Version précédente : v0.11.0 — Deuxième version axée sur la correction de l'isolement des opérateurs

La version v0.11.0 a corrigé les conditions d'échec du test d'isolement des opérateurs de la version v0.2 : alignement de la portée et des limites (R-007), vérification de la pertinence de l'URL au moment de la découverte (R-008), défense contre la contamination du contenu source en double lors de l'extraction et de l'analyse (R-009 + R-011), et amélioration de la visibilité des causes de repli du conseiller de récupération (R-010). Le système de protection du contenu source en trois niveaux (R-008 à l'admission + R-009 à l'extraction + R-011 à l'analyse) est mis en place ici. Consultez le fichier [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md).

## Version précédente : v0.10.0 — Version de correction de l'isolement des opérateurs

La version v0.10.0 a corrigé les conditions d'échec de la fonctionnalité "isolement des opérateurs" de la version v0.1, détectées le 15 mai 2026 (`operator_aloneness_dst_v0.1`, FAIL) : alignement du routage de la récupération (R-002), interface en ligne de commande pour la réparation de la portée (R-001), renforcement de l'audit des cartes sources associées (R-003 + R-005), et état de collecte honnête (R-004). Consultez le document [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

## Version précédente : v0.9.0 — Arc des artefacts du produit

La version v0.9.0 a transformé la colonne de preuves de la version v0.8 en artefacts utiles pour les opérateurs : synthèse de texte au niveau des sections (`synth section`), synthèse partielle du paquet (`synth pack --partial`) et conseiller de récupération fiable (`recover pack`). Consultez le document [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## Version précédente : v0.8.0 — Restauration de l'architecture

La version v0.8.0 a reconnecté research-os à son substrat LLM local déclaré (`ollama-intern-mcp@^2.4.0`) pour l'extraction des affirmations, a ajouté l'application de règles de pertinence des sections, et a ajouté la synthèse de citations de preuves spécifiques aux sections pour les sections éligibles pour la réparation dans les paquets nécessitant une réparation. Voir [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Statut

**v0.11.0 — Deuxième version de correction des problèmes liés à l'isolement des opérateurs** — publiée sur npm sous le nom `@mcptoolshop/research-os@0.11.0`, le 15 mai 2026. La version v0.11.0 corrige les conditions d'échec du mécanisme de contrôle de l'isolement des opérateurs (v0.2) (`operator_aloneness_dst_v0.2`), qui n'autorisait pas certaines opérations le 15 mai 2026. Cette correction est apportée grâce à une modification qui couvre 5 éléments identifiés et qui s'étend sur 4 sections. **R-007** (alignement de la portée/des limites de correction) : la commande `claim repair-scope --auto` remplit désormais les champs `scope` ET `not` lorsque les deux sont vides lors de la correction d'une demande — corrige le problème de boucle infinie de la version v0.10 où la commande R-001 ne remplissait que le champ `scope` et où le triage des demandes corrigées les classait comme nécessitant une correction de la portée (`needs_scope_repair`). La limite de la zone de correction est maintenant conforme à la forme de dégradation du modèle de zone de correction. Le registre, qui ne permet que l'ajout de données, enregistre désormais `applied_not` en plus de `applied_scope`. **R-008** (protection contre les URL générées de manière erronée) : la commande `discover run` récupère désormais le `<title>` de chaque URL candidate (limité à 64 Ko de contenu, délai de 5 secondes, concurrence de 4 threads) et calcule un chevauchement de mots-clés déterministe par rapport à la requête de découverte. Chaque candidate reçoit un bloc `relevance` (`vérifié | non vérifié | incompatibilité de sujet`); la commande `approve --top N` met en quarantaine les éléments avec `topic_mismatch`; un opérateur peut outrepasser cette décision via `approve --candidate <id>`. Corrige le cas de la version v0.2 où l'heuristique `llm-heuristic` a renvoyé 3 URL PMC réelles pointant vers des articles de recherche sur le cancer, la biochimie ou le lymphome/VIH qui n'étaient pas liés. **R-009** (protection de l'identité de l'extracteur) : nouvelle sévérité pour les cartes de source `source_identity_mismatch` (ERREUR GRAVE) lorsque le `card.title` généré par l'extracteur ne correspond pas au `<title>` récupéré dans le code HTML. Corrige le cas de la version v0.2 concernant les "rats et la clonidine". Réutilise l'outil de chevauchement de la version R-008 ; peut être outrepassé via `clear_severities[]`. **R-011** (pré-vérification du contenu de la source par le critique du cadre) : nouvelle raison d'exclusion du cadre `source_content_mismatch`. Le critique du cadre calcule désormais une signature du contenu de la source une seule fois par source et effectue une pré-vérification déterministe avant l'appel au critique LLM ; si la valeur est inférieure à un seuil, l'appel au LLM est interrompu et `frame_excluded` est défini sur `true`. Corrige le cas de la version v0.2 où 11 demandes dérivées d'articles sur le cancer, avec un texte structuré (DST-framed), ont été acceptées par le critique LLM. **R-010** (récupération de la visibilité de la solution de repli MD) : nouvelle énumération `FALLBACK_CAUSES` ( `tier_timeout | mcp_error | retry_exhausted`) + optionnel `FallbackTiming { elapsed_ms, budget_ms }` dans les métadonnées `prose_error` ; la récupération MD affiche désormais une section "Pourquoi le conseiller IA a-t-il utilisé une solution de repli" ainsi qu'un résumé de la cause principale ; corrige le problème de la version v0.2 où le message TIER_TIMEOUT était invisible dans le JSON. **La protection complète en trois couches contre la contamination du contenu de la source est maintenant terminée** (R-008 : admission, R-009 : extraction, R-011 : critique) avec une indépendance vérifiée des couches de protection. **Nécessite `ollama-intern-mcp@^2.4.0`** (inchangé depuis la version v0.8.0). 1448/1448 tests vitest réussis (1344 → 1448, +104 tests au total). **Les quatre ensembles de données figés sont identiques à la version v0.3.3** (onzième version consécutive). **Ce n'est pas une version v1. Ce n'est pas un verdict sur l'isolement des opérateurs pour la version v0.3** — la version v0.3 est testée par rapport à cette version npm dans une session distincte. Le travail sur la doctrine d'admissibilité est conditionné par la réussite de la version v0.3. Consultez les documents [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.10.0 — Version corrigeant les problèmes d'isolement des opérateurs** — publiée sur npm sous le nom `@mcptoolshop/research-os@0.10.0`, le 15 mai 2026. La version v0.10.0 corrige les conditions d'échec de la fonctionnalité "operator-aloneness" de la version v0.1 (`operator_aloneness_dst_v0.1`, ÉCHEC le 15 mai 2026) grâce à une correction en 4 étapes. **R-001** (`research-os claim repair-scope <section> [--auto | --interactive]`): Nouvelle interface en ligne de commande pour corriger les demandes dont le champ `scope` est arrivé avec la valeur `null` après l'extraction ; registre en écriture seule `evidence/claim-scope-repairs.jsonl`; nouvelle action `repair_claim_scope` dans `RECOVERY_ACTIONS` (l'énumération s'agrandit de 7 à 8 éléments). Le système signale cette action comme étant de priorité 1 dans `accepted_claim_floor` lorsqu'il y a ≥3 demandes nécessitant une correction. **R-002** (routage de la récupération) : la couche de diagnostic lit désormais `gate.json:blocking_reasons[]` comme source d'information principale pour le routage, avant de revenir à la méthode traditionnelle `failures[].check` — les signaux bloquants ont priorité sur les signaux en aval, tels que `source_card_classification_gap`. **R-003 + R-005** (renforcement de l'audit des sources, en paire) : nouvelles sévérités `bot_check_or_captcha_detected` (ÉCHEC GRAVE — signal combiné : marqueurs + forme du contenu) et `extraction_suspect_word_count_mismatch` (AVERTISSEMENT ET MISE EN QUARANTINE — contenu ≤200 mots ET nombre de mots extraits ≥800 mots ET ratio ≥4). Possibilité de contourner ces sévérités grâce au nouveau champ `clear_severities[]` dans le schéma du registre de remplacement de la version v0.4. Bloc `audit.severity_thresholds` optionnel dans `research.yaml` pour un réglage spécifique à chaque paquet. **R-004** (`gather_outcome` fiable) : énumération à 5 valeurs pour `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`); la phrase trompeuse de la version v0.1 `"Failed (ok HTTP 200)"` a été supprimée. Consultez les documents [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Arc des artefacts du produit** — publié sur npm sous le nom `@mcptoolshop/research-os@0.9.0`, le 14 mai 2026. La version v0.9.0 transforme la structure de données v0.8 en artefacts utiles pour les opérateurs. La synthèse textuelle au niveau des sections (`research-os synth section <id>`) produit du Markdown lisible, avec des regroupements de paragraphes qui renvoient vers les affirmations acceptées. La synthèse partielle (`research-os synth pack --partial`) utilise le texte des sections (et non les affirmations brutes) et indique les sections exclues avec des raisons structurées ; un planificateur de regroupements déterministe pré-sélectionne les supports transversaux nécessaires lorsque ≥2 sections sont incluses. Le conseiller de récupération (`research-os recover pack`) fournit des instructions aux opérateurs pour les sections bloquées, en utilisant une architecture à quatre niveaux : diagnostic déterministe + graphe d'actions conformes + conseils d'IA + vérificateur, avec trois chemins de conseil (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) et des énumérations fermées pour neuf types de défaillances et sept actions de récupération. Les conseils de récupération sont intégrés dans `partial-pack-synthesis.{md,json}` sous chaque section exclue, via une projection compacte de l'objet de récupération canonique, qui constitue une source unique de vérité entre les interfaces autonomes et intégrées ; un état `recovery_unavailable` expose explicitement les cas de défaillance du moteur (pas de sauts silencieux). La sémantique de gel et de publication reste inchangée : les artefacts partiels lisibles ne rendent pas un regroupement incomplet gelable ou publiable. Le seuil `accepted_claim_floor` reste immuable ; le conseiller de récupération refuse de recommander l'action `apply_waiver` pour les défaillances immuables. **Nécessite `ollama-intern-mcp@^2.4.0`** (inchangé par rapport à la version v0.8.0). 1266/1266 tests vitest réussis (1013 → 1266, +253 tests au total). **Les quatre regroupements gelés sont vérifiés de manière identique en termes de bytes par rapport aux références v0.3.3** (sixième publication consécutive). **Ce n'est pas une version v1.** La version v0.9.0 rend la couche d'artefacts concrète ; la préparation pour la version 1, l'autonomie des opérateurs pour les nouveaux regroupements, un modèle de réviseur de confiance et une affirmation de supériorité par rapport à la référence cloud ne sont pas inclus dans cette version. Consultez [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Refonte de l'architecture + Pertinence contextuelle** — publié sur npm en tant que `@mcptoolshop/research-os@0.8.0`, le 12 mai 2026. La version 0.8.0 est une version de refonte de l'architecture : `research-os` utilise désormais `ollama-intern-mcp@^2.4.0` comme base locale pour le traitement des preuves, ce qui permet l'extraction des affirmations (auparavant, le fichier README déclarait cette dépendance, mais le code contenait des raccourcis internes vers Ollama, contournant cette dépendance depuis la version 0.1 — la version 0.8.0 corrige ce problème). Ajout : Substrat client MCP (`OLLAMA_INTERN_MCP_BIN` variable d'environnement + découverte via le PATH + cycle de vie `StdioClientTransport`); critique des preuves par affirmation via `ollama_extract` avec un schéma à 4 étiquettes (`supports_section` / `off_topic` / `background_only` / `source_chrome`); nouvelle décision d'examen `frame_excluded` (l'examen ignore le LLM pour les affirmations exclues, génère un `ClaimReview` synthétique); le `ClaimSchema` gagne `frame_excluded` + `frame_exclusion_reason` (énumération à 4 valeurs, y compris `critic_unavailable` en cas de problèmes d'état du système) + `frame_exclusion_rationale`; synthèse des preuves spécifiques aux sections via `synth section <id>` pour les sections éligibles dans les ensembles nécessitant des corrections (index de citation des preuves — ID de l'affirmation → assertion → extrait de la preuve → URL de la source — PAS de prose narrative); la fonction de contrôle respecte le registre de remplacement de la carte source via `getEffectivePublisher` / `getEffectiveSourceType` (intégration de l'objectif v0.7.1); `DEFAULT_WINDOW_CHARS` passe de 5000 à 3000 (dimensionné pour `hermes3:8b` avec un contexte de travail de 8 Ko dans le profil `dev-rtx5080`); la politique de "échec progressif" pour l'appel du critique est inversée (en cas de l'un des 5 modes de défaillance — transport / analyse / étiquette invalide / raisonnement vide / délai d'attente — par défaut, `frame_excluded: true` avec la raison `critic_unavailable`, et non l'admission); sémantique de promotion : les affirmations `frame_excluded` n'empêchent pas la promotion de la section; le transfert de travail affiche `frame_excluded` dans un bucket distinct des affirmations acceptées / nécessitant une correction / rejetées. **Nécessite `ollama-intern-mcp@^2.4.0`**. 1013/1013 tests Vitest réussis (901 → 1013, +112 tests). **Tous les quatre ensembles de preuves figées sont vérifiés de manière identique en octets par rapport aux références de la version 0.3.3.** **Ce n'est pas une version 1** — le travail préparatoire pour la version 1 continue ; consultez [`docs/roadmap.md`](docs/roadmap.md). Consultez [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Renforcement de la plateforme interne** — publié sur npm en tant que `@mcptoolshop/research-os@0.7.0`, le 11 mai 2026. Une série de tests internes en quatre étapes (correction de bogues/sécurité, résilience proactive, amélioration de l'expérience utilisateur, perfectionnement de la présentation) a été effectuée sur la version 0.6.0. La version 0.7.0 inclut les améliorations suivantes : collecte de données plus sûre (gestion des erreurs par URL avec conservation des identifiants des sources en cours de traitement en cas d'échec partiel) ; indexeur plus robuste (saut et avertissement par enregistrement, par fichier ou par section en cas de données JSONL mal formées) ; gestion structurée des erreurs (12 sous-classes de `ResearchOSError` avec liens vers la documentation) ; retour d'information sur la progression (`--no-progress` / `--progress` avec détection automatique du terminal) ; corrections pour faciliter l'utilisation par les opérateurs (`pack publish --force` : remplacement destructif standardisé appliqué à 8 éléments avec test de régression ; correction de la faute de frappe dans le texte de la commande `IndexNotBuiltError` et ajout d'un test du registre du texte de la commande ; ajout de liens vers la documentation pour chaque erreur dans les 12 sous-classes de `ResearchOSError`) ; amélioration de la sécurité de la chaîne d'approvisionnement (fixation des hachages des actions CI + `permissions: contents: read` par défaut) ; couverture de l'écosystème Dependabot `/site` et `github-actions`) ; deux nouvelles pages de documentation (`recovery.md`, `known-limitations.md`) ; amélioration de la présentation (tests de régression des phrases standard, réorganisation de la barre latérale, indications `:::caution` pour les actions destructives). 901/901 tests réussis (713 → 901, +188 tests). **Les quatre ensembles de données figés sont vérifiés de manière identique en octets par rapport aux versions de base v0.3.3.** **Ce n'est pas une version 1** — les travaux préparatoires pour la version 1 se poursuivent ; consultez [`docs/roadmap.md`](docs/roadmap.md) et [`docs/swarm-hardening-proof.md`](docs/swarm-hardening-proof.md). Consultez [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) et [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — publiée sur npm en tant que `@mcptoolshop/research-os@0.6.0`, le 10 mai 2026. La version 0.6.0 conclut l'Expérience 6 avec des preuves de confiance des évaluateurs : research-os peut désormais produire une baseline de modèle canonique reproductible et attribuable. Inclut : options d'évaluateurs déterministes dans le processus de révision en production (`review_profiles.<name>.reviewer_options` dans `research.yaml`); compatibilité ascendante du schéma de la passerelle pour les artefacts figés antérieurs à la version 0.3.3 (F-53); la sortie de la révision indique directement les conditions d'échantillonnage dans `review.json` et `review.md` (F-54); rapport agrégé déterministe canonique enregistré (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **Aucune baseline de confiance n'est acceptée.** `hermes-two-pass-deterministic=échec` (écart de capacité du modèle dans le vocabulaire des décisions, et non un problème de variance). **Hermes n'est pas promu au statut de "baseline de confiance".** Le gain est le mécanisme, et non un rapport réussi. Aucune modification des passerelles, des gels ou des lois de synthèse. Les quatre packs figés vérifient l'identité des octets. 713/713 tests vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md) et [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — Publié sur npm sous le nom `@mcptoolshop/research-os@0.5.0`, le 10 mai 2026. La version 0.5.0 rend la calibration des évaluateurs plus fiable. Le profil d'un évaluateur n'est pas considéré comme fiable simplement parce qu'il a été exécuté une seule fois ; il acquiert un statut grâce à des rapports de défaillances simulées structurés et à une agrégation sur plusieurs exécutions. Comprend : un schéma de rapport de calibration structuré (`seeded-v1.{json,md}`, validé par Zod, avec quatre étiquettes de statut) ; un outil d'exécution pour plusieurs exécutions (`--runs <n>`, isolation par exécution, barres PASS/FAIL basées sur la médiane, dégradation en cas de défaillances répétées) ; une barre de vocabulaire de décision tenant compte de l'architecture ; une recherche de rapports relative au paquet dans `review-promote`. **Aucune référence fiable n'est acceptée :** `hermes-two-pass=failed` (agrégé, 3 exécutions), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. research-os peut désormais refuser de faire confiance au profil d'un évaluateur lorsque des défaillances simulées répétées ne justifient pas cette confiance. **Aucun changement concernant les passerelles, les blocages ou les règles de synthèse. Les quatre paquets figés vérifient l'intégrité des octets.** 671/671 tests vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — publié sur npm sous le nom `@mcptoolshop/research-os@0.4.0`, le 10 mai 2026. La version 0.4.0 assure la pérennité de l'identité de la source. Les règles de type de source déterministes gèrent la majorité reproductible, les registres de remplacement préservent les corrections de l'opérateur lors des nouvelles agrégations, et la commande `source-card audit` remplace les vérifications de dérive des scripts temporaires par une interface CLI de première classe. Comprend : un classificateur de type de source centralisé (Composant B — `classifySourceType`, 11 fournisseurs canoniques, `source-type-rules.json`); un registre de remplacement de carte source (Composant A — `source-card-overrides.jsonl`, commandes `validate` et `list`); et une CLI d'audit de carte source (Composant D — `research-os source-card audit --pack <dir>`, 7 types de résultats, artefacts JSON et Markdown, options `--apply --from` pour spécifier le chemin). Correction cosmétique F-46 : les manifestes de pack indiquent désormais la version binaire en cours d'utilisation plutôt que la version figée dans `research.yaml` lors de l'initialisation du pack. **Aucun changement concernant les mécanismes de contrôle, de blocage ou les lois de synthèse. Les quatre packs figés existants sont vérifiés de manière identique au niveau des octets.** 620/620 tests vitest réussis. Consultez le fichier [CHANGELOG.md](CHANGELOG.md) et la page du manuel d'audit de carte source : [https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — publié sur npm sous le nom `@mcptoolshop/research-os@0.3.3`, le 10 mai 2026. Comprend une clarification de la sémantique des contrôles, obtenue grâce au Pack-3 (durabilité de l'exportation/de l'exécution Godot, Expérience 3, pack n° 3 sur 3). La sortie du contrôle indique désormais les nombres de publications et de comptes primaires spécifiques à chaque section, en plus des nombres globaux du pack (F-43) ; le message `no_source_cluster_monopoly` a été modifié de "AVERTISSEMENT" à un diagnostic informatif (F-41). **Le comportement de réussite/échec n'a pas changé ; les packs figés existants sont vérifiés de manière identique au niveau des octets.** 570/570 tests vitest réussis. Consultez le fichier [CHANGELOG.md](CHANGELOG.md) et le fichier [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — publiée sur npm en tant que `@mcptoolshop/research-os@0.3.2`, le 2026-05-09. Inclut une normalisation des demandes d'acceptation, prenant en compte l'admission pour la publication de l'ensemble de données. La vérification stricte d'égalité entre `claim-reviews.jsonl` et `pack-audit.json::accepted_claims` est remplacée par une comparaison d'ensembles — les demandes acceptées sont des `claim_id` uniques dont la décision de révision canonique la plus récente est `accepted_for_synthesis` (la dernière décision fait foi pour chaque `claim_id`). Les ensembles de données figés dont le nombre d'audits hérités diffère de l'ensemble normalisé sont désormais acceptés avec un avertissement plutôt qu'un refus ; le fichier d'audit hérité est conservé tel quel (Règle 15), tandis que le manifeste de l'archive reflète le nombre normalisé. Le refus reste strict pour les `claim_id` fantômes, les décisions dupliquées incompatibles et les conditions qui ne permettent pas la synthèse. Ceci a été obtenu grâce à l'Expérience 3, session K, pour l'ensemble de données XRPL — la publication de l'ensemble de données a été refusée en raison d'un désaccord sur le registre de clôture (la section 07 comportait 24 lignes brutes `accepted_for_synthesis`, mais seulement 19 `claim_id` uniques en raison des fenêtres de révision des examinateurs qui se chevauchent). 558/558 tests vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md) et [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — publiée sur npm en tant que `@mcptoolshop/research-os@0.3.1`, le 2026-05-09. Inclut des clauses de renonciation spécifiques aux sections (`primary_source_waiver.section_waivers[]`) ainsi qu'une confirmation de la part des examinateurs, de sorte qu'une constatation de "monopole de la source" à l'échelle d'une section, qui est renoncée, devient une mise en garde visible plutôt qu'une redirection automatique de toutes les demandes vers `needs_source_repair`. Ceci a été obtenu grâce à l'Expérience 3, session 2, pour l'ensemble de données XRPL — les sections du protocole canonique (chaînes à fondation unique, spécifications d'API en vase clos, documents des organismes de normalisation) ont inversé l'hypothèse selon laquelle la diversité des éditeurs est un indicateur de la qualité de l'information. 540/540 tests vitest réussis à ce moment-là. Consultez [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Clauses de renonciation spécifiques aux sections** — Utilisez-les lorsque la diversité des éditeurs est structurellement incompatible avec la source de vérité de la section, et non lorsque la section n'a simplement pas trouvé suffisamment de sources. La `raison` est appliquée par le schéma, ainsi que la présence de tableaux `compensating_controls[]` non vides. La politique de l'ensemble de données `primary_source_waiver_allowed: false` bloque à la fois les renonciation au niveau de l'ensemble de données et les renonciation spécifiques aux sections. La solution de contournement `min_independent_publishers: 0` au niveau de l'ensemble de données, qui était en vigueur avant la version 0.3.1, est maintenant obsolète ; les ensembles de données figés existants restent valides selon leurs reçus existants. Consultez [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) et le [guide d'utilisation de l'opérateur pour les ensembles de données](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publiée le 2026-05-09. Introduit l'indicateur `--detector <auto|heuristic|ollama-intern>` pour la commande `contradict map` (correction F-09 du blocage de la chaîne provenant de l'Expérience 3, session 1, ensemble de données XRPL). 527/527 tests vitest réussis à ce moment-là. La sélection du détecteur est maintenant un choix explicite de l'opérateur plutôt qu'une danse complexe avec des variables d'environnement dépendantes de l'état ; le mode est annoncé de manière visible à chaque exécution. Consultez [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publié le 2026-05-09. Distribution du paquet `research-os pack publish` (Expérience 2) et correction de la condition de préparation du modèle 2. 515 tests Vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md). Les paquets figés sont exportés vers l'archive canonique `research-packs` avec une seule commande ; le contrat d'adhésion est appliqué par le code, et non par une liste de contrôle. Consultez [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — gelée le 2026-05-08. L'ensemble de données "dogfood" situé dans `research-os-packs/research-os-spec/` (dépôt frère) a atteint l'état de "gel" avec 296 propositions acceptées réparties sur 8 sections, 17 dispositions, 30 propositions corrigées par l'utilisateur, 0 blocage de correction actif, 0 contradiction non résolue, toutes les étapes de validation indiquant `synthesis_eligible=true`. 463/463 tests Vitest réussis. Seize règles fondamentales cumulées. Consultez le fichier [`docs/dogfood-proof.md`](docs/dogfood-proof.md) pour connaître les sept découvertes et les empreintes des enregistrements de "gel".

**Dépôt monorepo `research-packs`** — disponible à [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) et comprenant quatre ensembles : `research-os-self-dogfood` (rétro-portage de la version 0.1 pour les tests internes, 296 revendications acceptées, 8 sections), `comfyui-workflow-durability` (Expérience 1, 302 revendications acceptées, 8 sections), `xrpl-creator-token-durability` (Expérience 3, ensemble n° 2) et `godot-export-runtime-durability` (Expérience 3, ensemble n° 3). Tous les ensembles passent le test `verify-pack.mjs`.

**Expérience 1 (Durabilité du flux de travail ComfyUI) — v1** — TERMINÉE le 2026-05-09. Les 8 sections sont disponibles dans le Terminal A, le paquet est figé, l'archive est en ligne. Consultez [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) et [`docs/roadmap.md`](docs/roadmap.md).

### Ce que research-os n'est pas (et ce que v0.12.1 ne prétend pas être)

- L'absence de fonctionnement autonome n'a pas été prouvée sur les nouvelles versions. La version 0.12.0 a corrigé les problèmes identifiés lors de la phase de test "v0.3" (l'autonomie, niveau défense, est PROUVÉE ; l'autonomie, niveau couverture, ne l'est PAS encore – le mécanisme de progression mis en place lors de la phase "v0.3") ; le test "v0.4" contre la version 0.12.0 a donné un résultat "PASS_WITH_CONDITIONS" (pas de niveau d'autorisation) – le niveau de sécurité de base est préservé, l'autonomie, niveau couverture, est SUBSTANTIELLEMENT prouvée au niveau des sections, mais un seul mode de défaillance a été détecté lors de la finalisation. La version 0.12.1 corrige ce seul mode de défaillance (R-018). Le test "v0.4" effectué sur cette version npm est exécuté dans une session distincte et est une condition préalable pour la finalisation.

- N'a pas été testé en conditions réelles par des utilisateurs externes, au-delà des tests internes et des quatre phases de test de l'autonomie. Six expériences internes ont été réalisées – une auto-référentielle, cinq portant sur des domaines externes (ComfyUI, XRPL, Godot, calibrage des évaluateurs, évaluateur déterministe) – ainsi que les phases de test de l'autonomie "v0.1 / v0.2 / v0.3 / v0.4", qui ont permis de détecter 18 problèmes (R-001 à R-005 corrigés dans la version 0.10.0, R-007 à R-011 corrigés dans la version 0.11.0, R-012 à R-017 corrigés dans la version 0.12.0, R-018 corrigé dans la version 0.12.1). L'utilisation à grande échelle par des opérateurs externes reste un objectif futur.

- N'est pas un outil complet de génération de contenu. La version 0.12.1 hérite des fonctionnalités de génération de contenu de la version 0.9, à savoir la génération de contenu par section (`synth section`) et la génération de contenu partielle (`synth pack --partial`), chacune avec une indication explicite de sa préparation pour la publication. La génération de contenu complète nécessite toujours un "pack" marqué comme `synthesis_ready` et une création de contenu par un humain (ou un collaborateur) en utilisant les identifiants de revendications acceptés via `synth workspace`.

- Ne constitue pas une approbation de modèle d'évaluateur. La version 0.12.1 ne contient pas de profil d'évaluateur "trusted_baseline" par défaut ; les reçus de calibrage sont des preuves, et non des approbations. Les reçus de calibrage existants, datant de la version 0.6.0, sont antérieurs à l'architecture MCP de la version 0.8.0 et n'ont pas été réinitialisés dans le cadre du chemin MCP. Consultez la [page du manuel de calibrage des évaluateurs](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

- Contient des artefacts historiques dans les versions figées. Les versions figées antérieures à la version 0.4 contiennent `research_os_version: '0.1.0'` en raison d'une constante codée en dur dans la version antérieure à la 0.4 ; cette correction a été intégrée dans la version 0.4.0, mais les versions figées antérieures ne peuvent pas être modifiées en vertu de la règle 15 (voir [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).

- L'attestation de provenance n'est pas disponible sur npm. L'attestation de provenance Sigstore est reportée à une version ultérieure ; vérifiez les packages npm de la version 0.12.1 à l'aide de package-shasum et du commit de la version sur GitHub.

- Ne représente pas une amélioration significative en matière de performance cloud. L'étude comparative "local-first-vs-cloud-research/" de la version 0.7.x a identifié les avantages du cloud en termes de lisibilité et de charge de travail pour les opérateurs ; la version 0.12.1 ne prétend pas que ces avantages ont été surmontés.

### Limitations connues

La version 0.12.1 est livrée avec trois limitations connues, visibles par les opérateurs, qui ont été conservées des versions précédentes. Chacune est documentée dans la [page des limitations connues du manuel](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) et dans le fichier [CHANGELOG.md](CHANGELOG.md). Aucune de ces limitations n'empêche la publication ; chacune a un moyen de récupération ou d'atténuation défini.

- **B-E-001 — La version "frozen-pack" pré-v0.4, identifiée par le code B-E-001, est un artefact historique.** Les paquets "frozen" publiés sous les versions v0.3.3 à v0.6.0 contiennent `research_os_version: "0.1.0"` dans les fichiers `pack.manifest.json` et `pack/research.yaml` en raison d'une constante codée en dur antérieure à la version v0.4. La correction a été intégrée dans la version v0.4.0 (la structure maintenant importe la valeur `RESEARCH_OS_VERSION` en direct) ; les paquets "frozen" plus anciens sont immuables conformément à la loi 15. Les fichiers JSON d'audit à l'intérieur des paquets concernés contiennent déjà leurs versions actuelles.
- **B-E-004 — L'attestation de provenance npm est reportée à une version ultérieure.** Le fichier tarball npm v0.12.1 vérifie uniquement via `package-shasum`. La migration du processus de publication vers un flux CI avec sigstore OIDC est incompatible avec la discipline de traduction avant publication (TranslateGemma 12B s'exécute localement) ; cette migration est prévue pour une version ultérieure. Vérifiez les paquets npm v0.12.1 via `package-shasum` et le commit de la publication GitHub.
- **B-A-003 — La migration de la version du schéma de l'indexeur est documentée, mais n'est pas appliquée de force.** La version v0.12.1 inclut un entier `SCHEMA_VERSION` pour l'écriture, mais pas de processus de migration pour la lecture. Lors d'une mise à jour documentée de `SCHEMA_VERSION`, supprimez le fichier `.research-os/index.sqlite` et relancez la commande `research-os index build --all`. Le paquet lui-même n'est pas affecté ; l'indexeur est une couche d'accélération au-dessus des preuves et des affirmations (loi 8) ; la reconstruction est idempotente.

**Aucun profil de réviseur "trusted_baseline" n'est autorisé dans la version v0.12.1.** Il s'agit d'une posture de confiance intentionnelle, et non d'un manque : les reçus de calibration dans le dépôt (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) enregistrent les preuves. La confiance est acquise par le biais de rappels répétés de pannes simulées, et non supposée. Ces reçus datent d'avant l'architecture MCP v0.8.0 et n'ont pas été réinitialisés dans le cadre du chemin MCP.

## Feuille de route vers la version 1.0

La version 1.0 est un état atteint, et non une date de sortie. Les six phases de tests internes (Exp1–Exp6, du 8 mai 2026 au 11 mai 2026) ont été terminées, chacune produisant un ensemble de données de recherche validé et intégré à [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). Le projet a atteint les versions suivantes : v0.2.0 avec la fonctionnalité `research-os pack publish` et le modèle 2 (Expérience 2), v0.3.0 avec l'option `--detector` (F-09), v0.3.1 avec les exemptions spécifiques à chaque section (F-10/F-11), v0.3.2 avec la normalisation des déclarations acceptées (F-36), v0.3.3 avec une clarification de la sémantique des contrôles (F-43/F-41), v0.4.0 avec une discipline rigoureuse concernant les sources de données (F-27/F-47/F-46), v0.5.0 avec un calibrage des examinateurs considéré comme un contrat de confiance durable (F-48/F-49/F-50), et v0.6.0 avec une base de référence déterministe pour les examinateurs (F-53/F-54). La préparation de la version 1.0 est en cours, grâce à un processus en plusieurs étapes de vérification et d'amélioration ; l'architecture est verrouillée pendant ce processus. Le plan complet est disponible dans [`docs/roadmap.md`](docs/roadmap.md).

## Licence

MIT
