import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAuthConfig } from './auth-config.ts';

test('assertAuthConfig: no-op when auth is disabled', () => {
  assert.doesNotThrow(() =>
    assertAuthConfig({ authEnabled: false, projectId: '', managementKey: '' }),
  );
});

test('assertAuthConfig: no-op when auth is enabled and both secrets are set', () => {
  assert.doesNotThrow(() =>
    assertAuthConfig({ authEnabled: true, projectId: 'P123', managementKey: 'K123' }),
  );
});

test('assertAuthConfig: throws naming the project ID when it is missing', () => {
  assert.throws(
    () => assertAuthConfig({ authEnabled: true, projectId: '', managementKey: 'K123' }),
    /NEXT_PUBLIC_DESCOPE_PROJECT_ID/,
  );
});

test('assertAuthConfig: throws naming the management key when it is missing', () => {
  assert.throws(
    () => assertAuthConfig({ authEnabled: true, projectId: 'P123', managementKey: '' }),
    /DESCOPE_MANAGEMENT_KEY/,
  );
});

test('assertAuthConfig: throws naming both when both are missing', () => {
  assert.throws(
    () => assertAuthConfig({ authEnabled: true, projectId: '', managementKey: '' }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /NEXT_PUBLIC_DESCOPE_PROJECT_ID/);
      assert.match(err.message, /DESCOPE_MANAGEMENT_KEY/);
      return true;
    },
  );
});
