import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    'calibration/receipt': 'src/calibration/receipt.ts',
    'calibration/receipt-schema': 'src/calibration/receipt-schema.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  splitting: false,
  external: ['better-sqlite3'],
});
