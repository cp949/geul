// 기본·표 셀 붙여넣기와 drop이 공유하는 core 내부 계획 결과 계약이다.
// 각 계획 module은 이 타입을 참조하고 서로의 구현에는 의존하지 않는다.
import type { Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import type { TiptapJsonNode } from "./model-to-tiptap.js";
import type { PasteBlockPlacement } from "./paste-block-placement.js";

// 클립보드에서 읽은 값이다. plain은 PM이 이번 붙여넣기를 평문 경로로
// 만들었다는 신호다(Issue #303, transformPasted의 3번째 인자).
export type PasteClipboard = {
  html: string;
  text: string;
  plain: boolean;
};

// 블록 삽입 위치다.
// - blockBoundary: 자식 있는 블록의 끝. 블록 경계에 바로 넣는다(Issue #290).
// - afterRangeDelete: 다른 블록에서 시작해 자식 있는 블록의 끝에서 끝나는
//   범위. 먼저 지운 뒤 지운 자리의 캐럿으로 다시 판정한다(Issue #294).
// - caret: 현재 selection 자리에 넣는다. depth는 clampDepth의 시작 깊이다.
export type BlockInsertPlacement =
  | { kind: "blockBoundary"; placement: PasteBlockPlacement }
  | { kind: "afterRangeDelete" }
  | { kind: "caret"; depth: number };

// 계획 결과다. 실행기가 handlePaste·handleDrop 반환값을 정한다.
// - pass: 다른 plugin 소관이다. false. prosemirror-tables가 처리하는
//   셀 조각 slice다. CellSelection은 셋일 때만 여기 온다(Issue #308).
//   클립보드 데이터가 없다. 셀 조각 slice에 html이 없거나 서식 없이
//   붙여넣기다. 평문이 비고 html이 없거나 정리 뒤 빈 slice다.
// - delegate: PM 기본 drop에 맡긴다. false. drop 계획만 쓴다.
// - insertSlice: PM이 파싱한 slice를 PM 기본 붙여넣기와 같은 방식으로
//   넣는다. true. 파싱 결과가 없는 정적 Slice.empty면 false다(PM 기본과 같다).
// - consume: 문서를 바꾸지 않고 이벤트만 소비한다. true.
// - pasteText: 정리한 평문을 PM 평문 경로로 넣는다. true.
// - dispatch: 이미 만든 transaction을 보낸다. true.
// - insertBlocks: 블록 JSON을 넣는다. true.
export type PastePlan =
  | { kind: "pass" }
  | { kind: "delegate" }
  | { kind: "insertSlice"; slice: Slice }
  | { kind: "consume" }
  | { kind: "pasteText"; text: string }
  | { kind: "dispatch"; transaction: Transaction }
  | {
      kind: "insertBlocks";
      nodes: TiptapJsonNode[];
      placement: BlockInsertPlacement;
    };
