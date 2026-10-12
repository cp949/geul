/**
 * 로컬 프리뷰(ADR 0015) URL이 문서에서 빠진 뒤(블록이 사라졌거나 블록이
 * 남은 채 URL만 빠진 경우, Issue #383) undo로도 redo로도
 * 복구 불가능해지는 시점 판정과 정리 신호(Issue #168 roadmap RD-002
 * DELTA-02, 상세 계획 `_works/roadmap/result/RD-002-DELTA-02.md`)를
 * 고정한다. 판정 방식은 `prosemirror-history` 공개 API(`undo`/`redo`/
 * `undoDepth`/`redoDepth`)만으로 실제 히스토리를 시뮬레이션한다(비공개
 * 상수 `DEPTH_OVERFLOW`에 의존하지 않음). 정리 신호는 기존
 * `onLocalPreviewCleanup` 채널을 재사용한다(url 확정 시 정리와 동일 채널 —
 * RD-002.md "결정"). Issue #169(roadmap RD-001
 * DELTA-01, 상세 계획 `_works/roadmap/result/RD-001-DELTA-01.md`)부터
 * `replaceDocument()`가 구 Editor를 폐기하기 직전 남은 로컬 프리뷰도 같은
 * 채널로 통지한다 — `destroy()`(세션 영구 종료)와 동일한 패턴을 네 번째
 * 트리거로 확장한다. Issue #380부터 판정은 undo뿐 아니라 redo 도달
 * 가능성도 본다 — redo 도달 describe가 고정한다.
 */
import type { Block, Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";
import { contentTextStart } from "./block-test-support.js";
import { findBlockPosition } from "../src/block-position.js";
import { createEditor, type CreateEditorOptions } from "../src/index.js";
import { createLocalPreviewAttrs } from "../src/media-local-preview.js";
import {
  BEYOND_DEPTH_AND_OVERFLOW,
  documentOf,
  growUndoHistory,
  localPreviewUrlOf,
  mediaBlock,
  mountedWithLocalPreviewCleanup,
  mountTiptapEditor,
  okResult,
  paragraphBlock,
  seedLocalPreview,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const testFile = (name = "photo.png") =>
  new File(["binary"], name, { type: "image/png" });

/**
 * `mounted()`(list-item-block-type-support.ts)와 같은 모양이되
 * `onLocalPreviewCleanup`만 배선한다(editor-controller-media-upload.test.ts의
 * `mountedWithUpload` 전례 — 이 파일 전용으로 다시 정의한다, 공유 모듈
 * 승격 대상 아님).
 */
const mountedWithCleanup = (
  initialDocument: Document,
  overrides: Pick<CreateEditorOptions, "uploadFile"> = {},
) => {
  const localPreviewCleared: {
    blockId: string;
    localPreviewUrl: string;
    localPreviewFile: File;
  }[] = [];
  const editor = createEditor({
    initialDocument,
    createId: sequentialIds("id"),
    onLocalPreviewCleanup: (blockId, cleared) =>
      localPreviewCleared.push({ blockId, ...cleared }),
    ...overrides,
  });
  return { editor, localPreviewCleared, ...mountTiptapEditor(editor) };
};

// depth(100)에 못 미치는 중간 지점 — 아직 evict되지 않았어야 한다.
const WELL_UNDER_DEPTH = 50;

describe("로컬 프리뷰 복구 불가 정리 신호(Issue #168 roadmap RD-002 DELTA-02)", () => {
  it("로컬 프리뷰가 있는 블록을 삭제한 직후 undo하면 정리 신호가 발생하지 않고 attrs가 복구된다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    const before = tiptap.state.doc.toJSON();

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    expect(localPreviewCleared).toEqual([]);
    expect(editor.commands.undo()).toEqual(okResult);

    expect(tiptap.state.doc.toJSON()).toEqual(before);
    expect(localPreviewCleared).toEqual([]);
  });

  it("로컬 프리뷰가 있는 블록을 삭제한 뒤 depth(100)를 초과하는 새 undo 이벤트가 쌓이면 정리 신호가 정확히 1회 발생한다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (node === null) throw new Error("m-1 조회 실패");
    const seededAttrs = {
      localPreviewUrl: node.attrs.localPreviewUrl as string,
      localPreviewFile: node.attrs.localPreviewFile as File,
    };

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);

    growUndoHistory(tiptap, WELL_UNDER_DEPTH);
    expect(localPreviewCleared).toEqual([]);

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW - WELL_UNDER_DEPTH);
    expect(localPreviewCleared).toEqual([{ blockId: "m-1", ...seededAttrs }]);
  });

  it("삭제된 로컬 프리뷰 블록이 실제 undo로 복구되면 이후 새 undo 이벤트가 쌓여도 정리 신호가 발생하지 않는다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(findBlockPosition(tiptap.state.doc, "m-1")).not.toBeNull();

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);
    expect(localPreviewCleared).toEqual([]);
  });

  it("로컬 프리뷰가 없는 일반 블록을 삭제해도 정리 신호가 발생하지 않는다", () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(paragraphBlock("p-1", "x"), tailParagraphBlock),
    );

    expect(editor.commands.deleteBlock("p-1")).toEqual(okResult);
    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);

    expect(localPreviewCleared).toEqual([]);
  });

  it("이미 url이 확정된 미디어 블록을 삭제해도 정리 신호가 발생하지 않는다", () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(
        mediaBlock("image", "m-1", { url: "https://example.com/a.png" }),
        tailParagraphBlock,
      ),
    );

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);

    expect(localPreviewCleared).toEqual([]);
  });

  it("uploadFile 콜백이 등록된 상태에서도(직접 attrs 세팅) 로컬 프리뷰 삭제 뒤 정리 신호가 발생한다", async () => {
    const uploadFile: CreateEditorOptions["uploadFile"] = () =>
      new Promise(() => {
        // 이 테스트는 업로드 완료를 기다리지 않는다 — uploadFile 등록
        // 여부와 무관하게 확장이 항상 동작하는지만 확인한다(영구 pending).
      });
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
      { uploadFile },
    );
    // uploadFile이 등록돼 있으면 uploadMediaFile은 로컬 프리뷰로 대체하지
    // 않는다(RD-001) — PM 트랜잭션을 직접 dispatch해 로컬 프리뷰 attrs를
    // 세팅한다(editor-controller-media-upload.test.ts의 seedLocalPreview
    // 전례와 동일 근거, 공개 명령 표면에 이 상태를 만드는 경로가 없다).
    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (position === null || node === null) throw new Error("m-1 조회 실패");
    const transaction = tiptap.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      localPreviewUrl: "blob:seeded",
      localPreviewFile: testFile(),
    });
    tiptap.view.dispatch(transaction);

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);

    expect(localPreviewCleared).toEqual([
      {
        blockId: "m-1",
        localPreviewUrl: "blob:seeded",
        localPreviewFile: expect.any(File),
      },
    ]);
  });
});

