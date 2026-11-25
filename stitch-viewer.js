(() => {
  const canvas = document.getElementById('stitch-canvas');
  if (!canvas) return;

  const fallback = document.getElementById('stitch-fallback');
  const controls = document.getElementById('stitch-controls');
  const sweep = document.getElementById('stitch-progress');
  const turn = document.getElementById('stitch-turn');
  const reset = document.getElementById('stitch-reset');
  const count = document.getElementById('stitch-count');
  const angle = document.getElementById('stitch-angle');

  function showFallback() {
    canvas.hidden = true;
    fallback.hidden = false;
    controls.hidden = true;
  }

  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  if (!gl) {
    showFallback();
    return;
  }

  const vertexSource = `
    attribute vec3 point;
    attribute vec3 tint;
    uniform vec2 rotation;
    uniform vec2 scale;
    varying vec3 color;
    void main() {
      float cy = cos(rotation.x), sy = sin(rotation.x);
      float cx = cos(rotation.y), sx = sin(rotation.y);
      vec3 turn = vec3(point.x * cy + point.z * sy, point.y, -point.x * sy + point.z * cy);
      vec3 tilt = vec3(turn.x, turn.y * cx - turn.z * sx, turn.y * sx + turn.z * cx);
      float depth = 3.25 - tilt.z;
      gl_Position = vec4(tilt.xy * scale, -0.7 * tilt.z, depth);
      color = tint;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 color;
    void main() { gl_FragColor = vec4(color, 1.0); }
  `;

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Shader unavailable');
    return result;
  }

  const program = gl.createProgram();
  try {
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program unavailable');
  } catch {
    showFallback();
    return;
  }

  const surface = [];
  const strands = [];
  const pine = [0.14, 0.23, 0.20];
  const edge = [0.09, 0.14, 0.12];
  const cream = [0.91, 0.93, 0.70];
  const sage = [0.47, 0.68, 0.50];
  const moss = [0.21, 0.43, 0.34];

  function face(buffer, a, b, c, tint) {
    for (const point of [a, b, c]) buffer.push(...point, ...tint);
  }

  function quad(buffer, a, b, c, d, tint) {
    face(buffer, a, b, c, tint);
    face(buffer, a, c, d, tint);
  }

  function shade(tint, amount) {
    return tint.map((value) => value * amount);
  }

  const sides = 72;
  for (let index = 0; index < sides; index += 1) {
    const a = index / sides * Math.PI * 2;
    const b = (index + 1) / sides * Math.PI * 2;
    const rim = (theta, z) => [Math.cos(theta) * 1.12, Math.sin(theta) * .93, z];
    face(surface, [0, 0, 0], rim(a, 0), rim(b, 0), pine);
    face(surface, [0, 0, -.095], rim(b, -.095), rim(a, -.095), edge);
    quad(surface, rim(a, -.095), rim(b, -.095), rim(b, 0), rim(a, 0), shade(edge, 1.2 + .35 * Math.sin(a)));
  }

  // Low ridges add a woven surface under the sample stitch passes.
  for (let row = -38; row <= 38; row += 1) {
    const y = row * .024;
    const width = 1.1 * Math.sqrt(1 - Math.pow(y / .93, 2));
    const tint = shade(pine, 1.08 + Math.cos(row * 1.3) * .13);
    quad(surface, [-width, y-.0028, .001], [width, y-.0028, .001], [width, y+.0028, .001], [-width, y+.0028, .001], tint);
  }

  function thread(x1, y1, x2, y2, width, height, tint) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const nx = (y1 - y2) / length * width;
    const ny = (x2 - x1) / length * width;
    const colorVariation = 1 + .09 * Math.sin(x1 * 117 + y1 * 189);
    function profile(t) {
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const z = .008 + height * Math.sin(Math.PI * t);
      return [[x + nx, y + ny, z * .71], [x, y, z], [x - nx, y - ny, z * .71]];
    }
    for (let step = 0; step < 6; step += 1) {
      const [a, b, c] = profile(step / 6);
      const [d, e, f] = profile((step + 1) / 6);
      const light = .78 + .25 * Math.sin(Math.PI * (step + .5) / 6);
      quad(strands, a, d, e, b, shade(tint, light * colorVariation));
      quad(strands, b, e, f, c, shade(tint, light * colorVariation * .55));
    }
  }

  // These are display-only paths designed for this portfolio viewer.
  for (let index = 0; index < 94; index += 1) {
    const theta = index / 94 * Math.PI * 2;
    const offset = theta + .022;
    thread(1.088 * Math.cos(theta), .898 * Math.sin(theta), .993 * Math.cos(offset), .806 * Math.sin(offset), .011, .058, sage);
  }
  for (let row = -33; row <= 33; row += 1) {
    const y = row / 48;
    const reach = .92 * (1 - Math.abs(y) / .77);
    const tint = row % 7 === 0 ? sage : (row < -12 ? moss : cream);
    const center = .105 * Math.sin(row / 13);
    thread(-reach, y, center + .023, y + .032, .012, .059, tint);
    thread(center - .012, y + .025, reach, y, .012, .041, shade(tint, .81));
  }

  const vertices = new Float32Array([...surface, ...strands]);
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.useProgram(program);

  for (const [attribute, offset] of [['point', 0], ['tint', 12]]) {
    const location = gl.getAttribLocation(program, attribute);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset);
  }
  const rotationUniform = gl.getUniformLocation(program, 'rotation');
  const scaleUniform = gl.getUniformLocation(program, 'scale');
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.062, .09, .071, 1);

  let tilt = -.36;
  let pointer = null;
  function render() {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * density);
    const height = Math.round(bounds.height * density);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const aspect = width / height;
    const surfaceVertices = surface.length / 6;
    const threadVertices = 72;
    const strandCount = strands.length / 6 / threadVertices;
    const shown = Math.round(strandCount * Number(sweep.value) / 100);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(rotationUniform, Number(turn.value) * Math.PI / 180, tilt);
    gl.uniform2f(scaleUniform, 2.43 / Math.max(1, aspect), 2.43 * Math.min(1, aspect));
    gl.drawArrays(gl.TRIANGLES, 0, surfaceVertices + shown * threadVertices);
    count.value = `${sweep.value}%`;
    angle.value = `${turn.value}°`;
  }

  sweep.addEventListener('input', render);
  turn.addEventListener('input', render);
  reset.addEventListener('click', () => {
    sweep.value = '100';
    turn.value = '-26';
    tilt = -.36;
    render();
  });
  canvas.addEventListener('pointerdown', (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer) return;
    const nextTurn = Number(turn.value) + Math.round((event.clientX - pointer.x) * .65);
    turn.value = String(Math.max(-75, Math.min(75, nextTurn)));
    tilt = Math.max(-.95, Math.min(.55, tilt + (event.clientY - pointer.y) * .009));
    pointer = { x: event.clientX, y: event.clientY };
    render();
  });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  canvas.addEventListener('webglcontextlost', showFallback);
  new ResizeObserver(render).observe(canvas);
  render();
})();
