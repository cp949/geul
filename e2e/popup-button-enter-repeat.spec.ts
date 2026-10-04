/**
 * 팝업 안 버튼에서 Enter를 누른 채 있어도 repeat Enter가 편집기로 새지 않는지
 * 실제 브라우저에서 확인한다(Issue #248, #228·#230과 같은 메커니즘).
 *
 * 브라우저가 최하위 증명 계층인 이유(ADR-0007):
 * - 네이티브 입력의 기본 동작. 버튼은 keydown Enter마다 click을 낸다. 첫 Enter의
 *   click이 포커스를 편집기로 돌려 보내면, 키를 떼기 전의 repeat Enter가 편집기에
 *   닿아 블록을 나눈다. jsdom은 키 입력을 요소에 라우팅하지 않고 repeat를
 *   만들지 못한다.
 * 위임 함수의 판정과 문서 capture 억제 배선은 단위 테스트
 * (popup-button-keydown.test.ts)가 소유한다.
 *
 * 구성:
 * - 이슈 표 8행을 매개변수화한다. 각 행은 대상 버튼에 포커스를 두고 Enter를
 *   누른 채 repeat를 보낸 뒤, 블록 수와 편집기 DOM이 첫 Enter 직후와 같고
 *   첫 Enter의 효과가 그대로 적용됐는지 본다.
 * - 대조(링크 URL 입력창)와 상시 툴바(mark 버튼)는 이번 변경이 바꾸지 않는
 *   동작을 고정한다.
 *
 * 편집기 문서는 브라우저에서 직접 읽을 수 없어 편집기 DOM(`innerHTML`)으로
 * 동일성을 본다. 블록 id와 내용이 DOM에 그대로 나오므로 블록이 생기면 달라진다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { insertFilledImage, openDemo } from "./support/demo.js";
import { openShowcasePage } from "./support/showcase.js";
import { yieldFrame } from "./support/yield-frame.js";

/** 첫 Enter 뒤에 더 보내는 repeat keydown 수. */
const REPEAT_COUNT = 4;

/** 편집기의 블록 수. 분할이 일어나면 늘어난다. */
const blockCount = (page: Page) => page.locator("[data-geul-block-id]").count();

/** 같은 키를 떼지 않고 다시 누른다. `repeat`가 true인 keydown이 간다. */
const sendRepeats = async (page: Page) => {
  for (let i = 0; i < REPEAT_COUNT; i += 1) {
    await page.keyboard.down("Enter");
    await yieldFrame(page);
  }
};

/** 한 행이 준비한 팝업. `target`이 포커스를 받아 Enter를 받는 버튼이다. */
type PopupRow = {
  editable: Locator;
  target: Locator;
  /** 첫 Enter의 효과가 적용됐는지 단언한다. 반복 뒤에도 같은 단언이 성립한다. */
  expectApplied: () => Promise<void>;
};

/** 데모를 열고 "Hello R1"을 쓴 뒤 전체 선택해 링크 편집 모드까지 연다. */
const openLinkEditing = async (page: Page) => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("Hello R1");
  await page.keyboard.press("Control+A");
  await page.getByRole("button", { name: "Add link" }).click();
  const input = page.getByRole("textbox", { name: "Link URL" });
  await input.fill("https://example.com");
  return { editable, input };
};

/** 링크 툴바 편집 모드의 버튼 행. */
const linkEditingRow =
  (buttonName: string, applied: (editable: Locator) => Promise<void>) =>
  async (page: Page): Promise<PopupRow> => {
    const { editable } = await openLinkEditing(page);
    return {
      editable,
      target: page.getByRole("button", { name: buttonName }),
      expectApplied: async () => {
        await expect(
          page.getByRole("textbox", { name: "Link URL" }),
        ).toHaveCount(0);
        await applied(editable);
      },
    };
  };

/** 링크를 만든 뒤 링크를 눌러 view 모드 툴바를 연다. */
const openLinkView = async (page: Page): Promise<PopupRow> => {
  const { editable } = await openLinkEditing(page);
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(editable.locator("a")).toHaveText("Hello R1");
  await editable.locator("a").click();
  const target = page.getByRole("button", { name: "Remove link" });
  await expect(target).toBeVisible();
  return {
    editable,
    target,
    expectApplied: async () => {
      await expect(editable.locator("a")).toHaveCount(0);
      await expect(editable).toHaveText("Hello R1");
    },
  };
};

/** 이미지 블록을 만들어 파일 패널을 연다. */
const openFilePanel = async (page: Page): Promise<PopupRow> => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/image");
  await page.getByRole("option", { name: /^Image/ }).click();
  const panel = page.getByRole("toolbar", { name: "File panel" });
  await expect(panel).toBeVisible();
  return {
    editable,
    target: page.getByRole("button", { name: "Close file panel" }),
    expectApplied: () => expect(panel).toBeHidden(),
  };
};

