// PostCSS는 이 프로젝트에서 Autoprefixer 하나만 돌린다 — Chrome 75 지원을
// 위해 SCSS 컴파일 산출물에 필요한 vendor prefix를 추가한다(아키텍처 리뷰
// 03.html, Browserslist는 package.json의 "browserslist" 필드를 공유한다).
export default {
  plugins: {
    autoprefixer: {},
  },
};
