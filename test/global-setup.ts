import fs from 'node:fs';

/** Fresh, isolated PUENTE_DATA_DIR for the run; removed after. */
export default function setup() {
  const dir = process.env.PUENTE_DATA_DIR!;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return () => fs.rmSync(dir, { recursive: true, force: true });
}
