import { expect } from "vitest";

import { SlashMenu } from "../../src/index.js";
import { type MountedBlockEditor, mountBlockEditor, placeCaret } from "../mount-editor.js";
import { fireSelectionChange } from "../selection-events.js";

const dragHandleLabel = "Drag to reorder, click for options";
const addBlockLabel = "Add block";
const addRowLabel = "Add row";

/**
 * 문단만 있는 실제 편집기를 마운트하고 SlashMenu를 얹는다. 표가 섞이면
 * TableHandles가 함께 살아나 hover 판정이 갈라지므로, 표가 필요한 테스트만
 * mountTableEditor를 따로 쓴다.
 */
const renderRealBlocks = (options?: { blockIds?: readonly string[] }) =>
  mountBlockEditor({ ...options, children: <SlashMenu /> });

/**
 * 위와 같되 편집 영역에 미리 초점을 준다. ProseMirror는 초점이 없으면 DOM
 * 선택 변화를 무시하므로(hasFocusAndSelection) placeCaret이 조용히 no-op가
 * 된다. 캐럿을 놓는 테스트만 이쪽을 쓴다.
 */
const renderCaretBlocks = (options?: { blockIds?: readonly string[] }) => {
  const rendered = renderRealBlocks(options);
  rendered.editable.focus();
  expect(document.activeElement).toBe(rendered.editable);
  return rendered;
};

/**
 * 블록 텍스트를 실제 명령으로 세우고 그 블록에 캐럿을 놓은 뒤 SlashMenu에
 * 알린다. 키 입력을 그대로 재현하지 않는 이유: jsdom에는 contenteditable의
 * beforeinput→DOM 변경 경로가 없어 타이핑이 문서에 닿지 않는다. setText는
 * 실제 컨트롤러 명령이므로 결과 문서는 타이핑과 같다.
 *
 * 돌려주기 전에 실제 컨트롤러가 이 캐럿을 어떻게 보는지 전제로 고정한다 —
 * 캐럿이 편집기에 닿지도 않은 채 "메뉴가 안 뜬다"로 통과하는 부재 단언을
 * 막는다(Issue #62).
 */
const typeIntoBlock = (
  rendered: MountedBlockEditor,
  blockIndex: number,
  text: string,
): string => {
  const blockId = rendered.blockIds[blockIndex];
  const block = rendered.blocks[blockIndex];
  if (blockId === undefined || block === undefined) {
    throw new Error("입력할 블록을 찾지 못했다");
  }
  const typed = rendered.editor.commands.setText(blockId, text);
  if (!typed.ok) throw new Error("블록 텍스트 fixture 준비 실패");
  placeCaret(block);
  expect(rendered.editor.getCaretBlockContext()).toEqual({
    blockId,
    blockType: { type: "paragraph" },
    text,
  });
  fireSelectionChange();
  return blockId;
};

/** 현재 문서의 블록 id 목록. 재정렬·삽입 결과를 순서까지 이 목록으로 본다. */
const blockIdsOf = (rendered: MountedBlockEditor) =>
  rendered.editor.getDocument().blocks.map((block) => block.id);

export { addBlockLabel, addRowLabel, blockIdsOf, dragHandleLabel, renderCaretBlocks, renderRealBlocks, typeIntoBlock };
