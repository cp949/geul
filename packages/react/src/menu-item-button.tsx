import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { preserveFocusOnMouseDown } from "./icon-button.js";

/**
 * 메뉴 항목 버튼의 공통 계약을 한곳에서 강제하는 내부 컴포넌트(index.ts
 * 미수출). role 기본값은 "menuitem"이고, aria-checked를 쓰는 헤더 토글
 * 1곳(table-handle-menu.tsx)만 "menuitemcheckbox"로 override한다.
 *
 * IconButton과는 독자 계약이다 — IconButton은 label 하나에서 aria-label과
 * title을 함께 파생하는 icon-only 버튼 전용이지만, 이 컴포넌트가 흡수하는
 * 13곳 중 다수는 시각적 텍스트를 children으로 갖고(aria-label/title 없음),
 * 나머지는 아이콘 + aria-label만 갖는다(title 없음). IconButton으로
 * 감쌌다면 후자에 없던 title 툴팁이 새로 생겨 기존 동작이 바뀐다(4차
 * 아키텍처 리뷰 카드 4 그릴링 Q2) — 그래서 children을 그대로 받는 얕은
 * 계약을 택했다.
 *
 * mousedown이 contenteditable 초점을 훔치지 않는 계약은 IconButton과
 * preserveFocusOnMouseDown 헬퍼를 공유한다 — 두 컴포넌트가 각자 재구현하면
 * 22곳의 중복을 2곳의 중복으로 줄이는 것일 뿐, 카드가 주장하는 "규칙이 한
 * 곳에 산다"가 성립하지 않는다(그릴링 Q5).
 */
type MenuItemButtonProps = {
  children: ReactNode;
  className: string;
  role?: "menuitem" | "menuitemcheckbox";
} & Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "role" | "type"
>;

export const MenuItemButton = ({
  children,
  className,
  role = "menuitem",
  onMouseDown,
  ...rest
}: MenuItemButtonProps) => (
  <button
    className={className}
    onMouseDown={preserveFocusOnMouseDown(onMouseDown)}
    role={role}
    type="button"
    {...rest}
  >
    {children}
  </button>
);
