export type Lang = 'en' | 'ru' | 'he' | 'auto';

export interface TranscribeRequest {
  audio: ArrayBuffer;
  filename: string;
  lang: Lang;
}

export interface TranscribeResult {
  text: string;
  lang: string; // ISO code reported by Whisper (e.g. 'en', 'ru', 'he')
}

export interface Transcriber {
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
}

export interface WhisperOptions {
  apiKey: string;
  fetch?: typeof fetch;
}

export function whisperTranscriber(opts: WhisperOptions): Transcriber {
  const f = opts.fetch ?? fetch;
  return {
    async transcribe(req) {
      const form = new FormData();
      form.set('file', new Blob([req.audio]), req.filename);
      form.set('model', 'whisper-1');
      form.set('response_format', 'verbose_json');
      if (req.lang !== 'auto') form.set('language', req.lang);
      const res = await f('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${opts.apiKey}` },
      });
      if (!res.ok) {
        throw new Error(`Whisper API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as { text: string; language?: string };
      return { text: data.text, lang: data.language ?? 'unknown' };
    },
  };
}
