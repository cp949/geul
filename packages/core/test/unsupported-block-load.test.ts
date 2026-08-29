/**
 * 개요: quote·divider 블록을 포함한 문서 로드가 기존 무효 문서 계약
 * (DOCUMENT_INVALID)으로 거절되는지 검증한다. 아직 PM 노드가 없어(DELTA-03
 * 이전) validateEditableContent(model-to-tiptap.ts)가 최상위·중첩 위치
 * 모두에서 명시 거절한다 — 임시 계약, DELTA-04가 실제 변환으로 교체한다.
 * replaceDocument는 Result로, createEditor는 TypeError로 거절하며 두 경로는
 * parseSupportedDocument를 공유해 한 번에 검증된다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  dividerBlock,
  documentOf,
  editorState,
  mountTiptapEditor,
  paragraphDocument,
  quoteBlock,
} from "./editor-controller-support.js";

/** 최상위에 quote/divider 하나만 있는 문서 — replaceDocument·createEditor 공용. */
const quoteDocument = documentOf(quoteBlock("quote-1", "hello"));
const dividerDocument = documentOf(dividerBlock("divider-1"));

/** paragraph의 children 안 quote, heading의 children 안 divider. */
const quoteNestedDocument = documentOf({
  id: "parent-1",
  type: "paragraph",
  content: [{ text: "parent" }],
  children: [quoteBlock("quote-2", "nested")],
});
const dividerNestedDocument = documentOf({
  id: "parent-2",
  type: "heading",
  level: 2,
  content: [{ text: "parent" }],
  children: [dividerBlock("divider-2")],
});

/**
 * replaceDocument(next)가 DOCUMENT_INVALID로 거절되면서 문서·selection·
 * onChange를 원자적으로 보존하는지 확인한다(G-EDT-001, 01b-C2).
 */
const expectRejectedAtomically = (next: Document) => {
  const changes: DocumentChangeEvent[] = [];
  const editor = createEditor({
    initialDocument: paragraphDocument("kept", 3),
    onChange: (event) => changes.push(event),
  });
  const { tiptap } = mountTiptapEditor(editor);
  const before = editorState(editor, tiptap);

  expect(editor.replaceDocument(next)).toMatchObject({
    ok: false,
    error: { code: "DOCUMENT_INVALID" },
  });
  expect(editorState(editor, tiptap)).toEqual(before);
  expect(changes).toEqual([]);
};

/**
 * createEditor(initialDocument)가 TypeError로 거절되는지 확인하고 그
 * message를 돌려준다 — 던지지 않으면 실패시킨다.
 */
const thrownMessage = (initialDocument: Document): string => {
  try {
    createEditor({ initialDocument });
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
    return (error as TypeError).message;
  }
  throw new Error("createEditor가 던지지 않았다");
};

describe("미지원 블록 로드의 임시 거절(DELTA-04가 교체)", () => {
  it("quote 문서 replaceDocument가 DOCUMENT_INVALID Result로 거절되고 문서·revision·selection이 무변경이다", () => {
    expectRejectedAtomically(quoteDocument);
  });

  it("divider 문서 replaceDocument가 DOCUMENT_INVALID로 거절된다", () => {
    expectRejectedAtomically(dividerDocument);
  });

  it("children 안에 quote/divider가 있는 문서도 거절된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("kept", 1),
    });

    expect(editor.replaceDocument(quoteNestedDocument)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(editor.replaceDocument(dividerNestedDocument)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
  });

  it("quote 초기 문서로 createEditor하면 블록 id와 type을 담은 TypeError를 던진다", () => {
    const message = thrownMessage(quoteDocument);
    expect(message).toMatch(/quote-1.*"quote"/);
    expect(message).not.toContain("Unknown node type");
  });

  it("divider 초기 문서로 createEditor하면 같은 계약으로 TypeError를 던진다", () => {
    const message = thrownMessage(dividerDocument);
    expect(message).toMatch(/divider-1.*"divider"/);
    expect(message).not.toContain("not iterable");
  });
});
