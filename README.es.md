<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/research-os/readme.png" alt="research-os" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/research-os/releases/tag/v0.9.0"><img src="https://img.shields.io/badge/version-0.9.0-blue" alt="version 0.9.0"></a>
  <a href="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/research-os/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
  <a href="https://mcp-tool-shop-org.github.io/research-os/handbook/"><img src="https://img.shields.io/badge/handbook-live-purple" alt="Handbook"></a>
</p>

# research-os

`research-os` transforma la investigación, que tradicionalmente se presenta en un documento, en un conjunto de evidencias documentadas. Preserva la información original, separa las afirmaciones de la síntesis, exige preparación a través de etapas, registra las decisiones de los revisores y las exenciones, y publica un paquete cuyas afirmaciones pueden ser rastreadas y verificadas.

No le pide que confíe en el modelo. Le proporciona las herramientas para decidir si el modelo, las fuentes y la síntesis merecen su confianza.

## ¿Qué es?

`research-os` es la capa de control entre "quiero investigar X" y una base de evidencia estructurada y verificable. Separa las ideas iniciales de la recopilación de evidencia, la extracción de datos de la evaluación de la información, la detección de contradicciones de la resolución de contradicciones, y las decisiones de revisión de la síntesis. Cada paso escribe en un registro de solo escritura; cada decisión sobre la validez se calcula a partir de esos registros, no se afirma directamente.

No es un generador de informes. No es un marco de orquestación de modelos de lenguaje grandes (LLM). No escribe la síntesis por usted. Impone las condiciones bajo las cuales la síntesis puede comenzar.

Los paquetes congelados se almacenan en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs): son archivos activos y contienen cuatro paquetes que abarcan los seis experimentos internos cerrados. Consulte [`docs/roadmap.md`](docs/roadmap.md) para conocer la hoja de ruta de la versión 1.0.

