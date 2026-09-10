/**
 * Issue #167 roadmap RD-001-DELTA-01 — 미디어 블록 url attrs 등 저장 원본
 * 검증(`isSupportedLinkHref`, `validateBlocks`)을 위반하는 DOM-origin
 * transaction이 ProseMirror state에 최종 commit되지 않는지 고정한다.
 * 이전에는 이런 transaction이 일단 commit된 뒤 `onTiptapUpdate`의
 * `readEditorDocument`가 uncaught `TypeError`를 던져 model↔editor가 영구
 * desync됐다. `revisionGuard`(revision-guard-extension.ts)의
 * appendTransaction 훅이 같은 batch의 다른 모든 appendTransaction(예:
 * BlockIdExtension의 ID 충돌 재발급)이 끝난 뒤의 최종 문서를 검증하고,
 * 여전히 무효면 batch 전체를 원래 문서로 되돌린다 — `onBeforeChange` 등록
 * 여부와 무관하게 항상 적용된다.
 */
import { describe, expect, it } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import { createEditor } from "../src/index.js";
import {
  documentOf,
  editorState,
  mediaBlock,
  mounted,
  mountTiptapEditor,
} from "./editor-controller-support.js";

/**
 * 마운트된 에디터에서 blockId 노드의 `url` attr을 정상 명령(setMediaBlockUrl
 * 등)을 거치지 않고 raw ProseMirror transaction으로 직접 덮어쓴다 —
 * `url` attrs 직접 조작(정책 위반 경로 재현, Issue #167 재현 경로와 동일)을
 * 흉내 낸다.
 */
const dispatchRawUrlAttribute = (
  tiptap: ReturnType<typeof mounted>["tiptap"],
  blockId: string,
  url: string,
): void => {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  if (position === null) throw new Error(`블록을 찾지 못함: ${blockId}`);
  tiptap.view.dispatch(tiptap.state.tr.setNodeAttribute(position, "url", url));
};

describe("DOM-origin transaction의 최종 문서 구조 검증(Issue #167)", () => {
  it("onBeforeChange 미등록 세션에서 미디어 url attrs에 정책 위반 값을 직접 넣는 transaction은 되돌려진다", () => {
    const initialDocument = documentOf(
      mediaBlock("image", "media-1", { url: "https://example.com/a.png" }),
    );
    const { editor, tiptap } = mounted(initialDocument);
    const before = editorState(editor, tiptap);
    const beforeDoc = tiptap.state.doc;

    expect(() =>
      dispatchRawUrlAttribute(tiptap, "media-1", "blob:evil"),
    ).not.toThrow();

    expect(tiptap.state.doc.eq(beforeDoc)).toBe(true);
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("onBeforeChange가 등록된 세션에서도 동일하게 되돌려지고 consumer는 호출되지 않는다", () => {
    const initialDocument = documentOf(
      mediaBlock("image", "media-1", { url: "https://example.com/a.png" }),
    );
    const onBeforeChangeCalls: unknown[] = [];
    const editor = createEditor({
      initialDocument,
      onBeforeChange: (context) => {
        onBeforeChangeCalls.push(context);
        return true;
      },
    });
    const { tiptap } = mountTiptapEditor(editor);
    const beforeDoc = tiptap.state.doc;

    dispatchRawUrlAttribute(tiptap, "media-1", "blob:evil");

    expect(tiptap.state.doc.eq(beforeDoc)).toBe(true);
    expect(onBeforeChangeCalls).toEqual([]);
  });

  it("구조적으로 유효한 정상 편집은 그대로 commit된다", () => {
    const initialDocument = documentOf(
      mediaBlock("image", "media-1", { url: "https://example.com/a.png" }),
    );
    const { editor, tiptap } = mounted(initialDocument);
    const beforeDoc = tiptap.state.doc;

    dispatchRawUrlAttribute(tiptap, "media-1", "https://example.com/b.png");

    expect(tiptap.state.doc.eq(beforeDoc)).toBe(false);
    expect(editor.getDocument().blocks[0]).toMatchObject({
      id: "media-1",
      url: "https://example.com/b.png",
    });
  });
});
