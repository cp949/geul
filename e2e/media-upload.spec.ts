/**
 * Media upload(RD-003 DELTA-04): File Panel Upload 탭(DELTA-02)과 Media
 * Toolbar Replace(DELTA-03)를 실제 Chromium에서 구동해 성공/실패/취소
 * 3분기, 업로드 중 undo에 의한 경합 가드, 교체 실패 시 기존 값 유지를
 * 검증한다. `apps/demo`의 mock uploadFile(app.tsx)은 파일명에 "reject"가
 * 있으면 실패, 그 외엔 성공으로 결정적으로 분기하고 300ms 지연 후
 * resolve한다(DEMO_UPLOAD_DELAY_MS) — 이 지연이 loading 관찰과 취소·undo
 * 조작을 끼워 넣을 시간을 준다.
 */
import { expect, type Locator, test } from "@playwright/test";

import { insertFilledImage, openDemo } from "./support/demo.js";

/**
 * 파일 선택 input에 `e2e/fixtures/<name>`을 넣는다 — 데모의 mock
 * uploadFile(app.tsx)이 파일명으로 성공/실패를 분기하므로 내용은 의미가
 * 없다(고정 텍스트). 상대 경로는 Playwright가 현재 작업 디렉터리(repo
 * 루트, `pnpm test:e2e` 실행 기준) 기준으로 그대로 해석한다 — `node:path`
 * 조립이 필요 없다. 인라인 `{name, mimeType, buffer}` 대신 실제 fixture
 * 경로를 쓰는 이유: `buffer: Buffer`가 `@types/node` 전역을 요구하는데
 * `e2e/tsconfig.json`이 `types: []`로 이를 배제한다(실측 — `Cannot find
 * name 'Buffer'`/`'node:buffer'` 둘 다 같은 원인으로 실패).
 */
const chooseFile = (fileInput: Locator, name: string) =>
  fileInput.setInputFiles(`e2e/fixtures/${name}`);

test("Upload 탭에서 파일을 선택하면 성공 시 url이 반영된다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();

  await page.getByRole("tab", { name: "Upload" }).click();
  await chooseFile(page.getByLabel("Image file"), "photo.png");

  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("status")).not.toBeVisible();
  await expect(editable.locator("img")).toHaveAttribute(
    "src",
    "https://example.com/uploads/photo.png",
  );
});

test("업로드가 실패하면 에러와 Retry를 보여주고, Retry는 다시 로딩을 보여준다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();

  await page.getByRole("tab", { name: "Upload" }).click();
  await chooseFile(page.getByLabel("Image file"), "reject-me.png");

  await expect(page.getByRole("alert")).toHaveText(
    "Demo upload rejected: reject-me.png",
  );
  await expect(editable.locator("img")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Demo upload rejected: reject-me.png",
  );
});

test("업로드 중 Cancel을 클릭하면 취소되어 이미지가 생기지 않는다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();

  await page.getByRole("tab", { name: "Upload" }).click();
  await chooseFile(page.getByLabel("Image file"), "photo.png");
  await expect(page.getByRole("status")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("status")).not.toBeVisible();
  await expect(page.getByRole("alert")).not.toBeVisible();
  // 취소 뒤에도 데모의 300ms 지연이 실제로 지난 뒤에야 core가 완전히
  // 해소된다 — 지연이 지나도 여전히 이미지가 생기지 않아야 취소가
  // 성공과의 경합(늦게 도착하는 성공 결과)을 실제로 이겼다고 볼 수 있다.
  await page.waitForTimeout(400);
  await expect(editable.locator("img")).toHaveCount(0);
});

test("업로드 중 블록을 undo로 지우면 완료 결과를 무시한다(경합 가드)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();
  await expect(editable.locator('[data-be-media-empty="image"]')).toHaveCount(
    1,
  );

  await page.getByRole("tab", { name: "Upload" }).click();
  await chooseFile(page.getByLabel("Image file"), "photo.png");
  await expect(page.getByRole("status")).toBeVisible();

  // File Panel을 닫고(업로드 자체는 core session에서 계속 진행 —
  // media-file-panel.spec.ts "삽입을 undo 1회로 복원한다"와 같은 이유로
  // Escape 먼저) 곧바로 undo해 블록을 통째로 지운다. 결과가 도착할
  // 시점엔 대상 블록이 이미 없어 core의 stillExists 가드가 적용을
  // 무시해야 한다.
  await page.keyboard.press("Escape");
  await expect(editable).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(editable.locator('[data-be-media-empty="image"]')).toHaveCount(
    0,
  );

  // 데모의 300ms 지연이 지나 core가 완료 결과를 실제로 받은 뒤에도
  // 문서에 아무 흔적이 남지 않아야 한다.
  await page.waitForTimeout(400);
  await expect(editable.locator("img")).toHaveCount(0);
  // 경합 가드가 세션을 망가뜨리지 않았는지 — 이어서 타이핑이 정상 동작.
  await editable.click();
  await page.keyboard.type("still alive");
  await expect(editable).toContainText("still alive");
});

test("Replace 실패 시 alert를 보여주고 기존 url을 유지한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);

  await page.getByRole("button", { name: "Replace file" }).click();
  await chooseFile(page.getByLabel("Image file"), "reject-me.png");

  await expect(page.getByRole("alert")).toHaveText(
    "Demo upload rejected: reject-me.png",
  );
  await expect(image).toHaveAttribute(
    "src",
    "https://example.com/dir/photo.png",
  );
});

test("Replace 성공 시 url이 갱신되고 view로 돌아간다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);

  await page.getByRole("button", { name: "Replace file" }).click();
  await chooseFile(page.getByLabel("Image file"), "new.png");

  await expect(image).toHaveAttribute(
    "src",
    "https://example.com/uploads/new.png",
  );
  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
});
