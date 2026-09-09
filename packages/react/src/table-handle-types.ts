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
  // G-UI-002: index만으로는 대상보다 앞선 행/열이 사라져 index가 밀리는
  // 경우를 대상 자신이 사라진 경우와 구분할 수 없다(Issue #65) —
  // ReorderState.sourceId와 같은 결로 안정 id를 저장해 무효화 감시
  // effect가 재해석한다. 빈 문자열은 G-UI-002 fail-open(서로 다른 행/열이
  // 같은 빈 id로 충돌할 수 있어 재조준을 시도하지 않는다).
  targetId: string;
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
