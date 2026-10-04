/**
 * showcase의 Emoji picker 예제(08-emoji-picker)를 검증한다. 루트 `e2e/`에는
 * emoji-picker 스펙이 없었다(demo 앱은 EmojiPicker를 마운트하지 않는다,
 * `apps/demo/src/app.tsx`는 SlashMenu만 얹는다) — showcase-mention.spec.ts와
 * 같은 "popup 1개당 파일 1개" 관례로 신규 파일을 추가한다(Issue #211
 * 01-계획.md "## 결정"). 방향키로 캐럿이 `:` 블록을 벗어나면 닫히는 계약도
 * 여기서 고정한다(Issue #229).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectCaretMenuFollowsCaret } from "./support/caret-gap.js";
import {
  lastKeydownPrevented,
  recordKeydownPrevented,
} from "./support/keydown-prevented.js";
import { openShowcasePage } from "./support/showcase.js";
import {
  LEAVE_KEYS,
  MAX_LEAVE_ATTEMPTS,
  readCaretBlockText,
  readEnterState,
  recordEnterState,
} from "./support/trigger-leave-block.js";
import { yieldFrame } from "./support/yield-frame.js";

/**
 * `openMentionExample`(`showcase-mention.spec.ts`)과 동일 이유로 분리 —
 * 접근성 이름으로 잡은 `Editor` textbox는 wrapper고 실제 contenteditable은
 * 그 안의 `[contenteditable="true"]`다.
 */
const openEmojiPickerExample = async (page: Page) => {
  await openShowcasePage(page, "/examples/emoji-picker");
  const editor = page.getByRole("textbox", { name: "Editor" });
  const editable = editor.locator('[contenteditable="true"]');
  await expect(editable).toBeVisible();
  const menu = page.getByRole("listbox", { name: "Emoji picker" });
  return { editable, menu };
};

// Issue #211: 후보 0건 상태에서 Enter를 누르면 EmojiPicker의 keydown
// 핸들러가 event.preventDefault()를 호출하지 않아 ProseMirror 기본
// Enter(블록 분할)로 폴스루했다. 팝업은 열린 채 유지되고 블록은 분할되지
// 않아야 한다.
test("후보가 없을 때 Enter를 눌러도 블록이 분할되지 않는다 (Issue #211)", async ({
  page,
}) => {
  const { editable, menu } = await openEmojiPickerExample(page);

  await editable.click();
  await page.keyboard.type(":zzzznomatch");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(0);

  await page.keyboard.press("Enter");

  await expect(menu).toBeVisible();
  await expect(editable.locator("p")).toHaveCount(1);
  await expect(editable.locator("p")).toHaveText(":zzzznomatch");
});

/** 강조된(`aria-selected="true"`) 옵션의 label을 읽는다. */
const highlightedLabel = (menu: Locator) =>
  menu
    .locator('[role="option"][aria-selected="true"]')
    .getAttribute("aria-label");

// Issue #227: Alt+ArrowDown은 브라우저·OS 단축키 조합이다. 열린 메뉴는
// preventDefault로 삼키거나 하이라이트를 옮기지 않는다.
test("수식 키 + 방향키는 하이라이트를 옮기지 않고 기본 동작을 막지 않는다 (Issue #227)", async ({
  page,
}) => {
  const { editable, menu } = await openEmojiPickerExample(page);

  await editable.click();
  await yieldFrame(page);
  await page.keyboard.type(":");
  await expect(menu).toBeVisible();
  // 수식 키 없는 ArrowDown으로 강조를 첫 줄 밖으로 옮겨 기준값을 만든다.
  await page.keyboard.press("ArrowDown");
  const before = await highlightedLabel(menu);
  expect(before).not.toBeNull();
  const firstLabel = await menu
    .getByRole("option")
    .first()
    .getAttribute("aria-label");
  expect(before).not.toBe(firstLabel);
  await recordKeydownPrevented(page);

  await page.keyboard.press("Alt+ArrowDown");

  expect(await lastKeydownPrevented(page)).toEqual({
    key: "ArrowDown",
    prevented: false,
  });
  expect(await highlightedLabel(menu)).toBe(before);
  await expect(menu).toBeVisible();
});

