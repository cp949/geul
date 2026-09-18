import type { CodeBlock } from "@cp949/geul-core";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useState,
} from "react";

import {
  getCodeBlockCaptionEditingSnapshot,
  setCodeBlockCaptionEditing,
  useCodeBlockCaptionEditing,
} from "./code-block-caption-editing-store.js";
import { readPageRect } from "./table-handle-geometry.js";
import { useCaptionEditingLifecycle } from "./use-caption-editing-lifecycle.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";

type CodeBlockInstance = { blockId: string; rect: DOMRect };

/**
 * 코드블록 좌상단 caption 오버레이(RD-002 DELTA-02, Issue #194; 좌상단 위치와
 * toolbar·more 메뉴 진입점은 Issue #196). 도입 당시(#194)는 Notion 스타일
 * always-visible(빈 값이어도 항상 렌더)이었으나, Issue #195가 값이 있거나
 * 편집 중일 때만 렌더하도록 조건부로 재검토했다(아래 `!isEditing &&
 * committedCaption === ""` 게이트). `TableHandles`/`MediaHandleOverlays`와
 * 달리 hover/selection으로 뽑은 단일 대상 하나만 렌더하지 않는다 — 문서 안
 * **모든** codeBlock 인스턴스를 동시에, hover 게이트 없이 렌더 대상으로
 * 삼는다(RD-002.md "포함 범위"; 이 게이트는 hover 게이트가 아니라 caption
 * 값·편집 상태 게이트다). 이 저장소 최초의 "단일 대상이 아니라 전체 인스턴스"
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
 * `top`은 wrapper rect의 상단 그대로가 아니라 `transform:
 * translateY(calc(-100% - 0.5rem))`로 자기 높이 + 0.5rem만큼 위로 밀어
 * 올린다(단계-3 리뷰 BLOCKER — `<pre>`의 padding-top 아래에서 시작하는 코드
 * 첫 줄과 `top: rect.top` 그대로가 겹쳐 `z-index: 5`인 caption이 그 위에
 * 그려지고, `width: rect.width` 버튼/입력이 코드 첫 줄 클릭을 가로챈다).
 * `-0.5rem`은 코드블록과 caption 사이 여백이다(2026-09-17 사용자 보고 —
 * 최초 구현은 gap 없이 접해 캡션과 코드가 거의 붙어 보였다). 이전 하단
 * 배치(`top: rect.bottom`, gap 없음)와 대칭이었던 최초 설계와 달리 이제는
 * gap을 둔다 — `_formatting-toolbar.scss`/`_block-selection-toolbar.scss`/
 * `_table-selection-toolbar.scss`의 "앵커 위로 뒤집기" 관례와 같은 방향이지만,
 * 그쪽은 가운데 정렬이라 `-50%`도 함께 쓰는 반면 caption은 `left: rect.left`
 * 좌측 정렬·전체 너비라 y축 오프셋만 쓴다.
 *
 * 편집 상태는 전체 문서에서 동시에 하나(`{ blockId, draft } | null`) —
 * media-toolbar의 단일 편집 모드와 동일 가정이다(다중 동시 편집은 이
 * 인터랙션의 요구사항이 아니다). Issue #196부터 이 상태를 컴포넌트 로컬이
 * 아니라 `code-block-caption-editing-store.ts`(useSyncExternalStore 모듈
 * store)로 소유한다 — `CodeBlockLanguageCombobox`의 toolbar 버튼·more 메뉴
 * 항목이 이 컴포넌트의 props/context 없이 같은 편집 상태를 시작할 수 있어야
 * 해서다(그 파일 상단 문서 주석 참고). commit 핸들러는 그 store의
 * `getCodeBlockCaptionEditingSnapshot()`을 직접 읽어 최신 draft를 stale
 * closure 없이 얻는다 — 모듈 변수 자체가 항상 최신값이라 이전의
 * `useMirroredState` ref와 동등한 역할을 대신한다.
 *
 * Enter/blur 커밋, Escape 취소는 이 저장소 첫 blur-commit 패턴이다(조사
 * 확인 — media/link toolbar는 전부 Enter+Save버튼/Escape뿐, onBlur 선례
 * 0건). commit/cancel과 unmount cleanup은 `media-captions.tsx`와 동형이라
 * `use-caption-editing-lifecycle.ts`(01-계획.md
 * "20260918-03-caption-editing-lifecycle")로 통합했다 — Escape가
 * `cancel(event.currentTarget)`을 호출하면 그 안에서 "Escape가 트리거한
 * blur"와 "포커스 이동으로 인한 blur"를 구분하는 내부 플래그를 세운 뒤
 * `element.blur()`로 onBlur(commit)를 트리거하고, 이어서 `useFocusEditor`로
 * 편집기 본문에 초점을 명시적으로 복원한다(단계-3 리뷰 MAJOR — `blur()`만
 * 호출하면 `document.activeElement`가 `body`로 떨어진다). `code-block-
 * language-combobox.tsx`의 `dismissWithFocus`/`closeMoreMenuWithFocus`와
 * 같은 계약 — Escape에만 좁게 적용하고, 클릭 등으로 인한 일반 blur(자연스러운
 * 포커스 이동)는 그대로 둔다.
 */
