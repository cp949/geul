import StarterKit from "@tiptap/starter-kit";

// StarterKit의 code 마크는 Tiptap 기본값(excludes "_")이라 다른 모든 마크와
// 배타다. model은 code와 textColor/backgroundColor의 공존을 허용하고(
// canonicalizeTextMarks), QA-144는 `<code style="background-color">`를
// 색 마크로 읽는다고 정했다. 스키마가 그 결과를 거절하면 doc.check()가
// `Invalid collection of marks for node text`를 던진다(Issue #347).
//
// 색 마크 둘만 배타 목록에서 뺀다. bold italic underline strike link는 계속
// 배타다. 코드 글자에 굵게·링크 등을 허용하는 것은 이번 범위 밖이다.
// 커스텀 스타일 마크는 목록에 이름이 없어 code와 공존할 수 있다. model이
// 이미 허용하는 조합이다.
//
// @tiptap/extension-code는 core의 직접 의존이 아니다. 새 의존을 더하지
// 않으려고 StarterKit이 만든 code 마크를 addExtensions에서 받아 excludes만
// 바꾼다. code: false 같은 옵션은 parent가 처리한다. excludes가 이름으로
// 가리키는 bold italic underline strike link 중 하나라도 끄면 스키마 생성이
// `Unknown mark type`으로 던진다. 프로덕션 조립은 이 다섯을 끄지 않는다.
const CODE_EXCLUDES = "bold italic underline strike link";

export const StarterKitWithCodeColor = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      extension.name === "code"
        ? extension.extend({ excludes: CODE_EXCLUDES })
        : extension,
    );
  },
});
