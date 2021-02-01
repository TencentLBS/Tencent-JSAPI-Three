/**
 * Developer: totoroxiao
 * Date: 2020-07-01
 * [GLTF文件解析模块]
 */

import * as THREE from './three.module.js';
import { EXTENSIONS } from './GLTFExtensions.js';

/* CONSTANTS */

const WEBGL_CONSTANTS = {
  FLOAT: 5126,
  // FLOAT_MAT2: 35674,
  FLOAT_MAT3: 35675,
  FLOAT_MAT4: 35676,
  FLOAT_VEC2: 35664,
  FLOAT_VEC3: 35665,
  FLOAT_VEC4: 35666,
  LINEAR: 9729,
  REPEAT: 10497,
  SAMPLER_2D: 35678,
  POINTS: 0,
  LINES: 1,
  LINE_LOOP: 2,
  LINE_STRIP: 3,
  TRIANGLES: 4,
  TRIANGLE_STRIP: 5,
  TRIANGLE_FAN: 6,
  UNSIGNED_BYTE: 5121,
  UNSIGNED_SHORT: 5123
};

const WEBGL_COMPONENT_TYPES = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
};

const WEBGL_FILTERS = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter
};

const WEBGL_WRAPPINGS = {
  33071: THREE.ClampToEdgeWrapping,
  33648: THREE.MirroredRepeatWrapping,
  10497: THREE.RepeatWrapping
};

const WEBGL_TYPE_SIZES = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};

const ATTRIBUTES = {
  POSITION: 'position',
  NORMAL: 'normal',
  TANGENT: 'tangent',
  TEXCOORD_0: 'uv',
  TEXCOORD_1: 'uv2',
  COLOR_0: 'color',
  WEIGHTS_0: 'skinWeight',
  JOINTS_0: 'skinIndex',
};

const PATH_PROPERTIES = {
  scale: 'scale',
  translation: 'position',
  rotation: 'quaternion',
  weights: 'morphTargetInfluences'
};

const INTERPOLATION = {
  CUBICSPLINE: undefined, // We use a custom interpolant (GLTFCubicSplineInterpolation) for CUBICSPLINE tracks. Each
  // keyframe track will be initialized with a default interpolation type, then modified.
  LINEAR: THREE.InterpolateLinear,
  STEP: THREE.InterpolateDiscrete
};

const ALPHA_MODES = {
  OPAQUE: 'OPAQUE',
  MASK: 'MASK',
  BLEND: 'BLEND'
};

const MIME_TYPE_FORMATS = {
  'image/png': THREE.RGBAFormat,
  'image/jpeg': THREE.RGBFormat
};

/* GLTFREGISTRY */

function GLTFRegistry() {
  let objects = {};

  return {

    get: function (key) {
      return objects[key];
    },

    add: function (key, object) {
      objects[key] = object;
    },

    remove: function (key) {
      delete objects[key];
    },

    removeAll: function () {
      objects = {};
    }

  };
}

/**
	 * A sub class of THREE.StandardMaterial with some of the functionality
	 * changed via the `onBeforeCompile` callback
	 * @pailhead
	 */

function GLTFMeshStandardSGMaterial(params) {
  THREE.MeshStandardMaterial.call(this);

  this.isGLTFSpecularGlossinessMaterial = true;

  // various chunks that need replacing
  const specularMapParsFragmentChunk = [
    '#ifdef USE_SPECULARMAP',
    '	uniform sampler2D specularMap;',
    '#endif'
  ].join('\n');

  const glossinessMapParsFragmentChunk = [
    '#ifdef USE_GLOSSINESSMAP',
    '	uniform sampler2D glossinessMap;',
    '#endif'
  ].join('\n');

  const specularMapFragmentChunk = [
    'vec3 specularFactor = specular;',
    '#ifdef USE_SPECULARMAP',
    '	vec4 texelSpecular = texture2D( specularMap, vUv );',
    '	texelSpecular = sRGBToLinear( texelSpecular );',
    '	// reads channel RGB, compatible with a glTF Specular-Glossiness (RGBA) texture',
    '	specularFactor *= texelSpecular.rgb;',
    '#endif'
  ].join('\n');

  const glossinessMapFragmentChunk = [
    'float glossinessFactor = glossiness;',
    '#ifdef USE_GLOSSINESSMAP',
    '	vec4 texelGlossiness = texture2D( glossinessMap, vUv );',
    '	// reads channel A, compatible with a glTF Specular-Glossiness (RGBA) texture',
    '	glossinessFactor *= texelGlossiness.a;',
    '#endif'
  ].join('\n');

  const lightPhysicalFragmentChunk = [
    'PhysicalMaterial material;',
    'material.diffuseColor = diffuseColor.rgb;',
    'vec3 dxy = max( abs( dFdx( geometryNormal ) ), abs( dFdy( geometryNormal ) ) );',
    'float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );',
    'material.specularRoughness = max( 1.0 - glossinessFactor, 0.0525 );// 0.0525 corresponds to the base mip of a 256 cubemap.',
    'material.specularRoughness += geometryRoughness;',
    'material.specularRoughness = min( material.specularRoughness, 1.0 );',
    'material.specularColor = specularFactor.rgb;',
  ].join('\n');

  const uniforms = {
    specular: { value: new THREE.Color().setHex(0xffffff) },
    glossiness: { value: 1 },
    specularMap: { value: null },
    glossinessMap: { value: null }
  };

  this._extraUniforms = uniforms;

  // please see #14031 or #13198 for an alternate approach
  this.onBeforeCompile = function (shader) {
    for (const uniformName in uniforms) {
      shader.uniforms[uniformName] = uniforms[uniformName];
    }

    shader.fragmentShader = shader.fragmentShader.replace('uniform float roughness;', 'uniform vec3 specular;');
    shader.fragmentShader = shader.fragmentShader.replace('uniform float metalness;', 'uniform float glossiness;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_pars_fragment>', specularMapParsFragmentChunk);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_pars_fragment>', glossinessMapParsFragmentChunk);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', specularMapFragmentChunk);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', glossinessMapFragmentChunk);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', lightPhysicalFragmentChunk);
  };

  /*eslint-disable*/
	Object.defineProperties(
		this,
		{
			specular: {
				get: function () { return uniforms.specular.value; },
				set: function (v) { uniforms.specular.value = v; }
			},
			specularMap: {
				get: function () { return uniforms.specularMap.value; },
				set: function (v) { uniforms.specularMap.value = v; }
			},
			glossiness: {
				get: function () { return uniforms.glossiness.value; },
				set: function (v) { uniforms.glossiness.value = v; }
			},
			glossinessMap: {
				get: function () { return uniforms.glossinessMap.value; },
				set: function (v) {

					uniforms.glossinessMap.value = v;
					//how about something like this - @pailhead
					if (v) {

						this.defines.USE_GLOSSINESSMAP = '';
						// set USE_ROUGHNESSMAP to enable vUv
						this.defines.USE_ROUGHNESSMAP = '';

					} else {

						delete this.defines.USE_ROUGHNESSMAP;
						delete this.defines.USE_GLOSSINESSMAP;

					}

				}
			}
		}
	);

	/* eslint-enable*/
  delete this.metalness;
  delete this.roughness;
  delete this.metalnessMap;
  delete this.roughnessMap;

  this.setValues(params);
}

/* GLTF PARSER */

export default function GLTFParser(json, extensions, options) {
  this.json = json || {};
  this.extensions = extensions || {};
  this.options = options || {};

  // loader object cache
  this.cache = new GLTFRegistry();

  // BufferGeometry caching
  this.primitiveCache = {};

  this.textureLoader = new THREE.TextureLoader(this.options.manager);
  this.textureLoader.setCrossOrigin(this.options.crossOrigin);

  this.fileLoader = new THREE.FileLoader(this.options.manager);
  this.fileLoader.setResponseType('arraybuffer');

  if (this.options.crossOrigin === 'use-credentials') {
    this.fileLoader.setWithCredentials(true);
  }
}

