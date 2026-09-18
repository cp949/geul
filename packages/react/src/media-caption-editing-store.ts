import { createEditingStore } from "./create-editing-store.js";

/**
 * `MediaCaptions`(오버레이, caption 값이 있거나 편집 중이거나 hover 중인
 * media 인스턴스를 렌더 대상으로 삼고, hover 시 "캡션 추가" 버튼도 이 안에서
 * 보여준다)가 구독하는 "지금 편집 중인 media caption" 상태다.
 * `code-block-caption-editing-store.ts`와 같은 이유로 모듈 싱글톤으로
 * 뗀다.
 *
 * `createEditingStore`(C4, 두 caption store 공통 메커니즘) 기반 모듈
 * 싱글톤이다. 문서 전체에서 동시에 편집 가능한 media caption은 하나뿐이다 —
 * codeBlock caption과 별개 상태이므로 코드블록 caption과 미디어 caption을
 * 동시에 편집하는 것은 막지 않는다(서로 다른 store).
 *
 * 알려진 단순화: `code-block-caption-editing-store.ts`와 동일 — 모듈
 * 스코프 싱글톤이라 한 페이지에 `EditorProvider`가 둘 이상 동시에 마운트되면
 * 이 상태가 editor 인스턴스 경계를 넘어 공유된다.
 */
type MediaCaptionEditingPayload = {
  blockId: string;
  draft: string;
};
export type MediaCaptionEditingState = MediaCaptionEditingPayload | null;

const store = createEditingStore<MediaCaptionEditingPayload>();

/** 최신 상태를 동기로 읽는다 — commit 핸들러가 stale closure 없이 쓴다. */
export const getMediaCaptionEditingSnapshot = store.getSnapshot;

/** 편집 시작(hover 버튼·캡션 클릭)·커밋·취소 모두 이 setter 하나로 간다. */
export const setMediaCaptionEditing = store.setState;

/** `MediaCaptions`가 렌더에 구독한다. */
export const useMediaCaptionEditing = store.useEditingState;
