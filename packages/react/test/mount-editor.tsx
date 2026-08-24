/**
 * 실제 EditorController를 마운트하는 공용 테스트 헬퍼.
 *
 * 손으로 조립한 편집기 DOM은 프로덕션 renderHTML과 갈라져도 컴파일러가 잡지
 * 못한다(G-TST-001, Issue #62). 여기서는 진짜 createEditor()를 마운트해 편집기
 * DOM을 편집기가 직접 만들게 한다. 표가 필요한 오버레이는 mountTableEditor,
 * 문단만 필요한 오버레이는 mountBlockEditor를 쓴다. 마운트 외에 표 블록 조회
 * (tableBlockOf), DOM 캐럿 배치(placeCaret), 초점 단언(focusOutsideEditor)도
 * 이 모듈이 단독 소유한다(G-TST-002).
 *
 * 다만 jsdom은 레이아웃을 계산하지 않아 getBoundingClientRect()가 전부 0이다.
 * 오버레이 geometry는 rect에 전적으로 의존하므로 rect만 스텁한다 — 이것이
 * 실제 마운트로도 없앨 수 없는 유일한 fake다.
 */
import { createEditor, type EditorController } from "@cp949/geul-core";
import { render, screen } from "@testing-library/react";
import { act, type ReactNode } from "react";
import { afterEach, expect } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { queryMountedEditable } from "./query-mounted-editable.js";

// jsdom은 Range.getClientRects/getBoundingClientRect를 아예 구현하지 않는다.
// deleteTableRow/deleteTableColumn/deleteBlock처럼 선택 영역 안쪽 내용을
// 지우는 실제 명령을 쓰면, ProseMirror가 브라우저의 네이티브 selectionchange를
// 받아 caret을 다시 스크롤하려 하며 텍스트 위치의 rect를 Range로 재는데
// (prosemirror-view의 singleRect), 이 폴리필이 없으면 그 호출이
// "target.getClientRects is not a function"으로 죽는다. 이 실패는 비동기라
// 실행 중인 테스트가 아니라 다음 테스트 실행 중에 unhandled exception으로
// 튀어나온다(실측 확인). 이 파일을 import하는 모든 테스트가 mountTableEditor로
// 실제 명령을 쓰므로 여기 한 곳에서만 폴리필한다 — 각 테스트 파일이 복제하면
// 다섯 개 넘는 사본이 생긴다. jsdom에는 레이아웃이 없으므로 값을 지어내지
// 않고 빈 목록/전부 0인 rect를 돌려준다 — jsdom 자신의 "레이아웃 없음"
// 관례(getBoundingClientRect가 전부 0인 것)와 같다.
if (typeof Range.prototype.getClientRects !== "function") {
  Range.prototype.getClientRects = () => {
    const list: DOMRectList = Object.assign([] as DOMRect[], {
      item: (index: number) => list[index] ?? null,
    });
    return list;
  };
}
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

/**
 * jsdom에 레이아웃이 없어 rect를 직접 대입한다. vi.spyOn을 쓰지 않는 이유는
 * 대상이 매 테스트 새로 만들어지는 노드라 복원할 원본이 없기 때문이다.
 */
export const stubRect = (
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
): void => {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
};

export type Layout = {
  left: number;
  top: number;
  rowHeight: number;
  columnWidth: number;
};

/** 기존 fake가 쓰던 격자와 같은 값 — 테스트 본문의 좌표를 그대로 살린다. */
const DEFAULT_LAYOUT: Layout = {
  left: 100,
  top: 100,
  rowHeight: 30,
  columnWidth: 100,
};

/**
 * 마운트한 채로 두면 ProseMirror DOMObserver의 지연 flush가 jsdom 환경 해제
 * 이후에 실행돼 "document is not defined" unhandled error가 된다.
 * core의 editor-controller-support.ts와 같은 방식으로 일괄 해제한다.
 */
const mountedEditors = new Set<EditorController>();

