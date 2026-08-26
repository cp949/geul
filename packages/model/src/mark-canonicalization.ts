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

// 인접한 두 인라인 run이 병합 가능한지("같은 mark 조합인가")를 판정한다.
// io(inline-content.ts, cell-text.ts, import-html.ts, import-markdown.ts)와
// core(table-commands.ts)가 이 판정을 각자 JSON.stringify나 위치 비교로
// 재구현하다 두 곳(모두 canonicalizeTextMarks를 거치지 않는 경로)이 mark
// 순서에 취약해졌다 — canonicalizeTextMarks로 양쪽을 정규 순서로 맞춘 뒤
// 비교해 이 취약점을 없앤다. undefined와 []는 항상 같다("mark 없음"의 두
// 표현).
export const sameMarks = (
  left: readonly TextMark[] | undefined,
  right: readonly TextMark[] | undefined,
): boolean => {
  const normalizedLeft = canonicalizeTextMarks(left ?? []);
  const normalizedRight = canonicalizeTextMarks(right ?? []);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((mark, index) => {
    const candidate = normalizedRight[index];
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
