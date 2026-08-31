import type { InlineContent } from "@cp949/geul-model";

import type { TabularData } from "./tabular-data.js";

// parseClipboardTable이 반환하는 블록 시퀀스의 원소 하나. 문단/heading/목록
// 항목은 id 없는 인라인 콘텐츠 스냅샷(TabularData와 같은 층위 — model의
// 안정 id도 편집기 타입도 참조하지 않는다), 표는 기존 TabularData 그대로다.
// id 배정은 core가 붙여넣기 대상(기존 표 확장 vs 새 표 생성)에 따라 다르게
// 한다.
//
// heading level은 1~6 전부 담는다 — model HeadingBlock.level이 1~6으로
// 확장됐다(DELTA-04, Issue #38). h4~h6도 이 variant를 그대로 쓴다 —
// paragraph로 다운그레이드하지 않는다(Issue #38 슬라이스 3).
//
// bulletListItem/numberedListItem은 목록 마커 타입·중첩 계층·명시적
// startNumber를 담는다(DELTA-01, Issue #143 (b)). children은 list-item
// 전용이 아니라 임의 variant(표 포함)를 허용한다 — model의
// BulletListItemBlock.children: BlockNode[]와 동일한 유연성이라 재귀
// 타입 참조가 필요하다. 목록 항목 안에 중첩된 표(li 안 <table>)도
// children에 그대로 담긴다.
export type ClipboardContentBlock =
  | { type: "paragraph"; content: InlineContent }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: InlineContent }
  | { type: "table"; data: TabularData }
  | {
      type: "bulletListItem";
      content: InlineContent;
      children?: readonly ClipboardContentBlock[];
    }
  | {
      type: "numberedListItem";
      content: InlineContent;
      startNumber?: number;
      children?: readonly ClipboardContentBlock[];
    };

// 항상 1개 이상의 원소를 담는다 — 표를 하나도 못 찾은 클립보드는 이 타입
// 대신 NOT_TABULAR(HTML)나 TSV 단일 표 시퀀스로 처리된다.
export type ClipboardContent = readonly ClipboardContentBlock[];
