/**
 * enabledBlockTypes가 막은 타입을 범용 블록 조작 API(spec §3.2, DOC-005)에 넘기는
 * 입력이 예외 없이 EDITOR_FEATURE_UNAVAILABLE로 거절되는 계약을 고정한다
 * (Issue #329). 예전에는 insertBlocks·replaceBlocks가 `RangeError: Unknown node
 * type`을 던졌다.
 *
 * 다루는 축은 insertBlocks·replaceBlocks의 최상위·중첩 자식 거절, allow 모드,
 * updateBlock의 children 거절과 타입 변경 거절 코드, 거절 메시지 형식,
 * 대조군(미지정 설정, 허용 타입, removeBlocks·moveBlocksUp/Down)이다. 거절은 문서와
 * undo 스택을 바꾸지 않는다.
 */
import type { Block } from "@cp949/geul-model";
import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";

import {
  type CreateEditorOptions,
  createEditor,
  type PartialBlock,
} from "../src/index.js";
import {
  documentOf,
  headingBlock,
  mountTiptapEditor,
  paragraphBlock,
  quoteBlock,
  sequentialIds,
} from "./editor-controller-support.js";

type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;

const DENY_QUOTE: EnabledBlockTypes = { mode: "deny", types: ["quote"] };
const ALLOW_PARAGRAPH: EnabledBlockTypes = {
  mode: "allow",
  types: ["paragraph"],
};

// 기준 문서: 문단 b1 하나. 필요한 테스트만 두 번째 문단 b2를 더한다.
const setup = (
  enabledBlockTypes: EnabledBlockTypes | undefined,
  blocks: Block[] = [paragraphBlock("b1", "one")],
) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("new"),
    ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
  });
  const { tiptap } = mountTiptapEditor(editor);
  return { editor, tiptap };
};

const typesOf = (editor: ReturnType<typeof setup>["editor"]) =>
  editor.getDocument().blocks.map((block) => block.type);

const QUOTE_PARTIAL: PartialBlock = {
  type: "quote",
  content: [{ text: "q" }],
};

const DISABLED_MESSAGE_PATTERN =
  /^Block \S+ has type "quote" disabled via CreateEditorOptions\.enabledBlockTypes$/;

// 거절이 예외 없이 EDITOR_FEATURE_UNAVAILABLE를 돌려주고 문서·undo 스택을
// 바꾸지 않는지 한 번에 확인한다.
const expectRejectedWithoutChange = (
  run: (editor: ReturnType<typeof setup>["editor"]) => unknown,
  enabledBlockTypes: EnabledBlockTypes = DENY_QUOTE,
) => {
  const { editor, tiptap } = setup(enabledBlockTypes);
  const before = editor.getDocument();
  const undoBefore = undoDepth(tiptap.state);

  const result = run(editor);

  expect(result).toMatchObject({
    ok: false,
    error: { code: "EDITOR_FEATURE_UNAVAILABLE" },
  });
  expect(editor.getDocument()).toEqual(before);
  expect(undoDepth(tiptap.state)).toBe(undoBefore);
  return result;
};

