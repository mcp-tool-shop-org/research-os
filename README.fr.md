<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Un outil en ligne de commande qui transforme un sujet ouvert en un **ensemble de ressources de recherche structuré** — un référentiel organisé où Claude, Cowork ou un groupe de personnes peuvent travailler pendant des heures sans produire d'hallucinations ni déformer l'investigation.

## Qu'est-ce que c'est

`research-os` est la couche de contrôle entre "Je veux étudier X" et une base de preuves structurée et vérifiable. Il sépare les pistes de découverte de la collecte de preuves, l'extraction brute des affirmations triées, la détection des contradictions de la résolution des contradictions, et les décisions de révision des dispositions de synthèse. Chaque étape est enregistrée dans un registre en écriture seule ; chaque verdict de validation est calculé à partir de ces registres, et non affirmé.

Ce n'est pas un générateur de rapports. Ce n'est pas un framework d'orchestration de modèles de langage (LLM). Il ne rédige pas la synthèse pour vous. Il impose les conditions dans lesquelles la synthèse peut commencer.

Les paquets figés sont archivés dans [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — et sont disponibles, avec deux paquets de la première version. Consultez [`docs/roadmap.md`](docs/roadmap.md) pour connaître la feuille de route de la version 1.0.

La version 0.1 a été soumise à des tests intensifs lors de deux phases de test interne. La première — où "research-os" étudiait sa propre spécification — a révélé sept erreurs avant la version 0.1.0, chacune nécessitant une correction de code et donnant lieu à une règle ou un modèle d'intégration. La deuxième (v1 Experiment 1 : durabilité du flux de travail ComfyUI, 11 sessions, un domaine sans chevauchement de vocabulaire avec "research-os") a été finalisée le 2026-05-09 : le paquet a été figé, l'archive est en ligne, et l'application du modèle 2 a été achevée via le commit `22b5dba`. Les preuves de la version 0.1 sont disponibles dans [`docs/dogfood-proof.md`](docs/dogfood-proof.md) ; les preuves de l'Expérimentation 1 sont disponibles dans [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Le manuel est disponible à l'adresse suivante : <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

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

**v0.3.1** — publié sur npm en tant que `@mcptoolshop/research-os@0.3.1`, le 2026-05-09. Inclut des clauses de non-responsabilité spécifiques aux sections (`primary_source_waiver.section_waivers[]`) et une reconnaissance de la part des examinateurs, de sorte qu'une constatation de "monopole de la source" à l'échelle d'une section, qui aurait normalement redirigé toutes les demandes vers "needs_source_repair", devient une mise en garde visible. Ceci a été obtenu lors de la session 2 de l'Expérimentation 3 avec le paquet XRPL — les sections relatives au protocole canonique (chaînes à fondation unique, spécifications d'API en "bac à sable", documents des organismes de normalisation) ont inversé l'hypothèse selon laquelle la diversité des éditeurs est un indicateur de la qualité de l'information. 540/540 tests vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md) et [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Clauses de non-responsabilité spécifiques aux sections** — Utilisez-les lorsque la diversité des éditeurs est structurellement incompatible avec la source d'information de la section, et non lorsque la section n'a simplement pas trouvé suffisamment de sources. Elles sont soumises à un schéma et incluent un champ "reason" (raison) et un tableau "compensating_controls" (contrôles compensatoires) non vide. La politique du paquet `primary_source_waiver_allowed: false` bloque à la fois les clauses de non-responsabilité au niveau du paquet et celles spécifiques aux sections. La solution de contournement `min_independent_publishers: 0` au niveau du paquet, valable avant la version 0.3.1, est maintenant obsolète ; les paquets figés existants restent valides avec leurs reçus existants. Consultez [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) et le [guide d'utilisation de l'opérateur pour research-packs](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publié le 2026-05-09. Introduit le paramètre `--detector <auto|heuristic|ollama-intern>` pour la commande `contradict map` (correction F-09 du blocage de la chaîne de l'Expérimentation 3, session 1, paquet XRPL). 527/527 tests vitest réussis. La sélection du détecteur est maintenant un choix explicite de l'opérateur, au lieu d'une danse complexe avec les variables d'environnement ; le mode est annoncé clairement à chaque exécution. Consultez [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publié le 2026-05-09. Introduit `research-os pack publish` (Expérimentation 2) et la correction de la condition de préparation pour le modèle 2. 515/515 tests vitest réussis. Consultez [CHANGELOG.md](CHANGELOG.md). Les paquets figés sont exportés vers l'archive canonique `research-packs` avec une seule commande ; le contrat d'admission est appliqué par le code, et non par une liste de contrôle. Consultez [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — gelée le 2026-05-08. L'ensemble de données "dogfood" situé dans `research-os-packs/research-os-spec/` (dépôt frère) a atteint l'état de "gel" avec 296 propositions acceptées réparties sur 8 sections, 17 dispositions, 30 propositions corrigées par l'utilisateur, 0 blocage de correction actif, 0 contradiction non résolue, toutes les étapes de validation indiquant `synthesis_eligible=true`. 463/463 tests Vitest réussis. Seize règles fondamentales cumulées. Consultez le fichier [`docs/dogfood-proof.md`](docs/dogfood-proof.md) pour connaître les sept découvertes et les empreintes des enregistrements de "gel".

**Archive monorepo research-packs** — disponible à [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) avec deux paquets de la première version. `comfyui-workflow-durability` (Expérimentation 1, 302 demandes acceptées, 8 sections) et `research-os-self-dogfood` (rétro-intégration du test interne v0.1, 296 demandes acceptées, 8 sections). Les deux paquets passent le test `verify-pack.mjs`.

**Expérimentation 1 (durabilité du flux de travail ComfyUI)** — CLOSÉE le 2026-05-09. Toutes les 8 sections à Terminal A, paquet figé, archive en ligne. Consultez [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) et [`docs/roadmap.md`](docs/roadmap.md).

### Ce que la version 0.1 n'est pas

- Non testé par des utilisateurs externes. Deux cycles de tests internes ont été terminés : un cycle centré sur le produit lui-même, un autre sur un domaine externe. L'expérience 3 (stabilité de l'API sous pression externe) est en cours : le lot n°1 sur 3 (durabilité des jetons créateurs XRPL) a permis d'obtenir à la fois le drapeau `--detector` de la version v0.3.0 et les exemptions de portée de section de la version v0.3.1. Deux lots supplémentaires liés à un domaine externe sont nécessaires pour la finalisation de l'expérience 3.
- Ne génère pas de contenu. La commande `synth workspace` crée l'environnement de travail structuré ; les rédacteurs (ou Cowork) écrivent le contenu en se basant sur les identifiants de revendications approuvés.
- La stabilité de l'API n'est pas garantie selon le système de versionnage sémantique. La version v1.0.0 est un objectif à atteindre, et non une date fixe ; consultez le fichier [`docs/roadmap.md`](docs/roadmap.md) pour connaître les six expériences qui permettent d'atteindre cet objectif.

### Limitations connues

- **L'origine de l'extracteur n'est pas visible au niveau de la jointure.** Une section peut passer les tests en se basant sur des revendications heuristiques lorsque l'extracteur calibré (Ollama avec le modèle configuré) n'est pas disponible. Cela a été enregistré comme l'expérience 4 dans la feuille de route ; les améliorations futures indiqueront les revendications approuvées par l'extracteur et exigeront un nombre suffisant de revendications approuvées provenant du chemin calibré.
- **Le choix du modèle de relecture, au-delà de la configuration de base calibrée `hermes-two-pass`, n'est pas encore résolu.** Le cycle de tests internes a validé une configuration de relecture ; les modèles alternatifs doivent être calibrés avec des tests de défaillance simulés avant de pouvoir être utilisés. C'est l'expérience 5 dans la feuille de route.
- **Le lot de tests internes v0.1 a utilisé `mistral-nemo:12b` pour l'extraction (la valeur par défaut est `hermes3:8b`).** `hermes3:8b` n'était pas disponible sur cette configuration matérielle pendant le cycle v0.1. Cette information concernant le remplacement est valable jusqu'à ce qu'une version utilisant `hermes3` soit disponible. C'est l'expérience 6 dans la feuille de route. Pour les utilisateurs sur des configurations matérielles sans `hermes3:8b`, définissez la variable `OLLAMA_INTERN_MODEL` sur un modèle disponible ; les URL préconfigurées par l'administrateur et le respect des règles de précision des requêtes (voir le manuel) permettent de réduire les hallucinations sur des sujets ambigus.

## Feuille de route vers la version 1.0

La version 1.0 est un objectif à atteindre, et non une date de sortie. Six expériences sont en cours entre la version v0.1 et la version v1.0 : des tests internes non centrés sur le produit lui-même (actuellement en cours avec le lot de durabilité du flux de travail ComfyUI), une commande `research-os pack publish` qui automatise l'exportation vers le dépôt monolithique `research-packs` (expérience 2, qui est conditionnée à la finalisation manuelle de l'expérience 1), la stabilité de l'API sous pression externe, la résolution du problème de traçabilité de l'extracteur, l'amélioration de la calibration des relecteurs au-delà de `hermes-two-pass`, et une exécution de base propre sur `hermes3:8b`. L'expérience 1 n'est pas terminée au moment de la finalisation du lot ; elle est finalisée lorsque le lot finalisé est publié comme le premier package dans le dépôt monolithique `research-packs`, en complément du lot de tests internes v0.1. Le plan complet est disponible dans le fichier [`docs/roadmap.md`](docs/roadmap.md). L'architecture est verrouillée tout au long du processus ; la version 1.0 approfondit ce que la version 0.1 a démontré, plutôt que de repartir de zéro.

## Licence

MIT
