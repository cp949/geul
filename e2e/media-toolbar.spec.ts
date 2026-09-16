/**
 * Media toolbar(RD-004 DELTA-01, Issue #203 RD-004 DELTA-02): `url` 있는
 * 미디어 블록을 선택하면 `⋯` more 트리거가 블록 우상단(topRight)에
 * 나타나고, 빈 블록에는 나타나지 않는다(File Panel과 상호 배타). 트리거를
 * 열면 rename/caption/preview/align/delete/download/replace 항목을 가진
 * more 메뉴가 펼쳐진다 — view 모드의 옛 인라인 control들이 전부 이 메뉴
 * 뒤로 옮겨간 것은 리사이즈로 블록이 아주 작아져도(64px 이미지) toolbar가
 * 다음 블록과 겹치지 않게 하기 위해서다(아래 마지막 테스트). rename/caption
 * 편집과 delete의 undo 1회 복원, download 항목의 href/download 속성,
 * Escape/바깥 클릭에 따른 닫힘과 focus 복원 차이를 실제 Chromium event
 * 순서로 검증한다 — Escape/바깥 클릭 한 번은 메뉴가 열려 있어도 메뉴와
 * toolbar 전체를 함께 닫는다(계층적 dismiss를 두지 않는다, media-toolbar.tsx
 * 주석 참고). Preview 토글(image/video/audio 전용, 슬라이스5 RD-002
 * DELTA-03)의 `<img>`↔`<a>` 실제 DOM 교체·undo·aria-checked·JSON
 * round-trip도 이 파일이 검증한다. 정렬 항목 3개(image/video 전용, Issue
 * #154 MED-009)의 aria-checked 반영·undo 1회 복원·audio/file 미노출도
 * 검증한다 — textAlignment는 아직 편집 DOM에 투영하지 않아(media-block-
 * extension.ts 주석) 시각 스타일이 아닌 aria-checked로 "DOM 반영"을
 * 확인한다. Preview·정렬 항목은 클릭해도 메뉴를 닫지 않는다(여러 상태를
 * 이어서 확인할 수 있어야 한다) — Rename/Caption/Replace/Delete는 각각
 * mode 전환·블록 삭제로 메뉴가 자연히 닫힌다. fixed overlay viewport
 * clamp(RD-002, PIT-0011)도 이 파일이 검증한다.
 */
import { expect, type Page, test } from "@playwright/test";

import { expectOverlayWithinViewport } from "./support/clamp.js";
import { insertFilledImage, openDemo } from "./support/demo.js";
import { beginDrag, dragTo } from "./support/media-resize.js";

/**
 * `⋯` more 트리거를 열어 view 모드의 개별 항목(rename/caption/preview/
 * align/delete/download/replace)에 접근한다(Issue #203 RD-004 DELTA-02).
 * align 항목만 아이콘 전용이라 `getByRole("menuitem", { name: ... })`의
 * name이 여전히 "Align left" 같은 aria-label이다 — 다른 항목은 visible
 * text가 곧 accessible name이다.
 */
const openMoreMenu = (page: Page) =>
  page.getByRole("button", { name: "More media options" }).click();

test("url 있는 이미지를 선택하면 more 트리거가 나타나고 메뉴에 4개 control이 보인다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  await expect(
    page.getByRole("button", { name: "More media options" }),
  ).toBeVisible();
  await openMoreMenu(page);
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Edit caption" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Delete media block" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Download" })).toBeVisible();
});

test("빈 미디어 블록을 선택하면 toolbar가 나타나지 않는다(File Panel 담당)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/video");
  await page.getByRole("option", { name: /^Video/ }).click();

  await expect(page.getByRole("toolbar", { name: "File panel" })).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();
});

test("Rename으로 이름을 바꾸면 alt에 반영되고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);
  await expect(image).toHaveAttribute("alt", "photo.png");

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const nameInput = page.getByRole("textbox", { name: "Image name" });
  await expect(nameInput).toBeFocused();
  await nameInput.fill("renamed.png");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(image).toHaveAttribute("alt", "renamed.png");
  await expect(editable).toBeFocused();

  await page.keyboard.press("Control+z");

  await expect(image).toHaveAttribute("alt", "photo.png");
});

