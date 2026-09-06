/**
 * isEditable getter/setter 계약 테스트(spec §3.4, DOC-013,
 * RD-005-DELTA-01) — 사용자 DOM 입력만 차단하고 프로그램적 명령은
 * 계속 허용한다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 isEditable", () => {
  it("isEditable = false로 설정하면 마운트된 DOM의 contenteditable 속성이 false로 바뀐다", () => {
    const editor = createEditor({ initialDocument: paragraphDocument("content") });
    const { editable } = mountTiptapEditor(editor);
    expect(editable.getAttribute("contenteditable")).toBe("true");

    editor.isEditable = false;
    expect(editable.getAttribute("contenteditable")).toBe("false");

    editor.isEditable = true;
    expect(editable.getAttribute("contenteditable")).toBe("true");
  });

  it("isEditable = false 상태에서도 commands.* 호출은 계속 성공한다", () => {
    const editor = createEditor({ initialDocument: paragraphDocument("before") });
    editor.isEditable = false;

    expect(editor.commands.setText("block-1", "after")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument()).toMatchObject({
      blocks: [{ content: [{ text: "after" }] }],
    });
  });

  it("getter가 setter 이후 값을 정확히 반영한다", () => {
    const editor = createEditor({ initialDocument: paragraphDocument("content") });
    expect(editor.isEditable).toBe(true);

    editor.isEditable = false;
    expect(editor.isEditable).toBe(false);

    editor.isEditable = true;
    expect(editor.isEditable).toBe(true);
  });

  it("destroy 이후 getter는 false를 반환하고 setter는 아무 효과가 없다", () => {
    const editor = createEditor({ initialDocument: paragraphDocument("content") });
    editor.destroy();

    expect(editor.isEditable).toBe(false);
    expect(() => {
      editor.isEditable = true;
    }).not.toThrow();
    expect(editor.isEditable).toBe(false);
  });

  it("replaceDocument() 이후에도 직전에 설정한 isEditable 값이 유지된다", () => {
    const editor = createEditor({ initialDocument: paragraphDocument("before") });
    const container = document.createElement("div");
    editor.mount(container);
    editor.isEditable = false;
    expect(
      container
        .querySelector("[contenteditable]")
        ?.getAttribute("contenteditable"),
    ).toBe("false");

    expect(editor.replaceDocument(paragraphDocument("after"))).toEqual({
      ok: true,
      value: undefined,
    });

    // getter(session이 소유한 editableState)뿐 아니라 재구성된 tiptap
    // Editor의 실제 PM editable prop도 유지돼야 한다 — 세션 필드만
    // 갱신되고 새 Editor 생성에 전달되지 않는 결함은 getter만 보면
    // 검출되지 않는다(mutation 검증으로 발견, "## 결과" 참고).
    expect(editor.isEditable).toBe(false);
    expect(
      container
        .querySelector("[contenteditable]")
        ?.getAttribute("contenteditable"),
    ).toBe("false");

    editor.destroy();
  });
});
