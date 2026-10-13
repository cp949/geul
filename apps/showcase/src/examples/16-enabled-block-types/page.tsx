import { ExamplePage } from "../../example-shell/example-page.js";
import EnabledBlockTypesExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const EnabledBlockTypesPage = () => (
  <ExamplePage
    description="'/'로 슬래시 메뉴를 열어 보라. 첫 편집기는 EditorProvider에 enabledBlockTypes={{ mode: 'deny', types: ['table'] }}를 넘겨 Table 블록을 차단했다 — 목록에 Table 항목이 나타나지 않는다. 두 번째 편집기는 types: ['paragraph']를 차단했다 — 빈 목록 항목에서 Backspace나 Enter를 눌러 보라. 항목이 문단으로 바뀌지 않고, Backspace는 항목을 지우며 Enter는 같은 목록의 새 항목을 연다."
    source={exampleSource}
    title="Enabled block types"
  >
    <EnabledBlockTypesExample />
  </ExamplePage>
);

export default EnabledBlockTypesPage;
