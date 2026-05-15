<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.10.0"><img src="https://img.shields.io/badge/version-0.10.0-blue" alt="version 0.10.0"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

`research-os` trasforma la ricerca da un documento generato a un pacchetto di prove consolidate. Preserva la veridicità delle fonti, separa le affermazioni dalla sintesi, impone la preparazione attraverso delle fasi, registra le decisioni dei revisori e le eventuali rinunce, e pubblica un pacchetto le cui affermazioni possono essere tracciate e verificate.

Non richiede che siate fiduciosi nei confronti del modello. Vi fornisce gli strumenti per decidere se il modello, le fonti e la sintesi meritano fiducia.

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

**Richiede [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) in esecuzione localmente** per l'estrazione, la classificazione, la revisione e la scoperta di modelli linguistici di grandi dimensioni (LLM). Il server MCP viene rilevato tramite la variabile d'ambiente `OLLAMA_INTERN_MCP_BIN` o PATH. Il modello predefinito è `hermes3:8b`; è possibile sovrascriverlo con `OLLAMA_INTERN_MODEL=<modello>` (o tramite l'opzione `--model <nome>` per ogni chiamata). Impostare `OLLAMA_HOST` se Ollama non è in esecuzione sull'indirizzo predefinito `localhost:11434`.

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

## Nuovo nella versione v0.10.0 — Rilascio per la correzione dei problemi di isolamento degli operatori

La versione v0.10.0 risolve le condizioni di errore del "gate" di isolamento degli operatori della versione v0.1, riscontrate il 15 maggio 2026 (`operator_aloneness_dst_v0.1`, ERRORE). Quattro componenti di correzione sono stati implementati: allineamento del percorso di ripristino, interfaccia a riga di comando (CLI) per la correzione dell'ambito, rafforzamento dell'audit delle schede sorgente e acquisizione dello stato. Il "gate" v0.1 è fallito perché un operatore esterno si è scontrato con tre problemi indipendenti: il sistema di ripristino ha suggerito un percorso di sblocco errato, non esisteva una CLI per correggere le richieste con `scope=null`, e l'audit della scheda sorgente ha rilevato una scheda COVID-19 contraffatta estratta da un frammento di 1035 byte del bot-check di APA Incapsula. La versione v0.10.0 risolve questi problemi.

### Cosa è possibile eseguire

```sh
research-os claim repair-scope <section-id> [--auto | --interactive]
                                              # fix claims that arrived with scope=null
research-os recover pack                       # advisor now reads gate.blocking_reasons[] first
research-os source-card audit                  # severities now include bot-check + word-count quarantine
```

### L'area di intervento per la correzione

```
gate blocked  →  recover diagnose (now gate-routed)  →  recover advise (repair_claim_scope action)
              ↓
              claim repair-scope (new CLI; auto or interactive)
              ↓
              re-run review + gate; claims promote without hand-editing claims.jsonl
```

A monte dell'estrazione delle richieste, l'audit della scheda sorgente ora mette in quarantena i frammenti di bot-check/CAPTCHA (`bot_check_or_captcha_detected`, ERRORE GRAVE) e le fonti di bassa qualità/alta estrazione (`extraction_suspect_word_count_mismatch`, AVVISO E QUARANTENA). Gli operatori possono sovrascrivere queste impostazioni tramite il nuovo campo `clear_severities[]` nel registro esistente per la sovrascrittura della scheda sorgente (versione v0.4).

L'avanzamento dell'acquisizione ora mostra un'enumerazione `gather_outcome` con 5 valori (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`) in ogni ricevuta di acquisizione. La frase errata della versione v0.1 `"Failed (ok HTTP 200)"` è stata rimossa; i file PDF ora vengono segnalati come `extraction_skipped`, non come `Failed`.

### Confine delle regole

L'area di intervento per la correzione è incrementale. Le regole fondamentali sono preservate: `accepted_claim_floor` rimane irrinunciabile; il sistema di consulenza per il ripristino continua a rifiutare la raccomandazione di `apply_waiver` per i fallimenti irrinunciabili. L'enumerazione `FailureShape` chiusa non è stata modificata; la versione R-002 aggiunge solo il routing dello stato del "gate" alle nove forme esistenti. `RECOVERY_ACTIONS` aumenta da 7 a 8 valori chiusi (`repair_claim_scope` è stato aggiunto). La quarantena della gravità non promuove automaticamente oltre il "gate" di audit senza una sovrascrittura esplicita dell'operatore (il nuovo campo `clear_severities[]` rappresenta una decisione dell'operatore, registrata e modificabile solo in aggiunta).

