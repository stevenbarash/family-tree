export type HarnessTemplate =
  | 'research-questions'
  | 'outline'
  | 'draft-person'
  | 'draft-episode'
  | 'interview';

export interface HarnessRequest<T = unknown> {
  /** Skill bundle name; v1 always 'writing-articles' */
  skill: string;
  /** Template name (matches a file in skill's prompt-templates/). */
  template: HarnessTemplate;
  /** Arbitrary template-specific input. */
  context: T;
  /** JSON Schema fragment the response is validated against. */
  outputSchema: object;
}

export type HarnessResponse<R> =
  | { ok: true; result: R }
  | { ok: false; error: string; retryable: boolean };

export interface HarnessAdapter {
  invoke<T, R>(req: HarnessRequest<T>): Promise<HarnessResponse<R>>;
}

export type HarnessName = 'claude-code' | 'codex' | 'opencode';
