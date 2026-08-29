/**
 * 표 관련 core 테스트가 공유하는 격리 에디터와 그 스키마, 문서·데이터
 * fixture와 셀 위치·선택·캐럿 헬퍼를 소유한다. 여러 테스트 파일이 같은
 * fixture를 쓰므로 사본을 만들지 않고 이 모듈이 단독으로 갖는다(G-TST-002).
 *
 * 셀 헬퍼는 Editor를 받는다. createTableFixtureEditor가 만든 격리 에디터와
 * EditorController가 마운트한 에디터 모두가 호출부이므로 어느 한쪽의 생성
 * 함수에 시그니처를 매지 않는다.
 */
import type { TabularData } from "@cp949/geul-io";
import type { Extensions, JSONContent } from "@tiptap/core";
import {
  Editor,
  Extension,
  getSchema,
  mergeAttributes,
  Node,
} from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import { afterEach } from "vitest";

import {
  BlockContainerExtension,
  BlockGroupExtension,
} from "../src/block-container-extension.js";
import { BlockIdExtension } from "../src/block-id-extension.js";
import { CodeBlockExtension } from "../src/code-block-extension.js";
import {
  TableCellExtension,
  TableExtension,
  TableRowExtension,
} from "../src/table-extension.js";

// editor-controller.ts의 ParagraphExtension/HeadingExtension과 같은 이유로
// StarterKit 기본 paragraph/heading을 끄고 재구현한다 — group을
// "nestableBlockContent"로 둬야 blockContainer의 중첩 가능 분기에 들어갈
// 수 있다(D19). 프로덕션 정의를 그대로 가져오지 않고 이 파일이 독립 소유하는
// 이유는 그 정의가 production-editor-assembly.ts 모듈 비공개
// const라서다 — export하면 그 모듈의 .d.ts가 Tiptap Node 타입을 노출해
// public-types.test.ts(ADR-0002)를 깬다.
const FixtureParagraphExtension = Node.create({
  name: "paragraph",
  group: "nestableBlockContent",
  content: "inline*",
  parseHTML() {
    return [{ tag: "p" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes), 0];
  },
});

