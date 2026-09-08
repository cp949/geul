/**
 * `CreateEditorOptions.syntaxHighlighter` 배선 계약(spec §3,
 * RD-001-DELTA-01/02). 동기 `SyntaxHighlighter`를 연결하면 코드 블록에
 * decoration이 그려지고, 연결하지 않으면 기존 동작(plain text)이 무회귀로
 * 유지됨을 고정한다(DELTA-01). 비동기 함수를 연결하면 resolve 후 반영되고,
 * 편집 중 오래된 Promise가 나중에 resolve해도 이미 바뀐 content를 덮지
 * 않는다(DELTA-02, spec §4 "비동기 최신 결과만 반영"). edge case(범위 밖·
 * 겹침·거절된 Promise·미지원 language)는 DELTA-03이 다룬다.
 */
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  codeBlockBlock,
  documentOf,
  mountTiptapEditor,
} from "./editor-controller-support.js";

/**
 * 우리 어댑터의 `.then` → prosemirror-highlight의 `.then` → `refresh()`
 * dispatch로 이어지는 다단 promise 체인을 macrotask 경계까지 밀어
 * 확정적으로 flush한다(단순 `await Promise.resolve()` 반복보다 안전).
 */
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("syntaxHighlighter", () => {
  it("동기 함수를 연결하면 지정한 오프셋 범위에 강조 span이 렌더된다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        codeBlockBlock("cb-1", "const x = 1;", "typescript"),
      ),
      syntaxHighlighter: () => [{ from: 0, to: 5, className: "tok-keyword" }],
    });
    const { editable } = mountTiptapEditor(editor);

    const span = editable.querySelector("code span.tok-keyword");
    expect(span?.textContent).toBe("const");
  });

  it("연결하지 않으면 강조 span 없이 plain text로 렌더된다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        codeBlockBlock("cb-1", "const x = 1;", "typescript"),
      ),
    });
    const { editable } = mountTiptapEditor(editor);

    expect(editable.querySelector("code span")).toBeNull();
    expect(editable.querySelector("code")?.textContent).toBe("const x = 1;");
  });

  it("비동기 함수를 연결하면 resolve 전에는 강조가 없고 resolve 후 강조 span이 렌더된다", async () => {
    const editor = createEditor({
      initialDocument: documentOf(
        codeBlockBlock("cb-1", "const x = 1;", "typescript"),
      ),
      syntaxHighlighter: () =>
        Promise.resolve([{ from: 0, to: 5, className: "tok-keyword" }]),
    });
    const { editable } = mountTiptapEditor(editor);

    expect(editable.querySelector("code span.tok-keyword")).toBeNull();

    await flushMicrotasks();

    const span = editable.querySelector("code span.tok-keyword");
    expect(span?.textContent).toBe("const");
  });

  it("편집 중 오래된 Promise가 resolve해도 이미 바뀐 content의 강조를 덮지 않는다", async () => {
    let resolveStale: (
      tokens: readonly { from: number; to: number; className?: string }[],
    ) => void = () => {};
    const stalePromise = new Promise<
      readonly { from: number; to: number; className?: string }[]
    >((resolve) => {
      resolveStale = resolve;
    });

    // content로 분기한다(호출 횟수 카운터가 아니다) — Tiptap 마운트
    // 생명주기 동안 이 어댑터 파서가 여러 차례(예: 내부 dummy self-mount
    // 왕복) 다시 만들어질 수 있어, 몇 번째 호출인지가 아니라 "이 content를
    // 아직 못 풀었다"는 사실 자체로 판단해야 안정적이다. 원본 content
    // ("const x = 1;")를 요청하는 모든 호출이 동일한 stalePromise
    // 인스턴스를 공유해 받는다 — resolve 시점에 실제로 살아있는(현재
    // mount된) closure의 구독도 함께 풀린다.
    const editor = createEditor({
      initialDocument: documentOf(
        codeBlockBlock("cb-1", "const x = 1;", "typescript"),
      ),
      syntaxHighlighter: ({ source }) =>
        source === "const x = 1;"
          ? stalePromise
          : [{ from: 0, to: source.length, className: "tok-fresh" }],
    });
    const { editable, tiptap } = mountTiptapEditor(editor);

    // 코드 블록 content를 동기적으로 바꿔 새 파서 호출을 트리거한다.
    // codeBlock은 leafBlockContent라 commands.setText는
    // isNestableBlockType 가드에 거절되므로 저수준 dispatch를 쓴다.
    const target = ((): { pos: number; size: number } | null => {
      let found: { pos: number; size: number } | null = null;
      tiptap.state.doc.descendants((node, pos) => {
        if (node.type.name === "codeBlock") {
          found = { pos, size: node.content.size };
          return false;
        }
        return true;
      });
      return found;
    })();
    if (target === null) throw new Error("codeBlock 노드를 찾지 못했다");
    const from = target.pos + 1;
    const to = from + target.size;
    tiptap.view.dispatch(
      tiptap.state.tr.replaceWith(from, to, tiptap.schema.text("let y = 2;")),
    );

    expect(editable.querySelector("code")?.textContent).toBe("let y = 2;");
    expect(editable.querySelector("code span.tok-fresh")?.textContent).toBe(
      "let y = 2;",
    );

    // 이제서야 오래된(첫 호출, "const x = 1;" 대상) Promise를 resolve한다.
    resolveStale([{ from: 0, to: 3, className: "tok-stale" }]);
    await flushMicrotasks();

    expect(editable.querySelector("code span.tok-stale")).toBeNull();
    expect(editable.querySelector("code")?.textContent).toBe("let y = 2;");
    expect(editable.querySelector("code span.tok-fresh")?.textContent).toBe(
      "let y = 2;",
    );
  });
});
