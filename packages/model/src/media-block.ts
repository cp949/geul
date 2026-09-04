/**
 * 미디어 블록(image/video) previewWidth 검증 정책이다. spec §5.3 — model은
 * 양의 유한수만 검증하고 상한을 두지 않는다(컨테이너 폭은 레이아웃
 * 종속이라 문서 불변식이 아니다 — 실제 clamp는 react 리사이즈 핸들 UI가
 * 담당한다). 표 열 너비 검증(정수·상한 강제, table-grid-validation.ts)과는
 * 다른 계약이라 그 헬퍼를 재사용하지 않는다(RD-001.md "## 결정" 참고).
 */
export const isValidMediaPreviewWidth = (value: number): boolean =>
  Number.isFinite(value) && value > 0;
