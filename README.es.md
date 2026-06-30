<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

`research-os` transforma la investigación, pasando de un documento generado a un conjunto de pruebas estático. Preserva la fuente original, separa las afirmaciones de la síntesis, impone requisitos mediante etapas de control, registra las decisiones del revisor y las exenciones, y publica un paquete cuyas afirmaciones se pueden rastrear y verificar.

No requiere que confíes en el modelo. Te proporciona los mecanismos para decidir si el modelo, las fuentes y la síntesis merecen confianza.

## Qué es

`research-os` es la capa de control entre "Quiero investigar X" y una base de pruebas estática y con trazabilidad de afirmaciones. Separa los hallazgos iniciales de la recopilación de pruebas, la extracción sin procesar de las afirmaciones clasificadas, la detección de contradicciones de la resolución de contradicciones y las decisiones de revisión de las disposiciones de síntesis. Cada paso se escribe en un registro de solo anexión; cada veredicto de cumplimiento se calcula a partir de esos registros, no se afirma.

No es un generador de informes. No es un marco de orquestación de LLM. No redacta tu síntesis por ti. Impone las condiciones bajo las cuales la síntesis puede comenzar.

Los paquetes estáticos se archivan en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) —en vivo, con cuatro paquetes que abarcan los seis experimentos cerrados de prueba interna. Consulta [`docs/roadmap.md`](docs/roadmap.md) para conocer la hoja de ruta de la versión 1.0.

La versión 0.1 se ha probado exhaustivamente en dos ciclos de prueba interna. El primero —research-os investigando su propia especificación— identificó siete deficiencias de corrección antes del lanzamiento de la versión 0.1.0, cada una requiriendo una corrección real del código y dando lugar a una ley o un patrón de integración. El segundo (Experimento 1 de la versión 1: durabilidad del flujo de trabajo de ComfyUI, 11 sesiones, un dominio sin superposición de vocabulario con research-os) se cerró el 2026-05-09: paquete congelado, archivo en vivo, finalización de la aplicación del Patrón 2 mediante el commit `22b5dba`. El registro de pruebas de la versión 0.1 está disponible en [`docs/dogfood-proof.md`](docs/dogfood-proof.md); el registro de pruebas del Experimento 1 está disponible en [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md). Manual en línea: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Instalación

**Requisitos:** Node.js ≥ 20.

```bash
npm install -g @mcptoolshop/research-os
```

Para los colaboradores que compilan desde el código fuente:

```bash
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link
```

## Inicio rápido

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

> **Nota sobre la salida de `freeze`.** `research-os freeze` opera en silencio mientras recorre cada artefacto canónico y calcula los valores hash del contenido; no hay progreso incremental para este comando. En paquetes grandes, puede tardar decenas de segundos antes de imprimir algo. Cuando termina, imprime un único bloque de veredicto (`PASS` / `REFUSED` más la ruta del comprobante). No interpretes el retraso como una falla.

> **Advertencia sobre `--force`.** `--force` borra y reemplaza el directorio del paquete de destino. No guardes archivos creados manualmente dentro de la salida del paquete generado. Edita los artefactos originales (afirmaciones, fuentes, síntesis) o los archivos complementarios en su lugar. Contrato completo de admisión + casos de rechazo: [`docs/pack-publish.md`](docs/pack-publish.md).

**Para un ejemplo práctico**, consulta el paquete de prueba interna en `research-os-packs/research-os-spec/`; todos los artefactos, todos los comprobantes, todas las disposiciones, todas las huellas digitales de congelación, todo en disco en registros de solo anexión. Ese paquete es lo que produjo `docs/dogfood-proof.md`.

**Requiere [`ollama-intern-mcp@^2.4.0`](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) en ejecución localmente** para la extracción, clasificación, revisión y descubrimiento de LLM. El servidor MCP se descubre a través de la variable de entorno `OLLAMA_INTERN_MCP_BIN` o PATH. El modelo predeterminado es `hermes3:8b`; anúlalo con `OLLAMA_INTERN_MODEL=<model>` (o por llamada `--model <name>`). Establece `OLLAMA_HOST` si Ollama no está en el `localhost:11434` predeterminado.

## Las 16 leyes fundamentales

| # | Ley |
|---|-----|
| 1 | No hay síntesis antes de la fuente original. |
| 2 | La recopilación es evidencia; la extracción es interpretación. |
| 3 | Los modelos pueden interpretar fragmentos de la fuente; no pueden crear fragmentos de evidencia. |
| 4 | La extracción puede generar en exceso; la síntesis no puede heredar abundancia. |
| 5 | El mapeo de contradicciones revela tensión; no resuelve, sintetiza ni decide qué afirmación gana. |
| 6 | Las etapas de control deciden si una sección es elegible para la síntesis. No sintetizan ni ocultan el fracaso. |
| 7 | La revisión adversarial evalúa la integridad de la investigación. No sintetiza ni reescribe la fuente original. |
| 8 | La indexación hace que la verdad de la investigación sea consultable. No crea nueva verdad ni se convierte en la fuente de registro. |
| 9 | La transferencia entre compañeros genera instrucciones operativas a partir de la verdad de la investigación. No crea verdad ni omite las etapas de control. |
| 10 | El espacio de trabajo de síntesis organiza la verdad de la investigación aceptada para el compañero. No crea síntesis ni omite el modo de transferencia. |
| 11 | La auditoría del paquete agrega la verdad de la investigación existente. No crea nueva verdad ni oculta la evidencia a nivel de sección. |
| 12 | El descubrimiento propone pistas; solo la recopilación produce evidencia. |
| 13 | Un revisor no es confiable hasta que las fallas iniciales demuestran su capacidad de recuperación. |
| 14 | La abundancia de afirmaciones no es calidad de investigación. Las afirmaciones deben clasificarse antes de que puedan competir por la síntesis. |
| 15 | La congelación bloquea la verdad de la investigación completada. No completa la investigación incompleta ni convierte el estado de reparación en evidencia. |
| 16 | Las exenciones relajan las restricciones de la fuente; no pueden fabricar evidencia. |

**Ley 3:** el LLM nunca crea texto de evidencia. research-os construye un registro determinista de extractos (ID estables como `ex_<source_id_hex>_001`); el LLM elige los ID de los extractos; research-os copia el texto literal. La clase de fallas "paráfrasis como cita" es estructuralmente imposible.

**Ley 14:** entre la extracción y la revisión, `research-os claim triage` elimina duplicados, establece límites en la contribución por fuente y pone en espera a los candidatos de menor prioridad. La fase de clasificación NO modifica `claims.jsonl`; las reclamaciones puestas en espera permanecen en el registro canónico.

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

Cada paso es un comando CLI. Cada paso escribe en artefactos de solo adición. Ningún paso sintetiza, resuelve ni crea nueva información; estas invariantes se aplican y no se asumen. La revisión acepta/rechaza/solicita correcciones sobre las reclamaciones candidatas; la puerta de enlace utiliza esas decisiones de revisión para calcular `synthesis_eligible`; la fase final es el bloqueo de integridad que se niega a marcar un paquete como completado a menos que todas las capas estén de acuerdo. Consulte [docs/dogfood-proof.md](docs/dogfood-proof.md) para obtener la prueba v0.1 de que la cadena funciona de principio a fin.

Esta es la alternativa estructural a *búsqueda → resumen → informe detallado*. La cadena es el producto.

## Vocabulario

| Término | Significado |
|------|---------|
| `research-os` | El plano de control / CLI / puertas de enlace / ley de orquestación (este repositorio) |
| `research-pack` | El artefacto del repositorio generado para un esfuerzo de investigación |
| `research section` | Una unidad limitada de investigación dentro de un paquete |
| `research receipt` | Prueba de que una sección superó las comprobaciones de fuente/reclamación/puerta de enlace |

## Seguridad

`research-os` es una CLI que prioriza el uso local. Lee y escribe archivos dentro del directorio research-pack al que lo apunta, y (cuando se utiliza `gather`) realiza solicitudes HTTP salientes para obtener las URL de origen que proporciona. No: ejecuta un servidor, acepta conexiones entrantes, almacena credenciales ni envía telemetría. Ningún secreto se guarda en los artefactos del paquete. Consulte [SECURITY.md](SECURITY.md) para conocer la política de notificación de vulnerabilidades.

## Calibración del revisor

v0.5.0 hace que la calibración del revisor sea duradera. No se confía en un perfil de revisor porque
se ejecutó una vez; obtiene un estado a través de recibos estructurados de fallas controladas y
agregación de múltiples ejecuciones. v0.6.0 agrega opciones deterministas para el revisor al
flujo de revisión de producción y al conjunto de calibración.

**Actualmente, no se admite ningún perfil como `trusted_baseline`.** Los recibos canónicos
en el repositorio muestran `hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`,
`hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`. Esto es
intencional: la confianza se gana a través de pruebas repetidas de fallas controladas, no se asume.
El recibo `hermes-two-pass-deterministic` tiene una brecha estructural en las capacidades del modelo
(se producen 2 de 6 tipos de decisiones; requiere 3 de 6) que no es un problema de variación.

