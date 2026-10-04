/**
 * 블록 타입 변환 가능 질의 계약 — `getBlockTypeBlocker`·`getBlockTypesBlocker`가
 * `commands.setBlockType`·`commands.setBlockTypes`의 구조적 거절 조건과 같은
 * 판정을 돌려준다(Issue #245). UI가 변환 버튼의 활성 여부를 이 질의로 정한다.
 * 같은 타입으로의 변환(no-op)은 사유가 아니다. UI가 aria-pressed로 따로 표시한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { SetBlockTypeDescriptor } from "../src/block-type-descriptor.js";
import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import { mountTiptapEditor } from "./editor-controller-support.js";
import {
  codeBlockBlock as codeBlock,
  documentOf,
  listItemBlock as list,
  mounted,
  paragraphBlock as paragraph,
} from "./list-item-block-type-support.js";

/** 텍스트가 없는 divider 블록을 만든다. */
const divider = (id: string): Block => ({ id, type: "divider" });

/** 사유 판정과 parity 테스트가 공유하는 문서. 자식·탭·빈 codeBlock과 divider를 담는다. */
const fixtureDocument = () =>
  documentOf(
    paragraph("plain", "plain"),
    paragraph("parent", "parent", [paragraph("kid", "kid")]),
    list("bullet", "bulletListItem", "bullet"),
    list("toggle", "toggleListItem", "toggle"),
    list("toggle-parent", "toggleListItem", "toggle", {
      children: [paragraph("toggle-kid", "kid")],
    }),
    codeBlock("code", "return 1;"),
    codeBlock("code-tab", "if (x) {\n\treturn 1;\n}"),
    codeBlock("code-empty", ""),
    divider("divider"),
  );

/** parity 테스트가 모든 소스 블록에 대해 질의하는 변환 대상 목록이다. */
const TARGETS: readonly SetBlockTypeDescriptor[] = [
  { type: "paragraph" },
  { type: "heading", level: 1 },
  { type: "quote" },
  { type: "callout" },
  { type: "codeBlock" },
  { type: "bulletListItem" },
  { type: "numberedListItem" },
  { type: "checkListItem" },
  { type: "toggleListItem" },
];

describe("getBlockTypeBlocker 사유", () => {
  it("자식이 있는 블록을 Code로 바꾸면 HAS_CHILDREN이다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypeBlocker("parent", { type: "codeBlock" })).toBe(
      "HAS_CHILDREN",
    );
  });

  it("자식이 있는 블록의 다른 변환은 막지 않는다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypeBlocker("parent", { type: "quote" })).toBeNull();
    expect(
      editor.getBlockTypeBlocker("parent", { type: "heading", level: 2 }),
    ).toBeNull();
  });

  it("자식이 없는 블록의 Code 변환은 막지 않는다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(
      editor.getBlockTypeBlocker("plain", { type: "codeBlock" }),
    ).toBeNull();
  });

  it("탭이 든 codeBlock을 일반 블록으로 바꾸면 INVALID_TEXT다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypeBlocker("code-tab", { type: "quote" })).toBe(
      "INVALID_TEXT",
    );
    expect(editor.getBlockTypeBlocker("code-tab", { type: "paragraph" })).toBe(
      "INVALID_TEXT",
    );
    expect(
      editor.getBlockTypeBlocker("code-tab", { type: "heading", level: 1 }),
    ).toBe("INVALID_TEXT");
  });

  it("clearContent이면 탭이 든 codeBlock도 막지 않는다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(
      editor.getBlockTypeBlocker(
        "code-tab",
        { type: "quote" },
        { clearContent: true },
      ),
    ).toBeNull();
  });

  it("탭이 없는 codeBlock은 일반 블록 변환을 막지 않는다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypeBlocker("code", { type: "quote" })).toBeNull();
    expect(
      editor.getBlockTypeBlocker("code-empty", { type: "paragraph" }),
    ).toBeNull();
  });

  it("codeBlock과 목록류 사이 변환은 LIST_CODE_MISMATCH다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypeBlocker("code", { type: "bulletListItem" })).toBe(
      "LIST_CODE_MISMATCH",
    );
    expect(editor.getBlockTypeBlocker("bullet", { type: "codeBlock" })).toBe(
      "LIST_CODE_MISMATCH",
    );
    expect(editor.getBlockTypeBlocker("toggle", { type: "codeBlock" })).toBe(
      "LIST_CODE_MISMATCH",
    );
  });

  it("없는 blockId는 NOT_FOUND다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypeBlocker("missing", { type: "quote" })).toBe(
      "NOT_FOUND",
    );
  });

  it("등록된 CustomBlock은 질의가 NOT_FOUND이고 명령이 BLOCK_NOT_FOUND로 거절한다", () => {
    const editor = createEditor({
      initialDocument: {
        ...documentOf(paragraph("plain", "plain")),
        blocks: [
          paragraph("plain", "plain"),
          { id: "widget", type: "myWidget", content: "none" },
        ],
      },
      customBlocks: {
        myWidget: {
          render: () => ({ element: document.createElement("div") }),
        },
      },
    });
    mountTiptapEditor(editor);
    expect(editor.getBlockTypeBlocker("widget", { type: "quote" })).toBe(
      "NOT_FOUND",
    );
    expect(editor.commands.setBlockType("widget", { type: "quote" })).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "widget" },
    });
  });

  it("텍스트 없는 블록은 NOT_APPLICABLE이다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypeBlocker("divider", { type: "quote" })).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("같은 타입으로의 변환은 사유가 아니다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(
      editor.getBlockTypeBlocker("plain", { type: "paragraph" }),
    ).toBeNull();
    expect(
      editor.getBlockTypeBlocker("code", { type: "codeBlock" }),
    ).toBeNull();
  });

  it("파괴된 편집기는 NOT_APPLICABLE이다", () => {
    const { editor } = mounted(fixtureDocument());
    editor.destroy();
    expect(editor.getBlockTypeBlocker("plain", { type: "quote" })).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("탭을 입력해 무효가 된 codeBlock을 다음 질의에서 바로 반영한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(codeBlock("code", "ab"), paragraph("tail", "tail")),
    );
    expect(editor.getBlockTypeBlocker("code", { type: "quote" })).toBeNull();
    tiptap.view.dispatch(
      tiptap.state.tr.insertText("\t", contentTextStart(tiptap, "code") + 1),
    );
    expect(editor.getBlockTypeBlocker("code", { type: "quote" })).toBe(
      "INVALID_TEXT",
    );
  });
});

