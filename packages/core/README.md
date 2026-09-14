# @cp949/geul-core

Tiptap을 비공개 편집 엔진으로 감싼 프레임워크 비의존 headless editor controller다. React 없이 저수준 API로 에디터를 직접 제어하거나, `@cp949/geul-react`가 제공하지 않는 자체 UI를 얹어야 할 때 쓴다.

React를 쓴다면 보통 이 패키지를 직접 import할 필요 없다 — `@cp949/geul-react`가 필요한 타입과 함수를 재수출한다.

## 최소 사용 예

```ts
import { createEditor } from "@cp949/geul-core";
import { createEmptyDocument } from "@cp949/geul-model";

const initialDocument = createEmptyDocument(() => crypto.randomUUID());
const controller = createEditor({ initialDocument });

controller.mount(document.getElementById("editor")!);

controller.commands.toggleBold(); // 타입별 명령은 commands.* 아래 있다
controller.getDocument(); // 현재 Document 스냅샷(@cp949/geul-model의 Document)

controller.unmount(); // DOM에서 분리(재마운트 가능)
controller.destroy(); // 세션 영구 종료
```

## 담고 있는 것

- **명령**: `controller.commands.*`(서식 토글·블록 타입 변경·들여쓰기 등 타입별 명령)와 `insertBlocks`/`updateBlock`/`removeBlocks` 등 임의 `Block` 형태를 받는 범용 조작 API
- **조회**: `getDocument`/`getBlock`/`getPrevBlock`/`getNextBlock`/`forEachBlock`으로 저장 `Block` 트리를 순회
- **확장 지점**: `customBlocks`/`customInlineContent`(커스텀 블록·인라인 타입 등록), `enabledBlockTypes`(`{ mode: "allow" | "deny", types }`로 타입 제한 — `isBlockTypeEnabled(type)`으로 조회), `uploadFile`(미디어 업로드 콜백), `pasteHandler`
- **이벤트**: `onChange`/`onBeforeChange`/`onSelectionChange`/`onMount`/`onUnmount`

전체 옵션은 `CreateEditorOptions`, 전체 컨트롤러 표면은 `EditorController` 타입을 본다.

## 알려진 제약

- DOM에 의존한다(`tsconfig.json`의 `lib`에 `DOM` 포함) — 브라우저 또는 jsdom 같은 DOM 환경이 필요하다. 서버에서 문서만 다루려면 DOM-free인 [`@cp949/geul-model`](../model)/[`@cp949/geul-io`](../io)를 쓴다.
- Tiptap·ProseMirror의 raw 타입(`Editor`, PM 노드 등)은 공개 표면에 없다 — 패키지 경계 밖으로 노출하지 않는다.
