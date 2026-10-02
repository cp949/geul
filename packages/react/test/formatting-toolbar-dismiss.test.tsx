// @vitest-environment jsdom

/**
 * FormattingToolbar와 색상 팔레트의 바깥 클릭·Escape 닫힘이
 * useDismissibleOverlay를 거치는 계약을 확인한다(Issue #233, RD-003
 * DELTA-01).
 * - 툴바와 팔레트가 함께 열린 채 Escape는 나중에 열린 팔레트만 먼저 닫는다.
 *   부모가 팔레트 상태로 툴바 리스너를 끄지 않아도 성립한다.
 * - 팔레트 안 pointerdown은 툴바를 닫지 않는다.
 * - 팔레트가 열린 채 바깥을 누르면 팔레트와 툴바가 함께 닫힌다.
 * - 바깥 클릭은 재오픈 억제를 기록하지 않는다. Escape만 기록한다.
 * - 편집기가 먼저 막은 Escape는 닫고, 편집기 밖에서 막힌 Escape와 IME 조합 중
 *   Escape는 닫지 않는다.
 * - 바깥 클릭 때 초점이 툴바 안이면 편집기로 옮기고, 밖이면 그대로 둔다.
 * - StaticToolbar 블록 타입·색상 메뉴와 함께 열린 과도기 조합에서도 Escape 한
 *   번에 나중에 열린 쪽만 닫힌다.
 * 기존 formatting-toolbar*.test.tsx 단언은 이전 후에도 수정 없이 통과한다.
 * 편집기 안 Escape를 ProseMirror가 막는 경로는 jsdom이 재현하지 못해
 * e2e/formatting-toolbar.spec.ts가 소유한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  EditorContent,
  FormattingToolbar,
  StaticToolbar,
} from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { mountBlockEditor, paragraphOf } from "./mount-editor.js";
import { queryMountedEditable } from "./query-mounted-editable.js";
import { fireSelectionChange, selectText } from "./selection-events.js";
import { press } from "./static-toolbar-test-support.js";

afterEach(cleanup);

/**
 * fake controller로 서식 툴바를 그리고 첫 문장을 선택해 툴바를 연다.
 * 편집 영역을 함께 돌려준다.
 */
const openToolbar = () => {
  render(
    withProvider(
      fakeController(),
      <>
        <FormattingToolbar />
        <EditorContent />
      </>,
    ),
  );
  const host = screen.getByRole("textbox", { name: "Editor" });
  const textNode = host.firstChild?.firstChild;
  if (!textNode) throw new Error("Text node was not rendered");
  selectText(textNode, 0, 8);
  expect(screen.queryByRole("toolbar", { name: "Formatting" })).not.toBeNull();
  return { editable: queryMountedEditable(host) };
};

/** 글자색 팔레트를 연다. 툴바가 먼저 열려 있어야 한다. */
const openPalette = () => {
  fireEvent.click(screen.getByRole("button", { name: "Text color" }));
  expect(screen.queryByRole("menu", { name: "Text color" })).not.toBeNull();
};

/** 서식 툴바가 떠 있는지 본다. */
const toolbarVisible = () =>
  screen.queryByRole("toolbar", { name: "Formatting" }) !== null;

/**
 * 편집 영역 밖 입력을 만든다. 호출부가 `remove()`로 치운다.
 * 초점은 주지 않는다. 테스트가 초점 위치를 정한다.
 */
const createOutsideInput = () => {
  const input = document.createElement("input");
  document.body.append(input);
  return input;
};

