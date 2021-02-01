## 说明

腾讯位置服务JSAPI GL开放LayerPlugin作为自定义图层的实现基类，该类提供将图层添加到地图画布中的方法，并提供了一系列钩子函数以便用户在图层的生命周期中实现自定义的附加操作和渲染实现。自定义图层的渲染将在底层引擎的正向渲染流程中进行，插入在底图（线、面、楼块）渲染之后，点标记、文本标记渲染之前。用户可以获取到渲染上下文对象及相机参数，不可再另外创建canvas或者获取上下文。

此项目通过继承LayerPlugin并定义相应钩子函数来实现Three.js渲染引擎的接入。

### 项目结构

- demo: 使用示例
- src: 项目代码
  - libs: three相关源码和项目依赖的一些方法
  - model: 基于three封装的GLTF模型加载类
  - ThreeModelManager：LayerPlugin的实现，将Three渲染的内容挂载在地图上并实现交互的同步

### 使用方式

在根目录下启动http-server，并通过/example/gltf.html访问示例页面。

### 接口文档

#### LayerPlugin

自定义图层插件抽象类，用户可以此作为基类实现自定义/第三方的图层插入，基于此图层可以接入外部引擎（如three.js、cesium.js）渲染能力。

**构造函数**

参数说明见`LayerPluginOptions`对象规范。

```
new TMap.LayerPlugin(options:LayerPluginOptions);
```

**属性**

| 名称 | 类型      | 说明               |
| ---- | --------- | ------------------ |
| map  | Map       | （只读）地图实例   |
| gl   | GLContext | （只读）渲染上下文 |

**方法**

| 方法名                                   | 返回值 | 说明                                            |
| ---------------------------------------- | ------ | ----------------------------------------------- |
| addTo(map: Map)                          | this   | 将图层添加到指定地图                            |
| remove()                                 | this   | 将该图层从地图上移除                            |
| redraw()                                 | this   | 重新渲染                                        |
| on(eventName:String, listener:Function)  | this   | 添加listener到eventName事件的监听器数组中       |
| off(eventName:String, listener:Function) | this   | 从eventName事件的监听器数组中移除指定的listener |

**抽象函数**

| 方法名                                    | 返回值 | 说明                                                         |
| ----------------------------------------- | ------ | ------------------------------------------------------------ |
| onAddToMap(innerObjects:MapInnerObjects) | None   | 实现这个接口来定义图层添加过程，此方法在图层被添加到地图实例时被调用，该方法通过MapInnerObjects参数来获取地图内部对象。 |
| onRemoveFromMap()                        | None   | 实现这个接口来定义图层销毁阶段的过程，此方法在图层从地图实例中被移除时调用 |
| onDraw()                                 | None   | 实现这个接口来定义绘制函数，此方法在图层被绘制时调用         |

#### LayerPluginOptions 对象规范

自定义图层初始化参数说明。

| 名称   | 类型   | 说明                                                         |
| ------ | ------ | ------------------------------------------------------------ |
| map    | Map    | 地图实例                                                     |
| zIndex | Number | 图层渲染顺序，由小到大依次渲染，LayerPlugin可与同类、矢量图形类、可视化图层类调整相互压盖关系，默认为0 |

#### MapInnerObjects 对象规范

地图内部对象说明。

**属性**

| 名称   | 类型              | 说明                              |
| ------ | ----------------- | --------------------------------- |
| canvas | HTMLCanvasElement | 地图的绘制容器                    |
| camera | MapCamera         | 地图的相机，参见MapCamera对象说明 |

#### GLContext

地图引擎内部的渲染上下文，默认为`WebGL2RenderingContext`，在不支持WebGL2的浏览器中为`WebGLRenderingContext`。

另外，还附加了一些属性如下。

**属性**

| 名称     | 类型    | 说明           |
| -------- | ------- | -------------- |
| id       | String  | 唯一标识       |
| isWebGL2 | Boolean | 是否使用WebGL2 |

#### MapCamera

地图的相机对象，该对象具有以下只读属性：

| 名称     | 类型   | 说明                                       |
| -------- | ------ | ------------------------------------------ |
| heading  | Number | 相机绕z轴的旋转角                          |
| pitch    | Number | 相机绕x轴的旋转角                          |
| roll     | Number | 相机绕y轴的旋转角                          |
| fovy     | Number | 摄像机视锥体垂直视野角度                   |
| near     | Number | 相机视锥体近端面                           |
| far      | Number | 相机视锥体远端面                           |
| view     | Object | 相机视口，包括top、bottom、left、right属性 |
| distance | Number | 相机在z方向上距地图平面的距离              |