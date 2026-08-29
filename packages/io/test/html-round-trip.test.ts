import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const documentWithMergedTable: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "table-1",
      type: "table",
      columns: [
        { id: "column-1", width: 160 },
        { id: "column-2", width: 240 },
      ],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 2,
              content: [{ text: "Header", marks: [{ type: "bold" }] }],
              textColor: "#112233",
              backgroundColor: "#AABBCC",
            },
          ],
        },
        {
          id: "row-2",
          cells: [
            {
              id: "cell-2",
              columnId: "column-1",
              rowSpan: 2,
              columnSpan: 1,
              content: [{ text: "Row header" }],
            },
            {
              id: "cell-3",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [{ text: "Body" }],
            },
          ],
        },
        {
          id: "row-3",
          cells: [
            {
              id: "cell-4",
              columnId: "column-2",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 1,
    },
  ],
};

describe("HTML 왕복 변환", () => {
  it("id·병합 셀·너비·헤더·색상을 왕복 변환에서 보존한다", () => {
    const exported = exportHtml(documentWithMergedTable);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document: documentWithMergedTable, warnings: [] },
    });
    expect(exported.value).toBe(
      '<table data-be-block-id="table-1" data-be-header-rows="1" data-be-header-columns="1"><colgroup><col data-be-column-id="column-1" data-be-width="160"><col data-be-column-id="column-2" data-be-width="240"></colgroup><thead><tr data-be-row-id="row-1"><th data-be-cell-id="cell-1" data-be-column-id="column-1" rowspan="1" colspan="2" data-be-text-color="#112233" data-be-background-color="#AABBCC"><strong>Header</strong></th></tr></thead><tbody><tr data-be-row-id="row-2"><th data-be-cell-id="cell-2" data-be-column-id="column-1" rowspan="2" colspan="1" scope="row">Row header</th><td data-be-cell-id="cell-3" data-be-column-id="column-2" rowspan="1" colspan="1">Body</td></tr><tr data-be-row-id="row-3"><td data-be-cell-id="cell-4" data-be-column-id="column-2" rowspan="1" colspan="1"></td></tr></tbody></table>',
    );
  });

  it("저장 배열의 순서가 뒤집혀 있어도 브라우저 논리 열 순서로 직렬화한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "reversed-table",
          type: "table",
          columns: [
            { id: "reversed-column-1", width: 160 },
            { id: "reversed-column-2", width: 160 },
          ],
          rows: [
            {
              id: "reversed-row-1",
              cells: [
                {
                  id: "reversed-cell-2",
                  columnId: "reversed-column-2",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Body" }],
                },
                {
                  id: "reversed-cell-1",
                  columnId: "reversed-column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Header" }],
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 1,
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain(
      '<tr data-be-row-id="reversed-row-1"><th data-be-cell-id="reversed-cell-1"',
    );
    expect(exported.value.indexOf("reversed-cell-1")).toBeLessThan(
      exported.value.indexOf("reversed-cell-2"),
    );

    const imported = importHtml(exported.value);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);
    const table = imported.value.document.blocks[0];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(table.headerColumns).toBe(1);
    expect(table.rows[0]?.cells.map((cell) => cell.id)).toEqual([
      "reversed-cell-1",
      "reversed-cell-2",
    ]);
  });

  it("헤더 셀이 본문 행까지 걸치면 thead 없이 헤더 메타데이터를 유지한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "cross-group-table",
          type: "table",
          columns: [
            { id: "cross-column-1", width: 160 },
            { id: "cross-column-2", width: 160 },
          ],
          rows: [
            {
              id: "cross-row-1",
              cells: [
                {
                  id: "cross-cell-1",
                  columnId: "cross-column-1",
                  rowSpan: 2,
                  columnSpan: 1,
                  content: [{ text: "Row and column header" }],
                },
                {
                  id: "cross-cell-2",
                  columnId: "cross-column-2",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Column header" }],
                },
              ],
            },
            {
              id: "cross-row-2",
              cells: [
                {
                  id: "cross-cell-3",
                  columnId: "cross-column-2",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "Body" }],
                },
              ],
            },
          ],
          headerRows: 1,
          headerColumns: 1,
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).not.toContain("<thead>");
    expect(exported.value).toContain(
      'data-be-header-rows="1" data-be-header-columns="1"',
    );
    expect(exported.value).toContain(
      '<tbody><tr data-be-row-id="cross-row-1"><th data-be-cell-id="cross-cell-1"',
    );
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("mark 중첩 순서를 정규화하고 인접한 동일 인라인 mark를 병합한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          content: [
            {
              text: "marked",
              marks: [
                { type: "link", href: "https://example.com" },
                { type: "bold" },
                { type: "code" },
                { type: "italic" },
                { type: "strike" },
                { type: "underline" },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<p data-be-block-id="paragraph-1"><a href="https://example.com"><strong><em><u><s><code>marked</code></s></u></em></strong></a></p>',
    );

    expect(
      importHtml(
        '<p data-be-block-id="paragraph-2"><strong>A</strong><strong>B</strong></p>',
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-2",
              type: "paragraph",
              content: [{ text: "AB", marks: [{ type: "bold" }] }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("안전한 LF는 왕복 변환하고 정규화되지 않은 모델 텍스트는 거부한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "line-breaks",
          type: "paragraph",
          content: [{ text: "line 1\nline 2" }],
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain("line 1<br>line 2");
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });

    for (const invalidText of ["line 1\r\nline 2", "nul\u0000text"]) {
      expect(
        exportHtml({
          ...document,
          blocks: [
            {
              id: "invalid-text",
              type: "paragraph",
              content: [{ text: invalidText }],
            },
          ],
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "HTML_DOCUMENT_INVALID" },
      });
    }
  });

  it("ID의 제어문자를 HTML 직렬화 전에 거부한다", () => {
    expect(
      exportHtml({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "unsafe\nid", type: "paragraph", content: [] }],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  it("link mark가 여러 개인 문서는 중첩 anchor를 만들지 않고 거부한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "multiple-links",
          type: "paragraph",
          content: [
            {
              text: "invalid links",
              marks: [
                { type: "link", href: "https://outer.example" },
                { type: "link", href: "https://inner.example" },
              ],
            },
          ],
        },
      ],
    };

    expect(exportHtml(document)).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

  it("평범한 HTML 표는 주입된 id와 col 너비로 가져온다", () => {
    const ids = Array.from(
      { length: 10 },
      (_, index) => `generated-${index + 1}`,
    );
    const result = importHtml(
      '<table><colgroup><col width="120"><col width="180"></colgroup><thead><tr><th colspan="2">Header</th></tr></thead><tbody><tr><th scope="row" rowspan="2">Row</th><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
      { createId: () => ids.shift() ?? "unexpected-id" },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "generated-1",
              type: "table",
              columns: [
                { id: "generated-2", width: 120 },
                { id: "generated-3", width: 180 },
              ],
              rows: [
                {
                  id: "generated-4",
                  cells: [
                    {
                      id: "generated-5",
                      columnId: "generated-2",
                      rowSpan: 1,
                      columnSpan: 2,
                      content: [{ text: "Header" }],
                    },
                  ],
                },
                {
                  id: "generated-6",
                  cells: [
                    {
                      id: "generated-7",
                      columnId: "generated-2",
                      rowSpan: 2,
                      columnSpan: 1,
                      content: [{ text: "Row" }],
                    },
                    {
                      id: "generated-8",
                      columnId: "generated-3",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "B" }],
                    },
                  ],
                },
                {
                  id: "generated-9",
                  cells: [
                    {
                      id: "generated-10",
                      columnId: "generated-3",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "C" }],
                    },
                  ],
                },
              ],
              headerRows: 1,
              headerColumns: 1,
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("알 수 없는 최상위 텍스트는 문단으로 강등하고 revision을 초기화한다", () => {
    const ids = ["paragraph-generated", "heading-generated"];
    expect(
      importHtml("<aside>Loose <strong>text</strong></aside><h2>Title</h2>", {
        createId: () => ids.shift() ?? "unexpected-id",
      }),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "paragraph-generated",
              type: "paragraph",
              content: [
                { text: "Loose " },
                { text: "text", marks: [{ type: "bold" }] },
              ],
            },
            {
              id: "heading-generated",
              type: "heading",
              level: 2,
              content: [{ text: "Title" }],
            },
          ],
        },
        warnings: [
          expect.objectContaining({
            kind: "SAFE_BLOCK_DOWNGRADED",
            element: "aside",
          }),
        ],
      },
    });

    const revised: Document = {
      formatVersion: 1,
      revision: 42,
      blocks: [{ id: "stable", type: "paragraph", content: [] }],
    };
    const exported = exportHtml(revised);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).not.toContain("42");
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: {
        document: { ...revised, revision: 0 },
        warnings: [],
      },
    });
  });

  it("보존된 정규 id 옆에서도 기본 생성 id가 겹치지 않는다", () => {
    expect(
      importHtml('<p data-be-block-id="html-1">Preserved</p><p>Generated</p>'),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "html-1",
              type: "paragraph",
              content: [{ text: "Preserved" }],
            },
            {
              id: "html-2",
              type: "paragraph",
              content: [{ text: "Generated" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  // ce55f9f 이전에는 documentFromRoot가 최상위 노드만 훑는 평면 루프라
  // div/li/blockquote 안에 중첩된 요소의 data-be-block-id를 아예 읽지
  // 않았다 — 중첩 id가 최상위 id와 겹쳐도 항상 무시돼(inert) 조용히
  // 통과했다. block-segmenter.ts 도입으로 이제 중첩 요소도 실제 블록이 돼
  // 그 id를 읽으므로, 같은 id가 중첩 위치에서 재사용되면 model의 기존
  // 중복 id 불변식(schema.ts "Duplicate id")에 걸려 거절된다 — 이건 이번
  // 커밋이 새로 만든 실패가 아니라 이전엔 도달 못 하던 위치에서 기존
  // 불변식이 이제 정상적으로 작동하는 것이다(고쳐야 할 회귀가 아니다).
  it("중첩 요소가 최상위와 같은 data-be-block-id를 재사용하면 거절한다", () => {
    expect(
      importHtml(
        '<p data-be-block-id="x">top</p><div><p data-be-block-id="x">nested</p></div>',
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "HTML_DOCUMENT_INVALID" },
    });
  });

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
    expect(table.columns).toHaveLength(2);
    expect(table.rows[0]?.cells[0]?.columnSpan).toBe(2);
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
    expect(table.columns).toHaveLength(4);
    expect(table.rows[0]?.cells[1]).toMatchObject({
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
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells[0]?.rowSpan).toBe(1);
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
    expect(table.rows[0]?.cells[0]?.columnSpan).toBe(1);
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
    expect(table.rows[0]?.cells[0]?.rowSpan).toBe(1);
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
    expect(exported.value).toContain('data-be-align="center"');

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
    expect(exported.value).toContain('data-be-align="center"');
    expect(exported.value).toContain('data-be-background-color="#AABBCC"');

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
    expect(table.rows.map((row) => row.cells[0]?.content)).toEqual([
      [{ text: "H" }],
      [{ text: "B" }],
      [{ text: "F" }],
    ]);
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

  it("허용 목록 밖 data-be-align 값은 import 전체를 HTML_DOCUMENT_INVALID로 거절한다", () => {
    const html =
      '<table data-be-block-id="table-1"><colgroup><col data-be-column-id="column-1" data-be-width="160"></colgroup><tbody><tr data-be-row-id="row-1"><td data-be-cell-id="cell-1" data-be-column-id="column-1" rowspan="1" colspan="1" data-be-align="justify"></td></tr></tbody></table>';

    const result = importHtml(html);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
  });
});

// DELTA-04(children 재귀 왕복): paragraph/heading의 children을 HTML
// export/import에서 재귀적으로 왕복시킨다. "HTML 왕복 변환" describe가 이미
// AGENTS.md의 20개 기준을 넘어 있어(순수 이동이 아닌 신규 관심사이므로) 새
// top-level describe로 둔다.
describe("재귀 중첩 HTML 왕복", () => {
  // 후보 A(트랙-2 라운드4 확정): children이 있는 블록만
  // <div data-be-block-id>로 감싸고, 그 안에 (1) 기존 <p>/<hN>(children
  // 없이 blockId 그대로)과 (2) children을 담는 두 번째
  // <div data-be-children="1">를 순서대로 둔다. <p>가 HTML5상 <div>를
  // 자식으로 가질 수 없어 이 wrapper가 필요하다(export-html.ts의 blockNode
  // 주석 참고). exportHtml이 내는 정확한 문자열을 pin해 이 계약을
  // 고정한다 — 변이: wrapper 인식(import-html.ts의 findChildrenWrapper)을
  // 빼면 기존 segmentBlocks만 남아 이 div들을 NESTED_BOUNDARY_TAG_NAMES로
  // 평면 처리해 children이 사라지고 두 문단이 형제로 뒤섞인다.
  it("1단 중첩(문단 아래 문단)이 id·content·children까지 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<div data-be-block-id="parent-1"><p data-be-block-id="parent-1">parent</p><div data-be-children="1"><p data-be-block-id="child-1">child</p></div></div>',
    );

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("3단 깊이(문단→문단→문단) 중첩도 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "level-1",
          type: "paragraph",
          content: [{ text: "l1" }],
          children: [
            {
              id: "level-2",
              type: "paragraph",
              content: [{ text: "l2" }],
              children: [
                { id: "level-3", type: "paragraph", content: [{ text: "l3" }] },
              ],
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("heading의 children도 문단처럼 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          level: 2,
          content: [{ text: "제목" }],
          children: [
            { id: "body-1", type: "paragraph", content: [{ text: "본문" }] },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe(
      '<div data-be-block-id="heading-1"><h2 data-be-block-id="heading-1">제목</h2><div data-be-children="1"><p data-be-block-id="body-1">본문</p></div></div>',
    );

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  // 완료 조건 6: blockNode가 children 자리에서도 table 분기(tableNode)를
  // 재사용한다 — 변이: 재귀 렌더링이 자식 노드 타입을 무시하고 항상
  // <p>/<hN>으로만 처리하면 이 표가 깨지거나 예외가 난다.
  it("children으로 포함된 표도 구조 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            {
              id: "table-1",
              type: "table",
              columns: [{ id: "column-1", width: 100 }],
              rows: [
                {
                  id: "row-1",
                  cells: [
                    {
                      id: "cell-1",
                      columnId: "column-1",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "cell" }],
                    },
                  ],
                },
              ],
              headerRows: 0,
              headerColumns: 0,
            },
          ],
        },
      ],
    };

    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  // 완료 조건 5(회귀): children이 없는 블록은 지금처럼 <p>/<hN>을 그대로
  // 낸다 — wrapper를 씌우지 않는다(diff 최소). "HTML 왕복 변환" describe의
  // 기존 테스트 전량이 수정 없이 그대로 통과하는 것 자체가 이 조건의
  // 회귀 증거이므로 여기서 별도로 반복하지 않는다.

  // DELTA-04 즉시 리뷰 발견(G-CNV-002 위반, 즉시 정정): findChildrenWrapper가
  // 두 element 자식(p, dataBeChildren div)만 개수로 확인하고 그 사이·앞뒤에
  // 낀 실질 텍스트는 반환값에 담지 않아 조용히 사라졌다 — 변이: 아래
  // hasStrayText 가드를 지우면 "STRAY"가 blocks·warnings 어디에도 없이
  // 유실돼 이 테스트가 실패해야 한다(그 대신 두 element만으로 여전히
  // wrapper를 인식해버려 children은 정상 복원되므로 그 부분은 우연히
  // 통과한다 — 텍스트 손실만 놓친다).
  it("children wrapper 안에 낀 실질 텍스트는 wrapper 인식을 취소하고 평면 처리로 보존한다", () => {
    const html =
      '<div data-be-block-id="parent-1">STRAY<p data-be-block-id="parent-1">parent</p><div data-be-children="1"><p data-be-block-id="child-1">child</p></div></div>';

    const result = importHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const texts = result.value.document.blocks.flatMap((block) =>
      "content" in block ? block.content.map((item) => item.text) : [],
    );
    expect(texts).toContain("STRAY");
  });
});
