<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Una herramienta de línea de comandos (CLI) que transforma un tema abierto en un **paquete de investigación estructurado**, un repositorio organizado donde Claude, Cowork o un conjunto de herramientas pueden trabajar durante horas sin generar información falsa ni distorsionar la investigación.

## ¿Qué es?

`research-os` es la capa de control entre "quiero investigar X" y una base de evidencia sólida y verificable. Separa las pistas de descubrimiento de la recopilación de evidencia, la extracción de datos de la validación de afirmaciones, la detección de contradicciones de la resolución de contradicciones, y las decisiones de revisión de las conclusiones. Cada paso se registra en un registro de solo escritura; cada decisión se calcula a partir de esos registros, no se afirma arbitrariamente.

No es un generador de informes. No es un marco de orquestación de modelos de lenguaje (LLM). No escribe la síntesis por usted. Impone las condiciones bajo las cuales la síntesis puede comenzar.

**La versión 0.1 se ha utilizado exactamente una vez: por sí misma, sobre sí misma.** Ese único uso reveló siete errores en `research-os`, cada uno corregido antes de esta versión. El registro de pruebas, que incluye siete sesiones, dos patrones de integración, 463 casos de prueba `vitest` y un paquete finalizado, se encuentra en [`docs/dogfood-proof.md`](docs/dogfood-proof.md). Manual de usuario: <https://mcp-tool-shop-org.github.io/research-os/handbook/>.

## Las 16 leyes fundamentales

| # | Ley |
|---|-----|
| 1 | No hay síntesis antes de la verdad de la fuente. |
| 2 | La recopilación es evidencia; la extracción es interpretación. |
| 3 | Los modelos pueden interpretar fragmentos de la fuente; no pueden crear fragmentos de evidencia. |
| 4 | La extracción puede generar demasiada información; la síntesis no puede heredar esa abundancia. |
| 5 | El mapeo de contradicciones revela tensiones; no resuelve, sintetiza ni decide qué afirmación es correcta. |
| 6 | Las restricciones deciden si una sección es elegible para la síntesis. No sintetizan ni ocultan los fallos. |
| 7 | La revisión crítica evalúa la integridad de la investigación. No sintetiza ni reescribe la verdad de la fuente. |
| 8 | La indexación hace que la verdad de la investigación sea consultable. No crea nueva verdad ni se convierte en la fuente oficial. |
| 9 | La transferencia a Cowork genera instrucciones operativas a partir de la verdad de la investigación. No crea verdad ni evita las restricciones. |
| 10 | El espacio de trabajo de síntesis organiza la verdad de la investigación aceptada para Cowork. No crea síntesis ni evita el modo de transferencia. |
| 11 | La auditoría del paquete agrega la verdad de la investigación existente. No crea nueva verdad ni oculta la evidencia a nivel de sección. |
| 12 | El descubrimiento propone pistas; solo la recopilación produce evidencia. |
| 13 | Un revisor no es confiable hasta que las pruebas de fallos demuestran su capacidad de recuperación. |
| 14 | La abundancia de afirmaciones no es sinónimo de calidad de la investigación. Las afirmaciones deben ser validadas antes de poder competir para la síntesis. |
| 15 | La congelación fija la verdad de la investigación completada. No completa la investigación inconclusa ni convierte el estado de reparación en evidencia. |
| 16 | Las exenciones relajan las restricciones de la fuente; no pueden crear evidencia. |

**Ley 3** — el modelo de lenguaje nunca crea texto de evidencia. `research-os` crea un registro de extractos determinista (con identificadores estables como `ex_<id_hex_de_la_fuente>_001`); el modelo de lenguaje elige los identificadores de los extractos; `research-os` copia el texto literal. La clase de error "parafrasear como cita" es estructuralmente imposible.

**Ley 14** — entre la extracción y la revisión, `research-os claim triage` elimina duplicados, limita la contribución por fuente y reserva los candidatos de bajo rendimiento. El triage NO modifica `claims.jsonl`; las afirmaciones reservadas permanecen en el registro canónico.

## La cadena de flujo de trabajo de la versión 0.1

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

Cada paso es un comando de la interfaz de línea de comandos (CLI). Cada paso escribe en archivos que solo se pueden añadir, no modificar. Ningún paso sintetiza, resuelve o crea nueva información verificable; esos invariantes se aplican, no se confían. La revisión acepta, rechaza o solicita correcciones para las afirmaciones propuestas; el proceso de "gate" utiliza estas decisiones de revisión para calcular la elegibilidad para la síntesis; la fase de "freeze" es el bloqueo final de integridad que impide marcar un paquete como completado a menos que todas las capas estén de acuerdo. Consulte [docs/dogfood-proof.md](docs/dogfood-proof.md) para la prueba de la versión 0.1 que demuestra la integridad de la cadena de principio a fin.

