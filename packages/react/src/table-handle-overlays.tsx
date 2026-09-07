import { IconButton } from "./icon-button.js";
import type { TableGeometry } from "./table-handle-geometry.js";
import {
  addColumnLabel,
  addIcon,
  addRowLabel,
  columnHandleIcon,
  columnHandleLabel,
  expandButtonClassName,
  handleButtonClassName,
  indentTableIcon,
  indentTableLabel,
  nestingButtonClassName,
  outdentTableIcon,
  outdentTableLabel,
  rowHandleIcon,
  rowHandleLabel,
} from "./table-handle-constants.js";
import type { ReorderGuideRect } from "./table-handle-helpers.js";
import type { ReorderKind } from "./table-handle-types.js";

export type TableHandleOverlaysProps = {
  geometry: TableGeometry;
  reorderGuideRect: ReorderGuideRect | null;
  canIndentTable: boolean;
  canOutdentTable: boolean;
  onReorderHandleClick: (
    event: React.MouseEvent<HTMLButtonElement>,
    kind: ReorderKind,
    tableBlockId: string,
    id: string,
    index: number,
  ) => void;
  onReorderHandlePointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: ReorderKind,
    tableBlockId: string,
    sourceId: string,
    sourceIndex: number,
  ) => void;
  onResizeHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    tableBlockId: string,
    columnIndex: number,
    fallbackWidth: number,
  ) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onIndentTable: () => void;
  onOutdentTable: () => void;
};

/**
 * 표 hover 시 뜨는 프레젠테이셔널 오버레이(행/열 재정렬 핸들, 열 리사이즈
 * 스트립, 행/열 확장 버튼, indent/outdent 버튼, 재정렬 가이드). 좌표·상태
 * 계산은 모두 TableHandles가 하고(geometry, reorderGuideRect, 활성화 플래그,
 * 클릭/포인터 콜백) 이 컴포넌트는 표시와 이벤트 위임만
 * 한다(table-handle-menu.tsx와 같은 경계).
 */
export const TableHandleOverlays = ({
  geometry,
  reorderGuideRect,
  canIndentTable,
  canOutdentTable,
  onReorderHandleClick,
  onReorderHandlePointerDown,
  onResizeHandlePointerDown,
  onAddRow,
  onAddColumn,
  onIndentTable,
  onOutdentTable,
}: TableHandleOverlaysProps) => (
  <>
    {geometry.rows.map((row) => (
      <IconButton
        className={handleButtonClassName}
        data-geul-table-row-handle=""
        icon={rowHandleIcon}
        key={`row-${row.rowId}`}
        label={rowHandleLabel}
        onClick={(event) =>
          onReorderHandleClick(
            event,
            "row",
            geometry.tableBlockId,
            row.rowId,
            row.index,
          )
        }
        onPointerDown={(event) =>
          onReorderHandlePointerDown(
            event,
            "row",
            geometry.tableBlockId,
            row.rowId,
            row.index,
          )
        }
        style={{
          position: "fixed",
          left: geometry.left - 24,
          top: row.top + row.height / 2 - 10,
        }}
      />
    ))}
    {geometry.columns.map((column) => (
      <IconButton
        className={handleButtonClassName}
        data-geul-table-column-handle=""
        icon={columnHandleIcon}
        key={`column-${column.columnId}`}
        label={columnHandleLabel}
        onClick={(event) =>
          onReorderHandleClick(
            event,
            "column",
            geometry.tableBlockId,
            column.columnId,
            column.index,
          )
        }
        onPointerDown={(event) =>
          onReorderHandlePointerDown(
            event,
            "column",
            geometry.tableBlockId,
            column.columnId,
            column.index,
          )
        }
        style={{
          position: "fixed",
          left: column.left + column.width / 2 - 10,
          top: geometry.top - 24,
        }}
      />
    ))}
    {geometry.columns.flatMap((column) =>
      column.resizeSegments.map((segment) => (
        <div
          className="geul-table-resize-handle"
          data-geul-table-resize-handle=""
          key={`resize-${column.columnId}-${segment.rowId}`}
          onPointerDown={(event) =>
            onResizeHandlePointerDown(
              event,
              geometry.tableBlockId,
              column.index,
              column.width,
            )
          }
          style={{
            left: column.left + column.width - 2,
            top: segment.top,
            height: segment.height,
          }}
        />
      )),
    )}
    <IconButton
      className={expandButtonClassName}
      data-geul-table-expand-row=""
      icon={addIcon}
      label={addRowLabel}
      onClick={onAddRow}
      style={{
        position: "fixed",
        left: geometry.left + (geometry.right - geometry.left) / 2 - 10,
        top: geometry.bottom + 4,
      }}
    />
    <IconButton
      className={expandButtonClassName}
      data-geul-table-expand-column=""
      icon={addIcon}
      label={addColumnLabel}
      onClick={onAddColumn}
      style={{
        position: "fixed",
        left: geometry.right + 4,
        top: geometry.top + (geometry.bottom - geometry.top) / 2 - 10,
      }}
    />
    {/* 좌상단 여백(geometry.left - 24 부근)은 row handle(x는 같지만 y는
        row 중앙이라 더 아래)도 column handle(y는 같지만 x는 첫 열
        중앙이라 더 오른쪽)도 차지하지 않는 빈 자리다(01-계획.md
        "결정") — 새 clamp 로직 없이 기존 fixed 좌표 관용구를 그대로
        쓴다(PIT-0011). */}
    <IconButton
      aria-disabled={canIndentTable ? "false" : "true"}
      className={nestingButtonClassName}
      data-geul-table-indent=""
      disabled={!canIndentTable}
      icon={indentTableIcon}
      label={indentTableLabel}
      onClick={onIndentTable}
      style={{
        position: "fixed",
        left: geometry.left - 48,
        top: geometry.top - 24,
      }}
    />
    <IconButton
      aria-disabled={canOutdentTable ? "false" : "true"}
      className={nestingButtonClassName}
      data-geul-table-outdent=""
      disabled={!canOutdentTable}
      icon={outdentTableIcon}
      label={outdentTableLabel}
      onClick={onOutdentTable}
      style={{
        position: "fixed",
        left: geometry.left - 24,
        top: geometry.top - 24,
      }}
    />
    {reorderGuideRect !== null && (
      <div
        className="geul-table-reorder-guide"
        data-geul-table-reorder-guide=""
        style={reorderGuideRect}
      />
    )}
  </>
);