/**
 * alpha / `:smi` / gamma 세 블록을 만들고 메뉴를 연 채 `:smi` 끝에 캐럿을 둔다.
 * 클릭·키 입력 직후 PM state가 DOM selection을 따라잡지 못하거나 병렬 부하에서
 * 이동 키가 사라지는 실행이 있어, 셋업 전체를 `toPass` 재시도로 감싼다
 * (G-EDT-002, G-TST-001). 매 시도는 페이지를 새로 연다.
 */
const openSmiBetweenBlocks = async (page: Page) => {
  let opened: Awaited<ReturnType<typeof openEmojiPickerExample>> | undefined;
  await expect(async () => {
    opened = await openEmojiPickerExample(page);
    const { editable, menu } = opened;
    await editable.click();
    await yieldFrame(page);
    await page.keyboard.type("alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.type("beta");
    await page.keyboard.press("Enter");
    await page.keyboard.type("gamma");
    await page.keyboard.press("ArrowUp");
    await yieldFrame(page);
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await yieldFrame(page);
    await page.keyboard.type(":smi");
    await expect(menu).toBeVisible({ timeout: 1_000 });
    await expect(editable.locator("p")).toHaveText(["alpha", ":smi", "gamma"], {
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  if (opened === undefined) throw new Error("예제를 열지 못했다");
  return opened;
};

// Issue #229: selectionchange 리스너가 PM 리스너보다 먼저 호출돼 낡은
// state.selection을 읽었다. 방향키로 `:smi` 블록을 벗어나도 메뉴가 열린 채
// 남았고 이어 누른 Enter가 캐럿 블록이 아닌 `:smi` 블록을 이모지로 바꿨다.
// 수식 키 없는 방향키는 grid 하이라이트 이동이라 캐럿을 옮기지 않는다
// (Issue #227 계약). 캐럿을 옮기는 수식 키 조합만 쓴다.
for (const key of ["Control+ArrowUp", "Control+End"]) {
  test(`${key}로 캐럿이 :smi 블록을 벗어나면 메뉴가 닫히고 Enter가 :smi 블록을 바꾸지 않는다 (Issue #229)`, async ({
    page,
  }) => {
    const { editable, menu } = await openSmiBetweenBlocks(page);

    await page.keyboard.press(key);
    // 전제: 캐럿이 :smi 블록 밖으로 나갔다.
    await expect
      .poll(async () => {
        const text = await readCaretBlockText(page);
        return text !== null && text !== ":smi";
      })
      .toBe(true);
    await page.waitForTimeout(150);

    await expect(menu).toHaveCount(0);
    await page.keyboard.press("Enter");

    await expect(
      editable.locator("p").filter({ hasText: /^:smi$/ }),
    ).toHaveCount(1);
    await expect(menu).toHaveCount(0);
  });
}

// Issue #229: 같은 블록 안의 캐럿 이동은 메뉴를 닫지 않는다. 방향키는 grid
// 하이라이트 이동이라 Home으로 캐럿을 옮긴다.
test("같은 블록 안에서 Home은 메뉴를 유지한다 (Issue #229)", async ({
  page,
}) => {
  const { menu } = await openSmiBetweenBlocks(page);

  await page.keyboard.press("Home");
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.anchorOffset))
    .toBe(0);
  await page.waitForTimeout(150);

  await expect(menu).toBeVisible();
});

// Issue #234 RD-004: 캐럿 메뉴는 열린 채 스크롤해도 캐럿 하단에 붙는다.
test("이모지 피커가 열린 채 window를 스크롤해도 캐럿 하단에 붙어 있다 (Issue #234)", async ({
  page,
}) => {
  const { editable, menu } = await openEmojiPickerExample(page);
  await editable.click();
  await yieldFrame(page);
  await page.keyboard.type(":");
  await expect(menu).toBeVisible();

  await expectCaretMenuFollowsCaret(page, menu);
});

// Issue #258: 이동 키 직후(0ms)의 Enter는 PM state가 낡아 이전 `:sm` 블록을
// 이모지로 바꿨다. 확정은 DOM selection의 캐럿 블록을 확인한다. Issue #229의
// 150ms 재읽기 계약과 같은 이동 키를 쓴다. `Home 뒤 ArrowLeft`는 ArrowLeft를
// grid 이동으로 소비해 이탈 시나리오가 아니므로 뺀다.

/** `alpha` 블록과 그 뒤 `:sm` 블록을 만들고 picker가 열린 상태로 둔다. */
const openSmAfterAlpha = async (page: Page) => {
  const { editable, menu } = await openEmojiPickerExample(page);
  await editable.click();
  await yieldFrame(page);
  await page.keyboard.type("alpha");
  await page.keyboard.press("Enter");
  await page.keyboard.type(":sm");
  await expect(menu).toBeVisible();
  return { editable, menu };
};

for (const leave of LEAVE_KEYS.filter(
  (candidate) => !candidate.pressesArrowLeft,
)) {
  for (const wait of leave.waits) {
    test(`:sm 블록을 ${leave.name}로 떠난 ${wait}ms 뒤 Enter는 이모지를 삽입하지 않는다 (Issue #258)`, async ({
      page,
    }) => {
      for (let attempt = 1; attempt <= MAX_LEAVE_ATTEMPTS; attempt += 1) {
        const { editable, menu } = await openSmAfterAlpha(page);
        await recordEnterState(page, '[aria-label="Emoji picker"]');

        for (const key of leave.press) await page.keyboard.press(key);
        if (wait > 0) {
          await page.waitForTimeout(wait);
          if ((await readCaretBlockText(page)) === ":sm") continue;
          // 재읽기가 끝난 뒤에는 Enter 없이도 picker가 닫혀 있다.
          await expect(menu).toHaveCount(0);
        }
        await page.keyboard.press("Enter");
        const enter = await readEnterState(page);
        if (enter?.caretBlock === ":sm") continue;

        await expect(menu).toHaveCount(0);
        // 캐럿이 떠난 `:sm` 블록은 텍스트 그대로 남는다.
        if (leave.keepsTrigger) {
          await expect(
            editable.locator("p").filter({ hasText: /^:sm$/ }),
          ).toHaveCount(1);
        }
        // 0ms는 두 경로가 모두 유효하다. Enter 때 picker가 아직 열려 있으면 가드가
        // 그 Enter를 소비하므로 문서가 변하지 않아야 한다. 즉시 읽기가 먼저
        // picker를 닫았으면 Enter가 편집기에서 평소대로 동작한다.
        if (enter?.pickerOpen === true) {
          await expect(editable.locator("p")).toHaveText(["alpha", ":sm"]);
        }
        return;
      }
      throw new Error(
        `${MAX_LEAVE_ATTEMPTS}번 시도해도 이동이 유지되지 않았다`,
      );
    });
  }
}

// Issue #258 회귀 보호: 같은 블록에 캐럿이 있으면 Enter가 이모지를 확정한다.
test(":sm에서 Enter는 강조된 이모지로 블록을 바꾼다 (Issue #258)", async ({
  page,
}) => {
  const { editable, menu } = await openEmojiPickerExample(page);
  await editable.click();
  await yieldFrame(page);
  await page.keyboard.type(":sm");
  await expect(menu).toBeVisible();
  const highlighted = menu.locator('[role="option"][aria-selected="true"]');
  const char = await highlighted.textContent();
  expect(char).not.toBeNull();
  expect(char).not.toBe("");

  await page.keyboard.press("Enter");

  await expect(menu).toHaveCount(0);
  await expect(editable.locator("p")).toHaveCount(1);
  // 블록 텍스트가 강조돼 있던 이모지 한 글자와 같다.
  await expect(editable.locator("p")).toHaveText(char ?? "");
  await expect(editable).toBeFocused();
});
