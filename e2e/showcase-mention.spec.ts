/**
 * showcase의 Mention 예제(Issue #210)를 검증한다 — 기존 `customInlineContent`
 * (`EXT-002`) 확장 지점 위에 `@` 트리거 popup을 구현하는 참조 예제다.
 * `mention-picker.tsx`(showcase 로컬 컴포넌트, `packages/react`가 공개하는
 * `useEditorElement`/`useFocusEditor`/`useClampedMenuPosition`/
 * `useDismissOnOutsideOrEscape` 사용)가 실제로 트리거를 인식하고 키보드·
 * 클릭 선택 후 삽입한 노드가 JSON round-trip에서 살아남는지 실제
 * Chromium 이벤트 순서로 확인한다(G-TST-001).
 */
import { expect, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

/**
 * `e2e/support/demo.ts`의 `openDemo`와 동일 분리 — 접근성 이름으로 잡은
 * `Editor` textbox는 wrapper(`class="geul-editor"`, `tabindex="-1"`)이고
 * 실제 focus·caret·contenteditable 속성은 그 안의
 * `[contenteditable="true"]`(PM이 만든 자식)에 있다. `toBeFocused()`/
 * `aria-activedescendant` 단언은 반드시 `editable`(자식) 쪽으로 해야 한다
 * — wrapper로 하면 항상 실패한다(실측 확인).
 */
const openMentionExample = async (page: Page) => {
  await openShowcasePage(page, "/examples/mention");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  const menu = page.getByRole("listbox", { name: "Mention picker" });
  return { editable, menu };
};

test("빈 블록에 '@'를 입력하면 mock 후보 목록(user 3 + document 3)이 열린다", async ({
  page,
}) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@");

  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(6);
});

test("검색어를 좁히면 label 부분 일치로 후보가 줄어든다", async ({ page }) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@ada");

  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(1);
  await expect(menu.getByRole("option")).toHaveText(/Ada Lovelace/);
});

test("키보드만으로 후보를 이동하고 선택하면 mention이 삽입된다", async ({
  page,
}) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@");
  await expect(menu).toBeVisible();

  // 0번(Ada Lovelace) -> ArrowDown 1회 -> 1번(Alan Turing).
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(menu).not.toBeVisible();
  const mention = editable.locator('[data-geul-mention="true"]');
  await expect(mention).toHaveCount(1);
  await expect(mention).toHaveText("@Alan Turing");
  await expect(editable).toBeFocused();
});

test("aria-activedescendant가 강조된 옵션을 가리키고 ArrowDown으로 갱신된다", async ({
  page,
}) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@");
  await expect(menu).toBeVisible();

  const firstOption = page.getByRole("option", { name: /^Ada Lovelace/ });
  await expect(editable).toHaveAttribute(
    "aria-activedescendant",
    await firstOption.evaluate((element) => element.id),
  );

  await page.keyboard.press("ArrowDown");
  const secondOption = page.getByRole("option").nth(1);
  await expect(editable).toHaveAttribute(
    "aria-activedescendant",
    await secondOption.evaluate((element) => element.id),
  );
});

test("클릭으로 후보를 선택해도 mention이 삽입되고 초점이 편집기로 돌아간다", async ({
  page,
}) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@roadmap");
  await expect(menu).toBeVisible();

  await menu.getByRole("option", { name: /Product roadmap/ }).click();

  await expect(menu).not.toBeVisible();
  const mention = editable.locator('[data-geul-mention="true"]');
  await expect(mention).toHaveText("@Product roadmap");
  await expect(editable).toBeFocused();
});

// 완료 조건 4 — EmojiPicker/SlashMenu와 동일 계약: Escape는 UI만 닫고
// 입력한 "@query" 텍스트는 그대로 둔다.
test("Escape는 목록만 닫고 입력한 '@query' 텍스트는 보존한다", async ({
  page,
}) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@ada");
  await expect(menu).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(menu).not.toBeVisible();
  await expect(editable.locator("p")).toHaveText("@ada");
  await expect(editable).toBeFocused();
});

test("mention 팝업 바깥을 클릭하면 팝업을 닫고 클릭한 컨트롤로 초점을 옮긴다(ADR-0013)", async ({
  page,
}) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@ada");
  await expect(menu).toBeVisible();

  const exportButton = page.getByRole("button", { name: "Export JSON" });
  await exportButton.click();

  await expect(menu).toHaveCount(0);
  await expect(exportButton).toBeFocused();
});

test("mention 삽입 후 Export JSON에 targetType/targetId/label이 남는다(round-trip)", async ({
  page,
}) => {
  const { editable, menu } = await openMentionExample(page);

  await editable.click();
  await page.keyboard.type("@grace");
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: /Grace Hopper/ }).click();

  await page.getByRole("button", { name: "Export JSON" }).click();
  const json = await page.getByLabel("Document JSON").inputValue();
  const parsed = JSON.parse(json) as {
    blocks: { content?: unknown[] }[];
  };
  const content = parsed.blocks[0]?.content ?? [];
  const mentionItem = content.find(
    (item): item is { type: string; customType: string; props: unknown } =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "custom",
  );

  expect(mentionItem).toMatchObject({
    type: "custom",
    customType: "mention",
    props: {
      targetType: "user",
      targetId: "user-grace-hopper",
      label: "Grace Hopper",
    },
  });
});
