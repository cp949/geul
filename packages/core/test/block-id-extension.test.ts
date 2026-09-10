/**
 * BlockIdExtension의 appendTransaction이 id 없는 중첩 블록에도
 * blockId를 재귀적으로 채우는지 확인한다(D19) — 라이브 에디터의 정상
 * 편집 경로(paste 등)가 아니라 appendTransaction 자체의 재귀 탐색만
 * 겨눈 최소 재현이다. tiptap-to-model.test.ts에서 책임별로 분리했다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor, type CustomBlockDefinition } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

describe("blockId 발급과 top-level CustomBlock(Issue #170 RD-001 DELTA-01)", () => {
  const widgetDefinition: CustomBlockDefinition = {
    render: () => ({ element: document.createElement("div") }),
  };

  it("트레일링 정규화가 발급하는 새 id가 기존 CustomBlock id와 충돌해도 세션 생성이 실패하지 않는다", () => {
    // top-level CustomBlock 하나로 끝나는 문서 — "빈 자식 없는 paragraph"로
    // 끝나지 않아 로드 시 트레일링 paragraph 정규화가 발동한다.
    // sequentialIds("id")의 첫 호출은 "id-1"을 반환한다 — CustomBlock이 이미
    // 그 id를 쓰고 있어, BlockIdExtension이 CustomBlock id를 점유 id로
    // 인식하지 못하면 새 trailing paragraph에 같은 "id-1"이 재발급된다.
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "id-1", type: "myWidget", content: "none" }],
    };

    let editor: ReturnType<typeof createEditor> | undefined;
    expect(() => {
      editor = createEditor({
        initialDocument,
        createId: sequentialIds("id"),
        customBlocks: { myWidget: widgetDefinition },
      });
    }).not.toThrow();

    const ids = editor?.getDocument().blocks.map((block) => block.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("id-1");
  });
});

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
