/**
 * CodeBlock production 활성화 경계의 load/save, 입력 검증, 공개 선택 문맥,
 * Tab 편집과 지원 범위 밖 keyboard 무손실 guard를 검증한다.
 */
import type { Block, CodeBlock, Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import {
  createEditor,
  type DocumentChangeEvent,
  type EditorController,
} from "../src/index.js";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mountTiptapEditor,
  notApplicable,
  paragraphBlock,
  setBoldStoredMark,
  sequentialIds,
} from "./editor-controller-support.js";
import {
  withNativeCaret,
  withNativeSelection,
  withoutScrollCrash,
} from "./native-selection-test-support.js";

/**
 * model 정규형을 지키는 CodeBlock을 만든다. source와 language 조합만 각
 * 테스트에서 바꿔 production 왕복과 keyboard 경계를 같은 fixture로 읽는다.
 */
const codeBlock = (
  id: string,
  source: string,
  language?: string,
  wrap?: boolean,
  caption?: string,
): CodeBlock => ({
  id,
  type: "codeBlock",
  content: source === "" ? [] : [{ text: source }],
  ...(language === undefined ? {} : { language }),
  ...(wrap === undefined ? {} : { wrap }),
  ...(caption === undefined ? {} : { caption }),
});

/**
 * 공개 API가 받는 타입을 우회해 model validation 전용 무효 입력을 만든다.
 * 제품 코드는 unknown replace 경계와 create의 런타임 입력에서 이를 거절한다.
 */
const invalidCodeDocument = (block: Record<string, unknown>): Document =>
  ({
    formatVersion: 1,
    revision: 0,
    blocks: [{ id: "invalid-code", type: "codeBlock", ...block }],
  }) as unknown as Document;

/**
 * onChange와 순차 ID를 가진 production controller를 마운트한다. keyboard와
 * 원자성 테스트가 model/PM/event 상태를 함께 관찰하는 공통 조립이다.
 */
const mountedCodeEditor = (initialDocument: Document) => {
  const changes: DocumentChangeEvent[] = [];
  const editor = createEditor({
    initialDocument,
    createId: sequentialIds("generated"),
    onChange: (event) => changes.push(event),
  });
  return { editor, changes, ...mountTiptapEditor(editor) };
};

/**
 * PM selection만 staleBlockId로 되돌리고 native caret은 targetBlockId에 둔다.
 * 클릭 직후 keydown에서 DOM 기준 selection 재계산 경로가 실제로 도달하는지
 * 확인한다.
 */
const withStaleBlockCaret = (
  tiptap: TiptapEditor,
  targetBlockId: string,
  staleBlockId: string,
  run: () => void,
  targetOffset = 0,
): void => {
  const targetPosition = contentTextStart(tiptap, targetBlockId);
  tiptap.commands.setTextSelection(targetPosition);
  const { node } = tiptap.view.domAtPos(targetPosition);
  const targetDomNode = node.childNodes[0] ?? node;

  withNativeCaret(
    tiptap.view.dom,
    () => {
      const stalePosition = contentTextStart(tiptap, staleBlockId);
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.near(tiptap.state.doc.resolve(stalePosition)),
        ),
      );
      run();
    },
    targetDomNode,
    targetOffset,
  );
};

/**
 * CodeBlock 무변경 keyboard 경계 전후의 전체 관찰 상태와 history 부재를 단언한다.
 * dispatch 수는 호출부가 정상/stale 또는 selection/no-op 계약에 맞춰 넘긴다.
 */
const expectKeyboardBoundary = (
  editor: EditorController,
  tiptap: TiptapEditor,
  changes: DocumentChangeEvent[],
  run: () => boolean,
  expectedDispatches: number,
): ReturnType<typeof editorState> => {
  const before = editorState(editor, tiptap);
  const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");
  expect(run()).toBe(true);
  expect(dispatchSpy).toHaveBeenCalledTimes(expectedDispatches);
  dispatchSpy.mockRestore();
  expect(changes).toEqual([]);
  expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  return before;
};

