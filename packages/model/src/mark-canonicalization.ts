import type { Result } from "./result.js";
import type { TextMark } from "./types.js";

// href 없이 이름만으로 만드는 mark 종류. "link"는 href가 따로 필요해 여기서
// 뺀다 — TextMark["type"] 전체 집합에서 "link"를 제외한 것과 같다.
export const PLAIN_TEXT_MARK_TYPES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
] as const;

// textColor/backgroundColor는 기존 6종 뒤(6·7)에 붙는다 — 기존 값(0-5)을
// 그대로 두어 이미 저장된 문서·테스트의 정규 순서를 바꾸지 않는다.
const storedMarkOrder: Record<TextMark["type"], number> = {
  link: 0,
  bold: 1,
  code: 2,
  italic: 3,
  strike: 4,
  underline: 5,
  textColor: 6,
  backgroundColor: 7,
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

export type TextMarkNameInput = {
  type: string;
  href?: unknown;
  color?: unknown;
};

// "mark 이름(+href/color) → TextMark"의 유일한 권위. core가 PM 노드 경로
// (table-model-codec.ts)와 tiptap JSON 경로(tiptap-to-model.ts) 양쪽에서
// 이 하나를 호출한다 — 두 경로가 인식하는 mark 집합과 미인식 mark의 거절
// 여부가 다시 갈라지지 않게 한다. 인식하지 못하는 이름은 항상 거절한다
// (관대하게 조용히 버리지 않는다) — 표 셀이든 문단이든 저장 원본이 알 수
// 없는 mark를 담고 있으면 그 사실이 드러나야 한다. color 값 자체의 정규형
// (#RRGGBB 대문자) 검증은 여기서 하지 않는다 — link의 href와 같이 값의
// 존재(타입)만 확인하고, 정규형 판정은 schema.ts의 validateContent가
// 단독으로 맡는다(G-CNV-001).
export const decodeTextMark = (
  mark: TextMarkNameInput,
): Result<TextMark, string> => {
  if (mark.type === "link") {
    return typeof mark.href === "string"
      ? { ok: true, value: { type: "link", href: mark.href } }
      : { ok: false, error: "Link mark requires an href" };
  }
  if (mark.type === "textColor" || mark.type === "backgroundColor") {
    return typeof mark.color === "string"
      ? { ok: true, value: { type: mark.type, color: mark.color } }
      : { ok: false, error: `${mark.type} mark requires a color` };
  }
  const known = PLAIN_TEXT_MARK_TYPES.find((name) => name === mark.type);
  return known === undefined
    ? { ok: false, error: `Unsupported mark: ${mark.type}` }
    : { ok: true, value: { type: known } };
};
