/**
 * `CreateEditorOptions.attributeOverrides.blockContainer` 계약 테스트(spec
 * §7, R4 슬라이스5 RD-002-DELTA-02, EXT-008). `editor` 역할(DELTA-01)과
 * 달리 blockContainer는 core가 직접 `renderHTML`을 작성하므로 ProseMirror의
 * 네이티브 class 병합이 없다 — `mergeAttributeOverrides`(공유 헬퍼)를 거쳐
 * 병합·충돌 규칙을 core가 직접 구현한다.
 */
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("attributeOverrides.blockContainer", () => {
  it("지정하지 않으면 blockContainer div에 기존 attribute만 있다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { editable } = mountTiptapEditor(editor);
    const container = editable.querySelector("[data-geul-block-id]");

    expect(container).not.toBeNull();
    expect(container?.getAttribute("data-geul-block-id")).toBe("block-1");
    expect(container?.hasAttribute("class")).toBe(false);
    expect(container?.getAttribute("data-color-scheme")).toBeNull();
  });

  it("지정하면 blockContainer div에 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      attributeOverrides: {
        blockContainer: { "data-color-scheme": "dark", class: "consumer-block" },
      },
    });
    const { editable } = mountTiptapEditor(editor);
    const container = editable.querySelector("[data-geul-block-id]");

    expect(container?.getAttribute("data-color-scheme")).toBe("dark");
    expect(container?.getAttribute("class")).toBe("consumer-block");
  });

  it("data-geul-block-id를 override하려 하면 무시되고 경고한다(core round-trip 계약 보호)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      attributeOverrides: {
        blockContainer: { "data-geul-block-id": "hacked" },
      },
    });
    const { editable } = mountTiptapEditor(editor);
    const container = editable.querySelector("[data-geul-block-id]");

    expect(container?.getAttribute("data-geul-block-id")).toBe("block-1");
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
