import type { CoworkHandoffPayload, HandoffMode } from './types.js';

const MODE_GLYPH: Record<HandoffMode, string> = {
  repair_required: '[REPAIR REQUIRED]',
  synthesis_ready: '[SYNTHESIS READY]',
  human_review_required: '[HUMAN REVIEW REQUIRED]',
};

const MODE_NARRATIVE: Record<HandoffMode, string> = {
  repair_required:
    'The pack is not ready for synthesis. At least one section is blocked, has unrun gates/review, or has claims that need repair. Your job is to gather more sources, repair scope/source issues, re-run gates and review, and document open questions. **You may not write final synthesis prose in this mode.**',
  synthesis_ready:
    'Required sections are synthesis-eligible, accepted claims exist, no unwaived blocking contradictions remain. You may perform cross-section synthesis using accepted claim_ids only. You may not introduce new facts or cite outside the source ledger.',
  human_review_required:
    'The pack contains unresolved waivers, blocking contradictions, malformed artifacts, or ambiguous review states. Stop. Prepare options for the operator in `handoffs/cowork-options.md`. **You may not decide on these issues yourself.**',
};

const MODE_ALLOWED: Record<HandoffMode, string[]> = {
  repair_required: [
    'Run `research-os gather <section> --url ...` to add sources where the source-floor gate is failing.',
    'Run `research-os claim extract <section>` after adding sources.',
    'Run `research-os contradict map <section>` and `research-os review <section>` to refresh tension and review state.',
    'Re-run `research-os gate <section>` to determine if synthesis-eligibility has been earned.',
    'Re-run `research-os index build --all` and `research-os cowork handoff` to refresh the runtime contract.',
    'Write working notes to `handoffs/cowork-notes.md` and per-section `open_questions.md`.',
  ],
  synthesis_ready: [
    'Reason across sections to draft `synthesis/cross-section-map.md`.',
    'Produce `synthesis/decision-brief.md` answering the pack\'s `decision` field, citing only accepted_claim_ids.',
    'Draft `synthesis/final-report.md` if (and only if) the decision brief is honest about unresolved tensions.',
    'Use `research-os query "<term>"` to retrieve grounded artifacts; never paraphrase past the indexed evidence.',
  ],
  human_review_required: [
    'Read the pack state below.',
    'Surface the unresolved issues to the operator in `handoffs/cowork-options.md` with proposed options, no decisions.',
    'Stop after the options document is written.',
  ],
};

