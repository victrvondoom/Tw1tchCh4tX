import { cp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const target = new URL('../apps/web/public/gaze/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(
  new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),
  new URL('wasm/', target),
  { recursive: true },
);
const r = await fetch(
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  { signal: AbortSignal.timeout(60000) },
);
if (!r.ok) throw new Error('Official model download failed.');
const bytes = Buffer.from(await r.arrayBuffer());
if (
  createHash('sha256').update(bytes).digest('hex') !==
  '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
)
  throw new Error('Model checksum mismatch. Review upstream before changing pin.');
await writeFile(new URL('face_landmarker.task', target), bytes);
console.info('Gaze model and WASM ready. Browser inference remains local.');
