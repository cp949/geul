import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "chrome75" },
  // apps/demo가 Vite 기본 포트(5173)를 그대로 쓴다 — 둘을 동시에 띄울 때
  // 충돌·자동 증분 없이 구분되도록 showcase는 5174를 고정한다.
  // strictPort로 포트가 이미 쓰이고 있으면 자동으로 다른 포트를 잡는 대신
  // 실패시킨다 — "어느 쪽이 어느 포트인지" 조용히 뒤바뀌는 걸 막는다.
  server: { port: 5174, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
