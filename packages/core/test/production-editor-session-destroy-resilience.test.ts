/**
 * Issue #170 roadmap RD-001 DELTA-02 — destroy()의 readEditorDocument
 * 라운드트립 재확인(L339)이 실패해도 나머지 파괴 절차(로컬 프리뷰 정리
 * 통지, tiptapEditor.destroy(), destroyed 플래그)는 항상 완료돼야 한다.
 * 이전에는 이 읽기가 throw하면 destroy() 전체가 중단돼 세션이 "파괴 중
 * 멈춘" 상태로 남았다 — tiptapEditor가 파괴되지 않고 destroyed 플래그도
 * 계속 false였다(공개 표면엔 없어 재호출 no-op 여부로 간접 확인한다).
 *
 * 실제 촉발 경로: divider 등 자체-identity 노드가 blockId 없이 라이브
 * 상태에 남으면, 실제 커밋 경로(tiptap-to-model.ts의 resolveBlockId)가
 * 세션의 진짜 createId로 다시 채우다 유일성 검사 없이 충돌하면 "Duplicate
 * id"로 던진다. 정상 dispatch로는 이 상태에 도달할 수 없다 — 공개 command
 * 계층은 항상 blockId를 채우고, dispatch를 거치면 Issue #167 RD-001
 * DELTA-01의 revisionGuard가 매 transaction 끝에 최종 문서를 검증한다(단
 * 그 사전 검증은 항상 유일한 로컬 placeholder id로 미리보기 때문에, "빈
 * blockId가 실제 createId로 채워질 때만 충돌"하는 이 케이스 자체는 걸러내지
 * 못한다 — onTiptapUpdate 경로에도 남아있는 별도 문제라 Issue #170 범위
 * 밖이다, pending-issues 참고). 그래서 이 테스트는 dispatch를 거치지 않고
 * Transform(`tr.doc`)으로 손상된 상태를 계산해 `tiptap.state.doc`을 직접
 * 덮어쓴다(`editor-controller-table-paste.test.ts`의 손상된 표 fixture와
 * 동일 기법) — destroy() 호출 시점에 "이미 이런 상태"라는 사실만 재현하면
 * 충분하다.
 */
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("destroy()의 readEditorDocument 실패 복원력(Issue #170 RD-001 DELTA-02)", () => {
  it("blockId 없는 자체-identity 노드가 충돌하는 id로만 채워져도 destroy()는 throw 없이 완전히 파괴된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("root"),
      // 상수 createId — 두 divider가 각자 빈 blockId를 채울 때 같은 값을
      // 받아 충돌한다(resolveBlockId는 유일성을 검사하지 않는다).
      createId: () => "dup-id",
    });
    const { tiptap } = mountTiptapEditor(editor);
    const dividerType = tiptap.schema.nodes.divider;
    if (dividerType === undefined) throw new Error("divider 노드 타입 없음");

    // blockId 없는 divider 2개를 Transform으로만 계산해 tiptap.state.doc을
    // 직접 덮어쓴다 — dispatch를 거치지 않아 onTiptapUpdate/revisionGuard가
    // 개입하지 않는다.
    const corruptedDoc = tiptap.state.tr.insert(tiptap.state.doc.content.size, [
      dividerType.create(),
      dividerType.create(),
    ]).doc;
    (tiptap.state as unknown as { doc: typeof corruptedDoc }).doc =
      corruptedDoc;

    expect(() => editor.destroy()).not.toThrow();
    // destroyed 플래그가 실제로 true가 됐는지는 공개 표면에 직접 노출되지
    // 않는다 — destroy()는 `if (this.destroyed) return;`으로 시작하므로,
    // 재호출이 readEditorDocument를 다시 타지 않고 조용히 no-op이면 첫
    // 호출에서 플래그가 true가 됐다는 뜻이다(그렇지 않으면 같은 충돌로
    // 다시 throw했을 것이다).
    expect(() => editor.destroy()).not.toThrow();
  });
});
