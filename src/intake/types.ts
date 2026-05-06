export interface InitOptions {
  topic: string;
  name?: string;
  outDir?: string;
  decision?: string;
  audience?: string;
  desiredOutput?: string;
  maxRuntimeMinutes?: number;
  force?: boolean;
}

export interface InitResult {
  packPath: string;
  packName: string;
  filesWritten: string[];
}
