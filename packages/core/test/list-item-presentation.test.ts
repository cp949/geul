/**
 * 목록 표시 데코레이션을 production editor seam에서 검증한다.
 * 형제 scope별 marker 계산, 편집 뒤 재계산, 목록 placeholder와 저장 JSON
 * 무흔적 계약을 다룬다(Issue #38 슬라이스 5 RD-002 DELTA-02a).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart, dispatchKeydown } from "./block-test-support.js";
import {
  documentOf,
  listItemBlock,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
} from "./editor-controller-support.js";

/** blockId로 production blockContainer DOM을 찾는다. */
const blockContainer = (
  editable: HTMLElement,
  blockId: string,
): HTMLElement => {
  const container = editable.querySelector<HTMLElement>(
    `[data-be-block-id="${blockId}"]`,
  );
  if (container === null)
    throw new Error(`${blockId} blockContainer 조회 실패`);
  return container;
};

/** blockContainer decoration의 계산 marker를 문서 순서로 읽는다. */
const markers = (editable: HTMLElement, ...blockIds: string[]) =>
  blockIds.map((blockId) =>
    blockContainer(editable, blockId).getAttribute("data-be-list-marker"),
  );

/** 최상위와 중첩 형제 scope의 연속·reset 경계를 함께 포함한 목록 문서다. */
const markerDocument = (): Document =>
  documentOf(
    listItemBlock("bullet", "bulletListItem", "글머리"),
    listItemBlock("numbered-1", "numberedListItem", "첫 자동"),
    listItemBlock("numbered-2", "numberedListItem", "둘째 자동"),
    listItemBlock("numbered-7", "numberedListItem", "명시", {
      startNumber: 7,
    }),
    listItemBlock("numbered-8", "numberedListItem", "명시 다음 자동"),
    paragraphBlock("boundary", "경계"),
    listItemBlock("numbered-reset", "numberedListItem", "reset", {
      children: [
        listItemBlock("nested-1", "numberedListItem", "중첩 자동"),
        listItemBlock("nested-4", "numberedListItem", "중첩 명시", {
          startNumber: 4,
        }),
        listItemBlock("nested-5", "numberedListItem", "중첩 연속"),
      ],
    }),
    paragraphBlock("tail", "꼬리"),
  );

describe("목록 marker 표시", () => {
  it("doc과 blockGroup 직속 형제별 bullet·자동 번호·명시 override·경계 reset을 계산한다", () => {
    const editor = createEditor({ initialDocument: markerDocument() });
    const { editable } = mountTiptapEditor(editor);

    expect(
      markers(
        editable,
        "bullet",
        "numbered-1",
        "numbered-2",
        "numbered-7",
        "numbered-8",
        "boundary",
        "numbered-reset",
      ),
    ).toEqual(["•", "1.", "2.", "7.", "8.", null, "1."]);
    expect(markers(editable, "nested-1", "nested-4", "nested-5")).toEqual([
      "1.",
      "4.",
      "5.",
    ]);
  });

  it("Enter split transaction 뒤 자동 번호를 다시 계산하고 저장 JSON에는 marker를 남기지 않는다", () => {
    const initial = documentOf(
      listItemBlock("first", "numberedListItem", "가나", { startNumber: 9 }),
      listItemBlock("second", "numberedListItem", "다"),
      paragraphBlock("tail", "꼬리"),
    );
    const editor = createEditor({
      initialDocument: initial,
      createId: sequentialIds("split"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);

    tiptap.commands.setTextSelection(contentTextStart(tiptap, "first") + 1);
    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    const listContainers = editable.querySelectorAll<HTMLElement>(
      "[data-be-list-marker]",
    );
    expect(
      Array.from(listContainers, (container) =>
        container.getAttribute("data-be-list-marker"),
      ),
    ).toEqual(["9.", "10.", "11."]);
    expect(JSON.stringify(editor.getDocument())).not.toContain(
      "data-be-list-marker",
    );
  });

  it("indent와 outdent transaction 뒤 각 형제 scope의 번호를 다시 계산한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        listItemBlock("first", "numberedListItem", "첫째", {
          startNumber: 9,
        }),
        listItemBlock("second", "numberedListItem", "둘째"),
        paragraphBlock("tail", "꼬리"),
      ),
    });
    const { editable } = mountTiptapEditor(editor);

    expect(markers(editable, "first", "second")).toEqual(["9.", "10."]);
    expect(editor.commands.indentBlock("second")).toEqual({ ok: true });
    expect(markers(editable, "first", "second")).toEqual(["9.", "1."]);

    expect(editor.commands.outdentBlock("second")).toEqual({ ok: true });
    expect(markers(editable, "first", "second")).toEqual(["9.", "10."]);
  });

  it("join transaction이 비목록 경계를 제거하면 이어진 번호를 다시 계산한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        listItemBlock("first", "numberedListItem", "가", {
          startNumber: 9,
        }),
        paragraphBlock("boundary", "중간"),
        listItemBlock("reset", "numberedListItem", "다"),
        paragraphBlock("tail", "꼬리"),
      ),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);

    expect(markers(editable, "first", "reset")).toEqual(["9.", "1."]);
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "boundary"));
    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(markers(editable, "first", "reset")).toEqual(["9.", "10."]);
  });

  it("빈 목록 콘텐츠는 marker와 List item placeholder를 동시에 받고 내용 있는 항목은 받지 않는다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        listItemBlock("empty-bullet", "bulletListItem", ""),
        listItemBlock("empty-numbered", "numberedListItem", ""),
        listItemBlock("filled", "bulletListItem", "내용"),
        paragraphBlock("tail", "꼬리"),
      ),
    });
    const { editable } = mountTiptapEditor(editor);
    const before = editor.getDocument();

    for (const id of ["empty-bullet", "empty-numbered"]) {
      const container = blockContainer(editable, id);
      expect(container.getAttribute("data-be-list-marker")).not.toBeNull();
      expect(
        container.firstElementChild?.getAttribute("data-placeholder"),
      ).toBe("List item");
    }
    expect(
      blockContainer(editable, "filled").firstElementChild?.hasAttribute(
        "data-placeholder",
      ),
    ).toBe(false);
    expect(editor.getDocument()).toEqual(before);
  });
});
