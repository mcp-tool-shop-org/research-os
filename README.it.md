<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Un'interfaccia a riga di comando (CLI) che trasforma un argomento di ricerca in un "**pacchetto di ricerca**" strutturato, ovvero un repository organizzato in cui Claude, Cowork o un sistema simile possono lavorare per ore senza generare risultati errati o superficiali.

## Cos'è

`research-os` è il livello di controllo che interviene tra la richiesta "Voglio ricercare X" e una base di dati strutturata e verificabile. Separa le ipotesi iniziali dalle prove raccolte, l'estrazione dei dati dalle affermazioni verificate, il rilevamento delle contraddizioni dalla loro risoluzione e le decisioni di revisione dalle conclusioni finali. Ogni passaggio viene registrato in un registro immutabile; ogni valutazione di disponibilità è calcolata a partire da questi registri, e non è una semplice affermazione.

Non è un generatore di report. Non è un framework per l'orchestrazione di modelli linguistici di grandi dimensioni (LLM). Non scrive la sintesi per te. Impone le condizioni necessarie per l'inizio della sintesi.

I pacchetti finalizzati vengono archiviati in [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) e sono disponibili, con due pacchetti iniziali. Consultare [`docs/roadmap.md`](docs/roadmap.md) per la roadmap della versione 1.0.

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

## Stato