describe("로컬 프리뷰 세션 종료 시 잔여 정리(Issue #168 roadmap RD-002 DELTA-03)", () => {
  it("url 확정도 복구 불가 판정도 받지 않은 채 남은 로컬 프리뷰는 destroy() 시 정리 신호가 1회 발생한다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(
        mediaBlock("image", "m-1"),
        mediaBlock("image", "m-2", { url: "https://example.com/b.png" }),
        tailParagraphBlock,
      ),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (node === null) throw new Error("m-1 조회 실패");
    const seededAttrs = {
      localPreviewUrl: node.attrs.localPreviewUrl as string,
      localPreviewFile: node.attrs.localPreviewFile as File,
    };

    editor.destroy();

    // m-2는 이미 url이 확정돼 있어 대상이 아니다 — m-1만 정확히 1회.
    expect(localPreviewCleared).toEqual([{ blockId: "m-1", ...seededAttrs }]);
  });

  it("로컬 프리뷰가 전혀 없는 세션의 destroy()는 정리 신호를 내지 않는다", () => {
    const { editor, localPreviewCleared } = mountedWithCleanup(
      documentOf(paragraphBlock("p-1", "x"), tailParagraphBlock),
    );

    editor.destroy();

    expect(localPreviewCleared).toEqual([]);
  });

  // 구현 중 발견 — doc 순회(collectLocalPreviewBlocks)만으로는 이 경우를
  // 놓친다: 삭제된 로컬 프리뷰는 doc에서 이미 사라져 있고, 복구 불가
  // 판정은 아직 나지 않아 MediaLocalPreviewLifecycleExtension의 pending
  // Map에만 남아 있다. destroy()가 그 pending도 함께 훑어야 한다.
  it("로컬 프리뷰가 있는 블록을 삭제한 직후(복구 불가 판정 전) destroy()해도 정리 신호가 발생한다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (node === null) throw new Error("m-1 조회 실패");
    const seededAttrs = {
      localPreviewUrl: node.attrs.localPreviewUrl as string,
      localPreviewFile: node.attrs.localPreviewFile as File,
    };

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    // depth(100)를 넘는 새 undo 이벤트를 쌓지 않는다 — 복구 불가 판정이
    // 아직 나지 않은 채로(WELL_UNDER_DEPTH만큼도 쌓지 않음) 즉시 destroy().
    editor.destroy();

    expect(localPreviewCleared).toEqual([{ blockId: "m-1", ...seededAttrs }]);
  });
});

