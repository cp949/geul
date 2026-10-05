// @vitest-environment jsdom

/**
 * iframe 문서에 렌더한 react 오버레이가 메인 문서와 같게 동작하는지 확인한다
 * (Issue #271).
 *
 * React가 iframe 문서에 그린 노드는 iframe realm 인스턴스다. 전역
 * `Element`·`HTMLElement` 생성자의 `instanceof`가 거짓이 된다. 반면
 * ProseMirror·core가 만든 노드(editable, 블록, 표 셀, iframe 블록의 `<iframe>`)는
 * iframe 문서에 붙어도 메인 realm 인스턴스다. 그래서 판정은 realm과 무관한
 * `dom-node.ts` helper로 한다.
 *
 * 경로마다 같은 시나리오를 메인 문서와 iframe 문서에서 돌린다. 메인 문서가
 * 대조군이다.
 * - 회귀: 닫힘(바깥 pointerdown, 막힌 Escape), hover 후보, 초점 복귀, 툴바·메뉴
 *   키보드 이동, clip 숨김, iframe 블록 interact 해제.
 * - 보호: 대상이 PM 노드인 경로(캐럿 행 활성 바, 셀 hover 행·열, 여백 안 다른
 *   블록 hover 해제, interact 진입). helper가 PM 노드를 놓치면 RED다.
 * - helper 단위: 두 realm의 요소를 모두 요소로 판정한다.
 *
 * iframe 문서 Element에는 pointer capture가 없어 frame realm prototype에 빈
 * 구현을 둔다. 초점은 `container.ownerDocument.activeElement`로 본다.
 */

import { DEFAULT_DICTIONARY, type EditorController } from "@cp949/geul-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isElementNode, isHtmlElement, isNode } from "../src/dom-node.js";
import { StaticToolbar } from "../src/index.js";
import { MediaHandleOverlays } from "../src/media-handle-overlays.js";
import { TableHandles } from "../src/table-handles.js";
import {
  type DismissReason,
  useDismissibleOverlay,
} from "../src/use-dismissible-overlay.js";
import { usePointerHoverTarget } from "../src/use-pointer-hover-target.js";
import { withProvider } from "./fake-editor-provider.js";
import {
  mountBlockEditor,
  mountTableEditor,
  paragraphOf,
  placeCaret,
  stubRect,
} from "./mount-editor.js";
import { fakeStaticToolbarController } from "./static-toolbar-test-support.js";

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}

const editors: EditorController[] = [];
const frames: HTMLIFrameElement[] = [];

/**
 * React 렌더 → 편집기 → iframe 순서로 정리한다(G-TST-003). 하나가 던져도
 * 나머지를 정리하고 실패를 모아 던진다.
 */
const tearDown = () => {
  const errors: unknown[] = [];
  const attempt = (step: () => void) => {
    try {
      step();
    } catch (error) {
      errors.push(error);
    }
  };
  attempt(cleanup);
  for (const editor of editors.splice(0)) attempt(() => editor.destroy());
  for (const frame of frames.splice(0)) attempt(() => frame.remove());
  if (errors.length > 0) throw new AggregateError(errors, "정리 실패");
};

afterEach(tearDown);

/** 메인 문서 body에 렌더 container를 붙인다. cleanup이 떼어 낸다. */
const createMainContainer = (): HTMLElement => {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
};

/**
 * iframe을 붙이고 그 문서 body에 렌더 container를 만든다. frame realm
 * `Element.prototype`에 pointer capture 빈 구현을 둔다. jsdom iframe 문서
 * Element에는 이 메서드가 없다.
 */
const createFrameContainer = (): HTMLElement => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  frames.push(iframe);
  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow as
    (Window & typeof globalThis) | null;
  if (frameDocument === null || frameWindow === null) {
    throw new Error("iframe 문서가 없다");
  }
  frameWindow.Element.prototype.setPointerCapture = () => {};
  frameWindow.Element.prototype.releasePointerCapture = () => {};
  const container = frameDocument.createElement("div");
  frameDocument.body.append(container);
  return container;
};

const SURFACES = [
  ["메인 문서", createMainContainer],
  ["iframe 문서", createFrameContainer],
] as const;

/** container가 속한 문서 body 기준 쿼리. 전역 `screen`은 메인 문서만 본다. */
const queriesFor = (container: HTMLElement) =>
  within(container.ownerDocument.body);