describe("FormattingToolbar와 팔레트의 Escape가 useDismissibleOverlay를 거친다(Issue #233 RD-003 DELTA-01)", () => {
  it("툴바와 팔레트가 열린 채 Escape를 누르면 팔레트만 닫히고 두 번째 Escape에 툴바가 닫힌다", () => {
    openToolbar();
    openPalette();

    fireEvent.keyDown(document, { key: "Escape" });

    // 툴바가 먼저 열렸으므로 LIFO가 팔레트를 먼저 닫는다.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(toolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toolbarVisible()).toBe(false);
  });

  it("편집기가 Escape를 먼저 preventDefault해도 툴바가 닫힌다", () => {
    const { editable } = openToolbar();
    // ProseMirror editHandlers.keydown이 편집기 안의 Escape를 막는 것을 흉내 낸다.
    const consume = (event: Event) => event.preventDefault();
    editable.addEventListener("keydown", consume);
    try {
      fireEvent.keyDown(editable, { key: "Escape" });
    } finally {
      editable.removeEventListener("keydown", consume);
    }

    expect(toolbarVisible()).toBe(false);
  });

  it("편집기 밖에서 이미 preventDefault된 Escape는 툴바를 닫지 않는다", () => {
    openToolbar();
    const outside = createOutsideInput();
    try {
      outside.focus();
      outside.addEventListener("keydown", (event) => event.preventDefault());

      fireEvent.keyDown(outside, { key: "Escape" });

      expect(toolbarVisible()).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("IME 조합 중 Escape는 툴바를 닫지 않고 조합이 끝난 뒤 Escape는 닫는다", () => {
    openToolbar();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(toolbarVisible()).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toolbarVisible()).toBe(false);
  });

  it("IME 조합 중 Escape는 열린 팔레트를 닫지 않는다", () => {
    openToolbar();
    openPalette();

    fireEvent.keyDown(document, { key: "Escape", isComposing: true });

    expect(screen.queryByRole("menu", { name: "Text color" })).not.toBeNull();
    expect(toolbarVisible()).toBe(true);
  });
});

describe("FormattingToolbar와 팔레트의 바깥 클릭이 useDismissibleOverlay를 거친다(Issue #233 RD-003 DELTA-01)", () => {
  it("팔레트 안을 누르거나 스와치로 색을 적용해도 툴바는 열려 있다", () => {
    openToolbar();
    openPalette();

    fireEvent.pointerDown(screen.getByRole("menu", { name: "Text color" }));
    expect(screen.queryByRole("menu", { name: "Text color" })).not.toBeNull();
    expect(toolbarVisible()).toBe(true);

    const swatch = screen.getByRole("menuitem", { name: "Text color Blue" });
    fireEvent.pointerDown(swatch);
    expect(toolbarVisible()).toBe(true);

    fireEvent.click(swatch);

    // 적용하면 팔레트만 닫힌다. 툴바는 남는다.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(toolbarVisible()).toBe(true);
  });

  it("팔레트가 열린 채 툴바의 색상 트리거를 누르면 둘 다 열려 있고 Bold를 누르면 팔레트만 닫힌다", () => {
    openToolbar();
    openPalette();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Text color" }));

    expect(screen.queryByRole("menu", { name: "Text color" })).not.toBeNull();
    expect(toolbarVisible()).toBe(true);

    // 팔레트 자신의 allow에는 툴바의 다른 버튼이 없다. 팔레트만 바깥 클릭으로 닫힌다.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Bold" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(toolbarVisible()).toBe(true);
  });

  it("팔레트가 열린 채 바깥을 누르면 팔레트와 툴바가 함께 닫힌다", () => {
    openToolbar();
    openPalette();
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);

      expect(screen.queryByRole("menu")).toBeNull();
      expect(toolbarVisible()).toBe(false);
    } finally {
      outside.remove();
    }
  });

  it("바깥 클릭으로 닫힌 뒤 같은 selection이 재관측되면 다시 열린다", () => {
    openToolbar();
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);
      expect(toolbarVisible()).toBe(false);

      // 바깥 클릭은 보통 selection을 collapse하므로 재오픈 억제를 기록하지
      // 않는다(Escape와 다르다). selection이 남아 있으면 재관측이 다시 연다.
      fireEvent.scroll(document);

      expect(toolbarVisible()).toBe(true);
    } finally {
      outside.remove();
    }
  });

  it("바깥 클릭 때 초점이 툴바 안이면 편집기로 옮긴다", () => {
    const { editable } = openToolbar();
    // 초점이 처음부터 편집기에 있으면 단언이 공허해진다. 툴바 버튼에 둔다.
    screen.getByRole("button", { name: "Bold" }).focus();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Bold" }),
    );
    const outside = createOutsideInput();
    try {
      fireEvent.pointerDown(outside);

      expect(toolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(editable);
    } finally {
      outside.remove();
    }
  });

  it("바깥 클릭 때 초점이 이미 편집기 밖이면 그대로 둔다", () => {
    openToolbar();
    const outside = createOutsideInput();
    try {
      outside.focus();

      fireEvent.pointerDown(outside);

      expect(toolbarVisible()).toBe(false);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

/**
 * 실제 편집기에 StaticToolbar와 FormattingToolbar를 함께 마운트하고 첫 문단
 * 전체를 범위 선택해 서식 툴바를 연다. 마운트 결과(`mounted`)를 돌려준다.
 */
const mountBoth = () => {
  const mounted = mountBlockEditor({
    blockIds: ["block-1"],
    children: (
      <>
        <StaticToolbar />
        <FormattingToolbar />
      </>
    ),
  });
  const paragraph = paragraphOf(mounted.blocks[0]);
  const textNode = paragraph.firstChild;
  if (textNode === null) throw new Error("문단 텍스트를 찾지 못했다");
  selectText(textNode, 0, 2);
  // 실제 편집기는 PM이 selectionchange로 state를 갱신한 뒤에야 서식 툴바가 뜬다.
  fireSelectionChange();
  expect(toolbarVisible()).toBe(true);
  return mounted;
};

describe("FormattingToolbar와 StaticToolbar 메뉴가 함께 열려도 Escape는 나중에 열린 쪽만 닫는다(Issue #233 RD-003 DELTA-01)", () => {
  it("범위 선택 뒤 블록 타입 메뉴를 키보드로 열고 Escape를 누르면 메뉴만 닫히고 두 번째 Escape에 서식 툴바가 닫힌다", () => {
    mountBoth();
    // 마우스로 열면 서식 툴바가 바깥 클릭으로 닫힐 수 있어 키보드로 연다.
    fireEvent.click(screen.getByRole("button", { name: "Block type" }), {
      detail: 0,
    });
    expect(
      screen.queryByRole("listbox", { name: "Block type" }),
    ).not.toBeNull();
    expect(toolbarVisible()).toBe(true);

    press("Escape");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(toolbarVisible()).toBe(true);

    press("Escape");

    expect(toolbarVisible()).toBe(false);
  });

  it("범위 선택 뒤 색상 메뉴를 키보드로 열고 Escape를 누르면 메뉴만 닫히고 두 번째 Escape에 서식 툴바가 닫힌다", () => {
    mountBoth();
    // StaticToolbar에도 같은 이름의 트리거가 있어 정적 툴바 쪽을 고른다.
    const staticToolbar = screen.getByRole("toolbar", { name: "Toolbar" });
    const trigger = staticToolbar.querySelector<HTMLElement>(
      "[data-geul-color-trigger]",
    );
    if (trigger === null) throw new Error("색상 트리거를 찾지 못했다");
    fireEvent.click(trigger, { detail: 0 });
    expect(screen.queryByRole("menu")).not.toBeNull();
    expect(toolbarVisible()).toBe(true);

    press("Escape");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(toolbarVisible()).toBe(true);

    press("Escape");

    expect(toolbarVisible()).toBe(false);
  });
});
