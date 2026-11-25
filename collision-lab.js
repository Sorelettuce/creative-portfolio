(() => {
  const canvas = document.getElementById('collision-canvas');
  const fallback = document.getElementById('collision-fallback');
  const controls = document.getElementById('collision-controls');
  const discreteButton = document.getElementById('collision-discrete');
  const sweptButton = document.getElementById('collision-swept');
  const resetButton = document.getElementById('collision-reset');
  const result = document.getElementById('collision-result');
  if (!canvas || !fallback || !controls || !discreteButton || !sweptButton || !resetButton || !result) return;

  const step = 1 / 8;
  const startX = -3.6;
  const speed = 56;
  const radius = 0.26;
  const wallHalf = 0.10;
  const restitution = 0.65;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const playbackMs = 1150;
  const readyText = 'Ready. Both tests start at −3.60 m and use the same 125 ms physics step.';
  let draw;
  let frame = 0;
  let scene = { x: startX, state: 'ready' };

  function solve(swept) {
    const freeEnd = startX + speed * step;
    // The barrier faces are expanded by the radius so we can test the center.
    const contactX = -(wallHalf + radius);
    const endpointOverlaps = Math.abs(freeEnd) <= -contactX;
    const sweptContact = (contactX - startX) / speed;
    const impact = swept ? (sweptContact >= 0 && sweptContact <= step ? sweptContact : null)
      : (endpointOverlaps ? step : null);
    const xAt = (time) => impact !== null && time >= impact
      ? contactX - speed * restitution * (time - impact)
      : startX + speed * time;
    return { impact, xAt, finalX: xAt(step) };
  }

  function present(next) {
    scene = next;
    draw?.(scene);
  }

  function replay(swept) {
    cancelAnimationFrame(frame);
    const outcome = solve(swept);
    const method = swept ? 'Swept test' : 'Endpoint test';
    const endPosition = `${outcome.finalX.toFixed(2).replace('-', '−')} m`;
    const finish = () => {
      const hit = outcome.impact !== null;
      present({ x: outcome.finalX, state: hit ? 'hit' : 'miss' });
      result.textContent = hit
        ? `${method}. Expected: rebound. Observed: contact at ${(outcome.impact * 1000).toFixed(1)} ms, rebound, final center ${endPosition}.`
        : `${method}. Expected: rebound. Observed: neither endpoint overlapped the wall. The ball tunneled through and ended at ${endPosition}.`;
    };
    if (!draw || reducedMotion.matches) {
      finish();
      return;
    }

    result.textContent = `${method}. Replaying one 125 ms physics step in slow motion.`;
    let started;
    const animate = (now) => {
      started ??= now;
      const progress = Math.min((now - started) / playbackMs, 1);
      if (progress === 1) {
        finish();
        return;
      }
      // Playback samples the solved trajectory. Display frames never advance the solver.
      const time = progress * step;
      const state = outcome.impact !== null && time >= outcome.impact ? 'hit' : 'running';
      present({ x: outcome.xAt(time), state });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
  }

  function reset() {
    cancelAnimationFrame(frame);
    present({ x: startX, state: 'ready' });
    result.textContent = readyText;
  }

  function setupRenderer() {
    try {
      draw = createRenderer(canvas);
    } catch (error) {
      draw = undefined;
      console.warn('Collision Lab 3D rendering is unavailable.', error);
    }
    fallback.hidden = Boolean(draw);
    canvas.hidden = !draw;
    draw?.(scene);
  }

  discreteButton.addEventListener('click', () => replay(false));
  sweptButton.addEventListener('click', () => replay(true));
  resetButton.addEventListener('click', reset);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    draw = undefined;
    fallback.hidden = false;
    canvas.hidden = true;
  });
  canvas.addEventListener('webglcontextrestored', setupRenderer);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => draw?.(scene)).observe(canvas);
  } else {
    addEventListener('resize', () => draw?.(scene));
  }
  controls.hidden = false;
  result.textContent = readyText;
  setupRenderer();

  function createRenderer(surface) {
    const gl = surface.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) return undefined;
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec3 position;
      attribute vec3 normal;
      uniform vec3 offset, scale, cameraRight, cameraUp, cameraBack;
      uniform vec2 bounds;
      varying vec3 surfaceNormal;
      varying vec3 world;
      void main() {
        world = position * scale + offset;
        surfaceNormal = normal / scale;
        vec3 relative = world - vec3(0.0, 0.55, 0.0);
        gl_Position = vec4(dot(relative, cameraRight) / bounds.x,
                           dot(relative, cameraUp) / bounds.y,
                           -dot(relative, cameraBack) / 14.0, 1.0);
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec3 color;
      uniform float lit;
      varying vec3 surfaceNormal;
      varying vec3 world;
      void main() {
        vec3 light = normalize(vec3(-0.45, 0.9, 0.75));
        vec3 normal = normalize(surfaceNormal);
        float diff = max(dot(normal, light), 0.0);
        vec3 halfDir = normalize(light + vec3(0.33, 0.36, 0.87));
        float spec = pow(max(dot(normal, halfDir), 0.0), 22.0) * 0.28;
        vec3 shaded = color * (0.46 + 0.60 * diff) + spec;
        vec3 fog = vec3(0.043, 0.064, 0.053);
        float fade = smoothstep(4.5, 8.0, length(vec2(world.x * 0.8, world.z * 1.12)));
        gl_FragColor = vec4(mix(mix(color, shaded, lit), fog, fade * 0.72), 1.0);
      }
    `);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.043, 0.064, 0.053, 1);

    const position = gl.getAttribLocation(program, 'position');
    const normal = gl.getAttribLocation(program, 'normal');
    gl.enableVertexAttribArray(position);
    gl.enableVertexAttribArray(normal);
    const uniforms = Object.fromEntries(
      ['offset', 'scale', 'cameraRight', 'cameraUp', 'cameraBack', 'bounds', 'color', 'lit']
        .map((name) => [name, gl.getUniformLocation(program, name)])
    );
    const back = normalized([0.40, 0.46, 0.81]);
    const right = normalized([back[2], 0, -back[0]]);
    const up = [back[1] * right[2], back[2] * right[0] - back[0] * right[2], -back[1] * right[0]];
    gl.uniform3fv(uniforms.cameraRight, right);
    gl.uniform3fv(uniforms.cameraUp, up);
    gl.uniform3fv(uniforms.cameraBack, back);

    const cube = mesh(boxVertices(), gl.TRIANGLES);
    const ball = mesh(sphereVertices(), gl.TRIANGLES);
    const grid = mesh(gridVertices(), gl.LINES);
    const ring = mesh(ringVertices(), gl.LINES);
    const gold = [0.99, 0.86, 0.40];
    const green = [0.70, 0.96, 0.36];
    const amber = [1, 0.67, 0.32];
    const track = [0.29, 0.40, 0.34];

    function compile(kind, source) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }

    function mesh(vertices, primitive) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      return { buffer, primitive, count: vertices.length / 6 };
    }

    function paint(geometry, at, size, color, lit = false) {
      gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
      gl.uniform3fv(uniforms.offset, at);
      gl.uniform3fv(uniforms.scale, size);
      gl.uniform3fv(uniforms.color, color);
      gl.uniform1f(uniforms.lit, lit ? 1 : 0);
      gl.drawArrays(geometry.primitive, 0, geometry.count);
    }

    return ({ x, state }) => {
      const pixelRatio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(surface.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(surface.clientHeight * pixelRatio));
      if (surface.width !== width || surface.height !== height) {
        surface.width = width;
        surface.height = height;
      }
      const aspect = width / height;
      const horizontal = Math.max(5.0, 2.0 * aspect);
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.bounds, horizontal, horizontal / aspect);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      paint(cube, [0, -0.075, 0], [7, 0.075, 3.5], [0.073, 0.115, 0.090]);
      paint(grid, [0, 0.002, 0], [1, 1, 1], [0.13, 0.22, 0.17]);
      paint(cube, [0, 0.010, 0], [4.0, 0.009, 0.024], track);
      paint(ring, [startX, 0.024, 0], [0.42, 1, 0.42], track);
      paint(ring, [startX + speed * step, 0.024, 0], [0.42, 1, 0.42], track);
      paint(cube, [0, 0.026, 0], [0.34, 0.02, 1.15], [0.24, 0.22, 0.14]);
      paint(cube, [0, 0.83, 0], [wallHalf, 0.83, 1.05], [0.73, 0.44, 0.18], true);
      paint(cube, [0, 1.65, 0], [wallHalf, 0.025, 1.05], amber);
      paint(cube, [0, 0.44, 0], [wallHalf + 0.002, 0.011, 1.05], [0.37, 0.24, 0.14]);
      paint(cube, [0, 0.83, 0], [wallHalf + 0.002, 0.011, 1.05], [0.37, 0.24, 0.14]);
      if (state === 'hit') paint(ring, [-(wallHalf + radius), 0.045, 0], [0.56, 1, 0.56], green);
      paint(cube, [x + 0.06, 0.018, -0.04], [0.26, 0.01, 0.16], [0.047, 0.075, 0.060]);
      paint(ball, [x, radius, 0], [radius, radius, radius], state === 'miss' ? [1, 0.48, 0.26] : gold, true);
    };
  }

  function normalized(vector) {
    const length = Math.hypot(...vector);
    return vector.map((value) => value / length);
  }

  function boxVertices() {
    const faces = [
      [[1, 0, 0], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
      [[-1, 0, 0], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
      [[0, 1, 0], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
      [[0, -1, 0], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
      [[0, 0, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]],
      [[0, 0, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]
    ];
    return faces.flatMap(([normal, a, b, c, d]) => [a, b, c, a, c, d].flatMap((vertex) => [...vertex, ...normal]));
  }

  function sphereVertices() {
    const rows = 16;
    const columns = 24;
    const vertices = [];
    const point = (row, column) => {
      const polar = Math.PI * row / rows;
      const azimuth = Math.PI * 2 * column / columns;
      return [Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)];
    };
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = point(row, column);
        const b = point(row + 1, column);
        const c = point(row + 1, column + 1);
        const d = point(row, column + 1);
        for (const vertex of [a, b, c, a, c, d]) vertices.push(...vertex, ...vertex);
      }
    }
    return vertices;
  }

  function gridVertices() {
    const vertices = [];
    for (let x = -7; x <= 7; x += 0.5) vertices.push(x, 0, -3.5, 0, 1, 0, x, 0, 3.5, 0, 1, 0);
    for (let z = -3.5; z <= 3.5; z += 0.5) vertices.push(-7, 0, z, 0, 1, 0, 7, 0, z, 0, 1, 0);
    return vertices;
  }

  function ringVertices() {
    const vertices = [];
    for (let index = 0; index < 48; index += 1) {
      const start = Math.PI * index / 24;
      const end = Math.PI * (index + 1) / 24;
      vertices.push(Math.cos(start), 0, Math.sin(start), 0, 1, 0, Math.cos(end), 0, Math.sin(end), 0, 1, 0);
    }
    return vertices;
  }
})();
