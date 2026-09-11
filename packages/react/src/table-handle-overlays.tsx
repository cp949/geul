import { IconButton } from "./icon-button.js";
import type { TableGeometry } from "./table-handle-geometry.js";
import {
  addIcon,
  columnHandleBarClassName,
  columnHandleHitClassName,
  columnHandleIcon,
  expandButtonClassName,
  handleButtonClassName,
  indentTableIcon,
  nestingButtonClassName,
  outdentTableIcon,
  rowHandleBarClassName,
  rowHandleHitClassName,
  rowHandleIcon,
  selectTableIcon,
} from "./table-handle-constants.js";
import type { ReorderGuideRect } from "./table-handle-helpers.js";
import type { ReorderKind } from "./table-handle-types.js";
import { useDictionary } from "./use-editor.js";

export type TableHandleOverlaysProps = {
  geometry: TableGeometry;
  reorderGuideRect: ReorderGuideRect | null;
  canIndentTable: boolean;
  canOutdentTable: boolean;
  // "활성 바"(사용자 네이밍) 노출 대상 행/열 id 목록 — 커서가 있는 행/열과
  // 마우스가 지금 hover 중인 행/열이 서로 다를 수 있어 최대 2개다
  // (table-handles.tsx가 selection·hoverRowId/hoverColumnId에서 계산한다,
  // geometry.tableBlockId와 다른 표의 커서는 이미 걸러져 들어온다). hover
  // 없이도(마우스가 표 어디든 그 행/열 위에 있거나 커서가 거기 있으면)
  // 활성 바가 뜬다 — grip 버튼(row/column-handle-bar의 hit box :hover/
  // :focus-within)보다 넓은 트리거다.
  activeRowIds: readonly string[];
  activeColumnIds: readonly string[];
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
  onSelectTable: () => void;
  // Notion 참고(사용자 요청) — 가장 아래 행/가장 오른쪽 열을 가리킬 때만
  // true. table-handles.tsx의 computeExpandButtonVisibility가 계산한다.
  showAddRow: boolean;
  showAddColumn: boolean;
};

/**
 * 표 hover 시 뜨는 프레젠테이셔널 오버레이(행/열 재정렬 핸들, 열 리사이즈
 * 스트립, 행/열 확장 버튼, select/indent/outdent 버튼, 재정렬 가이드). 좌표·
 * 상태 계산은 모두 TableHandles가 하고(geometry, reorderGuideRect, 활성화
 * 플래그, 클릭/포인터 콜백) 이 컴포넌트는 표시와 이벤트 위임만
 * 한다(table-handle-menu.tsx와 같은 경계). select 버튼은
 * editor.commands.selectBlockRange(tableId, tableId)를 커밋해
 * BlockSelectionToolbar(Delete·위/아래 이동)를 여는 진입점이다(Issue #149).
 */