/** container가 속한 문서의 초점 요소. */
const activeIn = (container: HTMLElement) =>
  container.ownerDocument.activeElement;

const ALLOW_SELECTORS = ["[data-test-panel]"] as const;

/**
 * useDismissibleOverlay를 건 최소 오버레이. 편집기 host 안에 React 버튼
 * `host-inner`를 둔다. 그 버튼의 keydown은 React가 먼저 `preventDefault`한다.
 */
const DismissProbe = ({
  onClose,
}: {
  onClose: (reason: DismissReason) => void;
}) => {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useDismissibleOverlay({
    open: true,
    element: host,
    allowSelectors: ALLOW_SELECTORS,
    onClose,
  });
  return (
    <div>
      <div data-testid="host" ref={setHost}>
        <button
          data-testid="host-inner"
          onKeyDown={(event) => event.preventDefault()}
          type="button"
        >
          inner
        </button>
      </div>
      <div data-test-panel="" data-testid="panel" />
      <button data-testid="outside" type="button">
        outside
      </button>
    </div>
  );
};

/** usePointerHoverTarget을 건 container. 안쪽에 entity 후보 하나를 둔다. */
const HoverProbe = ({
  onCandidateChange,
}: {
  onCandidateChange: (candidate: HTMLElement | null) => void;
}) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  usePointerHoverTarget({
    element,
    ignoreSelectors: [],
    entitySelector: "[data-test-entity]",
    onCandidateChange,
  });
  return (
    <div ref={setElement}>
      <button data-test-entity="" data-testid="entity" type="button">
        entity
      </button>
    </div>
  );
};

const rowHandleLabel = "Drag to reorder row, click for options";

/** 표의 `rowIndex`번 행, `columnIndex`번 셀(PM이 만든 TD). */
const cellOf = (
  table: HTMLElement,
  rowIndex: number,
  columnIndex: number,
): HTMLElement => {
  const row =
    table.querySelectorAll<HTMLElement>("[data-geul-row-id]")[rowIndex];
  const cell = row?.querySelectorAll<HTMLElement>("[data-geul-column-id]")[
    columnIndex
  ];
  if (cell === undefined) throw new Error("셀을 찾지 못했다");
  return cell;
};

/** 렌더된 행·열 hit box를 화면 순서대로 읽는다. */
const hitBoxes = (container: HTMLElement, axis: "row" | "column") =>
  Array.from(
    container.ownerDocument.querySelectorAll<HTMLElement>(
      `[data-geul-table-${axis}-handle-hit]`,
    ),
  );

/** hit box에 활성 바 표시가 붙었는지. */
const isActive = (hit: HTMLElement | undefined, axis: "row" | "column") =>
  hit?.hasAttribute(`data-geul-table-${axis}-handle-active`) ?? false;

/** 실편집기 표를 container에 마운트하고 TableHandles를 얹는다. */
const mountTable = (container: HTMLElement) => {
  const mounted = mountTableEditor({ container, children: <TableHandles /> });
  editors.push(mounted.editor);
  return mounted;
};

describe.each(SURFACES)("%s의 useDismissibleOverlay", (_, createContainer) => {
  it("React 요소 위 바깥 pointerdown이 outside로 1회 닫는다", () => {
    const container = createContainer();
    const onClose = vi.fn();
    render(<DismissProbe onClose={onClose} />, { container });

    fireEvent.pointerDown(queriesFor(container).getByTestId("outside"));

    expect(onClose.mock.calls).toEqual([["outside"]]);
  });

  it("host 안 React 요소가 막은 Escape를 escape로 1회 닫는다", () => {
    const container = createContainer();
    const onClose = vi.fn();
    render(<DismissProbe onClose={onClose} />, { container });

    fireEvent.keyDown(queriesFor(container).getByTestId("host-inner"), {
      key: "Escape",
    });

    expect(onClose.mock.calls).toEqual([["escape"]]);
  });
});