Los recibos de calibración se encuentran en `calibration/reviewer-profiles/<profile>/seeded-v1.{json,md}`.
Cada recibo registra PASS/FAIL contra siete barras, cuatro etiquetas de estado
(`trusted_baseline`, `conditional_pass`, `failed`, `comparison_only`) y
revela honestamente lo que el dispositivo de prueba no puede probar (`needs_contradiction_mapping`
no es accesible desde `seeded-v1`). Consulte [CHANGELOG.md](CHANGELOG.md).

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

Cuando se utiliza `--runs <n>`, los recibos por ejecución se escriben en `<profile>/runs/run-NNN.json`
y se escribe un recibo agregado (con barras basadas en la mediana y detección de fallas recurrentes) en
`<profile>/seeded-v1.{json,md}`. El recibo agregado contiene `receipt_kind: 'aggregate'`
para distinguirlo de los recibos de una sola ejecución. El modo de una sola ejecución (`--runs 1` o omitido) conserva
el comportamiento existente de escritura directa.

**Perfiles de revisor deterministas:** utilice `review_profiles.<name>.reviewer_options` en
`research.yaml` para incluir `temperature`, `seed` y otros parámetros de muestreo de Ollama
en cada construcción de `OllamaInternReviewer` en el flujo de revisión de producción. El
perfil `hermes-two-pass-deterministic` se incluye como un ejemplo integrado. Consulte
[`docs/experiment-6-proof.md`](docs/experiment-6-proof.md) y la
[página del manual de calibración del revisor](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).

## Nuevo en v0.13.1: R-024 Autoridad de presupuesto por nivel de la etapa de extracción (parche del camino C)

v0.13.1 es un parche de una sola corrección sobre v0.13.0. Resuelve la condición de la pista 0.5 (la brecha en el alcance de R-019 en la etapa de extracción de reclamaciones) al extender la autoridad de presupuesto por nivel de R-019 a cada llamada MCP `ollama_extract` realizada durante la `extracción de la reclamación`: el extractor por ventana, el crítico de evidencia de sección R-011 por reclamación y el crítico de rescate R-012 por candidato de rescate. La misma estructura que la cobertura de prosa sintética de R-019. Parche de un solo repositorio (solo research-os); el campo del esquema `tier_budget_ms_override` de ollama-intern-mcp@2.6.0 es el alcance del lado del servidor sin cambios.

Esta versión existe porque la puerta de enlace de "operador único" v0.5 contra `mcptoolshop/research-os@0.13.0` + `ollama-intern-mcp@2.6.0` publicado devolvió **PASS_WITH_CONDITIONS, NO un nivel de autorización** (`operator_aloneness_dst_v0.5`). Todas las superficies v0.13 (R-018 + R-019 + R-020 + R-021) se activaron en vivo sin errores; el piso de defensa se mantuvo; rechazo honesto en fallas con nombre y acciones de recuperación documentadas. Pero 3 de las 8 fuentes en la sección 02 (`02-safety-and-economic`) alcanzaron el límite de tiempo TIER_TIMEOUT instantáneo de 15000 ms durante la extracción sin una anulación orientada al operador. R-019 había incluido la anulación analógica para la prosa sintética en v0.13.0; v0.13.1 lo extiende a la etapa de extracción.

> **R-024 implementa la regla completa del presupuesto por nivel: al extender un presupuesto por nivel, el presupuesto debe llegar a cada llamada LLM en esa etapa que pueda producir el mismo tiempo de espera interno. La cobertura parcial = parche mal dirigido en la capa de cobertura del sitio de llamada.**
> **R-024 también implementa la regla de fragilidad de las pruebas de reproducción en vivo: cuando una prueba de aceptación de reproducción en vivo falla por razones relacionadas con el dispositivo de prueba (tiempo, captura, estado del dispositivo) en lugar de razones mecánicas, corrija el dispositivo de prueba; no omita, degrade ni sustituya la inspección manual del artefacto.**

La versión 0.5 establece la disposición en la Ruta D (triaje de múltiples pistas). La versión 0.13.1 cierra la Pista C. La Pista A se cerró durante la fase de preparación (lista blanca de rutas de conexión con puerta de memoria). La Pista B (preparación para el descubrimiento de fuentes) se activa en una sesión separada después de que la versión 0.13.1 se publique. La configuración de la puerta de enlace v0.6 sigue a la Pista B. El Segmento de Admisibilidad 1 permanece **no autorizado** hasta que la versión 0.6 sea satisfactoria.

### Qué puede ejecutar

```sh
# R-024 — operator-controllable per-call tier-budget for the EXTRACT stage
#         (mirrors R-019's --planner-timeout-ms for synth prose; same shape, different stage)
#         (requires ollama-intern-mcp@>=2.6.0; pre-2.6.0 silently discards the override)
research-os claim extract <id> --tier-budget-ms 60000
RESEARCH_OS_EXTRACT_TIER_BUDGET_MS=60000 research-os claim extract <id>
```

Precedencia: indicador CLI > variable de entorno > valor predeterminado (omitido; los valores predeterminados del perfil ollama-intern-mcp se aplican). Límite de `[1, 600000]` ms (límite superior de seguridad de 10 minutos). Los valores no válidos fallan claramente con un código de salida distinto de cero que indica la superficie y el valor problemático.

### Novedades

**R-024: autoridad de presupuesto por etapa en todas las 3 ubicaciones de llamada de `ollama_extract`.** La nueva opción `--tier-budget-ms <N>` en `claim extract` (y la variable de entorno correspondiente `RESEARCH_OS_EXTRACT_TIER_BUDGET_MS`) transmite un ajuste del presupuesto por etapa controlado por el operador para cada llamada a `ollama-intern-mcp@>=2.6.0` como `tier_budget_ms_override` en CADA invocación de la herramienta `ollama_extract` durante la ejecución de la extracción: `MCPClaimExtractor.extractOnePage` (el extractor por ventana), `runCritic` (R-011, crítico de sección de evidencia por reclamación, una llamada por borrador por ventana) y `runRescueCritic` (R-012, crítico de rescate por candidato de rescate en borradores con inconsistencias en el contenido de la fuente). El presupuesto activo se muestra en stderr (`[extract] tier_budget_ms=N source=... section=<id>`) antes del bucle por fuente, en los metadatos del recibo de extracción (`tier_budget_ms` + `tier_budget_overridden_by` en `audits/<section>-claim-extract.json`) y en la enumeración cerrada `EXTRACT_TIER_BUDGET_SOURCES` (`['default', 'cli_flag', 'env_var']`). El comportamiento predeterminado es idéntico a v0.13.0 (sin indicador, sin variable de entorno → se aplican los valores predeterminados del perfil; el recibo omite los nuevos campos).

### Nota arquitectónica

R-024 refleja la arquitectura de R-019, pero en una etapa diferente. R-019 conectó el ajuste a través de `runProseSynthesis` al planificador + redactor + verificador (3 ubicaciones de llamada de `ollama_extract` para la síntesis de prosa); R-024 lo conecta a través del orquestrador `extract()` → `MCPClaimExtractor.extract` → distribución a extractOnePage + runCritic + runRescueCritic (3 ubicaciones de llamada de `ollama_extract` en la etapa de extracción). La regla de presupuesto por etapa con cobertura total es ahora un principio fundamental: al extender un presupuesto por etapa para una superficie orientada al operador, el informe de retroalimentación de la Fase B debe enumerar cada ubicación de llamada LLM en esa etapa que comparta el mismo tiempo de espera interno. Una cobertura parcial produce un ERROR DE DESTINO en la capa de cobertura de la ubicación de llamada con la misma firma auto-falsificadora que el ERROR DE DESTINO del envoltorio/mecanismo interno de R-018: el recibo registra el ajuste Y el tiempo de espera especificado se activa en una ubicación de llamada no cubierta en el mismo artefacto.

Cero cambios en ollama-intern-mcp. El campo del esquema `tier_budget_ms_override` de v2.6.0 ha estado presente desde la versión coordinada de R-019; v0.13.1 proporciona la conexión del lado de research-os para el cliente de la etapa de extracción.

### Se preserva el nivel mínimo de defensa

R-024 es una adición de control por parte del operador, no un cambio arquitectónico. R-002 a R-021 permanecen sin cambios. `accepted_claim_floor` sigue siendo inamovible. Las enumeraciones cerradas no se modifican (`FailureShape` en 9; `RECOVERY_ACTIONS` en 8; `REGENERATION_REASONS` en 3; `PLANNER_TIMEOUT_SOURCES` en 3; `POLICY_KEYWORDS` en 8; `POLICY_RELEVANT_SOURCE_TYPES` en 1). R-024 agrega la nueva enumeración cerrada `EXTRACT_TIER_BUDGET_SOURCES` (3 valores) sin tocar ninguna enumeración existente. La plantilla de indicaciones del asesor de recuperación de IA permanece sin cambios. La arquitectura MCP se extiende de forma aditiva. La forma de la expresión regular de causa de respaldo de R-010 se preserva. La forma de extracción `--resume / --progress` de R-015 se preserva (R-024 agrega una NUEVA línea de registro en stderr + NUEVOS campos en el recibo; el formato del libro mayor existente + el comportamiento de omisión + la forma de emisión no cambian).

