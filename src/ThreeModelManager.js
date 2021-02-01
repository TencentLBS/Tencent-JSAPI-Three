
import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  AmbientLight,
  DirectionalLight,
  Color,
  Group,
  PointLight,
  Raycaster,
  Vector2,
} from './libs/three.module.js';

export default class ThreeModelManager extends TMap.LayerPlugin {
  constructor(opts = {}) {
    super(opts);

    if (!this.scene) {
      this.scene = new Scene();
      this.group = new Group();
      this.scene.add(this.group);
    }
    this.modelMap = new Map();
  }

  addModel(model) {
    const { modelMap } = this;
    const id = model.id;

    if (modelMap.has(id)) {
      console.warn(`Model: 已存在id为${id}的Model对象。`);
    } else {
      // 记录
      modelMap.set(id, model);

      // 加入3D模型
      model.load().then(() => {
        if (modelMap.has(id)) {
          this.group.add(model.object);
          model.object.traverse((object) => {
            object._modelId = id;
          });
        }
      });

      // 处理遮罩
      if (this.maskLayer) {
        this.maskLayer.add([model.getMaskGeo()]);
      }
      model.on('mask_changed', () => {
        this._updateModelMask(model);
      });
    }
  }

  _updateModelMask(model) {
    if (this.maskLayer) {
      this.maskLayer.update([model.getMaskGeo()]);
    }
  }

  removeModel(model) {
    const id = model.id;
    if (this.modelMap.has(id)) {
      model.removeAllListeners('mask_changed');
      this.maskLayer.remove([id]);
      this.group.remove(model.object);
      this.modelMap.delete(id);
    }
  }

  onAddToMap({ canvas, camera }) {
    // 创建渲染器
    this.renderer = new WebGLRenderer({
      canvas: canvas,
      context: this.gl,
    });
    this.renderer.autoClear = false;

    // 创建相机
    this.mapCamera = camera;
    const { fovy, view, near, far, distance } = this.mapCamera;
    const aspect = (view.right - view.left) / (view.top - view.bottom);
    this.camera = new PerspectiveCamera(fovy, aspect, near, far);
    this.camera.position.z = distance;
    this._setViewOffset();

    // 创建遮罩图层
    const modelList = this.modelMap ? [...this.modelMap.values()] : [];
    this.maskLayer = new TMap.MaskLayer({
      map: this.map,
      geometries: modelList.map(model => {
        return model.getMaskGeo();
      }),
    });

    // 同步光照
    if (!this.scene) {
      this.scene = new Scene();
      this.group = new Group();
      this.scene.add(this.group);
    }
    synchronizeLight(this.map, this.scene);

    // 监听地图事件
    this.raycaster = new Raycaster();
    this._onMapResize = this._onMapResize.bind(this);
    this._onMapClick = this._onMapClick.bind(this);
    this._onMapOffsetChanged = this._onMapOffsetChanged.bind(this);
    this.map.on('resize', this._onMapResize);
    this.map.on('click', this._onMapClick);
    this.map.on('offset_changed', this._onMapOffsetChanged);
  }

  onRemoveFromMap() {
    this.renderer = null;
    this.mapCamera = null;
    this.camera = null;
    this.maskLayer.setMap(null);
    this.maskLayer = null;
    desynchronizeLight(this.map, this.scene);

    this.map.off('resize', this._onMapResize);
    this.map.off('click', this._onMapClick);
    this.map.off('offset_changed', this._onMapOffsetChanged);
  }

  onDraw() {
    const { scene, camera, renderer, map, group } = this;

    // 同步地图状态：旋转、缩放
    scene.rotation.x = degree_to_radian(-map.getPitch());
    scene.rotation.z = degree_to_radian(-map.getRotation());
    const scale = map.getScale() * Math.pow(2, map.getZoom() - 20);
    scene.scale.set(scale, scale, scale);

    // 整体平移至center为原点
    const centerWorldCoord = map.projectToWorldPlane(map.getCenter(), 20);
    group.position.set(-centerWorldCoord.x, centerWorldCoord.y, 0);
    group.updateMatrix();

    // 重置Three状态
    renderer.state.reset();

    renderer.render(scene, camera);
  }

  /**
   * 地图容器大小变化时需同步到Camera的投影矩阵上
   */
  _onMapResize() {
    const { camera } = this;
    if (camera) {
      const { fovy, view, near, far, distance } = this.mapCamera;
      const aspect = (view.right - view.left) / (view.top - view.bottom);

      Object.assign(camera, {
        fov: fovy,
        aspect,
        near,
        far,
      });
      camera.position.z = distance;
      this._setViewOffset();
    }
  }