GLTFParser.prototype.parse = function (onLoad, onError) {
  const parser = this;
  const { json } = this;
  const { extensions } = this;

  // Clear the loader cache
  this.cache.removeAll();

  // Mark the special nodes/meshes in json for efficient parse
  this.markDefs();

  Promise.all([

    this.getDependencies('scene'),
    this.getDependencies('animation'),
    this.getDependencies('camera'),

  ]).then(function (dependencies) {
    const result = {
      scene: dependencies[0][json.scene || 0],
      scenes: dependencies[0],
      animations: dependencies[1],
      cameras: dependencies[2],
      asset: json.asset,
      parser: parser,
      userData: {}
    };

    addUnknownExtensionsToUserData(extensions, result, json);

    assignExtrasToUserData(result, json);

    onLoad(result);
  })
    .catch(onError);
};

/**
 * Marks the special nodes/meshes in json for efficient parse.
 */
GLTFParser.prototype.markDefs = function () {
  const nodeDefs = this.json.nodes || [];
  const skinDefs = this.json.skins || [];
  const meshDefs = this.json.meshes || [];

  const meshReferences = {};
  const meshUses = {};

  // Nothing in the node definition indicates whether it is a Bone or an
  // Object3D. Use the skins' joint references to mark bones.
  for (let skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex++) {
    const { joints } = skinDefs[skinIndex];

    for (let i = 0, il = joints.length; i < il; i++) {
      nodeDefs[joints[i]].isBone = true;
    }
  }

  // Meshes can (and should) be reused by multiple nodes in a glTF asset. To
  // avoid having more than one THREE.Mesh with the same name, count
  // references and rename instances below.
  //
  // Example: CesiumMilkTruck sample model reuses "Wheel" meshes.
  for (let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++) {
    const nodeDef = nodeDefs[nodeIndex];

    if (nodeDef.mesh !== undefined) {
      if (meshReferences[nodeDef.mesh] === undefined) {
        meshReferences[nodeDef.mesh] = meshUses[nodeDef.mesh] = 0;
      }

      meshReferences[nodeDef.mesh]++;

      // Nothing in the mesh definition indicates whether it is
      // a SkinnedMesh or Mesh. Use the node's mesh reference
      // to mark SkinnedMesh if node has skin.
      if (nodeDef.skin !== undefined) {
        meshDefs[nodeDef.mesh].isSkinnedMesh = true;
      }
    }
  }

  this.json.meshReferences = meshReferences;
  this.json.meshUses = meshUses;
};

/**
 * Requests the specified dependency asynchronously, with caching.
 * @param {string} type
 * @param {number} index
 * @return {Promise<THREE.Object3D|THREE.Material|THREE.Texture|THREE.AnimationClip|ArrayBuffer|Object>}
 */
GLTFParser.prototype.getDependency = function (type, index) {
  const cacheKey = `${type}:${index}`;
  let dependency = this.cache.get(cacheKey);

  if (!dependency) {
    switch (type) {
      case 'scene':
        dependency = this.loadScene(index);
        break;

      case 'node':
        dependency = this.loadNode(index);
        break;

      case 'mesh':
        dependency = this.loadMesh(index);
        break;

      case 'accessor':
        dependency = this.loadAccessor(index);
        break;

      case 'bufferView':
        dependency = this.loadBufferView(index);
        break;

      case 'buffer':
        dependency = this.loadBuffer(index);
        break;

      case 'material':
        dependency = this.loadMaterial(index);
        break;

      case 'texture':
        dependency = this.loadTexture(index);
        break;

      case 'skin':
        dependency = this.loadSkin(index);
        break;

      case 'animation':
        dependency = this.loadAnimation(index);
        break;

      case 'camera':
        dependency = this.loadCamera(index);
        break;

      case 'light':
        dependency = this.extensions[EXTENSIONS.KHR_LIGHTS_PUNCTUAL].loadLight(index);
        break;

      default:
        throw new Error(`Unknown type: ${type}`);
    }

    this.cache.add(cacheKey, dependency);
  }

  return dependency;
};

/**
 * Requests all dependencies of the specified type asynchronously, with caching.
 * @param {string} type
 * @return {Promise<Array<Object>>}
 */