La regresión del paquete congelado es idéntica a las líneas base de v0.3.3 para los cuatro paquetes congelados: **décima novena versión consecutiva** en la que esto se cumple. 1630 → 1663 pruebas vitest aprobadas (+33 pruebas sintéticas de aceptación de R-024 + 1 guardia siempre activa; 6 omitidas: las pruebas de reproducción en vivo están condicionadas a las variables de entorno del rig).

### Qué NO afirma v0.13.1

- Preparación para v1.
- Verificación de la puerta de enlace de "operador único" de v0.6. La configuración de v0.6 sigue a R-023 (preparación para el descubrimiento de fuentes); v0.13.1 es un requisito previo para el cierre de la Pista C, no la prueba.
- Segmento de Admisibilidad 1. Condicionado a que v0.6 sea satisfactorio.
- Candidatos diferidos de v0.13.x (F-2 R-009 divergencia entre auditoría y extracción; F-3 estancamiento en la transferencia de colaboración; F-4 R-017 estrechez de POLICY_KEYWORDS).

Consulte [CHANGELOG.md](CHANGELOG.md) para obtener la entrada completa de la versión.

## Anteriormente: v0.13.0 — Arco de triaje del bloqueador de finalización (R-019 + R-020 solo D + R-021)

v0.13.0 cierra el arco de triaje del bloqueador de finalización de v0.13 que se abrió después de que la ejecución de v0.4 contra `@mcptoolshop/research-os@0.12.1` devolviera **PASÓ CON CONDICIONES, no con una calificación para su autorización**, a través de la Ruta D (arco de triaje de múltiples bloqueadores, distinto de la Ruta C del parche específico). Tres bloqueadores de finalización independientes en tres capas diferentes de la canalización; tres controles específicos independientes que, juntos, desbloquean la síntesis de prosa y la superficie de recuperación del clúster sin respuesta, así como el modo automático del mapa de contradicciones. El nivel mínimo de defensa y las superficies de cobertura-recuperación de v0.10 / v0.11 / v0.12 / v0.12.1 permanecen intactos; no hay cambios en las enumeraciones cerradas; no hay cambios que interrumpan la superficie.

> **La ejecución de v0.4 demuestra que la aceptación sintética puede validar la infraestructura, mientras que la reproducción en vivo falsifica el mecanismo objetivo.**
> **v0.13 aborda el control del tiempo de ejecución de la finalización: R-019 desbloquea la capa interna del presupuesto por etapa de MCP; R-020 muestra una negativa honesta del clúster sin respuesta con acciones de recuperación; R-021 desbloquea la capa RPC del modo automático del mapa de contradicciones.**

La puerta de enlace de "operador único" de v0.5 se activa contra la versión 0.13.0 publicada en una sesión separada. El Segmento de Admisibilidad 1 permanece **no autorizado** hasta que la versión 0.5 sea satisfactoria.

### Qué puede ejecutar

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

### Novedades

**R-019: Configuración del presupuesto por nivel para el cliente en la capa interna de MCP.** La opción `--planner-timeout-ms <N>` de R-018 (y la variable de entorno `RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS`) ahora se transmite a través del planificador/redactor/verificador hasta `ollama_extract.tier_budget_ms_override`, llegando a `runWithTimeoutAndFallback` en `ollama-intern-mcp/src/guardrails/timeouts.ts:61`. El mecanismo de tiempo de espera por nivel que provocó el fallo de la reejecución de v0.4 (`elapsed=15018ms budget=15000ms`) ahora respeta directamente el presupuesto establecido por el operador. Se conserva el envoltorio de R-018 como una barrera externa para evitar bloqueos debido a promesas no resueltas (los envoltorios para modos de fallo ortogonales pueden detectar estos casos). Requiere `ollama-intern-mcp@>=2.6.0`; las versiones anteriores ignoran silenciosamente el nuevo campo del esquema (el envoltorio de R-018 sigue funcionando en su capa original, lo que permite una degradación gradual).

**R-020 (solo para D): Superficie de recuperación de `no_answer_cluster`.** Cuando el planificador se niega a asignar el rol "respuesta" a cualquier afirmación aceptada, el fallo ahora se muestra directamente en `recovery_actions[]` (`narrow_section_purpose` + `add_on_topic_sources`) en `section-synthesis.json`, un bloque de Markdown renderizado como `## Recovery actions` en `section-synthesis.md` (con encabezado action_id + texto explicativo + bloque de código con formato command_hint) y una sugerencia de una sola línea en stderr (`[synth] no_answer_cluster — consulte el bloque "Recovery actions" en section-synthesis.md para obtener los pasos a seguir`). La lista de acciones es una única fuente de información compartida con la ruta de recuperación del gráfico de acciones; no hay divergencias entre las rutas de comando independiente y las rutas de fallo en línea. **Se intentó y se revirtió el ajuste del indicador del planificador de R-020 (mitad A)**: iter-1 produjo una síntesis incorrecta silenciosa (el LLM fabricó respuestas nulas a partir de afirmaciones con efectos positivos en casos de prueba adversos; el verificador validó la negación invertida como "fidedigna"); el GUARDARRAIL ESTRICTO de iter-2 no anuló la alucinación. Según la regla de una sola iteración del operador, se revirtió el indicador y los 3 archivos de prueba con versión v3; `PROSE_PROMPT_VERSION` permanece en `section-prose-v3`. La doctrina se reforzó: la reproducción estructural en vivo puede tener éxito mientras que el contenido sintetizado es incorrecto silenciosamente; se requiere una inspección manual del texto en casos de prueba adversos para detectar inversiones de negación/alcance/predicado.

**R-021: Tiempo de espera de bloqueo en modo automático para contradict-map + mecanismo de respaldo heurístico + progreso visible.** Nueva opción `--auto-mode-pair-timeout-ms <N>` (valor predeterminado 90000; reducido desde los 120 segundos codificados previamente en R-021 después de medir el rendimiento con hermes3:8b en v0.4: mínimo 6,2 s, mediana 8,4 s, máximo 8,8 s → valor predeterminado de 90 s que proporciona un margen de ≥81 s). Nueva opción `--auto-mode-fall-through-after-n-timeouts <N>` (valor predeterminado 5; umbral de fallo consecutivo para el respaldo heurístico automático; las clasificaciones exitosas de `type:none` restablecen el contador). Variables de entorno correspondientes. Nueva línea de inicio en stdout (`auto-mode engaged: N candidate pairs; per-pair timeout=Xms; fall-through-after=Y`) que se emite en cada invocación, siempre visible y funciona incluso en contextos no TTY. La emisión forzada del evento de activación del respaldo en stderr evita la restricción TTY / `--progress` porque el operador debe ver el cambio de modo. Nuevo bloque de Markdown `## Auto-mode fall-through` en `contradictions.md` cuando se alcanza el umbral. Las reejecuciones heurísticas solo se realizan en pares no procesados (no se vuelve a clasificar los pares que el LLM ya ha completado).

### Nota arquitectónica

R-019 cruza la frontera entre research-os e ollama-intern-mcp. Research-os pasa `tier_budget_ms_override` en el esquema de `ollama_extract`; ollama-intern-mcp v2.6.0 lo respeta en el guardarrail interno. La infraestructura ya estaba allí; v2.6.0 proporcionó el punto de entrada del lado del cliente; v0.13.0 proporciona la conexión del cliente del lado de research-os. El envoltorio Promise.race de R-018 se conserva porque protege contra un modo de fallo ortogonal (bloqueos de promesas no resueltas; los envoltorios pueden detectar estos casos; las cargas útiles estructuradas `isError:true` en un presupuesto interno que el envoltorio no puede alcanzar pertenecen al ámbito de R-019).

R-021 es solo para research-os. El modo automático de contradict-map NO se dirige a través de ollama-intern-mcp; llama directamente a la API HTTP de Ollama `/api/chat`. No hay transporte MCP en la cadena; no hay infraestructura `tier_budget_ms_override`; no hay envoltorio de R-018. El protocolo de inicio de las cuatro leyes fundamentales detectó un error en el inicio de R-021 antes de que se escribiera ningún código de parche: el inicio decía "capa RPC de MCP"; la fase A de lectura lo falsificó.

### Se preserva el nivel mínimo de defensa

R-019 + R-020 (solo para D) + R-021 son adiciones controladas por el operador, no cambios arquitectónicos. R-002 a R-018 permanecen sin cambios. `accepted_claim_floor` sigue siendo inamovible. Los enumerados cerrados no se modifican (`FailureShape` en 9; `RECOVERY_ACTIONS` en 8; `REGENERATION_REASONS` en 3; `PLANNER_TIMEOUT_SOURCES` en 3; `POLICY_KEYWORDS` en 8; `POLICY_RELEVANT_SOURCE_TYPES` en 1). La plantilla del asesor de recuperación de IA no se modifica. La arquitectura MCP se extiende de forma aditiva. Se conserva la forma de la expresión regular de causa de fallback de R-010.

