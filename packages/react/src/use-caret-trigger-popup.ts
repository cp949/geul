import { useCallback, useEffect, useRef, useState } from "react";

import { readDomCaretBlockId } from "./dom-caret-block.js";
import { handleMenuKeyDown } from "./menu-keyboard.js";
import { useDismissibleOverlay } from "./use-dismissible-overlay.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useStableCallback } from "./use-stable-callback.js";

/** 열린 캐럿 트리거 popup의 상태. 좌표는 담지 않는다(배치는 소비자 몫). */
export type CaretTriggerPopupState = {
  blockId: string;
  query: string;
  highlightedIndex: number;
};

export type UseCaretTriggerPopupOptions = {
  /**
   * 블록 텍스트 전체에서 질의를 뽑는다. `null`이면 트리거가 아니므로 닫는다.
   * 예: 슬래시 메뉴는 `/head`에서 `"head"`를 돌려준다.
   */
  parseQuery: (text: string) => string | null;
  /** 질의에 맞는 후보 수. 후보가 0건이면 Enter 확정을 건너뛴다. */
  getItemCount: (state: { blockId: string; query: string }) => number;
  /**
   * 이동 키를 처리한다. 새 `highlightedIndex`를 돌려주면 키를 막고 그 값으로
   * 바꾼다. `null`이면 이 키를 처리하지 않는다. 1차원 순환인지 격자 clamp인지는
   * 소비자 규칙이다.
   */
  navigate: (key: string, state: CaretTriggerPopupState) => number | null;
  /**
   * Enter 확정. DOM 캐럿이 `state.blockId`의 접힌 캐럿이고 후보가 1건 이상일
   * 때만 부른다. 항목을 적용한 뒤 `close()`와 초점 복귀는 소비자가 한다.
   */
  onActivate: (state: CaretTriggerPopupState) => void;
  /** 바깥 클릭 판정에서 "안"으로 볼 표면 셀렉터. 호출부의 모듈 스코프 상수로 넘긴다. */
  allowSelectors: readonly string[];
};

/**
 * 캐럿 트리거 popup(슬래시 `/`, 이모지 `:`, 멘션 `@`)의 공통 상태 기계.
 *
 * 소유하는 것:
 * - 열림 판정: `selectionchange` 이중 읽기와 `input`, codeBlock 제외.
 * - 재오픈 억제: `dismiss()` 뒤 같은 블록·텍스트면 다시 열지 않는다.
 * - 확정 전 DOM 캐럿 검사와 keydown 배선(`handleMenuKeyDown` 순서).
 * - Escape·바깥 클릭 닫기(`useDismissibleOverlay`).
 *
 * 소유하지 않는 것: 후보 목록, 렌더, 이동 규칙, 배치.
 * 좌표는 `state`에 넣지 않는다. 소비자가 렌더에서 `readCaretBounds`로 읽고,
 * 스크롤처럼 렌더 없이 앵커가 움직이면 `refresh()`로 다시 그리게 한다.
 */
