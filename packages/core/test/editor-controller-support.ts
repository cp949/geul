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
import type { Document, InlineContent } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { afterEach } from "vitest";
import { createEditor, type EditorController } from "../src/index.js";

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

export const editorState = (
  editor: EditorController,
  tiptap: TiptapEditor,
) => ({
  document: editor.getDocument(),
  selection: tiptap.state.selection.toJSON(),
  storedMarks: tiptap.state.storedMarks?.map((mark) => mark.toJSON()) ?? null,
  tiptapDocument: tiptap.state.doc.toJSON(),
});