describe("로컬 프리뷰 replaceDocument() 교체 시 정리(Issue #169 roadmap RD-001 DELTA-01)", () => {
  it("로컬 프리뷰가 있는 블록을 포함한 문서에서 replaceDocument()를 호출하면 그 로컬 프리뷰가 정확히 1회 통지된다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(
        mediaBlock("image", "m-1"),
        mediaBlock("image", "m-2", { url: "https://example.com/b.png" }),
        tailParagraphBlock,
      ),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (node === null) throw new Error("m-1 조회 실패");
    const seededAttrs = {
      localPreviewUrl: node.attrs.localPreviewUrl as string,
      localPreviewFile: node.attrs.localPreviewFile as File,
    };

    expect(
      editor.replaceDocument(
        documentOf(paragraphBlock("p-1", "replaced"), tailParagraphBlock),
      ),
    ).toEqual(okResult);

    // m-2는 이미 url이 확정돼 있어 대상이 아니다 — m-1만 정확히 1회.
    expect(localPreviewCleared).toEqual([{ blockId: "m-1", ...seededAttrs }]);
  });

  // doc 순회(collectLocalPreviewBlocks)만으로는 삭제된 뒤 복구 불가 판정
  // 전이라 pending에만 남은 블록을 못 본다(DELTA-03과 동일 실측 근거) —
  // replaceDocument()도 destroy()와 같은 두 번째 순회(pendingUnreachable
  // LocalPreviews)가 필요하다는 것을 고정한다.
  it("로컬 프리뷰가 있는 블록을 삭제한 직후(복구 불가 판정 전) replaceDocument()를 호출해도 정리 신호가 발생한다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (node === null) throw new Error("m-1 조회 실패");
    const seededAttrs = {
      localPreviewUrl: node.attrs.localPreviewUrl as string,
      localPreviewFile: node.attrs.localPreviewFile as File,
    };

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    expect(
      editor.replaceDocument(
        documentOf(paragraphBlock("p-1", "replaced"), tailParagraphBlock),
      ),
    ).toEqual(okResult);

    expect(localPreviewCleared).toEqual([{ blockId: "m-1", ...seededAttrs }]);
  });

  it("로컬 프리뷰가 없는 문서에서 replaceDocument()를 호출해도 정리 신호가 발생하지 않는다", () => {
    const { editor, localPreviewCleared } = mountedWithCleanup(
      documentOf(
        mediaBlock("image", "m-2", { url: "https://example.com/b.png" }),
        tailParagraphBlock,
      ),
    );

    expect(
      editor.replaceDocument(
        documentOf(paragraphBlock("p-1", "replaced"), tailParagraphBlock),
      ),
    ).toEqual(okResult);

    expect(localPreviewCleared).toEqual([]);
  });

  // 완료 기준(후보) 3의 확인 항목(RD-001.md "결정") — 새 문서가 동일
  // blockId로 블록을 유지해도 구 로컬 프리뷰는 정리 대상에서 배제되지
  // 않는다. 로컬 프리뷰 attrs는 model에 왕복하지 않으므로(ADR 0015) 새
  // m-1은 애초에 로컬 프리뷰를 이어받을 방법이 없다 — 스윕이 blockId
  // 생존 여부로 배제하는 로직을 잘못 추가하면 이 테스트가 잡는다.
  it("교체 후에도 동일 blockId로 블록이 남아도 구 로컬 프리뷰는 정리 대상에서 배제되지 않는다", async () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (node === null) throw new Error("m-1 조회 실패");
    const seededAttrs = {
      localPreviewUrl: node.attrs.localPreviewUrl as string,
      localPreviewFile: node.attrs.localPreviewFile as File,
    };

    expect(
      editor.replaceDocument(
        documentOf(
          mediaBlock("image", "m-1", { caption: "replaced" }),
          tailParagraphBlock,
        ),
      ),
    ).toEqual(okResult);

    expect(localPreviewCleared).toEqual([{ blockId: "m-1", ...seededAttrs }]);
  });

  // 세션 필드(pendingUnreachableLocalPreviews)를 통해 통지한 blockId를
  // replaceDocument()가 리셋하지 않으면, 뒤이은 destroy()가 같은 blockId를
  // 다시 순회해 중복 통지한다 — "정확히 1회"(완료 조건 1)를 어기는 회귀를
  // 고정한다.
  it("replaceDocument()가 통지한 로컬 프리뷰는 뒤이은 destroy()에서 다시 통지되지 않는다", async () => {
    const { editor, localPreviewCleared } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    await editor.commands.uploadMediaFile("m-1", testFile());
    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);

    expect(
      editor.replaceDocument(
        documentOf(paragraphBlock("p-1", "replaced"), tailParagraphBlock),
      ),
    ).toEqual(okResult);
    expect(localPreviewCleared).toHaveLength(1);

    editor.destroy();

    expect(localPreviewCleared).toHaveLength(1);
  });
});