describe("CodeBlock production load와 저장", () => {
  it("createEditor와 replaceDocument가 top-level과 nested CodeBlock의 id·source·language·wrap·caption을 보존한다", () => {
    const initial = documentOf(
      codeBlock("top-empty", ""),
      codeBlock("top-known", "const x = 1;\n\treturn x;", " JS ", true, "설명"),
      paragraphBlock("parent", "parent", [
        codeBlock(
          "nested-unknown",
          "alpha\n\tbeta",
          " Exact Unknown ",
          false,
          "",
        ),
        codeBlock("nested-none", "plain"),
      ]),
      paragraphBlock("tail", "tail"),
    );
    const editor = createEditor({ initialDocument: initial });
    try {
      expect(editor.getDocument()).toEqual({
        ...initial,
        blocks: [
          codeBlock("top-empty", ""),
          codeBlock(
            "top-known",
            "const x = 1;\n\treturn x;",
            "javascript",
            true,
            "설명",
          ),
          paragraphBlock("parent", "parent", [
            codeBlock(
              "nested-unknown",
              "alpha\n\tbeta",
              " Exact Unknown ",
              false,
              "",
            ),
            codeBlock("nested-none", "plain"),
          ]),
          paragraphBlock("tail", "tail"),
        ],
      });

      const replacement = documentOf(
        paragraphBlock("replacement-parent", "parent", [
          codeBlock(
            "replacement-nested",
            "nested\n\tsource",
            " TS ",
            true,
            "new caption",
          ),
        ]),
        codeBlock("replacement-top", "top", " Custom Lang "),
        paragraphBlock("replacement-tail", "tail"),
      );
      expect(editor.replaceDocument(replacement)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toEqual({
        ...replacement,
        revision: 1,
        blocks: [
          paragraphBlock("replacement-parent", "parent", [
            codeBlock(
              "replacement-nested",
              "nested\n\tsource",
              "typescript",
              true,
              "new caption",
            ),
          ]),
          codeBlock("replacement-top", "top", " Custom Lang "),
          paragraphBlock("replacement-tail", "tail"),
        ],
      });
    } finally {
      editor.destroy();
    }
  });

  it("마지막 top-level CodeBlock을 보존하고 trailing paragraph만 추가하며 load revision·event·history를 바꾸지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 7,
        blocks: [codeBlock("last-code", "source\n\tline", "javascript")],
      },
      createId: sequentialIds("trailing"),
      onChange: (event) => changes.push(event),
    });
    try {
      const saved = editor.getDocument();

      expect(saved.revision).toBe(7);
      expect(saved.blocks[0]).toEqual(
        codeBlock("last-code", "source\n\tline", "javascript"),
      );
      expect(saved.blocks[1]).toEqual(paragraphBlock("trailing-1", ""));
      expect(changes).toEqual([]);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    } finally {
      editor.destroy();
    }
  });
});

describe("CodeBlock 입력 검증과 명령 원자성", () => {
  const invalidInputs: Array<{ name: string; document: Document }> = [
    {
      name: "금지 source 문자",
      document: invalidCodeDocument({ content: [{ text: "bad\u0000source" }] }),
    },
    {
      name: "빈 language",
      document: invalidCodeDocument({ content: [], language: "" }),
    },
    {
      name: "mark가 있는 source",
      document: invalidCodeDocument({
        content: [{ text: "marked", marks: [{ type: "bold" }] }],
      }),
    },
    {
      name: "children이 있는 leaf",
      document: invalidCodeDocument({
        content: [{ text: "source" }],
        children: [paragraphBlock("child", "child")],
      }),
    },
  ];

  it.each(invalidInputs)(
    "무효 CodeBlock 생성 입력 $name은 TypeError다",
    ({ document }) => {
      expect(() => createEditor({ initialDocument: document })).toThrow(
        TypeError,
      );
    },
  );

  it.each(invalidInputs)(
    "무효 CodeBlock 교체 입력 $name은 DOCUMENT_INVALID이며 모든 상태와 history를 보존한다",
    ({ document }) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: documentOf(paragraphBlock("kept", "before")),
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      expect(editor.commands.setText("kept", "after")).toEqual({
        ok: true,
        value: undefined,
      });
      setBoldStoredMark(tiptap);
      changes.length = 0;
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(editor.replaceDocument(document)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID" },
      });
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
      dispatchSpy.mockRestore();

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editor.getDocument().blocks[0]).toEqual(
        paragraphBlock("kept", "before"),
      );
    },
  );
});

