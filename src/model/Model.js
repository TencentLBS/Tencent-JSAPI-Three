
/**
 * 3D模型基类
 * @class
 */
export default class Model extends TMap.Event {
  constructor(opts = {}) {
    super();

    const {
      map,
      position,
      mask,
      id = uniqueId(),
      url = '',
      zIndex = 0,
      anchor = [0, 0, 0],
      scale = 1,
      rotation = [0, 0, 0],
    } = opts;

    Object.assign(this, {
      id,
      url,
    });

    this.setZIndex(zIndex);
    this.setPosition(position);
    this.setAnchor(anchor);
    this.setMask(mask);
    this.setRotation(rotation);
    this.setScale(scale);
    this.show();

    this.load();

    if (map) {
      this.addTo(map);
    }
  }

  /**
	 * 设置层叠次序
	 * @param {Number} zIndex
	 */
  setZIndex(zIndex = 0) {
    this.zIndex = Math.max(zIndex, 0);
  }

  /**
	 * 获取层叠次序
	 */
  getZIndex() {
    return this.zIndex;
  }

  onLoad(json) {
    this.emit('loaded', {
      target: this,
      json
    });
  }

  onProgress(xhr) {
    this.emit('loading', {
      target: this,
      progress: xhr.loaded / xhr.total,
      loaded: xhr.loaded,
      total: xhr.total,
    });
  }

  onError(error) {
    // console.error(error);
    this.emit('load_failed', {
      target: this,
      error
    });
  }

  /**
	 * 将模型加入到指定的地图对象上
	 * @abstract
	 * @param {TMap.Map} map
	 */
  addTo() {}

  /**
	 * 将模型从地图上移除
	 * @abstract
	 */
  remove() {}

  /**
	 * 将模型销毁
	 * @abstract
	 */
  destroy() {}

  /**
	 * 显示模型
	 * @abstract
	 */
  show() {}

  /**
	 * 隐藏模型
	 * @abstract
	 */
  hide() {}

  /**
	 * 加载模型资源
	 * @abstract
	 * @returns {Promise}
	 */
  load() {}

  /**
	 * 设置模型旋转角度
	 * @abstract
	 * @param {Number[]} rotation
	 */
  setRotation() {}

  getRotation() {}

  /**
	 * 设置模型缩放比例
	 * @abstract
	 * @param {Number | Number[]} scale
	 */
  setScale() {}

  getScale() {}

  /**
	 * 设置模型位置及锚点
	 * @abstract
	 * @param {LatLng} position
	 * @param {Number[]} anchor
	 */
  setPosition() {}

  getPosition() {}

  /**
	 * 设置模型底图遮罩
	 * @abstract
	 * @param {LatLng[]} mask
	 */
  setMask() {}

  getMask() {}

  /**
	 * 更新模型矩阵
	 * @abstract
	 */
  updateMatrix() {}
}

var uniqueId = (function () {
  // return idHead + id++;

  // http://www.broofa.com/Tools/Math.uuid.htm

  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
  const uuid = new Array(36);
  let rnd = 0; let r;

  return function generateUUID() {
    for (let i = 0; i < 36; i ++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid[ i ] = '-';
      } else if (i === 14) {
        uuid[ i ] = '4';
      } else {
        if (rnd <= 0x02) {
          rnd = 0x2000000 + (Math.random() * 0x1000000) | 0;
        }
        r = rnd & 0xf;
        rnd = rnd >> 4;
        uuid[ i ] = chars[ (i === 19) ? (r & 0x3) | 0x8 : r ];
      }
    }

    return uuid.join('');
  };
}());