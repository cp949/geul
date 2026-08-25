import type { InlineContent } from "@cp949/geul-model";

import type { TabularData } from "./tabular-data.js";

// parseClipboardTable이 반환하는 블록 시퀀스의 원소 하나. 문단/heading은 id
// 없는 인라인 콘텐츠 스냅샷(TabularData와 같은 층위 — model의 안정 id도
// 편집기 타입도 참조하지 않는다), 표는 기존 TabularData 그대로다. id 배정은
// core가 붙여넣기 대상(기존 표 확장 vs 새 표 생성)에 따라 다르게 한다.
//
// heading level은 1~3만 담는다 — model HeadingBlock.level 제약과 같다(DELTA-03,
// Issue #72). h4~h6는 이 variant를 쓰지 않고 paragraph로 다운그레이드된다
// (blockSequenceFromNodes가 만든다).
export type ClipboardContentBlock =
  | { type: "paragraph"; content: InlineContent }
  | { type: "heading"; level: 1 | 2 | 3; content: InlineContent }
  | { type: "table"; data: TabularData };

// 항상 1개 이상의 원소를 담는다 — 표를 하나도 못 찾은 클립보드는 이 타입
// 대신 NOT_TABULAR(HTML)나 TSV 단일 표 시퀀스로 처리된다.
export type ClipboardContent = readonly ClipboardContentBlock[];