describe("CodeBlock 공개 선택 문맥", () => {
  it("CodeBlock caret과 selection이 language 부재·존재 descriptor를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        codeBlock("without-language", "plain"),
        codeBlock("with-language", "const x = 1;", "javascript"),
        paragraphBlock("tail", "tail"),
      ),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const caret = contentTextStart(tiptap, "without-language") + 2;
    tiptap.commands.setTextSelection(caret);

    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "without-language",
      blockType: { type: "codeBlock" },
      text: "plain",
    });
    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "without-language",
      blockType: { type: "codeBlock" },
    });

    const from = contentTextStart(tiptap, "with-language");
    tiptap.commands.setTextSelection(from + 2);
    expect(editor.getCaretBlockContext()).toEqual({
      blockId: "with-language",
      blockType: { type: "codeBlock", language: "javascript" },
      text: "const x = 1;",
    });
    tiptap.commands.setTextSelection({ from, to: from + 5 });
    expect(editor.getSelectionBlockType()).toEqual({
      blockId: "with-language",
      blockType: { type: "codeBlock", language: "javascript" },
    });
    expect(editor.getCaretBlockContext()).toBeNull();
  });
});

describe("CodeBlock Tab과 Shift+Tab 편집", () => {
  /** 일반 indent가 성공할 수 있는 top-level CodeBlock 배치를 만든다. */
  const tabDocument = () =>
    documentOf(
      paragraphBlock("previous", "previous"),
      codeBlock("code", "source", "javascript"),
      paragraphBlock("tail", "tail"),
    );
  /** 일반 outdent가 성공할 수 있는 nested CodeBlock 배치를 만든다. */
  const shiftTabDocument = () =>
    documentOf(
      paragraphBlock("parent", "parent", [
        paragraphBlock("stale", "stale"),
        codeBlock("code", "source", "javascript"),
      ]),
      paragraphBlock("tail", "tail"),
    );

  it.each([
    { name: "시작", offset: 0, source: "  source" },
    { name: "중간", offset: 3, source: "sou  rce" },
    { name: "끝", offset: 6, source: "source  " },
  ])(
    "CodeBlock $name caret의 Tab은 공백 2개를 삽입하고 caret을 2칸 옮긴다",
    ({ offset, source }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(tabDocument());
      const start = contentTextStart(tiptap, "code");
      tiptap.commands.setTextSelection(start + offset);
      const before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchKeydown(tiptap, "Tab")).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      dispatchSpy.mockRestore();
      expect(editor.getDocument()).toEqual({
        ...before.document,
        revision: 1,
        blocks: [
          paragraphBlock("previous", "previous"),
          codeBlock("code", source, "javascript"),
          paragraphBlock("tail", "tail"),
        ],
      });
      expect(tiptap.state.selection.toJSON()).toEqual({
        type: "text",
        anchor: start + offset + 2,
        head: start + offset + 2,
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["code"], reason: "local" },
      ]);

      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
      expect(editorState(editor, tiptap)).toEqual({
        ...before,
        document: { ...before.document, revision: 2 },
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["code"], reason: "local" },
        { revision: 2, changedBlockIds: ["code"], reason: "undo" },
      ]);
      expect(editor.commands.undo()).toEqual(notApplicable("undo"));
    },
  );

  it("CodeBlock Shift+Tab은 소비하지 않고 모든 상태와 history를 보존한다", () => {
    const { editor, tiptap, changes } = mountedCodeEditor(shiftTabDocument());
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 2);
    setBoldStoredMark(tiptap);
    const before = editorState(editor, tiptap);
    const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");

    expect(dispatchKeydown(tiptap, "Tab", true)).toBe(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });

  it("stale 일반 selection 상태에서 native CodeBlock caret의 Tab은 CodeBlock을 편집한다", () => {
    const { editor, tiptap, changes } = mountedCodeEditor(tabDocument());
    withStaleBlockCaret(
      tiptap,
      "code",
      "previous",
      () => {
        const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");
        expect(dispatchKeydown(tiptap, "Tab")).toBe(true);
        expect(dispatchSpy).toHaveBeenCalledTimes(1);
        dispatchSpy.mockRestore();
      },
      3,
    );

    expect(editor.getDocument()).toEqual({
      formatVersion: 1,
      revision: 1,
      blocks: [
        paragraphBlock("previous", "previous"),
        codeBlock("code", "sou  rce", "javascript"),
        paragraphBlock("tail", "tail"),
      ],
    });
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["code"], reason: "local" },
    ]);
  });

  it("stale 일반 selection 상태에서 native CodeBlock caret의 Shift+Tab은 소비하지 않는다", () => {
    const { editor, tiptap, changes } = mountedCodeEditor(shiftTabDocument());
    let before: ReturnType<typeof editorState> | null = null;
    withStaleBlockCaret(tiptap, "code", "stale", () => {
      before = editorState(editor, tiptap);
      const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");
      expect(dispatchKeydown(tiptap, "Tab", true)).toBe(false);
      expect(dispatchSpy).not.toHaveBeenCalled();
      dispatchSpy.mockRestore();
      expect(editorState(editor, tiptap)).toEqual(before);
    });
    expect(before).not.toBeNull();
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});