describe.each(SURFACES)("%s의 usePointerHoverTarget", (_, createContainer) => {
  it("React 요소 후보에 hover 후보 알림이 1회 온다", () => {
    const container = createContainer();
    const onCandidateChange = vi.fn();
    render(<HoverProbe onCandidateChange={onCandidateChange} />, {
      container,
    });
    const entity = queriesFor(container).getByTestId("entity");

    fireEvent.pointerMove(entity);

    expect(onCandidateChange).toHaveBeenCalledTimes(1);
    expect(onCandidateChange.mock.calls[0]?.[0]).toBe(entity);
  });

  it("실편집기 표 hover 뒤 host 밖 좌표로 옮기면 행·열 핸들이 사라진다", () => {
    const container = createContainer();
    const m = mountTable(container);
    const ui = queriesFor(container);
    fireEvent.pointerMove(m.table);
    expect(ui.queryByRole("button", { name: "Add row" })).not.toBeNull();

    // 표(100–300, 100–160)의 hover 여백을 확실히 넘는 좌표. target은
    // React가 그린 host다.
    fireEvent.pointerMove(m.host, { clientX: 500, clientY: 500 });

    expect(ui.queryByRole("button", { name: "Add row" })).toBeNull();
    expect(ui.queryAllByRole("button", { name: rowHandleLabel })).toHaveLength(
      0,
    );
  });
});

describe.each(SURFACES)("%s의 StaticToolbar", (_, createContainer) => {
  it("블록 타입 메뉴가 자동으로 닫힐 때 메뉴 안 초점이 editable로 돌아온다", () => {
    const container = createContainer();
    const m = mountBlockEditor({
      blockIds: ["block-1", "block-2"],
      children: <StaticToolbar />,
      container,
    });
    editors.push(m.editor);
    const ui = queriesFor(container);
    placeCaret(paragraphOf(m.blocks[0]));
    // 키보드 활성화(detail 0)로 열어 초점을 메뉴 옵션에 둔다.
    fireEvent.click(ui.getByRole("button", { name: "Block type" }), {
      detail: 0,
    });
    expect(activeIn(container)?.getAttribute("role")).toBe("option");

    // 대상 블록이 사라진 상황: 조회를 null로 고정하고 다른 블록을 바꿔
    // 상태 변경 통지를 일으킨다.
    vi.spyOn(m.editor, "getSelectionBlockType").mockReturnValue(null);
    act(() => {
      m.editor.commands.setBlockType("block-2", { type: "quote" });
    });

    expect(ui.queryByRole("listbox")).toBeNull();
    expect(activeIn(container)).toBe(m.editable);
  });

  it("툴바 ArrowRight는 다음 컨트롤로, End는 마지막 컨트롤로 초점을 옮긴다", () => {
    const container = createContainer();
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />), {
      container,
    });
    const toolbar = queriesFor(container).getByRole("toolbar", {
      name: "Toolbar",
    });
    const controls = Array.from(toolbar.children) as HTMLElement[];
    controls[0]?.focus();

    fireEvent.keyDown(activeIn(container) as Element, { key: "ArrowRight" });
    expect(activeIn(container)).toBe(controls[1]);

    fireEvent.keyDown(activeIn(container) as Element, { key: "End" });
    expect(activeIn(container)).toBe(controls.at(-1));
  });

  it("블록 타입 메뉴의 ArrowDown 두 번이 Heading 1, Heading 2로 초점을 옮긴다", () => {
    const container = createContainer();
    render(withProvider(fakeStaticToolbarController(), <StaticToolbar />), {
      container,
    });
    const ui = queriesFor(container);
    fireEvent.click(ui.getByRole("button", { name: "Block type" }), {
      detail: 0,
    });
    expect(activeIn(container)).toBe(ui.getByRole("option", { name: "Text" }));

    fireEvent.keyDown(activeIn(container) as Element, { key: "ArrowDown" });
    expect(activeIn(container)).toBe(
      ui.getByRole("option", { name: "Heading 1" }),
    );
    fireEvent.keyDown(activeIn(container) as Element, { key: "ArrowDown" });
    expect(activeIn(container)).toBe(
      ui.getByRole("option", { name: "Heading 2" }),
    );
  });
});

