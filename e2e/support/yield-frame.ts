/**
 * 클릭·선택 직후 키를 보내는 e2e가 공용으로 쓰는 프레임 양보 헬퍼
 * (G-TST-002, G-EDT-002).
 */
import type { Page } from "@playwright/test";

/**
 * 한 프레임과 한 macrotask를 양보한다. ProseMirror는 selection 변경을
 * `selectionchange` 뒤 비동기로 반영한다. 양보 없이 키를 보내면 편집기가
 * 이전 selection으로 처리한다.
 */
export const yieldFrame = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      ),
  );
