/**
 * Issue #171 roadmap RD-001-DELTA-01 — onTiptapUpdate의 readEditorDocument
 * throw가 blockId 없는 자체-identity 노드 경로로 재현되는 문제를 고정한다.
 *
 * 실제 촉발 경로: divider 등 자체-identity 노드가 blockId 없이 라이브 상태에
 * dispatch되면, revisionGuard의 사전 검증(buildBeforeChangeDocument)은 항상
 * 유일한 로컬 placeholder id로 미리보기 때문에 통과시키지만, 실제 커밋
 * 경로(tiptap-to-model.ts의 resolveBlockId)는 세션의 진짜 createId로 같은
 * 변환을 다시 돈다 — 그 fallback이 유일성을 검사하지 않으면 두 번째
 * divider의 발급 id가 첫 번째와(또는 문서에 이미 있는 id와) 충돌해
 * onTiptapUpdate가 uncaught `TypeError: Duplicate id`로 throw한다.
 *
 * `production-editor-session-destroy-resilience.test.ts`는 dispatch를 거치면
 * 이 문제 자체가 함께 트리거돼 destroy() 복원력만 격리 검증할 수 없어서
 * 일부러 dispatch를 피하고 Transform으로 상태만 주입했다. 이 테스트는
 * 반대로 onTiptapUpdate 경로 자체를 실제로 태우려고 dispatch를 그대로 쓴다.
 *
 * 두 divider 모두 문서 마지막 노드가 되지 않는 위치(첫 블록과 tail 사이)에
 * 삽입한다 — divider가 문서 끝에 오면 BlockIdExtension의 trailing-paragraph
 * 정규화가 별도로 createId를 소비해(자체 재시도 로직으로 항상 성공한다) 이
 * 테스트가 의도한 호출 순서를 흔든다. 위치를 옮기면 그 정규화 자체가
 * 트리거되지 않아 resolveBlockId fallback 호출만 정확히 셀 수 있다.
 *
 * RD-001-DELTA-01은 resolveBlockId의 fallback을 createUniqueDocumentId
 * 패턴(재시도 + occupiedIds 대조)으로 교체해 이 경로를 막는다.
 */
import { parseDocument, type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  dividerBlock,
  mountTiptapEditor,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const headThenTailDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "head", type: "paragraph", content: [{ text: "head" }] },
    tailParagraphBlock,
  ],
});

describe("onTiptapUpdate의 자체-identity 노드 blockId 부재 복원력(Issue #171 RD-001-DELTA-01)", () => {
  it("한 transaction에 blockId 없는 divider 2개가 들어와도 유일 id로 커밋되고 throw하지 않는다", () => {
    // 1번째 호출과 2번째 호출이 같은 값("dup")을 반환한다 — 재시도 없이
    // 그대로 쓰면 두 divider가 같은 id를 갖는다. 재시도하면 3번째 호출의
    // "fresh"로 넘어가 회피한다.
    const values = ["dup", "dup", "fresh"];
    let call = 0;
    const createId = (): string => {
      const value = values[call] ?? values.at(-1) ?? "";
      call += 1;
      return value;
    };

    const editor = createEditor({
      initialDocument: headThenTailDocument(),
      createId,
    });
    const { tiptap } = mountTiptapEditor(editor);

    try {
      const dividerType = tiptap.schema.nodes.divider;
      if (dividerType === undefined) throw new Error("divider 노드 타입 없음");

      // "head" blockContainer 바로 뒤, tail 앞 — 문서 마지막 노드가 되지
      // 않는 위치다.
      const insertAt = tiptap.state.doc.firstChild?.nodeSize ?? 0;
      expect(() => {
        tiptap.view.dispatch(
          tiptap.state.tr.insert(insertAt, [
            dividerType.create(),
            dividerType.create(),
          ]),
        );
      }).not.toThrow();

      const dividers = editor
        .getDocument()
        .blocks.filter((block) => block.type === "divider");
      expect(dividers.map((block) => block.id)).toEqual(["dup", "fresh"]);
      expect(parseDocument(editor.getDocument())).toMatchObject({ ok: true });
    } finally {
      editor.destroy();
    }
  });

  it("발급되는 id가 문서에 이미 존재하는 blockId와 충돌하면 재시도해 회피한다", () => {
    let call = 0;
    const createId = () => {
      call += 1;
      return call === 1 ? "existing-div" : "fresh-div";
    };
    const editor = createEditor({
      initialDocument: {
        formatVersion: 1,
        revision: 0,
        blocks: [dividerBlock("existing-div"), tailParagraphBlock],
      },
      createId,
    });
    const { tiptap } = mountTiptapEditor(editor);

    try {
      const dividerType = tiptap.schema.nodes.divider;
      if (dividerType === undefined) throw new Error("divider 노드 타입 없음");

      // "existing-div" divider 바로 뒤, tail 앞 — 새 divider가 문서
      // 마지막 노드가 되지 않는 위치다.
      const insertAt = tiptap.state.doc.firstChild?.nodeSize ?? 0;
      expect(() => {
        tiptap.view.dispatch(
          tiptap.state.tr.insert(insertAt, dividerType.create()),
        );
      }).not.toThrow();

      const dividers = editor
        .getDocument()
        .blocks.filter((block) => block.type === "divider");
      expect(dividers.map((block) => block.id)).toEqual([
        "existing-div",
        "fresh-div",
      ]);
      expect(parseDocument(editor.getDocument())).toMatchObject({ ok: true });
    } finally {
      editor.destroy();
    }
  });
});
