/**
 * @class 错误基类
 */
class BaseError {
  constructor(message) {
    this.message = message;
  }

  warn() {
    console.warn(this.message);
  }

  error() {
    console.error(this.message);
  }

  throw() {
    throw new Error(this.message);
  }
}

/**
 * @class 类型错误
 */
class BaseTypeError extends BaseError {
  constructor(name, expect, val) {
    super(`类型错误：${name} 应该是 ${expect.toUpperCase()} 类型, 实际却是 ${(typeof val).toUpperCase()} 类型。`);
  }
}

class ClassTypeError extends BaseError {
  constructor(name, expect, val) {
    super(`类型错误：${name} 应该是 ${expect} 类型, 实际值为 ${val}。`);
  }
}

/**
 * @class 枚举错误
 */
class EnumError extends BaseError {
  constructor(name, expect, val) {
    super(`枚举错误：${name} 的可枚举值为 ${expect.join(',')}，实际却是 ${val}`);
  }
}

class AJAXError {
  constructor(message, status) {
    this.message = message;
    this.status = status;
  }
}

export { BaseTypeError, ClassTypeError, EnumError, AJAXError };
