<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Una herramienta de línea de comandos (CLI) que transforma un tema amplio en un "**paquete de investigación**" estructurado: un repositorio organizado donde Claude, Cowork o un conjunto de herramientas pueden trabajar durante horas sin generar información falsa ni distorsionar la investigación.

## ¿Qué es?

`research-os` es la capa de control entre "quiero investigar X" y una base de evidencia estructurada y verificable. Separa las ideas iniciales de la recopilación de evidencia, la extracción de datos de la evaluación de la información, la detección de contradicciones de la resolución de contradicciones, y las decisiones de revisión de la síntesis. Cada paso escribe en un registro de solo escritura; cada decisión sobre la validez se calcula a partir de esos registros, no se afirma directamente.

No es un generador de informes. No es un marco de orquestación de modelos de lenguaje grandes (LLM). No escribe la síntesis por usted. Impone las condiciones bajo las cuales la síntesis puede comenzar.

Los paquetes finalizados se archivan en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs). Están disponibles, con dos paquetes iniciales. Consulte [`docs/roadmap.md`](docs/roadmap.md) para conocer la hoja de ruta de la versión 1.0.

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

**Para un ejemplo práctico**, consulte el paquete de demostración en `research-os-packs/research-os-spec/`: cada elemento, cada registro, cada evaluación, cada huella digital de la versión final, todo en el disco en registros de solo escritura. Ese paquete es el que generó `docs/dogfood-proof.md`.

**Requiere [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) ejecutándose localmente** para la extracción, la evaluación, la revisión y el descubrimiento de información mediante modelos de lenguaje. El modelo predeterminado es `hermes3:8b`; cámbielo con `OLLAMA_INTERN_MODEL=<modelo>`. Establezca `OLLAMA_HOST` si Ollama no se ejecuta en el valor predeterminado `localhost:11434`.

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

## Estado

**v0.3.2** — Publicada en npm como `@mcptoolshop/research-os@0.3.2`, el 9 de mayo de 2026. Incluye una normalización de las reclamaciones aceptadas, teniendo en cuenta la admisión para la publicación de paquetes. La verificación estricta de igualdad entre `claim-reviews.jsonl` y `pack-audit.json::accepted_claims` ha sido reemplazada por una comparación de conjuntos efectivos: las reclamaciones aceptadas son los identificadores únicos (`claim_id`) cuya última decisión de revisión canónica es "aceptada para síntesis" (la última decisión prevalece para cada `claim_id`). Los paquetes congelados cuya cuenta de auditoría heredada difiere del conjunto efectivo ahora se admiten con una advertencia en lugar de ser rechazados; el archivo de auditoría heredado se conserva tal cual (Ley 15), mientras que el manifiesto del archivo refleja la cuenta normalizada. El rechazo sigue siendo absoluto para los identificadores de reclamación fantasma, las decisiones duplicadas incompatibles y las condiciones que no son elegibles para la síntesis. Obtenido a través del Experimento 3 XRPL pack Session K: la publicación del paquete fue rechazada debido a una discrepancia real en el registro de cierre (la Sección 07 tenía 24 filas "aceptadas para síntesis", pero solo 19 identificadores únicos (`claim_id`) debido a ventanas de revisión superpuestas). 558/558 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.3.1** — Publicado en npm como `@mcptoolshop/research-os@0.3.1`, 9 de mayo de 2026. Incluye exenciones de origen con ámbito de sección (`primary_source_waiver.section_waivers[]`) y un reconocimiento por parte del revisor, de modo que una detección de "monopolio de la fuente" a nivel de sección se convierte en una advertencia visible en lugar de redirigir automáticamente todas las afirmaciones a "necesita reparación de la fuente". Obtenido mediante el experimento 3 del paquete XRPL, sesión 2: las secciones de protocolo canónico (cadenas de una sola base, especificaciones de API de jardín vallado, documentos de organismos de normalización) invirtieron la suposición de que la diversidad de editores es un indicador de la calidad de la verdad. 540/540 pruebas de vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md) y [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md).

