import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';

export interface PromoteInput {
  record: string;
  field: 'birth.date' | 'birth.place' | 'death.date' | 'death.place' | 'name';
  value: string;
  source: string;
}

export interface PromoteResult {
  gedcomText: string;
  pageText: string;
}

const SUPPORTED_FIELDS = new Set([
  'birth.date',
  'birth.place',
  'death.date',
  'death.place',
] as const);

/**
 * Pure planner: compute the GEDCOM and page edits for promoting one
 * correction. Does not touch disk. Returns the new file contents for both.
 *
 * Throws when:
 * - The record id is not present in the GEDCOM.
 * - The field is `name` (v1 limitation — see plan 4 scope).
 */
export function planPromote(
  gedcomText: string,
  pageText: string,
  input: PromoteInput,
): PromoteResult {
  if (input.field === 'name') {
    throw new Error(
      'planPromote: `name` field promotion is not supported in v1. ' +
        'Edit the GEDCOM 1 NAME line manually (cascade effects on 2 GIVN/SURN).',
    );
  }
  if (!SUPPORTED_FIELDS.has(input.field as Exclude<PromoteInput['field'], 'name'>)) {
    throw new Error(`planPromote: unsupported field "${input.field}"`);
  }

  const newGedcom = updateGedcomEvent(gedcomText, input);
  const newPage = removeCorrectionFromPage(pageText, input);
  return { gedcomText: newGedcom, pageText: newPage };
}

function updateGedcomEvent(text: string, input: PromoteInput): string {
  const lines = text.split('\n');
  const recordHeader = `0 @${input.record}@`;
  let recordStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith(recordHeader)) {
      recordStart = i;
      break;
    }
  }
  if (recordStart === -1) {
    throw new Error(`planPromote: record "${input.record}" not found in GEDCOM`);
  }

  // Find the end of this record (next `0 ` line or EOF)
  let recordEnd = lines.length;
  for (let i = recordStart + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('0 ')) {
      recordEnd = i;
      break;
    }
  }

  const eventTag = input.field.startsWith('birth.') ? 'BIRT' : 'DEAT';
  const subTag = input.field.endsWith('.date') ? 'DATE' : 'PLAC';

  // Find the event block within [recordStart, recordEnd)
  let eventStart = -1;
  for (let i = recordStart + 1; i < recordEnd; i++) {
    if (lines[i] === `1 ${eventTag}`) {
      eventStart = i;
      break;
    }
  }

  // If event block is missing, append before recordEnd
  if (eventStart === -1) {
    const insertion = [
      `1 ${eventTag}`,
      `2 ${subTag} ${input.value}`,
      `2 NOTE ${input.source}`,
    ];
    lines.splice(recordEnd, 0, ...insertion);
    return lines.join('\n');
  }

  // Find the end of this event block (next `1 ` line or recordEnd)
  let eventEnd = recordEnd;
  for (let i = eventStart + 1; i < recordEnd; i++) {
    if (lines[i]!.startsWith('1 ')) {
      eventEnd = i;
      break;
    }
  }

  // Find the existing sub-tag line within [eventStart+1, eventEnd)
  let subLineIdx = -1;
  for (let i = eventStart + 1; i < eventEnd; i++) {
    if (lines[i]!.startsWith(`2 ${subTag} `) || lines[i] === `2 ${subTag}`) {
      subLineIdx = i;
      break;
    }
  }

  if (subLineIdx === -1) {
    // Sub-tag missing — insert it right after the `1 EVENT` line
    lines.splice(eventStart + 1, 0, `2 ${subTag} ${input.value}`);
    eventEnd += 1;
  } else {
    lines[subLineIdx] = `2 ${subTag} ${input.value}`;
  }

  // Append a NOTE line at the end of the event block
  lines.splice(eventEnd, 0, `2 NOTE ${input.source}`);

  return lines.join('\n');
}

function removeCorrectionFromPage(pageText: string, input: PromoteInput): string {
  const parsed = matter(pageText);
  const data = parsed.data as { corrections?: Array<{ record?: string; field: string; value: string; source: string }> };
  if (!Array.isArray(data.corrections)) return pageText;
  const filtered = data.corrections.filter(c => {
    const target = c.record ?? (parsed.data as any).gedcom?.record;
    return !(
      target === input.record &&
      c.field === input.field &&
      c.value === input.value
    );
  });
  if (filtered.length === data.corrections.length) {
    // No matching correction found — leave page untouched.
    return pageText;
  }
  // Build a new data object to avoid mutating gray-matter's cached parsed.data reference.
  const { corrections: _dropped, ...rest } = data as any;
  const newData = filtered.length === 0 ? rest : { ...rest, corrections: filtered };
  return matter.stringify(parsed.content, newData, { lineWidth: -1 });
}

export interface ApplyPromoteOptions extends PromoteInput {
  gedcomPath: string;
  pagePath: string;
}

/**
 * Boundary: read the GEDCOM and page from disk, plan the promotion,
 * and write the changes back. Returns the planned result for inspection.
 *
 * Caller is responsible for triggering `wai sync-gedcom` afterwards
 * to regenerate `derived/*.yml`.
 */
export function applyPromote(opts: ApplyPromoteOptions): PromoteResult {
  const gedcomText = readFileSync(opts.gedcomPath, 'utf-8');
  const pageText = readFileSync(opts.pagePath, 'utf-8');
  const result = planPromote(gedcomText, pageText, opts);
  writeFileSync(opts.gedcomPath, result.gedcomText);
  writeFileSync(opts.pagePath, result.pageText);
  return result;
}
