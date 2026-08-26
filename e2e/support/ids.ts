/**
 * `createId()`가 발급한 id의 형식을 검증하고 페이지 예외를 수집하는 e2e
 * 공용 헬퍼. `block-handle.spec.ts`(Enter로 블록 분리)와
 * `table-keyboard-navigation.spec.ts`(Tab으로 표 행 추가)가 같은 지식 —
 * isValidDocumentId(model)는 형식·유일성까지 요구하지 않으므로 실제
 * Chrome75/83에서 발급된 id가 RFC4122 v4 형식인지 정규식으로 직접
 * 확인해야 한다는 것과, "예외 없이 실행됨"과 "id가 유효함"은 다른
 * 주장이므로 pageerror를 별도로 수집해야 한다는 것 — 을 각자 갖고
 * 있다가 두 번째 사용처가 생겨 여기로 추출했다(G-TST-002).
 */
import type { Page } from "@playwright/test";

export const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const trackPageErrors = (page: Page): Error[] => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  return pageErrors;
};