Esta es la alternativa estructural a *búsqueda → resumen → informe detallado*. La cadena es el producto.

## Instalación

**Requisitos:** Node.js ≥ 20.

```bash
# From source (v0.1.0 is not yet published to npm)
git clone https://github.com/mcp-tool-shop-org/research-os.git
cd research-os
npm install
npm run build
npm link   # makes `research-os` available on your PATH
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
```

**Para un ejemplo práctico**, consulte el paquete de prueba en `research-os-packs/research-os-spec/`: cada archivo, cada registro, cada disposición, cada huella digital de la fase de "freeze", todo almacenado en el disco en registros de solo escritura. Ese paquete es el que generó `docs/dogfood-proof.md`.

**Requiere [ollama-intern-mcp](https://github.com/mcp-tool-shop-org/ollama-intern-mcp) ejecutándose localmente** para la extracción, clasificación, revisión y descubrimiento de modelos de lenguaje. El modelo predeterminado es `hermes3:8b`; puede cambiarlo con `OLLAMA_INTERN_MODEL=<modelo>`. Establezca `OLLAMA_HOST` si Ollama no se ejecuta en el puerto predeterminado `localhost:11434`.

## Glosario

| Término | Significado |
|------|---------|
| `research-os` | El plano de control / CLI / mecanismos de control / ley de orquestación (este repositorio) |
| `research-pack` | El archivo generado para un esfuerzo de investigación. |
| `research section` | Una unidad de investigación delimitada dentro de un paquete. |
| `research receipt` | Prueba de que una sección ha superado las comprobaciones de origen/afirmación/mecanismo de control. |

## Seguridad

`research-os` es una herramienta de línea de comandos que funciona principalmente localmente. Lee y escribe archivos dentro del directorio del paquete de investigación al que la apunta, y (cuando se utiliza `gather`) realiza solicitudes HTTP salientes para obtener las URL de origen que proporciona. No: ejecuta un servidor, acepta conexiones entrantes, almacena credenciales ni envía datos de telemetría. No se escriben secretos en los archivos del paquete. Consulte [SECURITY.md](SECURITY.md) para la política de notificación de vulnerabilidades.

## Estado

**v0.1.0** — Congelado el 08 de mayo de 2026. El paquete de prueba en `research-os-packs/research-os-spec/` (repositorio relacionado) alcanzó la fase de "freeze" con 296 afirmaciones aceptadas en 8 secciones, 17 dispuestas, 30 modificadas por el operador, 0 bloqueadores de corrección activos, 0 contradicciones sin resolver, y todos los mecanismos de control con `synthesis_eligible=true`. 463/463 pruebas de vitest superadas. Dieciséis leyes fundamentales acumuladas. Consulte [`docs/dogfood-proof.md`](docs/dogfood-proof.md) para conocer los siete hallazgos y las huellas digitales de la fase de "freeze".

### Lo que la versión 0.1 no es

- No ha sido probada por usuarios externos. La única ejecución de prueba encontró siete errores.
- Todavía no está disponible en npm. Instale desde el código fuente hasta que se publique en npm.
- No es un generador de contenido. El comando `synth workspace` genera el espacio de trabajo estructurado; los humanos (o Cowork) escriben el contenido en función de los ID de las afirmaciones aceptadas.
- No tiene una API estable según las convenciones de versiones semánticas. La versión 1.0.0 se lanzará después de que los usuarios externos hayan validado la interfaz a lo largo del tiempo.

### Limitaciones conocidas

- **La información sobre el origen del extractor no es visible en la costura de la puerta.** Una sección puede superar el umbral de aceptación si se utilizan criterios de evaluación alternativos cuando el extractor calibrado (Ollama con el modelo configurado) no está disponible. Se ha registrado como una debilidad conocida; en el futuro, se informará sobre las reclamaciones aceptadas por el extractor y se requerirá un número de reclamaciones aceptadas equivalente al umbral desde la ruta calibrada.
- **La selección del modelo de revisión, más allá de la línea de base calibrada `hermes-two-pass`, no está resuelta.** El ciclo de pruebas internas validó una configuración de revisión; otros modelos necesitan su propia calibración para detectar fallos antes de que puedan ser considerados fiables.
- **El paquete de pruebas internas utilizó `mistral-nemo:12b` para la extracción (el valor predeterminado estándar es `hermes3:8b`).** El sistema generó resultados incorrectos para nombres de secciones que se referían a sí mismos; esto se corrigió mediante la precisión de las consultas (ver manual) y mediante URLs predefinidas por el operador para temas ambiguos.

## Licencia

MIT
