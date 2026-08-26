import { parseTableColumns } from "@cp949/geul-core";

// table-handles.tsx의 hover·드래그·리사이즈 오케스트레이션에서 표 DOM을
// 읽어 좌표로 바꾸는 순수 판독 계층만 모은다. HTMLElement만 받고 React·
// 에디터 마운트에는 의존하지 않는다 — table-handles.test.tsx처럼
// mountTableEditor로 실 편집기를 띄우지 않아도 이 파일만으로 테스트할 수
// 있다(readColumnBounds는 DOM조차 필요 없는 순수 함수다).

type RowGeometry = {
  rowId: string;
  index: number;
  top: number;
  height: number;
};
type ResizeSegment = { rowId: string; top: number; height: number };

// 한 행과 그 행 셀들의 화면 좌표. geometry를 읽을 때마다 행/셀마다
// getBoundingClientRect를 정확히 한 번만 호출하려고 먼저 모아둔다.
type CellBox = {
  columnId: string;
  spansColumns: boolean;
  left: number;
  right: number;
  width: number;
};
export type RowBox = {
  rowId: string;
  top: number;
  height: number;
  cells: CellBox[];
};

type ColumnGeometry = {
  columnId: string;
  index: number;
  left: number;
  width: number;
  // 열 오른쪽 경계의 리사이즈 strip을 그릴 세로 구간들. 병합 셀이 경계를
  // 가로지르는 행은 제외한다(아래 readResizeSegments 참고) — 병합 셀
  // 내부를 strip이 덮으면 셀 클릭이 리사이즈 드래그로 가로채인다.
  resizeSegments: ResizeSegment[];
};

export type TableGeometry = {
  tableBlockId: string;
  // 헤더는 표 단위 플래그다(모델 headerRows/headerColumns: 0|1) — 메뉴의
  // 체크 상태를 렌더 DOM에서 그대로 읽는다.
  headerRows: number;
  headerColumns: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  rows: RowGeometry[];
  columns: ColumnGeometry[];
};

// G-TBL-001: 열 순서·개수의 권위는 표에 렌더된 data-be-columns(모델
// table.columns와 같은 순서)다. columnId 문자열만 뽑아 쓴다.
// 속성 문자열의 해석은 model이 소유하고(Issue #75) DOM 접근만 여기 남는다.
// 해석 불가는 열 없음으로 접는다 — 핸들을 그리지 않으면 그만이고, 이
// 오버레이가 사용자에게 보고할 표면을 갖고 있지 않다.
export const readTableColumnIds = (table: HTMLElement): string[] => {
  const parsed = parseTableColumns(table.getAttribute("data-be-columns"));
  return parsed.ok ? parsed.value.map((column) => column.id) : [];
};

export type ColumnBound = { left: number; width: number };

// 첫 행만 보고 열 경계를 읽으면, 첫 행에 colspan>1 병합 셀이 있을 때
// 그 셀이 가리는 논리 열들의 경계를 아예 못 찾는다(핸들 개수가 실제
// 열 개수보다 적어짐). 모든 행을 훑어 각 열에서 처음 만나는 비병합
// (colspan 속성 없음) 셀의 rect를 그 열의 경계로 쓰고, 어느 행에서도
// 비병합 셀을 못 찾은 열(모든 행에서 병합된 열)은 이웃 열 경계 사이로
// 보간한다.
export const readColumnBounds = (
  columnIds: string[],
  rowBoxes: RowBox[],
  tableRect: DOMRect,
): ColumnBound[] => {
  const boundById = new Map<string, ColumnBound>();
  for (const rowBox of rowBoxes) {
    for (const cellBox of rowBox.cells) {
      if (cellBox.spansColumns) continue;
      if (cellBox.columnId === "" || boundById.has(cellBox.columnId)) continue;
      boundById.set(cellBox.columnId, {
        left: cellBox.left,
        width: cellBox.width,
      });
    }
  }

  const known = columnIds.map((id) => boundById.get(id) ?? null);
  for (let index = 0; index < known.length; index += 1) {
    if (known[index] !== null) continue;
    let before = index - 1;
    while (before >= 0 && known[before] === null) before -= 1;
    let after = index + 1;
    while (after < known.length && known[after] === null) after += 1;
    const beforeBound = before >= 0 ? (known[before] ?? null) : null;
    const afterBound = after < known.length ? (known[after] ?? null) : null;
    const left =
      beforeBound !== null
        ? beforeBound.left + beforeBound.width
        : (afterBound?.left ?? tableRect.left);
    const right = afterBound !== null ? afterBound.left : tableRect.right;
    known[index] = { left, width: Math.max(0, right - left) };
  }

  return known.map((bound) => bound ?? { left: tableRect.left, width: 0 });
};

