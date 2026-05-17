import { readFileSync } from 'node:fs';
import { GEDCStruct, g5ConfGEDC, g7ConfGEDC } from './vendor/gedcstruct.mjs';
import type { GedcomNode } from './types.ts';

export interface ParseResult {
  individuals: Map<string, GedcomNode>;   // "I123" → its tree
  families: Map<string, GedcomNode>;      // "F1" → its tree
  sources: Map<string, GedcomNode>;       // "S1" → its tree (TITL/AUTH/PUBL/_APID/NOTE)
  media: Map<string, GedcomNode>;         // "O1" → its tree (FILE/FORM/TITL/_OID)
  raw: GedcomNode[];                      // all top-level records
}

/**
 * Parses GEDCOM 5.5.1 OR 7.0 UTF-8 files via the vendored gedcstruct.mjs
 * (js-gedcom by Luther Tychonievich, technical editor of the v7 spec).
 *
 * The vendored library:
 *   - Handles CONC/CONT line continuation automatically
 *   - Returns a forest of GEDCStruct with .tag / .payload (string or
 *     reference to pointed-to struct) / .sub (children) / .xref_id
 *   - Accepts both 5.5.1 and 7.0 dialect configs
 *
 * We normalize that to our internal GedcomNode (tag/pointer/data/tree)
 * so the existing derive layer keeps working unchanged.
 *
 * History: previously used `parse-gedcom@2.0.1` (5.5.1-only). Replaced
 * when the source .ged was upgraded to 7.0.18 in 2026-05-17.
 */

/** Normalize a GEDCStruct node into our internal GedcomNode shape. */
function normalize(node: GEDCStruct): GedcomNode {
  // payload can be a string OR a GEDCStruct (when it's a pointer to another record).
  // For our consumers, `data` is always a string — resolve pointer refs back to
  // their xref_id (e.g. an HUSB pointer resolves to "I1" rather than the linked
  // INDI struct itself).
  let data: string | undefined;
  if (typeof node.payload === 'string') {
    data = node.payload;
  } else if (node.payload && typeof node.payload === 'object' && 'xref_id' in node.payload) {
    const xref = (node.payload as GEDCStruct).xref_id;
    data = xref ? `@${xref}@` : undefined;
  }

  return {
    tag: node.tag,
    pointer: node.xref_id ? `@${node.xref_id}@` : undefined,
    data,
    tree: node.sub.map(normalize),
  };
}

/**
 * Detect which dialect (5.5.1 vs 7.0) the file declares so we hand the right
 * config to the parser. Quick line-scan over the HEAD's GEDC.VERS line.
 * Returns 'g7' for 7.x, 'g5' for 5.x, and 'g5' by default (matches the
 * legacy behavior on files with no/odd version line).
 */
function detectDialect(text: string): 'g5' | 'g7' {
  // Look for "VERS 7.x" or "VERS 5.x" anywhere in the first ~30 lines (HEAD block).
  const head = text.split(/\r?\n/, 30).join('\n');
  const m = head.match(/^[12]\s+VERS\s+(\d+)/m);
  if (m && Number(m[1]) >= 7) return 'g7';
  return 'g5';
}

/** Parse a GEDCOM file (5.5.1 or 7.0) and return INDI/FAM/SOUR/OBJE records by xref id. */
export async function parseGedcomFile(path: string): Promise<ParseResult> {
  const text = readFileSync(path, 'utf-8');
  const dialect = detectDialect(text);
  const config = dialect === 'g7' ? g7ConfGEDC : g5ConfGEDC;

  const forest = GEDCStruct.fromString(text, config) as GEDCStruct[];
  const top: GedcomNode[] = forest.map(normalize);

  const head = top.find(n => n.tag === 'HEAD');
  if (!head) throw new Error('GEDCOM: no HEAD record');

  // CHAR check: required and must be UTF-8 in 5.5.1; absent in 7.0 (UTF-8 implied).
  if (dialect === 'g5') {
    const charNode = head.tree.find(n => n.tag === 'CHAR');
    if (!charNode) throw new Error('GEDCOM: missing CHAR (encoding); only UTF-8 is supported');
    const encoding = (charNode.data ?? '').trim().toUpperCase();
    if (encoding !== 'UTF-8' && encoding !== 'UTF8') {
      throw new Error(`GEDCOM: ${encoding} encoding not supported (this tool only accepts UTF-8); ANSEL and other encodings are out of scope`);
    }
  }

  const individuals = new Map<string, GedcomNode>();
  const families = new Map<string, GedcomNode>();
  const sources = new Map<string, GedcomNode>();
  const media = new Map<string, GedcomNode>();
  for (const record of top) {
    if (record.tag === 'INDI' && record.pointer) {
      individuals.set(stripPointer(record.pointer), record);
    } else if (record.tag === 'FAM' && record.pointer) {
      families.set(stripPointer(record.pointer), record);
    } else if (record.tag === 'SOUR' && record.pointer) {
      sources.set(stripPointer(record.pointer), record);
    } else if (record.tag === 'OBJE' && record.pointer) {
      media.set(stripPointer(record.pointer), record);
    }
  }

  return { individuals, families, sources, media, raw: top };
}

export function stripPointer(p: string): string {
  return p.replace(/^@|@$/g, '');
}
