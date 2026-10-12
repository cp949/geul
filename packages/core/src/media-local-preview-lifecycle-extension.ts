import { Extension } from "@tiptap/core";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

import { isLocalPreviewReachableViaHistory } from "./media-local-preview-reachability.js";
import {
  indexLocalPreviewsByUrl,
  listLocalPreviews,
  type LocalPreviewAttrs,
  type LocalPreviewEntry,
} from "./media-local-preview.js";

// 문서에서 빠졌지만 아직 복구 불가 판정을 받지 못한 로컬 프리뷰. 키(URL)는
// pending Map이 쥐고, blockId는 통지 인자 모양 `(blockId, attrs)`를 유지하려고
// 빠지기 직전 노드의 값을 보관한다.
export type PendingLocalPreview = LocalPreviewEntry;

export type MediaLocalPreviewLifecycleOptions = {
  // Issue #168 roadmap RD-002 DELTA-02 — 문서에서 빠진 로컬 프리뷰(ADR 0015)
  // URL이 더 이상 undo로도 redo로도 복구 불가라고 판정되면 호출한다.
  // production-editor-session.ts가 기존 `notifyLocalPreviewCleared`
  // (RD-002.md "결정" — 신호 채널 재사용)로 연결한다. url 확정 경로의
  // 통지도 이 판정이 맡는다(Issue #382). 미지정이면 no-op
  // (MediaDropPasteExtension의 기본값과 동일 근거 —
  // production-editor-assembly.ts가 항상 실제 콜백을 넘긴다).
  notifyUnreachable: (blockId: string, cleared: LocalPreviewAttrs) => void;
  // Issue #168 roadmap RD-002 DELTA-03 — 빠졌지만 아직 복구 불가 판정을
  // 받지 못해 `pending`에만 남아 있는 로컬 프리뷰 목록이 바뀔 때마다(추가·
  // 재등장으로 제거·판정 확정으로 제거) 그 시점의 전체 스냅샷을 알린다.
  // 키는 URL이다(Issue #383).
  // `production-editor-session.ts::destroy()`가 세션 종료 시 이 스냅샷을
  // 함께 훑어야 한다 — `pending`은 doc에 URL이 없는 항목만 담으므로
  // `listLocalPreviews(doc)`(현재 doc 순회)만으로는 이 항목들을
  // 볼 수 없다(구현 중 실측 — "삭제 직후·복구 불가 판정 전 destroy()"
  // 시나리오에서 정리 신호가 전혀 나가지 않는 회귀를 이 옵션으로 막는다).
  // 미지정이면 no-op.
  notifyPendingChange?: (
    pending: ReadonlyMap<string, PendingLocalPreview>,
  ) => void;
};

