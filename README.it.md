<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` trasforma una ricerca, partendo da un documento generato, in un pacchetto di evidenze consolidate. Preserva la fonte originale, separa le affermazioni dalla sintesi, impone il rispetto delle regole attraverso dei controlli, registra le decisioni dei revisori e le eventuali deroghe, e pubblica un pacchetto le cui affermazioni possono essere tracciate e verificate.

Non richiede di fidarsi del modello. Fornisce gli strumenti per decidere se il modello, le fonti e la sintesi meritano fiducia.

## Cos'è

`research-os` è l'interfaccia di controllo tra "Voglio fare una ricerca su X" e una base di evidenze consolidata e tracciabile. Separa le fasi di scoperta dalla raccolta delle evidenze, l'estrazione dei dati grezzi dalle affermazioni selezionate, il rilevamento delle contraddizioni dalla loro risoluzione e le decisioni dei revisori dalle disposizioni della sintesi. Ogni fase viene registrata in un registro a cui è possibile aggiungere elementi; ogni verifica di conformità viene calcolata sulla base di tali registri, non semplicemente affermata.

Non è un generatore di report. Non è un framework per l'orchestrazione di LLM. Non scrive la sintesi al posto tuo. Applica le condizioni necessarie affinché la sintesi possa iniziare.

I pacchetti consolidati vengono archiviati in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — sono attivi e contengono quattro pacchetti che coprono i sei esperimenti di test interni. Consultare [`docs/roadmap.md`](docs/roadmap.md) per la roadmap della versione 1.0.

La versione 0.1 è stata sottoposta a test approfonditi in due cicli di test interni. Il primo — `research-os` che analizza le proprie specifiche — ha individuato sette incongruenze prima del rilascio della versione 0.1.0, ognuna delle quali richiedeva una correzione reale del codice e portava all'adozione di una regola o di un modello di integrazione. Il secondo (Esperimento 1 della versione 1: durata del flusso di lavoro ComfyUI, 11 sessioni, un dominio senza sovrapposizioni lessicali con `research-os`) si è concluso il 2026-05-09: pacchetto consolidato, archivio attivo, applicazione completa della Regola 2 tramite commit `22b5dba`. La traccia della prova della versione 0.1 è disponibile in [`docs/dogfood-proof.md`](docs/dogfood-proof.md); la traccia della prova dell'Esperimento 1 è disponibile in [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Manuale online: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Installazione

**Requisiti:** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Per gli sviluppatori che compilano il codice sorgente:

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## Avvio rapido

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

> **Nota sull'output di `freeze`.** `research-os freeze` opera in silenzio mentre analizza ogni artefatto e calcola gli hash del contenuto; non c'è un avanzamento incrementale per questo comando. Per i pacchetti di grandi dimensioni, potrebbe impiegare decine di secondi prima di stampare qualcosa. Al termine, stampa un singolo blocco di verifica (`PASS` / `REFUSED` più il percorso della ricevuta). Non interpretare la pausa come un blocco del sistema.

> **Avviso `--force`.** `--force` cancella e sostituisce la directory del pacchetto di destinazione. Non conservare file creati manualmente all'interno dell'output del pacchetto generato. Modificare invece gli artefatti a monte (affermazioni, fonti, sintesi) o i file correlati. Contratto completo + casi di rifiuto: [`docs/pack-publish.md`](docs/pack-publish.md).

**Per un esempio pratico**, consultare il pacchetto di test interno in `research-os-packs/research-os-spec/` — ogni artefatto, ogni ricevuta, ogni disposizione, ogni impronta di consolidamento, tutto su disco in registri a cui è possibile aggiungere elementi. Questo pacchetto ha prodotto `docs/dogfood-proof.md`.

**Richiede [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) in esecuzione localmente** per l'estrazione, la selezione, la revisione e la scoperta tramite LLM. Il server MCP viene individuato tramite la variabile d'ambiente `OLLAMA_INTERN_MCP_BIN` o PATH. Il modello predefinito è `hermes3:8b`; sovrascriverlo con `OLLAMA_INTERN_MODEL=<model>` (o per chiamata, `--model <name>`). Impostare `OLLAMA_HOST` se Ollama non si trova nell'indirizzo predefinito `localhost:11434`.

## Le 16 regole fondamentali

| # | Regola |
|---|-----|
| 1 | Nessuna sintesi prima della fonte originale. |
| 2 | La raccolta è evidenza; l'estrazione è interpretazione. |
| 3 | I modelli possono interpretare le porzioni di testo originali; non possono creare nuove porzioni di testo che costituiscono evidenze. |
| 4 | L'estrazione può produrre un numero eccessivo di elementi; la sintesi non può ereditare questa abbondanza. |
| 5 | La mappatura delle contraddizioni rivela le tensioni; non risolve, sintetizza o decide quale affermazione prevale. |
| 6 | I controlli decidono se una sezione è idonea per la sintesi. Non sintetizzano né nascondono i fallimenti. |
| 7 | La revisione avversaria valuta l'integrità della ricerca. Non sintetizza né riscrive la fonte originale. |
| 8 | L'indicizzazione rende ricercabile la verità. Non crea nuove verità né diventa la fonte di riferimento. |
| 9 | Il passaggio delle consegne tra colleghi genera istruzioni operative a partire dalla verità della ricerca. Non crea verità né aggira i controlli. |
| 10 | Lo spazio di lavoro per la sintesi organizza le verità della ricerca accettate per il lavoro collaborativo. Non crea sintesi né aggira la modalità di passaggio delle consegne. |
| 11 | L'audit del pacchetto aggrega le verità della ricerca esistenti. Non crea nuove verità né nasconde le evidenze a livello di sezione. |
| 12 | La scoperta propone spunti; solo la raccolta produce evidenze. |
| 13 | Un revisore non è considerato affidabile finché i fallimenti iniziali non dimostrano la sua capacità di recupero. |
| 14 | L'abbondanza di affermazioni non è sinonimo di qualità della ricerca. Le affermazioni devono essere selezionate prima di poter competere per la sintesi. |
| 15 | Il consolidamento blocca le verità della ricerca completate. Non completa ricerche incomplete né converte lo stato di riparazione in evidenze. |
| 16 | Le deroghe allentano i vincoli delle fonti; non possono fabbricare evidenze. |

**Regola 3:** l'LLM non crea mai testo che costituisce evidenza. `research-os` costruisce un registro deterministico di estratti (ID stabili come `ex_<source_id_hex>_001`); l'LLM seleziona gli ID degli estratti; `research-os` copia il testo letterale. La classe di errore "parafrasi come citazione" è strutturalmente impossibile.

**Legge 14** – tra estrazione e revisione, `research-os claim triage` elimina i duplicati, limita il contributo per sorgente e mette in pausa le candidature meno promettenti. Il processo di triage NON modifica `claims.jsonl`; le candidature messe in pausa rimangono nel registro principale.

## La catena di flusso di lavoro v0.1

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

Ogni passaggio è un comando CLI. Ogni passaggio scrive su artefatti con sola aggiunta. Nessun passaggio sintetizza, risolve o crea nuove informazioni: queste invarianti vengono applicate, non considerate affidabili. La revisione accetta/rifiuta/richiede correzioni per le candidature; il gateway utilizza tali decisioni di revisione per calcolare `synthesis_eligible`; la fase finale è il blocco di integrità che si rifiuta di contrassegnare un pacchetto come completato a meno che ogni livello non sia d'accordo. Consultare [docs/dogfood-proof.md](docs/dogfood-proof.md) per la prova v0.1 che dimostra che la catena funziona correttamente dall'inizio alla fine.

Questa è l'alternativa strutturale a *ricerca → riepilogo → report dettagliato*. La catena è il prodotto finale.

## Vocabolario

| Termine | Significato |
|------|---------|
| `research-os` | Il piano di controllo / CLI / gateway / legge sull'orchestrazione (questo repository) |
| `research-pack` | L'artefatto del repository generato per un singolo progetto di ricerca |
| `research section` | Un'unità limitata di indagine all'interno di un pacchetto |
| `research receipt` | Prova che una sezione ha superato i controlli su sorgente/candidatura/gateway |

## Sicurezza

`research-os` è una CLI che funziona principalmente in locale. Legge e scrive file all'interno della directory del pacchetto di ricerca specificata e (quando si utilizza `gather`) invia richieste HTTP esterne per recuperare gli URL delle sorgenti fornite. Non esegue: un server, accetta connessioni in entrata, memorizza credenziali o invia dati di telemetria. Nessun segreto viene scritto negli artefatti del pacchetto. Consultare [SECURITY.md](SECURITY.md) per la politica di segnalazione delle vulnerabilità.

## Calibrazione dei revisori

La versione v0.5.0 rende permanente la calibrazione dei revisori. Un profilo del revisore non è considerato affidabile solo perché è stato eseguito una volta; acquisisce uno status attraverso ricevute strutturate di fallimenti simulati e aggregazioni multi-esecuzione. La versione v0.6.0 aggiunge opzioni deterministiche per i revisori al percorso di revisione e all'ambiente di calibrazione in produzione.

**Attualmente, nessun profilo è considerato come `trusted_baseline`.** Le ricevute canoniche nel repository mostrano `hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`. Questo è intenzionale: la fiducia si guadagna attraverso prove ripetute di fallimenti simulati, non viene data per scontata.

Le ricevute di calibrazione sono archiviate in `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`. Ogni ricevuta registra PASS/FAIL rispetto a sette parametri, quattro etichette di stato (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`) e rivela onestamente ciò che il test non può verificare (`needs_contradiction_mapping` è irraggiungibile da `seeded-v1`). Consultare [CHANGELOG.md](CHANGELOG.md).

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

