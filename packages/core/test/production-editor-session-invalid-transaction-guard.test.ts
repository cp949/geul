/**
 * Issue #167 roadmap RD-001-DELTA-01 — 미디어 블록 url attrs 등 저장 원본
 * 검증(`isSupportedMediaUrl`, `validateBlocks`)을 위반하는 DOM-origin
 * transaction이 ProseMirror state에 최종 commit되지 않는지 고정한다.
 * 이전에는 이런 transaction이 일단 commit된 뒤 `onTiptapUpdate`의
 * `readEditorDocument`가 uncaught `TypeError`를 던져 model↔editor가 영구
 * desync됐다. `revisionGuard`(revision-guard-extension.ts)의
 * appendTransaction 훅이 같은 batch의 다른 모든 appendTransaction(예:
 * BlockIdExtension의 ID 충돌 재발급)이 끝난 뒤의 최종 문서를 검증하고,
 * 여전히 무효면 batch 전체를 원래 문서로 되돌린다 — `onBeforeChange` 등록
 * 여부와 무관하게 항상 적용된다.
 *
 * Issue #317이 더한 축: 되돌림 transaction이 되돌림 전 selection을 복원한다.
 * 문서 전체 replaceWith는 selection을 문서 끝으로 매핑해 캐럿이 엉뚱한 곳으로
 * 갔다. TextSelection·CellSelection·NodeSelection을 복원하고, 복원이 실패해도
 * 예외로 번지지 않는다. undo 항목을 없애는 처리(addToHistory: false)는 하지
 * 않는다. 루트 transaction의 항목이 이미 남아 효과가 없다.
 */
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it, vi } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import { createEditor } from "../src/index.js";
import {
  documentOf,
  editorState,
  mediaBlock,
  mounted,
  mountTiptapEditor,
  oneCellTableBlock,
  paragraphBlock,
} from "./editor-controller-support.js";
import { contentTextStart } from "./block-test-support.js";
import { selectSingleCell } from "./table-test-support.js";

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

    // blob:은 spec §3.2 2026-09-11 개정(ADR-0017)으로 media url에서
    // 허용됐다 — 이 guard가 여전히 되돌리는 위반 예시는 javascript:로
    // 바꾼다.
    expect(() =>
      dispatchRawUrlAttribute(tiptap, "media-1", "javascript:evil"),
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

    dispatchRawUrlAttribute(tiptap, "media-1", "javascript:evil");

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

describe("되돌림 transaction이 되돌림 전 selection을 복원한다(Issue #317)", () => {
  const fixture = () =>
    mounted(
      documentOf(
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "media-1", { url: "https://example.com/a.png" }),
        oneCellTableBlock("t-1"),
        paragraphBlock("tail", "tail"),
      ),
    );

  /** 정책 위반 url을 넣는 root transaction. selection은 그대로 둔다. */
  const dispatchInvalid = (tiptap: ReturnType<typeof fixture>["tiptap"]) =>
    dispatchRawUrlAttribute(tiptap, "media-1", "javascript:evil");

  it("TextSelection은 되돌림 뒤에도 같은 캐럿이다", () => {
    const { tiptap } = fixture();
    const caret = contentTextStart(tiptap, "p-1") + 2;
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(tiptap.state.doc, caret),
      ),
    );
    const selection = tiptap.state.selection;
    const doc = tiptap.state.doc;

    dispatchInvalid(tiptap);

    expect(tiptap.state.doc.eq(doc)).toBe(true);
    expect(tiptap.state.selection.eq(selection)).toBe(true);
  });

  it("범위 TextSelection도 같은 anchor·head다", () => {
    const { tiptap } = fixture();
    const start = contentTextStart(tiptap, "p-1");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(tiptap.state.doc, start + 4, start + 1),
      ),
    );
    const selection = tiptap.state.selection;

    dispatchInvalid(tiptap);

    expect(tiptap.state.selection.eq(selection)).toBe(true);
  });

  it("CellSelection은 되돌림 뒤에도 같은 셀 선택이다", () => {
    const { tiptap } = fixture();
    selectSingleCell(tiptap, "cell-1");
    const selection = tiptap.state.selection;
    expect(selection).toBeInstanceOf(CellSelection);

    dispatchInvalid(tiptap);

    expect(tiptap.state.selection).toBeInstanceOf(CellSelection);
    expect(tiptap.state.selection.eq(selection)).toBe(true);
  });

  it("NodeSelection은 되돌림 뒤에도 같은 노드 선택이다", () => {
    const { tiptap } = fixture();
    const position = findBlockPosition(tiptap.state.doc, "media-1");
    if (position === null) throw new Error("media-1을 찾지 못함");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        NodeSelection.create(tiptap.state.doc, position),
      ),
    );
    const selection = tiptap.state.selection;
    expect(selection).toBeInstanceOf(NodeSelection);

    dispatchInvalid(tiptap);

    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(tiptap.state.selection.eq(selection)).toBe(true);
  });

  it("selection을 옮기는 root transaction이 되돌려지면 옮기기 전 selection으로 돌아온다", () => {
    const { tiptap } = fixture();
    const start = contentTextStart(tiptap, "p-1");
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(tiptap.state.doc, start + 1),
      ),
    );
    const selection = tiptap.state.selection;
    const position = findBlockPosition(tiptap.state.doc, "media-1");
    if (position === null) throw new Error("media-1을 찾지 못함");

    const tr = tiptap.state.tr.setNodeAttribute(
      position,
      "url",
      "javascript:evil",
    );
    tr.setSelection(
      TextSelection.create(tr.doc, contentTextStart(tiptap, "tail") + 2),
    );
    tiptap.view.dispatch(tr);

    expect(tiptap.state.selection.eq(selection)).toBe(true);
  });

  it("selection 복원이 예외를 던져도 되돌림은 끝나고 문서는 원래대로이며 캐럿은 옛 위치 근처로 물러난다", () => {
    const { editor, tiptap } = fixture();
    const caret = contentTextStart(tiptap, "p-1") + 2;
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(tiptap.state.doc, caret),
      ),
    );
    const before = editorState(editor, tiptap);
    const doc = tiptap.state.doc;
    const restore = vi.spyOn(Selection, "fromJSON").mockImplementation(() => {
      throw new RangeError("복원 실패");
    });

    try {
      expect(() => dispatchInvalid(tiptap)).not.toThrow();
    } finally {
      restore.mockRestore();
    }

    expect(tiptap.state.doc.eq(doc)).toBe(true);
    // 폴백은 옛 selection 시작 위치의 유효한 selection이다. 문서 끝이 아니다.
    expect(tiptap.state.selection.empty).toBe(true);
    expect(tiptap.state.selection.from).toBe(caret);
    expect(editorState(editor, tiptap).document.blocks).toEqual(
      before.document.blocks,
    );
  });

  it("stored mark도 되돌림 뒤에 그대로 남는다", () => {
    const { tiptap } = fixture();
    const bold = tiptap.schema.marks.bold;
    if (bold === undefined) throw new Error("bold mark 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr
        .setSelection(
          TextSelection.create(
            tiptap.state.doc,
            contentTextStart(tiptap, "p-1") + 2,
          ),
        )
        .setStoredMarks([bold.create()]),
    );
    expect(tiptap.state.storedMarks).toHaveLength(1);

    dispatchInvalid(tiptap);

    expect(tiptap.state.storedMarks).toHaveLength(1);
    expect(tiptap.state.storedMarks?.[0]?.type).toBe(bold);
  });
});
