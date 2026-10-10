/**
 * 요소 표현 읽기를 표면 × 선언 묶음 행렬로 고정한다(Issue #342).
 *
 * - 표면 12개: `span`, `p`, 블록 자식 없는 `div`, `li`, `li` 안 `p`,
 *   `blockquote` 안 `p`, `summary`, `figcaption`, `td`, `tr`, `table`, 셀 안 `p`.
 * - 선언 묶음 8개: 색, 배경, 굵게, 기울임, 밑줄, 취소선, 끄는 값, 계산 스타일
 *   덤프.
 * - 같은 선언은 어느 표면에 두어도 같은 글자 서식을 낸다. 기대값은 묶음마다 하나다.
 * - `importHtml`은 12개 표면 전부에 건다.
 * - `parseClipboardTable`은 표 표면 4개(`td`, `tr`, `table`, 셀 안 `p`)에 건다.
 * - `parseClipboardTable`은 표 옆 블록 표면 4개(`p`, 블록 자식 없는 `div`, `li`,
 *   `li` 안 `p`)에도 건다. 입력 뒤에 한 셀 표를 붙인다. 표가 없으면 파서가 표
 *   붙여넣기를 하지 않는다(Issue #343, #344).
 * - 아직 고치지 않은 칸은 `KNOWN_DEFECTS`에 적고 `it.fails`로 건다. 지금은 비어
 *   있다. 칸이 예상보다 먼저 고쳐지면 `it.fails`가 실패해 알려 준다.
 *
 * 기대값은 Chromium `getComputedStyle` 실측이다.
 * - 실측일: 2026-10-10, Chromium 153.0.8010.12(playwright 1.63).
 * - 방법: 아래 `SURFACES`·`BUNDLES`로 만든 HTML을 `div`에 넣고, 글자 `x`를 든
 *   요소의 `fontWeight`(600 이상이면 굵게)·`fontStyle`·`color`를 읽는다. 밑줄·취소선은
 *   조상의 `textDecorationLine`을 모두 본다. 배경은 가장 가까운 조상의 불투명한
 *   `backgroundColor`다. 검정 글자는 색 없음이다. 요소를 떼기 전에 읽는다(live 값).
 * - 12개 표면 × 8개 묶음 모두 묶음별로 같은 값이었다. 블록 자식 없는 `div` 표면은
 *   같은 날 같은 Chromium으로 뒤에 더해 쟀다(Issue #344).
 * - 도구: `_works/roadmap/probe/measure-matrix.mjs`. 저장소에 없다.
 *
 * 덤프 묶음은 Chromium 값에서 색·배경을 뺀 것이다. 계산 스타일 덤프가 붙은
 * 요소의 색은 페이지 테마의 계산 값이라 읽지 않는 정책이다(QA-144).
 */
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { importHtml } from "../src/index.js";

/** 글자 `x`가 받는 서식과 색이다. 없는 색은 `null`이다. */
type Leaf = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  textColor: string | null;
  backgroundColor: string | null;
};

/** 한 셀짜리 표 안에 셀 내용을 둔다. */
const cellTable = (inner: string): string =>
  `<table><tbody><tr>${inner}</tr></tbody></table>`;

/** 표면 이름 → 선언 `S`와 글자 `X`를 받아 HTML을 만든다. */
const SURFACES = {
  span: (S, X) => `<p><span style="${S}">${X}</span></p>`,
  p: (S, X) => `<p style="${S}">${X}</p>`,
  div: (S, X) => `<div style="${S}">${X}</div>`,
  li: (S, X) => `<ul><li style="${S}">${X}</li></ul>`,
  "li>p": (S, X) => `<ul><li><p style="${S}">${X}</p></li></ul>`,
  "blockquote>p": (S, X) => `<blockquote><p style="${S}">${X}</p></blockquote>`,
  summary: (S, X) =>
    `<details open><summary style="${S}">${X}</summary><p>c</p></details>`,
  figcaption: (S, X) => `<figcaption style="${S}">${X}</figcaption>`,
  td: (S, X) => cellTable(`<td style="${S}">${X}</td>`),
  tr: (S, X) =>
    `<table><tbody><tr style="${S}"><td>${X}</td></tr></tbody></table>`,
  table: (S, X) =>
    `<table style="${S}"><tbody><tr><td>${X}</td></tr></tbody></table>`,
  "cell>p": (S, X) => cellTable(`<td><p style="${S}">${X}</p></td>`),
} satisfies Record<string, (S: string, X: string) => string>;

type SurfaceName = keyof typeof SURFACES;

/** 표 표면이다. 클립보드 표 파서가 읽는다. */
const TABLE_SURFACES: readonly SurfaceName[] = ["td", "tr", "table", "cell>p"];

/** 표 옆 블록 표면이다. 클립보드 표 파서가 표 밖 블록으로 읽는다. */
const BESIDE_TABLE_SURFACES: readonly SurfaceName[] = [
  "p",
  "div",
  "li",
  "li>p",
];

const NONE: Leaf = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  textColor: null,
  backgroundColor: null,
};

