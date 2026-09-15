// previewWidth를 인라인 width style 문자열로 직렬화하는 규칙 하나를
// export-html.ts(문서 생성)와 import-warnings.ts(raw warning 정확도 판정)가
// 공유한다 — text-block-props-style.ts와 정확히 같은 이유(Issue #179와
// 같은 위험, 2026-09-16 media caption 폭 맞춤 그릴링 Q7). 두 곳에 같은
// 규칙을 따로 구현하면 "export가 낸 style"과 "import가 own-echo로 인정하는
// style"이 갈려 export-html.ts 자신이 낸 값을 재-import할 때조차 스퓨리어스
// UNSAFE_ATTRIBUTE_REMOVED 경고가 생긴다.
export const mediaPreviewWidthStyle = (
  previewWidth: number,
): string | undefined =>
  Number.isFinite(previewWidth) && previewWidth > 0
    ? `width: ${previewWidth}px`
    : undefined;
