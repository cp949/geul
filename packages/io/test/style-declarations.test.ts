/**
 * `parseStyleDeclarations`가 style 속성에서 색·배경색·정렬을 읽는 규칙을
 * 검증한다. 값 정규화와 버리는 값의 규칙, 선언 우선순위(`!important`·무효
 * 선언·`clear`)를 다루고, 선형 구현이 옛 정규식 구현과 같은 선언 읽기
 * 결과(분할·속성·정렬)를 내는지 오라클 사본으로 대조한다. 색 값 문법은
 * `css-color.test.ts`가 다룬다. 작업량 검증은
 * `style-declarations-complexity.test.ts`가 다룬다.
 *
 * 선언 표의 기대값은 Chromium getComputedStyle 실측(2026-10-10)이다.
 * 재생성은 `_tmp` 하네스 방식이다: style 속성을 요소에 넣고 계산 색을 읽어
 * 불투명이고 부모 색과 다르면 색 마크, 아니면 마크 없음으로 본다.
 */
import { isCanonicalCellAlign, isCanonicalCellColor } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  type InlineFontStyle,
  type InlineFontWeight,
  parseInlineStyleMarks,
  parseStyleColorStates,
  parseStyleDeclarations,
  parseWhiteSpaceMode,
  readDumpAuthorDeclarations,
  type StyleDeclarations,
} from "../src/clipboard/style-declarations.js";

describe("parseStyleDeclarations", () => {
  it("hex color/background-color/text-align을 읽는다", () => {
    expect(
      parseStyleDeclarations(
        "color:#ff0000;background-color:#00FF00;text-align:right;",
      ),
    ).toEqual({
      color: "#FF0000",
      backgroundColor: "#00FF00",
      align: "right",
    });
  });

  it("rgb() 표기를 hex로 정규화한다", () => {
    expect(parseStyleDeclarations("background-color: rgb(255, 0, 0)")).toEqual({
      backgroundColor: "#FF0000",
    });
  });

  it("background 축약형이 순수 색상 리터럴이면 배경색으로 읽는다", () => {
    // Excel 클립보드 HTML은 background-color 대신 background 축약형을 쓴다.
    expect(parseStyleDeclarations("background:#FFFF00")).toEqual({
      backgroundColor: "#FFFF00",
    });
    expect(parseStyleDeclarations("background: rgb(255, 255, 0)")).toEqual({
      backgroundColor: "#FFFF00",
    });
  });

  it("이미지·반복 토큰이 섞인 background 축약형에서 색을 읽는다", () => {
    expect(
      parseStyleDeclarations("background: url(http://x/a.png) no-repeat #fff"),
    ).toEqual({ backgroundColor: "#FFFFFF" });
  });

  it("나중에 선언된 background/background-color가 앞선 값을 덮는다", () => {
    expect(
      parseStyleDeclarations("background:#FFFF00;background-color:#00FF00"),
    ).toEqual({ backgroundColor: "#00FF00" });
    expect(
      parseStyleDeclarations("background-color:#00FF00;background:#FFFF00"),
    ).toEqual({ backgroundColor: "#FFFF00" });
  });

  it("알 수 없는 선언은 조용히 버린다", () => {
    expect(
      parseStyleDeclarations("font-family: Arial; mso-number-format:'0';"),
    ).toEqual({});
  });

  it("정렬 값이 정규 형식이 아니면 버린다", () => {
    expect(parseStyleDeclarations("text-align: justify")).toEqual({});
  });

  it("색 이름을 읽는다", () => {
    expect(parseStyleDeclarations("color: red")).toEqual({ color: "#FF0000" });
  });

  it("색으로 읽을 수 없는 값은 버린다", () => {
    expect(parseStyleDeclarations("color: bogus")).toEqual({});
    expect(parseStyleDeclarations("background: red blue")).toEqual({});
  });

  it("속성 값 앞 쓰레기 글자 뒤의 속성도 읽는다(옛 정규식과 같다)", () => {
    expect(parseStyleDeclarations("x color: #ff0000")).toEqual({
      color: "#FF0000",
    });
  });
});