/** 선언 묶음 이름 → [선언, 글자 자리 HTML, 기대값]. */
const BUNDLES = {
  색: ["color:#ff0000", "x", { ...NONE, textColor: "#FF0000" }],
  배경: [
    "background-color:#00ff00",
    "x",
    { ...NONE, backgroundColor: "#00FF00" },
  ],
  굵게: ["font-weight:bold", "x", { ...NONE, bold: true }],
  기울임: ["font-style:italic", "x", { ...NONE, italic: true }],
  밑줄: ["text-decoration:underline", "x", { ...NONE, underline: true }],
  취소선: ["text-decoration:line-through", "x", { ...NONE, strike: true }],
  끄는값: [
    "font-weight:bold;font-style:italic",
    '<span style="font-weight:normal;font-style:normal">x</span>',
    NONE,
  ],
  덤프: [
    "color:#112233;background-color:#445566;font-weight:bold;-webkit-text-stroke-width:0px",
    "x",
    { ...NONE, bold: true },
  ],
} satisfies Record<string, [string, string, Leaf]>;

type BundleName = keyof typeof BUNDLES;

type Path = "importHtml" | "클립보드" | "클립보드 표 옆";

/**
 * 아직 고치지 않은 칸이다. 키는 `경로 표면 × 묶음`, 값은 고치는 곳이다.
 * 비어 있으면 모든 칸이 Chromium과 같다. 칸을 고친 쪽이 지운다. 남은 칸은
 * `it.fails`로 걸려 예상보다 먼저 고쳐지면 실패로 알려 준다.
 */
const KNOWN_DEFECTS: Record<string, string> = {};

/** 모델 노드를 훑어 글자 `x`의 서식과 색을 모은다. 블록·셀 색은 아래로 번진다. */
const collectLeaves = (
  node: unknown,
  inherited: { textColor: string | null; backgroundColor: string | null },
  out: Leaf[],
): void => {
  if (Array.isArray(node)) {
    for (const child of node) collectLeaves(child, inherited, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const own = {
    textColor:
      typeof record.textColor === "string"
        ? record.textColor
        : inherited.textColor,
    backgroundColor:
      typeof record.backgroundColor === "string"
        ? record.backgroundColor
        : inherited.backgroundColor,
  };
  if (record.text === "x") {
    const marks = (record.marks ?? []) as Array<{
      type: string;
      color?: string;
    }>;
    const types = marks.map((mark) => mark.type);
    out.push({
      bold: types.includes("bold"),
      italic: types.includes("italic"),
      underline: types.includes("underline"),
      strike: types.includes("strike"),
      textColor:
        marks.find((mark) => mark.type === "textColor")?.color ?? own.textColor,
      backgroundColor:
        marks.find((mark) => mark.type === "backgroundColor")?.color ??
        own.backgroundColor,
    });
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    if (key !== "marks") collectLeaves(value, own, out);
  }
};

/** 모델 노드에서 글자 `x` 하나를 찾는다. */
const leafOf = (model: unknown): Leaf | undefined => {
  const leaves: Leaf[] = [];
  collectLeaves(model, { textColor: null, backgroundColor: null }, leaves);
  return leaves[0];
};

/** importHtml이 읽은 글자 `x`를 돌려준다. */
const importedLeaf = (html: string): Leaf | undefined => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  return result.ok ? leafOf(result.value.document.blocks) : undefined;
};

/** 클립보드 표 파서가 읽은 글자 `x`를 돌려준다. */
const clipboardLeaf = (html: string): Leaf | undefined => {
  const result = parseClipboardTable({ html });
  expect(result.ok).toBe(true);
  return result.ok ? leafOf(result.value) : undefined;
};

/** 블록 뒤에 한 셀 표를 붙여 클립보드 표 파서가 읽은 글자 `x`를 돌려준다. */
const clipboardBesideTableLeaf = (html: string): Leaf | undefined =>
  clipboardLeaf(`${html}${cellTable("<td>t</td>")}`);

/** 경로·표면·묶음 한 칸을 건다. 아직 고치지 않은 칸이면 `it.fails`다. */
const defineCell = (
  path: Path,
  surface: SurfaceName,
  bundle: BundleName,
  read: (html: string) => Leaf | undefined,
): void => {
  const key = `${path} ${surface} × ${bundle}`;
  const owner = KNOWN_DEFECTS[key];
  const [declaration, letter, expected] = BUNDLES[bundle];
  const run = owner === undefined ? it : it.fails;
  const title =
    owner === undefined
      ? `${surface}에 ${bundle}을 두면 Chromium과 같다`
      : `${surface}에 ${bundle}을 두면 Chromium과 같다 (결함, ${owner}가 고친다)`;
  run(title, () => {
    expect(read(SURFACES[surface](declaration, letter))).toEqual(expected);
  });
};

describe("요소 표현 행렬: importHtml", () => {
  for (const surface of Object.keys(SURFACES) as SurfaceName[]) {
    for (const bundle of Object.keys(BUNDLES) as BundleName[]) {
      defineCell("importHtml", surface, bundle, importedLeaf);
    }
  }
});

describe("요소 표현 행렬: 클립보드 표", () => {
  for (const surface of TABLE_SURFACES) {
    for (const bundle of Object.keys(BUNDLES) as BundleName[]) {
      defineCell("클립보드", surface, bundle, clipboardLeaf);
    }
  }
});

describe("요소 표현 행렬: 클립보드 표 옆 블록", () => {
  for (const surface of BESIDE_TABLE_SURFACES) {
    for (const bundle of Object.keys(BUNDLES) as BundleName[]) {
      defineCell("클립보드 표 옆", surface, bundle, clipboardBesideTableLeaf);
    }
  }
});
