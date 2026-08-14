import type { TextMark } from "./types.js";

const storedMarkOrder: Record<TextMark["type"], number> = {
  link: 0,
  bold: 1,
  code: 2,
  italic: 3,
  strike: 4,
  underline: 5,
};

const sameMark = (left: TextMark, right: TextMark): boolean =>
  left.type === right.type &&
  (left.type !== "link" || (right.type === "link" && left.href === right.href));

export const canonicalizeTextMarks = (marks: readonly TextMark[]): TextMark[] =>
  marks
    .map((mark, index) => ({ mark, index }))
    .sort(
      (left, right) =>
        storedMarkOrder[left.mark.type] - storedMarkOrder[right.mark.type] ||
        left.index - right.index,
    )
    .map(({ mark }) => mark)
    .filter(
      (mark, index, canonical) =>
        canonical.findIndex((candidate) => sameMark(mark, candidate)) === index,
    );

export const isCanonicalTextMarks = (marks: readonly TextMark[]): boolean => {
  const seenTypes = new Set<TextMark["type"]>();
  for (const mark of marks) {
    if (seenTypes.has(mark.type)) return false;
    seenTypes.add(mark.type);
  }

  const canonical = canonicalizeTextMarks(marks);
  return marks.every((mark, index) => {
    const candidate = canonical[index];
    return candidate !== undefined && sameMark(mark, candidate);
  });
};

export const firstNonCanonicalTextMarkIndex = (
  marks: readonly TextMark[],
): number | undefined => {
  const seenTypes = new Set<TextMark["type"]>();
  for (const [index, mark] of marks.entries()) {
    if (seenTypes.has(mark.type)) return index;
    seenTypes.add(mark.type);
  }

  const canonical = canonicalizeTextMarks(marks);
  for (const [index, mark] of marks.entries()) {
    const candidate = canonical[index];
    if (candidate === undefined || !sameMark(mark, candidate)) return index;
  }
  return undefined;
};
