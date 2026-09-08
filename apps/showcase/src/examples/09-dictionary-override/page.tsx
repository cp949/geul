import { ExamplePage } from "../../example-shell/example-page.js";
import DictionaryOverrideExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const DictionaryOverridePage = () => (
  <ExamplePage
    description="'/'를 입력해 슬래시 메뉴를 열어 보라. 'Table' 항목이 'Grid'로 바뀌어 있다 — DEFAULT_DICTIONARY를 스프레드해 slashMenu.table.label만 override한 결과다."
    source={exampleSource}
    title="Dictionary override"
  >
    <DictionaryOverrideExample />
  </ExamplePage>
);

export default DictionaryOverridePage;
