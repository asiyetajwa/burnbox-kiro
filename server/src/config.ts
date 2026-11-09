// Settings, all from the environment. The inference key is read here and nowhere else.
import { resolve } from 'node:path';

const env = process.env;
const num = (v: string | undefined, d: number): number => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(env.PORT, 8080),
  host: env.HOST ?? '0.0.0.0',
  dataDir: resolve(env.DATA_DIR ?? 'data'),
  samplesDir: resolve(env.SAMPLES_DIR ?? 'samples'),
  webDir: resolve(env.WEB_DIR ?? 'web'),

  // The detonation box.
  boxImage: env.BOX_IMAGE ?? 'burnbox-box:latest',
  browserImage: env.BROWSER_IMAGE ?? 'burnbox-browser:latest',
  labNetwork: env.LAB_NETWORK ?? 'burnbox-lab',
  gateUrl: env.GATE_URL ?? '', // e.g. http://gate:3128 lets link boxes read real sites; empty keeps links lab-only
  runtime: env.SANDBOX_RUNTIME ?? '', // "runsc" for gVisor when installed on the host
  limits: {
    memory: env.BOX_MEMORY ?? '256m',
    cpus: env.BOX_CPUS ?? '0.5',
    pids: num(env.BOX_PIDS, 128),
    seconds: num(env.BOX_SECONDS, 20),
    hostSeconds: num(env.BOX_HOST_SECONDS, 60),
  },
  maxUpload: num(env.MAX_UPLOAD_MB, 25) * 1024 * 1024,
  maxConcurrent: num(env.MAX_CONCURRENT_RUNS, 2),

  // Inference through any OpenAI-compatible base URL (Gemini in production). The VULTR_* names are kept from the original build. STUB_LLM=1 writes verdicts without a model.
  llm: {
    stub: env.STUB_LLM === '1' || !env.VULTR_INFERENCE_API_KEY,
    baseUrl: (env.VULTR_INFERENCE_BASE_URL ?? 'https://api.vultrinference.com/v1').replace(/\/+$/, ''), // no trailing slash: paths are appended
    model: env.VULTR_MODEL ?? '',
    timeoutMs: num(env.LLM_TIMEOUT_MS, 45000),
  },
};

export function inferenceKey(): string | undefined {
  return env.VULTR_INFERENCE_API_KEY;
}
