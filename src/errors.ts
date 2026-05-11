export class ResearchOSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly hint?: string,
    cause?: Error,
    public readonly retryable?: boolean,
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ResearchOSError';
  }
}

export class IntakeValidationError extends ResearchOSError {
  constructor(message: string, public readonly issues: unknown) {
    // Stage C Phase 3 Theme 5: handbook pointer (getting-started).
    super(message, 'INTAKE_VALIDATION', 'See handbook/getting-started.');
    this.name = 'IntakeValidationError';
  }
}

export class PackExistsError extends ResearchOSError {
  constructor(path: string) {
    super(
      `Pack directory already exists: ${path}`,
      'PACK_EXISTS',
      // Stage C Phase 3 Theme 5: pack-publish handbook pointer (this code is
      // also used by pack/publish/index.ts:55 for target-non-empty refusal).
      `See handbook/pack-publish.md.`,
    );
    this.name = 'PackExistsError';
  }
}

export class TemplateNotFoundError extends ResearchOSError {
  constructor(path: string) {
    super(
      `Pack template not found at ${path}`,
      'TEMPLATE_NOT_FOUND',
      // Stage C Phase 3 Theme 5: getting-started handbook pointer.
      `See handbook/getting-started.`,
    );
    this.name = 'TemplateNotFoundError';
  }
}

export class PackNotFoundError extends ResearchOSError {
  constructor(path: string) {
    super(
      `No research.yaml found at ${path}. Run 'research-os init' first.`,
      'PACK_NOT_FOUND',
      // Stage C Phase 3 Theme 5: workflow handbook pointer.
      `See handbook/workflow.`,
    );
    this.name = 'PackNotFoundError';
  }
}

export class SectionExistsError extends ResearchOSError {
  constructor(id: string) {
    super(`Section already exists: ${id}`, 'SECTION_EXISTS');
    this.name = 'SectionExistsError';
  }
}

export class InvalidSectionIdError extends ResearchOSError {
  constructor(id: string) {
    super(`Invalid section id: "${id}". Must match pattern NN-slug (e.g. "01-landscape").`, 'INVALID_SECTION_ID');
    this.name = 'InvalidSectionIdError';
  }
}

export class SectionNotFoundError extends ResearchOSError {
  constructor(id: string) {
    super(`Section not found: ${id}. Run 'research-os section add' first.`, 'SECTION_NOT_FOUND');
    this.name = 'SectionNotFoundError';
  }
}

export class NoUrlsProvidedError extends ResearchOSError {
  constructor() {
    super(
      `No URLs provided. Pass --url <url> (repeatable) or --urls-file <path>. 'gather' acquires known sources; discovery/search is a separate step.`,
      'NO_URLS_PROVIDED',
      // Stage C Phase 3 Theme 5: workflow#gather pointer.
      `See handbook/workflow#gather.`,
    );
    this.name = 'NoUrlsProvidedError';
  }
}

export class NoSourcesGatheredError extends ResearchOSError {
  constructor(sectionId: string) {
    super(
      `Section "${sectionId}" has no gathered sources. Run 'research-os gather ${sectionId} --url ...' first. Claim extraction requires source truth.`,
      'NO_SOURCES_GATHERED',
      // Stage C Phase 3 Theme 5: recovery pointer.
      `See handbook/recovery.md for runbook.`,
    );
    this.name = 'NoSourcesGatheredError';
  }
}

export class HandoffNotFoundError extends ResearchOSError {
  constructor() {
    super(
      `No handoff on file at handoffs/cowork-handoff.json. Run 'research-os cowork handoff' first.`,
      'HANDOFF_NOT_FOUND',
      // Stage C Phase 3 Theme 5: recovery pointer.
      `See handbook/recovery.md for runbook.`,
    );
    this.name = 'HandoffNotFoundError';
  }
}

export class SynthesisNotReadyError extends ResearchOSError {
  constructor(public readonly mode: string) {
    super(
      `Synthesis workspace refused: pack is in ${mode} mode. Run 'research-os cowork handoff' for repair instructions.`,
      'SYNTHESIS_NOT_READY',
      // Stage C Phase 3 Theme 5: recovery pointer.
      `See handbook/recovery.md for runbook.`,
    );
    this.name = 'SynthesisNotReadyError';
  }
}

