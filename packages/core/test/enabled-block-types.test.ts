/**
 * CreateEditorOptions.enabledBlockTypes(spec §4.4 EXT-004, RD-002-DELTA-12)의
 * allow/deny 필터를 검증한다 — 비활성화한 block type이 (1) PM 스키마에
 * 노드로 등록되지 않고, (2) initialDocument/replaceDocument 경로로 만나면
 * EDITOR_FEATURE_UNAVAILABLE로 명시적으로 거절되는지를 함께 본다. 마지막
 * 테스트(붙여넣기)는 이 DELTA가 추가한 방어가 아니라 characterization이다
 * — Tiptap의 insertContentAt이 이미 알 수 없는 노드 타입 생성 실패를
 * 항상(editor 옵션과 무관) try/catch로 흡수해 emitContentError + `return
 * false`로 조용히 끝난다(실측, clipboard-paste-extension.ts 주석 참고) —
 * 이 사실이 앞으로도 유지되는지 고정한다. 옵션 미지정 시 회귀 없음은 이
 * 스위트 밖의 기존 전체 테스트(옵션을 쓰지 않는다)가 그대로 고정한다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  paragraphDocument,
  quoteBlock,
  sequentialIds,
} from "./editor-controller-support.js";

describe("enabledBlockTypes(RD-002-DELTA-12)", () => {
  it("deny로 heading을 끄면 스키마에 heading 노드가 없고 paragraph는 그대로 있다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      enabledBlockTypes: { mode: "deny", types: ["heading"] },
    });
    const { tiptap } = mountTiptapEditor(editor);

    expect(tiptap.schema.nodes.heading).toBeUndefined();
    expect(tiptap.schema.nodes.paragraph).toBeDefined();
  });

  it("allow로 paragraph만 허용하면 heading은 없고 paragraph만 있다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      enabledBlockTypes: { mode: "allow", types: ["paragraph"] },
    });
    const { tiptap } = mountTiptapEditor(editor);

    expect(tiptap.schema.nodes.paragraph).toBeDefined();
    expect(tiptap.schema.nodes.heading).toBeUndefined();
    expect(tiptap.schema.nodes.divider).toBeUndefined();
  });

  it("deny로 table을 끄면 table/tableRow/tableCell 세 노드가 모두 사라진다(묶음 제거)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      enabledBlockTypes: { mode: "deny", types: ["table"] },
    });
    const { tiptap } = mountTiptapEditor(editor);

    expect(tiptap.schema.nodes.table).toBeUndefined();
    expect(tiptap.schema.nodes.tableRow).toBeUndefined();
    expect(tiptap.schema.nodes.tableCell).toBeUndefined();
  });

  it("비활성 타입이 최상위 블록으로 있는 initialDocument는 createEditor가 던진다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [paragraphBlock("p1", "hi"), quoteBlock("q1", "nested")],
    };

    expect(() =>
      createEditor({
        initialDocument,
        enabledBlockTypes: { mode: "deny", types: ["quote"] },
      }),
    ).toThrow(/quote/);
  });

  it("비활성 타입이 중첩 children 안에 있어도 동일하게 거절된다(재귀 검증)", () => {
    const initialDocument = documentOf(
      paragraphBlock("p1", "top", [quoteBlock("q1", "nested")]),
    );

    expect(() =>
      createEditor({
        initialDocument,
        enabledBlockTypes: { mode: "deny", types: ["quote"] },
      }),
    ).toThrow(/quote/);
  });

  it("replaceDocument로 비활성 타입 문서를 넣으면 EDITOR_FEATURE_UNAVAILABLE로 거절되고 문서가 바뀌지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      enabledBlockTypes: { mode: "deny", types: ["quote"] },
    });
    const before = editor.getDocument();

    const result = editor.replaceDocument(
      documentOf(paragraphBlock("p1", "hi"), quoteBlock("q1", "nested")),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: expect.stringContaining("quote"),
      },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("비활성 타입의 HTML을 붙여넣어도 크래시하지 않고 문서에 반영되지 않는다(characterization — Tiptap insertContentAt 자체 방어)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      enabledBlockTypes: { mode: "deny", types: ["quote"] },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<blockquote>q</blockquote>");

      expect(editor.getDocument().blocks.some((b) => b.type === "quote")).toBe(
        false,
      );
      expect(errors).toEqual([]);
    });
  });
});
