// markdown 내보내기가 보존하지 못하는 hardBreak(`\n`)의 판정과 lossy 출력 변환이다(Issue #401).
// 판정과 변환을 이 파일 한 곳이 소유한다. loss-analysis.ts와 export-markdown.ts는
// 각자 판정을 복제하지 않고 여기 함수를 부른다.
//
// 대상 모양:
// - 블록 끝: 마지막 비어 있지 않은 글자 런 끝의 `\n`.
//   mdast `break`가 `a\`로 나가고 블록 끝의 `\`는 개행으로 읽히지 않는다.
// - mark 런 끝: bold·italic·strike 런 끝의 `\n`. 뒤에 다른 글자가 온다.
//   구분자 바로 앞의 개행은 `&#xA;`로 바뀌어 글자가 달라진다.
// - 제목 3–6의 안쪽 `\n`: ATX 제목이 개행을 담지 못해 공백 한 칸이 된다.
//   제목 1·2도 글자가 전부 개행뿐이면 ATX로 나가 같다(link 단독 런은 정리에서 빠진다).
//
// 대상이 아닌 모양:
// - 표 셀: 호출자가 이 함수를 부르지 않는다. `<br>`로 이미 왕복한다.
// - 중간·시작 개행, mark 없는 런 뒤에 mark 런이 오는 모양.
// - link만 달린 런의 끝 개행. `[a\` + 개행 + `](url)`로 나가 왕복이 같다.
//   bold·italic·strike가 함께 달리면 대상이다. 안쪽 `**a\&#xA;**`가 깨진다.
// - code가 달린 런. INLINE_CODE_NEWLINE이 이미 보고한다.
//
// 판정은 변환 결과 비교로 정의한다. 판정과 출력이 한 변환에서 나와 어긋날 수 없다.
import { type InlineContent, isTextRunItem } from "@cp949/geul-model";

type TextRun = Extract<InlineContent[number], { text: string }>;
type Mark = NonNullable<TextRun["marks"]>[number];

export type HardBreakLossShape = "BLOCK_END" | "MARK_RUN_END" | "HEADING_INNER";

const hasMark = (run: TextRun, type: Mark["type"]): boolean =>
  (run.marks ?? []).some((mark) => mark.type === type);

// 출력에서 글자를 감싸는 mark다. underline은 내보내기가 버리고, 색 mark는 lossy에서 감싸지 않는다.
const isWrapped = (run: TextRun): boolean =>
  hasMark(run, "bold") || hasMark(run, "italic") || hasMark(run, "strike");

// 변환 대상에서 빼는 런이다. code는 INLINE_CODE_NEWLINE이 보고한다.
// link만 달린 런은 끝 개행이 그대로 왕복한다.
const isExempt = (run: TextRun): boolean =>
  hasMark(run, "code") || (hasMark(run, "link") && !isWrapped(run));

const trimmedEnd = (text: string): string => text.replace(/\n+$/, "");

// 블록 끝의 `\n`을 지운다. 뒤에서부터 보며 개행만 남은 런은 지우고 앞 런으로 넘어간다.
// 마지막 비어 있지 않은 런이 변환 대상이 아니거나 끝 개행이 없으면 멈춘다.
// 바뀐 것이 없으면 입력 배열을 그대로 돌려준다.
const stripBlockEnd = (content: InlineContent): InlineContent => {
  const removed = new Set<number>();
  let replaced: { index: number; run: TextRun } | undefined;
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const item = content[index];
    if (item === undefined || !isTextRunItem(item)) break;
    if (item.text === "") continue;
    if (isExempt(item)) break;
    const text = trimmedEnd(item.text);
    if (text === item.text) break;
    if (text === "") {
      removed.add(index);
      continue;
    }
    replaced = { index, run: { ...item, text } };
    break;
  }
  if (removed.size === 0 && replaced === undefined) return content;
  return content.flatMap((item, index) =>
    removed.has(index) ? [] : [replaced?.index === index ? replaced.run : item],
  );
};

// mark 런 끝의 `\n`을 mark 밖 평문 런으로 뺀다. 뺀 뒤 글자가 없으면 mark 런은 사라진다.
// 바뀐 것이 없으면 입력 배열을 그대로 돌려준다.
const moveMarkRunEnds = (content: InlineContent): InlineContent => {
  let changed = false;
  const moved = content.flatMap((item) => {
    if (
      !isTextRunItem(item) ||
      !isWrapped(item) ||
      hasMark(item, "code") ||
      !item.text.endsWith("\n")
    ) {
      return [item];
    }
    changed = true;
    const text = trimmedEnd(item.text);
    const newlines: InlineContent[number] = {
      text: item.text.slice(text.length),
    };
    return text === "" ? [newlines] : [{ ...item, text }, newlines];
  });
  return changed ? moved : content;
};

/**
 * lossy 출력용으로 hardBreak 끝 모양을 바꾼 content를 돌려준다.
 * - 블록 끝의 `\n`을 전부 지운다.
 * - mark 런 끝의 `\n`을 mark 밖 평문 런으로 뺀다.
 * 바뀐 것이 없으면 입력 배열을 그대로 돌려준다(참조가 같다).
 */
export const normalizeHardBreakEdges = (
  content: InlineContent,
): InlineContent => moveMarkRunEnds(stripBlockEnd(content));

/**
 * content가 보존되지 못하는 hardBreak를 가졌는지 모양으로 돌려준다. 없으면 null이다.
 * 한 블록에 모양이 겹치면 블록 끝, mark 런 끝, 제목 안쪽 순으로 하나만 돌려준다.
 * 판정은 `normalizeHardBreakEdges`의 결과 비교다. 제목 3–6은 어느 런에든 `\n`이 있으면 대상이다.
 */
export const hardBreakLossShape = (
  content: InlineContent,
  headingLevel?: number,
): HardBreakLossShape | null => {
  const stripped = stripBlockEnd(content);
  if (stripped !== content) return "BLOCK_END";
  if (moveMarkRunEnds(stripped) !== stripped) return "MARK_RUN_END";
  if (headingLevel === undefined) return null;
  const hasNewline = content.some(
    (item) => isTextRunItem(item) && item.text.includes("\n"),
  );
  if (!hasNewline) return null;
  // 제목 3–6은 어느 런에든 `\n`이 있으면 대상이다.
  if (headingLevel >= 3) return "HEADING_INNER";
  // 제목 1·2는 setext로 개행을 담는다. 글자가 전부 개행뿐이면 mdast 글자가 비어
  // ATX로 나가고 개행이 공백이 된다. 위 두 정리를 거친 content 기준이다.
  const onlyNewlines = content.every(
    (item) => isTextRunItem(item) && item.text.replace(/\n/g, "") === "",
  );
  return onlyNewlines ? "HEADING_INNER" : null;
};
