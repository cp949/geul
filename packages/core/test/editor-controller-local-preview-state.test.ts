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
import {
  isMediaBlock,
  type Block,
  type ParagraphBlock,
} from "@cp949/geul-model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import { contentTextStart } from "./block-test-support.js";
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

/** 블록 목록의 후손 중 미디어 블록 id를 문서 순서로 모은다. */
const mediaIdsOf = (blocks: readonly Block[]): string[] =>
  blocks.flatMap((block) => [
    ...(isMediaBlock(block) ? [block.id] : []),
    ...mediaIdsOf("children" in block ? (block.children ?? []) : []),
  ]);

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
  it("프리뷰가 있는 미디어를 복제하고 undo한 뒤 새 편집으로 redo 스택이 비면 복제본 자신의 URL로만 통지하고 원본은 영향받지 않는다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      );
    seedLocalPreview(tiptap, "m-1", testFile());
    const originalBefore = previewAttrsOf(tiptap, "m-1");

    expect(editor.commands.duplicateBlock("m-1").ok).toBe(true);
    const duplicateUrl = previewAttrsOf(tiptap, "id-1").localPreviewUrl;
    expect(editor.commands.undo()).toEqual(okResult);
    // redo로 되살릴 수 있는 동안은 통지하지 않는다(Issue #380). 새 편집이
    // redo 스택을 비운 뒤에야 복제본 자신의 URL로만 통지한다.
    expect(localPreviewCleared).toEqual([]);
    tiptap.view.dispatch(
      tiptap.state.tr.insertText("x", contentTextStart(tiptap, "tail")),
    );

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

  it.each(["file", "video", "audio"] as const)(
    "%s 미디어를 복제해도 복제본은 새 blob URL과 같은 File을 가진다",
    (kind) => {
      const { editor, tiptap } = mountedWithLocalPreviewCleanup(
        documentOf(mediaBlock(kind, "m-1"), tailParagraphBlock),
      );
      const file = testFile();
      seedLocalPreview(tiptap, "m-1", file);
      const original = previewAttrsOf(tiptap, "m-1");

      expect(editor.commands.duplicateBlock("m-1").ok).toBe(true);

      const duplicate = previewAttrsOf(tiptap, "id-1");
      expect(duplicate.localPreviewUrl).toEqual(expect.any(String));
      expect(duplicate.localPreviewUrl).not.toBe(original.localPreviewUrl);
      expect(duplicate.localPreviewFile).toBe(file);
    },
  );

  it("형제와 손자 깊이의 미디어도 모두 서로 다른 새 blob URL을 받는다", () => {
    const { editor, tiptap } = mountedWithLocalPreviewCleanup(
      documentOf(
        paragraphBlock("p-1", "부모", [
          mediaBlock("image", "m-1"),
          paragraphBlock("p-2", "중간", [mediaBlock("video", "m-2")]),
        ]),
        tailParagraphBlock,
      ),
    );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    seedLocalPreview(tiptap, "m-2", file);
    const originalUrls = ["m-1", "m-2"].map(
      (id) => previewAttrsOf(tiptap, id).localPreviewUrl,
    );

    expect(editor.commands.duplicateBlock("p-1").ok).toBe(true);

    const copiedParent = editor
      .getDocument()
      .blocks.find(
        (block): block is ParagraphBlock =>
          block.id !== "p-1" && block.type === "paragraph",
      );
    const copiedMediaIds = mediaIdsOf(copiedParent?.children ?? []);
    expect(copiedMediaIds).toHaveLength(2);
    const copiedUrls = copiedMediaIds.map((id) => {
      const copied = previewAttrsOf(tiptap, id);
      expect(copied.localPreviewFile).toBe(file);
      return copied.localPreviewUrl;
    });
    expect(new Set([...originalUrls, ...copiedUrls]).size).toBe(4);
  });
});

