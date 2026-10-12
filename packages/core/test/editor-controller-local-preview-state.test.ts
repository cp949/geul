/**
 * 로컬 프리뷰(ADR 0015) attrs가 거절·갱신 경로에서 조용히 바뀌거나 사라지지
 * 않음을 고정한다(Issue #376, G-EDT-001).
 *
 * 로컬 프리뷰(localPreviewUrl·localPreviewFile)는 저장 모델에 없는 PM 전용
 * attrs다. 거절 Result를 돌려주는 명령은 PM 상태를 바꾸지 않아야 하고,
 * 모델에서 노드를 다시 만드는 updateBlock은 프리뷰를 blockId로 이어받아야
 * 한다. url이 생기면 프리뷰를 정리하고 정리 전 값으로 통지한다.
 *
 * "url과 프리뷰가 공존하는 노드"는 프로덕션 불변식상 도달하지 않는다 —
 * seedLocalPreview로 심은 상태에서만 만든다(계약 고정용).
 */
import { describe, expect, it } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import {
  documentOf,
  editorState,
  mediaBlock,
  mountedWithLocalPreviewCleanup,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
  seedLocalPreview,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const imageUrl = "https://example.com/a.png";

const testFile = () => new File(["binary"], "stale.png", { type: "image/png" });

/** blockId 노드의 현재 PM attrs 중 로컬 프리뷰 2종을 읽는다. */
const previewAttrsOf = (
  tiptap: ReturnType<typeof mountedWithLocalPreviewCleanup>["tiptap"],
  blockId: string,
) => {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  const node = position === null ? null : tiptap.state.doc.nodeAt(position);
  if (node === null) throw new Error(`블록 ${blockId} 조회 실패`);
  return {
    localPreviewUrl: node.attrs.localPreviewUrl as unknown,
    localPreviewFile: node.attrs.localPreviewFile as unknown,
  };
};

describe("setMediaBlockUrl — 로컬 프리뷰와 거절", () => {
  it("url과 프리뷰가 공존하는 노드에 같은 url을 setMediaBlockUrl로 적용하면 거절되고 PM 상태가 바뀌지 않는다", () => {
    const { editor, tiptap, changes, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(
          mediaBlock("image", "m-1", { url: imageUrl }),
          tailParagraphBlock,
        ),
      );
    seedLocalPreview(tiptap, "m-1", testFile());
    const stateBefore = tiptap.state;
    const previewBefore = previewAttrsOf(tiptap, "m-1");

    expect(editor.commands.setMediaBlockUrl("m-1", imageUrl)).toEqual(
      notApplicable("setMediaBlockUrl"),
    );

    expect(tiptap.state).toBe(stateBefore);
    expect(previewAttrsOf(tiptap, "m-1")).toEqual(previewBefore);
    expect(changes).toEqual([]);
    expect(localPreviewCleared).toEqual([]);
  });

  it("프리뷰만 있는 노드에 새 url을 적용하면 프리뷰를 정리하고 통지를 1회 낸다(회귀 방지)", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    const stale = previewAttrsOf(tiptap, "m-1");

    expect(editor.commands.setMediaBlockUrl("m-1", imageUrl)).toEqual(okResult);

    expect(previewAttrsOf(tiptap, "m-1")).toEqual({
      localPreviewUrl: null,
      localPreviewFile: null,
    });
    expect(localPreviewCleared).toEqual([
      {
        blockId: "m-1",
        localPreviewUrl: stale.localPreviewUrl,
        localPreviewFile: file,
      },
    ]);
  });
});

describe("updateBlock — 로컬 프리뷰 이어받기", () => {
  it("프리뷰가 있는 미디어에 updateBlock으로 다른 필드를 바꿔도 프리뷰를 유지하고 통지하지 않는다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    const seeded = previewAttrsOf(tiptap, "m-1");

    const result = editor.updateBlock("m-1", {
      type: "image",
      caption: "cap",
    });

    expect(result.ok).toBe(true);
    expect(previewAttrsOf(tiptap, "m-1")).toEqual(seeded);
    expect(previewAttrsOf(tiptap, "m-1").localPreviewFile).toBe(file);
    expect(localPreviewCleared).toEqual([]);
    expect(editor.getPendingLocalPreviews()).toEqual([
      { blockId: "m-1", file },
    ]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(previewAttrsOf(tiptap, "m-1").localPreviewUrl).toEqual(
      expect.any(String),
    );
  });

  it("updateBlock으로 url을 주면 프리뷰를 정리하고 정리 전 값으로 통지를 1회 낸다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    const stale = previewAttrsOf(tiptap, "m-1");

    const result = editor.updateBlock("m-1", { type: "image", url: imageUrl });

    expect(result.ok).toBe(true);
    expect(previewAttrsOf(tiptap, "m-1")).toEqual({
      localPreviewUrl: null,
      localPreviewFile: null,
    });
    expect(localPreviewCleared).toEqual([
      {
        blockId: "m-1",
        localPreviewUrl: stale.localPreviewUrl,
        localPreviewFile: file,
      },
    ]);
  });

  it("프리뷰를 가진 자식 미디어는 부모를 updateBlock해도 유지된다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(
          paragraphBlock("p-1", "one", [mediaBlock("image", "m-1")]),
          tailParagraphBlock,
        ),
      );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    const seeded = previewAttrsOf(tiptap, "m-1");

    const result = editor.updateBlock("p-1", {
      type: "paragraph",
      textColor: "#AABBCC",
    });

    expect(result.ok).toBe(true);
    expect(previewAttrsOf(tiptap, "m-1")).toEqual(seeded);
    expect(localPreviewCleared).toEqual([]);
    expect(editor.getPendingLocalPreviews()).toEqual([
      { blockId: "m-1", file },
    ]);
  });

  it("url과 프리뷰가 공존하는 노드에 같은 내용으로 updateBlock하면 거절되고 PM 상태가 바뀌지 않는다", () => {
    const { editor, tiptap, changes, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(
          mediaBlock("image", "m-1", { url: imageUrl }),
          tailParagraphBlock,
        ),
      );
    seedLocalPreview(tiptap, "m-1", testFile());
    const stateBefore = tiptap.state;
    const previewBefore = previewAttrsOf(tiptap, "m-1");

    expect(editor.updateBlock("m-1", { type: "image" })).toEqual(
      notApplicable("updateBlock"),
    );

    expect(tiptap.state).toBe(stateBefore);
    expect(previewAttrsOf(tiptap, "m-1")).toEqual(previewBefore);
    expect(changes).toEqual([]);
    expect(localPreviewCleared).toEqual([]);
  });

  it("프리뷰가 없는 미디어의 updateBlock은 이전과 같다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(
          mediaBlock("image", "m-1", { url: imageUrl }),
          tailParagraphBlock,
        ),
      );
    const before = editorState(editor, tiptap);

    const result = editor.updateBlock("m-1", { type: "image", caption: "c" });
    expect(result.ok).toBe(true);
    expect(editor.updateBlock("m-1", { type: "image", caption: "c" })).toEqual(
      notApplicable("updateBlock"),
    );
    expect(localPreviewCleared).toEqual([]);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });
});
