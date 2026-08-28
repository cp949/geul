import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentWithContent,
  editorState,
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 링크", () => {
  it.each([
    "http://example.com",
    "https://example.com",
    "mailto:a@example.com",
    "tel:+821012345678",
    "/relative",
    "#fragment",
    "https://example.com/a–b",
  ])(
    "마운트된 에디터 입력에서 모델이 허용하는 링크 URL %s를 허용한다",
    (href) => {
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
      });
      const { tiptap } = mountTiptapEditor(editor);
      // blockContainer가 문단을 감싸며 좌표가 1씩 밀렸다(D19) — 2가 "content"
      // 시작, 9가 그 끝이다.
      tiptap.commands.setTextSelection({ from: 2, to: 9 });

      expect(tiptap.commands.setLink({ href })).toBe(true);
      expect(editor.getDocument()).toMatchObject({
        revision: 1,
        blocks: [
          {
            content: [{ text: "content", marks: [{ type: "link", href }] }],
          },
        ],
      });
    },
  );

  it.each([
    "ftp://example.com",
    "ftps://example.com",
    "sms:+821012345678",
    "xmpp:user@example.com",
    "callto:+821012345678",
    "cid:content-id",
    " javascript:alert(1)",
    "java\nscript:alert(1)",
    "java﻿script:alert(1)",
  ])(
    "마운트된 에디터 입력에서 모델이 허용하지 않는 링크 URL %s를 거부한다",
    (href) => {
      const changes: DocumentChangeEvent[] = [];
      const editor = createEditor({
        initialDocument: paragraphDocument("content"),
        onChange: (event) => changes.push(event),
      });
      const { tiptap } = mountTiptapEditor(editor);
      tiptap.commands.setTextSelection({ from: 1, to: 8 });

      expect(tiptap.commands.setLink({ href })).toBe(false);
      expect(editor.getDocument()).toEqual(paragraphDocument("content"));
      expect(changes).toEqual([]);
    },
  );

  it("에디터 생성 전에 공백으로 난독화한 링크를 거부한다", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          {
            text: "unsafe",
            marks: [{ type: "link", href: " java\nscript:alert(1)" }],
          },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it("문서 교체 시 제어 문자로 난독화한 링크를 원자적으로 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept", 2),
      onChange: (event) => changes.push(event),
    });

    expect(
      editor.replaceDocument(
        documentWithContent([
          {
            text: "unsafe",
            marks: [{ type: "link", href: "java\tscript:alert(1)" }],
          },
        ]),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept", 2));
    expect(changes).toEqual([]);
  });

  it("잘못된 브라우저 링크 트랜잭션을 예외 없이 문서 변경 없이 걸러낸다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const link = tiptap.schema.marks.link;
    if (link === undefined) throw new Error("Link mark is not registered");
    const transaction = tiptap.state.tr.addMark(
      1,
      8,
      link.create({ href: "ftp://example.com" }),
    );

    expect(() => tiptap.view.dispatch(transaction)).not.toThrow();
    expect(editor.getDocument()).toEqual(paragraphDocument("content"));
    expect(changes).toEqual([]);
    expect(() => editor.destroy()).not.toThrow();
  });

  it("잘못된 stored 링크 mark를 걸러내고 이후 일반 입력에 영향을 주지 않는다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const link = tiptap.schema.marks.link;
    if (link === undefined) throw new Error("Link mark is not registered");
    // 9 = "content" 끝(D19로 컨테이너가 감싸며 좌표가 1씩 밀렸다).
    tiptap.commands.setTextSelection(9);
    const documentBefore = tiptap.state.doc.toJSON();
    const selectionBefore = tiptap.state.selection.toJSON();
    const storedMarksBefore = tiptap.state.storedMarks;

    const invalidStoredMark = tiptap.state.tr.setStoredMarks([
      link.create({ href: "ftp://example.com" }),
    ]);
    expect(invalidStoredMark.docChanged).toBe(false);
    tiptap.view.dispatch(invalidStoredMark);

    expect(tiptap.state.storedMarks).toEqual(storedMarksBefore);
    expect(tiptap.state.doc.toJSON()).toEqual(documentBefore);
    expect(tiptap.state.selection.toJSON()).toEqual(selectionBefore);
    expect(editor.getDocument()).toEqual(paragraphDocument("content"));
    expect(changes).toEqual([]);

    expect(tiptap.commands.insertContent("!")).toBe(true);
    expect(editor.getDocument()).toEqual(paragraphDocument("content!", 1));
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["block-1"], reason: "local" },
    ]);
  });

  it("유효한 stored 링크 mark가 이후 입력에 적용된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const link = tiptap.schema.marks.link;
    if (link === undefined) throw new Error("Link mark is not registered");
    // 9 = "content" 끝(D19로 컨테이너가 감싸며 좌표가 1씩 밀렸다).
    tiptap.commands.setTextSelection(9);

    tiptap.view.dispatch(
      tiptap.state.tr.setStoredMarks([
        link.create({ href: "https://example.com" }),
      ]),
    );

    expect(tiptap.state.storedMarks?.map((mark) => mark.toJSON())).toEqual([
      {
        type: "link",
        attrs: {
          href: "https://example.com",
          target: "_blank",
          rel: "noopener noreferrer nofollow",
          class: null,
          title: null,
        },
      },
    ]);
    expect(tiptap.commands.insertContent("!")).toBe(true);
    expect(editor.getDocument()).toEqual({
      ...documentWithContent([
        { text: "content" },
        {
          text: "!",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
      revision: 1,
    });
  });

  it("현재 선택 영역에 링크를 만들고 한 번의 undo로 복원한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    // 컨테이너가 문단을 감싸며 좌표가 1씩 밀렸다(D19) — 2가 "content" 시작,
    // 9가 그 끝이다.
    tiptap.commands.setTextSelection({ from: 2, to: 9 });

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      revision: 1,
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://example.com" }],
            },
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
  });

  it("지원하지 않는 링크 URL을 문서 변경 없이 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("javascript:alert(1)")).toEqual({
      ok: false,
      error: { code: "LINK_HREF_REJECTED", href: "javascript:alert(1)" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("링크 밖 collapsed 선택 영역에서 setLink가 COMMAND_NOT_APPLICABLE을 반환한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setLink" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("기존 링크 안 collapsed 커서에서 href를 갱신하고 한 번의 undo로 복원한다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.commands.setLink("https://updated.example.com")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://updated.example.com" }],
            },
          ],
        },
      ],
    });

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
      ],
    });
  });

  it("기존과 같은 href를 설정하면 에디터 상태를 유지한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 2, to: 4 });
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setLink" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("기존과 같은 href를 설정하면 collapsed 선택 영역을 유지한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
      onChange: (event) => changes.push(event),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);
    const stateBefore = editorState(editor, tiptap);

    expect(editor.commands.setLink("https://example.com")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "setLink" },
    });
    expect(editorState(editor, tiptap)).toEqual(stateBefore);
    expect(changes).toEqual([]);
  });

  it("현재 선택 영역의 링크를 제거하고 한 번의 undo로 복원한다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    // 컨테이너가 문단을 감싸며 좌표가 1씩 밀렸다(D19) — 2가 "content" 시작,
    // 9가 그 끝이다.
    tiptap.commands.setTextSelection({ from: 2, to: 9 });

    expect(editor.commands.unsetLink()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "content" }] }],
    });

    expect(editor.commands.undo()).toMatchObject({ ok: true });
    expect(editor.getDocument()).toMatchObject({
      blocks: [
        {
          content: [
            {
              text: "content",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
      ],
    });
  });

  it("링크 안 collapsed 커서에서 링크를 제거한다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.commands.unsetLink()).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "content" }] }],
    });
  });

  it("링크 밖에서 unsetLink가 COMMAND_NOT_APPLICABLE을 반환한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection({ from: 1, to: 8 });

    expect(editor.commands.unsetLink()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "unsetLink" },
    });
  });

  it("링크 안 collapsed 커서에서 href를 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionLink()).toEqual({ href: "https://example.com" });
  });

  it("링크 밖 collapsed 커서에서는 활성 링크가 없다고 보고한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    expect(editor.getSelectionLink()).toBeNull();
  });

  it("destroy 이후에는 활성 링크가 없다고 보고한다", () => {
    const editor = createEditor({
      initialDocument: documentWithContent([
        {
          text: "content",
          marks: [{ type: "link", href: "https://example.com" }],
        },
      ]),
    });
    const { tiptap } = mountTiptapEditor(editor);
    tiptap.commands.setTextSelection(3);

    editor.destroy();

    expect(editor.getSelectionLink()).toBeNull();
  });
});