/** 이미지를 채우고 more 메뉴의 Rename으로 이름 편집 모드를 연다. */
const openMediaNameEditing = async (
  page: Page,
  buttonName: string,
  applied: (image: Locator) => Promise<void>,
): Promise<PopupRow> => {
  const { editable } = await openDemo(page);
  const image = await insertFilledImage(page, editable);
  await expect(image).toHaveAttribute("alt", "photo.png");
  await page.getByRole("button", { name: "More media options" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const nameInput = page.getByRole("textbox", { name: "Image name" });
  await expect(nameInput).toBeFocused();
  await nameInput.fill("renamed.png");
  return {
    editable,
    target: page.getByRole("button", { name: buttonName }),
    expectApplied: async () => {
      await expect(
        page.getByRole("textbox", { name: "Image name" }),
      ).toHaveCount(0);
      await applied(image);
    },
  };
};

/** 코드 블록을 만들고 언어 popover에서 Python 옵션을 띄운다. */
const openCodeLanguageOption = async (page: Page): Promise<PopupRow> => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();
  await expect(editable.locator("pre[data-geul-code-block]")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Code language" });
  await trigger.click();
  await page
    .getByRole("combobox", { name: "Search for a language" })
    .fill("py");
  const python = page.getByRole("option", { name: /Python/ });
  await expect(python).toBeVisible();
  return {
    editable,
    target: python,
    expectApplied: () => expect(trigger).toHaveText("Python"),
  };
};

/** callout을 만들고 아이콘 선택기를 열어 첫 옵션을 대상으로 잡는다. */
const openCalloutIconOption = async (page: Page): Promise<PopupRow> => {
  const { editable } = await openDemo(page);
  await editable.click();
  await page.keyboard.type("/callout");
  await page.getByRole("option", { name: "Callout" }).click();
  const callout = editable.locator("[data-geul-callout]");
  await callout.hover();
  await page.getByRole("button", { name: "Change callout icon" }).click();
  const picker = page.getByRole("listbox", { name: "Callout icon picker" });
  await expect(picker).toBeVisible();
  const option = picker.getByRole("option").first();
  const char = (await option.textContent()) ?? "";
  expect(char).not.toBe("");
  return {
    editable,
    target: option,
    expectApplied: async () => {
      await expect(picker).toBeHidden();
      await expect(callout).toHaveAttribute("data-geul-icon", char);
    },
  };
};

const ROWS: readonly (readonly [string, (page: Page) => Promise<PopupRow>])[] =
  [
    [
      "링크 툴바 Save link",
      linkEditingRow("Save link", (editable) =>
        expect(editable.locator("a")).toHaveAttribute(
          "href",
          "https://example.com",
        ),
      ),
    ],
    [
      "링크 툴바 Cancel",
      linkEditingRow("Cancel link edit", async (editable) => {
        await expect(editable.locator("a")).toHaveCount(0);
        await expect(editable).toHaveText("Hello R1");
      }),
    ],
    ["링크 툴바 view 모드 Remove link", openLinkView],
    ["파일 패널 Close", openFilePanel],
    [
      "미디어 툴바 Save name",
      (page) =>
        openMediaNameEditing(page, "Save name", (image) =>
          expect(image).toHaveAttribute("alt", "renamed.png"),
        ),
    ],
    [
      "미디어 툴바 Cancel",
      (page) =>
        openMediaNameEditing(page, "Cancel", (image) =>
          expect(image).toHaveAttribute("alt", "photo.png"),
        ),
    ],
    ["코드 언어 popover 옵션", openCodeLanguageOption],
    ["callout 아이콘 picker 옵션", openCalloutIconOption],
  ];

test.describe("팝업 안 버튼의 Enter 반복", () => {
  for (const [title, open] of ROWS) {
    test(`${title}에서 Enter를 길게 눌러도 첫 Enter 효과만 남고 블록이 늘지 않는다`, async ({
      page,
    }) => {
      const { editable, target, expectApplied } = await open(page);
      const before = await blockCount(page);
      await target.focus();

      await page.keyboard.down("Enter");
      await expectApplied();
      await yieldFrame(page);
      const afterFirst = await editable.innerHTML();
      await sendRepeats(page);
      await page.keyboard.up("Enter");
      await yieldFrame(page);

      expect(await blockCount(page)).toBe(before);
      expect(await editable.innerHTML()).toBe(afterFirst);
      await expectApplied();
    });
  }
});

test("대조: 링크 URL 입력창의 Enter 반복은 여전히 새지 않는다", async ({
  page,
}) => {
  const { editable, input } = await openLinkEditing(page);
  const before = await blockCount(page);
  await input.focus();

  await page.keyboard.down("Enter");
  await expect(input).toHaveCount(0);
  await expect(editable.locator("a")).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await yieldFrame(page);
  const afterFirst = await editable.innerHTML();
  await sendRepeats(page);
  await page.keyboard.up("Enter");
  await yieldFrame(page);

  expect(await blockCount(page)).toBe(before);
  expect(await editable.innerHTML()).toBe(afterFirst);
});

test("상시 툴바 mark 버튼의 Enter 반복은 억제되지 않고 네이티브 토글 그대로다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/static-toolbar");
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.locator('[data-geul-block-id$="block-3"]').click();
  await page.keyboard.press("End");
  await yieldFrame(page);
  const before = await blockCount(page);
  const bold = page.getByRole("button", { name: "Bold" });
  await bold.focus();

  // keydown마다 click이 나 aria-pressed가 번갈아 바뀐다. 억제됐다면 첫 Enter
  // 뒤로 상태가 고정된다.
  const pressed: (string | null)[] = [];
  for (let i = 0; i < REPEAT_COUNT; i += 1) {
    await page.keyboard.down("Enter");
    await yieldFrame(page);
    pressed.push(await bold.getAttribute("aria-pressed"));
  }
  await page.keyboard.up("Enter");

  expect(pressed).toEqual(["true", "false", "true", "false"]);
  await expect(bold).toBeFocused();
  expect(await blockCount(page)).toBe(before);
});
