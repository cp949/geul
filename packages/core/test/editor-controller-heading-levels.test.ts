/**
 * heading level 4-6이 에디터 코어 경로에서 level 1-3과 같은 계약을 받는지
 * 고정한다(spec §4.1) — setBlockType 적용·undo·동일 level 거절, caret·선택
 * 컨텍스트의 level 보고, HeadingExtension의 h4-h6 렌더(h1 폴백 없음)와
 * 에디터 자체 DOM <h4>-<h6> 파싱. BlockTypeDescriptor가 level 4-6 리터럴을
 * 수용하는지는 이 파일이 typecheck 대상에 편입되는 것으로 정적 고정된다.
 * 변환기의 level 1-6 왕복은 quote-divider-round-trip.test.ts가, 빈 heading
 * placeholder 문구는 placeholder-extension.test.ts가 소유한다.
 */
import { DOMParser as PmDOMParser } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  type BlockTypeDescriptor,
  type DocumentChangeEvent,
} from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  caretAt,
  documentOf,
  editorState,
  headingLevels456Document,
  liveSchema,
  mountTiptapEditor,
  sequentialIds,
} from "./editor-controller-support.js";

describe("setBlockType heading level 4-6", () => {
  it("문단을 level 4·5·6 heading으로 바꾸고 각각 undo 1회로 복원한다", () => {
    for (const level of [4, 5, 6] as const) {
      const changes: DocumentChangeEvent[] = [];
      // 변환 대상 뒤에 문단을 두어 trailing paragraph(UI-010) 삽입 없이
      // changedBlockIds가 변환 대상 하나로 고정되게 한다.
      const editor = createEditor({
        initialDocument: documentOf(
          { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
          { id: "block-2", type: "paragraph", content: [{ text: "next" }] },
        ),
        createId: sequentialIds("gen"),
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      const before = editorState(editor, tiptap);

      expect(
        editor.commands.setBlockType("block-1", { type: "heading", level }),
      ).toEqual({ ok: true, value: undefined });
      // 변환 전 콘텐츠 시작의 캐럿을 setBlockType 뒤에도 보존한다.
      // 문서·selection·storedMarks·Tiptap doc을 한 번에 고정한다.
      // tiptapDocument는 PM doc JSON 전체가 아니라 heading 노드의 attrs.level만
      // 부분 매칭(objectContaining)으로 확인한다 — 자기 자신과 비교하는 공허
      // 단언을 피한다.
      const { tiptapDocument, ...applied } = editorState(editor, tiptap);
      expect(applied).toEqual({
        document: {
          formatVersion: 1,
          revision: 1,
          blocks: [
            {
              id: "block-1",
              type: "heading",
              level,
              content: [{ text: "content" }],
            },
            { id: "block-2", type: "paragraph", content: [{ text: "next" }] },
          ],
        },
        selection: caretAt(tiptap, "block-1"),
        storedMarks: null,
      });
      expect(tiptapDocument.content).toContainEqual(
        expect.objectContaining({
          type: "blockContainer",
          attrs: { blockId: "block-1" },
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "heading",
              // RD-003이 HeadingExtension에 isToggleable/collapsed(기본값
              // null) attrs를 추가해 level 외 키가 실려 온다 — 이 테스트는
              // level 보존만 본다.
              attrs: expect.objectContaining({ level }),
            }),
          ]),
        }),
      );
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
      ]);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument()).toEqual({ ...before.document, revision: 2 });
      expect(tiptap.state.doc.toJSON()).toEqual(before.tiptapDocument);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
        { revision: 2, changedBlockIds: ["block-1"], reason: "undo" },
      ]);
    }
  });

  it("같은 level 4 heading 재적용은 COMMAND_NOT_APPLICABLE이고 문서·revision이 무변경이다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentOf(
        {
          id: "block-1",
          type: "heading",
          level: 4,
          content: [{ text: "title" }],
        },
        { id: "block-2", type: "paragraph", content: [{ text: "next" }] },
      ),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockType("block-1", { type: "heading", level: 4 }),
    ).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setBlockType" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    // 거절된 명령은 히스토리 항목을 만들지 않는다 — undo할 것이 없다.
    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
  });

  it("getCaretBlockContext와 getSelectionBlockType이 level 4·5·6을 그대로 보고한다", () => {
    const editor = createEditor({
      initialDocument: headingLevels456Document(),
    });
    const { tiptap } = mountTiptapEditor(editor);
    // BlockTypeDescriptor 타입 표기가 정적 단언이다 — union이 level 4-6을
    // 수용하지 않으면 typecheck에서 RED가 된다.
    const expected: Array<[string, BlockTypeDescriptor]> = [
      ["h4", { type: "heading", level: 4 }],
      ["h5", { type: "heading", level: 5 }],
      ["h6", { type: "heading", level: 6 }],
    ];

    for (const [blockId, blockType] of expected) {
      tiptap.commands.setTextSelection(contentTextStart(tiptap, blockId));

      expect(editor.getCaretBlockContext()?.blockType).toEqual(blockType);
      expect(editor.getSelectionBlockType()).toEqual({ blockId, blockType });
    }
  });
});

