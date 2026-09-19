/**
 * callout backgroundColor의 편집 화면 시각 렌더를 고정한다(Issue #209
 * 후속 결함, 2026-09-19 사용자 보고). backgroundColor는 blockContainer
 * attrs에 저장되지만 그 attr은 rendered:false다(block-container-extension.ts,
 * RD-003 D5 — 일반 텍스트 블록은 배경색이 편집 화면에 렌더되지 않는다).
 * callout은 색상 프리셋(Info/Warning/Error/Success)이 기능 자체라 이
 * 예외가 필요하다 — D5는 다른 6개 nestable 타입에 그대로 유지하고
 * callout만 decoration으로 시각 표시를 얹는다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  calloutBlock,
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
} from "./editor-controller-support.js";

/** blockId로 production 콘텐츠 DOM([data-geul-callout] 등)을 찾는다. */
const contentNode = (
  editable: HTMLElement,
  blockId: string,
  selector: string,
): HTMLElement | null =>
  editable
    .querySelector<HTMLElement>(`[data-geul-block-id="${blockId}"]`)
    ?.querySelector<HTMLElement>(selector) ?? null;

describe("callout backgroundColor 시각 렌더", () => {
  it("backgroundColor가 있는 callout은 [data-geul-callout]에 인라인 background-color를 렌더한다", () => {
    const colored: Block = {
      id: "co-1",
      type: "callout",
      icon: "⚠️",
      backgroundColor: "#FEF7E0",
      content: [{ text: "주의" }],
    };
    const editor = createEditor({
      initialDocument: documentOf(colored, paragraphBlock("tail", "꼬리")),
    });
    const { editable } = mountTiptapEditor(editor);

    const node = contentNode(editable, "co-1", "[data-geul-callout]");
    expect(node?.style.backgroundColor).toBe("rgb(254, 247, 224)");
  });

  it("backgroundColor가 없는 callout은 인라인 background-color가 없다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        calloutBlock("co-2", "기본"),
        paragraphBlock("tail", "꼬리"),
      ),
    });
    const { editable } = mountTiptapEditor(editor);

    const node = contentNode(editable, "co-2", "[data-geul-callout]");
    expect(node?.style.backgroundColor).toBe("");
  });

  it("updateBlock으로 backgroundColor를 세팅하면 다시 렌더된 편집기에 즉시 반영된다(색상 프리셋 경로)", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        calloutBlock("co-3", "본문"),
        paragraphBlock("tail", "꼬리"),
      ),
    });
    const { editable } = mountTiptapEditor(editor);

    const before = contentNode(editable, "co-3", "[data-geul-callout]");
    expect(before?.style.backgroundColor).toBe("");

    editor.updateBlock("co-3", {
      type: "callout",
      icon: "✅",
      backgroundColor: "#E6F4EA",
    });

    const after = contentNode(editable, "co-3", "[data-geul-callout]");
    expect(after?.style.backgroundColor).toBe("rgb(230, 244, 234)");
  });

  it("paragraph의 backgroundColor는 여전히 편집 화면에 렌더되지 않는다(D5 유지, callout 전용 예외 확인)", () => {
    const colored: Block = {
      id: "p-1",
      type: "paragraph",
      backgroundColor: "#FEF7E0",
      content: [{ text: "일반 문단" }],
    };
    const editor = createEditor({ initialDocument: documentOf(colored) });
    const { editable } = mountTiptapEditor(editor);

    const container = editable.querySelector<HTMLElement>(
      '[data-geul-block-id="p-1"]',
    );
    expect(container?.style.backgroundColor).toBe("");
  });
});
