// @vitest-environment jsdom

/**
 * StaticToolbar 블록 타입 변환 버튼이 core 거절 사유(`getBlockTypeBlocker`,
 * `getBlockTypesBlocker`)를 반영하는 계약을 확인한다(Issue #245, G-UI-004).
 * - 자식이 있는 블록의 Code 버튼은 비활성이고 사유 title을 가진다.
 * - 탭 등 무효 문자가 든 codeBlock의 일반 블록 타입 버튼과 메뉴 옵션은 비활성이다.
 * - codeBlock만 여러 개 선택하면 모든 변환 버튼이 비활성이다.
 * - 비활성 항목은 눌러도 명령을 호출하지 않고 메뉴를 닫지 않는다.
 * 판정 자체는 core `block-type-blocker.test.ts`가 소유한다. 여기서는 fake가
 * 돌려주는 사유를 UI가 어떻게 표시하는지만 본다.
 */
import { DEFAULT_DICTIONARY, KO_DICTIONARY } from "@cp949/geul-core";
import type {
  BlockTypeBlocker,
  BlockTypeDescriptor,
  Dictionary,
  SetBlockTypeDescriptor,
} from "@cp949/geul-core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

afterEach(cleanup);

const DICTIONARIES: ReadonlyArray<readonly [string, Dictionary]> = [
  ["en", DEFAULT_DICTIONARY],
  ["ko", KO_DICTIONARY],
];

type BlockerRule = (
  blockType: SetBlockTypeDescriptor,
) => BlockTypeBlocker | null;

/** 단일 블록 선택 controller. 사유는 옵션의 descriptor로 정한다. */
const controllerInBlock = (
  blockType: BlockTypeDescriptor,
  dictionary: Dictionary,
  rule: BlockerRule,
) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => ({ blockId: "block-1", blockType })),
  );
  controller.getDictionary.mockReturnValue(dictionary);
  controller.getBlockTypeBlocker.mockImplementation(
    (_blockId: string, descriptor: SetBlockTypeDescriptor) => rule(descriptor),
  );
  return controller;
};

/** codeBlock 둘에 걸친 여러 블록 선택 controller. */
const controllerWithMultiSelection = (
  blockTypes: readonly BlockTypeDescriptor[],
  dictionary: Dictionary,
  rule: BlockerRule,
) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );
  controller.getSelectionBlocks.mockReturnValue(
    blockTypes.map((blockType, index) => ({
      blockId: `b${index}`,
      blockType,
    })),
  );
  controller.getDictionary.mockReturnValue(dictionary);
  controller.getBlockTypesBlocker.mockImplementation(
    (_blockIds: string[], descriptor: SetBlockTypeDescriptor) =>
      rule(descriptor),
  );
  return controller;
};

const blockTypeName = (
  dictionary: Dictionary,
  id: keyof Dictionary["blockType"],
): string => dictionary.blockType[id].label;

const openMenu = (dictionary: Dictionary) => {
  fireEvent.click(
    screen.getByRole("button", {
      name: dictionary.toolbar.static.blockTypeAriaLabel,
    }),
    { detail: 1 },
  );
  return screen.getByRole("listbox", {
    name: dictionary.toolbar.static.blockTypeAriaLabel,
  });
};

describe.each(DICTIONARIES)(
  "StaticToolbar 자식 있는 블록의 Code 버튼 (%s)",
  (_name, dictionary) => {
    const childrenRule: BlockerRule = (descriptor) =>
      descriptor.type === "codeBlock" ? "HAS_CHILDREN" : null;

    it("Code 버튼이 비활성이고 자식 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "paragraph" }, dictionary, childrenRule),
          <StaticToolbar />,
        ),
      );

      const code = screen.getByRole("button", {
        name: blockTypeName(dictionary, "code"),
      });
      expect(code.getAttribute("aria-disabled")).toBe("true");
      expect(code.getAttribute("title")).toBe(
        dictionary.toolbar.static.blockTypeDisabledByChildrenReason,
      );
    });

    it("다른 변환 버튼은 활성이다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "paragraph" }, dictionary, childrenRule),
          <StaticToolbar />,
        ),
      );

      const quote = screen.getByRole("button", {
        name: blockTypeName(dictionary, "quote"),
      });
      expect(quote.getAttribute("aria-disabled")).toBe("false");
    });

    it("비활성 Code 버튼을 눌러도 setBlockType을 호출하지 않는다", () => {
      const controller = controllerInBlock(
        { type: "paragraph" },
        dictionary,
        childrenRule,
      );
      render(withProvider(controller, <StaticToolbar />));

      fireEvent.click(
        screen.getByRole("button", { name: blockTypeName(dictionary, "code") }),
      );

      expect(controller.commands.setBlockType).not.toHaveBeenCalled();
    });

    it("현재 블록과 옵션별 descriptor로 core에 질의한다", () => {
      const controller = controllerInBlock(
        { type: "paragraph" },
        dictionary,
        childrenRule,
      );
      render(withProvider(controller, <StaticToolbar />));

      expect(controller.getBlockTypeBlocker).toHaveBeenCalledWith("block-1", {
        type: "codeBlock",
      });
      expect(controller.getBlockTypeBlocker).toHaveBeenCalledWith("block-1", {
        type: "quote",
      });
    });
  },
);

