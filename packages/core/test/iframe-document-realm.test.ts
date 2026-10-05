/**
 * iframe 문서에 마운트한 편집기의 DOM 노드 판정을 검증한다(Issue #272).
 *
 * iframe 문서가 만든 노드는 iframe realm 인스턴스다.
 * 전역 `Node`·`Element`·`HTMLElement`의 `instanceof`는 이 노드에서 거짓이다.
 * 그래서 메인 문서 테스트로는 결함을 재현하지 못한다.
 *
 * 경로마다 메인 문서 대조군과 iframe 문서를 같은 단언으로 돈다.
 * - history fallback: `view.dom` 밖 버튼의 undo·redo와 입력 대상 양보.
 * - custom style: `render`가 반환한 요소의 태그·속성 추출.
 * - 노드 판정 helper: 두 realm의 노드를 같게 판정한다.
 *
 * iframe 생성·정리는 이 파일이 소유한다. 사용 파일이 하나라서다(G-TST-002).
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import { describe, expect, it, onTestFinished } from "vitest";
import {
  createEditor,
  type CustomStyleDefinition,
  type EditorController,
} from "../src/index.js";
import { isElementNode, isHtmlElement, isNode } from "../src/dom-node.js";
import { contentTextStart, typeNativeText } from "./block-test-support.js";
import {
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";
import {
  placeDomSelectionInFirstParagraph,
  runCleanups,
  withoutScrollCrash,
} from "./native-selection-test-support.js";

/** 편집기를 마운트할 문서. 메인 문서 대조군과 iframe 문서가 같은 모양이다. */
type HostDocument = {
  document: Document;
  window: Window & typeof globalThis;
  /** 테스트가 끝날 때 문서 정리보다 먼저 돌 정리 함수를 등록한다. */
  defer: (cleanup: () => void) => void;
};

/**
 * 메인 문서 대조군. 등록한 정리는 테스트가 끝나면 등록 순서대로 돈다.
 * test 본문 안에서만 부른다. 그 밖에서는 `onTestFinished`가 던진다.
 */
const mainHost = (): HostDocument => {
  const cleanups: (() => void)[] = [];
  onTestFinished(() => runCleanups(cleanups, "메인 문서 시나리오 정리 실패"));
  return {
    document,
    window,
    defer: (cleanup) => cleanups.push(cleanup),
  };
};

/**
 * 메인 문서 body에 iframe을 붙이고 그 문서를 돌려준다.
 * 테스트가 끝나면 등록한 정리를 먼저 돌리고 iframe을 마지막에 뗀다(G-TST-003).
 * 정리 하나의 실패가 iframe 제거를 막지 않는다.
 * test 본문 안에서만 부른다. 그 밖에서는 `onTestFinished`가 던진다.
 */
const frameHost = (): HostDocument => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const cleanups: (() => void)[] = [];
  onTestFinished(() =>
    runCleanups(
      [...cleanups, () => iframe.remove()],
      "iframe 문서 시나리오 정리 실패",
    ),
  );
  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow as
    (Window & typeof globalThis) | null;
  if (frameDocument === null || frameWindow === null) {
    throw new Error("iframe 문서가 없다");
  }
  return {
    document: frameDocument,
    window: frameWindow,
    defer: (cleanup) => cleanups.push(cleanup),
  };
};

const HOSTS = [
  ["메인 문서", mainHost],
  ["iframe 문서", frameHost],
] as const;

/**
 * 편집기를 host 문서가 만든 container에 마운트한다.
 * container는 붙이지 않은 채 돌려준다. 붙이는 시점은 호출부가 정한다.
 * 정리는 selection 해제, Editor `destroy()`, container 제거 순서다.
 */
const mountInHost = (host: HostDocument, editor: EditorController) => {
  const container = host.document.createElement("div");
  host.defer(() => host.document.getSelection()?.removeAllRanges());
  host.defer(() => editor.destroy());
  host.defer(() => container.remove());
  editor.mount(container);
  const editable = container.querySelector<
    HTMLElement & { editor?: TiptapEditor }
  >("[contenteditable='true']");
  if (editable === null || editable.editor === undefined) {
    throw new Error("마운트한 Tiptap 편집기 조회 실패");
  }
  return { container, editable, tiptap: editable.editor };
};

