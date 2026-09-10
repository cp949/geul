/**
 * 로컬 프리뷰(ADR 0015)가 남은 미디어 블록이 삭제된 뒤 undo로 복구
 * 불가능해지는 시점 판정과 정리 신호(Issue #168 roadmap RD-002 DELTA-02,
 * 상세 계획 `_works/roadmap/result/RD-002-DELTA-02.md`)를 고정한다. 판정
 * 방식은 `prosemirror-history` 공개 API(`undo`/`undoDepth`)만으로 실제
 * undo 스택을 시뮬레이션한다(비공개 상수 `DEPTH_OVERFLOW`에 의존하지
 * 않음). 정리 신호는 기존 `onLocalPreviewCleanup` 채널을 재사용한다(url
 * 확정 시 정리와 동일 채널 — RD-002.md "결정"). Issue #169(roadmap RD-001
 * DELTA-01, 상세 계획 `_works/roadmap/result/RD-001-DELTA-01.md`)부터
 * `replaceDocument()`가 구 Editor를 폐기하기 직전 남은 로컬 프리뷰도 같은
 * 채널로 통지한다 — `destroy()`(세션 영구 종료)와 동일한 패턴을 네 번째
 * 트리거로 확장한다.
 */
import type { Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";
import { contentTextStart } from "./block-test-support.js";
import { findBlockPosition } from "../src/block-position.js";
import { createEditor, type CreateEditorOptions } from "../src/index.js";
import {
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  okResult,
  paragraphBlock,
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

/**
 * `tail` 문단(tailParagraphBlock)의 콘텐츠 시작에 독립 undo 이벤트를
 * `count`개 강제로 쌓는다. 매 트랜잭션을 `closeHistory`로 감싸 인접성·
 * `newGroupDelay` 타이밍과 무관하게 매번 새 그룹이 되게 한다(history.ts
 * `applyTransaction` — `closeHistory` meta가 그 트랜잭션 자신의
 * `prevTime`을 0으로 리셋한 뒤 같은 호출에서 newGroup을 판정하므로
 * 트랜잭션 자신이 새 그룹이 된다, RD-002-DELTA-02.md "적용 가이드" 근거).
 * 항상 같은 위치(문단 콘텐츠 시작)에 prepend하므로 반복 중 위치를 다시
 * 조회할 필요가 없다 — 삽입은 그 위치 뒤에만 누적된다.
 */
const growUndoHistory = (tiptap: TiptapEditor, count: number): void => {
  const insertAt = contentTextStart(tiptap, "tail");
  for (let index = 0; index < count; index += 1) {
    const transaction = closeHistory(tiptap.state.tr.insertText("x", insertAt));
    tiptap.view.dispatch(transaction);
  }
};

// 기본 `history` depth(100) + 비공개 DEPTH_OVERFLOW(20) 이후에도 여유를 둔
// 값 — 실제 eviction이 반드시 일어났음을 보장한다.
const BEYOND_DEPTH_AND_OVERFLOW = 130;
// depth(100)에 못 미치는 중간 지점 — 아직 evict되지 않았어야 한다.
const WELL_UNDER_DEPTH = 50;

describe("로컬 프리뷰 undo-불가 정리 신호(Issue #168 roadmap RD-002 DELTA-02)", () => {
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
  it("url 확정도 undo-불가 판정도 받지 않은 채 남은 로컬 프리뷰는 destroy() 시 정리 신호가 1회 발생한다", async () => {
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
  // 놓친다: 삭제된 로컬 프리뷰는 doc에서 이미 사라져 있고, undo-불가
  // 판정은 아직 나지 않아 MediaLocalPreviewLifecycleExtension의 pending
  // Map에만 남아 있다. destroy()가 그 pending도 함께 훑어야 한다.
  it("로컬 프리뷰가 있는 블록을 삭제한 직후(undo-불가 판정 전) destroy()해도 정리 신호가 발생한다", async () => {
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
    // depth(100)를 넘는 새 undo 이벤트를 쌓지 않는다 — undo-불가 판정이
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

  // doc 순회(collectLocalPreviewBlocks)만으로는 삭제된 뒤 undo-불가 판정
  // 전이라 pending에만 남은 블록을 못 본다(DELTA-03과 동일 실측 근거) —
  // replaceDocument()도 destroy()와 같은 두 번째 순회(pendingUnreachable
  // LocalPreviews)가 필요하다는 것을 고정한다.
  it("로컬 프리뷰가 있는 블록을 삭제한 직후(undo-불가 판정 전) replaceDocument()를 호출해도 정리 신호가 발생한다", async () => {
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