La regressione del "pack" congelato è identica in termini di byte rispetto alle baseline della versione v0.3.3 per tutti e quattro i "pack" congelati: è il sesto rilascio consecutivo in cui ciò si verifica.

### Cosa la versione v0.10.0 NON afferma

- Pronta per la versione 1.
- Verdetto del "gate" di isolamento degli operatori per la versione v0.2. La versione v0.2 viene eseguita in una sessione separata con `npm @mcptoolshop/research-os@0.10.0`.
- Lavoro sulla dottrina dell'ammissibilità. In attesa del superamento del "gate" della versione v0.2.
- Una vittoria sugli strumenti di ricerca basati su cloud.
- Un modello completo di calibrazione dei revisori.

La versione v0.10.0 è un prerequisito per la versione v0.2 del "gate" di isolamento degli operatori, non una sua dimostrazione.

Consultare i file [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) e [CHANGELOG.md](CHANGELOG.md).

## Precedentemente: v0.9.0 — Area degli artefatti del prodotto

La versione v0.9.0 ha trasformato la "spina dorsale" delle prove della versione v0.8 in artefatti utili per gli operatori: sintesi a livello di sezione (`synth section`), sintesi parziale del "pack" (`synth pack --partial`) e il sistema di consulenza per il ripristino (`recover pack`). Consultare il file [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## Precedentemente: v0.8.0 — Architecture Recovery

La versione 0.8.0 ha riconnesso research-os al suo substrato LLM locale dichiarato (`ollama-intern-mcp@^2.4.0`) per l'estrazione di affermazioni, ha aggiunto l'applicazione di regole di pertinenza delle sezioni e ha aggiunto la sintesi di citazioni di prove a livello di sezione per le sezioni idonee per la convalida nei pacchetti che richiedono riparazioni. Consultare [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Stato

**v0.10.0 — Rilascio per la correzione dei problemi di isolamento degli operatori** — pubblicato su npm come `@mcptoolshop/research-os@0.10.0`, 15 maggio 2026. La versione v0.10.0 risolve le condizioni di errore del "gate" di isolamento degli operatori della versione v0.1 (`operator_aloneness_dst_v0.1`, ERRORE il 15 maggio 2026) tramite un percorso di correzione a 4 sezioni. **R-001** (`research-os claim repair-scope <sezione> [--auto | --interactive]`): nuova interfaccia a riga di comando per correggere le richieste (claim) il cui campo `scope` è arrivato come `null` durante l'estrazione; registro di sola scrittura `evidence/claim-scope-repairs.jsonl`; nuova azione `repair_claim_scope` in `RECOVERY_ACTIONS` (l'elenco delle opzioni è cresciuto da 7 a 8); il sistema suggerisce questa azione come prioritaria (rank-1) in `accepted_claim_floor` quando sono presenti ≥3 richieste che necessitano di correzione. **R-002** (instradamento del ripristino): lo strato di diagnostica ora legge `gate.json:blocking_reasons[]` come fonte di informazioni principale per l'instradamento, prima di ricorrere alla ricerca legacy in `failures[].check`; i segnali che bloccano il processo hanno la precedenza sui segnali a valle, come `source_card_classification_gap`. **R-003 + R-005** (rafforzamento della verifica delle schede di origine, abbinati): nuove gravità `bot_check_or_captcha_detected` (ERRORE GRAVE — segnale composto: indicatori + forma del contenuto) e `extraction_suspect_word_count_mismatch` (ATTENZIONE E QUARANTENA — contenuto ≤200 parole E estratto ≥800 parole E rapporto ≥4). Possibilità di sovrascrivere le impostazioni tramite il nuovo campo `clear_severities[]` nello schema del registro di sovrascrittura della versione v0.4. Blocco `audit.severity_thresholds` opzionale in `research.yaml` per la personalizzazione specifica di ogni pacchetto. **R-004** (`gather_outcome` affidabile): enum a 5 valori in `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`); la frase confusa della versione v0.1 `"Failed (ok HTTP 200)"` è stata rimossa. `fetch_duration_ms` opzionale in `FetchReceipt` per il segnale di verifica rapida CDN di R-003. `BOT_CHECK_MARKERS` esportato da `src/sources/severities.ts` per il riutilizzo degli indicatori in un'unica fonte di informazioni sia per lo strato di raccolta che per lo strato di verifica. **Richiede `ollama-intern-mcp@^2.4.0`** (invariato rispetto alla versione v0.8.0). 1344/1344 test superati con vitest (da 1266 a 1344, +78 test). **Tutti e quattro i pacchetti "frozen" vengono verificati byte per byte rispetto alle baseline della versione v0.3.3** (settimo rilascio consecutivo). **Non è una versione v1. Non è una valutazione positiva del "gate" di isolamento degli operatori della versione v0.2** — la versione v0.2 viene testata separatamente con questa versione di npm. Il lavoro sulla dottrina dell'ammissibilità è subordinato al superamento della versione v0.2. Consultare [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Product Artifact Arc** — Pubblicato su npm come `@mcptoolshop/research-os@0.9.0`, 13 maggio 2026. La versione v0.9.0 trasforma le evidenze della versione v0.8 in artefatti utili per gli operatori. La sintesi a livello di sezione (`research-os synth section <id>`) produce file Markdown leggibili, con pacchetti di supporto a livello di paragrafo che rimandano a affermazioni accettate. La sintesi parziale (`research-os synth pack --partial`) utilizza il testo delle sezioni (mai le affermazioni grezze) e indica le sezioni escluse con motivazioni strutturate; un pianificatore di pacchetti deterministico pre-seleziona il supporto trasversale necessario quando sono incluse ≥2 sezioni. Il consulente di ripristino (`research-os recover pack`) fornisce indicazioni agli operatori per le sezioni bloccate, utilizzando un'architettura a quattro livelli: diagnosi deterministica + grafo di azioni conformi + suggerimenti dell'intelligenza artificiale + verificatore, con tre percorsi di consulenza (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) e enumerazioni chiuse per nove tipi di errori e sette azioni di ripristino. Le indicazioni per il ripristino sono incorporate in `partial-pack-synthesis.{md,json}` sotto ogni sezione esclusa, tramite una proiezione compatta dall'oggetto di ripristino standard, che rappresenta una singola fonte di verità tra le interfacce autonome e quelle integrate; uno stato `recovery_unavailable` di tipo discriminated-union segnala esplicitamente i casi di errore del motore (nessuna omissione silenziosa). La semantica di "freeze" (congelamento) e pubblicazione rimane invariata: gli artefatti parziali leggibili non rendono un pacchetto incompleto congelabile o pubblicabile. Il valore `accepted_claim_floor` rimane inderogabile; il consulente di ripristino rifiuta di raccomandare l'azione `apply_waiver` per gli errori non risolvibili. **Richiede `ollama-intern-mcp@^2.4.0`** (invariato rispetto alla versione v0.8.0). 1266/1266 test vitest superati (da 1013 a 1266, +253 test nell'arco). **Tutti e quattro i pacchetti congelati verificano l'identità dei byte rispetto alle baseline della versione v0.3.3** (sesto rilascio consecutivo). **Non è una versione v1.** La versione v0.9.0 rende il livello degli artefatti una realtà; la prontezza per la versione v1, l'indipendenza operativa dei pacchetti, un modello di revisione affidabile e una "vittoria" basata su una baseline cloud non sono inclusi in questa versione. Consultare [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Ripristino dell'architettura + Pertinenza contestuale** — Pubblicata su npm come `@mcptoolshop/research-os@0.8.0`, 12 maggio 2026. La versione v0.8.0 introduce il ripristino dell'architettura: research-os ora utilizza `ollama-intern-mcp@^2.4.0` come sottosistema locale per l'elaborazione delle prove durante l'estrazione delle affermazioni (precedentemente, il file README dichiarava questa dipendenza, ma il codice conteneva delle "stub" interne che bypassavano questa dipendenza fin dalla versione v0.1 — la versione v0.8.0 risolve questa discrepanza). Aggiunte: sottostruttura del client MCP (`OLLAMA_INTERN_MCP_BIN` variabile d'ambiente + rilevamento del percorso + ciclo di vita di `StdioClientTransport`); valutazione delle prove per ogni affermazione tramite `ollama_extract` con uno schema a 4 etichette (`supports_section` / `off_topic` / `background_only` / `source_chrome`); nuova opzione `ReviewDecision` `frame_excluded` (la revisione salta il modello linguistico per le affermazioni escluse, generando un `ClaimReview` sintetico); la classe `ClaimSchema` include `frame_excluded` + `frame_exclusion_reason` (un'enumerazione a 4 valori, inclusa `critic_unavailable` per errori di stato del sistema) + `frame_exclusion_rationale`; sintesi delle prove a livello di sezione tramite `synth section <id>` per le sezioni idonee per la validazione nei pacchetti che richiedono riparazione (indice delle citazioni delle prove — ID dell'affermazione → asserzione → estratto della prova → URL della fonte — non testo narrativo); il processo di validazione tiene conto delle sovrascritture delle informazioni sulla fonte tramite `getEffectivePublisher` / `getEffectiveSourceType` (obiettivo assorbito dalla versione v0.7.1); il valore predefinito di `DEFAULT_WINDOW_CHARS` è stato modificato da 5000 a 3000 (dimensione ottimizzata per hermes3:8b con un contesto di lavoro di 8K nel profilo `dev-rtx5080`); la politica di "fallimento controllato" per le chiamate al valutatore è stata invertita (in caso di uno qualsiasi dei 5 possibili errori — trasporto / analisi / etichetta non valida / motivazione vuota / timeout — il valore predefinito è `frame_excluded: true` con la motivazione `critic_unavailable`, invece di essere accettato); la semantica della promozione: le affermazioni `frame_excluded` non bloccano la promozione della sezione; il passaggio di consegne tra i processi espone `frame_excluded` come un bucket separato dagli elementi accettati / da riparare / rifiutati. **Richiede `ollama-intern-mcp@^2.4.0`**. 1013 test superati su 1013 (da 901 a 1013, +112 test). **Tutti e quattro i pacchetti "congelati" sono verificati byte per byte rispetto alle versioni di base v0.3.3.** **Non è una versione 1.0** — il lavoro per la preparazione alla versione 1.0 continua; consultare [`docs/roadmap.md`](docs/roadmap.md). Consultare [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) e [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Ottimizzazione e test interni (Dogfood Swarm Hardening)** — pubblicato su npm come `@mcptoolshop/research-os@0.7.0`, 11 maggio 2026. Un ciclo di test interni a quattro fasi (correzione di bug/sicurezza, resilienza proattiva, miglioramento dell'interfaccia utente, rifinitura della presentazione) è stato eseguito sulla versione v0.6.0. La versione v0.7.0 include le seguenti ottimizzazioni: raccolta dati più sicura (gestione degli errori per URL con try/catch e salvataggio degli ID delle fonti in corso in caso di errori parziali); indicizzazione più robusta (salto e avviso per record, file o sezioni con JSONL malformato); gestione strutturata degli errori (12 sottoclassi di `ResearchOSError` con riferimenti alla documentazione); feedback sullo stato di avanzamento (`--no-progress` / `--progress` con rilevamento automatico del terminale durante la revisione, la raccolta, la mappatura delle contraddizioni e la pubblicazione del pacchetto); correzioni per migliorare l'usabilità (`pack publish --force` con sostituzione definitiva e controlli di regressione su 8 aree; correzione di un errore di battitura nel testo del comando `IndexNotBuiltError` e aggiunta di un test per il registro dei comandi; aggiunta di riferimenti alla documentazione per le 12 sottoclassi di `ResearchOSError`); miglioramento della sicurezza della catena di fornitura (blocco degli hash delle azioni CI + impostazione predefinita di `permissions: contents: read`; copertura dell'ecosistema con Dependabot `/site` e `github-actions`); due nuove pagine della documentazione (`recovery.md`, `known-limitations.md`); rifinitura della presentazione (correzione di frasi standard, riordino della barra laterale, avvisi `:::caution` per azioni distruttive). 901 test superati su 901 (da 713 a 901, +188 test). **Tutti e quattro i pacchetti ottimizzati sono verificati byte per byte rispetto alle versioni di base v0.3.3.** **Non è una versione 1.0** — i lavori per la versione 1.0 continuano; consultare [`docs/roadmap.md`](docs/roadmap.md) e [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md). Consultare [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) e [CHANGELOG.md](CHANGELOG.md).

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