const BASE_TEXT = "abc";
const TYPED_TEXT = "X";

/**
 * TYPED_TEXT를 입력해 undo 스택이 1인 편집기를 host 문서에 마운트한다.
 * `undone`이면 이어서 undo해 redo 스택이 1인 상태로 둔다.
 *
 * DOM에는 편집 뒤에 붙인다.
 * 붙은 뷰의 문서 변경 transaction은 scrollToSelection을 부른다.
 * jsdom에는 그 geometry API가 없다.
 */
const mountHistoryEditor = (host: HostDocument, undone: boolean) => {
  const editor = createEditor({
    initialDocument: paragraphDocument(BASE_TEXT),
    createId: sequentialIds("id"),
  });
  const mount = mountInHost(host, editor);
  const { tiptap } = mount;
  tiptap.commands.setTextSelection(
    contentTextStart(tiptap, "block-1") + BASE_TEXT.length,
  );
  typeNativeText(tiptap, TYPED_TEXT);
  expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
  if (undone) {
    expect(editor.commands.undo().ok).toBe(true);
    expect(redoDepth(tiptap.state)).toBe(1);
  } else {
    expect(undoDepth(tiptap.state)).toBe(1);
  }
  host.document.body.append(mount.container);
  return { editor, ...mount };
};

/**
 * host 문서가 만든 요소를 body에 붙이고 초점을 둔다.
 * 그다음 편집기 첫 문단 텍스트 끝에 host 문서의 DOM selection을 둔다.
 * 요소는 테스트가 끝나면 뗀다.
 *
 * 실제 브라우저는 버튼에 초점이 가도 selection을 편집기에 남긴다.
 * jsdom은 `focus()`가 selection을 그 요소로 옮긴다. 그래서 초점 뒤에 둔다.
 * jsdom은 PM selection을 DOM selection에 동기화하지도 않는다.
 */
const focusOutsideEditor = <T extends HTMLElement>(
  host: HostDocument,
  editable: HTMLElement,
  element: T,
): T => {
  host.document.body.append(element);
  host.defer(() => element.remove());
  element.focus();
  expect(host.document.activeElement).toBe(element);

  placeDomSelectionInFirstParagraph(editable, BASE_TEXT.length);
  expect(host.document.activeElement).toBe(element);
  return element;
};

/**
 * host realm의 KeyboardEvent로 Ctrl+z 계열 keydown을 target에 보낸다.
 * 브라우저가 iframe 안에서 보내는 keydown도 iframe realm 인스턴스다.
 */
const pressHistoryKey = (
  host: HostDocument,
  target: EventTarget,
  shiftKey: boolean,
): KeyboardEvent => {
  const event = new host.window.KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
};

