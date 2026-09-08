import { ExamplePage } from "../../example-shell/example-page.js";
import DocumentIoExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const DocumentIoPage = () => (
  <ExamplePage
    description="useEditor()로 문서를 JSON으로 내보내고 다시 불러온다. HTML/GFM 변환(@cp949/geul-io)은 이 쇼케이스 범위 밖이다."
    source={exampleSource}
    title="Document read/write"
  >
    <DocumentIoExample />
  </ExamplePage>
);

export default DocumentIoPage;
