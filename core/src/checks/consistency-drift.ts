import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';

export const detectConsistencyDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  const livePages = new Map<string, LoadedPage>();
  for (const page of state.pages) {
    if (!page.slug.endsWith('.talk')) livePages.set(page.slug, page);
  }
  for (const page of state.pages) {
    if (page.slug.endsWith('.talk')) {
      const liveSlug = page.slug.slice(0, -'.talk'.length);
      const livePage = livePages.get(liveSlug);
      if (livePage) {
        findings.push(...detectTalkLivePageDrift(page, livePage));
      }
      continue;
    }
    findings.push(...detectFootnoteOrphans(page));
    findings.push(...detectBibliographyMismatch(page));
    findings.push(...detectGedcomMismatch(page, state));
  }
  // TODO(consistency-v2): detectSelfContradictions (lead vs infobox vs body)
  // TODO(consistency-v2): detectCrossPageContradictions (e.g. son's death year on parent vs child page)
  // TODO(consistency-v2): detectFootnoteClaimMismatch (claim text vs footnote source text)
  return findings;
};

function detectFootnoteOrphans(page: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const body = page.body;

  // Find all footnote references: [^id] (not followed by :)
  const refs = new Set<string>();
  for (const m of body.matchAll(/\[\^([a-zA-Z0-9_-]+)\](?!:)/g)) {
    refs.add(m[1]!);
  }

  // Find all footnote definitions: [^id]:
  const defs = new Set<string>();
  for (const m of body.matchAll(/^\[\^([a-zA-Z0-9_-]+)\]:/gm)) {
    defs.add(m[1]!);
  }

  for (const id of refs) {
    if (!defs.has(id)) {
      findings.push({
        category: 'consistency',
        severity: 'error',
        message: `${page.slug}: footnote [^${id}] referenced but never defined`,
        location: { file: page.path },
      });
    }
  }
  for (const id of defs) {
    if (!refs.has(id)) {
      findings.push({
        category: 'consistency',
        severity: 'error',
        message: `${page.slug}: footnote [^${id}] defined but never referenced`,
        location: { file: page.path },
      });
    }
  }
  return findings;
}

function detectBibliographyMismatch(page: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const body = page.body;

  // Find inline ::cite-vault directives (single-colon, attrs may include note/type/snapshot/timestamp).
  const inlineMatches = [...body.matchAll(/::cite-vault\{([^}]*)\}/g)];
  // Find the ## Bibliography section, then any ::cite-vault entries inside it.
  // Anchor to line-start: a literal "## Bibliography" in body prose ("see
  // ## Bibliography section below") would otherwise start the bib slice
  // mid-paragraph, sweeping body-prose cite-vaults into bibKeys and hiding
  // real "inline cite missing from bibliography" findings.
  const bibIdx = body.startsWith('## Bibliography') ? 0 : body.indexOf('\n## Bibliography');
  const bibSection = bibIdx === -1 ? '' : body.slice(bibIdx);
  const bibMatches = [...bibSection.matchAll(/::cite-vault\{([^}]*)\}/g)];

  // Heuristic: extract a `note=...` or `snapshot=...` key from each match to compare.
  const keyOf = (attrs: string) => {
    const note = attrs.match(/note="([^"]*)"/)?.[1];
    const snap = attrs.match(/snapshot=([^\s}]+)/)?.[1];
    return `${snap ?? '?'}|${note ?? '?'}`;
  };

  const inlineKeys = new Set(inlineMatches.map(m => keyOf(m[1]!)));
  const bibKeys = new Set(bibMatches.map(m => keyOf(m[1]!)));

  for (const k of inlineKeys) {
    if (!bibKeys.has(k)) {
      findings.push({
        category: 'consistency',
        severity: 'info',
        message: `${page.slug}: inline cite-vault entry not listed in ## Bibliography (key: ${k})`,
        location: { file: page.path },
      });
    }
  }
  return findings;
}