describe.each(DICTIONARIES)(
  "StaticToolbar 탭이 든 codeBlock의 변환 버튼과 메뉴 (%s)",
  (_name, dictionary) => {
    const invalidTextRule: BlockerRule = (descriptor) =>
      descriptor.type === "codeBlock" ? null : "INVALID_TEXT";

    it("Quote·Callout 버튼이 비활성이고 무효 문자 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "codeBlock" }, dictionary, invalidTextRule),
          <StaticToolbar />,
        ),
      );

      for (const id of ["quote", "callout"] as const) {
        const control = screen.getByRole("button", {
          name: blockTypeName(dictionary, id),
        });
        expect(control.getAttribute("aria-disabled"), id).toBe("true");
        expect(control.getAttribute("title"), id).toBe(
          dictionary.toolbar.static.blockTypeDisabledByInvalidTextReason,
        );
      }
    });

    it("현재 타입인 Code 버튼은 활성이다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "codeBlock" }, dictionary, invalidTextRule),
          <StaticToolbar />,
        ),
      );

      const code = screen.getByRole("button", {
        name: blockTypeName(dictionary, "code"),
      });
      expect(code.getAttribute("aria-disabled")).toBe("false");
    });

    it("블록 타입 메뉴의 Text·Heading 옵션이 비활성이고 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "codeBlock" }, dictionary, invalidTextRule),
          <StaticToolbar />,
        ),
      );

      const menu = openMenu(dictionary);

      for (const option of within(menu).getAllByRole("option")) {
        expect(option.getAttribute("aria-disabled"), option.textContent).toBe(
          "true",
        );
        expect(option.getAttribute("title"), option.textContent).toBe(
          dictionary.toolbar.static.blockTypeDisabledByInvalidTextReason,
        );
      }
    });

    it("비활성 메뉴 옵션을 눌러도 명령을 호출하지 않고 메뉴를 닫지 않는다", () => {
      const controller = controllerInBlock(
        { type: "codeBlock" },
        dictionary,
        invalidTextRule,
      );
      render(withProvider(controller, <StaticToolbar />));
      const menu = openMenu(dictionary);

      fireEvent.click(
        within(menu).getByRole("option", {
          name: blockTypeName(dictionary, "heading-1"),
        }),
      );

      expect(controller.commands.setBlockType).not.toHaveBeenCalled();
      expect(
        screen.getByRole("listbox", {
          name: dictionary.toolbar.static.blockTypeAriaLabel,
        }),
      ).toBeTruthy();
    });
  },
);

describe.each(DICTIONARIES)(
  "StaticToolbar codeBlock만 여러 개 선택한 변환 버튼 (%s)",
  (_name, dictionary) => {
    const allCodeRule: BlockerRule = () => "ALL_CODE_BLOCK";

    it("Quote·Bulleted List 버튼이 비활성이고 일반 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerWithMultiSelection(
            [{ type: "codeBlock" }, { type: "codeBlock" }],
            dictionary,
            allCodeRule,
          ),
          <StaticToolbar />,
        ),
      );

      for (const id of ["quote", "bullet-list"] as const) {
        const control = screen.getByRole("button", {
          name: blockTypeName(dictionary, id),
        });
        expect(control.getAttribute("aria-disabled"), id).toBe("true");
        expect(control.getAttribute("title"), id).toBe(
          dictionary.toolbar.static.blockTypeDisabledReason,
        );
      }
    });

    it("비활성 버튼을 눌러도 setBlockTypes를 호출하지 않는다", () => {
      const controller = controllerWithMultiSelection(
        [{ type: "codeBlock" }, { type: "codeBlock" }],
        dictionary,
        allCodeRule,
      );
      render(withProvider(controller, <StaticToolbar />));

      fireEvent.click(
        screen.getByRole("button", {
          name: blockTypeName(dictionary, "quote"),
        }),
      );

      expect(controller.commands.setBlockTypes).not.toHaveBeenCalled();
    });

    it("선택한 블록 id 전체와 옵션 descriptor로 core에 질의한다", () => {
      const controller = controllerWithMultiSelection(
        [{ type: "codeBlock" }, { type: "codeBlock" }],
        dictionary,
        allCodeRule,
      );
      render(withProvider(controller, <StaticToolbar />));

      expect(controller.getBlockTypesBlocker).toHaveBeenCalledWith(
        ["b0", "b1"],
        { type: "quote" },
      );
    });

    it("codeBlock이 섞인 선택은 막지 않으면 활성이다", () => {
      render(
        withProvider(
          controllerWithMultiSelection(
            [{ type: "codeBlock" }, { type: "paragraph" }],
            dictionary,
            () => null,
          ),
          <StaticToolbar />,
        ),
      );

      const quote = screen.getByRole("button", {
        name: blockTypeName(dictionary, "quote"),
      });
      expect(quote.getAttribute("aria-disabled")).toBe("false");
    });
  },
);

describe("StaticToolbar 변환 사유 문구", () => {
  it("en·ko 새 키가 비어 있지 않고 서로 다른 번역이다", () => {
    for (const key of [
      "blockTypeDisabledByChildrenReason",
      "blockTypeDisabledByInvalidTextReason",
    ] as const) {
      expect(
        DEFAULT_DICTIONARY.toolbar.static[key].length,
        key,
      ).toBeGreaterThan(0);
      expect(KO_DICTIONARY.toolbar.static[key].length, key).toBeGreaterThan(0);
      expect(KO_DICTIONARY.toolbar.static[key], key).not.toBe(
        DEFAULT_DICTIONARY.toolbar.static[key],
      );
    }
  });
});
