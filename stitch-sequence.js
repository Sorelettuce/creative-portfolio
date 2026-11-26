(() => {
  const canvas = document.getElementById('sequence-canvas');
  if (!canvas) return;

  const picker = document.getElementById('sequence-design');
  const poster = document.getElementById('sequence-poster');
  const slider = document.getElementById('sequence-progress');
  const progress = document.getElementById('sequence-value');
  const details = document.getElementById('sequence-details');
  const note = document.getElementById('sequence-note');
  const play = document.getElementById('sequence-play');
  const context = canvas.getContext('2d');
  const steps = Number(slider.max);
  const tile = canvas.width;
  const columns = 5;
  const atlases = new Map();

  let atlas = null;
  let timer = null;
  let request = 0;

  function stop() {
    clearInterval(timer);
    timer = null;
    play.textContent = 'Play stitch sequence';
  }

  function draw() {
    const step = Number(slider.value);
    const stitchCount = Number(picker.selectedOptions[0].dataset.stitches);
    const percent = `${step / steps * 100}%`;
    const reached = Math.round(stitchCount * step / steps).toLocaleString('en-US');
    progress.textContent = `${percent} · ${reached} stitches`;
    slider.setAttribute('aria-valuetext', `${percent}, ${reached} stitches`);
    if (!atlas) return;

    const sourceX = step % columns * tile;
    const sourceY = Math.floor(step / columns) * tile;
    context.drawImage(atlas, sourceX, sourceY, tile, tile, 0, 0, tile, tile);
    canvas.setAttribute('aria-label', `${picker.selectedOptions[0].textContent} stitch sequence at ${percent}`);
  }

  function loadImage(url) {
    if (!atlases.has(url)) {
      const image = new Image();
      image.src = url;
      atlases.set(url, image.decode().then(() => image));
    }
    return atlases.get(url);
  }

  async function selectDesign() {
    stop();
    const token = ++request;
    const { atlas: source, preview, dimensions, credit, format, stitches } = picker.selectedOptions[0].dataset;
    atlas = null;
    canvas.hidden = true;
    poster.src = preview;
    poster.alt = `Complete stitch path for ${picker.selectedOptions[0].textContent}`;
    poster.hidden = false;
    slider.disabled = true;
    play.disabled = true;
    slider.value = String(steps);
    details.textContent = `${format} · ${dimensions} mm · ${Number(stitches).toLocaleString('en-US')} stitch commands`;
    note.textContent = credit;
    draw();
    if (!context) return;

    try {
      const loaded = await loadImage(source);
      if (token !== request) return;
      atlas = loaded;
      draw();
      canvas.hidden = false;
      poster.hidden = true;
      slider.disabled = false;
      play.disabled = false;
    } catch {
      atlases.delete(source);
      if (token === request) note.textContent = `${credit} The completed stitch image is available.`;
    }
  }

  picker.addEventListener('change', selectDesign);
  slider.addEventListener('input', () => {
    stop();
    draw();
  });
  play.addEventListener('click', () => {
    if (timer !== null) {
      stop();
      return;
    }
    if (Number(slider.value) === steps) slider.value = '0';
    draw();
    play.textContent = 'Pause stitch sequence';
    timer = setInterval(() => {
      slider.value = String(Number(slider.value) + 1);
      draw();
      if (Number(slider.value) === steps) stop();
    }, 250);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });

  selectDesign();
})();