test("Enter로도 이름을 제출한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const nameInput = page.getByRole("textbox", { name: "Image name" });
  await nameInput.fill("renamed.png");
  await nameInput.press("Enter");

  await expect(image).toHaveAttribute("alt", "renamed.png");
});

test("Escape로 이름 편집을 취소하면 원래 값을 유지한 채 toolbar가 남는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Image name" }).fill("discarded.png");
  await page.keyboard.press("Escape");

  await expect(image).toHaveAttribute("alt", "photo.png");
  // Issue #203 RD-004 DELTA-02 — 편집 취소는 view로 돌아갈 뿐 toolbar
  // 자체를 닫지 않는다. view 모드의 신호는 이제 `⋯` 트리거다(Rename은 그
  // 메뉴 뒤에 있어 재확인하려면 메뉴를 다시 열어야 한다).
  await expect(
    page.getByRole("button", { name: "More media options" }),
  ).toBeVisible();
  await expect(editable).toBeFocused();
});

test("Caption을 추가하면 표시되고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);
  const caption = editable.locator("[data-geul-media-caption]");
  await expect(caption).toHaveCount(0);

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "Edit caption" }).click();
  await page.getByRole("textbox", { name: "Image caption" }).fill("풍경 사진");
  await page.getByRole("button", { name: "Save caption" }).click();

  await expect(caption).toHaveText("풍경 사진");
  // caption이 있으면 alt는 caption을 재사용한다(media-block-extension.ts,
  // spec §6.3).
  await expect(image).toHaveAttribute("alt", "풍경 사진");

  await page.keyboard.press("Control+z");

  await expect(caption).toHaveCount(0);
  await expect(image).toHaveAttribute("alt", "photo.png");
});

test("Delete하면 블록이 사라지고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  await expect(editable.locator("img")).toHaveCount(1);

  await openMoreMenu(page);
  await page.getByRole("menuitem", { name: "Delete media block" }).click();

  await expect(editable.locator("img")).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();

  await page.keyboard.press("Control+z");

  await expect(editable.locator("img")).toHaveCount(1);
});

test("Download 항목이 href와 download 속성을 렌더한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  await openMoreMenu(page);
  // Issue #203 RD-004 DELTA-02 — Download는 more 메뉴 안 `role="menuitem"`
  // 항목이다(role="menu" 자식은 링크가 아니라 menuitem이어야 하는 ARIA
  // 계약) — 과거의 role="link"가 아니다.
  const download = page.getByRole("menuitem", { name: "Download" });
  await expect(download).toHaveAttribute(
    "href",
    "https://example.com/dir/photo.png",
  );
  await expect(download).toHaveAttribute("download", "photo.png");
});

test("Escape는 toolbar를 닫고 편집기로 초점을 되돌린다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();
  await expect(editable).toBeFocused();
});

test("바깥 클릭은 toolbar를 닫되 클릭한 컨트롤로 초점을 옮기고 그 컨트롤 자신의 동작도 실행한다(Issue #155)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  const source = page.getByLabel("Document source");
  await expect(source).toHaveValue("");

  const saveJsonButton = page.getByRole("button", { name: "Save JSON" });
  await saveJsonButton.click();

  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();
  await expect(saveJsonButton).toBeFocused();
  // Issue #155 재현 절차 그대로: Media toolbar가 열린 채로 편집기 바깥의
  // Save JSON을 클릭하면, 바깥 클릭의 dismiss뿐 아니라 그 클릭 자신의
  // onClick(saveJson)도 실행돼 Document source가 문서 JSON으로 채워져야
  // 한다 — 수정 전에는 dismiss만 실행되고 onClick이 조용히 무시돼 source가
  // 빈 문자열로 남았다.
  await expect(source).toContainText("https://example.com/dir/photo.png");
});

