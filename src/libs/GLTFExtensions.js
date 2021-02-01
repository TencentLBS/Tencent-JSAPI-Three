/** *******************************/
/** ******** EXTENSIONS ***********/
/** *******************************/

import * as THREE from './three.module.js';

export const EXTENSIONS = {
  KHR_BINARY_GLTF: 'KHR_binary_glTF',
  KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
  KHR_LIGHTS_PUNCTUAL: 'KHR_lights_punctual',
  KHR_MATERIALS_CLEARCOAT: 'KHR_materials_clearcoat',
  KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS: 'KHR_materials_pbrSpecularGlossiness',
  KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
  KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
  KHR_MESH_QUANTIZATION: 'KHR_mesh_quantization',
  MSFT_TEXTURE_DDS: 'MSFT_texture_dds'
};

/**
 * DDS Texture Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/MSFT_texture_dds
 *
 */
export function GLTFTextureDDSExtension(ddsLoader) {
  if (!ddsLoader) {
    throw new Error('THREE.GLTFLoader: Attempting to load .dds texture without importing THREE.DDSLoader');
  }

  this.name = EXTENSIONS.MSFT_TEXTURE_DDS;
  this.ddsLoader = ddsLoader;
}

/**
 * Punctual Lights Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_lights_punctual
 */
export function GLTFLightsExtension(json) {
  this.name = EXTENSIONS.KHR_LIGHTS_PUNCTUAL;

  const extension = (json.extensions && json.extensions[EXTENSIONS.KHR_LIGHTS_PUNCTUAL]) || {};
  this.lightDefs = extension.lights || [];
}

GLTFLightsExtension.prototype.loadLight = function (lightIndex) {
  const lightDef = this.lightDefs[lightIndex];
  let lightNode;

  const color = new THREE.Color(0xffffff);
  if (lightDef.color !== undefined) {
    color.fromArray(lightDef.color);
  }

  const range = lightDef.range !== undefined ? lightDef.range : 0;

  switch (lightDef.type) {
    case 'directional':
      lightNode = new THREE.DirectionalLight(color);
      lightNode.target.position.set(0, 0, - 1);
      lightNode.add(lightNode.target);
      break;

    case 'point':
      lightNode = new THREE.PointLight(color);
      lightNode.distance = range;
      break;

    case 'spot':
      lightNode = new THREE.SpotLight(color);
      lightNode.distance = range;
      // Handle spotlight properties.
      lightDef.spot = lightDef.spot || {};
      lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== undefined ? lightDef.spot.innerConeAngle : 0;
      lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== undefined ? lightDef.spot.outerConeAngle : Math.PI / 4.0;
      lightNode.angle = lightDef.spot.outerConeAngle;
      lightNode.penumbra = 1.0 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
      lightNode.target.position.set(0, 0, - 1);
      lightNode.add(lightNode.target);
      break;

    default:
      throw new Error(`THREE.GLTFLoader: Unexpected light type, "${lightDef.type}".`);
  }

  // Some lights (e.g. spot) default to a position other than the origin. Reset the position
  // here, because node-level parsing will only override position if explicitly specified.
  lightNode.position.set(0, 0, 0);

  lightNode.decay = 2;

  if (lightDef.intensity !== undefined) {
    lightNode.intensity = lightDef.intensity;
  }

  lightNode.name = lightDef.name || (`light_${lightIndex}`);

  return Promise.resolve(lightNode);
};

/**
 * Unlit Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_unlit
 */
export function GLTFMaterialsUnlitExtension() {
  this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;
}

GLTFMaterialsUnlitExtension.prototype.getMaterialType = function () {
  return THREE.MeshBasicMaterial;
};

GLTFMaterialsUnlitExtension.prototype.extendParams = function (materialParams, materialDef, parser) {
  const pending = [];

  materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
  materialParams.opacity = 1.0;

  const metallicRoughness = materialDef.pbrMetallicRoughness;

  if (metallicRoughness) {
    if (Array.isArray(metallicRoughness.baseColorFactor)) {
      const array = metallicRoughness.baseColorFactor;

      materialParams.color.fromArray(array);
      materialParams.opacity = array[3];
    }

    if (metallicRoughness.baseColorTexture !== undefined) {
      pending.push(parser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture));
    }
  }

  return Promise.all(pending);
};

/**
 * Clearcoat Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_clearcoat
 */
export function GLTFMaterialsClearcoatExtension() {
  this.name = EXTENSIONS.KHR_MATERIALS_CLEARCOAT;
}

