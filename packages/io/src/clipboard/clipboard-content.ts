import type { Block, TableBlock } from "@cp949/geul-model";

import type { TabularData } from "./tabular-data.js";

// parseClipboardTable이 반환하는 블록 시퀀스의 원소 하나. 표가 아닌 블록은
// model Block에서 table을 뺀 유니온에서 파생한다 — 필드명과 값 형식이 model과
// 같다(id, content, level, textColor/backgroundColor, startNumber, codeBlock의
// content/language 등). 표는 기존 TabularData variant 그대로다
// (Issue #356 RD-004).
//
// - id는 파서가 호출마다 1부터 새로 번호를 매긴 임시값이다(`clipboard-1`, ...).
//   같은 입력은 같은 id를 낸다. 문서 안에서 안정하지 않다 — core가 붙여넣을 때
//   재발급한다. 표 variant에는 id가 없다.
// - children은 model의 Block[] 대신 ClipboardContentBlock을 재귀로 담는다.
//   표도 children에 들 수 있어서다(li 안 <table>). readonly를 유지한다.
// - heading level은 1~6 전부, textColor/backgroundColor는 블록 요소 자신의
//   style 색이다(대문자 #RRGGBB만, Issue #343).
// - 타입은 model의 모든 비표 블록을 허용하지만 현재 파서는 paragraph, heading,
//   bulletListItem, numberedListItem, codeBlock, divider만 낸다. 나머지는
//   다음 RD가 표 옆 블록을 importHtml 변환기에 위임하면 나온다.
//
// codeBlock/divider는 목록 항목의 children에서만 나온다(Issue #351). li 안
// pre·hr다. 최상위 pre·hr는 이 variant가 되지 않고, core는 최상위의 두 타입을
// CLIPBOARD_CONTENT_INVALID로 거절한다.
// - codeBlock.content는 마크 없는 평문 런 하나다. 줄바꿈과 Tab을 보존하고
//   model의 codeBlock 소스 계약이 거부하는 문자만 파서가 지운다. 내용 없는
//   pre는 만들지 않아 런의 text는 비어 있지 않다.
// - codeBlock.language는 importHtml과 같은 규칙으로 고른 뒤 model 정규형으로
//   바꾼 값이다. wrap·caption은 담지 않는다.
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
