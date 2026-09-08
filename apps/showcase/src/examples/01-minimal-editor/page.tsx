import { ExamplePage } from "../../example-shell/example-page.js";
import MinimalEditorExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const MinimalEditorPage = () => (
  <ExamplePage
    description="EditorProvider와 EditorContent만으로 만드는 가장 단순한 에디터. 툴바 없이도 타이핑·엔터·백스페이스가 모두 동작한다."
    source={exampleSource}
    title="Minimal editor"
  >
    <MinimalEditorExample />
  </ExamplePage>
);

export default MinimalEditorPage;
