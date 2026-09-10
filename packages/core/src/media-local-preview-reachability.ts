import { undo, undoDepth } from "@tiptap/pm/history";
import type { EditorState } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";

// Issue #168 roadmap RD-002 DELTA-02 — "삭제된 로컬 프리뷰(ADR 0015) 블록이
// 아직 undo로 복구 가능한가"를 판정한다. `prosemirror-history`(vendored
// 1.5.0) 공개 API(`closeHistory`/`history`/`isHistoryTransaction`/`redo`/
// `redoDepth`/`redoNoScroll`/`undo`/`undoDepth`/`undoNoScroll`, `dist/
// index.d.ts` 확인)에는 "이 이벤트가 아직 done 브랜치에 남아있는가"를 직접
// 묻는 방법이 없다 — eviction(`cutOffEvents`)은 `eventCount - depth >
// DEPTH_OVERFLOW`(=20, history.ts 비공개·비export 상수)일 때만 발동해
// 정밀 경계가 라이브러리 내부 구현에 못박혀 있다(`_works/roadmap/
// progress.md` "DELTA-02 착수 전 기술 조사" 절 근거).
//
// 이 함수는 그 비공개 상수에 의존하지 않는다 — `undo(state, cb)`를
// `undoDepth(state)`번 반복 호출해, 실제로 몇 번 undo해야 대상 블록이
// doc에 재등장하는지 그대로 재현한다. prosemirror-history의 실제 popEvent
// 로직을 그대로 태우므로 근사가 아니라 정확하다.
//
// `cb`는 실제 view에 dispatch하지 않고 `current.apply(tr)`로 로컬
// 변수에만 다음 state를 누적한다 — 세션·DOM에 부작용을 주지 않는다.
// **주의**: `EditorState.apply(tr)`는 순수해 보이지만 내부적으로
// `applyTransaction(tr).state`의 별칭이라(prosemirror-state 실측)
// 호출자 자신을 포함한 모든 등록 plugin의 `appendTransaction`을 다시
// 태운다 — 이 함수를 `appendTransaction` 안에서 호출하는 쪽(현재
// `media-local-preview-lifecycle-extension.ts`가 유일한 호출부)은 자기
// 자신의 재진입으로부터 스스로를 지켜야 한다(그 파일의 `simulating` 가드
// 참고, 착수 중 실측 — 가드 없이는 재귀 호출이 시뮬레이션 중간 상태를
// "실제 재등장"으로 오판해 바깥 호출의 상태를 오염시킴). 비용은
// O(undoDepth) `state.apply` 호출(각각 전체 plugin fixpoint 포함) —
// 호출부가 이 비용을 감당할 시점을 스스로 게이트한다,
// media-local-preview-lifecycle-extension.ts 참고.
export function isLocalPreviewReachableViaUndo(
  state: EditorState,
  blockId: string,
): boolean {
  let current = state;
  const steps = undoDepth(current);
  for (let i = 0; i < steps; i += 1) {
    let next: EditorState | null = null;
    const applied = undo(current, (transaction) => {
      next = current.apply(transaction);
    });
    if (!applied || next === null) break;
    current = next;
    if (findBlockPosition(current.doc, blockId) !== null) return true;
  }
  return false;
}