**Exenciones de origen con ámbito de sección** — Utilícelas cuando la diversidad de editores es estructuralmente incompatible con la fuente de verdad de la sección, no cuando una sección simplemente no ha logrado encontrar suficientes fuentes. Incluye un campo "razón" con control de esquema y una lista no vacía de "controles compensatorios". La política del paquete `primary_source_waiver_allowed: false` bloquea tanto las exenciones a nivel de paquete como las exenciones con ámbito de sección. El truco anterior a la v0.3.1 de `min_independent_publishers: 0` a nivel de paquete está ahora obsoleto; los paquetes congelados existentes siguen siendo válidos según sus recibos existentes. Consulte [`docs/section-scoped-waivers.md`](docs/section-scoped-waivers.md) y el [manual de operación de los paquetes de investigación](https://github.com/mcp-tool-shop-org/research-packs/blob/main/docs/operator-playbook.md).

**v0.3.0** — publicado el 2026-05-09. Se incluyó la opción `--detector <auto|heuristic|ollama-intern>` en `contradict map` (corrección F-09 de bloqueo de cadena del Experimento 3, Sesión 1, paquete XRPL). 527/527 pruebas vitest superadas. La selección del detector ahora es una opción explícita para el operador, en lugar de una variable de entorno dependiente del estado; el modo se muestra claramente en cada ejecución. Consulte [`docs/contradict-map.md`](docs/contradict-map.md).

**v0.2.0** — publicado el 2026-05-09. Se incluyeron el paquete `research-os pack publish` (Experimento 2) y la corrección del predicado de preparación del Patrón 2. 515/515 pruebas vitest superadas. Consulte [CHANGELOG.md](CHANGELOG.md). Los paquetes congelados se exportan al archivo canónico `research-packs` con un solo comando; el contrato de admisión se aplica mediante código, no mediante una lista de verificación. Consulte [`docs/pack-publish.md`](docs/pack-publish.md).

**v0.1.0** — paquete de prueba interna congelado el 2026-05-08. El paquete en `research-os-packs/research-os-spec/` (repositorio hermano) alcanzó el estado de congelación con 296 afirmaciones aceptadas en 8 secciones, 17 gestionadas, 30 anuladas por el operador, 0 bloqueadores de reparación activos, 0 contradicciones sin resolver, y todas las condiciones (`synthesis_eligible=true`) cumplidas. Seis leyes fundamentales acumuladas. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para obtener los siete hallazgos y las huellas digitales de la recepción de la congelación.

**Repositorio monorepo de paquetes de investigación** — disponible en [`mcp-tool-shop-org/research-packs`](https://github.com/mcp-tool-shop-org/research-packs) con dos paquetes iniciales. `comfyui-workflow-durability` (Experimento 1, 302 afirmaciones aceptadas, 8 secciones) y `research-os-self-dogfood` (relleno de la versión 0.1 de la prueba interna, 296 afirmaciones aceptadas, 8 secciones). Ambos paquetes PASAN `verify-pack.mjs`.

**Experimento 1 de la versión 1 (Durabilidad del flujo de trabajo de ComfyUI)** — CERRADO el 2026-05-09. Todas las 8 secciones en Terminal A, paquete congelado, archivo disponible. Consulte [`docs/experiment-1-proof.md`](docs/experiment-1-proof.md) y [`docs/roadmap.md`](docs/roadmap.md).

### Lo que la versión 0.3 no es

- No ha sido probada en condiciones reales por usuarios externos. Dos ciclos de pruebas internas han finalizado: uno autoreferencial y otro de dominio externo, y el Experimento 3 (estabilidad de la API bajo presión externa) está en curso: el paquete #2 de 3 (durabilidad del token de creador de XRPL) está congelado con 251 reclamaciones aceptadas en 7 secciones, a la espera de la admisión para la publicación del paquete en npm v0.3.2. Este ciclo ha cumplido con la bandera v0.3.0 `--detector` (bloqueador de cadena F-09), las exenciones de origen específicas de la sección (F-10/F-11, presión del protocolo canónico) y la normalización de la cuenta de reclamaciones aceptadas (F-36, borde del registro de cierre). Se necesita un ciclo más de dominio externo para completar el Experimento 3.
- No es un generador de síntesis. El comando `synth workspace` genera el espacio de trabajo estructurado; los humanos (o Cowork) escriben el contenido basándose en los identificadores de reclamación aceptados.
- No es estable en la API según la semántica de versiones. La versión v1.0.0 es un estado alcanzado, no una fecha en el calendario; consulte [`docs/roadmap.md`](docs/roadmap.md) para ver los seis experimentos que cierran esta brecha.

### Limitaciones conocidas

- **El origen del extractor no es visible en la interfaz de la condición.** Una sección puede pasar la prueba de afirmaciones aceptadas mientras se basan en afirmaciones heurísticas cuando el extractor calibrado (Ollama con el modelo configurado) no está disponible. Se registra como el Experimento 4 en el plan de trabajo; la futura optimización informará las afirmaciones aceptadas por extractor y requerirá la cantidad de afirmaciones aceptadas del camino calibrado.
- **La selección del modelo de revisión más allá de la línea de base calibrada de `hermes-two-pass` no está resuelta.** El ciclo de prueba interna validó una configuración de revisor; los modelos alternativos necesitan su propia calibración de recuperación de fallos simulados antes de que puedan ser confiables. Experimento 5 en el plan de trabajo.
- **El paquete de prueba interna de la versión 0.1 utilizó `mistral-nemo:12b` para la extracción (el valor predeterminado canónico es `hermes3:8b`).** `hermes3:8b` no estaba disponible en esta plataforma durante el ciclo de la versión 0.1. La divulgación de la sustitución permanece vigente hasta que se produzca una recepción basada en hermes3; Experimento 6 en el plan de trabajo. Para los operadores en plataformas que no tienen `hermes3:8b`, establezca `OLLAMA_INTERN_MODEL` en un modelo disponible; las URL preconfiguradas para el operador y la disciplina de precisión de la consulta (consulte el manual) mitigan las alucinaciones de descubrimiento en temas ambiguos.

## Hoja de ruta para la versión 1.0

La versión 1.0 es un estado alcanzado, no una fecha de lanzamiento. Seis experimentos están pendientes entre la versión 0.1 y la 1.0: un sistema de pruebas internas ("dogfood") que no se refiere a sí mismo (actualmente en desarrollo como el paquete de durabilidad de ComfyUI), un comando `research-os pack publish` que automatiza la exportación al repositorio centralizado `research-packs` (Experimento 2, limitado por el Experimento 1 y que requiere su finalización manual), estabilidad de la API bajo presión externa, la resolución de la brecha de trazabilidad del extractor, la generalización de la calibración de los revisores más allá de `hermes-two-pass`, y una ejecución de referencia limpia en `hermes3:8b`. El Experimento 1 no estará finalizado cuando se "congele" el paquete; se completará cuando el paquete congelado se publique como el primer paquete en el repositorio centralizado `research-packs`, junto con la versión 0.1 del sistema de pruebas internas. El plan completo se encuentra en [`docs/roadmap.md`](docs/roadmap.md). La arquitectura permanece constante; la versión 1.0 profundiza en lo que la versión 0.1 demostró, en lugar de volver a abrir temas ya tratados.

## Licencia

MIT
