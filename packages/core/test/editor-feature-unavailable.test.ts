/**
 * top-level CustomBlock(model, RD-002-DELTA-01)이 포함된 문서를 이 에디터가
 * 로드하려 하면 EDITOR_FEATURE_UNAVAILABLE로 명시적으로 거절하는지
 * 확인한다 — PM atom 노드 등록(registry, RD-002-DELTA-06)이 아직 없어
 * 조용히 무시하거나 잘못 렌더링할 수 없다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import { documentOf, paragraphBlock } from "./editor-controller-support.js";

const widget = { id: "widget-1", type: "myWidget", content: "none" as const };

const documentWithCustomBlock: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [paragraphBlock("p1", "hi"), widget],
};

describe("EDITOR_FEATURE_UNAVAILABLE: top-level CustomBlock 로드 거절", () => {
  it("초기 문서에 CustomBlock이 있으면 createEditor가 던진다", () => {
    expect(() =>
      createEditor({ initialDocument: documentWithCustomBlock }),
    ).toThrow(/myWidget/);
  });

  it("replaceDocument로 CustomBlock 문서를 넣으면 EDITOR_FEATURE_UNAVAILABLE을 반환한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("p1", "hi")),
    });

    const result = editor.replaceDocument(documentWithCustomBlock);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: expect.stringContaining("myWidget"),
      },
    });
  });

  it("CustomBlock이 없는 기존 문서는 회귀 없이 그대로 로드된다", () => {
    expect(() =>
      createEditor({ initialDocument: documentOf(paragraphBlock("p1", "hi")) }),
    ).not.toThrow();
  });
});
