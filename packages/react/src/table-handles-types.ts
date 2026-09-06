type ReorderKind = "row" | "column";

type ReorderState = {
  kind: ReorderKind;
  pointerId: number;
  tableBlockId: string;
  // 억제 키의 기준(Option A, Issue #63). sourceIndex는 moveTableRow/
  // moveTableColumn 커맨드가 index를 받으므로 이동 계산에만 쓴다.
  sourceId: string;
  sourceIndex: number;
  hasDragged: boolean;
  cancelled: boolean;
  targetIndex: number | null;
};

type HandleMenuState = {
  kind: ReorderKind;
  tableBlockId: string;
  index: number;
};

type ResizeState = {
  pointerId: number;
  tableBlockId: string;
  columnIndex: number;
  startX: number;
  startWidth: number;
  currentWidth: number;
};

export type { HandleMenuState, ReorderKind, ReorderState, ResizeState };
