import { expect, test } from "@playwright/test";

const openDemo = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  return { editor, editable };
};

test("'/' 입력에 검색 가능한 메뉴를 열고 항목을 고르면 블록을 변환한다 @core", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");

  await expect(menu).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(3);

  await page.getByRole("option", { name: /Heading 1/ }).click();

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("h1")).toHaveText("");
  await expect(editable.locator("p")).toHaveCount(0);
});

test("슬래시 메뉴 선택을 undo 1회로 복원한다", async ({ page }) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("/h2");
  await page.getByRole("option", { name: /Heading 2/ }).click();
  await expect(editable.locator("h2")).toHaveCount(1);

  await page.keyboard.press("Control+z");

  await expect(editable.locator("h2")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("/h2");
});

test("키보드만으로 메뉴 항목을 이동하고 선택한다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/");
  await expect(menu).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("h1")).toHaveCount(1);
});

test("Escape로 메뉴를 닫으면 블록은 그대로 둔다", async ({ page }) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("/head");
  await expect(menu).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("p")).toHaveText("/head");
});

test("hover 시 나타나는 블록 추가 버튼으로 블록을 넣고 그 블록의 메뉴를 연다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  const menu = page.getByRole("listbox", { name: "Slash menu" });

  await editable.click();
  await page.keyboard.type("first block");
  await editable.locator("p").first().hover();

  const addBlockButton = page.getByRole("button", { name: "Add block" });
  await expect(addBlockButton).toBeVisible();
  await addBlockButton.click();

  await expect(menu).toBeVisible();
  await expect(editable.locator("p")).toHaveCount(2);

  await page.getByRole("option", { name: /Text/ }).click();
  await page.keyboard.type("second block");

  await expect(editable.locator("p").first()).toHaveText("first block");
  await expect(editable.locator("p").last()).toHaveText("second block");
});

test("서식 툴바의 select로 블록 종류를 바꿔도 내용을 보존한다", async ({
  page,
}) => {
  const { editable } = await openDemo(page);

  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");

  const blockTypeSelect = page.getByRole("combobox", { name: "Block type" });
  await expect(blockTypeSelect).toHaveValue("paragraph");

  await blockTypeSelect.selectOption("heading-2");

  await expect(editable.locator("h2")).toHaveText("Hello R1");

  await page.keyboard.press("Control+z");
  await expect(editable.locator("h2")).toHaveCount(0);
  await expect(editable.locator("p")).toHaveText("Hello R1");
});

test("문서 하단에서 슬래시 메뉴를 열어도 Table 항목까지 뷰포트 안에서 클릭할 수 있다 (PIT-0011)", async ({
  page,
}) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("first");
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`line ${index}`);
  }
  // 슬래시 질의는 블록 텍스트 전체가 "/..."와 일치해야 인식된다
  // (parseSlashQuery: /^\/(\S*)$/) — "line 29" 뒤에 그냥 "/"를 이어치면
  // 블록 텍스트가 "line 29/"가 되어 매치되지 않는다. Enter로 새 빈
  // 블록을 만든 뒤 그 블록에 "/"를 친다. 긴 문서를 계속 타이핑하는
  // 동안 브라우저가 캐럿을 뷰포트 안으로 계속 스크롤해 따라오므로,
  // 이 시점의 캐럿(=새 빈 블록)은 뷰포트 하단 근처에 있다.
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");

  const menu = page.getByRole("listbox", { name: "Slash menu" });
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  const viewportSize = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewportSize?.height ?? 0) - 4,
  );

  // 클램프가 없으면 Table 항목이 뷰포트 밖으로 나가 클릭이 "element is
  // outside of the viewport"로 타임아웃한다(PIT-0011 실측 시나리오).
  await menu.getByRole("option", { name: /Table/ }).click();
  await expect(editable.locator("table")).toBeVisible();
});