  /**
   * 地图offset变化时需同步到Camera的投影矩阵上
   */
  _onMapOffsetChanged() {
    this._setViewOffset();
  }

  /**
   * 点击地图时触发模型拾取
   */
  _onMapClick(evt) {
    const {camera, raycaster, group, modelMap} = this;
    const {x, y} = evt.point;
    const {width, height} = this.mapCamera.resolution;

    const mouse = new Vector2((x / width * 2) - 1, 1 - (y / height * 2));

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(group.children, true);
    if (intersects.length) {
      const nearest = intersects[0];
      const model = modelMap.get(nearest.object._modelId);
      model.emit('click', {
        type: 'click',
        target: model,
      });
    }
  }

  /**
   * 设置相机投影矩阵偏移
   */
  _setViewOffset() {
    if (this.mapCamera && this.camera) {
      const {offset, resolution} = this.mapCamera;
      // offset取负值，因为THREE.Matrix4.makePerspective中的偏移量计算有误
      this.camera.setViewOffset(
        resolution.width,
        resolution.height,
        - offset.x,
        - offset.y,
        resolution.width,
        resolution.height
      );
    }
  }
}
/**
 * 光照同步
 */
function synchronizeLight(map, scene) {
  const mapLightManager = map.getLightManager();
  scene._lightMap = new Map();

  // 当前状态同步
  mapLightManager.getLights().forEach(mapLight => {
    addLight(scene, mapLight, map);
  });

  // 同步增加光源
  decorate(mapLightManager, 'addLight', (mapLight) => {
    addLight(scene, mapLight, map);
  });

  // 同步删除光源
  decorate(mapLightManager, 'removeLight', (mapLight) => {
    removeLight(scene, mapLight);
  });

  // 同步清除所有光源
  decorate(mapLightManager, 'clearLights', () => {
    clearLights(scene);
  });
}

function desynchronizeLight(map, scene) {
  const mapLightManager = map.getLightManager();
  clearLights(scene);
  undecorate(mapLightManager, 'addLight');
  undecorate(mapLightManager, 'removeLight');
  undecorate(mapLightManager, 'clearLights');
}

function addLight(scene, mapLight, map) {
  let threeLight;
  const color = new Color(...mapLight.color.map(v => v / mapLight.intensity));
  const { intensity } = mapLight;

  // GL光源类型支持环境光、平行光、点光源
  switch (mapLight.type) {
    case TMap.constants.LIGHT_TYPE.POINT: {
      const { position, height } = mapLight;
      const coord = map.projectToWorldPlane(position);
      const z = height / (map._getSpatialResolution(20, position.getLat()) * map.getScale());

      threeLight = new PointLight(color, intensity);
      threeLight.position.set(coord.x, -coord.y, z);

      // PointLight需要更新位置，挂载在Group下
      scene.children[0].add(threeLight);
      scene._lightMap.set(mapLight.id, threeLight);
      return;
    }
    case TMap.constants.LIGHT_TYPE.AMBIENT:
      threeLight = new AmbientLight(color, intensity);
      break;
    case TMap.constants.LIGHT_TYPE.DIRECTION:
    default: {
      threeLight = new DirectionalLight(color, intensity);
      const position = mapLight.direction.map(v => v * 3000);
      threeLight.position.set(...position);
    }
  }

  if (threeLight) {
    scene.add(threeLight);
    scene._lightMap.set(mapLight.id, threeLight);
  }
}

function removeLight(scene, mapLight) {
  const { id } = mapLight;
  const threeLight = scene._lightMap.get(id);

  if (threeLight) {
    threeLight.parent.remove(threeLight);
    scene._lightMap.delete(id);
  }
}

function clearLights(scene) {
  scene._lightMap.forEach(light => {
    light.parent.remove(light);
  });
  scene._lightMap.clear();
}

/**
 * 工具函数
 */
function decorate(target, name, afterFn) {
  target[`$origin_${name}`] = target[name];
  target[name] = after(target[name], afterFn);
}

function undecorate(target, name) {
  target[name] = target[`$origin_${name}`];
  delete target[`$origin_${name}`];
}

function after(fn, afterFn) {
  return function () {
    const res = fn.apply(this, arguments);
    afterFn.apply(this, arguments);
    return res;
  };
}

function degree_to_radian (deg) {
  return deg * (Math.PI / 180);
};