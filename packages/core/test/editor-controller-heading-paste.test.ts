/**
 * 클립보드 h4-h6 붙여넣기가 에디터 문서에 문단이 아닌 heading level 4-6으로
 * 반영되는지 실제 ClipboardEvent로 검증한다(Issue #38 슬라이스 3, DELTA-08).
 * io의 clipboard-table-parser가 더 이상 h4~h6를 문단으로 다운그레이드하지
 * 않는다는 계약을 core 붙여넣기 경로까지 관통해 확인한다 — 전례는
 * editor-controller-table-paste.test.ts의 "표 앞뒤에 문단이 섞인 클립보드
 * 붙여넣기" 케이스(혼합 붙여넣기 구조가 가장 가깝다).
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";
import { pasteData } from "./clipboard-test-support.js";

describe("클립보드 h4-h6 붙여넣기(DELTA-04 의존)", () => {
  it("h4 heading과 표가 섞인 클립보드 붙여넣기가 heading level 4와 표를 모두 보존하고 undo로 되돌아간다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      createId: sequentialIds("paste"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    pasteData(editable, {
      "text/html":
        "<h4>heading</h4><table><tbody><tr><td>a</td></tr></tbody></table>",
    });

    const document = editor.getDocument();
    expect(
      document.blocks.some(
        (block) => block.type === "heading" && block.level === 4,
      ),
    ).toBe(true);
    expect(document.blocks.some((block) => block.type === "table")).toBe(true);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    const afterUndo = editor.getDocument();
    expect(
      afterUndo.blocks.some(
        (block) => block.type === "heading" && block.level === 4,
      ),
    ).toBe(false);
    expect(afterUndo.blocks.some((block) => block.type === "table")).toBe(
      false,
    );

    editor.destroy();
  });
});
