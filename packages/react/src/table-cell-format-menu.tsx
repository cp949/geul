import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

import { iconProps } from "./icon-props.js";
import { MenuItemButton } from "./menu-item-button.js";
import { TableCellColorPalettes } from "./table-cell-color-palettes.js";
import { tableCommandErrorMessage } from "./table-command-error-messages.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDictionary, useEditor } from "./use-editor.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const sectionLabelClassName = "geul-menu-section-label";
const dividerClassName = "geul-menu-divider";
const actionErrorClassName = "geul-menu-error";
const alignButtonClassName = "geul-cell-format-menu__align-button";

export type TableCellFormatMenuProps = {
  tableBlockId: string;
  cellIds: string[];
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * TableSelectionToolbar의 "Cell formatting" 버튼으로 여는 메뉴 — 선택된
 * 셀 목록(cellIds)에 글자색·배경색·정렬을 적용한다. 좌표 클램프는
 * TableHandleMenu와 공용 useClampedMenuPosition 훅을 쓴다(PIT-0011).
 */
export const TableCellFormatMenu = ({
  tableBlockId,
  cellIds,
  left,
  top,
  onClose,
}: TableCellFormatMenuProps) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { menuRef, style } = useClampedMenuPosition(left, top);
  // 완료 조건 1(Issue #66): 실패한 명령의 Result를 버리지 않는다 —
  // table-handle-menu.tsx와 같은 useTableCommandFeedback을 써서 실패하면
  // 메뉴를 닫지 않고 인라인 메시지로 남긴다.
  const { actionError, runCommand } = useTableCommandFeedback();
  const target = { kind: "cells", cellIds } as const;

  const applyAlign = (align: "left" | "center" | "right" | null) =>
    runCommand(
      () => editor.commands.setTableCellAlign(tableBlockId, target, align),
      onClose,
    );

  return (
    <div
      aria-label={dictionary.menu.cellFormattingAriaLabel}
      className="geul-menu-panel geul-menu-panel--with-footer"
      data-geul-cell-format-menu=""
      ref={menuRef}
      role="menu"
      style={style}
    >
      <div className="geul-menu-panel__scroll">
        <TableCellColorPalettes
          onApplied={onClose}
          runCommand={runCommand}
          tableBlockId={tableBlockId}
          target={target}
        />
        <hr className={dividerClassName} />
        <p className={sectionLabelClassName}>{dictionary.menu.align}</p>
        <div className="geul-cell-format-menu__align-row">
          <MenuItemButton
            aria-label={dictionary.menu.alignLeft}
            className={alignButtonClassName}
            onClick={() => applyAlign("left")}
          >
            <AlignLeft {...iconProps} />
          </MenuItemButton>
          <MenuItemButton
            aria-label={dictionary.menu.alignCenter}
            className={alignButtonClassName}
            onClick={() => applyAlign("center")}
          >
            <AlignCenter {...iconProps} />
          </MenuItemButton>
          <MenuItemButton
            aria-label={dictionary.menu.alignRight}
            className={alignButtonClassName}
            onClick={() => applyAlign("right")}
          >
            <AlignRight {...iconProps} />
          </MenuItemButton>
          <MenuItemButton
            aria-label={dictionary.menu.alignNone}
            className={alignButtonClassName}
            onClick={() => applyAlign(null)}
          >
            ×
          </MenuItemButton>
        </div>
      </div>
      {actionError !== null && (
        <p className={actionErrorClassName} role="alert">
          {tableCommandErrorMessage(actionError, dictionary)}
        </p>
      )}
    </div>
  );
};