La versión 0.1 se ha sometido a pruebas exhaustivas en dos proyectos piloto. El primero, "research-os investigando su propia especificación", encontró siete errores antes del lanzamiento de la versión 0.1.0, cada uno de los cuales requirió una corrección de código y la creación de una regla o patrón de integración. El segundo (Experimento 1: Durabilidad del flujo de trabajo de ComfyUI, 11 sesiones, un dominio sin superposición de vocabulario con research-os) se completó el 9 de mayo de 2026: el paquete se finalizó, el archivo está disponible, y la regla 2 se implementó mediante el commit `22b5dba`. La documentación del proyecto piloto 0.1 se encuentra en [`docs/dogfood-proof.md`](docs/dogfood-proof.md); la documentación del Experimento 1 se encuentra en [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Manual de usuario: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Instalación

**Requisitos:** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Para los colaboradores que construyen desde el código fuente:

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## Comienzo rápido

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

> **Nota sobre la salida de `freeze`.** El comando `research-os freeze` se ejecuta silenciosamente mientras recorre cada artefacto y calcula los hashes de contenido; no muestra ningún progreso incremental. En paquetes grandes, puede tardar decenas de segundos antes de mostrar cualquier resultado. Al finalizar, imprime un único bloque de resultado (`PASS` / `REFUSED` junto con la ruta del archivo de registro). No interprete la falta de respuesta como un fallo.

> **Advertencia sobre `--force`.** La opción `--force` borra y reemplaza el directorio del paquete de destino. No guarde archivos creados manualmente dentro de la salida del paquete generado. Edite los artefactos originales (declaraciones, fuentes, síntesis) o archivos relacionados en su lugar. Contrato de admisión completo y casos de rechazo: [`docs/pack-publish.md`](docs/pack-publish.md).

**Para un ejemplo práctico**, consulte el paquete de demostración en `research-os-packs/research-os-spec/`: cada elemento, cada registro, cada evaluación, cada huella digital de la versión final, todo en el disco en registros de solo escritura. Ese paquete es el que generó `docs/dogfood-proof.md`.

**Requiere [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) instalado localmente** para la extracción, clasificación, revisión y descubrimiento de modelos de lenguaje (LLM). El servidor MCP se descubre a través de la variable de entorno `OLLAMA_INTERN_MCP_BIN` o la variable PATH. El modelo predeterminado es `hermes3:8b`; puede modificarse con `OLLAMA_INTERN_MODEL=<modelo>` (o con la opción `--model <nombre>` en cada llamada). Establezca `OLLAMA_HOST` si Ollama no está en la ubicación predeterminada `localhost:11434`.

## Las 16 reglas fundamentales

| # | Regla |
|---|-----|
| 1 | No se puede realizar una síntesis sin una fuente verificada. |
| 2 | La recopilación es evidencia; la extracción es interpretación. |
| 3 | Los modelos pueden interpretar fragmentos de la fuente; no pueden crear fragmentos de evidencia. |
| 4 | La extracción puede generar demasiada información; la síntesis no puede heredar esa abundancia. |
| 5 | El mapeo de contradicciones revela tensiones; no resuelve, sintetiza ni decide qué afirmación es correcta. |
| 6 | Las restricciones deciden si una sección es elegible para la síntesis. No realizan la síntesis ni ocultan los fallos. |
| 7 | La revisión crítica evalúa la integridad de la investigación. No realiza la síntesis ni reescribe la fuente verificada. |
| 8 | La indexación permite buscar información verificada. No crea nueva información ni se convierte en la fuente oficial. |
| 9 | La transferencia a Cowork genera instrucciones operativas a partir de la información verificada. No crea información ni evita las restricciones. |
| 10 | El espacio de trabajo de síntesis organiza la información verificada para Cowork. No crea la síntesis ni evita el modo de transferencia. |
| 11 | La auditoría del paquete recopila la información verificada existente. No crea nueva información ni oculta la evidencia a nivel de sección. |
| 12 | El descubrimiento propone ideas; solo la recopilación produce evidencia. |
| 13 | Un revisor no se considera confiable hasta que se demuestran fallos y se verifica su capacidad de recuperación. |
| 14 | La abundancia de afirmaciones no garantiza la calidad de la investigación. Las afirmaciones deben ser evaluadas antes de poder ser consideradas para su síntesis. |
| 15 | La función de "congelación" asegura la integridad de la investigación finalizada. No completa investigaciones incompletas ni convierte un estado de reparación en evidencia. |
| 16 | Las exenciones relajan las restricciones de origen; sin embargo, no pueden generar evidencia. |

**Ley 3** — El modelo de lenguaje (LLM) nunca genera texto de evidencia. `research-os` crea un registro determinista de extractos (con identificadores estables como `ex_<id_hex_de_la_fuente>_001`); el LLM selecciona los identificadores de los extractos; `research-os` copia el texto literal. La clase de error "parafraseo como cita" es estructuralmente imposible.

**Ley 14** — Entre la extracción y la revisión, `research-os claim triage` elimina duplicados, limita la contribución por fuente y reserva los candidatos de bajo valor. El triage NO modifica `claims.jsonl`; las afirmaciones reservadas permanecen en el registro canónico.

## La cadena de flujo de trabajo v0.1

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

Cada paso es un comando de la interfaz de línea de comandos (CLI). Cada paso escribe en archivos que solo se pueden añadir. Ningún paso sintetiza, resuelve o crea nueva verdad; estos invariantes se aplican y no se confían en ellos. La revisión acepta, rechaza o solicita correcciones para las afirmaciones candidatas; la función de "puerta" utiliza estas decisiones de revisión para calcular la "elegibilidad para la síntesis"; la función de "congelación" es el último control de integridad que se niega a marcar un paquete como completado a menos que todas las capas estén de acuerdo. Consulte [docs/dogfood-proof.md](docs/dogfood-proof.md) para la prueba de la cadena v0.1 que garantiza la integridad de extremo a extremo.

Esta es la alternativa estructural a *búsqueda → resumen → informe detallado*. La cadena es el producto.

## Glosario

| Término | Significado |
|------|---------|
| `research-os` | El plano de control / CLI / puertas / ley de orquestación (este repositorio) |
| `research-pack` | El artefacto de repositorio generado para un esfuerzo de investigación. |
| `research section` | Una unidad de investigación delimitada dentro de un paquete. |
| `research receipt` | Prueba de que una sección ha superado las comprobaciones de origen/afirmación/puerta. |

## Seguridad

`research-os` es una herramienta de línea de comandos que funciona principalmente de forma local. Lee y escribe archivos dentro del directorio del paquete de investigación al que se le indica, y (cuando se utiliza `gather`) realiza solicitudes HTTP salientes para obtener las URL de origen que se proporcionan. No: ejecuta un servidor, acepta conexiones entrantes, almacena credenciales ni envía datos de telemetría. No se escriben secretos en los artefactos del paquete. Consulte [SECURITY.md](SECURITY.md) para obtener la política de notificación de vulnerabilidades.

## Calibración de revisores

La versión 0.5.0 permite una calibración duradera para los revisores. Un perfil de revisor no se considera fiable porque
se ejecutó una sola vez; obtiene un estado a través de registros estructurados de fallos simulados y
agregación de múltiples ejecuciones. La versión 0.6.0 agrega opciones deterministas para los revisores a la ruta de revisión de producción y al sistema de calibración.

**Actualmente, ningún perfil se considera como una "línea de base fiable".** Los registros canónicos en el repositorio muestran `hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`. Esto es
intencional: la confianza se gana a través de evidencia repetida de fallos simulados, no se asume.
El registro `hermes-two-pass-deterministic` tiene una brecha en el modelo estructural y la capacidad (se generaron 2 de 6 tipos de decisiones; se requieren 3 de 6), lo que no es un problema de varianza.

Los informes de calibración se encuentran en `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`. Cada informe registra los resultados de PASADO/FALLIDO en siete categorías, cuatro etiquetas de estado (`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`), y revela honestamente qué aspectos no puede probar la prueba (`needs_contradiction_mapping` no es accesible desde `seeded-v1`). Consulte [CHANGELOG.md](CHANGELOG.md).

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

Cuando se utiliza `--runs <n>`, los informes de cada ejecución se escriben en `<profile>/runs/run-NNN.json` y se escribe un informe agregado (con barras basadas en la mediana y detección de fallos recurrentes) en `<profile>/seeded-v1.{json,md}`. El informe agregado incluye `receipt_kind: 'aggregate'` para distinguirlo de los informes de ejecución individual. El modo de ejecución individual (`--runs 1` o omitido) conserva el comportamiento de escritura directa existente.

**Perfiles de revisores deterministas:** utilice `review_profiles.<name>.reviewer_options` en
`research.yaml` para incluir los parámetros de muestreo de Ollama, como `temperature` y `seed`, en cada instancia de `OllamaInternReviewer` en la ruta de revisión de producción. El perfil `hermes-two-pass-deterministic` se proporciona como un ejemplo integrado. Consulte
[`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) y la
[página del manual de calibración de revisores](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Novedades en la versión 0.9.0: Product Artifact Arc

research-os ahora genera artefactos legibles y paquetes parciales, manteniendo la trazabilidad y la integridad de los paquetes.

### Lo que puede ejecutar

```sh
research-os synth section <section-id>       # readable section prose + paragraph-level provenance
research-os synth pack --partial              # cross-section partial-pack synthesis from section prose
research-os recover pack                      # lawful recovery guidance for blocked sections
```

### La cadena de artefactos

```
claims → section prose → partial-pack synthesis → recovery guidance
```

Cada capa utiliza la capa anterior como evidencia. La canalización de texto de las secciones ejecuta un planificador determinista sobre las afirmaciones aceptadas, un generador de texto que escribe contenido basado en clústeres predefinidos y un verificador a nivel de párrafo que valida antes de la salida. La síntesis de paquetes parciales lee el texto de las secciones (nunca las afirmaciones directamente) y revela las secciones excluidas con razones estructuradas. La guía de recuperación lee información del grafo de acciones determinista calculado para cada sección excluida; la IA escribe texto dentro de ese espacio de acción definido; un verificador valida antes de la salida. El mismo objeto de recuperación que impulsa el comando independiente `recover pack` se proyecta en `partial-pack-synthesis.{md,json}` debajo de cada sección excluida, para que el operador vea "qué está bloqueado y qué hacer a continuación" en el mismo lugar.

### Límite legal

Los artefactos legibles no hacen que un paquete incompleto sea apto para ser congelado o publicado. Los comandos `pack freeze` y `pack publish` siguen rechazando paquetes con secciones no ejecutadas, bloqueadas o que requieren reparación. El producto genera una salida parcial y honesta en lugar de simular que el paquete está completo.

### Lo que la versión 0.9.0 NO afirma

- Estar lista para la versión 1.
- Ser superior a las herramientas de investigación basadas en la nube.
- Tener un modelo de calibración de revisores completamente confiable.
- Que un operador pueda ejecutar un paquete nuevo para generar un único artefacto útil.

El "arc" ha hecho que la capa de artefactos sea real. La cuestión de si un operador puede trabajar solo con un paquete seguirá siendo un tema abierto y se probará por separado después del lanzamiento de esta versión.

Consulte [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) y [CHANGELOG.md](CHANGELOG.md).

## Anteriormente: v0.8.0 — Recuperación de la arquitectura

La versión 0.8.0 reconectó research-os a su sustrato local de LLM declarado (`ollama-intern-mcp@^2.4.0`) para la extracción de afirmaciones, añadió la aplicación de la relevancia de las secciones dentro de un marco definido y añadió la síntesis de citas de evidencia a nivel de sección para las secciones elegibles para la validación en los paquetes que requieren reparación. Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Estado

**v0.9.0 — Producto "Artifact Arc"** — publicado en npm como `@mcptoolshop/research-os@0.9.0`, 14 de mayo de 2026. La versión v0.9.0 transforma la estructura de evidencia de la versión v0.8 en artefactos útiles para los operadores. La síntesis de texto a nivel de sección (`research-os synth section <id>`) produce texto Markdown legible, con paquetes de soporte a nivel de párrafo que apuntan a afirmaciones aceptadas. La síntesis de paquetes parciales (`research-os synth pack --partial`) utiliza el texto de las secciones (nunca afirmaciones directamente) y revela las secciones excluidas con razones estructuradas; un planificador de paquetes determinista preselecciona el soporte transversal necesario cuando se incluyen ≥2 secciones. El asesor de recuperación (`research-os recover pack`) proporciona orientación al operador para las secciones bloqueadas, utilizando una arquitectura de cuatro capas: diagnóstico determinista + grafo de acciones válidas + asesoramiento de IA + verificador, con tres rutas de asesoramiento (`ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) y enumeraciones cerradas para nueve tipos de fallos y siete acciones de recuperación. La guía de recuperación está integrada en `partial-pack-synthesis.{md,json}` bajo cada sección excluida, a través de una proyección compacta del objeto de recuperación canónico; esta es la única fuente de verdad entre las interfaces independientes y las integradas; un estado de unión discriminada `recovery_unavailable` expone explícitamente los casos de fallo del motor (sin omisiones silenciosas). La semántica de congelación y publicación no ha cambiado: los artefactos parciales legibles no hacen que un paquete incompleto sea congelable o publicable. El valor `accepted_claim_floor` sigue siendo innegociable; el asesor de recuperación se niega a recomendar la acción `apply_waiver` para los fallos innegociables. **Requiere `ollama-intern-mcp@^2.4.0`** (sin cambios con respecto a la versión v0.8.0). 1266/1266 pruebas de vitest superadas (de 1013 a 1266, +253 pruebas en total). **Los cuatro paquetes congelados verifican su integridad de forma idéntica a las versiones base v0.3.3** (sexta versión consecutiva). **No es una versión v1.** La versión v0.9.0 hace que la capa de artefactos sea real; la preparación para la versión v1, la capacidad de que un operador trabaje solo con un paquete nuevo, un modelo de revisor de confianza y una reclamación de superioridad sobre la línea de base en la nube, no se incluyen explícitamente en esta versión. Consulte [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Recuperación de la arquitectura + Relevancia contextual basada en marcos** — Publicada en npm como `@mcptoolshop/research-os@0.8.0`, 12 de mayo de 2026. La versión v0.8.0 es una versión de recuperación de la arquitectura: research-os ahora utiliza `ollama-intern-mcp@^2.4.0` como la base local para el procesamiento de evidencias, utilizada para la extracción de afirmaciones (anteriormente, el archivo README declaraba esta dependencia, pero el código tenía implementaciones internas directas de Ollama que la omitían desde la versión v0.1 — v0.8.0 corrige esta discrepancia). Se agregan: una base de cliente MCP (`OLLAMA_INTERN_MCP_BIN` como variable de entorno + descubrimiento de PATH + ciclo de vida de `StdioClientTransport`); un sistema de evaluación de la relevancia de cada afirmación mediante `ollama_extract` con un esquema de 4 etiquetas (`supports_section` / `off_topic` / `background_only` / `source_chrome`); una nueva opción `frame_excluded` en `ReviewDecision` (la revisión omite el modelo de lenguaje para las afirmaciones excluidas, generando un `ClaimReview` sintético); la clase `ClaimSchema` ahora incluye `frame_excluded` + `frame_exclusion_reason` (una enumeración de 4 valores, incluyendo `critic_unavailable` para fallos en el estado del sistema) + `frame_exclusion_rationale`; síntesis de evidencias a nivel de sección mediante `synth section <id>` para secciones elegibles en paquetes que requieren corrección (índice de citas de evidencias — ID de la afirmación → aserción → fragmento de evidencia → URL de origen — NO texto narrativo); el sistema respeta el registro de sobreescrituras de la fuente mediante `getEffectivePublisher` / `getEffectiveSourceType` (objetivo absorbido de la versión v0.7.1); el valor predeterminado de `DEFAULT_WINDOW_CHARS` se reduce de 5000 a 3000 (ajustado para hermes3:8b con un contexto de trabajo de 8K bajo el perfil `dev-rtx5080`); la política de fallo suave en la llamada al sistema de evaluación se invierte (cualquiera de las 5 modalidades de fallo — transporte / análisis / etiqueta inválida / justificación vacía / tiempo de espera — por defecto, se establece `frame_excluded: true` con la razón `critic_unavailable`, en lugar de rechazar); la semántica de promoción: las afirmaciones `frame_excluded` no bloquean la promoción de la sección; la transferencia de trabajo muestra `frame_excluded` como un contenedor separado de las afirmaciones aceptadas, en reparación o rechazadas. **Requiere `ollama-intern-mcp@^2.4.0`**. 1013 de 1013 pruebas de vitest superadas (de 901 a 1013, +112 pruebas). **Los cuatro paquetes congelados verifican su integridad de forma idéntica a las versiones base v0.3.3.** **No es una versión v1** — El trabajo para la preparación de la versión v1 continúa; consulte [`docs/roadmap.md`](docs/roadmap.md). Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Optimización y pruebas internas (Dogfood Swarm Hardening)** — publicada en npm como `@mcptoolshop/research-os@0.7.0`, 11 de mayo de 2026. Se realizó una serie de pruebas internas en cuatro etapas (detección de errores/seguridad, resistencia proactiva, mejora de la interfaz para el usuario, pulido de la presentación) sobre la versión v0.6.0. La versión v0.7.0 incluye las siguientes mejoras: mayor seguridad en la recopilación de datos (manejo de errores por URL con bloques try/catch y preservación de los identificadores de las fuentes en curso en caso de fallo parcial); indexador más robusto (omisión y advertencia por registro, archivo o sección en caso de JSONL mal formado); errores de recuperación estructurados (12 subclases de `ResearchOSError` con enlaces a la documentación); retroalimentación de progreso (`--no-progress` / `--progress` con detección automática de terminal en las fases de revisión, recopilación, mapeo de contradicciones y publicación del paquete); correcciones para mejorar la usabilidad (`pack publish --force` con una instrucción clara y destructiva que se aplica en 8 áreas, con pruebas de regresión; corrección de un error tipográfico en el texto del comando `IndexNotBuiltError` y adición de una prueba para el registro de texto de comandos; adición de enlaces a la documentación para cada una de las 12 subclases de `ResearchOSError`); medidas de higiene en la cadena de suministro (fijación de la versión de los archivos SHA en las acciones de CI + denegación por defecto de permisos de lectura de contenido; cobertura del ecosistema Dependabot `/site` + `github-actions`); dos nuevas páginas de la documentación (`recovery.md`, `known-limitations.md`); mejoras en la presentación (pruebas de regresión de frases, reordenación de la barra lateral, llamadas de atención `:::caution` para acciones destructivas). 901 de 901 pruebas de `vitest` superadas (de 713 a 901, +188 pruebas). **Los cuatro paquetes optimizados se verifican byte a byte con las versiones base v0.3.3.** **No es una versión 1.0** — el trabajo para alcanzar la versión 1.0 continúa; consulte [`docs/roadmap.md`](docs/roadmap.md) y [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md). Consulte [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — Publicado en npm como `@mcptoolshop/research-os@0.6.0`, 10 de mayo de 2026. La versión 0.6.0 finaliza el Experimento 6 con evidencia de confianza del revisor: research-os ahora puede generar una línea de base canónica reproducible y atribuible. Incluye: opciones deterministas para el revisor en la ruta de revisión de producción (`review_profiles.<name>.reviewer_options` en `research.yaml`); compatibilidad hacia atrás del esquema para artefactos congelados anteriores a la versión 0.3.3 (F-53); la salida de la revisión revela las condiciones de muestreo directamente en `review.json` y `review.md` (F-54); se ha incluido la recepción agregada determinista canónica (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **No se admite ninguna línea de base confiable.** `hermes-two-pass-deterministic=failed` (brecha en la capacidad del modelo estructural en el vocabulario de decisiones, no en la varianza). **Hermes no se promociona a `trusted_baseline`.** La mejora es el mecanismo, no el resultado. No se han realizado cambios en las puertas, la congelación ni las leyes de síntesis. Los cuatro paquetes congelados verifican la integridad de los archivos byte a byte. 713/713 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — publicado en npm como `@mcptoolshop/research-os@0.5.0`, 10 de mayo de 2026. La versión v0.5.0 hace que la calibración de revisores sea más robusta. Un perfil de revisor no se considera confiable simplemente porque se ejecutó una vez; obtiene un estado a través de informes estructurados de fallos simulados y agregación de múltiples ejecuciones. Incluye: esquema de informe de calibración estructurado (`seeded-v1.{json,md}`, validado con Zod, cuatro etiquetas de estado); entorno de ejecución para múltiples ejecuciones (`--runs <n>`, aislamiento por ejecución, barras de PASADO/FALLIDO basadas en la mediana, degradación por fallos recurrentes); barra de vocabulario de decisiones consciente de la arquitectura; búsqueda de informes relativa al paquete en `review-promote`. **No se admite ninguna línea de base confiable:** `hermes-two-pass=failed` (agregado, 3 ejecuciones), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. research-os ahora puede negarse a confiar en un perfil de revisor cuando los fallos simulados repetidos no respaldan la confianza. **No se realizan cambios en las puertas, la congelación o las leyes de síntesis. Los cuatro paquetes congelados existentes verifican la integridad de los bytes.** 671/671 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — publicado en npm como `@mcptoolshop/research-os@0.4.0`, 10 de mayo de 2026. La versión v0.4.0 hace que la identidad de la fuente sea más robusta. Las reglas deterministas del tipo de fuente gestionan la mayoría repetible, los registros de anulación preservan las correcciones del operador a través de la recolección, y la "auditoría de la tarjeta de origen" reemplaza las comprobaciones de deriva de scripts con una interfaz de línea de comandos de primera clase. Incluye: clasificador centralizado de tipo de fuente (Componente B — `classifySourceType`, 11 proveedores canónicos, `source-type-rules.json`); registro de anulación de la tarjeta de origen (Componente A — `source-card-overrides.jsonl`, subcomandos `validate` + `list`); y CLI de auditoría de la tarjeta de origen (Componente D — `research-os source-card audit --pack <dir>`, 7 tipos de hallazgos, artefactos JSON + Markdown, opciones `--apply --from` para aplicar la ruta). Corrección cosmética F-46: los manifiestos de los paquetes ahora imprimen la versión binaria en vivo en lugar de la versión congelada en `research.yaml` durante la inicialización del paquete. **No se realizan cambios en las puertas, la congelación o las leyes de síntesis. Los cuatro paquetes congelados existentes verifican la integridad de los bytes.** 620/620 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md) y la [página del manual de auditoría de la tarjeta de origen](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — Publicada en npm como `@mcptoolshop/research-os@0.3.3`, 10 de mayo de 2026. Incluye mejoras en la claridad de la semántica de las "gates" obtenidas gracias a Pack-3 (durabilidad de la exportación/ejecución de Godot, Experimento 3, paquete #3 de 3). La salida de la "gate" ahora incluye el publicador y los conteos específicos de la sección, junto con los conteos generales del paquete (F-43); se ha reformulado `no_source_cluster_monopoly` de una advertencia a un diagnóstico informativo (F-41). **El comportamiento de aprobación/rechazo no ha cambiado; los paquetes congelados existentes se verifican byte a byte.** 570/570 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — Publicada en npm como `@mcptoolshop/research-os@0.3.2`, 9 de mayo de 2026. Incluye una normalización de la contabilización de "accepted claims" que tiene en cuenta la admisión de `pack publish`. La estricta comparación de igualdad entre `claim-reviews.jsonl` y `pack-audit.json::accepted_claims` se ha reemplazado por una comparación de conjuntos efectivos: las "accepted claims" son identificadores únicos (`claim_id`) cuya última decisión de revisión canónica es "accepted_for_synthesis" (la última decisión prevalece por `claim_id`). Los paquetes congelados cuya cuenta de auditoría heredada difiere del conjunto efectivo ahora se admiten con una advertencia en lugar de ser rechazados; el archivo de auditoría heredado se conserva tal cual (Ley 15), mientras que el manifiesto del archivo refleja la cuenta normalizada. El rechazo sigue siendo absoluto para los identificadores de reclamación fantasma, las decisiones duplicadas incompatibles y las "gates" que no son elegibles para la síntesis. Obtenido gracias al Experimento 3, paquete XRPL, Sesión K: el "pack publish" fue rechazado debido a una discrepancia real en el registro de cierre (la Sección 07 tenía 24 filas "accepted_for_synthesis" pero solo 19 identificadores únicos (`claim_id`) debido a ventanas de revisión superpuestas). 558/558 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — Publicado en npm como `@mcptoolshop/research-os@0.3.1`, 9 de mayo de 2026. Incluye exenciones de origen con ámbito de sección (`primary_source_waiver.section_waivers[]`) y un reconocimiento por parte del revisor, de modo que una detección de "monopolio de la fuente" a nivel de sección se convierte en una advertencia visible en lugar de redirigir automáticamente todas las afirmaciones a "necesita reparación de la fuente". Obtenido mediante el experimento 3 del paquete XRPL, sesión 2: las secciones de protocolo canónico (cadenas de una sola base, especificaciones de API de jardín vallado, documentos de organismos de normalización) invirtieron la suposición de que la diversidad de editores es un indicador de la calidad de la verdad. 540/540 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Exenciones de origen con ámbito de sección** — Utilícelas cuando la diversidad de editores es estructuralmente incompatible con la fuente de verdad de la sección, no cuando una sección simplemente no ha logrado encontrar suficientes fuentes. Incluye un campo "razón" con control de esquema y una lista no vacía de "controles compensatorios". La política del paquete `primary_source_waiver_allowed: false` bloquea tanto las exenciones a nivel de paquete como las exenciones con ámbito de sección. El truco anterior a la v0.3.1 de `min_independent_publishers: 0` a nivel de paquete está ahora obsoleto; los paquetes congelados existentes siguen siendo válidos según sus recibos existentes. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) y el [manual de operación de los paquetes de investigación](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publicado el 2026-05-09. Se incluyó la opción `--detector <auto|heuristic|ollama-intern>` en `contradict map` (corrección F-09 de bloqueo de cadena del Experimento 3, Sesión 1, paquete XRPL). 527/527 pruebas vitest superadas. La selección del detector ahora es una opción explícita para el operador, en lugar de una variable de entorno dependiente del estado; el modo se muestra claramente en cada ejecución. Consulte [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publicado el 2026-05-09. Se incluyeron el paquete `research-os pack publish` (Experimento 2) y la corrección del predicado de preparación del Patrón 2. 515/515 pruebas vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md). Los paquetes congelados se exportan al archivo canónico `research-packs` con un solo comando; el contrato de admisión se aplica mediante código, no mediante una lista de verificación. Consulte [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — paquete de prueba interna congelado el 2026-05-08. El paquete en `research-os-packs/research-os-spec/` (repositorio hermano) alcanzó el estado de congelación con 296 afirmaciones aceptadas en 8 secciones, 17 gestionadas, 30 anuladas por el operador, 0 bloqueadores de reparación activos, 0 contradicciones sin resolver, y todas las condiciones (`synthesis_eligible=true`) cumplidas. Seis leyes fundamentales acumuladas. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para obtener los siete hallazgos y las huellas digitales de la recepción de la congelación.

**Repositorio monorepo de paquetes de investigación** — disponible en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) con cuatro paquetes: `research-os-self-dogfood` (relleno de la versión 0.1 para pruebas internas, 296 reclamaciones aceptadas, 8 secciones), `comfyui-workflow-durability` (Experimento 1, 302 reclamaciones aceptadas, 8 secciones), `xrpl-creator-token-durability` (Experimento 3, paquete #2) y `godot-export-runtime-durability` (Experimento 3, paquete #3). Todos los paquetes pasan la prueba `verify-pack.mjs`.

**Experimento 1 de la versión 1 (Durabilidad del flujo de trabajo de ComfyUI)** — CERRADO el 2026-05-09. Todas las 8 secciones en Terminal A, paquete congelado, archivo disponible. Consulte [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) y [`docs/roadmap.md`](docs/roadmap.md).

### Lo que `research-os` no es (y lo que la versión v0.7.0 no pretende ser)

- No ha sido probado en condiciones reales por usuarios externos, más allá de las pruebas internas. Se han cerrado seis experimentos de prueba interna, uno de referencia interna y cinco relacionados con áreas externas (ComfyUI, XRPL, Godot, calibración de revisores, revisor determinista), pero el uso a gran escala por parte de operadores externos sigue siendo un trabajo futuro. La funcionalidad de un operador individual en un paquete nuevo (una pregunta de evidencia no preparada, sin etapas previas) aún no se ha verificado nuevamente con la versión 0.9.0.
- No es un generador de contenido completo. La versión 0.9.0 produce texto legible a nivel de sección (`synth section`) y a nivel de paquete parcial (`synth pack --partial`), cada uno con una declaración explícita de su estado de preparación para su uso. La generación de contenido completo aún requiere un paquete con el estado `synthesis_ready` y la creación de contenido por parte de un humano (o un colaborador) utilizando los ID de reclamos aceptados a través de `synth workspace`.
- No es una aprobación de ningún modelo de revisor. La versión 0.9.0 no incluye un perfil de revisor `trusted_baseline` de forma predeterminada; los registros de calibración son evidencia, no una aprobación. Los registros de calibración existentes de la versión 0.6.0 son anteriores a la arquitectura MCP de la versión 0.8.0 y no se han vuelto a calibrar bajo la ruta MCP. Consulte la [página del manual de calibración de revisores](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- No está libre de artefactos históricos en los paquetes congelados. Los paquetes congelados anteriores a la versión 0.4 contienen `research_os_version: '0.1.0'` debido a una constante de estructura codificada en versiones anteriores a la 0.4; la corrección se implementó en la versión 0.4.0, pero los paquetes congelados anteriores son inmutables según la Ley 15 (consulte [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- No tiene una certificación de origen en npm. La certificación de origen de Sigstore se pospone a una versión futura; verifique los paquetes npm de la versión 0.9.0 utilizando package-shasum y el commit de la versión en GitHub.
- No representa una mejora significativa en comparación con las soluciones basadas en la nube. La demostración del producto en `local-first-vs-cloud-research/` de la versión 0.7.x identificó las ventajas de la nube en términos de legibilidad y carga de trabajo del operador; la versión 0.9.0 no afirma que estas ventajas hayan sido superadas.

### Limitaciones conocidas

La versión 1.0 incluye tres limitaciones conocidas visibles para los operadores. Cada una está documentada en la [página de limitaciones conocidas del manual](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) y en [CHANGELOG.md](CHANGELOG.md). Ninguna impide la publicación; todas tienen una ruta de recuperación o mitigación definida.

- **B-E-001 — La marca de versión de los paquetes congelados anteriores a la versión 1.0 es un artefacto histórico.** Los paquetes congelados publicados desde la versión 0.3.3 hasta la versión 0.6.0 contienen `research_os_version: "0.1.0"` en `pack.manifest.json` y `pack/research.yaml` debido a una constante de plantilla codificada antes de la versión 0.4. La corrección se implementó en la versión 1.0 (la plantilla ahora importa la versión `RESEARCH_OS_VERSION` actual); los paquetes congelados existentes son inmutables según la Ley 15. Los archivos JSON dentro de los paquetes afectados ya contienen sus versiones correspondientes.
- **B-E-004 — La certificación de origen de npm se pospone a la versión 1.x.** El archivo tarball npm de la versión 1.0 se verifica únicamente mediante package-shasum. La migración del flujo de publicación a un flujo de trabajo de CI con OIDC de Sigstore entra en conflicto con la disciplina de "traducir antes de publicar" (TranslateGemma 12B se ejecuta localmente); la migración está planificada para la versión 1.x. Verifique los paquetes npm de la versión 1.0 mediante package-shasum y el commit de la versión en GitHub.
- **B-A-003 — La migración del esquema de la versión del indexador está documentada, pero no se aplica de forma obligatoria.** La versión 1.0 incluye un entero `SCHEMA_VERSION` para la escritura, pero no un ejecutor de migración para la lectura. Cuando se actualiza la `SCHEMA_VERSION` según lo documentado, elimine `.research-os/index.sqlite` y vuelva a ejecutar `research-os index build --all`. El propio paquete no se ve afectado; el indexador es una capa de aceleración sobre la evidencia y las reclamaciones (Ley 8); la reconstrucción es idempotente.

**No se admite ningún perfil de revisor `trusted_baseline` en la versión 0.9.0.** Esto es una postura de confianza intencional, no una deficiencia: los registros de calibración en el repositorio (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) registran la evidencia. La confianza se gana a través de la recuperación repetida de fallos simulados, no se asume. Estos registros son anteriores a la arquitectura MCP de la versión 0.8.0 y no se han vuelto a calibrar bajo la ruta MCP.

## Hoja de ruta para la versión 1.0

La versión 1.0 es un estado alcanzado a través del trabajo realizado, no una fecha de lanzamiento. Los seis experimentos de prueba interna (Exp1–Exp6, del 8 al 11 de mayo de 2026) se completaron, y cada uno generó un paquete de investigación que fue aceptado e incluido en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). El proyecto avanzó a la versión 0.2.0 con la función `research-os pack publish` y el Patrón 2 (Experimento 2), a la versión 0.3.0 con la opción `--detector` (F-09), a la versión 0.3.1 con las exenciones específicas para cada sección (F-10/F-11), a la versión 0.3.2 con la normalización de la gestión de reclamaciones aceptadas (F-36), a la versión 0.3.3 con una mayor claridad en la semántica de los controles (F-43/F-41), a la versión 0.4.0 con la aplicación de principios de integridad de los datos de origen (F-27/F-47/F-46), a la versión 0.5.0 con la calibración de los revisores como un contrato de confianza duradero (F-48/F-49/F-50), y a la versión 0.6.0 con una línea base determinista para los revisores (F-53/F-54). La preparación para el lanzamiento de la versión 1.0 está en curso a través de un proceso de revisión y mejora en varias etapas; la arquitectura permanece bloqueada durante este proceso. El plan completo se encuentra en [`docs/roadmap.md`](docs/roadmap.md).

## Licencia

Licencia MIT.
