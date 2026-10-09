/**
 * Kitchen sink(00-composite)의 미리보기 결과 패널을 검증한다(2026-09-11,
 * 사용자 요청 — 미리보기 코드블록도 라이브 에디터처럼 syntax highlight를
 * 적용). exportHtml()은 예제가 이미 라이브 에디터에 배선한
 * compositeSyntaxHighlighter(lowlight)를 그대로 재사용한다(새 하이라이터
 * 로딩 없음) — 이 spec은 그 재사용이 실제로 미리보기 DOM에 반영되는지만
 * 본다. 문서 편집(SlashMenu `/code` + 타이핑)은 vitest+jsdom에서
 * 신뢰할 만하게 재현할 방법이 이 저장소에 없어(ProseMirror 타이핑) e2e로
 * 확인한다 — e2e/code-block.spec.ts의 `insertCodeBlock` 패턴을 그대로
 * 따른다.
 */
import { expect, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

test("미리보기 탭의 코드 블록이 라이브 에디터와 동일하게 syntax highlight된다", async ({
  page,
}) => {
  await openShowcasePage(page, "/examples/composite");

  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.click();
  await page.keyboard.type("/code");
  await page.getByRole("option", { name: /Code/ }).click();

  // 언어를 지정하지 않으면 compositeSyntaxHighlighter가 빈 토큰을
  // 돌려줘 강조가 안 붙는다(e2e/code-block.spec.ts의 `openLanguagePopover`
  // + "js" + Enter 패턴을 그대로 따른다).
  await page.getByRole("button", { name: "Code language" }).click();
  const languageSearch = page.getByRole("combobox", {
    name: "Search for a language",
  });
  await languageSearch.fill("js");
  await languageSearch.press("Enter");

  await page.keyboard.type('const a = "hello";');

  const liveCode = editable.locator("pre[data-geul-code-block] code");
  await expect(liveCode).toBeVisible();

  // 실시간 갱신(그릴링 결정) — 탭을 누르지 않아도 기본 활성 탭인
  // 미리보기가 방금 만든 코드 블록을 이미 반영한다.
  const previewCode = page.locator(
    '[aria-label="미리보기"] pre[data-geul-block-id] code',
  );
  await expect(previewCode).toBeVisible();
  // 결과 패널은 디바운스돼 입력 도중 부분 텍스트로 먼저 나타날 수 있다 —
  // 한 번만 읽지 않고 마지막 텍스트가 될 때까지 자동 재시도한다.
  await expect(previewCode).toHaveText('const a = "hello";');

  const highlightedSpans = previewCode.locator('span[class*="hljs-"]');
  await expect(highlightedSpans.first()).toBeVisible();
  await expect(previewCode.locator("span.hljs-keyword").first()).toHaveText(
    "const",
  );
});

/**
 * 빈 문단 높이(Issue #322). exportHtml()은 빈 문단을 `<p …></p>`로 내보낸다.
 * 빈 `<p>`는 줄 상자가 없어 높이가 0이고 인접 마진만 접힌다 — 에디터의 빈
 * 줄 N개가 미리보기에서는 간격 0으로 사라졌다. preview.css가
 * `p:empty::before`로 한 줄 높이를 준다. 높이는 `.geul-preview`의
 * `line-height`(1.6) 기준이라 `font-size × 1.6`이다.
 */
const PREVIEW_LINE_HEIGHT = 1.6;
const PREVIEW_PARAGRAPH_MARGIN_EM = 0.5;

/** 미리보기 안 모든 문단 요소의 텍스트와 사각형을 읽는다. */
const readPreviewParagraphs = (page: Page) =>
  page.locator('[aria-label="미리보기"] > p').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: node.textContent ?? "",
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
      };
    }),
  );

/**
 * "위", 빈 줄 `emptyCount`개, "아래" 문서를 에디터에 입력한다. 결과 패널이
 * 디바운스돼 있어 미리보기 문단 수가 기대와 같아질 때까지 기다린다.
 */
