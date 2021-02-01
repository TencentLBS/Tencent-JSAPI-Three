const HEX_REG = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/;
const RGB_REG = /^rgb\((\d+,?\s*){3}\)$/;
const RGBA_REG = /^rgba\((\d+,?\s*){3},\s*[0-9.]+\)$/;

const checkUtils = {};

// 类型校验
function buildTypeChecker(checkUtils) {
  const types = ['Number', 'String', 'Function', 'Undefined', 'Object', 'Array'];
  types.forEach(type => {
    const checker = function (value) {
      const typeName = `[object ${type}]`;
      return typeName === Object.prototype.toString.call(value);
    };
    checkUtils[`is${type}`] = checker;
  });
}

buildTypeChecker(checkUtils);

// NaN校验
checkUtils.isNaN = Number.isNaN;

// 经纬度校验
checkUtils.isValidLatLng = function () {
  let lat; let lng;

  if (arguments.length === 1) {
    // [lat, lng] 或 {lat, lng} 或 TMap.LatLng
    const latLng = arguments[0];
    if (checkUtils.isArray(latLng)) {
      [lat, lng] = latLng;
    } else {
      lat = latLng.lat;
      lng = latLng.lng;
    }
  } else if (arguments.length === 2) {
    // lat, lng
    lat = arguments[0];
    lng = arguments[1];
  } else {
    // 无效参数
    return false;
  }

  if (checkUtils.isNumber(lat) && checkUtils.isNumber(lng)) {
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  } else {
    return false;
  }
};

/**
 * 检查颜色是否有效
 */
checkUtils.isValidColor = function (color) {
  if (checkUtils.isArray(color)) {
    if (color.length === 3 || color.length === 4) {
      return color.every(c => {
        return c >= 0 && c <= 255;
      });
    } else {
      return false;
    }
  } else if (checkUtils.isString(color)) {
    return HEX_REG.test(color) || RGB_REG.test(color) || RGBA_REG.test(color);
  }

  return false;
};

export default checkUtils;
