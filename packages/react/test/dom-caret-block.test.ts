// @vitest-environment jsdom

/**
 * readDomCaretBlockId: 브라우저 DOM selection의 접힌 캐럿이 속한 블록 id를
 * 읽는 계약을 고정한다(Issue #258). 이동 키 직후 ProseMirror state가 낡아도
 * DOM selection은 새 위치를 가리킨다. 접힌 캐럿이 아닌 경우(범위 선택, 편집기
 * 밖, 블록 밖)는 모두 `null`이다.
 *
 * 편집기 DOM은 `renderHTML`이 내는 `data-geul-block-id` 컨테이너 모양만
 * 흉내 낸다. DOM은 `afterEach`에서 정리한다(G-TST-003).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readDomCaretBlockId } from "../src/dom-caret-block.js";

let root: HTMLElement;
let outside: HTMLElement;

/** `<div data-geul-block-id=id><p>text</p></div>`를 parent에 매달고 `p`의 텍스트 노드를 준다. */
const appendBlock = (parent: HTMLElement, id: string, text: string): Text => {
  const block = document.createElement("div");
  block.setAttribute("data-geul-block-id", id);
  const paragraph = document.createElement("p");
  const textNode = document.createTextNode(text);
  paragraph.appendChild(textNode);
  block.appendChild(paragraph);
  parent.appendChild(block);
  return textNode;
};

/** DOM selection을 `node`의 `offset`에 접힌 캐럿으로 둔다. */
const placeCaret = (node: Node, offset: number) => {
  document.getSelection()?.collapse(node, offset);
};

beforeEach(() => {
  root = document.createElement("div");
  outside = document.createElement("div");
  outside.textContent = "outside";
  document.body.append(root, outside);
});

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  root.remove();
  outside.remove();
});

describe("readDomCaretBlockId", () => {
  it("텍스트 노드의 접힌 캐럿은 그 블록의 id를 준다", () => {
    appendBlock(root, "a", "alpha");
    const second = appendBlock(root, "b", "/he");

    placeCaret(second, 2);

    expect(readDomCaretBlockId(root)).toBe("b");
  });

  it("캐럿이 다른 블록으로 옮겨가면 새 블록의 id를 준다", () => {
    const first = appendBlock(root, "a", "alpha");
    const second = appendBlock(root, "b", "/he");

    placeCaret(second, 3);
    expect(readDomCaretBlockId(root)).toBe("b");
    placeCaret(first, 0);

    expect(readDomCaretBlockId(root)).toBe("a");
  });

  it("엘리먼트 anchor(빈 블록의 `p`)도 그 블록의 id를 준다", () => {
    const textNode = appendBlock(root, "empty", "");
    const paragraph = textNode.parentElement as HTMLElement;

    placeCaret(paragraph, 0);

    expect(readDomCaretBlockId(root)).toBe("empty");
  });

  it("중첩 블록은 가장 가까운 블록의 id를 준다", () => {
    const outer = document.createElement("div");
    outer.setAttribute("data-geul-block-id", "outer");
    root.appendChild(outer);
    const inner = appendBlock(outer, "inner", "child");

    placeCaret(inner, 1);

    expect(readDomCaretBlockId(root)).toBe("inner");
  });

  it("범위 선택은 null이다", () => {
    const first = appendBlock(root, "a", "alpha");
    const second = appendBlock(root, "b", "/he");

    document.getSelection()?.setBaseAndExtent(second, 3, first, 0);

    expect(readDomCaretBlockId(root)).toBeNull();
  });

  it("같은 블록 안의 범위 선택도 null이다", () => {
    const text = appendBlock(root, "a", "alpha");

    document.getSelection()?.setBaseAndExtent(text, 1, text, 3);

    expect(readDomCaretBlockId(root)).toBeNull();
  });

  it("편집기 밖의 캐럿은 null이다", () => {
    appendBlock(root, "a", "alpha");
    const outsideText = outside.firstChild as Text;

    placeCaret(outsideText, 2);

    expect(readDomCaretBlockId(root)).toBeNull();
  });

  it("selection이 없으면 null이다", () => {
    appendBlock(root, "a", "alpha");
    document.getSelection()?.removeAllRanges();

    expect(readDomCaretBlockId(root)).toBeNull();
  });

  it("블록 컨테이너 밖의 캐럿(atom 블록 선택 등)은 null이다", () => {
    appendBlock(root, "a", "alpha");

    placeCaret(root, 0);

    expect(readDomCaretBlockId(root)).toBeNull();
  });
});
