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
