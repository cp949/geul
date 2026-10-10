import type { Block, TableBlock } from "@cp949/geul-model";

import type { TabularData } from "./tabular-data.js";

// parseClipboardTable이 반환하는 블록 시퀀스의 원소 하나. 표가 아닌 블록은
// model Block에서 table을 뺀 유니온에서 파생한다 — 필드명과 값 형식이 model과
// 같다. 표는 기존 TabularData variant 그대로다(Issue #356 RD-004).
//
// 표 옆 블록은 importHtml 블록 변환기가 읽는다(Issue #356 RD-005). 그래서
// 파서는 model의 모든 비표 블록을 낸다. 최상위 codeBlock·divider, quote,
// callout, checkListItem, toggleListItem, 미디어도 나온다. core가 모두 받는다.
// - id는 파서가 호출마다 1부터 새로 번호를 매긴 임시값이다(`clipboard-1`, ...).
//   html에 data-geul-block-id가 있으면 그 값을 쓴다. 같은 입력은 같은 id를
//   낸다. 호출 안에서 비어 있지 않고 유일하다. 문서 안에서 안정하지 않다 —
//   core가 붙여넣을 때 재발급한다. 표 variant에는 id가 없다.
// - children은 model의 Block[] 대신 ClipboardContentBlock을 재귀로 담는다.
//   표도 children에 들 수 있어서다(li·quote 안 <table>). readonly를 유지한다.
// - 블록 필드는 importHtml과 같다. textColor·backgroundColor·textAlignment,
//   codeBlock의 wrap·caption, 빈 문단(Issue #356 Q8)도 그대로 나온다.
// - codeBlock.content는 마크 없는 평문 런 하나이거나 빈 배열이다. 줄바꿈과
//   Tab을 보존하고 model의 codeBlock 소스 계약이 거부하는 문자만 지운다.
// - codeBlock.language는 importHtml과 같은 규칙으로 고른 뒤 model 정규형으로
//   바꾼 값이다.
// - 비표 블록은 children을 뗀 모양으로 model 검증(parseDocument)을 통과한다.
//   무효 선택 필드(색·정렬·미디어 표시 속성 등)는 빠지고, 미디어 url처럼 뺄 수
//   없는 필드가 무효인 블록은 빠진다(Issue #356 Q1). importHtml은 같은 입력을
//   문서 전체 거절로 막는다. 클립보드는 표와 나머지 블록을 지킨다.
export type ClipboardContentBlock =
  | { type: "table"; data: TabularData }
  | ClipboardNonTableBlock<Exclude<Block, TableBlock>>;

// model 블록 B의 children만 ClipboardContentBlock 재귀로 바꾼다. children
// 필드가 없는 블록(divider, codeBlock, 미디어)은 B를 그대로 쓴다. 유니온에
// 분배되도록 B extends unknown으로 감싼다.
type ClipboardNonTableBlock<B> = B extends unknown
  ? "children" extends keyof B
    ? Omit<B, "children"> & { children?: readonly ClipboardContentBlock[] }
    : B
  : never;

// 항상 1개 이상의 원소를 담는다 — 표를 하나도 못 찾은 클립보드는 이 타입
// 대신 NOT_TABULAR(HTML)나 TSV 단일 표 시퀀스로 처리된다.
export type ClipboardContent = readonly ClipboardContentBlock[];