describe.each(SURFACES)("%s의 TableHandles", (_, createContainer) => {
  it("행 메뉴 항목에 초점을 둔 채 행이 삭제되면 초점이 editable로 돌아온다", async () => {
    const container = createContainer();
    const m = mountTable(container);
    const ui = queriesFor(container);
    fireEvent.pointerMove(m.table);
    const handle = ui.getAllByRole("button", { name: rowHandleLabel })[1];
    if (handle === undefined) throw new Error("둘째 행 핸들 없음");
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 130 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.click(handle);
    const deleteItem = ui.getByRole("menuitem", { name: "Delete row" });
    deleteItem.focus();
    expect(activeIn(container)).toBe(deleteItem);

    await act(async () => {
      const deleted = m.editor.commands.deleteTableRow(m.tableBlockId, 1);
      if (!deleted.ok) throw new Error("행 삭제 fixture 준비 실패");
      await Promise.resolve();
    });

    expect(ui.queryByRole("menu")).toBeNull();
    expect(activeIn(container)).toBe(m.editable);
  });

  it("표 그립 메뉴 항목에 초점을 둔 채 표가 삭제되면 초점이 editable로 돌아온다", async () => {
    const container = createContainer();
    const m = mountTable(container);
    const ui = queriesFor(container);
    fireEvent.pointerMove(m.table);
    fireEvent.click(
      ui.getByRole("button", { name: DEFAULT_DICTIONARY.handle.tableMenu }),
    );
    const menu = ui.getByRole("menu", { name: "Table menu" });
    const item = menu.querySelector<HTMLElement>('[role^="menuitem"]');
    if (item === null) throw new Error("메뉴 항목 없음");
    item.focus();
    expect(activeIn(container)).toBe(item);

    await act(async () => {
      const deleted = m.editor.commands.deleteBlock(m.tableBlockId);
      if (!deleted.ok) throw new Error("표 삭제 fixture 준비 실패");
      await Promise.resolve();
    });

    expect(ui.queryByRole("menu")).toBeNull();
    expect(activeIn(container)).toBe(m.editable);
  });

  it("스크롤 영역 밖 행 핸들이 visibility: hidden이 된다", () => {
    const container = createContainer();
    const m = mountTable(container);
    placeCaret(cellOf(m.table, 0, 0));
    m.host.style.overflowY = "auto";
    stubRect(m.host, { left: 0, top: 0, width: 600, height: 100 });
    const [first, second] = hitBoxes(container, "row");
    if (first === undefined || second === undefined) {
      throw new Error("행 hit box가 둘이 아니다");
    }
    stubRect(first, { left: 0, top: 10, width: 20, height: 30 });
    stubRect(second, { left: 0, top: 300, width: 20, height: 30 });

    fireEvent.scroll(m.host);

    expect(first.style.visibility).toBe("");
    expect(second.style.visibility).toBe("hidden");
  });

  it("캐럿이 있는 행·열의 hit box에 활성 바가 붙는다(PM 노드 대상 보호)", () => {
    const container = createContainer();
    const m = mountTable(container);

    // 캐럿 anchor가 셀(TD) 자신이다. 셀을 요소로 못 보면 부모 행으로
    // 올라가 열을 놓친다.
    placeCaret(cellOf(m.table, 1, 1));

    const rows = hitBoxes(container, "row");
    const columns = hitBoxes(container, "column");
    expect(isActive(rows[0], "row")).toBe(false);
    expect(isActive(rows[1], "row")).toBe(true);
    expect(isActive(columns[0], "column")).toBe(false);
    expect(isActive(columns[1], "column")).toBe(true);
  });

  it("셀 hover가 그 행·열의 활성 바를 띄운다(PM 노드 대상 보호)", () => {
    const container = createContainer();
    const m = mountTable(container);
    fireEvent.pointerMove(m.table);

    fireEvent.pointerMove(cellOf(m.table, 1, 1));

    const rows = hitBoxes(container, "row");
    const columns = hitBoxes(container, "column");
    expect(isActive(rows[0], "row")).toBe(false);
    expect(isActive(rows[1], "row")).toBe(true);
    expect(isActive(columns[0], "column")).toBe(false);
    expect(isActive(columns[1], "column")).toBe(true);
  });

  it("hover 여백 안에서 다른 블록 위로 옮기면 행·열 hover를 지운다(PM 노드 대상 보호)", () => {
    const container = createContainer();
    const m = mountTable(container);
    fireEvent.pointerMove(m.table);
    fireEvent.pointerMove(cellOf(m.table, 1, 1));
    expect(isActive(hitBoxes(container, "row")[1], "row")).toBe(true);
    const otherBlock = m.host.querySelector<HTMLElement>(
      '[data-geul-block-id="block-1"]',
    );
    if (otherBlock === null) throw new Error("앞 블록을 찾지 못했다");

    // 표(100–300, 100–160) 위쪽 hover 여백 안 좌표다. 표 hover는 남는다.
    fireEvent.pointerMove(otherBlock, { clientX: 150, clientY: 90 });

    const ui = queriesFor(container);
    expect(ui.getAllByRole("button", { name: rowHandleLabel })).toHaveLength(2);
    expect(isActive(hitBoxes(container, "row")[1], "row")).toBe(false);
    expect(isActive(hitBoxes(container, "column")[1], "column")).toBe(false);
  });
});

