<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Un'interfaccia a riga di comando (CLI) che trasforma un argomento di ricerca in un "**pacchetto di ricerca**" strutturato, ovvero un repository organizzato in cui Claude, Cowork o un sistema simile possono lavorare per ore senza generare risultati errati o superficiali.

## Cos'è

`research-os` è il livello di controllo che interviene tra la richiesta "Voglio ricercare X" e una base di dati strutturata e verificabile. Separa le ipotesi iniziali dalle prove raccolte, l'estrazione dei dati dalle affermazioni verificate, il rilevamento delle contraddizioni dalla loro risoluzione e le decisioni di revisione dalle conclusioni finali. Ogni passaggio viene registrato in un registro immutabile; ogni valutazione di disponibilità è calcolata a partire da questi registri, e non è una semplice affermazione.

Non è un generatore di report. Non è un framework per l'orchestrazione di modelli linguistici di grandi dimensioni (LLM). Non scrive la sintesi per te. Impone le condizioni necessarie per l'inizio della sintesi.

I pacchetti congelati sono archiviati in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) — sono disponibili e includono quattro pacchetti che coprono i sei esperimenti interni conclusi. Consultare [`docs/roadmap.md`](docs/roadmap.md) per la roadmap della versione 1.0.

La versione 0.1 è stata testata in due cicli di "dogfooding". Il primo, che consisteva nella ricerca sulla propria specifica, ha identificato sette errori prima del rilascio della versione 0.1.0, ognuno dei quali ha richiesto una correzione del codice e ha portato all'implementazione di una regola o di un modello di integrazione. Il secondo (Esperimento 1: Durabilità del flusso di lavoro ComfyUI, 11 sessioni, un dominio senza sovrapposizioni lessicali con research-os) è stato completato il 2026-05-09: il pacchetto è stato finalizzato e l'archivio è attivo; l'applicazione della regola 2 è stata completata tramite il commit `22b5dba`. La documentazione del test della versione 0.1 è disponibile in [`docs/dogfood-proof.md`](docs/dogfood-proof.md); la documentazione dell'Esperimento 1 è disponibile in [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). La guida completa è disponibile all'indirizzo: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Installazione

**Requisiti:** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Per i contributori che costruiscono il software partendo dal codice sorgente:

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## Guida rapida

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

> **Nota sull'output di `freeze`.** Il comando `research-os freeze` funziona silenziosamente, analizzando ogni artefatto e calcolando gli hash dei contenuti; non fornisce indicazioni di avanzamento. Su pacchetti di grandi dimensioni, potrebbe richiedere diversi secondi prima di stampare qualsiasi cosa. Al termine, stampa un singolo blocco di risultato (`PASS` / `REFUSED` insieme al percorso della ricevuta). Non interpretare la mancanza di output come un blocco.

> **Avviso su `--force`.** L'opzione `--force` cancella e sostituisce la directory del pacchetto di destinazione. Non conservare file creati manualmente all'interno dell'output del pacchetto generato. Modificare invece gli artefatti originali (dichiarazioni, sorgenti, sintesi) o i file correlati. Contratto completo di accettazione e casi di rifiuto: [`docs/pack-publish.md`](docs/pack-publish.md).

**Per un esempio pratico**, consultare il pacchetto di test `research-os-packs/research-os-spec/`, che contiene tutti gli elementi, le ricevute, le valutazioni, le "impronte digitali" e le registrazioni, tutti memorizzati in registri immutabili. Questo pacchetto ha generato la documentazione `docs/dogfood-proof.md`.

**Richiede [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) in esecuzione localmente** per l'estrazione, la classificazione, la revisione e la scoperta tramite LLM. Il modello predefinito è `hermes3:8b`; è possibile sovrascriverlo impostando la variabile d'ambiente `OLLAMA_INTERN_MODEL=<modello>`. Impostare la variabile `OLLAMA_HOST` se Ollama non è in esecuzione sull'indirizzo predefinito `localhost:11434`.

## Le 16 regole fondamentali

