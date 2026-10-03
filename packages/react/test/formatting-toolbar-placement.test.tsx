// @vitest-environment jsdom

/**
 * FormattingToolbar의 배치 계약을 확인한다(Issue #234 RD-005).
 * - 앵커는 선택 Range의 위쪽 중앙이다. 스크롤마다 Range의 새 rect를 따라간다.
 * - Range rect를 읽을 수 없으면(너비·높이가 모두 0) 마지막 좌표를 유지한다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { selectText } from "./selection-events.js";

/** jsdom 원본 `Range.getBoundingClientRect`. 각 테스트 뒤에 복원한다. */
const originalRangeRect = Range.prototype.getBoundingClientRect;

afterEach(() => {
  cleanup();
  Range.prototype.getBoundingClientRect = originalRangeRect;
});

/** 모든 Range가 지정한 rect를 돌려주게 한다. */
const stubSelectionRect = (rect: DOMRect) => {
  Range.prototype.getBoundingClientRect = () => rect;
};

/** 서식 툴바와 편집기를 렌더하고 본문 text node를 돌려준다. */
const setup = () => {
  render(
    withProvider(
      fakeController(),
      <>
        <FormattingToolbar />
        <EditorContent />
      </>,
    ),
  );
  const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
    ?.firstChild;
  if (!textNode) throw new Error("Text node was not rendered");
  return { textNode };
};

/** 서식 툴바의 fixed 좌표(style)를 읽는다. */
const readToolbarPosition = () => {
  const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
  return { left: toolbar.style.left, top: toolbar.style.top };
};

describe("FormattingToolbar 배치", () => {
  it("선택 Range 위쪽 중앙에 앵커한다", () => {
    const { textNode } = setup();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));

    selectText(textNode, 0, 8);

    // jsdom 박스는 0×0이라 clamp가 앵커 좌표를 그대로 둔다. 앵커는 (중앙, 위쪽)이다.
    expect(readToolbarPosition()).toEqual({ left: "140px", top: "200px" });
  });

  it("스크롤하면 Range의 새 rect를 따라간다", () => {
    const { textNode } = setup();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));
    selectText(textNode, 0, 8);

    stubSelectionRect(new DOMRect(100, 150, 80, 20));
    fireEvent.scroll(window);

    expect(readToolbarPosition()).toEqual({ left: "140px", top: "150px" });
  });

  it("Range rect를 읽을 수 없으면(0) 마지막 좌표를 유지한다", () => {
    const { textNode } = setup();
    stubSelectionRect(new DOMRect(100, 200, 80, 20));
    selectText(textNode, 0, 8);

    stubSelectionRect(new DOMRect(0, 0, 0, 0));
    fireEvent.scroll(window);

    expect(readToolbarPosition()).toEqual({ left: "140px", top: "200px" });
  });
});
