/**
 * File Panel(RD-003 DELTA-01): url 없는 미디어 블록 생성 직후 자동 열림,
 * URL 제출 시 이름 초깃값(마지막 path segment) 추출·표시, 거부된 URL의
 * 인라인 메시지, Escape/바깥 클릭에 따른 닫힘과 focus 복원 차이, 삽입의
 * undo 1회 복원, Media Toolbar와의 상호 배타, fixed overlay viewport
 * clamp(PIT-0011)를 실제 Chromium event 순서로 검증한다. 데모 앱은
 * uploadFile을 항상 등록하므로(app.tsx demoUploadFile) 기본 활성 탭은
 * Upload다(2026-09-12, Notion parity — RD-003-DELTA-02 "결정 2" 번복) —
 * Embed(URL) 흐름을 검증하는 테스트는 먼저 Embed 탭으로 전환한다.
 */
import { expect, test } from "@playwright/test";

import { expectOverlayWithinViewport } from "./support/clamp.js";
import { openDemo } from "./support/demo.js";

test("Slash로 이미지를 삽입하면 File Panel이 자동으로 열리고 URL 제출로 이름 초깃값을 추출한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();

  const panel = page.getByRole("toolbar", { name: "File panel" });
  await expect(panel).toBeVisible();
  await page.getByRole("tab", { name: "Embed" }).click();
  const urlInput = page.getByRole("textbox", { name: "Image URL" });
  await expect(urlInput).toBeFocused();

  await urlInput.pressSequentially("https://example.com/dir/photo.png");
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(editable.locator("img")).toHaveAttribute(
    "src",
    "https://example.com/dir/photo.png",
  );
  await expect(page.getByText("Name: photo.png")).toBeVisible();
});

test("Slash로 이미지를 삽입하면 File Panel이 기본으로 Upload 탭을 연다(Notion parity, 2026-09-12)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();

  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Upload" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Image file")).toBeFocused();
  await expect(page.getByRole("button", { name: "Upload file" })).toBeVisible();
});

test("이름 추출에 실패하면 패널에 URL 자체를 표시한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/file");
  await page.getByRole("option", { name: /^File/ }).click();

  await page.getByRole("tab", { name: "Embed" }).click();
  await page
    .getByRole("textbox", { name: "File URL" })
    .fill("https://example.com");
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(editable.locator("a")).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await expect(page.getByText("Name: https://example.com")).toBeVisible();
});

test("URL 제출 직후 File Panel을 닫아도 같은 블록의 Media Toolbar를 다시 열 수 있다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 25; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();

  await page.getByRole("tab", { name: "Embed" }).click();
  await page
    .getByRole("textbox", { name: "Image URL" })
    .pressSequentially("https://example.com/dir/photo.png");
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();
  await expect(page.getByText("Name: photo.png")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();

  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).toBeVisible();
});

test("허용되지 않는 URL이면 거부 메시지를 표시하고 문서를 그대로 둔다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/video");
  await page.getByRole("option", { name: /^Video/ }).click();

  await page.getByRole("tab", { name: "Embed" }).click();
  await page
    .getByRole("textbox", { name: "Video URL" })
    .fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save URL" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(editable.locator("video")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Video URL" })).toBeVisible();
});

test("Close 버튼으로 URL 없이 패널을 닫아도 남은 빈 미디어 블록을 마우스로 다시 찾아 지울 수 있다(QA-090)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();
  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();

  // Close는 패널만 닫고 블록은 의도적으로 남긴다(spec — 빈 미디어 블록은
  // 삽입 즉시 이미 유효한 상태). 수정 전에는 이 시점부터 블록이 height:0
  // ·자식 0개가 돼 마우스 클릭이 인접 블록을 대신 히트해 영원히 재접근할
  // 수 없었다(실측 확인).
  await page.getByRole("button", { name: "Close file panel" }).click();
  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();

  const emptyBlock = editable.locator('[data-geul-media-empty="image"]');
  await expect(emptyBlock).toBeVisible();

  // 마우스만으로 블록 거터 메뉴를 열어 삭제한다(block-handle.spec.ts와
  // 같은 패턴) — hover가 실제로 이 블록 위에서 거터 아이콘을 띄우는지까지
  // 검증한다(단순 locator 액션은 실제 hit-test 실패를 가려버릴 수 있다).
  // **알려진 별도 결함(이 수정 범위 밖)**: 클릭으로 이 블록을 선택한 뒤
  // Backspace/Delete 키를 누르는 경로는 여전히 안 먹는다 — 자식 0개인 atom
  // 노드의 NodeSelection을 `resolveSelectionAwareState`(selection-aware-state.ts)
  // 가 native DOM selection과 재동기화할 때 `view.posAtDOM` 결과가 live
  // selection의 anchor/head와 어긋나 "stale"로 오판되고,
  // `block-join-extension.ts`의 `joinBackwardAtBlockStart`가 방어적으로
  // 키만 삼켜 삭제를 안 한다(실측 확인 — 채워진 미디어 블록은 자식이 있어
  // 이 오판이 안 남). 거터 메뉴 Delete는 `blockId` 기반 커맨드라 이 경로를
  // 타지 않아 정상 동작한다.
  await emptyBlock.hover();
  await page.getByRole("button", { name: "Drag to reorder" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(emptyBlock).toHaveCount(0);
});

test("Escape는 패널을 닫고 편집기로 초점을 되돌린다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/audio");
  await page.getByRole("option", { name: /^Audio/ }).click();
  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();
  await expect(editable).toBeFocused();
});

