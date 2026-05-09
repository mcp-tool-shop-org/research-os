import type { PackManifest } from './schema.js';

export interface PublishInput {
  fromDir: string;
  toDir: string;
  force?: boolean;
  dryRun?: boolean;
  operatorNotes?: string;
}

export interface PublishResult {
  packageName: string;
  filesWritten: string[];
  warnings: string[];
  verifyPassed: boolean;
  dryRun: boolean;
  dryRunManifest?: PackManifest;
  dryRunReadme?: string;
}
