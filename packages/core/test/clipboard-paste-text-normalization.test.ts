/**
 * 붙여넣기·drop 평문의 줄 경계 정규화와 Markdown 감지 입력을 고정한다(Issue
 * #291). 줄 경계는 CRLF·CR·LF다. CR을 LF로 먼저 바꾼 뒤 무효 문자를 지운다.
 * 감지·직접 삽입·codeBlock 분기·PM 폴백·drop이 같은 정규화본을 본다. 제어문자
 * 유무가 줄 배치와 Markdown 감지를 바꾸지 않는다.
 *
 * 감지 입력만 갈라진다. 감지 입력은 Tab을 지우지 않고 Tab 외 제어문자만
 * 지운다. Tab은 Markdown 구조(중첩 목록, 마커 뒤 공백, 코드 내용)라서다.
 * 인라인 본문에 Tab이 있으면 감지가 꺼지는 현행(QA-078 Tab 정책)은 그대로다.
 *
 * 다루는 축은 헬퍼 단위(C8), CR 줄 경계(C1·C2), 제어문자 감지 동치(C3·C4),
 * Tab 구조·내용 유지(C3b), 제어문자만 있는 입력(C5), drop(C6), PM 폴백과 위임
 * 판정(C7), codeBlock 걸친 범위, transaction 계약(C11)이다. 기준 문서는
 * p1 "abcd"이고 캐럿은 2다. 제어문자는 U+0001을 쓴다. 실제 브라우저
 * 시나리오는 e2e/clipboard-paste.spec.ts가 회귀로만 맡는다.
 *
 * 마지막 describe는 slice text 정리 헬퍼(sanitizeSliceInlineText, Issue #302)
 * 단위 테스트다. 무효 문자 제거, 빈 text 노드 제거, 마크·열림 깊이 보존,
 * codeBlock text 보호, 변경이 없으면 같은 객체 반환을 고정한다.
 */
import { isValidCodeBlockSource, type Block } from "@cp949/geul-model";
import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEditor } from "../src/index.js";
import {
  normalizeKeepingTabs,
  normalizeLineBreaks,
  normalizePasteText,
  sanitizeSliceInlineText,
} from "../src/plain-text-paste.js";
import { contentTextStart } from "./block-test-support.js";
import {
  blocksOf,
  childCodeBlocks,
  dispatchPasteData,
  dropData,
  outline,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  dividerBlock,
  documentOf,
  mountTiptapEditor,
  paragraphBlock,
  selectBlockNode,
  sequentialIds,
} from "./editor-controller-support.js";

type Tiptap = ReturnType<typeof mountTiptapEditor>["tiptap"];

const SOH = "\u0001";
const ESC = "\u001b";
// 줄 경계로 쓰지 않는 유니코드 구분자다(U+2028, U+2029, U+0085).
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const NEL = String.fromCharCode(0x85);

afterEach(() => {
  vi.restoreAllMocks();
});

// 문서를 마운트하고 blockId 블록의 텍스트 offset에 캐럿을 둔다.
const setup = (blocks: Block[], caretBlockId: string, offset: number) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection(
    contentTextStart(tiptap, caretBlockId) + offset,
  );
  return { editor, editable, tiptap };
};

// 기준 문서 D: p1 "abcd".
const baseDocument = (): Block[] => [paragraphBlock("p1", "abcd")];

const plainPaste = (editable: HTMLElement, text: string): ClipboardEvent =>
  dispatchPasteData(editable, { "text/plain": text });

// 기준 문서 D의 캐럿 2에 text/plain을 붙인 뒤의 블록 요약이다.
const pasteOutline = (text: string): string[] => {
  const { editor, editable } = setup(baseDocument(), "p1", 2);
  plainPaste(editable, text);
  return outline(blocksOf(editor));
};

// 기준 문서 D의 캐럿 2 위치에 text/plain을 drop한 뒤의 블록 요약이다.
const dropOutline = (text: string): string[] => {
  const { editor, editable, tiptap } = setup(baseDocument(), "p1", 2);
  const pos = contentTextStart(tiptap, "p1") + 2;
  stubPosAtCoords(tiptap, pos);
  dropData(editable, { "text/plain": text });
  return outline(blocksOf(editor));
};

