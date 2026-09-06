/**
 * customBlocks registry(spec §4.4 EXT-001, RD-002-DELTA-11)의 등록·렌더·
 * 삽입·JSON round-trip을 검증한다. fixture 확장(myWidget)은 render()에서
 * <div>를 만들어 blockId를 표시하고, 호출마다 받은 block·editor 참조를
 * 기록한다 — editor 참조는 지연 바인딩 Proxy라 dummy mount 구간에서는
 * 미완성이지만 실사용 mount 이후 캡처해 두면 완전히 동작한다(DELTA-11.md
 * "결정" 2 — render()는 이 참조의 메서드를 동기적으로 호출하지 않는다).
 * 미등록 타입이 여전히 EDITOR_FEATURE_UNAVAILABLE로 거절되는 회귀는
 * editor-feature-unavailable.test.ts가 이미 고정한다 — 여기서 반복하지
 * 않는다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import {
  createEditor,
  type CustomBlock,
  type CustomBlockDefinition,
  type EditorController,
} from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

const renderCalls: { block: CustomBlock; editor: EditorController }[] = [];

const widgetDefinition: CustomBlockDefinition = {
  render: ({ block, editor }) => {
    renderCalls.push({ block, editor });
    const element = document.createElement("div");
    element.dataset.widget = "true";
    element.textContent = `widget:${block.id}`;
    return { element };
  },
};

describe("customBlocks registry(RD-002-DELTA-11)", () => {
  it("등록된 타입이 initialDocument에 있으면 로드되고 render()가 만든 element가 DOM에 붙는다", () => {
    renderCalls.length = 0;
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "seed" }] },
        {
          id: "widget-1",
          type: "myWidget",
          content: "none",
          props: { count: 3 },
        },
      ],
    };
    const editor = createEditor({
      initialDocument,
      customBlocks: { myWidget: widgetDefinition },
    });
    const { editable } = mountTiptapEditor(editor);

    const rendered = editable.querySelector('[data-be-block-id="widget-1"]');
    expect(rendered).not.toBeNull();
    expect(rendered?.textContent).toBe("widget:widget-1");
    expect(renderCalls.at(-1)?.block).toEqual({
      id: "widget-1",
      type: "myWidget",
      content: "none",
      props: { count: 3 },
    });
  });

  it("commands.insertCustomBlock으로 삽입한 블록이 렌더되고 getDocument()가 id/type/content/props를 정확히 보존한다(JSON round-trip)", () => {
    renderCalls.length = 0;
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      customBlocks: { myWidget: widgetDefinition },
    });
    const { editable } = mountTiptapEditor(editor);

    const result = editor.commands.insertCustomBlock(
      "block-1",
      "myWidget",
      "none",
      { count: 5, label: "hi", flag: true, note: null },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rendered = editable.querySelector(
      `[data-be-block-id="${result.value.blockId}"]`,
    );
    expect(rendered).not.toBeNull();

    const inserted = editor
      .getDocument()
      .blocks.find((block) => block.id === result.value.blockId);
    expect(inserted).toEqual({
      id: result.value.blockId,
      type: "myWidget",
      content: "none",
      props: { count: 5, label: "hi", flag: true, note: null },
    });
  });

  it("props 없이 삽입하면 저장 문서에 props 필드 자체가 없다(model의 생략 가능 필드 관례)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      customBlocks: { myWidget: widgetDefinition },
    });
    mountTiptapEditor(editor);

    const result = editor.commands.insertCustomBlock(
      "block-1",
      "myWidget",
      "inline",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const inserted = editor
      .getDocument()
      .blocks.find((block) => block.id === result.value.blockId);
    expect(inserted).toEqual({
      id: result.value.blockId,
      type: "myWidget",
      content: "inline",
    });
  });

  it("등록되지 않은 type으로 insertCustomBlock을 호출하면 CUSTOM_BLOCK_TYPE_NOT_REGISTERED로 거절되고 문서가 바뀌지 않는다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      customBlocks: { myWidget: widgetDefinition },
    });
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    const result = editor.commands.insertCustomBlock(
      "block-1",
      "unregisteredWidget",
      "none",
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "CUSTOM_BLOCK_TYPE_NOT_REGISTERED", type: "unregisteredWidget" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("실사용 mount 이후에는 render()가 캡처한 editor 참조로 실제 명령을 호출할 수 있다(지연 바인딩 Proxy 해소)", () => {
    renderCalls.length = 0;
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "widget-1",
          type: "myWidget",
          content: "none",
          props: { count: 1 },
        },
      ],
    };
    const editor = createEditor({
      initialDocument,
      customBlocks: { myWidget: widgetDefinition },
    });
    mountTiptapEditor(editor);

    const capturedEditor = renderCalls.at(-1)?.editor;
    expect(capturedEditor).toBeDefined();
    // dummy mount 구간에 캡처됐을 수도 있는 이전 참조까지 포함해 전부
    // 같은 Proxy 인스턴스다(createEditor 1회 호출당 하나) — 어느 것을
    // 잡아도 이 시점(실사용 mount 이후)엔 완전히 동작해야 한다.
    expect(capturedEditor?.getDocument().blocks[0]).toEqual({
      id: "widget-1",
      type: "myWidget",
      content: "none",
      props: { count: 1 },
    });
  });
});
