import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from "react";

import type { BlockTypeOption } from "./block-type-options.js";
import { preserveFocusOnMouseDown } from "./icon-button.js";
import { handleMenuKeyDown } from "./menu-keyboard.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissibleOverlay } from "./use-dismissible-overlay.js";

// 메뉴 패널 루트의 셀렉터. 자동 닫힘 때 초점이 메뉴 안에 있었는지 판정한다.
export const BLOCK_TYPE_MENU_SELECTOR = "[data-geul-block-type-menu]";

// 바깥 pointerdown 판정에서 제외할 영역. 트리거를 빼면 열린 상태에서 트리거를
// 다시 누를 때 pointerdown이 먼저 "바깥 클릭"으로 닫아 버리고, 뒤이은 click의
// 토글이 메뉴를 다시 연다(G-UI-001). 모듈 상수로 둔다.
// `useDismissibleOverlay`는 초점이 이 표면 안이면 닫힐 때 편집기로 돌린다.
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

  /** `useDismissibleOverlay`가 쓰는 편집기 마운트 요소. */
  element: HTMLElement | null;

  /** 옵션 확정(클릭, Enter, Space). */
  onConfirm: (option: BlockTypeOption) => void;

  /**
   * 바깥 클릭이나 Escape로 닫을 때 부른다. 호출부는 열림 상태만 비운다.
   * 초점은 `useDismissibleOverlay`가 먼저 옮긴다. 바깥 클릭은 초점이 메뉴나
   * 트리거 안일 때만, Escape는 항상 편집기로 돌린다.
   */
  onClose: () => void;

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
  onClose,
  onTabDismiss,
}: StaticToolbarBlockTypeMenuProps) => {
  const { menuRef, style } = useClampedMenuPosition(left, top);

  // 열려 있을 때만 마운트하므로 `open`은 고정이다. 열림 초점은 아래 로컬
  // effect가 맡고 `focusOnOpen`은 쓰지 않는다. `aria-selected` 옵션을
  // 먼저 찾아야 하기 때문이다.
  useDismissibleOverlay({
    open: true,
    element,
    allowSelectors: BLOCK_TYPE_MENU_DISMISS_ALLOW_SELECTORS,
    onClose,
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
  // 포커스 자체가 현재 위치다. Enter 반복·수식 키·Tab·`preventDefault`의
  // 순서는 handleMenuKeyDown이 소유한다(Issue #225, #228, #230).
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    handleMenuKeyDown(event, {
      tab: onTabDismiss,
      navigate: (key) => {
        const items = Array.from(
          container.querySelectorAll<HTMLElement>('[role="option"]'),
        );
        const current = items.indexOf(document.activeElement as HTMLElement);
        const last = items.length - 1;
        let next: number | null = null;
        if (key === "ArrowDown") next = Math.min(current + 1, last);
        else if (key === "ArrowUp") next = Math.max(current - 1, 0);
        else if (key === "Home") next = 0;
        else if (key === "End") next = last;
        if (next === null) return false;
        items[next]?.focus({ preventScroll: true });
        return true;
      },
    });
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
