/**
 * 접힌 캐럿 서식 명령 테스트(editor-controller-caret-marks*.test.ts)가
 * 공유하는 마운트, 캐럿 배치, 상태 스냅샷, 입력 helper를 소유한다(G-TST-002).
 *
 * 마운트된 편집기의 정리는 mounted()가 쓰는 mountTiptapEditor의
 * module scope afterEach에 위임한다(G-TST-003).
 */
import type { Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { type Mock, vi } from "vitest";
import type { EditorController } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  editorState,
  mounted,
  paragraphBlock,
  paragraphDocument,
  setBoldStoredMark,
} from "./editor-controller-support.js";

/**
 * block-1 "content"에서 캐럿이 놓이는 문자 오프셋이다. "con" 뒤다.
 */
export const CARET_OFFSET = 3;

/**
 * block-1 "content"의 CARET_OFFSET에 캐럿을 둔 편집기를 마운트한다.
 * 캐럿을 둔 뒤에 listener를 등록하므로, 반환된 listener는 이후 명령이
 * 일으킨 통지만 센다.
 */
export const mountedAtCaret = (
  initialDocument: Document = paragraphDocument("content"),
) => {
  const fixture = mounted(initialDocument);
  fixture.tiptap.commands.setTextSelection(
    contentTextStart(fixture.tiptap, "block-1") + CARET_OFFSET,
  );
  const listener: Mock<() => void> = vi.fn();
  fixture.editor.subscribe(listener);
  return { ...fixture, listener };
};

/**
 * 문단, codeBlock, 문단 순서의 문서다. 마지막이 문단이라 로드 정규화가 없다.
 */
export const codeBlockCaretDocument = (): Document =>
  documentOf(
    paragraphBlock("before", "left"),
    codeBlockBlock("code", "code", "text"),
    paragraphBlock("tail", "tail"),
  );

/**
 * codeBlock 안에 캐럿을 두고 bold stored mark를 심은 편집기를 마운트한다.
 * 거절이 기존 stored mark를 보존하는지 보려는 fixture다.
 * stored mark를 심은 뒤에 listener를 등록한다.
 */
export const mountedInCodeBlock = () => {
  const fixture = mounted(codeBlockCaretDocument());
  fixture.tiptap.commands.setTextSelection(
    contentTextStart(fixture.tiptap, "code") + 1,
  );
  setBoldStoredMark(fixture.tiptap);
  const listener: Mock<() => void> = vi.fn();
  fixture.editor.subscribe(listener);
  return { ...fixture, listener };
};

/**
 * 거절이 바꾸면 안 되는 모든 관측 지점을 한 객체로 모은다.
 * 문서(revision 포함), PM 문서, selection, stored mark,
 * undo 가능 여부, onChange 횟수, subscribe listener 호출 수다(G-EDT-001).
 */
export const stateSnapshot = (fixture: {
  editor: EditorController;
  tiptap: TiptapEditor;
  changes: unknown[];
  listener: { mock: { calls: unknown[] } };
}) => ({
  ...editorState(fixture.editor, fixture.tiptap),
  canUndo: fixture.tiptap.can().undo(),
  changeCount: fixture.changes.length,
  listenerCalls: fixture.listener.mock.calls.length,
});

/**
 * 현재 selection 위치에 텍스트를 입력한다. stored mark가 있으면
 * 입력한 텍스트에 붙는다.
 */
export const typeAtCaret = (tiptap: TiptapEditor, text: string): void => {
  tiptap.commands.insertContent(text);
};

/**
 * block-1의 inline content를 저장 문서 형태로 읽는다.
 */
export const blockContent = (editor: EditorController) => {
  const block = editor.getBlock("block-1");
  return block !== undefined && "content" in block ? block.content : undefined;
};