export const TableHandleOverlays = ({
  activeColumnIds,
  activeRowIds,
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
  onSelectTable,
  showAddRow,
  showAddColumn,
}: TableHandleOverlaysProps) => {
  const dictionary = useDictionary();
  return (
    <>
      {/* 행 그립은 3단계다(Notion 참고, 사용자 요청): ① 평소 완전히 숨김,
          ② "활성 바"(커서가 있거나 마우스가 hover 중인 행 — activeRowIds
          포함, data-geul-table-row-handle-active로 표시) — 얇은 line,
          ③ "grip 버튼"(활성 바 위에 마우스가 다시 hover/focus — hit box
          (rowHandleHitClassName, left: geometry.left-18, width:30) 근처
          :hover/:focus-within) — 실제 pill 버튼. 열 그립의 축을 90도 돌린
          거울상(top/height ↔ left/width)이다. 세 단계 전환은 모두
          _table-handles.scss의 .geul-table-row-handle-bar +
          [data-geul-table-row-handle-active]/:hover/:focus-within이
          맡는다. 이 컴포넌트는 hit box·버튼의 page-relative 좌표와 활성
          바 판정만 계산한다. */}
      {geometry.rows.map((row) => (
        <div
          className={rowHandleHitClassName}
          data-geul-table-row-handle-active={
            activeRowIds.includes(row.rowId) ? "" : undefined
          }
          data-geul-table-row-handle-hit=""
          key={`row-${row.rowId}`}
          style={{
            position: "absolute",
            top: row.top + row.height / 2 - 10,
            left: geometry.left - 18,
            width: 30,
            height: 20,
          }}
        >
          <IconButton
            className={`${handleButtonClassName} ${rowHandleBarClassName}`}
            data-geul-table-row-handle=""
            icon={rowHandleIcon}
            label={dictionary.handle.dragRow}
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
            // left는 활성 바(얇은 line)·grip 버튼(pill) 두 값을 오가며
            // transition해야 해서 여기서 inline으로 고정하지 않는다 —
            // inline style은 어떤 CSS 셀렉터보다도 우선순위가 높아
            // :hover/:focus-within/[data-geul-table-row-handle-active]
            // 규칙이 못 이긴다. left·opacity 모두 _table-handles.scss의
            // .geul-table-row-handle-bar가 소유한다.
            style={{ position: "absolute", top: 0 }}
          />
        </div>
      ))}
      {/* 열 그립은 행과 대칭인 3단계다: ① 평소 완전히 숨김, ② "활성
          바"(커서가 있거나 마우스가 hover 중인 열 — activeColumnIds 포함,
          data-geul-table-column-handle-active로 표시) — 얇은 line, ③
          "grip 버튼"(활성 바 위에 마우스가 다시 hover/focus — hit box
          (columnHandleHitClassName, top: geometry.top-18, height:30) 근처
          :hover/:focus-within) — 실제 pill 버튼. 세 단계 전환은 모두
          _table-handles.scss의 .geul-table-column-handle-bar +
          [data-geul-table-column-handle-active]/:hover/:focus-within이
          맡는다. 이 컴포넌트는 hit box·버튼의 page-relative 좌표와 활성
          바 판정만 계산한다(버튼 자신의 top은 SCSS 소유 — 아래 style 주석
          참고). */}
      {geometry.columns.map((column) => (
        <div
          className={columnHandleHitClassName}
          data-geul-table-column-handle-active={
            activeColumnIds.includes(column.columnId) ? "" : undefined
          }
          data-geul-table-column-handle-hit=""
          key={`column-${column.columnId}`}
          style={{
            position: "absolute",
            left: column.left + column.width / 2 - 10,
            top: geometry.top - 18,
            width: 20,
            height: 30,
          }}
        >
          <IconButton
            className={`${handleButtonClassName} ${columnHandleBarClassName}`}
            data-geul-table-column-handle=""
            icon={columnHandleIcon}
            label={dictionary.handle.dragColumn}
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
            // top은(행의 left와 마찬가지로) 활성 바·grip 버튼 두 값을
            // 오가며 transition해야 해서 여기서 inline으로 고정하지
            // 않는다 — inline style은 어떤 CSS 셀렉터보다도 우선순위가
            // 높아 :hover/:focus-within/[data-geul-table-column-handle-active]
            // 규칙이 못 이긴다. top·opacity 모두 _table-handles.scss의
            // .geul-table-column-handle-bar가 소유한다.
            style={{ position: "absolute", left: 0 }}
          />
        </div>
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
      {/* Notion 참고 — 평소엔 opacity:0(_table-handles.scss)이고, 가장
          아래 행/가장 오른쪽 열을 가리킬 때만(showAddRow/showAddColumn)
          보인다. 클릭 가능 여부(pointer-events)는 건드리지 않는다 —
          숨겨진 동안에도 항상 클릭 가능한 지금 동작을 그대로 유지해야
          기존 e2e(빠른 확장 버튼 반복 클릭, Issue #163 스크롤 재검증)가
          깨지지 않는다. 크기도 표 전체 폭/높이를 덮는 rail로 바꿨다 —
          Add row는 표 아래 가로 막대, Add column은 표 오른쪽 세로
          막대(둘 다 :focus로도 보인다, Tab 접근성은 DOM에 항상
          존재한다는 사실만으로 이미 보장되고 opacity와 무관하다).

          Add row는 top:2/height:12로 작게 잡는다 — 표 바로 아래 블록과의
          기본 간격이 16px 정도로 좁아(실측), 이전처럼 top:8/height:24로
          두면 표시된 rail이 그 블록 내용과 겹쳐 보이는 버그가 났다(사용자
          스크린샷). 겹침은 pointer-events를 바꾸지 않는 한(위 이유로
          바꿀 수 없다) hover 판정으로는 못 막는다 — rail 자신이 그 지점의
          pointermove를 항상 가로채 버려 "다른 블록으로 넘어갔다"는 신호
          자체가 안 온다. 그래서 자리 자체를 좁혀 간격 안에 넣는 게 유일한
          방법이다. 아이콘(16px)은 이 작은 박스보다 커서 약간 넘치지만,
          박스 자체(Playwright가 클릭 좌표로 쓰는 중심점의 기준)는 겹치지
          않는다. */}
      <IconButton
        className={expandButtonClassName}
        data-geul-table-expand-row=""
        data-geul-table-expand-visible={showAddRow ? "" : undefined}
        icon={addIcon}
        label={dictionary.handle.addRow}
        onClick={onAddRow}
        style={{
          position: "absolute",
          left: geometry.left,
          top: geometry.bottom + 2,
          width: geometry.right - geometry.left,
          height: 12,
        }}
      />
      <IconButton
        className={expandButtonClassName}
        data-geul-table-expand-column=""
        data-geul-table-expand-visible={showAddColumn ? "" : undefined}
        icon={addIcon}
        label={dictionary.handle.addColumn}
        onClick={onAddColumn}
        style={{
          position: "absolute",
          left: geometry.right + 8,
          top: geometry.top,
          width: 24,
          height: geometry.bottom - geometry.top,
        }}
      />
      {/* 좌상단 여백(geometry.left - 24 부근)은 row handle hit box(y가 첫
          행 중앙이라 더 아래)도 column handle(y는 같지만 x는 첫 열 중앙이라
          더 오른쪽)도 차지하지 않는 빈 자리다(01-계획.md "결정") — 새
          clamp 로직 없이 기존 absolute 좌표 관용구를 그대로 쓴다(PIT-0011,
          G-UI-003). Select table 버튼(Issue #149)은 같은 클러스터를 24px씩
          더 왼쪽으로 확장한다(left - 72) — Indent/ Outdent와 같은
          top(geometry.top - 24)에서 20px 버튼 + 4px 간격을 그대로 반복해
          겹치지 않는다. */}
      <IconButton
        className={nestingButtonClassName}
        data-geul-table-select=""
        icon={selectTableIcon}
        label={dictionary.handle.selectTable}
        onClick={onSelectTable}
        style={{
          position: "absolute",
          left: geometry.left - 72,
          top: geometry.top - 24,
        }}
      />
      <IconButton
        aria-disabled={canIndentTable ? "false" : "true"}
        className={nestingButtonClassName}
        data-geul-table-indent=""
        icon={indentTableIcon}
        label={dictionary.handle.indentTable}
        onClick={onIndentTable}
        style={{
          position: "absolute",
          left: geometry.left - 48,
          top: geometry.top - 24,
        }}
        title={
          canIndentTable ? undefined : dictionary.nesting.indentDisabledReason
        }
      />
      <IconButton
        aria-disabled={canOutdentTable ? "false" : "true"}
        className={nestingButtonClassName}
        data-geul-table-outdent=""
        icon={outdentTableIcon}
        label={dictionary.handle.outdentTable}
        onClick={onOutdentTable}
        style={{
          position: "absolute",
          left: geometry.left - 24,
          top: geometry.top - 24,
        }}
        title={
          canOutdentTable ? undefined : dictionary.nesting.outdentDisabledReason
        }
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
};