// B-C-001: structured rejection when a calibration receipt declares a
// schema_version that this build does not know how to read. Producer-side
// receipts are tagged with z.literal(1) today; when v2 lands, the list grows
// and the predicate inside receiptToCalibrationSummary branches by version.
export class UnsupportedReceiptVersionError extends ResearchOSError {
  constructor(
    public readonly supportedVersions: readonly number[],
    public readonly receivedVersion?: number,
    public readonly receiptPath?: string,
  ) {
    const supportedList = supportedVersions.join(', ');
    const seen =
      typeof receivedVersion === 'number' ? `${receivedVersion}` : 'unknown';
    const where = receiptPath ? ` at ${receiptPath}` : '';
    super(
      `Receipt schema_version ${seen} is unknown${where}. Supported: ${supportedList}. Upgrade research-os to read newer receipts, or downgrade the producer.`,
      'UNSUPPORTED_RECEIPT_VERSION',
      // Stage C Phase 3 Theme 5: known-limitations pointer (B-E-001/004 family).
      `Supported receipt schema versions: ${supportedList}. See handbook/known-limitations.md.`,
    );
    this.name = 'UnsupportedReceiptVersionError';
  }
}

// B-C-002: structured errors raised from review/promote/calibration/reviewers
// paths. Replaces raw `throw new Error(...)` so callers (CLI, harness, future
// MCP shim) can programmatically distinguish failure classes.

export class ReviewerCascadeFailedError extends ResearchOSError {
  constructor(
    public readonly failedReviewers: readonly string[],
    public readonly details?: {
      completedWindows?: number;
      totalWindows?: number;
    },
  ) {
    // Stage C Phase 3 Theme 5: handbook pointer to recovery.md. The retryable
    // flag is `true`, so this is the canonical "re-run the same command"
    // recovery path. C2-002 hint update: when details (completed/total windows)
    // is supplied by the throw site, surface partial progress so the operator
    // knows the resumable state.
    const progress =
      details &&
      typeof details.completedWindows === 'number' &&
      typeof details.totalWindows === 'number'
        ? ` Completed ${details.completedWindows}/${details.totalWindows} window(s) before failure.`
        : '';
    super(
      `Multi-pass review: every reviewer failed. ${failedReviewers.join(' | ')}`,
      'REVIEWER_CASCADE_FAILED',
      `Failed reviewers: ${failedReviewers.map((r) => r.split(':')[0]).join(', ')}.${progress} Inspect each error and re-run \`research-os review <section>\` (records are append-only — re-run is safe). See handbook/recovery.md for runbook.`,
      undefined,
      true,
    );
    this.name = 'ReviewerCascadeFailedError';
  }
}

export class ReviewerProfileInvalidError extends ResearchOSError {
  constructor(public readonly profileName: string) {
    super(
      `Invalid profile name "${profileName}". Use a kebab/snake-case slug.`,
      'REVIEW_PROFILE_INVALID',
      'Profile names must be kebab-case (a-z, 0-9, hyphen, underscore).',
      undefined,
      false,
    );
    this.name = 'ReviewerProfileInvalidError';
  }
}

export class ReviewerProfileNotFoundError extends ResearchOSError {
  constructor(
    public readonly profileName: string,
    public readonly knownNames: readonly string[],
    public readonly profilePath?: string,
  ) {
    const knownList = knownNames.length > 0 ? knownNames.join(', ') : '(none)';
    const where = profilePath ? ` at ${profilePath}` : '';
    super(
      `Profile "${profileName}" not found${where}. Run \`research-os review --profile ${profileName}\` first.`,
      'REVIEW_PROFILE_NOT_FOUND',
      // Stage C Phase 3 Theme 5: append handbook pointer (review profiles).
      `known profiles: ${knownList}. See handbook/recovery.md.`,
    );
    this.name = 'ReviewerProfileNotFoundError';
  }
}

export class CalibrationReceiptMalformedError extends ResearchOSError {
  constructor(
    public readonly receiptPath: string,
    public readonly reason: string,
  ) {
    super(
      `Invalid calibration receipt at ${receiptPath}: ${reason}`,
      'CALIBRATION_RECEIPT_MALFORMED',
      // Stage C Phase 3 Theme 5: append handbook pointer.
      // Theme 3 (command-text verification): there is no research-os
      // calibrate subcommand. The calibration harness is invoked via
      // node scripts/reviewer-calibration.mjs (a pack-out-dir argument).
      // Use the actual entrypoint, not a non-existent CLI subcommand.
      `Receipt path: ${receiptPath}. Re-run \`node scripts/reviewer-calibration.mjs\` (the calibration harness) or repair the file by hand. See handbook/recovery.md.`,
    );
    this.name = 'CalibrationReceiptMalformedError';
  }
}

export class NoReviewerAvailableError extends ResearchOSError {
  constructor() {
    super(
      'No reviewer available. The HeuristicReviewer should always be available — this indicates a bug.',
      'NO_REVIEWER_AVAILABLE',
      'File an issue: the heuristic reviewer is supposed to be unconditionally available.',
    );
    this.name = 'NoReviewerAvailableError';
  }
}
