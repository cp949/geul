/**
 * HTML 표의 그리드·span·caption·정렬 가져오기 계약을 검증한다.
 */
import type { Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../../src/index.js";

describe("HTML 왕복 변환", () => {
  it("가져온 표 그리드가 잘못되면 HTML_DOCUMENT_INVALID로 감싼다", () => {
    expect(
      importHtml(
        '<table><colgroup><col width="160"></colgroup><tbody><tr><td colspan="2">Too wide</td></tr></tbody></table>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  // Issue #115: colgroup 없이 과대 colspan을 만나면 columnCount(=
  // inferredColumnCount)가 그 셀 자신의 colspan으로 계산돼 자기 자신을
  // 걸러낼 상한까지 함께 부풀린다(clipboard-table-parser.ts가 Issue #35에서
  // 이미 거절한 것과 같은 구조). 뒷받침하는 다른 셀·행이 전혀 없는 단일 셀
  // colspan="500" 표는 패딩으로 감춰 500열 표를 만드는 대신 거절해야 한다.
  it("colgroup 없는 표에서 과대 colspan은 열 수를 부풀리지 않고 거절한다", () => {
    expect(
      importHtml(
        '<table><tbody><tr><td colspan="500">X</td></tr></tbody></table>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  // colgroup이 있으면 columnCount는 cols.length로 고정되고 셀 span에서
  // 파생되지 않으므로 위 자기 강화 구조가 없다 — 과대 colspan은 model의
  // validateGridCoverage(SPAN_OUT_OF_BOUNDS)가 이미 막는다(위 테스트).
  // 여기서는 반대로 뒷받침하는 다른 셀이 전혀 없어도(단일 행, 단일 셀)
  // colspan이 colgroup 열 수와 정확히 일치하면 여전히 정상 표로 가져와야
  // 함을 고정한다 — colgroup 우선 정책이 없는 경로(위 거절 테스트)라면
  // 같은 "뒷받침 없음" 모양이 거절되는 것과 대비된다.
  it("colgroup 있는 표는 뒷받침하는 다른 셀이 없어도 colspan이 colgroup 열 수와 일치하면 가져온다", () => {
    const result = importHtml(
      '<table><colgroup><col width="120"><col width="120"></colgroup><tbody><tr><td colspan="2">Full width</td></tr></tbody></table>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect((table as TableBlock).columns).toHaveLength(2);
    expect((table as TableBlock).rows[0]?.cells[0]?.columnSpan).toBe(2);
  });

  // (단계-3 결함 탐지) 위 거절 판별식을 원본(clipboard-table-parser.ts)
  // 그대로 이식하면 rowSpan으로 여러 행을 정당하게 덮는 셀이 "자기 혼자
  // 최대 reach를 주장"으로 오인돼 정상 colspan까지 거절되는 회귀가 있었다.
  // 이 표는 완전한 격자다 — A(0열)와 B(1~3열, rowSpan 2)가 1행을, C(0열)와
  // B의 rowSpan 연속이 2행을 채운다. B의 colspan=3은 다른 셀이 뒷받침하지
  // 않아도 자기 자신이 두 행에 걸쳐 등장하는 것 자체가 근거이므로 거절되면
  // 안 된다.
  it("rowSpan으로 여러 행에 걸친 셀의 정당한 colspan은 오탐 거절되지 않는다", () => {
    const result = importHtml(
      '<table><tbody><tr><td>A</td><td colspan="3" rowspan="2">B</td></tr><tr><td>C</td></tr></tbody></table>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect((table as TableBlock).columns).toHaveLength(4);
    expect((table as TableBlock).rows[0]?.cells[1]).toMatchObject({
      columnSpan: 3,
      rowSpan: 2,
    });
  });

  // Issue #115 당시: 위조된 rowSpan(실제 <tr> 수를 넘는 값)이 colspan 선제
  // 검사를 우회하는 구멍이 되지 않는지 고정했다 — 실제 행은 1개뿐인데
  // rowSpan="500"을 주장하면(그때 cellRowWeight는 rowSpan 값 자체였으므로)
  // 선제 검사는 통과하고 model의 validateGridCoverage가 rowEnd(=0+500)가
  // 실제 rowCount(1)를 넘는 것을 SPAN_OUT_OF_BOUNDS로 거절했다.
  //
  // (Issue #117 이후 갱신) 이 표는 행이 1개뿐이라 hasIndependentRowBacking이
  // 항상 뒷받침 없음으로 판정한다 — rowSpan이 덮을 "다른 행" 자체가 없기
  // 때문이다. 그래서 이 케이스는 더 이상 그리드 검증까지 가지 않고 선제
  // 검사(oversizedColumnSpanCell) 자신이 곧바로 거절한다(bound=1) — 바로
  // 아래 "[Issue #117] 뒷받침 없이 rowSpan만 걸린 셀의 과대 colspan은
  // 여전히 거절한다"와 같은 코드 경로다. 최종 결과(ok: false)는 그대로
  // 유효한 회귀 방지 케이스라 유지하지만, "선제 검사를 우회해도 그리드
  // 검증이 거절한다"는 이제 이 입력이 아니라 "뒷받침 있어도 실제 행 수를
  // 넘는 위조 rowSpan은 그리드 검증이 거절한다"(아래 아래) 테스트가
  // 검증한다.
  it("실제 행 수를 넘는 위조 rowSpan은 거절된다(Issue #117 이후 선제 검사가 직접 거절)", () => {
    expect(
      importHtml(
        '<table><tbody><tr><td rowspan="500" colspan="500">X</td></tr></tbody></table>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  // Issue #117: 위 "단계-3 결함 탐지" 주석이 남긴 cellRowWeight(=
  // layoutRowSpan(cell.rowSpan) 값 자체로 가중)는 clipboard-table-parser.ts가
  // Issue #116에서 이미 걷어낸 것과 같은 결함을 그대로 갖고 있었다 — 가중치가
  // 검사 대상 셀 자기 자신의 rowSpan에서만 나오므로, rowSpan>=2인 셀은
  // rowSpan이 덮는 다른 행이 완전히 비어 있어도(<tr></tr>, 다른 셀 전혀 없음)
  // 자기 rowSpan 값만으로 "혼자 주장"이 아닌 것으로 위장했다. 재현
  // 확인(수정 전): 이 입력을 importHtml에 넣으면 ok: true, columnCount: 3으로
  // 오탐 통과했다 — Issue #35가 막으려던 "뒷받침 없는 홑 셀 과대 colspan"을
  // rowSpan 하나만 붙이면 그대로 우회하는 셈이다. 수정은 clipboard 쪽과 같은
  // hasIndependentRowBacking 근거(rowSpan이 덮는 다른 행에 자기 자신이 아닌
  // 다른 셀이 실제로 있는가)로 가중치를 판단한다 — 이 표는 두 번째 행이
  // 완전히 비어 그 근거가 없으므로 rowSpan=1 홑 셀과 같은 상한을 적용받아
  // 거절돼야 한다.
  it("[Issue #117] 뒷받침 없이 rowSpan만 걸린 셀의 과대 colspan은 여전히 거절한다", () => {
    expect(
      importHtml(
        '<table><tbody><tr><td rowspan="2" colspan="3">X</td></tr><tr></tr></tbody></table>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  // Issue #117: 위 테스트와 짝을 이룬다 — 여기서는 rowSpan이 덮는 두 번째
  // 행에 C라는 진짜 다른 셀이 있어(완전한 격자) 선제 검사(hasIndependentRowBacking
  // 기반)는 정당하게 통과한다. 하지만 B의 rowSpan 값 자체는 실제 <tr> 수(2)를
  // 훨씬 넘는 10으로 위조돼 있다 — 선제 검사는 "다른 행에 뒷받침이 있는가"만
  // 보고 rowSpan의 정확한 크기는 검증하지 않으므로 이 위조를 통과시킨다.
  // 최종 방어선은 model의 validateGridCoverage다: rowEnd(=0+10)가 실제
  // rowCount(2)를 넘으므로 SPAN_OUT_OF_BOUNDS로 거절한다(Issue #114와 같은
  // 안전망). 이 테스트는 수정 전에도 통과할 수 있다(선제 검사가 아니라
  // 그리드 검증이 거절하므로) — 계획서 완료 조건 4를 회귀 테스트로 고정하는
  // 목적이다.
  it("[Issue #117] 뒷받침 있어도 실제 행 수를 넘는 위조 rowSpan은 그리드 검증이 거절한다", () => {
    expect(
      importHtml(
        "<table><tbody><tr><td>A</td>" +
          '<td colspan="3" rowspan="10">B</td></tr>' +
          "<tr><td>C</td></tr></tbody></table>",
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  // (아키텍처 리뷰 5차 후보 1) clipboard-table-parser.ts는 emit 시점에
  // layoutRowSpan/layoutColumnSpan으로 rowspan="0"·colspan="0"·비정수
  // rowspan을 1로 보정하지만, import-html.ts는 이 seam을 거치지 않고 raw
  // 값을 그대로 TableBlock 셀에 담았다 — model의 validateGridCoverage가
  // rowSpan<1 또는 비정수를 INVALID_COORDINATE로 거절해, <td rowspan="0">
  // 같은 흔한 HTML5 마크업이 clipboard 붙여넣기는 성공하고 HTML import는
  // 문서 전체가 거절됐다. 아래 3건은
  // clipboard-table-parser-structure.test.ts의 동명 테스트와 짝이다.
  it("rowspan=0은 1로 보정해 표를 살린다", () => {
    const result = importHtml(
      '<table><tbody><tr><td rowspan="0">a</td><td>b</td></tr>' +
        "<tr><td>c</td><td>d</td></tr></tbody></table>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect((table as TableBlock).rows).toHaveLength(2);
    expect((table as TableBlock).rows[0]?.cells[0]?.rowSpan).toBe(1);
  });

  it("colspan=0은 1로 보정해 표를 살린다", () => {
    const result = importHtml(
      '<table><tbody><tr><td colspan="0">a</td><td>b</td></tr></tbody></table>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect((table as TableBlock).rows[0]?.cells[0]?.columnSpan).toBe(1);
  });

  it("정수가 아닌 rowspan은 1로 보정해 표를 살린다", () => {
    const result = importHtml(
      '<table><tbody><tr><td rowspan="2.5">a</td><td>b</td></tr>' +
        "<tr><td>c</td><td>d</td></tr></tbody></table>",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected table block");
    expect((table as TableBlock).rows[0]?.cells[0]?.rowSpan).toBe(1);
  });

  it("셀 align을 왕복 변환에서 보존한다", () => {
    const documentWithAlign: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-1",
          type: "table",
          columns: [{ id: "column-1", width: 160 }],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  columnId: "column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Centered" }],
                  align: "center",
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };

    const exported = exportHtml(documentWithAlign);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('data-geul-align="center"');

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: documentWithAlign, warnings: [] },
    });
  });

  it("셀 align과 배경색을 함께 왕복 변환에서 보존한다", () => {
    const documentWithAlignAndColor: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-1",
          type: "table",
          columns: [{ id: "column-1", width: 160 }],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  columnId: "column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Centered" }],
                  align: "center",
                  backgroundColor: "#AABBCC",
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };

    const exported = exportHtml(documentWithAlignAndColor);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('data-geul-align="center"');
    expect(exported.value).toContain('data-geul-background-color="#AABBCC"');

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: documentWithAlignAndColor, warnings: [] },
    });
  });

  it("importHtml도 tfoot이 tbody보다 먼저 오면 head→body→foot 순서로 파싱한다", () => {
    const html =
      "<table><thead><tr><td>H</td></tr></thead>" +
      "<tfoot><tr><td>F</td></tr></tfoot>" +
      "<tbody><tr><td>B</td></tr></tbody></table>";

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const table = result.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(
      (table as TableBlock).rows.map((row) => row.cells[0]?.content),
    ).toEqual([[{ text: "H" }], [{ text: "B" }], [{ text: "F" }]]);
  });

  it("import 경로에서도 caption이 표 앞 문단이 된다", () => {
    const html =
      "<table><caption>Sales 2026</caption>" +
      "<tbody><tr><td>a</td></tr></tbody></table>";

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toHaveLength(2);
    const [paragraph, table] = result.value.document.blocks;
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") throw new Error("Expected paragraph");
    expect(paragraph.content).toEqual([{ text: "Sales 2026" }]);
    expect(table?.type).toBe("table");
  });

  it("import 경로에서도 공백·제로폭 caption은 문단을 만들지 않는다", () => {
    const html =
      "<table><caption>\u200B\u00A0\u00A0</caption>" +
      "<tbody><tr><td>a</td></tr></tbody></table>";

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toHaveLength(1);
    expect(result.value.document.blocks[0]?.type).toBe("table");
  });

  it("import 경로에서도 caption과 tbody 사이 구조적 공백은 표 앞 문단에 섞이지 않는다", () => {
    const html =
      "<table>\n  <caption>Cap</caption>\n  <tbody><tr><td>A</td></tr></tbody>\n</table>";

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.document.blocks).toHaveLength(2);
    const [paragraph, table] = result.value.document.blocks;
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") throw new Error("Expected paragraph");
    expect(paragraph.content).toEqual([{ text: "Cap" }]);
    expect(table?.type).toBe("table");
  });

  it("허용 목록 밖 data-geul-align 값은 import 전체를 HTML_DOCUMENT_INVALID로 거절한다", () => {
    const html =
      '<table data-geul-block-id="table-1"><colgroup><col data-geul-column-id="column-1" data-geul-width="160"></colgroup><tbody><tr data-geul-row-id="row-1"><td data-geul-cell-id="cell-1" data-geul-column-id="column-1" rowspan="1" colspan="1" data-geul-align="justify"></td></tr></tbody></table>';

    const result = importHtml(html);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });
});
