/**
 * 스키마 그룹 "block"의 채움(fill) 기본 노드 경쟁을 검증한다. PM은 "block+"
 * 자리를 새로 채울 때 ContentMatch.defaultType(그룹 멤버 중 스키마 등록
 * 순서가 앞선 노드)을 쓴다 — blockContainer가 table에 지면 전체선택 삭제
 * 같은 채움 경로가 blockId/rowId 없는 손상된 표를 만들어 model 변환이
 * TypeError로 죽고 편집기가 영구 desync된다(트랙-6 발견). 이 파일은 그
 * 경쟁의 승자와, 실제 keymap 경로(Ctrl+A → Backspace)의 사용자 관찰 결과를
 * 프로덕션 스키마에서 직접 고정한다.
 */
import { parseDocument, type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { mountTiptapEditor } from "./editor-controller-support.js";

/** 최상위 문단 2개(a, b)의 저장 문서 — 표가 전혀 없는 평면 문서다. */
const twoParagraphDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "a", type: "paragraph", content: [{ text: "hello" }] },
    { id: "b", type: "paragraph", content: [{ text: "world" }] },
  ],
});

/**
 * 실제 등록된 keymap 체인으로 키 하나를 흘려보낸다 — 커맨드 직접 호출이
 * 아니라 view.someProp("handleKeyDown")라서 확장 등록 순서·기본 체인까지
 * 함께 검증된다(indent-keyboard-extension.test.ts와 같은 방식).
 */
const dispatchKeydown = (
  view: {
    someProp: (name: "handleKeyDown", fn: (f: unknown) => unknown) => unknown;
  },
  init: KeyboardEventInit,
): boolean => {
  const event = new KeyboardEvent("keydown", init);
  return (
    view.someProp("handleKeyDown", (f) =>
      (f as (view: unknown, event: KeyboardEvent) => boolean)(view, event),
    ) === true
  );
};

describe("그룹 block 채움 기본 노드 경쟁", () => {
  it("프로덕션 스키마에서 doc과 blockGroup의 채움 기본 노드는 blockContainer다", () => {
    const editor = createEditor({ initialDocument: twoParagraphDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    const { nodes } = tiptap.schema;

    expect(nodes.doc?.contentMatch.defaultType?.name).toBe("blockContainer");
    expect(nodes.blockGroup?.contentMatch.defaultType?.name).toBe(
      "blockContainer",
    );
  });

  it("전체선택(Ctrl+A) 후 Backspace가 표를 만들지 않고 빈 문단 필러 하나를 남긴다", () => {
    const editor = createEditor({ initialDocument: twoParagraphDocument() });
    const { tiptap } = mountTiptapEditor(editor);
    const view = tiptap.view;

    expect(dispatchKeydown(view, { key: "a", ctrlKey: true })).toBe(true);
    expect(dispatchKeydown(view, { key: "Backspace" })).toBe(true);

    // 손상된 표가 채워지면 model 변환이 TypeError를 던져 여기 도달하지
    // 못한다. 결과는 R1과 같은 빈 문단 필러 하나 + 유효 blockId다.
    const saved = editor.getDocument();
    expect(saved.blocks).toHaveLength(1);
    expect(saved.blocks[0]).toMatchObject({ type: "paragraph", content: [] });
    expect(saved.blocks[0]?.id).toBeTruthy();

    let tableCount = 0;
    tiptap.state.doc.descendants((node) => {
      if (node.type.name === "table") tableCount += 1;
      return true;
    });
    expect(tableCount).toBe(0);

    // 저장→재로드 round-trip이 스키마 검증을 통과한다(초안 07 완료 조건).
    // replaceDocument는 동일 내용 문서를 no-op으로 거절하므로 model 검증을
    // 직접 호출한다 — 재로드가 실제로 하는 검증과 같은 함수다.
    expect(parseDocument(saved)).toMatchObject({ ok: true });
  });
});