export const CodeBlockCaptions = () => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const focusEditor = useFocusEditor(element);
  const editing = useCodeBlockCaptionEditing();
  const [, setTick] = useState(0);

  const refresh = useCallback(() => setTick((tick) => tick + 1), []);
  useSelectionRefresh({ element, onUpdate: refresh });

  // commit/cancel/unmount cleanup은 media-captions.tsx와 동형인 상태
  // 머신이라 use-caption-editing-lifecycle.ts로 통합했다(01-계획.md
  // "20260918-03-caption-editing-lifecycle").
  const { commit, cancel } = useCaptionEditingLifecycle({
    getSnapshot: getCodeBlockCaptionEditingSnapshot,
    setEditing: setCodeBlockCaptionEditing,
    applyCommand: (blockId, draft) =>
      editor.commands.setCodeBlockCaption(blockId, draft),
    focusEditor,
  });

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

        // caption이 빈 값이고 편집 중이 아니면 오버레이 자체를 렌더하지
        // 않는다(Issue #195 — #194의 always-visible 설계를 조건부로
        // 재검토). `!isEditing &&`로 좁혀서 #196의 toolbar 버튼·more 메뉴가
        // `setCodeBlockCaptionEditing({ blockId, draft: "" })`로 편집을 열
        // 때는(완료 조건 3) committedCaption이 빈 값이어도 항상 렌더한다.
        if (!isEditing && committedCaption === "") {
          return null;
        }

        const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            cancel(event.currentTarget);
          }
        };
        const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
          setCodeBlockCaptionEditing({ blockId, draft: event.target.value });
        };

        return (
          <div
            key={blockId}
            className="geul-code-block-caption"
            style={{
              position: "absolute",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              transform: "translateY(calc(-100% - 0.5rem))",
            }}
          >
            {isEditing ? (
              <input
                className="geul-code-block-caption__input"
                data-geul-media-caption=""
                aria-label={dictionary.toolbar.codeBlock.captionAriaLabel}
                placeholder={dictionary.toolbar.codeBlock.captionPlaceholder}
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
                  setCodeBlockCaptionEditing({
                    blockId,
                    draft: committedCaption,
                  })
                }
              >
                {/* Issue #195 게이트(위 `if (!isEditing && committedCaption
                    === "") return null;`)가 이 분기에 도달할 때는
                    `!isEditing`이 항상 참이므로 게이트를 통과하려면
                    committedCaption이 반드시 비어있지 않다 — 즉 여기선
                    committedCaption이 항상 값을 갖는다. placeholder 문구는
                    이제 이 버튼이 아니라 위 input의 HTML placeholder
                    attribute(최초 caption 입력 시 힌트)가 담당한다. */}
                {committedCaption}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
};