test("Preview를 끄면 img가 a 링크로 바뀌고 undo 1회로 복원된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);
  // 문서에는 트리거였던 빈 문단·미디어 블록·trailing 문단 3개가 모두
  // `[data-geul-block-id]`를 갖는다(모든 block-level 노드의 공통 속성) —
  // `.first()`는 미디어 블록이 아니라 그 앞 빈 문단을 집을 수 있다(실측).
  // toggle 이후 `img`가 사라져 `filter({ has: img })`로도 더는 못 좁히므로,
  // img가 아직 있는 지금 실제 blockId 값을 읽어 안정된 셀렉터로 고정한다.
  const mediaBlockId = await editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") })
    .getAttribute("data-geul-block-id");
  const wrapper = editable.locator(`[data-geul-block-id="${mediaBlockId}"]`);

  await openMoreMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Preview" }).click();

  await expect(editable.locator("img")).toHaveCount(0);
  const link = wrapper.locator("a");
  await expect(link).toHaveAttribute(
    "href",
    "https://example.com/dir/photo.png",
  );
  await expect(link).toHaveText("photo.png");

  await page.keyboard.press("Control+z");

  await expect(wrapper.locator("a")).toHaveCount(0);
  await expect(image).toHaveAttribute(
    "src",
    "https://example.com/dir/photo.png",
  );
});

test("Preview 항목의 aria-checked가 클릭마다 반전된다", async ({ page }) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  await openMoreMenu(page);
  const previewItem = page.getByRole("menuitemcheckbox", { name: "Preview" });
  await expect(previewItem).toHaveAttribute("aria-checked", "true");

  // Preview는 토글 항목이라 클릭해도 메뉴가 열린 채 남는다(01-계획.md
  // "범위 밖") — 재조회 없이 이어서 클릭한다.
  await previewItem.click();
  await expect(previewItem).toHaveAttribute("aria-checked", "false");

  await previewItem.click();
  await expect(previewItem).toHaveAttribute("aria-checked", "true");
});

test("showPreview:false가 Save/Load JSON round-trip 이후에도 유지된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const source = page.getByLabel("Document source");
  await insertFilledImage(page, editable);

  await openMoreMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Preview" }).click();
  await expect(editable.locator("img")).toHaveCount(0);

  // Media toolbar가 열린 채로 "Save JSON"(편집기 바깥 버튼)을 바로 클릭하지
  // 않는다 — 그 클릭이 바깥-클릭 dismiss와 Save JSON 자신의 onClick을
  // 동시에 수행해야 하는 조합에서 onClick이 조용히 무시되는 기존 결함을
  // 실측했다(RD-002 착수 이전부터 존재, 이 슬라이스가 만든 회귀 아님 —
  // `pending-issues/02.md`). Escape로 먼저 닫아 dismiss와 다음 클릭을
  // 분리한다.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Save JSON" }).click();
  // JSON.stringify(doc, null, 2) pretty-print 형식(콜론 뒤 공백 1개)에
  // 맞춘다 — compact 직렬화가 아니다(demo app의 saveJson 구현).
  await expect(source).toContainText('"showPreview": false');
  const json = await source.inputValue();

  await editable.fill("Temporary text");
  await source.fill(json);
  await page.getByRole("button", { name: "Load JSON" }).click();

  await expect(editable.locator("img")).toHaveCount(0);
  const restoredLink = editable.locator("[data-geul-block-id] a");
  await expect(restoredLink).toHaveAttribute(
    "href",
    "https://example.com/dir/photo.png",
  );
});

test("정렬 항목 클릭 시 aria-checked가 반영되고 undo 1회로 복원된다(Issue #154, MED-009) @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  await openMoreMenu(page);
  const leftItem = page.getByRole("menuitemcheckbox", { name: "Align left" });
  const centerItem = page.getByRole("menuitemcheckbox", {
    name: "Align center",
  });
  const rightItem = page.getByRole("menuitemcheckbox", { name: "Align right" });
  await expect(leftItem).toHaveAttribute("aria-checked", "false");
  await expect(centerItem).toHaveAttribute("aria-checked", "false");
  await expect(rightItem).toHaveAttribute("aria-checked", "false");

  await centerItem.click();

  // 정렬도 Preview와 같은 이유로 클릭해도 메뉴가 열린 채 남는다 —
  // 재조회 없이 이어서 확인한다.
  await expect(centerItem).toHaveAttribute("aria-checked", "true");
  await expect(leftItem).toHaveAttribute("aria-checked", "false");
  await expect(rightItem).toHaveAttribute("aria-checked", "false");

  await page.keyboard.press("Control+z");

  await expect(centerItem).toHaveAttribute("aria-checked", "false");
});