### Cosa research-os non è (e cosa la versione v0.10.0 non pretende di essere)

- Non è stato dimostrato che il sistema funzioni in modo autonomo su pacchetti appena creati. La versione 0.10.0 risolve le condizioni di errore del gate "v0.1". Il gate "operator-aloneness" della versione 0.2 verrà testato separatamente in una sessione diversa e potrebbe rivelare ulteriori correzioni. La versione 0.10.0 è un prerequisito per la versione 0.2, non una dimostrazione della sua funzionalità autonoma.
- Non è stato testato da utenti esterni al di fuori dei test interni. Sono stati eseguiti sei test interni, uno di tipo auto-referenziale e cinque su domini esterni (ComfyUI, XRPL, Godot, calibrazione dei revisori, revisione deterministica), ma l'utilizzo su larga scala da parte di operatori esterni rimane un obiettivo futuro.
- Non è uno strumento completo per la creazione di pacchetti. La versione 0.10.0 eredita le funzionalità di visualizzazione del contesto di sezione (`synth section`) e del contesto parziale del pacchetto (`synth pack --partial`) presenti nella versione 0.9, ognuna con una chiara indicazione della disponibilità del pacchetto. La creazione completa di un pacchetto richiede ancora un pacchetto con l'attributo `synthesis_ready` e la creazione manuale (o tramite Cowork) basata sugli ID delle richieste accettate tramite `synth workspace`.
- Non è una garanzia di affidabilità per alcun modello di revisore. La versione 0.10.0 non include un profilo di revisore "trusted_baseline" per impostazione predefinita; le ricevute di calibrazione sono una prova, non una garanzia. Le ricevute di calibrazione esistenti della versione 0.6.0 risalgono all'architettura MCP della versione 0.8.0 e non sono state aggiornate in base al percorso MCP. Consultare la [pagina del manuale sulla calibrazione dei revisori](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- Non è privo di elementi storici nei pacchetti "congelati". I pacchetti "congelati" precedenti alla versione 0.4 contengono `research_os_version: '0.1.0'` a causa di una costante predefinita presente prima della versione 0.4; la correzione è stata implementata nella versione 0.4.0, ma i pacchetti "congelati" precedenti non possono essere modificati in base alla Legge 15 (vedere [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- Non è stato verificato tramite Sigstore su npm. L'attestazione di provenienza tramite Sigstore è prevista per una versione futura; verificare i pacchetti npm della versione 0.10.0 tramite package-shasum e l'hash del commit della release su GitHub.
- Non rappresenta un miglioramento significativo rispetto alle soluzioni basate su cloud. La valutazione comparativa tra soluzioni locali e basate su cloud, presente nella directory `local-first-vs-cloud-research/` della versione 0.7.x, ha evidenziato i vantaggi del cloud in termini di leggibilità e carico di lavoro per gli operatori; la versione 0.10.0 non afferma che questi vantaggi siano stati superati.