const FixtureHeadingExtension = Node.create({
  name: "heading",
  group: "nestableBlockContent",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      level: { default: 1, rendered: false },
    };
  },
  parseHTML() {
    return [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } }));
  },
  renderHTML({ node, HTMLAttributes }) {
    const level = [1, 2, 3].includes(node.attrs.level as number)
      ? (node.attrs.level as number)
      : 1;
    return [`h${level}`, mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * createTableFixtureEditor가 만든 에디터 목록. 해제는 이 Set과 아래
 * afterEach가 단독으로 진다(G-TST-002) — createTableFixtureEditor는 만든
 * 에디터를 여기 등록하기만 하고, 호출부는 destroy()를 직접 부르지 않는다.
 *
 * 정리를 미루면 안 되는 이유: 마운트된 채 남으면 dispatch가 예약한
 * ProseMirror DOMObserver의 20ms flush가 jsdom 환경 해제 뒤에 실행돼
 * "ReferenceError: document is not defined" unhandled error가 된다.
 * `destroy()`가 docView를 비워 그 flush를 조기 반환시키는 것이 해제가 하는
 * 일이다. 간헐적이라 통과하는 실행이 증거가 못 된다 — 재현율은 환경에 따라
 * 다르고 0인 기계도 있으므로 실행 횟수는 근거로 적지 않는다.
 */
const fixtureEditors = new Set<Editor>();

/**
 * fixtureEditors에 남은 에디터를 전부 destroy()하고 Set을 비운다. afterEach가
 * 그대로 참조하는 실제 정리 함수다 — destroy()는 멱등이므로 emptyDocSchema처럼
 * 스스로 먼저 해제한 에디터를 다시 순회해도 안전하다.
 *
 * export하는 이유는 프로덕션 호출부가 이 함수를 직접 부르게 하려는 것이
 * 아니다 — 정리 경로는 여전히 afterEach 하나뿐이다. 계약 테스트가 "afterEach가
 * leaked 에디터를 실제로 해제하는가"를 검증하려면 vitest의 훅 스케줄링(it
 * 등록 순서, --sequence.shuffle, 훅 간 실행 순서)에 기대지 않고 이 정리
 * 로직을 그 자리에서 직접 호출해 확인해야 한다. 그래서 이름을 붙이고
 * export한다.
 */
export const destroyFixtureEditorsForTest = () => {
  for (const editor of fixtureEditors) editor.destroy();
  fixtureEditors.clear();
};

afterEach(destroyFixtureEditorsForTest);

/**
 * 슬라이스 6 전용 격리 에디터: EditorController(createEditor())와 별개로
 * Table/Row/Cell 확장만 검증하는 독립 fixture. model-to-tiptap.ts/tiptap-to-model.ts의
 * 표 차단 분기를 거치지 않는다.
 *
 * EditorController와 달리 element에 붙은 EditorView를 그대로 둔다
 * (EditorController는 생성자에서 mount 직후 unmount한다). 반환하는 에디터는
 * 위 fixtureEditors에 스스로 등록되고, 해제는 그 옆 afterEach가 진다 — 왜
 * 해제가 필요한지는 그 주석이 설명한다.
 */
/**
 * createTableFixtureEditor와 buildTestSchema가 공유하는 확장 목록 —
 * 스키마만 있으면 되는 테스트가 Editor를 마운트하지 않고도 같은 스키마를
 * 얻게 한다(중복 정의는 두 목록이 갈릴 위험을 만든다).
 */
const TABLE_FIXTURE_EXTENSIONS: Extensions = [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
    listItem: false,
    orderedList: false,
    // paragraph/heading은 아래 Fixture*Extension으로 대체한다(D19 —
    // nestableBlockContent 그룹, blockContainer로 감싸여야 한다).
    paragraph: false,
    heading: false,
    trailingNode: false,
  }),
  FixtureParagraphExtension,
  FixtureHeadingExtension,
  CodeBlockExtension,
  BlockContainerExtension,
  BlockGroupExtension,
  BlockIdExtension,
  // ContentMatch.defaultType("block+" 채움 기본 노드) 경쟁은 프로덕션
  // BlockContainerExtension의 priority 1000이 소유한다(트랙-6 정정 — 종전에는
  // 프로덕션이 table을 채우는 결함이 있어 이 fixture만 table priority를 40으로
  // 낮춰 가리고 있었다). 이제 fixture와 프로덕션이 같은 확장을 그대로 쓴다 —
  // 갈리는 입력(채움 경로)의 계약은 block-filler-default.test.ts가 프로덕션
  // 스키마에서 고정한다(G-TST-002).
  TableExtension,
  TableRowExtension,
  TableCellExtension,
];

/**
 * createTableFixtureEditor와 같은 스키마를 Editor 마운트 없이 만든다 —
 * DOM 노드 생성·EditorView 초기화가 필요 없는 순수 조립 함수(예:
 * buildOutOfTableSequence)를 검증할 때 쓴다.
 */
export const buildTestSchema = () => getSchema(TABLE_FIXTURE_EXTENSIONS);

export const createTableFixtureEditor = (
  content: JSONContent,
  extraExtensions: Extensions = [],
): Editor => {
  const editor = new Editor({
    element: document.createElement("div"),
    injectCSS: false,
    extensions: [...TABLE_FIXTURE_EXTENSIONS, ...extraExtensions],
    content,
  });
  fixtureEditors.add(editor);
  return editor;
};

/**
 * 모든 트랜잭션을 무조건 버리는 테스트 전용 확장. `dispatchAndVerify`(
 * dispatch.ts)의 거절 감지 로직은 실제 필터 거절 없이는 검증할 수
 * 없다 — `LinkPolicyExtension`(link-policy-extension.ts)과 같은
 * `filterTransaction` 모양으로 그 경로를 재현한다. `table-commands.test.ts`와
 * `table-paste-commands.test.ts`가 함께 쓰므로 로컬 정의로 중복하지 않고
 * 이 모듈이 단독 소유한다(G-TST-002).
 */
export const RejectAllTransactionsExtension = Extension.create({
  name: "rejectAllTransactions",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: () => false,
      }),
    ];
  },
});

/**
 * 표 fixture 확장이 등록된 스키마. 문서 내용이 아니라 노드 정의만 필요한
 * 테스트가 최소 문서로 에디터를 하나 만들어 그 스키마를 꺼내는 경로다.
 * 문서가 비어 있을 뿐 스키마에는 table/tableRow/tableCell이 모두 있다.
 * 스키마는 에디터 해제 뒤에도 유효하므로 여기서 바로 해제해 호출부에 정리
 * 책임을 넘기지 않는다.
 */