| # | Regola |
|---|-----|
| 1 | Nessuna sintesi prima della verifica delle fonti. |
| 2 | La raccolta di dati è una prova; l'estrazione è un'interpretazione. |
| 3 | I modelli possono interpretare porzioni di testo originale, ma non possono creare nuove prove. |
| 4 | L'estrazione può produrre un eccesso di dati; la sintesi non deve necessariamente includere tutti i dati estratti. |
| 5 | La mappatura delle contraddizioni evidenzia le discrepanze, ma non le risolve, non le sintetizza e non determina quale affermazione sia corretta. |
| 6 | I "gate" decidono se una sezione è idonea per la sintesi. Non eseguono la sintesi né nascondono i fallimenti. |
| 7 | La revisione critica valuta l'integrità della ricerca. Non esegue la sintesi né riscrive le fonti originali. |
| 8 | L'indicizzazione rende la ricerca di informazioni più semplice. Non crea nuove informazioni e non diventa la fonte ufficiale. |
| 9 | Il trasferimento di informazioni a Cowork traduce le istruzioni operative a partire dalle informazioni verificate. Non crea nuove informazioni e non aggira i "gate". |
| 10 | L'area di lavoro per la sintesi organizza le informazioni verificate per Cowork. Non esegue la sintesi e non aggira la modalità di trasferimento. |
| 11 | L'audit del pacchetto raccoglie le informazioni verificate esistenti. Non crea nuove informazioni e non nasconde le prove a livello di sezione. |
| 12 | La scoperta propone nuove piste di ricerca; solo la raccolta di dati produce prove. |
| 13 | Un revisore non è considerato affidabile finché non vengono dimostrate delle lacune e la sua capacità di rilevarle. |
| 14 | L'abbondanza di affermazioni non equivale a qualità della ricerca. Le affermazioni devono essere valutate prima di poter essere considerate per la sintesi. |
| 15 | La funzione "freeze" blocca la ricerca completata e valida. Non completa la ricerca incompleta né trasforma uno stato di "in riparazione" in una prova. |
| 16 | Le eccezioni (waivers) allentano i vincoli sulle fonti; non possono essere utilizzate per fabbricare prove. |

**Legge 3** — il modello linguistico (LLM) non genera mai il testo delle prove. Il sistema "research-os" crea un registro deterministico degli estratti (con ID stabili come `ex_<id_esadecimale_della_fonte>_001`); l'LLM seleziona gli ID degli estratti; "research-os" copia il testo letterale. La classe di errore "parafrasi come citazione" è strutturalmente impossibile.

**Legge 14** — tra l'estrazione e la revisione, "research-os claim triage" elimina le duplicazioni, limita il contributo per fonte e mette in attesa le candidature meno promettenti. Il triage NON modifica il file `claims.jsonl`; le affermazioni messe in attesa rimangono nel registro principale.

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

Ogni passaggio è un comando della riga di comando (CLI). Ogni passaggio scrive su file che possono essere solo aggiunti (append-only). Nessun passaggio sintetizza, risolve o crea nuove verità; questi vincoli sono applicati, non affidati. La revisione accetta, rifiuta o richiede una correzione delle affermazioni candidate; il "gate" utilizza queste decisioni di revisione per calcolare l'"idoneità alla sintesi"; la funzione "freeze" è il blocco finale di integrità che rifiuta di contrassegnare un pacchetto come completato a meno che tutti i livelli non siano d'accordo. Consultare [docs/dogfood-proof.md](docs/dogfood-proof.md) per la prova della catena v0.1, che ne garantisce la coerenza end-to-end.

Questa è l'alternativa strutturale a *ricerca → riepilogo → report dettagliato*. La catena è il prodotto.

## Vocabolario

| Termine | Significato |
|------|---------|
| `research-os` | Il piano di controllo / CLI / gate / legge di orchestrazione (questo repository) |
| `research-pack` | L'artefatto del repository generato per uno sforzo di ricerca |
| `research section` | Un'unità di indagine delimitata all'interno di un pacchetto |
| `research receipt` | Prova che una sezione ha superato i controlli di fonte/affermazione/gate |

## Sicurezza

