export interface EvidenceDrawer {
  slug: string;
  derived: { record: string; raw: string } | null;
  talkBody: string | null;
  researchNotes: ReadonlyArray<{ id: string; date: string; text: string; kind: string }>;
  narrativeBody: string | null;
  transcripts: ReadonlyArray<{ id: string; audioFile: string; lang: string; text: string }>;
  inputs: ReadonlyArray<'derived' | 'talk' | 'narrative' | 'audio'>;
}

export interface GatherDeps {
  rootDir: string;
  readFile: (p: string) => string | null;
  /** Returns the page metadata + body, or null if missing. */
  readPage: (slug: string) => Promise<{ frontmatter: Record<string, unknown>; body: string } | null>;
  /** Returns the talk-page body + parsed research notes. */
  readTalk: (slug: string) => Promise<{
    body: string;
    notes: ReadonlyArray<{ id: string; date: string; text: string; kind: string }>;
  } | null>;
  /**
   * Fallback resolver for slugs that don't yet have a page. Scans
   * `genealogy/derived/*.yml` and returns the record whose `name` field
   * slugifies to the requested slug. Used by `--cohort missing` and any
   * other path that authors a page before one exists on disk.
   */
  findDerivedBySlug: (slug: string, rootDir: string) => { record: string; raw: string } | null;
}

export async function gather(slug: string, deps: GatherDeps): Promise<EvidenceDrawer> {
  const inputs: Array<'derived' | 'talk' | 'narrative' | 'audio'> = [];
  let derived: EvidenceDrawer['derived'] = null;
  let talkBody: string | null = null;
  let researchNotes: ReadonlyArray<{ id: string; date: string; text: string; kind: string }> = [];
  let narrativeBody: string | null = null;
  let transcripts: ReadonlyArray<{ id: string; audioFile: string; lang: string; text: string }> = [];

  // Derived YAML — resolve via the page's frontmatter `gedcom.record` field.
  const page = await deps.readPage(slug).catch(() => null);
  if (page) {
    const rec = (page.frontmatter as { gedcom?: { record?: string } }).gedcom?.record;
    if (rec) {
      const ymlPath = `${deps.rootDir}/genealogy/derived/${rec}.yml`;
      const raw = deps.readFile(ymlPath);
      if (raw !== null) {
        derived = { record: rec, raw };
        inputs.push('derived');
      }
    }
  }
  // Fallback for missing pages: scan derived/*.yml for a name-slug match.
  if (derived === null) {
    const found = deps.findDerivedBySlug(slug, deps.rootDir);
    if (found) {
      derived = found;
      inputs.push('derived');
    }
  }

  const talk = await deps.readTalk(slug).catch(() => null);
  if (talk) {
    talkBody = talk.body;
    researchNotes = talk.notes.filter(n => n.kind !== 'transcript');
    transcripts = talk.notes
      .filter(n => n.kind === 'transcript')
      .map(n => parseTranscriptNote(n));
    if (talk.notes.length > 0) inputs.push('talk');
    if (transcripts.length > 0) inputs.push('audio');
  }

  const narr = deps.readFile(`${deps.rootDir}/pages/${slug}.narrative.md`);
  if (narr !== null) {
    narrativeBody = narr;
    inputs.push('narrative');
  }

  return { slug, derived, talkBody, researchNotes, narrativeBody, transcripts, inputs };
}

function parseTranscriptNote(n: { id: string; date: string; text: string; kind: string }): { id: string; audioFile: string; lang: string; text: string } {
  // Notes from `wai transcribe` follow the format:
  //   "Transcript of `<filename>` ..., lang=<iso>:\n\n<body>"
  const m = n.text.match(/^Transcript of `([^`]+)`.*?lang=(\w+):\n\n([\s\S]*)$/);
  if (!m) return { id: n.id, audioFile: '?', lang: '?', text: n.text };
  return { id: n.id, audioFile: m[1]!, lang: m[2]!, text: m[3]!.trim() };
}