describe("getBlockTypesBlocker 사유", () => {
  it("codeBlock만 선택하면 ALL_CODE_BLOCK이다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(
      editor.getBlockTypesBlocker(["code", "code-tab"], { type: "quote" }),
    ).toBe("ALL_CODE_BLOCK");
    expect(
      editor.getBlockTypesBlocker(["code", "code-empty"], {
        type: "bulletListItem",
      }),
    ).toBe("ALL_CODE_BLOCK");
  });

  it("codeBlock이 섞이면 막지 않는다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(
      editor.getBlockTypesBlocker(["code", "plain"], { type: "quote" }),
    ).toBeNull();
  });

  it("Code 대상은 NOT_APPLICABLE이다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(
      editor.getBlockTypesBlocker(["plain", "bullet"], { type: "codeBlock" }),
    ).toBe("NOT_APPLICABLE");
  });

  it("빈 목록은 NOT_APPLICABLE, 없는 id는 NOT_FOUND다", () => {
    const { editor } = mounted(fixtureDocument());
    expect(editor.getBlockTypesBlocker([], { type: "quote" })).toBe(
      "NOT_APPLICABLE",
    );
    expect(
      editor.getBlockTypesBlocker(["plain", "missing"], { type: "quote" }),
    ).toBe("NOT_FOUND");
  });
});

/** 블록이 이미 target과 같은 타입(heading은 level까지)인지 판정한다. */
const isSameType = (block: Block, target: SetBlockTypeDescriptor): boolean => {
  if (block.type !== target.type) return false;
  if (block.type === "heading" && target.type === "heading") {
    return block.level === target.level;
  }
  return true;
};

describe("질의와 명령의 parity", () => {
  const sourceIds = [
    "plain",
    "parent",
    "bullet",
    "toggle",
    "toggle-parent",
    "code",
    "code-tab",
    "code-empty",
    "divider",
  ];

  for (const clearContent of [false, true]) {
    for (const sourceId of sourceIds) {
      for (const target of TARGETS) {
        const label = `${sourceId} → ${JSON.stringify(target)} clearContent=${clearContent}`;
        it(`setBlockType: ${label}`, () => {
          const { editor } = mounted(fixtureDocument());
          const blocker = editor.getBlockTypeBlocker(sourceId, target, {
            clearContent,
          });
          const before = editor.getBlock(sourceId);
          const result = editor.commands.setBlockType(
            sourceId,
            target,
            clearContent ? { clearContent } : undefined,
          );
          if (blocker !== null) {
            expect(result.ok).toBe(false);
            return;
          }
          if (result.ok) return;
          // 사유 없이 거절되는 경우는 같은 타입 no-op뿐이다.
          expect(before).toBeDefined();
          expect(isSameType(before as Block, target)).toBe(true);
        });
      }
    }
  }

  const multiSelections: readonly (readonly string[])[] = [
    ["plain", "parent"],
    ["code", "code-tab"],
    ["code", "plain"],
    ["code-tab", "bullet", "toggle"],
    ["plain", "divider"],
    ["divider"],
    [],
    ["plain", "missing"],
  ];
  for (const ids of multiSelections) {
    for (const target of TARGETS) {
      const label = `[${ids.join(",")}] → ${JSON.stringify(target)}`;
      it(`setBlockTypes: ${label}`, () => {
        const { editor } = mounted(fixtureDocument());
        const blocker = editor.getBlockTypesBlocker(ids, target);
        const result = editor.commands.setBlockTypes(ids, target);
        if (blocker !== null) {
          expect(result.ok).toBe(false);
          return;
        }
        if (result.ok) return;
        // 사유 없이 거절되는 경우는 변환 대상이 전부 이미 같은 타입일 때뿐이다.
        const convertibles = ids
          .map((id) => editor.getBlock(id))
          .filter(
            (block): block is Block =>
              block !== undefined &&
              block.type !== "codeBlock" &&
              block.type !== "divider",
          );
        expect(convertibles.length).toBeGreaterThan(0);
        expect(convertibles.every((block) => isSameType(block, target))).toBe(
          true,
        );
      });
    }
  }
});
