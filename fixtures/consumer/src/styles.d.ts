// `@cp949/geul-react`의 `exports["./styles.css"]`는 타입 조건을 선언하지
// 않는다(CSS는 타입 표면이 없다) — TypeScript 6.0.3이 side-effect import를
// TS2882(Cannot find module or type declarations for side-effect import)로
// 거절한다. `apps/demo/src/core-js.d.ts`와 같은 패턴으로 정확한 specifier만
// shorthand ambient module로 선언한다(와일드카드 `*.css`로 넓히지 않는다).
declare module "@cp949/geul-react/styles.css";