test("이미 활성인 정렬 항목을 다시 클릭하면 해제되고 undo 1회로 복원된다(Issue #154, MED-009)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);
  await openMoreMenu(page);
  const rightItem = page.getByRole("menuitemcheckbox", { name: "Align right" });

  await rightItem.click();
  await expect(rightItem).toHaveAttribute("aria-checked", "true");

  await rightItem.click();

  await expect(rightItem).toHaveAttribute("aria-checked", "false");

  await page.keyboard.press("Control+z");

  await expect(rightItem).toHaveAttribute("aria-checked", "true");
});

test("정렬 값이 Save/Load JSON round-trip 이후에도 유지된다(Issue #154, MED-009) @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const source = page.getByLabel("Document source");
  await insertFilledImage(page, editable);

  await openMoreMenu(page);
  await page.getByRole("menuitemcheckbox", { name: "Align center" }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Align center" }),
  ).toHaveAttribute("aria-checked", "true");

  // Media toolbar가 열린 채로 "Save JSON"(편집기 바깥 버튼)을 바로 클릭하지
  // 않는다 — 위 showPreview round-trip 테스트와 같은 이유(바깥-클릭 dismiss와
  // Save JSON 자신의 onClick이 동시에 수행돼야 하는 조합의 기존 결함,
  // `pending-issues/02.md`). Escape로 먼저 닫는다(메뉴가 열려 있어도
  // Escape 한 번으로 메뉴와 toolbar 전체가 함께 닫힌다).
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Save JSON" }).click();
  await expect(source).toContainText('"textAlignment": "center"');
  const json = await source.inputValue();

  await editable.fill("Temporary text");
  await source.fill(json);
  await page.getByRole("button", { name: "Load JSON" }).click();

  // textAlignment는 편집 DOM에 시각 투영되지 않으므로(media-block-
  // extension.ts 주석) 이미지를 다시 선택해 more 메뉴의 aria-checked로
  // 복원 여부를 확인한다.
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();
  await openMoreMenu(page);
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Align center" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("file 블록에는 more 메뉴에 정렬 항목이 노출되지 않는다(Issue #154, MED-009)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/file");
  await page.getByRole("option", { name: /^File/ }).click();
  await page.getByRole("tab", { name: "Embed" }).click();
  await page
    .getByRole("textbox", { name: "File URL" })
    .fill("https://example.com/dir/doc.pdf");
  await page.getByRole("button", { name: "Save URL" }).click();
  await page.keyboard.press("Escape");

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("a") });
  await wrapper.click();
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).toBeVisible();

  await openMoreMenu(page);
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Align left" }),
  ).toHaveCount(0);
});

test("audio 블록에는 more 메뉴에 정렬 항목이 노출되지 않는다(Issue #154, MED-009)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/audio");
  await page.getByRole("option", { name: /^Audio/ }).click();
  await page.getByRole("tab", { name: "Embed" }).click();
  await page
    .getByRole("textbox", { name: "Audio URL" })
    .fill("https://example.com/dir/track.mp3");
  await page.getByRole("button", { name: "Save URL" }).click();
  await page.keyboard.press("Escape");

  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("audio") });
  await wrapper.click();
  await expect(
    page.getByRole("toolbar", { name: "Media toolbar" }),
  ).toBeVisible();

  await openMoreMenu(page);
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Align left" }),
  ).toHaveCount(0);
  // Preview 토글은 audio 대상이라 여전히 노출된다(슬라이스5 RD-002
  // DELTA-01) — 정렬 항목만 image/video 전용으로 구분됨을 함께 확인한다.
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Preview" }),
  ).toBeVisible();
});

