/**
 * HTML/GFM 목록 importer 결과를 production core에 무보정으로 load·replace하고,
 * 저장 문서를 두 포맷으로 다시 왕복할 때 목록 계층과 시작 번호를 검증한다.
 */
import type { Document } from "@cp949/geul-model";
import {
  exportHtml,
  exportMarkdown,
  importHtml,
  importMarkdown,
} from "@cp949/geul-io";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";

/** importer Result에서 문서를 꺼내 실패가 core 호출로 섞이지 않게 한다. */
function importedDocument(
  result: ReturnType<typeof importHtml> | ReturnType<typeof importMarkdown>,
): Document {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.document;
}

/** GFM에서 재생성되는 ID만 제거하고 나머지 블록·표 구조는 그대로 비교한다. */
function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "id" && key !== "columnId")
      .map(([key, item]) => [key, withoutIds(item)]),
  );
}

/** HTML fixture가 nested list, 명시·부재 start, table child를 모두 표현한다. */
function htmlFixture(): string {
  return '<ol start="4"><li data-be-block-id="html-parent"><p>부모</p><ul><li data-be-block-id="html-child"><p>자식</p></li></ul><table data-be-block-id="html-table" data-be-header-rows="0" data-be-header-columns="0"><colgroup><col data-be-column-id="html-col" data-be-width="120"></colgroup><tbody><tr data-be-row-id="html-row"><td data-be-cell-id="html-cell" data-be-column-id="html-col" rowspan="1" colspan="1">셀</td></tr></tbody></table></li></ol><ul><li data-be-block-id="html-absent"><p>부재</p></li></ul><p data-be-block-id="html-tail">마지막 문단</p>';
}

/** strict GFM이 trailing 정규화를 추가하지 않도록 마지막에 일반 문단을 둔다. */
function gfmFixture(): string {
  return [
    "4. 부모",
    "",
    "   - 자식",
    "",
    "   | 열 |",
    "   | --- |",
    "   | 셀 |",
    "",
    "- 부재",
    "",
    "마지막 문단",
  ].join("\n");
}

describe("목록 IO production 왕복", () => {
  it("HTML importer 결과를 createEditor와 replaceDocument가 ID·계층·start까지 보존한다", () => {
    const imported = importedDocument(importHtml(htmlFixture()));
    const created = createEditor({ initialDocument: imported });
    const replaced = createEditor({
      initialDocument: { ...imported, blocks: [imported.blocks[0]!] },
    });
    try {
      expect(created.getDocument()).toEqual(imported);
      expect(replaced.replaceDocument(imported)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(replaced.getDocument()).toEqual({ ...imported, revision: 1 });
    } finally {
      created.destroy();
      replaced.destroy();
    }
  });

  it("production 저장 문서는 HTML export·re-import에서 ID와 표 자식을 그대로 왕복한다", () => {
    const imported = importedDocument(importHtml(htmlFixture()));
    const editor = createEditor({ initialDocument: imported });
    try {
      const exported = exportHtml(editor.getDocument());
      expect(exported.ok).toBe(true);
      if (!exported.ok) throw new Error(exported.error.code);
      expect(importedDocument(importHtml(exported.value))).toEqual(
        editor.getDocument(),
      );
    } finally {
      editor.destroy();
    }
  });

  it("GFM importer와 strict export·re-import는 ID를 제외한 목록 의미를 보존한다", () => {
    const imported = importedDocument(
      importMarkdown(gfmFixture(), {
        createId: (() => {
          let i = 0;
          return () => `gfm-${++i}`;
        })(),
      }),
    );
    const editor = createEditor({ initialDocument: imported });
    const replaced = createEditor({
      initialDocument: { ...imported, blocks: [imported.blocks[0]!] },
    });
    try {
      expect(editor.getDocument()).toEqual(imported);
      expect(replaced.replaceDocument(imported)).toEqual({
        ok: true,
        value: undefined,
      });
      expect(replaced.getDocument()).toEqual({ ...imported, revision: 1 });
      const exported = exportMarkdown(editor.getDocument(), { mode: "strict" });
      expect(exported.ok).toBe(true);
      if (!exported.ok) throw new Error(exported.error.code);
      expect(exported.value).not.toMatch(
        /data-be-(?:block|row|column|cell)-id/,
      );
      const roundTripped = importedDocument(importMarkdown(exported.value));
      expect(withoutIds(roundTripped.blocks)).toEqual(
        withoutIds(editor.getDocument().blocks),
      );
    } finally {
      editor.destroy();
      replaced.destroy();
    }
  });
});