function detectGedcomMismatch(page: LoadedPage, state: RepoState): Finding[] {
  const findings: Finding[] = [];
  const recordId = (page.meta as { gedcom?: { record?: string } }).gedcom?.record;
  if (!recordId) return findings;
  const derived = state.derived.get(recordId);
  if (!derived) return findings;

  // Find infobox-person block
  const infoboxMatch = page.body.match(/:::infobox-person\n([\s\S]*?)\n:::/);
  if (!infoboxMatch) return findings;
  const infobox = infoboxMatch[1]!;

  // Extract born / died / birthplace from infobox
  const pageBorn = extractInfoboxField(infobox, 'born');
  const pageDied = extractInfoboxField(infobox, 'died');
  const pageBirthplace = extractInfoboxField(infobox, 'birthplace');

  const corrections = (page.meta as { corrections?: Array<{ field: string }> }).corrections ?? [];
  const correctedFields = new Set(corrections.map(c => c.field));

  const derivedBorn = derived.birth?.date ?? null;
  const derivedDied = derived.death?.date ?? null;
  const derivedBirthplace = derived.birth?.place ?? null;

  if (pageBorn && derivedBorn && !valuesAgree(pageBorn, derivedBorn) && !correctedFields.has('birth.date')) {
    findings.push({
      category: 'consistency',
      severity: 'error',
      message: `${page.slug}: infobox born="${pageBorn}" differs from derived birth.date="${derivedBorn}" (no corrections entry)`,
      location: { file: page.path },
    });
  }
  if (pageDied && derivedDied && !valuesAgree(pageDied, derivedDied) && !correctedFields.has('death.date')) {
    findings.push({
      category: 'consistency',
      severity: 'error',
      message: `${page.slug}: infobox died="${pageDied}" differs from derived death.date="${derivedDied}" (no corrections entry)`,
      location: { file: page.path },
    });
  }
  if (pageBirthplace && derivedBirthplace && !valuesAgree(pageBirthplace, derivedBirthplace) && !correctedFields.has('birth.place')) {
    findings.push({
      category: 'consistency',
      severity: 'error',
      message: `${page.slug}: infobox birthplace="${pageBirthplace}" differs from derived birth.place="${derivedBirthplace}" (no corrections entry)`,
      location: { file: page.path },
    });
  }
  return findings;
}

const INFOBOX_FIELD_REGEXES: Record<string, RegExp> = {
  born: /^born:\s*"?([^"\n]+)"?$/m,
  died: /^died:\s*"?([^"\n]+)"?$/m,
  birthplace: /^birthplace:\s*"?([^"\n]+)"?$/m,
};

function extractInfoboxField(infobox: string, key: string): string | null {
  const re = INFOBOX_FIELD_REGEXES[key];
  if (!re) return null;
  const m = infobox.match(re);
  return m ? m[1]!.trim() : null;
}

/** Lenient comparison — strips surrounding quotes, trims, lowercases.
 *  Avoids false positives on minor format differences.
 *  TODO(consistency-v2): tighten once eval suite shows which false positives remain. */
function valuesAgree(a: string, b: string): boolean {
  const n = (s: string) => s.trim().replace(/^"|"$/g, '').toLowerCase();
  return n(a) === n(b) || n(a).startsWith(n(b)) || n(b).startsWith(n(a));
}

const SCANNED_TALK_SECTIONS = ['Facts extracted', 'Drafting plan', 'Cross-references'] as const;

/**
 * Flag quoted claim phrases that appear in a talk page's research / drafting
 * sections but don't appear (verbatim) on its live page. This is the
 * specific failure mode that let the Boris/Kelman medal mix-up linger: the
 * talk page's Facts extracted and Drafting plan sections asserted the
 * "For Defense of Kyiv" medal as Boris's, the live page (after correction)
 * doesn't, and nothing in the existing detectors compared the two surfaces.
 *
 * v1 scope is narrow on purpose: only double-quoted (`"…"`) and
 * guillemet-quoted (`«…»`) phrases inside three named sections. Phrases
 * elsewhere on the talk page (e.g., Open editorial questions) are scoped
 * out — they're often hypotheticals being weighed, not active claims.
 * Severity is `warn` because some legitimate skew exists (a quoted source
 * phrase on the talk page may be paraphrased rather than quoted on the
 * live page); the caller decides whether to `--fail-on consistency`.
 *
 * Editorial annotations of the form `*[Corrected 2026-MM-DD from "X"]*`
 * (the project's fact-correction discipline; see
 * plugins/whoami/skills/editorial-guide/SKILL.md) are stripped from each
 * section slice before phrase extraction. Those annotations frequently
 * quote the old wrong claim while documenting the correction, and would
 * otherwise produce 100% false positives on any talk page whose live
 * page was recently corrected.
 */
