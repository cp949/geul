/**
 * 인라인 색상 토글 명령(`toggleInlineTextColor`/`toggleInlineBackgroundColor`,
 * RD-002 DELTA-01)을 검증한다. CodeBlock mark 금지 경계·비정규 색상 거절·
 * 원자성·undo는 `editor-controller-marks.test.ts`/`editor-controller-links.test.ts`의
 * 기존 계약과 동형이다 — 대상 명령만 다르다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  documentOf,
  editorState,
  mountTiptapEditor,
  notApplicable,
  paragraphBlock,
  paragraphDocument,
} from "./editor-controller-support.js";

const codeBlockMarkGuardDocument: Document = documentOf(
  paragraphBlock("before", "left"),
  {
    id: "code",
    type: "codeBlock",
    content: [{ text: "code" }],
    language: "text",
  },
  paragraphBlock("tail", "tail"),
);

const inlineColorCommands = [
  { command: "toggleInlineTextColor", markType: "textColor" },
  { command: "toggleInlineBackgroundColor", markType: "backgroundColor" },
] as const;

describe("에디터 컨트롤러 인라인 색상 토글", () => {
  it.each(inlineColorCommands)(
    "CodeBlock 내부 caret에서 %s를 상태 변경 없이 CODE_BLOCK_MARK_NOT_ALLOWED로 거절한다",
    ({ command }) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: codeBlockMarkGuardDocument,
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);
      const before = editorState(editor, tiptap);

      expect(editor.commands[command]("#AABBCC")).toEqual({
        ok: false,
        error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );

  it.each(inlineColorCommands)(
    "CodeBlock 문자를 교차하는 선택에서 %s를 상태 변경 없이 거절한다",
    ({ command }) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: codeBlockMarkGuardDocument,
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection({
        from: contentTextStart(tiptap, "before"),
        to: contentTextStart(tiptap, "code") + 1,
      });
      const before = editorState(editor, tiptap);

      expect(editor.commands[command]("#AABBCC")).toEqual({
        ok: false,
        error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );

  it.each(inlineColorCommands)(
    "collapsed 선택 영역의 %s는 COMMAND_NOT_APPLICABLE을 반환하고 이벤트를 발행하지 않는다",
    ({ command }) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection(3);

      expect(editor.commands[command]("#AABBCC")).toEqual(
        notApplicable(command),
      );
      expect(editor.getDocument()).toEqual(paragraphDocument("content"));
      expect(changes).toEqual([]);
    },
  );

  it.each([
    { command: "toggleInlineTextColor", color: "#aabbcc" },
    { command: "toggleInlineTextColor", color: "red" },
    { command: "toggleInlineBackgroundColor", color: "#aabbcc" },
    { command: "toggleInlineBackgroundColor", color: "red" },
  ] as const)(
    "비정규 색상값 $color을 넘긴 %s는 문서 변경 없이 INVALID_COLOR로 거절한다",
    ({ command, color }) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection({ from: 2, to: 9 });
      const before = editorState(editor, tiptap);

      expect(editor.commands[command](color)).toEqual({
        ok: false,
        error: { code: "INVALID_COLOR", color },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );

  it.each(inlineColorCommands)(
    "선택 영역에 정규 색상으로 %s를 적용하고 undo 1회로 복원한다",
    ({ command, markType }) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      // 컨테이너가 문단을 감싸며 좌표가 1씩 밀렸다(D19) — 2가 "content"
      // 시작, 9가 그 끝이다.
      tiptap.commands.setTextSelection({ from: 2, to: 9 });

      expect(editor.commands[command]("#AABBCC")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toMatchObject({
        revision: 1,
        blocks: [
          {
            content: [
              { text: "content", marks: [{ type: markType, color: "#AABBCC" }] },
            ],
          },
        ],
      });
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
      ]);

      expect(editor.commands.undo()).toMatchObject({ ok: true });
      expect(editor.getDocument()).toMatchObject({
        revision: 2,
        blocks: [{ content: [{ text: "content" }] }],
      });
    },
  );

  it.each(inlineColorCommands)(
    "선택 전체에 이미 같은 색이 적용돼 있으면 %s 재호출이 해제한다",
    ({ command }) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection({ from: 2, to: 9 });
      expect(editor.commands[command]("#AABBCC")).toMatchObject({ ok: true });

      expect(editor.commands[command]("#AABBCC")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toMatchObject({
        revision: 2,
        blocks: [{ content: [{ text: "content" }] }],
      });
    },
  );

  it.each(inlineColorCommands)(
    "선택 전체에 색이 적용돼 있을 때 명시적 null로 %s를 호출하면 해제한다",
    ({ command }) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection({ from: 2, to: 9 });
      expect(editor.commands[command]("#AABBCC")).toMatchObject({ ok: true });

      expect(editor.commands[command](null)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(editor.getDocument()).toMatchObject({
        revision: 2,
        blocks: [{ content: [{ text: "content" }] }],
      });
    },
  );

  it("textColor와 backgroundColor는 서로 독립적으로 공존한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 2, to: 9 });

    expect(
      editor.commands.toggleInlineTextColor("#AABBCC"),
    ).toMatchObject({ ok: true });
    expect(
      editor.commands.toggleInlineBackgroundColor("#112233"),
    ).toMatchObject({ ok: true });

    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [
                { type: "textColor", color: "#AABBCC" },
                { type: "backgroundColor", color: "#112233" },
              ],
            },
          ],
        },
      ],
    });

    // backgroundColor 해제가 textColor는 건드리지 않는다.
    expect(
      editor.commands.toggleInlineBackgroundColor(null),
    ).toMatchObject({ ok: true });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            { text: "content", marks: [{ type: "textColor", color: "#AABBCC" }] },
          ],
        },
      ],
    });
  });

  it("undo가 코드블록 거절 7종+2종 뒤에도 기존 이력을 보존한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: codeBlockMarkGuardDocument,
      onChange: (event) => changes.push(event),
    });
    expect(editor.commands.setText("tail", "changed")).toEqual({
      ok: true,
      value: undefined,
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "code") + 1);
    const before = editorState(editor, tiptap);

    const outcomes = [
      editor.commands.toggleInlineTextColor("#AABBCC"),
      editor.commands.toggleInlineBackgroundColor("#AABBCC"),
    ];

    expect(outcomes).toEqual(
      Array.from({ length: 2 }, () => ({
        ok: false,
        error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
      })),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument()).toMatchObject({
      revision: 2,
      blocks: codeBlockMarkGuardDocument.blocks,
    });
  });
});
