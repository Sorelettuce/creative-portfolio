(() => {
  const canvas = document.getElementById('hoop-canvas');
  const exportSelect = document.getElementById('hoop-export');
  const sizeSelect = document.getElementById('hoop-size');
  const centerInput = document.getElementById('hoop-center');
  const result = document.getElementById('hoop-result');
  const detail = document.getElementById('hoop-detail');
  const fallback = document.getElementById('hoop-fallback');
  const status = document.getElementById('hoop-status');
  if (!canvas || !exportSelect || !sizeSelect || !centerInput || !result || !detail || !fallback || !status) return;

  // Header extents in millimeters. The portfolio contains no stitch coordinates.
  const exports = {
    small: { minX: -49.4, maxX: 26.8, minY: -38.1, maxY: 38.1, stitches: 4418 },
    large: { minX: -48.0, maxX: 48.0, minY: -48.1, maxY: 48.1, stitches: 5507 }
  };
  const archivedMaxX = Math.max(...Object.values(exports).flatMap(({ minX, maxX }) => [-minX, maxX]));
  const archivedMaxY = Math.max(...Object.values(exports).flatMap(({ minY, maxY }) => [-minY, maxY]));
  const hoopSizes = { '90x90': [90, 90], '100x100': [100, 100], '130x180': [130, 180] };
  const context = canvas.getContext('2d');
  const number = new Intl.NumberFormat('en-US');
  const mm = (value) => value.toFixed(1);
  const signed = (value) => `${value < -0.05 ? '−' : value > 0.05 ? '+' : ''}${mm(Math.abs(value))}`;
  let current;

  function measure() {
    const source = exports[exportSelect.value] ?? exports.small;
    const [hoopW, hoopH] = hoopSizes[sizeSelect.value] ?? hoopSizes['90x90'];
    const dx = centerInput.checked ? -(source.minX + source.maxX) / 2 : 0;
    const dy = centerInput.checked ? -(source.minY + source.maxY) / 2 : 0;
    const minX = source.minX + dx;
    const maxX = source.maxX + dx;
    const minY = source.minY + dy;
    const maxY = source.maxY + dy;
    const margins = {
      left: minX + hoopW / 2,
      right: hoopW / 2 - maxX,
      top: hoopH / 2 - maxY,
      bottom: minY + hoopH / 2
    };
    const minimum = Math.min(...Object.values(margins));
    const limiting = Object.keys(margins).filter((edge) => Math.abs(margins[edge] - minimum) < 0.01);
    return { source, hoopW, hoopH, dx, dy, minX, maxX, minY, maxY, minimum, limiting };
  }

  function update() {
    current = measure();
    const { source, hoopW, hoopH, dx, dy, minimum, limiting } = current;
    const over = minimum < -0.0001;
    const edges = new Intl.ListFormat('en-US', { type: 'conjunction' }).format(limiting);
    status.dataset.state = over ? 'overflow' : 'fit';
    result.textContent = over
      ? `Out of bounds by ${mm(-minimum)} mm on the ${edges}.`
      : `Fits with ${mm(Math.max(0, minimum))} mm minimum clearance.`;
    const placement = centerInput.checked
      ? ` Recentered by ${signed(dx)} mm on X and ${signed(dy)} mm on Y.`
      : ' Using the saved origin.';
    detail.textContent = `DST header: ${mm(source.maxX - source.minX)} × ${mm(source.maxY - source.minY)} mm, ${number.format(source.stitches)} stitches. Nominal hoop: ${hoopW} × ${hoopH} mm.${placement}`;
    canvas.setAttribute('aria-label', `Plan view of the measured DST envelope and nominal hoop. ${result.textContent}`);
    if (context) draw();
  }

  function draw() {
    const { source, hoopW, hoopH, dx, dy, minX, maxX, minY, maxY, minimum } = current;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#17231b');
    background.addColorStop(1, '#0e1612');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const desktop = width >= 630;
    const chartWidth = desktop ? Math.round(width * 0.67) : width;
    const margin = desktop ? 46 : 34;
    // Keep the same chart scale when switching exports or moving the origin.
    const maximumX = Math.max(hoopW / 2, archivedMaxX);
    const maximumY = Math.max(hoopH / 2, archivedMaxY);
    const scale = Math.min((chartWidth - margin * 2) / (maximumX * 2), (height - margin * 2) / (maximumY * 2));
    if (scale <= 0) return;
    const originX = chartWidth / 2;
    const originY = height / 2;
    const px = (x) => originX + x * scale;
    const py = (y) => originY - y * scale;
    const hoop = { left: px(-hoopW / 2), top: py(hoopH / 2), right: px(hoopW / 2), bottom: py(-hoopH / 2) };
    const design = { left: px(minX), top: py(maxY), right: px(maxX), bottom: py(minY) };
    const designW = design.right - design.left;
    const designH = design.bottom - design.top;
    const warning = '#ffad92';
    const paper = '#e4f4c4';
    const hoopLine = '#a2c6ad';
    const placement = '#ffd089';

    function line(x1, y1, x2, y2, color, lineWidth = 1) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    function label(text, x, y, color, size = 12, weight = 600, align = 'left') {
      ctx.font = `${weight} ${size}px Manrope, Segoe UI, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    function hatch(left, top, right, bottom) {
      if (left >= right || top >= bottom) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top);
      ctx.clip();
      ctx.fillStyle = 'rgba(240, 112, 78, .25)';
      ctx.fillRect(left, top, right - left, bottom - top);
      for (let x = left - (bottom - top); x < right; x += 7) {
        line(x, bottom, x + bottom - top, top, warning);
      }
      ctx.restore();
    }

    const grid = 10 * scale;
    for (let x = originX % grid; x < chartWidth; x += grid) line(x, 0, x, height, '#27372c');
    for (let y = originY % grid; y < height; y += grid) line(0, y, chartWidth, y, '#27372c');
    ctx.fillStyle = '#202f25';
    ctx.fillRect(hoop.left, hoop.top, hoop.right - hoop.left, hoop.bottom - hoop.top);
    for (let x = originX; x <= hoop.right; x += grid) {
      line(x, hoop.top, x, hoop.bottom, '#31463a');
      if (x !== originX) line(2 * originX - x, hoop.top, 2 * originX - x, hoop.bottom, '#31463a');
    }
    for (let y = originY; y <= hoop.bottom; y += grid) {
      line(hoop.left, y, hoop.right, y, '#31463a');
      if (y !== originY) line(hoop.left, 2 * originY - y, hoop.right, 2 * originY - y, '#31463a');
    }

    const diskX = (design.left + design.right) / 2;
    const diskY = (design.top + design.bottom) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(diskX, diskY, designW * 0.475, designH * 0.475, 0, 0, 2 * Math.PI);
    ctx.clip();
    const fabric = ctx.createLinearGradient(design.left, design.top, design.right, design.bottom);
    fabric.addColorStop(0, '#a0ad76');
    fabric.addColorStop(0.45, '#66784f');
    fabric.addColorStop(1, '#3f523c');
    ctx.fillStyle = fabric;
    ctx.fillRect(design.left, design.top, designW, designH);
    for (let x = design.left; x < design.right; x += 3) line(x, design.top, x, design.bottom, 'rgba(231,242,199,.13)');
    for (let y = design.top; y < design.bottom; y += 3) line(design.left, y, design.right, y, 'rgba(20,26,14,.17)');
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(diskX, diskY, designW * 0.445, designH * 0.445, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(233,242,202,.65)';
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    hatch(design.left, design.top, Math.min(design.right, hoop.left), design.bottom);
    hatch(Math.max(design.left, hoop.right), design.top, design.right, design.bottom);
    const commonLeft = Math.max(design.left, hoop.left);
    const commonRight = Math.min(design.right, hoop.right);
    hatch(commonLeft, design.top, commonRight, Math.min(hoop.top, design.bottom));
    hatch(commonLeft, Math.max(hoop.bottom, design.top), commonRight, design.bottom);
    ctx.strokeStyle = hoopLine;
    ctx.lineWidth = 2;
    ctx.strokeRect(hoop.left, hoop.top, hoop.right - hoop.left, hoop.bottom - hoop.top);
    ctx.strokeStyle = paper;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(design.left, design.top, designW, designH);
    ctx.setLineDash([]);

    line(originX - 10, originY, originX + 10, originY, '#f7faf5', 1.4);
    line(originX, originY - 10, originX, originY + 10, '#f7faf5', 1.4);
    const markX = px(dx);
    const markY = py(dy);
    ctx.beginPath();
    ctx.arc(markX, markY, 5, 0, Math.PI * 2);
    ctx.strokeStyle = placement;
    ctx.lineWidth = 2;
    ctx.stroke();

    label('PLAN VIEW  /  MILLIMETERS', 16, 17, '#a4bda9', 10, 750);
    label(`${hoopW} mm`, desktop ? originX : hoop.right, hoop.top - 13, hoopLine, 11, 750, desktop ? 'center' : 'right');
    const scaleLeft = 18;
    const scaleY = height - 28;
    line(scaleLeft, scaleY, scaleLeft + grid, scaleY, hoopLine, 1.4);
    line(scaleLeft, scaleY - 4, scaleLeft, scaleY + 4, hoopLine, 1.4);
    line(scaleLeft + grid, scaleY - 4, scaleLeft + grid, scaleY + 4, hoopLine, 1.4);
    label('10 mm', scaleLeft, scaleY + 12, '#a4bda9', 10);
    if (!desktop) return;

    line(chartWidth, 0, chartWidth, height, '#3c5041');
    const sidebar = chartWidth + 26;
    const titleY = Math.max(38, height / 2 - 129);
    label('DST HEADER ENVELOPE', sidebar, titleY, hoopLine, 10, 750);
    label(`${mm(source.maxX - source.minX)} × ${mm(source.maxY - source.minY)} mm`, sidebar, titleY + 32, paper, 22, 750);
    label(`${number.format(source.stitches)} stitches`, sidebar, titleY + 57, '#abc2ad', 13);
    line(sidebar, titleY + 79, width - 26, titleY + 79, '#3c5041');
    label(minimum < 0 ? `${mm(-minimum)} mm overflow` : `${mm(minimum)} mm clearance`, sidebar, titleY + 101, minimum < 0 ? warning : paper, 15, 750);
    const legend = [
      [hoopLine, `Nominal ${hoopW} × ${hoopH} mm hoop`],
      [paper, 'Measured design bounds'],
      ['#f7faf5', 'Hoop origin crosshair'],
      [placement, 'DST placement marker']
    ];
    legend.forEach(([color, text], index) => {
      const y = titleY + 134 + index * 22;
      ctx.fillStyle = color;
      ctx.fillRect(sidebar, y - 2, 12, 3);
      label(text, sidebar + 20, y, '#c2d1bf', 11);
    });
    label('Fabric disk is illustrative.', sidebar, titleY + 233, '#a4bda9', 11);
  }

  fallback.hidden = Boolean(context);
  canvas.hidden = !context;
  exportSelect.addEventListener('change', update);
  sizeSelect.addEventListener('change', update);
  centerInput.addEventListener('change', update);
  update();
  if (context && 'ResizeObserver' in window) {
    new ResizeObserver(draw).observe(canvas);
  } else if (context) {
    addEventListener('resize', draw);
  }
})();