// Issue #168 roadmap RD-002 DELTA-02 — 로컬 프리뷰 URL이 문서에서 빠진 뒤
// undo로도 redo로도 복구 불가능해지는 시점을 판정해 정리 신호를 낸다.
// Issue #383부터 추적 단위는 URL이다. 블록이 삭제된 경우뿐 아니라 블록이 남은
// 채 URL만 빠지는 경우(같은 id 재삽입, 프리뷰 덮어쓰기, 프리뷰 적용 undo)와
// 같은 blockId가 미디어가 아닌 타입으로 바뀐 경우도 대상이다.
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
      const notifyPendingChange = this.options.notifyPendingChange;
      // 문서에서 빠졌지만 아직 undo·redo로 복구 가능한지 재판정 대기 중인
      // 로컬 프리뷰(키 = URL) — 확장 인스턴스(= Tiptap Editor 인스턴스, 세션
      // 재구성마다 새로 만들어짐)당 하나. BlockIdExtension의 createId 클로저와
      // 동일한 생애주기(session-scoped, 재구성 시 자동으로 빈 상태에서 시작).
      const pending = new Map<string, PendingLocalPreview>();
      // 단일 슬롯 메모 — 직전 호출의 새 문서가 다음 호출의 옛 문서가 되는
      // 흐름이 보통이라 변경당 문서 순회가 한 번이면 된다.
      let lastDoc: ProseMirrorNode | null = null;
      let lastPreviews = new Map<string, PendingLocalPreview>();
      const previewsOf = (doc: ProseMirrorNode) => {
        if (doc !== lastDoc) {
          lastPreviews = indexLocalPreviewsByUrl(listLocalPreviews(doc));
          lastDoc = doc;
        }
        return lastPreviews;
      };
      // 재진입 가드 — `EditorState.apply(tr)`는 내부적으로
      // `applyTransaction(tr)`의 별칭이라(prosemirror-state 실측,
      // `apply(tr) { return this.applyTransaction(tr).state }`) 이
      // 플러그인 자신을 포함한 모든 플러그인의 `appendTransaction`을 다시
      // 태운다. `isLocalPreviewReachableViaHistory`의 시뮬레이션이
      // `current.apply(tr)`로 undo를 반복 재현하는 동안 이 플러그인의
      // `appendTransaction`이 재귀적으로 재호출돼 같은 `pending` Map을
      // 시뮬레이션 중간 상태 기준으로 잘못 변형시키는 것을 막는다(착수
      // 중 실측 — 재귀 호출이 시뮬레이션 도중 "재등장"으로 오판해 아직
      // 처리 중인 바깥 호출의 `pending`에서 항목을 지워버림). 이
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

            const oldPreviews = previewsOf(oldState.doc);
            const newPreviews = previewsOf(newState.doc);
            if (
              oldPreviews.size === 0 &&
              newPreviews.size === 0 &&
              pending.size === 0
            ) {
              return null;
            }

            let changed = false;

            // 새로 빠진 URL을 재판정 대기열에 추가한다.
            const fresh = new Set<string>();
            for (const [url, entry] of oldPreviews) {
              if (newPreviews.has(url)) continue;
              pending.set(url, entry);
              fresh.add(url);
              changed = true;
            }

            // 실제 undo·redo로 복구된 URL은 대기열에서 뺀다 — 이후 아무리 새
            // undo 이벤트가 쌓여도 이 URL을 다시 정리 대상으로 보지 않는다.
            for (const url of pending.keys()) {
              if (newPreviews.has(url)) {
                pending.delete(url);
                changed = true;
              }
            }

            // 성능 게이트 — `undoDepth`가 바뀌지 않은 트랜잭션은 done
            // 브랜치 eviction이 일어날 수 없다(eviction은 addTransform
            // 경로에서만 발생하고, 그 경로를 타지 않으면 eventCount가
            // 그대로다). 매 키 입력마다 O(depth) 시뮬레이션을 돌리지
            // 않기 위한 근사 게이트다 — 놓치지 않는 것(과소 재판정 없음)만
            // 보장하면 되고, 과도하게 자주 통과해도(병합 편집이 아니라
            // 매번 새 그룹인 경우 등) 정확성에는 영향이 없다(성능
            // 손실뿐). redo 스택이 비는 시점은 undo/redo 직후의 새
            // 편집이라 `undoDepth`가 +1이다(`prosemirror-history`
            // `histTransaction`·`applyTransaction`) — 그래서 이 비교만으로
            // redo 도달 가능성 변화도 놓치지 않는다(Issue #380).
            //
            // 옛 대기 URL은 도달 가능성이 줄어들 수 있는 변경에서만 다시
            // 판정한다(Issue #382). url 확정 뒤에는 모든 업로드 미디어가
            // pending에 들어가, 이벤트를 하나씩 쌓는 편집마다 판정하면
            // 편집 횟수 × 문서 크기만큼 시뮬레이션이 쌓인다. 이벤트를 쌓기만
            // 하는 편집(undoDepth +1, redo 스택 그대로)은 옛 이벤트가 만드는
            // 과거 문서를 바꾸지 않는다. 줄어드는 경우는 eviction
            // (undoDepth 감소)과 redo 스택 소거(redoDepth 감소)다.
            // undoDepth가 2 이상 늘거나 undo·redo가 끼면 보수적으로 다시 판정한다.
            const depthBefore = undoDepth(oldState);
            const depthAfter = undoDepth(newState);
            const onlyAppended =
              depthAfter === depthBefore + 1 &&
              redoDepth(newState) === redoDepth(oldState);
            if (pending.size > 0 && depthAfter !== depthBefore) {
              simulating = true;
              try {
                for (const [url, entry] of pending) {
                  if (onlyAppended && !fresh.has(url)) continue;
                  if (!isLocalPreviewReachableViaHistory(newState, url)) {
                    pending.delete(url);
                    notifyUnreachable(entry.blockId, entry.attrs);
                    changed = true;
                  }
                }
              } finally {
                simulating = false;
              }
            }

            if (changed) notifyPendingChange?.(new Map(pending));
            return null;
          },
        }),
      ];
    },
  });
