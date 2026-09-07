/**
 * `CreateEditorOptions.attributeOverrides.blockGroup` 계약 테스트(spec §7,
 * R4 슬라이스5 RD-002-DELTA-03, EXT-008). DELTA-02의 `mergeAttributeOverrides`
 * 헬퍼를 그대로 재사용한다 — 새 병합 로직 없음.
 */
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphBlock,
} from "./editor-controller-support.js";

// blockGroup은 nestable 블록에 children이 있을 때만 렌더된다(readiness
// probe 확인, block-container-extension.ts content expression 참고).
const nestedDocument = () => ({
  formatVersion: 1 as const,
  revision: 0,
  blocks: [paragraphBlock("parent", "부모", [paragraphBlock("child", "자식")])],
});

describe("attributeOverrides.blockGroup", () => {
  it("지정하지 않으면 blockGroup div에 기존 attribute만 있다", () => {
    const editor = createEditor({ initialDocument: nestedDocument() });
    const { editable } = mountTiptapEditor(editor);
    const group = editable.querySelector("[data-geul-block-group]");

    expect(group).not.toBeNull();
    expect(group?.hasAttribute("class")).toBe(false);
    expect(group?.getAttribute("data-color-scheme")).toBeNull();
  });

  it("지정하면 blockGroup div에 반영된다", () => {
    const editor = createEditor({
      initialDocument: nestedDocument(),
      attributeOverrides: {
        blockGroup: { "data-color-scheme": "dark", class: "consumer-group" },
      },
    });
    const { editable } = mountTiptapEditor(editor);
    const group = editable.querySelector("[data-geul-block-group]");

    expect(group?.getAttribute("data-color-scheme")).toBe("dark");
    expect(group?.getAttribute("class")).toBe("consumer-group");
  });

  it("data-geul-block-group을 override하려 하면 무시되고 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = createEditor({
      initialDocument: nestedDocument(),
      attributeOverrides: {
        blockGroup: { "data-geul-block-group": "hacked" },
      },
    });
    const { editable } = mountTiptapEditor(editor);
    const group = editable.querySelector("[data-geul-block-group]");

    expect(group?.getAttribute("data-geul-block-group")).toBe("");
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