`research-os` è un'interfaccia a riga di comando (CLI) locale. Legge e scrive file all'interno della directory del pacchetto di ricerca a cui la si indica e, quando si utilizza la funzione "gather", effettua richieste HTTP in uscita per recuperare gli URL delle fonti fornite. Non esegue un server, non accetta connessioni in entrata, non memorizza credenziali né invia dati di telemetria. Nessun segreto viene scritto negli artefatti del pacchetto. Consultare [SECURITY.md](SECURITY.md) per la politica di segnalazione delle vulnerabilità.

## Calibrazione dei revisori

La versione 0.5.0 rende la calibrazione dei revisori duratura. Un profilo di revisore non è considerato affidabile perché
viene eseguito una sola volta; acquisisce uno stato attraverso ricevute strutturate che simulano errori e
aggregazioni di esecuzioni multiple. La versione 0.6.0 aggiunge opzioni deterministiche per i revisori al percorso di revisione di produzione e all'ambiente di calibrazione.

**Nessun profilo è attualmente considerato come `baseline_affidabile`.** Le ricevute standard nel repository mostrano `hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`. Questo è
intenzionale: l'affidabilità si guadagna attraverso prove ripetute di errori simulati, non viene data per scontata.
La ricevuta `hermes-two-pass-deterministic` presenta una lacuna nella capacità del modello strutturale (sono stati prodotti 2/6 tipi di decisione; ne sono richiesti 3/6) che non è un problema di varianza.