describe("duplicateBlock — 발급 후 문서에 못 들어간 프리뷰(Issue #379)", () => {
  const revertKey = new PluginKey("test-revert-batch");
  let unregisterRevertPlugin: (() => void) | null = null;

  afterEach(() => {
    unregisterRevertPlugin?.();
    unregisterRevertPlugin = null;
    vi.restoreAllMocks();
  });

  /** 기본 문서(프리뷰 image m-1)를 마운트하고 이후 거절 스위치를 돌려준다. */
  const mountedRejecting = (blocks: readonly Block[], seedIds: string[]) => {
    const gate = { reject: false };
    const mountedEditor = mountedWithLocalPreviewCleanup(
      documentOf(...blocks, tailParagraphBlock),
      { onBeforeChange: () => (gate.reject ? false : undefined) },
    );
    const file = testFile();
    for (const id of seedIds) seedLocalPreview(mountedEditor.tiptap, id, file);
    return { ...mountedEditor, gate, file };
  };

  it("onBeforeChange가 거절하면 발급한 URL을 복제본 id로 정확히 1건 통지하고 원본 m-1은 통지하지 않는다", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const { editor, tiptap, gate, file, localPreviewCleared } =
      mountedRejecting([mediaBlock("image", "m-1")], ["m-1"]);
    const originalBefore = previewAttrsOf(tiptap, "m-1");
    const documentBefore = editor.getDocument();
    createObjectUrl.mockClear();
    gate.reject = true;

    expect(editor.commands.duplicateBlock("m-1")).toEqual(
      notApplicable("duplicateBlock"),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const issuedUrl = createObjectUrl.mock.results[0]?.value as string;
    expect(localPreviewCleared).toEqual([
      { blockId: "id-1", localPreviewUrl: issuedUrl, localPreviewFile: file },
    ]);
    expect(localPreviewCleared[0]?.localPreviewFile).toBe(file);
    expect(editor.getDocument()).toEqual(documentBefore);
    expect(previewAttrsOf(tiptap, "m-1")).toEqual(originalBefore);
    expect(localPreviewCleared.map((c) => c.localPreviewUrl)).not.toContain(
      originalBefore.localPreviewUrl,
    );
  });

  it("하위 트리의 프리뷰 미디어 2개를 거절시키면 복제본 자신의 id·URL로 2건 통지한다", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const { editor, gate, file, localPreviewCleared } = mountedRejecting(
      [
        paragraphBlock("p-1", "부모", [
          mediaBlock("image", "m-1"),
          paragraphBlock("p-2", "중간", [mediaBlock("video", "m-2")]),
        ]),
      ],
      ["m-1", "m-2"],
    );
    createObjectUrl.mockClear();
    gate.reject = true;

    expect(editor.commands.duplicateBlock("p-1")).toEqual(
      notApplicable("duplicateBlock"),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    const issuedUrls = createObjectUrl.mock.results.map(
      (result) => result.value as string,
    );
    expect(localPreviewCleared).toHaveLength(2);
    expect(
      localPreviewCleared.map((cleared) => cleared.localPreviewUrl).sort(),
    ).toEqual([...issuedUrls].sort());
    for (const cleared of localPreviewCleared) {
      expect(["m-1", "m-2", "p-1", "p-2"]).not.toContain(cleared.blockId);
      expect(cleared.localPreviewFile).toBe(file);
    }
    expect(new Set(localPreviewCleared.map((c) => c.blockId)).size).toBe(2);
  });

  it("clone 도중 RangeError가 나면 던지기 전에 발급한 URL 1건을 통지한다", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    // 처음 두 호출(루트 복제본 id, m-1 복제 id)만 유효하고 이후는 이미
    // 점유된 "id-1"만 반환해 c-2 복제 id 재발급에서 RangeError가 난다.
    let calls = 0;
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(
        documentOf(
          paragraphBlock("p-1", "부모", [
            mediaBlock("image", "m-1"),
            paragraphBlock("c-2", "자식"),
          ]),
          tailParagraphBlock,
        ),
        {
          createId: () => {
            calls += 1;
            return calls <= 2 ? `id-${calls}` : "id-1";
          },
        },
      );
    const file = testFile();
    seedLocalPreview(tiptap, "m-1", file);
    createObjectUrl.mockClear();
    const documentBefore = editor.getDocument();

    expect(() => editor.commands.duplicateBlock("p-1")).toThrow(
      new RangeError(
        "createId failed to return a valid unique document id after 100 attempts",
      ),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const issuedUrl = createObjectUrl.mock.results[0]?.value as string;
    expect(localPreviewCleared).toEqual([
      { blockId: "id-2", localPreviewUrl: issuedUrl, localPreviewFile: file },
    ]);
    expect(editor.getDocument()).toEqual(documentBefore);
  });

  it("appendTransaction이 batch를 되돌려 복제본이 문서에 못 들어가면 발급한 URL 1건을 통지한다", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const { editor, tiptap, file, localPreviewCleared } = mountedRejecting(
      [mediaBlock("image", "m-1")],
      ["m-1"],
    );
    // root transaction이 적용된 뒤 문서를 oldState로 되돌리는 임시 플러그인.
    // RevisionGuardExtension이 최종 문서 무효로 batch를 되돌리는 경로와 같은
    // 모양이다(도달 가능한 입력으로는 최종 문서를 무효로 만들 수 없다).
    tiptap.registerPlugin(
      new Plugin({
        key: revertKey,
        appendTransaction: (_transactions, oldState, newState) =>
          newState.doc.eq(oldState.doc)
            ? null
            : newState.tr.replaceWith(
                0,
                newState.doc.content.size,
                oldState.doc.content,
              ),
      }),
    );
    unregisterRevertPlugin = () => tiptap.unregisterPlugin(revertKey);
    const documentBefore = editor.getDocument();
    createObjectUrl.mockClear();

    expect(editor.commands.duplicateBlock("m-1")).toEqual(
      notApplicable("duplicateBlock"),
    );

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const issuedUrl = createObjectUrl.mock.results[0]?.value as string;
    expect(localPreviewCleared).toEqual([
      { blockId: "id-1", localPreviewUrl: issuedUrl, localPreviewFile: file },
    ]);
    expect(editor.getDocument()).toEqual(documentBefore);
  });

  it("호스트 onChange가 복제본을 동기로 지워도 undo 가능한 블록이라 그 시점에는 통지하지 않는다", () => {
    let deleted = false;
    const mounted = mountedWithLocalPreviewCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      {
        onChange: () => {
          if (deleted) return;
          deleted = true;
          mounted.editor.commands.deleteBlock("id-1");
        },
      },
    );
    seedLocalPreview(mounted.tiptap, "m-1", testFile());

    mounted.editor.commands.duplicateBlock("m-1");

    expect(deleted).toBe(true);
    expect(findBlockPosition(mounted.tiptap.state.doc, "id-1")).toBeNull();
    expect(findBlockPosition(mounted.tiptap.state.doc, "m-1")).not.toBeNull();
    expect(mounted.localPreviewCleared).toEqual([]);
  });

  it("호스트 onChange가 replaceDocument를 부르면 복제본 URL은 replaceDocument의 통지 1회뿐이다", () => {
    let replaced = false;
    const mounted = mountedWithLocalPreviewCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      {
        onChange: () => {
          if (replaced) return;
          replaced = true;
          mounted.editor.replaceDocument(documentOf(tailParagraphBlock));
        },
      },
    );
    seedLocalPreview(mounted.tiptap, "m-1", testFile());

    mounted.editor.commands.duplicateBlock("m-1");

    expect(replaced).toBe(true);
    expect(
      mounted.localPreviewCleared.map((cleared) => cleared.blockId).sort(),
    ).toEqual(["id-1", "m-1"]);
  });

  it("거절되지 않는 복제는 통지하지 않는다", () => {
    const { editor, localPreviewCleared } = mountedRejecting(
      [mediaBlock("image", "m-1")],
      ["m-1"],
    );

    expect(editor.commands.duplicateBlock("m-1").ok).toBe(true);

    expect(localPreviewCleared).toEqual([]);
  });
});