describe("로컬 프리뷰 redo 도달 가능성(Issue #380)", () => {
  /**
   * m-1에 프리뷰를 심고 복제해 id-1을 만든다. 복제본의 URL을 함께 돌려준다.
   * `priorEdits`는 복제 앞에 쌓을 독립 undo 이벤트 수다.
   */
  const mountedWithDuplicate = (priorEdits = 0) => {
    const mounted = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    seedLocalPreview(mounted.tiptap, "m-1", testFile());
    growUndoHistory(mounted.tiptap, priorEdits);
    expect(mounted.editor.commands.duplicateBlock("m-1").ok).toBe(true);
    const duplicateUrl = localPreviewUrlOf(mounted.tiptap, "id-1");
    if (duplicateUrl === null) throw new Error("id-1 복제 실패");
    return { ...mounted, duplicateUrl };
  };

  it("복제한 프리뷰 블록을 undo해도 정리 신호가 없고 redo로 돌아온 블록은 같은 URL을 가진다", () => {
    const { editor, localPreviewCleared, tiptap, duplicateUrl } =
      mountedWithDuplicate();

    expect(editor.commands.undo()).toEqual(okResult);
    expect(localPreviewCleared).toEqual([]);
    expect(findBlockPosition(tiptap.state.doc, "id-1")).toBeNull();

    expect(editor.commands.redo()).toEqual(okResult);
    expect(localPreviewCleared).toEqual([]);
    expect(localPreviewUrlOf(tiptap, "id-1")).toBe(duplicateUrl);
  });

  it("undo 뒤 새 편집으로 redo 스택이 비면 복제본의 정리 신호가 정확히 1회 발생한다", () => {
    const { editor, localPreviewCleared, tiptap, duplicateUrl } =
      mountedWithDuplicate();

    expect(editor.commands.undo()).toEqual(okResult);
    expect(localPreviewCleared).toEqual([]);

    growUndoHistory(tiptap, 1);

    expect(localPreviewCleared).toEqual([
      {
        blockId: "id-1",
        localPreviewUrl: duplicateUrl,
        localPreviewFile: expect.any(File),
      },
    ]);
  });

  it("redo로 되살아난 복제본은 이후 깊은 새 undo 이벤트가 쌓여도 정리 신호가 발생하지 않는다", () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithDuplicate();

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.commands.redo()).toEqual(okResult);
    expect(findBlockPosition(tiptap.state.doc, "id-1")).not.toBeNull();

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);

    expect(localPreviewCleared).toEqual([]);
  });

  it("redo가 여러 단계 남아 있어도 복제본이 돌아오는 단계까지 정리 신호가 발생하지 않는다", () => {
    // 복제 앞에 독립 편집 1건을 둔다. undo 2회 뒤 redo 첫 칸은 그 편집이라
    // 복제본은 redo 둘째 칸에서 돌아온다.
    const { editor, localPreviewCleared, tiptap, duplicateUrl } =
      mountedWithDuplicate(1);

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(findBlockPosition(tiptap.state.doc, "id-1")).toBeNull();
    expect(localPreviewCleared).toEqual([]);

    expect(editor.commands.redo()).toEqual(okResult);
    expect(findBlockPosition(tiptap.state.doc, "id-1")).toBeNull();
    expect(localPreviewCleared).toEqual([]);

    expect(editor.commands.redo()).toEqual(okResult);
    expect(localPreviewUrlOf(tiptap, "id-1")).toBe(duplicateUrl);
    expect(localPreviewCleared).toEqual([]);
  });

  it("복제본을 undo한 상태에서 destroy()하면 복제본의 정리 신호가 정확히 1회 발생한다", () => {
    const { editor, localPreviewCleared, duplicateUrl } =
      mountedWithDuplicate();

    expect(editor.commands.undo()).toEqual(okResult);
    expect(localPreviewCleared).toEqual([]);

    editor.destroy();

    // doc에 남은 m-1도 destroy 스윕 대상이다 — 복제본(id-1)만 골라 센다.
    expect(
      localPreviewCleared.filter((cleared) => cleared.blockId === "id-1"),
    ).toEqual([
      {
        blockId: "id-1",
        localPreviewUrl: duplicateUrl,
        localPreviewFile: expect.any(File),
      },
    ]);
  });

  it("블록이 redo 스택이 아니라 어느 히스토리에도 없으면 redo 스택이 남아 있어도 정리 신호가 발생한다", () => {
    const { editor, localPreviewCleared, tiptap } = mountedWithCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    // 프리뷰 심기와 삭제를 히스토리 밖으로 보낸다 — 블록은 undo·redo 어느
    // 쪽으로도 돌아오지 않는다.
    const seedPosition = findBlockPosition(tiptap.state.doc, "m-1");
    const seedNode =
      seedPosition === null ? null : tiptap.state.doc.nodeAt(seedPosition);
    if (seedPosition === null || seedNode === null)
      throw new Error("m-1 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr
        .setNodeMarkup(seedPosition, undefined, {
          ...seedNode.attrs,
          ...createLocalPreviewAttrs(testFile()),
        })
        .setMeta("addToHistory", false),
    );
    growUndoHistory(tiptap, 1);
    const deletePosition = findBlockPosition(tiptap.state.doc, "m-1");
    const deleteNode =
      deletePosition === null ? null : tiptap.state.doc.nodeAt(deletePosition);
    if (deletePosition === null || deleteNode === null)
      throw new Error("m-1 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr
        .delete(deletePosition, deletePosition + deleteNode.nodeSize)
        .setMeta("addToHistory", false),
    );
    expect(localPreviewCleared).toEqual([]);

    // undo 1회 뒤 undoDepth는 0, redoDepth는 1이다. redo 스택이 있어도 m-1은
    // 거기 없다.
    expect(editor.commands.undo()).toEqual(okResult);

    expect(localPreviewCleared.map((cleared) => cleared.blockId)).toEqual([
      "m-1",
    ]);
  });
});

