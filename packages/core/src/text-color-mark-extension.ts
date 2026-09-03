import { Mark, mergeAttributes } from "@tiptap/core";

// model TextMark textColor/backgroundColor(RD-001 DELTA-01)의 PM 표현. 저장
// 계약은 color attr 하나뿐이고(link의 href와 동형), 화면에는 인라인 style로
// 반영한다(표 셀 textColor/backgroundColor의 style 렌더 관례와 동형,
// table-extension.ts renderHTML 참고 — 코드 미복제, 구조만 참고).
//
// parseHTML을 선언하지 않는다: 이 DELTA는 JSON round-trip만 다룬다(RD-001
// 완료 조건 2). 클립보드·문서 HTML의 임의 style="color" 값을 마크로
// 승격할지는 HTML 입출력을 다루는 RD-004 몫이다 — 지금 선언하면 비정규
// 색상값(`red`, `rgb(...)` 등)이 정규형 검증 없이 마크로 들어오는 경로가
// 생긴다.
export const TextColorMark = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: { default: null, rendered: false },
    };
  },

  renderHTML({ mark, HTMLAttributes }) {
    const color = mark.attrs.color;
    return [
      "span",
      mergeAttributes(
        HTMLAttributes,
        typeof color === "string" ? { style: `color: ${color}` } : {},
      ),
      0,
    ];
  },
});

export const BackgroundColorMark = Mark.create({
  name: "backgroundColor",

  addAttributes() {
    return {
      color: { default: null, rendered: false },
    };
  },

  renderHTML({ mark, HTMLAttributes }) {
    const color = mark.attrs.color;
    return [
      "span",
      mergeAttributes(
        HTMLAttributes,
        typeof color === "string"
          ? { style: `background-color: ${color}` }
          : {},
      ),
      0,
    ];
  },
});
