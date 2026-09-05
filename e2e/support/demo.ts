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

/**
 * Slash로 이미지를 삽입하고 URL을 채운 뒤, File Panel을 Escape로 닫고
 * 그 블록을 다시 클릭해 선택한다. File Panel의 저장은 자체 상태를 닫지
 * 않는다(계속 "Name: ..."을 보여준다, RD-003 설계) — Media toolbar가
 * 열리려면 그 뒤의 selectionchange/mouseup 같은 실제 이벤트가 필요하므로,
 * 명시적으로 패널을 닫고 다시 클릭해 그 이벤트를 만든다(실제 사용자가
 * 채워진 미디어를 다시 선택하는 것과 같은 조작).
 *
 * 클릭 대상은 `<img>` 자체가 아니라 그 블록의 `[data-be-block-id]`
 * wrapper다 — 테스트 URL은 실제 네트워크에 없어 이미지가 로드되지
 * 않고, 로드 실패한 `<img>`는 브라우저에서 bounding box가 0×0이라(실측)
 * Playwright의 클릭 좌표가 ProseMirror의 클릭 히트테스트에 정확히 맞지
 * 않아 NodeSelection이 서지 않는다. wrapper는 항상 실제 렌더 크기를
 * 가져 클릭이 안정적으로 해당 블록을 선택한다.
 *
 * `media-toolbar.spec.ts`·`media-upload.spec.ts`(RD-003 DELTA-04) 둘 다
 * "url 있는 블록" 전제가 필요해 여기로 옮겼다(G-TST-002).
 */
export const insertFilledImage = async (
  page: Page,
  editable: Locator,
  url = "https://example.com/dir/photo.png",
): Promise<Locator> => {
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();
  await page.getByRole("textbox", { name: "Image URL" }).pressSequentially(url);
  await page.getByRole("button", { name: "Save URL" }).click();
  const image = editable.locator("img");
  await expect(image).toHaveAttribute("src", url);

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();

  // `.filter({ has })`의 has locator는 `editable` 스코프 locator(`image`)를
  // 그대로 넘기면 매칭이 되지 않는다(실측) — `page` 스코프 locator로 넘겨야
  // 한다.
  const wrapper = editable
    .locator("[data-be-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).toBeVisible();
  return image;
};
