/**
 * BlockMoveKeyboardExtension(Shift-Mod-ArrowUp/Down)이 top-level·nested media
 * 블록(image/video/audio/file)을 NodeSelection한 상태에서도 다른 블록과
 * 동일하게 인접 형제와 자리를 바꾸는지 검증한다(Issue #188 roadmap RD-001
 * DELTA-02). media는 blockContainer로 감싸이지 않는 atom이라
 * `nearestBlockContainerId`(block-position.ts)가 NodeSelection을 못 알아보면
 * 캐럿 단일 블록 경로(block-move-commands.test.ts)가 검증하는 production
 * 경로는 정상이어도 이 라우팅 레이어에서 조용히 no-op되거나(top-level)
 * 조부모가 잘못 대상이 된다(nested) — DELTA-01이 고친 공유 helper 하나로
 * 해소되는지가 이 파일의 검증 대상이다.
 *
 * TrailingBlockExtension이 마지막 최상위 블록이 "자식 없는 paragraph"가
 * 아니면 문서 끝에 빈 paragraph를 자동 삽입한다(production 편집기 배치
 * 계약) — 모든 fixture를 tailParagraphBlock으로 닫아 그 자동 삽입이
 * assertion에 섞이지 않게 한다(indent-keyboard-extension.test.ts와 같은
 * 관례, 이 파일은 fixture 에디터가 아니라 production 에디터를 그대로
 * 마운트해 이 불변식이 실제로 적용된다).
 */
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { dispatchModShiftKeydown } from "./block-test-support.js";
import {
  documentOf,
  mediaBlock,
  mounted,
  paragraphBlock,
  tailParagraphBlock,
} from "./editor-controller-support.js";

describe("media NodeSelection Shift-Mod-ArrowUp/Down(Issue #188)", () => {
  it("top-level media를 NodeSelection한 상태에서 Shift-Mod-ArrowUp이 앞 형제와 자리를 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "A"),
        mediaBlock("image", "media-1"),
        paragraphBlock("c", "C"),
        tailParagraphBlock,
      ),
    );
    const position = findBlockPosition(tiptap.state.doc, "media-1");
    if (position === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setNodeSelection(position);

    expect(dispatchModShiftKeydown(tiptap, "ArrowUp")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("image", "media-1"),
      paragraphBlock("a", "A"),
      paragraphBlock("c", "C"),
      tailParagraphBlock,
    ]);
  });

  it("top-level media를 NodeSelection한 상태에서 Shift-Mod-ArrowDown이 뒤 형제와 자리를 바꾼다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "A"),
        mediaBlock("image", "media-1"),
        paragraphBlock("c", "C"),
        tailParagraphBlock,
      ),
    );
    const position = findBlockPosition(tiptap.state.doc, "media-1");
    if (position === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setNodeSelection(position);

    expect(dispatchModShiftKeydown(tiptap, "ArrowDown")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("a", "A"),
      paragraphBlock("c", "C"),
      mediaBlock("image", "media-1"),
      tailParagraphBlock,
    ]);
  });

  it("이미 중첩된 media를 NodeSelection한 상태에서 Shift-Mod-ArrowUp이 media 자신을 이동하고 조부모를 잘못 대상으로 삼지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("before-parent", "Before"),
        paragraphBlock("parent-1", "Parent", [
          paragraphBlock("sibling-1", "Sibling"),
          mediaBlock("image", "media-1"),
        ]),
        tailParagraphBlock,
      ),
    );
    const position = findBlockPosition(tiptap.state.doc, "media-1");
    if (position === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setNodeSelection(position);

    expect(dispatchModShiftKeydown(tiptap, "ArrowUp")).toBe(true);
    // before-parent·parent-1 순서가 그대로다 — parent-1 전체가 잘못
    // 이동되지 않았다. parent-1 안에서 media-1과 sibling-1만 자리를
    // 바꿨다.
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("before-parent", "Before"),
      paragraphBlock("parent-1", "Parent", [
        mediaBlock("image", "media-1"),
        paragraphBlock("sibling-1", "Sibling"),
      ]),
      tailParagraphBlock,
    ]);
  });
});
