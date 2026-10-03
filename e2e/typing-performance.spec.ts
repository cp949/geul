/**
 * `/examples/composite`(Kitchen sink)에서 샘플 문서를 불러온 뒤 문자 입력
 * 지연을 브라우저 wall-clock으로 기록한다. 결과 패널(ResultPanel)이 키
 * 입력 경로에 얹던 비용을 줄인 작업의 전후 비교용이다.
 *
 * 측정 경계:
 * - 실제 키 입력이다. `page.keyboard.press("a")`가 브라우저 입력 파이프라인을
 *   그대로 탄다 — `view.dispatch()` 직접 호출은 이 파이프라인과 React 리렌더를
 *   일부 우회해 사용자가 느끼는 지연을 과소평가한다.
 * - 타이밍은 전부 페이지 안에서 잰다. keydown 캡처 리스너가 이벤트의
 *   `timeStamp`를 기준점으로 삼고, 그 키 이후 첫 번째·두 번째
 *   `requestAnimationFrame` 콜백 시각과의 차이를 `performance.now()`로
 *   기록한다. Playwright IPC 왕복은 기준점 이후 구간에 섞이지 않는다.
 * - 포함: 키 이벤트 처리, ProseMirror 트랜잭션, React 리렌더가 첫
 *   프레임을 막은 시간. 결과 패널은 200ms 트레일링 디바운스라 입력 중에는
 *   재계산하지 않는다. 마지막 키 뒤 약 200ms에 일어나는 재계산은 이 spec이
 *   마지막 키 직후 표본을 읽으므로 측정 구간 밖이다.
 * - 제외: 샘플 불러오기, 페이지 내비게이션, 캐럿 이동, 워밍업 키.
 * - 값은 프레임 주기(60Hz면 약 16.7ms)로 양자화된다. 16.7ms 근처는
 *   "프레임을 놓치지 않음", 그 두 배는 "한 프레임 지연"으로 읽는다.
 * - 첫 프레임 값은 입력이 프레임을 막는 시간이다. 두 번째 프레임 값은
 *   그 다음 프레임까지의 시간이다. 키당 총 작업량은 이 값으로 알 수 없다.
 * - 키마다 rAF를 두 번 기다려 키를 한 프레임 이상 떼어 놓는다. 한 키의
 *   프레임 표본이 다음 키의 표본과 겹치지 않게 한다.
 *
 * 수치는 단언하지 않는다. wall-clock 상한은 부하 잡음과 회귀를 가르지
 * 못한다(PIT-0034, G-TST-004). 회귀 게이트는 결정적 구조 테스트
 * (`apps/showcase/test/examples/00-composite.test.tsx`의 "HTML 패널은
 * DOM에 없다")가 맡고, 이 spec은 입력이 반영됐는지만 단언한다. 수치는
 * `docs/product/performance-baseline.md`에 사람이 옮겨 적는다.
 */
import { expect, type Page, test } from "@playwright/test";

import { openShowcasePage } from "./support/showcase.js";

const WARMUP_KEYS = 20;
const SAMPLE_KEYS = 100;

/** 표본의 분위수를 계산한다(nearest-rank, 0–1). */
const quantile = (samples: readonly number[], q: number): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(q * sorted.length))
  ] as number;
};

/** 표본의 중앙값을 계산한다(짝수 개면 가운데 두 값의 평균). */
const median = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
};

/** 다음 두 프레임이 지나갈 때까지 기다린다. */
const waitTwoFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

type KeyTimerStore = { frame1: number[]; frame2: number[] };

/**
 * keydown마다 첫·두 번째 프레임까지의 시간을 `window.__typingPerf`에 쌓는
 * 캡처 리스너를 건다.
 */
const installKeyTimer = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const store: KeyTimerStore = { frame1: [], frame2: [] };
    (window as unknown as { __typingPerf: KeyTimerStore }).__typingPerf = store;
    addEventListener(
      "keydown",
      (event) => {
        const origin = event.timeStamp;
        requestAnimationFrame(() => {
          store.frame1.push(performance.now() - origin);
          requestAnimationFrame(() => {
            store.frame2.push(performance.now() - origin);
          });
        });
      },
      true,
    );
  });

/** 쌓인 표본을 비운다. 워밍업 키의 표본을 버릴 때 쓴다. */
const resetKeyTimer = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const store = (window as unknown as { __typingPerf: KeyTimerStore })
      .__typingPerf;
    store.frame1.length = 0;
    store.frame2.length = 0;
  });

/** 쌓인 표본을 복사해 돌려준다. */
const readKeyTimer = (page: Page): Promise<KeyTimerStore> =>
  page.evaluate(() => {
    const store = (window as unknown as { __typingPerf: KeyTimerStore })
      .__typingPerf;
    return { frame1: [...store.frame1], frame2: [...store.frame2] };
  });

const formatStats = (samples: readonly number[]): string =>
  `median=${median(samples).toFixed(1)}ms p90=${quantile(samples, 0.9).toFixed(1)}ms max=${Math.max(...samples).toFixed(1)}ms`;

test("샘플 로드 후 문자 입력 지연을 기록한다", async ({ page }) => {
  test.setTimeout(120_000);

  await openShowcasePage(page, "/examples/composite");
  const editable = page.getByRole("textbox", { name: "Editor" });
  await expect(editable).toBeVisible();

  await page.getByRole("button", { name: "샘플 불러오기" }).click();
  await expect(page.getByLabel("미리보기")).toContainText(
    "샘플 문서 — geul 블록 둘러보기",
  );
  // 샘플의 이미지·미디어 블록이 로드되고 결과 패널의 디바운스 재계산이 끝나기를 기다린다.
  await page.waitForTimeout(2_000);

  await editable.click();
  await page.keyboard.press("Control+End");
  await installKeyTimer(page);

  for (let i = 0; i < WARMUP_KEYS; i++) {
    await page.keyboard.press("a");
    await waitTwoFrames(page);
  }
  await resetKeyTimer(page);

  for (let i = 0; i < SAMPLE_KEYS; i++) {
    await page.keyboard.press("a");
    await waitTwoFrames(page);
  }
  const { frame1, frame2 } = await readKeyTimer(page);

  console.log(
    `[perf] typing keydown→frame1 n=${frame1.length} ${formatStats(frame1)}`,
  );
  console.log(
    `[perf] typing keydown→frame2 n=${frame2.length} ${formatStats(frame2)}`,
  );

  // 수치가 아니라 입력이 실제로 반영됐는지만 본다.
  expect(frame1).toHaveLength(SAMPLE_KEYS);
  expect(frame2).toHaveLength(SAMPLE_KEYS);
  expect(await editable.textContent()).toContain(
    "a".repeat(WARMUP_KEYS + SAMPLE_KEYS),
  );
});
