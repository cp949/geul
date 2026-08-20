/**
 * 컬럼 정렬 판정(computeColumnAlignments)의 성능 회귀를 검증한다.
 * 열 하나당 표 전체를 재순회하던 기존 O(columns * cells) 구현이 극단적으로
 * 넓은 표에서 다시 나타나지 않도록, markdown 파서(Issue #12)를 거치지 않고
 * Document/TableBlock 객체를 직접 구성해 analyzeMarkdownLoss/exportMarkdown의
 * 실행 시간이 넉넉한 상한 안에 머무르는지 확인한다.
 *
 * analyzeMarkdownLoss는 model의 parseDocument 검증을 거치지 않으므로
 * 10,000열(2행 × 10,000열 = 20,000 논리 셀)까지 그대로 쓴다. 반면
 * exportMarkdown은 내부에서 parseDocument로 "행수 * 열수 <= 10,000" 상한을
 * 검증하므로, 그 표는 5,000열(2행 × 5,000열 = 10,000 논리 셀)로 상한 안에
 * 맞춘다.
 *
 * Issue #58에서 이 파일의 역할이 좁아졌다. O(columns * cells) 회귀 감지는
 * markdown-column-align-complexity.test.ts의 결정적 단언이 지고, 여기 두
 * 상한은 심각한 성능 붕괴만 잡는 넷이다 — 상수별 근거는 각 상수 주석 참고.
 */
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";
import { buildWideMixedAlignDocument } from "./fixtures/wide-align-table.js";

/**
 * 과포화 부하에서도 wall max 94.99ms로 5.3배 여유가 있고, 회귀 코드 실측
 * 1265ms(커밋 6ef035f)는 여전히 이 상한 위다 — 그대로 둔다.
 */
const ANALYZE_TIME_LIMIT_MS = 500;

/**
 * 이 테스트만 부하 잡음과 회귀 신호가 겹친다. 정상 코드가 CPU 과포화에서
 * wall max 662.97ms까지 부푸는데 회귀 코드의 무부하 실측은 732ms라, 둘을
 * 가르는 wall-clock 임계값이 존재하지 않는다(Issue #58, 2026-08-20 12코어
 * 실측). 5,000열 135ms 중 컬럼 정렬 판정은 ~1ms이고 나머지는 parseDocument
 * 검증과 remark-stringify의 10,000셀 직렬화라 신호 대 잡음비를 개선할 수도
 * 없다 — 표는 parseDocument의 "행수 × 열수 ≤ 10,000" 상한 때문에 더 넓힐 수
 * 없다.
 *
 * 따라서 O(columns * cells) 회귀 감지는 부하에 의존하지 않는
 * markdown-column-align-complexity.test.ts가 지고, 이 상한은 "심각한 성능
 * 붕괴"만 잡는 넷으로 역할이 바뀌었다. 값은 실측 최악값(662.97ms)의 4.5배다.
 */
const EXPORT_TIME_LIMIT_MS = 3_000;

describe("컬럼 정렬 판정 성능", () => {
  it("2행 x 10,000열 표에서 analyzeMarkdownLoss가 500ms 이내에 끝난다", () => {
    const document = buildWideMixedAlignDocument(10_000);

    const start = performance.now();
    const losses = analyzeMarkdownLoss(document);
    const elapsedMs = performance.now() - start;

    const columnAlignLossCount = losses.filter(
      (loss) => loss.kind === "COLUMN_ALIGN",
    ).length;
    expect(columnAlignLossCount).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(ANALYZE_TIME_LIMIT_MS);
  });

  it("2행 x 5,000열 표(model 논리 셀 상한 이내)에서 exportMarkdown(lossy)이 3,000ms 이내에 끝난다", () => {
    // exportMarkdown은 내부에서 parseDocument로 "행수 * 열수 <= 10,000"을
    // 검증하므로, 이 표는 analyzeMarkdownLoss 테스트보다 좁게(5,000열)
    // 잡는다.
    const document = buildWideMixedAlignDocument(5_000);

    const start = performance.now();
    const exported = exportMarkdown(document, { mode: "lossy" });
    const elapsedMs = performance.now() - start;

    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(
      exported.value.warnings.some((loss) => loss.kind === "COLUMN_ALIGN"),
    ).toBe(true);
    expect(elapsedMs).toBeLessThan(EXPORT_TIME_LIMIT_MS);
  });
});
