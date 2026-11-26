'use strict';

(() => {
  const fallback = 'assets/thumbnail/placeholder.svg';
  const sources = ['tiktok', 'twitch', 'youtube'];
  const cached = new Map();
  let storage;
  try { storage = localStorage; } catch {}
  const checkYouTube = YouTubeStatus.create({ storage });
  async function updateYouTube() {
    const rows = cached.get('youtube');
    if (!rows) return;
    const updated = await checkYouTube(rows);
    if (JSON.stringify(updated) !== JSON.stringify(cached.get('youtube'))) { cached.set('youtube', updated); render(); }
  }
  let busy = false;
  let initialized = false;
  let showVideos = false;
  const toggle = document.getElementById('show-videos-toggle');
  try { showVideos = localStorage.getItem('showVideos') === 'true'; } catch { /* storage may be disabled */ }
  toggle.checked = showVideos;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function imageUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, location.href);
      if (url.username || url.password) return null;
      return url.protocol === 'https:' || url.origin === location.origin ? url.href : null;
    } catch { return null; }
  }
  function image(value, className, alt) {
    const img = element('img', className);
    img.src = imageUrl(value) || fallback;
    img.alt = alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => { img.src = fallback; }, { once: true });
    return img;
  }
  function normalize(item, platform) {
    let url = item.url;
    let thumbnail = item.thumbnail;
    let icon = item.channelIcon;
    if (platform === 'tiktok') {
      url = `https://www.tiktok.com/@${encodeURIComponent(item.tiktokid || '')}/live`;
      if (/^[a-zA-Z0-9_-]+$/.test(item.schoolid || '')) {
        thumbnail = `assets/thumbnail/${item.schoolid}.png`;
        icon = `assets/face/${item.schoolid}.png`;
      }
    }
    if (platform === 'twitch' && !url) {
      url = item.videoId ? `https://www.twitch.tv/videos/${encodeURIComponent(item.videoId)}` : `https://www.twitch.tv/${encodeURIComponent(item.twitchid || '')}`;
    }
    return { ...item, platform, url: Schedule.link(url, platform), thumbnail, faceIcon: icon,
      type: item.type === 'video' ? 'video' : 'stream' };
  }
  function card(item) {
    const wrapper = element('div', 'live-wrapper');
    wrapper.dataset.contentType = item.type;
    wrapper.dataset.platform = item.platform;
    if(item.platform==='twitch')wrapper.dataset.twitchid=item.twitchid||'';
    if (item.platform === 'youtube') { wrapper.dataset.videoId = item.videoId || ''; wrapper.dataset.youtubeid = item.youtubeid || ''; }
    const live = item.status === 'live';
    const block = element('div', `live-block${live ? ' is-live' : ''}`);
    if (item.url) {
      const destination = element('a', 'stream-destination');
      destination.href = item.url; destination.target = '_blank'; destination.rel = 'noopener noreferrer';
      destination.setAttribute('aria-label', `${item.name || ''}：${item.title || ''}（配信先を開く）`);
      block.append(destination);
    }
    const time = element('div', 'formatted-time');
    time.append(element('p', '', Schedule.time(item.date)));
    block.append(time);
    if (live) { const badge = element('div', 'on-air-badge'); badge.append(element('p', '', 'ON AIR')); block.append(badge); }
    const badge = element('div', `live-badge ${item.platform}`);
    badge.append(element('div', `${item.platform}-badge platform-border`));
    const info = element('div', 'live-info');
    const inner = element('div', 'live-info-inner');
    const face = element('div', 'face-icon');
    face.append(element('span', 'face-fallback', [...(item.name || '？')][0]));
    if (item.faceIcon) {
      const img = image(item.faceIcon, '', ''); img.width = 68; img.height = 68;
      // Keep a same-size initial behind the image, including when it fails to load.
      img.addEventListener('error', () => img.remove(), { once: true }); face.append(img);
    }
    const description = element('div', 'description');
    const partners = globalThis.AvatarStack?.create(item.collaborators,{label:'コラボ相手の候補',limit:5});
    if(partners)description.classList.add('has-collaborators');
    const name = element('div', 'liver-name');
    name.append(element('p', '', item.name));
    const title = element('p', 'live-title', item.title); title.title = item.title;
    if(partners){
      const byline=element('div','stream-collab-byline');byline.append(name,partners);description.append(byline,title);
      const destination=block.querySelector('.stream-destination');
      if(destination)destination.setAttribute('aria-label',destination.getAttribute('aria-label')+'／'+partners.getAttribute('aria-label'));
    }else description.append(name, title);
    inner.append(face, description);
    const thumbnail = element('div', 'thumbnail-wrapper');
    const poster = image(item.thumbnail, 'thumbnail', ''); poster.width = 320; poster.height = 180;
    thumbnail.append(poster);
    info.append(inner, thumbnail); badge.append(info); block.append(badge); wrapper.append(block);
    return wrapper;
  }

  function applyFilter() {
    document.querySelectorAll('.day-block').forEach(day => {
      day.querySelectorAll('.live-wrapper').forEach(node => { node.hidden = !showVideos && node.dataset.contentType === 'video'; });
      day.querySelectorAll('.video-list').forEach(list => {
        const empty = !list.querySelector('.live-wrapper:not([hidden])');
        list.hidden = empty; list.previousElementSibling.hidden = empty;
      });
      day.querySelector('.empty-day').hidden = !!day.querySelector('.live-wrapper:not([hidden])');
    });
    window._swiperInstance?.update();
  }

  function render() {
    const focusedHref = document.activeElement?.closest('.live-wrapper a')?.getAttribute('href');
    const focusedStream = document.activeElement?.closest('.live-wrapper')?.querySelector('.stream-destination')?.getAttribute('href');
    const oldDays = [...document.querySelectorAll('.day-block')];
    const scrolls = new Map(oldDays.map(d => [d.dataset.date, d.scrollTop]));
    const active = oldDays[window._swiperInstance?.activeIndex]?.dataset.date;
    window._swiperInstance?.destroy(true, true);
    window._swiperInstance = null;
    const container = document.getElementById('videolist');
    container.replaceChildren();
    const all = [...cached.entries()].flatMap(([platform, rows]) => rows.map(row => normalize(row, platform)))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const grouped = new Map();
    for (const row of all) {
      const key = Schedule.dateKey(row.date);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
    for (const date of Schedule.dates()) {
      const day = element('div', 'day-block swiper-slide');
      day.dataset.date = date.key;
      if (date.key === Schedule.dateKey(new Date())) day.classList.add('today-block');
      const heading = element('div', 'date-heading');
      heading.append(element('h2', date.day === 0 ? 'date-heading--sun' : date.day === 6 ? 'date-heading--sat' : '', date.label));
      day.append(heading);
      let range = -1, list;
      for (const row of grouped.get(date.key) || []) {
        const nextRange = Math.floor(Number(Schedule.time(row.date).slice(0, 2)) / 6) * 6;
        if (range !== nextRange) {
          range = nextRange;
          const timeHeading = element('div', 'time-heading');
          timeHeading.append(element('h3', '', `${String(range).padStart(2, '0')}:00 - ${String(range + 5).padStart(2, '0')}:59`));
          list = element('div', `video-list time-${String(range).padStart(2, '0')}`);
          day.append(timeHeading, list);
        }
        list.append(card(row));
      }
      day.append(element('p', 'empty-day', cached.size ? '表示する配信・動画はありません。' : '配信情報を取得できませんでした。'));
      container.append(day);
      day.scrollTop = scrolls.get(date.key) || 0;
    }
    initializeCarousel(active);
    applyFilter();
    if (!initialized) {
      const today = document.querySelector('.today-block');
      const hour = Number(Schedule.time(new Date()).slice(0, 2));
      const list = [...(today?.querySelectorAll('.video-list:not([hidden])') || [])]
        .filter(node => Number(node.className.match(/time-(\d+)/)?.[1]) <= hour).pop();
      if (list) today.scrollTop = list.previousElementSibling.offsetTop - 90;
    }
    if (focusedHref) requestAnimationFrame(() => [...container.querySelectorAll('.live-wrapper a')].find(a => a.getAttribute('href') === focusedHref && a.closest('.live-wrapper').querySelector('.stream-destination')?.getAttribute('href') === focusedStream)?.focus({ preventScroll: true }));
    initialized = true;
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      await Promise.allSettled(sources.map(async platform => {
        const response = await fetch(`data/${platform}.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('HTTP failure');
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.some(row => !row || typeof row.name !== 'string' || typeof row.title !== 'string' || !Number.isFinite(Date.parse(row.date)))) throw new Error('Invalid data');
        cached.set(platform, rows);
      }));
      await loadLastUpdated();
      render();
      await updateYouTube();
    } finally { busy = false; }
  }
  toggle.addEventListener('change', () => {
    showVideos = toggle.checked;
    try { localStorage.setItem('showVideos', String(showVideos)); } catch { /* optional preference */ }
    applyFilter();
  });
  refresh();
  setInterval(() => { if (!document.hidden) updateYouTube(); }, 60000);
  setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
