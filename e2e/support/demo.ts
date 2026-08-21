/**
 * 모든 e2e spec이 공유하는 데모 페이지 진입 절차(#82).
 * spec 12개가 각자 갖고 있던 `openDemo` 사본을 여기로 모은다.
 * 데모 앱의 DOM 지식 — `Editor` textbox 접근성 이름과 contenteditable
 * 선택자 — 은 이 파일에만 둔다.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * 데모 페이지를 열고 편집 가능한 영역이 렌더될 때까지 기다린다.
 * 거의 모든 테스트의 첫 줄이다.
 *
 * `editor`는 접근성 이름으로 잡은 textbox 래퍼고, `editable`은 그 안의
 * ProseMirror contenteditable이다. 키 입력·블록 조회를 하는 대부분의
 * 테스트는 `editable`만 구조분해한다. `editor`는 직렬화 왕복 뒤 문서 내용을
 * `toContainText`로 확인하는 `editor-round-trip.spec.ts`가 쓴다.
 */
export const openDemo = async (page: Page) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

/**
 * 슬래시 메뉴로 기본 3×3 표를 만들고 렌더를 기다린 뒤 표 locator를 준다.
 * 표를 전제로 다른 것을 검증하는 표 spec들의 공통 셋업이다.
 *
 * 데모를 여는 책임은 갖지 않고 `editable`을 받는다 — 이 시그니처를 이미
 * 쓰던 3개 파일(`table-handle`·`table-cell-selection`·
 * `table-keyboard-navigation`)에 맞춰 다수 쪽으로 통일했다(#82). 홀로
 * `openDemo`를 안에서 부르던 `table-format.spec.ts`는 두 함수를 엮는 지역
 * wrapper `openDemoWithTable`로 그 조합을 유지한다.
 */
export const insertTable = async (page: Page, editable: Locator) => {
  await editable.click();
  await page.keyboard.type("/table");
  await expect(page.getByRole("option", { name: /Table/ })).toBeVisible();
  await page.keyboard.press("Enter");
  const table = editable.locator("table");
  await expect(table).toBeVisible();
  return table;
};
