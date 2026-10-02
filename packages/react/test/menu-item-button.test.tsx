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
 *
 * 내장 keydown 계약(Issue #230)도 여기서 고정한다. Enter 자동 반복은 막고
 * 처음 Enter는 막지 않는다. 호출부 onKeyDown은 그 뒤에 이어 호출된다.
 * 순서 계약 자체는 menu-keyboard.test.ts가 소유한다.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MenuItemButton } from "../src/menu-item-button.js";
import { releaseEnterRepeatSuppression } from "./menu-keyboard-test-support.js";

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

describe("MenuItemButton 내장 keydown(Issue #230)", () => {
  // 처음 Enter가 문서에 건 반복 억제를 다음 테스트로 넘기지 않는다. 남아 있으면
  // 반복 Enter가 문서 capture에서 삼켜져 defaultPrevented가 가짜로 참이 된다.
  afterEach(releaseEnterRepeatSuppression);

  it("반복 Enter keydown은 막아 click이 나지 않게 한다", () => {
    render(<MenuItemButton className="x">항목</MenuItemButton>);

    const notCanceled = fireEvent.keyDown(screen.getByRole("menuitem"), {
      key: "Enter",
      repeat: true,
    });

    expect(notCanceled).toBe(false);
  });

  it("처음 Enter keydown은 막지 않아 네이티브 click 경로가 열려 있다", () => {
    render(<MenuItemButton className="x">항목</MenuItemButton>);

    const notCanceled = fireEvent.keyDown(screen.getByRole("menuitem"), {
      key: "Enter",
    });

    expect(notCanceled).toBe(true);
  });

  it("호출부 onKeyDown은 module 처리 뒤에도 호출된다", () => {
    const seenPrevented: boolean[] = [];
    const onKeyDown = vi.fn((event: { defaultPrevented: boolean }) => {
      seenPrevented.push(event.defaultPrevented);
    });
    render(
      <MenuItemButton className="x" onKeyDown={onKeyDown}>
        항목
      </MenuItemButton>,
    );

    fireEvent.keyDown(screen.getByRole("menuitem"), {
      key: "Enter",
      repeat: true,
    });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    // module이 먼저 막았으므로 호출부는 이미 막힌 이벤트를 받는다.
    expect(seenPrevented).toEqual([true]);
  });

  it("호출부 onKeyDown은 처음 Enter에서도 호출된다", () => {
    const onKeyDown = vi.fn();
    render(
      <MenuItemButton className="x" onKeyDown={onKeyDown}>
        항목
      </MenuItemButton>,
    );

    fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Enter" });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
