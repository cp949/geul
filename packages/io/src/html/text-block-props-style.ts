// TextBlockProps(textColor/backgroundColor/textAlignment)를 인라인 style
// 문자열로 직렬화하는 규칙 하나를 export-html.ts(문서 생성)와
// import-warnings.ts(raw warning 정확도 판정, Issue #179 리뷰 수정)가
// 공유한다. 두 곳에 같은 규칙을 따로 구현하면 "export가 낸 style"과
// "import가 own-echo로 인정하는 style"이 갈릴 위험이 있다 — 갈리면
// export-html.ts 자신이 낸 값을 재-import할 때조차 스푸리어스 경고가
// 생긴다.
export type TextBlockPropsStyleValues = {
  textColor?: string | undefined;
  backgroundColor?: string | undefined;
  textAlignment?: string | undefined;
};

export const textBlockPropsStyle = (
  values: TextBlockPropsStyleValues,
): string | undefined => {
  const declarations = [
    values.textColor === undefined ? undefined : `color:${values.textColor}`,
    values.backgroundColor === undefined
      ? undefined
      : `background-color:${values.backgroundColor}`,
    values.textAlignment === undefined
      ? undefined
      : `text-align:${values.textAlignment}`,
  ].filter((declaration): declaration is string => declaration !== undefined);
  return declarations.length > 0 ? declarations.join(";") : undefined;
};
