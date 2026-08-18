import { describe, expect, it } from "vitest";
import { parseStyleDeclarations } from "../src/clipboard/style-declarations.js";

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