describe("블록은 남고 로컬 프리뷰 URL만 빠지는 경로(Issue #383)", () => {
  /**
   * `uploadFile` 없는 편집기에서 m-1에 `uploadMediaFile`로 프리뷰를 만든다.
   * `blocks`가 있으면 그 블록들(m-1 포함)을 tail 앞에 둔다.
   */
  const mountedWithPreview = async (
    blocks: Block[] = [mediaBlock("image", "m-1")],
  ) => {
    const mounted = mountedWithCleanup(
      documentOf(...blocks, tailParagraphBlock),
    );
    expect(
      (await mounted.editor.commands.uploadMediaFile("m-1", testFile())).ok,
    ).toBe(true);
    const url1 = localPreviewUrlOf(mounted.tiptap, "m-1");
    expect(url1).toMatch(/^blob:/);
    return { ...mounted, url1: url1 as string };
  };
  const notifiedUrls = (cleared: { localPreviewUrl: string }[]): string[] =>
    cleared.map((entry) => entry.localPreviewUrl);
  const countOf = (cleared: { localPreviewUrl: string }[], url: string) =>
    notifiedUrls(cleared).filter((notified) => notified === url).length;
  // m-1이 p-1의 자식인 문서에서 p-1을 h-1로 바꾸고 m-1을 같은 id로 다시 넣는다.
  const replaceParentKeepingChild = (
    child: Record<string, unknown> = { id: "m-1", type: "image" },
  ) => [
    {
      id: "h-1",
      type: "heading",
      level: 1,
      content: [{ text: "부모" }],
      children: [child],
    },
  ];

  it("D1: replaceBlocks가 같은 id로 다시 넣은 자식 미디어의 프리뷰를 이어받는다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview([
        paragraphBlock("p-1", "부모", [mediaBlock("image", "m-1")]),
      ]);

    expect(
      editor.replaceBlocks(["p-1"], replaceParentKeepingChild() as never).ok,
    ).toBe(true);
    expect(localPreviewUrlOf(tiptap, "m-1")).toBe(url1);
    expect(localPreviewCleared).toEqual([]);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("D1: 최상위 블록을 같은 id로 교체해도 프리뷰를 이어받고 destroy() 전까지 통지가 없다(Issue #386)", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview();

    expect(
      editor.replaceBlocks(["m-1"], [
        { id: "m-1", type: "image", caption: "새 캡션" },
      ] as never).ok,
    ).toBe(true);
    expect(localPreviewUrlOf(tiptap, "m-1")).toBe(url1);
    expect(localPreviewCleared).toEqual([]);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("D1: 제거 대상이 둘이고 각각 프리뷰 자식이 있으면 교체 블록의 두 자식이 각자 프리뷰를 이어받는다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview([
        paragraphBlock("p-1", "부모1", [mediaBlock("image", "m-1")]),
        paragraphBlock("p-2", "부모2", [mediaBlock("image", "m-2")]),
      ]);
    expect(
      (await editor.commands.uploadMediaFile("m-2", testFile("b.png"))).ok,
    ).toBe(true);
    const url2 = localPreviewUrlOf(tiptap, "m-2");

    expect(
      editor.replaceBlocks(["p-1", "p-2"], [
        {
          id: "h-1",
          type: "heading",
          level: 1,
          content: [{ text: "합침" }],
          children: [
            { id: "m-1", type: "image" },
            { id: "m-2", type: "image" },
          ],
        },
      ] as never).ok,
    ).toBe(true);

    expect(localPreviewUrlOf(tiptap, "m-1")).toBe(url1);
    expect(localPreviewUrlOf(tiptap, "m-2")).toBe(url2);
    expect(localPreviewCleared).toEqual([]);

    editor.destroy();
  });

  it("D1: 교체 블록이 url을 가지면 프리뷰를 이어받지 않고 history를 밀어낸 뒤 정확히 1회 통지한다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview([
        paragraphBlock("p-1", "부모", [mediaBlock("image", "m-1")]),
      ]);

    expect(
      editor.replaceBlocks(
        ["p-1"],
        replaceParentKeepingChild({
          id: "m-1",
          type: "image",
          url: "https://example.com/a.png",
        }) as never,
      ).ok,
    ).toBe(true);

    expect(localPreviewUrlOf(tiptap, "m-1")).toBeNull();
    // undo로 URL이 돌아올 수 있어 통지는 도달 불가 판정 뒤에 나간다(Issue #382).
    expect(localPreviewCleared).toEqual([]);

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);
    expect(countOf(localPreviewCleared, url1)).toBe(1);
    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("같은 id가 미디어가 아닌 타입으로 바뀌어 남아도 destroy() 뒤 URL이 통지된다", async () => {
    const { editor, url1, localPreviewCleared } = await mountedWithPreview([
      paragraphBlock("p-1", "부모", [mediaBlock("image", "m-1")]),
    ]);

    expect(
      editor.replaceBlocks(
        ["p-1"],
        replaceParentKeepingChild({
          id: "m-1",
          type: "paragraph",
          content: [{ text: "문단" }],
        }) as never,
      ).ok,
    ).toBe(true);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("D2: removeBlocks 뒤 같은 id로 insertBlocks하면 destroy() 뒤 지운 블록의 URL이 정확히 1회 통지된다", async () => {
    const { editor, url1, localPreviewCleared } = await mountedWithPreview();

    expect(editor.removeBlocks(["m-1"]).ok).toBe(true);
    expect(
      editor.insertBlocks(
        [{ id: "m-1", type: "image" }] as never,
        "tail",
        "before",
      ).ok,
    ).toBe(true);
    expect(localPreviewCleared).toEqual([]);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("D2: 통지 전에 undo를 두 번 하면 m-1이 같은 URL로 돌아오고 통지가 없다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview();

    expect(editor.removeBlocks(["m-1"]).ok).toBe(true);
    expect(
      editor.insertBlocks(
        [{ id: "m-1", type: "image" }] as never,
        "tail",
        "before",
      ).ok,
    ).toBe(true);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.commands.undo()).toEqual(okResult);

    expect(localPreviewUrlOf(tiptap, "m-1")).toBe(url1);
    expect(localPreviewCleared).toEqual([]);

    editor.destroy();
  });

  it("D4: 프리뷰 블록에 uploadMediaFile을 다시 하면 이전 URL은 history를 밀어낸 뒤 destroy() 전에 1회 통지된다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview();

    expect(
      (await editor.commands.uploadMediaFile("m-1", testFile("b.png"))).ok,
    ).toBe(true);
    const url2 = localPreviewUrlOf(tiptap, "m-1");
    expect(url2).not.toBe(url1);
    expect(localPreviewCleared).toEqual([]);

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);

    expect(countOf(localPreviewCleared, url1)).toBe(1);
    expect(notifiedUrls(localPreviewCleared)).not.toContain(url2);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
    expect(countOf(localPreviewCleared, url2 as string)).toBe(1);
  });

  it("D4: 덮어쓴 직후에는 통지가 없고 undo로 이전 URL이 돌아온다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview();

    expect(
      (await editor.commands.uploadMediaFile("m-1", testFile("b.png"))).ok,
    ).toBe(true);
    expect(localPreviewCleared).toEqual([]);

    // 프리뷰만 바뀌는 단계도 undo는 ok다(Issue #382).
    expect(editor.commands.undo()).toEqual(okResult);

    expect(localPreviewUrlOf(tiptap, "m-1")).toBe(url1);
    expect(localPreviewCleared).toEqual([]);

    editor.destroy();
  });

  it("D4b: replaceMediaBlockFile로 덮어쓴 이전 URL도 destroy() 뒤 통지된다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview();

    expect(
      (await editor.commands.replaceMediaBlockFile("m-1", testFile("b.png")))
        .ok,
    ).toBe(true);
    expect(localPreviewUrlOf(tiptap, "m-1")).not.toBe(url1);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("D5: 프리뷰 적용을 undo한 뒤 새 편집으로 redo 스택이 비면 destroy() 전에 URL이 통지된다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview();

    editor.commands.undo();
    expect(localPreviewUrlOf(tiptap, "m-1")).toBeNull();
    expect(localPreviewCleared).toEqual([]);

    tiptap.view.dispatch(
      tiptap.state.tr.insertText("z", contentTextStart(tiptap, "tail")),
    );

    expect(countOf(localPreviewCleared, url1)).toBe(1);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("url 확정 뒤 history를 밀어내 통지한 URL은 destroy()해도 다시 통지되지 않는다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview();

    expect(
      editor.commands.setMediaBlockUrl("m-1", "https://example.com/a.png").ok,
    ).toBe(true);
    expect(localPreviewCleared).toEqual([]);

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);
    expect(countOf(localPreviewCleared, url1)).toBe(1);
    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("url 확정 직후 history를 밀어내지 않고 destroy()하면 같은 URL을 1회만 통지한다", async () => {
    // 확정 직후에는 통지 없이 lifecycle pending에 URL이 남는다. destroy() 스윕이
    // 그 URL을 1회 통지한다.
    const { editor, url1, localPreviewCleared } = await mountedWithPreview();

    expect(
      editor.commands.setMediaBlockUrl("m-1", "https://example.com/a.png").ok,
    ).toBe(true);
    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });

  it("같은 URL을 가진 노드가 둘이면 하나를 지워도 history를 밀어낸 뒤까지 통지가 없다", async () => {
    const { editor, tiptap, url1, localPreviewCleared } =
      await mountedWithPreview([
        mediaBlock("image", "m-1"),
        mediaBlock("image", "m-2"),
      ]);
    // m-1의 프리뷰 attrs를 m-2에 그대로 복사해 URL을 공유시킨다.
    const sourcePosition = findBlockPosition(tiptap.state.doc, "m-1");
    const targetPosition = findBlockPosition(tiptap.state.doc, "m-2");
    const sourceNode =
      sourcePosition === null ? null : tiptap.state.doc.nodeAt(sourcePosition);
    const targetNode =
      targetPosition === null ? null : tiptap.state.doc.nodeAt(targetPosition);
    if (sourceNode === null || targetNode === null || targetPosition === null)
      throw new Error("m-1·m-2 조회 실패");
    tiptap.view.dispatch(
      tiptap.state.tr.setNodeMarkup(targetPosition, undefined, {
        ...targetNode.attrs,
        localPreviewUrl: sourceNode.attrs.localPreviewUrl,
        localPreviewFile: sourceNode.attrs.localPreviewFile,
      }),
    );
    expect(localPreviewUrlOf(tiptap, "m-2")).toBe(url1);

    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);
    expect(localPreviewCleared).toEqual([]);

    expect(editor.commands.deleteBlock("m-2")).toEqual(okResult);
    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);
    expect(countOf(localPreviewCleared, url1)).toBe(1);

    editor.destroy();

    expect(countOf(localPreviewCleared, url1)).toBe(1);
  });
});

