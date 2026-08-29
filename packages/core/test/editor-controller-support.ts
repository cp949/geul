/**
 * EditorController 계층의 core 테스트가 공유하는 문서 fixture와 마운트, 저장
 * 문서에서 표 블록을 꺼내는 조회를 소유한다. 여러 테스트 파일이 같은 fixture를
 * 쓰므로 사본을 만들지 않고 이 모듈이 단독으로 갖는다(G-TST-002).
 *
 * table-test-support.ts와의 경계는 다루는 대상이다 — EditorController와 저장
 * Document를 다루면 이 모듈, tiptap Editor를 직접 다루는 격리 fixture와 셀
 * 위치·선택·캐럿 헬퍼면 저 모듈이다. 표 fixture가 양쪽에 나뉘어 있는 것은 그
 * 때문이고, 이름이 아니라 이 기준으로 찾는다.
 *
 * 이 모듈은 아래 afterEach 훅을 module scope에 등록하므로 import하는 것만으로
 * 훅이 붙는다. editorWithTable을 table-test-support.ts로 옮기면 tiptap 노드만
 * 검증하는 파일까지 그 훅을 얻는다.
 */
import type { Block, Document, InlineContent } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { NodeType, Schema } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { afterEach, expect } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import {
  createEditor,
  type DocumentChangeEvent,
  type EditorController,
} from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";

export const paragraphDocument = (text: string, revision = 0): Document => ({
  formatVersion: 1,
  revision,
  blocks: [
    {
      id: "block-1",
      type: "paragraph",
      content: [{ text }],
    },
  ],
});

/**
 * 최상위 블록 배열만 다른 문서를 만든다 — 각 케이스가 블록 배치를 그
 * 자리에서 선언해 fixture와 단언을 나란히 읽게 한다.
 */
export const documentOf = (...blocks: Block[]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});

/**
 * 문단 블록 리터럴을 만든다. 텍스트가 빈 문자열이면 content를 빈 배열로
 * 둔다(빈 블록) — 빈 text 조각을 넣지 않는 저장 문서의 정규형과 같다.
 * block-join-extension(병합 fixture)과 divider 명령 테스트(삽입 결과의 빈
 * 문단)가 공유한다(G-TST-002).
 */
export const paragraphBlock = (
  id: string,
  text: string,
  children?: Block[],
): Block => ({
  id,
  type: "paragraph",
  content: text === "" ? [] : [{ text }],
  ...(children === undefined ? {} : { children }),
});

/**
 * 문서를 문단으로 닫는 꼬리 블록 — heading·quote로 끝나면 로드 시 trailing
 * paragraph(UI-010)가 붙어 배치가 흔들리므로 이 블록으로 닫는다.
 * headingLevels456Document·quote 명령 테스트가 공유한다(G-TST-002).
 */
export const tailParagraphBlock: Block = {
  id: "tail",
  type: "paragraph",
  content: [{ text: "tail" }],
};

/**
 * level 4·5·6 heading 세 개 뒤에 문단 하나를 둔 문서. 꼬리는
 * tailParagraphBlock이다. heading-levels의 렌더·컨텍스트 조회 케이스와
 * quote-divider-round-trip의 level 4-6 왕복 케이스가 공유한다(G-TST-002).
 */
export const headingLevels456Document = (): Document =>
  documentOf(
    { id: "h4", type: "heading", level: 4, content: [{ text: "four" }] },
    { id: "h5", type: "heading", level: 5, content: [{ text: "five" }] },
    { id: "h6", type: "heading", level: 6, content: [{ text: "six" }] },
    tailParagraphBlock,
  );

/**
 * 깊이 1 자식 fixture — nestedParagraphDocument와 부모 타입 변환 테스트가
 * 공유.
 */
export const childParagraphBlock: Block = {
  id: "child-1",
  type: "paragraph",
  content: [{ text: "child" }],
};

/**
 * 깊이 1 자식을 가진 최소 문서 — parent-1(문단) 아래 child-1(문단) 하나.
 * DELTA-02a 완료 조건 2·3·4·5·7(depth≥1 명령 동작·D20 자식 딸린 블록
 * 의미론·중첩 선택 조회)이 공유하는 fixture다(G-TST-002).
 */
