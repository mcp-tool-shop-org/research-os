export class ResearchOSError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ResearchOSError';
  }
}

export class IntakeValidationError extends ResearchOSError {
  constructor(message: string, public readonly issues: unknown) {
    super(message, 'INTAKE_VALIDATION');
    this.name = 'IntakeValidationError';
  }
}

export class PackExistsError extends ResearchOSError {
  constructor(path: string) {
    super(`Pack directory already exists: ${path}`, 'PACK_EXISTS');
    this.name = 'PackExistsError';
  }
}

export class TemplateNotFoundError extends ResearchOSError {
  constructor(path: string) {
    super(`Pack template not found at ${path}`, 'TEMPLATE_NOT_FOUND');
    this.name = 'TemplateNotFoundError';
  }
}

export class PackNotFoundError extends ResearchOSError {
  constructor(path: string) {
    super(`No research.yaml found at ${path}. Run 'research-os init' first.`, 'PACK_NOT_FOUND');
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
    );
    this.name = 'NoUrlsProvidedError';
  }
}
