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
  // "너비에 맞추기" 클릭 시점에 편집 영역 px 폭을 실측해 돌려준다(TableHandles
  // 소유 — DOM 조회는 그쪽이 이미 findTable/element로 갖고 있다). 측정
  // 불가(표 DOM 미발견 등)면 0을 돌려주고, 0 이하는 fitTableColumnsToContainer가
  // CONTAINER_WIDTH_INVALID로 거절한다.
  getContainerWidth: () => number;
};

/**
 * 표 그립 버튼(CONTEXT.md, Issue #174 RD-003) 클릭 시 여는 표 전체 단위
 * 메뉴 — 제목 행/열 토글, 들여쓰기/내어쓰기, 표 복제, 너비에 맞추기
 * (Issue #176). 행/열 grip 메뉴(table-handle-menu.tsx)와 같은
 * geul-menu-panel + MenuItemButton 관용구를 그대로 따른다. 좌표 계산은
 * TableHandles가 한다.
 *
 * 헤더 토글은 row/col grip 메뉴가 이미 갖고 있는 진입점(첫 행/첫 열에서만
 * 노출)과 같은 커맨드를 호출하는 두 번째 진입점이다(Q6 결정 — 중복
 * 허용, 진입점 제거 없음). 들여쓰기/내어쓰기는 좌상단 아이콘 버튼에서
 * 이 메뉴 항목으로 이전했다(Issue #174 RD-004) — block-side-menu-menu.tsx의
 * handleIndentBlock/handleOutdentBlock과 같은 가드(비활성 클릭은
 * 조용히 무시, 메뉴를 닫지 않는다)를 그대로 따른다. 표 복제는
 * block-side-menu-menu.tsx의 handleDuplicate와 같은 방식(Result를
 * runCommand로 감싸지 않고 호출 후 바로 닫는다)을 따른다 — 같은
 * 커맨드(duplicateBlock)의 기존 처리 관용구를 그대로 재사용한다.
 */
export const TableGripMenu = ({
  tableBlockId,
  headerRowEnabled,
  headerColumnEnabled,
  left,
  top,
  onClose,
  getContainerWidth,
}: TableGripMenuProps) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { menuRef, style } = useClampedMenuPosition(left, top);
  const { actionError, runCommand } = useTableCommandFeedback();
  // block-side-menu-menu.tsx와 같은 관용구(Issue #126) — 표는 이 표
  // 자신을 대상으로 하므로 항상 유효한 blockId다(이 컴포넌트는
  // tableGripMenuTableId가 가리키는 표가 존재할 때만 렌더된다).
  const nestingActions = editor.getBlockNestingActionState(tableBlockId);

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

  const indentTable = () => {
    // G-UI-004: aria-disabled는 disabled와 달리 클릭 이벤트를 막지 않는다 —
    // 명시적 가드로 비활성 상태의 클릭을 막는다(가드가 없으면 명령이
    // 거절돼도 메뉴가 조건 없이 닫힌다).
    if (nestingActions.canIndent !== true) return;
    editor.commands.indentBlock(tableBlockId);
    onClose();
  };

  const outdentTable = () => {
    if (nestingActions.canOutdent !== true) return;
    editor.commands.outdentBlock(tableBlockId);
    onClose();
  };

  const duplicateTable = () => {
    editor.commands.duplicateBlock(tableBlockId);
    onClose();
  };

  // Issue #176 — 클릭 시점의 편집 영역 폭(getContainerWidth)으로 컬럼 폭을
  // 재분배한다. 재분배 알고리즘의 권위는 core의
  // fitColumnsToContainerWidth(table-grid-format.ts)에 있다.
  const fitTableWidth = () =>
    runCommand(
      () =>
        editor.commands.fitTableColumnsToContainer(
          tableBlockId,
          getContainerWidth(),
        ),
      onClose,
    );

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
        <MenuItemButton
          aria-disabled={nestingActions.canIndent !== true}
          className={menuItemClassName}
          onClick={indentTable}
          title={
            nestingActions.canIndent === true
              ? undefined
              : dictionary.nesting.indentDisabledReason
          }
        >
          {dictionary.menu.indent}
        </MenuItemButton>
        <MenuItemButton
          aria-disabled={nestingActions.canOutdent !== true}
          className={menuItemClassName}
          onClick={outdentTable}
          title={
            nestingActions.canOutdent === true
              ? undefined
              : dictionary.nesting.outdentDisabledReason
          }
        >
          {dictionary.menu.outdent}
        </MenuItemButton>
        <hr className={dividerClassName} />
        <MenuItemButton className={menuItemClassName} onClick={duplicateTable}>
          {dictionary.menu.duplicate}
        </MenuItemButton>
        <hr className={dividerClassName} />
        <MenuItemButton className={menuItemClassName} onClick={fitTableWidth}>
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
