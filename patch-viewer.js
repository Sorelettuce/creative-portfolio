(() => {
  const canvas = document.getElementById('patch-canvas');
  const fallback = document.getElementById('patch-fallback');
  const controls = document.getElementById('patch-controls');
  const zoom = document.getElementById('patch-zoom');
  const zoomValue = document.getElementById('patch-zoom-value');
  const reset = document.getElementById('patch-reset');
  if (!canvas || !fallback || !controls || !zoom || !zoomValue || !reset || !canvas.dataset.texture) return;

  const buttons = [...controls.querySelectorAll('[data-patch-view]')];
  const radians = Math.PI / 180;
  const presets = { overview: [-18, 13], front: [0, 0], edge: [-82, 8], back: [180, 0] };
  const pitchLimit = 89 * radians;
  const defaultZoom = Number(zoom.value);
  const pointers = new Map();
  let yaw = presets.overview[0] * radians;
  let pitch = presets.overview[1] * radians;
  let pan = [0, 0];
  let currentPreset = 'overview';
  let draw;
  let queued = 0;
  const photo = new Image();

  function repaint() {
    if (queued || !draw) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      draw?.(yaw, pitch, Number(zoom.value) / 100, pan);
    });
  }

  function selectPreset(name) {
    currentPreset = name;
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.patchView === name));
    }
  }

  function setView(name) {
    const angles = presets[name];
    if (!angles) return;
    [yaw, pitch] = angles.map((angle) => angle * radians);
    pan = [0, 0];
    selectPreset(name);
    repaint();
  }

  function setZoom(value) {
    zoom.value = String(Math.round(Math.max(Number(zoom.min), Math.min(Number(zoom.max), value))));
    zoomValue.textContent = `${zoom.value}%`;
    if (Number(zoom.value) <= 125) pan = [0, 0];
    else if (canvas.clientWidth && canvas.clientHeight) movePan(0, 0);
    repaint();
  }

  function movePan(dx, dy) {
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const radius = Number(zoom.value) * 0.0075;
    const horizontal = Math.max(0.15, radius / Math.max(1, aspect) - 0.46);
    const vertical = Math.max(0.15, radius * Math.min(1, aspect) - 0.46);
    pan[0] = Math.max(-horizontal, Math.min(horizontal, pan[0] + 2 * dx / canvas.clientWidth));
    pan[1] = Math.max(-vertical, Math.min(vertical, pan[1] - 2 * dy / canvas.clientHeight));
    repaint();
  }

  function rotate(dx, dy) {
    yaw = (yaw + dx) % (2 * Math.PI);
    pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch + dy));
    if (currentPreset) selectPreset(null);
    repaint();
  }

  function showFallback() {
    draw = undefined;
    canvas.hidden = true;
    controls.hidden = true;
    fallback.hidden = false;
  }

  function startRenderer() {
    try {
      draw = createRenderer(canvas, photo);
    } catch (error) {
      console.warn('Patch viewer switched to the photo fallback.', error);
    }
    if (!draw) {
      showFallback();
      return;
    }
    canvas.hidden = false;
    fallback.hidden = true;
    controls.hidden = false;
    repaint();
  }

  for (const button of buttons) {
    button.addEventListener('click', () => setView(button.dataset.patchView));
  }
  zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
  reset.addEventListener('click', () => {
    setView('overview');
    setZoom(defaultZoom);
  });
  setZoom(defaultZoom);
  selectPreset(currentPreset);
  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (event) => {
    if (!draw || event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!draw || !previous) return;
    const x = event.clientX;
    const y = event.clientY;
    const dx = x - previous[0];
    const dy = y - previous[1];
    pointers.set(event.pointerId, [x, y]);
    if (pointers.size > 1) {
      const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)[1];
      const oldDistance = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
      const newDistance = Math.hypot(x - other[0], y - other[1]);
      if (oldDistance > 0) setZoom(Number(zoom.value) * newDistance / oldDistance);
      if (Number(zoom.value) > 125) movePan(dx / 2, dy / 2);
      return;
    }
    if (event.shiftKey && Number(zoom.value) > 125) {
      movePan(dx, dy);
      return;
    }
    rotate(dx * 0.011, dy * 0.011);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(eventName, (event) => {
      pointers.delete(event.pointerId);
      if (!pointers.size) canvas.classList.remove('is-dragging');
    });
  }
  canvas.addEventListener('wheel', (event) => {
    if (!draw || document.activeElement !== canvas || event.ctrlKey) return;
    event.preventDefault();
    setZoom(Number(zoom.value) + (event.deltaY < 0 ? 10 : -10));
  }, { passive: false });
  canvas.addEventListener('keydown', (event) => {
    if (!draw || event.ctrlKey || event.altKey || event.metaKey) return;
    const rotations = { ArrowLeft: [-9, 0], ArrowRight: [9, 0], ArrowUp: [0, -9], ArrowDown: [0, 9] };
    if (rotations[event.key]) {
      event.preventDefault();
      if (event.shiftKey && Number(zoom.value) > 125) movePan(...rotations[event.key].map((angle) => angle * 2.5));
      else rotate(...rotations[event.key].map((angle) => angle * radians));
    } else if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      setZoom(Number(zoom.value) + (event.key === '+' || event.key === '=' ? 10 : -10));
    }
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFallback();
  });
  canvas.addEventListener('webglcontextrestored', startRenderer);
  if ('ResizeObserver' in window) {
    new ResizeObserver(repaint).observe(canvas);
  } else {
    addEventListener('resize', repaint);
  }
  photo.onload = startRenderer;
  photo.onerror = showFallback;
  photo.src = canvas.dataset.texture;

  function createRenderer(surface, image) {
    const gl = surface.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) return undefined;

    const vertexSource = `
      attribute vec3 point, normal;
      attribute vec2 uv;
      uniform vec2 rotation, scale, pan;
      uniform mediump float material;
      varying vec2 tex;
      varying vec3 lightingNormal;
      void main() {
        tex = uv;
        if (material > 2.5) {
          gl_Position = vec4(point, 1.0);
          lightingNormal = normal;
          return;
        }
        float cy = cos(rotation.x), sy = sin(rotation.x);
        float cx = cos(rotation.y), sx = sin(rotation.y);
        mat3 turn = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
        mat3 tilt = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
        vec3 position = tilt * turn * point;
        float depth = 3.65 - position.z;
        gl_Position = vec4(position.xy * scale + pan * depth, -0.75 * position.z, depth);
        lightingNormal = tilt * turn * normal;
      }
    `;
    const fragmentSource = `
      precision mediump float;
      uniform sampler2D photograph;
      uniform float material;
      varying vec2 tex;
      varying vec3 lightingNormal;
      void main() {
        if (material > 2.5) {
          float light = 1.0 - smoothstep(0.08, 0.77, length((tex - vec2(0.48, 0.51)) * vec2(1.08, 0.94)));
          vec3 stage = mix(vec3(0.068, 0.097, 0.077), vec3(0.193, 0.244, 0.203), light);
          gl_FragColor = vec4(stage, 1.0);
          return;
        }
        vec3 n = normalize(lightingNormal);
        vec3 lamp = normalize(vec3(-0.43, 0.64, 0.86));
        float diffuse = max(dot(n, lamp), 0.0);
        float highlight = pow(max(dot(n, normalize(lamp + vec3(0.22, 0.0, 1.0))), 0.0), 12.0);
        vec3 color;
        if (material < 0.5) {
          color = texture2D(photograph, tex).rgb * (0.91 + 0.17 * diffuse);
        } else if (material < 1.5) {
          float ribs = 0.5 + 0.5 * sin((tex.x * 168.0 + tex.y * 1.7) * 6.28318);
          float strand = 0.45 + 0.55 * pow(ribs, 1.9);
          color = vec3(0.080, 0.084, 0.074) * (0.55 + 1.1 * diffuse) + strand * (0.025 + 0.096 * highlight);
        } else {
          float warp = sin(tex.x * 665.0) * sin(tex.y * 630.0);
          float weave = sin((tex.x + tex.y) * 370.0) * sin((tex.x - tex.y) * 355.0);
          color = vec3(0.13, 0.136, 0.121) * (0.55 + 0.5 * diffuse) * (1.0 + 0.17 * warp + 0.11 * weave);
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }

    const program = gl.createProgram();
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);

    const uniforms = Object.fromEntries(['rotation', 'scale', 'pan', 'material', 'photograph'].map((name) => [name, gl.getUniformLocation(program, name)]));
    const position = gl.getAttribLocation(program, 'point');
    const normal = gl.getAttribLocation(program, 'normal');
    const uv = gl.getAttribLocation(program, 'uv');
    for (const attribute of [position, normal, uv]) gl.enableVertexAttribArray(attribute);

    const texture = gl.createTexture();
    const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let source = image;
    if (image.naturalWidth > maximum || image.naturalHeight > maximum) {
      const scale = maximum / Math.max(image.naturalWidth, image.naturalHeight);
      const resized = document.createElement('canvas');
      resized.width = Math.floor(image.naturalWidth * scale);
      resized.height = Math.floor(image.naturalHeight * scale);
      resized.getContext('2d').drawImage(image, 0, 0, resized.width, resized.height);
      source = resized;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const powerOfTwo = (value) => (value & (value - 1)) === 0;
    const sourceWidth = source.naturalWidth ?? source.width;
    const sourceHeight = source.naturalHeight ?? source.height;
    const mipmap = powerOfTwo(sourceWidth) && powerOfTwo(sourceHeight);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (mipmap && anisotropy) {
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }
    gl.uniform1i(uniforms.photograph, 0);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('The patch photo could not be uploaded to WebGL.');

    function buffer(vertices) {
      const object = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, object);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      return { object, count: vertices.length / 8 };
    }

    const background = buffer([[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]
      .flatMap(([x, y]) => [x, y, .99, 0, 0, 1, (x + 1) / 2, (y + 1) / 2]));
    const face = buffer(ringMesh([[0, .025, 0, 1], [.84, .025, 0, 1], [.92, .029, -.11, .99], [.961, .042, -.09, .996], [.981, .041, .29, .96], [1, .025, .68, .73]], false));
    const binding = buffer(ringMesh([[1, .025, .68, .73], [1.004, .009, 1, 0], [1.002, -.016, .98, -.17], [.991, -.034, .7, -.71], [.978, -.039, .38, -.92]], true));
    const reverse = buffer(ringMesh([[0, -.043, 0, -1], [.91, -.043, 0, -1], [.978, -.039, .38, -.92]], false));

    function paint(mesh, material) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.object);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 32, 24);
      gl.uniform1f(uniforms.material, material);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    return (horizontal, vertical, magnification, offset) => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.round(surface.clientWidth * ratio);
      const height = Math.round(surface.clientHeight * ratio);
      if (!width || !height) return;
      if (width !== surface.width || height !== surface.height) {
        surface.width = width;
        surface.height = height;
      }
      const aspect = width / height;
      const fit = 2.72 * magnification;
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(uniforms.rotation, horizontal, vertical);
      gl.uniform2f(uniforms.scale, fit / Math.max(1, aspect), fit * Math.min(1, aspect));
      gl.uniform2fv(uniforms.pan, offset);
      gl.disable(gl.DEPTH_TEST);
      paint(background, 3);
      gl.enable(gl.DEPTH_TEST);
      paint(reverse, 2);
      paint(binding, 1);
      paint(face, 0);
    };
  }

  function ringMesh(profile, side) {
    const mesh = [];
    const segments = 128;
    function vertex(layer, segment) {
      const [radius, z, outward, face] = profile[layer];
      const angle = segment * 2 * Math.PI / segments;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      return [x, y, z, outward * Math.cos(angle), outward * Math.sin(angle), face,
        side ? segment / segments : .5 + x * .499, side ? layer / (profile.length - 1) : .5 - y * .499];
    }
    for (let ring = 0; ring < profile.length - 1; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = vertex(ring, segment);
        const b = vertex(ring + 1, segment);
        const c = vertex(ring + 1, segment + 1);
        const d = vertex(ring, segment + 1);
        mesh.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    return mesh;
  }
})();
