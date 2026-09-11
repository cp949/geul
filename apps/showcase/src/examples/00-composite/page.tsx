import { ExamplePage } from "../../example-shell/example-page.js";
import CompositeExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const CompositePage = () => (
  <ExamplePage
    description="지금까지 본 표면 전부를 한 문서에 합쳤다 — 실전에서 이렇게 조합한다. 에디터 아래 미리보기/HTML 탭에서 exportHtml() 결과를 확인할 수 있다."
    source={exampleSource}
    title="Kitchen sink"
  >
    <CompositeExample />
  </ExamplePage>
);

export default CompositePage;
