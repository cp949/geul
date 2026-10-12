// 로컬 프리뷰(ADR-0015) blob URL 발급과 "문서에 못 들어간 URL" 해제 통지
// (Issue #379). Tiptap은 이 파일에서 타입 import만 쓴다. doc 스캔은 leaf인
// media-local-preview.ts의 listLocalPreviews가 맡는다.
//
// URL은 transaction을 만들기 전에 발급한다. transaction이 거절·되돌림·예외로
// 문서에 들어가지 못하면 MediaLocalPreviewLifecycleExtension도 세션 종료
// 정리도 그 URL을 보지 못한다. 발급자가 발급한 URL을 쌓아 두었다가 settle에서
// 문서에 못 들어간 것만 통지한다.
//
// 판정 기준은 "호스트 콜백이 돌기 전에 문서에 한 번이라도 들어갔는가"다.
// - Tiptap은 dispatch에서 applyTransaction 직후 beforeTransaction을
//   발화한다. view 갱신과 update 이벤트보다 앞이고 호스트 onChange보다 앞이다.
// - payload의 nextState는 appendTransaction 되돌림이 반영된 최종 state다.
//   filterTransaction 거절이면 이전 state라 URL이 없다.
// - 발급자는 이 시점의 URL을 모두 placedUrls에 합친다. dispatch가 여러 번이어도
//   합집합이다.
//
// finally 시점의 `editor.state.doc`으로 판정하지 않는다. 그 시점은 호스트
// 콜백 뒤라 두 가지를 놓친다.
// - 콜백이 블록을 지우면 undo 가능한 블록의 URL을 즉시 통지한다. 문서에 들어갔다
//   사라진 블록은 Lifecycle 확장이 undo 도달 가능성이 끝날 때까지 미룬다.
// - 콜백이 replaceDocument를 부르면 이미 통지된 URL을 한 번 더 통지한다.
// 또 doc 참조 비교와 `result.ok`도 쓰지 않는다. appendTransaction 되돌림은 새
// doc 객체를 만들고, 모델 변경 없음으로 false여도 transaction은 적용됐을 수
// 있다.
//
// 호출 패턴: `try { …issue와 dispatch… } finally { issuer.settle() }`.
// 발급이 한 번도 없으면 settle은 아무것도 하지 않는다.
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

import {
  createLocalPreviewAttrs,
  listLocalPreviews,
  type LocalPreviewAttrs,
} from "./media-local-preview.js";

export type DiscardLocalPreview = (
  blockId: string,
  attrs: LocalPreviewAttrs,
) => void;

// 새 blob URL을 발급한다. blockId는 그 URL을 받을 블록이 가질 새 id다.
export type IssueLocalPreview = (
  file: File,
  blockId: string,
) => LocalPreviewAttrs;

export type LocalPreviewIssuer = {
  issue: IssueLocalPreview;
  settle: () => void;
};

type Issued = { blockId: string; attrs: LocalPreviewAttrs };

// editor 객체는 settle까지 유지한다. 리스너를 등록한 객체에서 해제하려면
// replaceDocument가 editor를 교체해도 같은 객체를 잡고 있어야 한다.
export const createLocalPreviewIssuer = (
  editor: Editor,
  discard: DiscardLocalPreview,
): LocalPreviewIssuer => {
  const issued: Issued[] = [];
  const placedUrls = new Set<string>();
  let listening = false;

  const onBeforeTransaction = ({
    nextState,
  }: {
    nextState: EditorState;
  }): void => {
    for (const { attrs } of listLocalPreviews(nextState.doc)) {
      placedUrls.add(attrs.localPreviewUrl);
    }
  };

  const issue: IssueLocalPreview = (file, blockId) => {
    // 첫 발급 때 등록한다. 발급이 없는 호출은 리스너도 순회도 만들지 않는다.
    if (!listening) {
      editor.on("beforeTransaction", onBeforeTransaction);
      listening = true;
    }
    const attrs = createLocalPreviewAttrs(file);
    issued.push({ blockId, attrs });
    return attrs;
  };

  const settle = (): void => {
    if (listening) {
      editor.off("beforeTransaction", onBeforeTransaction);
      listening = false;
    }
    // 두 번 불러도 같은 URL을 두 번 통지하지 않는다.
    const pending = issued.splice(0);
    for (const { blockId, attrs } of pending) {
      if (!placedUrls.has(attrs.localPreviewUrl)) discard(blockId, attrs);
    }
  };

  return { issue, settle };
};
