// @vitest-environment jsdom

/**
 * StaticToolbar 블록 컨트롤의 상시 렌더와 비활성 표시를 확인한다
 * (RD-003-DELTA-02, Issue #218).
 * - 대상 블록이 없어도 트리거·아이콘 버튼 7종·Indent·Outdent를 렌더한다.
 * - 비활성은 `aria-disabled`와 사유 `title`로 표시하고 명령을 호출하지 않는다.
 * - mark·블록 버튼의 클래스는 `geul-static-toolbar__*`로 분리됐다.
 * 컨트롤 좌표와 툴바 폭이 selection에 따라 변하지 않는지는 레이아웃이
 * 필요해 e2e(showcase-static-toolbar-block-controls.spec.ts)가 소유한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

afterEach(cleanup);

const DISABLED_REASON = "Available when the cursor is in a single block";

const ICON_BUTTON_NAMES = [
  "Quote",
  "Callout",
  "Code",
  "Bulleted List",
  "Numbered List",
  "Check List",
  "Toggle List",
] as const;

const BLOCK_CONTROL_NAMES = [
  "Block type",
  ...ICON_BUTTON_NAMES,
  "Indent",
  "Outdent",
] as const;

/** 대상 블록이 없는(`blockSelection === null`) fake controller를 만든다. */
const noTargetController = () =>
  fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );

/** 툴바 직계 컨트롤 수를 읽는다. */
const controlCount = () =>
  screen.getByRole("toolbar", { name: "Toolbar" }).children.length;

describe("StaticToolbar 블록 컨트롤 상시 렌더", () => {
  it("대상 블록이 없어도 블록 컨트롤 10개를 모두 렌더한다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));

    for (const name of BLOCK_CONTROL_NAMES) {
      expect(screen.getByRole("button", { name })).not.toBeNull();
    }
  });

  it("blockSelection이 있다가 null이 돼도 툴바 직계 컨트롤 수가 같다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));
    const before = controlCount();

    controller.getSelectionBlockType.mockReturnValue(null);
    controller.emit();

    expect(controlCount()).toBe(before);
    expect(before).toBe(17);
  });

  it("대상 블록이 없으면 블록 컨트롤 전부가 aria-disabled=true와 사유 title을 가진다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));

    for (const name of BLOCK_CONTROL_NAMES) {
      const control = screen.getByRole("button", { name });
      expect(control.getAttribute("aria-disabled"), name).toBe("true");
      expect(control.getAttribute("title"), name).toBe(DISABLED_REASON);
    }
  });

  it("대상 블록이 없으면 트리거는 중립 라벨을 보이고 아이콘 버튼은 눌림 상태가 아니다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));

    expect(screen.getByRole("button", { name: "Block type" }).textContent).toBe(
      "Other",
    );
    for (const name of ICON_BUTTON_NAMES) {
      expect(
        screen.getByRole("button", { name }).getAttribute("aria-pressed"),
        name,
      ).toBe("false");
    }
  });
});

