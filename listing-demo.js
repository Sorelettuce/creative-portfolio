(() => {
  const form = document.getElementById('listing-demo');
  const titleInput = document.getElementById('demo-title');
  const descriptionInput = document.getElementById('demo-description');
  const feedback = document.getElementById('listing-feedback');
  if (!form || !titleInput || !descriptionInput || !feedback) return;

  const patch = /\bpatch(?:es)?\b/i;
  const backing = /\b(?:iron[\s-]+on|sew[\s-]+on|hook[\s-]+(?:and|&)\s+loop|velcro)\b/i;
  const measurements = /\d\s*(?:mm\b|cm\b|in(?:ch(?:es)?)?\b|["″])/i;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim().replace(/\s+/g, ' ');
    const notes = [];

    if (description.length < 75) {
      notes.push('Add enough detail for a buyer to identify the design and its intended use.');
    }
    if (patch.test(`${title} ${description}`) && !backing.test(description)) {
      notes.push('Specify the actual backing in the description, such as sew-on or iron-on.');
    }
    if (!measurements.test(description)) {
      notes.push('Include the verified dimensions with units in the description.');
    }

    const summary = document.createElement('p');
    summary.textContent = notes.length
      ? `${notes.length} ${notes.length === 1 ? 'detail' : 'details'} to review`
      : 'This example passed the three demo checks.';
    feedback.replaceChildren(summary);

    if (notes.length) {
      const list = document.createElement('ul');
      for (const note of notes) {
        const item = document.createElement('li');
        item.textContent = note;
        list.append(item);
      }
      feedback.append(list);
    }
  });
})();
