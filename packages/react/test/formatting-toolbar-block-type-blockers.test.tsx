// @vitest-environment jsdom

/**
 * FormattingToolbar 블록 타입 select가 core 거절 사유(`getBlockTypeBlocker`,
 * `getBlockTypesBlocker`)를 반영하는 계약을 확인한다(Issue #245).
 * - 막힌 옵션은 목록에서 뺀다.
 * - 현재 타입 말고 고를 수 있는 옵션이 없으면 select를 그리지 않는다.
 * 판정 자체는 core `block-type-blocker.test.ts`가 소유한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import type {
  BlockTypeBlocker,
  BlockTypeDescriptor,
  SetBlockTypeDescriptor,
} from "@cp949/geul-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent, FormattingToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { selectText } from "./selection-events.js";

afterEach(cleanup);

type BlockerRule = (
  blockType: SetBlockTypeDescriptor,
) => BlockTypeBlocker | null;

/** FormattingToolbar를 그리고 에디터 첫 텍스트를 선택해 툴바를 띄운다. */
const renderToolbar = (controller: ReturnType<typeof fakeController>) => {
  render(
    withProvider(
      controller,
      <>
        <FormattingToolbar />
        <EditorContent />
      </>,
    ),
  );
  const textNode = screen.getByRole("textbox", { name: "Editor" }).firstChild
    ?.firstChild;
  if (!textNode) throw new Error("Text node was not rendered");
  selectText(textNode, 0, 8);
};

/** 단일 블록 선택 controller로 툴바를 그린다. 사유는 옵션 descriptor로 정한다. */
const renderSingle = (blockType: BlockTypeDescriptor, rule: BlockerRule) => {
  const controller = fakeController(
    vi.fn(() => []),
    vi.fn(() => ({ blockId: "block-1", blockType })),
  );
  controller.getBlockTypeBlocker.mockImplementation(
    (_blockId: string, descriptor: SetBlockTypeDescriptor) => rule(descriptor),
  );
  renderToolbar(controller);
  return controller;
};

/** 여러 블록 선택 controller로 툴바를 그린다. 사유는 옵션 descriptor로 정한다. */
const renderMulti = (blockTypes: BlockTypeDescriptor[], rule: BlockerRule) => {
  const controller = fakeController(
    vi.fn(() => []),
    vi.fn(() => null),
  );
  controller.getSelectionBlocks.mockReturnValue(
    blockTypes.map((blockType, index) => ({
      blockId: `b${index}`,
      blockType,
    })),
  );
  controller.getBlockTypesBlocker.mockImplementation(
    (_blockIds: string[], descriptor: SetBlockTypeDescriptor) =>
      rule(descriptor),
  );
  renderToolbar(controller);
  return controller;
};

/** 블록 타입 select가 가진 옵션 value 목록을 돌려준다. */
const optionValues = (): string[] => {
  const select = screen.getByRole("combobox", {
    name: "Block type",
  }) as HTMLSelectElement;
  return Array.from(select.options).map((option) => option.value);
};

describe("FormattingToolbar 블록 타입 select 거절 사유 반영", () => {
  it("자식이 있는 블록은 Code 옵션을 빼고 나머지는 남긴다", () => {
    renderSingle({ type: "paragraph" }, (descriptor) =>
      descriptor.type === "codeBlock" ? "HAS_CHILDREN" : null,
    );

    const values = optionValues();
    expect(values).not.toContain("code");
    expect(values).toContain("quote");
    expect(values).toContain("heading-1");
  });

  it("탭이 든 codeBlock은 고를 옵션이 없어 select를 그리지 않는다", () => {
    renderSingle({ type: "codeBlock" }, (descriptor) =>
      descriptor.type === "codeBlock" ? null : "INVALID_TEXT",
    );

    expect(screen.queryByRole("combobox", { name: "Block type" })).toBeNull();
  });

  it("codeBlock만 여러 개 선택하면 select를 그리지 않는다", () => {
    renderMulti([{ type: "codeBlock" }, { type: "codeBlock" }], () => {
      return "ALL_CODE_BLOCK";
    });

    expect(screen.queryByRole("combobox", { name: "Block type" })).toBeNull();
  });

  it("codeBlock이 섞인 여러 블록 선택은 select가 남는다", () => {
    renderMulti([{ type: "codeBlock" }, { type: "paragraph" }], () => null);

    expect(optionValues()).toContain("quote");
  });
});
