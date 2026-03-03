/* ============================================================
   Movies Everywhere — app.js
   Core logic: load data, render grid, sort, filter, detail view
   ============================================================ */

const App = (() => {
  'use strict';

  // ---------- Format definitions ----------
  const FORMAT_META = {
    // Physical
    'VCD':             { category: 'physical', logo: 'assets/logos/vcd.svg',             label: 'VCD' },
    'DVD':             { category: 'physical', logo: 'assets/logos/dvd.svg',             label: 'DVD' },
    'Blu-Ray':         { category: 'physical', logo: 'assets/logos/blu-ray.svg',         label: 'Blu-Ray' },
    'UHD Blu-Ray':     { category: 'physical', logo: 'assets/logos/uhd-blu-ray.svg',     label: 'UHD Blu-Ray' },
    '3D DVD':          { category: 'physical', logo: 'assets/logos/dvd-3d.svg',           label: '3D DVD' },
    '3D Blu-Ray':      { category: 'physical', logo: 'assets/logos/blu-ray-3d.svg',      label: '3D Blu-Ray' },
    // Digital
    'Apple TV':        { category: 'digital', logo: 'assets/logos/apple-tv.svg',         label: 'Apple TV',          url: 'https://tv.apple.com/search?term={q}' },
    'YouTube':         { category: 'digital', logo: 'assets/logos/youtube.svg',           label: 'YouTube',           url: 'https://www.youtube.com/results?search_query={q}' },
    'Google Play':     { category: 'digital', logo: 'assets/logos/google-play.svg',       label: 'Google Play',       url: 'https://play.google.com/store/search?q={q}&c=movies' },
    'Fandango At Home':{ category: 'digital', logo: 'assets/logos/fandango-at-home.svg',  label: 'Fandango At Home',  url: 'https://athome.fandango.com/content/browse/search?searchString={q}' },
    'Xfinity':         { category: 'digital', logo: 'assets/logos/xfinity.svg',           label: 'Xfinity' },
    'Verizon':         { category: 'digital', logo: 'assets/logos/verizon.svg',            label: 'Verizon' },
    'DirecTV':         { category: 'digital', logo: 'assets/logos/directv.svg',            label: 'DirecTV' },
    'Prime Video':     { category: 'digital', logo: 'assets/logos/prime-video.svg',        label: 'Prime Video',       url: 'https://www.primevideo.com/search/ref=atv_nb_sug?ie=UTF8&phrase={q}' },
    'Movies Anywhere': { category: 'digital', logo: 'assets/logos/moviesanywhere.png',    label: 'Movies Anywhere',  url: 'https://moviesanywhere.com/movie/{slug}' },
    'Plex':            { category: 'digital', logo: 'assets/logos/plex.svg',               label: 'Plex',              url: 'https://app.plex.tv/desktop/#!/search?pivot=top&query={q}' },
  };

  let movies = [];
  let tvShows = [];
  let config = {};
  let currentMode = 'movies'; // 'movies' | 'tv'
  let currentSort = 'date-desc';
  let activeFilter = 'featured'; // default; overridden to 'all' if featured disabled
  let searchQuery = '';
  let detailOpen = false;   // tracks whether a detail view (modal or fullscreen) is open
  let closingViaBack = false; // prevents double history.back()

  /** Return the active dataset based on current mode */
  function activeData() {
    return currentMode === 'tv' ? tvShows : movies;
  }

  // ---------- Bootstrap ----------
  async function init() {
    showLoading(true);
    try {
      const fetches = [
        fetch('data/config.json').then(r => r.json()),
        fetch('data/movies.json').then(r => r.json()),
      ];
      // Speculatively load TV shows JSON (may not exist)
      fetches.push(
        fetch('data/tvshows.json').then(r => { if (!r.ok) throw new Error('no tv'); return r.json(); }).catch(() => [])
      );
      [config, movies, tvShows] = await Promise.all(fetches);
    } catch (e) {
      console.error('Failed to load data:', e);
      movies = [];
      tvShows = [];
      config = { posterMode: 'remote', tmdbImageBase: 'https://image.tmdb.org/t/p/w500', customFields: [] };
    }

    // If featured is disabled in config, default to 'all'
    if (!config.featured) activeFilter = 'all';

    renderSortButtons();
    renderFilters();
    bindSearch();
    initMobileUI();
    bindHistoryNav();
    bindPosterHero();
    bindLogoReset();
    bindModeToggle();
    updateSortVisibility();
    renderGrid();

    if (config.posterMode === 'remote' && movies.length) {
      await waitForImages();
    }
    showLoading(false);
  }

  // ---------- Loading screen ----------
  function showLoading(show) {
    const el = document.getElementById('loading-screen');
    if (!el) return;
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }

  function waitForImages() {
    const imgs = document.querySelectorAll('.poster-card img');
    const promises = Array.from(imgs).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
    });
    return Promise.all(promises);
  }

  // ---------- Logo tap: reset everything ----------
  function bindLogoReset() {
    const logo = document.querySelector('.me-logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', (e) => {
        e.preventDefault();
        // Reset to movies mode if in TV mode
        if (currentMode !== 'movies') {
          switchMode('movies');
        }
        resetAll();
      });
    }
  }

  // ---------- Mode Toggle (Movies / TV) ----------
  function bindModeToggle() {
    const toggle = document.getElementById('modeToggle');
    if (!toggle) return;

    // Show toggle only if tvShows enabled in config
    if (config.tvShows && tvShows.length >= 0) {
      toggle.style.display = '';
    } else {
      toggle.style.display = 'none';
      return;
    }

    toggle.querySelectorAll('.me-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === currentMode) return;
        switchMode(mode);
      });
    });
  }

  function switchMode(mode) {
    currentMode = mode;

    // Update toggle buttons
    document.querySelectorAll('.me-mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.me-mode-btn[data-mode="${mode}"]`)?.classList.add('active');

    // Reset search
    searchQuery = '';
    const mobileInput = document.getElementById('mobile-search-box');
    const desktopInput = document.getElementById('search-box');
    if (mobileInput) mobileInput.value = '';
    if (desktopInput) desktopInput.value = '';
    const submitBtn = document.querySelector('.me-search-submit');
    const submitIcon = submitBtn?.querySelector('i');
    if (submitIcon) submitIcon.className = 'bi bi-search';
    if (submitBtn) submitBtn.classList.remove('clear-mode');

    // Reset filter and sort
    activeFilter = config.featured ? 'featured' : 'all';
    currentSort = 'date-desc';
    document.querySelectorAll('.me-sort-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.me-sort-btn[data-sort="date-desc"]')?.classList.add('active');

    // Rebuild filters for the new dataset
    renderFilters();
    updateSortVisibility();
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Returns true when every season of a TV show is owned (physical or digital), or has a box set */
  function isCompleteSet(show) {
    if (!show.totalSeasons || show.totalSeasons < 1) return false;
    // A box set counts as owning the complete show
    const hasBoxSet = show.boxSet && (show.boxSet.physical || (show.boxSet.digital && show.boxSet.digital.length > 0));
    if (hasBoxSet) return true;
    const seasonMap = {};
    (show.seasons || []).forEach(s => { seasonMap[s.seasonNumber] = s; });
    for (let i = 1; i <= show.totalSeasons; i++) {
      const s = seasonMap[i];
      const hasPhysical = s && s.physical;
      const hasDigital = s && s.digital && s.digital.length > 0;
      if (!hasPhysical && !hasDigital) return false;
    }
    return true;
  }

  /** Label helpers that adapt to current mode */
  function allLabel() {
    return currentMode === 'tv' ? 'All Shows' : 'All Movies';
  }
  function noItemsLabel() {
    return currentMode === 'tv' ? 'No shows found.' : 'No movies found.';
  }
  function noFeaturedLabel() {
    return currentMode === 'tv' ? 'No shows to feature.' : 'No movies to feature.';
  }

  // ---------- Reset all searches and filters ----------
  function resetAll() {
    // Clear search
    searchQuery = '';
    const mobileInput = document.getElementById('mobile-search-box');
    const desktopInput = document.getElementById('search-box');
    if (mobileInput) mobileInput.value = '';
    if (desktopInput) desktopInput.value = '';

    // Update search icon back to magnifying glass
    const submitBtn = document.querySelector('.me-search-submit');
    const submitIcon = submitBtn?.querySelector('i');
    if (submitIcon) submitIcon.className = 'bi bi-search';
    if (submitBtn) submitBtn.classList.remove('clear-mode');

    // Reset filter to Featured (or All if featured disabled)
    activeFilter = config.featured ? 'featured' : 'all';
    document.querySelectorAll('.filter-chip, .me-filter-chip').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`[data-filter="${activeFilter}"]`).forEach(b => b.classList.add('active'));
    const labelEl = document.getElementById('activeFilterLabel');
    if (labelEl) labelEl.textContent = activeFilter === 'featured' ? 'Featured' : allLabel();
    updateSortVisibility();

    // Reset sort to default
    currentSort = 'date-desc';
    document.querySelectorAll('.me-sort-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.me-sort-btn[data-sort="date-desc"]')?.classList.add('active');
    const desktopBtns = document.getElementById('sort-buttons');
    if (desktopBtns) {
      desktopBtns.querySelectorAll('.btn').forEach(b => {
        b.className = 'btn btn-sm ' + (b.dataset.sort === 'date-desc' ? 'btn-light' : 'btn-outline-light');
      });
    }

    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Poster URL helper ----------
  function posterUrl(movie) {
    if (config.posterMode === 'local') return `posters/${movie.tmdbId}.jpg`;
    if (movie.posterPath) return `${config.tmdbImageBase || 'https://image.tmdb.org/t/p/w500'}${movie.posterPath}`;
    return '';
  }

  // ---------- Search ----------
  function bindSearch() {
    const input = document.getElementById('search-box');
    const mobileInput = document.getElementById('mobile-search-box');

    function handleSearch(value, syncTarget) {
      searchQuery = value.trim().toLowerCase();
      if (syncTarget) syncTarget.value = value;

      // Auto-switch from Featured to All when searching
      if (searchQuery && activeFilter === 'featured') {
        activeFilter = 'all';
        document.querySelectorAll('.filter-chip, .me-filter-chip').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('[data-filter="all"]').forEach(b => b.classList.add('active'));
        const labelEl = document.getElementById('activeFilterLabel');
        if (labelEl) labelEl.textContent = allLabel();
        updateSortVisibility();
      }

      renderGrid();
    }

    if (input) {
      input.addEventListener('input', () => handleSearch(input.value, mobileInput));
    }
    if (mobileInput) {
      mobileInput.addEventListener('input', () => handleSearch(mobileInput.value, input));
    }
  }

  function searchMovies(list) {
    if (!searchQuery) return list;
    return list.filter(m => {
      const haystack = [
        m.title, m.director, m.creator,
        ...(m.cast || []), ...(m.genres || []), ...(m.tags || []),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchQuery);
    });
  }

  // ---------- Sorting ----------
  function sortMovies(list) {
    const sorted = [...list];
    const dateKey = currentMode === 'tv' ? 'firstAirDate' : 'releaseDate';
    if (currentSort === 'date-desc') {
      sorted.sort((a, b) => (b[dateKey] || '').localeCompare(a[dateKey] || ''));
    } else if (currentSort === 'alpha-asc') {
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (currentSort === 'rating-desc') {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    return sorted;
  }

  function renderSortButtons() {
    const container = document.getElementById('sort-buttons');
    if (!container) return;
    container.innerHTML = '';

    const sorts = [
      { key: 'date-desc', label: 'Newest' },
      { key: 'alpha-asc', label: 'A–Z' },
      { key: 'rating-desc', label: '★ Rated' },
    ];

    sorts.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm ' + (s.key === currentSort ? 'btn-light' : 'btn-outline-light');
      btn.dataset.sort = s.key;
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        currentSort = s.key;
        container.querySelectorAll('.btn').forEach(b => { b.className = 'btn btn-sm btn-outline-light'; });
        btn.className = 'btn btn-sm btn-light';
        renderGrid();
      });
      container.appendChild(btn);
    });
  }

  // ---------- Filtering ----------
  function getUsedFormats() {
    const data = activeData();
    const used = new Set();
    if (currentMode === 'tv') {
      // For TV shows, gather formats from seasons + boxSet
      data.forEach(show => {
        (show.seasons || []).forEach(s => {
          if (s.physical) used.add(s.physical);
          (s.digital || []).forEach(f => used.add(f));
        });
        if (show.boxSet) {
          if (show.boxSet.physical) used.add(show.boxSet.physical);
          (show.boxSet.digital || []).forEach(f => used.add(f));
        }
      });
    } else {
      data.forEach(m => {
        if (!m.formats) return;
        (m.formats.physical || []).forEach(f => used.add(f));
        (m.formats.digital || []).forEach(f => used.add(f));
      });
    }
    return used;
  }

  function getUsedCustomFields() {
    const fields = config.customFields || [];
    const used = new Set();
    activeData().forEach(m => {
      if (!m.customTags) return;
      fields.forEach(f => { if (m.customTags[f]) used.add(f); });
    });
    return used;
  }

  function renderFilters() {
    const container = document.getElementById('filter-chips');
    const mobileContainer = document.getElementById('me-filter-chips');
    if (!container && !mobileContainer) return;
    if (container) container.innerHTML = '';
    if (mobileContainer) mobileContainer.innerHTML = '';

    const usedFormats = getUsedFormats();
    const data = activeData();
    let hasPhysical, hasDigital;
    if (currentMode === 'tv') {
      hasPhysical = data.some(s => (s.seasons || []).some(sn => sn.physical) || s.boxSet?.physical);
      hasDigital = data.some(s => (s.seasons || []).some(sn => (sn.digital || []).length > 0) || (s.boxSet?.digital || []).length > 0);
    } else {
      hasPhysical = data.some(m => m.formats?.physical?.length > 0);
      hasDigital = data.some(m => m.formats?.digital?.length > 0);
    }

    const chips = [];
    if (config.featured) chips.push({ key: 'featured', label: 'Featured' });
    chips.push({ key: 'all', label: allLabel() });
    if (hasDigital) chips.push({ key: 'digital', label: 'Digital' });
    if (hasPhysical) chips.push({ key: 'physical', label: 'Physical' });
    if (currentMode === 'tv' && data.some(isCompleteSet)) chips.push({ key: 'complete-set', label: 'Complete Set' });

    Object.keys(FORMAT_META).forEach(key => {
      if (usedFormats.has(key)) chips.push({ key, label: FORMAT_META[key].label });
    });

    // Custom fields in use
    getUsedCustomFields().forEach(f => {
      chips.push({ key: `custom:${f}`, label: f });
    });

    // "Not Watched" chip
    const hasUnwatched = data.some(m => !m.watched);
    if (hasUnwatched) chips.push({ key: 'not-watched', label: 'Not Watched' });

    // "No Rating" chip
    const hasUnrated = data.some(m => !m.rating || m.rating <= 0);
    if (hasUnrated) chips.push({ key: 'no-rating', label: 'No Rating' });

    function syncActiveFilter(key, label) {
      activeFilter = key;
      if (container) container.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      if (mobileContainer) mobileContainer.querySelectorAll('.me-filter-chip').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-filter="${key}"]`).forEach(b => b.classList.add('active'));
      const labelEl = document.getElementById('activeFilterLabel');
      if (labelEl) labelEl.textContent = label;
      updateSortVisibility();
      renderGrid();
    }

    const topLevelKeys = new Set(['featured', 'all', 'digital', 'physical', 'complete-set']);
    const trailingKeys = new Set(['not-watched', 'no-rating']);
    let dividerInserted = false;
    let featuredDividerInserted = false;

    chips.forEach((c, i) => {
      // Insert divider after Featured chip (before All Movies)
      if (config.featured && !featuredDividerInserted && c.key !== 'featured') {
        featuredDividerInserted = true;
        if (container) {
          const sep = document.createElement('span');
          sep.className = 'filter-divider';
          container.appendChild(sep);
        }
        if (mobileContainer) {
          const sep = document.createElement('span');
          sep.className = 'me-filter-divider';
          mobileContainer.appendChild(sep);
        }
      }
      // Insert divider after the last top-level chip (before format chips)
      if (!dividerInserted && !topLevelKeys.has(c.key) && !trailingKeys.has(c.key)) {
        dividerInserted = true;
        if (container) {
          const sep = document.createElement('span');
          sep.className = 'filter-divider';
          container.appendChild(sep);
        }
        if (mobileContainer) {
          const sep = document.createElement('span');
          sep.className = 'me-filter-divider';
          mobileContainer.appendChild(sep);
        }
      }
      // Insert divider before trailing group (once, before Not Watched)
      if (c.key === 'not-watched') {
        if (container) {
          const sep = document.createElement('span');
          sep.className = 'filter-divider';
          container.appendChild(sep);
        }
        if (mobileContainer) {
          const sep = document.createElement('span');
          sep.className = 'me-filter-divider';
          mobileContainer.appendChild(sep);
        }
      }
      // Desktop chip
      if (container) {
        const btn = document.createElement('button');
        btn.className = 'filter-chip' + (c.key === activeFilter ? ' active' : '');
        btn.dataset.filter = c.key;
        btn.textContent = c.label;
        btn.addEventListener('click', () => syncActiveFilter(c.key, c.label));
        container.appendChild(btn);
      }
      // Mobile glass chip
      if (mobileContainer) {
        const btn = document.createElement('button');
        btn.className = 'me-filter-chip' + (c.key === activeFilter ? ' active' : '');
        btn.dataset.filter = c.key;
        btn.textContent = c.label;
        btn.addEventListener('click', () => syncActiveFilter(c.key, c.label));
        mobileContainer.appendChild(btn);
      }
    });

    // Set initial active filter label
    const labelEl = document.getElementById('activeFilterLabel');
    const activeChip = chips.find(c => c.key === activeFilter);
    if (labelEl && activeChip) labelEl.textContent = activeChip.label;
  }

  function filterMovies(list) {
    if (activeFilter === 'all') return list;
    if (activeFilter === 'complete-set') return list.filter(isCompleteSet);
    if (activeFilter === 'not-watched') return list.filter(m => !m.watched);
    if (activeFilter === 'no-rating') return list.filter(m => !m.rating || m.rating <= 0);
    if (activeFilter.startsWith('custom:')) {
      const field = activeFilter.slice(7);
      return list.filter(m => m.customTags && m.customTags[field]);
    }

    if (currentMode === 'tv') {
      // TV filtering on seasons + boxSet
      if (activeFilter === 'physical') {
        return list.filter(s => (s.seasons || []).some(sn => sn.physical) || s.boxSet?.physical);
      }
      if (activeFilter === 'digital') {
        return list.filter(s => (s.seasons || []).some(sn => (sn.digital || []).length > 0) || (s.boxSet?.digital || []).length > 0);
      }
      const meta = FORMAT_META[activeFilter];
      if (!meta) return list;
      return list.filter(s => {
        if (meta.category === 'physical') {
          return (s.seasons || []).some(sn => sn.physical === activeFilter) || s.boxSet?.physical === activeFilter;
        }
        return (s.seasons || []).some(sn => (sn.digital || []).includes(activeFilter)) || (s.boxSet?.digital || []).includes(activeFilter);
      });
    }

    // Movie filtering
    if (activeFilter === 'physical') return list.filter(m => m.formats?.physical?.length > 0);
    if (activeFilter === 'digital') return list.filter(m => m.formats?.digital?.length > 0);
    const meta = FORMAT_META[activeFilter];
    if (!meta) return list;
    return list.filter(m => m.formats && m.formats[meta.category]?.includes(activeFilter));
  }

  // ---------- Sort visibility (hide on Featured) ----------
  function updateSortVisibility() {
    const sortBubble = document.getElementById('sortBubble');
    if (!sortBubble) return;
    if (activeFilter === 'featured') {
      sortBubble.style.display = 'none';
    } else {
      sortBubble.style.display = '';
    }
  }

  // ---------- Grid rendering ----------
  function renderGrid() {
    const grid = document.getElementById('poster-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Featured view
    if (activeFilter === 'featured') {
      grid.classList.add('featured-active');
      renderFeatured(grid);
      return;
    }

    grid.classList.remove('featured-active');
    grid.classList.remove('featured-mobile');
    const visible = sortMovies(filterMovies(searchMovies(activeData())));

    if (visible.length === 0) {
      grid.innerHTML = `<div class="text-center text-secondary py-5 w-100" style="grid-column:1/-1;">${noItemsLabel()}</div>`;
      return;
    }

    visible.forEach(movie => {
      grid.appendChild(buildPosterCard(movie));
    });
  }

  function buildPosterCard(movie) {
    const card = document.createElement('div');
    card.className = 'poster-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', movie.title);

    const src = posterUrl(movie);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = movie.title;
      img.loading = 'lazy';
      img.onerror = function () {
        this.style.display = 'none';
        const ph = document.createElement('div');
        ph.className = 'poster-placeholder';
        ph.textContent = movie.title;
        card.appendChild(ph);
      };
      card.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'poster-placeholder';
      ph.textContent = movie.title;
      card.appendChild(ph);
    }

    card.addEventListener('click', () => openDetail(movie));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDetail(movie); });
    return card;
  }

  // ---------- Featured rendering ----------
  function renderFeatured(grid) {
    const SECTION_SIZE = 8;
    const MIN_GENRE_COUNT = 4;
    const sections = [];
    const usedIds = new Set();
    const data = activeData();
    const dateKey = currentMode === 'tv' ? 'firstAirDate' : 'releaseDate';
    const newestLabel = currentMode === 'tv' ? 'Newest Shows' : 'Newest Movies';

    // 1. Newest
    const newest = [...data].sort((a, b) => (b[dateKey] || '').localeCompare(a[dateKey] || '')).slice(0, SECTION_SIZE);
    if (newest.length) {
      sections.push({ title: newestLabel, items: newest });
      newest.forEach(m => usedIds.add(m.tmdbId));
    }

    // 2. Complete Sets (TV mode only)
    if (currentMode === 'tv') {
      const completeShows = data.filter(s => isCompleteSet(s) && !usedIds.has(s.tmdbId))
        .sort((a, b) => (b[dateKey] || '').localeCompare(a[dateKey] || ''))
        .slice(0, SECTION_SIZE);
      if (completeShows.length) {
        sections.push({ title: 'Complete Sets', items: completeShows });
        completeShows.forEach(m => usedIds.add(m.tmdbId));
      }
    }

    // 3. Highest Rated (only if user has rated at least one)
    const hasRatings = data.some(m => m.rating && m.rating > 0);
    if (hasRatings) {
      const topRated = [...data].filter(m => m.rating && m.rating > 0)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b[dateKey] || '').localeCompare(a[dateKey] || ''))
        .filter(m => !usedIds.has(m.tmdbId))
        .slice(0, SECTION_SIZE);
      if (topRated.length) {
        sections.push({ title: 'Highest Rated', items: topRated });
        topRated.forEach(m => usedIds.add(m.tmdbId));
      }
    }

    // 4. Genre sections
    const genreCounts = {};
    data.forEach(m => {
      (m.genres || []).forEach(g => {
        if (!genreCounts[g]) genreCounts[g] = [];
        genreCounts[g].push(m);
      });
    });
    // Sort genres by count descending so the biggest categories come first
    const sortedGenres = Object.entries(genreCounts)
      .filter(([, arr]) => arr.length >= MIN_GENRE_COUNT)
      .sort((a, b) => b[1].length - a[1].length);

    sortedGenres.forEach(([genre, genreItems]) => {
      const picks = genreItems
        .filter(m => !usedIds.has(m.tmdbId))
        .sort((a, b) => (b[dateKey] || '').localeCompare(a[dateKey] || ''))
        .slice(0, SECTION_SIZE);
      if (picks.length >= MIN_GENRE_COUNT) {
        sections.push({ title: genre, items: picks });
        picks.forEach(m => usedIds.add(m.tmdbId));
      }
    });

    if (sections.length === 0) {
      grid.innerHTML = `<div class="text-center text-secondary py-5 w-100" style="grid-column:1/-1;">${noFeaturedLabel()}</div>`;
      return;
    }

    const isMobile = window.innerWidth < 768;

    // Collect all featured movies in order
    const allFeatured = [];
    sections.forEach(s => allFeatured.push(...s.items));

    if (isMobile) {
      // Mobile: staggered two-column layout — split into left/right columns
      grid.classList.add('featured-mobile');
      const leftCol = document.createElement('div');
      leftCol.className = 'featured-col featured-col-left';
      const rightCol = document.createElement('div');
      rightCol.className = 'featured-col featured-col-right';

      allFeatured.forEach((movie, i) => {
        const card = buildPosterCard(movie);
        if (i % 2 === 0) leftCol.appendChild(card);
        else rightCol.appendChild(card);
      });

      grid.appendChild(leftCol);
      grid.appendChild(rightCol);
    } else {
      // Desktop: sectioned rows with headings
      grid.classList.remove('featured-mobile');
      sections.forEach(section => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'featured-section';

        const heading = document.createElement('h3');
        heading.className = 'featured-section-title';
        heading.textContent = section.title;
        sectionEl.appendChild(heading);

        const row = document.createElement('div');
        row.className = 'featured-row';
        section.items.forEach(movie => {
          row.appendChild(buildPosterCard(movie));
        });
        sectionEl.appendChild(row);
        grid.appendChild(sectionEl);
      });
    }
  }

  // ---------- Detail view ----------
  function openDetail(movie) {
    if (window.innerWidth < 768) openFullScreen(movie);
    else openModal(movie);
  }

  function buildStars(rating) {
    if (!rating || rating <= 0) return '<span class="text-secondary" style="font-size:.85rem">Not rated</span>';
    let html = '';
    for (let i = 1; i <= 5; i++) {
      if (rating >= i) html += '<span class="star filled">★</span>';
      else if (rating >= i - 0.5) html += '<span class="star half">★</span>';
      else html += '<span class="star empty">★</span>';
    }
    return html;
  }

  function buildGenreTags(movie) {
    if (!movie.genres || movie.genres.length === 0) return '';
    return movie.genres.map(g => `<span class="genre-tag">${g}</span>`).join('');
  }

  function buildCredits(movie) {
    let html = '';
    if (movie.director) html += `<p class="detail-credits-line"><span class="credits-label">Director</span> ${movie.director}</p>`;
    if (movie.creator) html += `<p class="detail-credits-line"><span class="credits-label">Creator</span> ${movie.creator}</p>`;
    if (movie.cast?.length > 0) html += `<p class="detail-credits-line"><span class="credits-label">Cast</span> ${movie.cast.join(', ')}</p>`;
    if (movie.totalSeasons) html += `<p class="detail-credits-line"><span class="credits-label">Seasons</span> ${movie.totalSeasons}</p>`;
    return html;
  }

  function buildFormatBadges(movie) {
    if (!movie.formats) return '';
    const dq = movie.digitalQuality || [];
    const qbHtml = dq.map(q => `<span class="quality-badge quality-${q.toLowerCase()}">${q}</span>`).join(' ');

    let physicalHtml = '';
    (movie.formats.physical || []).forEach(f => {
      const meta = FORMAT_META[f];
      if (!meta) return;
      physicalHtml += `<span class="format-badge" data-bs-toggle="tooltip" data-bs-title="${meta.label}"><img src="${meta.logo}" alt="${meta.label}"></span>`;
    });

    let digitalHtml = '';
    const title = encodeURIComponent(movie.title || '');
    const slug = (movie.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    (movie.formats.digital || []).forEach(f => {
      const meta = FORMAT_META[f];
      if (!meta) return;
      if (meta.url) {
        const href = meta.url.replace('{q}', title).replace('{slug}', slug);
        digitalHtml += `<a class="format-badge format-badge-link" href="${href}" target="_blank" rel="noopener" data-bs-toggle="tooltip" data-bs-title="${meta.label}"><img src="${meta.logo}" alt="${meta.label}"></a>`;
      } else {
        digitalHtml += `<span class="format-badge" data-bs-toggle="tooltip" data-bs-title="${meta.label}"><img src="${meta.logo}" alt="${meta.label}"></span>`;
      }
    });
    if (qbHtml) digitalHtml += `<span class="format-badge">${qbHtml}</span>`;

    let html = '';
    if (physicalHtml) {
      html += `<div class="format-section"><span class="format-section-label">Physical</span><div class="format-badges">${physicalHtml}</div></div>`;
    }
    if (digitalHtml) {
      html += `<div class="format-section"><span class="format-section-label">Digital</span><div class="format-badges">${digitalHtml}</div></div>`;
    }
    return html;
  }

  function buildTags(movie) {
    const items = [...(movie.tags || [])];
    (config.customFields || []).forEach(f => {
      if (movie.customTags && movie.customTags[f]) items.push(f);
    });
    if (items.length === 0) return '';
    return '<div class="movie-tags">' + items.map(t => `<span class="movie-tag">${t}</span>`).join('') + '</div>';
  }

  // ---------- TV Show Seasons / Box Set rendering ----------
  function formatBadgeHtml(key, title) {
    const meta = FORMAT_META[key];
    if (!meta) return `<span class="format-badge">${key}</span>`;
    const encodedTitle = encodeURIComponent(title || '');
    const slug = (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (meta.url) {
      const href = meta.url.replace('{q}', encodedTitle).replace('{slug}', slug);
      return `<a class="format-badge format-badge-link" href="${href}" target="_blank" rel="noopener" data-bs-toggle="tooltip" data-bs-title="${meta.label}"><img src="${meta.logo}" alt="${meta.label}"></a>`;
    }
    return `<span class="format-badge" data-bs-toggle="tooltip" data-bs-title="${meta.label}"><img src="${meta.logo}" alt="${meta.label}"></span>`;
  }

  function buildSeasons(show) {
    if (currentMode !== 'tv') return '';

    const hasBoxSet = show.boxSet && (show.boxSet.physical || (show.boxSet.digital && show.boxSet.digital.length > 0));

    let html = '<div class="seasons-section">';
    html += '<div class="seasons-section-title">Availability</div>';

    if (hasBoxSet) {
      // Box Set display
      html += '<div class="box-set-badge">';
      html += '<span>Box Set</span>';
      if (show.boxSet.physical) {
        html += `<span class="season-divider"></span>`;
        html += formatBadgeHtml(show.boxSet.physical, show.title);
      }
      if (show.boxSet.digital && show.boxSet.digital.length > 0) {
        html += `<span class="season-divider"></span>`;
        show.boxSet.digital.forEach(f => {
          html += formatBadgeHtml(f, show.title);
        });
      }
      html += '</div>';
    }

    // Per-season breakdown (show alongside or instead of box set)
    const seasons = show.seasons || [];
    if (seasons.length > 0) {
      html += '<div class="seasons-list">';
      // Build lookup of defined seasons
      const seasonMap = {};
      seasons.forEach(s => { seasonMap[s.seasonNumber] = s; });

      for (let i = 1; i <= (show.totalSeasons || seasons.length); i++) {
        const s = seasonMap[i];

        const hasPhysical = s && s.physical;
        const hasDigital = s && s.digital && s.digital.length > 0;

        // Hide seasons that are not owned
        if (!hasPhysical && !hasDigital) continue;

        html += '<div class="season-row">';
        html += `<span class="season-label">S${i}</span>`;
        html += '<span class="season-formats">';

        {
          if (hasPhysical) {
            html += '<span class="season-format-group">';
            html += formatBadgeHtml(s.physical, show.title);
            html += '</span>';
          }
          if (hasPhysical && hasDigital) {
            html += '<span class="season-divider"></span>';
          }
          if (hasDigital) {
            html += '<span class="season-format-group">';
            s.digital.forEach(f => {
              html += formatBadgeHtml(f, show.title);
            });
            html += '</span>';
          }
        }

        html += '</span></div>';
      }
      html += '</div>';
    } else if (!hasBoxSet) {
      html += '<div class="season-not-owned-msg">No seasons owned</div>';
    }

    html += '</div>';
    return html;
  }

  function populateDetail(prefix, movie) {
    document.getElementById(`${prefix}-title`).textContent = movie.title || '';
    // Date: use firstAirDate for TV, releaseDate for movies
    const dateVal = movie.firstAirDate || movie.releaseDate;
    const dateLabel = currentMode === 'tv' ? 'First Aired' : 'Release';
    document.getElementById(`${prefix}-date`).textContent = dateVal ? `${dateLabel}: ${dateVal}` : '';
    document.getElementById(`${prefix}-rating`).innerHTML = buildStars(movie.rating);
    document.getElementById(`${prefix}-genres`).innerHTML = buildGenreTags(movie);
    document.getElementById(`${prefix}-credits`).innerHTML = buildCredits(movie);
    document.getElementById(`${prefix}-overview`).textContent = movie.overview || '';
    document.getElementById(`${prefix}-formats`).innerHTML = buildFormatBadges(movie);
    document.getElementById(`${prefix}-formats`).querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
    // Seasons (TV only)
    const seasonsEl = document.getElementById(`${prefix}-seasons`);
    if (seasonsEl) {
      seasonsEl.innerHTML = buildSeasons(movie);
      seasonsEl.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
    }
    document.getElementById(`${prefix}-tags`).innerHTML = buildTags(movie);
    const posterImg = document.getElementById(`${prefix}-poster`);
    const src = posterUrl(movie);
    posterImg.src = src || '';
    posterImg.alt = movie.title;
    posterImg.style.display = src ? 'block' : 'none';

    // Fullscreen-specific: set blurred BG + full poster for overlay
    if (prefix === 'fs') {
      const bg = document.getElementById('fs-bg');
      if (bg) bg.style.backgroundImage = src ? `url('${src}')` : 'none';
      const fullImg = document.getElementById('fs-poster-full');
      if (fullImg) { fullImg.src = src || ''; fullImg.alt = movie.title; }
    }
  }

  function openModal(movie) {
    const el = document.getElementById('detailModal');
    if (!el) return;
    populateDetail('detail', movie);
    const modal = new bootstrap.Modal(el);
    modal.show();
    pushDetailState();

    // When Bootstrap hides the modal (X button, backdrop click, Esc),
    // pop the history entry so the URL stays clean.
    el.addEventListener('hidden.bs.modal', function onHidden() {
      el.removeEventListener('hidden.bs.modal', onHidden);
      popDetailState();
    });
  }

  function openFullScreen(movie) {
    const fs = document.getElementById('detail-fullscreen');
    if (!fs) return;
    populateDetail('fs', movie);
    fs.classList.add('open');
    document.body.style.overflow = 'hidden';
    pushDetailState();
  }

  function closeFullScreen() {
    const fs = document.getElementById('detail-fullscreen');
    if (fs) fs.classList.remove('open');
    // Also close poster overlay if open
    const overlay = document.getElementById('fs-poster-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    popDetailState();
  }

  // ---------- Poster hero: tap to expand / collapse ----------
  function bindPosterHero() {
    const hero = document.getElementById('fs-poster-hero');
    const overlay = document.getElementById('fs-poster-overlay');
    if (!hero || !overlay) return;

    hero.addEventListener('click', () => {
      overlay.classList.add('open');
    });

    overlay.addEventListener('click', () => {
      overlay.classList.remove('open');
    });
  }

  // ---------- History / back-button support ----------
  function pushDetailState() {
    if (!detailOpen) {
      detailOpen = true;
      history.pushState({ detailOpen: true }, '');
    }
  }

  function popDetailState() {
    if (detailOpen) {
      detailOpen = false;
      if (!closingViaBack) {
        // Closed via UI (button / backdrop) — remove the history entry we pushed
        history.back();
      }
    }
  }

  function bindHistoryNav() {
    window.addEventListener('popstate', () => {
      if (!detailOpen) return;

      closingViaBack = true;

      // Close Bootstrap modal if visible
      const modalEl = document.getElementById('detailModal');
      const modalInstance = modalEl && bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      // Close fullscreen overlay if visible
      const fs = document.getElementById('detail-fullscreen');
      if (fs && fs.classList.contains('open')) {
        fs.classList.remove('open');
        document.body.style.overflow = '';
      }
      // Close poster overlay too
      const posterOverlay = document.getElementById('fs-poster-overlay');
      if (posterOverlay) posterOverlay.classList.remove('open');

      detailOpen = false;
      closingViaBack = false;
    });
  }

  // ---------- Liquid Glass UI (all screen sizes) ----------
  function initMobileUI() {
    const filterBar = document.getElementById('meFilterBar');
    const activeFilterPill = document.getElementById('activeFilterPill');
    const sortBubble = document.getElementById('sortBubble');
    const searchWrap = document.getElementById('meSearch');
    const searchCollapsedBtn = document.getElementById('meSearchCollapsed');
    const mobileSearchBox = document.getElementById('mobile-search-box');

    // ---- Sort Bubble: tap to expand, select to collapse ----
    if (sortBubble) {
      sortBubble.addEventListener('click', (e) => {
        const btn = e.target.closest('.me-sort-btn');
        if (!btn) return;

        if (!sortBubble.classList.contains('expanded')) {
          // Collapsed → expand to reveal options
          sortBubble.classList.add('expanded');
          e.stopPropagation();
          return;
        }

        // Expanded → pick this sort & collapse
        const sortKey = btn.dataset.sort;
        currentSort = sortKey;
        sortBubble.querySelectorAll('.me-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sortBubble.classList.remove('expanded');

        // Sync desktop sort buttons
        const desktopBtns = document.getElementById('sort-buttons');
        if (desktopBtns) {
          desktopBtns.querySelectorAll('.btn').forEach(b => {
            b.className = 'btn btn-sm ' + (b.dataset.sort === sortKey ? 'btn-light' : 'btn-outline-light');
          });
        }
        renderGrid();
      });

      // Close sort bubble on outside tap
      document.addEventListener('click', (e) => {
        if (sortBubble.classList.contains('expanded') && !sortBubble.contains(e.target)) {
          sortBubble.classList.remove('expanded');
        }
      });
    }

    // ---- Search: expand / collapse ----
    let searchHasInput = false;

    function expandSearch() {
      if (!searchWrap) return;
      searchWrap.classList.remove('collapsed');
    }

    function collapseSearch() {
      if (!searchWrap || searchHasInput) return;
      searchWrap.classList.add('collapsed');
      mobileSearchBox?.blur();
    }

    if (searchCollapsedBtn) {
      searchCollapsedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expandSearch();
        setTimeout(() => mobileSearchBox?.focus(), 350);
      });
    }

    // Focus search / clear on click of submit button
    const searchSubmitBtn = document.querySelector('.me-search-submit');
    const searchSubmitIcon = searchSubmitBtn?.querySelector('i');

    function updateSearchIcon() {
      if (!searchSubmitBtn || !searchSubmitIcon) return;
      const hasText = mobileSearchBox && mobileSearchBox.value.trim().length > 0;
      if (hasText) {
        searchSubmitIcon.className = 'bi bi-x-lg';
        searchSubmitBtn.classList.add('clear-mode');
      } else {
        searchSubmitIcon.className = 'bi bi-search';
        searchSubmitBtn.classList.remove('clear-mode');
      }
    }

    if (searchSubmitBtn && mobileSearchBox) {
      searchSubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (mobileSearchBox.value.trim().length > 0) {
          // Clear search
          mobileSearchBox.value = '';
          searchHasInput = false;
          searchQuery = '';
          const desktopInput = document.getElementById('search-box');
          if (desktopInput) desktopInput.value = '';
          updateSearchIcon();
          renderGrid();
          mobileSearchBox.focus();
        } else {
          mobileSearchBox.focus();
        }
      });
    }

    if (mobileSearchBox) {
      mobileSearchBox.addEventListener('input', () => {
        searchHasInput = mobileSearchBox.value.trim().length > 0;
        updateSearchIcon();
      });
      // When search loses focus and is empty, reset scroll state so UI normalises
      mobileSearchBox.addEventListener('blur', () => {
        if (!mobileSearchBox.value.trim()) {
          searchHasInput = false;
          const scrollY = window.scrollY;
          if (scrollY <= 10 && isScrolled) {
            isScrolled = false;
            if (filterBar) filterBar.classList.remove('hidden');
            if (activeFilterPill) activeFilterPill.classList.remove('visible');
            expandSearch();
          }
        }
      });
    }

    // ---- Scroll handler: filter bar, active pill, search ----
    let scrollTicking = false;
    let isScrolled = false;

    window.addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        scrollTicking = false;
        const scrollY = window.scrollY;
        const searchFocused = document.activeElement === mobileSearchBox ||
                              document.activeElement === document.getElementById('search-box');

        if (scrollY > 40 && !isScrolled) {
          // Entered scrolled state
          isScrolled = true;
          if (filterBar) filterBar.classList.add('hidden');
          if (activeFilterPill) activeFilterPill.classList.add('visible');
          if (!searchFocused) collapseSearch();
          // Close sort bubble on scroll
          if (sortBubble) sortBubble.classList.remove('expanded');
          // Hide mode toggle on mobile
          const modeToggle = document.querySelector('.me-mode-toggle');
          if (modeToggle) modeToggle.classList.add('scroll-hidden');
        } else if (scrollY <= 10 && isScrolled) {
          // Returned to top — but not while user is actively searching
          if (searchFocused || searchHasInput) return;
          isScrolled = false;
          if (filterBar) filterBar.classList.remove('hidden');
          if (activeFilterPill) activeFilterPill.classList.remove('visible');
          expandSearch();
          // Show mode toggle again
          const modeToggle = document.querySelector('.me-mode-toggle');
          if (modeToggle) modeToggle.classList.remove('scroll-hidden');
        } else if (isScrolled && !searchHasInput && !searchFocused) {
          // Re-collapse search if user scrolls without typing
          collapseSearch();
        }
      });
    }, { passive: true });
  }

  return { init, closeFullScreen, resetAll, FORMAT_META };
})();

document.addEventListener('DOMContentLoaded', App.init);
