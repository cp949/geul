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
 * 위치를 모르는 표 블록을 찾는다. 붙여넣기처럼 블록 배치가 바뀌는 경로
 * 뒤에서 쓰므로 표의 인덱스를 전제하지 않는다 — 인덱스 고정형인
 * tableBlockIn과 질의가 다른 이유다.
 */
export const firstTableBlockIn = (document: Document) => {
  const block = document.blocks.find((b) => b.type === "table");
  if (block?.type !== "table") throw new Error("표 블록이 없다");
  return block;
};

/**
 * 문단 1개 뒤에 rows x columns 표를 넣은 컨트롤러와 그 표의 blockId,
 * 셀 id 목록을 만든다. 기본값 2x2는 이 계열에서 가장 흔한 형태라 크기를
 * 따지지 않는 호출부는 인자 없이 쓴다.
 *
 * cellIds는 행 우선(row-major) 순서다 — 3x2 표에서 이 목록을 마운트된
 * 편집기의 tr별 셀 id 목록과 대조해 확인했다. 즉 인덱스 i는 행
 * `Math.floor(i / columns)`, 열 `i % columns`이고, 2x2에서
 * `[topLeft, topRight, bottomLeft, bottomRight]`가 된다.
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