describe.each(SURFACES)("%s의 MediaHandleOverlays", (_, createContainer) => {
  const interactLabel = DEFAULT_DICTIONARY.handle.interactWithIframe;

  /** iframe 블록 문서를 마운트하고 블록에 hover해 interact 버튼을 띄운다. */
  const mountIframeBlock = (container: HTMLElement) => {
    const m = mountBlockEditor({
      initialBlocks: [
        { id: "iframe-1", type: "iframe", url: "https://example.com/embed" },
        { id: "block-2", type: "paragraph", content: [{ text: "본문" }] },
      ],
      children: <MediaHandleOverlays onBlockAdded={vi.fn()} />,
      container,
    });
    editors.push(m.editor);
    const media = m.blocks[0];
    if (media === undefined) throw new Error("iframe 블록이 없다");
    fireEvent.pointerMove(media);
    const embed = media.querySelector("iframe");
    if (embed === null) throw new Error("삽입 iframe이 없다");
    const button = queriesFor(container).getByRole("button", {
      name: interactLabel,
    });
    return { embed, button };
  };

  it("interact 버튼을 누르면 iframe 블록이 interact 상태가 된다(PM 노드 대상 보호)", () => {
    const container = createContainer();
    const { embed, button } = mountIframeBlock(container);

    fireEvent.click(button);

    expect(embed.getAttribute("data-geul-iframe-interactive")).toBe("true");
  });

  it("interact 버튼을 다시 누르면 해제되고 이후 바깥 클릭에도 interact로 남지 않는다", () => {
    const container = createContainer();
    const { embed, button } = mountIframeBlock(container);
    fireEvent.click(button);

    fireEvent.click(button);
    expect(embed.getAttribute("data-geul-iframe-interactive")).toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");

    const outside = container.ownerDocument.createElement("button");
    container.append(outside);
    fireEvent.click(outside);
    expect(embed.getAttribute("data-geul-iframe-interactive")).toBeNull();
  });
});

describe("dom-node helper", () => {
  it("iframe realm 요소와 메인 realm 요소를 모두 요소로 판정한다", () => {
    const frameContainer = createFrameContainer();
    const frameElement = frameContainer.ownerDocument.createElement("button");
    const mainElement = document.createElement("button");
    // 전제: 둘은 서로 다른 realm 인스턴스다.
    expect(frameElement instanceof Element).toBe(false);

    for (const element of [frameElement, mainElement]) {
      expect(isNode(element)).toBe(true);
      expect(isElementNode(element)).toBe(true);
      expect(isHtmlElement(element)).toBe(true);
      expect(isHtmlElement(element, "button")).toBe(true);
      expect(isHtmlElement(element, "iframe")).toBe(false);
    }
  });

  it("null, window, 텍스트 노드, 문서는 요소가 아니다", () => {
    const frameDocument = createFrameContainer().ownerDocument;
    const values: unknown[] = [
      null,
      undefined,
      window,
      frameDocument.defaultView,
      document.createTextNode("text"),
      frameDocument.createTextNode("text"),
      document,
      frameDocument,
    ];

    for (const value of values) {
      expect(isElementNode(value)).toBe(false);
      expect(isHtmlElement(value)).toBe(false);
    }
  });

  it("노드 판정은 텍스트 노드와 문서를 노드로, null과 window를 노드가 아닌 값으로 본다", () => {
    const frameDocument = createFrameContainer().ownerDocument;

    expect(isNode(frameDocument.createTextNode("text"))).toBe(true);
    expect(isNode(frameDocument)).toBe(true);
    expect(isNode(document)).toBe(true);
    expect(isNode(null)).toBe(false);
    expect(isNode(window)).toBe(false);
    expect(isNode(frameDocument.defaultView)).toBe(false);
  });

  it("HTML 이름공간이 아닌 요소는 HTML 요소가 아니다", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    expect(isElementNode(svg)).toBe(true);
    expect(isHtmlElement(svg)).toBe(false);
  });
});