Le ricevute di calibrazione si trovano in `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`. Ogni ricevuta registra i risultati PASS/FAIL rispetto a sette criteri, quattro etichette di stato (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`), e indica onestamente cosa il test non può verificare (`needs_contradiction_mapping` non è raggiungibile da `seeded-v1`). Consultare [CHANGELOG.md](CHANGELOG.md).

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

Quando si utilizza l'opzione `--runs <n>`, le ricevute per ogni esecuzione vengono scritte in `<profile>/runs/run-NNN.json` e una ricevuta aggregata (con barre basate sulla mediana e rilevamento di errori ricorrenti) viene scritta in `<profile>/seeded-v1.{json,md}`. La ricevuta aggregata contiene `receipt_kind: 'aggregate'` per distinguerla dalle ricevute di singola esecuzione. La modalità di singola esecuzione (`--runs 1` o omessa) mantiene il comportamento esistente di scrittura diretta.

**Profili di revisori deterministici** — utilizzare `review_profiles.<nome>.reviewer_options` in
`research.yaml` per includere i parametri di campionamento di Ollama come `temperature`, `seed` e altri in ogni istanza di `OllamaInternReviewer` nel percorso di revisione di produzione. Il profilo `hermes-two-pass-deterministic` viene fornito come esempio predefinito. Consultare
[`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) e la
[pagina del manuale sulla calibrazione dei revisori](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Stato

**v1.0.0** — Pubblicata su npm come `@mcptoolshop/research-os@1.0.0` il 11 maggio 2026. La versione 1.0.0 è un rilascio di un contratto affidabile: il flusso di lavoro è stato testato, i possibili errori sono stati documentati e la sintesi rimane basata su evidenze. **research-os non include di default un modello di revisione affidabile.** Include i meccanismi per verificare, rifiutare o accettare condizionatamente i profili dei revisori. Include: un sistema di test a quattro fasi (fasi A: bug/sicurezza, B: resilienza proattiva, C: ottimizzazione per l'utente, D: rifinitura della presentazione) che ha generato 188 nuovi test su 23 file di codice, +14 file di documentazione/sito web, +2 nuovi moduli di supporto (`src/cli/help-topics.ts`, `src/util/progress.ts`); documentazione sulla gestione dei trasferimenti tra domini, basata su due correzioni (A-RE-001: migrazione del chiamante, C2-RE-001: acquisizione tra domini); la stringa `--force` è stata definita in modo univoco a livello di byte in 8 aree, con test di regressione; aggiornamenti ai manuali per la gestione degli errori, specifici per le 12 sottoclassi di `ResearchOSError`; interfaccia statica di recupero `research-os help <topic>` (4 argomenti disponibili); threading TTY-detect per `--no-progress` / `--progress` durante le operazioni di revisione/raccolta dati/confronto/pubblicazione, con semantica di mutex. **Nessun baseline affidabile incluso.** **Tutti e quattro i pacchetti "congelati" verificano l'integrità dei file byte per byte rispetto alle baseline della versione 0.3.3.** 901 test superati su 901. Le limitazioni note sono documentate in [CHANGELOG.md](CHANGELOG.md) e in [`handbook/known-limitations.md`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/): l'etichetta di versione dei pacchetti "congelati" è un artefatto storico (B-E-001), l'attestazione della provenienza npm è stata rimandata alla versione 1.x (B-E-004), la migrazione dello schema dell'indice avviene tramite divulgazione, non tramite migrazione automatica (B-A-003). Consultare [`docs/release-notes/v1.0.0.md`](docs/release-notes/v1.0.0.md) e [`docs/v1-dogfood-swarm-proof.md`](docs/v1-dogfood-swarm-proof.md).

**v0.6.0** — Pubblicata su npm come `@mcptoolshop/research-os@0.6.0` il 10 maggio 2026. La versione 0.6.0 conclude l'Esperimento 6 con prove di affidabilità dei revisori: research-os può ora generare una baseline canonica riproducibile e tracciabile. Include: opzioni deterministiche per i revisori nel percorso di revisione di produzione (`review_profiles.<name>.reviewer_options` in `research.yaml`); compatibilità all'indietro dello schema per gli artefatti "congelati" precedenti alla versione 0.3.3 (F-53); l'output della revisione indica le condizioni di campionamento direttamente nei file `review.json` e `review.md` (F-54); acquisizione aggregata deterministica canonica implementata (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **Nessun baseline affidabile incluso.** `hermes-two-pass-deterministic=failed` (divario strutturale nella capacità del modello nel vocabolario decisionale, non nella varianza). **Hermes non è stato promosso a `trusted_baseline`.** Il vantaggio è il meccanismo, non l'acquisizione riuscita. Nessuna modifica alle regole di gate, freeze o sintesi. Tutti e quattro i pacchetti "congelati" verificano l'integrità dei file byte per byte. 713 test superati su 713. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — pubblicata su npm come `@mcptoolshop/research-os@0.5.0`, 10 maggio 2026. La versione 0.5.0 rende la calibrazione dei revisori più affidabile. Un profilo di revisore non è considerato affidabile solo perché è stato eseguito una volta; acquisisce uno stato attraverso ricevute strutturate che segnalano errori simulati e aggregazioni di esecuzioni multiple. Include: schema di ricevuta di calibrazione strutturato (`seeded-v1.{json,md}`, convalidato da Zod, quattro etichette di stato); meccanismo di esecuzione multi-run (`--runs <n>`, isolamento per esecuzione, barre PASS/FAIL basate sulla mediana, demotivazione per errori ricorrenti); barra di vocabolario decisionale consapevole dell'architettura; ricerca di ricevute relativa al pacchetto in `review-promote`. **Nessuna baseline affidabile accettata:** `hermes-two-pass=failed` (aggregata, 3 esecuzioni), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. research-os può ora rifiutare di considerare affidabile un profilo di revisore quando ripetuti errori simulati non supportano l'affidabilità. **Nessuna modifica alle gate, al freeze o alle leggi di sintesi. Tutti e quattro i pacchetti esistenti verificano l'integrità dei byte.** 671/671 test vitest superati. Consultare [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — pubblicata su npm come `@mcptoolshop/research-os@0.4.0`, 10 maggio 2026. La versione 0.4.0 rende l'identità della sorgente più affidabile. Le regole deterministiche del tipo di sorgente gestiscono la maggioranza ripetibile, i ledger di override preservano le correzioni dell'operatore durante il ri-raccolta, e l'audit della "source-card" sostituisce i controlli di deriva degli script con un'interfaccia CLI dedicata. Include: classificatore centralizzato del tipo di sorgente (Componente B — `classifySourceType`, 11 fornitori canonici, `source-type-rules.json`); ledger di override della source-card (Componente A — `source-card-overrides.jsonl`, comandi `validate` e `list`); e CLI di audit della source-card (Componente D — `research-os source-card audit --pack <dir>`, 7 tipi di rilevamento, artefatti JSON + Markdown, opzioni `--apply --from` per l'applicazione). Correzione cosmetica F-46: i manifest dei pacchetti ora stampano la versione binaria corrente anziché la versione congelata in `research.yaml` durante l'inizializzazione del pacchetto. **Nessuna modifica alle gate, al freeze o alle leggi di sintesi. Tutti e quattro i pacchetti esistenti verificano l'integrità dei byte.** 620/620 test vitest superati. Consultare [CHANGELOG.md](CHANGELOG.md) e la [pagina del manuale dell'audit della source-card](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — Pubblicata su npm come `@mcptoolshop/research-os@0.3.3` il 10 maggio 2026. Include miglioramenti nella chiarezza delle semantiche delle "gate", ottenuti grazie al Pack-3 (durabilità dell'esportazione/runtime di Godot, Esperimento 3, pacchetto n. 3 su 3). L'output della "gate" ora include il publisher e i conteggi specifici della sezione, oltre ai conteggi globali del pacchetto (F-43); la dicitura di `no_source_cluster_monopoly` è stata modificata da AVVISO a diagnostica informativa (F-41). **Il comportamento di successo/fallimento rimane invariato; i pacchetti esistenti vengono verificati byte per byte.** 570 test vitest su 570 superati. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — Pubblicata su npm come `@mcptoolshop/research-os@0.3.2` il 9 maggio 2026. Include una contabilizzazione normalizzata delle richieste accettate, tenendo conto dell'ammissione per la "pubblicazione del pacchetto". Il controllo di uguaglianza rigoroso tra `claim-reviews.jsonl` e `pack-audit.json::accepted_claims` è stato sostituito con un confronto di insiemi, in cui le richieste accettate sono rappresentate da `claim_id` univoci la cui ultima decisione di revisione canonica è "accettata per la sintesi" (l'ultima decisione prevale per ogni `claim_id`). I pacchetti "congelati" la cui cronologia delle revisioni differisce dall'insieme normalizzato vengono ora ammessi con un avviso anziché essere rifiutati; il file di revisione precedente viene conservato integralmente (Legge 15), mentre il manifest dell'archivio riflette il conteggio normalizzato. Il rifiuto rimane assoluto per gli `claim_id` fantasma, le decisioni duplicate incompatibili e le "gate" non idonee per la sintesi. Ottenuto grazie all'esperimento 3 XRPL, pacchetto Session K: la pubblicazione del pacchetto è stata rifiutata a causa di una reale discrepanza nel registro di chiusura (la sezione 07 conteneva 24 righe "accettate per la sintesi", ma solo 19 `claim_id` univoci a causa delle sovrapposizioni negli intervalli di revisione). 558 test vitest su 558 superati. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — pubblicato su npm come `@mcptoolshop/research-os@0.3.1`, 9 maggio 2026. Include eccezioni specifiche per sezione per le fonti (`primary_source_waiver.section_waivers[]`) e un'approvazione da parte del revisore, in modo che una scoperta di "monopolio del cluster di fonti" a livello di sezione diventi un avvertimento visibile anziché indirizzare automaticamente tutte le affermazioni a "needs_source_repair". Ottenuto con l'esperimento 3 del pacchetto XRPL, sessione 2 — le sezioni relative al protocollo canonico (catene con una singola base, specifiche API a "giardino chiuso", documentazione di organismi di standardizzazione) hanno invertito l'assunzione che la diversità degli editori sia un indicatore della qualità della verità. 540/540 test vitest superati. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Eccezioni specifiche per sezione per le fonti** — Utilizzarle quando la diversità degli editori è strutturalmente incompatibile con la fonte di verità della sezione, non quando una sezione semplicemente non è riuscita a trovare abbastanza fonti. Schema con `reason` (motivo) e `compensating_controls[]` (controlli compensativi) obbligatori. La policy del pacchetto `primary_source_waiver_allowed: false` blocca sia le eccezioni a livello di pacchetto che quelle specifiche per sezione. Il workaround precedente alla v0.3.1, `min_independent_publishers: 0`, è ora obsoleto; i pacchetti "frozen" esistenti rimangono validi con le ricevute esistenti. Consultare [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) e il [manuale operativo dei pacchetti di ricerca](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — pubblicata il 2026-05-09. È stato introdotto il flag `--detector <auto|heuristic|ollama-intern>` in `contradict map` (correzione F-09 del blocco della catena proveniente dalla Sessione 1 dell'Esperimento 3, pacchetto XRPL). 527 test vitest superati. La selezione del rilevatore è ora una scelta esplicita da parte dell'operatore, invece di una dipendenza dallo stato e da variabili d'ambiente; la modalità viene visualizzata in modo chiaro ad ogni esecuzione. Consultare [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — pubblicata il 2026-05-09. Sono stati distribuiti il pacchetto `research-os pack publish` (Esperimento 2) e la correzione del predicato di prontezza del Pattern 2. 515 test vitest superati. Consultare [CHANGELOG.md](CHANGELOG.md). I pacchetti con stato finale vengono esportati nell'archivio canonico `research-packs` con un singolo comando; l'accordo contrattuale viene applicato tramite codice, non tramite una checklist. Consultare [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — pacchetto di test interno bloccato l'8 maggio 2026. Il pacchetto in `research-os-packs/research-os-spec/` (repository correlato) ha raggiunto lo stato finale con 296 affermazioni accettate in 8 sezioni, 17 risolte, 30 sovrascritte dall'operatore, 0 blocchi di riparazione attivi, 0 contraddizioni irrisolte, con tutte le condizioni (`synthesis_eligible=true`) soddisfatte. Sono state implementate sedici leggi fondamentali. Consultare [`docs/dogfood-proof.md`](docs/dogfood-proof.md) per i sette risultati e le informazioni sull'identificazione dello stato finale.

**Archivio monorepo dei pacchetti research** — disponibile su [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) con quattro pacchetti: `research-os-self-dogfood` (backfill del dogfooding della versione 0.1, 296 affermazioni accettate, 8 sezioni), `comfyui-workflow-durability` (Esperimento 1, 302 affermazioni accettate, 8 sezioni), `xrpl-creator-token-durability` (pacchetto #2 dell'Esperimento 3) e `godot-export-runtime-durability` (pacchetto #3 dell'Esperimento 3). Tutti i pacchetti superano il test `verify-pack.mjs`.

**Esperimento 1 (Durabilità del flusso di lavoro ComfyUI)** — CHIUSO il 9 maggio 2026. Tutte le 8 sezioni in Terminal A, pacchetto bloccato, archivio disponibile. Consultare [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) e [`docs/roadmap.md`](docs/roadmap.md).

### Cosa la versione 0.3 non è

- Non testato in condizioni reali da utenti esterni, al di là delle fasi di test interni. Sei esperimenti di test interni sono stati conclusi: uno auto-referenziale, cinque relativi a domini esterni (ComfyUI, XRPL, Godot, calibrazione dei revisori, revisore deterministico), ma l'utilizzo su larga scala da parte di operatori esterni è un obiettivo futuro.
- Non è uno strumento per la scrittura di contenuti. Il comando `synth workspace` genera l'ambiente di lavoro strutturato; gli esseri umani (o Cowork) scrivono i testi in base agli ID delle affermazioni accettate.
- Non è una approvazione di alcun modello di revisore. La versione 1.0 non include, di default, un profilo di revisore "affidabile" (`trusted_baseline`); le ricevute di calibrazione sono una prova, non un'approvazione. Consultare la [pagina del manuale sulla calibrazione dei revisori](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Non è privo di elementi storici nei pacchetti "congelati". I pacchetti "congelati" precedenti alla versione 1.0 contengono `research_os_version: '0.1.0'` a causa di un'impronta temporale precedente alla versione 0.4; la correzione è stata implementata, ma i pacchetti storici sono immutabili in base alla Legge 15 (vedere [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Non è dotato di attestazione di provenienza su npm. L'attestazione di provenienza di Sigstore è prevista per la versione 1.x; verificare i pacchetti npm della versione 1.0 tramite package-shasum e l'hash del commit della release su GitHub.

### Limitazioni note

La versione 1.0 include tre limitazioni note visibili agli operatori. Ognuna è documentata nella [pagina del manuale sulle limitazioni note](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) e nel file [CHANGELOG.md](CHANGELOG.md). Nessuna di queste impedisce il rilascio; tutte hanno un percorso di ripristino o di mitigazione definito.

- **B-E-001 — L'indicazione della versione del pacchetto "congelato" precedente alla versione 1.0 è un elemento storico.** I pacchetti "congelati" pubblicati tra le versioni 0.3.3 e 0.6.0 contengono `research_os_version: "0.1.0"` nei file `pack.manifest.json` e `pack/research.yaml` a causa di una costante predefinita precedente alla versione 0.4. La correzione è stata implementata nella versione 1.0 (la scaffold ora importa la versione `RESEARCH_OS_VERSION` corrente); i pacchetti "congelati" esistenti sono immutabili in base alla Legge 15. I file JSON all'interno dei pacchetti interessati contengono già le loro versioni corrette.
- **B-E-004 — L'attestazione di provenienza su npm è prevista per la versione 1.x.** La versione 1.0 del pacchetto npm viene verificata solo tramite package-shasum. La migrazione del flusso di pubblicazione a un workflow CI con sigstore OIDC è in conflitto con la disciplina "traduzione prima della pubblicazione" (TranslateGemma 12B viene eseguito localmente); la migrazione è prevista per la versione 1.x. Verificare i pacchetti npm della versione 1.0 tramite package-shasum e l'hash del commit della release su GitHub.
- **B-A-003 — La migrazione dello schema della versione dell'indicizzatore è documentata, ma non imposta.** La versione 1.0 include un intero `SCHEMA_VERSION` per la scrittura, ma non un componente per la migrazione in lettura. Quando si aggiorna la versione dello `SCHEMA_VERSION`, eliminare `.research-os/index.sqlite` e rieseguire `research-os index build --all`. Il pacchetto stesso non è interessato; l'indicizzatore è un livello di accelerazione sopra le prove e le affermazioni (Legge 8); la ricostruzione è idempotente.

**Non è ammesso alcun profilo di revisore "affidabile" nella versione 1.0.** Questa è una scelta deliberata in termini di fiducia, non una lacuna: le ricevute di calibrazione presenti nel repository (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) registrano le prove. La fiducia si guadagna attraverso ripetuti tentativi di recupero da errori simulati, non viene data per scontata.

## Roadmap per la versione 1.0

La versione 1.0 è uno stato raggiunto attraverso il lavoro svolto, non una data di rilascio. Tutti e sei i test interni (Exp1–Exp6, dal 2026-05-08 al 2026-05-11) sono stati completati, e ciascuno ha prodotto un pacchetto di ricerca che è stato accettato e inserito in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). Il progetto ha raggiunto la versione v0.2.0 con la funzionalità `research-os pack publish` e il Pattern 2 (Esperimento 2), la versione v0.3.0 con il flag `--detector` (F-09), la versione v0.3.1 con le eccezioni a livello di sezione (F-10/F-11), la versione v0.3.2 con la gestione normalizzata delle richieste accettate (F-36), la versione v0.3.3 con una maggiore chiarezza nella semantica dei controlli (F-43/F-41), la versione v0.4.0 con una disciplina rigorosa nella gestione delle fonti (F-27/F-47/F-46), la versione v0.5.0 con una calibrazione dei revisori definita come un contratto di fiducia duraturo (F-48/F-49/F-50), e la versione v0.6.0 con una base di riferimento deterministica per i revisori (F-53/F-54). La preparazione per il rilascio della versione 1.0 è in corso attraverso un processo a più fasi di controllo e ottimizzazione; l'architettura è bloccata durante questo processo. Il piano completo è disponibile in [`docs/roadmap.md`](docs/roadmap.md).

## Licenza

MIT