Regresión de paquete congelado byte a byte con respecto a las líneas base de v0.3.3 para los cuatro paquetes congelados: **décimo octava versión consecutiva** en la que esto se cumple. 1542 → 1630 pruebas de vitest aprobadas (+88 en las tres secciones; 4 omitidas: las pruebas de reproducción en vivo están restringidas por las variables de entorno).

### Lo que v0.13.0 NO afirma:

- Preparación para v1.
- Verificación del operador en la puerta de enlace de v0.5. v0.5 se ejecuta contra `@mcptoolshop/research-os@0.13.0` en una sesión separada; v0.13.0 es un requisito previo para la finalización, no la prueba.
- Admisibilidad Slice 1. Restringido a PASS de v0.5.
- Candidatos diferidos de v0.13.x (F-2 divergencia audit↔extract de R-009; F-3 estancamiento en el traspaso de colaboración; F-4 estrechez de POLICY_KEYWORDS de R-017; A-1 + A-2 hallazgos del lado del arquitecto integrados en la preparación de la puerta de enlace de v0.5).

Consulte [CHANGELOG.md](CHANGELOG.md) para obtener la entrada completa de la versión.

## Anteriormente: v0.12.1 — Anulación del tiempo de espera del planificador de síntesis (parche de la ruta C)

La versión 0.12.1 fue una actualización que solucionó un único problema en la versión 0.12.0. Incluyó únicamente R-018, que es un ajuste del tiempo de espera del envoltorio del lado de investigación para las llamadas `callTool` de sintaxis MCP, controlado por una bandera CLI detectable por el operador (`--planner-timeout-ms <N>` en `synth section` y `synth workspace`) y la variable de entorno correspondiente (`RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=<N>`). Prioridad: bandera CLI > variable de entorno > valor predeterminado (15000 ms). Se conserva el comportamiento predeterminado, idéntico a la versión 0.12.0.

Esta versión existe porque la prueba de aislamiento del operador v0.4 contra `@mcptoolshop/research-os@0.12.0` devolvió **PASS_WITH_CONDITIONS, no un nivel de autorización** (`operator_aloneness_dst_v0.4`). La base de defensa v0.11 se mantuvo bajo carga real; las seis superficies de recuperación de cobertura v0.12 se activaron y soportaron al operador; la cobertura del envoltorio sellado alcanzó los umbrales PASS (4/5 SOPORTADOS + 1 PARCIAL obligatorio; 2/3 SOPORTADOS + 1 PARCIAL moderadores; 0/3 trampas; 0/5 fallos de material desencadenados); todos los marcadores de contaminación fueron INOFENSIVOS. El único modo de fallo fue la finalización: la sintaxis alcanzó `TIER_TIMEOUT` de forma reproducible a ~15010 ms, en comparación con el presupuesto de 15 segundos del nivel Instant, sin una anulación documentada por parte del operador. Los resúmenes de las secciones cumplieron con los requisitos del envoltorio; simplemente, el paquete no pudo alcanzar la fase final.

**Disposición del camino C** (nuevo patrón obtenido en v0.4): cuando la sesión B identifica un único mecanismo de fallo nombrado con una ruta de parche explícita Y la cobertura del envoltorio está en los umbrales PASS Y se conserva la base de defensa Y la contaminación es INOFENSIVA, la disposición es: publicar el parche, volver a ejecutar el mismo camino del operador contra la versión parchada y recalibrar. No se vuelve a autorizar el envoltorio. No hay evaluador humano. No hay evolución arquitectónica v0.13.

> **v0.4 demuestra un nivel de cobertura de Research-OS en el nivel del resumen de la sección.**
> **v0.12.1 debe demostrar un nivel de finalización eliminando el único cuello de botella del tiempo de espera del planificador sin debilitar la base de defensa.**

### Qué puede ejecutar

```sh
research-os synth section <id> --planner-timeout-ms 30000
                                          # Raise planner budget for finalization (R-018)
RESEARCH_OS_SYNTH_PLANNER_TIMEOUT_MS=30000 research-os synth section <id>
                                          # Equivalent env-var path (R-018)
```

Las superficies de presupuesto activas se encuentran en `section-synthesis.json` (`planner_timeout_ms` siempre está poblado + `planner_timeout_overridden_by` solo presente cuando hay una anulación), metadatos de ProseBlock y stderr (`[synth] planner_timeout_ms=N source=… section=<id>` emitido antes de la generación de sintaxis). `synth section --help` documenta la bandera, el valor predeterminado, el límite superior (600000 ms como medida de seguridad) y la alternativa de variable de entorno. Los valores no válidos (negativos, cero, no numéricos, cadenas con sufijos de unidad, > 600000) fallan claramente con un código de salida distinto de cero que indica la superficie + el valor problemático. No hay retroceso silencioso.

### Nota arquitectónica

El presupuesto de 15000 ms que se utilizó en la prueba v0.4 se encuentra en `ollama-intern-mcp` (`profiles.ts:58`, `DEV_RTX5080_TIMEOUTS.instant`), NO en research-os. Antes de R-018, research-os no aplicaba ningún tiempo de espera del planificador; el tiempo de espera se activaba en el lado del servidor en la política de nivel de ollama-intern-mcp. La resolución de R-018 introduce la propia autoridad de research-os sobre el presupuesto a través de un envoltorio `Promise.race` alrededor de MCP `callTool`, que por defecto utiliza el número observado de facto del nivel Instant (15000 ms), para preservar el comportamiento predeterminado. El envoltorio de R-018 produce errores con la forma de `TIER_TIMEOUT` que coinciden con la expresión regular `classifyFallbackCause` de R-010 (`/elapsed=(\d+)ms/` + `/budget=(\d+)ms/`), preservando la visibilidad del asesor de IA en las ejecuciones del camino predeterminado.

### Se preserva el nivel mínimo de defensa

R-018 es una actualización ligera que permite al operador ajustar parámetros, no un cambio arquitectónico. R-002 / R-003 / R-005 / R-007 / R-008 / R-009 / R-010 / R-011 / R-012 / R-013 / R-014 / R-015 / R-016 / R-017 permanecen sin cambios. `accepted_claim_floor` sigue siendo inamovible. Los enumerados cerrados no cambian (`FailureShape` en 9; `RECOVERY_ACTIONS` en 8; `REGENERATION_REASONS` en 3; `POLICY_KEYWORDS` en 8; `POLICY_RELEVANT_SOURCE_TYPES` en 1). La plantilla del aviso del asesor de recuperación de IA permanece sin cambios. La arquitectura MCP no cambia: `ollama-intern-mcp@^2.4.0` se mantiene. R-018 agrega `PLANNER_TIMEOUT_SOURCES` (3) como un nuevo vocabulario para el registro del operador, distinto de cualquier enumerado de enrutamiento de puerta.

La regresión del paquete congelado es idéntica a las líneas base de v0.3.3 para los cuatro paquetes congelados: **la decimosexta versión consecutiva** en la que esto se cumple. 1542 → 1586 pruebas vitest aprobadas (+44 pruebas de aceptación de R-018).

### Lo que v0.12.1 NO afirma:

- Preparación para v1.
- Resultado de la reejecución de la prueba de aislamiento del operador v0.4. Las reejecuciones de v0.4 se realizan contra `@mcptoolshop/research-os@0.12.1` en una sesión separada; v0.12.1 es un requisito previo para el nivel de finalización, no la prueba.
- Slice 1 de admisibilidad. Depende de que la reejecución de v0.4 sea PASS: el mecanismo de bloqueo de v0.4 (aislamiento a nivel de defensa DEMOSTRADO; aislamiento a nivel de cobertura SUSTANCIALMENTE DEMOSTRADO a nivel del resumen de la sección; finalización pendiente en v0.12.1) sigue siendo la prueba bloqueada.
- Candidatos para v0.13 (divergencia F-2 R-009 audit↔extract; estancamiento F-3 cowork-handoff; estrechez F-4 R-017 POLICY_KEYWORDS). Independiente de la finalización.

Consulte [CHANGELOG.md](CHANGELOG.md) para obtener la entrada completa de la versión.

## Anteriormente: v0.12.0 — Versión de recuperación de cobertura

v0.12.0 cierra los hallazgos de la prueba de aislamiento del operador v0.3 que surgieron el 2026-05-16 (`operator_aloneness_dst_v0.3`, PASS_WITH_CONDITIONS, pero no un nivel de autorización). Seis hallazgos nombrados en cuatro segmentos: tres reparaciones arquitectónicas que cierran las brechas de cobertura que bloquean v0.4 (R-012, R-013, R-014) y tres mejoras ergonómicas que mejoran la superficie del operador que la prueba v0.4 ejercerá (R-015, R-016, R-017). v0.3 no falló porque las defensas retrocedieran; las cinco superficies de defensa v0.11 se activaron exactamente como se diseñaron, produjeron una síntesis limpia y honesta con cero contenido silenciosamente incorrecto, y el paquete se congeló en evidencia real, pero limitada. Falló porque las mismas defensas, funcionando correctamente, eliminaron la cobertura primaria esencial de la base de reclamaciones aceptadas. El mecanismo de bloqueo obtenido en v0.3:

> **v0.11 hizo que el sistema fuera lo suficientemente seguro como para evitar la síntesis silenciosamente incorrecta.**
> **v0.12 hace que sea más capaz de recuperar la cobertura sin debilitar esas defensas.**