afterEach(() => {
  try {
    // destroy()는 멱등이므로 테스트가 이미 해제한 에디터도 안전하다.
    for (const editor of mountedEditors) editor.destroy();
  } finally {
    // 하나가 던져도 집합을 비운다 — 안 비우면 다음 테스트의 afterEach가
    // 같은 에디터에서 다시 던져 파일 전체가 무너진다.
    mountedEditors.clear();
  }
});

/**
 * 순차 id 발급기. 실제 편집기는 기본적으로 crypto.randomUUID()를 쓰는데,
 * 테스트가 실패했을 때 어떤 id가 어떤 행/열인지 읽을 수 있어야 한다.
 */
const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
};

/**
 * 실제 문서에서 표 블록을 읽는다. 명령이 진짜라 호출 스파이 대신 이 결과를
 * 단언한다 — 스파이는 명령이 아무것도 하지 않아도 통과한다.
 */
export const tableBlockOf = (editor: EditorController) => {
  const block = editor.getDocument().blocks[1];
  if (block?.type !== "table") throw new Error("표 블록을 찾지 못했다");
  return block;
};

/**
 * 편집기 안의 노드(문단, 표 셀 등)에 실제 DOM 캐럿을 놓는다. EditorController에는
 * 선택을 세우는 공개 API가 없으므로 실제 편집기의 캐럿을 움직이는 유일한 허용
 * 경로다 — ProseMirror의 DOMObserver가 selectionchange를 받아 자기
 * state.selection을 DOM에서 다시 읽는다(실측 확인).
 *
 * mountBlockEditor와 mountTableEditor 둘 다 children을 <EditorContent />보다
 * 먼저 렌더한다 — 그래서 오버레이의 selectionchange 리스너가 편집기(ProseMirror)
 * 리스너보다 먼저 등록될 수 있다. 이 순서 때문에 현재 호출부는 모두 이 함수가
 * 쏘는 selectionchange 뒤에 `fireSelectionChange`로 두 번째 selectionchange를
 * 따로 쏜다.
 *
 * 다만 두 번째 이벤트가 항상 필요한지는 실측상 시나리오에 따라 갈린다 — 예를
 * 들어 setText 직후 같은 블록에 caret을 놓는 구성에서는 그 트랜잭션이 이미
 * state.selection을 그 블록으로 옮겨 둔 상태라 첫 이벤트만으로도 오버레이가
 * 갱신된 캐럿을 본다. 몇 번의 이벤트가 정확히 언제 필요한지는 아직 정리되지
 * 않았다 — Issue #85가 이 질문을 소유한다.
 *
 * 그때까지 새 호출부는 두 번째 selectionchange를 쏘는 쪽에서 시작한다 — 조건이
 * 확정되기 전에는 그쪽이 안전한 기본값이다. 두 번째 이벤트 없이도 통과한다면
 * 그 구성을 Issue #85에 남긴다.
 */
export const placeCaret = (node: HTMLElement) => {
  act(() => {
    const selection = node.ownerDocument.getSelection();
    if (selection === null) throw new Error("DOM 선택을 얻지 못했다");
    const range = node.ownerDocument.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    node.ownerDocument.dispatchEvent(new Event("selectionchange"));
  });
};

/**
 * 초점을 편집 영역 밖(방금 누른 오버레이 컨트롤)으로 옮긴다. fixture가
 * 캐럿을 놓느라 편집 영역에 초점을 준 채로 두면 "초점을 편집기로 되돌린다"
 * 단언이 처음부터 편집기에 있던 초점을 다시 보는 공허한 단언이 된다.
 */
export const focusOutsideEditor = (element: HTMLElement) => {
  element.focus();
  expect(document.activeElement).toBe(element);
};

export type BlockLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * 문단 블록의 스텁 격자. 기존 fake가 블록마다 손으로 씌우던 값(top 0/20/40,
 * height 20)을 그대로 살린다 — 테스트 본문의 clientY 좌표가 뜻을 유지한다.
 * 폭 600은 본문 단 하나를 가정한 값이다. BlockSideMenu의 삽입 지점 계산은
 * clientY만 읽으므로(computeGuide) 가로 값은 삽입 가이드의 길이에만 쓰인다.
 */
const DEFAULT_BLOCK_LAYOUT: BlockLayout = {
  left: 0,
  top: 0,
  width: 600,
  height: 20,
};

