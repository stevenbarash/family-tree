import type { HarnessAdapter, HarnessName } from './types.js';
import { claudeCodeAdapter } from './claude-code.js';

export function selectHarness(name: HarnessName | undefined): HarnessAdapter {
  const choice = name ?? 'claude-code';
  switch (choice) {
    case 'claude-code':
      return claudeCodeAdapter();
    case 'codex':
    case 'opencode':
      throw new HarnessUnsupportedError(choice);
    default:
      throw new HarnessUnsupportedError(choice);
  }
}

export class HarnessUnsupportedError extends Error {
  constructor(public readonly harness: string) {
    super(`WHOAMI_HARNESS=${harness} not yet supported in v1; use claude-code`);
    this.name = 'HarnessUnsupportedError';
  }
}

export type { HarnessAdapter, HarnessRequest, HarnessResponse, HarnessTemplate, HarnessName } from './types.js';
