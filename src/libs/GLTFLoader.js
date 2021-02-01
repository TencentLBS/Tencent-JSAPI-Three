/**
 * Developer: totoroxiao
 * Date: 2020-07-01
 * [GLTF文件加载模块]
 */

import * as THREE from './three.module.js';
import GLTFParser from './GLTFParser.js';
import * as Extensions from './GLTFExtensions.js';

const { EXTENSIONS } = Extensions;

function GLTFLoader(manager) {
  THREE.Loader.call(this, manager);

  this.dracoLoader = null;
  this.ddsLoader = null;
}

GLTFLoader.prototype = Object.assign(Object.create(THREE.Loader.prototype), {

  constructor: GLTFLoader,

  load: function (url, onLoad, onProgress, onError) {
    const scope = this;

    let resourcePath;

    if (this.resourcePath !== '') {
      resourcePath = this.resourcePath;
    } else if (this.path !== '') {
      resourcePath = this.path;
    } else {
      resourcePath = THREE.LoaderUtils.extractUrlBase(url);
    }

    // Tells the LoadingManager to track an extra item, which resolves after
    // the model is fully loaded. This means the count of items loaded will
    // be incorrect, but ensures manager.onLoad() does not fire early.
    scope.manager.itemStart(url);

    const _onError = function (e) {
      if (onError) {
        onError(e);
      } else {
        console.error(e);
      }

      scope.manager.itemError(url);
      scope.manager.itemEnd(url);
    };

    const loader = new THREE.FileLoader(scope.manager);

    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');

    if (scope.crossOrigin === 'use-credentials') {
      loader.setWithCredentials(true);
    }

    loader.load(url, function (data) {
      try {
        scope.parse(data, resourcePath, function (gltf) {
          onLoad(gltf);

          scope.manager.itemEnd(url);
        }, _onError);
      } catch (e) {
        _onError(e);
      }
    }, onProgress, _onError);
  },

  setDRACOLoader: function (dracoLoader) {
    this.dracoLoader = dracoLoader;
    return this;
  },

  setDDSLoader: function (ddsLoader) {
    this.ddsLoader = ddsLoader;
    return this;
  },

  parse: function (data, path, onLoad, onError) {
    let content;
    const extensions = {};

    if (typeof data === 'string') {
      content = data;
    } else {
      const magic = THREE.LoaderUtils.decodeText(new Uint8Array(data, 0, 4));

      if (magic === BINARY_EXTENSION_HEADER_MAGIC) {
        try {
          extensions[ EXTENSIONS.KHR_BINARY_GLTF ] = new GLTFBinaryExtension(data);
        } catch (error) {
          if (onError) {
            onError(error);
          }
          return;
        }

        content = extensions[ EXTENSIONS.KHR_BINARY_GLTF ].content;
      } else {
        content = THREE.LoaderUtils.decodeText(new Uint8Array(data));
      }
    }

    const json = JSON.parse(content);

    if (json.asset === undefined || json.asset.version[ 0 ] < 2) {
      if (onError) {
        onError(new Error('THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.'));
      }
      return;
    }

    // 非必要: 加载扩展
    if (json.extensionsUsed) {
      for (let i = 0; i < json.extensionsUsed.length; ++ i) {
        const extensionName = json.extensionsUsed[ i ];
        const extensionsRequired = json.extensionsRequired || [];

        switch (extensionName) {
          case EXTENSIONS.KHR_LIGHTS_PUNCTUAL:
            extensions[ extensionName ] = new Extensions.GLTFLightsExtension(json);
            break;

          case EXTENSIONS.KHR_MATERIALS_CLEARCOAT:
            extensions[ extensionName ] = new Extensions.GLTFMaterialsClearcoatExtension();
            break;

          case EXTENSIONS.KHR_MATERIALS_UNLIT:
            extensions[ extensionName ] = new Extensions.GLTFMaterialsUnlitExtension();
            break;

          case EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS:
            extensions[ extensionName ] = new Extensions.GLTFMaterialsPbrSpecularGlossinessExtension();
            break;

          case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
            extensions[ extensionName ] = new Extensions.GLTFDracoMeshCompressionExtension(json, this.dracoLoader);
            break;

          case EXTENSIONS.MSFT_TEXTURE_DDS:
            extensions[ extensionName ] = new Extensions.GLTFTextureDDSExtension(this.ddsLoader);
            break;

          case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
            extensions[ extensionName ] = new Extensions.GLTFTextureTransformExtension();
            break;

          case EXTENSIONS.KHR_MESH_QUANTIZATION:
            extensions[ extensionName ] = new Extensions.GLTFMeshQuantizationExtension();
            break;

          default:

            if (extensionsRequired.indexOf(extensionName) >= 0) {
              console.warn(`THREE.GLTFLoader: Unknown extension "${extensionName}".`);
            }
        }
      }
    }

    const parser = new GLTFParser(json, extensions, {

      path: path || this.resourcePath || '',
      crossOrigin: this.crossOrigin,
      manager: this.manager

    });

    parser.parse(onLoad, onError);
  }

});

/* BINARY EXTENSION */
var BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
const BINARY_EXTENSION_HEADER_LENGTH = 12;
const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4E4F534A, BIN: 0x004E4942 };

function GLTFBinaryExtension(data) {
  this.name = EXTENSIONS.KHR_BINARY_GLTF;
  this.content = null;
  this.body = null;

  const headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);

  this.header = {
    magic: THREE.LoaderUtils.decodeText(new Uint8Array(data.slice(0, 4))),
    version: headerView.getUint32(4, true),
    length: headerView.getUint32(8, true)
  };

  if (this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC) {
    throw new Error('THREE.GLTFLoader: Unsupported glTF-Binary header.');
  } else if (this.header.version < 2.0) {
    throw new Error('THREE.GLTFLoader: Legacy binary file detected.');
  }

  const chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
  let chunkIndex = 0;

  while (chunkIndex < chunkView.byteLength) {
    const chunkLength = chunkView.getUint32(chunkIndex, true);
    chunkIndex += 4;

    const chunkType = chunkView.getUint32(chunkIndex, true);
    chunkIndex += 4;

    if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON) {
      const contentArray = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength);
      this.content = THREE.LoaderUtils.decodeText(contentArray);
    } else if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN) {
      const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
      this.body = data.slice(byteOffset, byteOffset + chunkLength);
    }

    // Clients must ignore chunks with unknown types.

    chunkIndex += chunkLength;
  }

  if (this.content === null) {
    throw new Error('THREE.GLTFLoader: JSON content not found.');
  }
}

export default GLTFLoader;