Quando viene utilizzato `--runs <n>`, le ricevute per ogni esecuzione vengono scritte in `<profile>/runs/run-NNN.json` e una ricevuta aggregata (con parametri basati sulla mediana e rilevamento di fallimenti ricorrenti) viene scritta in `<profile>/seeded-v1.{json,md}`. La ricevuta aggregata contiene `receipt_kind: 'aggregate'` per distinguerla dalle ricevute di singola esecuzione. La modalità di singola esecuzione (`--runs 1` o omesso) preserva il comportamento esistente di scrittura diretta.

**Profili deterministici dei revisori:** utilizzare `review_profiles.<name>.reviewer_options` in `research.yaml` per includere `temperature`, `seed` e altri parametri di campionamento di Ollama in ogni costruzione di `OllamaInternReviewer` nel percorso di revisione in produzione. Il profilo `hermes-two-pass-deterministic` viene fornito come esempio predefinito. Consultare [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) e la [pagina del manuale sulla calibrazione dei revisori](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Nuovo nella versione v0.13.1: R-024 Autorità di budget a livello di fase per l'estrazione (patch del percorso C)

La versione v0.13.1 è una patch con una singola correzione applicata alla versione v0.13.0. Risolve la condizione Track-C della versione v0.5 (R-019, lacuna nell'ambito del collegamento nella fase di estrazione delle candidature) estendendo l'autorità di budget a livello di fase di R-019 a ogni chiamata MCP `ollama_extract` effettuata durante l'`estrazione della candidatura`: l'estrattore per finestra, il critico delle prove di sezione R-011 per candidatura e il critico del salvataggio R-012 per candidato. Stessa struttura architettonica della copertura della sintesi di prosa di R-019. Patch per un singolo repository (solo research-os); lo schema del campo `tier_budget_ms_override` di ollama-intern-mcp@2.6.0 è l'unico elemento invariato sul lato server.

Questa versione esiste perché il gateway di isolamento dell'operatore v0.5 rispetto a `mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0` ha restituito **PASS_WITH_CONDITIONS, NON un livello di autorizzazione** (`operator_aloneness_dst_v0.5`). Tutte le superfici v0.13 (R-018 + R-019 + R-020 + R-021) hanno funzionato correttamente in tempo reale senza errori; il livello di difesa è stato mantenuto; rifiuto onesto in caso di fallimenti noti con azioni di ripristino documentate. Tuttavia, 3 delle 8 sorgenti nella sezione 02 (`02-safety-and-economic`) hanno superato il limite di tempo istantaneo di 15000 ms durante l'estrazione senza che fosse disponibile un override rivolto all'operatore. R-019 aveva fornito l'override analogo per la sintesi della prosa nella versione v0.13.0; la versione v0.13.1 lo estende alla fase di estrazione.

> **R-024 implementa la regola completa del budget a livello di fase: quando si estende un budget a livello di fase, il budget deve raggiungere ogni chiamata LLM in quella fase che può produrre lo stesso limite di tempo interno. Una copertura parziale equivale a una patch mal indirizzata a livello di copertura dei siti di chiamata.**
> **R-024 implementa anche la regola sulla fragilità del test di riproduzione: quando un test di accettazione di riproduzione in diretta fallisce per motivi relativi all'ambiente (tempo, acquisizione, stato degli elementi) piuttosto che per motivi meccanici, correggere l'ambiente di test; non saltare, declassare o sostituire con un'ispezione manuale dell'artefatto.**

La versione 0.5 prevede la configurazione Path D (smistamento multi-traccia). La versione 0.13.1 chiude la traccia C. La traccia A è stata chiusa durante la fase di impostazione (whitelist del percorso dell'hook memory-gate). La traccia B (impostazione per l'individuazione delle fonti) viene eseguita in una sessione separata dopo che la versione 0.13.1 è stata pubblicata. L'impostazione del gate della versione 0.6 segue la traccia B. Lo Slice di ammissibilità 1 rimane **non autorizzato** fino al superamento della fase 0.6.

### Cosa puoi eseguire

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

Priorità: flag CLI > variabile d'ambiente > valore predefinito (omesso; i valori predefiniti del profilo ollama-intern-mcp vengono applicati). Limite di `[1, 600000]` ms (limite massimo di sicurezza di 10 minuti). I valori non validi generano un errore chiaro con un codice di uscita diverso da zero, indicando la superficie e il valore problematico.

### Novità

**R-024: autorità sul budget per fase in tutti i 3 siti di chiamata `ollama_extract`.** Il nuovo flag `--tier-budget-ms <N>` su `claim extract` (e la corrispondente variabile d'ambiente `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS`) inoltra un override del budget per fase controllato dall'operatore per ogni chiamata a `ollama-intern-mcp@>=2.6.0` come `tier_budget_ms_override` in OGNI invocazione di `ollama_extract` durante l'esecuzione dell'estrazione: `MCPClaimExtractor.extractOnePage` (l'estrattore per finestra), `runCritic` (R-011, critico per sezione di ogni affermazione, una chiamata per bozza per finestra) e `runRescueCritic` (R-012, critico per il salvataggio dei candidati in caso di corrispondenza del contenuto della fonte). Il budget attivo viene visualizzato su stderr (`[extract] tier_budget_ms=N source=... section=<id>`) prima del ciclo per ogni fonte, nei metadati dell'estrazione (`tier_budget_ms` + `tier_budget_overridden_by` in `audits/<section>-claim-extract.json`) e nell'enum chiuso `EXTRACT_TIER_BUDGET_SOURCES` (`['default', 'cli_flag', 'env_var']`). Il comportamento predefinito è identico alla versione 0.13.0 (nessun flag, nessuna variabile d'ambiente → i valori predefiniti del profilo vengono applicati; l'estrazione omette i nuovi campi).

### Nota sull'architettura

R-024 rispecchia l'architettura di R-019, ma in una fase diversa. R-019 ha collegato l'override tramite `runProseSynthesis` al pianificatore + redattore + verificatore (3 siti di chiamata `ollama_extract` per la sintesi del testo); R-024 lo collega tramite l'orchestratore `extract()` → `MCPClaimExtractor.extract` → distribuzione a extractOnePage + runCritic + runRescueCritic (3 siti di chiamata `ollama_extract` nella fase di estrazione). La regola sul budget per fase con copertura completa è ora un principio fondamentale: quando si estende il budget per una superficie rivolta all'operatore, il report della Fase B deve elencare ogni sito di chiamata LLM in quella fase che condivide lo stesso timeout interno. Una copertura parziale produce un errore MISTARGETED-PATCH a livello di copertura del sito di chiamata con la stessa firma auto-falsificante dell'errore MISTARGETED-PATCH del wrapper/meccanismo interno di R-018: l'estrazione registra l'override E il timeout specificato viene attivato in un sito di chiamata non coperto nello stesso artefatto.

Nessuna modifica a ollama-intern-mcp. Il campo dello schema `tier_budget_ms_override` della versione 2.6.0 è stato introdotto con il rilascio coordinato di R-019; la versione 0.13.1 fornisce l'implementazione lato research-os del client per la fase di estrazione.

### Livello minimo di sicurezza preservato

R-024 è un'aggiunta controllata dall'operatore, non una modifica architettonica. R-002 fino a R-021 rimangono invariati. `accepted_claim_floor` rimane inalterabile. Gli enum chiusi non sono stati modificati (`FailureShape` a 9; `RECOVERY_ACTIONS` a 8; `REGENERATION_REASONS` a 3; `PLANNER_TIMEOUT_SOURCES` a 3; `POLICY_KEYWORDS` a 8; `POLICY_RELEVANT_SOURCE_TYPES` a 1). R-024 aggiunge il nuovo enum chiuso `EXTRACT_TIER_BUDGET_SOURCES` (3 valori) senza toccare alcun enum esistente. Il modello di prompt per l'advisor di recupero AI rimane invariato. L'architettura MCP è stata estesa in modo incrementale. La forma dell'espressione regolare di fallback-cause di R-010 è stata preservata. La forma di `extract --resume / --progress` di R-015 è stata preservata (R-024 aggiunge una NUOVA riga di log su stderr + NUOVI campi nell'estrazione; il formato del registro esistente + comportamento di salto + forma dell'emissione rimangono invariati).

Regressione con byte identici rispetto alle baseline della versione 0.3.3 per tutti e quattro i pacchetti congelati: **diciannovesima versione consecutiva** in cui ciò è valido. 1630 → 1663 test superati con vitest (+33 test di accettazione sintetici R-024 + 1 guardia sempre attiva; 6 saltati: i test di riproduzione dal vivo sono vincolati alle variabili d'ambiente dell'ambiente di test).

### Cosa NON afferma la versione 0.13.1

- Prontezza per la versione 1.
- Esito del gate operator-aloneness della versione 0.6. L'impostazione della versione 0.6 segue R-023 (impostazione per l'individuazione delle fonti); la versione 0.13.1 è un prerequisito per la chiusura della traccia C, non una prova.
- Slice di ammissibilità 1. Vincolato al superamento della fase 0.6.
- Candidati differiti della versione 0.13.x (F-2 R-009 divergenza audit↔estrazione; F-3 latenza del passaggio di consegne tra collaboratori; F-4 R-017 ristrettezza delle POLICY_KEYWORDS).

Consulta [CHANGELOG.md](CHANGELOG.md) per la voce completa del rilascio.

## In precedenza: versione 0.13.0 — Fase di finalizzazione (R-019 + R-020 solo D + R-021)

La versione 0.13.0 chiude la fase di smistamento dei blocchi di finalizzazione avviata dopo che l'esecuzione della versione 0.4 su `@mcptoolshop/research-os@0.12.1` ha restituito **PASS_WITH_CONDITIONS, non autorizzazione completa**, tramite il percorso D (fase di smistamento multi-blocco, distinta dal percorso C con patch denominate). Tre blocchi di finalizzazione indipendenti in tre livelli diversi della pipeline; tre controlli denominati indipendenti che, insieme, sbloccano la sintesi del testo, la superficie di recupero del cluster no_answer e la modalità automatica della mappa delle contraddizioni. Il livello minimo di sicurezza e le superfici di copertura-recupero delle versioni 0.10 / 0.11 / 0.12 / 0.12.1 rimangono intatti; nessuna modifica agli enum chiusi; nessuna modifica alle superfici che causerebbe problemi di compatibilità.

> **L'esecuzione della versione 0.4 dimostra che l'accettazione sintetica può convalidare il funzionamento, mentre la riproduzione dal vivo falsifica il meccanismo di destinazione.**
> **La versione 0.13 affronta il controllo del runtime per la finalizzazione: R-019 sblocca il livello interno del budget della fase MCP; R-020 presenta un rifiuto onesto del cluster no_answer con azioni di recupero; R-021 sblocca il livello RPC della modalità automatica della mappa delle contraddizioni.**

Il gate operator-aloneness della versione 0.5 viene eseguito sulla versione 0.13.0 pubblicata in una sessione separata. Lo Slice di ammissibilità 1 rimane **non autorizzato** fino al superamento della fase 0.5.

### Cosa puoi eseguire

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

### Novità

**R-019: configurazione interna del budget per livello di MCP.** Il flag `--planner-timeout-ms <N>` di R-018 (e la variabile d'ambiente `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`) ora viene passato attraverso il planner/drafting/verifier fino a `ollama_extract.tier_budget_ms_override`, raggiungendo `runWithTimeoutAndFallback` in `ollama-intern-mcp/src/guardrails/timeouts.ts:61`. Il meccanismo di timeout per livello che ha causato l'errore della ripetizione v0.4 (`elapsed=15018ms budget=15000ms`) ora rispetta direttamente il budget specificato dall'operatore. Il wrapper R-018 viene mantenuto come barriera esterna contro i blocchi dovuti a promesse non risolte (i wrapper per modalità di errore ortogonali possono effettivamente intercettare questi problemi). Richiede `ollama-intern-mcp@>=2.6.0`; le versioni precedenti ignorano silenziosamente il nuovo campo dello schema (il wrapper R-018 continua a funzionare al suo livello originale, garantendo una degradazione controllata).

**R-020 (solo D): superficie di ripristino per `no_answer_cluster`.** Quando il planner rifiuta di assegnare il ruolo "risposta" a qualsiasi affermazione accettata, l'errore ora viene segnalato direttamente in `recovery_actions[]` (`narrow_section_purpose` + `add_on_topic_sources`) in `section-synthesis.json`, un blocco markdown renderizzato `## Recovery actions` in `section-synthesis.md` (con intestazione action_id + testo "perché" + blocco di codice fenced command_hint) e un suggerimento su stderr a riga singola (`[synth] no_answer_cluster — vedere il blocco "Recovery actions" in section-synthesis.md per i passaggi da intraprendere`). L'elenco delle azioni è una singola fonte di verità condivisa con il percorso di ripristino del grafico delle azioni; non ci sono discrepanze tra i percorsi dei comandi autonomi e quelli dell'errore inline. **La regolazione del prompt del planner di R-020 (metà A) è stata tentata e annullata** — la prima iterazione ha prodotto una sintesi errata silenziosa (il modello linguistico ha fabbricato risposte a effetto nullo da affermazioni a effetto positivo su casi di test avversari; il verificatore ha considerato l'inversione della negazione come "affidabile"); la BARRIERA RIGIDA della seconda iterazione non ha sovrascritto l'allucinazione. In base alla regola dell'operatore di una singola iterazione, il prompt e i 3 file di test con versione v3 sono stati ripristinati; `PROSE_PROMPT_VERSION` rimane a `section-prose-v3`. La dottrina è stata rafforzata: la riproduzione strutturale in diretta può avere successo anche se il contenuto sintetizzato è errato silenziosamente; è necessaria un'ispezione manuale della prosa sui casi di test avversari per rilevare l'inversione della negazione/ambito/predicato.

**R-021: timeout del blocco in modalità automatica per la mappa delle contraddizioni + fallback euristico + avanzamento visibile.** Nuovo `--auto-mode-pair-timeout-ms <N>` (valore predefinito 90000; ridotto dal valore hardcoded di 120 secondi precedente a R-021 dopo aver misurato il tempo di riscaldamento su v0.4 con hermes3:8b: minimo 6,2 s, mediana 8,4 s, massimo 8,8 s → il valore predefinito di 90 s offre un margine di almeno 81 s). Nuovo `--auto-mode-fall-through-after-n-timeouts <N>` (valore predefinito 5; soglia di errore consecutivo per il fallback euristico automatico; le classificazioni `type:none` ripristinano il contatore). Variabili d'ambiente corrispondenti. Nuova riga di inizio stdout (`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`) emessa a ogni invocazione — sempre visibile, funziona anche in contesti non TTY. L'emissione forzata dell'evento di trigger del fallback su stderr aggira il gating TTY / `--progress` perché l'operatore deve vedere il cambio di modalità. Nuovo blocco markdown `## Auto-mode fall-through` in `contradictions.md` quando viene raggiunta la soglia. Le ripetizioni euristiche vengono eseguite solo sulle coppie non elaborate (nessuna riclassificazione duplicata delle coppie per cui il modello linguistico ha già completato l'elaborazione).

### Nota sull'architettura

R-019 attraversa il confine tra research-os ↔ ollama-intern-mcp. Research-os passa `tier_budget_ms_override` nello schema `ollama_extract`; ollama-intern-mcp v2.6.0 lo rispetta all'interno della barriera interna. L'infrastruttura era già presente; v2.6.0 ha fornito il punto di ingresso lato client; v0.13.0 fornisce la configurazione lato client di research-os. Il wrapper `Promise.race` di R-018 viene mantenuto perché protegge da una modalità di errore ortogonale (blocchi dovuti a promesse non risolte — i wrapper possono intercettare questi problemi; i payload strutturati con `isError:true` in un budget interno che il wrapper non può raggiungere rientrano nell'ambito di R-019).

R-021 è solo per research-os. La modalità automatica della mappa delle contraddizioni NON passa attraverso ollama-intern-mcp — chiama direttamente l'API HTTP di Ollama `/api/chat`. Nessun trasporto MCP nella catena; nessuna configurazione `tier_budget_ms_override`; nessun wrapper R-018. Il protocollo di avvio con le quattro leggi fondamentali ha rilevato un errore nel processo di avvio di R-021 prima che venisse scritto qualsiasi codice di correzione: il processo di avvio indicava "livello RPC MCP"; la fase A di lettura lo ha falsificato.

### Livello minimo di sicurezza preservato

R-019 + R-020 (solo D) + R-021 sono aggiunte controllate dall'operatore, non modifiche architetturali. Da R-002 a R-018, tutto rimane invariato. `accepted_claim_floor` rimane inalterabile. Gli enum chiusi non sono stati modificati (`FailureShape` è 9; `RECOVERY_ACTIONS` è 8; `REGENERATION_REASONS` è 3; `PLANNER_TIMEOUT_SOURCES` è 3; `POLICY_KEYWORDS` è 8; `POLICY_RELEVANT_SOURCE_TYPES` è 1). Il modello di prompt per l'advisor di ripristino basato sull'IA non è stato modificato. L'architettura MCP è stata estesa in modo additivo. La forma dell'espressione regolare di fallback-cause è stata preservata.

Regressione del pacchetto congelato byte-identica rispetto ai valori di riferimento v0.3.3 per tutti e quattro i pacchetti congelati — **diciottesima versione consecutiva** in cui questo si verifica. 1542 → 1630 test vitest superati (+88 tra le tre sezioni; 4 saltati — i test di riproduzione in diretta sono limitati dalle variabili d'ambiente).

### Cosa v0.13.0 NON afferma:

- Prontezza per v1.
- Esito positivo del gate "operatore autonomo" di v0.5. v0.5 viene eseguito su `@mcptoolshop/research-os@0.13.0` in una sessione separata; v0.13.0 è il prerequisito per la finalizzazione, non la prova.
- Ammissibilità Slice 1. Limitato al superamento di v0.5.
- Candidati differiti v0.13.x (F-2 divergenza R-009 audit↔extract; F-3 stagnazione del passaggio di consegne tra colleghi; F-4 ristrettezza di POLICY_KEYWORDS in R-017; A-1 + A-2 risultati lato architetto integrati nella preparazione del gate v0.5).

Consulta [CHANGELOG.md](CHANGELOG.md) per la voce completa del rilascio.

## In precedenza: v0.12.1 — Override del timeout del planner di sintesi (patch per il percorso C)

La versione 0.12.1 è stata una patch con una singola correzione applicata alla versione 0.12.0. Ha introdotto solo R-018, un wrapper per il sistema di ricerca che gestisce i timeout delle chiamate `callTool` del motore di sintesi MCP, controllato da un flag CLI attivabile dall'operatore (`--planner-timeout-ms <N>` in `synth section` e `synth workspace`) e dalla corrispondente variabile d'ambiente (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`). Priorità: flag CLI > variabile d'ambiente > valore predefinito (15000 ms). Il comportamento predefinito viene preservato, con una corrispondenza byte per byte rispetto alla versione 0.12.0.

Questa release è necessaria perché il test v0.4 sull'isolamento dell'operatore rispetto a `@mcptoolshop/research-os@0.12.0` ha restituito **PASS_WITH_CONDITIONS, e non un risultato di livello di autorizzazione** (`operator_aloneness_dst_v0.4`). Il test v0.11 ha superato le condizioni sotto carico; tutte e sei le aree di copertura/recupero della versione 0.12 hanno funzionato correttamente e supportato l'operatore; la copertura con busta sigillata ha raggiunto le soglie di PASS (4/5 SUPPORTED + 1 PARTIAL obbligatori; 2/3 SUPPORTED + 1 PARTIAL per i moderatori; 0/3 trappole; 0/5 guasti materiali innescati); tutti gli indicatori di contaminazione sono risultati HARMLESS. L'unico caso di errore è stato la finalizzazione: il motore di sintesi ha riscontrato `TIER_TIMEOUT` ripetutamente a circa 15010 ms, rispetto al budget di 15 secondi per il livello Instant, senza che l'operatore potesse intervenire in modo documentato. Le informazioni sulle sezioni erano conformi alle specifiche della busta; il pacchetto semplicemente non è riuscito a raggiungere la fase finale.

**Disposizione del percorso C** (nuovo modello ottenuto nella versione 0.4): quando la sessione B identifica un singolo meccanismo di errore con un percorso di patch esplicito E la copertura della busta raggiunge le soglie di PASS E il livello minimo di difesa viene mantenuto E la contaminazione è HARMLESS, la disposizione prevede di rilasciare la patch, rieseguire lo stesso percorso dell'operatore sulla versione con la patch e rivalutare. Non è necessaria una nuova autorizzazione della busta. Non è richiesta l'intervento di un valutatore umano. Non si tratta di un cambiamento architettonico per la versione 0.13.

> **La versione 0.4 dimostra il livello di copertura del sistema Research-OS a livello delle informazioni sulle sezioni.**
> **La versione 0.12.1 deve dimostrare il livello di finalizzazione rimuovendo l'unico collo di bottiglia relativo al timeout del pianificatore, senza indebolire il livello minimo di difesa.**

### Cosa puoi eseguire

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

I valori attivi per il budget sono presenti in `section-synthesis.json` (`planner_timeout_ms` è sempre popolato + `planner_timeout_overridden_by` è presente solo quando viene applicata una modifica), nei metadati di ProseBlock e in stderr (`[synth] planner_timeout_ms=N source=… section=<id>`), che vengono emessi prima della generazione del testo. Il comando `synth section --help` documenta il flag, il valore predefinito, il limite superiore (600000 ms) e l'alternativa tramite variabile d'ambiente. I valori non validi (negativi, zero, non numerici, stringhe con suffissi di unità, > 600000) causano un errore chiaro con un codice di uscita diverso da zero, indicando la superficie + il valore problematico. Non è previsto alcun fallback silenzioso.

### Nota sull'architettura

Il budget di 15000 ms che ha superato il test v0.4 si trova in `ollama-intern-mcp` (`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`), e non nel sistema research-os. Prima della versione R-018, il sistema research-os non applicava alcun timeout del pianificatore; il timeout veniva attivato a livello di server nella policy dei livelli di ollama-intern-mcp. La soluzione introdotta da R-018 conferisce al sistema research-os la propria autorità sul budget tramite un wrapper `Promise.race` attorno alla chiamata `callTool` del MCP, con un valore predefinito pari al numero osservato de facto per il livello Instant (15000 ms), in modo che il comportamento predefinito venga preservato. Il wrapper di R-018 produce errori di tipo `TIER_TIMEOUT` che corrispondono all'espressione regolare `classifyFallbackCause` di R-010 (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`), preservando la visibilità dell'AI advisor sui risultati del percorso predefinito.

### Livello minimo di sicurezza preservato

R-018 è una patch con un controllo operatore limitato, e non un cambiamento architettonico. R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 sono tutti invariati. `accepted_claim_floor` rimane inalterabile. Gli enum chiusi non sono stati modificati (`FailureShape` a 9; `RECOVERY_ACTIONS` a 8; `REGENERATION_REASONS` a 3; `POLICY_KEYWORDS` a 8; `POLICY_RELEVANT_SOURCE_TYPES` a 1). Il modello di prompt per l'AI advisor per il recupero non è stato modificato. L'architettura del MCP è rimasta invariata: `ollama-intern-mcp@^2.4.0` viene mantenuta. R-018 aggiunge `PLANNER_TIMEOUT_SOURCES` (3) come nuovo vocabolario per la gestione dell'operatore, distinto da qualsiasi enum di instradamento del test.

La regressione del pacchetto congelato è identica alle versioni di base della versione 0.3.3 per tutti e quattro i pacchetti congelati: **questa condizione si verifica per la sedicesima release consecutiva**. 1542 → 1586 test vitest superati (+44 test di accettazione R-018).

### Cosa NON afferma la versione 0.12.1:

- Prontezza per la versione 1.
- Risultato del nuovo test v0.4 sull'isolamento dell'operatore. I nuovi test v0.4 vengono eseguiti su `@mcptoolshop/research-os@0.12.1` in una sessione separata; la versione 0.12.1 è un prerequisito per il livello di finalizzazione, e non la prova.
- Admissibilità Slice 1. Dipende dal superamento del test v0.4: la dottrina (livello di difesa PROVATO; livello di copertura SOSTANZIALMENTE PROVATO a livello delle informazioni sulle sezioni; livello di finalizzazione in attesa della versione 0.12.1) rimane il test vincolante.
- Candidati per la versione 0.13 (F-2 divergenza audit↔extract R-009; F-3 latenza del passaggio di consegne tra collaboratori; F-4 ristrettezza delle POLICY_KEYWORDS in R-017). Indipendente dalla finalizzazione.

Consulta [CHANGELOG.md](CHANGELOG.md) per la voce completa del rilascio.

## In precedenza: versione 0.12.0 — Release per la copertura e il recupero

La versione 0.12.0 risolve i problemi relativi al test sull'isolamento dell'operatore della versione 0.3 emersi il 16 maggio 2026 (`operator_aloneness_dst_v0.3`, PASS_WITH_CONDITIONS ma non di livello di autorizzazione). Sei problemi identificati in quattro aree: tre correzioni architettoniche che risolvono le lacune nella copertura che bloccano la versione 0.4 (R-012, R-013, R-014) e tre miglioramenti ergonomici che ottimizzano l'interfaccia dell'operatore su cui il test v0.4 verrà eseguito (R-015, R-016, R-017). La versione 0.3 non è fallita a causa di una regressione delle difese: tutte e cinque le aree di difesa della versione 0.11 hanno funzionato esattamente come previsto, producendo una sintesi pulita e onesta senza contenuti errati e il pacchetto si è stabilizzato su prove reali ma limitate. È fallita perché le stesse difese, pur funzionando correttamente, hanno eliminato la copertura primaria delle fonti di riferimento dalla base dei risultati accettabili. La dottrina ottenuta nella versione 0.3:

> **La versione 0.11 ha reso il sistema sufficientemente sicuro da evitare sintesi errate.**
> **La versione 0.12 lo rende più capace di recuperare la copertura senza indebolire tali difese.**

La tesi: le difese conservative possono prevenire la sintesi silenziosa errata, ma possono anche privare il sistema della copertura necessaria. La versione 0.12 rappresenta la soluzione per il ripristino della copertura. Il livello minimo di difesa della versione 0.11 rimane invariato: ogni superficie da R-007 a R-011 continua a funzionare. La versione 0.12 aggiunge nuovi percorsi di ripristino validi e verificati.

### Cosa puoi eseguire

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

### Le tre modifiche architettoniche (livello minimo di blocco v0.4)

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

### Le tre chiusure ergonomiche (miglioramenti dell'esperienza del gateway v0.4)

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

### Limite legale

Le restrizioni sulle regole del sistema sono state mantenute. `accepted_claim_floor` rimane inalterabile. L'elenco chiuso `FailureShape` non è stato modificato e contiene ancora nove valori. L'elenco `RECOVERY_ACTIONS` non è stato modificato e contiene ancora 8 valori: nessuna nuova azione per l'advisor; l'euristica della forma distinta di R-014 amplia il routing delle azioni esistenti. Il modello di prompt dell'advisor di ripristino AI rimane invariato (i nuovi campi `EvidenceState` sono osservabili nel JSON persistente, ma NON vengono visualizzati nel prompt). Le regole del verificatore di ripristino non sono state modificate. L'architettura MCP è rimasta invariata: `ollama-intern-mcp@^2.4.0` viene utilizzata; nessuna modifica alla forma della chiamata MCP durante l'estrazione. L'avviso di R-017 è puramente informativo e NON influisce sulla decisione del gateway, sul completamento o sulla pubblicazione del sistema. Tutte le difese delle versioni 0.10 e 0.11 sono state mantenute; il livello minimo di difesa rimane tale e la versione 0.12 si basa su questo.

La regressione del sistema congelato è identica alle baseline della versione 0.3.3 per tutti e quattro i sistemi congelati: **quindicesima versione consecutiva** in cui ciò avviene (v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12).

### Cosa NON afferma la versione 0.12.0

- Prontezza per la versione 1.
- Decisione del gateway sull'isolamento dell'operatore della versione 0.4. La versione 0.4 viene eseguita rispetto a npm `@mcptoolshop/research-os@0.12.0` in una sessione separata.
- Sezione di ammissibilità 1. Validata con il PASS della versione 0.4: la soglia della dottrina della versione 0.3 (isolamento di livello di difesa DIMOSTRATO; isolamento di livello di copertura NON ancora) rimane il test bloccato.
- Un miglioramento rispetto agli strumenti di ricerca basati su cloud.
- Un modello completo per la calibrazione dei revisori fidati.

La versione 0.12.0 è un prerequisito per la versione 0.4 del gateway sull'isolamento dell'operatore, non una prova.

Consultare [CHANGELOG.md](CHANGELOG.md) e l'esempio di override rivolto all'operatore disponibile su [`examples/source-card-override.example.json`](examples/source-card-override.example.json).

## In precedenza: versione 0.11.0 — Seconda versione con correzioni sull'isolamento dell'operatore

La versione 0.11.0 ha risolto le condizioni di errore del gateway sull'isolamento dell'operatore della versione 0.2: allineamento della riparazione dell'ambito/confine (R-007), verifica della pertinenza dell'URL al momento della scoperta (R-008), difesa contro la contaminazione dei contenuti sorgente accoppiati durante l'estrazione e nei livelli di analisi del frame (R-009 + R-011) e visibilità della causa di fallback dell'advisor di ripristino (R-010). La protezione dei contenuti sorgente a tre livelli (R-008 all'ammissione + R-009 all'estrazione + R-011 nell'analisi del frame) è stata implementata qui. Consultare [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md).

## In precedenza: versione 0.10.0 — Versione con correzioni sull'isolamento dell'operatore

La versione 0.10.0 ha risolto le condizioni di errore del gateway sull'isolamento dell'operatore della versione 0.1 emerse il 2026-05-15 (`operator_aloneness_dst_v0.1`, FAIL): allineamento del routing di ripristino (R-002), CLI per la riparazione dell'ambito (R-001), rafforzamento dell'audit della scheda sorgente accoppiata (R-003 + R-005) e stato di raccolta onesto (R-004). Consultare [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

## In precedenza: versione 0.9.0 — Arco dell'artefatto del prodotto

La versione 0.9.0 ha trasformato la struttura delle evidenze della versione 0.8 in artefatti utili per l'operatore: sintesi di prosa a livello di sezione (`synth section`), sintesi parziale del sistema (`synth pack --partial`) e advisor di ripristino valido (`recover pack`). Consultare [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## In precedenza: versione 0.8.0 — Ripristino dell'architettura

La versione 0.8.0 ha riconnesso research-os al suo substrato LLM locale dichiarato (`ollama-intern-mcp@^2.4.0`) per l'estrazione delle affermazioni, ha aggiunto l'applicazione dell'irrilevanza della sezione all'interno del frame e ha aggiunto la sintesi di citazioni di evidenze a livello di sezione per le sezioni idonee al gateway nei sistemi che richiedono riparazione. Consultare [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Stato

**v0.11.0 — Seconda versione con correzioni per il problema dell'isolamento dell'operatore** — pubblicata su npm come `@mcptoolshop/research-os@0.11.0`, 15 maggio 2026. La v0.11.0 risolve le condizioni di errore del controllo sull'isolamento dell'operatore della v0.2 (`operator_aloneness_dst_v0.2`, PASS_WITH_CONDITIONS non a livello di autorizzazione il 15 maggio 2026) tramite un ciclo di correzione in quattro fasi che copre cinque problemi identificati. **R-007** (allineamento dell'ambito/confine per la correzione): `claim repair-scope --auto` ora riempie SIA `scope` CHE `not` quando entrambi sono nulli in una richiesta sostanziale al momento della correzione, risolvendo il problema del ciclo infinito della v0.2 in cui la correzione R-001 della v0.10 riempiva solo `scope` e `claim triage` riclassificava le richieste corrette come `needs_scope_repair`. Il modello di confine basato su template rispecchia la forma di degradazione del template dell'ambito. Il registro in sola aggiunta ora registra `applied_not` insieme a `applied_scope`. **R-008** (difesa contro URL generati erroneamente): `discover run` ora recupera il `<title>` di ciascun URL candidato (limite: corpo di 64 KB, timeout di 5 secondi, concorrenza a 4 vie) e calcola la sovrapposizione deterministica delle parole chiave rispetto alla query di ricerca. Ogni candidato ottiene un blocco `relevance` (`verified | unverified | topic_mismatch`); `approve --top N` mette in quarantena `topic_mismatch`; l'operatore può annullare tramite `approve --candidate <id>`. Risolve il caso della v0.2 in cui `llm-heuristic` restituiva 3 URL PMC reali che puntavano a documenti completamente non correlati su cancro/biochimica/linfoma HIV. **R-009** (protezione dell'identità dell'estrattore): nuova gravità della scheda sorgente `source_identity_mismatch` (ERRORE GRAVE) quando il `card.title` emesso dall'estrattore non corrisponde all'HTML `<title>` recuperato. Risolve il caso di "ratti e clonidina" della v0.2. Riutilizza l'helper di sovrapposizione di R-008; annullamento tramite `clear_severities[]`. **R-011** (precontrollo del contenuto sorgente per la valutazione del frame): nuova ragione di esclusione del frame `source_content_mismatch`. Il valutatore del frame ora calcola una firma del contenuto sorgente una volta per sorgente ed esegue un precontrollo deterministico prima della chiamata al valutatore LLM; se il risultato è inferiore alla soglia, la chiamata LLM viene interrotta e viene contrassegnato `frame_excluded: true`. Risolve il caso della v0.2 in cui 11 richieste derivate da documenti sul cancro con testo formattato DST sono state accettate dal valutatore LLM. **R-010** (ripristino della visibilità del fallback MD): nuova enumerazione chiusa `FALLBACK_CAUSES` (`tier_timeout | mcp_error | retry_exhausted`) + `FallbackTiming` opzionale `{ elapsed_ms, budget_ms }` nei metadati di `prose_error`; il ripristino MD ottiene una sezione "Perché l'advisor AI è passato al fallback" + un riepilogo della causa principale. Risolve il problema del gap invisibile TIER_TIMEOUT in JSON-only della v0.2. **Ora è completo il sistema di protezione a tre livelli contro la contaminazione del contenuto sorgente** (R-008 ammissione + R-009 estrazione + R-011 valutazione) con una difesa verificata e indipendente su ciascun livello. **Richiede `ollama-intern-mcp@^2.4.0`** (invariato rispetto alla v0.8.0). 1448/1448 test Vitest superati (1344 → 1448, +104 test nel ciclo). **Tutti e quattro i pacchetti congelati verificano byte per byte l'identità rispetto alle baseline della v0.3.3** (undicesima versione consecutiva). **Non è una versione v1. Non è una decisione sul controllo dell'isolamento dell'operatore v0.3** — la v0.3 viene eseguita rispetto a questa versione npm in una sessione separata. Il lavoro sulla dottrina di ammissibilità è vincolato al PASS della v0.3. Consultare [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.10.0 — Versione con correzioni per il problema dell'isolamento dell'operatore** — pubblicata su npm come `@mcptoolshop/research-os@0.10.0`, 15 maggio 2026. La v0.10.0 risolve le condizioni di errore del controllo sull'isolamento dell'operatore della v0.1 (`operator_aloneness_dst_v0.1`, FAIL il 15 maggio 2026) tramite un ciclo di correzione in quattro fasi. **R-001** (`research-os claim repair-scope <section> [--auto | --interactive]`): nuova interfaccia a riga di comando per correggere le richieste il cui campo `scope` è arrivato come `null` dall'estrazione; registro in sola aggiunta `evidence/claim-scope-repairs.jsonl`; nuova azione `repair_claim_scope` in `RECOVERY_ACTIONS` (l'enumerazione chiusa si espande da 7 a 8); l'advisor la presenta come prioritaria quando ≥3 richieste sono in `needs_repair_claims`. **R-002** (instradamento del ripristino): il livello di diagnosi ora legge `gate.json:blocking_reasons[]` come superficie di instradamento autorevole prima di passare alla ricerca legacy in `failures[].check` — i segnali di blocco del gate hanno la precedenza sui segnali a valle come `source_card_classification_gap`. **R-003 + R-005** (rafforzamento dell'audit della scheda sorgente, abbinati): nuove gravità `bot_check_or_captcha_detected` (ERRORE GRAVE — segnale composto: marcatori + forma del corpo) e `extraction_suspect_word_count_mismatch` (AVVISO E QUARANTENA — corpo ≤200 parole E estratto ≥800 parole E rapporto ≥4). Annullamento dell'operatore tramite il nuovo campo `clear_severities[]` nello schema del registro di annullamento della v0.4. Blocco opzionale `audit.severity_thresholds` in `research.yaml` per la regolazione per pacchetto. **R-004** (`gather_outcome` onesto): enumerazione a 5 valori su `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`); è scomparsa la frase confusa della v0.1 "Failed (ok HTTP 200)". Consultare [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Ciclo di sviluppo degli artefatti del prodotto** — pubblicato su npm come `@mcptoolshop/research-os@0.9.0`, 14 maggio 2026. La versione v0.9.0 trasforma la base di evidenze della v0.8 in artefatti utili per l'operatore. La sintesi a livello di sezione (`research-os synth section <id>`) produce un Markdown leggibile con pacchetti di supporto a livello di paragrafo che puntano alle affermazioni accettate. La sintesi parziale del pacchetto (`research-os synth pack --partial`) utilizza il testo della sezione (mai le affermazioni grezze) e rivela le sezioni escluse con motivazioni strutturate; un pianificatore deterministico dei pacchetti preselezione i supporti trasversali richiesti quando sono incluse ≥2 sezioni. L'advisor per il recupero legale (`research-os recover pack`) produce indicazioni per l'operatore sulle sezioni bloccate utilizzando un'architettura a quattro livelli: diagnosi deterministica + grafico delle azioni legali + consigli basati sull'IA + verificatore, con tre percorsi dell'advisor (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) e enumerazioni chiuse per nove tipi di errore e sette azioni di recupero. Le indicazioni per il recupero sono incorporate in `partial-pack-synthesis.{md,json}` sotto ciascuna sezione esclusa tramite una proiezione compatta dall'oggetto di recupero canonico (unica fonte di verità tra le superfici autonome e integrate); uno stato discriminato-unione `recovery_unavailable` evidenzia esplicitamente i casi di errore del motore (nessuna omissione silenziosa). Le semantiche di congelamento e pubblicazione rimangono invariate: gli artefatti parziali leggibili non rendono un pacchetto incompleto congelabile o pubblicabile. `accepted_claim_floor` rimane inalterabile; l'advisor per il recupero si rifiuta di raccomandare `apply_waiver` per errori inalterabili. **Richiede `ollama-intern-mcp@^2.4.0`** (invariato rispetto alla v0.8.0). 1266/1266 test Vitest superati (da 1013 a 1266, +253 test nell'arco di sviluppo). **Tutti e quattro i pacchetti congelati verificano l'identità byte rispetto alle baseline v0.3.3** (sesta versione consecutiva). **Non è una versione v1.** La v0.9.0 rende reale il livello degli artefatti; la preparazione per la v1, l'autonomia dell'operatore con un nuovo pacchetto, un modello di revisione affidabile e un obiettivo di miglioramento rispetto alla baseline cloud non sono inclusi in questa versione. Consultare [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Recupero dell'architettura + Attualità delimitata dal frame** — pubblicato su npm come `@mcptoolshop/research-os@0.8.0`, 12 maggio 2026. La v0.8.0 è una versione incentrata sul recupero dell'architettura: research-os ora utilizza `ollama-intern-mcp@^2.4.0` come substrato locale per l'estrazione delle evidenze, al fine di ottenere le affermazioni (in precedenza, il README dichiarava la dipendenza, ma il codice aveva stub interni diretti a Ollama che la aggiravano fin dallo scaffolding della v0.1; la v0.8.0 elimina questa discrepanza). Aggiunte: substrato client MCP (`OLLAMA_INTERN_MCP_BIN` nell'ambiente + individuazione tramite PATH + ciclo di vita StdioClientTransport); critico delle evidenze per sezione, per affermazione, tramite `ollama_extract` con schema a 4 etichette (`supports_section` / `off_topic` / `background_only` / `source_chrome`); nuova `ReviewDecision` `frame_excluded` (la revisione salta l'LLM per le affermazioni escluse, emette una sintetica ClaimReview); `ClaimSchema` ottiene `frame_excluded` + `frame_exclusion_reason` (enumerazione a 4 valori che include `critic_unavailable` per errori nello stato del sistema) + `frame_exclusion_rationale`; sintesi delle evidenze con ambito di sezione tramite `synth section <id>` per le sezioni idonee al gate nei pacchetti che richiedono riparazioni (indice delle citazioni delle evidenze: ID affermazione → asserzione → estratto dell'evidenza → URL della fonte — NON testo narrativo); il gate onora la cronologia degli override della fonte tramite `getEffectivePublisher` / `getEffectiveSourceType` (assorbito dalla versione 0.7.1); `DEFAULT_WINDOW_CHARS` predefinito da 5000 a 3000 (dimensionato per hermes3:8b con un contesto di lavoro di 8K nel profilo `dev-rtx5080`); politica di fallimento parziale invertita sulla chiamata al critico (qualsiasi delle 5 modalità di errore — trasporto / analisi / etichetta non valida / motivazione vuota / timeout — per impostazione predefinita imposta `frame_excluded: true` con la motivazione `critic_unavailable`, anziché l'ammissione); semantica di promozione: le affermazioni `frame_excluded` non bloccano la promozione della sezione; il passaggio del lavoro collaborativo mostra `frame_excluded` come un bucket separato da quelli accettati / in riparazione / rifiutati. **Richiede `ollama-intern-mcp@^2.4.0`**. 1013/1013 test Vitest superati (da 901 a 1013, +112 test). **Tutti e quattro i pacchetti congelati verificano l'identità byte rispetto alle baseline v0.3.3.** **Non è una versione v1** — il lavoro di preparazione per la v1 continua; consultare [`docs/roadmap.md`](docs/roadmap.md). Consultare [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Miglioramenti di robustezza tramite test intensivi** — pubblicato su npm come `@mcptoolshop/research-os@0.7.0`, 11 maggio 2026. È stata eseguita una serie di test approfonditi (bug/sicurezza, resilienza proattiva, ottimizzazione dell'interfaccia utente per l'operatore, rifinitura della presentazione) sulla versione v0.6.0. La v0.7.0 include i seguenti miglioramenti: raccolta dati più sicura (tentativo/gestione degli errori per URL + conservazione degli ID delle fonti in corso di elaborazione in caso di errore parziale); indicizzatore resiliente (salto e avviso per record/file/sezione non validi in formato JSONL); gestione strutturata degli errori di ripristino (12 sottoclassi di ResearchOSError con collegamenti al manuale); feedback sullo stato di avanzamento (`--no-progress` / `--progress` con rilevamento automatico del terminale durante la revisione/raccolta dati/confronto dei risultati/pubblicazione); correzioni per migliorare l'usabilità da parte dell'operatore (`pack publish --force`, comando che esegue una sostituzione distruttiva completa, applicabile a 8 elementi con test di regressione; corretto un errore di battitura nel testo del comando `IndexNotBuiltError` e aggiunto un test di registro per il comando; aggiunti collegamenti al manuale per ogni errore nelle 12 sottoclassi di ResearchOSError); miglioramento della sicurezza della catena di approvvigionamento (blocco SHA delle azioni CI + impostazione predefinita `permissions: contents: read`); copertura degli ecosistemi Dependabot `/site` e `github-actions`; due nuove pagine del manuale (`recovery.md`, `known-limitations.md`); rifinitura della presentazione (revisione della formulazione, riordino della barra laterale, avvisi `:::caution` per le azioni distruttive). 901/901 test superati con successo (da 713 a 901, +188 test). **Tutti e quattro i pacchetti congelati vengono verificati byte per byte rispetto alle versioni di riferimento v0.3.3.** **Non è una versione v1** — il lavoro per preparare la versione v1 continua; vedere [`docs/roadmap.md`](docs/roadmap.md) e [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md). Consultare [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — pubblicato su npm come `@mcptoolshop/research-os@0.6.0`, 10 maggio 2026. La v0.6.0 conclude l'Esperimento 6 con prove di affidabilità del revisore: research-os può ora produrre una base di riferimento canonica riproducibile e attribuibile. Include: opzioni deterministiche per il revisore nel flusso di lavoro di revisione (`review_profiles.<name>.reviewer_options` in `research.yaml`); compatibilità con le versioni precedenti dello schema per gli artefatti congelati pre-v0.3.3 (F-53); l'output della revisione rivela le condizioni di campionamento direttamente nei file `review.json` e `review.md` (F-54); impegno di una ricevuta aggregata deterministica canonica (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **Nessuna base di riferimento affidabile ammessa.** `hermes-two-pass-deterministic=failed` (lacuna nelle capacità del modello strutturale nel vocabolario decisionale, non nella varianza). **Hermes non viene promosso a `trusted_baseline`.** Il risultato positivo è il meccanismo, non una semplice ricevuta. Nessuna modifica alle regole di controllo, congelamento o sintesi. Tutti e quattro i pacchetti congelati vengono verificati byte per byte. 713/713 test superati con successo. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — pubblicato su npm come `@mcptoolshop/research-os@0.5.0`, 10 maggio 2026. La v0.5.0 rende la calibrazione del revisore persistente. Un profilo di revisore non è considerato affidabile solo perché è stato eseguito una volta; ottiene uno status attraverso ricevute strutturate di test con errori simulati e aggregazione su più esecuzioni. Include: schema strutturato per le ricevute di calibrazione (`seeded-v1.{json,md}`, validato con Zod, quattro etichette di stato); strumento per l'esecuzione su più iterazioni (`--runs <n>`, isolamento per ogni esecuzione, barre PASS/FAIL basate sulla mediana, declassazione in caso di errori ricorrenti); barra del vocabolario decisionale consapevole dell'architettura; ricerca delle ricevute relative al pacchetto in `review-promote`. **Nessuna base di riferimento affidabile ammessa:** `hermes-two-pass=failed` (aggregato, 3 esecuzioni), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. research-os può ora rifiutare di considerare affidabile un profilo di revisore quando ripetuti test con errori simulati non supportano l'affidabilità. **Nessuna modifica alle regole di controllo, congelamento o sintesi. Tutti e quattro i pacchetti congelati vengono verificati byte per byte.** 671/671 test superati con successo. Consultare [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — pubblicato su npm come `@mcptoolshop/research-os@0.4.0`, 10 maggio 2026. La v0.4.0 rende l'identità della fonte persistente. Regole deterministiche per il tipo di origine gestiscono la maggior parte dei casi ripetibili, i registri di override preservano le correzioni dell'operatore durante la nuova raccolta dati e `source-card audit` sostituisce i controlli ad hoc con un'interfaccia CLI completa. Include: classificatore centralizzato del tipo di origine (Componente B — `classifySourceType`, 11 fornitori canonici, `source-type-rules.json`); registro di override della scheda sorgente (Componente A — `source-card-overrides.jsonl`, sottocomandi `validate` e `list`); e CLI per l'audit della scheda sorgente (Componente D — `research-os source-card audit --pack <dir>`, 7 tipi di risultati, artefatti JSON + Markdown, `--apply --from` percorso di applicazione). F-46: correzione estetica; i manifesti del pacchetto ora riportano la versione binaria attiva anziché la versione congelata in `research.yaml` durante l'inizializzazione del pacchetto. **Nessuna modifica alle regole di controllo, congelamento o sintesi. Tutti e quattro i pacchetti esistenti vengono verificati byte per byte.** 620/620 test superati con successo. Consultare [CHANGELOG.md](CHANGELOG.md) e la [pagina del manuale sull'audit della scheda sorgente](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — pubblicato su npm come `@mcptoolshop/research-os@0.3.3`, 10 maggio 2026. Include miglioramenti nella chiarezza della semantica del controllo ottenuti con il Pacchetto 3 (durata dell'esportazione/runtime di Godot, pacchetto n. 3 di 3 dell'Esperimento 3). L'output del controllo ora include i conteggi per sezione e per editore insieme ai conteggi a livello di pacchetto (F-43); `no_source_cluster_monopoly` è stato riformulato da un avviso a una diagnostica informativa (F-41). **Il comportamento di superamento/fallimento non è cambiato; i pacchetti congelati esistenti vengono verificati byte per byte.** 570/570 test superati con successo. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — pubblicato su npm come `@mcptoolshop/research-os@0.3.2`, 9 maggio 2026. Include la gestione normalizzata delle richieste accettate, tenendo conto dell'ammissione tramite `pack publish`. Il controllo di uguaglianza rigoroso tra `claim-reviews.jsonl` e `pack-audit.json::accepted_claims` è stato sostituito da un confronto basato su insiemi efficaci: le richieste accettate sono identificatori univoci (`claim_id`) la cui decisione più recente sulla revisione canonica è `accepted_for_synthesis` (la decisione più recente prevale per ogni `claim_id`). I pacchetti congelati, il cui conteggio delle verifiche legacy differisce dall'insieme effettivo, ora vengono ammessi con un avviso anziché essere rifiutati; il file di verifica legacy viene preservato integralmente (Legge 15), mentre il manifesto dell'archivio riflette il conteggio normalizzato. Il rifiuto rimane valido per gli `claim_id` fantasma, le decisioni duplicate incompatibili e i criteri non idonei alla sintesi. Ottenuto con l'Esperimento 3, sessione XRPL pack K: la pubblicazione del pacchetto è stata rifiutata a causa di una reale discrepanza tra il ledger di chiusura. (La sezione 07 aveva 24 righe `accepted_for_synthesis`, ma solo 19 `claim_id` univoci a causa della sovrapposizione delle finestre dei revisori). 558/558 test superati con vitest. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — pubblicato su npm come `@mcptoolshop/research-os@0.3.1`, 9 maggio 2026. Include esenzioni di ambito settoriale per le fonti (`primary_source_waiver.section_waivers[]`) e l'approvazione da parte del revisore, in modo che un'esenzione a livello di sezione per `source_cluster_monopoly` diventi una nota visibile anziché indirizzare automaticamente tutte le richieste a `needs_source_repair`. Ottenuto con l'Esperimento 3, sessione XRPL pack 2: le sezioni del protocollo canonico (catene a fondamento singolo, specifiche API walled-garden, documenti di enti normativi) hanno invertito l'assunzione che la diversità degli editori sia un indicatore della qualità della verità. Successivamente, 540/540 test superati con vitest. Consultare [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Esenzioni di ambito settoriale per le fonti:** utilizzarle quando la diversità degli editori è strutturalmente incompatibile con la fonte di verità della sezione, e non semplicemente quando una sezione non è riuscita a trovare abbastanza fonti. `reason` applicato tramite schema + `compensating_controls[]` non vuoto. La politica del pacchetto `primary_source_waiver_allowed: false` blocca sia le esenzioni a livello di pacchetto che quelle a livello di sezione. L'alternativa a livello di pacchetto pre-v0.3.1 (`min_independent_publishers: 0`) non è più supportata; i pacchetti congelati esistenti rimangono validi in base alle loro ricevute attuali. Consultare [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) e il [manuale operativo per research-packs](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — pubblicato il 9 maggio 2026. Include il flag `--detector <auto|heuristic|ollama-intern>` in `contradict map` (correzione del blocco della catena F-09 dall'Esperimento 3, sessione 1, pacchetto XRPL). Successivamente, 527/527 test superati con vitest. La selezione del rilevatore è ora una scelta esplicita dell'operatore anziché un processo basato su variabili di ambiente dipendenti dallo stato; la modalità viene annunciata in modo visibile ad ogni esecuzione. Consultare [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — pubblicato il 9 maggio 2026. Include `research-os pack publish` (Esperimento 2) e la correzione del predicato di prontezza per Pattern 2. Successivamente, 515/515 test superati con vitest. Consultare [CHANGELOG.md](CHANGELOG.md). I pacchetti congelati vengono esportati nell'archivio canonico `research-packs` con un singolo comando; il contratto di ammissione è applicato dal codice, non da una checklist. Consultare [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — pacchetto dogfood congelato l'8 maggio 2026. Il pacchetto in `research-os-packs/research-os-spec/` (repository fratello) ha raggiunto lo stato di congelamento con 296 richieste accettate su 8 sezioni, 17 richieste risolte, 30 richieste modificate dall'operatore, 0 blocchi attivi per la correzione, 0 contraddizioni irrisolte e tutti i criteri con `synthesis_eligible=true`. Sedici leggi cumulative fondamentali. Consultare [`docs/dogfood-proof.md`](docs/dogfood-proof.md) per le sette scoperte e gli identificatori della ricevuta di congelamento.

**Archivio monorepo research-packs:** disponibile all'indirizzo [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) con quattro pacchetti: `research-os-self-dogfood` (v0.1, test dogfood, 296 richieste accettate, 8 sezioni), `comfyui-workflow-durability` (Esperimento 1, 302 richieste accettate, 8 sezioni), `xrpl-creator-token-durability` (pacchetto XRPL #2 dell'Esperimento 3) e `godot-export-runtime-durability` (pacchetto XRPL #3 dell'Esperimento 3). Tutti i pacchetti superano il test `verify-pack.mjs`.

**Esperimento 1 della versione 1 (Durata del flusso di lavoro ComfyUI):** CHIUSO il 9 maggio 2026. Tutte le 8 sezioni in Terminal A, pacchetto congelato, archivio disponibile. Consultare [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) e [`docs/roadmap.md`](docs/roadmap.md).

### Cosa research-os non è (e la v0.12.1 non pretende di essere)

- Non è stato dimostrato che funzioni correttamente quando utilizzato da un singolo operatore su nuove versioni del pacchetto. La versione 0.12.0 ha risolto i problemi riscontrati nella versione 0.3 (è stata verificata la funzionalità in modalità "singolo operatore"; non è ancora stata verificata la copertura, ma questo aspetto è stato migliorato nella versione 0.3); il test della versione 0.4 rispetto alla versione 0.12.0 ha dato come risultato un esito POSITIVO CON CONDIZIONI (non è una funzionalità di livello "autorizzazione") — i requisiti minimi di sicurezza sono stati mantenuti, la copertura è stata verificata in modo sostanziale a livello di sezione e si è riscontrato un singolo punto debole nella fase finale. La versione 0.12.1 corregge questo singolo punto debole (R-018). Il nuovo test della versione 0.4 rispetto a questa versione npm viene eseguito in una sessione separata ed è un prerequisito per la verifica finale.
- Non è stato ampiamente testato da utenti esterni al di fuori delle fasi di prova e dei quattro cicli di test con un singolo operatore. Sono state completate sei prove, tra cui una auto-referenziale e cinque che coinvolgono domini esterni (ComfyUI, XRPL, Godot, calibrazione del revisore, revisore deterministico), oltre ai cicli di test con un singolo operatore delle versioni 0.1 / 0.2 / 0.3 / 0.4, dai quali sono emersi 18 problemi identificati (R-001 fino a R-005 risolti nella versione 0.10.0, R-007 fino a R-011 risolti nella versione 0.11.0, R-012 fino a R-017 risolti nella versione 0.12.0, R-018 risolto nella versione 0.12.1). L'utilizzo su larga scala da parte di operatori esterni è un obiettivo futuro.
- Non si tratta di uno strumento completo per la creazione di pacchetti. La versione 0.12.1 eredita le funzionalità della versione 0.9 relative all'ambito delle sezioni (`synth section`) e all'ambito parziale del pacchetto (`synth pack --partial`), ciascuna con una chiara indicazione dello stato di preparazione del pacchetto. Per la creazione completa del pacchetto è ancora necessario un pacchetto `synthesis_ready` e l'intervento manuale (o tramite Cowork) per definire gli ID delle affermazioni accettate tramite `synth workspace`.
- Non si tratta di una convalida di alcun modello di revisore. La versione 0.12.1 non include, per impostazione predefinita, un profilo di revisore `trusted_baseline`; i risultati della calibrazione sono prove, non una convalida. I risultati della calibrazione esistenti della versione 0.6.0 risalgono a prima dell'architettura MCP 0.8.0 e non sono stati ricalibrati in base al percorso MCP. Consultare la [pagina del manuale sulla calibrazione dei revisori](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Non è esente da artefatti storici nei pacchetti congelati. I pacchetti congelati precedenti alla versione 0.4 contengono `research_os_version: '0.1.0'` a causa di una costante predefinita hardcoded precedente alla versione 0.4; la correzione è stata implementata nella versione 0.4.0, ma i pacchetti congelati precedenti sono immutabili in base alla Legge 15 (vedere [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Non è ancora stata verificata la provenienza su npm. La verifica della provenienza tramite Sigstore è rimandata a una versione futura; verificare i pacchetti npm 0.12.1 tramite package-shasum e il commit di rilascio su GitHub.
- Non rappresenta un vantaggio rispetto all'architettura cloud. Il test del prodotto in `local-first-vs-cloud-research/` della versione 0.7.x ha evidenziato i vantaggi del cloud in termini di leggibilità e carico di lavoro dell'operatore; la versione 0.12.1 non afferma di aver superato questi limiti.

### Limitazioni note

La versione 0.12.1 include tre limitazioni note, visibili agli operatori, che sono state mantenute dalle versioni precedenti. Ognuna di esse è documentata nella [pagina delle limitazioni note del manuale](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) e in [CHANGELOG.md](CHANGELOG.md). Nessuna di esse impedisce il rilascio; tutte hanno un percorso definito per la risoluzione o l'attenuazione.

- **B-E-001: il timestamp della versione del pacchetto congelato precedente alla 0.4 è un artefatto storico.** I pacchetti congelati pubblicati con le versioni da 0.3.3 a 0.6.0 contengono `research_os_version: "0.1.0"` in `pack.manifest.json` e `pack/research.yaml` a causa di una costante predefinita hardcoded precedente alla versione 0.4. La correzione è stata implementata nella versione 0.4.0 (ora lo scaffold importa la variabile `RESEARCH_OS_VERSION`); i pacchetti congelati precedenti sono immutabili in base alla Legge 15. I file JSON all'interno dei pacchetti interessati contengono già le versioni corrette.
- **B-E-004: la verifica della provenienza su npm è rimandata a una versione futura.** Il tarball npm della versione 0.12.1 viene verificato solo tramite package-shasum. La migrazione del flusso di pubblicazione a un workflow CI con sigstore OIDC entrerebbe in conflitto con il principio "traduzione prima della pubblicazione" (TranslateGemma 12B viene eseguito localmente); la migrazione è prevista per una versione futura. Verificare i pacchetti npm 0.12.1 tramite package-shasum e il commit di rilascio su GitHub.
- **B-A-003: la migrazione della versione dello schema dell'indicizzatore è documentata, ma non applicata.** La versione 0.12.1 include un intero `SCHEMA_VERSION` lato scrittura, ma non uno strumento di migrazione lato lettura. In caso di aggiornamento documentato di `SCHEMA_VERSION`, eliminare `.research-os/index.sqlite` e rieseguire `research-os index build --all`. Il pacchetto stesso non è interessato: l'indicizzatore è un livello di accelerazione dei dati + delle affermazioni (Legge 8); la ricostruzione è idempotente.

**Nella versione 0.12.1 non è incluso alcun profilo di revisore `trusted_baseline`.** Si tratta di una scelta intenzionale in termini di affidabilità, non di una lacuna: i risultati della calibrazione nel repository (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) registrano le prove. L'affidabilità si ottiene attraverso ripetuti test di richiamo in caso di errori, non viene data per scontata. Questi risultati risalgono all'architettura MCP 0.8.0 e non sono stati ricalibrati in base al percorso MCP.

## Roadmap per la versione 1.0

La versione 1.0 è uno stato che deve essere raggiunto, non una data di rilascio. Tutti i sei esperimenti sono stati completati (Exp1–Exp6, dal 2026-05-08 al 2026-05-11), ciascuno dei quali ha prodotto un pacchetto di ricerca congelato incluso in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). Il ciclo ha portato alla versione 0.2.0 `research-os pack publish` + Pattern 2 (Esperimento 2), alla versione 0.3.0 con il flag `--detector` (F-09), alla versione 0.3.1 con le esenzioni a livello di sezione (F-10/F-11), alla versione 0.3.2 con la contabilizzazione normalizzata delle affermazioni accettate (F-36), alla versione 0.3.3 con una maggiore chiarezza della semantica dei gate (F-43/F-41), alla versione 0.4.0 con il principio di verità unica (F-27/F-47/F-46), alla versione 0.5.0 con la calibrazione del revisore come contratto di fiducia duraturo (F-48/F-49/F-50) e alla versione 0.6.0 con una base di riferimento deterministica per il revisore (F-53/F-54). La preparazione della versione 1.0 è in corso tramite un ciclo di test a più fasi; l'architettura rimarrà bloccata durante tutto il processo. Il piano completo è disponibile in [`docs/roadmap.md`](docs/roadmap.md).

## Licenza

MIT