export const nestedParagraphDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "parent-1",
      type: "paragraph",
      content: [{ text: "parent" }],
      children: [childParagraphBlock],
    },
  ],
});

/**
 * 1x1 표 블록 리터럴. 표 인접 Backspace/Delete의 NodeSelection 후퇴
 * (block-join-extension.test.ts)와 표로 끝나는 문서의 trailing 정규화
 * (trailing-block-extension.test.ts)가 공유한다(G-TST-002).
 */
export const oneCellTableBlock = (id: string): Block => ({
  id,
  type: "table",
  columns: [{ id: "col-1", width: 160 }],
  rows: [
    {
      id: "row-1",
      cells: [
        {
          id: "cell-1",
          columnId: "col-1",
          rowSpan: 1,
          columnSpan: 1,
          content: [{ text: "cell" }],
        },
      ],
    },
  ],
  headerRows: 0,
  headerColumns: 0,
});

export const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
};

export const documentWithContent = (content: InlineContent): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "block-1", type: "paragraph", content }],
});

/**
 * 저장 문서의 인덱스 1 블록을 표 블록으로 꺼낸다. 인덱스 1을 보는 이유는
 * 이 계열 fixture가 문단 1개 뒤에 표를 넣는 배치이기 때문이다. 타입 가드를
 * 겸하므로 호출부는 반환값을 표 블록으로 좁혀 쓴다.
 */
export const tableBlockIn = (document: Document) => {
  const block = document.blocks[1];
  if (block?.type !== "table") throw new Error("Expected a table block");
  return block;
};

/**
 * tableBlockIn의 컨트롤러판. 인덱스와 타입 가드 규칙 자체는 tableBlockIn이
 * 단독으로 소유한다.
 */
export const tableBlockOf = (editor: EditorController) =>
  tableBlockIn(editor.getDocument());

/**
 * 위치를 모르는 표 블록을 찾는다. 붙여넣기는 표 앞뒤에 문단을 남길 수 있어
 * 표 인덱스가 고정이 아니다(실측: 문단·표·문단이 섞인 클립보드를 붙여넣은
 * 문서의 블록 타입이 `["paragraph","paragraph","table","paragraph"]`).
 * 인덱스를 전제하지 않는 것이 이 질의가 tableBlockIn과 갈리는 이유다. 여러
 * 표가 있으면 문서 순서로 첫 번째를 준다.
 */
export const firstTableBlockIn = (document: Document) => {
  const block = document.blocks.find((b) => b.type === "table");
  if (block?.type !== "table") throw new Error("표 블록이 없다");
  return block;
};

/**
 * 문단 1개 뒤에 rows x columns 표를 넣은 컨트롤러와 그 표의 blockId,
 * 셀 id 목록을 만든다. 기본값은 2x2다. 크기를 따지지 않는 호출부가 인자를
 * 생략하기도 하고 `(2, 2)`를 그대로 적기도 한다 — 무엇도 한쪽을 강제하지
 * 않으므로 둘 중 어느 표기도 규칙이 아니다.
 *
 * 표 삽입으로 문서가 표로 끝나므로 trailing paragraph(UI-010)가 같은
 * dispatch에서 끝에 추가된다 — blocks는 [문단, 표, 빈 문단] 3개이고 표
 * 인덱스는 여전히 1이다(tableBlockIn 계약 유지). trailing의 blockId는 이
 * fixture의 순차 id 하나("id-N")를 소비한다.
 *
 * cellIds는 행 우선(row-major) 순서다 — 3x2 표에서 이 목록을 마운트된
 * 편집기의 tr별 셀 id 목록과 대조해 확인했다. 즉 인덱스 i는 행
 * `Math.floor(i / columns)`, 열 `i % columns`이고, 2x2에서
 * `[topLeft, topRight, bottomLeft, bottomRight]`가 된다.
 *
 * 이 좌표 공식은 **생성 시점**의 격자에만 맞다. 반환된 배열은 그때의
 * 스냅샷이라 문서가 바뀌어도 갱신되지 않는다 — 2x2 네 셀을 병합하면 문서의
 * 셀은 좌상단 하나로 줄지만 cellIds는 그대로 넷이라 셋이 문서에 없는 id가
 * 된다. 배치를 바꾼 뒤에는 이 목록으로 좌표를 다시 계산하지 않고 문서에서
 * 셀을 다시 읽는다.
 */
