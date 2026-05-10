import type { HarnessAdapter } from '../harness/types.js';

interface Question { text: string; rationale?: string }

export interface InterviewOptions {
  slug: string;
  maxQuestions: number;
  harness: HarnessAdapter;
  loadEvidence: (slug: string) => Promise<{ derived: unknown; talk: string; narrative: string | null }>;
  editInEditor: (initial: string) => Promise<string>;
  appendNote: (slug: string, text: string, opts: { kind: 'interview' }) => Promise<void>;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
  },
};

export async function runInterview(opts: InterviewOptions): Promise<number> {
  const evidence = await opts.loadEvidence(opts.slug);
  const res = await opts.harness.invoke<unknown, { questions: Question[] }>({
    skill: 'writing-articles',
    template: 'interview',
    context: { slug: opts.slug, maxQuestions: opts.maxQuestions, evidence },
    outputSchema: OUTPUT_SCHEMA,
  });
  if (!res.ok) {
    opts.writeErr(`interview: harness failed — ${res.error}\n`);
    return 6;
  }
  const buffer = renderQAs(opts.slug, res.result.questions);
  const edited = await opts.editInEditor(buffer);
  const answers = parseAnswers(edited);
  if (answers.length === 0) {
    opts.writeErr(`interview: no answers entered\n`);
    return 3;
  }
  for (const a of answers) {
    const noteText = `**Q:** ${a.question}\n\n**A:** ${a.answer}`;
    await opts.appendNote(opts.slug, noteText, { kind: 'interview' });
  }
  opts.write(`interview: saved ${answers.length} of ${res.result.questions.length} answer${answers.length === 1 ? '' : 's'} to ${opts.slug}.talk\n`);
  return 0;
}

function renderQAs(slug: string, questions: Question[]): string {
  const out: string[] = [];
  out.push(`<!-- Interview for ${slug}. Fill in <answer> blocks; blank answers are dropped on save. -->`);
  out.push('');
  for (const q of questions) {
    out.push(`### ${q.text}`);
    if (q.rationale) out.push(`*Why this is asked: ${q.rationale}*`);
    out.push('');
    out.push('<answer>');
    out.push('');
    out.push('</answer>');
    out.push('');
  }
  return out.join('\n');
}

export function parseAnswers(text: string): { question: string; answer: string }[] {
  text = text.replace(/\r\n/g, '\n'); // normalize Windows line endings
  const out: { question: string; answer: string }[] = [];
  // Match: ### <question>\n[optional rationale line\n]\n<answer>\n<content>\n</answer>
  const re = /^### (.+?)\n(?:\*Why[^\n]*\*\n)?\n<answer>\n([\s\S]*?)\n<\/answer>/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const q = m[1]!.trim();
    const a = m[2]!.trim();
    if (a !== '') out.push({ question: q, answer: a });
  }
  return out;
}
