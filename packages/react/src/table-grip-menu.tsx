import { MenuItemButton } from "./menu-item-button.js";
import { tableCommandErrorMessage } from "./table-command-error-messages.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDictionary, useEditor } from "./use-editor.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

const menuItemClassName = "geul-table-menu__item";
const dividerClassName = "geul-menu-divider";
const actionErrorClassName = "geul-menu-error";

export type TableGripMenuProps = {
  tableBlockId: string;
  headerRowEnabled: boolean;
  headerColumnEnabled: boolean;
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * 표 그립 버튼(CONTEXT.md, Issue #174 RD-003) 클릭 시 여는 표 전체 단위
 * 메뉴 — 제목 행/열 토글, 표 복제, 너비에 맞추기(placeholder). 행/열 grip
 * 메뉴(table-handle-menu.tsx)와 같은 geul-menu-panel + MenuItemButton
 * 관용구를 그대로 따른다. 좌표 계산은 TableHandles가 한다.
 *
 * 헤더 토글은 row/col grip 메뉴가 이미 갖고 있는 진입점(첫 행/첫 열에서만
 * 노출)과 같은 커맨드를 호출하는 두 번째 진입점이다(Q6 결정 — 중복
 * 허용, 진입점 제거 없음). 표 복제는 block-side-menu-menu.tsx의
 * handleDuplicate와 같은 방식(Result를 runCommand로 감싸지 않고 호출 후
 * 바로 닫는다)을 따른다 — 같은 커맨드(duplicateBlock)의 기존 처리
 * 관용구를 그대로 재사용한다.
 */
export const TableGripMenu = ({
  tableBlockId,
  headerRowEnabled,
  headerColumnEnabled,
  left,
  top,
  onClose,
}: TableGripMenuProps) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { menuRef, style } = useClampedMenuPosition(left, top);
  const { actionError, runCommand } = useTableCommandFeedback();

  const toggleHeaderRow = () =>
    runCommand(
      () => editor.commands.toggleTableHeaderRow(tableBlockId),
      onClose,
    );

  const toggleHeaderColumn = () =>
    runCommand(
      () => editor.commands.toggleTableHeaderColumn(tableBlockId),
      onClose,
    );

  const duplicateTable = () => {
    editor.commands.duplicateBlock(tableBlockId);
    onClose();
  };

  // Issue #174 RD-003(Q8) — 실제 구현은 Issue #176. 클릭해도 문서를
  // 바꾸지 않는다 — console.log만 남겨 후속 구현 시 이 진입점을 바로
  // 찾을 수 있게 한다.
  const fitTableWidthPlaceholder = () => {
    console.log("[TODO][너비에 맞추기] 미구현 — Issue #176");
    onClose();
  };

  return (
    <div
      aria-label={dictionary.menu.tableGripMenuAriaLabel}
      className="geul-menu-panel geul-menu-panel--with-footer"
      data-geul-table-grip-menu=""
      ref={menuRef}
      role="menu"
      style={style}
    >
      <div className="geul-menu-panel__scroll">
        <MenuItemButton
          aria-checked={headerRowEnabled}
          className={menuItemClassName}
          onClick={toggleHeaderRow}
          role="menuitemcheckbox"
        >
          {dictionary.menu.headerRow}
        </MenuItemButton>
        <MenuItemButton
          aria-checked={headerColumnEnabled}
          className={menuItemClassName}
          onClick={toggleHeaderColumn}
          role="menuitemcheckbox"
        >
          {dictionary.menu.headerColumn}
        </MenuItemButton>
        <hr className={dividerClassName} />
        <MenuItemButton className={menuItemClassName} onClick={duplicateTable}>
          {dictionary.menu.duplicate}
        </MenuItemButton>
        <hr className={dividerClassName} />
        <MenuItemButton
          className={menuItemClassName}
          onClick={fitTableWidthPlaceholder}
        >
          {dictionary.menu.fitTableWidth}
        </MenuItemButton>
      </div>
      {actionError !== null && (
        <p className={actionErrorClassName} role="alert">
          {tableCommandErrorMessage(actionError, dictionary)}
        </p>
      )}
    </div>
  );
};