export const editorWithTable = (rows = 2, columns = 2) => {
  const editor = createEditor({
    initialDocument: paragraphDocument("content"),
    createId: sequentialIds("id"),
  });
  const inserted = editor.commands.insertTable("block-1", { rows, columns });
  if (!inserted.ok) throw new Error("표 삽입 fixture 준비 실패");
  const table = tableBlockOf(editor);
  return {
    editor,
    tableBlockId: inserted.value.blockId,
    cellIds: table.rows.flatMap((row) => row.cells.map((cell) => cell.id)),
  };
};

/**
 * 테스트가 마운트한 에디터 목록. 마운트된 채 남으면 ProseMirror DOMObserver의
 * 지연 flush가 jsdom 환경 해제 이후에 실행되어 "document is not defined"
 * unhandled error가 된다. afterEach에서 일괄 해제한다.
 */
const mountedEditors = new Set<EditorController>();

afterEach(() => {
  // destroy()는 멱등이므로 테스트가 이미 해제한 에디터도 안전하다.
  for (const editor of mountedEditors) editor.destroy();
  mountedEditors.clear();
});

export const mountTiptapEditor = (
  editor: EditorController,
): { editable: HTMLElement; tiptap: TiptapEditor } => {
  const container = document.createElement("div");
  editor.mount(container);
  const editable = container.querySelector<
    HTMLElement & { editor?: TiptapEditor }
  >("[contenteditable='true']");
  if (editable?.editor === undefined) {
    throw new Error("Mounted Tiptap editor was not available");
  }
  mountedEditors.add(editor);
  return { editable, tiptap: editable.editor };
};

/**
 * onChange를 모으며 마운트한 에디터 — id는 "id-N" 순차 배정이다.
 * insertDivider 계약·divider 삭제 characterization
 * (editor-controller-divider.test.ts)과 divider 명령 characterization
 * (editor-controller-divider-commands.test.ts)이 공유한다(G-TST-002).
 */
export const mounted = (initialDocument: Document) => {
  const changes: DocumentChangeEvent[] = [];
  const onChange = (event: DocumentChangeEvent) => changes.push(event);
  const createId = sequentialIds("id");
  const editor = createEditor({ initialDocument, createId, onChange });
  return { editor, changes, ...mountTiptapEditor(editor) };
};

/**
 * 거절·selection-only command가 기존 stored mark를 보존하는지 검증할 수
 * 있도록 문서·history 변경 없이 bold stored mark를 강제로 설정한다.
 * mark를 금지하는 CodeBlock caret에서도 fixture 상태를 만들 수 있다.
 */
export const setBoldStoredMark = (tiptap: TiptapEditor): void => {
  const bold = tiptap.schema.marks.bold;
  if (bold === undefined) throw new Error("bold mark 조회 실패");
  tiptap.view.dispatch(tiptap.state.tr.setStoredMarks([bold.create()]));
};

/**
 * 표 명령 등과 무관하게 스키마·appendTransaction만 검사하는 테스트가 공유하는
 * 최소 마운트 헬퍼. 프로덕션 스키마를 돌려준다. paragraphDocument("seed")는
 * 실제 콘텐츠와 무관한 placeholder다 — 각 테스트가 자신의 트랜잭션으로 문서를
 * 직접 조작한다.
 */
export const liveSchema = () => {
  const editor = createEditor({
    initialDocument: paragraphDocument("seed"),
    createId: sequentialIds("seed"),
  });
  return mountTiptapEditor(editor).tiptap.schema;
};

/**
 * 스키마에서 이름으로 노드 타입을 찾는다 — 없으면 던진다. `nodes.x?.…` 형태의
 * optional chaining은 노드가 없을 때 `undefined`가 되어
 * `expect(undefined).not.toBeNull()`이 공허 통과하는 함정이 있다 — 이 helper로
 * 노드 부재 가드를 통일해 그 함정을 막는다.
 */
export const requireNode = (schema: Schema, name: string): NodeType => {
  const node = schema.nodes[name];
  if (node === undefined) throw new Error(`${name} node missing`);
  return node;
};

export const editorState = (
  editor: EditorController,
  tiptap: TiptapEditor,
) => ({
  document: editor.getDocument(),
  selection: tiptap.state.selection.toJSON(),
  storedMarks: tiptap.state.storedMarks?.map((mark) => mark.toJSON()) ?? null,
  tiptapDocument: tiptap.state.doc.toJSON(),
});

