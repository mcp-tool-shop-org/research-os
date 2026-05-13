export const PROSE_ROLES = [
  'answer',
  'evidence',
  'qualifier',
  'caveat',
  'implication',
  'thin_evidence',
] as const;

export type ProseRole = (typeof PROSE_ROLES)[number];

export const VERIFIER_DECISIONS = [
  'faithful',
  'unsupported_connective',
  'omits_critical_qualifier',
] as const;

export type VerifierDecision = (typeof VERIFIER_DECISIONS)[number];

export interface PlannerAssignment {
  claim_id: string;
  role: ProseRole;
}

export type PlannerResult =
  | { ok: true; assignments: PlannerAssignment[] }
  | { ok: false; error: string };

export type DraftResult =
  | { ok: true; paragraph: string }
  | { ok: false; error: string };

export type VerifyResult =
  | { ok: true; decision: VerifierDecision; rationale: string }
  | { ok: false; error: string };

export interface SupportBundle {
  claim_ids: string[];
  source_card_ids: string[];
  waiver_ids: string[];
  thin_evidence: boolean;
}

export interface DraftedParagraph {
  paragraph_id: string;
  role: ProseRole;
  text: string;
  support_bundle: SupportBundle;
  verifier_decision: VerifierDecision;
}

export interface ProseDisclosures {
  waivers: Array<{ waiver_id: string; reason: string }>;
  thin_evidence_paragraphs: string[];
}

export interface ProseGenerator {
  activity_id: string;
  drafter_model: string;
  verifier_model: string;
  prompt_version: string;
}

export interface ProseBlock {
  section_purpose: string;
  paragraphs: DraftedParagraph[];
  disclosures: ProseDisclosures;
  generator: ProseGenerator;
}

// Minimal structural interface for the MCP Client. Tests substitute fakes via
// dependency injection; production code passes a real connected MCPClientHandle.
export interface ProseCallToolClient {
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{ content?: Array<{ type?: string; text?: string }>; isError?: boolean }>;
}

export interface SourceCardMeta {
  source_id: string;
  title: string | null;
  publisher: string | null;
  source_type: string;
  url: string;
}

export interface WaiverMeta {
  waiver_id: string;
  family: string;
  reason: string;
  applied_to: string;
}

export interface AcceptedClaimInput {
  claim_id: string;
  asserts: string;
  scope: string | null;
  not: string | null;
  source_ids: string[];
  confidence: string;
}

export interface ProseRunInput {
  sectionPurpose: string;
  acceptedClaims: AcceptedClaimInput[];
  sourceCards: SourceCardMeta[];
  waivers: WaiverMeta[];
  gateVerdict: string | null;
  packMode: string;
  client: ProseCallToolClient;
  // Model hint — undefined means "let the server pick its default".
  model?: string;
}

export type ProseRunResult =
  | { ok: true; block: ProseBlock }
  | { ok: false; error: string };
