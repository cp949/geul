import StarterKit from "@tiptap/starter-kit";

// StarterKit의 code 마크는 Tiptap 기본값(excludes "_")이라 다른 모든 마크와
// 배타다. model은 code와 다른 마크의 공존을 허용한다(canonicalizeTextMarks).
// io와 마크다운도 같다. 스키마가 거절하면 두 증상이 나온다.
// - 초기 문서 로드: doc.check()가 `Invalid collection of marks for node text`를
//   던진다.
// - 붙여넣기: 처리되지 않은 RangeError가 난다.
// 그래서 스키마를 model에 맞춘다(Issue #347, #349).
//
// excludes를 빈 문자열로 둔다. code가 아무 마크도 배제하지 않는다. bold italic
// underline strike link, 색 마크 둘, 커스텀 스타일 마크가 모두 공존한다.
// excludes가 이름을 나열하지 않으므로 해당 마크를 끄는 옵션이 스키마 생성을
// 깨지 않는다.
//
// 함정:
// - 빈 문자열은 falsy다. `excludes: ""`를 무시하는 경로가 있으면 기본값 "_"로
//   돌아간다. code-mark-full-coexistence.test.ts가 excluded 목록이 빈 것을
//   고정한다.
// - 명령 코드에 code 전용 대체 규칙을 두지 않는다. toggleCode와 toggleBold 등은
//   스키마를 따른다. 마크를 서로 지우지 않는다.
//
// @tiptap/extension-code는 core의 직접 의존이 아니다. 새 의존을 더하지
// 않으려고 StarterKit이 만든 code 마크를 addExtensions에서 받아 excludes만
// 바꾼다. code: false 같은 옵션은 parent가 처리한다.
const CODE_EXCLUDES = "";

export const StarterKitWithCodeMarks = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      extension.name === "code"
        ? extension.extend({ excludes: CODE_EXCLUDES })
        : extension,
    );
  },
});