export const useCaretTriggerPopup = ({
  parseQuery,
  getItemCount,
  navigate,
  onActivate,
  allowSelectors,
}: UseCaretTriggerPopupOptions) => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const focusEditor = useFocusEditor(element);

  // 옵션 콜백은 매 렌더 새 함수여도 되게 감싼다. 아래 effect 의존성에서 빠져
  // 리스너를 다시 붙이지 않는다. 이벤트·effect 본문에서만 부른다. `setState`
  // 업데이터 안에서 부르지 않는다(렌더 중 실행돼 낡은 클로저를 볼 수 있다).
  const parse = useStableCallback(parseQuery);
  const countItems = useStableCallback(getItemCount);
  const navigateBy = useStableCallback(navigate);
  const activate = useStableCallback(onActivate);

  const [state, setState] = useState<CaretTriggerPopupState | null>(null);
  // 리스너는 element가 있는 동안 항상 붙여 둔다. 열릴 때만 붙이면 마지막 글자
  // 입력의 setState와 effect 커밋 사이에 도착한 Escape를 놓친다. 그래서 매
  // keydown마다 ref로 최신 상태를 읽는다. 상태 변경은 ref와 state를 함께
  // 갱신해 같은 batch의 연속 키도 최신 값을 본다.
  const stateRef = useRef<CaretTriggerPopupState | null>(null);
  const commit = useCallback((next: CaretTriggerPopupState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // `open(blockId, "")`로 연 블록. "+" 버튼처럼 트리거 문자 없이 열린 popup이
  // 빈 텍스트에서 selectionchange 읽기에 곧바로 닫히지 않게 한다.
  const explicitOpenBlockIdRef = useRef<string | null>(null);
  // Escape는 popup만 닫고 입력된 텍스트는 지우지 않는다. selectionchange는
  // 브라우저가 지연·재발생시킬 수 있어 닫은 직후 같은 텍스트로 다시 와서
  // 재오픈하는 레이스가 있었다(Playwright 병렬 실행에서 간헐 재현). 닫을 때의
  // blockId+텍스트를 기억해 텍스트가 바뀌기 전까지 재오픈하지 않는다.
  const dismissedQueryRef = useRef<{ blockId: string; text: string } | null>(
    null,
  );

  /** 닫고 같은 블록·텍스트의 재오픈을 막는다. 멱등이다. */
  const dismiss = useCallback(() => {
    const context = editor.getCaretBlockContext();
    dismissedQueryRef.current =
      context === null
        ? null
        : { blockId: context.blockId, text: context.text };
    explicitOpenBlockIdRef.current = null;
    commit(null);
  }, [commit, editor]);

  /** 재오픈 방지 기록 없이 닫는다. 항목을 적용한 뒤처럼 같은 텍스트로 다시 열 수 있다. */
  const close = useCallback(() => {
    dismissedQueryRef.current = null;
    explicitOpenBlockIdRef.current = null;
    commit(null);
  }, [commit]);

  /** 해당 블록에서 연다. 질의가 빈 문자열이면 빈 텍스트에서도 열림을 유지한다. */
  const open = useCallback(
    (blockId: string, query: string) => {
      explicitOpenBlockIdRef.current = query.length === 0 ? blockId : null;
      dismissedQueryRef.current = null;
      commit({ blockId, query, highlightedIndex: 0 });
    },
    [commit],
  );

  /** 열려 있으면 새 state 객체를 커밋한다. 좌표를 렌더에서 읽는 소비자가 다시 그리게 한다. */
  const refresh = useCallback(() => {
    const current = stateRef.current;
    if (current !== null) commit({ ...current });
  }, [commit]);

  const setHighlightedIndex = useCallback(
    (highlightedIndex: number) => {
      const current = stateRef.current;
      if (current !== null) commit({ ...current, highlightedIndex });
    },
    [commit],
  );

  useEffect(() => {
    const updateFromCaret = () => {
      const context = editor.getCaretBlockContext();
      if (context === null) {
        explicitOpenBlockIdRef.current = null;
        dismissedQueryRef.current = null;
        commit(null);
        return;
      }

      // CodeBlock source는 트리거 입력이 아니라 그대로 보존할 코드다. 텍스트
      // shape만 보면 paragraph의 트리거와 구분할 수 없으므로 core가 제공하는
      // blockType discriminator를 먼저 확인한다.
      if (context.blockType.type === "codeBlock") {
        explicitOpenBlockIdRef.current = null;
        dismissedQueryRef.current = null;
        commit(null);
        return;
      }

      const dismissed = dismissedQueryRef.current;
      if (
        dismissed !== null &&
        dismissed.blockId === context.blockId &&
        dismissed.text === context.text
      ) {
        return;
      }
      if (dismissed !== null) dismissedQueryRef.current = null;

      const query = parse(context.text);
      const isExplicitEmptyOpen =
        context.text.length === 0 &&
        explicitOpenBlockIdRef.current === context.blockId;
      const resolvedQuery = query ?? (isExplicitEmptyOpen ? "" : null);

      if (resolvedQuery === null) {
        explicitOpenBlockIdRef.current = null;
        commit(null);
        return;
      }

      const current = stateRef.current;
      commit({
        blockId: context.blockId,
        query: resolvedQuery,
        highlightedIndex:
          current !== null && current.blockId === context.blockId
            ? Math.min(
                current.highlightedIndex,
                Math.max(
                  countItems({
                    blockId: context.blockId,
                    query: resolvedQuery,
                  }) - 1,
                  0,
                ),
              )
            : 0,
      });
    };

    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    // selectionchange는 즉시 한 번, 매크로태스크 뒤 한 번 더 읽는다(Issue #229).
    // ProseMirror의 DOMObserver는 state 갱신마다 자기 selectionchange 리스너를
    // 떼었다 다시 붙여 항상 이 리스너보다 뒤에 호출된다. 즉시 읽기는 이동 직전
    // 낡은 state.selection을 본다. 캐럿이 이 블록을 벗어난 이동은 즉시 읽기에서
    // 열린 채 남고 재통지가 없다. 뒤늦은 읽기는 PM flush가 끝난 최신 state를 본다.
    // 즉시 읽기는 남긴다. 기존 동기 반응을 바꾸지 않는다.
    let deferredUpdateTimeout: number | null = null;
    const onSelectionChange = () => {
      updateFromCaret();
      if (ownerWindow === undefined || ownerWindow === null) return;
      if (deferredUpdateTimeout !== null) {
        ownerWindow.clearTimeout(deferredUpdateTimeout);
      }
      deferredUpdateTimeout = ownerWindow.setTimeout(() => {
        deferredUpdateTimeout = null;
        updateFromCaret();
      }, 0);
    };
    ownerDocument?.addEventListener("selectionchange", onSelectionChange);
    ownerDocument?.addEventListener("input", updateFromCaret);
    updateFromCaret();
    return () => {
      ownerDocument?.removeEventListener("selectionchange", onSelectionChange);
      if (deferredUpdateTimeout !== null) {
        ownerWindow?.clearTimeout(deferredUpdateTimeout);
      }
      ownerDocument?.removeEventListener("input", updateFromCaret);
    };
  }, [commit, countItems, editor, element, parse]);

  // 바깥 pointerdown과 Escape LIFO는 useDismissibleOverlay가 소유한다(Issue
  // #233). Escape의 1차 소비자는 effect 등록 race가 없는 상시 element keydown
  // listener(handleMenuKeyDown)다. module은 편집기 안에서 막힌 Escape도 닫으므로
  // 같은 닫힘을 한 번 더 부른다. dismiss는 멱등이다.
  useDismissibleOverlay({
    open: state !== null,
    element,
    allowSelectors,
    onClose: dismiss,
  });

  useEffect(() => {
    if (element === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = stateRef.current;
      if (current === null) return;

      // IME → Escape → Enter 반복 → 수식 키 → 이동·확정 순서와 `preventDefault`는
      // handleMenuKeyDown이 소유한다(Issue #211, #227, #230). 후보가 0건인
      // Enter도 module이 막고 확정만 건너뛴다.
      handleMenuKeyDown(event, {
        escape: () => {
          dismiss();
          focusEditor();
        },
        navigate: (key) => {
          const next = navigateBy(key, current);
          if (next === null) return false;
          commit({ ...current, highlightedIndex: next });
          return true;
        },
        activate: () => {
          // 키보드로 트리거 블록을 떠난 직후의 Enter는 확정하지 않는다
          // (Issue #258). 이동 직후 PM state가 낡아 selectionchange 재읽기도
          // 이 keydown보다 늦을 수 있다. DOM selection이 같은 블록의 접힌
          // 캐럿이 아니면(다른 블록, 범위 선택, 블록 밖) popup만 닫는다.
          // handleMenuKeyDown이 이미 막았으므로 이 Enter는 문서를 바꾸지 않는다.
          if (readDomCaretBlockId(element) !== current.blockId) {
            commit(null);
            return;
          }
          if (countItems(current) >= 1) activate(current);
        },
      });
    };

    element.addEventListener("keydown", handleKeyDown, true);
    return () => element.removeEventListener("keydown", handleKeyDown, true);
  }, [activate, commit, countItems, dismiss, element, focusEditor, navigateBy]);

  return { state, setHighlightedIndex, open, close, dismiss, refresh };
};
