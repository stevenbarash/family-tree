import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';
import { composeAuthAndLocale, isRedirect } from './proxy-compose.ts';

// composeAuthAndLocale never inspects the request itself — a stub is fine.
const req = {} as NextRequest;

test('isRedirect: true for 3xx, false otherwise', () => {
  assert.equal(isRedirect(new Response(null, { status: 307 })), true);
  assert.equal(isRedirect(new Response(null, { status: 301 })), true);
  assert.equal(isRedirect(new Response(null, { status: 200 })), false);
  assert.equal(isRedirect(new Response(null, { status: 404 })), false);
});

test('composeAuthAndLocale: honors a Descope redirect (unauthenticated)', async () => {
  const redirect = new Response(null, { status: 307 });
  const out = await composeAuthAndLocale(
    req,
    async () => redirect,
    () => new Response('locale-ran', { status: 200 }),
    true,
  );
  assert.equal(out, redirect);
});

test('composeAuthAndLocale: discards a Descope pass and runs locale routing', async () => {
  const localeResponse = new Response('locale-ran', { status: 200 });
  const out = await composeAuthAndLocale(
    req,
    async () => new Response(null, { status: 200 }),
    () => localeResponse,
    true,
  );
  assert.equal(out, localeResponse);
});

test('composeAuthAndLocale: skips the auth gate entirely when auth is off', async () => {
  let gateCalled = false;
  const localeResponse = new Response('locale-ran', { status: 200 });
  const out = await composeAuthAndLocale(
    req,
    async () => { gateCalled = true; return new Response(null, { status: 307 }); },
    () => localeResponse,
    false,
  );
  assert.equal(gateCalled, false);
  assert.equal(out, localeResponse);
});
