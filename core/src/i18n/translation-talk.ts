export interface TalkEntry {
  kind: string;
  resolved: boolean;
}

export interface TalkSummary {
  unresolved: number;
  resolved: number;
  entries: TalkEntry[];
}

export function parseTranslationTalk(body: string): TalkSummary {
  if (!body.trim()) return { unresolved: 0, resolved: 0, entries: [] };

  const sections = extractSections(body);
  const entries: TalkEntry[] = [];

  for (const entry of parseEntries(sections.unresolved, false)) entries.push(entry);
  for (const entry of parseEntries(sections.resolved, true)) entries.push(entry);

  return {
    unresolved: entries.filter(e => !e.resolved).length,
    resolved: entries.filter(e => e.resolved).length,
    entries,
  };
}

function extractSections(body: string): { unresolved: string; resolved: string } {
  const unresolvedMatch = body.match(/##\s+Unresolved\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const resolvedMatch = body.match(/##\s+Resolved\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return {
    unresolved: unresolvedMatch ? unresolvedMatch[1] : "",
    resolved: resolvedMatch ? resolvedMatch[1] : "",
  };
}

function parseEntries(section: string, sectionResolved: boolean): TalkEntry[] {
  const lines = section.split("\n");
  const out: TalkEntry[] = [];
  for (const line of lines) {
    const m = line.match(/^-\s*\[([ x])\]\s*\*\*\[([a-z][\w-]*)\]\*\*/i);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const kind = m[2];
    out.push({ kind, resolved: sectionResolved ? true : checked });
  }
  return out;
}