export type MountBlockEditorOptions = {
  blockIds?: readonly string[];
  children?: ReactNode;
  layout?: BlockLayout;
};

export type MountedBlockEditor = {
  editor: EditorController;
  host: HTMLElement;
  editable: HTMLElement;
  blockIds: readonly string[];
  blocks: HTMLElement[];
  restubGeometry: () => HTMLElement[];
};

/**
 * 실제 편집기를 문단 블록만으로 마운트한다. 표가 없으므로 SlashMenu처럼
 * 문단을 대상으로 도는 오버레이가 표 오버레이와 섞이지 않는다 — 표가 필요한
 * 테스트는 mountTableEditor를 쓴다.
 *
 * `blockIds`는 초기 문서의 블록 id다. 실제 앱도 초기 문서의 id는 저장소에서
 * 받아 그대로 쓰므로 여기서 직접 지정한다(따옴표·백슬래시가 든 id처럼 특정
 * 값이 필요한 테스트가 있다). 편집기가 새로 만드는 블록
 * (insertParagraphAfter 등)의 id는 mountTableEditor와 같은 createId 발급기가
 * 준다.
 *
 * 반환값의 `host`는 role="textbox" 마운트 host, `editable`은 그 안의
 * contenteditable 노드다 — 둘을 바꿔 쓰면 host 대상 조작이 조용히 편집
 * 영역을 때린다. 한 테스트에서 두 번 부르지 마라(host를 getByRole로 찾는다).
 */
export const mountBlockEditor = ({
  blockIds = ["block-1"],
  children,
  layout = DEFAULT_BLOCK_LAYOUT,
}: MountBlockEditorOptions = {}): MountedBlockEditor => {
  if (blockIds.length === 0) {
    throw new Error("문단 블록이 최소 하나 필요하다");
  }
  const editor = createEditor({
    initialDocument: {
      formatVersion: 1,
      revision: 0,
      blocks: blockIds.map((id) => ({
        id,
        type: "paragraph" as const,
        content: [{ text: "본문" }],
      })),
    },
    createId: sequentialIds("id"),
  });
  mountedEditors.add(editor);

  render(
    <EditorProvider editor={editor}>
      {children}
      <EditorContent />
    </EditorProvider>,
  );

  const host = screen.getByRole("textbox", { name: "Editor" });
  const editable = queryMountedEditable(host);

  /**
   * 블록을 문서 순서대로 다시 찾아 격자 rect를 씌우고 그 목록을 돌려준다.
   * 블록을 새로 만드는 명령(insertParagraphAfter, duplicateBlock) 뒤에 다시
   * 부른다 — 새 문단에는 스텁이 없어 rect가 0이 되고, 그러면 hover 거터와
   * 삽입 가이드가 전부 같은 좌표에 겹친다.
   *
   * 마운트 시점 참조가 아니라 host에서 매번 다시 찾는다. 블록 id는 임의
   * 문자열이라 attribute selector에 보간하면 따옴표·백슬래시에서
   * querySelector가 SyntaxError를 던지므로, id가 아니라 문서 순서로 읽는다.
   */
  const restubGeometry = () => {
    const blockElements = Array.from(
      host.querySelectorAll<HTMLElement>("[data-be-block-id]"),
    );
    blockElements.forEach((block, index) => {
      stubRect(block, {
        left: layout.left,
        top: layout.top + index * layout.height,
        width: layout.width,
        height: layout.height,
      });
    });
    return blockElements;
  };
  const blocks = restubGeometry();
  if (blocks.length !== blockIds.length) {
    throw new Error("문단이 요청한 개수만큼 렌더되지 않았다");
  }

  return { editor, host, editable, blockIds, blocks, restubGeometry };
};

export type MountTableEditorOptions = {
  rows?: number;
  columns?: number;
  children?: ReactNode;
  layout?: Layout;
};

export type MountedTableEditor = {
  editor: EditorController;
  host: HTMLElement;
  editable: HTMLElement;
  table: HTMLElement;
  tableBlockId: string;
  rowIds: string[];
  columnIds: string[];
  restubGeometry: () => void;
};

