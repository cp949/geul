/**
 * BlockIdExtension의 appendTransaction이 id 없는 중첩 블록에도
 * blockId를 재귀적으로 채우는지 확인한다(D19) — 라이브 에디터의 정상
 * 편집 경로(paste 등)가 아니라 appendTransaction 자체의 재귀 탐색만
 * 겨눈 최소 재현이다. tiptap-to-model.test.ts에서 책임별로 분리했다.
 */
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

describe("blockId 발급 재귀(D19)", () => {
  it("중첩 자식으로 삽입된 id 없는 컨테이너에도 appendTransaction이 id를 채운다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("root"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");

    // blockId가 null인(id 미발급) 중첩 컨테이너를 최상위 컨테이너의 콘텐츠
    // 끝(blockGroup 자리)에 직접 삽입한다 — 라이브 에디터의 정상 편집
    // 경로(예: paste)가 아니라 appendTransaction 자체의 재귀 탐색만 겨눈
    // 최소 재현이다.
    const nestedParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("nested"),
    );
    const nestedContainer = schema.nodes.blockContainer!.create(
      null,
      nestedParagraph,
    );
    const blockGroup = schema.nodes.blockGroup!.create(null, nestedContainer);

    const tr = tiptap.state.tr.insert(rootEnd, blockGroup);
    tiptap.view.dispatch(tr);

    let nestedId: unknown;
    tiptap.state.doc.descendants((node) => {
      if (
        node.type.name === "blockContainer" &&
        node.textContent === "nested"
      ) {
        nestedId = node.attrs.blockId;
      }
    });

    expect(typeof nestedId).toBe("string");
    expect((nestedId as string).length).toBeGreaterThan(0);
  });
});
