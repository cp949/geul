/**
 * 발급한 로컬 프리뷰(ADR-0015) blob URL 중 문서에 못 들어간 것만 해제 통지하는
 * 발급자(media-local-preview-discard.ts)를 고정한다(Issue #379).
 *
 * 판정 기준은 "호스트 콜백이 돌기 전에 문서에 한 번이라도 들어갔는가"다.
 * 발급자는 Tiptap beforeTransaction의 nextState에서 URL을 모은다. 이벤트는
 * 실제 마운트한 Editor가 dispatch해야 발화하므로 최소 편집기를 마운트하고
 * view.dispatch로 URL을 문서에 넣는다. 문서 참조 비교를 쓰지 않아 dispatch
 * 거절과 appendTransaction 되돌림, 예외를 한 기준으로 덮는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createLocalPreviewIssuer } from "../src/media-local-preview-discard.js";
import type { LocalPreviewAttrs } from "../src/media-local-preview.js";
import {
  documentOf,
  mediaBlock,
  mountedWithLocalPreviewCleanup,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const testFile = () => new File(["binary"], "a.png", { type: "image/png" });

type Tiptap = ReturnType<typeof mountedWithLocalPreviewCleanup>["tiptap"];

/** m-1·m-2 두 빈 image 블록을 가진 편집기를 마운트한다. */
const mountedWithTwoImages = () =>
  mountedWithLocalPreviewCleanup(
    documentOf(
      mediaBlock("image", "m-1"),
      mediaBlock("image", "m-2"),
      tailParagraphBlock,
    ),
  ).tiptap;

/** blockId 노드의 attrs에 로컬 프리뷰 attrs를 얹는 transaction 하나를 dispatch한다. */
const placePreview = (
  tiptap: Tiptap,
  blockId: string,
  attrs: LocalPreviewAttrs,
): void => {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  const node = position === null ? null : tiptap.state.doc.nodeAt(position);
  if (position === null || node === null) {
    throw new Error(`블록 ${blockId} 조회 실패`);
  }
  tiptap.view.dispatch(
    tiptap.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      ...attrs,
    }),
  );
};

/** blockId 노드를 문서에서 지우는 transaction 하나를 dispatch한다. */
const removeBlock = (tiptap: Tiptap, blockId: string): void => {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  const node = position === null ? null : tiptap.state.doc.nodeAt(position);
  if (position === null || node === null) {
    throw new Error(`블록 ${blockId} 조회 실패`);
  }
  tiptap.view.dispatch(
    tiptap.state.tr.delete(position, position + node.nodeSize),
  );
};

describe("createLocalPreviewIssuer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issue가 새 URL을 발급해 같은 File을 담은 attrs를 돌려준다", () => {
    const tiptap = mountedWithTwoImages();
    const file = testFile();
    const issuer = createLocalPreviewIssuer(tiptap, vi.fn());

    const attrs = issuer.issue(file, "id-1");
    issuer.settle();

    expect(attrs.localPreviewFile).toBe(file);
    expect(attrs.localPreviewUrl).toMatch(/^blob:/);
  });

  it("발급한 URL이 모두 문서에 들어갔으면 settle이 통지하지 않는다", () => {
    const tiptap = mountedWithTwoImages();
    const discard = vi.fn();
    const issuer = createLocalPreviewIssuer(tiptap, discard);

    placePreview(tiptap, "m-1", issuer.issue(testFile(), "m-1"));
    placePreview(tiptap, "m-2", issuer.issue(testFile(), "m-2"));
    issuer.settle();

    expect(discard).not.toHaveBeenCalled();
  });

  it("문서에 못 들어간 URL만 통지한다 — 같은 blockId에 다른 URL이 들어가도 URL로 판정한다", () => {
    const tiptap = mountedWithTwoImages();
    const discard = vi.fn();
    const issuer = createLocalPreviewIssuer(tiptap, discard);

    const placed = issuer.issue(testFile(), "m-1");
    const missing = issuer.issue(testFile(), "m-1");
    const neverPlaced = issuer.issue(testFile(), "id-9");
    placePreview(tiptap, "m-1", placed);
    issuer.settle();

    expect(discard.mock.calls).toEqual([
      ["m-1", missing],
      ["id-9", neverPlaced],
    ]);
  });

  it("문서에 들어갔다 사라진 URL은 통지하지 않는다 — 판정은 settle 시점의 문서가 아니다", () => {
    const tiptap = mountedWithTwoImages();
    const discard = vi.fn();
    const issuer = createLocalPreviewIssuer(tiptap, discard);

    placePreview(tiptap, "m-1", issuer.issue(testFile(), "m-1"));
    removeBlock(tiptap, "m-1");
    issuer.settle();

    expect(discard).not.toHaveBeenCalled();
  });

  it("dispatch가 여러 번이어도 합집합으로 판정한다", () => {
    const tiptap = mountedWithTwoImages();
    const discard = vi.fn();
    const issuer = createLocalPreviewIssuer(tiptap, discard);

    const first = issuer.issue(testFile(), "m-1");
    const second = issuer.issue(testFile(), "m-2");
    placePreview(tiptap, "m-1", first);
    placePreview(tiptap, "m-2", second);
    removeBlock(tiptap, "m-1");
    issuer.settle();

    expect(discard).not.toHaveBeenCalled();
  });

  it("발급이 없으면 리스너를 달지 않고 settle이 아무 일도 하지 않는다", () => {
    const tiptap = mountedWithTwoImages();
    const on = vi.spyOn(tiptap, "on");
    const off = vi.spyOn(tiptap, "off");
    const discard = vi.fn();
    const issuer = createLocalPreviewIssuer(tiptap, discard);

    issuer.settle();

    expect(on).not.toHaveBeenCalled();
    expect(off).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it("settle은 등록했던 리스너를 같은 editor에서 해제한다", () => {
    const tiptap = mountedWithTwoImages();
    const on = vi.spyOn(tiptap, "on");
    const off = vi.spyOn(tiptap, "off");
    const issuer = createLocalPreviewIssuer(tiptap, vi.fn());

    issuer.issue(testFile(), "id-1");
    issuer.issue(testFile(), "id-2");
    issuer.settle();

    expect(on).toHaveBeenCalledTimes(1);
    expect(on.mock.calls[0]?.[0]).toBe("beforeTransaction");
    expect(off).toHaveBeenCalledTimes(1);
    expect(off.mock.calls[0]).toEqual(on.mock.calls[0]);
  });

  it("settle 뒤 dispatch는 판정에 영향을 주지 않고 settle을 다시 불러도 중복 통지하지 않는다", () => {
    const tiptap = mountedWithTwoImages();
    const discard = vi.fn();
    const issuer = createLocalPreviewIssuer(tiptap, discard);

    const attrs = issuer.issue(testFile(), "id-1");
    issuer.settle();
    placePreview(tiptap, "m-1", attrs);
    issuer.settle();

    expect(discard.mock.calls).toEqual([["id-1", attrs]]);
  });
});