describe("HeadingExtension DOM 계약", () => {
  it("level 4·5·6 heading이 h4·h5·h6로 렌더된다(h1 폴백 없음)", () => {
    const editor = createEditor({
      initialDocument: headingLevels456Document(),
    });
    const { editable } = mountTiptapEditor(editor);

    expect(editable.querySelector("h4")?.textContent).toBe("four");
    expect(editable.querySelector("h5")?.textContent).toBe("five");
    expect(editable.querySelector("h6")?.textContent).toBe("six");
    expect(editable.querySelectorAll("h1")).toHaveLength(0);
  });

  it("에디터 자체 DOM의 <h4>~<h6>를 heading level 4-6으로 파싱한다", () => {
    const container = document.createElement("div");
    container.innerHTML = "<h4>four</h4><h5>five</h5><h6>six</h6>";

    const parsed = PmDOMParser.fromSchema(liveSchema()).parse(container);
    const levels: number[] = [];
    parsed.descendants((node) => {
      if (node.type.name === "heading") levels.push(node.attrs.level as number);
      return true;
    });

    expect(levels).toEqual([4, 5, 6]);
  });

  // RD-003 트랙-3 결함 탐지 F1: setNodeMarkup에 { level }만 넘기면 PM이
  // heading의 나머지 attrs(isToggleable/collapsed)를 schema default(null)로
  // 되돌려 기존 토글 상태를 지웠다. level만 바뀌는 호출도 두 값을
  // 캐리포워드해야 한다(numberedListItem.startNumber와 같은 원칙).
  it("토글 제목의 level만 바꿔도 isToggleable·collapsed가 유실되지 않는다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        {
          id: "block-1",
          type: "heading",
          level: 2,
          isToggleable: true,
          collapsed: true,
          content: [{ text: "title" }],
          children: [
            { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
          ],
        },
        { id: "block-2", type: "paragraph", content: [{ text: "next" }] },
      ),
    });

    expect(
      editor.commands.setBlockType("block-1", { type: "heading", level: 4 }),
    ).toEqual({ ok: true, value: undefined });

    expect(editor.getDocument().blocks[0]).toEqual({
      id: "block-1",
      type: "heading",
      level: 4,
      isToggleable: true,
      collapsed: true,
      content: [{ text: "title" }],
      children: [
        { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
      ],
    });
  });

  it("paragraph를 heading으로 새로 바꾸면 isToggleable·collapsed가 없다(캐리포워드할 원본이 없다)", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        { id: "block-1", type: "paragraph", content: [{ text: "content" }] },
        { id: "block-2", type: "paragraph", content: [{ text: "next" }] },
      ),
    });

    expect(
      editor.commands.setBlockType("block-1", { type: "heading", level: 2 }),
    ).toEqual({ ok: true, value: undefined });

    const heading = editor.getDocument().blocks[0];
    expect(heading).not.toHaveProperty("isToggleable");
    expect(heading).not.toHaveProperty("collapsed");
  });
});
