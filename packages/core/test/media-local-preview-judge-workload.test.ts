/**
 * 로컬 프리뷰 도달 판정(`isLocalPreviewReachableViaHistory`)의 호출 횟수를
 * 고정한다(Issue #382 리뷰). url 확정 뒤 URL이 pending에 들어가므로, 판정이
 * 편집마다 돌면 편집 횟수 × 문서 크기만큼 시뮬레이션이 쌓여 입력이 느려진다
 * (G-TST-004). wall-clock 대신 판정 호출 횟수를 센다.
 *
 * 판정은 pending URL이 새로 들어온 변경과, 도달 가능성이 줄어들 수 있는
 * 변경(eviction, redo 스택 소거, undo·redo)에서만 돈다. 이벤트를 하나씩
 * 쌓기만 하는 편집은 옛 이벤트를 바꾸지 않아 판정하지 않는다.
 */
import { describe, expect, it, vi } from "vitest";

const judgeCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock(
  "../src/media-local-preview-reachability.js",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../src/media-local-preview-reachability.js")
      >();
    return {
      ...original,
      isLocalPreviewReachableViaHistory: (
        ...args: Parameters<typeof original.isLocalPreviewReachableViaHistory>
      ) => {
        judgeCalls.count += 1;
        return original.isLocalPreviewReachableViaHistory(...args);
      },
    };
  },
);

import {
  BEYOND_DEPTH_AND_OVERFLOW,
  documentOf,
  growUndoHistory,
  localPreviewUrlOf,
  mediaBlock,
  mountedWithLocalPreviewCleanup,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const WELL_UNDER_DEPTH = 50;

const confirmedPreview = async () => {
  const mounted = mountedWithLocalPreviewCleanup(
    documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
  );
  const file = new File(["binary"], "photo.png", { type: "image/png" });
  expect((await mounted.editor.commands.uploadMediaFile("m-1", file)).ok).toBe(
    true,
  );
  const url1 = localPreviewUrlOf(mounted.tiptap, "m-1") as string;
  expect(
    mounted.editor.commands.setMediaBlockUrl("m-1", "https://example.com/a.png")
      .ok,
  ).toBe(true);
  return { ...mounted, url1 };
};

describe("도달 판정 작업량(Issue #382)", () => {
  it("url 확정 뒤 history를 쌓기만 하는 편집은 pending URL을 다시 판정하지 않는다", async () => {
    const { tiptap, localPreviewCleared } = await confirmedPreview();
    const before = judgeCalls.count;

    growUndoHistory(tiptap, WELL_UNDER_DEPTH);

    expect(judgeCalls.count - before).toBe(0);
    expect(localPreviewCleared).toEqual([]);
  });

  it("eviction이 일어나면 판정이 돌아 통지가 1회 나간다", async () => {
    const { tiptap, url1, localPreviewCleared } = await confirmedPreview();

    growUndoHistory(tiptap, BEYOND_DEPTH_AND_OVERFLOW);

    expect(localPreviewCleared.map((entry) => entry.localPreviewUrl)).toEqual([
      url1,
    ]);
  });

  it("redo 스택을 비우는 편집은 pending URL을 다시 판정한다", async () => {
    const { editor, tiptap } = await confirmedPreview();
    growUndoHistory(tiptap, WELL_UNDER_DEPTH);
    expect(editor.commands.undo().ok).toBe(true);
    const before = judgeCalls.count;

    growUndoHistory(tiptap, 1);

    expect(judgeCalls.count - before).toBeGreaterThan(0);
  });
});
