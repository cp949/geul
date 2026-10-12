/**
 * 로컬 프리뷰(ADR 0015) attrs가 거절·갱신 경로에서 조용히 바뀌거나 사라지지
 * 않음을 고정한다(Issue #376, G-EDT-001).
 *
 * 로컬 프리뷰(localPreviewUrl·localPreviewFile)는 저장 모델에 없는 PM 전용
 * attrs다. 거절 Result를 돌려주는 명령은 PM 상태를 바꾸지 않아야 하고,
 * 모델에서 노드를 다시 만드는 updateBlock은 프리뷰를 blockId로 이어받아야
 * 한다. url이 생기면 프리뷰를 정리하고 정리 전 값으로 통지한다.
 *
 * duplicateBlock은 복제본(하위 블록 포함)에 같은 File로 새 blob URL을
 * 발급해 두 블록이 URL을 공유하지 않게 한다(Issue #378).
 *
 * "url과 프리뷰가 공존하는 노드"는 프로덕션 불변식상 도달하지 않는다 —
 * seedLocalPreview로 심은 상태에서만 만든다(계약 고정용).
 */
import type { ParagraphBlock } from "@cp949/geul-model";
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

describe("duplicateBlock — 로컬 프리뷰", () => {
  it("프리뷰가 있는 미디어를 복제하고 undo하면 복제본 자신의 URL로만 통지하고 원본은 영향받지 않는다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      );
    seedLocalPreview(tiptap, "m-1", testFile());
    const originalBefore = previewAttrsOf(tiptap, "m-1");

    expect(editor.commands.duplicateBlock("m-1").ok).toBe(true);
    const duplicateUrl = previewAttrsOf(tiptap, "id-1").localPreviewUrl;
    expect(editor.commands.undo()).toEqual(okResult);

    expect(localPreviewCleared).toHaveLength(1);
    expect(localPreviewCleared[0]?.blockId).toBe("id-1");
    expect(localPreviewCleared[0]?.localPreviewUrl).toBe(duplicateUrl);
    expect(localPreviewCleared[0]?.localPreviewUrl).not.toBe(
      originalBefore.localPreviewUrl,
    );
    expect(previewAttrsOf(tiptap, "m-1")).toEqual(originalBefore);
  });

  it("복제본은 원본과 다른 새 blob URL과 같은 File을 가진다", () => {
    const { editor, tiptap } = mountedWithLocalPreviewCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    const original = previewAttrsOf(tiptap, "m-1");

    expect(editor.commands.duplicateBlock("m-1").ok).toBe(true);

    const duplicate = previewAttrsOf(tiptap, "id-1");
    expect(duplicate.localPreviewUrl).toEqual(expect.any(String));
    expect(duplicate.localPreviewUrl).not.toBe(original.localPreviewUrl);
    expect(duplicate.localPreviewFile).toBe(file);
  });

  it("복제 뒤 원본의 url을 확정해도 복제본의 프리뷰는 건드리지 않는다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      );
    seedLocalPreview(tiptap, "m-1", testFile());
    const original = previewAttrsOf(tiptap, "m-1");
    expect(editor.commands.duplicateBlock("m-1").ok).toBe(true);
    const duplicateBefore = previewAttrsOf(tiptap, "id-1");

    expect(editor.commands.setMediaBlockUrl("m-1", imageUrl)).toEqual(okResult);

    expect(localPreviewCleared).toHaveLength(1);
    expect(localPreviewCleared[0]?.blockId).toBe("m-1");
    expect(localPreviewCleared[0]?.localPreviewUrl).toBe(
      original.localPreviewUrl,
    );
    expect(
      localPreviewCleared.map((cleared) => cleared.localPreviewUrl),
    ).not.toContain(duplicateBefore.localPreviewUrl);
    expect(previewAttrsOf(tiptap, "id-1")).toEqual(duplicateBefore);
  });

  it("복제하면 원본과 복제본이 같은 File의 대기 항목으로 각각 나온다", () => {
    const { editor, tiptap } = mountedWithLocalPreviewCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);

    expect(editor.commands.duplicateBlock("m-1").ok).toBe(true);

    expect(editor.getPendingLocalPreviews()).toEqual([
      { blockId: "m-1", file },
      { blockId: "id-1", file },
    ]);
    const pending = editor.getPendingLocalPreviews();
    expect(pending[0]?.file).toBe(pending[1]?.file);
  });

  it("프리뷰를 가진 자식 미디어도 부모를 복제하면 새 blob URL과 같은 File을 받는다", () => {
    const { editor, tiptap } = mountedWithLocalPreviewCleanup(
      documentOf(
        paragraphBlock("p-1", "부모", [mediaBlock("image", "m-1")]),
        tailParagraphBlock,
      ),
    );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    const original = previewAttrsOf(tiptap, "m-1");

    expect(editor.commands.duplicateBlock("p-1").ok).toBe(true);

    const copiedParent = editor
      .getDocument()
      .blocks.find(
        (block): block is ParagraphBlock =>
          block.id !== "p-1" && block.type === "paragraph",
      );
    const copiedChildId = copiedParent?.children?.[0]?.id;
    if (copiedChildId === undefined) throw new Error("복제 자식 조회 실패");
    const copied = previewAttrsOf(tiptap, copiedChildId);
    expect(copiedChildId).not.toBe("m-1");
    expect(copied.localPreviewUrl).toEqual(expect.any(String));
    expect(copied.localPreviewUrl).not.toBe(original.localPreviewUrl);
    expect(copied.localPreviewFile).toBe(file);
  });
});