describe("url 확정으로 바뀐 프리뷰 attrs와 undo·redo(Issue #382 D3)", () => {
  const CONFIRMED_URL = "https://example.com/a.png";

  /**
   * url 확정 경로의 공통 불변식이다. 통지는 즉시 나가지 않고 도달 판정이
   * 맡는다. 확정 직후와 undo·redo 사이에는 통지가 없고, undo로 `url1`이
   * 문서에 돌아온다. history를 depth 너머로 키우면 `url1` 통지가 정확히 1회
   * 나가고 그때 문서에 `url1`이 없다.
   */
  const expectUndoableUrlConfirm = (
    context: {
      tiptap: TiptapEditor;
      url1: string;
      localPreviewCleared: { localPreviewUrl: string }[];
    },
    undoStep: () => unknown,
    redoStep: () => unknown,
  ) => {
    const { tiptap, url1, localPreviewCleared } = context;
    expect(localPreviewUrlOf(tiptap, "m-1")).toBeNull();
    expect(localPreviewCleared).toEqual([]);

    expect(undoStep()).toEqual(okResult);
    expect(localPreviewUrlOf(tiptap, "m-1")).toBe(url1);
    expect(localPreviewCleared).toEqual([]);

    expect(redoStep()).toEqual(okResult);
    expect(localPreviewUrlOf(tiptap, "m-1")).toBeNull();
    expect(localPreviewCleared).toEqual([]);

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);

    expect(localPreviewCleared.map((entry) => entry.localPreviewUrl)).toEqual([
      url1,
    ]);
    expect(localPreviewUrlOf(tiptap, "m-1")).toBeNull();
    expect(JSON.stringify(tiptap.getJSON())).not.toContain(url1);
  };

  const mountedWithPreview = async (
    overrides: Pick<CreateEditorOptions, "uploadFile"> = {},
    blocks: Block[] = [mediaBlock("image", "m-1")],
  ) => {
    const mounted = mountedWithCleanup(
      documentOf(...blocks, tailParagraphBlock),
      overrides,
    );
    if (overrides.uploadFile === undefined) {
      expect(
        (await mounted.editor.commands.uploadMediaFile("m-1", testFile())).ok,
      ).toBe(true);
    } else {
      seedLocalPreview(mounted.tiptap, "m-1", testFile());
    }
    const url1 = localPreviewUrlOf(mounted.tiptap, "m-1");
    expect(url1).toMatch(/^blob:/);
    return { ...mounted, url1: url1 as string };
  };

  it("setMediaBlockUrl로 url을 확정해도 즉시 통지하지 않고 undo로 프리뷰가 돌아오며 통지는 도달 불가 뒤 1회다", async () => {
    const context = await mountedWithPreview();
    const { editor } = context;

    expect(editor.commands.setMediaBlockUrl("m-1", CONFIRMED_URL).ok).toBe(
      true,
    );

    expectUndoableUrlConfirm(
      context,
      () => editor.commands.undo(),
      () => editor.commands.redo(),
    );
  });

  it("updateBlock로 url을 확정해도 즉시 통지하지 않고 undo로 프리뷰가 돌아오며 통지는 도달 불가 뒤 1회다", async () => {
    const context = await mountedWithPreview();
    const { editor } = context;

    expect(
      editor.updateBlock("m-1", {
        type: "image",
        url: CONFIRMED_URL,
      } as never).ok,
    ).toBe(true);

    expectUndoableUrlConfirm(
      context,
      () => editor.commands.undo(),
      () => editor.commands.redo(),
    );
  });

  it("replaceBlocks로 같은 id의 url 있는 블록으로 교체해도 즉시 통지하지 않고 undo로 프리뷰가 돌아오며 통지는 도달 불가 뒤 1회다", async () => {
    const context = await mountedWithPreview();
    const { editor } = context;

    expect(
      editor.replaceBlocks(["m-1"], [
        { id: "m-1", type: "image", url: CONFIRMED_URL },
      ] as never).ok,
    ).toBe(true);

    expectUndoableUrlConfirm(
      context,
      () => editor.commands.undo(),
      () => editor.commands.redo(),
    );
  });

  it("업로드 완료로 url을 확정해도 즉시 통지하지 않고 undo로 프리뷰가 돌아오며 통지는 도달 불가 뒤 1회다", async () => {
    const context = await mountedWithPreview({
      uploadFile: async () => ({ status: "success", url: CONFIRMED_URL }),
    });
    const { editor } = context;

    expect((await editor.commands.uploadMediaFile("m-1", testFile())).ok).toBe(
      true,
    );

    expectUndoableUrlConfirm(
      context,
      () => editor.commands.undo(),
      () => editor.commands.redo(),
    );
  });

  it("키보드 경로(PM undo·redo 직접 호출)로 되돌려도 setMediaBlockUrl 뒤 같은 불변식이 성립한다", async () => {
    const context = await mountedWithPreview();
    const { editor, tiptap } = context;

    expect(editor.commands.setMediaBlockUrl("m-1", CONFIRMED_URL).ok).toBe(
      true,
    );

    expectUndoableUrlConfirm(
      context,
      () => ({
        ok: undo(tiptap.state, tiptap.view.dispatch),
        value: undefined,
      }),
      () => ({
        ok: redo(tiptap.state, tiptap.view.dispatch),
        value: undefined,
      }),
    );
  });
});