const RESIZE_BOUNDARY_EPSILON = 1;

// 열 경계 x좌표(boundaryX)가 각 행에서 실제 셀 경계인지 확인해, 병합 셀이
// 그 경계를 가로지르는 행은 strip 구간에서 뺀다. 병합 셀 위에 리사이즈
// strip을 그대로 덮으면(구 열 경계가 병합 셀 한가운데로 옮겨가) 셀
// 클릭이 리사이즈 드래그로 가로채여 캐럿을 놓을 수 없다(elementFromPoint
// 실측으로 확인) — 이 문제를 막기 위해 세로 구간을 행 단위로 쪼갠다.
const readResizeSegments = (
  rowBoxes: RowBox[],
  boundaryX: number,
): ResizeSegment[] =>
  rowBoxes
    .filter((rowBox) =>
      rowBox.cells.some(
        (cellBox) =>
          Math.abs(cellBox.right - boundaryX) <= RESIZE_BOUNDARY_EPSILON,
      ),
    )
    .map((rowBox) => ({
      rowId: rowBox.rowId,
      top: rowBox.top,
      height: rowBox.height,
    }));

// 행과 셀의 rect를 geometry 한 번당 한 번씩만 읽는다. 열 경계와 리사이즈
// 세그먼트가 각자 DOM을 다시 훑으면 getBoundingClientRect 호출이 열 수 x
// 셀 수로 늘어나 10,000셀 표(spec 13)의 드래그 프레임을 잡아먹는다.
const readRowBoxes = (rowElements: HTMLElement[]): RowBox[] =>
  rowElements.map((rowElement) => {
    const rowRect = rowElement.getBoundingClientRect();
    const cells = Array.from(
      rowElement.querySelectorAll<HTMLElement>("[data-be-column-id]"),
    ).map((cellElement) => {
      const rect = cellElement.getBoundingClientRect();
      return {
        columnId: cellElement.getAttribute("data-be-column-id") ?? "",
        spansColumns: cellElement.hasAttribute("colspan"),
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });
    return {
      rowId: rowElement.getAttribute("data-be-row-id") ?? "",
      top: rowRect.top,
      height: rowRect.height,
      cells,
    };
  });

export const readTableGeometry = (table: HTMLElement): TableGeometry | null => {
  const tableBlockId = table.getAttribute("data-be-block-id");
  if (tableBlockId === null) return null;

  const tableRect = table.getBoundingClientRect();
  const rowBoxes = readRowBoxes(
    Array.from(table.querySelectorAll<HTMLElement>("[data-be-row-id]")),
  );
  const rows: RowGeometry[] = rowBoxes.map((rowBox, index) => ({
    rowId: rowBox.rowId,
    index,
    top: rowBox.top,
    height: rowBox.height,
  }));

  const columnIds = readTableColumnIds(table);
  const bounds = readColumnBounds(columnIds, rowBoxes, tableRect);
  const columns: ColumnGeometry[] = columnIds.map((columnId, index) => {
    const bound = bounds[index] ?? { left: tableRect.left, width: 0 };
    return {
      columnId,
      index,
      left: bound.left,
      width: bound.width,
      resizeSegments: readResizeSegments(rowBoxes, bound.left + bound.width),
    };
  });

  return {
    tableBlockId,
    headerRows: Number(table.getAttribute("data-be-header-rows") ?? "0"),
    headerColumns: Number(table.getAttribute("data-be-header-columns") ?? "0"),
    left: tableRect.left,
    top: tableRect.top,
    right: tableRect.right,
    bottom: tableRect.bottom,
    rows,
    columns,
  };
};
