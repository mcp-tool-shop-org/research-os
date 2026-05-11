// Stage C Phase 3 amend wave — C3-006 Option C part B.
//
// Static `research-os help <topic>` subcommand content. Plain-text only, no
// markdown rendering at runtime, no ANSI codes. Each value MUST stay ≤500
// characters — enforced by `test/cli-help-topics-map.test.ts`. The map is
// frozen at module load so callers cannot mutate it.
//
// Adding a new topic requires updating:
//   1. The entry below.
//   2. The corresponding handbook page under
//      site/src/content/docs/handbook/<topic>.md (or a related page).
//   3. The unit test (key list + per-value char budget).
//
// The map intentionally stays small (4 topics in v1.0) so the surface is
// auditable. POST-v1 topic additions are tracked in the POST-v1 backlog.

export const HELP_TOPICS: Readonly<Record<string, string>> = Object.freeze({
  recovery:
    'Recovery covers common partial-failure paths: review cascade failures, gather URL failures, pack-publish verify-fail, indexer malformed-JSONL warnings, calibration multi-run failures, and freeze refusals. Each path lists the symptom (what you see), the cause (which seam failed), and the command(s) to recover without re-running the whole chain. Full runbook: site/src/content/docs/handbook/recovery.md (live at https://mcp-tool-shop-org.github.io/research-os/handbook/recovery/).',

  'pack-publish':
    'pack publish exports a frozen research pack into the research-packs archive format. --to <path> is required; --from defaults to cwd; --dry-run derives without writing; --operator-notes adds free text to pack.manifest.json. --force clears and replaces the target package directory. Do not keep hand-authored files inside generated package output. Edit upstream artifacts or sibling files instead. Full reference: site/src/content/docs/handbook/pack-publish.md.',

  review:
    'review runs the adversarial reviewer pass. --two-pass-llm runs general + narrow_critic passes; --triaged-only restricts to selected_for_review candidates; --model overrides the reviewer model; --profile names a calibration profile. If reviewers fail mid-section, ReviewerCascadeFailedError is retryable: re-run the same command; previously-written records are append-only. Full reference: site/src/content/docs/handbook/reviewer-calibration.md.',

  gather:
    'gather fetches sources and writes evidence (fetch receipts, source cards, excerpt ledgers). --url <url> (repeatable) or --urls-file <path> selects URLs; --approved consumes urls.approved.txt from discover. A single URL failure no longer fails the run: a synthetic failure receipt is written, accumulated source-ids are flushed durably, and the next URL proceeds. Re-run with the same URL list to retry failed entries. See handbook/workflow.md for the full chain.',
});
