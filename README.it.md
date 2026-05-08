<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Un'interfaccia a riga di comando (CLI) che trasforma un argomento aperto in un **pacchetto di ricerca strutturato** — un repository organizzato in cui Claude, Cowork o un sistema simile possono lavorare per ore senza generare informazioni errate o distorcere l'indagine.

## Cos'è

`research-os` è il sistema di controllo tra "Voglio fare ricerche su X" e una base di dati di prove consolidata e tracciabile. Separa le ipotesi iniziali dalla raccolta delle prove, l'estrazione dei dati dalla verifica delle affermazioni, il rilevamento delle contraddizioni dalla loro risoluzione e le decisioni di revisione dalle conclusioni. Ogni fase scrive su un registro immutabile; ogni valutazione di idoneità viene calcolata in base a tali registri, e non è una semplice affermazione.

Non è un generatore di report. Non è un framework di orchestrazione di modelli linguistici di grandi dimensioni (LLM). Non scrive la sintesi per te. Impone le condizioni necessarie per l'inizio della sintesi.

**La versione 0.1 è stata utilizzata una sola volta: da sola, su se stessa.** Questa singola iterazione ha rilevato sette errori in `research-os`, tutti corretti prima di questa versione. La documentazione del processo — sette sessioni, due modelli di integrazione implementati, 463 test unitari, un pacchetto consolidato — è disponibile in [`docs/dogfood-proof.md`](docs/dogfood-proof.md). Manuale online: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Le 16 leggi fondamentali

| # | Legge |
|---|-----|
| 1 | Nessuna sintesi prima della verifica delle fonti. |
| 2 | La raccolta è una prova; l'estrazione è un'interpretazione. |
| 3 | I modelli possono interpretare porzioni di testo originale; non possono creare porzioni di testo che costituiscono una prova. |
| 4 | L'estrazione può produrre un eccesso di informazioni; la sintesi non può ereditare questa abbondanza. |
| 5 | La mappatura delle contraddizioni evidenzia le discrepanze; non le risolve, non le sintetizza e non decide quale affermazione è corretta. |
| 6 | I controlli determinano se una sezione è idonea per la sintesi. Non eseguono la sintesi né nascondono i fallimenti. |
| 7 | La revisione critica valuta l'integrità della ricerca. Non esegue la sintesi né riscrive il testo originale. |
| 8 | L'indicizzazione rende la ricerca di informazioni basata su prove possibile. Non crea nuove informazioni né diventa la fonte ufficiale. |
| 9 | La funzione di trasferimento a Cowork genera istruzioni operative a partire dalle informazioni verificate. Non crea informazioni né aggira i controlli. |
| 10 | L'ambiente di lavoro per la sintesi organizza le informazioni verificate per Cowork. Non esegue la sintesi né aggira la modalità di trasferimento. |
| 11 | L'audit del pacchetto aggrega le informazioni verificate esistenti. Non crea nuove informazioni né nasconde le prove a livello di sezione. |
| 12 | La fase di scoperta propone spunti; solo la raccolta produce prove. |
| 13 | Un revisore non è considerato affidabile finché non vengono dimostrati dei fallimenti e la sua capacità di rilevarli. |
| 14 | L'abbondanza di affermazioni non è sinonimo di qualità della ricerca. Le affermazioni devono essere verificate prima di poter essere considerate per la sintesi. |
| 15 | La fase di consolidamento blocca le informazioni verificate. Non completa la ricerca incompleta né converte lo stato di riparazione in prove. |
| 16 | Le eccezioni allentano i vincoli delle fonti; non possono creare prove. |

**Legge 3** — il modello linguistico non crea mai il testo delle prove. `research-os` crea un registro di estratti deterministico (con ID stabili come `ex_<source_id_hex>_001`); il modello linguistico seleziona gli ID degli estratti; `research-os` copia il testo letterale. La classe di errore "parafrasi come citazione" è strutturalmente impossibile.

**Legge 14** — tra l'estrazione e la revisione, `research-os claim triage` deduplica, limita il contributo per fonte e mette da parte i candidati meno promettenti. La fase di triage NON modifica `claims.jsonl`; le affermazioni messe da parte rimangono nel registro principale.

## La sequenza di lavoro della versione 0.1

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

Ogni passaggio è un comando da riga di comando. Ogni passaggio scrive su artefatti che possono essere solo aggiunti, non modificati. Nessun passaggio sintetizza, risolve o crea nuove verità; questi vincoli sono applicati, non considerati come affidabili. La fase di revisione accetta, rifiuta o richiede modifiche alle proposte; la fase di "gate" utilizza queste decisioni per calcolare l'idoneità alla sintesi; la fase di "freeze" è il blocco finale di integrità che impedisce di considerare un pacchetto come completato a meno che tutti i livelli non siano d'accordo. Consultare il file [docs/dogfood-proof.md](docs/dogfood-proof.md) per la documentazione della versione 0.1 che dimostra la coerenza dell'intera catena.

Questa è un'alternativa strutturale a *ricerca → riepilogo → report dettagliato*. La catena è il prodotto.

## Installazione

**Requisiti:** Node.js ≥ 20.

```bash
# From source (v0.1.0 is not yet published to npm)
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link   # makes `research-os` available on your PATH
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
```

