// @vitest-environment jsdom

/**
 * SlashMenu의 슬래시 질의 팝업 트리거·필터링·항목 적용을 검증한다.
 */

import type { CodeBlock, HeadingBlock, TableBlock } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { SlashMenu } from "../../src/index.js";
import {
  focusOutsideEditor,
  mountBlockEditor,
  mountTableEditor,
  placeCaret,
} from "../mount-editor.js";
import { fireSelectionChange } from "../selection-events.js";
import { renderCaretBlocks, typeIntoBlock } from "./slash-menu-test-support.js";

afterEach(cleanup);

/**
 * selectionchange와 같은 React batch에서 다시 렌더된 뒤 layout effect로 Escape를
 * 보낸다. SlashMenu의 menu DOM commit 뒤 active passive effect 전 event seam이다.
 */
const EscapeOnSlashMenuCommit = ({
  onEscapeDispatched,
}: {
  onEscapeDispatched: () => void;
}) => {
  const [selectionVersion, setSelectionVersion] = useState(0);
  const hasDispatchedRef = useRef(false);

  useEffect(() => {
    const handleSelectionChange = () =>
      setSelectionVersion((current) => current + 1);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  useLayoutEffect(() => {
    if (selectionVersion === 0 || hasDispatchedRef.current) return;
    const menu = document.querySelector(
      '[role="listbox"][aria-label="Slash menu"]',
    );
    const editable = document.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (menu === null || editable === null) return;
    hasDispatchedRef.current = true;
    editable.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      }),
    );
    onEscapeDispatched();
  }, [onEscapeDispatched, selectionVersion]);

  return null;
};

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
    // (DELTA-02e 정정).
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
    // 기존 option 순서 뒤에 목록 넷(toggle-list 포함), 삽입 전용
    // Table·Divider·File·Image·Video·Audio가 이어진다(RD-003 DELTA-01,
    // spec §3.1 file/image/video/audio 순서).
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(25);
    expect(
      options.map(
        (option) =>
          option.querySelector(".geul-slash-menu__item-label")?.textContent,
      ),
    ).toEqual([
      "Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
      "Toggle Heading 1",
      "Toggle Heading 2",
      "Toggle Heading 3",
      "Toggle Heading 4",
      "Toggle Heading 5",
      "Toggle Heading 6",
      "Quote",
      "Code",
      "Bulleted List",
      "Numbered List",
      "Check List",
      "Toggle List",
      "Table",
      "Divider",
      "File",
      "Image",
      "Video",
      "Audio",
    ]);
    expect(screen.getByRole("option", { name: /^Text/ })).not.toBeNull();
    expect(screen.getByRole("option", { name: /^Heading 1/ })).not.toBeNull();
  });

  it("입력한 질의에 맞춰 항목을 걸러낸다", () => {
    const rendered = renderCaretBlocks();

    typeIntoBlock(rendered, 0, "/head");

    // "head"는 label·keyword 부분 일치로 heading 1-6과 toggle heading
    // 1-6을 모두 매치한다(RD-004 DELTA-04, toggle-heading의 keywords에도
    // "heading"이 있다) — 6 + 6 = 12.
    expect(screen.getAllByRole("option")).toHaveLength(12);
    expect(screen.queryByRole("option", { name: /^Text/ })).toBeNull();
  });

  it("항목을 클릭하면 clearContent와 함께 setBlockType을 호출하고 편집기로 초점을 되돌린다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/h1");
    // "/h1"은 keyword 부분 일치로 Toggle Heading 1도 함께 매치한다(RD-004
    // DELTA-04) — 앵커로 Heading 1만 정확히 좁힌다.
    const option = screen.getByRole("option", { name: /^Heading 1/ });
    focusOutsideEditor(option);

    fireEvent.click(option);

    // 실제 setBlockType(blockId, {heading,1}, {clearContent:true})가 돌았음을
    // 문서로 본다 — 스파이는 명령이 아무것도 하지 않아도 통과한다.
    const rawBlock = rendered.editor.getDocument().blocks[0];
    if (rawBlock?.type !== "heading") throw new Error("제목 블록이 아니다");
    // "heading"은 예약 리터럴이라 CustomBlock일 수 없다.
    const block = rawBlock as HeadingBlock;
    expect(block.id).toBe(blockId);
    expect(block.level).toBe(1);
    // clearContent: true — 트리거로 쓴 "/h1"이 본문에 남지 않는다.
    expect(block.content).toEqual([]);
    expect(document.activeElement).toBe(rendered.editable);
  });

  it.each([4, 5, 6] as const)(
    "Heading %i 항목 클릭이 clearContent와 함께 setBlockType(level %i)을 호출한다",
    (level) => {
      const rendered = renderCaretBlocks();
      const blockId = typeIntoBlock(rendered, 0, `/h${level}`);
      // 앵커로 Toggle Heading %i(같은 키워드 "h%i"를 공유, RD-004
      // DELTA-04)와 구분한다.
      const option = screen.getByRole("option", {
        name: new RegExp(`^Heading ${level}`),
      });
      focusOutsideEditor(option);

      fireEvent.click(option);

      // 실제 setBlockType(blockId, {heading,level}, {clearContent:true})가
      // 돌았음을 문서로 본다 — 스파이는 명령이 아무것도 하지 않아도 통과한다.
      const rawBlock = rendered.editor.getDocument().blocks[0];
      if (rawBlock?.type !== "heading") throw new Error("제목 블록이 아니다");
      // "heading"은 예약 리터럴이라 CustomBlock일 수 없다.
      const block = rawBlock as HeadingBlock;
      expect(block.id).toBe(blockId);
      expect(block.level).toBe(level);
      // clearContent: true — 트리거로 쓴 "/h4" 등이 본문에 남지 않는다.
      expect(block.content).toEqual([]);
      expect(document.activeElement).toBe(rendered.editable);
    },
  );

  it("Toggle Heading 1 항목 클릭이 clearContent와 함께 isToggleable:true heading을 만든다(RD-004 DELTA-04)", () => {
    const rendered = renderCaretBlocks();
    // "/toggle"은 Toggle List·Toggle Heading 1-6 전부를 매치한다 — accessible
    // name은 라벨+설명 텍스트가 이어붙어 "Toggle Heading 1Large collapsible
    // heading"이 되므로(다른 Heading 테스트와 동일 이유) 왼쪽 앵커만 쓴다.
    // "Toggle Heading 1"과 겹치는 다른 접두어는 없다(레벨이 1-6뿐).
    const blockId = typeIntoBlock(rendered, 0, "/toggle");
    const option = screen.getByRole("option", { name: /^Toggle Heading 1/ });
    focusOutsideEditor(option);

    fireEvent.click(option);

    const rawBlock = rendered.editor.getDocument().blocks[0];
    if (rawBlock?.type !== "heading") throw new Error("제목 블록이 아니다");
    // "heading"은 예약 리터럴이라 CustomBlock일 수 없다.
    const block = rawBlock as HeadingBlock;
    expect(block.id).toBe(blockId);
    expect(block.level).toBe(1);
    expect(block.isToggleable).toBe(true);
    // clearContent: true — 트리거로 쓴 질의가 본문에 남지 않는다.
    expect(block.content).toEqual([]);
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("Quote 항목 클릭이 clearContent와 함께 setBlockType(quote)을 호출한다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/quote");
    const option = screen.getByRole("option", { name: /Quote/ });
    focusOutsideEditor(option);

    fireEvent.click(option);

    const block = rendered.editor.getDocument().blocks[0];
    if (block?.type !== "quote") throw new Error("인용 블록이 아니다");
    expect(block.id).toBe(blockId);
    // clearContent: true — 트리거로 쓴 "/quote"가 본문에 남지 않는다.
    expect(block.content).toEqual([]);
    expect(document.activeElement).toBe(rendered.editable);
  });

  it("Code 항목 클릭이 같은 id의 빈 CodeBlock을 text 언어로 만들고 편집기로 초점을 되돌린다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/code");
    const option = screen.getByRole("option", { name: /Code/ });
    focusOutsideEditor(option);

    fireEvent.click(option);

    const rawBlock = rendered.editor.getDocument().blocks[0];
    if (rawBlock?.type !== "codeBlock") throw new Error("코드 블록이 아니다");
    // "codeBlock"은 예약 리터럴이라 CustomBlock일 수 없다.
    const block = rawBlock as CodeBlock;
    expect(block.id).toBe(blockId);
    expect(block.content).toEqual([]);
    expect(block.language).toBe("text");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it.each([
    {
      query: "/bullet",
      label: "Bulleted List",
      type: "bulletListItem" as const,
    },
    {
      query: "/number",
      label: "Numbered List",
      type: "numberedListItem" as const,
    },
    {
      query: "/check",
      label: "Check List",
      type: "checkListItem" as const,
    },
    {
      query: "/toggle",
      label: "Toggle List",
      type: "toggleListItem" as const,
    },
  ])(
    "$label 항목의 pointerdown→click이 트리거를 지우고 같은 id의 목록을 만든 뒤 메뉴를 닫고 초점을 복원한다",
    ({ query, label, type }) => {
      const rendered = renderCaretBlocks();
      const blockId = typeIntoBlock(rendered, 0, query);
      // label 정규식은 앵커 없이도 유일하게 매치한다 — "Toggle List"는
      // "Toggle Heading N"(RD-004 DELTA-04)과 공통 접두어를 공유하지 않는다.
      const option = screen.getByRole("option", { name: new RegExp(label) });
      focusOutsideEditor(option);

      expect(fireEvent.pointerDown(option)).toBe(false);
      fireEvent.click(option);

      const block = rendered.editor.getDocument().blocks[0];
      expect(block?.type).toBe(type);
      if (
        block?.type !== "bulletListItem" &&
        block?.type !== "numberedListItem" &&
        block?.type !== "checkListItem" &&
        block?.type !== "toggleListItem"
      ) {
        throw new Error("목록 블록이 아니다");
      }
      expect(block.id).toBe(blockId);
      expect(block.content).toEqual([]);
      expect(screen.queryByRole("listbox", { name: "Slash menu" })).toBeNull();
      expect(document.activeElement).toBe(rendered.editable);
    },
  );

  it("ArrowDown 후 Enter가 강조한 Numbered List command를 실행한다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/list");
    // "/list"는 라벨에 "List"가 들어간 Bulleted/Numbered/Check/Toggle List
    // 넷을 모두 매치한다(matchesQuery의 라벨 부분 일치, toggle-list는
    // RD-004 DELTA-04 추가) — 배열 순서상 Bulleted List가 0번, Numbered
    // List가 1번이라 ArrowDown 한 번의 목적지는 그대로다.
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(
      screen
        .getByRole("option", { name: /Bulleted List/ })
        .getAttribute("aria-selected"),
    ).toBe("true");

    expect(fireEvent.keyDown(rendered.host, { key: "ArrowDown" })).toBe(false);
    expect(
      screen
        .getByRole("option", { name: /Numbered List/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(fireEvent.keyDown(rendered.host, { key: "Enter" })).toBe(false);

    const block = rendered.editor.getDocument().blocks[0];
    if (block?.type !== "numberedListItem") {
      throw new Error("번호 목록 블록이 아니다");
    }
    expect(block.id).toBe(blockId);
    expect(block.content).toEqual([]);
    expect(screen.queryByRole("listbox", { name: "Slash menu" })).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it.each([
    {
      type: "bulletListItem" as const,
      selector: "[data-be-bullet-list-item]",
    },
    {
      type: "numberedListItem" as const,
      selector: "[data-be-numbered-list-item]",
    },
    {
      type: "checkListItem" as const,
      selector: "[data-be-check-list-item]",
    },
    {
      type: "toggleListItem" as const,
      selector: "[data-be-toggle-list-item]",
    },
  ])(
    "$type source의 Slash menu는 Code를 제외하고 네 목록·Table·Divider·media 4종을 유지한다",
    ({ type, selector }) => {
      const rendered = renderCaretBlocks();
      const blockId = typeIntoBlock(rendered, 0, "/");
      const converted = rendered.editor.commands.setBlockType(blockId, {
        type,
      });
      if (!converted.ok) throw new Error("목록 블록 fixture 준비 실패");
      const listItem = rendered.host.querySelector<HTMLElement>(selector);
      if (listItem === null) throw new Error("목록 편집 DOM을 찾지 못했다");

      placeCaret(listItem);
      expect(rendered.editor.getCaretBlockContext()?.blockType.type).toBe(type);
      fireSelectionChange();

      expect(screen.queryByRole("option", { name: /^Code/ })).toBeNull();
      expect(
        screen.getByRole("option", { name: /Bulleted List/ }),
      ).not.toBeNull();
      expect(
        screen.getByRole("option", { name: /Numbered List/ }),
      ).not.toBeNull();
      expect(screen.getByRole("option", { name: /Check List/ })).not.toBeNull();
      expect(
        screen.getByRole("option", { name: /Toggle List/ }),
      ).not.toBeNull();
      expect(screen.getByRole("option", { name: /Table/ })).not.toBeNull();
      expect(screen.getByRole("option", { name: /Divider/ })).not.toBeNull();
      expect(screen.getByRole("option", { name: /Image/ })).not.toBeNull();
      expect(screen.getAllByRole("option")).toHaveLength(24);
    },
  );

  it.each(["/", "/code"])(
    "CodeBlock source가 %s여도 selectionchange로 Slash menu를 열지 않는다",
    (source) => {
      const rendered = renderCaretBlocks();
      const blockId = typeIntoBlock(rendered, 0, source);
      const converted = rendered.editor.commands.setBlockType(blockId, {
        type: "codeBlock",
      });
      if (!converted.ok) throw new Error("코드 블록 fixture 준비 실패");
      const code = rendered.host.querySelector<HTMLElement>(
        "[data-be-code-block] code",
      );
      if (code === null) throw new Error("코드 편집 DOM을 찾지 못했다");

      placeCaret(code);
      expect(rendered.editor.getCaretBlockContext()).toEqual({
        blockId,
        blockType: { type: "codeBlock", language: "text" },
        text: source,
      });
      fireSelectionChange();

      expect(screen.queryByRole("listbox", { name: "Slash menu" })).toBeNull();
    },
  );

  it("Divider 항목을 클릭하면 트리거 블록 텍스트를 지우며 divider를 삽입하고 편집기로 초점을 되돌린다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/divider");
    // 전제: 아직 divider가 없다. 있었다면 아래 "divider가 생겼다"는 삽입과
    // 무관하다.
    expect(rendered.editor.getDocument().blocks).toHaveLength(1);

    fireEvent.click(screen.getByRole("option", { name: /Divider/ }));

    // blocks 3개 = 트리거 문단 + divider + trailing paragraph(문서 끝에
    // divider가 놓이면 같은 dispatch에서 빈 문단이 뒤따른다, divider-commands.ts).
    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks).toHaveLength(3);
    const trigger = blocks[0];
    if (trigger?.type !== "paragraph") throw new Error("트리거 문단이 아니다");
    expect(trigger.id).toBe(blockId);
    // clearAfterBlockText: true — 트리거 블록의 "/divider"가 지워진다.
    expect(trigger.content).toEqual([]);
    const divider = blocks[1];
    if (divider?.type !== "divider") throw new Error("divider 블록이 아니다");
    const trailing = blocks[2];
    if (trailing?.type !== "paragraph")
      throw new Error("trailing 문단이 아니다");
    expect(trailing.content).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });

  it.each([
    { mediaKind: "file" as const, optionName: /^File/ },
    { mediaKind: "image" as const, optionName: /^Image/ },
    { mediaKind: "video" as const, optionName: /^Video/ },
    { mediaKind: "audio" as const, optionName: /^Audio/ },
  ])(
    "$mediaKind 항목을 클릭하면 트리거 블록 텍스트를 지우며 빈 미디어 블록을 삽입하고 그 블록을 NodeSelection으로 선택한다",
    ({ mediaKind, optionName }) => {
      const rendered = renderCaretBlocks();
      const blockId = typeIntoBlock(rendered, 0, `/${mediaKind}`);
      // 전제: 아직 media 블록이 없다.
      expect(rendered.editor.getDocument().blocks).toHaveLength(1);

      fireEvent.click(screen.getByRole("option", { name: optionName }));

      // blocks 3개 = 트리거 문단 + media + trailing paragraph(문서 끝에
      // media가 놓이면 divider·table과 같은 이유로 같은 dispatch에서 빈
      // 문단이 뒤따른다, media-commands.ts).
      const blocks = rendered.editor.getDocument().blocks;
      expect(blocks).toHaveLength(3);
      const trigger = blocks[0];
      if (trigger?.type !== "paragraph")
        throw new Error("트리거 문단이 아니다");
      expect(trigger.id).toBe(blockId);
      // clearAfterBlockText: true — 트리거 블록의 "/$mediaKind"가 지워진다.
      expect(trigger.content).toEqual([]);
      const media = blocks[1];
      if (media?.type !== mediaKind) throw new Error("미디어 블록이 아니다");
      const trailing = blocks[2];
      if (trailing?.type !== "paragraph")
        throw new Error("trailing 문단이 아니다");
      expect(trailing.content).toEqual([]);
      expect(screen.queryByRole("listbox")).toBeNull();
      // insertMediaBlock은 divider와 달리 삽입한 블록 자신을 NodeSelection
      // 으로 선택한다(RD-001 media-commands.ts, RD-003 File Panel 자동
      // 오픈 전제) — selectItem()의 focusEditor() 뒤에도 DOM 초점만 옮길
      // 뿐 PM selection은 그대로 유지된다.
      expect(rendered.editor.getSelectionMediaBlock()).toEqual({
        blockId: media.id,
        kind: mediaKind,
        url: null,
        name: null,
        caption: null,
        showPreview: mediaKind === "file" ? null : true,
        textAlignment: null,
      });
      expect(document.activeElement).toBe(rendered.editable);
    },
  );

  it("표 항목을 클릭하면 트리거 블록 텍스트를 지우며 3x3 표를 삽입한다", () => {
    const rendered = renderCaretBlocks();
    const blockId = typeIntoBlock(rendered, 0, "/table");
    // 전제: 아직 표가 없다. 있었다면 아래 "표가 생겼다"는 삽입과 무관하다.
    expect(rendered.editor.getDocument().blocks).toHaveLength(1);

    fireEvent.click(screen.getByRole("option", { name: /Table/ }));

    // blocks 3개 = 트리거 문단 + 표 + trailing paragraph(UI-010, 표 삽입이
    // 문서를 표로 끝나게 해 같은 dispatch에서 빈 문단이 추가된다).
    const blocks = rendered.editor.getDocument().blocks;
    expect(blocks).toHaveLength(3);
    const trigger = blocks[0];
    if (trigger?.type !== "paragraph") throw new Error("트리거 문단이 아니다");
    expect(trigger.id).toBe(blockId);
    // clearAfterBlockText: true — 트리거 블록의 "/table"이 지워진다.
    expect(trigger.content).toEqual([]);
    const rawTable = blocks[1];
    if (rawTable?.type !== "table") throw new Error("표 블록이 아니다");
    // "table"은 예약 리터럴이라 CustomBlock일 수 없다.
    const table = rawTable as TableBlock;
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

  it("메뉴 DOM이 commit된 직후 Escape를 누르면 effect 등록 전에도 닫히고 편집기 초점을 유지한다", async () => {
    let resolveEscape!: () => void;
    const escapeDispatched = new Promise<void>((resolve) => {
      resolveEscape = resolve;
    });
    const rendered = mountBlockEditor({
      children: (
        <>
          <EscapeOnSlashMenuCommit onEscapeDispatched={resolveEscape} />
          <SlashMenu />
        </>
      ),
    });
    rendered.editable.focus();
    expect(document.activeElement).toBe(rendered.editable);

    typeIntoBlock(rendered, 0, "/");
    await escapeDispatched;

    expect(screen.queryByRole("listbox", { name: "Slash menu" })).toBeNull();
    expect(document.activeElement).toBe(rendered.editable);
  });
});