**v0.3.3** — Pubblicata su npm come `@mcptoolshop/research-os@0.3.3` il 10 maggio 2026. Include miglioramenti nella chiarezza delle semantiche delle "gate", ottenuti grazie al Pack-3 (durabilità dell'esportazione/runtime di Godot, Esperimento 3, pacchetto n. 3 su 3). L'output della "gate" ora include il publisher e i conteggi specifici della sezione, oltre ai conteggi globali del pacchetto (F-43); la dicitura di `no_source_cluster_monopoly` è stata modificata da AVVISO a diagnostica informativa (F-41). **Il comportamento di successo/fallimento rimane invariato; i pacchetti esistenti vengono verificati byte per byte.** 570 test vitest su 570 superati. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — Pubblicata su npm come `@mcptoolshop/research-os@0.3.2` il 9 maggio 2026. Include una contabilizzazione normalizzata delle richieste accettate, tenendo conto dell'ammissione per la "pubblicazione del pacchetto". Il controllo di uguaglianza rigoroso tra `claim-reviews.jsonl` e `pack-audit.json::accepted_claims` è stato sostituito con un confronto di insiemi, in cui le richieste accettate sono rappresentate da `claim_id` univoci la cui ultima decisione di revisione canonica è "accettata per la sintesi" (l'ultima decisione prevale per ogni `claim_id`). I pacchetti "congelati" la cui cronologia delle revisioni differisce dall'insieme normalizzato vengono ora ammessi con un avviso anziché essere rifiutati; il file di revisione precedente viene conservato integralmente (Legge 15), mentre il manifest dell'archivio riflette il conteggio normalizzato. Il rifiuto rimane assoluto per gli `claim_id` fantasma, le decisioni duplicate incompatibili e le "gate" non idonee per la sintesi. Ottenuto grazie all'esperimento 3 XRPL, pacchetto Session K: la pubblicazione del pacchetto è stata rifiutata a causa di una reale discrepanza nel registro di chiusura (la sezione 07 conteneva 24 righe "accettate per la sintesi", ma solo 19 `claim_id` univoci a causa delle sovrapposizioni negli intervalli di revisione). 558 test vitest su 558 superati. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — pubblicato su npm come `@mcptoolshop/research-os@0.3.1`, 9 maggio 2026. Include eccezioni specifiche per sezione per le fonti (`primary_source_waiver.section_waivers[]`) e un'approvazione da parte del revisore, in modo che una scoperta di "monopolio del cluster di fonti" a livello di sezione diventi un avvertimento visibile anziché indirizzare automaticamente tutte le affermazioni a "needs_source_repair". Ottenuto con l'esperimento 3 del pacchetto XRPL, sessione 2 — le sezioni relative al protocollo canonico (catene con una singola base, specifiche API a "giardino chiuso", documentazione di organismi di standardizzazione) hanno invertito l'assunzione che la diversità degli editori sia un indicatore della qualità della verità. 540/540 test vitest superati. Consultare [CHANGELOG.md](CHANGELOG.md) e [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Eccezioni specifiche per sezione per le fonti** — Utilizzarle quando la diversità degli editori è strutturalmente incompatibile con la fonte di verità della sezione, non quando una sezione semplicemente non è riuscita a trovare abbastanza fonti. Schema con `reason` (motivo) e `compensating_controls[]` (controlli compensativi) obbligatori. La policy del pacchetto `primary_source_waiver_allowed: false` blocca sia le eccezioni a livello di pacchetto che quelle specifiche per sezione. Il workaround precedente alla v0.3.1, `min_independent_publishers: 0`, è ora obsoleto; i pacchetti "frozen" esistenti rimangono validi con le ricevute esistenti. Consultare [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) e il [manuale operativo dei pacchetti di ricerca](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — pubblicata il 2026-05-09. È stato introdotto il flag `--detector <auto|heuristic|ollama-intern>` in `contradict map` (correzione F-09 del blocco della catena proveniente dalla Sessione 1 dell'Esperimento 3, pacchetto XRPL). 527 test vitest superati. La selezione del rilevatore è ora una scelta esplicita da parte dell'operatore, invece di una dipendenza dallo stato e da variabili d'ambiente; la modalità viene visualizzata in modo chiaro ad ogni esecuzione. Consultare [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — pubblicata il 2026-05-09. Sono stati distribuiti il pacchetto `research-os pack publish` (Esperimento 2) e la correzione del predicato di prontezza del Pattern 2. 515 test vitest superati. Consultare [CHANGELOG.md](CHANGELOG.md). I pacchetti con stato finale vengono esportati nell'archivio canonico `research-packs` con un singolo comando; l'accordo contrattuale viene applicato tramite codice, non tramite una checklist. Consultare [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — pacchetto di test interno bloccato l'8 maggio 2026. Il pacchetto in `research-os-packs/research-os-spec/` (repository correlato) ha raggiunto lo stato finale con 296 affermazioni accettate in 8 sezioni, 17 risolte, 30 sovrascritte dall'operatore, 0 blocchi di riparazione attivi, 0 contraddizioni irrisolte, con tutte le condizioni (`synthesis_eligible=true`) soddisfatte. Sono state implementate sedici leggi fondamentali. Consultare [`docs/dogfood-proof.md`](docs/dogfood-proof.md) per i sette risultati e le informazioni sull'identificazione dello stato finale.

**Archivio monorepo dei pacchetti di ricerca** — disponibile su [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) con due pacchetti disponibili fin dal primo giorno. `comfyui-workflow-durability` (Esperimento 1, 302 affermazioni accettate, 8 sezioni) e `research-os-self-dogfood` (backfill v0.1 per i test interni, 296 affermazioni accettate, 8 sezioni). Entrambi i pacchetti superano il test `verify-pack.mjs`.

**Esperimento 1 (Durabilità del flusso di lavoro ComfyUI)** — CHIUSO il 9 maggio 2026. Tutte le 8 sezioni in Terminal A, pacchetto bloccato, archivio disponibile. Consultare [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) e [`docs/roadmap.md`](docs/roadmap.md).

### Cosa la versione 0.3 non è

- Non testato in condizioni reali da utenti esterni. Tre cicli di test interni sono stati completati: uno autoreferenziale e due relativi a domini esterni. L'esperimento 3 (stabilità dell'API sotto pressione esterna) è **STATO CHIUSO il 10 maggio 2026**: tutti e tre i pacchetti (ComfyUI, XRPL, Godot) hanno raggiunto la fase di "congelamento" senza modifiche disruptive all'interfaccia a riga di comando (CLI) v0.3.x. Questi cicli di test hanno portato a: v0.3.0 `--detector` (F-09), v0.3.1 gestione delle eccezioni specifiche per sezione (F-10/F-11), v0.3.2 contabilizzazione normalizzata delle richieste accettate (F-36) e v0.3.3 chiarezza delle semantiche delle "gate" (F-43/F-41).
- Non è uno strumento per la scrittura di sintesi. Il comando `synth workspace` genera l'ambiente di lavoro strutturato; gli esseri umani (o Cowork) scrivono il testo in relazione agli `claim_id` accettati.
- Non è stabile per quanto riguarda la compatibilità delle API secondo il sistema semantico. La versione 1.0.0 è uno stato da raggiungere, non una data specifica; consultare [`docs/roadmap.md`](docs/roadmap.md) per i sei esperimenti che porteranno a questo risultato.

### Limitazioni note

- **L'origine dei dati estratti non è visibile al livello di connessione.** Una sezione può superare la soglia delle affermazioni accettate facendo affidamento su affermazioni basate su euristiche quando l'estrazione calibrata (Ollama con il modello configurato) non è disponibile. Questo è stato registrato come Esperimento 4 nella roadmap; le future ottimizzazioni mostreranno le affermazioni accettate per ogni strumento di estrazione e richiederanno il numero di affermazioni accettate derivanti dal percorso calibrato.
- **La selezione del modello di revisione oltre al modello di riferimento calibrato `hermes-two-pass` non è ancora risolta.** Il ciclo di test interni ha validato una configurazione del revisore; modelli alternativi devono essere sottoposti a una calibrazione specifica per la rilevazione di errori prima di poter essere considerati affidabili. Questo è l'Esperimento 5 nella roadmap.
- **Il pacchetto di test interni v0.1 ha utilizzato `mistral-nemo:12b` per l'estrazione (il valore predefinito canonico è `hermes3:8b`).** `hermes3:8b` non era disponibile su questo sistema durante il ciclo v0.1. Questa dichiarazione di sostituzione rimane valida fino a quando non viene generato un risultato basato su hermes3; questo è l'Esperimento 6 nella roadmap. Per gli operatori che utilizzano sistemi senza `hermes3:8b`, impostare la variabile `OLLAMA_INTERN_MODEL` su un modello disponibile; le URL pre-configurate per l'operatore e la disciplina nella precisione delle query (vedere il manuale) mitigano le allucinazioni nella scoperta di argomenti ambigui.

## Roadmap per la versione 1.0

La versione 1.0 è uno stato raggiunto attraverso il lavoro svolto, non una data di rilascio. Tra la versione 0.1 e la 1.0 ci sono sei esperimenti in corso: un sistema di test interno non auto-referenziale (attualmente in fase di sviluppo come il pacchetto "ComfyUI workflow durability"), un comando `research-os pack publish` che automatizza l'esportazione nel repository centrale `research-packs` (Esperimento 2, limitato e dipendente dal completamento dell'Esperimento 1), stabilità dell'API sotto pressione esterna, colmare il divario sulla provenienza dei dati estratti, estendere la calibrazione dei revisori oltre il sistema `hermes-two-pass` e un test di base pulito su `hermes3:8b`. L'Esperimento 1 non è completato al momento del "congelamento" del pacchetto; si conclude quando il pacchetto "congelato" viene distribuito come il primo pacchetto nel repository centrale `research-packs`, insieme al pacchetto di test interno della versione 0.1. Il piano completo è disponibile in [`docs/roadmap.md`](docs/roadmap.md). L'architettura rimane invariata; la versione 1.0 approfondisce ciò che la versione 0.1 ha dimostrato, piuttosto che riaprire vecchie questioni.

## Licenza

MIT
