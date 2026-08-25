// core-js는 타입 선언을 배포하지 않아 typescript 7.0.2가 side-effect
// import를 TS2882(Cannot find module or type declarations for side-effect
// import)로 거절한다 — 런타임 polyfill 전용 모듈이라 타입 표면이 없으므로
// shorthand ambient module로 선언만 채운다(cp949/geul#122).
declare module "core-js/stable";
