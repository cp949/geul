/**
 * enabledBlockTypes가 quote·callout 같은 새 종류 블록을 막았을 때
 * TablePasteExtension의 물러남 계약을 고정한다(Issue #356 RD-005).
 * 표 밖에서는 시퀀스에 막은 타입이 있으면 물러나고, 표 안 캐럿은 검사하지 않고
 * 셀 줄로 합친다(Issue #328과 같은 규칙).
 *
 * 지금 파서는 quote·callout을 내지 않는다. 그래서 parseClipboardTable의 반환값만
 * mock으로 바꾼다. 나머지 붙여넣기 경로(ClipboardPasteExtension 폴백 등)는
 * 실제 코드다. 모든 케이스에서 미처리 예외와 onPasteRejected 호출이 없어야 한다.
 */
import {
  type ClipboardContentBlock,
  parseClipboardTable,
} from "@cp949/geul-io";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import {
  clipBlock,
  clipBullet,
  clipParagraph,
} from "./clipboard-block-test-support.js";
import {
  blocksOf,
  outline,
  pasteData,
  setupPasteSelection,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  oneCellTableBlock,
  paragraphBlock,
  tableBlockIn,
} from "./editor-controller-support.js";

vi.mock("@cp949/geul-io", async (importOriginal) => {
  const original = await importOriginal<typeof import("@cp949/geul-io")>();
  return {
    ...original,
    parseClipboardTable: vi.fn(original.parseClipboardTable),
  };
});

beforeEach(() => {
  vi.mocked(parseClipboardTable).mockClear();
});

type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;

const DENY_QUOTE: EnabledBlockTypes = { mode: "deny", types: ["quote"] };
const DENY_CALLOUT: EnabledBlockTypes = { mode: "deny", types: ["callout"] };

const TABLE_HTML =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";

const table2x2: ClipboardContentBlock = {
  type: "table",
  data: {
    columnCount: 2,
    rows: [
      ["a", "b"],
      ["c", "d"],
    ].map((texts) => ({
      cells: texts.map((text, columnIndex) => ({
        columnIndex,
        rowSpan: 1,
        columnSpan: 1,
        content: [{ text }],
      })),
    })),
  },
};

const quote = (text: string): ClipboardContentBlock =>
  clipBlock({ type: "quote", content: [{ text }] });

/** 다음 parseClipboardTable 호출 하나가 이 시퀀스를 돌려주게 한다. */
const parsedAs = (content: ClipboardContentBlock[]): void => {
  vi.mocked(parseClipboardTable).mockReturnValueOnce({
    ok: true,
    value: content,
  });
};

/** 붙여넣기 한 번의 결과다. 예외·거절 통지·편집기를 함께 돌려준다. */
const pasteWith = (
  enabledBlockTypes: EnabledBlockTypes,
  clipboard: Record<string, string>,
  inCell: boolean,
) => {
  const rejected: unknown[] = [];
  const { editor, editable, tiptap } = setupPasteSelection(
    [paragraphBlock("p1", "first"), oneCellTableBlock("t1")],
    { id: "p1", offset: 2 },
    { id: "p1", offset: 2 },
    {
      enabledBlockTypes,
      onPasteRejected: (reason) => rejected.push(reason),
    },
  );
  if (inCell) {
    let cellPos = -1;
    tiptap.state.doc.descendants((node, pos) => {
      if (cellPos === -1 && node.type.name === "tableCell") cellPos = pos;
      return cellPos === -1;
    });
    tiptap.commands.setTextSelection(cellPos + 1);
  }
  let errors: unknown[] = [];
  withUnhandledErrorTracking((tracked) => {
    pasteData(editable, clipboard);
    errors = [...tracked];
  });
  return { editor, errors, rejected };
};

describe("새 종류 블록을 막은 편집기의 표 밖 붙여넣기는 물러난다", () => {
  it("deny quote면 quote와 표가 든 시퀀스에서 물러나 평문으로 들어간다", () => {
    parsedAs([quote("q"), table2x2]);

    const result = pasteWith(
      DENY_QUOTE,
      {
        "text/html": `<blockquote>q</blockquote>${TABLE_HTML}`,
        "text/plain": "q\na\tb\nc\td",
      },
      false,
    );

    expect(vi.mocked(parseClipboardTable)).toHaveBeenCalled();
    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(outline(blocksOf(result.editor))).toEqual([
      "p:fiq",
      "p:ab",
      "p:cdrst",
      "table:",
      "p:",
    ]);
  });

  it("deny callout이면 목록 항목 children 안 callout도 찾아 물러난다", () => {
    parsedAs([
      clipBullet([{ text: "l" }], {
        children: [clipBlock({ type: "callout", content: [{ text: "c" }] })],
      }),
      table2x2,
    ]);

    const result = pasteWith(
      DENY_CALLOUT,
      {
        "text/html": `<ul><li>l</li></ul>${TABLE_HTML}`,
        "text/plain": "l\na\tb\nc\td",
      },
      false,
    );

    // html에는 callout이 없어 ClipboardPasteExtension의 importHtml 경로가
    // 목록과 표를 넣는다. 표 확장이 소비했다면 callout 노드가 없는 스키마에서
    // 예외가 났다.
    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(outline(blocksOf(result.editor))).toEqual([
      "p:fi",
      "ul:l",
      "table:",
      "p:rst",
      "table:",
      "p:",
    ]);
  });
});

describe("표 안 캐럿은 막은 새 종류 블록을 검사하지 않고 셀 줄로 합친다", () => {
  it("deny quote여도 quote 글자가 셀 격자에 채워진다", () => {
    parsedAs([quote("q"), table2x2, clipParagraph([{ text: "z" }])]);

    const result = pasteWith(
      DENY_QUOTE,
      {
        "text/html": `<blockquote>q</blockquote>${TABLE_HTML}<p>z</p>`,
        "text/plain": "q\na\tb\nc\td\nz",
      },
      true,
    );

    expect(result.errors).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(
      tableBlockIn(result.editor.getDocument()).rows.map((row) =>
        row.cells.map((cell) =>
          cell.content
            .map((item) => ("text" in item ? item.text : ""))
            .join(""),
        ),
      ),
    ).toEqual([
      ["q\na", "b"],
      ["c", "d\nz"],
    ]);
  });
});
