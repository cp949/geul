import { ExamplePage } from "../../example-shell/example-page.js";
import EnabledBlockTypesExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const EnabledBlockTypesPage = () => (
  <ExamplePage
    description="'/'로 슬래시 메뉴를 열어 보라. EditorProvider에 enabledBlockTypes={{ mode: 'deny', types: ['table'] }}를 넘겨 Table 블록을 차단했다 — 목록에 Table 항목이 나타나지 않는다."
    source={exampleSource}
    title="Enabled block types"
  >
    <EnabledBlockTypesExample />
  </ExamplePage>
);

export default EnabledBlockTypesPage;
