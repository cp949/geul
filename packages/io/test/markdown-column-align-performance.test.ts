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
 */
import { describe, expect, it } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";
import { buildWideMixedAlignDocument } from "./fixtures/wide-align-table.js";

const TIME_LIMIT_MS = 500;

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
    expect(elapsedMs).toBeLessThan(TIME_LIMIT_MS);
  });

  it("2행 x 5,000열 표(model 논리 셀 상한 이내)에서 exportMarkdown(lossy)이 500ms 이내에 끝난다", () => {
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
    expect(elapsedMs).toBeLessThan(TIME_LIMIT_MS);
  });
});