// RD-002 DELTA-01: media-toolbar.tsx도 file-panel.tsx와 같은 결함(전용 scss
// 부재로 position: static)을 공유해 뷰포트 clamp 대상 자체가 없었다
// (media-file-panel.spec.ts의 "문서 하단에서..." 테스트와 같은 패턴,
// PIT-0011).
test("문서 하단에서 미디어를 선택해도 Media Toolbar가 뷰포트 안에서 보인다 (PIT-0011)", async ({
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
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "File panel" }),
  ).not.toBeVisible();

  // insertFilledImage를 그대로 재사용하지 않는다 — 그 헬퍼의 첫 줄
  // `editable.click()`이 문서 중간을 클릭해 캐럿이 하단에서 벗어난다(이
  // 시나리오가 요구하는 "문서 하단" 전제가 깨진다). 여기서는 이미 하단에
  // 캐럿이 있는 채로 이어서 조작한다.
  const wrapper = editable
    .locator("[data-geul-block-id]")
    .filter({ has: page.locator("img") });
  await wrapper.click();

  const toolbar = page.getByRole("toolbar", { name: "Media toolbar" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveCSS("position", "fixed");
  await expectOverlayWithinViewport(toolbar, page);
});

// Issue #203 — 이 fix 전 media-toolbar.tsx의 anchor는 centerBelow(이미지
// 하단 중앙 + 0.5rem 간격)였다. 이미지를 64px까지 좁히면 원본 비율
// (300×180)을 유지한 채 세로 높이도 같이 줄어(64 * 180/300 ≈ 38px) 미디어
// 블록 자체의 세로 공간이 아주 작아진다 — 그 결과 블록 사이 여백만으로는
// toolbar(버튼 8개 한 줄, 세로로 약 36~40px + 0.5rem 간격)를 다음 블록
// 위쪽 밖으로 밀어내지 못하고 다음 블록의 렌더 영역과 실제로 겹쳤다(RED
// 재현). 지금은 anchor를 topRight로 바꾸고 view 모드를 `⋯` 트리거 하나로
// 압축해(01-계획.md) 이 시나리오에서도 겹치지 않아야 한다(완료 조건 1).
// 회귀 픽스처는 media-resize-handle.spec.ts와 동일하게 실제 300×180
// PNG(`resize-photo.png`)를 fulfill해 진짜 픽셀 크기로 리사이즈되게 한다.
test("64px로 리사이즈한 이미지에서 Media toolbar가 다음 블록과 겹치지 않는다(Issue #203)", async ({
  page,
}) => {
  const resizeImageUrl = "https://example.com/dir/resize-photo.png";
  await page.route(resizeImageUrl, (route) =>
    route.fulfill({ path: "e2e/fixtures/resize-photo.png" }),
  );
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable, resizeImageUrl);

  const start = await beginDrag(
    page,
    page.locator('[data-geul-media-resize-handle="right"]'),
  );
  await dragTo(page, start, -9999);
  await page.mouse.up();
  await expect(image).toHaveAttribute("style", /width:\s*64px/);

  const toolbar = page.getByRole("toolbar", { name: "Media toolbar" });
  await expect(toolbar).toBeVisible();

  // insertFilledImage는 슬래시 명령이 캐럿이 있던 그 문단 자체를 미디어
  // 블록으로 바꾼다(별도 빈 문단을 남기지 않는다, 실측) — 문서에는 미디어
  // 블록과 그 바로 다음 trailing 빈 문단 2개만 남는다. 그 다음 블록을
  // "다음 블록"으로 잡는다.
  const blocks = editable.locator("[data-geul-block-id]");
  await expect(blocks).toHaveCount(2);
  const nextBlock = blocks.nth(1);

  // React render·useClampedMenuPosition의 비동기 재계산에 기대 최종
  // geometry로 수렴할 때까지 poll한다(G-TST-001) — 두 사각형이 어느
  // 축으로든 완전히 분리돼 있어야("분리축 정리") 안 겹친 것이다.
  await expect
    .poll(async () => {
      const toolbarBox = await toolbar.boundingBox();
      const nextBox = await nextBlock.boundingBox();
      if (toolbarBox === null || nextBox === null) return null;
      return (
        toolbarBox.y + toolbarBox.height <= nextBox.y ||
        nextBox.y + nextBox.height <= toolbarBox.y ||
        toolbarBox.x + toolbarBox.width <= nextBox.x ||
        nextBox.x + nextBox.width <= toolbarBox.x
      );
    })
    .toBe(true);
});

