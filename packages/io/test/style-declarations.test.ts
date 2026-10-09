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
  parseStyleDeclarations,
  parseWhiteSpaceMode,
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

  it("대소문자·공백·!important를 무시한다", () => {
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
});
