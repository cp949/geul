// @vitest-environment jsdom

/**
 * MenuItemButton: 메뉴 항목 버튼의 공통 계약(role 기본값 "menuitem"과
 * override, type 고정, mousedown이 contenteditable 초점을 훔치지 않는
 * 계약)을 검증한다. IconButton과 달리 children을 그대로 받는 얕은
 * 계약이다 — label/icon에서 title을 강제로 파생하지 않는다(4차 아키텍처
 * 리뷰 카드 4 그릴링 Q2: 텍스트 라벨 메뉴 항목에 없던 title 툴팁을 새로
 * 만들지 않기 위해서다).
 *
 * mousedown 계약을 event.defaultPrevented(fireEvent 반환값)로 관찰하는
 * 이유는 icon-button.test.tsx와 같다 — jsdom은 mousedown의 실제 초점 이동
 * 기본 동작을 구현하지 않는다(실측 확인).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MenuItemButton } from "../src/menu-item-button.js";

afterEach(cleanup);

describe("MenuItemButton", () => {
  it("role 기본값은 menuitem이고 type은 button으로 고정된다", () => {
    render(<MenuItemButton className="x">항목</MenuItemButton>);

    const item = screen.getByRole("menuitem", { name: "항목" });

    expect(item.getAttribute("type")).toBe("button");
  });

  it("role을 menuitemcheckbox로 override할 수 있다(헤더 토글 등)", () => {
    render(
      <MenuItemButton
        aria-checked={false}
        className="x"
        role="menuitemcheckbox"
      >
        Header row
      </MenuItemButton>,
    );

    expect(
      screen.getByRole("menuitemcheckbox", { name: "Header row" }),
    ).toBeTruthy();
  });

  it("onMouseDown을 넘기지 않아도 mousedown의 기본 동작을 막는다", () => {
    render(<MenuItemButton className="x">항목</MenuItemButton>);

    const notCanceled = fireEvent.mouseDown(screen.getByRole("menuitem"));

    expect(notCanceled).toBe(false);
  });

  it("소비자가 onMouseDown을 넘기면 preventDefault 뒤에 그대로 위임한다", () => {
    const onMouseDown = vi.fn();
    render(
      <MenuItemButton className="x" onMouseDown={onMouseDown}>
        항목
      </MenuItemButton>,
    );

    const notCanceled = fireEvent.mouseDown(screen.getByRole("menuitem"));

    expect(notCanceled).toBe(false);
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });

  it("aria-label만 있고 시각 텍스트가 없는 아이콘 전용 항목도 지원한다(title은 만들지 않는다)", () => {
    render(
      <MenuItemButton aria-label="Align left" className="x">
        <svg />
      </MenuItemButton>,
    );

    const item = screen.getByRole("menuitem", { name: "Align left" });

    expect(item.getAttribute("title")).toBeNull();
  });

  it("disabled 등 나머지 button 속성을 그대로 전달한다", () => {
    render(
      <MenuItemButton className="x" disabled>
        Delete row
      </MenuItemButton>,
    );

    expect(
      (
        screen.getByRole("menuitem", {
          name: "Delete row",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
