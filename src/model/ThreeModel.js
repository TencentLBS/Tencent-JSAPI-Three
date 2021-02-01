
import Model from './Model.js';
import ThreeModelManager from '../ThreeModelManager.js';
import { Vector3 } from '../libs/three.module.js';
import check from '../libs/check.js';
import { ClassTypeError } from '../libs/error.js';

const { isUndefined, isArray, isNumber } = check;

function isVector3(value) {
  return isArray(value) && value.length === 3 && value.every(v => isNumber(v));
}

function isLatLng(value) {
  return value instanceof TMap.LatLng;
}

function isLatLngArray(value) {
  return isArray(value) && value.every(v => isLatLng(v));
}

export default class ThreeModel extends Model {
  constructor(opts) {
    super(opts);

    this.load().then(() => {
      this.setRotation();
      this.setScale();
      this.setPosition();
    });
  }

  /**
   * 将模型加入到指定的地图对象上
   * @param {TMap.Map} map
   */
  addTo(map) {
    if (map !== this.map && map instanceof TMap.Map) {
      this.remove();

      if (!map.threeModelMgr) {
        map.threeModelMgr = new ThreeModelManager({
          map
        });
      }

      map.threeModelMgr.addModel(this);

      this.map = map;

      this.setPosition();
    }

    return this;
  }

  /**
   * 将模型从地图上移除
   */
  remove() {
    if (this.map) {
      this.map.threeModelMgr.removeModel(this);
      this.map = null;
    }

    return this;
  }

  /**
   * 将模型销毁
   */
  destroy() {
    this.remove();
    // 递归遍历组对象group释放所有后代网格模型绑定几何体占用内存
    if (this.object) {
      this.object.traverse((obj) => {
        if (obj.type === 'Mesh') {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
      this.object = null;
    }
    this.removeAllListeners();
    return this;
  }

  /**
   * 显示模型
   */
  show() {
    if (this.object) {
      this.object.visible = true;
    }
    this.visible = true;
    return this;
  }

  /**
   * 隐藏模型
   */
  hide() {
    if (this.object) {
      this.object.visible = false;
    }
    this.visible = false;
    return this;
  }

  /**
   * 设置模型旋转角度
   * @param {Number[]} rotation [x, y, z]
   */
  setRotation(rotation) {
    if (isUndefined(rotation)) {
      rotation = this.rotation;
    }

    if (!isVector3(rotation)) {
      new ClassTypeError('Model.rotation', '[Number, Number, Number]', rotation).warn();
      return this;
    }

    const euler = rotation.map((angle, index) => {
      // 模型坐标系为EUS，世界坐标系为ENU，在x轴上需要做一个90度的处理
      return !!index ? degree_to_radian(angle) : degree_to_radian(angle + 90);
    });

    if (this.object) {
      this.object.rotation.set(...euler);
      this.object.updateMatrix();
    }

    this.rotation = rotation;

    return this;
  }

  getRotation() {
    return this.rotation;
  }

  /**
   * 设置模型缩放比例
   * @param {Number | Number[]} scale
   */
  setScale(scale) {
    if (isUndefined(scale)) {
      scale = this.scale;
    }

    if (isNumber(scale)) {
      this.scale = [scale, scale, scale];
    } else {
      if (isVector3(scale)) {
        this.scale = scale;
      } else {
        new ClassTypeError('Model.scale', 'Number 或 [Number, Number, Number]', scale).warn();
        return this;
      }
    }

    if (this.object) {
      this.object.scale.set(...this.scale);
      this.object.updateMatrix();
    }

    return this;
  }

  getScale() {
    return this.scale;
  }

  /**
   * 设置模型位置及锚点
   * @param {LatLng} position
   */
  setPosition(position) {
    if (!isUndefined(position)) {
      if (!isLatLng(position)) {
        new ClassTypeError('Model.position', 'LatLng', position).warn();
      } else {
        this.position = position;
      }
    }

    // 设置偏移需在模型加载+地图挂载之后
    if (this.object && this.map) {
      const worldCoord = this.map.projectToWorldPlane(this.position, 20);
      const pos = new Vector3(worldCoord.x, -worldCoord.y, 0);
      const translate = pos.sub(this.anchor);
      this.object.position.copy(translate);
      this.object.updateMatrix();
    }

    return this;
  }

  getPosition() {
    return this.position;
  }

  /**
   * 设置模型位置及锚点
   * @param {LatLng} position
   */
  setAnchor(anchor = [0, 0, 0]) {
    if (!isVector3(anchor)) {
      new ClassTypeError('Model.anchor', '[Number, Number, Number]', anchor).warn();
      return this;
    }

    this.anchor = new Vector3(...anchor);
    this.setPosition();
    return this;
  }

  getAnchor() {
    return this.anchor.toArray();
  }

  /**
   * 设置模型轮廓线
   * @param {LatLng[]} mask
   */
  setMask(mask = []) {
    if (isLatLngArray(mask)) {
      this.mask = mask;
      this.emit('mask_changed');
    } else {
      new ClassTypeError('Model.mask', 'LatLng[]', mask).warn;
    }

    return this;
  }

  getMask() {
    return this.mask;
  }

  /**
   * 获取模型多边形遮罩进行底图元素剔除
   */
  getMaskGeo() {
    return {
      id: this.id,
      paths: this.mask || [],
    };
  }
}

function degree_to_radian (deg) {
  return deg * (Math.PI / 180);
};