/**
 * 표 셀 위 drop 테스트가 공유하는 문서 fixture·마운트·위임 판정 헬퍼를 소유한다
 * (G-TST-002). 여러 줄 평문 drop(Issue #309)과 여러 블록 html drop(Issue
 * #311) 테스트가 같은 문서와 같은 좌표 stub을 쓴다.
 *
 * - 좌표: stubPosAtCoords(jsdom은 좌표를 해석하지 못해 view.posAtCoords를 바꾼다)
 * - 문서: cellDropBlocks(문단 p1, codeBlock cb, 1x1 표 t, tail)
 * - 마운트(블록 위): mountDropAt(drop 위치가 블록 텍스트의 offset)
 * - 마운트: mountCellDrop(선택은 tail 끝 캐럿, drop 위치는 셀 offset)
 * - 위임 판정: handledDrop(플러그인 handleDrop 반환값을 직접 읽는다)
 * - 이벤트: htmlDrop(text/html과 text/plain을 함께 싣는 drop 이벤트)
 *
 * 표 fixture 원본(singleCellTable)과 위치 헬퍼(inCell)는
 * table-boundary-test-support.ts가 소유한다.
 */
import type { Block } from "@cp949/geul-model";
import { Slice } from "@tiptap/pm/model";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import { dropData } from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
} from "./editor-controller-support.js";
import { inCell, singleCellTable } from "./table-boundary-test-support.js";

type Tiptap = ReturnType<typeof mountTiptapEditor>["tiptap"];

/** view.posAtCoords가 pos를 가리키게 바꾼다. null이면 좌표를 못 푼다. */
export const stubPosAtCoords = (tiptap: Tiptap, pos: number | null): void => {
  tiptap.view.posAtCoords = () => (pos === null ? null : { pos, inside: pos });
};

/**
 * 셀 위 drop 문서다. 문단 p1 "abcd", codeBlock cb "code", 1x1 표(셀 t-r0c0
 * "cell"), 문단 tail "tail".
 */
export const cellDropBlocks = (): Block[] => [
  paragraphBlock("p1", "abcd"),
  codeBlockBlock("cb", "code"),
  singleCellTable("t", "cell"),
  paragraphBlock("tail", "tail"),
];

/**
 * blocks를 마운트하고 view.posAtCoords가 caretBlockId 블록 텍스트의 offset을
 * 가리키게 stub한다. 선택은 건드리지 않는다.
 */
export const mountDropAt = (
  blocks: Block[],
  caretBlockId: string,
  offset: number,
) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  const pos = contentTextStart(tiptap, caretBlockId) + offset;
  stubPosAtCoords(tiptap, pos);
  return { editor, editable, tiptap, pos };
};

/**
 * blocks를 마운트하고 선택을 tail 끝 캐럿에 둔다. drop 위치(posAtCoords)는 셀
 * t-r0c0의 cellOffset이다.
 */
export const mountCellDrop = (
  blocks: Block[] = cellDropBlocks(),
  cellOffset = 2,
) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);
  const pos = inCell("t-r0c0", cellOffset)(tiptap);
  stubPosAtCoords(tiptap, pos);
  return { editor, editable, tiptap, pos };
};

/**
 * 플러그인의 handleDrop 반환값을 직접 읽는다. 위임이면 falsy이고 문서가 그대로다.
 * slice는 기본이 Slice.empty다. PM이 html에서 파싱한 slice를 흉내 낼 때만
 * 넘긴다. 빈 slice는 html이 비었다는 신호라 html 동반 입력의 위임 판정은
 * 실제 slice로 해야 한다(Issue #316).
 */
export const handledDrop = (
  tiptap: Tiptap,
  event: DragEvent,
  slice: Slice = Slice.empty,
): unknown =>
  tiptap.view.someProp("handleDrop", (handler) =>
    handler(tiptap.view, event, slice, false),
  );

/** text/html과 text/plain을 함께 싣는 drop 이벤트를 만들어 editable에 보낸다. */
export const htmlDrop = (editable: HTMLElement, html: string): DragEvent =>
  dropData(editable, { "text/html": html, "text/plain": "plain" });
