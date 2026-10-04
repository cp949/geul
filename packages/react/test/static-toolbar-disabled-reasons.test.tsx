// @vitest-environment jsdom

/**
 * StaticToolbar 비활성 컨트롤의 사유 title을 확인한다(Issue #220, G-UI-004).
 * - codeBlock·atom 블록(구분선·미디어·customBlock)·표 셀 범위 선택에서
 *   mark 5개·색상 2개는 같은
 *   사유(`markingDisabledReason`)를 title로 가진다.
 * - 현재 블록이 변환을 허용하지 않는 블록 타입 아이콘 버튼은
 *   `blockTypeDisabledReason`을 title로 가진다.
 * - 블록 타입 아이콘 버튼 title 우선순위: 대상 블록 없음 > 타입 불허 > 활성.
 * - 활성 컨트롤의 title은 기존 label 그대로다.
 * en·ko dictionary 둘 다 확인한다. 사유 문구는 dictionary 값을 참조한다.
 */
import { DEFAULT_DICTIONARY, KO_DICTIONARY } from "@cp949/geul-core";
import type { BlockTypeDescriptor, Dictionary } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

afterEach(cleanup);

const DICTIONARIES: ReadonlyArray<readonly [string, Dictionary]> = [
  ["en", DEFAULT_DICTIONARY],
  ["ko", KO_DICTIONARY],
];

// mark 버튼 label은 dictionary가 아니라 컴포넌트 리터럴이다.
const MARK_NAMES = [
  "Bold",
  "Italic",
  "Underline",
  "Strikethrough",
  "Inline code",
] as const;

/** mark 5개와 색상 2개 버튼의 accessible name을 돌려준다. */
const markingControlNames = (dictionary: Dictionary): string[] => [
  ...MARK_NAMES,
  dictionary.color.textLabel,
  dictionary.color.backgroundLabel,
];

/** 블록 타입 아이콘 버튼의 accessible name을 dictionary에서 읽는다. */
const blockTypeName = (
  dictionary: Dictionary,
  id: keyof Dictionary["blockType"],
): string => dictionary.blockType[id].label;

const ICON_BUTTON_IDS = [
  "quote",
  "callout",
  "code",
  "bullet-list",
  "numbered-list",
  "check-list",
  "toggle-list",
] as const;

/** 지정한 블록 타입에 캐럿이 있는 controller를 만든다. */
const controllerInBlock = (
  blockType: BlockTypeDescriptor,
  dictionary: Dictionary,
) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => ({ blockId: "block-1", blockType })),
  );
  controller.getDictionary.mockReturnValue(dictionary);
  return controller;
};

/** 미디어 블록이 선택된(`blockSelection === null`) controller를 만든다. */
const controllerWithMedia = (dictionary: Dictionary) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );
  controller.getSelectionMediaBlock.mockReturnValue({
    blockId: "media-1",
    kind: "image",
    url: "https://example.com/a.png",
    name: null,
    caption: null,
    showPreview: null,
    textAlignment: null,
  });
  controller.getDictionary.mockReturnValue(dictionary);
  return controller;
};

/**
 * 구분선·customBlock 같은 atom 블록이 선택된 controller를 만든다.
 * `getSelectionMediaBlock()`은 null이고 `blockSelection`도 null이다(Issue #242).
 */
const controllerWithAtomBlock = (dictionary: Dictionary) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );
  controller.isAtomBlockSelected.mockReturnValue(true);
  controller.getDictionary.mockReturnValue(dictionary);
  return controller;
};

/** 표 셀 범위가 선택된 controller를 만든다. */
const controllerWithCellRange = (dictionary: Dictionary) => {
  const controller = fakeStaticToolbarController();
  controller.isCellRangeSelected.mockReturnValue(true);
  controller.getDictionary.mockReturnValue(dictionary);
  return controller;
};

/**
 * paragraph·codeBlock·paragraph에 걸친 범위 선택 controller를 만든다.
 * 단일 블록 선택은 없고(`blockSelection === null`) codeBlock 문자를 교차한다.
 */
const controllerWithMultiBlockCodeBlock = (dictionary: Dictionary) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );
  controller.getSelectionBlocks.mockReturnValue([
    { blockId: "a", blockType: { type: "paragraph" } },
    { blockId: "b", blockType: { type: "codeBlock" } },
    { blockId: "c", blockType: { type: "paragraph" } },
  ]);
  controller.selectionIntersectsCodeBlock.mockReturnValue(true);
  controller.getDictionary.mockReturnValue(dictionary);
  return controller;
};

