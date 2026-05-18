// Type declarations for the vendored gedcstruct.mjs (js-gedcom).
// Only the surface this project actually calls is typed; the rest of
// the library's exports work but aren't declared.
//
// TypeScript pairs gedcstruct.d.mts with gedcstruct.mjs by filename;
// no `declare module` wrapper needed.

export interface GEDCConfig {
  readonly version: string;
}

/** Dialect config for GEDCOM 5.5.1 parsing. */
export const g5ConfGEDC: GEDCConfig;
/** Dialect config for GEDCOM 7.0 parsing. */
export const g7ConfGEDC: GEDCConfig;

/**
 * One node in the GEDCOM forest. Top-level records have `superstruct === null`
 * and a non-empty `xref_id`; substructures have a parent.
 */
export class GEDCStruct {
  /** The GEDCOM tag, e.g. "INDI", "NAME", "SEX". Always uppercase. */
  readonly tag: string;
  /**
   * The payload value on the same line as the tag, or undefined if the
   * tag has no payload. For pointer fields (HUSB, FAMC, FAMS, etc.) this
   * is a reference to the pointed-to GEDCStruct rather than a string.
   */
  readonly payload: string | GEDCStruct | undefined;
  /** Child structures (one level deeper in the GEDCOM hierarchy). */
  readonly sub: GEDCStruct[];
  /** Parent structure, or null for top-level records. */
  readonly superstruct: GEDCStruct | null;
  /** Other structures pointing at this one (frozen array). */
  readonly references: ReadonlyArray<GEDCStruct>;
  /** Cross-reference identifier for top-level records ("I123", "F1", etc.). */
  readonly xref_id: string | undefined;

  /**
   * Parse a GEDCOM file's contents into a forest of GEDCStruct trees.
   * Pass `g7ConfGEDC` for GEDCOM 7 or `g5ConfGEDC` for GEDCOM 5.5.1.
   * Returns the top-level records (HEAD, INDI, FAM, SOUR, OBJE, TRLR, etc.).
   */
  static fromString(
    input: string,
    config?: GEDCConfig,
    logger?: (level: string, msg: string, node?: GEDCStruct) => void,
  ): GEDCStruct[];
}

export function GEDCToString(forest: GEDCStruct[]): string;