const typeAboveEmptiesBelow = async (page: Page, emptyCount: number) => {
  const editable = page.getByRole("textbox", { name: "Editor" });
  await editable.click();
  await page.keyboard.type("위");
  for (let index = 0; index <= emptyCount; index += 1) {
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("아래");

  const previewParagraphs = page.locator('[aria-label="미리보기"] > p');
  await expect(previewParagraphs).toHaveCount(emptyCount + 2);
  await expect(previewParagraphs.last()).toHaveText("아래");
};

test.describe("미리보기 빈 문단 높이(Issue #322)", () => {
  for (const emptyCount of [0, 1, 2, 3]) {
    test(`빈 줄 ${emptyCount}개일 때 위와 아래 사이 거리가 빈 문단당 한 줄 높이 + 마진만큼 늘어난다`, async ({
      page,
    }) => {
      await openShowcasePage(page, "/examples/composite");
      await typeAboveEmptiesBelow(page, emptyCount);

      const paragraphs = await readPreviewParagraphs(page);
      const above = paragraphs[0];
      const below = paragraphs[paragraphs.length - 1];
      if (above === undefined || below === undefined) {
        throw new Error("미리보기 문단을 읽지 못했다");
      }
      expect(above.text).toBe("위");
      expect(below.text).toBe("아래");

      const lineHeight = above.fontSize * PREVIEW_LINE_HEIGHT;
      const margin = above.fontSize * PREVIEW_PARAGRAPH_MARGIN_EM;
      // 인접 문단 마진은 접힌다 — 빈 문단이 없으면 마진 하나, 빈 문단마다
      // (한 줄 높이 + 마진 하나)가 더해진다.
      const expectedGap = margin + emptyCount * (lineHeight + margin);
      expect(below.top - above.bottom).toBeCloseTo(expectedGap, 1);

      // 가운데 빈 문단은 한 줄 문단과 같은 높이다.
      for (const empty of paragraphs.slice(1, -1)) {
        expect(empty.text).toBe("");
        expect(empty.height).toBeCloseTo(above.height, 1);
        expect(empty.height).toBeCloseTo(lineHeight, 1);
      }
    });
  }

  test("빈 문단의 가상 콘텐츠가 textContent와 접근성 트리에 드러나지 않는다", async ({
    page,
  }) => {
    await openShowcasePage(page, "/examples/composite");
    await typeAboveEmptiesBelow(page, 2);

    // textContent에는 생성 콘텐츠가 들어가지 않는다(DOM 값 확인).
    const texts = await page
      .locator('[aria-label="미리보기"] > p')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    expect(texts).toEqual(["위", "", "", "아래"]);

    // Playwright aria 스냅샷은 DOM 기반이라 ::before를 보지 못한다. Chromium
    // 전체 AX 트리(CDP)를 직접 읽어, 스크린리더에 노출되는(ignored가 아닌)
    // ZWSP 노드가 없는지 본다.
    const client = await page.context().newCDPSession(page);
    try {
      const { nodes } = (await client.send("Accessibility.getFullAXTree")) as {
        nodes: {
          ignored?: boolean;
          name?: { value?: unknown };
        }[];
      };
      const exposed = nodes.filter(
        (node) =>
          node.ignored !== true &&
          typeof node.name?.value === "string" &&
          node.name.value.includes("\u200b"),
      );
      expect(exposed).toEqual([]);
    } finally {
      await client.detach();
    }
  });

  test("내용 있는 문단·callout 안쪽 문단은 그대로이고 빈 callout·인용 안쪽 문단만 한 줄 높이를 얻는다", async ({
    page,
  }) => {
    await openShowcasePage(page, "/examples/composite");

    // exportHtml()이 만드는 callout 모양(`<div data-geul-callout><p>…</p></div>`)을
    // `.geul-preview` 안에 직접 주입해 높이를 잰다.
    const measured = await page.evaluate(() => {
      const host = document.createElement("div");
      host.className = "geul-preview";
      host.innerHTML =
        '<div data-geul-block-id="c1" data-geul-callout="true"><p>내용</p></div>' +
        '<div data-geul-block-id="c2" data-geul-callout="true"><p></p></div>' +
        '<blockquote data-geul-block-id="q"><p></p></blockquote>' +
        '<h2 data-geul-block-id="h"></h2>' +
        '<p data-geul-block-id="p1">내용</p>' +
        '<p data-geul-block-id="p2"></p>';
      document.body.append(host);
      const read = (selector: string) => {
        const node = host.querySelector(selector);
        if (node === null) throw new Error(`${selector} 없음`);
        const style = getComputedStyle(node);
        return {
          height: node.getBoundingClientRect().height,
          marginTop: style.marginTop,
          fontSize: Number.parseFloat(style.fontSize),
        };
      };
      const result = {
        filledCalloutP: read('[data-geul-block-id="c1"] p'),
        emptyCalloutP: read('[data-geul-block-id="c2"] p'),
        emptyQuoteP: read("blockquote p"),
        filledP: read('[data-geul-block-id="p1"]'),
        emptyP: read('[data-geul-block-id="p2"]'),
      };
      host.remove();
      return result;
    });

    const lineHeight = measured.filledP.fontSize * PREVIEW_LINE_HEIGHT;
    expect(measured.filledP.height).toBeCloseTo(lineHeight, 1);
    expect(measured.emptyP.height).toBeCloseTo(lineHeight, 1);
    // callout 안쪽 문단: margin 0 규칙은 그대로, 내용 있는 문단 높이도 그대로.
    expect(measured.filledCalloutP.marginTop).toBe("0px");
    expect(measured.filledCalloutP.height).toBeCloseTo(lineHeight, 1);
    // 빈 callout 안쪽 문단은 한 줄 높이를 얻는다(의도한 변화).
    expect(measured.emptyCalloutP.marginTop).toBe("0px");
    expect(measured.emptyCalloutP.height).toBeCloseTo(lineHeight, 1);
    // 빈 인용 안쪽 문단도 한 줄 높이를 얻는다(의도한 변화).
    expect(measured.emptyQuoteP.height).toBeCloseTo(lineHeight, 1);
  });
});