GLTFMaterialsClearcoatExtension.prototype.getMaterialType = function () {
  return THREE.MeshPhysicalMaterial;
};

GLTFMaterialsClearcoatExtension.prototype.extendParams = function (materialParams, materialDef, parser) {
  const pending = [];

  const extension = materialDef.extensions[this.name];

  if (extension.clearcoatFactor !== undefined) {
    materialParams.clearcoat = extension.clearcoatFactor;
  }

  if (extension.clearcoatTexture !== undefined) {
    pending.push(parser.assignTexture(materialParams, 'clearcoatMap', extension.clearcoatTexture));
  }

  if (extension.clearcoatRoughnessFactor !== undefined) {
    materialParams.clearcoatRoughness = extension.clearcoatRoughnessFactor;
  }

  if (extension.clearcoatRoughnessTexture !== undefined) {
    pending.push(parser.assignTexture(materialParams, 'clearcoatRoughnessMap', extension.clearcoatRoughnessTexture));
  }

  if (extension.clearcoatNormalTexture !== undefined) {
    pending.push(parser.assignTexture(materialParams, 'clearcoatNormalMap', extension.clearcoatNormalTexture));

    if (extension.clearcoatNormalTexture.scale !== undefined) {
      const { scale } = extension.clearcoatNormalTexture;

      materialParams.clearcoatNormalScale = new THREE.Vector2(scale, scale);
    }
  }

  return Promise.all(pending);
};

/**
 * DRACO Mesh Compression Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_draco_mesh_compression
 */
export function GLTFDracoMeshCompressionExtension(json, dracoLoader) {
  if (!dracoLoader) {
    throw new Error('THREE.GLTFLoader: No DRACOLoader instance provided.');
  }

  this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
  this.json = json;
  this.dracoLoader = dracoLoader;
  this.dracoLoader.preload();
}

GLTFDracoMeshCompressionExtension.prototype.decodePrimitive = function (primitive, parser) {
  const { json } = this;
  const { dracoLoader } = this;
  const bufferViewIndex = primitive.extensions[this.name].bufferView;
  const gltfAttributeMap = primitive.extensions[this.name].attributes;
  const threeAttributeMap = {};
  const attributeNormalizedMap = {};
  const attributeTypeMap = {};

  for (var attributeName in gltfAttributeMap) {
    var threeAttributeName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();

    threeAttributeMap[threeAttributeName] = gltfAttributeMap[attributeName];
  }

  for (attributeName in primitive.attributes) {
    var threeAttributeName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();

    if (gltfAttributeMap[attributeName] !== undefined) {
      const accessorDef = json.accessors[primitive.attributes[attributeName]];
      const componentType = WEBGL_COMPONENT_TYPES[accessorDef.componentType];

      attributeTypeMap[threeAttributeName] = componentType;
      attributeNormalizedMap[threeAttributeName] = accessorDef.normalized === true;
    }
  }

  return parser.getDependency('bufferView', bufferViewIndex).then(function (bufferView) {
    return new Promise(function (resolve) {
      dracoLoader.decodeDracoFile(bufferView, function (geometry) {
        for (const attributeName in geometry.attributes) {
          const attribute = geometry.attributes[attributeName];
          const normalized = attributeNormalizedMap[attributeName];

          if (normalized !== undefined) {
            attribute.normalized = normalized;
          }
        }

        resolve(geometry);
      }, threeAttributeMap, attributeTypeMap);
    });
  });
};

/**
 * Texture Transform Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_texture_transform
 */
export function GLTFTextureTransformExtension() {
  this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;
}

GLTFTextureTransformExtension.prototype.extendTexture = function (texture, transform) {
  texture = texture.clone();

  if (transform.offset !== undefined) {
    texture.offset.fromArray(transform.offset);
  }

  if (transform.rotation !== undefined) {
    texture.rotation = transform.rotation;
  }

  if (transform.scale !== undefined) {
    texture.repeat.fromArray(transform.scale);
  }

  if (transform.texCoord !== undefined) {
    console.warn(`THREE.GLTFLoader: Custom UV sets in "${this.name}" extension not yet supported.`);
  }

  texture.needsUpdate = true;

  return texture;
};

/**
 * Specular-Glossiness Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_pbrSpecularGlossiness
 */

/**
 * A sub class of THREE.StandardMaterial with some of the functionality
 * changed via the `onBeforeCompile` callback
 * @pailhead
 */