La tesis: **las defensas conservadoras pueden prevenir la síntesis silenciosa incorrecta, pero también pueden privar al sistema de la cobertura necesaria.** La versión 0.12 es la solución para recuperar la cobertura. El nivel mínimo de defensa de la versión 0.11 se mantiene sin cambios; cada superficie R-007 a R-011 sigue funcionando. La versión 0.12 añade rutas de recuperación legales y verificadas.

### Qué puede ejecutar

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

### Las tres reparaciones arquitectónicas (nivel mínimo de bloqueo v0.4)

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

### Los tres cierres ergonómicos (mejoras en la experiencia del "gate" v0.4)

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

### Límite legal

Se conservan las prohibiciones de las reglas del sistema. `accepted_claim_floor` sigue siendo inamovible. El enum cerrado `FailureShape` no se modifica y mantiene nueve valores. El enum `RECOVERY_ACTIONS` tampoco se modifica y permanece en 8 valores; no hay nuevas acciones para el asesor. La heurística de forma distinta de R-014 amplía el enrutamiento de las acciones existentes. La plantilla del mensaje del asesor de recuperación de IA no se modifica (los nuevos campos de `EvidenceState` son observables en el JSON persistente, pero NO se muestran en el mensaje). Las reglas del verificador de recuperación no se modifican. La arquitectura MCP no se modifica; `ollama-intern-mcp@^2.4.0` se mantiene; no hay cambios en la forma de la llamada MCP durante la extracción. La advertencia de R-017 es informativa y NO afecta al veredicto del "gate", a la confirmación o a la publicación del sistema. Se conservan todas las defensas de v0.10 + v0.11; el nivel mínimo de defensa es el límite, y v0.12 se construye sobre él.

La regresión del sistema "congelado" es idéntica a la versión 0.3.3 para los cuatro sistemas "congelados"; **es la decimoquinta versión consecutiva** en la que esto ocurre (v0.4 → v0.5 → v0.6 → v0.7 → v0.8 → v0.9 → v0.10 → v0.11 → v0.12).

### Lo que NO afirma la versión 0.12.0

- Preparación para la versión 1.
- Veredicto del "gate" de "operador en solitario" de la versión 0.4. La versión 0.4 se ejecuta contra npm `@mcptoolshop/research-os@0.12.0` en una sesión separada.
- Segmento de admisibilidad 1. Se basa en el ÉXITO de la versión 0.4; el límite de la doctrina de la versión 0.3 (la autonomía a nivel de defensa está COMPROBADA; la autonomía a nivel de cobertura aún no) sigue siendo la prueba bloqueada.
- Una victoria sobre las herramientas de investigación basadas en la nube.
- Un modelo completo y fiable para calibrar revisores.

La versión 0.12.0 es un requisito previo para la versión 0.4 del "gate" de "operador en solitario", no la prueba.

Consulte [CHANGELOG.md](CHANGELOG.md) y el ejemplo de anulación orientado al operador en [`examples/source-card-override.example.json`](examples/source-card-override.example.json).

## Anteriormente: v0.11.0 — Segunda versión con reparación del "operador en solitario"

La versión 0.11.0 cerró las condiciones de fallo del "gate" de "operador en solitario" de la versión 0.2: alineación de la reparación del ámbito/límite (R-007), comprobación de la relevancia de la URL en el momento del descubrimiento (R-008), defensa contra la contaminación del contenido fuente por pares en las capas de extracción y de análisis de fotogramas (R-009 + R-011) y visibilidad de la causa de recuperación alternativa del asesor (R-010). Aquí se implementa la protección del contenido fuente de tres capas (R-008 en la admisión + R-009 en la extracción + R-011 en el análisis de fotogramas). Consulte [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md).

## Anteriormente: v0.10.0 — Versión con reparación del "operador en solitario"

La versión 0.10.0 cerró las condiciones de fallo del "gate" de "operador en solitario" de la versión 0.1 que surgieron el 15 de mayo de 2026 (`operator_aloneness_dst_v0.1`, FALLO): alineación del enrutamiento de recuperación (R-002), CLI de reparación del ámbito (R-001), refuerzo de la auditoría de tarjetas fuente por pares (R-003 + R-005) y estado honesto de recopilación (R-004). Consulte [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md).

## Anteriormente: v0.9.0 — Arco del artefacto del producto

La versión 0.9.0 transformó la estructura de evidencia de la versión 0.8 en artefactos útiles para el operador: síntesis de prosa a nivel de sección (`synth section`), síntesis parcial del sistema (`synth pack --partial`) y el asesor de recuperación legal (`recover pack`). Consulte [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md).

## Anteriormente: v0.8.0 — Recuperación de la arquitectura

La versión 0.8.0 reconectó research-os a su base de LLM local declarada (`ollama-intern-mcp@^2.4.0`) para la extracción de afirmaciones, añadió el cumplimiento de la relevancia de la sección limitada al fotograma y añadió la síntesis de citas de evidencia con ámbito de sección para las secciones elegibles del "gate" en los sistemas que requieren reparación. Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md).

## Estado