describe("StaticToolbar 블록 컨트롤 클릭 가드", () => {
  it("대상 블록이 없으면 트리거를 눌러도 메뉴가 열리지 않는다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));
    const trigger = screen.getByRole("button", { name: "Block type" });

    // 클릭은 열림과 닫힘을 토글하므로 한 번마다 단언한다.
    for (const detail of [1, 0]) {
      fireEvent.click(trigger, { detail });

      expect(screen.queryByRole("listbox"), `detail ${detail}`).toBeNull();
      expect(trigger.getAttribute("aria-expanded"), `detail ${detail}`).toBe(
        "false",
      );
    }
  });

  it("대상 블록이 없으면 트리거에서 ArrowDown·ArrowUp을 눌러도 메뉴가 열리지 않는다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));
    const trigger = screen.getByRole("button", { name: "Block type" });

    for (const key of ["ArrowDown", "ArrowUp"]) {
      fireEvent.keyDown(trigger, { key });

      expect(screen.queryByRole("listbox"), key).toBeNull();
      expect(trigger.getAttribute("aria-expanded"), key).toBe("false");
    }
  });

  it("대상 블록이 없으면 아이콘 버튼 7종·Indent·Outdent를 눌러도 명령을 호출하지 않는다", () => {
    const controller = noTargetController();
    render(withProvider(controller, <StaticToolbar />));

    for (const name of [...ICON_BUTTON_NAMES, "Indent", "Outdent"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    expect(controller.commands.setBlockType).not.toHaveBeenCalled();
    expect(controller.commands.indentBlock).not.toHaveBeenCalled();
    expect(controller.commands.outdentBlock).not.toHaveBeenCalled();
  });

  it("렌더 뒤 대상 블록이 사라졌지만 아직 통지되지 않았어도 클릭은 명령을 호출하지 않는다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));
    // emit 없이 조회 결과만 바꿔 "렌더 시점 상태가 낡은" 경합을 만든다.
    // 핸들러는 클릭 시점에 상태를 다시 읽어야 한다.
    controller.getSelectionBlockType.mockReturnValue(null);
    controller.getBlockNestingActionState.mockReturnValue(null);

    for (const name of [...ICON_BUTTON_NAMES, "Indent", "Outdent"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    expect(controller.commands.setBlockType).not.toHaveBeenCalled();
    expect(controller.commands.indentBlock).not.toHaveBeenCalled();
    expect(controller.commands.outdentBlock).not.toHaveBeenCalled();
  });

  it("비활성 컨트롤은 네이티브 disabled가 없고 포커스를 받는다", () => {
    render(withProvider(noTargetController(), <StaticToolbar />));

    for (const name of BLOCK_CONTROL_NAMES) {
      const control = screen.getByRole("button", {
        name,
      }) as HTMLButtonElement;
      expect(control.disabled, name).toBe(false);
      expect(control.hasAttribute("disabled"), name).toBe(false);
      expect(control.tabIndex, name).toBe(0);
    }
  });
});

describe("StaticToolbar 블록 컨트롤 메뉴 닫기", () => {
  it("메뉴가 열린 채 대상 블록이 사라지면 메뉴가 닫히고 aria-expanded가 false가 된다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));
    const trigger = screen.getByRole("button", { name: "Block type" });
    fireEvent.click(trigger, { detail: 1 });
    expect(screen.getByRole("listbox")).not.toBeNull();

    controller.getSelectionBlockType.mockReturnValue(null);
    controller.emit();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("대상 블록이 다시 생겨도 닫힌 메뉴가 되살아나지 않는다", () => {
    const controller = fakeStaticToolbarController();
    render(withProvider(controller, <StaticToolbar />));
    fireEvent.click(screen.getByRole("button", { name: "Block type" }), {
      detail: 1,
    });

    controller.getSelectionBlockType.mockReturnValue(null);
    controller.emit();
    controller.getSelectionBlockType.mockReturnValue({
      blockId: "block-1",
      blockType: { type: "paragraph" },
    });
    controller.emit();

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Block type" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});

describe("StaticToolbar 블록 컨트롤 title 정책", () => {
  it("대상 블록이 있으면 트리거는 title이 없고 아이콘 버튼·Indent는 기존 title을 유지한다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    expect(
      screen.getByRole("button", { name: "Block type" }).hasAttribute("title"),
    ).toBe(false);
    for (const name of [...ICON_BUTTON_NAMES, "Indent", "Outdent"]) {
      expect(
        screen.getByRole("button", { name }).getAttribute("title"),
        name,
      ).toBe(name);
    }
  });

  it("대상 블록이 있고 들여쓰기가 불가능하면 기존 nesting 사유를 유지한다", () => {
    const controller = fakeStaticToolbarController();
    controller.getBlockNestingActionState.mockReturnValue({
      canIndent: false,
      canOutdent: false,
    });
    render(withProvider(controller, <StaticToolbar />));

    for (const name of ["Indent", "Outdent"]) {
      const title = screen.getByRole("button", { name }).getAttribute("title");
      expect(title, name).not.toBe(DISABLED_REASON);
      expect(title, name).not.toBe(name);
    }
  });

  it("문단에 캐럿이 있으면 블록 컨트롤 전부가 aria-disabled=false다", () => {
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />));

    for (const name of BLOCK_CONTROL_NAMES) {
      expect(
        screen.getByRole("button", { name }).getAttribute("aria-disabled"),
        name,
      ).toBe("false");
    }
  });
});

describe("StaticToolbar 클래스 분리", () => {
  // jsdom 환경에서는 import.meta.url이 file: URL이 아니라 dirname을 쓴다.
  const sourceDir = join(import.meta.dirname, "../src");
  const staticToolbarSources = readdirSync(sourceDir).filter((file) =>
    /^(static-toolbar.*\.tsx?|_static-toolbar\.scss)$/.test(file),
  );

  it("static-toolbar 소스에 geul-formatting-toolbar__ 문자열이 없다", () => {
    expect(staticToolbarSources).toContain("static-toolbar.tsx");
    expect(staticToolbarSources).toContain("_static-toolbar.scss");

    for (const file of staticToolbarSources) {
      const text = readFileSync(join(sourceDir, file), "utf8");
      expect(text.includes("geul-formatting-toolbar__"), file).toBe(false);
    }
  });

  it("렌더 결과에 geul-formatting-toolbar__ 클래스가 없고 버튼은 geul-static-toolbar__button을 쓴다", () => {
    const { container } = render(
      withProvider(fakeStaticToolbarController(), <StaticToolbar />),
    );

    expect(
      container.querySelector('[class*="geul-formatting-toolbar__"]'),
    ).toBeNull();
    const buttons = container.querySelectorAll(".geul-static-toolbar__button");
    // 아이콘 7 + Indent·Outdent + mark 5 + 색상 2
    expect(buttons.length).toBe(16);
  });
});
