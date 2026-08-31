/**
 * 목록 종류 변경 command 테스트가 공유하는 문서·목록 fixture와 마운트,
 * selection·stored marks·revision·event·undo 상태 단언을 소유한다.
 * 기존 통합 support는 이 모듈의 export를 re-export하고, 목록 종류 변경
 * 테스트는 좁은 원본을 직접 소비한다(G-TST-002).
 *
 * 이 모듈은 아래 afterEach 훅을 module scope에 등록한다. 마운트된 편집기를
 * 일괄 해제해 ProseMirror DOMObserver의 지연 flush를 막는다(G-TST-003).
 */
import type { Block, Document, ListItemBlockType } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { afterEach } from "vitest";

import {
  createEditor,
  type DocumentChangeEvent,
  type EditorController,
} from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";

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

export type ListItemType = ListItemBlockType;

/**
 * 목록 keyboard 계약이 목록 판별자, 명시 시작 번호와 자식 배치를 독립적으로
 * 조립하도록 저장 정규형 목록 항목을 만든다.
 */
export const listItemBlock = (
  id: string,
  type: ListItemType,
  text: string,
  options?: { startNumber?: number; children?: Block[] },
): Block => ({
  id,
  type,
  content: text === "" ? [] : [{ text }],
  ...(type === "numberedListItem" && options?.startNumber !== undefined
    ? { startNumber: options.startNumber }
    : {}),
  ...(options?.children === undefined ? {} : { children: options.children }),
});

/**
 * 테스트 fixture가 예측 가능한 안정 ID를 순서대로 만들도록 생성기를 구성한다.
 */
export const sequentialIds = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
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

/**
 * EditorController를 DOM에 마운트하고 내부 Tiptap Editor까지 돌려준다.
 * 마운트 소유권은 module scope cleanup 집합에 등록한다.
 */
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
 * command 전후 원자성을 문서·selection·stored marks·PM 문서로 비교할 수
 * 있도록 편집기 상태를 직렬화한다.
 */
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
 * 변환 전 selection이 콘텐츠 시작인 setBlockType 테스트와 insertDivider의
 * 결과 selection 테스트가 같은 리터럴을 공유한다(G-TST-002).
 */
export const caretAt = (tiptap: TiptapEditor, blockId: string) => {
  const position = contentTextStart(tiptap, blockId);
  return { type: "text", anchor: position, head: position };
};

/**
 * 명령이 현재 대상에 적용되지 않을 때 반환하는 구조화 오류를 만든다.
 */
export const notApplicable = (command: string) => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});
