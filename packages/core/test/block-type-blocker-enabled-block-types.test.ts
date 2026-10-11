/**
 * 블록 타입 변환 가능 질의가 enabledBlockTypes로 막은 타입 대상을 명령과 같이
 * 거절하는 계약을 고정한다(Issue #370). `getBlockTypeBlocker`·
 * `getBlockTypesBlocker`는 `commands.setBlockType`·`commands.setBlockTypes`의
 * 거절 조건과 같은 판정을 돌려줘야 한다. 예전에는 막은 타입 대상도 `null`을
 * 답해, UI가 변환 버튼을 켠 채 누르면 명령이 COMMAND_NOT_APPLICABLE로 실패했다.
 *
 * 다루는 축은 막은 타입 대상의 NOT_APPLICABLE(deny·allow 모드)과 명령 결과가
 * 그대로인 것, 막은 타입이 다른 구조적 사유(ALL_CODE_BLOCK·INVALID_TEXT·
 * HAS_CHILDREN)보다 우선하는 것, 대조군(허용 타입, 옵션 미지정, 없는 blockId,
 * 막은 타입과 없는 blockId 혼합)이다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { SetBlockTypeDescriptor } from "../src/block-type-descriptor.js";
import type { CreateEditorOptions } from "../src/index.js";
import {
  codeBlockBlock,
  documentOf,
  listItemBlock,
  mounted,
  notApplicable,
  paragraphBlock,
} from "./editor-controller-support.js";

type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;

// 재현 설정. 목록 항목만 남기고 변환 대상이 될 텍스트 타입을 막는다.
const DENY_TEXT_TYPES: EnabledBlockTypes = {
  mode: "deny",
  types: ["quote", "heading", "paragraph", "callout"],
};
// 글머리·번호 목록만 허용한다. 나머지 타입은 전부 막은 타입이다.
const ALLOW_LISTS: EnabledBlockTypes = {
  mode: "allow",
  types: ["bulletListItem", "numberedListItem"],
};

// 재현 문서: 글머리 목록 블록 둘. 막은 타입이 문서에 없어 로드가 거절되지 않는다.
const bulletBlocks = (): Block[] => [
  listItemBlock("a", "bulletListItem", "first"),
  listItemBlock("b", "bulletListItem", "second"),
];

// 문서와 막은 타입 설정을 받아 마운트한다. 옵션 미지정 대조군은 설정을 생략한다.
const setup = (enabledBlockTypes?: EnabledBlockTypes) =>
  mounted(
    documentOf(...bulletBlocks()),
    enabledBlockTypes === undefined ? {} : { enabledBlockTypes },
  );

// deny 모드에서 막은 변환 대상. 제목은 라벨을 쓴다.
const BLOCKED_TARGETS: readonly (readonly [string, SetBlockTypeDescriptor])[] =
  [
    ["quote", { type: "quote" }],
    ["heading", { type: "heading", level: 1 }],
    ["paragraph", { type: "paragraph" }],
    ["callout", { type: "callout" }],
  ];

describe("getBlockTypeBlocker 막은 타입 대상(Issue #370)", () => {
  it.each(BLOCKED_TARGETS)(
    "deny 모드에서 %s 대상은 NOT_APPLICABLE이다",
    (_label, target) => {
      const { editor } = setup(DENY_TEXT_TYPES);

      expect(editor.getBlockTypeBlocker("a", target)).toBe("NOT_APPLICABLE");
    },
  );

  it.each(BLOCKED_TARGETS)(
    "deny 모드에서 %s 대상 setBlockType은 COMMAND_NOT_APPLICABLE이다",
    (_label, target) => {
      const { editor } = setup(DENY_TEXT_TYPES);
      const before = editor.getDocument();

      expect(editor.commands.setBlockType("a", target)).toEqual(
        notApplicable("setBlockType"),
      );
      expect(editor.getDocument()).toEqual(before);
    },
  );

  it("clearContent를 줘도 막은 타입 대상은 NOT_APPLICABLE이다", () => {
    const { editor } = setup(DENY_TEXT_TYPES);

    expect(
      editor.getBlockTypeBlocker(
        "a",
        { type: "quote" },
        { clearContent: true },
      ),
    ).toBe("NOT_APPLICABLE");
  });

  it("allow 모드에서 목록에 없는 타입 대상은 NOT_APPLICABLE이다", () => {
    const { editor } = setup(ALLOW_LISTS);

    expect(editor.getBlockTypeBlocker("a", { type: "quote" })).toBe(
      "NOT_APPLICABLE",
    );
    expect(editor.getBlockTypeBlocker("a", { type: "checkListItem" })).toBe(
      "NOT_APPLICABLE",
    );
    expect(editor.commands.setBlockType("a", { type: "quote" })).toEqual(
      notApplicable("setBlockType"),
    );
  });

  it("막은 codeBlock 대상은 목록 현재 블록의 LIST_CODE_MISMATCH보다 우선해 NOT_APPLICABLE이다", () => {
    const { editor } = setup({ mode: "deny", types: ["codeBlock"] });

    expect(editor.getBlockTypeBlocker("a", { type: "codeBlock" })).toBe(
      "NOT_APPLICABLE",
    );
    expect(editor.commands.setBlockType("a", { type: "codeBlock" })).toEqual(
      notApplicable("setBlockType"),
    );
  });

  describe("다른 구조적 사유보다 우선", () => {
    it("자식이 있는 블록을 막은 codeBlock으로 바꾸려면 HAS_CHILDREN이 아니라 NOT_APPLICABLE이다", () => {
      const { editor } = mounted(
        documentOf(
          paragraphBlock("parent", "parent", [paragraphBlock("kid", "kid")]),
        ),
        { enabledBlockTypes: { mode: "deny", types: ["codeBlock"] } },
      );

      expect(editor.getBlockTypeBlocker("parent", { type: "codeBlock" })).toBe(
        "NOT_APPLICABLE",
      );
      expect(
        editor.commands.setBlockType("parent", { type: "codeBlock" }),
      ).toEqual(notApplicable("setBlockType"));
    });

    it("탭이 든 codeBlock을 막은 타입으로 바꾸려면 INVALID_TEXT가 아니라 NOT_APPLICABLE이다", () => {
      const { editor } = mounted(
        documentOf(codeBlockBlock("code-tab", "if (x) {\n\treturn 1;\n}")),
        { enabledBlockTypes: { mode: "deny", types: ["quote"] } },
      );

      expect(editor.getBlockTypeBlocker("code-tab", { type: "quote" })).toBe(
        "NOT_APPLICABLE",
      );
      expect(
        editor.commands.setBlockType("code-tab", { type: "quote" }),
      ).toEqual(notApplicable("setBlockType"));
    });

    it("codeBlock만 선택하고 막은 타입으로 바꾸려면 ALL_CODE_BLOCK이 아니라 NOT_APPLICABLE이다", () => {
      const { editor } = mounted(
        documentOf(codeBlockBlock("c1", "one"), codeBlockBlock("c2", "two")),
        { enabledBlockTypes: { mode: "deny", types: ["quote"] } },
      );

      expect(editor.getBlockTypesBlocker(["c1", "c2"], { type: "quote" })).toBe(
        "NOT_APPLICABLE",
      );
      expect(
        editor.commands.setBlockTypes(["c1", "c2"], { type: "quote" }),
      ).toEqual(notApplicable("setBlockType"));
    });
  });

  describe("대조군", () => {
    it("deny 모드에서 허용 타입 대상은 null이고 명령이 성공한다", () => {
      const { editor } = setup(DENY_TEXT_TYPES);

      expect(
        editor.getBlockTypeBlocker("a", { type: "numberedListItem" }),
      ).toBe(null);
      expect(editor.getBlockTypeBlocker("a", { type: "checkListItem" })).toBe(
        null,
      );
      expect(
        editor.commands.setBlockType("a", { type: "numberedListItem" }).ok,
      ).toBe(true);
    });

    it("allow 모드에서 목록에 있는 타입 대상은 null이다", () => {
      const { editor } = setup(ALLOW_LISTS);

      expect(
        editor.getBlockTypeBlocker("a", { type: "numberedListItem" }),
      ).toBe(null);
    });

    it("옵션 미지정이면 quote 대상도 null이고 명령이 성공한다", () => {
      const { editor } = setup();

      expect(editor.getBlockTypeBlocker("a", { type: "quote" })).toBeNull();
      expect(editor.commands.setBlockType("a", { type: "quote" }).ok).toBe(
        true,
      );
    });

    it("없는 blockId는 막은 타입 대상이어도 NOT_FOUND다", () => {
      const { editor } = setup(DENY_TEXT_TYPES);

      expect(editor.getBlockTypeBlocker("missing", { type: "quote" })).toBe(
        "NOT_FOUND",
      );
      expect(
        editor.commands.setBlockType("missing", { type: "quote" }),
      ).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
    });
  });
});

describe("getBlockTypesBlocker 막은 타입 대상(Issue #370)", () => {
  it.each(BLOCKED_TARGETS)(
    "deny 모드에서 %s 대상은 NOT_APPLICABLE이다",
    (_label, target) => {
      const { editor } = setup(DENY_TEXT_TYPES);

      expect(editor.getBlockTypesBlocker(["a", "b"], target)).toBe(
        "NOT_APPLICABLE",
      );
    },
  );

  it.each(BLOCKED_TARGETS)(
    "deny 모드에서 %s 대상 setBlockTypes는 COMMAND_NOT_APPLICABLE이다",
    (_label, target) => {
      const { editor } = setup(DENY_TEXT_TYPES);
      const before = editor.getDocument();

      expect(editor.commands.setBlockTypes(["a", "b"], target)).toEqual(
        notApplicable("setBlockType"),
      );
      expect(editor.getDocument()).toEqual(before);
    },
  );

  it("allow 모드에서 목록에 없는 타입 대상은 NOT_APPLICABLE이다", () => {
    const { editor } = setup(ALLOW_LISTS);

    expect(editor.getBlockTypesBlocker(["a", "b"], { type: "quote" })).toBe(
      "NOT_APPLICABLE",
    );
    expect(
      editor.commands.setBlockTypes(["a", "b"], { type: "quote" }),
    ).toEqual(notApplicable("setBlockType"));
  });

  describe("대조군", () => {
    it("deny 모드에서 허용 타입 대상은 null이고 명령이 성공한다", () => {
      const { editor } = setup(DENY_TEXT_TYPES);

      expect(
        editor.getBlockTypesBlocker(["a", "b"], { type: "numberedListItem" }),
      ).toBeNull();
      expect(
        editor.commands.setBlockTypes(["a", "b"], { type: "numberedListItem" })
          .ok,
      ).toBe(true);
    });

    it("allow 모드에서 목록에 있는 타입 대상은 null이다", () => {
      const { editor } = setup(ALLOW_LISTS);

      expect(
        editor.getBlockTypesBlocker(["a", "b"], { type: "numberedListItem" }),
      ).toBeNull();
    });

    it("옵션 미지정이면 quote 대상도 null이고 명령이 성공한다", () => {
      const { editor } = setup();

      expect(
        editor.getBlockTypesBlocker(["a", "b"], { type: "quote" }),
      ).toBeNull();
      expect(
        editor.commands.setBlockTypes(["a", "b"], { type: "quote" }).ok,
      ).toBe(true);
    });

    it("없는 blockId만 있으면 막은 타입 대상이어도 NOT_FOUND다", () => {
      const { editor } = setup(DENY_TEXT_TYPES);

      expect(editor.getBlockTypesBlocker(["missing"], { type: "quote" })).toBe(
        "NOT_FOUND",
      );
    });

    it("막은 타입 대상에 없는 blockId가 섞이면 순서와 무관하게 NOT_FOUND다", () => {
      const { editor } = setup(DENY_TEXT_TYPES);

      expect(
        editor.getBlockTypesBlocker(["a", "missing"], { type: "quote" }),
      ).toBe("NOT_FOUND");
      expect(
        editor.getBlockTypesBlocker(["missing", "a"], { type: "quote" }),
      ).toBe("NOT_FOUND");
      expect(
        editor.commands.setBlockTypes(["a", "missing"], { type: "quote" }),
      ).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
    });
  });
});
