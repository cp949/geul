import { Extension } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";
import { isMediaBlockKind } from "./media-block-kind.js";
import { isLocalPreviewReachableViaUndo } from "./media-local-preview-reachability.js";
import type { LocalPreviewAttrs } from "./media-local-preview.js";

export type MediaLocalPreviewLifecycleOptions = {
  // Issue #168 roadmap RD-002 DELTA-02 — 삭제된 로컬 프리뷰(ADR 0015)
  // 블록이 더 이상 undo로 복구 불가라고 판정되면 호출한다.
  // production-editor-session.ts가 기존 `notifyLocalPreviewCleared`(url
  // 확정 시 정리와 같은 채널, RD-002.md "결정" — 신호 채널 재사용)로
  // 연결한다. 미지정이면 no-op(MediaDropPasteExtension의 기본값과 동일
  // 근거 — production-editor-assembly.ts가 항상 실제 콜백을 넘긴다).
  notifyUnreachable: (blockId: string, cleared: LocalPreviewAttrs) => void;
};

// doc에서 로컬 프리뷰(ADR 0015) attrs가 남은 미디어 블록을 전부 찾는다.
// editor-controller.ts::getPendingLocalPreviews()와 같은 판정 기준(4종
// media kind + blockId + localPreviewUrl 문자열)이지만, 이 파일은 "삭제
// 감지" 전용이라 그 공개 API의 반환 shape({blockId, file})과는 독립적으로
// 유지한다(호출부가 attrs 전체 — url까지 — 필요하다, 아래 appendTransaction
// 참고).
const collectLocalPreviewBlocks = (
  doc: ProseMirrorNode,
): Map<string, LocalPreviewAttrs> => {
  const found = new Map<string, LocalPreviewAttrs>();
  doc.descendants((node) => {
    if (
      isMediaBlockKind(node.type.name) &&
      typeof node.attrs.blockId === "string" &&
      node.attrs.blockId.length > 0 &&
      typeof node.attrs.localPreviewUrl === "string"
    ) {
      found.set(node.attrs.blockId, {
        localPreviewUrl: node.attrs.localPreviewUrl,
        localPreviewFile: node.attrs.localPreviewFile as File,
      });
    }
    return true;
  });
  return found;
};

// Issue #168 roadmap RD-002 DELTA-02 — 로컬 프리뷰가 남은 미디어 블록이
// 삭제된 뒤 undo로도 복구 불가능해지는 시점을 판정해 정리 신호를 낸다.
// `media-local-preview-reachability.ts`(공개 API 시뮬레이션, 비공개
// prosemirror-history 상수에 의존하지 않음 — `_works/roadmap/progress.md`
// "DELTA-02 착수 전 기술 조사" 근거)를 소비하는 유일한 호출부다.
export const MediaLocalPreviewLifecycleExtension =
  Extension.create<MediaLocalPreviewLifecycleOptions>({
    name: "mediaLocalPreviewLifecycle",

    addOptions() {
      return {
        notifyUnreachable: () => {
          // no-op 기본값 — 위 타입 주석 참고.
        },
      };
    },

    addProseMirrorPlugins() {
      const notifyUnreachable = this.options.notifyUnreachable;
      // 삭제됐지만 아직 undo로 복구 가능한지 재판정 대기 중인 블록 —
      // 확장 인스턴스(= Tiptap Editor 인스턴스, 세션 재구성마다 새로
      // 만들어짐)당 하나. BlockIdExtension의 createId 클로저와 동일한
      // 생애주기(session-scoped, 재구성 시 자동으로 빈 상태에서 시작).
      const pending = new Map<string, LocalPreviewAttrs>();
      // 재진입 가드 — `EditorState.apply(tr)`는 내부적으로
      // `applyTransaction(tr)`의 별칭이라(prosemirror-state 실측,
      // `apply(tr) { return this.applyTransaction(tr).state }`) 이
      // 플러그인 자신을 포함한 모든 플러그인의 `appendTransaction`을 다시
      // 태운다. `isLocalPreviewReachableViaUndo`의 시뮬레이션이
      // `current.apply(tr)`로 undo를 반복 재현하는 동안 이 플러그인의
      // `appendTransaction`이 재귀적으로 재호출돼 같은 `pending` Map을
      // 시뮬레이션 중간 상태 기준으로 잘못 변형시키는 것을 막는다(착수
      // 중 실측 — 재귀 호출이 시뮬레이션 도중 "재등장"으로 오판해 아직
      // 처리 중인 바깥 호출의 `pending`에서 blockId를 지워버림). 이
      // 플러그인 외 다른 appendTransaction 사용처(BlockIdExtension·
      // TrailingBlockExtension 등)는 호출마다 파라미터에서만 파생하고
      // 영속 mutable 상태를 갖지 않아(실측) 재진입해도 무해하다 — 이
      // 가드는 이 플러그인 자신의 상태만 보호하면 충분하다.
      let simulating = false;

      return [
        new Plugin({
          appendTransaction: (transactions, oldState, newState) => {
            if (simulating) return null;
            if (!transactions.some((transaction) => transaction.docChanged)) {
              return null;
            }

            // 새로 사라진 로컬 프리뷰 블록을 재판정 대기열에 추가한다.
            for (const [blockId, attrs] of collectLocalPreviewBlocks(
              oldState.doc,
            )) {
              if (findBlockPosition(newState.doc, blockId) === null) {
                pending.set(blockId, attrs);
              }
            }

            // 실제 undo로 복구된 블록은 대기열에서 뺀다 — 이후 아무리 새
            // undo 이벤트가 쌓여도 이 blockId를 다시 정리 대상으로 보지
            // 않는다(같은 blockId 재사용 시 오탐 방지).
            for (const blockId of pending.keys()) {
              if (findBlockPosition(newState.doc, blockId) !== null) {
                pending.delete(blockId);
              }
            }

            if (pending.size === 0) return null;
            // 성능 게이트 — `undoDepth`가 바뀌지 않은 트랜잭션은 done
            // 브랜치 eviction이 일어날 수 없다(eviction은 addTransform
            // 경로에서만 발생하고, 그 경로를 타지 않으면 eventCount가
            // 그대로다). 매 키 입력마다 O(depth) 시뮬레이션을 돌리지
            // 않기 위한 근사 게이트다 — 놓치지 않는 것(과소 재판정 없음)만
            // 보장하면 되고, 과도하게 자주 통과해도(병합 편집이 아니라
            // 매번 새 그룹인 경우 등) 정확성에는 영향이 없다(성능
            // 손실뿐).
            if (undoDepth(newState) === undoDepth(oldState)) return null;

            simulating = true;
            try {
              for (const [blockId, attrs] of pending) {
                if (!isLocalPreviewReachableViaUndo(newState, blockId)) {
                  pending.delete(blockId);
                  notifyUnreachable(blockId, attrs);
                }
              }
            } finally {
              simulating = false;
            }
            return null;
          },
        }),
      ];
    },
  });