### Limitazioni note

La versione 0.10.0 include tre limitazioni note, visibili agli operatori, ereditate dalle versioni precedenti. Ognuna di esse è documentata nella [pagina del manuale sulle limitazioni note](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) e nel file [CHANGELOG.md](CHANGELOG.md). Nessuna di queste limitazioni impedisce il rilascio; tutte hanno un percorso di ripristino o di mitigazione definito.

- **B-E-001 — La versione del pacchetto "congelato" precedente alla versione 0.4 è un artefatto storico.** I pacchetti "congelati" pubblicati tra le versioni 0.3.3 e 0.6.0 contengono `research_os_version: "0.1.0"` nei file `pack.manifest.json` e `pack/research.yaml` a causa di una costante predefinita presente prima della versione 0.4. La correzione è stata implementata nella versione 0.4.0 (la costante scaffold ora importa la versione `RESEARCH_OS_VERSION` corrente); i pacchetti "congelati" precedenti non possono essere modificati in base alla Legge 15. I file JSON all'interno dei pacchetti interessati contengono già le loro versioni corrette.
- **B-E-004 — L'attestazione di provenienza su npm è prevista per una versione futura.** La versione 0.10.0 verifica i pacchetti npm solo tramite package-shasum. La migrazione del flusso di pubblicazione a un workflow CI con sigstore OIDC è in conflitto con la disciplina di traduzione prima della pubblicazione (TranslateGemma 12B viene eseguito localmente); la migrazione è prevista per una versione futura. Verificare i pacchetti npm della versione 0.10.0 tramite package-shasum e l'hash del commit della release su GitHub.
- **B-A-003 — La migrazione dello schema della versione dell'indicizzatore è documentata, non imposta.** La versione 0.10.0 include un intero `SCHEMA_VERSION` lato scrittura, ma non un componente per la migrazione lato lettura. Quando viene aggiornata la `SCHEMA_VERSION`, eliminare `.research-os/index.sqlite` e rieseguire `research-os index build --all`. Il pacchetto stesso non è interessato; l'indicizzatore è un livello di accelerazione basato su prove e richieste (Legge 8); la ricostruzione è idempotente.

