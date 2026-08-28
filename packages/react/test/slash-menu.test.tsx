// @vitest-environment jsdom

/**
 * SlashMenu 컴포넌트: 슬래시 질의 팝업의 트리거 감지·필터링·항목 적용, hover 시
 * 블록 추가 버튼과 드래그 핸들 노출, 드래그로 블록 재정렬, 핸들 클릭 시 블록
 * 종류 변경·복제·삭제 메뉴를 검증한다.
 *
 * 모든 describe가 실제 createEditor() 마운트 위에서 돈다(Issue #76) — 손으로
 * 조립한 fake 컨트롤러/DOM 레인은 남아 있지 않다. 명령이 진짜라 호출 스파이
 * 대신 문서 결과를 단언하고, 캐럿도 실제 DOM 선택으로 놓는다.
 *
 * SlashMenu는 BlockSideMenu·TableHandles·TableSelectionToolbar를 함께
 * 마운트하므로(slash-menu.tsx 렌더 말미) 실제 마운트에서는 나머지 셋도
 * 살아난다. role 쿼리는 전부 accessible name으로 좁혀 두 오버레이가 같은
 * role을 내는 상황에서도 대상이 흔들리지 않게 한다.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SlashMenu } from "../src/index.js";
import { expectIconOnlyButton } from "./expect-icon-button.js";
import {
  focusOutsideEditor,
  type MountedBlockEditor,
  mountBlockEditor,
  mountTableEditor,
  placeCaret,
} from "./mount-editor.js";
import { fireSelectionChange } from "./selection-events.js";

// @testing-library/react는 전역 afterEach나 teardown이 함수일 때만 자동
// cleanup을 등록한다(dist/index.js의 typeof afterEach === "function" 분기와
// 그 else의 teardown fallback). vitest는 globals: true일 때만 그 전역을
// 노출하는데 저장소 루트 vitest.config.ts에는 globals도 setupFiles도 없어 자동
// cleanup이 없다(실측: 이 설정에서 둘 다 undefined). 각 it 말미의 unmount로는
// assertion이 먼저 던질 때 DOM이 남아 다음 테스트의 getByRole(...)가
// "multiple elements"로 실패한다 — 진짜 실패가 가려진다.
afterEach(cleanup);

// 드래그 핸들 accessible name — 드래그와 클릭(블록 메뉴) 두 동작을 모두 기술한다.
const dragHandleLabel = "Drag to reorder, click for options";
const addBlockLabel = "Add block";
// TableHandles의 라벨. 표 hover 테스트에서 "포인터가 살아 있는 오버레이에
// 실제로 닿았다"를 고정하는 데만 쓴다.
const addRowLabel = "Add row";

// jsdom은 Pointer Capture API를 구현하지 않는다. 드래그 핸들이 pointerdown에서
// 호출하므로 테스트 환경에서만 no-op으로 채운다.
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

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

describe("SlashMenu 질의 팝업", () => {
  it("캐럿이 블록 안에 없으면 렌더링하지 않는다", () => {
    // 표 셀 안의 캐럿이 실제 편집기가 만드는 "블록 밖 캐럿"이다. tableCell은
    // 그 자체가 textblock이라 문단·제목과 달리 blockId 속성을 갖지 않고
    // (model-to-tiptap.ts), getCaretBlockContext가 null을 돌려준다.
    const { editable, editor, host, table } = mountTableEditor({
      children: <SlashMenu />,
    });
    editable.focus();
    const paragraphBlock = editor.getDocument().blocks[0];
    if (paragraphBlock?.type !== "paragraph") {
      throw new Error("본문 문단을 찾지 못했다");
    }
    // D19(컨테이너 스키마)부터 blockId는 <p> 자신이 아니라 그 부모
    // <div>(blockContainer)에 있다 — 자손 selector로 실제 문단 요소를 찾는다
    // (pending-issues/11.md 정정, DELTA-02e).
    const paragraph = host.querySelector<HTMLElement>("[data-be-block-id] p");
    const cell = table.querySelector<HTMLElement>("[data-be-cell-id]");
    if (paragraph === null || cell === null) {
      throw new Error("문단 또는 표 셀을 찾지 못했다");
    }
    const typed = editor.commands.setText(paragraphBlock.id, "/");
    if (!typed.ok) throw new Error("슬래시 질의 fixture 준비 실패");
    placeCaret(paragraph);
    fireSelectionChange();
    // 전제: 문단 안 캐럿에서는 메뉴가 실제로 뜬다. 이 단언이 없으면 아래
    // 부재는 "SlashMenu가 캐럿을 아예 읽지 못한다"로도 통과한다(Issue #62).
    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();

    placeCaret(cell);
    // 전제: 캐럿이 정말 블록 밖으로 나갔다.
    expect(editor.getCaretBlockContext()).toBeNull();
    fireSelectionChange();

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("블록 텍스트가 슬래시 질의가 아니면 렌더링하지 않는다", () => {
    const rendered = renderCaretBlocks();

    // typeIntoBlock이 "캐럿은 이 블록 안에 있고 텍스트는 hello"를 전제로
    // 고정한다 — 캐럿이 닿지 않아 메뉴가 안 뜬 경우와 구분된다.
    typeIntoBlock(rendered, 0, "hello");

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("블록 텍스트가 슬래시 하나뿐이면 모든 항목을 열어 표시한다", () => {
    const rendered = renderCaretBlocks();

    typeIntoBlock(rendered, 0, "/");

    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("option", { name: /Text/ })).not.toBeNull();
    expect(screen.getByRole("option", { name: /Heading 1/ })).not.toBeNull();
  });

  it("입력한 질의에 맞춰 항목을 걸러낸다", () => {
    const rendered = renderCaretBlocks();

    typeIntoBlock(rendered, 0, "/head");

    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.queryByRole("option", { name: /^Text/ })).toBeNull();
  });

  it("항목을 클릭하면 clearContent와 함께 setBlockType을 호출하고 편집기로 초점을 되돌린다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/h1");
    const option = screen.getByRole("option", { name: /Heading 1/ });
    focusOutsideEditor(option);

    fireEvent.click(option);

    // 실제 setBlockType(blockId, {heading,1}, {clearContent:true})가 돌았음을
    // 문서로 본다 — 스파이는 명령이 아무것도 하지 않아도 통과한다.
    const block = rendered.editor.getDocument().blocks[0];
    if (block?.type !== "heading") throw new Error("제목 블록이 아니다");
    expect(block.id).toBe(blockId);
    expect(block.level).toBe(1);
    // clearContent: true — 트리거로 쓴 "/h1"이 본문에 남지 않는다.
    expect(block.content).toEqual([]);
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("표 항목을 클릭하면 트리거 블록 텍스트를 지우며 3x3 표를 삽입한다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/table");
    // 전제: 아직 표가 없다. 있었다면 아래 "표가 생겼다"는 삽입과 무관하다.
    expect(rendered.editor.getDocument().blocks).toHaveLength(1);

    fireEvent.click(screen.getByRole("option", { name: /Table/ }));

    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks).toHaveLength(2);
    const trigger = blocks[0];
    if (trigger?.type !== "paragraph") throw new Error("트리거 문단이 아니다");
    expect(trigger.id).toBe(blockId);
    // clearAfterBlockText: true — 트리거 블록의 "/table"이 지워진다.
    expect(trigger.content).toEqual([]);
    const table = blocks[1];
    if (table?.type !== "table") throw new Error("표 블록이 아니다");
    expect(table.rows).toHaveLength(3);
    expect(table.columns).toHaveLength(3);
    expect(table.rows[0]?.cells).toHaveLength(3);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape를 누르면 닫는다", () => {
    const rendered = renderCaretBlocks();
    typeIntoBlock(rendered, 0, "/");
    expect(screen.getByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(rendered.host, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("SlashMenu 블록 추가 버튼", () => {
  it("hover하지 않으면 블록 추가 버튼을 렌더링하지 않는다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");

    expect(screen.queryByRole("button", { name: addBlockLabel })).toBeNull();

    // liveness는 부재를 측정한 "뒤에" 고정한다. hover를 먼저 쏘면 이 테스트가
    // 세우려는 상태(한 번도 hover하지 않음)가 사라지지만, 이미 읽어낸 부재
    // 뒤에 쏘는 hover는 그 상태를 건드리지 않는다. 이 단언이 없으면 위 부재는
    // "거터가 통째로 죽어 있다"로도 통과한다(Issue #62).
    fireEvent.pointerMove(block);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("블록에 hover하면 블록 추가 버튼을 표시한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("포인터가 버튼 위로 이동하는 동안에도 블록 추가 버튼을 계속 표시한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);
    const addBlockButton = screen.getByRole("button", { name: addBlockLabel });

    fireEvent.pointerMove(addBlockButton);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("hover한 블록 뒤에 문단을 삽입하고 그 블록의 메뉴를 연다", () => {
    const rendered = renderRealBlocks();
    const [block] = rendered.blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    // 전제: 문서에 문단이 하나뿐이다 — 삽입 결과를 순서로 볼 수 있어야 한다.
    expect(blockIdsOf(rendered)).toEqual(rendered.blockIds);
    fireEvent.pointerMove(block);

    fireEvent.click(screen.getByRole("button", { name: addBlockLabel }));

    // 실제 insertParagraphAfter가 hover한 블록 바로 뒤에 문단을 넣었다.
    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.id).toBe(rendered.blockIds[0]);
    const inserted = blocks[1];
    if (inserted?.type !== "paragraph") throw new Error("새 문단이 아니다");
    expect(inserted.content).toEqual([]);
    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(5);

    // 메뉴가 "그 블록"으로 열렸는지는 캐럿 갱신 한 번으로 갈린다. 실제
    // insertParagraphAfter는 캐럿을 새 문단으로 옮기므로(전제), 메뉴가 hover한
    // 옛 블록으로 열렸다면 여기서 blockId가 어긋나 곧바로 닫힌다 — 옛 블록의
    // 텍스트("본문")는 슬래시 질의가 아니기 때문이다.
    expect(rendered.editor.getCaretBlockContext()?.blockId).toBe(inserted.id);
    fireSelectionChange();
    expect(screen.getByRole("listbox", { name: "Slash menu" })).not.toBeNull();
  });

  it("슬래시가 아닌 문자를 입력한 뒤에는 메뉴를 다시 열지 않는다", () => {
    const rendered = renderRealBlocks();
    const [block] = rendered.blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);
    fireEvent.click(screen.getByRole("button", { name: addBlockLabel }));
    expect(screen.getByRole("listbox")).not.toBeNull();
    const inserted = rendered.editor.getDocument().blocks[1];
    if (inserted === undefined) throw new Error("새 문단이 없다");
    // 전제: 실제 insertParagraphAfter가 캐럿을 새 문단으로 옮겼다 — 아래
    // 입력이 그 블록의 텍스트로 읽히는 근거다.
    expect(rendered.editor.getCaretBlockContext()?.blockId).toBe(inserted.id);

    const typed = rendered.editor.commands.setText(inserted.id, "a");
    if (!typed.ok) throw new Error("입력 fixture 준비 실패");
    fireSelectionChange();

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("SlashMenu 드래그 핸들", () => {
  it("hover 시 add-block 버튼과 함께 드래그 핸들을 표시한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block);

    expect(
      screen.getByRole("button", { name: dragHandleLabel }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("표 위에 hover해도 블록 거터(드래그 핸들·add-block 버튼)를 표시하지 않는다", () => {
    // 표는 table-handles.tsx가 자체 행/열 핸들을 갖는다. BlockSideMenu가
    // 표에도 반응하면 두 오버레이의 gutter가 같은 좌표 부근에 겹쳐 렌더돼
    // 실 브라우저에서 표 행 핸들 클릭이 block-side-menu의 "Add block"
    // 버튼으로 새는 결함이 있었다(e2e에서만 재현, jsdom hit-test로는 못 잡음).
    const { table } = mountTableEditor({ children: <SlashMenu /> });

    fireEvent.pointerMove(table);

    // 전제: 포인터가 살아 있는 오버레이에 실제로 닿았다 — 같은 pointermove로
    // 표 자신의 핸들은 떠야 한다. 이 단언이 없으면 아래 두 부재는 "오버레이가
    // 통째로 죽었다"로도 통과한다(Issue #62).
    expect(screen.getByRole("button", { name: addRowLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: dragHandleLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: addBlockLabel })).toBeNull();
  });

  it("따옴표·백슬래시가 든 블록 id에서도 hover 거터가 크래시 없이 표시된다", () => {
    // 블록 id는 z.string() 임의 문자열이라 attribute selector에 보간하면
    // 따옴표·백슬래시에서 querySelector가 SyntaxError를 던진다.
    const { blocks } = renderRealBlocks({ blockIds: ['a"b\\c'] });
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    // 전제: 특수문자 id가 실제로 DOM 속성까지 그대로 내려갔다 — 그래야 이
    // 테스트가 노리는 selector 위험이 존재한다.
    expect(block.getAttribute("data-be-block-id")).toBe('a"b\\c');

    fireEvent.pointerMove(block);

    expect(screen.getByRole("button", { name: addBlockLabel })).not.toBeNull();
  });

  it("드래그 핸들과 블록 추가 버튼에 aria-hidden 아이콘과 title을 부여한다", () => {
    const { blocks } = renderRealBlocks();
    const [block] = blocks;
    if (block === undefined) throw new Error("블록 요소가 없다");
    fireEvent.pointerMove(block);

    const expectedButtons = [
      { label: dragHandleLabel, iconClass: "lucide-grip-vertical" },
      { label: addBlockLabel, iconClass: "lucide-plus" },
    ];
    for (const { label, iconClass } of expectedButtons) {
      expectIconOnlyButton(
        screen.getByRole("button", { name: label }),
        label,
        iconClass,
      );
    }
  });

  it("핸들을 드래그해 다른 블록 앞에 놓으면 삽입 가이드를 표시하고 moveBlockBefore를 호출한다", () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const { blockIds, blocks, editable } = rendered;
    const block3 = blocks[2];
    if (block3 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block3);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // 첫 블록 상반부(5 < 0 + 20/2)를 겨냥한다. 세로 좌표만 준 이유: 이 fixture에는
    // 표가 없어 TableHandles의 hover 여백(HANDLE_HOVER_MARGIN) 판정이 없고,
    // BlockSideMenu의 삽입 지점 계산은 clientY만 읽는다.
    fireEvent.pointerMove(editable, { pointerId: 1, clientY: 5 });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).not.toBeNull();

    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 실제 moveBlockBefore(block-3, block-1)이 돌았음을 블록 순서로 본다 —
    // 개수만 세면 어느 블록이 움직였는지 구분하지 못한다.
    expect(blockIdsOf(rendered)).toEqual([
      blockIds[2],
      blockIds[0],
      blockIds[1],
    ]);
  });

  it("자기 자신의 현재 위치로 드래그하면 moveBlockBefore를 호출하지 않는다", () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2"],
    });
    const { blocks, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block1 = blocks[0];
    if (block1 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block1);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    // 드래그 중 포인터 이벤트는 핸들에 쏜다. BlockSideMenu가 pointerdown에서
    // setPointerCapture를 걸므로 실제 브라우저에서도 이후 pointermove는 전부
    // 핸들로 재타깃된다. 편집 영역에 쏘면 hover 거터가 내려가 아래 "메뉴가
    // 열리지 않는다"가 클릭 억제가 아니라 거터 부재로 통과한다(Issue #62).
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    // 목표 인덱스가 출발 인덱스와 같아 삽입 가이드가 그려지지 않는다
    // (block-side-menu.tsx의 isNoop). 이 단언이 억제를 짚는 유일한 관측점이다
    // — 아래 문서 불변은 실제 컨트롤러도 제자리 moveBlockBefore를
    // COMMAND_NOT_APPLICABLE로 되돌리기 때문에(editor-controller.ts) 오버레이가
    // 억제했는지 컨트롤러가 거절했는지 구분하지 못한다. 여기서 hasDragged는
    // 이미 참이므로(hypot(0, 5) = 5 ≥ 4) 이 부재는 isNoop 분기만을 짚는다 —
    // "드래그가 시작조차 안 됐다"와 섞이지 않는다.
    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(screen.getByRole("button", { name: dragHandleLabel })).toBe(handle);
    fireEvent.click(handle, { detail: 1 });

    // 커맨드가 나갔더라도 문서는 그대로다 — 위 가이드 부재를 보강하는 단언이다.
    expect(editor.getDocument()).toEqual(documentBeforeDrag);
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
  });

  it("Escape로 드롭 없이 드래그를 취소하면 아무 명령도 호출하지 않는다", async () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2"],
    });
    const { blocks, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block2 = blocks[1];
    if (block2 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block2);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    // 전제: 취소 전에는 드래그가 실제로 진행 중이고 삽입 지점도 잡혔다.
    // 이 단언이 없으면 아래 부재는 "드래그가 시작조차 안 됐다"로도 통과한다.
    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // 핸들 위에서만 포인터를 움직였으므로 거터는 그대로 떠 있다 — click이
    // 문서에서 떨어진 노드로 새지 않았음을 고정한다(Issue #62).
    expect(screen.getByRole("button", { name: dragHandleLabel })).toBe(handle);
    fireEvent.click(handle, { detail: 1 });

    expect(editor.getDocument()).toEqual(documentBeforeDrag);
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
  });

  it("pointercancel 뒤 후속 click이 블록 메뉴를 열지 않는다", async () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2"],
    });
    const { blocks, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block2 = blocks[1];
    if (block2 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block2);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    // 전제: 취소 전에는 드래그가 실제로 진행 중이었다.
    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).not.toBeNull();
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByRole("button", { name: dragHandleLabel })).toBe(handle);
    fireEvent.click(handle, { detail: 1 });

    expect(editor.getDocument()).toEqual(documentBeforeDrag);
    expect(screen.queryByRole("menu", { name: "Block menu" })).toBeNull();
  });

  it("드래그를 시작한 pointer와 다른 pointer 이벤트는 무시한다", () => {
    const rendered = renderRealBlocks({
      blockIds: ["block-1", "block-2", "block-3"],
    });
    const { blockIds, blocks, editable, editor } = rendered;
    const documentBeforeDrag = editor.getDocument();
    const block3 = blocks[2];
    if (block3 === undefined) throw new Error("블록 요소가 없다");

    fireEvent.pointerMove(block3);
    const handle = screen.getByRole("button", { name: dragHandleLabel });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 0,
      clientY: 50,
    });
    fireEvent.pointerMove(editable, { pointerId: 2, clientX: 0, clientY: 5 });
    fireEvent.pointerUp(editable, { pointerId: 2 });

    expect(
      document.querySelector("[data-be-block-insertion-guide]"),
    ).toBeNull();
    expect(editor.getDocument()).toEqual(documentBeforeDrag);

    fireEvent.pointerMove(editable, { pointerId: 1, clientX: 0, clientY: 5 });
    fireEvent.pointerUp(editable, { pointerId: 1 });

    // 같은 pointerId로 다시 끌면 재정렬이 커밋된다 — 위 두 부재가 "드래그가
    // 처음부터 죽어 있었다"로 통과하지 않음을 이 성공 경로가 고정한다.
    expect(blockIdsOf(rendered)).toEqual([
      blockIds[2],
      blockIds[0],
      blockIds[1],
    ]);
  });
});
