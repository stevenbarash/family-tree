import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import type { HarnessAdapter, HarnessRequest, HarnessResponse } from './types.js';

type SpawnFn = (cmd: string, args: string[], stdin: string) => Promise<{ stdout: string; stderr: string; code: number }>;

export interface ClaudeCodeOptions {
  spawn?: SpawnFn;
  binary?: string;
  /**
   * Root directory containing skill bundles (one folder per skill).
   * Required to resolve `<skillsDir>/<skill>/SKILL.md` and
   * `<skillsDir>/<skill>/prompt-templates/<template>.md`. Defaults to
   * `plugins/whoami/skills` resolved relative to the bundled CLI.
   */
  skillsDir?: string;
  /** Optional hook for tests; default reads from the filesystem. */
  readSkillFile?: (path: string) => string | null;
}

export function claudeCodeAdapter(opts: ClaudeCodeOptions = {}): HarnessAdapter {
  const spawn = opts.spawn ?? defaultSpawn;
  const binary = opts.binary ?? 'claude';
  const skillsDir = opts.skillsDir
    ?? process.env.WHOAMI_SKILLS_DIR
    ?? defaultSkillsDir();
  const readFile = opts.readSkillFile ?? defaultReadSkillFile;

  // Cache (skill, template) → file contents for the lifetime of this
  // adapter (one author run). The first invocation of each pair reads
  // from disk; subsequent invocations reuse the snapshot. This prevents
  // a mid-pipeline template edit (in-progress refactor, editor
  // auto-save) from changing the model's instructions between phases,
  // which would otherwise produce subtly inconsistent outputs across
  // phases of the same run.
  const fileCache = new Map<string, { skill: string; template: string }>();

  return {
    async invoke<T, R>(req: HarnessRequest<T>): Promise<HarnessResponse<R>> {
      const cacheKey = `${req.skill}/${req.template}`;
      let cached = fileCache.get(cacheKey);
      if (!cached) {
        const skillPath = join(skillsDir, req.skill, 'SKILL.md');
        const templatePath = join(skillsDir, req.skill, 'prompt-templates', `${req.template}.md`);
        const skillContent = readFile(skillPath);
        if (skillContent === null) {
          return { ok: false, error: `harness: skill not found at ${skillPath}`, retryable: false };
        }
        const templateContent = readFile(templatePath);
        if (templateContent === null) {
          return { ok: false, error: `harness: template not found at ${templatePath}`, retryable: false };
        }
        cached = { skill: skillContent, template: templateContent };
        fileCache.set(cacheKey, cached);
      }
      const skillContent = cached.skill;
      const templateContent = cached.template;

      const systemPrompt = `${skillContent}\n\n---\n\n${templateContent}`;
      const stdin = JSON.stringify({ skill: req.skill, template: req.template, context: req.context });
      // Restrict sub-claude tools to the minimum each template needs. The
      // research template uses WebSearch/WebFetch to gather sources; every
      // other template transforms its input into JSON in-place and needs no
      // tools. Without this gate the sub-model has full default tool access
      // and can write files, run shell commands, or call other tools —
      // bypassing the orchestrator's intended flow. (Observed in the
      // boris-ayzman Phase 4 run: when the sub-model emitted prose around
      // the JSON, it had already written page content via the Write tool,
      // leaving the orchestrator with both a parse error and a half-
      // committed page on disk.)
      const allowedTools = toolsAllowedFor(req.skill, req.template);
      const args = [
        '--print',
        '--output-format', 'json',
        '--append-system-prompt', systemPrompt,
        '--tools', allowedTools,
      ];
      // WHOAMI_MODEL lets callers swap the sub-model per run — useful for
      // cost/quality experiments (sonnet vs opus vs haiku) without
      // touching the user's global `claude` config. Accepts an alias
      // (`opus`, `sonnet`, `haiku`) or a full id (`claude-opus-4-7`).
      const model = process.env.WHOAMI_MODEL;
      if (model) { args.push('--model', model); }

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
      const normalizedResult = extractJsonPayload(outer.result);
      try {
        parsed = JSON.parse(normalizedResult);
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
 * Resolve the skills directory relative to the running binary.
 * In the bundled CJS case, process.argv[1] = <repo>/cli/dist/wai.cjs;
 * two levels up from cli/dist/ lands at the repo root, then we descend
 * into plugins/whoami/skills/.
 *
 * When the binary is installed outside the repo (e.g. copied to
 * ~/.local/bin/wai), the literal `../../plugins/whoami/skills` is
 * meaningless — that path resolves to `~/plugins/whoami/skills`, which
 * doesn't exist. To stay robust without forcing the caller to set
 * WHOAMI_SKILLS_DIR, walk up from the binary looking for the marker.
 * Returns the literal default path if no marker is found, leaving the
 * "not found at <path>" error message intact for diagnostic clarity.
 */
function defaultSkillsDir(): string {
  const fallback = join(dirname(process.argv[1]), '..', '..', 'plugins', 'whoami', 'skills');
  // First try: the legacy literal path. Fast path for the in-repo
  // bundled case and for the test fixtures that mock readSkillFile.
  if (existsSync(fallback)) return fallback;

  // Walk-up search. Start from cwd, then the binary dir, then up to /
  // (bounded depth to avoid filesystem-walk pathology). The first
  // ancestor containing `plugins/whoami/skills/SKILL.md` wins.
  const seeds = [process.cwd(), dirname(process.argv[1])];
  for (const seed of seeds) {
    let dir = seed;
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'plugins', 'whoami', 'skills');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return fallback;
}

function defaultReadSkillFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Per-(skill, template) tool allowlist for the sub-claude invocation.
 * Returns the value to pass to `--tools` — comma-separated tool names,
 * or `""` to disable all tools. The default is `""`: a template must
 * opt in to specific tools to use them, so adding a new template can
 * never accidentally inherit dangerous capabilities (Write, Edit,
 * Bash, Skill, Agent, etc.) it didn't actually need.
 */
function toolsAllowedFor(skill: string, template: string): string {
  if (skill === 'writing-articles' && template === 'research-questions') {
    return 'WebSearch,WebFetch';
  }
  return '';
}

/**
 * Strip leading/trailing markdown code fences from a string that should be JSON.
 * Claude often wraps JSON output in ```json ... ``` fences; this normalizes them out
 * so the adapter can JSON.parse() the inner content.
 */
function stripMarkdownFences(text: string): string {
  let t = text.trim();
  // Leading fence: ```json\n or ```\n
  const leadMatch = t.match(/^```(?:json)?\s*\n/);
  if (leadMatch) t = t.slice(leadMatch[0].length);
  // Trailing fence: \n```
  const trailMatch = t.match(/\n?```\s*$/);
  if (trailMatch) t = t.slice(0, -trailMatch[0].length);
  return t;
}

/**
 * Extract a JSON payload from a model response, tolerating preamble text
 * and markdown code fences. Models sometimes emit a sentence like
 * "Here is the JSON:" or "Draft writing follows:" before the actual JSON
 * object — this locates the first balanced object/array and returns it.
 * String-aware: braces inside JSON string literals don't confuse the
 * counter.
 *
 * If neither a fenced block nor a balanced object/array is found, the
 * fence-stripped text is returned unchanged so the downstream JSON.parse
 * error preserves the original context (refusal text, error message, etc.).
 */
function extractJsonPayload(text: string): string {
  const stripped = stripMarkdownFences(text);
  // Always run the extractor — it handles leading preamble, trailing text
  // after JSON, and both at once. When the input is pure JSON (the happy
  // case from a well-behaved template), the extractor returns the same
  // string the early-return would have produced.
  const extracted = extractFirstBalancedJson(stripped);
  return extracted ?? stripped;
}

/**
 * Scan `text` for the first balanced { ... } or [ ... ] sequence and return
 * it. Brace counting is string-aware (JSON " ... " strings, with backslash
 * escapes, do not advance the depth counter). Returns null if no such
 * sequence exists.
 */
function extractFirstBalancedJson(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }

    // Only track string state once we're inside a JSON structure. Outside
    // depth, a `"` is just preamble text — an unmatched quote in prose
    // (e.g. `Look "here: {"x":1}`) would otherwise enter string mode and
    // swallow the real JSON's opening `{`, leaving the extractor unable
    // to find any balanced structure.
    if (depth > 0 && c === '"') {
      inString = true;
      continue;
    }

    if (c === '{' || c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' || c === ']') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
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