// Chromium 계산 색과 같은 마크를 내는지 대조하는 표다. 각 행은 [style, 기대]다.
const declarationTable: Array<[string, StyleDeclarations]> = [
  ["color:#ff0000 /*c*/", { color: "#FF0000" }],
  ["color:/*c*/#ff0000", { color: "#FF0000" }],
  ["color:red/*c*/", { color: "#FF0000" }],
  ["color:re/**/d", {}],
  ["color:#ff/**/0000", {}],
  ["color:/*;*/red", { color: "#FF0000" }],
  [
    "color:red;/*c*/background:blue",
    { color: "#FF0000", backgroundColor: "#0000FF" },
  ],
  ["/*color:red*/background:blue", { backgroundColor: "#0000FF" }],
  ["color:red /* unterminated", { color: "#FF0000" }],
  ["background:/*c*/ yellow /*d*/", { backgroundColor: "#FFFF00" }],
  ["color:#ff0000 !important", { color: "#FF0000" }],
  ["color:red!important", { color: "#FF0000" }],
  ["color:red ! important", { color: "#FF0000" }],
  ["color:red !IMPORTANT", { color: "#FF0000" }],
  ["color:red!important!important", {}],
  ["color:red !imp", {}],
  ["color:red !important x", {}],
  ["color:#0000ff !important;color:#ff0000", { color: "#0000FF" }],
  ["color:#0000ff;color:#ff0000 !important", { color: "#FF0000" }],
  ["color:#0000ff !important;color:#ff0000 !important", { color: "#FF0000" }],
  ["color:#ff0000 !important;color:#0000ff !important", { color: "#0000FF" }],
  ["color:red !important;color:bogus", { color: "#FF0000" }],
  ["color:red !important;color:bogus !important", { color: "#FF0000" }],
  ["color:red !important;color:inherit", { color: "#FF0000" }],
  ["color:red !important;color:transparent", { color: "#FF0000" }],
  ["color:red;color:blue !important;color:green", { color: "#0000FF" }],
  [
    "background-color:#ff0000 !important;background:#0000ff",
    { backgroundColor: "#FF0000" },
  ],
  [
    "background:#ff0000 !important;background-color:#0000ff",
    { backgroundColor: "#FF0000" },
  ],
  [
    "background-color:#ff0000;background:#0000ff !important",
    { backgroundColor: "#0000FF" },
  ],
  [
    "background-color:#ff0000 !important;background:url(x.png)",
    { backgroundColor: "#FF0000" },
  ],
  [
    "background:#ff0000 !important;background:url(x.png)",
    { backgroundColor: "#FF0000" },
  ],
  [
    "background:red !important;background:blue !important",
    { backgroundColor: "#0000FF" },
  ],
  ["color:#0000ff;color:inherit", {}],
  ["color:#0000ff;color:transparent", {}],
  ["color:#0000ff;color:red", { color: "#FF0000" }],
  ["color:red;color:#0000ff", { color: "#0000FF" }],
  ["color:#0000ff;color:bogus", { color: "#0000FF" }],
  ["color:bogus;color:#0000ff", { color: "#0000FF" }],
  ["color:#0000ff;color:rgba(255,0,0,0.5)", {}],
  ["color:#0000ff;color:currentcolor", {}],
  ["color:#0000ff;color:unset", {}],
  ["background-color:#ff0000;background:url(x.png)", {}],
  ["background-color:#ff0000;background:none", {}],
  ["background-color:#ff0000;background:linear-gradient(red,blue)", {}],
  [
    "background-color:#ff0000;background:#00ff00",
    { backgroundColor: "#00FF00" },
  ],
  [
    "background:#00ff00;background-color:#ff0000",
    { backgroundColor: "#FF0000" },
  ],
  ["background:#00ff00;background-color:transparent", {}],
  ["background:#00ff00;background-color:inherit", {}],
  ["background:#00ff00;background:bogus", { backgroundColor: "#00FF00" }],
  ["background:#00ff00;background:red blue", { backgroundColor: "#00FF00" }],
  ["background:#00ff00;background:red,blue", { backgroundColor: "#00FF00" }],
  ["background:#00ff00;background-color:bogus", { backgroundColor: "#00FF00" }],
  ["background-color:#ff0000;background:inherit", {}],
  ["background-color:#ff0000;background:initial", {}],
  ["background-color:#ff0000;background:rgba(0,0,0,0)", {}],
  [
    "background:url(x.png) #ff0000;color:blue",
    { color: "#0000FF", backgroundColor: "#FF0000" },
  ],
  [
    "background:red;color:blue;background-color:green",
    { color: "#0000FF", backgroundColor: "#008000" },
  ],
  [
    "background-color:rgba(0,0,0,0);background-color:#ffff00",
    { backgroundColor: "#FFFF00" },
  ],
  ["background-color:#ffff00;background-color:rgba(0,0,0,0)", {}],
  [
    "background:url(data:image/png;base64,AAAA) #ffff00;color:#ff0000",
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  [
    "background:url(data:image/png;base64,AAAA);color:#ff0000",
    { color: "#FF0000" },
  ],
  [
    "background:url('a;b.png') #ffff00;color:#ff0000",
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  [
    'background:url("a;b.png") #ffff00;color:#ff0000',
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  [
    "color:red;;;background:blue",
    { color: "#FF0000", backgroundColor: "#0000FF" },
  ],
  ["color:red;", { color: "#FF0000" }],
  ["color:red;background", { color: "#FF0000" }],
  ["background:rgb(255,0,0;color:blue", {}],
  ["color:rgb(255,0,0;color:blue", {}],
  ["font-family:'a;b';color:red", { color: "#FF0000" }],
  ['font-family:"a;b";color:red', { color: "#FF0000" }],
  ["COLOR:RED", { color: "#FF0000" }],
  ["Background-Color:Yellow", { backgroundColor: "#FFFF00" }],
  ["BACKGROUND:YELLOW", { backgroundColor: "#FFFF00" }],
  ["color : red", { color: "#FF0000" }],
  ["color\n:\nred", { color: "#FF0000" }],
  ["  color:red  ", { color: "#FF0000" }],
  ["background : url( x.png ) yellow", { backgroundColor: "#FFFF00" }],
  [
    "color:red;background:yellow",
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  [
    "color:#FF0000;background:#FFFF00",
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  [
    "mso-foo:bar;color:red;font-size:12pt;background:#ffff00",
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  ["background:yellow;mso-pattern:auto none", { backgroundColor: "#FFFF00" }],
  [
    "color:red;background:#FFFF00;font-size:11.0pt",
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  [
    "background:white;color:black",
    { color: "#000000", backgroundColor: "#FFFFFF" },
  ],
  ["background:silver", { backgroundColor: "#C0C0C0" }],
  [
    "color:Black;background:Lime",
    { color: "#000000", backgroundColor: "#00FF00" },
  ],
  [
    "color:rgb(255, 0, 0); background-color: rgb(255, 255, 0)",
    { color: "#FF0000", backgroundColor: "#FFFF00" },
  ],
  ["color:rgba(255, 0, 0, 0.5); background-color: rgba(255, 255, 0, 0.5)", {}],
];

describe("parseStyleDeclarations의 색 선언 우선순위 (Issue #333)", () => {
  it.each(declarationTable)(
    "style %j은 Chromium과 같은 색을 낸다",
    (style, expected) => {
      expect(parseStyleDeclarations(style)).toEqual(expected);
    },
  );

  // 아래 행은 Chromium이 색을 정하지만 여기서는 정하지 않는 경우(한계)이거나
  // 센티널 판정이 모호한 경우라 표 밖에서 계획 규칙대로 고정한다.
  it("읽지 않는 값(lab·var)은 무효 선언이라 앞 값을 유지한다", () => {
    expect(
      parseStyleDeclarations("color:#0000ff;color:lab(50% 40 59)"),
    ).toEqual({ color: "#0000FF" });
    expect(parseStyleDeclarations("color:#0000ff;color:var(--c)")).toEqual({
      color: "#0000FF",
    });
  });

  it("color:initial은 이 요소의 앞 색을 지우고 색을 정하지 않는다", () => {
    expect(parseStyleDeclarations("color:#0000ff;color:initial")).toEqual({});
  });

  it("background-color:currentcolor는 마크를 만들지 않고 앞 배경색을 지운다", () => {
    expect(
      parseStyleDeclarations(
        "background-color:#ffff00;background-color:currentcolor",
      ),
    ).toEqual({});
    expect(parseStyleDeclarations("background:currentcolor")).toEqual({});
  });

  it("text-align은 !important를 읽지 않는 기존 동작을 유지한다", () => {
    expect(
      parseStyleDeclarations("text-align:left!important;color:red"),
    ).toEqual({ color: "#FF0000" });
  });

  it("따옴표·괄호 안의 세미콜론에서 선언을 자르지 않는다", () => {
    expect(
      parseStyleDeclarations("background:url(a;b.png) red;text-align:center"),
    ).toEqual({ backgroundColor: "#FF0000", align: "center" });
  });

  // 따옴표 밖 백슬래시는 다음 글자를 이스케이프한다. 기대값은 Chromium 실측이다.
  it("이스케이프된 여는 괄호는 뒤 선언을 삼키지 않는다", () => {
    expect(
      parseStyleDeclarations("mso:\\(0;background:red;color:blue"),
    ).toEqual({ backgroundColor: "#FF0000", color: "#0000FF" });
  });

  it("이스케이프된 따옴표는 따옴표를 열지 않는다", () => {
    expect(parseStyleDeclarations('mso:\\";background:red;color:blue')).toEqual(
      { backgroundColor: "#FF0000", color: "#0000FF" },
    );
    expect(parseStyleDeclarations("mso:\\';background:red;color:blue")).toEqual(
      { backgroundColor: "#FF0000", color: "#0000FF" },
    );
  });

  it("이스케이프된 세미콜론은 선언을 자르지 않는다", () => {
    expect(parseStyleDeclarations("color:red\\;blue")).toEqual({});
    expect(parseStyleDeclarations("color:blue;x:\\;color:red")).toEqual({
      color: "#0000FF",
    });
  });

  it("이스케이프된 백슬래시 뒤의 세미콜론은 선언을 자른다", () => {
    expect(parseStyleDeclarations("x:a\\\\;color:blue")).toEqual({
      color: "#0000FF",
    });
  });
});

/**
 * 선형 구현으로 바꾸기 전의 `parseStyleDeclarations`를 그대로 복사한 오라클이다.
 * 정규식 `DECLARATION_PATTERN`과 `matchAll` 루프, 색 정규화가 원본과 같다.
 * 새 구현은 이 사본과 모든 코퍼스 입력에서 결과가 같아야 한다. 이 사본을
 * 고치거나 최적화하지 않는다. 정규식이 입력 길이에 이차 시간이라는 이유로
 * 새 구현을 만들었으므로, 이 사본에는 긴 입력을 넣지 않는다.
 */
const legacyParseStyleDeclarations = (style: string): StyleDeclarations => {
  const pattern = /([a-zA-Z-]+)\s*:\s*([^;]+)/g;
  const toHexChannel = (value: number): string =>
    Math.min(255, Math.max(0, value))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  const normalizeColor = (rawValue: string): string | undefined => {
    const trimmed = rawValue.trim();
    const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
    if (hexMatch !== null) {
      const upper = `#${hexMatch[1]?.toUpperCase()}`;
      return isCanonicalCellColor(upper) ? upper : undefined;
    }
    const rgbMatch =
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(
        trimmed,
      );
    if (rgbMatch !== null) {
      const [, r, g, b] = rgbMatch;
      const hex = `#${toHexChannel(Number(r))}${toHexChannel(Number(g))}${toHexChannel(Number(b))}`;
      return isCanonicalCellColor(hex) ? hex : undefined;
    }
    return undefined;
  };

  const result: StyleDeclarations = {};
  for (const match of style.matchAll(pattern)) {
    const property = match[1]?.trim().toLowerCase();
    const rawValue = match[2]?.trim();
    if (property === undefined || rawValue === undefined) continue;
    if (property === "color") {
      const normalized = normalizeColor(rawValue);
      if (normalized !== undefined) result.color = normalized;
    } else if (property === "background-color" || property === "background") {
      const normalized = normalizeColor(rawValue);
      if (normalized !== undefined) result.backgroundColor = normalized;
    } else if (property === "text-align") {
      const value = rawValue.toLowerCase();
      if (isCanonicalCellAlign(value)) result.align = value;
    }
  }
  return result;
};

// 색 값 판정이 바뀐 행(`!important`, 복합 `background`, rgba 알파, 색 이름)은
// 이 코퍼스에 두지 않는다. 옛 구현과 결과가 다른 게 정답이라 위 선언 표와
// `css-color.test.ts`가 맡는다.
const oracleCorpus: Array<[string, string]> = [
  ["빈 문자열", ""],
  ["기본 세 선언", "color:#ff0000;background-color:#00FF00;text-align:right;"],
  [
    "속성 이름 대문자",
    "COLOR:#ff0000;Background-Color:#00ff00;TEXT-ALIGN:Right",
  ],
  ["값 대문자 정렬", "text-align:CENTER"],
  ["콜론 앞뒤 공백", "color  :  #ff0000 ; text-align : left"],
  ["속성 앞 공백", "   color:#ff0000;\n\ttext-align:right"],
  ["속성 앞 쓰레기 글자", "x color: #ff0000"],
  ["속성 앞 숫자와 콜론", "1: color: #ff0000"],
  ["빈 선언이 앞선 입력", ";;color:#ff0000"],
  ["숫자가 붙은 속성", "x1color:#ff0000"],
  ["속성 사이 공백 토큰", "mso foo color:#ff0000"],
  ["값 안 콜론", "color:#ff0000:x;text-align:left:right"],
  ["콜론 연속", "color::#ff0000"],
  ["콜론이 여럿인 선언", "a:b:color:#ff0000"],
  ["값이 빈 선언", "color:;text-align:left"],
  ["값 없이 끝나는 선언", "text-align:left;color:"],
  ["공백뿐인 값", "color:   ;text-align:right"],
  ["공백뿐인 값으로 끝남", "color:   "],
  ["세미콜론 없음", "color:#abcdef"],
  ["속성 이름만 있는 조각", "color;text-align;background"],
  ["속성 이름과 공백만 있는 조각", "color   ;  text-align  "],
  ["콜론만 있는 조각", ":;:::;color:#ff0000"],
  ["숫자 뒤 콜론", "12:34;color:#ff0000"],
  ["하이픈만 있는 속성", "-:red;--:x;color:#ff0000"],
  ["background 축약형", "background:#FFFF00"],
  ["background rgb 축약형", "background: rgb(255, 255, 0)"],
  [
    "background 뒤 background-color",
    "background:#111111;background-color:#222222",
  ],
  [
    "background-color 뒤 background",
    "background-color:#222222;background:#111111",
  ],
  [
    "url data 값 안 세미콜론",
    "background:url(data:image/png;base64,AAAA);color:#ff0000",
  ],
  [
    "url data 뒤 색",
    "background-image:url(data:image/png;base64,AAAA) ;color:#00ff00",
  ],
  ["rgb 범위 초과", "color:rgb(300, 0, 0)"],
  ["알 수 없는 선언", "font-family: Arial; mso-number-format:'0';"],
  ["정렬 허용 밖 값", "text-align: justify"],
  ["나중 선언이 이김", "color:#111111;color:#222222"],
  ["줄바꿈이 낀 선언", "color:\n#ff0000\n;\ntext-align\n:\nright"],
  ["속성과 콜론 사이 줄바꿈", "color\n\n:#ff0000"],
  ["NBSP가 낀 선언", "color\u00a0:\u00a0#ff0000"],
  ["BOM이 낀 선언", "\ufeffcolor:#ff0000"],
  ["비ASCII 글자가 낀 속성", "é color:#ff0000;éolor:#00ff00"],
  ["속성 뒤 쓰레기 뒤 콜론", "color x:#ff0000"],
  ["공백 뒤 숫자 뒤 콜론", "color 1:#ff0000;text-align 1 :left"],
  ["콜론 직전 선언 끝", "text-align:left;color :"],
];

describe("parseStyleDeclarations 오라클 대조", () => {
  it.each(oracleCorpus)(
    "%s은 기존 정규식 구현과 결과가 같다",
    (_name, style) => {
      expect(parseStyleDeclarations(style)).toEqual(
        legacyParseStyleDeclarations(style),
      );
    },
  );

  it("모든 UTF-16 코드 유닛에 대해 속성 앞뒤 공백 판정이 정규식 \\s와 같다", () => {
    // 코드 유닛 65,536개 × 3모양을 도는 테스트다. 케이스마다 expect를 부르면
    // 병렬 실행에서 기본 timeout에 가까워져 불일치만 모아 한 번에 단언한다.
    const mismatches: string[] = [];
    for (let unit = 0; unit < 0x10000; unit += 1) {
      const character = String.fromCharCode(unit);
      const beforeColon = `color${character}:#ff0000`;
      const afterColon = `color:${character}#ff0000`;
      const beforeProperty = `${character}text-align:left`;
      for (const style of [beforeColon, afterColon, beforeProperty]) {
        const actual = JSON.stringify(parseStyleDeclarations(style));
        const expected = JSON.stringify(legacyParseStyleDeclarations(style));
        if (actual !== expected) {
          mismatches.push(`U+${unit.toString(16)} ${JSON.stringify(style)}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("parseWhiteSpaceMode", () => {
  it.each([
    ["pre", "preserve"],
    ["pre-wrap", "preserve"],
    ["break-spaces", "preserve"],
    ["pre-line", "pre-line"],
    ["normal", "normal"],
    ["nowrap", "normal"],
  ] as const)("white-space:%s는 %s 모드다", (value, mode) => {
    expect(parseWhiteSpaceMode(`white-space:${value}`)).toBe(mode);
  });

  it.each([
    "inherit",
    "initial",
    "unset",
    "revert",
    "revert-layer",
    "foo",
    "pre foo",
    "",
  ])("white-space:%j는 판정하지 않는다(부모 상속)", (value) => {
    expect(parseWhiteSpaceMode(`white-space:${value}`)).toBeUndefined();
  });

  it("white-space 선언이 없으면 판정하지 않는다", () => {
    expect(parseWhiteSpaceMode("")).toBeUndefined();
    expect(parseWhiteSpaceMode("color:red")).toBeUndefined();
    expect(parseWhiteSpaceMode("white-space")).toBeUndefined();
    expect(parseWhiteSpaceMode("x-white-space:pre")).toBeUndefined();
  });

  it("대소문자·공백을 무시하고 !important 선언을 읽는다", () => {
    expect(parseWhiteSpaceMode("  WHITE-SPACE :  PRE-WRAP  !important ")).toBe(
      "preserve",
    );
    expect(parseWhiteSpaceMode("White-Space:Pre-Line!IMPORTANT")).toBe(
      "pre-line",
    );
  });

  it("다른 선언 사이에서 읽는다", () => {
    expect(parseWhiteSpaceMode("color:red;white-space:pre;margin:0")).toBe(
      "preserve",
    );
  });

  it("마지막 선언이 이긴다", () => {
    expect(parseWhiteSpaceMode("white-space:pre;white-space:normal")).toBe(
      "normal",
    );
    expect(parseWhiteSpaceMode("white-space:normal;white-space:pre-line")).toBe(
      "pre-line",
    );
  });

  it.each(["inherit", "initial", "unset", "revert", "revert-layer"])(
    "마지막 선언이 %s이면 앞 선언을 지우고 판정하지 않는다(부모 상속)",
    (keyword) => {
      expect(
        parseWhiteSpaceMode(`white-space:pre;white-space:${keyword}`),
      ).toBeUndefined();
    },
  );

  it.each(["foo", "pre foo", "", "-o-pre-wrap", "pre pre", "nowrap wrap"])(
    "무효 선언 white-space:%j는 버리고 앞 선언을 유지한다",
    (value) => {
      expect(parseWhiteSpaceMode(`white-space:pre;white-space:${value}`)).toBe(
        "preserve",
      );
      expect(
        parseWhiteSpaceMode(`white-space:pre-line;white-space:${value}`),
      ).toBe("pre-line");
    },
  );

  it.each([
    ["preserve", "preserve"],
    ["preserve nowrap", "preserve"],
    ["nowrap preserve", "preserve"],
    ["preserve wrap", "preserve"],
    ["break-spaces nowrap", "preserve"],
    ["preserve-breaks", "pre-line"],
    ["preserve-breaks nowrap", "pre-line"],
    ["collapse", "normal"],
    ["collapse nowrap", "normal"],
    ["wrap", "normal"],
    ["  PRESERVE   NOWRAP  ", "preserve"],
  ] as const)("CSS Text 4 값 white-space:%j는 %s 모드다", (value, mode) => {
    expect(parseWhiteSpaceMode(`white-space:${value}`)).toBe(mode);
  });

  it("두 축약형 값 사이의 마지막 유효 선언이 이긴다", () => {
    expect(
      parseWhiteSpaceMode("white-space:preserve;white-space:collapse"),
    ).toBe("normal");
  });

  // 아래는 Issue #361이 더한 규칙이다. 선언을 색 경로·parseInlineStyleMarks와
  // 같은 흐름(splitDeclarations, readDeclaration, splitImportant, 칸)으로 읽는다.
  // 기대값은 Chromium 153.0.8010.12 실측이다. 부모 div white-space:pre-line 안
  // span의 계산값을 읽었다. undefined는 부모 모드 상속이다.
  it("따옴표 안의 white-space는 선언이 아니다", () => {
    expect(
      parseWhiteSpaceMode('font-family:"a;white-space:pre;b"'),
    ).toBeUndefined();
  });

  it.each([
    "white-space:pre !important;white-space:normal",
    "white-space:pre ! important;white-space:normal",
  ])("%j에서 !important 선언은 뒤 일반 선언에 지지 않는다", (style) => {
    expect(parseWhiteSpaceMode(style)).toBe("preserve");
  });

  it.each([
    ["white-space:inherit !important;white-space:pre", undefined],
    [
      "white-space:normal;white-space:inherit !important;white-space:pre",
      undefined,
    ],
    ["white-space:pre !important;white-space:inherit", "preserve"],
    ["white-space:pre !important;white-space:foo !important", "preserve"],
    ["white-space:pre !important;white-space:pre-line !important", "pre-line"],
    ["white-space:pre!IMPORTANT;white-space:normal", "preserve"],
    ["white-space:pre !important ;white-space:normal", "preserve"],
    ["white-space:pre;/*;white-space:normal*/", "preserve"],
    ["white-space:/*c*/pre", "preserve"],
    ["background:url(a;white-space:pre);color:red", undefined],
    ["white-space:pre\\;white-space:normal", undefined],
  ] as const)("Chromium처럼 %j를 %s로 읽는다", (style, mode) => {
    expect(parseWhiteSpaceMode(style)).toBe(mode);
  });
});

/*
 * 아래는 Issue #334 단계 A가 더한 규칙이다: font-weight 분류의 light, font
 * 줄임 속성, 색 칸의 상태(unset·clear·color). 기대값은 Chromium
 * getComputedStyle 실측(2026-10-10)이다.
 */

describe("parseStyleColorStates", () => {
  it("선언이 없으면 둘 다 unset이다", () => {
    expect(parseStyleColorStates("")).toEqual({
      color: { kind: "unset" },
      backgroundColor: { kind: "unset" },
    });
    expect(parseStyleColorStates("font-weight:700")).toEqual({
      color: { kind: "unset" },
      backgroundColor: { kind: "unset" },
    });
  });

  it("읽은 색은 정규 형식 color다", () => {
    expect(
      parseStyleColorStates("color:red;background-color:rgb(0,0,255)"),
    ).toEqual({
      color: { kind: "color", color: "#FF0000" },
      backgroundColor: { kind: "color", color: "#0000FF" },
    });
  });

  it.each([
    ["background-color:transparent"],
    ["background-color:rgba(0,0,255,.5)"],
    ["background-color:inherit"],
    ["background-color:initial"],
    ["background-color:currentcolor"],
    ["background:none"],
    ["background:url(x.png)"],
    ["background-color:red;background-color:transparent"],
    ["background-color:transparent;background-color:bogus"],
    ["background:red;background:url(x.png)"],
  ])("%s는 배경이 clear다", (style) => {
    expect(parseStyleColorStates(style).backgroundColor).toEqual({
      kind: "clear",
    });
  });

  it.each([
    ["background-color:bogus"],
    ["background-color:lab(50% 40 59)"],
    ["background-color:var(--c)"],
  ])("%s는 문법 오류라 배경이 unset이다", (style) => {
    expect(parseStyleColorStates(style).backgroundColor).toEqual({
      kind: "unset",
    });
  });

  it("글자색도 같은 규칙이다", () => {
    expect(parseStyleColorStates("color:red;color:inherit").color).toEqual({
      kind: "clear",
    });
    expect(parseStyleColorStates("color:red;color:bogus").color).toEqual({
      kind: "color",
      color: "#FF0000",
    });
    expect(
      parseStyleColorStates("color:red !important;color:blue").color,
    ).toEqual({ kind: "color", color: "#FF0000" });
  });

  it("parseStyleDeclarations와 같은 선언을 같은 결과로 읽는다", () => {
    const style =
      "color:#ff0000;background:url(x.png) #00ff00;text-align:right";
    expect(parseStyleDeclarations(style)).toEqual({
      color: "#FF0000",
      backgroundColor: "#00FF00",
      align: "right",
    });
    expect(parseStyleColorStates(style)).toEqual({
      color: { kind: "color", color: "#FF0000" },
      backgroundColor: { kind: "color", color: "#00FF00" },
    });
  });
});

describe("parseInlineStyleMarks의 font-weight 분류", () => {
  // 유효하지만 굵지 않은 값은 light다. normal·400은 normal로 남는다.
  // inherit·unset은 부모를 따르므로 light가 아니라 inherit다.
  it.each([
    ["1", "light"],
    ["100", "light"],
    ["300", "light"],
    ["399.9", "light"],
    ["500", "light"],
    ["599", "light"],
    ["599.9", "light"],
    ["5e2", "light"],
    [".5e3", "light"],
    ["+300", "light"],
    ["300.0", "light"],
    ["lighter", "light"],
    ["LIGHTER", "light"],
    ["inherit", "inherit"],
    ["initial", "light"],
    ["unset", "inherit"],
    ["normal", "normal"],
    ["400", "normal"],
    ["400.0", "normal"],
    ["600", "bold"],
    ["700", "bold"],
    ["700.5", "bold"],
    ["1000", "bold"],
    ["1e3", "bold"],
    ["bold", "bold"],
    ["bolder", "bold"],
    ["BOLD", "bold"],
    ["bold !important", "bold"],
    ["300 !important", "light"],
  ] as Array<[string, InlineFontWeight]>)(
    "font-weight:%s는 %s다",
    (value, expected) => {
      expect(parseInlineStyleMarks(`font-weight:${value}`).fontWeight).toBe(
        expected,
      );
    },
  );

  // revert·revert-layer는 UA 굵기(b·strong은 굵게)로 돌아가므로 굵기를 정하지
  // 않는다.
  it.each([["revert"], ["revert-layer"]])(
    "font-weight:%j는 other다",
    (value) => {
      expect(parseInlineStyleMarks(`font-weight:${value}`).fontWeight).toBe(
        "other",
      );
    },
  );

  // 무효한 값은 선언이 버려져 굵기를 정하지 않는다(Issue #339). 예전에는
  // other로 남겼지만 소비자에서 undefined와 결과가 같다. calc()는 읽지 않는다
  // (Chromium은 유효로 보고 굵기를 계산한다, 한계).
  it.each([["foo"], ["0"], ["1001"], ["-1"], ["1e"], ["calc(300)"], [""]])(
    "font-weight:%j는 무효라 굵기를 정하지 않는다",
    (value) => {
      expect(
        parseInlineStyleMarks(`font-weight:${value}`).fontWeight,
      ).toBeUndefined();
    },
  );

  it("무효한 선언은 앞의 유효한 분류를 지우지 않는다", () => {
    expect(
      parseInlineStyleMarks("font-weight:300;font-weight:bogus").fontWeight,
    ).toBe("light");
    expect(
      parseInlineStyleMarks("font-weight:bogus;font-weight:300").fontWeight,
    ).toBe("light");
    expect(
      parseInlineStyleMarks("font-weight:bogus;font-weight:bogus2").fontWeight,
    ).toBeUndefined();
  });

  it("revert는 앞의 유효한 분류를 other로 덮는다", () => {
    expect(
      parseInlineStyleMarks("font-weight:700;font-weight:revert").fontWeight,
    ).toBe("other");
  });
});

// 아래 표는 각 값을 `font:<값>`으로 읽은 Chromium 결과다. 굵기는 계산 굵기가
// 600 이상이면 bold, 400이면 normal, 그 밖은 light이고, 기울임은 계산
// font-style이 normal이 아니면 italic이다. 줄임에 굵기나 기울임이 없으면
// normal이다.
// 거절 표는 Chromium이 선언을 받지 않은 값이다.
const accepted: Array<[string, InlineFontWeight, InlineFontStyle]> = [
  ["italic bold 12px Arial", "bold", "italic"],
  ["bold italic 12px Arial", "bold", "italic"],
  ["oblique 12px Arial", "normal", "italic"],
  ["oblique 10deg 12px Arial", "normal", "italic"],
  ["normal normal normal normal 12px a", "normal", "normal"],
  ["small-caps bold 12px a", "bold", "normal"],
  ["bold small-caps italic condensed 12px a", "bold", "italic"],
  ["condensed 12px a", "normal", "normal"],
  ["condensed bold italic 12px a", "bold", "italic"],
  ["bold expanded 12px a", "bold", "normal"],
  ["bold 12px/1.5 Arial", "bold", "normal"],
  ["12px / 1.5 Arial", "normal", "normal"],
  ["12px /1.5 Arial", "normal", "normal"],
  ["12px/ 1.5 Arial", "normal", "normal"],
  ["bold 0 Arial", "bold", "normal"],
  ["700 12px Arial", "bold", "normal"],
  ["1 12px a", "light", "normal"],
  ["1000 12px a", "bold", "normal"],
  ["700.5 12px a", "bold", "normal"],
  ["599.9 12px a", "light", "normal"],
  ["bolder 12px a", "bold", "normal"],
  ["lighter 12px a", "light", "normal"],
  ["larger a", "normal", "normal"],
  ["xx-small a", "normal", "normal"],
  ["smaller serif", "normal", "normal"],
  ["50% a", "normal", "normal"],
  ['12px "Times New Roman", serif', "normal", "normal"],
  ["12px 'a b'", "normal", "normal"],
  ["12px a b", "normal", "normal"],
  ["12px a, b", "normal", "normal"],
  ["caption", "normal", "normal"],
  ["icon", "normal", "normal"],
  ["menu", "normal", "normal"],
  ["message-box", "normal", "normal"],
  ["small-caption", "normal", "normal"],
  ["status-bar", "normal", "normal"],
  ["Caption", "normal", "normal"],
  ["italic 12px/normal a", "normal", "italic"],
  ["12px/1 a", "normal", "normal"],
  ["12px/1.5em a", "normal", "normal"],
  ["12px/150% a", "normal", "normal"],
  ["bold  12px  Arial", "bold", "normal"],
  ["bold\t12px Arial", "bold", "normal"],
  ["bold 12px Arial !important", "bold", "normal"],
  ["bold calc(12px) Arial", "bold", "normal"],
  ["bold calc(1px + 2px) a", "bold", "normal"],
  ["semi-condensed 12px a", "normal", "normal"],
  ["expanded bold 12px a", "bold", "normal"],
  ["bold 12px/normal Arial", "bold", "normal"],
  ["bold 12px serif", "bold", "normal"],
  ["12px system-ui", "normal", "normal"],
  ["12PX Arial", "normal", "normal"],
  ["BOLD 12px ARIAL", "bold", "normal"],
  ['bold 12px "unclosed', "bold", "normal"],
  ["normal 12px a", "normal", "normal"],
  ["normal bold 12px a", "bold", "normal"],
  ["bold normal 12px a", "bold", "normal"],
  ["italic bold small-caps 12px a", "bold", "italic"],
  ["italic 700 normal 12px a", "bold", "italic"],
  ["ultra-condensed italic 12px a", "normal", "italic"],
  ["oblique 20deg bold 12px a", "bold", "italic"],
  ["12px a  b", "normal", "normal"],
  ["bold 12px -a", "bold", "normal"],
  ["bold 12px --a", "bold", "normal"],
  ["bold .5em a", "bold", "normal"],
  ["bold +12px a", "bold", "normal"],
  ["bold 1e1px a", "bold", "normal"],
  ["bold 12PX a", "bold", "normal"],
  ["xxx-large a", "normal", "normal"],
  ["math a", "normal", "normal"],
  ["bold 12px/0 a", "bold", "normal"],
  ["bold 12px/1.5 a, b", "bold", "normal"],
  ["oblique 90deg 12px a", "normal", "italic"],
  ["oblique -10deg 12px a", "normal", "italic"],
  ["oblique 1turn 12px a", "normal", "italic"],
  ["oblique 0.1turn 12px a", "normal", "italic"],
  ["oblique 10 12px a", "light", "italic"],
  ["calc(12px) a", "normal", "normal"],
  ["min(1px,2px) a", "normal", "normal"],
  ["clamp(1px,2px,3px) a", "normal", "normal"],
  ["MEDIUM a", "normal", "normal"],
  ["12Px a", "normal", "normal"],
  ["1e1px a", "normal", "normal"],
  [".5em a", "normal", "normal"],
  ["0.0px a", "normal", "normal"],
  ["0% a", "normal", "normal"],
  ["-0 a", "normal", "normal"],
  ["-0px a", "normal", "normal"],
  ["+0 a", "normal", "normal"],
  ["12px/.5 a", "normal", "normal"],
  ["12px/1e1 a", "normal", "normal"],
  ["12px/calc(1px) a", "normal", "normal"],
  ["12px/normal a", "normal", "normal"],
  ["12px/ normal a", "normal", "normal"],
  ["12px/-0 a", "normal", "normal"],
  ["12px/0 a", "normal", "normal"],
  ["12px/50% a", "normal", "normal"],
  ["12px/1.5em a", "normal", "normal"],
  ['italic 12px/1.5 "A B", serif', "normal", "italic"],
  ["bold 12px 'unclosed", "bold", "normal"],
  ['bold 12px "a" , b', "bold", "normal"],
  ["bold 12px a , b", "bold", "normal"],
  ["12px a-b", "normal", "normal"],
  ["12px a_b", "normal", "normal"],
  ["12px _a", "normal", "normal"],
  ["12px 日本語", "normal", "normal"],
  ["12px a1", "normal", "normal"],
  ["bold 1e400px a", "bold", "normal"],
  ["bold 1px a", "bold", "normal"],
  ["800 12px a", "bold", "normal"],
  ["bold 12px/1.5 Arial !important", "bold", "normal"],
  ["  bold   12px   Arial  ", "bold", "normal"],
  ["bold 12px\tArial", "bold", "normal"],
];
const rejected = [
  "italic oblique 12px a",
  "italic italic 12px a",
  "normal normal normal normal normal 12px a",
  "bold 12px",
  "12px",
  "bold 12 Arial",
  "1001 12px Arial",
  "0 12px a",
  "12px ,a",
  "12px 1a",
  "bold inherit",
  "50% 12px a",
  "bold 12px/ Arial",
  "italic bold",
  "bold italic",
  "italic bold 12px",
  "bold 12px Arial,",
  "bold 12px/1.5",
  "12px/1.5",
  "bold bold 12px a",
  // stretch 키워드는 한 번만 쓴다. Chromium 실측(2026-10-10)에서 모두 무효다.
  "condensed expanded 12px a",
  "condensed condensed 12px a",
  "ultra-condensed extra-condensed 12px a",
  "bold condensed expanded 12px a",
  "condensed bold expanded 12px a",
  "italic condensed expanded bold 12px a",
  "semi-expanded italic ultra-expanded 12px a",
  "normal condensed expanded 12px a",
  "condensed normal expanded 12px a",
  "bold 700 12px a",
  "small-caps small-caps 12px a",
  "oblique 10deg 20deg 12px a",
  "12px a/b",
  '12px "a"b',
  "bold -12px a",
  "bold 12.px a",
  "12px/-1 a",
  "12px/1px/2 a",
  "bold 12px initial",
  "bold 12px inherit",
  "bold 12px default",
  "bold 12px serif, inherit",
  "oblique 10px 12px a",
  "oblique 10deg italic 12px a",
  "italic oblique 10deg 12px a",
  "12 a",
  "1e1 a",
  "5.em a",
  "bold normal a",
  "normal a",
  "status-bar bold",
  "bold caption",
  "bold 12px serif,",
  "bold 12px a,,b",
  "12px a.b",
  "12px a!",
];

const fontShorthand = (value: string) => parseInlineStyleMarks(`font:${value}`);

describe("parseInlineStyleMarks의 font 줄임 속성", () => {
  it.each(accepted)(
    "font:%s는 굵기 %s, 기울임 %s다",
    (value, weight, italic) => {
      const parsed = fontShorthand(value);
      expect(parsed.fontWeight).toBe(weight);
      expect(parsed.fontStyle).toBe(italic);
    },
  );

  // 문법 오류 선언은 통째로 버린다. 아무것도 읽지 않는다.
  it.each(rejected)("font:%s는 문법 오류라 아무것도 읽지 않는다", (value) => {
    expect(fontShorthand(value)).toEqual({
      fontWeight: undefined,
      fontStyle: undefined,
      underline: false,
      strike: false,
    });
  });

  it("시스템 글꼴 키워드는 normal이고 기울임이 아니다", () => {
    for (const value of [
      "caption",
      "icon",
      "menu",
      "message-box",
      "small-caption",
      "status-bar",
      "CAPTION",
    ]) {
      expect(fontShorthand(value)).toMatchObject({
        fontWeight: "normal",
        fontStyle: "normal",
      });
    }
  });

  it("전역 키워드는 부모를 따르거나 정하지 않거나 normal로 읽는다", () => {
    expect(fontShorthand("inherit")).toMatchObject({
      fontWeight: "inherit",
      fontStyle: "inherit",
    });
    expect(fontShorthand("unset")).toMatchObject({
      fontWeight: "inherit",
      fontStyle: "inherit",
    });
    expect(fontShorthand("initial")).toMatchObject({
      fontWeight: "normal",
      fontStyle: "normal",
    });
    expect(fontShorthand("revert")).toMatchObject({
      fontWeight: "other",
      fontStyle: undefined,
    });
    expect(fontShorthand("revert-layer")).toMatchObject({
      fontWeight: "other",
      fontStyle: undefined,
    });
  });

  it("공백 종류와 !important와 대소문자를 무시한다", () => {
    expect(fontShorthand("bold\t12px\tArial")).toMatchObject({
      fontWeight: "bold",
    });
    expect(fontShorthand("ITALIC BOLD 12PX ARIAL !important")).toMatchObject({
      fontWeight: "bold",
      fontStyle: "italic",
    });
  });

  it("뒤의 줄임이 앞의 font-weight와 font-style을 덮는다", () => {
    expect(
      parseInlineStyleMarks("font-weight:700;font-style:italic;font:12px a"),
    ).toMatchObject({ fontWeight: "normal", fontStyle: "normal" });
  });

  it("줄임 뒤의 font-weight와 font-style이 줄임을 덮는다", () => {
    expect(
      parseInlineStyleMarks("font:12px a;font-weight:700;font-style:italic"),
    ).toMatchObject({ fontWeight: "bold", fontStyle: "italic" });
  });

  it("문법 오류 줄임은 앞의 값을 지우지 않는다", () => {
    expect(
      parseInlineStyleMarks("font-weight:700;font-style:italic;font:bogus"),
    ).toMatchObject({ fontWeight: "bold", fontStyle: "italic" });
  });

  it("밑줄·취소선은 줄임이 건드리지 않는다", () => {
    expect(
      parseInlineStyleMarks("text-decoration:underline;font:bold 12px a"),
    ).toMatchObject({ underline: true, strike: false, fontWeight: "bold" });
  });
});

// Chromium 153 복사 원문의 선언 순서에 기댄다(Issue #341). 인라인 style이 준
// text-decoration은 표식 뒤에 오고 작성자 값은 그 뒤에 붙는다. 앵커는 표식 뒤의
// 마지막 text-decoration* 선언이다. 표식 앞의 text-decoration*은 스타일시트가
// 준 것이라 앵커가 아니다.
describe("readDumpAuthorDeclarations", () => {
  const DUMP = "-webkit-text-stroke-width: 0px";
  const DECORATION =
    "text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial";

  /** 돌려받은 선언 부분을 색 판정기에 넣은 결과다. */
  const statesOfAuthorPart = (style: string) =>
    parseStyleColorStates(readDumpAuthorDeclarations(style) ?? "");

  it("덤프 표식이 없으면 undefined다", () => {
    expect(readDumpAuthorDeclarations("")).toBeUndefined();
    expect(
      readDumpAuthorDeclarations(
        "color: red; text-decoration-color: initial; background: #fff",
      ),
    ).toBeUndefined();
  });

  it("표식이 있고 text-decoration* 선언이 없으면 빈 문자열이다", () => {
    expect(
      readDumpAuthorDeclarations(
        `color: red; ${DUMP}; white-space: normal; background-color: #fff`,
      ),
    ).toBe("");
    expect(readDumpAuthorDeclarations(DUMP)).toBe("");
  });

  it("마지막 text-decoration* 선언 뒤의 선언만 돌려준다", () => {
    const style = `color: rgb(36, 41, 47); ${DUMP}; white-space: normal; background-color: rgb(255, 255, 255); ${DECORATION}; color: rgb(255, 0, 0)`;
    expect(readDumpAuthorDeclarations(style)).toBe(" color: rgb(255, 0, 0)");
    expect(statesOfAuthorPart(style)).toEqual({
      color: { kind: "color", color: "#FF0000" },
      backgroundColor: { kind: "unset" },
    });
  });

  it("text-decoration* 뒤에 선언이 없으면 빈 문자열이다", () => {
    expect(
      readDumpAuthorDeclarations(`color: red; ${DUMP}; ${DECORATION}`),
    ).toBe("");
    expect(
      readDumpAuthorDeclarations(`color: red; ${DUMP}; ${DECORATION};`),
    ).toBe("");
  });

  it("줄임 text-decoration 뒤의 선언을 돌려준다", () => {
    const style = `${DUMP}; background-color: #fff; text-decoration: underline; color: red; background-color: yellow`;
    expect(statesOfAuthorPart(style)).toEqual({
      color: { kind: "color", color: "#FF0000" },
      backgroundColor: { kind: "color", color: "#FFFF00" },
    });
  });

  it("text-decoration이 여러 번이면 마지막 것 뒤만 돌려준다", () => {
    const style = `${DUMP}; text-decoration: underline; color: blue; text-decoration-line: none; background-color: yellow`;
    expect(statesOfAuthorPart(style)).toEqual({
      color: { kind: "unset" },
      backgroundColor: { kind: "color", color: "#FFFF00" },
    });
  });

  it("text-decoration으로 시작하지 않는 속성은 기준이 아니다", () => {
    const style = `${DUMP}; color: red; text-decorations: none; background-color: yellow`;
    expect(readDumpAuthorDeclarations(style)).toBe("");
  });

  it("속성 이름의 대소문자를 무시한다", () => {
    const style = `-WEBKIT-Text-Stroke-Width: 0px; Color: blue; TEXT-DECORATION-COLOR: initial; COLOR: red`;
    expect(statesOfAuthorPart(style).color).toEqual({
      kind: "color",
      color: "#FF0000",
    });
  });

  it("!important 값을 보존한다", () => {
    const style = `${DUMP}; ${DECORATION}; color: red !important; color: blue`;
    expect(statesOfAuthorPart(style).color).toEqual({
      kind: "color",
      color: "#FF0000",
    });
  });

  it("background 줄임 선언도 돌려준다", () => {
    const style = `${DUMP}; ${DECORATION}; background: rgb(255, 255, 0)`;
    expect(statesOfAuthorPart(style).backgroundColor).toEqual({
      kind: "color",
      color: "#FFFF00",
    });
  });

  it("따옴표·주석 안의 이름은 선언으로 세지 않는다", () => {
    const style = `${DUMP}; content: "a; text-decoration: none"; /* text-decoration: none */ color: red`;
    expect(readDumpAuthorDeclarations(style)).toBe("");
  });

  it("값에 든 text-decoration 이름은 기준이 아니다", () => {
    const style = `${DUMP}; font-family: text-decoration; color: red`;
    expect(readDumpAuthorDeclarations(style)).toBe("");
  });

  // Issue #341 리뷰 F1: 스타일시트 클래스가 준 text-decoration은 표식 앞(style 첫
  // 선언)에 온다. 그 선언은 앵커가 아니다.
  it("표식 앞의 text-decoration은 앵커가 아니라 빈 문자열이다", () => {
    const style = `text-decoration: underline; color: rgb(36, 41, 47); ${DUMP}; white-space: normal; background-color: rgb(255, 255, 255)`;
    expect(readDumpAuthorDeclarations(style)).toBe("");
    expect(statesOfAuthorPart(style)).toEqual({
      color: { kind: "unset" },
      backgroundColor: { kind: "unset" },
    });
  });

  it("표식 앞 text-decoration이 있어도 표식 뒤 앵커 뒤 선언을 돌려준다", () => {
    const style = `text-decoration: underline; color: blue; ${DUMP}; text-decoration-color: initial; color: red`;
    expect(readDumpAuthorDeclarations(style)).toBe(" color: red");
  });

  it("표식이 여러 개면 마지막 표식 뒤만 센다", () => {
    expect(
      readDumpAuthorDeclarations(
        `${DUMP}; text-decoration: none; color: blue; ${DUMP}; background-color: yellow`,
      ),
    ).toBe("");
    expect(
      readDumpAuthorDeclarations(
        `${DUMP}; color: blue; ${DUMP}; text-decoration: none; background: yellow`,
      ),
    ).toBe(" background: yellow");
  });
});

/*
 * 아래는 Issue #362가 더한 규칙이다. 닫히지 않은 따옴표는 개행(LF·CR·FF,
 * CRLF는 개행 하나)에서 끝난다. 그 선언은 bad라 버리고, 다음 `;`부터 선언을
 * 다시 읽는다. 백슬래시 뒤 개행은 문자열을 잇는다. 기대값은 Chromium
 * 153.0.8010.12 실측이다(setAttribute·DOMParser 두 경로 같음, getComputedStyle).
 */
const LINE_SEPARATOR = String.fromCodePoint(0x2028);

describe("닫히지 않은 따옴표와 개행 (Issue #362)", () => {
  it.each([
    "font-family:'a\n;font-weight:bold",
    "font-family:Arial's\n;font-weight:bold",
  ])("parseInlineStyleMarks는 %j를 굵게 읽는다", (style) => {
    expect(parseInlineStyleMarks(style).fontWeight).toBe("bold");
  });

  it.each([
    [
      "font-family:'a\n;background-color:yellow",
      { backgroundColor: "#FFFF00" },
    ],
    ["font-family:Arial's\n;color:red", { color: "#FF0000" }],
  ] as const)(
    "parseStyleDeclarations는 %j에서 뒤 선언을 읽는다",
    (style, expected) => {
      expect(parseStyleDeclarations(style)).toEqual(expected);
    },
  );

  it.each([
    'font-family:"a\n;white-space:pre',
    "font-family:'a\n;white-space:pre",
  ])("parseWhiteSpaceMode는 %j를 preserve로 읽는다", (style) => {
    expect(parseWhiteSpaceMode(style)).toBe("preserve");
  });

  it.each([
    ["CR", "\r"],
    ["FF", "\f"],
    ["CRLF", "\r\n"],
  ])("%s도 따옴표를 끝낸다", (_name, newline) => {
    expect(
      parseInlineStyleMarks(`font-family:'a${newline};font-weight:bold`)
        .fontWeight,
    ).toBe("bold");
  });

  it.each([
    ["VT", "\v"],
    ["U+2028", LINE_SEPARATOR],
    ["백슬래시 뒤 LF", "\\\n"],
    ["백슬래시 뒤 CR", "\\\r"],
    ["백슬래시 뒤 FF", "\\\f"],
    ["백슬래시 뒤 CRLF", "\\\r\n"],
  ])("%s는 따옴표를 끝내지 않아 뒤 선언을 삼킨다", (_name, glyph) => {
    expect(
      parseInlineStyleMarks(`font-family:'a${glyph};font-weight:bold`)
        .fontWeight,
    ).toBeUndefined();
  });

  it("백슬래시 뒤 개행 다음의 닫는 따옴표는 문자열을 닫는다", () => {
    expect(
      parseInlineStyleMarks("font-family:'a\\\nb';font-weight:bold").fontWeight,
    ).toBe("bold");
  });

  // 값 안 판독기(isFamilyList·splitBackgroundLayers)는 bad 선언을 받지 않는다.
  it("개행에서 끝난 font 줄임은 버려 앞 굵게를 지우지 않고 기울이지 않는다", () => {
    const style = "font-weight:bold;font:italic 12px 'a\n;color:red";
    const marks = parseInlineStyleMarks(style);

    expect(marks.fontWeight).toBe("bold");
    expect(marks.fontStyle).toBeUndefined();
    expect(parseStyleDeclarations(style)).toEqual({ color: "#FF0000" });
  });

  it.each([
    ["color:red;color:'a\n", { color: "#FF0000" }],
    ['color:red;color:"blue\n;color:green', { color: "#008000" }],
    ['background:url("a\n") red', {}],
    [
      'background-color:red;background:url("a\n") blue',
      { backgroundColor: "#FF0000" },
    ],
  ] as const)(
    "parseStyleDeclarations는 %j의 bad 선언을 버린다",
    (style, expected) => {
      expect(parseStyleDeclarations(style)).toEqual(expected);
    },
  );

  // bad 표시는 `;`로 잘린 조각을 넘어 선언 끝까지 남는다. 괄호 안 `;` 뒤에서
  // 선언이 끝나도 그 선언을 버린다.
  it("괄호 안 ; 너머에서 끝난 bad 선언도 버린다", () => {
    const font = parseInlineStyleMarks(
      "font-weight:bold;font:italic 12px 'a\n(;)",
    );

    expect(font.fontWeight).toBe("bold");
    expect(font.fontStyle).toBeUndefined();
    expect(
      parseStyleDeclarations('color:red;background:url("a\n(;)") blue'),
    ).toEqual({ color: "#FF0000" });
  });

  it("괄호 안에서 개행으로 끝난 따옴표는 괄호가 닫혀야 선언이 끝난다", () => {
    expect(
      parseInlineStyleMarks("color:rgb('a\n);font-weight:bold").fontWeight,
    ).toBe("bold");
    expect(
      parseInlineStyleMarks("color:rgb('a\n;font-weight:bold").fontWeight,
    ).toBeUndefined();
  });

  it("개행 뒤의 따옴표는 새 문자열을 열어 뒤 선언을 삼킨다", () => {
    expect(
      parseInlineStyleMarks('font-family:"a\nb";font-weight:bold').fontWeight,
    ).toBeUndefined();
    expect(
      parseWhiteSpaceMode('font-family:"a\nb";white-space:pre'),
    ).toBeUndefined();
  });

  // IMPL-REVIEW-02: 개행 글자마다 bad 선언을 버리는지 고정한다. 다음 선언이
  // 살아남는지만 보면 FF에서 bad를 세우지 않는 변이를 놓친다.
  it.each([
    ["CR", "\r"],
    ["FF", "\f"],
    ["CRLF", "\r\n"],
  ])("%s로 끝난 font 줄임도 버려 기울이지 않는다", (_name, newline) => {
    const marks = parseInlineStyleMarks(
      `font-weight:bold;font:italic 12px 'a${newline};color:red`,
    );

    expect(marks.fontWeight).toBe("bold");
    expect(marks.fontStyle).toBeUndefined();
  });

  // NEL(U+0085)은 CSS 개행이 아니다. Chromium은 문자열을 잇는다.
  it("NEL은 따옴표를 끝내지 않아 뒤 선언을 삼킨다", () => {
    expect(
      parseInlineStyleMarks(
        `font-family:'a${String.fromCodePoint(0x85)};font-weight:bold`,
      ).fontWeight,
    ).toBeUndefined();
  });

  it("이스케이프된 백슬래시 뒤 개행은 따옴표를 끝낸다", () => {
    expect(
      parseInlineStyleMarks("font-family:'a\\\\\n;font-weight:bold").fontWeight,
    ).toBe("bold");
  });

  it("bad 표시는 뒤따르는 주석이 끝나도 선언 끝까지 남는다", () => {
    const marks = parseInlineStyleMarks(
      "font-weight:bold;font:italic 12px 'a\n/**/;color:red",
    );

    expect(marks.fontWeight).toBe("bold");
    expect(marks.fontStyle).toBeUndefined();
  });

  // 따옴표 밖 이스케이프된 `;`는 선언을 끝내지 않는다. 다음 조각에서 escaped
  // 표시가 풀려야 그 뒤 `;`에서 선언이 끝난다.
  it("이스케이프된 ;가 이은 선언 뒤 ;에서 다음 선언을 읽는다", () => {
    const style = "color:red\\;font-weight:bold;color:blue";

    expect(parseStyleDeclarations(style)).toEqual({ color: "#0000FF" });
    expect(parseInlineStyleMarks(style).fontWeight).toBeUndefined();
  });
});

/*
 * 아래는 Issue #365가 더한 규칙이다. 분할기는 `(`·`[`·`{` 블록을 종류별
 * 스택으로 센다. 짝 맞는 닫는 글자만 블록을 닫는다. 블록 안 짝 안 맞는 닫는
 * 글자는 블록을 닫지 않는다. 스택이 비었을 때만 `;`가 선언을 끝낸다. 블록
 * 안에서도 따옴표·주석·이스케이프는 그대로 읽는다. 기대값은 Chromium
 * 153.0.8010.12 실측이다(부모 `white-space:pre-line` 안 span `setAttribute`,
 * getComputedStyle).
 */
describe("`[`·`{` 블록 (Issue #365)", () => {
  it.each([
    "font-family:[;font-weight:bold",
    "font-family:'a\n[;font-weight:bold",
    "font-family:'a\n{;font-weight:bold",
  ])("parseInlineStyleMarks는 %j를 굵게 읽지 않는다", (style) => {
    expect(parseInlineStyleMarks(style).fontWeight).toBeUndefined();
  });

  it("parseStyleDeclarations는 개행 뒤 [ 블록 안 배경색을 읽지 않는다", () => {
    expect(
      parseStyleDeclarations("font-family:'a\n[;background-color:yellow"),
    ).toEqual({});
  });

  it("parseWhiteSpaceMode는 개행 뒤 [ 블록 안 white-space를 읽지 않는다", () => {
    expect(
      parseWhiteSpaceMode("font-family:'a\n[;white-space:pre"),
    ).toBeUndefined();
  });

  it.each(["[)", "{)", "[}", "{]", "([)]", "[(])", "{(})", "(]"])(
    "짝 안 맞는 닫는 글자는 %s의 블록을 닫지 않아 뒤 굵게를 삼킨다",
    (block) => {
      expect(
        parseInlineStyleMarks(`font-family:${block};font-weight:bold`)
          .fontWeight,
      ).toBeUndefined();
    },
  );

  it.each(["[)]", "([])", "[]", "{}"])(
    "짝 맞는 닫는 글자가 %s의 블록을 닫아 뒤 굵게를 읽는다",
    (block) => {
      expect(
        parseInlineStyleMarks(`font-family:${block};font-weight:bold`)
          .fontWeight,
      ).toBe("bold");
    },
  );

  it.each([
    ["font-family:[']';font-weight:bold", undefined],
    ["font-family:[/*]*/;font-weight:bold", undefined],
    ["font-family:\\[;font-weight:bold", "bold"],
    ["font-family:[\\];font-weight:bold", undefined],
    ["font-family:['a\n];font-weight:bold", "bold"],
    ["font-family:[url(;)];font-weight:bold", "bold"],
    ["font-family:a];font-weight:bold", "bold"],
    ["font-family:a};font-weight:bold", "bold"],
    ["};font-weight:bold", "bold"],
  ] as const)(
    "블록 안 따옴표·주석·이스케이프와 깊이 0: %j의 굵기는 %s다",
    (style, expected) => {
      expect(parseInlineStyleMarks(style).fontWeight).toBe(expected);
    },
  );

  // 값 판독기는 고치지 않았다. 블록 글자가 든 값은 판독기가 이미 거절한다.
  it("값 안 [ 블록은 그 선언만 무효로 만들고 다음 선언을 읽는다", () => {
    const marks = parseInlineStyleMarks(
      "font-weight:bold[;];font-style:italic",
    );

    expect(marks.fontWeight).toBeUndefined();
    expect(marks.fontStyle).toBe("italic");
  });
});

// 기대값은 Chromium 153.0.8010.12 실측이다(Issue #364). 부모 `white-space:pre-line`
// 안 span에 `setAttribute("style", …)`로 넣고 계산 스타일을 읽었다.
// `_works/20261011-15-issue364-unquoted-url-token/probe/probe.mjs`가 하네스다.
// 따옴표 없는 `url(`은 `)`까지 한 덩어리 url 토큰이다. 안의 따옴표·주석·
// `(`·`[`·`{`·`;`는 보통 글자다.
describe("따옴표 없는 `url(` 토큰 (Issue #364)", () => {
  it.each([
    "background:url(it's.png);color:red",
    "background:url(a/*b);color:red",
  ])("parseStyleDeclarations는 %j의 뒤 color를 읽는다", (style) => {
    expect(parseStyleDeclarations(style).color).toBe("#FF0000");
  });

  it("parseInlineStyleMarks는 url 토큰 뒤 굵게를 읽는다", () => {
    expect(
      parseInlineStyleMarks("background:url(it's.png);font-weight:bold")
        .fontWeight,
    ).toBe("bold");
  });

  it("parseWhiteSpaceMode는 url 토큰 뒤 white-space를 읽는다", () => {
    expect(
      parseWhiteSpaceMode("background:url(it's.png);white-space:pre"),
    ).toBe("preserve");
  });

  // #362(개행이 끝낸 따옴표)와 #365(블록 스택)가 url 토큰을 몰라 새로 깨뜨린
  // 행이다. 수정 전에는 `'s`나 `[`가 뒤 선언을 삼켰다.
  describe("#362·#365가 새로 깨뜨린 행", () => {
    it("개행이 끝낸 따옴표 뒤 url 안 따옴표는 뒤 color를 삼키지 않는다", () => {
      expect(
        parseStyleDeclarations("font-family:'a\nurl(it's);color:red").color,
      ).toBe("#FF0000");
    });

    it("개행이 끝낸 따옴표 뒤 url 안 따옴표는 뒤 굵게를 삼키지 않는다", () => {
      expect(
        parseInlineStyleMarks("font-family:'a\nurl(it's);font-weight:bold")
          .fontWeight,
      ).toBe("bold");
    });

    it("개행이 끝낸 따옴표 뒤 url 안 따옴표는 뒤 white-space를 삼키지 않는다", () => {
      expect(
        parseWhiteSpaceMode("font-family:'a\nurl(it's);white-space:pre"),
      ).toBe("preserve");
    });

    it.each(["[", "{"])(
      "url 안 짝 없는 %s는 뒤 굵게를 삼키지 않는다",
      (open) => {
        expect(
          parseInlineStyleMarks(`font-family:url(a${open});font-weight:bold`)
            .fontWeight,
        ).toBe("bold");
      },
    );

    it("url 안 짝 없는 [ 뒤 배경색을 읽는다", () => {
      expect(
        parseStyleDeclarations("background:url(a[) red;font-weight:bold")
          .backgroundColor,
      ).toBe("#FF0000");
    });

    it("url 안 짝 없는 [ 뒤 굵게를 읽는다", () => {
      expect(
        parseInlineStyleMarks("background:url(a[) red;font-weight:bold")
          .fontWeight,
      ).toBe("bold");
    });

    it("background-image의 url 안 짝 없는 [ 뒤 color를 읽는다", () => {
      expect(
        parseStyleDeclarations("background-image:url(x[);color:red").color,
      ).toBe("#FF0000");
    });
  });

  // 기대는 parseStyleDeclarations의 color다. 빨강이면 url 토큰이 `)`에서
  // 끝나 뒤 선언을 읽은 것이고, 없으면 선언 하나로 묶인 것이다.
  describe("url 토큰 경계", () => {
    it.each([
      [
        "url( 뒤 공백 뒤 따옴표 없는 글자",
        "background:url( it's.png);color:red",
      ],
      ["대문자 URL(", "background:URL(it's);color:red"],
      ["혼합 대소문자 Url(", "background:Url(it's);color:red"],
      [
        "공백 뒤 따옴표 문자열은 보통 함수 블록",
        "color:red;background:url( 'a;color:blue' )",
      ],
      [
        "개행 뒤 따옴표 문자열은 보통 함수 블록",
        'color:red;background:url(\n"a;color:blue")',
      ],
      ["토큰 안 개행", "background:url(a\nb'c);color:red"],
      [
        "이스케이프된 )는 토큰을 닫지 않는다",
        "background:url(a\\)b'c);color:red",
      ],
      ["토큰 안 (는 블록을 열지 않는다", "background:url(a(b'c);color:red"],
      ["토큰 안 ;는 선언을 끝내지 않는다", "background:url(a;b'c);color:red"],
      ["image-set 안 url", "background:image-set(url(it's.png) 1x);color:red"],
      [
        "[ 블록 안 url 토큰",
        "background:[url(a');font-weight:bold]);color:red",
      ],
    ])("%s: %j의 color는 빨강이다", (_name, style) => {
      expect(parseStyleDeclarations(style).color).toBe("#FF0000");
    });

    it.each([
      ["myurl(", "background:myurl(it's);color:red"],
      ["#url(", "background:#url(it's);color:red"],
      ["@url(", "background:@url(it's);color:red"],
      ["-url(", "background:-url(it's);color:red"],
      ["1url(", "background:1url(it's);color:red"],
    ])(
      "url 함수가 아닌 %s는 따옴표를 연다: %j의 color는 없다",
      (_name, style) => {
        expect(parseStyleDeclarations(style).color).toBeUndefined();
      },
    );
  });

  // 앞 글자가 이스케이프 쌍의 끝이거나 NUL이면 `url`은 앞 ident의 일부다.
  // Chromium은 url 함수로 읽지 않는다(굵기 400). 착수 커밋(#364 전)에는
  // 따옴표를 열어 같은 값이었다.
  describe("url 앞 이스케이프 쌍과 NUL", () => {
    it.each([
      ["`\\ ` 뒤", "font-family:a\\ url(b'c);font-weight:bold"],
      ["`\\)` 뒤", "font-family:\\)url(b'c);font-weight:bold"],
      ["`\\'` 뒤", "font-family:\\'url(b'c);font-weight:bold"],
      ["`\\\\` 뒤", "font-family:\\\\url(b'c);font-weight:bold"],
      ["`\\u`로 이스케이프된 u", "font-family:a\\url(b'c);font-weight:bold"],
      [
        "이스케이프된 공백 뒤 `\\u`",
        "font-family:\\ \\url(b'c);font-weight:bold",
      ],
      ["`\\\\` 뒤 `\\u`", "font-family:\\\\\\url(b'c);font-weight:bold"],
      [
        "조각 경계에서 잘려 나간 `\\;` 뒤",
        "font-family:\\;url(b'c);font-weight:bold",
      ],
      ["이름 뒤 `\\;`", "font-family:a\\;url(b'c);font-weight:bold"],
      ["NUL 뒤", "font-family:a\u0000url(b'c);font-weight:bold"],
      ["맨 앞 NUL 뒤", "font-family:\u0000url(b'c);font-weight:bold"],
    ])("%s의 url(은 url 함수가 아니다: %j는 굵게가 아니다", (_name, style) => {
      expect(parseInlineStyleMarks(style).fontWeight).toBeUndefined();
    });

    it("`\\url(` 단독은 url 함수다: 뒤 굵게를 읽는다", () => {
      expect(
        parseInlineStyleMarks("font-family:\\url(b'c);font-weight:bold")
          .fontWeight,
      ).toBe("bold");
    });

    // `\`+개행은 유효 이스케이프가 아니다. `\`는 delim이고 개행은 공백이라
    // 뒤 `url(`은 새 이름의 시작이다. Chromium은 url 함수로 읽는다.
    it.each([
      ["`\\`+LF", "font-family:a\\\nurl(it's);color:red"],
      ["`\\`+CR", "font-family:a\\\rurl(it's);color:red"],
      ["`\\`+FF", "font-family:a\\\furl(it's);color:red"],
      ["`\\`+CRLF", "font-family:a\\\r\nurl(it's);color:red"],
      ["값 맨 앞 `\\`+LF", "x:\\\nurl(it's);color:red"],
      ["`\\`+LF 뒤 `\\u`", "font-family:\\\n\\url(it's);color:red"],
    ])("%s 뒤 url(은 url 함수다: %j의 color는 빨강이다", (_name, style) => {
      expect(parseStyleDeclarations(style).color).toBe("#FF0000");
    });
  });

  // 분기 판별 행이다. 각 행은 해당 분기를 지운 변이를 잡는다.
  describe("url 토큰 분기 판별", () => {
    it.each([
      ["url( 바로 뒤 따옴표 안 )", "x:url('a)b');font-weight:bold"],
      ["url( 공백 뒤 따옴표 안 )", "x:url( 'a)b');font-weight:bold"],
      ["조각 경계를 넘는 pending", "x:url(;'a);font-weight:bold"],
      ["url( TAB 뒤 따옴표 안 )", "x:url(\t'a)b');font-weight:bold"],
      ["url( LF 뒤 따옴표 안 )", "x:url(\n'a)b');font-weight:bold"],
      ["url( CR 뒤 따옴표 안 )", "x:url(\r'a)b');font-weight:bold"],
      ["url( FF 뒤 따옴표 안 )", "x:url(\f'a)b');font-weight:bold"],
      ["url( CRLF 뒤 따옴표 안 )", "x:url(\r\n'a)b');font-weight:bold"],
    ])("%s: %j는 굵게다", (_name, style) => {
      expect(parseInlineStyleMarks(style).fontWeight).toBe("bold");
    });

    it.each([
      ["_", "background:_url(it's);color:red"],
      ["대문자", "background:Aurl(it's);color:red"],
      ["비ASCII", "background:éurl(it's);color:red"],
      ["비ASCII 첫 글자 U+0080", "font-family:\u0080url(it's);color:red"],
      ["비ASCII U+00BF", "font-family:¿url(it's);color:red"],
      ["NUL", "background:a\u0000url(it's);color:red"],
      ["u가 아닌 첫 글자", "background:xrl(it's);color:red"],
      ["r이 아닌 둘째 글자", "background:uxl(it's);color:red"],
      ["l이 아닌 셋째 글자", "background:urx(it's);color:red"],
    ])("앞 글자·이름 글자 규칙 %s: %j의 color는 없다", (_name, style) => {
      expect(parseStyleDeclarations(style).color).toBeUndefined();
    });

    it.each([
      ["url( 바로 뒤 이스케이프", "background:url(\\)a'b);color:red"],
      ["url( 바로 뒤 /*", "background:url(/*a);color:red"],
      ["url( 공백 뒤 /*", "background:url( /*a);color:red"],
    ])("pending에서 토큰이 되는 %s: %j의 color는 빨강이다", (_name, style) => {
      expect(parseStyleDeclarations(style).color).toBe("#FF0000");
    });

    it("주석이 있는 조각에서 토큰 안 이스케이프된 )를 보존한다", () => {
      expect(
        parseStyleDeclarations("x:/*c*/url(a\\)b'c);color:red").color,
      ).toBe("#FF0000");
    });

    it("주석이 있는 조각에서 토큰 안 이스케이프된 문자가 선언 텍스트에 남는다", () => {
      const style =
        "-webkit-text-stroke-width:0px;text-decoration:none;/*c*/x:url(a\\)b);color:red";

      expect(readDumpAuthorDeclarations(style)).toBe(" x:url(a\\)b);color:red");
    });
  });

  describe("url 토큰이 ;를 품는다", () => {
    it.each([
      "background:url(;color:red);font-weight:bold",
      "background:url( ;color:red);font-weight:bold",
    ])("%j는 안의 color를 읽지 않고 뒤 굵게를 읽는다", (style) => {
      expect(parseStyleDeclarations(style).color).toBeUndefined();
      expect(parseInlineStyleMarks(style).fontWeight).toBe("bold");
    });

    it("닫히지 않은 url은 입력 끝까지 한 선언이라 뒤 굵게를 삼킨다", () => {
      expect(
        parseInlineStyleMarks("background:url(;font-weight:bold").fontWeight,
      ).toBeUndefined();
    });

    it("url(data:…;base64,…)는 기존처럼 뒤 color를 읽는다", () => {
      expect(
        parseStyleDeclarations(
          "background:url(data:image/png;base64,AAAA);color:red",
        ).color,
      ).toBe("#FF0000");
    });
  });
});