**Per un esempio pratico**, consultare il pacchetto di test interno in `research-os-packs/research-os-spec/` — ogni artefatto, ogni ricevuta, ogni decisione, ogni "impronta" della fase di "freeze", tutto memorizzato su disco in registri che consentono solo l'aggiunta di dati. Questo pacchetto ha generato il file `docs/dogfood-proof.md`.

**Richiede [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) in esecuzione localmente** per l'estrazione, la classificazione, la revisione e la scoperta tramite modelli linguistici di grandi dimensioni (LLM). Il modello predefinito è `hermes3:8b`; è possibile specificarne uno diverso con la variabile d'ambiente `OLLAMA_INTERN_MODEL=<modello>`. Impostare la variabile `OLLAMA_HOST` se Ollama non è in esecuzione sull'indirizzo predefinito `localhost:11434`.

## Terminologia

| Termine | Significato |
|------|---------|
| `research-os` | Il piano di controllo / la riga di comando / le fasi di controllo / la legge di orchestrazione (questo repository) |
| `research-pack` | L'artefatto del repository generato per uno specifico progetto di ricerca |
| `research section` | Un'unità di indagine delimitata all'interno di un pacchetto |
| `research receipt` | Dimostra che una sezione ha superato i controlli di origine/affermazione/fase di controllo |

## Sicurezza

`research-os` è uno strumento da riga di comando che opera principalmente localmente. Legge e scrive file all'interno della directory del pacchetto di ricerca specificata e, quando si utilizza il comando `gather`, invia richieste HTTP in uscita per recuperare gli URL di origine forniti. Non esegue un server, non accetta connessioni in entrata, non memorizza credenziali e non invia dati di telemetria. Nessun segreto viene scritto negli artefatti del pacchetto. Consultare il file [SECURITY.md](SECURITY.md) per le informazioni sulla segnalazione di vulnerabilità.

## Stato

**v0.1.0** — bloccato il 2026-05-08. Il pacchetto di test interno in `research-os-packs/research-os-spec/` (repository correlato) ha raggiunto la fase di blocco con 296 affermazioni accettate in 8 sezioni, 17 considerate complete, 30 modificate dagli operatori, 0 blocchi di riparazione attivi, 0 contraddizioni irrisolte e tutti i controlli con `synthesis_eligible=true`. 463 test su 463 superati. Sedici regole fondamentali implementate. Consultare il file [`docs/dogfood-proof.md`](docs/dogfood-proof.md) per i sette risultati e le "impronte" delle ricevute della fase di blocco.

### Cosa la versione 0.1 non è

- Non è stata testata da utenti esterni. Il singolo test interno ha rilevato sette bug.
- Non è ancora disponibile su npm. Installare dal codice sorgente fino a quando non verrà eseguita la pubblicazione su npm.
- Non è uno strumento per la generazione automatica di codice. Il comando `synth workspace` genera l'ambiente di lavoro strutturato; gli utenti (o Cowork) scrivono il testo in base agli ID delle affermazioni accettate.
- Non ha una stabilità dell'API conforme alla versione semantica. La versione 1.0.0 è uno stato da raggiungere, non una data specifica; consultare il file [`docs/roadmap.md`](docs/roadmap.md) per i cinque esperimenti che colmano questa lacuna.

### Limitazioni note

- **L'origine dell'estrazione non è visibile nella cucitura del gateway.** Una sezione può superare la soglia accettabile, facendo affidamento su meccanismi di fallback euristici, quando l'estrazione calibrata (Ollama con il modello configurato) non è disponibile. Questo è stato registrato come una vulnerabilità nota; le future implementazioni di sicurezza segnaleranno le richieste accettate dall'estrazione e richiederanno un numero di richieste accettate pari alla soglia, provenienti dal percorso calibrato.
- **La selezione del modello di revisione, al di là della baseline calibrata `hermes-two-pass`, non è ancora risolta.** Il ciclo di test interno ha validato una configurazione di revisore; altri modelli devono essere sottoposti a una calibrazione specifica per scenari di errore simulati prima di poter essere considerati affidabili.
- **Il pacchetto di test interno ha utilizzato `mistral-nemo:12b` per l'estrazione (l'impostazione predefinita standard è `hermes3:8b`).** Il sistema ha generato risultati errati per nomi di sezioni che facevano riferimento a domini non corretti; questo è stato corretto tramite una disciplina di precisione delle query (vedere il manuale) e tramite l'utilizzo di URL preconfigurati dagli operatori per argomenti ambigui.

## Roadmap per la versione 1.0

La versione 1.0 è uno stato da raggiungere, non una data di rilascio. Cinque esperimenti sono ancora in corso tra la versione 0.1 e la versione 1.0: stabilità dell'API sotto pressione esterna, un pacchetto di test interno che non faccia riferimento a se stesso, la risoluzione del problema della visibilità dell'origine dell'estrazione, la generalizzazione della calibrazione del revisore al di là di `hermes-two-pass` e un test di base pulito su `hermes3:8b`. Il piano completo è disponibile in [`docs/roadmap.md`](docs/roadmap.md). L'architettura rimane stabile; la versione 1.0 approfondisce ciò che la versione 0.1 ha dimostrato, piuttosto che riaprire vecchie problematiche.

## Licenza

MIT
