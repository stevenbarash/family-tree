import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whisperTranscriber } from '../src/transcriber.js';

test('whisperTranscriber: posts audio to OpenAI and parses response', async () => {
  let captured: { url: string; body: FormData; auth: string } | null = null;
  const fakeFetch = async (url: string, init: { body: FormData; headers: Record<string, string> }) => {
    captured = { url, body: init.body, auth: init.headers['Authorization']! };
    return new Response(JSON.stringify({ text: 'transcribed body', language: 'en' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const t = whisperTranscriber({ apiKey: 'sk-test', fetch: fakeFetch });
  const out = await t.transcribe({ audio: new Uint8Array([1, 2, 3]).buffer, filename: 'voice.m4a', lang: 'auto' });
  assert.equal(out.text, 'transcribed body');
  assert.equal(out.lang, 'en');
  assert.equal(captured!.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(captured!.auth, 'Bearer sk-test');
});

test('whisperTranscriber: forwards explicit lang hint to OpenAI', async () => {
  let lang = '';
  const fakeFetch = async (_url: string, init: { body: FormData; headers: Record<string, string> }) => {
    lang = init.body.get('language')?.toString() ?? '';
    return new Response(JSON.stringify({ text: 'привет', language: 'ru' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const t = whisperTranscriber({ apiKey: 'sk-test', fetch: fakeFetch });
  const out = await t.transcribe({ audio: new ArrayBuffer(0), filename: 'voice.m4a', lang: 'ru' });
  assert.equal(lang, 'ru');
  assert.equal(out.lang, 'ru');
});

test('whisperTranscriber: surfaces non-200 as Error', async () => {
  const fakeFetch = async () => new Response('quota', { status: 429 });
  const t = whisperTranscriber({ apiKey: 'sk-test', fetch: fakeFetch });
  await assert.rejects(t.transcribe({ audio: new ArrayBuffer(0), filename: 'v.m4a', lang: 'auto' }), /429/);
});
