import { defineConfig } from "vite";

export default defineConfig({
  // apps/demo가 Vite 기본 포트(5173)를 그대로 쓴다 — 둘을 동시에 띄울 때
  // 충돌·자동 증분 없이 구분되도록 showcase는 5174를 고정한다.
  server: { port: 5174 },
});
