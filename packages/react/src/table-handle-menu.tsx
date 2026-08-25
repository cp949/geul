import type { TableCellTarget } from "@cp949/geul-core";

import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { tableCommandErrorMessage } from "./table-command-error-messages.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useEditor } from "./use-editor.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const menuItemClassName = "geul-table-menu__item";
const swatchClassName = "geul-menu-swatch";
const sectionLabelClassName = "geul-menu-section-label";
const dividerClassName = "geul-menu-divider";
const actionErrorClassName = "geul-menu-error";

export type TableHandleMenuProps = {
  kind: "row" | "column";
  tableBlockId: string;
  index: number;
  /** 마지막 남은 행/열이면 삭제를 막는다(완료 조건 2, Issue #18). */
  canDelete: boolean;
  /** 헤더는 첫 행/첫 열에만 있을 수 있다(모델 headerRows/headerColumns: 0|1). */
  headerToggleAvailable: boolean;
  headerEnabled: boolean;
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * 행/열 핸들 클릭 시 열리는 메뉴(spec 7.2 — 추가, 삭제, 헤더와 색상).
 * 좌표 계산은 TableHandles가 하고 이 컴포넌트는 표시와 명령 호출만 한다.
 */
export const TableHandleMenu = ({
  kind,
  tableBlockId,
  index,
  canDelete,
  headerToggleAvailable,
  headerEnabled,
  left,
  top,
  onClose,
}: TableHandleMenuProps) => {
  const editor = useEditor();
  const { menuRef, style } = useClampedMenuPosition(left, top);
  // 완료 조건 1(Issue #18): 실패한 명령의 Result를 버리지 않는다 — 실패하면
  // 메뉴를 닫지 않고 사용자가 이유를 볼 수 있게 인라인 메시지로 남긴다.
  // Result 확인과 에러 보관은 세 메뉴가 공유하는 useTableCommandFeedback이
  // 맡는다(Issue #66) — 성공 시에만 onClose를 호출한다.
  const { actionError, runCommand } = useTableCommandFeedback();
  const isRow = kind === "row";
  const target: TableCellTarget = isRow
    ? { kind: "row", index }
    : { kind: "column", index };

  const insertBefore = () =>
    runCommand(
      () =>
        isRow
          ? editor.commands.insertTableRow(tableBlockId, index)
          : editor.commands.insertTableColumn(tableBlockId, index),
      onClose,
    );

  const insertAfter = () =>
    runCommand(
      () =>
        isRow
          ? editor.commands.insertTableRow(tableBlockId, index + 1)
          : editor.commands.insertTableColumn(tableBlockId, index + 1),
      onClose,
    );

  const remove = () =>
    runCommand(
      () =>
        isRow
          ? editor.commands.deleteTableRow(tableBlockId, index)
          : editor.commands.deleteTableColumn(tableBlockId, index),
      onClose,
    );

  const toggleHeader = () =>
    runCommand(
      () =>
        isRow
          ? editor.commands.toggleTableHeaderRow(tableBlockId)
          : editor.commands.toggleTableHeaderColumn(tableBlockId),
      onClose,
    );

  const applyColor = (property: "text" | "background", color: string | null) =>
    runCommand(
      () =>
        property === "text"
          ? editor.commands.setTableCellTextColor(tableBlockId, target, color)
          : editor.commands.setTableCellBackgroundColor(
              tableBlockId,
              target,
              color,
            ),
      onClose,
    );

  const renderPalette = (
    property: "text" | "background",
    label: string,
    colors: TableCellColor[],
  ) => (
    <>
      <p className={sectionLabelClassName}>{label}</p>
      <div className="geul-menu-palette">
        {colors.map((color) => (
          <button
            aria-label={`${label} ${color.name}`}
            className={swatchClassName}
            key={color.value}
            onClick={() => applyColor(property, color.value)}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            style={
              property === "background"
                ? { backgroundColor: color.value }
                : { backgroundColor: "transparent", color: color.value }
            }
            type="button"
          >
            {property === "text" ? "A" : ""}
          </button>
        ))}
        <button
          aria-label={`${label} None`}
          className={swatchClassName}
          onClick={() => applyColor(property, null)}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          ×
        </button>
      </div>
    </>
  );

  return (
    <div
      aria-label={isRow ? "Table row menu" : "Table column menu"}
      className="geul-menu-panel"
      data-be-table-menu=""
      ref={menuRef}
      role="menu"
      style={style}
    >
      {actionError !== null && (
        <p className={actionErrorClassName} role="alert">
          {tableCommandErrorMessage(actionError)}
        </p>
      )}
      <button
        className={menuItemClassName}
        onClick={insertBefore}
        onMouseDown={(event) => event.preventDefault()}
        role="menuitem"
        type="button"
      >
        {isRow ? "Insert row above" : "Insert column left"}
      </button>
      <button
        className={menuItemClassName}
        onClick={insertAfter}
        onMouseDown={(event) => event.preventDefault()}
        role="menuitem"
        type="button"
      >
        {isRow ? "Insert row below" : "Insert column right"}
      </button>
      <button
        className={`${menuItemClassName} geul-table-menu__item--danger`}
        disabled={!canDelete}
        onClick={remove}
        onMouseDown={(event) => event.preventDefault()}
        role="menuitem"
        type="button"
      >
        {isRow ? "Delete row" : "Delete column"}
      </button>
      {headerToggleAvailable && (
        <>
          <hr className={dividerClassName} />
          <button
            aria-checked={headerEnabled}
            className={menuItemClassName}
            onClick={toggleHeader}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitemcheckbox"
            type="button"
          >
            {isRow ? "Header row" : "Header column"}
          </button>
        </>
      )}
      <hr className={dividerClassName} />
      {renderPalette("text", "Text color", TABLE_TEXT_COLORS)}
      {renderPalette("background", "Background color", TABLE_BACKGROUND_COLORS)}
    </div>
  );
};