export function renderCoworkMaster(payload: CoworkHandoffPayload): string {
  const lines: string[] = [];
  lines.push(`# Cowork Handoff: ${payload.pack_topic}`);
  lines.push('');
  lines.push(`**Pack ID:** \`${payload.pack_id}\``);
  lines.push(`**Mode:** ${MODE_GLYPH[payload.mode]} ${payload.mode}`);
  lines.push(`**Synthesis allowed:** ${payload.synthesis_allowed ? 'yes' : 'no'}`);
  lines.push(`**Generated:** ${payload.generated_at}`);
  lines.push(`**Index:** ${payload.index_status}`);
  lines.push('');
  lines.push(`> ${payload.summary}`);
  lines.push('');

  lines.push('## Operating mode');
  lines.push('');
  lines.push(MODE_NARRATIVE[payload.mode]);
  lines.push('');

  lines.push('## What you may do');
  lines.push('');
  for (const a of MODE_ALLOWED[payload.mode]) lines.push(`- ${a}`);
  lines.push('');

  lines.push('## What you may not do (always — these are pack invariants)');
  lines.push('');
  for (const a of payload.forbidden_actions) lines.push(`- ${a}`);
  lines.push('');

  lines.push('## Pack state');
  lines.push('');
  if (payload.sections.length === 0) {
    lines.push('No sections in this pack.');
  } else {
    lines.push('| Section | Status | Gate verdict | Synthesis-eligible | Candidate claims | Accepted | Need repair | Rejected | Frame-excluded | Unresolved contradictions |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const s of payload.sections) {
      const frameCount = s.frame_excluded_claim_ids?.length ?? 0;
      lines.push(
        `| \`${s.section_id}\` | ${s.status} | ${s.gate_verdict ?? '—'} | ${s.synthesis_eligible ? 'yes' : 'no'} | ${s.candidate_claims_total} | ${s.accepted_claim_ids.length} | ${s.repair_claim_ids.length} | ${s.rejected_claim_ids.length} | ${frameCount} | ${s.unresolved_contradiction_ids.length} |`,
      );
    }
  }
  lines.push('');

  lines.push('### Accepted claims (synthesis-ready)');
  lines.push('');
  if (payload.accepted_claim_ids.length === 0) {
    lines.push('_No claims have been accepted for synthesis. Synthesis is not allowed in this handoff._');
  } else {
    for (const cid of payload.accepted_claim_ids) lines.push(`- \`${cid}\``);
  }
  lines.push('');

  lines.push('### Claims needing repair');
  lines.push('');
  if (payload.repair_claim_ids.length === 0) {
    lines.push('_None._');
  } else {
    for (const cid of payload.repair_claim_ids) lines.push(`- \`${cid}\``);
  }
  lines.push('');

  lines.push('### Rejected claims');
  lines.push('');
  if (payload.blocked_claim_ids.length === 0) {
    lines.push('_None._');
  } else {
    for (const cid of payload.blocked_claim_ids) lines.push(`- \`${cid}\``);
  }
  lines.push('');

  // Phase 1b-b (v0.8.0): frame-excluded bucket. Distinct from rejected — the
  // extract-time critic decided these claims are not section-evidence
  // (off_topic / background_only / source_chrome) before review ever ran.
  // No LLM review tokens were spent; the rationale on each claim's review
  // record carries the critic's call forward. critic_unavailable is the
  // system-state value stamped by the extractor when the critic call itself
  // failed (transport / parse / invalid label / empty rationale / timeout) —
  // included here so the operator can spot critic-health issues separately
  // from genuine model exclusions.
  lines.push(
    '### Frame-excluded claims (off_topic / background_only / source_chrome / critic_unavailable)',
  );
  lines.push('');
  const frameIds = payload.frame_excluded_claim_ids ?? [];
  if (frameIds.length === 0) {
    lines.push('_None._');
  } else {
    for (const cid of frameIds) lines.push(`- \`${cid}\``);
  }
  lines.push('');

  lines.push('### Unresolved contradictions');
  lines.push('');
  if (payload.unresolved_contradiction_ids.length === 0) {
    lines.push('_None._');
  } else {
    for (const id of payload.unresolved_contradiction_ids) lines.push(`- \`${id}\``);
  }
  lines.push('');

  lines.push('### Active waivers');
  lines.push('');
  if (payload.waivers.length === 0) {
    lines.push('_None._');
  } else {
    for (const w of payload.waivers) {
      lines.push(`- **${w.scope}.${w.family}** applied to \`${w.applied_to}\``);
      lines.push(`  - Reason: ${w.reason || '_(empty — INVALID)_'}`);
      if (w.compensating_controls.length === 0) {
        lines.push(`  - Compensating controls: _(none — INVALID)_`);
      } else {
        for (const c of w.compensating_controls) lines.push(`  - Compensating: ${c}`);
      }
    }
  }
  lines.push('');

  lines.push('## Recommended next actions');
  lines.push('');
  if (payload.recommended_next_actions.length === 0) {
    lines.push('_(none recommended)_');
  } else {
    let i = 1;
    for (const a of payload.recommended_next_actions) {
      lines.push(`${i}. ${a}`);
      i += 1;
    }
  }
  lines.push('');

  lines.push('## Allowed write paths');
  lines.push('');
  for (const p of payload.allowed_write_paths) lines.push(`- \`${p}\``);
  lines.push('');

  lines.push('## Useful index queries');
  lines.push('');
  lines.push('- `research-os query "source_floor"` — surface gate failures grounded in audit JSON.');
  lines.push('- `research-os query "source_cluster_monopoly"` — find publisher-monopoly findings and the claims they touch.');
  lines.push('- `research-os query "candidate" --type claim` — list candidate claims that haven\'t been accepted yet.');
  lines.push('- `research-os query "blocked" --type gate_result` — every gate that blocks synthesis.');
  lines.push('- `research-os query "<term>"` — full-text search; every hit points to a canonical artifact path.');
  lines.push('');

  lines.push('## Stop conditions');
  lines.push('');
  if (payload.mode === 'synthesis_ready') {
    lines.push('- Final synthesis artifacts written to `synthesis/`.');
  } else if (payload.mode === 'human_review_required') {
    lines.push('- `handoffs/cowork-options.md` written with proposed options for operator review.');
  } else {
    lines.push('- All blocked sections become synthesis-eligible OR mode flips to `human_review_required`.');
    lines.push('- Repair budget for the pack is exhausted (re-run handoff to confirm).');
  }
  lines.push('- Pack-level `max_runtime_minutes` (in `research.yaml`) is exhausted — surface partial state honestly.');
  lines.push('');

  lines.push('## Final instruction');
  lines.push('');
  lines.push('Do not introduce unsupported claims. Preserve unresolved contradictions. Do not widen scope beyond the source-tagged scope. Cite only `claim_id` and `source_id` values that already exist in this pack. The pack is the source of authority — this handoff is a layout step, not new truth.');
  lines.push('');

  if (payload.warnings.length > 0) {
    lines.push('## Warnings (from handoff generation)');
    lines.push('');
    for (const w of payload.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  return lines.join('\n');
}
