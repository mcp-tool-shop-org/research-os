# Adversarial Review: 01-calibration

**Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
**Reviewed at:** 2026-05-07T05:44:10.676Z
**Candidate claims:** 18
**Findings:** 13 (block: 4, warn: 8, info: 1)
**LLM findings rejected (ungrounded):** 0

> Adversarial review judges research integrity. It does not synthesize, rewrite source truth, or erase extraction history. Decisions below are review truth — claims.jsonl is unchanged.

## Effective decisions

- [REJECTED]: 1
- [NEEDS-SCOPE-REPAIR]: 4
- [NEEDS-HUMAN-REVIEW]: 11
- [ACCEPTED]: 2

## Findings

### [BLOCK] hidden_synthesis (fnd_ac28befacd0f)

Claims 2-10 cite irrelevant evidence about knowledge graphs, which does not support their distinct assertions.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_2`, `clm_aaaaaaaaaaaa_ollama_intern_3`, `clm_aaaaaaaaaaaa_ollama_intern_4`, `clm_aaaaaaaaaaaa_ollama_intern_5`, `clm_aaaaaaaaaaaa_ollama_intern_8`, `clm_aaaaaaaaaaaa_ollama_intern_9`, `clm_aaaaaaaaaaaa_ollama_intern_10`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Re-evaluate evidence sourcing for claims 2-10 to ensure alignment with their assertions.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** high
- **Evidence:** All claims 2-10 use the same knowledge graph evidence excerpt, which is unrelated to their specific claims.

### [WARN] definition_drift (fnd_13b00d927869)

Claim 3 misattributes SQLite FTS5 documentation to PostgreSQL, conflating distinct systems.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_3`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Clarify the distinction between SQLite and PostgreSQL in the claim's scope.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** medium
- **Evidence:** Claim 3 asserts PostgreSQL FTS5 features while citing SQLite documentation.

### [WARN] overgeneralized_claim (fnd_a4195171d7a3)

Claim 6 generalizes Wikipedia's mention of 'a few others' to all major search engines.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_6`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Limit the claim to the specific search engines mentioned in the source.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** medium
- **Evidence:** Wikipedia article only notes Google, Bing, and a few others use knowledge graphs.

### [WARN] overgeneralized_claim (fnd_74baf24c988e)

Claim 7 universalizes a single design-intent topic to all research-packs.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_7`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Restrict the claim to the specific case described in the source.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** medium
- **Evidence:** The source only references a single design-intent topic, not all research-packs.

### [BLOCK] recommendation_exceeds_evidence (fnd_a8cdae9b06ff)

Claim 10 contradicts the source's MIT license by asserting a paid license requirement.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_10`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Revise the claim to align with the source's licensing information.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** high
- **Evidence:** Source explicitly states research-os v0.1 uses an MIT license.

### [WARN] hidden_synthesis (fnd_146177a6e64f)

Claim asserts a conclusion not present in the cited source.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_11`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Verify source contains direct evidence of GPT-4 comparison.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** medium
- **Evidence:** Claim 11 cites knowledge graphs but asserts GPT-4 performance without evidence.

### [INFO] valid_but_low_value (fnd_b2775e882d43)

Claim restates context without synthesis-worthy evidence.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_12`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Ground definitions with explicit source citations.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** high
- **Evidence:** Claim 12 defines research-pack as markdown file without source support.

### [WARN] definition_drift (fnd_86a93d0f1968)

Conflicting definitions for 'research-pack' across claims.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_12`, `clm_aaaaaaaaaaaa_ollama_intern_13`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Align terminology with consistent source definitions.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** medium
- **Evidence:** Claim 12 defines research-pack as markdown file vs. Claim 13's Cowork handoff equivalence.

### [WARN] temporal_mismatch (fnd_71cc03229c8a)

Claim cites source from different time period than its asserts.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_14`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Ensure temporal alignment between claim and source.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** high
- **Evidence:** Claim 14 predicts 2026 dominance using 2022 forum post.

### [WARN] scope_widening (fnd_c6c1ca6451a3)

Scope exceeds evidence justification for GPU quantization.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_15`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Restrict scope to source-specific context.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** medium
- **Evidence:** Claim 15 attributes 2018 tutorial to 5080 and hermes3.

### [WARN] claim_overproduction (fnd_cf49e8126a0a)

Redundant/atomized claims from same source.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_12`, `clm_aaaaaaaaaaaa_ollama_intern_13`, `clm_aaaaaaaaaaaa_ollama_intern_16`, `clm_aaaaaaaaaaaa_ollama_intern_17`, `clm_aaaaaaaaaaaa_ollama_intern_18`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Aggregate into synthesis-worthy conceptual clusters.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** high
- **Evidence:** Multiple definition claims (12,13,16,17,18) from same source.

