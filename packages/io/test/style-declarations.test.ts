/**
 * `parseStyleDeclarations`가 style 속성에서 색·배경색·정렬을 읽는 규칙을
 * 검증한다. 값 정규화와 버리는 값의 규칙을 다루고, 선형 구현이 옛 정규식
 * 구현과 같은 결과를 내는지 오라클 사본으로 대조한다. 작업량 검증은
 * `style-declarations-complexity.test.ts`가 다룬다.
 */
import { isCanonicalCellAlign, isCanonicalCellColor } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  parseStyleDeclarations,
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

  it("색상 외 값이 섞인 background 축약형은 버린다", () => {
    expect(
      parseStyleDeclarations("background: url(http://x/a.png) no-repeat #fff"),
    ).toEqual({});
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

  it("색상 값이 유효한 형식이 아니면 버린다", () => {
    expect(parseStyleDeclarations("color: red")).toEqual({});
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
  ["!important", "color:#ff0000 !important;text-align:left!important"],
  ["속성 이름만 있는 조각", "color;text-align;background"],
  ["속성 이름과 공백만 있는 조각", "color   ;  text-align  "],
  ["콜론만 있는 조각", ":;:::;color:#ff0000"],
  ["숫자 뒤 콜론", "12:34;color:#ff0000"],
  ["하이픈만 있는 속성", "-:red;--:x;color:#ff0000"],
  ["background 축약형", "background:#FFFF00"],
  ["background rgb 축약형", "background: rgb(255, 255, 0)"],
  ["복합 background 축약형", "background: url(http://x/a.png) no-repeat #fff"],
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
  ["rgba 알파", "color:rgba(1,2,3,0.5)"],
  ["rgb 범위 초과", "color:rgb(300, 0, 0)"],
  ["알 수 없는 선언", "font-family: Arial; mso-number-format:'0';"],
  ["정렬 허용 밖 값", "text-align: justify"],
  ["색 허용 밖 값", "color: red"],
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
