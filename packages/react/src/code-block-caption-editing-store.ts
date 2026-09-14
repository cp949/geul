import { useSyncExternalStore } from "react";

/**
 * `CodeBlockCaptions`(오버레이, 전체 codeBlock 인스턴스를 always-visible로
 * 렌더)와 `CodeBlockLanguageCombobox`(toolbar 버튼·more 메뉴, hover 단일
 * 인스턴스만 렌더)가 공유하는 "지금 편집 중인 caption" 상태다(Issue #196).
 *
 * 두 컴포넌트는 렌더 대상 자체가 다르다(hover 단일 vs 전체 인스턴스) —
 * `media-toolbar.tsx`처럼 toolbar 버튼과 편집 입력의 상태 기계를 한
 * 컴포넌트 안에 합쳐 소유할 수 없다(01-계획.md "적용 계약과 가이드" 참고,
 * media-toolbar.tsx는 이 저장소의 단일 컴포넌트 상태 기계 선례일 뿐
 * cross-component 공유 선례가 아니다). 이 모듈이 그 공유 지점이다 —
 * toolbar 버튼·more 메뉴 항목은 이 모듈의 setter만 호출해 편집을
 * "요청"하고, 실제 input 렌더링·commit(Enter/blur)·cancel(Escape)은 여전히
 * `code-block-captions.tsx`가 전담한다(입력 요소를 갖는 컴포넌트가 그
 * 입력의 상태 기계도 소유한다 — 책임 분리는 유지, 상태 저장 위치만
 * 컴포넌트 트리 바깥으로 옮긴다).
 *
 * `useSyncExternalStore` 기반 모듈 싱글톤이다(RD-002.md "적용 계약과
 * 가이드" (a) — 이 저장소 첫 cross-component UI 상태 공유 패턴). 문서
 * 전체에서 동시에 편집 가능한 caption은 기존 가정대로 하나뿐이다.
 *
 * 알려진 단순화: 모듈 스코프 싱글톤이라 한 페이지에 `EditorProvider`가
 * 둘 이상 동시에 마운트되면 이 상태가 editor 인스턴스 경계를 넘어
 * 공유된다. `blockId`는 사실상 항상 문서마다 고유해(createId) 실질
 * 충돌은 없지만, `CodeBlockCaptions`가 unmount 시 무조건 이 상태를
 * 비우므로(아래 모듈을 쓰는 쪽 effect) 다른 editor가 그 순간 이 상태를
 * 쓰고 있었다면 그 편집도 함께 날아간다. 이 저장소가 지금 다중 동시
 * `EditorProvider`를 지원 대상으로 두지 않는 것과 같은 수준의
 * 단순화다(재사용 가치가 있으면 `pending-guides/`에 별도 카테고리로
 * 남긴다).
 */
export type CodeBlockCaptionEditingState = {
  blockId: string;
  draft: string;
} | null;

let state: CodeBlockCaptionEditingState = null;
const listeners = new Set<() => void>();

/** 최신 상태를 동기로 읽는다 — commit 핸들러가 stale closure 없이 쓴다. */
export const getCodeBlockCaptionEditingSnapshot =
  (): CodeBlockCaptionEditingState => state;

/** 편집 시작(toolbar·more 메뉴·오버레이 클릭)·커밋·취소 모두 이 setter 하나로 간다. */
export const setCodeBlockCaptionEditing = (
  next: CodeBlockCaptionEditingState,
): void => {
  state = next;
  for (const listener of listeners) listener();
};

const subscribeCodeBlockCaptionEditing = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** `CodeBlockCaptions`가 렌더에 구독한다. */
export const useCodeBlockCaptionEditing = (): CodeBlockCaptionEditingState =>
  useSyncExternalStore(
    subscribeCodeBlockCaptionEditing,
    getCodeBlockCaptionEditingSnapshot,
  );
