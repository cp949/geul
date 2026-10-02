/**
 * keydown의 `defaultPrevented`를 실제 브라우저에서 읽는 e2e 공용 헬퍼
 * (G-TST-002).
 */
import type { Page } from "@playwright/test";

/** keydown 기록을 담는 window 속성 이름. */
const KEYDOWN_LOG = "__geulKeydownLog";

type KeydownRecord = { key: string; prevented: boolean };

/**
 * 페이지 `document`에 keydown 리스너를 건다. 버블 단계(capture 아님)라
 * 편집기 element capture에 걸린 컴포넌트 핸들러가 끝난 뒤의
 * `defaultPrevented`를 읽는다. capture로 걸면 핸들러보다 먼저 불려 값이
 * 이르다.
 */
export const recordKeydownPrevented = (page: Page) =>
  page.evaluate((logName) => {
    const log: KeydownRecord[] = [];
    (window as unknown as Record<string, unknown>)[logName] = log;
    document.addEventListener("keydown", (event) => {
      log.push({ key: event.key, prevented: event.defaultPrevented });
    });
  }, KEYDOWN_LOG);

/** `recordKeydownPrevented`가 기록한 마지막 keydown을 읽는다. 없으면 null이다. */
export const lastKeydownPrevented = (page: Page) =>
  page.evaluate((logName) => {
    const log = (window as unknown as Record<string, unknown>)[
      logName
    ] as KeydownRecord[];
    return log[log.length - 1] ?? null;
  }, KEYDOWN_LOG);
