export interface SectionAddOptions {
  id: string;
  purpose: string;
  packPath?: string;
  maxTimeMinutes?: number;
  minSources?: number;
  primarySourcesRequired?: number;
  contradictionsRequired?: boolean;
}

export interface SectionAddResult {
  sectionId: string;
  sectionPath: string;
  filesWritten: string[];
}