describe("막은 타입을 범용 블록 조작 API에 넘기면 거절한다(Issue #329)", () => {
  describe("insertBlocks", () => {
    it("최상위 quote 삽입은 EDITOR_FEATURE_UNAVAILABLE이다", () => {
      expectRejectedWithoutChange((editor) =>
        editor.insertBlocks([QUOTE_PARTIAL], "b1"),
      );
    });

    it("placement after도 같다", () => {
      expectRejectedWithoutChange((editor) =>
        editor.insertBlocks([QUOTE_PARTIAL], "b1", "after"),
      );
    });

    it("허용 타입 아래 중첩 자식의 quote도 거절한다", () => {
      expectRejectedWithoutChange((editor) =>
        editor.insertBlocks(
          [
            {
              type: "paragraph",
              content: [{ text: "p" }],
              children: [quoteBlock("q1", "q")],
            },
          ],
          "b1",
        ),
      );
    });

    it("allow:[paragraph]에서 heading 삽입을 거절한다", () => {
      expectRejectedWithoutChange(
        (editor) =>
          editor.insertBlocks(
            [{ type: "heading", level: 1, content: [{ text: "h" }] }],
            "b1",
          ),
        ALLOW_PARAGRAPH,
      );
    });

    it("허용 타입과 막은 타입이 섞이면 전부 거절한다", () => {
      expectRejectedWithoutChange((editor) =>
        editor.insertBlocks(
          [{ type: "paragraph", content: [{ text: "ok" }] }, QUOTE_PARTIAL],
          "b1",
        ),
      );
    });
  });

  describe("replaceBlocks", () => {
    it("최상위 quote 교체는 EDITOR_FEATURE_UNAVAILABLE이다", () => {
      expectRejectedWithoutChange((editor) =>
        editor.replaceBlocks(["b1"], [QUOTE_PARTIAL]),
      );
    });

    it("중첩 자식의 quote도 거절한다", () => {
      expectRejectedWithoutChange((editor) =>
        editor.replaceBlocks(
          ["b1"],
          [
            {
              type: "paragraph",
              content: [{ text: "p" }],
              children: [quoteBlock("q1", "q")],
            },
          ],
        ),
      );
    });

    it("allow:[paragraph]에서 heading 교체를 거절한다", () => {
      expectRejectedWithoutChange(
        (editor) =>
          editor.replaceBlocks(
            ["b1"],
            [{ type: "heading", level: 1, content: [{ text: "h" }] }],
          ),
        ALLOW_PARAGRAPH,
      );
    });
  });

  describe("updateBlock", () => {
    it("children에 quote를 넣으면 EDITOR_FEATURE_UNAVAILABLE이다", () => {
      expectRejectedWithoutChange((editor) =>
        editor.updateBlock("b1", {
          type: "paragraph",
          children: [quoteBlock("q1", "q")],
        }),
      );
    });

    it("타입 변경은 기존대로 COMMAND_NOT_APPLICABLE이다", () => {
      const { editor, tiptap } = setup(DENY_QUOTE);
      const before = editor.getDocument();
      const undoBefore = undoDepth(tiptap.state);

      const result = editor.updateBlock("b1", QUOTE_PARTIAL);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE" },
      });
      expect(editor.getDocument()).toEqual(before);
      expect(undoDepth(tiptap.state)).toBe(undoBefore);
    });
  });

  describe("거절 메시지", () => {
    it("insertBlocks·replaceBlocks가 modelToTiptap 거절과 같은 형식이다", () => {
      const inserted = expectRejectedWithoutChange((editor) =>
        editor.insertBlocks([QUOTE_PARTIAL], "b1"),
      );
      const replaced = expectRejectedWithoutChange((editor) =>
        editor.replaceBlocks(["b1"], [QUOTE_PARTIAL]),
      );

      for (const result of [inserted, replaced]) {
        expect(
          (result as { error: { message: string } }).error.message,
        ).toMatch(DISABLED_MESSAGE_PATTERN);
      }
    });

    it("replaceDocument의 거절 메시지와 같은 형식이다", () => {
      const { editor } = setup(DENY_QUOTE);

      const result = editor.replaceDocument(documentOf(quoteBlock("q1", "q")));

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "EDITOR_FEATURE_UNAVAILABLE",
          message:
            'Block q1 has type "quote" disabled via CreateEditorOptions.enabledBlockTypes',
        },
      });
    });

    it("insertBlocks는 막은 블록의 id와 타입을 메시지에 담는다", () => {
      const result = expectRejectedWithoutChange((editor) =>
        editor.insertBlocks([{ ...QUOTE_PARTIAL, id: "mine" }], "b1"),
      );

      expect(result).toMatchObject({
        error: {
          message:
            'Block mine has type "quote" disabled via CreateEditorOptions.enabledBlockTypes',
        },
      });
    });
  });

  describe("대조군", () => {
    it("enabledBlockTypes 미지정이면 quote 삽입이 성공한다", () => {
      const { editor } = setup(undefined);

      const result = editor.insertBlocks([QUOTE_PARTIAL], "b1");

      expect(result.ok).toBe(true);
      expect(typesOf(editor)).toEqual(["quote", "paragraph"]);
    });

    it("enabledBlockTypes 미지정이면 quote 교체가 성공한다", () => {
      const { editor } = setup(undefined);

      const result = editor.replaceBlocks(["b1"], [QUOTE_PARTIAL]);

      expect(result.ok).toBe(true);
      expect(typesOf(editor).slice(0, 1)).toEqual(["quote"]);
    });

    it("deny:[quote]에서 paragraph·heading 삽입은 성공한다", () => {
      const { editor } = setup(DENY_QUOTE);

      const result = editor.insertBlocks(
        [
          { type: "paragraph", content: [{ text: "p" }] },
          { type: "heading", level: 2, content: [{ text: "h" }] },
        ],
        "b1",
        "after",
      );

      expect(result.ok).toBe(true);
      expect(typesOf(editor).slice(0, 3)).toEqual([
        "paragraph",
        "paragraph",
        "heading",
      ]);
    });

    it("deny:[quote]에서 paragraph·heading 교체는 성공한다", () => {
      const { editor } = setup(DENY_QUOTE);

      const result = editor.replaceBlocks(
        ["b1"],
        [
          { type: "paragraph", content: [{ text: "p" }] },
          { type: "heading", level: 2, content: [{ text: "h" }] },
        ],
      );

      expect(result.ok).toBe(true);
      expect(typesOf(editor).slice(0, 2)).toEqual(["paragraph", "heading"]);
    });

    it("deny:[quote]에서 허용 타입 children 갱신은 성공한다", () => {
      const { editor } = setup(DENY_QUOTE);

      const result = editor.updateBlock("b1", {
        type: "paragraph",
        children: [paragraphBlock("c1", "child")],
      });

      expect(result.ok).toBe(true);
    });

    it("removeBlocks와 moveBlocksUp·Down은 막은 타입 설정에서도 이전과 같다", () => {
      const { editor } = setup(DENY_QUOTE, [
        paragraphBlock("b1", "one"),
        headingBlock("b2", 1, "two"),
        paragraphBlock("b3", "three"),
      ]);
      const ids = () => editor.getDocument().blocks.map((b) => b.id);

      expect(editor.moveBlocksDown(["b1"])).toEqual({
        ok: true,
        value: undefined,
      });
      expect(ids()).toEqual(["b2", "b1", "b3"]);

      expect(editor.moveBlocksUp(["b1"])).toEqual({
        ok: true,
        value: undefined,
      });
      expect(ids()).toEqual(["b1", "b2", "b3"]);

      expect(editor.removeBlocks(["b2"]).ok).toBe(true);
      expect(ids()).toEqual(["b1", "b3"]);
    });
  });
});
