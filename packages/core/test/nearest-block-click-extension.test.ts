/**
 * NearestBlockClickExtension(그릴링 2026-09-17)의 위치 판정을 검증한다.
 * jsdom은 실제 레이아웃을 계산하지 못해(ADR-0007 "실제 레이아웃")
 * `getBoundingClientRect`를 테스트 안에서 직접 주입한다 —
 * media-drop-paste-extension.test.ts의 stubDropGeometry와 같은 이유·같은
 * 패턴이다. `./clipboard-test-support.js`의 `document.elementFromPoint`
 * 폴리필을 side-effect로 불러온다 — 폴리필 없이는 이 확장이 항상 먼저
 * 호출하는 `view.posAtCoords`가 내부에서 "elementFromPoint is not a
 * function"으로 던진다(그 파일 주석 참고).
 */
import "./clipboard-test-support.js";

import { NodeSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createEditor } from "../src/index.js";
import {
  dividerBlock,
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  paragraphBlock,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const mounted = (initialDocument: ReturnType<typeof documentOf>) => {
  const editor = createEditor({
    initialDocument,
    createId: sequentialIds("id"),
  });
  return { editor, ...mountTiptapEditor(editor) };
};

/**
 * blockId 블록 DOM 요소의 getBoundingClientRect를 고정값으로 덮어쓴다.
 * media-drop-paste-extension.test.ts의 stubDropGeometry와 달리
 * view.posAtCoords는 건드리지 않는다 — jsdom의 실제 view.posAtCoords는
 * document.elementFromPoint 폴리필이 항상 null을 돌려주는 한(위 import)
 * 어떤 좌표에서도 자연히 null을 반환해(prosemirror-view posAtCoords의
 * `!elt` 분기, view.dom.getBoundingClientRect도 jsdom 기본값 0-rect라
 * inRect가 항상 false) "native 클릭 실패" 상태를 그대로 재현한다 — 이
 * 확장이 실제로 개입해야 하는 조건과 동일하다.
 */
const stubBlockRect = (
  tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
  blockId: string,
  rect: { top: number; height: number },
): number => {
  const containerPos = findBlockPosition(tiptap.state.doc, blockId);
  if (containerPos === null) throw new Error(`블록을 찾지 못했다: ${blockId}`);
  const dom = tiptap.view.nodeDOM(containerPos);
  if (!(dom instanceof HTMLElement)) throw new Error("블록 DOM을 찾지 못했다");
  dom.getBoundingClientRect = () =>
    ({
      top: rect.top,
      bottom: rect.top + rect.height,
      height: rect.height,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return containerPos;
};

/**
 * mousedown을 dispatch하고 그 이벤트를 돌려준다. 대부분의 케이스는
 * 우연히도 클릭 없는 기본 selection(문서 시작 부근)과 기대값이 같아
 * selection.from만 보면 이 확장이 없어도 통과한다 — 이 확장만이
 * preventDefault를 호출하므로 event.defaultPrevented가 실제 개입
 * 여부를 가르는 신뢰 가능한 신호다.
 */
const dispatchMousedown = (
  editable: HTMLElement,
  clientY: number,
): MouseEvent => {
  const event = new MouseEvent("mousedown", {
    clientX: 0,
    clientY,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  editable.dispatchEvent(event);
  return event;
};

describe("posAtCoords 성공 — 개입하지 않는다", () => {
  it("클릭 좌표가 실제 콘텐츠를 가리키면 selection을 바꾸지 않고 native 클릭에 맡긴다", () => {
    const { editable, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "hello")),
    );
    editable.focus();
    const containerPos = findBlockPosition(tiptap.state.doc, "p-1");
    if (containerPos === null) throw new Error("fixture 준비 실패");
    const initialPos = containerPos + 2 + "hello".length;
    tiptap.commands.setTextSelection(initialPos);

    // native가 이미 위치를 찾은 것처럼 posAtCoords를 성공시킨다 — 실제
    // 좌표값은 무관하고 null이 아니라는 사실만 중요하다.
    tiptap.view.posAtCoords = () => ({
      pos: containerPos + 2,
      inside: containerPos,
    });

    const event = dispatchMousedown(editable, 999999);

    expect(event.defaultPrevented).toBe(false);
    expect(tiptap.state.selection.from).toBe(initialPos);
    expect(tiptap.state.selection.to).toBe(initialPos);
  });
});

describe("빈 에디터(빈 문단 하나) — 빈 공간 클릭이 그 블록에 커서를 놓는다", () => {
  it("문단 아래 여백을 클릭하면 그 문단 안에 커서가 생긴다", () => {
    const { editable, tiptap } = mounted(
      documentOf(paragraphBlock("only-1", "")),
    );
    editable.focus();
    const containerPos = stubBlockRect(tiptap, "only-1", {
      top: 0,
      height: 24,
    });

    const event = dispatchMousedown(editable, 200);

    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.empty).toBe(true);
    expect(tiptap.state.selection.from).toBe(containerPos + 2);
  });

  it("문단 위 여백을 클릭해도 그 문단 안에 커서가 생긴다", () => {
    const { editable, tiptap } = mounted(
      documentOf(paragraphBlock("only-1", "")),
    );
    editable.focus();
    const containerPos = stubBlockRect(tiptap, "only-1", {
      top: 0,
      height: 24,
    });

    const event = dispatchMousedown(editable, -50);

    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(containerPos + 2);
  });
});

describe("여러 블록 — Y축 최근접 판정", () => {
  const setupTwoParagraphs = () => {
    const { editable, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "one"), paragraphBlock("p-2", "two")),
    );
    editable.focus();
    const p1Pos = stubBlockRect(tiptap, "p-1", { top: 0, height: 20 });
    const p2Pos = stubBlockRect(tiptap, "p-2", { top: 20, height: 20 });
    return { editable, tiptap, p1Pos, p2Pos };
  };

  it("첫 블록 위 여백 클릭 → 첫 블록 시작에 커서", () => {
    const { editable, tiptap, p1Pos } = setupTwoParagraphs();
    const event = dispatchMousedown(editable, -10);
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(p1Pos + 2);
  });

  it("마지막 블록 아래 여백 클릭 → 마지막 블록 끝에 커서", () => {
    const { editable, tiptap, p2Pos } = setupTwoParagraphs();
    const event = dispatchMousedown(editable, 100);
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(p2Pos + 2 + "two".length);
  });

  it("블록 rect 위쪽 절반 클릭 → 그 블록 시작에 커서", () => {
    const { editable, tiptap, p1Pos } = setupTwoParagraphs();
    const event = dispatchMousedown(editable, 5); // p-1 rect(0~20)의 위쪽 절반
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(p1Pos + 2);
  });

  it("블록 rect 아래쪽 절반 클릭 → 그 블록 끝에 커서", () => {
    const { editable, tiptap, p1Pos } = setupTwoParagraphs();
    const event = dispatchMousedown(editable, 15); // p-1 rect(0~20)의 아래쪽 절반
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(p1Pos + 2 + "one".length);
  });
});

