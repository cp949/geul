import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from "react";

import type { BlockTypeOption } from "./block-type-options.js";
import { hasCommandModifier } from "./has-command-modifier.js";
import { preserveFocusOnMouseDown } from "./icon-button.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";

// 메뉴 패널 루트의 셀렉터. 자동 닫힘 때 초점이 메뉴 안에 있었는지 판정한다.
export const BLOCK_TYPE_MENU_SELECTOR = "[data-geul-block-type-menu]";

// 바깥 pointerdown 판정에서 제외할 영역. 트리거를 빼면 열린 상태에서 트리거를
// 다시 누를 때 pointerdown이 먼저 "바깥 클릭"으로 닫아 버리고, 뒤이은 click의
// 토글이 메뉴를 다시 연다(G-UI-001). 모듈 상수로 둔다 — 매 렌더 새 배열을
// 넘기면 훅이 리스너를 매번 다시 건다.
const BLOCK_TYPE_MENU_DISMISS_ALLOW_SELECTORS = [
  BLOCK_TYPE_MENU_SELECTOR,
  "[data-geul-block-type-trigger]",
] as const;

type StaticToolbarBlockTypeMenuProps = {
  /** 메뉴 좌상단 앵커의 viewport 좌표. 트리거 하단 기준이다. */
  left: number;
  top: number;

  /** 메뉴 aria-label. 트리거와 같은 사전 값을 쓴다. */
  label: string;

  /** 표시할 옵션. 호출부가 `isBlockTypeEnabled`로 이미 거른 목록이다. */
  options: readonly BlockTypeOption[];

  /** 옵션 라벨. 사전 문구는 호출부가 소유한다. */
  optionLabel: (option: BlockTypeOption) => string;

  /** 현재 블록 타입의 옵션 id. 목록 밖이거나 대상이 없으면 `null`이다. */
  activeOptionId: string | null;

  /** 열린 직후 선택된 옵션(없으면 첫 옵션)으로 포커스를 옮길지. 키보드로 열 때만 `true`다. */
  focusSelected: boolean;

  /** `useDismissOnOutsideOrEscape`가 쓰는 편집기 마운트 요소. */
  element: HTMLElement | null;

  /** 옵션 확정(클릭, Enter, Space). */
  onConfirm: (option: BlockTypeOption) => void;

  /**
   * 바깥 클릭. 이 컴포넌트는 포커스를 옮기지 않는다. 호출부가 포커스가 메뉴 안에
   * 있었으면 편집기로 돌린다(G-UI-001 자동 닫힘). 호출부가 `useCallback`으로
   * 안정시킨다.
   */
  onOutsideDismiss: () => void;

  /** Escape. 호출부가 편집기로 포커스를 돌린다. 호출부가 `useCallback`으로 안정시킨다. */
  onEscapeDismiss: () => void;

  /** Tab. 호출부가 메뉴를 닫고 트리거로 포커스를 돌린다. */
  onTabDismiss: () => void;
};

/**
 * StaticToolbar의 블록 타입 listbox 메뉴.
 *
 * 열려 있을 때만 마운트한다. 화살표·Home·End는 포커스만 옮기고 변환하지
 * 않는다. Enter와 Space는 포커스된 옵션 버튼의 기본 click으로 확정한다.
 * `MenuItemButton`은 `option` role을 허용하지 않아 옵션 버튼을 직접 만든다.
 */
export const StaticToolbarBlockTypeMenu = ({
  left,
  top,
  label,
  options,
  optionLabel,
  activeOptionId,
  focusSelected,
  element,
  onConfirm,
  onOutsideDismiss,
  onEscapeDismiss,
  onTabDismiss,
}: StaticToolbarBlockTypeMenuProps) => {
  const { menuRef, style } = useClampedMenuPosition(left, top);

  useDismissOnOutsideOrEscape({
    active: true,
    element,
    allowSelectors: BLOCK_TYPE_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss,
    onEscapeDismiss,
  });

  // 키보드로 열었을 때만 메뉴 안으로 포커스를 옮긴다. 마우스로 열면 편집기
  // 포커스를 유지한다(RD-003 결정). 열린 뒤 값은 바뀌지 않으므로 마운트
  // 시점 한 번만 실행한다.
  useEffect(() => {
    if (!focusSelected) return;
    const panel = menuRef.current;
    const target =
      panel?.querySelector<HTMLElement>(
        '[role="option"][aria-selected="true"]',
      ) ?? panel?.querySelector<HTMLElement>('[role="option"]');
    target?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열림 시점 1회만 실행한다.
  }, []);

  // 옵션 사이 이동은 DOM 순서를 그대로 쓴다. 옵션이 7개뿐이라 별도 상태 없이
  // 포커스 자체가 현재 위치다. 수식 키가 있으면 처리하지 않은 키이므로
  // `preventDefault`하지 않고 물러난다(Issue #225).
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (hasCommandModifier(event)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = Math.min(current + 1, last);
    else if (event.key === "ArrowUp") next = Math.max(current - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Tab") {
      event.preventDefault();
      onTabDismiss();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus({ preventScroll: true });
  };

  return (
    <div
      aria-label={label}
      className="geul-menu-panel geul-static-toolbar__block-type-menu"
      data-geul-block-type-menu=""
      onKeyDown={handleKeyDown}
      ref={menuRef}
      role="listbox"
      style={style}
    >
      {options.map((option) => (
        <button
          aria-selected={option.id === activeOptionId}
          className="geul-static-toolbar__block-type-option"
          key={option.id}
          onClick={() => onConfirm(option)}
          onMouseDown={preserveFocusOnMouseDown()}
          role="option"
          tabIndex={-1}
          type="button"
        >
          {optionLabel(option)}
        </button>
      ))}
    </div>
  );
};