describe.each(HOSTS)("historyKeydownFallback — %s", (_label, makeHost) => {
  it("편집기 view.dom의 ownerDocument가 마운트한 문서다", () => {
    const host = makeHost();
    const { tiptap } = mountHistoryEditor(host, false);

    expect(tiptap.view.dom.ownerDocument).toBe(host.document);
  });

  it("view.dom 밖 버튼의 Ctrl+Shift+z가 redo하고 기본 동작을 막는다", () => {
    const host = makeHost();
    const { tiptap, editable } = mountHistoryEditor(host, true);
    const button = focusOutsideEditor(
      host,
      editable,
      host.document.createElement("button"),
    );

    withoutScrollCrash(tiptap, () => {
      const event = pressHistoryKey(host, button, true);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("view.dom 밖 버튼의 Ctrl+z가 undo하고 기본 동작을 막는다", () => {
    const host = makeHost();
    const { tiptap, editable } = mountHistoryEditor(host, false);
    const button = focusOutsideEditor(
      host,
      editable,
      host.document.createElement("button"),
    );

    withoutScrollCrash(tiptap, () => {
      const event = pressHistoryKey(host, button, false);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it("input의 Ctrl+z는 undo하지 않고 기본 동작도 막지 않는다", () => {
    const host = makeHost();
    const { tiptap, editable } = mountHistoryEditor(host, false);
    const input = focusOutsideEditor(
      host,
      editable,
      host.document.createElement("input"),
    );

    withoutScrollCrash(tiptap, () => {
      const event = pressHistoryKey(host, input, false);

      expect(tiptap.state.doc.textContent).toBe(BASE_TEXT + TYPED_TEXT);
      expect(event.defaultPrevented).toBe(false);
    });
  });
});

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * `render`가 element를 반환하는 custom style 편집기를 host 문서에 마운트한다.
 * 첫 문단 텍스트 `hi` 전체에 그 style을 건다.
 */
const mountStyledEditor = (host: HostDocument, element: Element) => {
  const definition: CustomStyleDefinition = {
    render: () => element as HTMLElement,
  };
  const editor = createEditor({
    initialDocument: {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          content: [{ text: "hi", marks: [{ type: "myStyle" }] }],
        },
      ],
    },
    customStyles: { myStyle: definition },
  });
  const mount = mountInHost(host, editor);
  host.document.body.append(mount.container);
  return mount;
};

/** 첫 문단의 첫 자식 요소를 돌려준다. style을 건 텍스트 `hi`의 래퍼다. */
const styledWrapper = (editable: HTMLElement): Element => {
  const wrapper = editable.querySelector("p")?.firstElementChild ?? null;
  if (wrapper === null) throw new Error("style 래퍼 조회 실패");
  expect(wrapper.textContent).toBe("hi");
  return wrapper;
};

describe.each(HOSTS)("custom style render — %s", (_label, makeHost) => {
  it("render가 반환한 mark 요소의 태그와 속성으로 렌더한다", () => {
    const host = makeHost();
    const mark = host.document.createElement("mark");
    mark.setAttribute("class", "hl");
    mark.setAttribute("data-x", "1");
    const { editable } = mountStyledEditor(host, mark);

    const wrapper = styledWrapper(editable);
    expect(wrapper.localName).toBe("mark");
    expect(wrapper.getAttribute("class")).toBe("hl");
    expect(wrapper.getAttribute("data-x")).toBe("1");
  });

  it("render가 SVG 요소를 반환하면 style 객체로 취급해 span으로 렌더한다", () => {
    const host = makeHost();
    const svg = host.document.createElementNS(SVG_NAMESPACE, "g");
    const { editable } = mountStyledEditor(host, svg);

    expect(styledWrapper(editable).localName).toBe("span");
  });
});

describe.each(HOSTS)("노드 판정 helper — %s", (_label, makeHost) => {
  it("요소는 노드이자 HTML 요소다", () => {
    const host = makeHost();
    const button = host.document.createElement("button");

    expect(isNode(button)).toBe(true);
    expect(isElementNode(button)).toBe(true);
    expect(isHtmlElement(button)).toBe(true);
  });

  it("tagName을 주면 그 태그의 HTML 요소만 참이다", () => {
    const host = makeHost();
    const button = host.document.createElement("button");

    expect(isHtmlElement(button, "button")).toBe(true);
    expect(isHtmlElement(button, "input")).toBe(false);
  });

  it("텍스트 노드와 문서는 노드지만 요소가 아니다", () => {
    const host = makeHost();
    const text = host.document.createTextNode("a");

    for (const node of [text, host.document]) {
      expect(isNode(node)).toBe(true);
      expect(isElementNode(node)).toBe(false);
      expect(isHtmlElement(node)).toBe(false);
    }
  });

  it("window와 null은 노드가 아니다", () => {
    const host = makeHost();

    for (const value of [host.window, null]) {
      expect(isNode(value)).toBe(false);
      expect(isElementNode(value)).toBe(false);
      expect(isHtmlElement(value)).toBe(false);
    }
  });

  it("SVG 요소는 요소지만 HTML 요소가 아니다", () => {
    const host = makeHost();
    const svg = host.document.createElementNS(SVG_NAMESPACE, "svg");

    expect(isElementNode(svg)).toBe(true);
    expect(isHtmlElement(svg)).toBe(false);
  });
});
