import type { HarnessAdapter, HarnessRequest, HarnessResponse } from './types.js';

type SpawnFn = (cmd: string, args: string[], stdin: string) => Promise<{ stdout: string; stderr: string; code: number }>;

export interface ClaudeCodeOptions {
  spawn?: SpawnFn;
  binary?: string;
}

export function claudeCodeAdapter(opts: ClaudeCodeOptions = {}): HarnessAdapter {
  const spawn = opts.spawn ?? defaultSpawn;
  const binary = opts.binary ?? 'claude';
  return {
    async invoke<T, R>(req: HarnessRequest<T>): Promise<HarnessResponse<R>> {
      const stdin = JSON.stringify({
        skill: req.skill,
        template: req.template,
        context: req.context,
      });
      const args = ['--print', '--output-format', 'json', '--append-system-prompt', req.skill];
      let proc: { stdout: string; stderr: string; code: number };
      try {
        proc = await spawn(binary, args, stdin);
      } catch (e) {
        return { ok: false, error: `harness spawn failed: ${(e as Error).message}`, retryable: true };
      }
      if (proc.code !== 0) {
        return { ok: false, error: proc.stderr.trim() || `harness exited with code ${proc.code}`, retryable: true };
      }
      let outer: { result?: string };
      try {
        outer = JSON.parse(proc.stdout);
      } catch (e) {
        return { ok: false, error: `harness stdout is not JSON: ${(e as Error).message}`, retryable: false };
      }
      if (typeof outer.result !== 'string') {
        return { ok: false, error: `harness response missing string \`result\` field`, retryable: false };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(outer.result);
      } catch (e) {
        return { ok: false, error: `harness inner result is not JSON: ${(e as Error).message}`, retryable: false };
      }
      const schemaError = validateAgainstSchema(parsed, req.outputSchema);
      if (schemaError) {
        return { ok: false, error: `harness response failed schema: ${schemaError}`, retryable: false };
      }
      return { ok: true, result: parsed as R };
    },
  };
}

/**
 * Minimal JSON Schema validator. Supports: type, required, properties (recursive).
 * Anything else passes. Replace with a proper validator (ajv) only if needed.
 */
function validateAgainstSchema(data: unknown, schema: unknown): string | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const s = schema as { type?: string; required?: string[]; properties?: Record<string, unknown> };
  if (s.type === 'object') {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return `expected object, got ${data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data}`;
    }
    const obj = data as Record<string, unknown>;
    for (const key of s.required ?? []) {
      if (!(key in obj)) return `missing required key ${key}`;
    }
    for (const [key, propSchema] of Object.entries(s.properties ?? {})) {
      if (key in obj) {
        const e = validateAgainstSchema(obj[key], propSchema);
        if (e) return `${key}: ${e}`;
      }
    }
    return null;
  }
  if (s.type === 'array') {
    if (!Array.isArray(data)) return `expected array, got ${typeof data}`;
    return null;
  }
  if (s.type === 'string') {
    return typeof data === 'string' ? null : `expected string, got ${typeof data}`;
  }
  return null;
}

const defaultSpawn: SpawnFn = async (cmd, args, stdin) => {
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
};