**Nella versione 0.10.0, non è ammesso alcun profilo di revisore per la "trusted_baseline".** Si tratta di una scelta deliberata in termini di affidabilità, non di una lacuna: i risultati dei test di calibrazione presenti nel repository (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) documentano le evidenze. L'affidabilità si guadagna attraverso ripetuti test di verifica in caso di errori simulati, non viene data per scontata. Questi risultati risalgono a una versione precedente all'architettura MCP (Modular Compliance Platform) e non sono stati ricalibrati secondo il percorso MCP.

## Roadmap per la versione 1.0

La versione 1.0 è uno stato raggiunto attraverso il lavoro svolto, non una data di rilascio. Tutti e sei i test interni (Exp1–Exp6, dal 2026-05-08 al 2026-05-11) sono stati completati, e ciascuno ha prodotto un pacchetto di ricerca che è stato accettato e inserito in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). Il progetto ha raggiunto la versione v0.2.0 con la funzionalità `research-os pack publish` e il Pattern 2 (Esperimento 2), la versione v0.3.0 con il flag `--detector` (F-09), la versione v0.3.1 con le eccezioni a livello di sezione (F-10/F-11), la versione v0.3.2 con la gestione normalizzata delle richieste accettate (F-36), la versione v0.3.3 con una maggiore chiarezza nella semantica dei controlli (F-43/F-41), la versione v0.4.0 con una disciplina rigorosa nella gestione delle fonti (F-27/F-47/F-46), la versione v0.5.0 con una calibrazione dei revisori definita come un contratto di fiducia duraturo (F-48/F-49/F-50), e la versione v0.6.0 con una base di riferimento deterministica per i revisori (F-53/F-54). La preparazione per il rilascio della versione 1.0 è in corso attraverso un processo a più fasi di controllo e ottimizzazione; l'architettura è bloccata durante questo processo. Il piano completo è disponibile in [`docs/roadmap.md`](docs/roadmap.md).

## Licenza

MIT