function detectTalkLivePageDrift(talkPage: LoadedPage, livePage: LoadedPage): Finding[] {
  const findings: Finding[] = [];
  const talkLines = talkPage.body.split('\n');
  const seen = new Set<string>();
  for (const section of SCANNED_TALK_SECTIONS) {
    const slice = sectionSlice(talkPage.body, section);
    if (!slice) continue;
    // Strip `*[…]*` editorial annotations before phrase extraction — those
    // are correction/history notes (see the Fact-correction discipline in
    // plugins/whoami/skills/editorial-guide/SKILL.md), not active claims,
    // and they routinely quote the old wrong claim while documenting the
    // correction. Without this strip, every correction annotation produces
    // a spurious finding.
    const claimSlice = slice.replace(/\*\[[^\]]*\]\*/g, '');
    for (const phrase of extractQuotedPhrases(claimSlice)) {
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      if (livePage.body.includes(phrase)) continue;
      // Find the talk-page line number that contains this phrase, for the
      // finding location.
      let line = 1;
      for (let i = 0; i < talkLines.length; i++) {
        if (talkLines[i]!.includes(phrase)) { line = i + 1; break; }
      }
      findings.push({
        category: 'consistency',
        severity: 'warn',
        message: `${talkPage.slug}: talk page asserts "${phrase}" in ## ${section} but live page ${livePage.slug}.md doesn't mention it — talk page may be stale, or live page may be missing a claim that should be asserted`,
        location: { file: talkPage.path, line },
      });
    }
  }
  return findings;
}

/**
 * Pull every double-quoted (`"…"`) or guillemet-quoted (`«…»`) phrase out
 * of a body string. Empty quotes are skipped; interior whitespace is
 * trimmed. Used by `detectTalkLivePageDrift` to find claim phrases on
 * talk pages that the live page should also assert if they're load-bearing.
 */
export function extractQuotedPhrases(body: string): string[] {
  const out: string[] = [];
  // `[^…]*` (not `+`) so an empty `""`/`«»` consumes both delimiters and
  // advances `lastIndex` past them — otherwise the engine would skip the
  // opening quote of an empty pair and pair its closer with the NEXT `"`,
  // sweeping unrelated prose into a spurious match.
  const patterns = [/"([^"]*)"/g, /«([^»]*)»/g];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const phrase = m[1]!.trim();
      if (phrase.length > 0) out.push(phrase);
    }
  }
  return out;
}

/**
 * Return the text contents of the named `## Heading` section, ending at
 * the next `## ` heading (or end-of-body). Returns `""` if the section
 * isn't present. Match is on the exact heading text (case-sensitive).
 * Code-fence aware: a literal "## Name" inside a fenced block does not
 * count as the section header — mirrors the discipline in the Phase 3/7
 * outline finders in `cli/src/commands/author/{outline,log}.ts`.
 */
export function sectionSlice(body: string, headingText: string): string {
  const marker = `## ${headingText}`;
  const lines = body.split('\n');
  let inCode = false;
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedStart = line.trimStart();
    if (trimmedStart.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (startLine === -1) {
      if (line === marker) startLine = i;
    } else if (line.startsWith('## ')) {
      // End of the section.
      return wrap(lines.slice(startLine + 1, i).join('\n'));
    }
  }
  if (startLine === -1) return '';
  return wrap(lines.slice(startLine + 1).join('\n'));
}

function wrap(inner: string): string {
  const trimmed = inner.replace(/^\n+/, '').replace(/\n+$/, '');
  return '\n' + trimmed + '\n';
}