export const emptyDocSchema = () => {
  const editor = createTableFixtureEditor({
    type: "doc",
    content: [{ type: "paragraph" }],
  });
  const { schema } = editor;
  editor.destroy();
  return schema;
};

/**
 * 표 셀 하나의 tiptap JSON을 만든다. 아래 표 fixture들이 행을 구성할 때
 * 쓰고, 공유 fixture로 표현되지 않는 문서를 테스트가 직접 조립할 때도 쓴다.
 */
export const cellJson = (
  cellId: string,
  columnId: string,
  spans: { colspan?: number; rowspan?: number } = {},
) => ({
  type: "tableCell",
  attrs: {
    cellId,
    columnId,
    colspan: spans.colspan ?? 1,
    rowspan: spans.rowspan ?? 1,
    colwidth: null,
    textColor: null,
    backgroundColor: null,
  },
  content: [],
});

/**
 * 문단 하나짜리 문서 — 표가 없는 상태에서 시작하는 명령의 출발점이다.
 * blockId는 문단 자신이 아니라 감싸는 blockContainer의 attrs다(D19) —
 * paragraph는 group "nestableBlockContent"라 blockContainer 없이는 doc 직속
 * 자식이 될 스키마 경로가 없다.
 */
export const docWithParagraph = {
  type: "doc",
  content: [
    {
      type: "blockContainer",
      attrs: { blockId: "para-1" },
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      ],
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
 * 2행 3열 표 하나짜리 문서 — 병합 경계를 가로지르는 선택(NOT_RECTANGULAR)
 * 재현에 쓴다. 2x2 표는 셀 하나만 병합해도 남은 칸이 자동으로 나머지
 * 전체를 덮어 selectedRect가 항상 표 전체와 같아지므로(전부 tiling돼
 * 도리어 직사각형이 된다) 경계를 벗어나는 선택 자체가 안 나온다 — 열이
 * 3개는 있어야 병합된 셀 절반만 걸치는 rect를 selectCellRange로 재현할
 * 수 있다.
 */
export const docWithTwoByThreeTable = {
  type: "doc",
  content: [
    {
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
          { id: "col-3", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
      content: [
        {
          type: "tableRow",
          attrs: { rowId: "row-1" },
          content: [
            cellJson("cell-1", "col-1"),
            cellJson("cell-2", "col-2"),
            cellJson("cell-3", "col-3"),
          ],
        },
        {
          type: "tableRow",
          attrs: { rowId: "row-2" },
          content: [
            cellJson("cell-4", "col-1"),
            cellJson("cell-5", "col-2"),
            cellJson("cell-6", "col-3"),
          ],
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
 * 3행 3열 병합 표 하나짜리 문서 — rowspan·colspan 셀을 가로지르는 selection
 * 이동·명령의 병합 fixture(G-TBL-001)에 쓴다. 격자:
 *
 *   row-1: m-1 | m-2 | m-3
 *   row-2: m-1 | m-4 | m-4   (m-1은 rowspan 2, m-4는 colspan 2)
 *   row-3: m-5 | m-6 | m-7
 */
export const docWithMergedTable = {
  type: "doc",
  content: [
    {
      type: "table",
      attrs: {
        blockId: "table-1",
        columns: [
          { id: "col-1", width: 160 },
          { id: "col-2", width: 160 },
          { id: "col-3", width: 160 },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
      content: [
        {
          type: "tableRow",
          attrs: { rowId: "row-1" },
          content: [
            cellJson("m-1", "col-1", { rowspan: 2 }),
            cellJson("m-2", "col-2"),
            cellJson("m-3", "col-3"),
          ],
        },
        {
          type: "tableRow",
          attrs: { rowId: "row-2" },
          content: [cellJson("m-4", "col-2", { colspan: 2 })],
        },
        {
          type: "tableRow",
          attrs: { rowId: "row-3" },
          content: [
            cellJson("m-5", "col-1"),
            cellJson("m-6", "col-2"),
            cellJson("m-7", "col-3"),
          ],
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
 * cellId는 string | undefined를 받는다. `noUncheckedIndexedAccess` 아래에서
 * 호출부가 cellIds에서 값을 꺼내면 타입이 undefined를 포함하는데, 그 가드를
 * 호출부마다 사본으로 두는 대신 여기서 같은 메시지로 던진다.
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
