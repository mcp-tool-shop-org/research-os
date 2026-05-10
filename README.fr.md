<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.3.2"><img src="https://img.shields.io/badge/version-0.3.2-blue" alt="version 0.3.2"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

Un outil en ligne de commande qui transforme un sujet ouvert en un **ensemble de ressources de recherche structuré** — un référentiel organisé où Claude, Cowork ou un groupe de personnes peuvent travailler pendant des heures sans produire d'hallucinations ni déformer l'investigation.

## Qu'est-ce que c'est

`research-os` est la couche de contrôle entre "Je veux étudier X" et une base de preuves structurée et vérifiable. Il sépare les pistes de découverte de la collecte de preuves, l'extraction brute des affirmations triées, la détection des contradictions de la résolution des contradictions, et les décisions de révision des dispositions de synthèse. Chaque étape est enregistrée dans un registre en écriture seule ; chaque verdict de validation est calculé à partir de ces registres, et non affirmé.

Ce n'est pas un générateur de rapports. Ce n'est pas un framework d'orchestration de modèles de langage (LLM). Il ne rédige pas la synthèse pour vous. Il impose les conditions dans lesquelles la synthèse peut commencer.

Les ensembles de données figés sont archivés dans [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — et sont accessibles en direct, avec deux ensembles de données de la première version. Consultez [`docs/roadmap.md`](docs/roadmap.md) pour connaître la feuille de route de la version 1.0.

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

**Pour un exemple concret**, consultez l'ensemble de données "dogfood" situé dans `research-os-packs/research-os-spec/` : chaque fichier, chaque enregistrement, chaque disposition, chaque empreinte de "gel", le tout est stocké sur disque dans des fichiers qui ne peuvent être modifiés qu'en ajoutant des informations. Cet ensemble de données a généré le fichier `docs/dogfood-proof.md`.

**Nécessite [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) en cours d'exécution localement** pour l'extraction, le tri, la revue et la découverte des modèles de langage. Le modèle par défaut est `hermes3:8b`; vous pouvez le modifier en utilisant la variable d'environnement `OLLAMA_INTERN_MODEL=<modèle>`. Définissez la variable d'environnement `OLLAMA_HOST` si Ollama n'est pas exécuté sur l'adresse par défaut `localhost:11434`.

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

## Statut

**v0.3.2** — publiée sur npm en tant que `@mcptoolshop/research-os@0.3.2`, le 2026-05-09. Inclut une normalisation des demandes d'acceptation, prenant en compte l'admission pour la publication de l'ensemble de données. La vérification stricte d'égalité entre `claim-reviews.jsonl` et `pack-audit.json::accepted_claims` est remplacée par une comparaison d'ensembles — les demandes acceptées sont des `claim_id` uniques dont la décision de révision canonique la plus récente est `accepted_for_synthesis` (la dernière décision fait foi pour chaque `claim_id`). Les ensembles de données figés dont le nombre d'audits hérités diffère de l'ensemble normalisé sont désormais acceptés avec un avertissement plutôt qu'un refus ; le fichier d'audit hérité est conservé tel quel (Règle 15), tandis que le manifeste de l'archive reflète le nombre normalisé. Le refus reste strict pour les `claim_id` fantômes, les décisions dupliquées incompatibles et les conditions qui ne permettent pas la synthèse. Ceci a été obtenu grâce à l'Expérience 3, session K, pour l'ensemble de données XRPL — la publication de l'ensemble de données a été refusée en raison d'un désaccord sur le registre de clôture (la section 07 comportait 24 lignes brutes `accepted_for_synthesis`, mais seulement 19 `claim_id` uniques en raison des fenêtres de révision des examinateurs qui se chevauchent). 558/558 tests vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md) et [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — publiée sur npm en tant que `@mcptoolshop/research-os@0.3.1`, le 2026-05-09. Inclut des clauses de renonciation spécifiques aux sections (`primary_source_waiver.section_waivers[]`) ainsi qu'une confirmation de la part des examinateurs, de sorte qu'une constatation de "monopole de la source" à l'échelle d'une section, qui est renoncée, devient une mise en garde visible plutôt qu'une redirection automatique de toutes les demandes vers `needs_source_repair`. Ceci a été obtenu grâce à l'Expérience 3, session 2, pour l'ensemble de données XRPL — les sections du protocole canonique (chaînes à fondation unique, spécifications d'API en vase clos, documents des organismes de normalisation) ont inversé l'hypothèse selon laquelle la diversité des éditeurs est un indicateur de la qualité de l'information. 540/540 tests vitest réussis à ce moment-là. Consultez [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Clauses de renonciation spécifiques aux sections** — Utilisez-les lorsque la diversité des éditeurs est structurellement incompatible avec la source de vérité de la section, et non lorsque la section n'a simplement pas trouvé suffisamment de sources. La `raison` est appliquée par le schéma, ainsi que la présence de tableaux `compensating_controls[]` non vides. La politique de l'ensemble de données `primary_source_waiver_allowed: false` bloque à la fois les renonciation au niveau de l'ensemble de données et les renonciation spécifiques aux sections. La solution de contournement `min_independent_publishers: 0` au niveau de l'ensemble de données, qui était en vigueur avant la version 0.3.1, est maintenant obsolète ; les ensembles de données figés existants restent valides selon leurs reçus existants. Consultez [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) et le [guide d'utilisation de l'opérateur pour les ensembles de données](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publiée le 2026-05-09. Introduit l'indicateur `--detector <auto|heuristic|ollama-intern>` pour la commande `contradict map` (correction F-09 du blocage de la chaîne provenant de l'Expérience 3, session 1, ensemble de données XRPL). 527/527 tests vitest réussis à ce moment-là. La sélection du détecteur est maintenant un choix explicite de l'opérateur plutôt qu'une danse complexe avec des variables d'environnement dépendantes de l'état ; le mode est annoncé de manière visible à chaque exécution. Consultez [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publié le 2026-05-09. Distribution du paquet `research-os pack publish` (Expérience 2) et correction de la condition de préparation du modèle 2. 515 tests Vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md). Les paquets figés sont exportés vers l'archive canonique `research-packs` avec une seule commande ; le contrat d'adhésion est appliqué par le code, et non par une liste de contrôle. Consultez [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — gelée le 2026-05-08. L'ensemble de données "dogfood" situé dans `research-os-packs/research-os-spec/` (dépôt frère) a atteint l'état de "gel" avec 296 propositions acceptées réparties sur 8 sections, 17 dispositions, 30 propositions corrigées par l'utilisateur, 0 blocage de correction actif, 0 contradiction non résolue, toutes les étapes de validation indiquant `synthesis_eligible=true`. 463/463 tests Vitest réussis. Seize règles fondamentales cumulées. Consultez le fichier [`docs/dogfood-proof.md`](docs/dogfood-proof.md) pour connaître les sept découvertes et les empreintes des enregistrements de "gel".

**Monorepo de l'archive `research-packs`** — disponible à [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) avec deux paquets disponibles dès le lancement. `comfyui-workflow-durability` (Expérience 1, 302 affirmations acceptées, 8 sections) et `research-os-self-dogfood` (remplissage de la version 0.1, 296 affirmations acceptées, 8 sections). Les deux paquets passent le test `verify-pack.mjs`.

**Expérience 1 (Durabilité du flux de travail ComfyUI) — v1** — TERMINÉE le 2026-05-09. Les 8 sections sont disponibles dans le Terminal A, le paquet est figé, l'archive est en ligne. Consultez [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) et [`docs/roadmap.md`](docs/roadmap.md).

### Ce que la version 0.1 n'est pas

- Non testée en conditions réelles par des utilisateurs externes. Deux cycles de test interne sont terminés : un auto-référentiel et un externe. L'Expérience 3 (stabilité de l'API sous pression externe) est en cours : le paquet n°2 sur 3 (durabilité des jetons de créateur XRPL) est figé avec 251 affirmations acceptées réparties sur 7 sections, en attente de l'approbation de la publication du paquet pour npm v0.3.2. Ce cycle a permis d'obtenir le drapeau `--detector` v0.3.0 (F-09, bloqueur de chaîne), les exemptions de source spécifiques aux sections v0.3.1 (F-10/F-11, pression du protocole canonique) et la comptabilité normalisée des affirmations acceptées v0.3.2 (F-36, jointure du grand livre de clôture). Un paquet supplémentaire de domaine externe est nécessaire pour la clôture de l'Expérience 3.
- Ne génère pas de texte. La commande `synth workspace` génère l'espace de travail structuré ; les humains (ou Cowork) rédigent le texte en fonction des identifiants des affirmations acceptées.
- La stabilité de l'API n'est pas garantie selon la version sémantique. La version 1.0.0 est un état atteint, et non une date calendaire. Consultez [`docs/roadmap.md`](docs/roadmap.md) pour connaître les six expériences qui permettent d'atteindre cet objectif.

### Limitations connues

- **L'origine de l'extracteur n'est pas visible au niveau de la jointure.** Une section peut passer le seuil des affirmations acceptées tout en s'appuyant sur des affirmations heuristiques lorsque l'extracteur calibré (Ollama avec le modèle configuré) n'est pas disponible. Cela est enregistré comme l'Expérience 4 dans la feuille de route ; les améliorations futures indiqueront les affirmations acceptées par extracteur et exigeront le nombre d'affirmations acceptées du chemin calibré.
- **La sélection du modèle de révision au-delà de la base de référence calibrée `hermes-two-pass` n'est pas résolue.** Le cycle de test interne a validé une configuration de réviseur ; les modèles alternatifs doivent être calibrés avec un rappel de défaillance simulée avant de pouvoir être utilisés. C'est l'Expérience 5 dans la feuille de route.
- **Le paquet de test interne v0.1 utilisait `mistral-nemo:12b` pour l'extraction (le modèle par défaut canonique est `hermes3:8b`).** `hermes3:8b` n'était pas disponible sur cette machine pendant le cycle v0.1. Cette information est indiquée jusqu'à ce qu'une version basée sur hermes3 soit disponible. C'est l'Expérience 6 dans la feuille de route. Pour les opérateurs utilisant des machines sans `hermes3:8b`, définissez `OLLAMA_INTERN_MODEL` sur un modèle disponible ; les URL pré-configurées par l'opérateur et la discipline de précision des requêtes (voir le manuel) atténuent les hallucinations de découverte sur des sujets ambigus.

## Feuille de route vers la version 1.0

La version 1.0 est un état atteint grâce aux progrès réalisés, et non une date de sortie. Six expérimentations sont nécessaires entre la version 0.1 et la version 1.0 : une version interne non axée sur les fonctionnalités existantes (actuellement en cours de développement avec le pack de durabilité pour ComfyUI), une commande `research-os pack publish` qui automatise l'exportation vers le référentiel unique `research-packs` (Expérience 2, limitée par la finalisation manuelle de l'Expérience 1), la stabilité de l'API sous pression externe, la résolution du problème de traçabilité des extractions, l'amélioration de la calibration des examinateurs au-delà de `hermes-two-pass`, et une exécution de référence propre sur `hermes3:8b`. L'Expérience 1 ne sera pas finalisée au moment de la version stable – elle se terminera lorsque la version stable sera distribuée comme premier paquet dans le référentiel unique `research-packs`, en complément de la version interne 0.1. Le plan complet est disponible dans [`docs/roadmap.md`](docs/roadmap.md). L'architecture reste inchangée ; la version 1.0 approfondit ce que la version 0.1 a démontré, plutôt que de réintroduire des éléments.

## Licence

MIT
