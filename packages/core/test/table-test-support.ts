/**
 * 표 관련 core 테스트가 공유하는 격리 에디터, 문서·데이터 fixture와 캐럿
 * 배치 헬퍼를 소유한다. 여러 테스트 파일이 같은 fixture를 쓰므로 사본을
 * 만들지 않고 이 모듈이 단독으로 갖는다(PIT-0022).
 */
import type { TabularData } from "@cp949/geul-io";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { BlockIdExtension } from "../src/block-id-extension.js";
import {
  TableCellExtension,
  TableExtension,
  TableRowExtension,
} from "../src/table-extension.js";

/**
 * 슬라이스 6 전용 격리 에디터: EditorController(createEditor())와 별개로
 * Table/Row/Cell 확장만 검증하는 독립 fixture. model-to-tiptap.ts/tiptap-to-model.ts의
 * 표 차단 분기를 거치지 않는다.
 */
export const createTableFixtureEditor = (content: JSONContent): Editor => {
  const editor = new Editor({
    element: document.createElement("div"),
    injectCSS: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        hardBreak: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
        heading: false,
        trailingNode: false,
      }),
      BlockIdExtension,
      TableExtension,
      TableRowExtension,
      TableCellExtension,
    ],
    content,
  });
  return editor;
};

/**
 * 표 셀 하나의 tiptap JSON을 만든다. 아래 표 fixture들이 행을 구성할 때
 * 쓰고, 공유 fixture로 표현되지 않는 문서를 테스트가 직접 조립할 때도 쓴다.
 */
export const cellJson = (cellId: string, columnId: string) => ({
  type: "tableCell",
  attrs: {
    cellId,
    columnId,
    colspan: 1,
    rowspan: 1,
    colwidth: null,
    textColor: null,
    backgroundColor: null,
  },
  content: [],
});

/** 문단 하나짜리 문서 — 표가 없는 상태에서 시작하는 명령의 출발점이다. */
export const docWithParagraph = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "para-1" },
      content: [{ type: "text", text: "hello" }],
    },
  ],
};

/** 1행 2열 표 하나짜리 문서. */
export const docWithTable = {
  type: "doc",
  content: [
    {
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
      content: [
        {
          type: "tableRow",
          attrs: { rowId: "row-1" },
          content: [cellJson("cell-1", "col-1"), cellJson("cell-2", "col-2")],
        },
      ],
    },
  ],
};

/**
 * 2행 2열 표 하나짜리 문서 — 행이 둘 이상이어야 하는 시나리오에 쓴다. 행
 * 삭제·이동, 셀 병합, 표 안 붙여넣기가 여기 해당한다.
 */
export const docWithTwoRowTable = {
  type: "doc",
  content: [
    {
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
      content: [
        {
          type: "tableRow",
          attrs: { rowId: "row-1" },
          content: [cellJson("cell-1", "col-1"), cellJson("cell-2", "col-2")],
        },
        {
          type: "tableRow",
          attrs: { rowId: "row-2" },
          content: [cellJson("cell-3", "col-1"), cellJson("cell-4", "col-2")],
        },
      ],
    },
  ],
};

/**
 * cellId로 셀을 찾아 그 셀의 시작 경계 위치를 구한다. TableMap은 격자
 * 좌표(positionAt)나 문서 위치(findCell)로만 셀을 찾으므로 cellId로 찾으려면
 * 문서를 순회해야 한다.
 */
const findCellBoundaryPosition = (
  editor: ReturnType<typeof createTableFixtureEditor>,
  cellId: string,
): number | null => {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "tableCell" && node.attrs.cellId === cellId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
};

/**
 * 지정한 셀 안에 캐럿을 둔다. setTextSelection에는 셀 경계가 아니라 경계
 * 다음 위치(boundary + 1)를 줘야 캐럿이 셀 내부에 들어간다.
 */
export const placeCaretInCell = (
  editor: ReturnType<typeof createTableFixtureEditor>,
  cellId: string,
) => {
  const boundary = findCellBoundaryPosition(editor, cellId);
  if (boundary === null) throw new Error("셀 fixture 준비 실패");
  editor.commands.setTextSelection(boundary + 1);
};

/**
 * 셀 하나짜리 TabularData를 만든다. 삽입 위치나 거절 여부만 보는 테스트가
 * 데이터 모양에 신경 쓰지 않도록 최소 크기 입력을 제공한다.
 */
export const oneByOneData = (text: string): TabularData => ({
  columnCount: 1,
  rows: [
    {
      cells: [
        { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [{ text }] },
      ],
    },
  ],
});
