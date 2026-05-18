export type TranslationStatus = "current" | "stale" | "review" | "missing";

export interface StatusInput {
  translationCanonicalSha: string | undefined;
  canonicalHeadSha: string;
  unresolvedTalkEntries: number;
}

export function computeTranslationStatus(input: StatusInput): TranslationStatus {
  if (input.translationCanonicalSha === undefined) return "missing";
  if (input.translationCanonicalSha !== input.canonicalHeadSha) return "stale";
  if (input.unresolvedTalkEntries > 0) return "review";
  return "current";
}
