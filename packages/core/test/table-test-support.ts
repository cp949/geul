/**
 * 표 관련 core 테스트가 공유하는 격리 에디터와 그 스키마, 문서·데이터
 * fixture와 셀 위치·선택·캐럿 헬퍼를 소유한다. 여러 테스트 파일이 같은
 * fixture를 쓰므로 사본을 만들지 않고 이 모듈이 단독으로 갖는다(PIT-0022).
 *
 * 셀 헬퍼는 Editor를 받는다. createTableFixtureEditor가 만든 격리 에디터와
 * EditorController가 마운트한 에디터 모두가 호출부이므로 어느 한쪽의 생성
 * 함수에 시그니처를 매지 않는다.
 */
import type { TabularData } from "@cp949/geul-io";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
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
 * 표 fixture 확장이 등록된 스키마. 문서 내용이 아니라 노드 정의만 필요한
 * 테스트가 최소 문서로 에디터를 하나 만들어 그 스키마를 꺼내는 경로다.
 * 문서가 비어 있을 뿐 스키마에는 table/tableRow/tableCell이 모두 있다.
 */
export const emptyDocSchema = () =>
  createTableFixtureEditor({
    type: "doc",
    content: [{ type: "paragraph" }],
  }).schema;

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
export const findCellBoundaryPosition = (
  editor: Editor,
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
 * 두 셀을 양 끝으로 하는 CellSelection을 만들어 dispatch한다. 드래그 셀
 * 선택을 프로그램으로 재현하는 경로다.
 *
 * CellSelection.create는 $anchorCell.node(-1)이 table이길 기대한다 —
 * findCellBoundaryPosition이 주는 셀 경계(= row content 안) 위치가 그
 * depth다. 셀 내부로 한 칸 더 들어가면 node(-1)이 row가 되어
 * "RangeError: Not a table node: tableRow"를 던진다. 2x2 표를 마운트해
 * 실측했다: 경계 위치의 $pos.depth는 2(doc/table/tableRow)라 node(-1)이
 * table이고 create가 성공하지만, 경계 + 1의 $pos.depth는
 * 3(doc/table/tableRow/tableCell)이라 node(-1)이 tableRow가 되고 create가
 * 그 RangeError를 던진다.
 *
 * cellId는 string | undefined를 받는다. 호출부가 cellIds 배열을 구조분해해
 * 넘기므로 undefined 가드를 호출부마다 두는 대신 여기서 던진다.
 */
export const selectCellRange = (
  editor: Editor,
  anchorCellId: string | undefined,
  headCellId: string | undefined,
) => {
  if (anchorCellId === undefined || headCellId === undefined) {
    throw new Error("셀 fixture 준비 실패");
  }
  const anchorPos = findCellBoundaryPosition(editor, anchorCellId);
  const headPos = findCellBoundaryPosition(editor, headCellId);
  if (anchorPos === null || headPos === null) {
    throw new Error("셀 fixture 준비 실패");
  }
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(editor.state.doc, anchorPos, headPos),
    ),
  );
};

/**
 * 셀 하나만 감싸는 CellSelection을 만든다. CellSelection.create에 pos를
 * 하나만 주면 anchor와 head가 같은 셀이 된다. depth 규칙은 selectCellRange가
 * 소유한다.
 */
export const selectSingleCell = (
  editor: Editor,
  cellId: string | undefined,
) => {
  if (cellId === undefined) throw new Error("셀 fixture 준비 실패");
  const cellPos = findCellBoundaryPosition(editor, cellId);
  if (cellPos === null) throw new Error("셀 fixture 준비 실패");
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(editor.state.doc, cellPos),
    ),
  );
};

/**
 * 지정한 셀 안에 캐럿을 둔다. setTextSelection에는 셀 경계가 아니라 경계
 * 다음 위치(boundary + 1)를 줘야 캐럿이 셀 내부에 들어간다.
 */
export const placeCaretInCell = (editor: Editor, cellId: string) => {
  const boundary = findCellBoundaryPosition(editor, cellId);
  if (boundary === null) throw new Error("셀 fixture 준비 실패");
  editor.commands.setTextSelection(boundary + 1);
};

/**
 * 현재 캐럿이 들어 있는 셀의 cellId. 캐럿이 표 밖에 있거나 셀에 cellId가
 * 없으면 null이다. 탐색은 $from.depth 자신부터 포함한다 — tableCell의
 * content가 inline*이라 셀은 문단을 끼지 않는 textblock이고, 셀 안 캐럿의
 * $from.depth 노드가 곧 tableCell이다. depth - 1부터 보면 셀을 놓친다.
 * 격리 fixture와 EditorController가 마운트한 에디터 양쪽에서,
 * placeCaretInCell 직후와 Tab 이동 후 모두 그렇다는 것을 실측했다.
 */
export const activeCellId = (editor: Editor): string | null => {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell") {
      const cellId = node.attrs.cellId;
      return typeof cellId === "string" ? cellId : null;
    }
  }
  return null;
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
