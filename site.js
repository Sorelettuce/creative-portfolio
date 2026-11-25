(() => {
  const filterBar = document.querySelector('[data-project-filters]');
  if (filterBar) {
    const projects = [...document.querySelectorAll('[data-project]')];
    const filterButtons = [...filterBar.querySelectorAll('button')];
    const status = document.getElementById('filter-status');
    filterBar.hidden = false;
    filterBar.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;

      const filter = button.dataset.filter;
      let shown = 0;
      for (const filterButton of filterButtons) {
        filterButton.setAttribute('aria-pressed', String(filterButton === button));
      }
      for (const project of projects) {
        const match = filter === 'all' || project.dataset.project.split(' ').includes(filter);
        project.hidden = !match;
        if (match) shown += 1;
      }
      status.textContent = `${shown} ${shown === 1 ? 'project' : 'projects'} shown`;
    });
  }

  const lightbox = document.querySelector('.lightbox');
  if (!lightbox || typeof lightbox.showModal !== 'function') return;

  const lightboxImage = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('[data-lightbox-caption]');
  for (const link of document.querySelectorAll('.lightbox-trigger')) {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const thumbnail = link.querySelector('img');
      lightboxImage.src = link.href;
      lightboxImage.alt = thumbnail.alt;
      lightboxCaption.textContent = link.closest('figure').querySelector('figcaption strong').textContent;
      lightbox.showModal();
    });
  }

  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) lightbox.close();
  });
})();
