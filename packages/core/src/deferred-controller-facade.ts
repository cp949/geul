import type { EditorController } from "./editor-controller-types.js";

// customBlocks(RD-002-DELTA-11) NodeView가 CustomBlockDefinition.render에
// 넘길 EditorController 참조를 만든다. createEditor()의 session 생성
// (new ProductionEditorSession) 안에서 dummy mount/unmount(production-editor-
// assembly.ts)가 즉시 일어나므로, initialDocument에 등록된 커스텀 block이
// 있으면 createEditor()가 끝나기 전에 render()가 호출될 수 있다 — 이 시점엔
// controller 변수 자체가 아직 없다(DELTA-11.md "결정" 2). controllerBox가
// 채워지기 전까지는 이 Proxy의 속성 접근이 undefined를 반환한다(참조
// 자체는 항상 유효 — 던지지 않는다). 실사용 mount()는 session 생성이
// 끝난 뒤 일어나 NodeView가 다시 만들어지므로(unmount가 이전 것을
// 파기) 그때는 이미 채워진 controllerBox를 통해 완전히 동작한다.
// **제약**: render()는 이 참조의 메서드를 동기적으로 호출하면 안 된다 —
// 참조만 캡처해 이벤트 핸들러 등 나중 호출에만 쓴다.
export const createDeferredControllerFacade = (): {
  facade: EditorController;
  box: { current: EditorController | null };
} => {
  const box: { current: EditorController | null } = { current: null };
  const facade = new Proxy(
    {},
    {
      get(_target, prop) {
        const current = box.current;
        if (current === null) return undefined;
        const value = Reflect.get(current, prop, current);
        return typeof value === "function" ? value.bind(current) : value;
      },
    },
  ) as EditorController;
  return { facade, box };
};
