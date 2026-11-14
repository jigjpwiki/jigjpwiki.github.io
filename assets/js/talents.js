'use strict';
// Progressive portrait loading: initials remain readable offline or without JS.
for (const img of document.querySelectorAll('.talent-avatar img')) {
  const loaded = () => { if (img.naturalWidth > 0) img.classList.add('is-loaded'); };
  img.addEventListener('load', loaded, { once: true });
  if (img.complete) loaded();
}