/**
 * undo 뒤 기대 상태 — before(editorState 스냅샷)와 같되 revision만 오른다.
 * quote·divider 명령 테스트가 "undo 1회 복원" 단언에 공유한다(G-TST-002).
 */
export const restored = (
  before: ReturnType<typeof editorState>,
  revision: number,
) => ({ ...before, document: { ...before.document, revision } });

/**
 * blockId 문단의 텍스트 시작(contentTextStart)에 놓인 빈 TextSelection JSON.
 * setBlockType·insertDivider가 캐럿을 콘텐츠 시작에 두는 계약을 quote·
 * heading-levels·divider 명령 테스트가 같은 리터럴로 단언한다(G-TST-002).
 */
export const caretAt = (tiptap: TiptapEditor, blockId: string) => {
  const position = contentTextStart(tiptap, blockId);
  return { type: "text", anchor: position, head: position };
};

/**
 * quote 블록 리터럴 — quote/divider 왕복·명령 fixture. children은 quote
 * 아래 자식 블록을 붙이는 인자로, 후속 DELTA(quote 변환·명령)의 fixture가
 * 쓴다. io에도 같은 빌더가 있지만 패키지 경계상 import하지 않는다.
 */
export const quoteBlock = (
  id: string,
  text: string,
  children?: Block[],
): Block => ({
  id,
  type: "quote",
  content: [{ text }],
  ...(children === undefined ? {} : { children }),
});

/**
 * divider 블록 리터럴 — content도 children도 없는 리프. quote와 마찬가지로
 * quote/divider 왕복·명령 fixture로 쓴다.
 */
export const dividerBlock = (id: string): Block => ({
  id,
  type: "divider",
});

/**
 * "문단-divider-문단" 3블록 fixture 구성 요소와 그 문서. insertDivider
 * 계약(editor-controller-divider.test.ts)과 divider 명령
 * characterization(editor-controller-divider-commands.test.ts)이
 * 동일 사본으로 두던 것을 승격했다(G-TST-002).
 */
export const firstParagraphBlock = paragraphBlock("block-1", "first");
export const secondParagraphBlock = paragraphBlock("block-2", "second");
export const dividerD1 = dividerBlock("d-1");
export const dividerBetweenParagraphsDocument = () =>
  documentOf(firstParagraphBlock, dividerD1, secondParagraphBlock);

/**
 * 명령 Result 단언 리터럴 — 성공 void(okResult) / COMMAND_NOT_APPLICABLE
 * 거절(notApplicable). 값이 있는 성공은 호출부가 직접 쓴다. divider·quote
 * 명령 테스트가 공유한다(G-TST-002).
 */
export const okResult = { ok: true, value: undefined };
export const notApplicable = (command: string) => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

/**
 * blockId 블록을 NodeSelection으로 선택한다 — 비포장 atom 블록(divider)은
 * 캐럿(TextSelection)을 둘 안쪽이 없어 이 방식으로만 선택할 수 있다. 04b
 * 삭제 characterization(editor-controller-divider.test.ts)과 04c 명령
 * characterization(editor-controller-divider-commands.test.ts)이
 * 공유한다(G-TST-002).
 */
export const selectBlockNode = (
  tiptap: TiptapEditor,
  blockId: string,
): void => {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  if (position === null) throw new Error(`블록 ${blockId} 조회 실패`);
  const { tr, doc } = tiptap.state;
  tiptap.view.dispatch(tr.setSelection(NodeSelection.create(doc, position)));
};

/**
 * 현재 selection이 blockId divider의 NodeSelection인지 단언한다. 04c 명령
 * characterization(editor-controller-divider-commands.test.ts)과 05 join
 * 테스트(block-join-extension.test.ts)가 공유한다(G-TST-002).
 */
export const expectDividerNodeSelection = (
  tiptap: Pick<TiptapEditor, "state">,
  blockId: string,
): void => {
  const { selection } = tiptap.state;
  expect(selection).toBeInstanceOf(NodeSelection);
  const { node } = selection as NodeSelection;
  expect(node.type.name).toBe("divider");
  expect(node.attrs.blockId).toBe(blockId);
};