/** 대상 블록이 없는 controller를 만든다. */
const controllerWithoutTarget = (dictionary: Dictionary) => {
  const controller = fakeStaticToolbarController(
    undefined,
    vi.fn(() => null),
  );
  controller.getDictionary.mockReturnValue(dictionary);
  return controller;
};

describe("StaticToolbar 사유 문구", () => {
  it("en·ko 두 키가 비어 있지 않고 서로 다른 번역이다", () => {
    for (const key of [
      "markingDisabledReason",
      "blockTypeDisabledReason",
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

describe.each(DICTIONARIES)(
  "StaticToolbar mark·색상 비활성 사유 title (%s)",
  (_name, dictionary) => {
    const expectMarkingDisabled = () => {
      for (const name of markingControlNames(dictionary)) {
        const control = screen.getByRole("button", { name });
        expect(control.getAttribute("aria-disabled"), name).toBe("true");
        expect(control.getAttribute("title"), name).toBe(
          dictionary.toolbar.static.markingDisabledReason,
        );
      }
    };

    it("codeBlock 선택에서 mark 5개·색상 2개가 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "codeBlock" }, dictionary),
          <StaticToolbar />,
        ),
      );

      expectMarkingDisabled();
    });

    it("codeBlock을 걸친 여러 블록 선택에서 mark 5개·색상 2개가 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerWithMultiBlockCodeBlock(dictionary),
          <StaticToolbar />,
        ),
      );

      expectMarkingDisabled();
    });

    it("미디어 블록 선택에서 mark 5개·색상 2개가 사유 title을 가진다", () => {
      render(withProvider(controllerWithMedia(dictionary), <StaticToolbar />));

      expectMarkingDisabled();
    });

    it("구분선 같은 atom 블록 선택에서 mark 5개·색상 2개가 사유 title을 가진다", () => {
      render(
        withProvider(controllerWithAtomBlock(dictionary), <StaticToolbar />),
      );

      expectMarkingDisabled();
    });

    it("atom 블록 선택에서 비활성 mark·색상 버튼을 눌러도 명령을 호출하지 않는다", () => {
      const controller = controllerWithAtomBlock(dictionary);
      render(withProvider(controller, <StaticToolbar />));

      for (const name of markingControlNames(dictionary)) {
        fireEvent.click(screen.getByRole("button", { name }));
      }

      expect(controller.commands.toggleBold).not.toHaveBeenCalled();
      expect(controller.commands.toggleCode).not.toHaveBeenCalled();
      expect(controller.commands.toggleCaretMark).not.toHaveBeenCalled();
      expect(controller.commands.toggleCaretTextColor).not.toHaveBeenCalled();
      expect(
        controller.commands.toggleCaretBackgroundColor,
      ).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("표 셀 범위 선택에서 mark 5개·색상 2개가 사유 title을 가진다", () => {
      render(
        withProvider(controllerWithCellRange(dictionary), <StaticToolbar />),
      );

      expectMarkingDisabled();
    });

    it("비활성 mark·색상 버튼을 눌러도 명령을 호출하지 않는다", () => {
      const controller = controllerInBlock({ type: "codeBlock" }, dictionary);
      render(withProvider(controller, <StaticToolbar />));

      for (const name of markingControlNames(dictionary)) {
        fireEvent.click(screen.getByRole("button", { name }));
      }

      expect(controller.commands.toggleBold).not.toHaveBeenCalled();
      expect(controller.commands.toggleCode).not.toHaveBeenCalled();
      expect(controller.commands.toggleCaretMark).not.toHaveBeenCalled();
      expect(controller.commands.toggleCaretTextColor).not.toHaveBeenCalled();
      expect(
        controller.commands.toggleCaretBackgroundColor,
      ).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("codeBlock을 걸친 여러 블록 선택에서 비활성 mark·색상 버튼을 눌러도 명령을 호출하지 않는다", () => {
      const controller = controllerWithMultiBlockCodeBlock(dictionary);
      render(withProvider(controller, <StaticToolbar />));

      for (const name of markingControlNames(dictionary)) {
        fireEvent.click(screen.getByRole("button", { name }));
      }

      expect(controller.commands.toggleBold).not.toHaveBeenCalled();
      expect(controller.commands.toggleCode).not.toHaveBeenCalled();
      expect(controller.commands.toggleCaretMark).not.toHaveBeenCalled();
      expect(controller.commands.toggleCaretTextColor).not.toHaveBeenCalled();
      expect(
        controller.commands.toggleCaretBackgroundColor,
      ).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("활성 상태의 mark·색상 버튼 title은 기존 label 그대로다", () => {
      const controller = fakeStaticToolbarController();
      controller.getDictionary.mockReturnValue(dictionary);
      render(withProvider(controller, <StaticToolbar />));

      for (const name of markingControlNames(dictionary)) {
        const control = screen.getByRole("button", { name });
        expect(control.getAttribute("aria-disabled"), name).toBe("false");
        expect(control.getAttribute("title"), name).toBe(name);
      }
    });
  },
);

describe.each(DICTIONARIES)(
  "StaticToolbar 블록 타입 아이콘 버튼 비활성 사유 title (%s)",
  (_name, dictionary) => {
    it("codeBlock 안에서 목록 4종이 타입 불허 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "codeBlock" }, dictionary),
          <StaticToolbar />,
        ),
      );

      for (const id of [
        "bullet-list",
        "numbered-list",
        "check-list",
        "toggle-list",
      ] as const) {
        const name = blockTypeName(dictionary, id);
        const control = screen.getByRole("button", { name });
        expect(control.getAttribute("aria-disabled"), name).toBe("true");
        expect(control.getAttribute("title"), name).toBe(
          dictionary.toolbar.static.blockTypeDisabledReason,
        );
      }
    });

    it("codeBlock 안에서도 변환 가능한 Quote·Callout·Code는 title이 기존 label이다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "codeBlock" }, dictionary),
          <StaticToolbar />,
        ),
      );

      for (const id of ["quote", "callout", "code"] as const) {
        const name = blockTypeName(dictionary, id);
        const control = screen.getByRole("button", { name });
        expect(control.getAttribute("aria-disabled"), name).toBe("false");
        expect(control.getAttribute("title"), name).toBe(name);
      }
    });

    it("목록 안에서 Code가 타입 불허 사유 title을 가진다", () => {
      render(
        withProvider(
          controllerInBlock({ type: "bulletListItem" }, dictionary),
          <StaticToolbar />,
        ),
      );

      const name = blockTypeName(dictionary, "code");
      const control = screen.getByRole("button", { name });
      expect(control.getAttribute("aria-disabled")).toBe("true");
      expect(control.getAttribute("title")).toBe(
        dictionary.toolbar.static.blockTypeDisabledReason,
      );
    });

    it("대상 블록이 없으면 타입 불허 사유보다 대상 블록 없음 사유가 우선한다", () => {
      render(
        withProvider(controllerWithoutTarget(dictionary), <StaticToolbar />),
      );

      for (const id of ICON_BUTTON_IDS) {
        const name = blockTypeName(dictionary, id);
        const title = screen
          .getByRole("button", { name })
          .getAttribute("title");
        expect(title, name).toBe(
          dictionary.toolbar.static.blockControlsDisabledReason,
        );
        expect(title, name).not.toBe(
          dictionary.toolbar.static.blockTypeDisabledReason,
        );
      }
    });

    it("활성 상태의 블록 타입 아이콘 버튼 title은 기존 label 그대로다", () => {
      const controller = fakeStaticToolbarController();
      controller.getDictionary.mockReturnValue(dictionary);
      render(withProvider(controller, <StaticToolbar />));

      for (const id of ICON_BUTTON_IDS) {
        const name = blockTypeName(dictionary, id);
        const control = screen.getByRole("button", { name });
        expect(control.getAttribute("aria-disabled"), name).toBe("false");
        expect(control.getAttribute("title"), name).toBe(name);
      }
    });

    it("타입 불허 버튼을 눌러도 setBlockType을 호출하지 않는다", () => {
      const controller = controllerInBlock({ type: "codeBlock" }, dictionary);
      render(withProvider(controller, <StaticToolbar />));

      fireEvent.click(
        screen.getByRole("button", {
          name: blockTypeName(dictionary, "bullet-list"),
        }),
      );

      expect(controller.commands.setBlockType).not.toHaveBeenCalled();
    });
  },
);