// 코드리뷰 결함 2 회귀 — `.geul-media-toolbar`(outer 컨테이너)는
// `transform: translateX(-100%)`로 자기 폭만큼 왼쪽으로 밀려 렌더된다(topRight
// anchor). `⋯` 트리거는 이 컨테이너의 첫(왼쪽) 자식이라, 컨테이너 폭이
// 늘어나면 컨테이너의 화면상 우측 끝(anchor 좌표)은 그대로인 채 좌측 끝만
// 더 밀려나 트리거 자신이 화면에서 이동한다 — 트리거의 리사이즈가 아니라
// 형제 노드 삽입이 원인이다. 실제 코드에서는 view 모드에서 more-menu를 연
// 채로 Preview/정렬 커맨드가 실패하면(menu를 안 닫는 의도된 동작)
// `actionError` span이 이 컨테이너 안, 트리거 뒤에 추가돼 폭이 늘어난다
// (실측: 트리거 119px 이동). 이 테스트는 실 Result 실패까지 재현하지
// 않고, 그 span과 완전히 같은 DOM(`<span class="geul-media-toolbar__error">`)
// 을 직접 주입해 같은 조건(컨테이너 폭 변화)을 결정론적으로 만든다.
// moreMenuAnchor가 이 변화를 관측하지 못하면(수정 전) more-menu가 트리거의
// 새 위치를 따라가지 못하고 어긋난 채 남는다(PIT-0011 위반) — 수정
// 후에는 outer 컨테이너의 ResizeObserver가 트리거 rect를 다시 읽어
// more-menu를 재정렬한다(G-UI-001).
test("outer 컨테이너 폭이 늘어나면 more-menu가 트리거의 새 위치로 재정렬된다(코드리뷰 결함 2)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await insertFilledImage(page, editable);

  await openMoreMenu(page);
  const trigger = page.getByRole("button", { name: "More media options" });
  const menu = page.locator(".geul-media-toolbar__more-menu");
  await expect(menu).toBeVisible();

  const triggerBefore = await trigger.boundingBox();
  const menuBefore = await menu.boundingBox();
  if (triggerBefore === null || menuBefore === null) {
    throw new Error("trigger/menu boundingBox missing");
  }
  // topRight anchor라 열린 직후엔 메뉴 우측 끝이 트리거 우측 끝과
  // 일치한다 — 아래 "재정렬" 검증의 전제(둘이 애초에 정렬돼 있었다)를
  // 먼저 확인한다.
  expect(
    Math.abs(
      menuBefore.x + menuBefore.width - (triggerBefore.x + triggerBefore.width),
    ),
  ).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    const container = document.querySelector(".geul-media-toolbar");
    if (container === null) throw new Error("outer container missing");
    const span = document.createElement("span");
    span.className = "geul-media-toolbar__error";
    span.setAttribute("role", "alert");
    span.textContent =
      "폭을 크게 늘리기 위한 매우 긴 에러 메시지 텍스트 자리 표시자 문자열입니다";
    container.appendChild(span);
  });

  // 전제 조건 — 주입한 span이 실제로 트리거를 화면상 옮겼는지 먼저
  // 확인한다(이게 안 움직이면 아래 재정렬 검증 자체가 무의미하다).
  await expect
    .poll(async () => {
      const box = await trigger.boundingBox();
      return box === null ? null : box.x;
    })
    .not.toBe(triggerBefore.x);

  // 수정 검증 — more-menu가 트리거의 새 위치를 따라간다(우측 끝 좌표 실측).
  await expect
    .poll(async () => {
      const triggerAfter = await trigger.boundingBox();
      const menuAfter = await menu.boundingBox();
      if (triggerAfter === null || menuAfter === null) return null;
      return Math.abs(
        menuAfter.x + menuAfter.width - (triggerAfter.x + triggerAfter.width),
      );
    })
    .toBeLessThanOrEqual(1);
});