describe("CodeBlock과 일반 text block의 Backspace/Delete 경계", () => {
  it.each([
    { key: "Backspace", reversed: false },
    { key: "Delete", reversed: true },
  ])(
    "동기화된 CodeBlock 비어 있지 않은 선택의 $key은 기본 deleteSelection으로 범위를 삭제한다",
    ({ key, reversed }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(
          codeBlock("code", "source", "javascript"),
          paragraphBlock("tail", "tail"),
        ),
      );
      const textStart = contentTextStart(tiptap, "code");
      const from = textStart + 1;
      const to = textStart + 4;
      const anchor = reversed ? to : from;
      const head = reversed ? from : to;
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(
          TextSelection.create(tiptap.state.doc, anchor, head),
        ),
      );
      const { node } = tiptap.view.domAtPos(textStart);
      const textNode = node.childNodes[0] ?? node;

      withNativeSelection(
        tiptap.view.dom,
        () => {
          const dispatchSpy = vi.spyOn(tiptap.view, "dispatch");
          const observed = { handled: false, dispatchCount: -1 };
          withoutScrollCrash(tiptap, () => {
            Object.assign(observed, {
              handled: dispatchKeydown(tiptap, key),
              dispatchCount: dispatchSpy.mock.calls.length,
            });
          });
          dispatchSpy.mockRestore();
          expect(observed).toEqual({ handled: true, dispatchCount: 1 });
          expect(editor.getDocument()).toEqual({
            formatVersion: 1,
            revision: 1,
            blocks: [
              codeBlock("code", "sce", "javascript"),
              paragraphBlock("tail", "tail"),
            ],
          });
          expect(changes).toEqual([
            {
              revision: 1,
              changedBlockIds: ["code"],
              reason: "local",
            },
          ]);
        },
        textNode,
        anchor - textStart,
        textNode,
        head - textStart,
      );
    },
  );

  it.each([
    { name: "paragraph", block: paragraphBlock("text", "before") },
    {
      name: "heading",
      block: {
        id: "text",
        type: "heading" as const,
        level: 2 as const,
        content: [{ text: "before" }],
      },
    },
    {
      name: "quote",
      block: {
        id: "text",
        type: "quote" as const,
        content: [{ text: "before" }],
      },
    },
  ])(
    // #202 RD-001-DELTA-01 — 이전에는 CodeBlock 시작으로 selection만
    // 옮기는 no-op이었다. 이제 CodeBlock을 흡수하고 제거한다(행2).
    "top-level $name 끝 Delete는 다음 CodeBlock을 흡수하고 CodeBlock을 제거한다",
    ({ block }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(
          block,
          codeBlock("code", "source", "javascript"),
          paragraphBlock("tail", "tail"),
        ),
      );
      const textEnd = contentTextStart(tiptap, "text") + "before".length;
      tiptap.commands.setTextSelection(textEnd);

      expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

      expect(editor.getDocument()).toEqual({
        formatVersion: 1,
        revision: 1,
        blocks: [
          { ...block, content: [{ text: "beforesource" }] },
          paragraphBlock("tail", "tail"),
        ],
      });
      expect(changes).toEqual([
        {
          revision: 1,
          // tail은 내용은 그대로지만 code가 사라지며 index가 한 칸
          // 앞당겨져 changedBlockIds에 포함된다(blockChanges의 index 비교).
          changedBlockIds: ["text", "code", "tail"],
          reason: "local",
        },
      ]);
      // append 방향 — 캐럿은 원래 위치("before" 끝)에 그대로 남는다.
      expect(tiptap.state.selection.toJSON()).toEqual({
        type: "text",
        anchor: textEnd,
        head: textEnd,
      });
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    },
  );

  it.each([
    { name: "paragraph", block: paragraphBlock("text", "after") },
    {
      name: "heading",
      block: {
        id: "text",
        type: "heading" as const,
        level: 2 as const,
        content: [{ text: "after" }],
      },
    },
    {
      name: "quote",
      block: {
        id: "text",
        type: "quote" as const,
        content: [{ text: "after" }],
      },
    },
  ])(
    // #202 RD-001-DELTA-01 — 이전에는 CodeBlock 끝으로 selection만 옮기는
    // no-op이었다. 이제 CodeBlock을 흡수하고 제거한다(행1). code가
    // parent의 blockGroup에서 유일하게 제거되는 자식이라 자식 목록에는
    // text 하나만 남는다.
    "nested $name 선두 Backspace는 이전 CodeBlock을 흡수하고 CodeBlock을 제거한다",
    ({ block }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(
          paragraphBlock("parent", "parent", [
            codeBlock("code", "source", "javascript"),
            block,
          ]),
          paragraphBlock("tail", "tail"),
        ),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "text"));

      expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

      expect(editor.getDocument()).toEqual({
        formatVersion: 1,
        revision: 1,
        blocks: [
          paragraphBlock("parent", "parent", [
            // block은 it.each 배열의 첫 항목이 반환 타입 Block(TableBlock
            // 포함 전체 union)인 paragraphBlock(...)이라 이 위치의 children
            // 계약(Block[])이 spread 뒤 excess property를 TableBlock 갈래
            // 기준으로도 검사한다 — paragraph/heading/quote만 오는 fixture
            // 값이므로 단언으로 좁힌다.
            { ...block, content: [{ text: "sourceafter" }] } as Block,
          ]),
          paragraphBlock("tail", "tail"),
        ],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["code", "text"], reason: "local" },
      ]);
      // prepend 방향 — 캐럿은 흡수한 "source"와 원래 "after"의 경계에 있다.
      // code가 사라져 위치 번호가 밀리므로 병합 후 문서에서 다시 조회한다.
      const boundary = contentTextStart(tiptap, "text") + "source".length;
      expect(tiptap.state.selection.toJSON()).toEqual({
        type: "text",
        anchor: boundary,
        head: boundary,
      });
      expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    },
  );

  it.each([
    { name: "paragraph", block: paragraphBlock("text", "after") },
    {
      name: "heading",
      block: {
        id: "text",
        type: "heading" as const,
        level: 2 as const,
        content: [{ text: "after" }],
      },
    },
    {
      name: "quote",
      block: {
        id: "text",
        type: "quote" as const,
        content: [{ text: "after" }],
      },
    },
  ])(
    "top-level CodeBlock 끝 Delete는 다음 $name와 병합하지 않고 완전한 no-op이다",
    ({ block }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(codeBlock("code", "source", "javascript"), block),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "code") + "source".length,
      );
      setBoldStoredMark(tiptap);
      const before = expectKeyboardBoundary(
        editor,
        tiptap,
        changes,
        () => dispatchKeydown(tiptap, "Delete"),
        0,
      );
      expect(editorState(editor, tiptap)).toEqual(before);
    },
  );

  it.each([
    { key: "Backspace", sourceOffset: 0, staleOffset: 0 },
    {
      key: "Delete",
      sourceOffset: "source".length,
      staleOffset: "stale".length,
    },
  ])(
    "native CodeBlock 경계의 stale $key은 destructive join 없이 완전한 no-op이다",
    ({ key, sourceOffset, staleOffset }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(
          paragraphBlock("stale", "stale"),
          codeBlock("code", "source", "javascript"),
          paragraphBlock("tail", "tail"),
        ),
      );
      let observed = false;
      withStaleBlockCaret(
        tiptap,
        "code",
        "stale",
        () => {
          tiptap.view.dispatch(
            tiptap.state.tr.setSelection(
              TextSelection.near(
                tiptap.state.doc.resolve(
                  contentTextStart(tiptap, "stale") + staleOffset,
                ),
              ),
            ),
          );
          setBoldStoredMark(tiptap);
          const before = expectKeyboardBoundary(
            editor,
            tiptap,
            changes,
            () => dispatchKeydown(tiptap, key),
            0,
          );
          expect(editorState(editor, tiptap)).toEqual(before);
          observed = true;
        },
        sourceOffset,
      );
      expect(observed).toBe(true);
    },
  );

  it("native paragraph→CodeBlock 경계의 stale Delete도 destructive join으로 CodeBlock을 흡수한다", () => {
    // #202 RD-001-DELTA-01 — stale 경로(handleCodeBlockBoundary)도 live
    // 경로와 같은 mergeCodeBlockIntoText를 타므로 selection-only 예외가
    // 아니라 병합이 일어난다.
    const { editor, tiptap, changes } = mountedCodeEditor(
      documentOf(
        paragraphBlock("stale", "stale"),
        paragraphBlock("text", "before"),
        codeBlock("code", "source", "javascript"),
        paragraphBlock("tail", "tail"),
      ),
    );
    let observed = false;
    withStaleBlockCaret(
      tiptap,
      "text",
      "stale",
      () => {
        tiptap.view.dispatch(
          tiptap.state.tr.setSelection(
            TextSelection.near(
              tiptap.state.doc.resolve(
                contentTextStart(tiptap, "stale") + "stale".length,
              ),
            ),
          ),
        );

        expect(dispatchKeydown(tiptap, "Delete")).toBe(true);

        expect(editor.getDocument()).toEqual({
          formatVersion: 1,
          revision: 1,
          blocks: [
            paragraphBlock("stale", "stale"),
            paragraphBlock("text", "beforesource"),
            paragraphBlock("tail", "tail"),
          ],
        });
        expect(changes).toEqual([
          {
            revision: 1,
            // tail은 내용은 그대로지만 code가 사라지며 index가 한 칸
            // 앞당겨져 changedBlockIds에 포함된다(blockChanges의 index 비교).
            changedBlockIds: ["text", "code", "tail"],
            reason: "local",
          },
        ]);
        const textEnd = contentTextStart(tiptap, "text") + "before".length;
        expect(tiptap.state.selection.toJSON()).toEqual({
          type: "text",
          anchor: textEnd,
          head: textEnd,
        });
        withoutScrollCrash(tiptap, () => {
          expect(editor.commands.undo()).toEqual({
            ok: true,
            value: undefined,
          });
        });
        observed = true;
      },
      "before".length,
    );
    expect(observed).toBe(true);
  });

  it.each([
    { key: "Backspace", staleOffset: 0 },
    { key: "Delete", staleOffset: "stale".length },
  ])(
    "native CodeBlock 중간 caret의 stale $key은 live paragraph 경계를 병합하지 않고 no-op으로 소비한다",
    ({ key, staleOffset }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(
          paragraphBlock("previous", "previous"),
          paragraphBlock("stale", "stale"),
          paragraphBlock("next", "next"),
          codeBlock("code", "source", "javascript"),
          paragraphBlock("tail", "tail"),
        ),
      );
      let observed = false;
      withStaleBlockCaret(
        tiptap,
        "code",
        "stale",
        () => {
          tiptap.view.dispatch(
            tiptap.state.tr.setSelection(
              TextSelection.near(
                tiptap.state.doc.resolve(
                  contentTextStart(tiptap, "stale") + staleOffset,
                ),
              ),
            ),
          );
          setBoldStoredMark(tiptap);
          const before = expectKeyboardBoundary(
            editor,
            tiptap,
            changes,
            () => dispatchKeydown(tiptap, key),
            0,
          );
          expect(editorState(editor, tiptap)).toEqual(before);
          observed = true;
        },
        2,
      );
      expect(observed).toBe(true);
    },
  );

  it.each([
    { key: "Backspace", codeOffset: 0 },
    { key: "Delete", codeOffset: "source".length },
  ])(
    "native caret이 다른 paragraph에 있을 때 live stale CodeBlock 경계의 $key은 no-op으로 소비한다",
    ({ key, codeOffset }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(
          paragraphBlock("native", "native"),
          codeBlock("code", "source", "javascript"),
          paragraphBlock("tail", "tail"),
        ),
      );
      let observed = false;
      withStaleBlockCaret(
        tiptap,
        "native",
        "code",
        () => {
          tiptap.view.dispatch(
            tiptap.state.tr.setSelection(
              TextSelection.near(
                tiptap.state.doc.resolve(
                  contentTextStart(tiptap, "code") + codeOffset,
                ),
              ),
            ),
          );
          setBoldStoredMark(tiptap);
          const before = expectKeyboardBoundary(
            editor,
            tiptap,
            changes,
            () => dispatchKeydown(tiptap, key),
            0,
          );
          expect(editorState(editor, tiptap)).toEqual(before);
          observed = true;
        },
        1,
      );
      expect(observed).toBe(true);
    },
  );

  it("native caret이 다른 paragraph에 있을 때 live stale paragraph→CodeBlock Delete는 no-op으로 소비한다", () => {
    const { editor, tiptap, changes } = mountedCodeEditor(
      documentOf(
        paragraphBlock("native", "native"),
        paragraphBlock("stale", "stale"),
        codeBlock("code", "source", "javascript"),
        paragraphBlock("tail", "tail"),
      ),
    );
    let observed = false;
    withStaleBlockCaret(
      tiptap,
      "native",
      "stale",
      () => {
        tiptap.view.dispatch(
          tiptap.state.tr.setSelection(
            TextSelection.near(
              tiptap.state.doc.resolve(
                contentTextStart(tiptap, "stale") + "stale".length,
              ),
            ),
          ),
        );
        setBoldStoredMark(tiptap);
        const before = expectKeyboardBoundary(
          editor,
          tiptap,
          changes,
          () => dispatchKeydown(tiptap, "Delete"),
          0,
        );
        expect(editorState(editor, tiptap)).toEqual(before);
        observed = true;
      },
      1,
    );
    expect(observed).toBe(true);
  });

  it.each([
    { name: "paragraph", block: paragraphBlock("text", "before") },
    {
      name: "heading",
      block: {
        id: "text",
        type: "heading" as const,
        level: 2 as const,
        content: [{ text: "before" }],
      },
    },
    {
      name: "quote",
      block: {
        id: "text",
        type: "quote" as const,
        content: [{ text: "before" }],
      },
    },
  ])(
    "nested CodeBlock 선두 Backspace는 이전 $name와 병합하지 않고 완전한 no-op이다",
    ({ block }) => {
      const { editor, tiptap, changes } = mountedCodeEditor(
        documentOf(
          paragraphBlock("parent", "parent", [
            block,
            codeBlock("code", "source", "javascript"),
          ]),
          paragraphBlock("tail", "tail"),
        ),
      );
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "code"));
      setBoldStoredMark(tiptap);
      const before = expectKeyboardBoundary(
        editor,
        tiptap,
        changes,
        () => dispatchKeydown(tiptap, "Backspace"),
        0,
      );
      expect(editorState(editor, tiptap)).toEqual(before);
    },
  );
});