**v0.11.0 — Segunda versión de corrección para el problema de "operador aislado"** — publicada en npm como `@mcptoolshop/research-os@0.11.0`, 15 de mayo de 2026. La v0.11.0 resuelve las condiciones de fallo del filtro de "operador aislado" de la v0.2 (`operator_aloneness_dst_v0.2`, PASS_WITH_CONDITIONS no cumple con los requisitos de autorización el 15 de mayo de 2026) mediante un ciclo de corrección de 4 etapas que abarca 5 hallazgos identificados. **R-007** (alineación de la reparación del alcance/límite): `claim repair-scope --auto` ahora completa TANTO el campo `scope` COMO el campo `not` cuando ambos son nulos en una reclamación sustancial en el momento de la reparación; esto resuelve el problema de bucle continuo de la v0.2, donde la corrección R-001 de la v0.10 solo completaba el campo `scope`, y la reclasificación de las reclamaciones reparadas como `needs_scope_repair` se realizaba en `claim triage`. El límite modelado refleja la forma de degradación de la plantilla de alcance. El registro de solo anexión ahora registra `applied_not` junto con `applied_scope`. **R-008** (descubrimiento de defensa contra URL alucinadas): `discover run` ahora obtiene el `<title>` de cada URL candidata (límite: 64 KB de cuerpo, tiempo de espera de 5 segundos, concurrencia de 4 vías) y calcula la superposición determinista de palabras clave con respecto a la consulta de descubrimiento. Cada candidato obtiene un bloque de `relevance` (`verified | unverified | topic_mismatch`); `approve --top N` pone en cuarentena `topic_mismatch`; el operador puede anular esto mediante `approve --candidate <id>`. Resuelve el caso de la v0.2 donde `llm-heuristic` devolvió 3 URL reales de PMC que apuntaban a artículos completamente no relacionados sobre cáncer/bioquímica/linfoma VIH. **R-009** (protección de identidad del extractor): nueva severidad de tarjeta de origen `source_identity_mismatch` (FALLO GRAVE) cuando el `card.title` emitido por el extractor no coincide con el HTML `<title>` obtenido. Resuelve el caso de "ratas y clonidina" de la v0.2. Reutiliza el ayudante de superposición de R-008; anulación mediante `clear_severities[]`. **R-011** (preverificación del contenido de origen del crítico de marco): nueva razón de exclusión de marco `source_content_mismatch`. El crítico de marco ahora calcula una firma de contenido de origen una vez por fuente y ejecuta una preverificación determinista antes de la llamada al crítico LLM; si está por debajo del umbral, se interrumpe la llamada al LLM y se marca `frame_excluded: true`. Resuelve el caso de la v0.2 donde 11 reclamaciones derivadas de artículos sobre cáncer con texto en formato DST fueron aceptadas por el crítico LLM. **R-010** (recuperar la visibilidad del mecanismo de respaldo MD): nuevo enum cerrado `FALLBACK_CAUSES` (`tier_timeout | mcp_error | retry_exhausted`) + bloque opcional `FallbackTiming { elapsed_ms, budget_ms }` en los metadatos de `prose_error`; la recuperación de MD obtiene una sección "Por qué el asesor de IA recurrió al mecanismo de respaldo" + un resumen de la causa principal. Resuelve la brecha invisible de TIER_TIMEOUT en JSON de la v0.2. **Ahora se completa la protección de contaminación del contenido de origen de tres capas** (admisión R-008 + extracción R-009 + crítico R-011) con una defensa verificada e independiente por capas. **Requiere `ollama-intern-mcp@^2.4.0`** (sin cambios desde la v0.8.0). 1448/1448 pruebas de vitest aprobadas (1344 → 1448, +104 pruebas en todo el ciclo). **Los cuatro paquetes congelados verifican byte a byte que coinciden con las líneas base de la v0.3** (undécima versión consecutiva). **No es una versión v1. No es un veredicto del filtro de "operador aislado" de la v0.3**; la v0.3 se ejecuta en esta versión de npm en una sesión separada. El trabajo sobre la doctrina de admisibilidad está vinculado a PASS de la v0.3. Consulte [`docs/release-notes/v0.11.0.md`](docs/release-notes/v0.11.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.10.0 — Versión de corrección para el problema de "operador aislado"** — publicada en npm como `@mcptoolshop/research-os@0.10.0`, 15 de mayo de 2026. La v0.10.0 resuelve las condiciones de fallo del filtro de "operador aislado" de la v0.1 (`operator_aloneness_dst_v0.1`, FALLO el 15 de mayo de 2026) mediante un ciclo de corrección de 4 etapas. **R-001** (`research-os claim repair-scope <section> [--auto | --interactive]`): nueva herramienta de línea de comandos para corregir las reclamaciones cuyo campo `scope` llegó como `null` desde la extracción; registro de solo anexión `evidence/claim-scope-repairs.jsonl`; nueva acción `repair_claim_scope` en `RECOVERY_ACTIONS` (el enum cerrado crece de 7 a 8); el asesor lo presenta como de rango 1 en `accepted_claim_floor` cuando ≥3 reclamaciones están en `needs_repair_claims`. **R-002** (enrutamiento de recuperación): la capa de diagnóstico ahora lee `gate.json:blocking_reasons[]` como la superficie de enrutamiento autorizada antes de recurrir a la búsqueda heredada `failures[].check`; las señales de bloqueo del filtro tienen prioridad sobre las señales posteriores, como `source_card_classification_gap`. **R-003 + R-005** (endurecimiento de la auditoría de tarjetas de origen, por pares): nuevas severidades `bot_check_or_captcha_detected` (FALLO GRAVE: señal compuesta: marcadores + forma del cuerpo) y `extraction_suspect_word_count_mismatch` (ADVERTENCIA Y CUARENTENA: cuerpo ≤200 palabras Y extracción ≥800 palabras Y relación ≥4). Anulación por parte del operador mediante el nuevo campo `clear_severities[]` en el esquema de registro de anulación de la v0.4. Bloque opcional `audit.severity_thresholds` en `research.yaml` para ajustar por paquete. **R-004** (`gather_outcome` honesto): enum de 5 valores en `FetchReceipt` (`ok | fetch_failed | extraction_skipped | extraction_failed | bot_check_detected`); la frase confusa de la v0.1 "Failed (ok HTTP 200)" ha desaparecido. Consulte [`docs/release-notes/v0.10.0.md`](docs/release-notes/v0.10.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.9.0 — Ciclo de vida del artefacto del producto** — publicado en npm como `@mcptoolshop/research-os@0.9.0`, 14 de mayo de 2026. v0.9.0 transforma la base de pruebas de v0.8 en artefactos útiles para el operador. La síntesis de prosa a nivel de sección (`research-os synth section <id>`) produce Markdown legible con conjuntos de soporte a nivel de párrafo que apuntan a las afirmaciones aceptadas. La síntesis de paquetes parciales (`research-os synth pack --partial`) consume la prosa de la sección (nunca las afirmaciones sin procesar) y revela las secciones excluidas con razones estructuradas; un planificador determinista de conjuntos preselecciona el soporte transversal requerido cuando se incluyen ≥2 secciones. El asesor de recuperación legal (`research-os recover pack`) produce orientación para el operador sobre las secciones bloqueadas utilizando una arquitectura de cuatro capas: diagnóstico determinista + gráfico de acciones legales + consejos de IA + verificador, con tres rutas de asesor ( `ai_with_verifier_pass` / `ai_with_retry_pass` / `deterministic_fallback`) y enumeraciones cerradas para nueve tipos de fallos y siete acciones de recuperación. La orientación de la recuperación se incluye en `partial-pack-synthesis.{md,json}` debajo de cada sección excluida a través de una proyección compacta del objeto de recuperación canónico (única fuente de verdad entre las superficies independientes e integradas); un estado de unión discriminada `recovery_unavailable` muestra explícitamente los casos de fallo del motor (sin omisiones silenciosas). La semántica de congelación y publicación no cambia: los artefactos parciales legibles no hacen que un paquete incompleto pueda ser congelado o publicado. `accepted_claim_floor` sigue siendo inamovible; el asesor de recuperación se niega a recomendar `apply_waiver` para fallos inamovibles. **Requiere `ollama-intern-mcp@^2.4.0`** (sin cambios con respecto a v0.8.0). 1266/1266 pruebas de vitest superadas (1013 → 1266, +253 pruebas en todo el ciclo de vida). **Los cuatro paquetes congelados verifican byte a byte contra las líneas base de v0.3.3** (sexta versión consecutiva). **No es una versión v1.** v0.9.0 hace que la capa de artefactos sea real; la preparación para v1, la autonomía del operador con un paquete nuevo, un modelo de revisor confiable y una afirmación de victoria en la nube no se incluyen explícitamente. Consulte [`docs/release-notes/v0.9.0.md`](docs/release-notes/v0.9.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.8.0 — Recuperación de la arquitectura + Temporalidad delimitada por el marco** — publicado en npm como `@mcptoolshop/research-os@0.8.0`, 12 de mayo de 2026. v0.8.0 es una versión de recuperación de la arquitectura: research-os ahora utiliza `ollama-intern-mcp@^2.4.0` como el sustrato local del trabajador de pruebas para la extracción de afirmaciones (anteriormente, el README declaraba la dependencia, pero el código tenía stubs directos internos de Ollama que la omitían desde el andamiaje v0.1; v0.8.0 cierra esa divergencia). Agrega: sustrato de cliente MCP (`entorno OLLAMA_INTERN_MCP_BIN` + descubrimiento en PATH + ciclo de vida StdioClientTransport); crítico de pruebas por sección a través de `ollama_extract` con un esquema de 4 etiquetas (`supports_section` / `off_topic` / `background_only` / `source_chrome`); nueva `ReviewDecision` `frame_excluded` (la revisión omite el LLM para las afirmaciones excluidas, emite una ClaimReview sintética); `ClaimSchema` obtiene `frame_excluded` + `frame_exclusion_reason` (enumeración de 4 valores que incluye `critic_unavailable` para fallos del estado del sistema) + `frame_exclusion_rationale`; síntesis de pruebas con alcance de sección a través de `synth section <id>` para las secciones elegibles en los paquetes que requieren reparación (índice de citas de pruebas: ID de la afirmación → aserción → extracto de la prueba → URL de origen; NO prosa narrativa); la puerta honra el registro de anulación de la tarjeta de origen a través de `getEffectivePublisher` / `getEffectiveSourceType` (absorbido del objetivo v0.7.1); `DEFAULT_WINDOW_CHARS` predeterminado 5000 → 3000 (dimensionado para hermes3:8b en un contexto de trabajo de 8K bajo el perfil `dev-rtx5080`); política de fallo suave invertida en la llamada al crítico (cualquiera de los 5 modos de fallo: transporte / análisis / etiqueta no válida / razón vacía / tiempo de espera; por defecto, `frame_excluded: true` con la razón `critic_unavailable`, no admisión); semántica de promoción: las afirmaciones `frame_excluded` no bloquean la promoción de la sección; el traspaso del trabajo colaborativo muestra `frame_excluded` como su propio conjunto separado de los aceptados / reparados / rechazados. **Requiere `ollama-intern-mcp@^2.4.0`**. 1013/1013 pruebas de vitest superadas (901 → 1013, +112 pruebas). **Los cuatro paquetes congelados verifican byte a byte contra las líneas base de v0.3.3.** **No es una versión v1**; el trabajo de preparación para v1 continúa; consulte [`docs/roadmap.md`](docs/roadmap.md). Consulte [`docs/release-notes/v0.8.0.md`](docs/release-notes/v0.8.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.7.0 — Refuerzo de la seguridad del conjunto de pruebas (dogfood swarm)** — publicado en npm como `@mcptoolshop/research-os@0.7.0`, 11 de mayo de 2026. Se ejecutó un conjunto de pruebas (dogfood swarm) de cuatro etapas (errores/seguridad, resiliencia proactiva, humanización del operador, mejora de la presentación) en el árbol v0.6.0. La versión v0.7.0 incluye las mejoras de seguridad: recopilación más segura (intento/captura por URL + preservación del vaciado por excepción para mantener los ID de origen en curso en caso de fallo parcial); indexador resiliente (omisión y advertencia por registro/archivo/sección en caso de JSONL con formato incorrecto); errores estructurados de recuperación (12 subclases de ResearchOSError con enlaces a la guía); retroalimentación del progreso (`--no-progress` / `--progress` con detección automática de TTY durante la revisión / recopilación / contradicción-mapa / empaquetado-publicación); correcciones de acciones orientadas al operador (`pack publish --force`, frase canónica de reemplazo destructivo anclada en 8 superficies con prueba de regresión; se corrigió el error tipográfico del texto del comando `IndexNotBuiltError` y se agregó una prueba de registro del texto del comando; se actualizó la guía para cada error en las 12 subclases de ResearchOSError); higiene de la cadena de suministro (anclaje SHA de la acción CI + denegación predeterminada de permisos: contenidos: lectura; cobertura del ecosistema Dependabot /site + github-actions); dos nuevas páginas de la guía (`recovery.md`, `known-limitations.md`); mejora de la presentación (frase canónica de regresión, reordenamiento de la barra lateral, llamadas `:::caution` en acciones destructivas). 901/901 pruebas superadas con vitest (713 → 901, +188 pruebas). **Los cuatro paquetes congelados verifican byte a byte que coinciden con las líneas base de v0.3.3.** **No es una versión v1** — el trabajo para la preparación de v1 continúa; consulte [`docs/roadmap.md`](docs/roadmap.md) y [`docs/dogfood-swarm-proof.md`](docs/dogfood-swarm-proof.md). Consulte [`docs/release-notes/v0.7.0.md`](docs/release-notes/v0.7.0.md) y [CHANGELOG.md](CHANGELOG.md).

**v0.6.0** — publicado en npm como `@mcptoolshop/research-os@0.6.0`, 10 de mayo de 2026. La versión v0.6.0 cierra el Experimento 6 con evidencia de confianza del revisor: research-os ahora puede producir una línea base canónica reproducible y atribuible. Incluye: opciones deterministas del revisor en la ruta de revisión de producción (`review_profiles.<name>.reviewer_options` en `research.yaml`); compatibilidad retroactiva del esquema de puerta para artefactos congelados anteriores a v0.3.3 (F-53); la salida de la revisión revela las condiciones de muestreo directamente en `review.json` y `review.md` (F-54); se comprometió el recibo agregado determinista canónico (`hermes-two-pass-deterministic`, `temperature:0, seed:7`). **No se admitió ninguna línea base confiable.** `hermes-two-pass-deterministic=failed` (brecha de capacidad del modelo estructural en el vocabulario de decisión, no varianza). **Hermes no se promociona a `trusted_baseline`.** La ventaja es el mecanismo, no un recibo exitoso. No hay cambios en la puerta, congelación o leyes de síntesis. Los cuatro paquetes congelados verifican byte a byte que coinciden. 713/713 pruebas superadas con vitest. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/experiment-6-proof.md`](docs/experiment-6-proof.md).

**v0.5.0** — publicado en npm como `@mcptoolshop/research-os@0.5.0`, 10 de mayo de 2026. La versión v0.5.0 hace que la calibración del revisor sea duradera. Un perfil de revisor no se considera confiable solo porque se ejecutó una vez; obtiene un estado a través de recibos estructurados de fallas controladas y agregación de múltiples ejecuciones. Incluye: esquema de recibo de calibración estructurado (`seeded-v1.{json,md}`, validado con Zod, cuatro etiquetas de estado); conjunto de pruebas de múltiples ejecuciones (`--runs <n>`, aislamiento por ejecución, barras PASS/FAIL basadas en la mediana, degradación por fallas recurrentes); barra del vocabulario de decisión consciente de la arquitectura; búsqueda de recibos relativa al paquete en `review-promote`. **No se admitió ninguna línea base confiable:** `hermes-two-pass=failed` (agregado, 3 ejecuciones), `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`. research-os ahora puede negarse a confiar en un perfil de revisor cuando las fallas controladas repetidas no respaldan la confianza. **No hay cambios en la puerta, congelación o leyes de síntesis. Los cuatro paquetes congelados verifican byte a byte que coinciden.** 671/671 pruebas superadas con vitest. Consulte [CHANGELOG.md](CHANGELOG.md).

**v0.4.0** — publicado en npm como `@mcptoolshop/research-os@0.4.0`, 10 de mayo de 2026. La versión v0.4.0 hace que la identidad del origen sea duradera. Las reglas deterministas del tipo de origen gestionan la mayoría repetible, los registros de anulación conservan las correcciones del operador entre las recopilaciones y `source-card audit` reemplaza las comprobaciones de deriva del script provisional con una superficie CLI de primera clase. Incluye: clasificador centralizado del tipo de origen (Componente B — `classifySourceType`, 11 proveedores canónicos, `source-type-rules.json`); registro de anulación de la tarjeta de origen (Componente A — `source-card-overrides.jsonl`, subcomandos `validate` + `list`); y CLI de auditoría de la tarjeta de origen (Componente D — `research-os source-card audit --pack <dir>`, 7 tipos de hallazgos, artefactos JSON + Markdown, `--apply --from` ruta de aplicación). F-46: corrección cosmética; los manifiestos del paquete ahora marcan la versión binaria activa en lugar de la versión congelada en `research.yaml` en pack-init. **No hay cambios en la puerta, congelación o leyes de síntesis. Los cuatro paquetes congelados existentes verifican byte a byte que coinciden.** 620/620 pruebas superadas con vitest. Consulte [CHANGELOG.md](CHANGELOG.md) y la [página de la guía de auditoría de la tarjeta de origen](https://mcp-tool-shop-org.github.io/research-os/handbook/source-card-audit/).

**v0.3.3** — publicado en npm como `@mcptoolshop/research-os@0.3.3`, 10 de mayo de 2026. Incluye la claridad de la semántica de la puerta obtenida por Pack-3 (durabilidad de la exportación/tiempo de ejecución de Godot, paquete #3 de 3 del Experimento 3). La salida de la puerta ahora incluye el editor + los recuentos primarios con alcance de sección junto con los recuentos a nivel de paquete (F-43); `no_source_cluster_monopoly` se cambió de WARN a un diagnóstico informativo (F-41). **El comportamiento de aprobación/rechazo no ha cambiado; los paquetes congelados existentes verifican byte a byte que coinciden.** 570/570 pruebas superadas con vitest. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**v0.3.2** — publicado en npm como `@mcptoolshop/research-os@0.3.2`, 9 de mayo de 2026. Incluye la contabilización normalizada de las reclamaciones aceptadas, teniendo en cuenta la admisión de `pack publish`. La comprobación estricta de igualdad entre `claim-reviews.jsonl` y `pack-audit.json::accepted_claims` se reemplaza por una comparación de conjuntos efectivos: las reclamaciones aceptadas son identificadores únicos (`claim_id`) cuya última decisión revisada canónica es `accepted_for_synthesis` (la última decisión prevalece por cada `claim_id`). Los paquetes congelados cuyo recuento de auditoría heredada difiere del conjunto efectivo ahora se admiten con una advertencia en lugar de rechazarse; el archivo de auditoría heredado se conserva textualmente (Ley 15), mientras que el manifiesto del archivo refleja el recuento normalizado. El rechazo sigue siendo estricto para los `claim_id` fantasma, las decisiones incompatibles duplicadas y las puertas que no cumplen con los requisitos para la síntesis. Obtenido en la sesión K del experimento 3 XRPL pack: se rechazó la publicación del paquete debido a una discrepancia real en la unión de un libro mayor cerrado (la sección 07 tenía 24 filas sin procesar `accepted_for_synthesis`, pero solo 19 `claim_id` únicos debido a ventanas de revisión superpuestas). 558/558 pruebas de vitest aprobadas. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — publicado en npm como `@mcptoolshop/research-os@0.3.1`, 9 de mayo de 2026. Incluye exenciones de ámbito de sección para la fuente base (`primary_source_waiver.section_waivers[]`) más el reconocimiento por parte del revisor, de modo que una conclusión de `source_cluster_monopoly` a nivel de sección se convierta en una advertencia visible en lugar de redirigir automáticamente todas las reclamaciones a `needs_source_repair`. Obtenido en la sesión 2 del experimento 3 XRPL pack: las secciones del protocolo canónico (cadenas de base única, especificaciones de API de jardín amurallado, documentos de organismos de normalización) invirtieron la suposición de que la diversidad de los editores es un indicador de la calidad de la información. 540/540 pruebas de vitest aprobadas. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Exenciones de fuente con ámbito de sección:** úselas cuando la diversidad del editor sea estructuralmente incompatible con la fuente de información de la sección, no cuando una sección simplemente no haya podido encontrar suficientes fuentes. `reason` aplicado por esquema + `compensating_controls[]` no vacío. La política del paquete `primary_source_waiver_allowed: false` bloquea tanto las exenciones a nivel de paquete como las de ámbito de sección. El método alternativo a nivel de paquete `min_independent_publishers: 0` anterior a la v0.3.1 ahora está en desuso; los paquetes congelados existentes siguen siendo válidos según sus recibos actuales. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) y el [manual del operador de research-packs](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publicado el 9 de mayo de 2026. Se incluyó la opción `--detector <auto|heuristic|ollama-intern>` en `contradict map` (corrección del bloqueador de cadena F-09 del experimento 3, sesión 1, paquete XRPL). 527/527 pruebas de vitest aprobadas. La selección del detector ahora es una opción explícita para el operador en lugar de una secuencia dependiente del estado de la variable de entorno; el modo se anuncia visiblemente en cada ejecución. Consulte [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publicado el 9 de mayo de 2026. Se incluyó `research-os pack publish` (experimento 2) y la corrección del predicado de preparación del patrón 2. 515/515 pruebas de vitest aprobadas. Consulte [CHANGELOG.md](CHANGELOG.md). Los paquetes congelados se exportan al archivo canónico `research-packs` con un solo comando; el contrato de admisión se aplica mediante código, no una lista de verificación. Consulte [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — paquete de prueba congelado el 8 de mayo de 2026. El paquete en `research-os-packs/research-os-spec/` (repositorio secundario) alcanzó la fase de congelación con 296 reclamaciones aceptadas en 8 secciones, 17 con una disposición asignada, 30 modificadas por el operador, 0 bloqueadores activos de reparación, 0 contradicciones sin resolver y todas las puertas con `synthesis_eligible=true`. Dieciséis leyes fundamentales acumulativas. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para conocer los siete hallazgos y las huellas del recibo de congelación.

**monorepositorio de archivo research-packs:** disponible en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) con cuatro paquetes: `research-os-self-dogfood` (v0.1, paquete de prueba, 296 reclamaciones aceptadas, 8 secciones), `comfyui-workflow-durability` (experimento 1, 302 reclamaciones aceptadas, 8 secciones), `xrpl-creator-token-durability` (paquete #2 del experimento 3) y `godot-export-runtime-durability` (paquete #3 del experimento 3). Todos los paquetes SUPERAN la prueba `verify-pack.mjs`.

**Experimento 1 de v1 (Durabilidad del flujo de trabajo de ComfyUI):** CERRADO el 9 de mayo de 2026. Las 8 secciones en Terminal A, paquete congelado, archivo disponible. Consulte [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) y [`docs/roadmap.md`](docs/roadmap.md).

### Lo que research-os no es (y v0.12.1 no pretende ser)

- No se ha comprobado que funcione correctamente sin la intervención de un operador en los paquetes más recientes. La versión 0.12.0 cerró las pruebas de la versión 0.3 (se demostró que funciona correctamente sin la intervención de un operador a nivel de defensa; aún no se ha demostrado que funcione correctamente sin la intervención de un operador a nivel de cobertura, lo que representa una mejora en el proceso implementada en la versión 0.3); la prueba de la versión 0.4 frente a la versión 0.12.0 arrojó como resultado "PASÓ CON CONDICIONES" (no cumple con los requisitos de autorización), se preservó el nivel mínimo de defensa y se demostró sustancialmente que funciona correctamente sin la intervención de un operador a nivel de sección, con un único modo de fallo en la fase final. La versión 0.12.1 corrige ese único modo de fallo (R-018). La nueva ejecución de la versión 0.4 frente a esta versión de npm se realiza en una sesión independiente y es un requisito previo para que funcione correctamente sin la intervención de un operador en la fase final.
- No ha sido probado exhaustivamente por usuarios externos más allá de las fases de prueba interna y las cuatro ejecuciones de pruebas que requieren que el sistema funcione correctamente sin la intervención de un operador. Se cerraron seis experimentos de prueba interna: uno autorreferencial, cinco con dominios externos (ComfyUI, XRPL, Godot, calibración de revisores, revisor determinista), además de las ejecuciones de pruebas que requieren que el sistema funcione correctamente sin la intervención de un operador de las versiones 0.1 / 0.2 / 0.3 / 0.4, lo que dio como resultado 18 problemas identificados (R-001 a R-005 se cerraron en la versión 0.10.0, R-007 a R-011 se cerraron en la versión 0.11.0, R-012 a R-017 se cerraron en la versión 0.12.0 y R-018 se cerró en la versión 0.12.1). El uso externo del sistema a gran escala sigue siendo un trabajo futuro.
- No es una herramienta completa para generar paquetes completos. La versión 0.12.1 hereda el ámbito de sección (`synth section`) y el ámbito de paquete parcial (`synth pack --partial`) de la versión 0.9, cada uno con una divulgación explícita sobre si el paquete está listo para su uso. Para generar un paquete completo, aún se requiere un paquete `synthesis_ready` y que un humano (o Cowork) realice la tarea utilizando los ID de afirmaciones aceptadas a través de `synth workspace`.
- No es una validación de ningún modelo de revisor. La versión 0.12.1 no incluye por defecto un perfil de revisor `trusted_baseline`; los comprobantes de calibración son pruebas, no una validación. Los comprobantes de calibración existentes de la versión 0.6.0 son anteriores a la arquitectura MCP de la versión 0.8.0 y no se han vuelto a validar bajo el esquema MCP. Consulte la [página del manual de calibración de revisores](https://mcp-tool-shop-org.github.io/research-os/handbook/reviewer-calibration/).
- No está exento de artefactos históricos en los paquetes congelados. Los paquetes congelados anteriores a la versión 0.4 contienen `research_os_version: '0.1.0'` debido a una constante de configuración codificada previamente a la versión 0.4; la corrección se implementó en la versión 0.4.0, pero los paquetes congelados anteriores son inmutables según la Ley 15 (consulte [`handbook/known-limitations`](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/)).
- No se ha verificado su procedencia en npm. La verificación de la procedencia en Sigstore se pospone para una versión futura; verifique los paquetes npm de la versión 0.12.1 a través de package-shasum y el commit de lanzamiento de GitHub.
- No representa una mejora significativa en comparación con un entorno basado en la nube. El análisis del producto en `local-first-vs-cloud-research/` de la versión 0.7.x identificó las ventajas de la nube en cuanto a legibilidad y carga de trabajo del operador; la versión 0.12.1 no afirma haber superado esas limitaciones.

### Limitaciones conocidas

La versión 0.12.1 incluye tres limitaciones conocidas visibles para el operador que se han mantenido de las versiones anteriores. Cada una de ellas está documentada en la [página de limitaciones conocidas del manual](https://mcp-tool-shop-org.github.io/research-os/handbook/known-limitations/) y en [CHANGELOG.md](CHANGELOG.md). Ninguna impide el lanzamiento; todas tienen un camino definido para su recuperación o mitigación.

- **B-E-001: la marca de versión del paquete congelado anterior a la versión 0.4 es un artefacto histórico.** Los paquetes congelados publicados en las versiones 0.3.3 a 0.6.0 contienen `research_os_version: "0.1.0"` en `pack.manifest.json` y `pack/research.yaml` debido a una constante de configuración codificada previamente a la versión 0.4. La corrección se implementó en la versión 0.4.0 (la configuración ahora importa la variable `RESEARCH_OS_VERSION` actual); los paquetes congelados anteriores son inmutables según la Ley 15. Los archivos JSON dentro de los paquetes afectados ya contienen sus versiones actuales.
- **B-E-004: la verificación de la procedencia en npm se pospone para una versión futura.** El archivo tarball de npm de la versión 0.12.1 solo se verifica a través de package-shasum. La migración del flujo de publicación a un flujo de trabajo de CI con sigstore OIDC entra en conflicto con el principio de "traducción antes de la publicación" (TranslateGemma 12B se ejecuta localmente); la migración está prevista para una versión futura. Verifique los paquetes npm de la versión 0.12.1 a través de package-shasum y el commit de lanzamiento de GitHub.
- **B-A-003: la migración del esquema del indexador está documentada, pero no se aplica.** La versión 0.12.1 incluye un entero `SCHEMA_VERSION` en el lado de escritura, pero no un ejecutor de migración en el lado de lectura. Tras una actualización documentada de `SCHEMA_VERSION`, elimine `.research-os/index.sqlite` y vuelva a ejecutar `research-os index build --all`. El paquete en sí no se ve afectado; el indexador es una capa de aceleración sobre la evidencia + las afirmaciones (Ley 8); la reconstrucción es idempotente.

**No se admite ningún perfil de revisor `trusted_baseline` en la versión 0.12.1.** Se trata de una postura de confianza intencional, no de una deficiencia: los comprobantes de calibración del repositorio (`hermes-two-pass=failed`, `mistral-nemo-two-pass=conditional_pass`, `hermes-single-pass=comparison_only`, `hermes-two-pass-deterministic=failed`) registran la evidencia. La confianza se gana a través de la recuperación repetida de fallos simulados, no se asume. Estos comprobantes son anteriores a la arquitectura MCP de la versión 0.8.0 y no se han vuelto a validar bajo el esquema MCP.

## Hoja de ruta para la versión 1.0

La versión 1.0 es un estado que se debe lograr, no una fecha de lanzamiento. Se cerraron los seis experimentos de prueba interna (Exp1–Exp6, del 8 al 11 de mayo de 2026), cada uno de ellos generando un paquete de investigación congelado admitido en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). El proceso permitió obtener la versión 0.2.0 `research-os pack publish` + Pattern 2 (Experimento 2), la bandera `--detector` de la versión 0.3.0 (F-09), las exenciones con ámbito de sección de la versión 0.3.1 (F-10/F-11), la contabilidad normalizada de afirmaciones aceptadas de la versión 0.3.2 (F-36), la claridad en la semántica de las pruebas de la versión 0.3.3 (F-43/F-41), la disciplina de la fuente de verdad de la versión 0.4.0 (F-27/F-47/F-46), la calibración del revisor como contrato de confianza duradero de la versión 0.5.0 (F-48/F-49/F-50) y la línea base del revisor determinista de la versión 0.6.0 (F-53/F-54). La preparación para el lanzamiento de la versión 1.0 está en curso a través de una serie de pruebas de salud y refinamiento; la arquitectura se mantiene constante durante todo el proceso. El plan completo se encuentra en [`docs/roadmap.md`](docs/roadmap.md).

## Licencia

MIT
