/**
 * model→Tiptap JSON 인라인 mark 변환(`inlineContentToTiptap`)이 새 mark
 * 2종(`textColor`/`backgroundColor`)을 빠뜨리지 않고 `markToTiptap`의
 * exhaustive switch를 통과시키는지 확인한다(RD-001 DELTA-01 — model
 * `TextMark` 확장이 core의 이 switch를 컴파일 타임에 강제로 갱신시킨다는
 * 계약의 회귀 고정). PM mark extension 등록·왕복 디코드는 DELTA-02 범위다
 * — 여기서는 인코드 방향의 shape만 검증한다.
 */
import { describe, expect, it } from "vitest";
import { inlineContentToTiptap } from "../src/model-to-tiptap.js";

describe("model-to-tiptap - textColor/backgroundColor 인코드", () => {
  it("textColor/backgroundColor mark를 color attr을 가진 Tiptap mark로 변환한다", () => {
    expect(
      inlineContentToTiptap([
        {
          text: "colored",
          marks: [
            { type: "textColor", color: "#AABBCC" },
            { type: "backgroundColor", color: "#112233" },
          ],
        },
      ]),
    ).toEqual([
      {
        type: "text",
        text: "colored",
        marks: [
          { type: "textColor", attrs: { color: "#AABBCC" } },
          { type: "backgroundColor", attrs: { color: "#112233" } },
        ],
      },
    ]);
  });
});
