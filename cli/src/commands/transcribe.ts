import { join, basename } from 'node:path';
import type { Transcriber, Lang } from '../transcriber.js';

export interface TranscribeOptions {
  rootDir: string;
  slug: string;
  audioPath: string;
  lang: Lang;
  speaker?: string;
  date?: string;
  readFileBinary: (path: string) => Uint8Array | null;
  writeFileBinary: (path: string, content: Uint8Array) => void;
  mkdirP: (path: string) => void;
  gitAdd: (paths: string[]) => void;
  gitCommit: (message: string) => void;
  gitHasUncommittedChanges: () => boolean;
  appendNote: (slug: string, text: string, opts: { kind: 'transcript' }) => Promise<void>;
  transcriber: Transcriber;
  now: () => string;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runTranscribe(opts: TranscribeOptions): Promise<number> {
  const audio = opts.readFileBinary(opts.audioPath);
  if (audio === null) {
    opts.writeErr(`transcribe: ${opts.audioPath} not found\n`);
    return 3;
  }
  if (opts.gitHasUncommittedChanges()) {
    opts.writeErr(`transcribe: ${opts.rootDir} has uncommitted changes; commit or stash first\n`);
    return 7;
  }
  const filename = basename(opts.audioPath);
  const dest = join(opts.rootDir, 'assets', 'audio', opts.slug, filename);

  opts.mkdirP(join(opts.rootDir, 'assets', 'audio', opts.slug));
  opts.writeFileBinary(dest, audio);

  let result;
  try {
    // TS 5.x types ArrayBuffer.slice as ArrayBuffer | SharedArrayBuffer; Buffer always yields ArrayBuffer.
    const audioBuffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
    result = await opts.transcriber.transcribe({
      audio: audioBuffer,
      filename,
      lang: opts.lang,
    });
  } catch (e) {
    opts.writeErr(`transcribe: API failure — ${(e as Error).message}\n`);
    return 5;
  }

  const noteText = formatTranscriptNote(result.text, {
    audio: filename,
    speaker: opts.speaker,
    date: opts.date,
    lang: result.lang,
  });
  await opts.appendNote(opts.slug, noteText, { kind: 'transcript' });

  opts.gitAdd([dest]);
  opts.gitCommit(`transcribe(${opts.slug}): ${filename}`);
  opts.write(`transcribe: ${filename} → ${dest}, lang=${result.lang}, ${result.text.length} chars\n`);
  return 0;
}

export interface TranscribeDirOptions {
  rootDir: string;
  slug: string;
  dirPath: string;
  lang: Lang;
  listAudio: (dir: string) => string[];
  runOne: (audioPath: string) => Promise<number>;
  writeFile: (path: string, content: string) => void;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

export async function runTranscribeDir(opts: TranscribeDirOptions): Promise<number> {
  const audios = opts.listAudio(opts.dirPath);
  const runId = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const failed: { path: string; code: number }[] = [];
  let ok = 0;
  for (const a of audios) {
    const code = await opts.runOne(a);
    if (code === 0) ok += 1; else failed.push({ path: a, code });
  }
  if (failed.length > 0) {
    const failedPath = `${opts.rootDir}/data/transcribe-runs/${runId}-failed.txt`;
    const lines = failed.map(f => `${f.path}\texit=${f.code}`);
    opts.writeFile(failedPath, lines.join('\n') + '\n');
    opts.write(`transcribe: ${ok} transcribed, ${failed.length} failed (see ${failedPath})\n`);
    return 5;
  }
  opts.write(`transcribe: ${ok} transcribed\n`);
  return 0;
}

function formatTranscriptNote(text: string, meta: { audio: string; speaker?: string; date?: string; lang: string }): string {
  const lines: string[] = [];
  lines.push(`Transcript of \`${meta.audio}\`${meta.speaker ? ` (speaker: ${meta.speaker})` : ''}${meta.date ? ` recorded ${meta.date}` : ''}, lang=${meta.lang}:`);
  lines.push('');
  lines.push(text.trim());
  return lines.join('\n');
}