export function GLTFMeshStandardSGMaterial(params) {
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

GLTFMeshStandardSGMaterial.prototype = Object.create(THREE.MeshStandardMaterial.prototype);
GLTFMeshStandardSGMaterial.prototype.constructor = GLTFMeshStandardSGMaterial;

GLTFMeshStandardSGMaterial.prototype.copy = function (source) {
  THREE.MeshStandardMaterial.prototype.copy.call(this, source);
  this.specularMap = source.specularMap;
  this.specular.copy(source.specular);
  this.glossinessMap = source.glossinessMap;
  this.glossiness = source.glossiness;
  delete this.metalness;
  delete this.roughness;
  delete this.metalnessMap;
  delete this.roughnessMap;
  return this;
};

export function GLTFMaterialsPbrSpecularGlossinessExtension() {
  return {

    name: EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS,

    specularGlossinessParams: [
      'color',
      'map',
      'lightMap',
      'lightMapIntensity',
      'aoMap',
      'aoMapIntensity',
      'emissive',
      'emissiveIntensity',
      'emissiveMap',
      'bumpMap',
      'bumpScale',
      'normalMap',
      'normalMapType',
      'displacementMap',
      'displacementScale',
      'displacementBias',
      'specularMap',
      'specular',
      'glossinessMap',
      'glossiness',
      'alphaMap',
      'envMap',
      'envMapIntensity',
      'refractionRatio',
    ],

    getMaterialType: function () {
      return GLTFMeshStandardSGMaterial;
    },

    extendParams: function (materialParams, materialDef, parser) {
      const pbrSpecularGlossiness = materialDef.extensions[this.name];

      materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
      materialParams.opacity = 1.0;

      const pending = [];

      if (Array.isArray(pbrSpecularGlossiness.diffuseFactor)) {
        const array = pbrSpecularGlossiness.diffuseFactor;

        materialParams.color.fromArray(array);
        materialParams.opacity = array[3];
      }

      if (pbrSpecularGlossiness.diffuseTexture !== undefined) {
        pending.push(parser.assignTexture(materialParams, 'map', pbrSpecularGlossiness.diffuseTexture));
      }

      materialParams.emissive = new THREE.Color(0.0, 0.0, 0.0);
      materialParams.glossiness = pbrSpecularGlossiness.glossinessFactor !== undefined ? pbrSpecularGlossiness.glossinessFactor : 1.0;
      materialParams.specular = new THREE.Color(1.0, 1.0, 1.0);

      if (Array.isArray(pbrSpecularGlossiness.specularFactor)) {
        materialParams.specular.fromArray(pbrSpecularGlossiness.specularFactor);
      }

      if (pbrSpecularGlossiness.specularGlossinessTexture !== undefined) {
        const specGlossMapDef = pbrSpecularGlossiness.specularGlossinessTexture;
        pending.push(parser.assignTexture(materialParams, 'glossinessMap', specGlossMapDef));
        pending.push(parser.assignTexture(materialParams, 'specularMap', specGlossMapDef));
      }

      return Promise.all(pending);
    },

    createMaterial: function (materialParams) {
      const material = new GLTFMeshStandardSGMaterial(materialParams);
      material.fog = true;

      material.color = materialParams.color;

      material.map = materialParams.map === undefined ? null : materialParams.map;

      material.lightMap = null;
      material.lightMapIntensity = 1.0;

      material.aoMap = materialParams.aoMap === undefined ? null : materialParams.aoMap;
      material.aoMapIntensity = 1.0;

      material.emissive = materialParams.emissive;
      material.emissiveIntensity = 1.0;
      material.emissiveMap = materialParams.emissiveMap === undefined ? null : materialParams.emissiveMap;

      material.bumpMap = materialParams.bumpMap === undefined ? null : materialParams.bumpMap;
      material.bumpScale = 1;

      material.normalMap = materialParams.normalMap === undefined ? null : materialParams.normalMap;
      material.normalMapType = THREE.TangentSpaceNormalMap;

      if (materialParams.normalScale) {
        material.normalScale = materialParams.normalScale;
      }

      material.displacementMap = null;
      material.displacementScale = 1;
      material.displacementBias = 0;

      material.specularMap = materialParams.specularMap === undefined ? null : materialParams.specularMap;
      material.specular = materialParams.specular;

      material.glossinessMap = materialParams.glossinessMap === undefined ? null : materialParams.glossinessMap;
      material.glossiness = materialParams.glossiness;

      material.alphaMap = null;

      material.envMap = materialParams.envMap === undefined ? null : materialParams.envMap;
      material.envMapIntensity = 1.0;

      material.refractionRatio = 0.98;

      return material;
    },

  };
}

/**
 * Mesh Quantization Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization
 */
export function GLTFMeshQuantizationExtension() {
  this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;
}
