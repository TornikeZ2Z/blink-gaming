/* A small loader for the GLB files our Blender kit exports: node tree, meshes and PBR materials (with clearcoat, sheen,
   specular and emissive strength). It skips textures: the Brainer's screens are painted live by the page.
   loadGLB(url, THREE) resolves to { scene, nodes, materials }, both maps keyed by name. */
export async function loadGLB(url, THREE) {
  const buf = await (await fetch(url)).arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB: ' + url);
  const jsonLen = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const ARR = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const accessor = i => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = ARR[a.componentType], n = SIZE[a.type];
    const off = binStart + (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || 0;
    if (stride && stride !== n * T.BYTES_PER_ELEMENT) throw new Error('interleaved buffers are not supported');   // Blender never writes them
    return new THREE.BufferAttribute(new T(buf.slice(off, off + a.count * n * T.BYTES_PER_ELEMENT)), n, !!a.normalized);
  };
  const materials = {};
  const mats = (json.materials || []).map(m => {
    const pbr = m.pbrMetallicRoughness || {}, ext = m.extensions || {}, c = pbr.baseColorFactor || [1, 1, 1, 1];
    const mat = new THREE.MeshPhysicalMaterial({
      name: m.name, color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace),
      metalness: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
      side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide, transparent: m.alphaMode === 'BLEND', opacity: c[3]
    });
    if (m.emissiveFactor) mat.emissive.setRGB(...m.emissiveFactor, THREE.LinearSRGBColorSpace);
    if (ext.KHR_materials_emissive_strength) mat.emissiveIntensity = ext.KHR_materials_emissive_strength.emissiveStrength;
    if (ext.KHR_materials_clearcoat) { mat.clearcoat = ext.KHR_materials_clearcoat.clearcoatFactor ?? 0; mat.clearcoatRoughness = ext.KHR_materials_clearcoat.clearcoatRoughnessFactor ?? 0; }
    if (ext.KHR_materials_sheen) { const s = ext.KHR_materials_sheen; mat.sheen = 1; mat.sheenColor.setRGB(...(s.sheenColorFactor || [0, 0, 0]), THREE.LinearSRGBColorSpace); mat.sheenRoughness = s.sheenRoughnessFactor ?? 0; }
    if (ext.KHR_materials_specular) { const s = ext.KHR_materials_specular; mat.specularIntensity = s.specularFactor ?? 1; if (s.specularColorFactor) mat.specularColor.setRGB(...s.specularColorFactor, THREE.LinearSRGBColorSpace); }
    materials[m.name] = mat; return mat;
  });
  const meshes = (json.meshes || []).map(me => me.primitives.map(p => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', accessor(p.attributes.POSITION));
    if (p.attributes.NORMAL != null) g.setAttribute('normal', accessor(p.attributes.NORMAL)); else g.computeVertexNormals();
    if (p.attributes.TEXCOORD_0 != null) g.setAttribute('uv', accessor(p.attributes.TEXCOORD_0));
    if (p.indices != null) g.setIndex(accessor(p.indices));
    return new THREE.Mesh(g, p.material != null ? mats[p.material] : new THREE.MeshStandardMaterial());
  }));
  const nodes = {};
  const build = i => {
    const n = json.nodes[i], prims = n.mesh != null ? meshes[n.mesh] : null;
    const o = prims && prims.length === 1 ? prims[0] : new THREE.Group();
    if (prims && prims.length > 1) prims.forEach(m => o.add(m));
    o.name = n.name || '';
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    (n.children || []).forEach(c => o.add(build(c)));
    if (o.name) nodes[o.name] = o;
    return o;
  };
  const scene = new THREE.Group();
  json.scenes[json.scene || 0].nodes.forEach(i => scene.add(build(i)));
  return { scene, nodes, materials };
}
