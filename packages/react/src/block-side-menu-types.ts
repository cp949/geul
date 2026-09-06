import type { EditorController } from "@cp949/geul-core";

// block-side-menu.tsx(진입점)와 그 형제 파일(block-side-menu-geometry.ts,
// block-side-menu-block-type.ts)이 공유하는 module-private 타입 모음이다.
// 919줄이던 단일 파일을 책임별로 나누며(01-계획.md) 옮겨졌을 뿐 정의는
// 그대로다 — 동작 변경 없음.

export type InsertionGuide = {
  beforeBlockId: string | null;
  left: number;
  top: number;
  width: number;
};

// 핸들 드래그의 세 가지 해석이다(Issue #38 슬라이스7 DELTA-03).
// - "reorder": 기존 단일 블록 재정렬(인접 형제 hover 또는 폴백).
// - "range-select": 인접하지 않은 같은 부모 형제 own rect 위로 들어가
//   pointerup 시 selectBlockRange를 커밋할 후보 상태.
// - "range-move": 이미 있는 blockSelection 범위 안 blockId의 handle을
//   다시 pointerdown해 그 범위 전체를 이동하는 모드(pointerdown 시점에만 결정).
export type DragMode = "reorder" | "range-select" | "range-move";

export type DragState = {
  pointerId: number;
  sourceBlockId: string;
  startX: number;
  startY: number;
  hasDragged: boolean;
  cancelled: boolean;
  guide: InsertionGuide | null;
  mode: DragMode;
  // range-select 후보 blockId. mode가 "range-select"일 때만 의미가 있고
  // pointerup에서 selectBlockRange(sourceBlockId, 이 값)로 커밋한다.
  rangeSelectCandidateBlockId: string | null;
  // range-move 모드가 이동할 범위. pointerdown 시점의 getBlockSelection()을
  // 그대로 캡처한다 — 드래그 도중 다른 명령이 선택을 바꾸지 않는다는 전제다.
  rangeSelection: { fromBlockId: string; toBlockId: string } | null;
};

export type BlockMenuState = {
  blockId: string;
  left: number;
  top: number;
};

export type BlockSideMenuProps = {
  onBlockAdded: (blockId: string) => void;
};

export type StoredBlock = ReturnType<
  EditorController["getDocument"]
>["blocks"][number];