### [BLOCK] scope_widening (fnd_0e2b6800233b)

Claim 7's universal quantifier 'every' generalizes from a narrow scope of a single design-intent topic.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_7`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Restrict the claim to the specific scope of the single design-intent topic.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** low
- **Evidence:** Every research-pack must always require a primary-source waiver in production.

### [BLOCK] scope_widening (fnd_5d3250906df6)

Claim 8's universal quantifier 'every' generalizes from a narrow scope of mistral-nemo timing out on 2149-line ledgers.

- **Claim IDs:** `clm_aaaaaaaaaaaa_ollama_intern_8`
- **Source IDs:** `src_aaaaaaaaaaaa`
- **Required action:** Limit the claim to the specific case of mistral-nemo and 2149-line ledgers.
- **Reviewer:** ollama-intern (multi_pass(ollama_intern_adversarial_review_paged + ollama_intern_adversarial_review_paged_narrow_critic))
- **Confidence:** low
- **Evidence:** Every LLM extractor benefits from paged windows on every input size.

## Claim review decisions

### [ACCEPTED] `clm_aaaaaaaaaaaa_ollama_intern_1`

No findings recorded for this claim by the current reviewer.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_2`

Findings: hidden_synthesis (block).

Cites findings: `fnd_ac28befacd0f`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_3`

Findings: hidden_synthesis (block); definition_drift (warn).

Cites findings: `fnd_ac28befacd0f`, `fnd_13b00d927869`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_4`

Findings: hidden_synthesis (block).

Cites findings: `fnd_ac28befacd0f`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_5`

Findings: hidden_synthesis (block).

Cites findings: `fnd_ac28befacd0f`.

### [NEEDS-SCOPE-REPAIR] `clm_aaaaaaaaaaaa_ollama_intern_6`

Findings: overgeneralized_claim (warn).

Cites findings: `fnd_a4195171d7a3`.

### [NEEDS-SCOPE-REPAIR] `clm_aaaaaaaaaaaa_ollama_intern_7`

Findings: overgeneralized_claim (warn); scope_widening (block).

Cites findings: `fnd_74baf24c988e`, `fnd_0e2b6800233b`.

### [NEEDS-SCOPE-REPAIR] `clm_aaaaaaaaaaaa_ollama_intern_8`

Findings: hidden_synthesis (block); scope_widening (block).

Cites findings: `fnd_ac28befacd0f`, `fnd_5d3250906df6`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_9`

Findings: hidden_synthesis (block).

Cites findings: `fnd_ac28befacd0f`.

### [REJECTED] `clm_aaaaaaaaaaaa_ollama_intern_10`

Findings: hidden_synthesis (block); recommendation_exceeds_evidence (block).

Cites findings: `fnd_ac28befacd0f`, `fnd_a8cdae9b06ff`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_11`

Findings: hidden_synthesis (warn).

Cites findings: `fnd_146177a6e64f`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_12`

Findings: definition_drift (warn); claim_overproduction (warn).

Cites findings: `fnd_b2775e882d43`, `fnd_86a93d0f1968`, `fnd_cf49e8126a0a`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_13`

Findings: definition_drift (warn); claim_overproduction (warn).

Cites findings: `fnd_86a93d0f1968`, `fnd_cf49e8126a0a`.

### [ACCEPTED] `clm_aaaaaaaaaaaa_ollama_intern_14`

Findings: temporal_mismatch (warn).

Cites findings: `fnd_71cc03229c8a`.

### [NEEDS-SCOPE-REPAIR] `clm_aaaaaaaaaaaa_ollama_intern_15`

Findings: scope_widening (warn).

Cites findings: `fnd_c6c1ca6451a3`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_16`

Findings: claim_overproduction (warn).

Cites findings: `fnd_cf49e8126a0a`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_17`

Findings: claim_overproduction (warn).

Cites findings: `fnd_cf49e8126a0a`.

### [NEEDS-HUMAN-REVIEW] `clm_aaaaaaaaaaaa_ollama_intern_18`

Findings: claim_overproduction (warn).

Cites findings: `fnd_cf49e8126a0a`.
