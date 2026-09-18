import { useCallback, useEffect, useRef } from "react";

/**
 * media caption(media-captions.tsx)과 codeBlock caption(code-block-
 * captions.tsx) 두 컴포넌트가 거의 동일하게 복제해온 편집 commit/cancel
 * 상태 머신(cancelledRef 가드, dirty 비교 후에만 command 호출, unmount 시
 * store clear)을 통합한 훅이다(arch-review `_tmp/arch-review/03.html` C1,
 * 01-계획.md "20260918-03-caption-editing-lifecycle").
 *
 * 소비처는 각자의 "지금 편집 중인 caption" 모듈 store(media-caption-editing-
 * store.ts / code-block-caption-editing-store.ts, 둘 다 create-editing-
 * store.ts 기반)의 getSnapshot/setState와, 실제 문서에 반영할 core 커맨드를
 * deps로 넘긴다 — 이 훅 자신은 어느 store·어느 커맨드인지 모른다(제네릭 T가
 * store payload 타입, `{ blockId, draft }` 최소 형태만 요구한다).
 *
 * `useSelectionRefresh` 호출, `handleChange`(media의 autoResizeTextarea
 * 포함), Enter/newline 키 처리는 관심사가 달라 이 훅으로 옮기지 않았다
 * (01-계획.md "범위 밖") — 여전히 각 컴포넌트가 소유한다.
 */
export type CaptionEditingLifecycleDeps<
  T extends { blockId: string; draft: string },
> = {
  /** 편집 중인 draft를 stale closure 없이 동기로 읽는다(commit 전용). */
  getSnapshot: () => T | null;
  /** 편집 시작·커밋·취소·unmount cleanup이 공유하는 단일 setter. */
  setEditing: (next: T | null) => void;
  /** dirty(draft !== committedCaption)일 때만 호출되는 실제 반영 커맨드. */
  applyCommand: (blockId: string, draft: string) => void;
  /**
   * cancel이 blur() 직후 편집기 본문으로 초점을 되돌리는 데 쓴다
   * (useFocusEditor의 반환값을 그대로 넘긴다). 원래 두 컴포넌트의 Escape
   * 분기는 `cancelledRef.current = true` → `element.blur()` →
   * `focusEditor()` 세 문장이었다 — 구현 시점 실측(두 컴포넌트 모두
   * `blur()` 바로 다음 줄에서 동기로 `focusEditor()`를 호출하고 있었다)
   * 결과 이 셋을 통째로 훅 안에 넣어 소비처의 Escape 분기가
   * `cancel(event.currentTarget)` 호출 한 줄이 되게 했다(01-계획.md 3절
   * 완료 조건 2 "Escape 분기가 cancel(event.currentTarget) 호출로
   * 대체된다"를 그대로 따름 — 같은 절이 나열한 deps 타입 예시는
   * getSnapshot/setEditing/applyCommand 세 개였지만, 이 완료 조건 문장이
   * 더 구체적이라 이쪽을 따랐다. "계획과 실제 코드가 달랐던 지점" 참고).
   */
  focusEditor: () => void;
};

export type CaptionEditingLifecycle = {
  /**
   * Enter/blur가 호출한다. 직전에 cancel이 호출됐다면(Escape → blur) 아무
   * command도 호출하지 않고 편집 상태만 비운다. 아니면 store의 최신 draft를
   * 동기로 읽어 committedCaption과 다를 때만 applyCommand를 호출한다
   * (불필요한 history 항목 방지).
   */
  commit: (blockId: string, committedCaption: string) => void;
  /**
   * Escape가 호출한다. commit이 "취소된 blur"임을 알 수 있게 플래그를 세운
   * 뒤 element.blur()로 onBlur(commit)를 트리거하고, 이어서 편집기 본문에
   * 초점을 되돌린다.
   */
  cancel: (element: HTMLInputElement | HTMLTextAreaElement) => void;
};

export const useCaptionEditingLifecycle = <
  T extends { blockId: string; draft: string },
>({
  getSnapshot,
  setEditing,
  applyCommand,
  focusEditor,
}: CaptionEditingLifecycleDeps<T>): CaptionEditingLifecycle => {
  const cancelledRef = useRef(false);

  // unmount 시 공유 store를 비운다 — 다음 마운트(다음 테스트, 다음 editor)가
  // 이 인스턴스가 열어 둔 편집 상태를 이어받지 않는다(두 store 문서 주석의
  // "알려진 단순화" 참고 — 원래 각 컴포넌트가 개별로 갖고 있던 cleanup
  // effect를 그대로 옮겼다).
  useEffect(() => {
    return () => setEditing(null);
  }, [setEditing]);

  const commit = useCallback(
    (blockId: string, committedCaption: string) => {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setEditing(null);
        return;
      }
      const current = getSnapshot();
      if (
        current !== null &&
        current.blockId === blockId &&
        current.draft !== committedCaption
      ) {
        applyCommand(blockId, current.draft);
      }
      setEditing(null);
    },
    [getSnapshot, setEditing, applyCommand],
  );

  const cancel = useCallback(
    (element: HTMLInputElement | HTMLTextAreaElement) => {
      cancelledRef.current = true;
      element.blur();
      focusEditor();
    },
    [focusEditor],
  );

  return { commit, cancel };
};