// p1 "abcd" 자식 [c1 "child"]의 캐럿 2 위치에 drop한 뒤의 블록 요약이다.
// 직접 삽입이 아니면 PM 기본 drop이 c1을 마지막 줄 블록으로 넘긴다.
const dropWithChildOutline = (text: string): string[] => {
  const { editor, editable, tiptap } = setup(
    [paragraphBlock("p1", "abcd", [paragraphBlock("c1", "child")])],
    "p1",
    2,
  );
  stubPosAtCoords(tiptap, contentTextStart(tiptap, "p1") + 2);
  dropData(editable, { "text/plain": text });
  return outline(blocksOf(editor));
};

const stubPosAtCoords = (tiptap: Tiptap, pos: number): void => {
  tiptap.view.posAtCoords = () => ({ pos, inside: pos });
};

describe("붙여넣기 평문 정규화(Issue #291)", () => {
  describe("헬퍼 단위(C8)", () => {
    it("normalizeLineBreaks는 CRLF·CR을 LF로 바꾸고 LF는 그대로 둔다", () => {
      expect(normalizeLineBreaks("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
      expect(normalizeLineBreaks("a\r\n\r\nb")).toBe("a\n\nb");
      expect(normalizeLineBreaks("a\r\rb")).toBe("a\n\nb");
      expect(normalizeLineBreaks("")).toBe("");
    });

    it("normalizePasteText는 CR을 지우지 않고 줄 경계로 바꾼다(순서)", () => {
      expect(normalizePasteText("X\rY")).toBe("X\nY");
      expect(normalizePasteText("X\r\nY")).toBe("X\nY");
      expect(normalizePasteText("X\nY")).toBe("X\nY");
    });

    it("normalizePasteText는 LF 외 C0·DEL·Tab·짝 없는 surrogate를 지운다", () => {
      expect(normalizePasteText(`a${SOH}b${ESC}c\td\u007fe`)).toBe("abcde");
      expect(normalizePasteText("a\ud800b")).toBe("ab");
      expect(normalizePasteText(`X${SOH}\rY`)).toBe("X\nY");
    });

    it("normalizePasteText는 빈 문자열과 U+2028·U+2029·U+0085를 건드리지 않는다", () => {
      expect(normalizePasteText("")).toBe("");
      const text = `a${LS}b${PS}c${NEL}d`;

      expect(normalizePasteText(text)).toBe(text);
    });

    it("normalizeKeepingTabs는 Tab을 전부 남기고 Tab 외 제어문자를 지운다", () => {
      expect(normalizeKeepingTabs("- a\n\t- b\tc")).toBe("- a\n\t- b\tc");
      expect(normalizeKeepingTabs("  x\ty")).toBe("  x\ty");
      expect(normalizeKeepingTabs(`\t\tx${SOH}${ESC}`)).toBe("\t\tx");
      expect(normalizeKeepingTabs(`a\tb${SOH}c\u007fd`)).toBe("a\tbcd");
      expect(normalizeKeepingTabs(`${SOH}\tx`)).toBe("\tx");
    });

    it("normalizeKeepingTabs는 CR을 LF로 바꾸고 Tab을 건드리지 않는다", () => {
      expect(normalizeKeepingTabs("a\r\n\tb\r\tc")).toBe("a\n\tb\n\tc");
      expect(normalizeKeepingTabs("\t\t\nx")).toBe("\t\t\nx");
      expect(normalizeKeepingTabs("-\tone\r\rx")).toBe("-\tone\n\nx");
    });

    it("normalizeKeepingTabs는 빈 문자열과 짝 없는 surrogate를 처리한다", () => {
      expect(normalizeKeepingTabs("")).toBe("");
      expect(normalizeKeepingTabs("a\ud800b")).toBe("ab");
      expect(normalizeKeepingTabs("a\t\ud800\tb")).toBe("a\t\tb");
    });
  });

  // codeBlock 안 붙여넣기용 정규화본이다(Issue #296). model의 codeBlock
  // 검증이 거부하는 문자만 지운다. Tab·LF와 U+2028·U+2029·U+FEFF·U+0085는
  // 유효라 남긴다.
  describe("normalizeKeepingTabs 헬퍼 단위(Issue #296)", () => {
    const TAB = String.fromCharCode(9);
    const FEFF = String.fromCharCode(0xfeff);

    it("출력은 무효 문자 행렬(C0 전체, DEL, 단독 surrogate, CR)에서 항상 model 검증을 통과한다(C7)", () => {
      const invalid: string[] = [];
      for (let code = 0; code <= 0x1f; code += 1) {
        invalid.push(String.fromCharCode(code));
      }
      invalid.push(String.fromCharCode(0x7f));
      invalid.push(String.fromCharCode(0xd800));
      invalid.push(String.fromCharCode(0xdbff));
      invalid.push(String.fromCharCode(0xdc00));
      invalid.push(String.fromCharCode(0xdfff));

      for (const char of invalid) {
        const output = normalizeKeepingTabs(`a${char}b`);

        expect(
          isValidCodeBlockSource(output),
          `U+${char.charCodeAt(0).toString(16)}`,
        ).toBe(true);
      }
      expect(
        isValidCodeBlockSource(normalizeKeepingTabs(invalid.join(""))),
      ).toBe(true);
    });

    it("Tab·LF는 남기고 나머지 C0·DEL·짝 없는 surrogate는 지운다(C4)", () => {
      const input = `a${TAB}b\nc${SOH}d${ESC}e${String.fromCharCode(0x7f)}f${String.fromCharCode(0xd800)}g`;

      expect(normalizeKeepingTabs(input)).toBe(`a${TAB}b\ncdefg`);
    });

    it("짝 있는 surrogate(이모지)는 지우지 않는다", () => {
      expect(normalizeKeepingTabs("a\u{1F600}b")).toBe("a\u{1F600}b");
    });

    it("CR·CRLF를 LF로 바꾼다(C3)", () => {
      expect(normalizeKeepingTabs("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
      expect(normalizeKeepingTabs(`a${SOH}\r\nb`)).toBe("a\nb");
    });

    it("U+2028·U+2029·U+FEFF·U+0085는 지우지 않는다", () => {
      const text = `a${LS}b${PS}c${FEFF}d${NEL}e`;

      expect(normalizeKeepingTabs(text)).toBe(text);
      expect(isValidCodeBlockSource(text)).toBe(true);
    });

    it("유효한 입력과 빈 문자열은 그대로다", () => {
      expect(normalizeKeepingTabs("")).toBe("");
      expect(normalizeKeepingTabs("a\tb\nc")).toBe("a\tb\nc");
    });

    it("제어문자만 있으면 빈 문자열이다", () => {
      expect(normalizeKeepingTabs(SOH)).toBe("");
      expect(normalizeKeepingTabs(`${SOH}${ESC}`)).toBe("");
    });
  });

  describe("CR 줄 경계(C1·C2)", () => {
    it("단독 CR이 줄 경계라 두 줄로 나뉜다", () => {
      expect(pasteOutline("X\rY")).toEqual(["p:abX", "p:Ycd"]);
    });

    it("CR·CRLF·LF 한 줄 경계가 같은 결과다", () => {
      const expected = ["p:abX", "p:Ycd"];

      expect(pasteOutline("X\nY")).toEqual(expected);
      expect(pasteOutline("X\r\nY")).toEqual(expected);
      expect(pasteOutline("X\rY")).toEqual(expected);
    });

    it("CR·CRLF·LF 빈 줄 경계가 같은 결과다", () => {
      const expected = ["p:ab", "p:X", "p:Y", "p:cd"];

      expect(pasteOutline("X\n\nY")).toEqual(expected);
      expect(pasteOutline("X\r\n\r\nY")).toEqual(expected);
      expect(pasteOutline("X\r\rY")).toEqual(expected);
    });
  });

  describe("제어문자 유무와 감지(C3·C4)", () => {
    it("제어문자가 낀 빈 줄 구분 입력이 제어문자 없는 입력과 같다", () => {
      expect(pasteOutline(`X${SOH}\n\nY`)).toEqual(pasteOutline("X\n\nY"));
      expect(pasteOutline(`X${SOH}\n\nY`)).toEqual([
        "p:ab",
        "p:X",
        "p:Y",
        "p:cd",
      ]);
    });

    it("제어문자가 낀 heading Markdown이 heading이 된다", () => {
      expect(pasteOutline(`# H${SOH}\n\nbody`)).toEqual([
        "p:ab",
        "h1:H",
        "p:body",
        "p:cd",
      ]);
    });

    it("코드 펜스 안 제어문자가 있어도 codeBlock이 된다", () => {
      expect(pasteOutline(`\`\`\`\nconst a = 1;${SOH}\n\`\`\``)).toEqual([
        "p:ab",
        "code:const a = 1;",
        "p:cd",
      ]);
    });

    it("ESC가 낀 Markdown도 감지된다", () => {
      expect(pasteOutline(`# H${ESC}\n\nbody`)).toEqual(
        pasteOutline("# H\n\nbody"),
      );
    });

    it("인라인 본문 안 Tab은 감지를 끄고 평문 줄로 들어간다(변경 전과 같다, QA-078)", () => {
      expect(pasteOutline("a\tb\n\nc")).toEqual(["p:abab", "p:ccd"]);
    });

    it("CR과 제어문자가 섞여도 정리한 입력과 같다", () => {
      expect(pasteOutline(`# H${SOH}\r\rbody`)).toEqual(
        pasteOutline("# H\n\nbody"),
      );
      expect(pasteOutline(`# H${SOH}\r\rbody`)).toEqual([
        "p:ab",
        "h1:H",
        "p:body",
        "p:cd",
      ]);
    });
  });

  // 아래는 변경 전 코드로 같은 입력을 붙여 실측한 결과와 같아야 하는 단언이다.
  describe("Tab 구조·내용 유지(C3b)", () => {
    it("Tab으로 들여쓴 중첩 목록이 공백 들여쓰기와 같은 모양이다", () => {
      expect(pasteOutline("- a\n\t- b\n\t- c")).toEqual([
        "p:ab",
        "ul:a[ul:b,ul:c]",
        "p:cd",
      ]);
      expect(pasteOutline("- a\n  - b")).toEqual([
        "p:ab",
        "ul:a[ul:b]",
        "p:cd",
      ]);
      expect(pasteOutline("- a\n\t- b")).toEqual(pasteOutline("- a\n  - b"));
    });

    it("Tab으로 들여쓴 번호 목록도 중첩이다", () => {
      expect(pasteOutline("1. a\n\t1. b")).toEqual([
        "p:ab",
        "ol:a[ol:b]",
        "p:cd",
      ]);
    });

    it("Tab으로 들여쓴 코드는 codeBlock과 paragraph다", () => {
      expect(pasteOutline("\tcode\n\nx")).toEqual([
        "p:ab",
        "code:code",
        "p:x",
        "p:cd",
      ]);
    });

    it("코드 펜스 안 본문 Tab이 codeBlock 내용에 그대로 남는다", () => {
      expect(pasteOutline("```\na\tb\n```")).toEqual([
        "p:ab",
        "code:a\tb",
        "p:cd",
      ]);
      expect(pasteOutline("```go\nfunc f() {\n\treturn\tx\n}\n```")).toEqual([
        "p:ab",
        "code:func f() {\n\treturn\tx\n}",
        "p:cd",
      ]);
      expect(pasteOutline("a\n\n```\nk\tv\nk2\tv2\n```\n\nb")).toEqual([
        "p:ab",
        "p:a",
        "code:k\tv\nk2\tv2",
        "p:b",
        "p:cd",
      ]);
    });

    it("들여쓴 코드 안 본문 Tab이 codeBlock 내용에 그대로 남는다", () => {
      expect(pasteOutline("text\n\n    a\tb\n\nmore")).toEqual([
        "p:ab",
        "p:text",
        "code:a\tb",
        "p:more",
        "p:cd",
      ]);
    });

    it("코드 펜스 안 줄 앞 Tab이 codeBlock 내용에 남는다", () => {
      expect(pasteOutline("```\n\tfoo\n```")).toEqual([
        "p:ab",
        "code:\tfoo",
        "p:cd",
      ]);
    });

    it("마커 뒤 Tab이 목록 구조를 유지한다", () => {
      expect(pasteOutline("1.\tfoo\n2. bar")).toEqual([
        "p:ab",
        "ol:foo",
        "ol:bar",
        "p:cd",
      ]);
      expect(pasteOutline("-\tone\n\nx")).toEqual([
        "p:ab",
        "ul:one",
        "p:x",
        "p:cd",
      ]);
      expect(pasteOutline("- a\n-\tb")).toEqual([
        "p:ab",
        "ul:a",
        "ul:b",
        "p:cd",
      ]);
    });

    it("마커 뒤 Tab이 heading 구조를 유지한다", () => {
      expect(pasteOutline("#\tHeading\n\nbody")).toEqual([
        "p:ab",
        "h1:Heading",
        "p:body",
        "p:cd",
      ]);
    });

    it("줄 앞 Tab과 인라인 본문 Tab이 함께 있으면 감지가 꺼지고 평문 줄로 들어간다(변경 전과 같다)", () => {
      expect(pasteOutline("- a\n\t- b\tc")).toEqual(["p:ab- a", "p:- bccd"]);
    });

    it("코드 펜스 안 Tab과 다른 제어문자가 함께 있으면 제어문자만 지우고 Tab은 남긴다", () => {
      expect(pasteOutline(`\`\`\`\na\tb${SOH}c\n\`\`\``)).toEqual([
        "p:ab",
        "code:a\tbc",
        "p:cd",
      ]);
    });

    it("Tab 들여쓰기 목록에 다른 제어문자가 섞여도 중첩 목록이다", () => {
      expect(pasteOutline(`- a\n\t- b${SOH}`)).toEqual([
        "p:ab",
        "ul:a[ul:b]",
        "p:cd",
      ]);
    });
  });

  describe("제어문자만 있는 입력(C5)", () => {
    it("이벤트를 소비하고 문서를 바꾸지 않으며 TypeError가 없다", () => {
      const { editor, editable } = setup(baseDocument(), "p1", 2);

      withUnhandledErrorTracking((errors) => {
        const event = plainPaste(editable, "\u0000\u0007");

        expect(event.defaultPrevented).toBe(true);
        expect(outline(blocksOf(editor))).toEqual(["p:abcd"]);
        expect(errors).toEqual([]);
      });
    });

    it("CR과 제어문자만 있어도 줄 경계 하나만 남는다", () => {
      expect(pasteOutline(`${SOH}\r${SOH}`)).toEqual(["p:ab", "p:cd"]);
    });
  });

  describe("drop(C6)", () => {
    it("단독 CR 평문 drop이 두 줄로 나뉜다", () => {
      expect(dropOutline("X\rY")).toEqual(["p:abX", "p:Ycd"]);
    });

    it("단독 CR 평문 drop이 직접 삽입이라 기존 자식이 첫 자식 뒤에 남는다", () => {
      // 끝의 빈 문단은 편집기가 문서 끝에 붙이는 기준선이다.
      expect(dropWithChildOutline("X\rY")).toEqual([
        "p:abX[p:Ycd,p:child]",
        "p:",
      ]);
    });

    it("CR·CRLF·LF가 같은 배치다", () => {
      expect(dropOutline("X\r\nY")).toEqual(dropOutline("X\nY"));
      expect(dropOutline("X\rY")).toEqual(dropOutline("X\nY"));
      expect(dropOutline("X\r\rY")).toEqual(dropOutline("X\n\nY"));
    });

    it("제어문자 유무가 배치를 바꾸지 않는다", () => {
      expect(dropOutline(`X${SOH}\nY`)).toEqual(dropOutline("X\nY"));
      expect(dropOutline(`X${SOH}\rY`)).toEqual(["p:abX", "p:Ycd"]);
      expect(dropOutline(`X${SOH}\n\nY`)).toEqual(dropOutline("X\n\nY"));
    });
  });

  describe("PM 폴백과 위임 판정(C7)", () => {
    // NodeSelection(divider)이라 직접 삽입이 물러난다.
    const setupNodeSelection = () => {
      const result = setup(
        [
          paragraphBlock("p1", "abcd"),
          dividerBlock("d1"),
          paragraphBlock("tail", "tail"),
        ],
        "p1",
        2,
      );
      selectBlockNode(result.tiptap, "d1");
      const pasteText = vi.spyOn(result.tiptap.view, "pasteText");
      return { ...result, pasteText };
    };

    it("CRLF만 있는 평문은 PM 기본에 위임하고 view.pasteText를 부르지 않는다", () => {
      const { editable, pasteText } = setupNodeSelection();

      plainPaste(editable, "X\r\nY");

      expect(pasteText).not.toHaveBeenCalled();
    });

    it("단독 CR만 있는 평문도 PM 기본에 위임하고 줄로 나뉜다", () => {
      const { editor, editable, pasteText } = setupNodeSelection();

      plainPaste(editable, "X\rY");

      expect(pasteText).not.toHaveBeenCalled();
      const texts = outline(blocksOf(editor)).join("|");
      expect(texts).toContain("p:X");
      expect(texts).toContain("p:Y");
      expect(texts).not.toContain("XY");
    });

    it("무효 문자가 있으면 정규화한 텍스트로 view.pasteText를 한 번 부른다", () => {
      const { editor, editable, pasteText } = setupNodeSelection();

      plainPaste(editable, `X${SOH}\rY`);

      expect(pasteText).toHaveBeenCalledTimes(1);
      expect(pasteText.mock.calls[0]?.[0]).toBe("X\nY");
      const texts = outline(blocksOf(editor)).join("|");
      expect(texts).toContain("p:X");
      expect(texts).toContain("p:Y");
    });
  });

  describe("codeBlock에 걸친 범위", () => {
    // childCodeBlocks()는 p1 "abcd" 자식 [code cb "xyz", c2 "c2"]다. 범위는
    // p1 "ab" 뒤 → cb "xy" 뒤다. 직접 삽입이 아니면 PM 기본 처리가 c2를 마지막
    // 줄 블록으로 넘긴다.
    const rangeOutline = (text: string): string[] => {
      const { editor, editable, tiptap } = setup(childCodeBlocks(), "p1", 2);
      tiptap.commands.setTextSelection({
        from: contentTextStart(tiptap, "p1") + 2,
        to: contentTextStart(tiptap, "cb") + 2,
      });
      plainPaste(editable, text);
      return outline(blocksOf(editor));
    };

    it("단독 CR 평문이 직접 삽입으로 두 줄이 되고 c2는 첫 자식 뒤에 남는다", () => {
      expect(rangeOutline("X\rY")).toEqual(["p:abX[p:Yz,p:c2]", "p:"]);
      expect(rangeOutline("X\rY")).toEqual(rangeOutline("X\nY"));
    });

    it("제어문자 유무가 배치를 바꾸지 않는다", () => {
      expect(rangeOutline(`X${SOH}\rY`)).toEqual(rangeOutline("X\nY"));
      expect(rangeOutline(`X${SOH}\nY`)).toEqual(rangeOutline("X\nY"));
    });
  });

  describe("transaction 계약(C11)", () => {
    it("단독 CR 직접 삽입은 doc.check()가 통과하고 dispatch·undo가 1회다", () => {
      const { editable, tiptap } = setup(baseDocument(), "p1", 2);
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      plainPaste(editable, "X\rY\rZ");

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(() => tiptap.state.doc.check()).not.toThrow();
      expect(tiptap.state.doc.textContent).toBe("abXYZcd");

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("제어문자가 낀 Markdown 삽입은 doc.check()가 통과하고 undo 1회로 복원된다", () => {
      const { editor, editable, tiptap } = setup(baseDocument(), "p1", 2);
      const initialJson = tiptap.state.doc.toJSON();

      plainPaste(editable, `# H${SOH}\r\rbody`);

      expect(outline(blocksOf(editor))).toEqual([
        "p:ab",
        "h1:H",
        "p:body",
        "p:cd",
      ]);
      expect(() => tiptap.state.doc.check()).not.toThrow();

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });

    it("drop은 단독 CR 평문이 dispatch 1회, undo 1회다", () => {
      const { editable, tiptap } = setup(baseDocument(), "p1", 2);
      stubPosAtCoords(tiptap, contentTextStart(tiptap, "p1") + 2);
      const initialJson = tiptap.state.doc.toJSON();
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      dropData(editable, { "text/plain": "X\rY" });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(() => tiptap.state.doc.check()).not.toThrow();

      tiptap.commands.undo();
      expect(tiptap.state.doc.toJSON()).toEqual(initialJson);
    });
  });

  describe("불변 특성화(C9)", () => {
    it("한 줄 평문은 PM 기본에 위임하고 view.pasteText를 부르지 않는다", () => {
      const { editor, editable, tiptap } = setup(baseDocument(), "p1", 2);
      const pasteText = vi.spyOn(tiptap.view, "pasteText");

      plainPaste(editable, "world");

      expect(pasteText).not.toHaveBeenCalled();
      expect(outline(blocksOf(editor))).toEqual(["p:abworldcd"]);
    });

    it("한 줄 평문에 제어문자가 있으면 지우고 넣는다", () => {
      expect(pasteOutline(`a${SOH}b`)).toEqual(["p:ababcd"]);
    });
  });
});

describe("slice text 정리 헬퍼 단위(Issue #302)", () => {
  const TAB = String.fromCharCode(9);
  const DEL = String.fromCharCode(0x7f);
  const HIGH = String.fromCharCode(0xd800);

  const schemaOf = () => setup(baseDocument(), "p1", 2).tiptap.schema;

  // 문단 하나를 담은 slice다. 내용은 인라인 노드 목록이다.
  const paragraphSlice = (
    inline: (schema: ReturnType<typeof schemaOf>) => ProseMirrorNode[],
    open = 1,
  ): { slice: Slice; schema: ReturnType<typeof schemaOf> } => {
    const schema = schemaOf();
    const paragraph = schema.nodes.paragraph;
    if (paragraph === undefined) throw new Error("paragraph 조회 실패");
    return {
      slice: new Slice(
        Fragment.from(paragraph.create(null, inline(schema))),
        open,
        open,
      ),
      schema,
    };
  };

  const bold = (schema: ReturnType<typeof schemaOf>) => {
    const mark = schema.marks.bold;
    if (mark === undefined) throw new Error("bold 조회 실패");
    return mark.create();
  };

  const textsOf = (slice: Slice): string[] => {
    const texts: string[] = [];
    slice.content.descendants((node) => {
      if (node.isText) texts.push(node.text ?? "");
    });
    return texts;
  };

  it("무효 문자(C0 제어문자·Tab·DEL·짝 없는 surrogate)를 text 노드에서 지운다", () => {
    const { slice } = paragraphSlice((schema) => [
      schema.text(`a${SOH}b${TAB}c${DEL}d${HIGH}e`),
    ]);

    expect(textsOf(sanitizeSliceInlineText(slice))).toEqual(["abcde"]);
  });

  it("짝 있는 surrogate(이모지)는 지우지 않는다", () => {
    const { slice } = paragraphSlice((schema) => [schema.text("a\u{1F600}b")]);

    expect(sanitizeSliceInlineText(slice)).toBe(slice);
  });

  it("무효 문자가 없는 slice는 같은 객체를 반환한다(C9)", () => {
    const { slice } = paragraphSlice((schema) => [schema.text("abc")]);

    expect(sanitizeSliceInlineText(slice)).toBe(slice);
    expect(sanitizeSliceInlineText(Slice.empty)).toBe(Slice.empty);
  });

  it("text 노드가 없는 slice는 같은 객체를 반환한다", () => {
    const { slice } = paragraphSlice(() => []);

    expect(sanitizeSliceInlineText(slice)).toBe(slice);
  });

  it("정리 결과가 빈 text 노드는 제거한다. 빈 text 노드를 만들지 않는다", () => {
    const { slice } = paragraphSlice((schema) => [
      schema.text(SOH),
      schema.text("x", [bold(schema)]),
    ]);

    const result = sanitizeSliceInlineText(slice);

    expect(textsOf(result)).toEqual(["x"]);
    expect(result.content.firstChild?.childCount).toBe(1);
  });

  it("무효 문자뿐인 문단은 빈 문단으로 남는다", () => {
    const { slice } = paragraphSlice((schema) => [schema.text(SOH)]);

    const result = sanitizeSliceInlineText(slice);

    expect(result.content.childCount).toBe(1);
    expect(result.content.firstChild?.childCount).toBe(0);
    expect(textsOf(result)).toEqual([]);
  });

  it("마크를 보존한다", () => {
    const { slice } = paragraphSlice((schema) => [
      schema.text(`a${SOH}`, [bold(schema)]),
      schema.text("b"),
    ]);

    const result = sanitizeSliceInlineText(slice);
    const children: ProseMirrorNode[] = [];
    result.content.firstChild?.forEach((child) => children.push(child));

    expect(children.map((child) => child.text)).toEqual(["a", "b"]);
    expect(
      children.map((child) => child.marks.map((m) => m.type.name)),
    ).toEqual([["bold"], []]);
  });

  it("openStart·openEnd를 보존한다", () => {
    const { slice } = paragraphSlice((schema) => [schema.text(`a${SOH}b`)], 1);
    const wide = new Slice(slice.content, 1, 0);

    const result = sanitizeSliceInlineText(wide);

    expect(result.openStart).toBe(1);
    expect(result.openEnd).toBe(0);
    expect(textsOf(result)).toEqual(["ab"]);
  });

  it("blockContainer 안 중첩 문단의 text도 정리한다", () => {
    const schema = schemaOf();
    const container = schema.nodes.blockContainer;
    const paragraph = schema.nodes.paragraph;
    if (container === undefined || paragraph === undefined) {
      throw new Error("노드 타입 조회 실패");
    }
    const slice = new Slice(
      Fragment.from([
        container.create(null, paragraph.create(null, schema.text(`x${SOH}`))),
        container.create(null, paragraph.create(null, schema.text("y"))),
      ]),
      0,
      0,
    );

    const result = sanitizeSliceInlineText(slice);

    expect(textsOf(result)).toEqual(["x", "y"]);
    // 바뀌지 않은 두 번째 container는 같은 노드다.
    expect(result.content.child(1)).toBe(slice.content.child(1));
  });

  describe("codeBlock text 보호(C10)", () => {
    const codeBlockSlice = (
      codeText: string,
      paragraphText?: string,
    ): Slice => {
      const schema = schemaOf();
      const codeBlock = schema.nodes.codeBlock;
      const paragraph = schema.nodes.paragraph;
      if (codeBlock === undefined || paragraph === undefined) {
        throw new Error("노드 타입 조회 실패");
      }
      const nodes = [codeBlock.create(null, schema.text(codeText))];
      if (paragraphText !== undefined) {
        nodes.push(paragraph.create(null, schema.text(paragraphText)));
      }
      return new Slice(Fragment.from(nodes), 0, 0);
    };

    it("codeBlock의 Tab은 보존하고 같은 객체를 반환한다", () => {
      const slice = codeBlockSlice(`a${TAB}b\nc`);

      expect(sanitizeSliceInlineText(slice)).toBe(slice);
    });

    it("codeBlock text는 무효 문자도 건드리지 않는다. 같은 slice의 문단 text만 정리한다", () => {
      const slice = codeBlockSlice(`a${TAB}b${SOH}`, `x${SOH}y${TAB}z`);

      const result = sanitizeSliceInlineText(slice);

      expect(textsOf(result)).toEqual([`a${TAB}b${SOH}`, "xyz"]);
      expect(result.content.child(0)).toBe(slice.content.child(0));
    });
  });
});