/**
 * 실제 편집기를 마운트하고 rows x columns 표를 하나 만든 상태로 돌려준다.
 * `children`으로 검증 대상 오버레이를 같은 provider 아래에 얹는다.
 * 반환값의 `host`는 role="textbox" 마운트 host, `editable`은 그 안의
 * contenteditable 노드다 — 둘을 바꿔 쓰면 host 대상 조작이 조용히 편집
 * 영역을 때린다.
 *
 * 한 테스트에서 두 번 부르지 마라. host를 getByRole로 찾으므로 두 번째
 * 호출은 "multiple elements" 오류가 된다.
 *
 * 반환값의 `table`과 `editable`은 마운트 시점 노드다 — replaceDocument는
 * tiptap 편집기를 통째로 다시 만들어 다시 마운트하므로 둘 다 문서에서
 * 떨어진다(실측 확인: replaceDocument 뒤 table.isConnected === false,
 * editable.isConnected === false, host.isConnected === true). 살아남는 것은
 * `host`뿐이니 replaceDocument를 쓰는 테스트는 표도 편집 영역도 host에서
 * 다시 찾아 써라 — 떨어진 노드를 그대로 쓰면 조용히 문서 밖을 때린다.
 *
 * 그때 rect는 0이 아니라 **낡은 값**이라 더 나쁘다. 스텁을 씌운 `table`은
 * 떨어진 뒤에도 씌울 때의 값을 그대로 돌려주고(실측: replaceDocument 앞뒤 모두
 * left 100·top 100·200x60), 정작 문서에 있는 새 표는 스텁이 없어 0이다. 반대로
 * `editable`의 rect는 replaceDocument **전에도** 0이다 — jsdom에 레이아웃이
 * 없어 스텁을 씌우지 않은 노드는 붙어 있든 떨어졌든 항상 0이다. detach가 0을
 * 만드는 것이 아니다. `restubGeometry`는 이 경우에도 동작한다 — 캡처한
 * 참조가 아니라 tableBlockId로 매번 다시 찾아 스텁한다. 단 병합 셀이 없는
 * 표에 한한다(아래 `restubGeometry`의 격자 전제).
 */
