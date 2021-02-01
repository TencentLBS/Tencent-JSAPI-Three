
import GLTFLoader from '../libs/GLTFLoader.js';
import ThreeModel from './ThreeModel.js';

export default class GLTFModel extends ThreeModel {
  constructor(opts = {}) {
    super(opts);
  }

  load() {
    if (!this.loading) {
      this.loader = new GLTFLoader();
      this.loading = new Promise((resolve, reject) => {
        this.loader.load(
          this.url,
          (gltf) => {
            const object = gltf.scene;

            object.visible = this.visible;

            this.object = object;

            this.onLoad(gltf);

            resolve();
          },
          (xhr) => {
            this.onProgress(xhr);
          },
          (error) => {
            this.onError(error);
            reject(error);
          }
        );
      });
    }

    return this.loading;
  }
}