describe("프리뷰 적용 step의 undo·redo Result(Issue #382 D6)", () => {
  const mountedWithPreview = async () => {
    const mounted = mountedWithLocalPreviewCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    expect(
      (await mounted.editor.commands.uploadMediaFile("m-1", testFile())).ok,
    ).toBe(true);
    const url1 = localPreviewUrlOf(mounted.tiptap, "m-1");
    expect(url1).toMatch(/^blob:/);
    return { ...mounted, url1: url1 as string };
  };

  it("프리뷰 적용 직후 undo()는 ok이고 PM 프리뷰가 사라지며 onChange와 revision은 그대로다", async () => {
    const { editor, tiptap, changes } = await mountedWithPreview();
    const revision = editor.getDocument().revision;

    expect(editor.commands.undo()).toEqual(okResult);

    expect(localPreviewUrlOf(tiptap, "m-1")).toBeNull();
    expect(changes).toEqual([]);
    expect(editor.getDocument().revision).toBe(revision);
  });

  it("프리뷰 적용을 undo한 뒤 redo()는 ok이고 PM 프리뷰가 돌아오며 통지와 onChange는 없다", async () => {
    const { editor, tiptap, url1, changes, localPreviewCleared } =
      await mountedWithPreview();
    const revision = editor.getDocument().revision;
    expect(editor.commands.undo()).toEqual(okResult);

    expect(editor.commands.redo()).toEqual(okResult);

    expect(localPreviewUrlOf(tiptap, "m-1")).toBe(url1);
    expect(localPreviewCleared).toEqual([]);
    expect(changes).toEqual([]);
    expect(editor.getDocument().revision).toBe(revision);
  });

  it("빈 history의 undo()와 redo()는 COMMAND_NOT_APPLICABLE이다", () => {
    const { editor, changes } = mountedWithLocalPreviewCleanup(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );

    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(editor.commands.redo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "redo" },
    });
    expect(changes).toEqual([]);
  });

  it("모델 변경이 있는 undo()·redo()는 onChange를 reason과 함께 1회씩 낸다", async () => {
    const { editor, changes } = await mountedWithPreview();
    expect(
      editor.commands.setMediaBlockUrl("m-1", "https://example.com/a.png").ok,
    ).toBe(true);
    const before = changes.length;

    expect(editor.commands.undo()).toEqual(okResult);
    expect(changes.slice(before).map((change) => change.reason)).toEqual([
      "undo",
    ]);

    expect(editor.commands.redo()).toEqual(okResult);
    expect(changes.slice(before).map((change) => change.reason)).toEqual([
      "undo",
      "redo",
    ]);
  });

  it("onBeforeChange가 undo·redo를 거절하면 PM이 안 바뀌고 COMMAND_NOT_APPLICABLE이다", () => {
    const gate = { reject: false };
    const { editor, tiptap, changes } = mountedWithLocalPreviewCleanup(
      documentOf(
        mediaBlock("image", "m-1", { url: "https://example.com/a.png" }),
        tailParagraphBlock,
      ),
      { onBeforeChange: () => (gate.reject ? false : undefined) },
    );
    expect(editor.commands.deleteBlock("m-1")).toEqual(okResult);
    const afterDelete = tiptap.state;
    const changeCount = changes.length;

    gate.reject = true;
    expect(editor.commands.undo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "undo" },
    });
    expect(tiptap.state).toBe(afterDelete);
    expect(changes).toHaveLength(changeCount);

    gate.reject = false;
    expect(editor.commands.undo()).toEqual(okResult);
    const afterUndo = tiptap.state;
    const undoneCount = changes.length;

    gate.reject = true;
    expect(editor.commands.redo()).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "redo" },
    });
    expect(tiptap.state).toBe(afterUndo);
    expect(changes).toHaveLength(undoneCount);
  });
});
