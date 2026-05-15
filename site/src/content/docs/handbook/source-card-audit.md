---
title: Source-Card Audit
description: Using `research-os source-card audit` to inspect source-type drift, surface missing publishers, and apply operator corrections via the override ledger.
sidebar:
  order: 10
---

The `source-card audit` command is the operator's primary tool for inspecting source-identity drift across a pack. It is read-only by default — safe to run at any time, including on frozen packs — and produces both a human-readable Markdown report and a machine-readable JSON artifact at `audits/source-card-audit.{md,json}`.

---

## When to run

Run `source-card audit` after:

- **Re-gather** — new evidence may have shifted source types or introduced previously-unseen publishers.
- **Import of external source cards** — cards authored outside the classifier ruleset may carry incorrect types.
- **Preparing for freeze** — confirm there are no outstanding mismatches or missing publishers before locking the pack.
- **Post-override verification** — confirm that a `--apply` batch resolved the findings it was meant to address.

It is safe to run on frozen packs. The audit will produce a report but refuse `--apply` if `audits/freeze-receipt.json` is present.

---

## Read-only audit

```bash
# Audit the pack in the current directory
research-os source-card audit

# Audit a specific pack root
research-os source-card audit --pack /path/to/pack

# Print the JSON report to stdout (also writes audits/source-card-audit.json)
research-os source-card audit --pack /path/to/pack --json
```

The command exits 0 regardless of finding counts — findings are informational, not gate-blockers. The operator decides which findings require correction.

---

## The 7 finding kinds

Each source card receives exactly one finding, assigned by the following precedence order:

| Priority | Kind | Meaning |
|----------|------|---------|
| 1 | `github_ui_html` | URL matches the GitHub UI HTML rule. These are repository browse pages, issue trackers, and PR views — not raw source content. Convert to raw URLs or replace with a content-bearing source. |
| 2 | `classifier_flagged` | URL matched a non-github flagged classifier rule. Investigate the `classifier_rule_hint` field for the specific flag. |
| 3 | `source_type_mismatch` | The classifier's rule-matched type disagrees with the card's `source_type`. Only fires when `classifier_rule_hint !== 'no-rule-match'` — extractor-typed cards (e.g. arxiv.org, which the extractor types `primary`) are not flagged when the classifier has no matching rule. |
| 4 | `publisher_mismatch` | Classifier and card disagree on publisher. Forward-compatible bucket — cannot fire in v0.4.0 (no `publisher_hint` in ClassificationResult). |
| 5 | `publisher_missing` | Card's `publisher` field is `null` and no publisher override is in effect. |
| 6 | `override_applied` | An operator override is in effect for this card (source type or publisher). The card is informational — no corrective action needed. Counted under the `no_action` total. |
| 7 | `no_action` | Card is clean. Classifier agrees with the card's type; publisher is present; no overrides. |

---

## Reading the Markdown report

The report at `audits/source-card-audit.md` contains:

- **Totals table** — `cards_scanned`, `cards_with_overrides`, `source_type_mismatches`, `publisher_missing`, `github_ui_html`, `classifier_flagged_other`, and `no_action` (which includes `override_applied` cards).
- **Findings table** — one row per card that is not `no_action`, showing `source_id`, URL (truncated to 60 chars), finding kind, raw type, classifier type, effective type, and whether an override is in effect.

Focus first on `github_ui_html` and `source_type_mismatch` rows — these indicate actionable classification errors. `publisher_missing` rows are lower priority but matter for downstream synthesis attribution.

---

## Authoring override entries

Override entries are JSON objects. The override schema (validated by `validateSourceCardOverride`) requires:

```json
{
  "source_id": "src_aabbccddeeff",
  "reason": "Classifier has no rule for arxiv.org; extractor-assigned primary type is correct.",
  "new_source_type": "primary"
}
```

Or for a publisher correction:

```json
{
  "source_id": "src_aabbccddeeff",
  "reason": "Publisher field was null; confirmed publisher is 'arXiv'.",
  "new_publisher": "arXiv"
}
```

A single entry may set both `new_source_type` and `new_publisher`. The `reason` field is required and must be non-empty.

Collect entries into a JSON array file:

```json
[
  {
    "source_id": "src_aabbccddeeff",
    "reason": "GitHub repository browse page — replace with raw README URL.",
    "new_source_type": "docs"
  },
  {
    "source_id": "src_112233445566",
    "reason": "Publisher missing; confirmed from domain.",
    "new_publisher": "Mozilla"
  }
]
```

---

## Applying overrides with `--apply --from`

```bash
research-os source-card audit \
  --pack /path/to/pack \
  --apply \
  --from /path/to/proposed-overrides.json
```

Behaviour:

- **All-or-nothing** — all entries in the JSON array are validated before any write. If any entry fails schema validation, the entire batch is rejected and the ledger is unchanged.
- **Frozen pack refusal** — if `audits/freeze-receipt.json` is present, `--apply` is refused. Read-only audit is still allowed.
- **Idempotent ledger** — the ledger is append-only; re-applying the same entry adds a second row. The effective view (`getEffectiveSourceType`, `getEffectivePublisher`) takes the latest entry for a given `source_id`, so duplicate entries are harmless but unnecessary.

After a successful apply, re-run the audit to verify the findings have shifted to `override_applied`:

```bash
research-os source-card audit --pack /path/to/pack
```

---

## Full correction loop

```
1. research-os source-card audit --pack <dir>
   → inspect audits/source-card-audit.md

2. Author a JSON array of override entries for the findings you want to correct.
   Save to proposed-overrides.json.

3. research-os source-card audit --pack <dir> --apply --from proposed-overrides.json
   → all entries validated, ledger appended atomically

4. research-os source-card audit --pack <dir>
   → confirm previously-flagged cards now show override_applied or no_action

5. Re-gather (if you updated source cards themselves, not just overrides).
   → re-audit after re-gather to confirm clean state before freeze.
```

The ledger at `evidence/source-card-overrides.jsonl` is preserved through freeze and exported in the `pack publish` archive — operator corrections survive the pack lifecycle.

---

## Severities (v0.10.0+)

In addition to the 7 finding kinds (which classify what's wrong with a source card's metadata), v0.10.0 introduces **severities** — upstream defenses that classify whether a source card's fetched content is trustworthy at all. Severities run as a pure function (`detectSeverities`) at audit time and at claim-extract time, so both surfaces see the same effective state.

| Severity | Action | Trigger |
|----------|--------|---------|
| `bot_check_or_captcha_detected` | HARD FAIL — quarantine from claim extraction | Compound: marker (`captcha` / `incapsula` / `cloudflare challenge` / `please verify you are human` / `robot check` / `_Incapsula_Resource` / `access denied`) paired with body-shape evidence (≤100 prose words by default). Independent signals: <2KB body with >50% `<script>` density; substantial scripts with ≤50 prose words after stripping; HTTP 200 + response time ≤100ms + body <2KB. |
| `extraction_suspect_word_count_mismatch` | WARN AND QUARANTINE | Fetched body word count ≤200 AND extracted card text ≥800 words AND ratio ≥4. |

Quarantine excludes the source from claim extraction. Source cards are still written normally so the operator can inspect the fetched body and the extracted card side-by-side.

### Tuning thresholds per pack

Optional `audit.severity_thresholds` block in `research.yaml`. Each field is optional; absent fields fall back to `DEFAULT_SEVERITY_THRESHOLDS`.

```yaml
audit:
  severity_thresholds:
    bot_check:
      max_body_words_with_marker: 100
      min_script_density_ratio: 0.5
      max_body_bytes_with_script_density: 2048
      max_fetch_duration_ms_with_small_body: 100
    extraction_word_count_ratio:
      min_extracted_words: 800
      max_body_words: 200
      min_ratio: 4
```

Defaults are starting points, not load-bearing. Raise `max_body_words_with_marker` if legitimate brief content trips R-003; raise `min_script_density_ratio` if heavy-JS-but-legitimate pages trip; lower `min_ratio` if confabulation happens at 2-3× ratios.

### Operator override via `clear_severities[]`

The v0.4 source-card-overrides ledger schema gains a third optional field. At least one of `new_source_type`, `new_publisher`, OR `clear_severities` must be present.

```json
{
  "source_id": "src_aabbccddeeff",
  "reason": "Source is a legitimate CAPTCHA-research paper; markers appear in body prose, not in challenge content.",
  "clear_severities": ["bot_check_or_captcha_detected"]
}
```

Cleared severities are removed from the effective findings — claim extraction proceeds; audit kind drops back to existing precedence (e.g., `override_applied`). The override ledger remains append-only; clearing is a recorded operator decision, not a deletion.

A single entry may combine `clear_severities` with `new_source_type` or `new_publisher` corrections — the existing all-or-nothing batch + frozen-pack-refusal semantics apply unchanged.

### Gather-layer informational detection (v0.10.0+ R-004 hybrid)

Gather runs a lightweight marker+body-words check (R-003 Signal A only) using the same canonical `BOT_CHECK_MARKERS` const. When it fires, `fetch-log.jsonl` records `gather_outcome: "bot_check_detected"` and the operator sees `! bot_check_detected (marker:<x>, body_words=<n>)` on the progress line. Gather-layer detection is informational; the audit-layer R-003 is authoritative for the multi-signal quarantine path (per-pack thresholds, script-density, fast-response, full `reasons[]` in audit findings).
