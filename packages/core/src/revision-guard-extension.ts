import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, type Transaction } from "@tiptap/pm/state";

// RD-004-DELTA-02 — canApplyDocumentChange가 transaction을 받는다.
// production-editor-session.ts::evaluateBeforeChange가 revision
// overflow 가드와 소비자 onBeforeChange를 이 하나의 함수 안에서
// AND 결합·fail-fast로 합쳐 넘긴다(이 확장 자신은 목록 내용을 모른다).
//
// validateDocument(Issue #167 roadmap RD-001-DELTA-01) — canApplyDocumentChange
// 와 평가 시점이 다르다. canApplyDocumentChange는 filterTransaction으로 root
// transaction만 보므로, BlockIdExtension처럼 root 이후 appendTransaction으로
// 문서를 고치는 확장의 결과를 반영하지 못한다(root 시점엔 ID가 충돌해도
// BlockIdExtension이 재발급하면 최종은 유효한 경우 — 이 시점에 거절하면
// 정상 fixup을 막는다). validateDocument는 그 반대로 이 batch의 모든
// appendTransaction이 끝난 **최종** 문서만 본다 — root transaction 자체가
// filterTransaction을 통과한 뒤에만 호출된다.
type RevisionGuardOptions = {
  canApplyDocumentChange: (transaction: Transaction) => boolean;
  validateDocument: (doc: ProseMirrorNode) => boolean;
};

export const RevisionGuardExtension = Extension.create<RevisionGuardOptions>({
  name: "revisionGuard",

  // Issue #167 roadmap RD-001-DELTA-01 — Tiptap의 plugins getter는 확장
  // 배열을 뒤집은 뒤 priority로 다시 정렬한다("나중에 등록한 확장이 먼저
  // 실행되어야 override가 자연스럽다", @tiptap/core ExtensionManager.ts
  // 실측) — 즉 priority가 같으면(기본값 100) **나중에 선언한 확장이
  // appendTransaction 루프에서 먼저** 실행된다. validateDocument는 같은
  // pass 안에서 BlockIdExtension(기본 100) 등 모든 fixup 확장의
  // appendTransaction이 이미 반영된 최종 문서를 봐야 하므로, 이 확장이
  // production-editor-assembly.ts의 extensions 배열 어디에 선언되든
  // 항상 마지막에 실행되도록 다른 모든 appendTransaction 확장(최저
  // list-input-rule-extension.ts 1_100)보다 낮은 priority를 명시한다.
  // `priority: 0`은 sortExtensions의 `|| defaultPriority`에 걸려 100으로
  // 취급되므로(falsy) 쓰지 않는다.
  priority: 1,

  addOptions() {
    return { canApplyDocumentChange: () => true, validateDocument: () => true };
  },

  addProseMirrorPlugins() {
    const canApplyDocumentChange = this.options.canApplyDocumentChange;
    const validateDocument = this.options.validateDocument;
    return [
      new Plugin({
        filterTransaction: (transaction) =>
          !transaction.docChanged || canApplyDocumentChange(transaction),
        // Issue #167 roadmap RD-001-DELTA-01 — 이 batch의 모든
        // appendTransaction이 끝난 뒤(BlockIdExtension 등 이 확장보다
        // 먼저 등록된 확장의 appendTransaction이 먼저 실행되도록
        // production-editor-assembly.ts가 이 확장을 배열 뒤쪽에 둔다)
        // 최종 문서가 여전히 무효면 이 batch 전체를 oldState로 되돌린다.
        // 되돌리는 transaction도 appendTransaction 결과라 다음 pass에서
        // 다시 이 훅을 타지만, 그때는 newState.doc이 oldState.doc과
        // 같아 validateDocument가 true를 반환해 수렴한다. view는 이
        // dispatch() 호출이 끝나 상태가 확정된 뒤에만 갱신되므로(Tiptap이
        // EditorView.dispatch를 감싼다) 무효 상태가 화면에 보이거나
        // onUpdate로 관찰되는 일은 없다 — G-EDT-001 "mutation 전에
        // 판정"과 같은 효과를 batch 끝에서 얻는다.
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (validateDocument(newState.doc)) return null;
          return newState.tr.replaceWith(
            0,
            newState.doc.content.size,
            oldState.doc.content,
          );
        },
      }),
    ];
  },
});