describe("미디어(atom) 블록 — 인접 텍스트 위치로 스냅한다", () => {
  const setup = () => {
    const { editable, tiptap } = mounted(
      documentOf(
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "img-1"),
        tailParagraphBlock,
      ),
    );
    editable.focus();
    const p1Pos = stubBlockRect(tiptap, "p-1", { top: 0, height: 20 });
    stubBlockRect(tiptap, "img-1", { top: 20, height: 100 });
    const tailPos = stubBlockRect(tiptap, "tail", { top: 120, height: 20 });
    return { editable, tiptap, p1Pos, tailPos };
  };

  it("미디어 블록 위쪽 클릭 → 이전 텍스트 블록 끝에 커서", () => {
    const { editable, tiptap, p1Pos } = setup();
    const event = dispatchMousedown(editable, 30); // img rect(20~120)의 위쪽
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(p1Pos + 2 + "hello".length);
  });

  it("미디어 블록 아래쪽 클릭 → 다음 텍스트 블록 시작에 커서", () => {
    const { editable, tiptap, tailPos } = setup();
    const event = dispatchMousedown(editable, 90); // img rect(20~120)의 아래쪽
    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(tailPos + 2);
  });
});

describe("미디어 블록 앞에 인접 텍스트가 없다 — 반대 방향으로 폴백한다", () => {
  it("문서 첫 블록이 미디어면 위쪽 클릭도 뒤 문단 시작에 커서(뒤 방향 폴백)", () => {
    const { editable, tiptap } = mounted(
      documentOf(mediaBlock("image", "img-1"), tailParagraphBlock),
    );
    editable.focus();
    stubBlockRect(tiptap, "img-1", { top: 0, height: 100 });
    const tailPos = stubBlockRect(tiptap, "tail", { top: 100, height: 20 });

    const event = dispatchMousedown(editable, 10); // img rect(0~100)의 위쪽 — 앞에 아무 블록도 없다

    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(tailPos + 2);
  });
});

describe("divider — blockContainer로 감싸이지 않는 다른 atom도 후보에 잡힌다", () => {
  it("divider 블록도 media와 같은 group: block 직접 멤버라 후보에서 빠지지 않는다(첫 구현은 type.name==='blockContainer'만 걸러 이 셋을 전부 놓쳤다)", () => {
    const { editable, tiptap } = mounted(
      documentOf(
        paragraphBlock("p-1", "hello"),
        dividerBlock("d-1"),
        tailParagraphBlock,
      ),
    );
    editable.focus();
    const p1Pos = stubBlockRect(tiptap, "p-1", { top: 0, height: 20 });
    stubBlockRect(tiptap, "d-1", { top: 20, height: 10 });
    stubBlockRect(tiptap, "tail", { top: 30, height: 20 });

    const event = dispatchMousedown(editable, 22); // divider rect(20~30)의 위쪽

    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection.from).toBe(p1Pos + 2 + "hello".length);
  });
});

describe("인접 텍스트가 전혀 없다 — NodeSelection으로 폴백한다", () => {
  it("paragraph가 deny돼 스키마에 텍스트 노드가 없으면(TrailingBlockExtension의 trailing paragraph 보장도 무력화된다) 그 미디어 블록을 NodeSelection으로 선택한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(mediaBlock("image", "img-1")),
      createId: sequentialIds("id"),
      enabledBlockTypes: { mode: "deny", types: ["paragraph"] },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    const imgPos = stubBlockRect(tiptap, "img-1", { top: 0, height: 100 });

    const event = dispatchMousedown(editable, 10);

    expect(event.defaultPrevented).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(tiptap.state.selection.from).toBe(imgPos);
  });
});

describe("read-only 에디터 — 개입하지 않는다", () => {
  it("editable:false 에디터에서 빈 공간 클릭은 selection을 바꾸지 않는다", () => {
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("only-1", "")),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editor.isEditable = false;
    const before = {
      from: tiptap.state.selection.from,
      to: tiptap.state.selection.to,
    };
    stubBlockRect(tiptap, "only-1", { top: 0, height: 24 });

    const event = dispatchMousedown(editable, 200);

    expect(event.defaultPrevented).toBe(false);
    expect({
      from: tiptap.state.selection.from,
      to: tiptap.state.selection.to,
    }).toEqual(before);
  });
});