export const mountTableEditor = ({
  rows = 2,
  columns = 2,
  children,
  layout = DEFAULT_LAYOUT,
}: MountTableEditorOptions = {}): MountedTableEditor => {
  const editor = createEditor({
    initialDocument: {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "본문" }] },
      ],
    },
    createId: sequentialIds("id"),
  });
  mountedEditors.add(editor);

  const inserted = editor.commands.insertTable("block-1", { rows, columns });
  if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
  const tableBlockId = inserted.value.blockId;

  // 모델 열 너비를 스텁 격자에 맞춘다. 맞추지 않으면 colgroup col의 인라인
  // 너비(기본 160px)와 rect 스텁(100px)이 어긋나 리사이즈 경로가 갈라진다.
  for (let index = 0; index < columns; index += 1) {
    const resized = editor.commands.resizeTableColumn(
      tableBlockId,
      index,
      layout.columnWidth,
    );
    if (!resized.ok) throw new Error("열 너비 fixture 준비 실패");
  }

  render(
    <EditorProvider editor={editor}>
      {children}
      <EditorContent />
    </EditorProvider>,
  );

  const host = screen.getByRole("textbox", { name: "Editor" });
  const editable = queryMountedEditable(host);
  const table = host.querySelector<HTMLElement>(
    `table[data-be-block-id="${tableBlockId}"]`,
  );
  if (table === null) throw new Error("표가 렌더되지 않았다");

  /**
   * 표 DOM이 재생성되는 명령(행/열 삽입·삭제·이동) 뒤에 다시 부른다.
   * 새로 만들어진 tr/td에는 스텁이 없어 rect가 0이 된다.
   *
   * 열 너비를 먼저 다시 맞춘다. insertTableColumn이 만드는 열은
   * DEFAULT_COLUMN_WIDTH(160px)를 받으므로
   * (packages/core/src/table-grid.ts:230) 맞추지 않으면 colgroup col이
   * [100,100,160]인데 스텁 격자는 균일 100을 전제해 어긋난다 — 마운트
   * 경로가 막는 바로 그 괴리를 여기서 되살리게 된다.
   *
   * 이미 목표 너비인 열은 건너뛴다. resizeTableColumn은 모델 값이 그대로면
   * 문서를 바꾸지 않고, EditorController는 "문서가 안 바뀐 커맨드"를
   * COMMAND_NOT_APPLICABLE로 되돌린다(실측 확인) — 매 호출마다 전 열을
   * 무조건 리사이즈하면 새로 삽입된 열이 없는 흔한 경우(첫 restubGeometry
   * 포함)에 항상 이 에러로 죽는다.
   *
   * 표는 마운트 시점 참조가 아니라 tableBlockId로 매번 다시 찾는다.
   * replaceDocument는 tiptap 편집기를 통째로 다시 만들어 마운트 시점의
   * table·editable 참조를 문서에서 떼어내는데(실측 확인), 그 참조에 스텁을
   * 씌우면 아무 데도 붙지 않은 노드를 칠하고 테스트는 rect가 0인 채로
   * 굴러간다.
   *
   * 격자는 **모든 행이 열 개수만큼 셀을 갖는 표**만 전제한다 — 셀을 행 안
   * 순번대로 좌우로 늘어놓고 폭은 항상 columnWidth 하나다. rowSpan/columnSpan이
   * 있는 표에는 쓰지 마라. 던지지 않고 조용히 틀린 rect를 씌운다(실측, 2x2
   * 기본 격자 기준: columnSpan 2 셀에 200이 아니라 폭 100px, rowSpan 2 셀에
   * 60이 아니라 높이 30px, 위 행이 덮은 자리가 빠진 둘째 행의 유일한 셀에
   * left 200이 아니라 100). 병합 표는 좌표를 직접 씌우거나, 이걸 부른 뒤
   * 어긋난 칸만 덮어써라.
   */
  const restubGeometry = () => {
    const currentTable = host.querySelector<HTMLElement>(
      `table[data-be-block-id="${tableBlockId}"]`,
    );
    if (currentTable === null) throw new Error("표를 다시 찾지 못했다");
    const columnCount = currentTable.querySelectorAll("colgroup col").length;
    const currentTableBlock = editor
      .getDocument()
      .blocks.find((candidate) => candidate.id === tableBlockId);
    for (let index = 0; index < columnCount; index += 1) {
      const currentWidth =
        currentTableBlock?.type === "table"
          ? currentTableBlock.columns[index]?.width
          : undefined;
      if (currentWidth === layout.columnWidth) continue;
      const resized = editor.commands.resizeTableColumn(
        tableBlockId,
        index,
        layout.columnWidth,
      );
      if (!resized.ok) throw new Error("열 너비 재정렬 실패");
    }
    // 너비 재정렬이 표 DOM을 다시 만들 수 있으므로 행/셀은 그 뒤에 읽는다.
    const rowElements = Array.from(
      currentTable.querySelectorAll<HTMLElement>("[data-be-row-id]"),
    );
    stubRect(currentTable, {
      left: layout.left,
      top: layout.top,
      width: layout.columnWidth * columnCount,
      height: layout.rowHeight * rowElements.length,
    });
    rowElements.forEach((row, rowIndex) => {
      stubRect(row, {
        left: layout.left,
        top: layout.top + rowIndex * layout.rowHeight,
        width: layout.columnWidth * columnCount,
        height: layout.rowHeight,
      });
      row
        .querySelectorAll<HTMLElement>("[data-be-column-id]")
        .forEach((cell, cellIndex) => {
          stubRect(cell, {
            left: layout.left + cellIndex * layout.columnWidth,
            top: layout.top + rowIndex * layout.rowHeight,
            width: layout.columnWidth,
            height: layout.rowHeight,
          });
        });
    });
  };
  restubGeometry();

  const block = tableBlockOf(editor);

  return {
    editor,
    host,
    editable,
    table,
    tableBlockId,
    rowIds: block.rows.map((row) => row.id),
    columnIds: block.columns.map((column) => column.id),
    restubGeometry,
  };
};
