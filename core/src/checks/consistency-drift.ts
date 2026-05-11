import type { Detector, Finding, LoadedPage, RepoState } from './types.ts';

export const detectConsistencyDrift: Detector = (state: RepoState): Finding[] => {
  const findings: Finding[] = [];
  for (const page of state.pages) {
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
  const bibIdx = body.indexOf('## Bibliography');
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
