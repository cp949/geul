import { ExamplePage } from "../../example-shell/example-page.js";
import MediaExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const MediaPage = () => (
  <ExamplePage
    description="'/'로 이미지를 삽입하고 File Panel의 Upload 탭에서 파일을 골라 보라. 파일명에 'reject'가 들어 있으면 업로드가 실패로 결정적으로 분기한다(mock). 업로드된 미디어를 선택하면 Media Toolbar와 리사이즈 핸들이 나타난다."
    source={exampleSource}
    title="Media"
  >
    <MediaExample />
  </ExamplePage>
);

export default MediaPage;