// ADR-0013 회귀(Issue #155): File panel도 media-toolbar와 같은 CSS 결함
// (전용 scss 부재로 position: static)을 공유하지만, 이 시나리오(URL
// 미제출 상태의 빈 패널)는 페이지가 스크롤을 필요로 할 만큼 콘텐츠가
// 늘지 않아 dismiss로 인한 layout 변경이 hit-test를 어긋나게 하는 조건이
// 성립하지 않는다 — 원인 수정을 되돌려도 이 e2e는 계속 GREEN이다(실측
// 확인). Issue #155가 이 시나리오에서 재현되는 것은 아니지만, ADR-0013이
// 요구하는 "바깥 클릭은 예외 없이 dismiss와 클릭 대상의 동작을 함께
// 실행한다" 계약을 이 소비처에서도 고정한다.
test("바깥 클릭은 패널을 닫되 클릭한 컨트롤로 초점을 옮기고 그 컨트롤 자신의 동작도 실행한다(ADR-0013)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/file");
  await page.getByRole("option", { name: /^File/ }).click();
  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();
  const source = page.getByLabel("Document source");
  await expect(source).toHaveValue("");

  const saveJsonButton = page.getByRole("button", { name: "Save JSON" });
  await saveJsonButton.click();

  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();
  await expect(saveJsonButton).toBeFocused();
  await expect(source).not.toHaveValue("");
});

test("삽입을 undo 1회로 복원한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/video");
  await page.getByRole("option", { name: /^Video/ }).click();
  // QA-090 수정(_editor.scss `[data-geul-media-empty]`) 이후로는 빈
  // 미디어 블록도 실제 높이를 가진 점선 슬롯이라 toBeVisible() 단언이
  // 가능하다 — 존재 여부만 보던 이전 toHaveCount(1)보다 강한 계약이다.
  await expect(
    editable.locator('[data-geul-media-empty="video"]'),
  ).toBeVisible();
  // File Panel이 URL 입력에 초점을 가져가는 effect까지 끝난 뒤에
  // Escape를 눌러야 한다 — media 블록 attach와 File Panel open은 서로
  // 다른 렌더 사이클이라, 이 대기 없이 곧바로 Escape를 누르면 아직
  // 열리지 않은 패널의 리스너가 붙기 전이라 Escape가 아무 효과를 못
  // 내는 레이스가 있다(실측).
  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();

  // File Panel이 열리며 URL 입력에 초점을 가져간다 — 그 상태로 Ctrl+Z를
  // 누르면 입력 필드의 네이티브 undo(빈 동작)만 소비하고 ProseMirror
  // undo 키맵에는 닿지 않는다. Escape로 패널을 닫아 초점을 편집기로
  // 되돌린 뒤에야 undo가 실제로 편집기 히스토리에 닿는다.
  await page.keyboard.press("Escape");
  await expect(editable).toBeFocused();

  await page.keyboard.press("Control+z");

  await expect(editable.locator('[data-geul-media-empty="video"]')).toHaveCount(
    0,
  );
  await expect(editable.locator("p")).toHaveText("/video");
});

test("문서 하단에서 미디어를 삽입해도 File Panel이 뷰포트 안에서 보인다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 25; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");

  await page.getByRole("option", { name: /^Image/ }).click();

  const panel = page.getByRole("toolbar", { name: "File panel" });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS("position", "fixed");
  await expectOverlayWithinViewport(panel, page);
  await page.getByRole("tab", { name: "Embed" }).click();
  await expect(page.getByRole("textbox", { name: "Image URL" })).toBeVisible();
});
