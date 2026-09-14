import type { CodeBlock } from "@cp949/geul-core";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import { readPageRect } from "./table-handle-geometry.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";

type EditingState = { blockId: string; draft: string };

type CodeBlockInstance = { blockId: string; rect: DOMRect };

/**
 * 코드블록 하단 always-visible caption 오버레이(RD-002 DELTA-02, Issue #194).
 * `TableHandles`/`MediaHandleOverlays`와 달리 hover/selection으로 뽑은 단일
 * 대상 하나만 렌더하지 않는다 — 문서 안 **모든** codeBlock 인스턴스를
 * 동시에, hover 게이트 없이 렌더한다(RD-002.md "포함 범위" — Notion 스타일
 * always-visible). 이 저장소 최초의 "단일 대상이 아니라 전체 인스턴스"
 * 오버레이다(RD-002-DELTA-02.md "완료 조건과 검출 변이" 10).
 *
 * codeBlock은 `data-geul-block-id`를 `<pre>` 자신이 아니라 그 부모
 * blockContainer div가 갖는다(실측 확인 — media 4종과 달리 별도 group:
 * "block" 멤버가 아니라 leafBlockContent라 여느 텍스트 블록과 같은 방식으로
 * 감싸인다). `[data-geul-block-id]` 엘리먼트를 순회하며 `pre[data-geul-
 * code-block]` 자식을 가진 것만 codeBlock으로 판정한다(code-block-language-
 * combobox.tsx의 hover 판정과 동일 조건) — 위치도 그 wrapping div의 rect를
 * 쓴다(다른 오버레이 6종과 같은 전제, mount-editor.tsx의 restubGeometry도
 * 이 엘리먼트만 스텁한다).
 *
 * 위치는 `readPageRect`(table-handle-geometry.ts, G-UI-003/ADR-0012)로
 * page-relative 실측한다. 재계산은 `useSelectionRefresh` 하나(selectionchange/
 * mouseup/keyup/scroll/resize)로 충분하다 — `table-handles.tsx`의 추가
 * `useLayoutEffect` 커밋-후 diff 재확인은 드래그 프레임 정확도 전용이라
 * caption엔 과잉이다(`media-handle-overlays.tsx`도 안 쓴다).
 *
 * 편집 상태는 전체 문서에서 동시에 하나(`{ blockId, draft } | null`) —
 * media-toolbar의 단일 편집 모드와 동일 가정이다(다중 동시 편집은 이
 * 인터랙션의 요구사항이 아니다). `useMirroredState`로 관리해 blur
 * 핸들러가 최신 draft를 stale closure 없이 읽는다.
 *
 * Enter/blur 커밋, Escape 취소는 이 저장소 첫 blur-commit 패턴이다(조사
 * 확인 — media/link toolbar는 전부 Enter+Save버튼/Escape뿐, onBlur 선례
 * 0건). Escape가 `input.blur()`를 직접 호출해 onBlur가 뒤이어 실행되므로
 * `cancelledRef`로 "Escape가 트리거한 blur"와 "포커스 이동으로 인한 blur"를
 * 구분한다.
 */
export const CodeBlockCaptions = () => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [editing, editingRef, updateEditing] =
    useMirroredState<EditingState | null>(null);
  const [, setTick] = useState(0);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => setTick((tick) => tick + 1), []);
  useSelectionRefresh({ element, onUpdate: refresh });

  // Escape로 취소했으면 onBlur가 이어서 실행되더라도 커밋하지 않는다.
  // media-toolbar의 applyCaption과 같은 이유로 draft가 committed 값과
  // 같으면 명령을 호출하지 않는다(불필요한 history 항목·onChange 방지).
  const commit = useCallback(
    (blockId: string, committedCaption: string) => {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        updateEditing(null);
        return;
      }
      const current = editingRef.current;
      if (
        current !== null &&
        current.blockId === blockId &&
        current.draft !== committedCaption
      ) {
        editor.commands.setCodeBlockCaption(blockId, current.draft);
      }
      updateEditing(null);
    },
    [editor, editingRef, updateEditing],
  );

  if (element === null) return null;

  // data-geul-block-id는 <pre> 자신이 아니라 그 부모 blockContainer div가
  // 갖는다(실측 확인 — code-block-language-combobox.tsx:619 주석 "codeBlock의
  // [data-geul-block-id] 자신(= <pre>)"은 findBlockElement가 반환하는
  // wrapping div를 가리키는 것이었고 "(= <pre>)" 표현이 부정확했다, 같은
  // DELTA에서 그 주석도 바로잡았다). candidate가 codeBlock인지 판정하는
  // 방식도 code-block-language-combobox.tsx의 hover 판정(`candidate.
  // querySelector("pre[data-geul-code-block]") !== null`)과 동일하게
  // 맞춘다 — [data-geul-block-id] 엘리먼트를 순회하며 그 부모 rect
  // (readPageRect)로 위치를 잰다. pre 자신의 rect가 아니라 이 wrapping
  // div의 rect를 쓰는 이유는 이 div가 실제 block 레이아웃 단위이기
  // 때문이다(다른 오버레이 6종 전부 같은 전제 — G-UI-003/ADR-0012, mount-
  // editor.tsx의 restubGeometry도 이 엘리먼트만 스텁한다).
  const instances: CodeBlockInstance[] = Array.from(
    element.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
  )
    .map((wrapper): CodeBlockInstance | null => {
      if (wrapper.querySelector("pre[data-geul-code-block]") === null) {
        return null;
      }
      const blockId = wrapper.getAttribute("data-geul-block-id");
      return blockId === null ? null : { blockId, rect: readPageRect(wrapper) };
    })
    .filter((instance): instance is CodeBlockInstance => instance !== null);

  return (
    <>
      {instances.map(({ blockId, rect }) => {
        const block = editor.getBlock(blockId);
        // getBlock의 반환 타입 DocumentBlock = Block | CustomBlock에서
        // CustomBlock.type이 넓은 string이라 리터럴 비교만으로는 좁혀지지
        // 않는다 — code-block-language-combobox.tsx의 동일 판단과 같은
        // 근거(CustomBlock은 실제로 "codeBlock" 타입일 수 없다).
        const committedCaption =
          block?.type === "codeBlock"
            ? ((block as CodeBlock).caption ?? "")
            : "";
        const isEditing = editing?.blockId === blockId;

        const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            cancelledRef.current = true;
            event.currentTarget.blur();
          }
        };
        const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
          updateEditing({ blockId, draft: event.target.value });
        };

        return (
          <div
            key={blockId}
            className="geul-code-block-caption"
            style={{
              position: "absolute",
              top: rect.bottom,
              left: rect.left,
              width: rect.width,
            }}
          >
            {isEditing ? (
              <input
                className="geul-code-block-caption__input"
                data-geul-media-caption=""
                aria-label={dictionary.toolbar.codeBlock.captionAriaLabel}
                value={editing.draft}
                autoFocus
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onBlur={() => commit(blockId, committedCaption)}
              />
            ) : (
              <button
                type="button"
                className="geul-code-block-caption__display"
                data-geul-media-caption=""
                onClick={() =>
                  updateEditing({ blockId, draft: committedCaption })
                }
              >
                {committedCaption === ""
                  ? dictionary.toolbar.codeBlock.captionPlaceholder
                  : committedCaption}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
};