GLTFParser.prototype.getDependencies = function (type) {
  let dependencies = this.cache.get(type);

  if (!dependencies) {
    const parser = this;
    const defs = this.json[type + (type === 'mesh' ? 'es' : 's')] || [];

    dependencies = Promise.all(defs.map(function (def, index) {
      return parser.getDependency(type, index);
    }));

    this.cache.add(type, dependencies);
  }

  return dependencies;
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
 * @param {number} bufferIndex
 * @return {Promise<ArrayBuffer>}
 */
GLTFParser.prototype.loadBuffer = function (bufferIndex) {
  const bufferDef = this.json.buffers[bufferIndex];
  const loader = this.fileLoader;

  if (bufferDef.type && bufferDef.type !== 'arraybuffer') {
    throw new Error(`THREE.GLTFLoader: ${bufferDef.type} buffer type is not supported.`);
  }

  // If present, GLB container is required to be the first buffer.
  if (bufferDef.uri === undefined && bufferIndex === 0) {
    return Promise.resolve(this.extensions[EXTENSIONS.KHR_BINARY_GLTF].body);
  }

  const { options } = this;

  return new Promise(function (resolve, reject) {
    loader.load(resolveURL(bufferDef.uri, options.path), resolve, undefined, function () {
      reject(new Error(`THREE.GLTFLoader: Failed to load buffer "${bufferDef.uri}".`));
    });
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
 * @param {number} bufferViewIndex
 * @return {Promise<ArrayBuffer>}
 */
GLTFParser.prototype.loadBufferView = function (bufferViewIndex) {
  const bufferViewDef = this.json.bufferViews[bufferViewIndex];

  return this.getDependency('buffer', bufferViewDef.buffer).then(function (buffer) {
    const byteLength = bufferViewDef.byteLength || 0;
    const byteOffset = bufferViewDef.byteOffset || 0;
    return buffer.slice(byteOffset, byteOffset + byteLength);
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#accessors
 * @param {number} accessorIndex
 * @return {Promise<THREE.THREE.BufferAttribute|THREE.THREE.InterleavedBufferAttribute>}
 */
GLTFParser.prototype.loadAccessor = function (accessorIndex) {
  const parser = this;
  const { json } = this;

  const accessorDef = this.json.accessors[accessorIndex];

  if (accessorDef.bufferView === undefined && accessorDef.sparse === undefined) {
    // Ignore empty accessors, which may be used to declare runtime
    // information about attributes coming from another source (e.g. Draco
    // compression extension).
    return Promise.resolve(null);
  }

  const pendingBufferViews = [];

  if (accessorDef.bufferView !== undefined) {
    pendingBufferViews.push(this.getDependency('bufferView', accessorDef.bufferView));
  } else {
    pendingBufferViews.push(null);
  }

  if (accessorDef.sparse !== undefined) {
    pendingBufferViews.push(this.getDependency('bufferView', accessorDef.sparse.indices.bufferView));
    pendingBufferViews.push(this.getDependency('bufferView', accessorDef.sparse.values.bufferView));
  }

  return Promise.all(pendingBufferViews).then(function (bufferViews) {
    const bufferView = bufferViews[0];

    const itemSize = WEBGL_TYPE_SIZES[accessorDef.type];
    const TypedArray = WEBGL_COMPONENT_TYPES[accessorDef.componentType];

    // For VEC3: itemSize is 3, elementBytes is 4, itemBytes is 12.
    const elementBytes = TypedArray.BYTES_PER_ELEMENT;
    const itemBytes = elementBytes * itemSize;
    const byteOffset = accessorDef.byteOffset || 0;
    const byteStride = accessorDef.bufferView !== undefined ? json.bufferViews[accessorDef.bufferView].byteStride : undefined;
    const normalized = accessorDef.normalized === true;
    let array; let bufferAttribute;

    // The buffer is not interleaved if the stride is the item size in bytes.
    if (byteStride && byteStride !== itemBytes) {
      // Each "slice" of the buffer, as defined by 'count' elements of 'byteStride' bytes, gets its own THREE.InterleavedBuffer
      // This makes sure that IBA.count reflects accessor.count properly
      const ibSlice = Math.floor(byteOffset / byteStride);
      const ibCacheKey = `THREE.InterleavedBuffer:${accessorDef.bufferView}:${accessorDef.componentType}:${ibSlice}:${accessorDef.count}`;
      let ib = parser.cache.get(ibCacheKey);

      if (!ib) {
        array = new TypedArray(bufferView, ibSlice * byteStride, accessorDef.count * byteStride / elementBytes);

        // Integer parameters to IB/IBA are in array elements, not bytes.
        ib = new THREE.InterleavedBuffer(array, byteStride / elementBytes);

        parser.cache.add(ibCacheKey, ib);
      }

      bufferAttribute = new THREE.InterleavedBufferAttribute(ib, itemSize, (byteOffset % byteStride) / elementBytes, normalized);
    } else {
      if (bufferView === null) {
        array = new TypedArray(accessorDef.count * itemSize);
      } else {
        array = new TypedArray(bufferView, byteOffset, accessorDef.count * itemSize);
      }

      bufferAttribute = new THREE.BufferAttribute(array, itemSize, normalized);
    }

    // https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#sparse-accessors
    if (accessorDef.sparse !== undefined) {
      const itemSizeIndices = WEBGL_TYPE_SIZES.SCALAR;
      const TypedArrayIndices = WEBGL_COMPONENT_TYPES[accessorDef.sparse.indices.componentType];

      const byteOffsetIndices = accessorDef.sparse.indices.byteOffset || 0;
      const byteOffsetValues = accessorDef.sparse.values.byteOffset || 0;

      const sparseIndices = new TypedArrayIndices(bufferViews[1], byteOffsetIndices, accessorDef.sparse.count * itemSizeIndices);
      const sparseValues = new TypedArray(bufferViews[2], byteOffsetValues, accessorDef.sparse.count * itemSize);

      if (bufferView !== null) {
        // Avoid modifying the original ArrayBuffer, if the bufferView wasn't initialized with zeroes.
        bufferAttribute = new THREE.BufferAttribute(bufferAttribute.array.slice(), bufferAttribute.itemSize, bufferAttribute.normalized);
      }

      for (let i = 0, il = sparseIndices.length; i < il; i++) {
        const index = sparseIndices[i];

        bufferAttribute.setX(index, sparseValues[i * itemSize]);
        if (itemSize >= 2) {
          bufferAttribute.setY(index, sparseValues[i * itemSize + 1]);
        }
        if (itemSize >= 3) {
          bufferAttribute.setZ(index, sparseValues[i * itemSize + 2]);
        }
        if (itemSize >= 4) {
          bufferAttribute.setW(index, sparseValues[i * itemSize + 3]);
        }
        if (itemSize >= 5) {
          throw new Error('THREE.GLTFLoader: Unsupported itemSize in sparse THREE.BufferAttribute.');
        }
      }
    }

    return bufferAttribute;
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#textures
 * @param {number} textureIndex
 * @return {Promise<THREE.Texture>}
 */
GLTFParser.prototype.loadTexture = function (textureIndex) {
  const parser = this;
  const { json } = this;
  const { options } = this;
  const { textureLoader } = this;

  const URL = self.URL || self.webkitURL;

  const textureDef = json.textures[textureIndex];

  const textureExtensions = textureDef.extensions || {};

  let source;

  if (textureExtensions[EXTENSIONS.MSFT_TEXTURE_DDS]) {
    source = json.images[textureExtensions[EXTENSIONS.MSFT_TEXTURE_DDS].source];
  } else {
    source = json.images[textureDef.source];
  }

  let sourceURI = source.uri;
  let isObjectURL = false;

  if (source.bufferView !== undefined) {
    // Load binary image data from bufferView, if provided.

    sourceURI = parser.getDependency('bufferView', source.bufferView).then(function (bufferView) {
      isObjectURL = true;
      const blob = new Blob([bufferView], { type: source.mimeType });
      sourceURI = URL.createObjectURL(blob);
      return sourceURI;
    });
  }

  return Promise.resolve(sourceURI).then(function (sourceURI) {
    // Load Texture resource.

    let loader = options.manager.getHandler(sourceURI);

    if (!loader) {
      loader = textureExtensions[EXTENSIONS.MSFT_TEXTURE_DDS]
        ? parser.extensions[EXTENSIONS.MSFT_TEXTURE_DDS].ddsLoader
        : textureLoader;
    }

    return new Promise(function (resolve, reject) {
      loader.load(resolveURL(sourceURI, options.path), resolve, undefined, reject);
    });
  })
    .then(function (texture) {
      // Clean up resources and configure Texture.

      if (isObjectURL === true) {
        URL.revokeObjectURL(sourceURI);
      }

      texture.flipY = false;

      if (textureDef.name) {
        texture.name = textureDef.name;
      }

      // Ignore unknown mime types, like DDS files.
      if (source.mimeType in MIME_TYPE_FORMATS) {
        texture.format = MIME_TYPE_FORMATS[source.mimeType];
      }

      const samplers = json.samplers || {};
      const sampler = samplers[textureDef.sampler] || {};

      texture.magFilter = WEBGL_FILTERS[sampler.magFilter] || THREE.LinearFilter;
      texture.minFilter = WEBGL_FILTERS[sampler.minFilter] || THREE.LinearMipmapLinearFilter;
      texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || THREE.RepeatWrapping;
      texture.wrapT = WEBGL_WRAPPINGS[sampler.wrapT] || THREE.RepeatWrapping;

      return texture;
    });
};

/**
 * Asynchronously assigns a texture to the given material parameters.
 * @param {Object} materialParams
 * @param {string} mapName
 * @param {Object} mapDef
 * @return {Promise}
 */
GLTFParser.prototype.assignTexture = function (materialParams, mapName, mapDef) {
  const parser = this;

  return this.getDependency('texture', mapDef.index).then(function (texture) {
    if (!texture.isCompressedTexture) {
      switch (mapName) {
        case 'aoMap':
        case 'emissiveMap':
        case 'metalnessMap':
        case 'normalMap':
        case 'roughnessMap':
          texture.format = THREE.RGBFormat;
          break;
      }
    }

    // Materials sample aoMap from UV set 1 and other maps from UV set 0 - this can't be configured
    // However, we will copy UV set 0 to UV set 1 on demand for aoMap
    if (mapDef.texCoord !== undefined && mapDef.texCoord !== 0 && !(mapName === 'aoMap' && mapDef.texCoord === 1)) {
      console.warn(`THREE.GLTFLoader: Custom UV set ${mapDef.texCoord} for texture ${mapName} not yet supported.`);
    }

    if (parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM]) {
      const transform = mapDef.extensions !== undefined ? mapDef.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM] : undefined;

      if (transform) {
        texture = parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM].extendTexture(texture, transform);
      }
    }

    materialParams[mapName] = texture;
  });
};

/**
 * Assigns final material to a Mesh, Line, or Points instance. The instance
 * already has a material (generated from the glTF material options alone)
 * but reuse of the same glTF material may require multiple threejs materials
 * to accomodate different primitive types, defines, etc. New materials will
 * be created if necessary, and reused from a cache.
 * @param  {THREE.Object3D} mesh Mesh, Line, or Points instance.
 */
GLTFParser.prototype.assignFinalMaterial = function (mesh) {
  const { geometry } = mesh;
  let { material } = mesh;

  const useVertexTangents = geometry.attributes.tangent !== undefined;
  const useVertexColors = geometry.attributes.color !== undefined;
  const useFlatShading = geometry.attributes.normal === undefined;
  const useSkinning = mesh.isSkinnedMesh === true;
  const useMorphTargets = Object.keys(geometry.morphAttributes).length > 0;
  const useMorphNormals = useMorphTargets && geometry.morphAttributes.normal !== undefined;

  if (mesh.isPoints) {
    var cacheKey = `PointsMaterial:${material.uuid}`;

    let pointsMaterial = this.cache.get(cacheKey);

    if (!pointsMaterial) {
      pointsMaterial = new THREE.PointsMaterial();
      THREE.Material.prototype.copy.call(pointsMaterial, material);
      pointsMaterial.color.copy(material.color);
      pointsMaterial.map = material.map;
      pointsMaterial.sizeAttenuation = false; // glTF spec says points should be 1px

      this.cache.add(cacheKey, pointsMaterial);
    }

    material = pointsMaterial;
  } else if (mesh.isLine) {
    var cacheKey = `LineBasicMaterial:${material.uuid}`;

    let lineMaterial = this.cache.get(cacheKey);

    if (!lineMaterial) {
      lineMaterial = new THREE.LineBasicMaterial();
      THREE.Material.prototype.copy.call(lineMaterial, material);
      lineMaterial.color.copy(material.color);

      this.cache.add(cacheKey, lineMaterial);
    }

    material = lineMaterial;
  }

  // Clone the material if it will be modified
  if (useVertexTangents || useVertexColors || useFlatShading || useSkinning || useMorphTargets) {
    var cacheKey = `ClonedMaterial:${material.uuid}:`;

    if (material.isGLTFSpecularGlossinessMaterial) {
      cacheKey += 'specular-glossiness:';
    }
    if (useSkinning) {
      cacheKey += 'skinning:';
    }
    if (useVertexTangents) {
      cacheKey += 'vertex-tangents:';
    }
    if (useVertexColors) {
      cacheKey += 'vertex-colors:';
    }
    if (useFlatShading) {
      cacheKey += 'flat-shading:';
    }
    if (useMorphTargets) {
      cacheKey += 'morph-targets:';
    }
    if (useMorphNormals) {
      cacheKey += 'morph-normals:';
    }

    let cachedMaterial = this.cache.get(cacheKey);

    if (!cachedMaterial) {
      cachedMaterial = material.clone();

      if (useSkinning) {
        cachedMaterial.skinning = true;
      }
      if (useVertexTangents) {
        cachedMaterial.vertexTangents = true;
      }
      if (useVertexColors) {
        cachedMaterial.vertexColors = true;
      }
      if (useFlatShading) {
        cachedMaterial.flatShading = true;
      }
      if (useMorphTargets) {
        cachedMaterial.morphTargets = true;
      }
      if (useMorphNormals) {
        cachedMaterial.morphNormals = true;
      }

      this.cache.add(cacheKey, cachedMaterial);
    }

    material = cachedMaterial;
  }

  // workarounds for mesh and geometry

  if (material.aoMap && geometry.attributes.uv2 === undefined && geometry.attributes.uv !== undefined) {
    geometry.setAttribute('uv2', geometry.attributes.uv);
  }

  // https://github.com/mrdoob/three.js/issues/11438#issuecomment-507003995
  if (material.normalScale && !useVertexTangents) {
    material.normalScale.y = - material.normalScale.y;
  }

  if (material.clearcoatNormalScale && !useVertexTangents) {
    material.clearcoatNormalScale.y = - material.clearcoatNormalScale.y;
  }

  mesh.material = material;
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#materials
 * @param {number} materialIndex
 * @return {Promise<THREE.Material>}
 */
GLTFParser.prototype.loadMaterial = function (materialIndex) {
  const parser = this;
  const { json } = this;
  const { extensions } = this;
  const materialDef = json.materials[materialIndex];

  let materialType;
  const materialParams = {};
  const materialExtensions = materialDef.extensions || {};

  const pending = [];

  if (materialExtensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS]) {
    const sgExtension = extensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS];
    materialType = sgExtension.getMaterialType();
    pending.push(sgExtension.extendParams(materialParams, materialDef, parser));
  } else if (materialExtensions[EXTENSIONS.KHR_MATERIALS_UNLIT]) {
    const kmuExtension = extensions[EXTENSIONS.KHR_MATERIALS_UNLIT];
    materialType = kmuExtension.getMaterialType();
    pending.push(kmuExtension.extendParams(materialParams, materialDef, parser));
  } else {
    // Specification:
    // https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#metallic-roughness-material

    materialType = THREE.MeshStandardMaterial;

    const metallicRoughness = materialDef.pbrMetallicRoughness || {};

    materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
    materialParams.opacity = 1.0;

    if (Array.isArray(metallicRoughness.baseColorFactor)) {
      const array = metallicRoughness.baseColorFactor;

      materialParams.color.fromArray(array);
      materialParams.opacity = array[3];
    }

    if (metallicRoughness.baseColorTexture !== undefined) {
      pending.push(parser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture));
    }

    materialParams.metalness = metallicRoughness.metallicFactor !== undefined ? metallicRoughness.metallicFactor : 1.0;
    materialParams.roughness = metallicRoughness.roughnessFactor !== undefined ? metallicRoughness.roughnessFactor : 1.0;

    if (metallicRoughness.metallicRoughnessTexture !== undefined) {
      pending.push(parser.assignTexture(materialParams, 'metalnessMap', metallicRoughness.metallicRoughnessTexture));
      pending.push(parser.assignTexture(materialParams, 'roughnessMap', metallicRoughness.metallicRoughnessTexture));
    }
  }

  if (materialDef.doubleSided === true) {
    materialParams.side = THREE.DoubleSide;
  }

  const alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;

  if (alphaMode === ALPHA_MODES.BLEND) {
    materialParams.transparent = true;

    // See: https://github.com/mrdoob/three.js/issues/17706
    materialParams.depthWrite = false;
  } else {
    materialParams.transparent = false;

    if (alphaMode === ALPHA_MODES.MASK) {
      materialParams.alphaTest = materialDef.alphaCutoff !== undefined ? materialDef.alphaCutoff : 0.5;
    }
  }

  if (materialDef.normalTexture !== undefined && materialType !== THREE.MeshBasicMaterial) {
    pending.push(parser.assignTexture(materialParams, 'normalMap', materialDef.normalTexture));

    materialParams.normalScale = new THREE.Vector2(1, 1);

    if (materialDef.normalTexture.scale !== undefined) {
      materialParams.normalScale.set(materialDef.normalTexture.scale, materialDef.normalTexture.scale);
    }
  }

  if (materialDef.occlusionTexture !== undefined && materialType !== THREE.MeshBasicMaterial) {
    pending.push(parser.assignTexture(materialParams, 'aoMap', materialDef.occlusionTexture));

    if (materialDef.occlusionTexture.strength !== undefined) {
      materialParams.aoMapIntensity = materialDef.occlusionTexture.strength;
    }
  }

  if (materialDef.emissiveFactor !== undefined && materialType !== THREE.MeshBasicMaterial) {
    materialParams.emissive = new THREE.Color().fromArray(materialDef.emissiveFactor);
  }

  if (materialDef.emissiveTexture !== undefined && materialType !== THREE.MeshBasicMaterial) {
    pending.push(parser.assignTexture(materialParams, 'emissiveMap', materialDef.emissiveTexture));
  }

  if (materialExtensions[EXTENSIONS.KHR_MATERIALS_CLEARCOAT]) {
    const clearcoatExtension = extensions[EXTENSIONS.KHR_MATERIALS_CLEARCOAT];
    materialType = clearcoatExtension.getMaterialType();
    pending.push(clearcoatExtension.extendParams(materialParams, { extensions: materialExtensions }, parser));
  }

  return Promise.all(pending).then(function () {
    let material;

    if (materialType === GLTFMeshStandardSGMaterial) {
      material = extensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS].createMaterial(materialParams);
    } else {
      material = new materialType(materialParams);
    }

    if (materialDef.name) {
      material.name = materialDef.name;
    }

    // baseColorTexture, emissiveTexture, and specularGlossinessTexture use sRGB encoding.
    if (material.map) {
      material.map.encoding = THREE.sRGBEncoding;
    }
    if (material.emissiveMap) {
      material.emissiveMap.encoding = THREE.sRGBEncoding;
    }

    assignExtrasToUserData(material, materialDef);

    if (materialDef.extensions) {
      addUnknownExtensionsToUserData(extensions, material, materialDef);
    }

    return material;
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#geometry
 *
 * Creates BufferGeometries from primitives.
 *
 * @param {Array<GLTF.Primitive>} primitives
 * @return {Promise<Array<THREE.BufferGeometry>>}
 */
GLTFParser.prototype.loadGeometries = function (primitives) {
  const parser = this;
  const { extensions } = this;
  const cache = this.primitiveCache;

  function createDracoPrimitive(primitive) {
    return extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION]
      .decodePrimitive(primitive, parser)
      .then(function (geometry) {
        return addPrimitiveAttributes(geometry, primitive, parser);
      });
  }

  const pending = [];

  for (let i = 0, il = primitives.length; i < il; i++) {
    const primitive = primitives[i];
    const cacheKey = createPrimitiveKey(primitive);

    // See if we've already created this geometry
    const cached = cache[cacheKey];

    if (cached) {
      // Use the cached geometry if it exists
      pending.push(cached.promise);
    } else {
      var geometryPromise;

      if (primitive.extensions && primitive.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION]) {
        // Use DRACO geometry if available
        geometryPromise = createDracoPrimitive(primitive);
      } else {
        // Otherwise create a new geometry
        geometryPromise = addPrimitiveAttributes(new THREE.BufferGeometry(), primitive, parser);
      }

      // Cache this geometry
      cache[cacheKey] = { primitive: primitive, promise: geometryPromise };

      pending.push(geometryPromise);
    }
  }

  return Promise.all(pending);
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes
 * @param {number} meshIndex
 * @return {Promise<THREE.Group|THREE.Mesh|THREE.SkinnedMesh>}
 */
GLTFParser.prototype.loadMesh = function (meshIndex) {
  const parser = this;
  const { json } = this;

  const meshDef = json.meshes[meshIndex];
  const { primitives } = meshDef;

  const pending = [];

  for (let i = 0, il = primitives.length; i < il; i++) {
    const material = primitives[i].material === undefined
      ? createDefaultMaterial(this.cache)
      : this.getDependency('material', primitives[i].material);

    pending.push(material);
  }

  pending.push(parser.loadGeometries(primitives));

  return Promise.all(pending).then(function (results) {
    const materials = results.slice(0, results.length - 1);
    const geometries = results[results.length - 1];

    const meshes = [];

    for (var i = 0, il = geometries.length; i < il; i++) {
      const geometry = geometries[i];
      const primitive = primitives[i];

      // 1. create Mesh

      var mesh;

      const material = materials[i];

      if (primitive.mode === WEBGL_CONSTANTS.TRIANGLES ||
				primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP ||
				primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN ||
				primitive.mode === undefined) {
        // .isSkinnedMesh isn't in glTF spec. See .markDefs()
        mesh = meshDef.isSkinnedMesh === true
          ? new THREE.SkinnedMesh(geometry, material)
          : new THREE.Mesh(geometry, material);

        if (mesh.isSkinnedMesh === true && !mesh.geometry.attributes.skinWeight.normalized) {
          // we normalize floating point skin weight array to fix malformed assets (see #15319)
          // it's important to skip this for non-float32 data since normalizeSkinWeights assumes non-normalized inputs
          mesh.normalizeSkinWeights();
        }

        if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP) {
          mesh.geometry = toTrianglesDrawMode(mesh.geometry, THREE.TriangleStripDrawMode);
        } else if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN) {
          mesh.geometry = toTrianglesDrawMode(mesh.geometry, THREE.TriangleFanDrawMode);
        }
      } else if (primitive.mode === WEBGL_CONSTANTS.LINES) {
        mesh = new THREE.LineSegments(geometry, material);
      } else if (primitive.mode === WEBGL_CONSTANTS.LINE_STRIP) {
        mesh = new THREE.Line(geometry, material);
      } else if (primitive.mode === WEBGL_CONSTANTS.LINE_LOOP) {
        mesh = new THREE.LineLoop(geometry, material);
      } else if (primitive.mode === WEBGL_CONSTANTS.POINTS) {
        mesh = new THREE.Points(geometry, material);
      } else {
        throw new Error(`THREE.GLTFLoader: Primitive mode unsupported: ${primitive.mode}`);
      }

      if (Object.keys(mesh.geometry.morphAttributes).length > 0) {
        updateMorphTargets(mesh, meshDef);
      }

      mesh.name = meshDef.name || (`mesh_${meshIndex}`);

      if (geometries.length > 1) {
        mesh.name += `_${i}`;
      }

      assignExtrasToUserData(mesh, meshDef);

      parser.assignFinalMaterial(mesh);

      meshes.push(mesh);
    }

    if (meshes.length === 1) {
      return meshes[0];
    }

    const group = new THREE.Group();

    for (var i = 0, il = meshes.length; i < il; i++) {
      group.add(meshes[i]);
    }

    return group;
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
 * @param {number} cameraIndex
 * @return {Promise<THREE.Camera>}
 */
GLTFParser.prototype.loadCamera = function (cameraIndex) {
  let camera;
  const cameraDef = this.json.cameras[cameraIndex];
  const params = cameraDef[cameraDef.type];

  if (!params) {
    console.warn('THREE.GLTFLoader: Missing camera parameters.');
    return;
  }

  if (cameraDef.type === 'perspective') {
    camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(params.yfov), params.aspectRatio || 1, params.znear || 1, params.zfar || 2e6);
  } else if (cameraDef.type === 'orthographic') {
    camera = new THREE.OrthographicCamera(- params.xmag, params.xmag, params.ymag, - params.ymag, params.znear, params.zfar);
  }

  if (cameraDef.name) {
    camera.name = cameraDef.name;
  }

  assignExtrasToUserData(camera, cameraDef);

  return Promise.resolve(camera);
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#skins
 * @param {number} skinIndex
 * @return {Promise<Object>}
 */
GLTFParser.prototype.loadSkin = function (skinIndex) {
  const skinDef = this.json.skins[skinIndex];

  const skinEntry = { joints: skinDef.joints };

  if (skinDef.inverseBindMatrices === undefined) {
    return Promise.resolve(skinEntry);
  }

  return this.getDependency('accessor', skinDef.inverseBindMatrices).then(function (accessor) {
    skinEntry.inverseBindMatrices = accessor;

    return skinEntry;
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#animations
 * @param {number} animationIndex
 * @return {Promise<THREE.AnimationClip>}
 */
GLTFParser.prototype.loadAnimation = function (animationIndex) {
  const { json } = this;

  const animationDef = json.animations[animationIndex];

  const pendingNodes = [];
  const pendingInputAccessors = [];
  const pendingOutputAccessors = [];
  const pendingSamplers = [];
  const pendingTargets = [];

  for (let i = 0, il = animationDef.channels.length; i < il; i++) {
    const channel = animationDef.channels[i];
    const sampler = animationDef.samplers[channel.sampler];
    const { target } = channel;
    const name = target.node !== undefined ? target.node : target.id; // NOTE: target.id is deprecated.
    const input = animationDef.parameters !== undefined ? animationDef.parameters[sampler.input] : sampler.input;
    const output = animationDef.parameters !== undefined ? animationDef.parameters[sampler.output] : sampler.output;

    pendingNodes.push(this.getDependency('node', name));
    pendingInputAccessors.push(this.getDependency('accessor', input));
    pendingOutputAccessors.push(this.getDependency('accessor', output));
    pendingSamplers.push(sampler);
    pendingTargets.push(target);
  }

  return Promise.all([

    Promise.all(pendingNodes),
    Promise.all(pendingInputAccessors),
    Promise.all(pendingOutputAccessors),
    Promise.all(pendingSamplers),
    Promise.all(pendingTargets)

  ]).then(function (dependencies) {
    const nodes = dependencies[0];
    const inputAccessors = dependencies[1];
    const outputAccessors = dependencies[2];
    const samplers = dependencies[3];
    const targets = dependencies[4];

    const tracks = [];

    for (let i = 0, il = nodes.length; i < il; i++) {
      const node = nodes[i];
      const inputAccessor = inputAccessors[i];
      const outputAccessor = outputAccessors[i];
      const sampler = samplers[i];
      const target = targets[i];

      if (node === undefined) {
        continue;
      }

      node.updateMatrix();
      node.matrixAutoUpdate = true;

      var TypedKeyframeTrack;

      switch (PATH_PROPERTIES[target.path]) {
        case PATH_PROPERTIES.weights:

          TypedKeyframeTrack = THREE.NumberKeyframeTrack;
          break;

        case PATH_PROPERTIES.rotation:

          TypedKeyframeTrack = THREE.QuaternionKeyframeTrack;
          break;

        case PATH_PROPERTIES.position:
        case PATH_PROPERTIES.scale:
        default:

          TypedKeyframeTrack = THREE.VectorKeyframeTrack;
          break;
      }

      const targetName = node.name ? node.name : node.uuid;

      const interpolation = sampler.interpolation !== undefined ? INTERPOLATION[sampler.interpolation] : THREE.InterpolateLinear;

      var targetNames = [];

      if (PATH_PROPERTIES[target.path] === PATH_PROPERTIES.weights) {
        // Node may be a THREE.Group (glTF mesh with several primitives) or a THREE.Mesh.
        node.traverse(function (object) {
          if (object.isMesh === true && object.morphTargetInfluences) {
            targetNames.push(object.name ? object.name : object.uuid);
          }
        });
      } else {
        targetNames.push(targetName);
      }

      let outputArray = outputAccessor.array;

      if (outputAccessor.normalized) {
        var scale;

        if (outputArray.constructor === Int8Array) {
          scale = 1 / 127;
        } else if (outputArray.constructor === Uint8Array) {
          scale = 1 / 255;
        } else if (outputArray.constructor === Int16Array) {
          scale = 1 / 32767;
        } else if (outputArray.constructor === Uint16Array) {
          scale = 1 / 65535;
        } else {
          throw new Error('THREE.GLTFLoader: Unsupported output accessor component type.');
        }

        const scaled = new Float32Array(outputArray.length);

        for (var j = 0, jl = outputArray.length; j < jl; j++) {
          scaled[j] = outputArray[j] * scale;
        }

        outputArray = scaled;
      }

      for (var j = 0, jl = targetNames.length; j < jl; j++) {
        const track = new TypedKeyframeTrack(
          `${targetNames[j]}.${PATH_PROPERTIES[target.path]}`,
          inputAccessor.array,
          outputArray,
          interpolation
        );

        // Override interpolation with custom factory method.
        if (sampler.interpolation === 'CUBICSPLINE') {
          track.createInterpolant = function InterpolantFactoryMethodGLTFCubicSpline(result) {
            // A CUBICSPLINE keyframe in glTF has three output values for each input value,
            // representing inTangent, splineVertex, and outTangent. As a result, track.getValueSize()
            // must be divided by three to get the interpolant's sampleSize argument.

            return new GLTFCubicSplineInterpolant(this.times, this.values, this.getValueSize() / 3, result);
          };

          // Mark as CUBICSPLINE. `track.getInterpolation()` doesn't support custom interpolants.
          track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline = true;
        }

        tracks.push(track);
      }
    }

    const name = animationDef.name ? animationDef.name : `animation_${animationIndex}`;

    return new THREE.AnimationClip(name, undefined, tracks);
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#nodes-and-hierarchy
 * @param {number} nodeIndex
 * @return {Promise<THREE.Object3D>}
 */
GLTFParser.prototype.loadNode = function (nodeIndex) {
  const { json } = this;
  const { extensions } = this;
  const parser = this;

  const { meshReferences } = json;
  const { meshUses } = json;

  const nodeDef = json.nodes[nodeIndex];

  return (function () {
    const pending = [];

    if (nodeDef.mesh !== undefined) {
      pending.push(parser.getDependency('mesh', nodeDef.mesh).then(function (mesh) {
        let node;

        if (meshReferences[nodeDef.mesh] > 1) {
          const instanceNum = meshUses[nodeDef.mesh]++;

          node = mesh.clone();
          node.name += `_instance_${instanceNum}`;
        } else {
          node = mesh;
        }

        // if weights are provided on the node, override weights on the mesh.
        if (nodeDef.weights !== undefined) {
          node.traverse(function (o) {
            if (!o.isMesh) {
              return;
            }

            for (let i = 0, il = nodeDef.weights.length; i < il; i++) {
              o.morphTargetInfluences[i] = nodeDef.weights[i];
            }
          });
        }

        return node;
      }));
    }

    if (nodeDef.camera !== undefined) {
      pending.push(parser.getDependency('camera', nodeDef.camera));
    }

    if (nodeDef.extensions &&
			nodeDef.extensions[EXTENSIONS.KHR_LIGHTS_PUNCTUAL] &&
			nodeDef.extensions[EXTENSIONS.KHR_LIGHTS_PUNCTUAL].light !== undefined) {
      pending.push(parser.getDependency('light', nodeDef.extensions[EXTENSIONS.KHR_LIGHTS_PUNCTUAL].light));
    }

    return Promise.all(pending);
  }()).then(function (objects) {
    let node;

    // .isBone isn't in glTF spec. See .markDefs
    if (nodeDef.isBone === true) {
      node = new THREE.Bone();
    } else if (objects.length > 1) {
      node = new THREE.Group();
    } else if (objects.length === 1) {
      node = objects[0];
    } else {
      node = new THREE.Object3D();
    }

    if (node !== objects[0]) {
      for (let i = 0, il = objects.length; i < il; i++) {
        node.add(objects[i]);
      }
    }

    if (nodeDef.name) {
      node.userData.name = nodeDef.name;
      node.name = THREE.PropertyBinding.sanitizeNodeName(nodeDef.name);
    }

    assignExtrasToUserData(node, nodeDef);

    if (nodeDef.extensions) {
      addUnknownExtensionsToUserData(extensions, node, nodeDef);
    }

    if (nodeDef.matrix !== undefined) {
      const matrix = new THREE.Matrix4();
      matrix.fromArray(nodeDef.matrix);
      node.applyMatrix4(matrix);
    } else {
      if (nodeDef.translation !== undefined) {
        node.position.fromArray(nodeDef.translation);
      }

      if (nodeDef.rotation !== undefined) {
        node.quaternion.fromArray(nodeDef.rotation);
      }

      if (nodeDef.scale !== undefined) {
        node.scale.fromArray(nodeDef.scale);
      }
    }

    return node;
  });
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#scenes
 * @param {number} sceneIndex
 * @return {Promise<THREE.Group>}
 */
GLTFParser.prototype.loadScene = (function () {
  // scene node hierachy builder

  function buildNodeHierachy(nodeId, parentObject, json, parser) {
    const nodeDef = json.nodes[nodeId];

    return parser.getDependency('node', nodeId).then(function (node) {
      if (nodeDef.skin === undefined) {
        return node;
      }

      // build skeleton here as well

      let skinEntry;

      return parser.getDependency('skin', nodeDef.skin).then(function (skin) {
        skinEntry = skin;

        const pendingJoints = [];

        for (let i = 0, il = skinEntry.joints.length; i < il; i++) {
          pendingJoints.push(parser.getDependency('node', skinEntry.joints[i]));
        }

        return Promise.all(pendingJoints);
      })
        .then(function (jointNodes) {
          node.traverse(function (mesh) {
            if (!mesh.isMesh) {
              return;
            }

            const bones = [];
            const boneInverses = [];

            for (let j = 0, jl = jointNodes.length; j < jl; j++) {
              const jointNode = jointNodes[j];

              if (jointNode) {
                bones.push(jointNode);

                const mat = new THREE.Matrix4();

                if (skinEntry.inverseBindMatrices !== undefined) {
                  mat.fromArray(skinEntry.inverseBindMatrices.array, j * 16);
                }

                boneInverses.push(mat);
              } else {
                console.warn('THREE.GLTFLoader: Joint "%s" could not be found.', skinEntry.joints[j]);
              }
            }

            mesh.bind(new THREE.Skeleton(bones, boneInverses), mesh.matrixWorld);
          });

          return node;
        });
    })
      .then(function (node) {
        // build node hierachy

        parentObject.add(node);

        const pending = [];

        if (nodeDef.children) {
          const { children } = nodeDef;

          for (let i = 0, il = children.length; i < il; i++) {
            const child = children[i];
            pending.push(buildNodeHierachy(child, node, json, parser));
          }
        }

        return Promise.all(pending);
      });
  }

  return function loadScene(sceneIndex) {
    const { json } = this;
    const { extensions } = this;
    const sceneDef = this.json.scenes[sceneIndex];
    const parser = this;

    // Loader returns Group, not Scene.
    // See: https://github.com/mrdoob/three.js/issues/18342#issuecomment-578981172
    const scene = new THREE.Group();
    if (sceneDef.name) {
      scene.name = sceneDef.name;
    }

    assignExtrasToUserData(scene, sceneDef);

    if (sceneDef.extensions) {
      addUnknownExtensionsToUserData(extensions, scene, sceneDef);
    }

    const nodeIds = sceneDef.nodes || [];

    const pending = [];

    for (let i = 0, il = nodeIds.length; i < il; i++) {
      pending.push(buildNodeHierachy(nodeIds[i], scene, json, parser));
    }

    return Promise.all(pending).then(function () {
      return scene;
    });
  };
}());

/** *******************************/
/** ******** INTERPOLATION ********/
/** *******************************/

// Spline Interpolation
// Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#appendix-c-spline-interpolation
function GLTFCubicSplineInterpolant(parameterPositions, sampleValues, sampleSize, resultBuffer) {
  THREE.Interpolant.call(this, parameterPositions, sampleValues, sampleSize, resultBuffer);
}

GLTFCubicSplineInterpolant.prototype = Object.create(THREE.Interpolant.prototype);
GLTFCubicSplineInterpolant.prototype.constructor = GLTFCubicSplineInterpolant;

GLTFCubicSplineInterpolant.prototype.copySampleValue_ = function (index) {
  // Copies a sample value to the result buffer. See description of glTF
  // CUBICSPLINE values layout in interpolate_() function below.

  const result = this.resultBuffer;
  const values = this.sampleValues;
  const { valueSize } = this;
  const offset = index * valueSize * 3 + valueSize;

  for (let i = 0; i !== valueSize; i++) {
    result[i] = values[offset + i];
  }

  return result;
};

GLTFCubicSplineInterpolant.prototype.beforeStart_ = GLTFCubicSplineInterpolant.prototype.copySampleValue_;

GLTFCubicSplineInterpolant.prototype.afterEnd_ = GLTFCubicSplineInterpolant.prototype.copySampleValue_;

GLTFCubicSplineInterpolant.prototype.interpolate_ = function (i1, t0, t, t1) {
  const result = this.resultBuffer;
  const values = this.sampleValues;
  const stride = this.valueSize;

  const stride2 = stride * 2;
  const stride3 = stride * 3;

  const td = t1 - t0;

  const p = (t - t0) / td;
  const pp = p * p;
  const ppp = pp * p;

  const offset1 = i1 * stride3;
  const offset0 = offset1 - stride3;

  const s2 = - 2 * ppp + 3 * pp;
  const s3 = ppp - pp;
  const s0 = 1 - s2;
  const s1 = s3 - pp + p;

  // Layout of keyframe output values for CUBICSPLINE animations:
  //   [ inTangent_1, splineVertex_1, outTangent_1, inTangent_2, splineVertex_2, ... ]
  for (let i = 0; i !== stride; i++) {
    const p0 = values[offset0 + i + stride]; // splineVertex_k
    const m0 = values[offset0 + i + stride2] * td; // outTangent_k * (t_k+1 - t_k)
    const p1 = values[offset1 + i + stride]; // splineVertex_k+1
    const m1 = values[offset1 + i] * td; // inTangent_k+1 * (t_k+1 - t_k)

    result[i] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;
  }

  return result;
};


/* UTILITY FUNCTIONS */

function resolveURL(url, path) {
  // Invalid URL
  if (typeof url !== 'string' || url === '') {
    return '';
  }

  // Host Relative URL
  if (/^https?:\/\//i.test(path) && /^\//.test(url)) {
    path = path.replace(/(^https?:\/\/[^\/]+).*/i, '$1');
  }

  // Absolute URL http://,https://,//
  if (/^(https?:)?\/\//i.test(url)) {
    return url;
  }

  // Data URI
  if (/^data:.*,.*$/i.test(url)) {
    return url;
  }

  // Blob URL
  if (/^blob:.*$/i.test(url)) {
    return url;
  }

  // Relative URL
  return path + url;
}

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#default-material
 */
function createDefaultMaterial(cache) {
  if (cache['DefaultMaterial'] === undefined) {
    cache['DefaultMaterial'] = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      emissive: 0x000000,
      metalness: 1,
      roughness: 1,
      transparent: false,
      depthTest: true,
      side: THREE.FrontSide
    });
  }

  return cache['DefaultMaterial'];
}

function addUnknownExtensionsToUserData(knownExtensions, object, objectDef) {
  // Add unknown glTF extensions to an object's userData.

  for (const name in objectDef.extensions) {
    if (knownExtensions[name] === undefined) {
      object.userData.gltfExtensions = object.userData.gltfExtensions || {};
      object.userData.gltfExtensions[name] = objectDef.extensions[name];
    }
  }
}

/**
 * @param {THREE.Object3D|THREE.Material|THREE.BufferGeometry} object
 * @param {GLTF.definition} gltfDef
 */
function assignExtrasToUserData(object, gltfDef) {
  if (gltfDef.extras !== undefined) {
    if (typeof gltfDef.extras === 'object') {
      Object.assign(object.userData, gltfDef.extras);
    } else {
      console.warn(`THREE.GLTFLoader: Ignoring primitive type .extras, ${gltfDef.extras}`);
    }
  }
}

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#morph-targets
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {Array<GLTF.Target>} targets
 * @param {GLTFParser} parser
 * @return {Promise<THREE.BufferGeometry>}
 */
function addMorphTargets(geometry, targets, parser) {
  let hasMorphPosition = false;
  let hasMorphNormal = false;

  for (var i = 0, il = targets.length; i < il; i++) {
    var target = targets[i];

    if (target.POSITION !== undefined) {
      hasMorphPosition = true;
    }
    if (target.NORMAL !== undefined) {
      hasMorphNormal = true;
    }

    if (hasMorphPosition && hasMorphNormal) {
      break;
    }
  }

  if (!hasMorphPosition && !hasMorphNormal) {
    return Promise.resolve(geometry);
  }

  const pendingPositionAccessors = [];
  const pendingNormalAccessors = [];

  for (var i = 0, il = targets.length; i < il; i++) {
    var target = targets[i];

    if (hasMorphPosition) {
      var pendingAccessor = target.POSITION !== undefined
        ? parser.getDependency('accessor', target.POSITION)
        : geometry.attributes.position;

      pendingPositionAccessors.push(pendingAccessor);
    }

    if (hasMorphNormal) {
      var pendingAccessor = target.NORMAL !== undefined
        ? parser.getDependency('accessor', target.NORMAL)
        : geometry.attributes.normal;

      pendingNormalAccessors.push(pendingAccessor);
    }
  }

  return Promise.all([
    Promise.all(pendingPositionAccessors),
    Promise.all(pendingNormalAccessors)
  ]).then(function (accessors) {
    const morphPositions = accessors[0];
    const morphNormals = accessors[1];

    if (hasMorphPosition) {
      geometry.morphAttributes.position = morphPositions;
    }
    if (hasMorphNormal) {
      geometry.morphAttributes.normal = morphNormals;
    }
    geometry.morphTargetsRelative = true;

    return geometry;
  });
}

/**
 * @param {THREE.Mesh} mesh
 * @param {GLTF.Mesh} meshDef
 */
function updateMorphTargets(mesh, meshDef) {
  mesh.updateMorphTargets();

  if (meshDef.weights !== undefined) {
    for (var i = 0, il = meshDef.weights.length; i < il; i++) {
      mesh.morphTargetInfluences[i] = meshDef.weights[i];
    }
  }

  // .extras has user-defined data, so check that .extras.targetNames is an array.
  if (meshDef.extras && Array.isArray(meshDef.extras.targetNames)) {
    const { targetNames } = meshDef.extras;

    if (mesh.morphTargetInfluences.length === targetNames.length) {
      mesh.morphTargetDictionary = {};

      for (var i = 0, il = targetNames.length; i < il; i++) {
        mesh.morphTargetDictionary[targetNames[i]] = i;
      }
    } else {
      console.warn('THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.');
    }
  }
}

function createPrimitiveKey(primitiveDef) {
  const dracoExtension = primitiveDef.extensions && primitiveDef.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION];
  let geometryKey;

  if (dracoExtension) {
    geometryKey = `draco:${dracoExtension.bufferView
			 }:${dracoExtension.indices
			 }:${createAttributesKey(dracoExtension.attributes)}`;
  } else {
    geometryKey = `${primitiveDef.indices}:${createAttributesKey(primitiveDef.attributes)}:${primitiveDef.mode}`;
  }

  return geometryKey;
}

function createAttributesKey(attributes) {
  let attributesKey = '';

  const keys = Object.keys(attributes).sort();

  for (let i = 0, il = keys.length; i < il; i++) {
    attributesKey += `${keys[i]}:${attributes[keys[i]]};`;
  }

  return attributesKey;
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {GLTF.Primitive} primitiveDef
 * @param {GLTFParser} parser
 */
function computeBounds(geometry, primitiveDef, parser) {
  const { attributes } = primitiveDef;

  const box = new THREE.Box3();

  if (attributes.POSITION !== undefined) {
    var accessor = parser.json.accessors[attributes.POSITION];

    var { min } = accessor;
    var { max } = accessor;

    // glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

    if (min !== undefined && max !== undefined) {
      box.set(
        new THREE.Vector3(min[0], min[1], min[2]),
        new THREE.Vector3(max[0], max[1], max[2]));
    } else {
      console.warn('THREE.GLTFLoader: Missing min/max properties for accessor POSITION.');

      return;
    }
  } else {
    return;
  }

  const { targets } = primitiveDef;

  if (targets !== undefined) {
    const maxDisplacement = new THREE.Vector3();
    const vector = new THREE.Vector3();

    for (let i = 0, il = targets.length; i < il; i++) {
      const target = targets[i];

      if (target.POSITION !== undefined) {
        var accessor = parser.json.accessors[target.POSITION];
        var { min } = accessor;
        var { max } = accessor;

        // glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

        if (min !== undefined && max !== undefined) {
          // we need to get max of absolute components because target weight is [-1,1]
          vector.setX(Math.max(Math.abs(min[0]), Math.abs(max[0])));
          vector.setY(Math.max(Math.abs(min[1]), Math.abs(max[1])));
          vector.setZ(Math.max(Math.abs(min[2]), Math.abs(max[2])));

          // Note: this assumes that the sum of all weights is at most 1. This isn't quite correct - it's more conservative
          // to assume that each target can have a max weight of 1. However, for some use cases - notably, when morph targets
          // are used to implement key-frame animations and as such only two are active at a time - this results in very large
          // boxes. So for now we make a box that's sometimes a touch too small but is hopefully mostly of reasonable size.
          maxDisplacement.max(vector);
        } else {
          console.warn('THREE.GLTFLoader: Missing min/max properties for accessor POSITION.');
        }
      }
    }

    // As per comment above this box isn't conservative, but has a reasonable size for a very large number of morph targets.
    box.expandByVector(maxDisplacement);
  }

  geometry.boundingBox = box;

  const sphere = new THREE.Sphere();

  box.getCenter(sphere.center);
  sphere.radius = box.min.distanceTo(box.max) / 2;

  geometry.boundingSphere = sphere;
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {GLTF.Primitive} primitiveDef
 * @param {GLTFParser} parser
 * @return {Promise<THREE.BufferGeometry>}
 */
function addPrimitiveAttributes(geometry, primitiveDef, parser) {
  const { attributes } = primitiveDef;

  const pending = [];

  function assignAttributeAccessor(accessorIndex, attributeName) {
    return parser.getDependency('accessor', accessorIndex)
      .then(function (accessor) {
        geometry.setAttribute(attributeName, accessor);
      });
  }

  for (const gltfAttributeName in attributes) {
    const threeAttributeName = ATTRIBUTES[gltfAttributeName] || gltfAttributeName.toLowerCase();

    // Skip attributes already provided by e.g. Draco extension.
    if (threeAttributeName in geometry.attributes) {
      continue;
    }

    pending.push(assignAttributeAccessor(attributes[gltfAttributeName], threeAttributeName));
  }

  if (primitiveDef.indices !== undefined && !geometry.index) {
    const accessor = parser.getDependency('accessor', primitiveDef.indices).then(function (accessor) {
      geometry.setIndex(accessor);
    });

    pending.push(accessor);
  }

  assignExtrasToUserData(geometry, primitiveDef);

  computeBounds(geometry, primitiveDef, parser);

  return Promise.all(pending).then(function () {
    return primitiveDef.targets !== undefined
      ? addMorphTargets(geometry, primitiveDef.targets, parser)
      : geometry;
  });
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {Number} drawMode
 * @return {THREE.BufferGeometry}
 */
function toTrianglesDrawMode(geometry, drawMode) {
  let index = geometry.getIndex();

  // generate index if not present

  if (index === null) {
    const indices = [];

    const position = geometry.getAttribute('position');

    if (position !== undefined) {
      for (var i = 0; i < position.count; i++) {
        indices.push(i);
      }

      geometry.setIndex(indices);
      index = geometry.getIndex();
    } else {
      console.error('THREE.GLTFLoader.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.');
      return geometry;
    }
  }

  //

  const numberOfTriangles = index.count - 2;
  const newIndices = [];

  if (drawMode === THREE.TriangleFanDrawMode) {
    // gl.TRIANGLE_FAN

    for (var i = 1; i <= numberOfTriangles; i++) {
      newIndices.push(index.getX(0));
      newIndices.push(index.getX(i));
      newIndices.push(index.getX(i + 1));
    }
  } else {
    // gl.TRIANGLE_STRIP

    for (var i = 0; i < numberOfTriangles; i++) {
      if (i % 2 === 0) {
        newIndices.push(index.getX(i));
        newIndices.push(index.getX(i + 1));
        newIndices.push(index.getX(i + 2));
      } else {
        newIndices.push(index.getX(i + 2));
        newIndices.push(index.getX(i + 1));
        newIndices.push(index.getX(i));
      }
    }
  }

  if ((newIndices.length / 3) !== numberOfTriangles) {
    console.error('THREE.GLTFLoader.toTrianglesDrawMode(): Unable to generate correct amount of triangles.');
  }

  // build final geometry

  const newGeometry = geometry.clone();
  newGeometry.setIndex(newIndices);

  return newGeometry;
}
