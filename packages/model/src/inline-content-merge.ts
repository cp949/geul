import { isTextRunItem } from "./inline-content-kind.js";
import { canonicalizeTextMarks, sameMarks } from "./mark-canonicalization.js";
import type { InlineContent, TextMark } from "./types.js";

// 인라인 조각을 뒤에 이어 붙이되, 직전 조각과 mark 조합이 같으면 텍스트만
// 합치고 다르면 새 조각을 추가한다("인접 동일 mark는 항상 병합" 불변식).
// io(inline-content.ts, cell-text.ts, import-html.ts, import-markdown.ts)와
// core(table-commands.ts) 다섯 곳이 각자 이 제어 흐름을 재구현하고
// 있었다 — 그중 import-markdown.ts의 사본은 inline-content.ts와 바이트
// 단위로 동일했다. push할 때는 항상 새 조각 객체를 만들어 target에
// 넣는다(호출자가 넘긴 marks 배열이나 앞선 조각 객체를 그대로 재사용하지
// 않는다) — 그래야 호출자가 소유한 원본 데이터를 훼손하지 않고, 이후
// 병합에서는 target 소유 조각만 안전하게 제자리 변경할 수 있다(core의
// appendInlineRuns가 겪던 "원본 참조 오염 방지용 교체" 우회가 이 계약
// 덕에 필요 없어진다). marks는 호출 전에 정규 순서일 필요가 없다 —
// sameMarks·canonicalizeTextMarks가 내부에서 정규화하므로 이미 정규
// 상태를 다시 넣어도 안전하다(idempotent).
export const appendOrMergeInlineItem = (
  target: InlineContent,
  text: string,
  marks: readonly TextMark[] | undefined,
): void => {
  if (text.length === 0) return;

  // 이 함수는 텍스트 런만 push하고(아래 push 지점 참고) 그 marks는 항상
  // 이 함수의 `marks` 매개변수(readonly TextMark[])에서 canonicalizeTextMarks로
  // 만든 TextMark[]뿐이다 — 실제로는 항상 텍스트 런·TextMark[]이지만,
  // InlineContent 위젠(RD-002-DELTA-13)으로 넓어진 타입을 컴파일러에
  // 알리려면 명시적으로 좁혀야 한다(DELTA-01의 `known`/`as Block` 캐스트와
  // 동일 성격). CustomTextMark를 담은 marks를 병합할 가능성은 이 함수의
  // 계약 밖이다(io 소비처가 CustomTextMark를 만들지 않는다, DELTA-14+
  // 대상).
  const previous = target[target.length - 1];
  if (
    previous !== undefined &&
    isTextRunItem(previous) &&
    sameMarks(previous.marks as readonly TextMark[] | undefined, marks)
  ) {
    previous.text += text;
    return;
  }

  const canonicalMarks = canonicalizeTextMarks(marks ?? []);
  target.push(
    canonicalMarks.length === 0 ? { text } : { text, marks: canonicalMarks },
  );
};
