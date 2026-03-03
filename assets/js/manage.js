/* ============================================================
   Movies Everywhere — manage.js
   Admin page: TMDB search, add / edit / delete, save JSON
   ============================================================ */

const Manage = (() => {
  'use strict';

  const FORMAT_META = {
    'VCD':             { category: 'physical', label: 'VCD' },
    'DVD':             { category: 'physical', label: 'DVD' },
    'Blu-Ray':         { category: 'physical', label: 'Blu-Ray' },
    'UHD Blu-Ray':     { category: 'physical', label: 'UHD Blu-Ray' },
    '3D DVD':          { category: 'physical', label: '3D DVD' },
    '3D Blu-Ray':      { category: 'physical', label: '3D Blu-Ray' },
    'Apple TV':        { category: 'digital',  label: 'Apple TV' },
    'YouTube':         { category: 'digital',  label: 'YouTube' },
    'Google Play':     { category: 'digital',  label: 'Google Play' },
    'Fandango At Home':{ category: 'digital',  label: 'Fandango At Home' },
    'Xfinity':         { category: 'digital',  label: 'Xfinity' },
    'Verizon':         { category: 'digital',  label: 'Verizon' },
    'DirecTV':         { category: 'digital',  label: 'DirecTV' },
    'Prime Video':     { category: 'digital',  label: 'Prime Video' },
    'Plex':            { category: 'digital',  label: 'Plex' },
  };

  let movies = [];
  let tvShows = [];
  let config = {};
  let editIndex = -1;
  let debounceTimer = null;
  let genreMap = {};
  let tvGenreMap = {};
  let currentRating = 0;
  let currentTags = [];
  let manageMode = 'movies'; // 'movies' | 'tv'

  // ---------- Init ----------
  async function init() {
    try {
      const fetches = [
        fetch('data/config.json').then(r => r.json()),
        fetch('data/movies.json').then(r => r.json()),
        fetch('data/tvshows.json').then(r => { if (!r.ok) throw new Error('no tv'); return r.json(); }).catch(() => []),
      ];
      [config, movies, tvShows] = await Promise.all(fetches);
    } catch (e) {
      console.error('Failed to load data:', e);
      movies = [];
      tvShows = [];
      config = {};
    }
    await loadGenreMap();
    renderCustomFieldCheckboxes();
    bindModeTab();
    renderTable();
    bindSearch();
    bindForm();
    bindStarPicker();
    bindTagInput();
    bindSeasonsBuilder();
    updateCount();
  }

  // ---------- Mode tabs ----------
  function bindModeTab() {
    const tabContainer = document.getElementById('manageModeTab');
    if (!tabContainer) return;
    if (config.tvShows) {
      tabContainer.style.display = '';
    } else {
      tabContainer.style.display = 'none';
      return;
    }
    tabContainer.querySelectorAll('[data-manage-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.manageMode;
        if (mode === manageMode) return;
        manageMode = mode;
        tabContainer.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        resetForm();
        renderTable();
        updateCount();
        toggleTvFields();
      });
    });
  }

  function toggleTvFields() {
    const tvSection = document.getElementById('tv-seasons-section');
    const movieFormats = document.querySelector('.format-checks')?.closest('.col-12');
    const heading = document.getElementById('form-heading');
    const searchInput = document.getElementById('search-input');
    const submitBtn = document.getElementById('btn-submit');

    if (manageMode === 'tv') {
      if (tvSection) tvSection.style.display = '';
      // Hide movie-specific format checkboxes
      if (movieFormats) movieFormats.style.display = 'none';
      if (heading) heading.textContent = editIndex >= 0 ? 'Edit TV Show' : 'Add TV Show';
      if (searchInput) searchInput.placeholder = 'Type a TV show title\u2026';
      if (submitBtn) submitBtn.textContent = editIndex >= 0 ? 'Update TV Show' : 'Add TV Show';
    } else {
      if (tvSection) tvSection.style.display = 'none';
      if (movieFormats) movieFormats.style.display = '';
      if (heading) heading.textContent = editIndex >= 0 ? 'Edit Movie' : 'Add Movie';
      if (searchInput) searchInput.placeholder = 'Type a movie title\u2026';
      if (submitBtn) submitBtn.textContent = editIndex >= 0 ? 'Update Movie' : 'Add Movie';
    }
  }

  // ---------- Custom field checkboxes ----------
  function renderCustomFieldCheckboxes() {
    const container = document.getElementById('custom-field-checks');
    if (!container) return;
    container.innerHTML = '';
    const fields = config.customFields || [];
    if (fields.length === 0) {
      container.innerHTML = '<span class="text-secondary" style="font-size:.8rem">None configured. Add fields in config.json</span>';
      return;
    }
    fields.forEach(f => {
      const id = `cf-${f.replace(/\s+/g, '-').toLowerCase()}`;
      const div = document.createElement('div');
      div.className = 'form-check';
      div.innerHTML = `<input class="form-check-input custom-field-cb" type="checkbox" value="${f}" id="${id}"><label class="form-check-label" for="${id}">${f}</label>`;
      container.appendChild(div);
    });
  }

  // ---------- Table ----------
  function renderTable() {
    const body = document.getElementById('movies-tbody');
    if (!body) return;
    body.innerHTML = '';

    if (movies.length === 0) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-secondary">No movies yet. Use the form above to add titles.</td></tr>';
      return;
    }

    movies.forEach((m, i) => {
      const formats = [...(m.formats?.physical || []), ...(m.formats?.digital || [])].join(', ');
      const stars = m.rating ? '★'.repeat(Math.floor(m.rating)) + (m.rating % 1 ? '½' : '') : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${m.tmdbId || ''}</td>
        <td>${escHtml(m.title)}</td>
        <td>${m.releaseDate || ''}</td>
        <td style="font-size:.82rem">${stars}</td>
        <td style="font-size:.82rem">${escHtml(formats)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-light me-1" data-edit="${i}" title="Edit">✏️</button>
          <button class="btn btn-sm btn-outline-danger" data-delete="${i}" title="Delete">🗑️</button>
        </td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => startEdit(parseInt(btn.dataset.edit)));
    });
    body.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteMovie(parseInt(btn.dataset.delete)));
    });
  }

  function updateCount() {
    const el = document.getElementById('movie-count');
    const data = manageMode === 'tv' ? tvShows : movies;
    const label = manageMode === 'tv' ? 'show' : 'title';
    if (el) el.textContent = `${data.length} ${label}${data.length !== 1 ? 's' : ''}`;
  }

  // ---------- Genre map ----------
  async function loadGenreMap() {
    if (!config.tmdbApiKey || config.tmdbApiKey === 'YOUR_TMDB_API_KEY_HERE') return;
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${encodeURIComponent(config.tmdbApiKey)}&language=en-US`),
        fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${encodeURIComponent(config.tmdbApiKey)}&language=en-US`),
      ]);
      const movieData = await movieRes.json();
      const tvData = await tvRes.json();
      (movieData.genres || []).forEach(g => { genreMap[g.id] = g.name; });
      (tvData.genres || []).forEach(g => { tvGenreMap[g.id] = g.name; });
    } catch (e) { console.warn('Could not load genre list:', e); }
  }

  // ---------- TMDB Search ----------
  function bindSearch() {
    const input = document.getElementById('search-input');
    const list = document.getElementById('tmdb-results');
    if (!input || !list) return;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) { list.innerHTML = ''; list.style.display = 'none'; return; }
      debounceTimer = setTimeout(() => searchTmdb(q), 350);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-wrapper')) list.style.display = 'none';
    });
  }

  async function searchTmdb(query) {
    const list = document.getElementById('tmdb-results');
    if (!config.tmdbApiKey || config.tmdbApiKey === 'YOUR_TMDB_API_KEY_HERE') {
      list.innerHTML = '<li class="text-warning px-3 py-2">Set your TMDB API key in data/config.json</li>';
      list.style.display = 'block';
      return;
    }
    try {
      const endpoint = manageMode === 'tv' ? 'search/tv' : 'search/movie';
      const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${encodeURIComponent(config.tmdbApiKey)}&query=${encodeURIComponent(query)}&include_adult=false`;
      const res = await fetch(url);
      const data = await res.json();
      renderSearchResults(data.results || []);
    } catch (err) {
      console.error('TMDB search error:', err);
      list.innerHTML = '<li class="text-danger px-3 py-2">API error — check console</li>';
      list.style.display = 'block';
    }
  }

  function renderSearchResults(results) {
    const list = document.getElementById('tmdb-results');
    list.innerHTML = '';
    if (results.length === 0) {
      list.innerHTML = '<li class="text-secondary px-3 py-2">No results found</li>';
      list.style.display = 'block';
      return;
    }
    const imgBase = config.tmdbImageBase || 'https://image.tmdb.org/t/p/w500';
    results.slice(0, 10).forEach(r => {
      const title = r.title || r.name || '';
      const date = r.release_date || r.first_air_date || '';
      const year = date ? date.substring(0, 4) : '—';
      const thumb = r.poster_path ? `${imgBase}${r.poster_path}` : '';
      const li = document.createElement('li');
      li.innerHTML = `
        ${thumb ? `<img src="${thumb}" alt="">` : '<span style="width:32px;height:48px;display:inline-block;background:#333;border-radius:3px;flex-shrink:0;"></span>'}
        <span><span class="result-title">${escHtml(title)}</span> <span class="result-year">(${year})</span></span>`;
      li.addEventListener('click', () => selectResult(r));
      list.appendChild(li);
    });
    list.style.display = 'block';
  }

  async function selectResult(r) {
    const title = r.title || r.name || '';
    document.getElementById('search-input').value = title;
    document.getElementById('tmdb-results').style.display = 'none';

    document.getElementById('field-tmdbId').value = r.id || '';
    document.getElementById('field-title').value = title;
    document.getElementById('field-overview').value = r.overview || '';
    document.getElementById('field-posterPath').value = r.poster_path || '';

    if (manageMode === 'tv') {
      document.getElementById('field-releaseDate').value = r.first_air_date || '';
      const genres = (r.genre_ids || []).slice(0, 3).map(id => tvGenreMap[id] || genreMap[id]).filter(Boolean);
      document.getElementById('field-genres').value = genres.join(', ');
      await fetchTvDetails(r.id);
    } else {
      document.getElementById('field-releaseDate').value = r.release_date || '';
      const genres = (r.genre_ids || []).slice(0, 3).map(id => genreMap[id]).filter(Boolean);
      document.getElementById('field-genres').value = genres.join(', ');
      await fetchCredits(r.id);
    }
  }

  async function fetchTvDetails(tmdbId) {
    document.getElementById('field-creator').value = '';
    document.getElementById('field-cast').value = '';
    document.getElementById('field-director').value = '';
    if (!config.tmdbApiKey || config.tmdbApiKey === 'YOUR_TMDB_API_KEY_HERE' || !tmdbId) return;
    try {
      const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${encodeURIComponent(config.tmdbApiKey)}&append_to_response=credits`;
      const res = await fetch(url);
      const data = await res.json();
      const creators = (data.created_by || []).map(c => c.name);
      document.getElementById('field-creator').value = creators.join(', ');
      const topCast = (data.credits?.cast || []).slice(0, 3).map(c => c.name);
      document.getElementById('field-cast').value = topCast.join(', ');
      if (data.number_of_seasons) {
        document.getElementById('field-totalSeasons').value = data.number_of_seasons;
        buildSeasonsUI(data.number_of_seasons);
      }
    } catch (e) { console.warn('Could not fetch TV details:', e); }
  }

  async function fetchCredits(tmdbId) {
    document.getElementById('field-director').value = '';
    document.getElementById('field-cast').value = '';
    if (!config.tmdbApiKey || config.tmdbApiKey === 'YOUR_TMDB_API_KEY_HERE' || !tmdbId) return;
    try {
      const url = `https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${encodeURIComponent(config.tmdbApiKey)}`;
      const res = await fetch(url);
      const data = await res.json();
      const director = (data.crew || []).find(c => c.job === 'Director');
      document.getElementById('field-director').value = director ? director.name : '';
      const topCast = (data.cast || []).slice(0, 3).map(c => c.name);
      document.getElementById('field-cast').value = topCast.join(', ');
    } catch (e) { console.warn('Could not fetch credits:', e); }
  }

  // ---------- Star rating picker ----------
  function bindStarPicker() {
    const container = document.getElementById('star-picker');
    if (!container) return;
    renderStarPicker();

    container.addEventListener('click', (e) => {
      const star = e.target.closest('[data-value]');
      if (!star) return;
      const rect = star.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const isHalf = x < rect.width / 2;
      const val = parseFloat(star.dataset.value);
      currentRating = isHalf ? val - 0.5 : val;
      if (currentRating <= 0) currentRating = 0.5;
      renderStarPicker();
    });

    // Double-click to clear
    container.addEventListener('dblclick', () => {
      currentRating = 0;
      renderStarPicker();
    });
  }

  function renderStarPicker() {
    const container = document.getElementById('star-picker');
    if (!container) return;
    let html = '';
    for (let i = 1; i <= 5; i++) {
      let cls = 'star-pick empty';
      if (currentRating >= i) cls = 'star-pick filled';
      else if (currentRating >= i - 0.5) cls = 'star-pick half';
      html += `<span class="${cls}" data-value="${i}">★</span>`;
    }
    html += `<span class="text-secondary ms-2" style="font-size:.8rem">${currentRating > 0 ? currentRating + '/5' : 'Click to rate, double-click to clear'}</span>`;
    container.innerHTML = html;
  }

  // ---------- Tag input ----------
  function bindTagInput() {
    const input = document.getElementById('tag-input');
    const btn = document.getElementById('tag-add-btn');
    if (!input) return;

    const addTag = () => {
      const val = input.value.trim();
      if (val && !currentTags.includes(val)) {
        currentTags.push(val);
        renderTags();
      }
      input.value = '';
    };

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
    btn?.addEventListener('click', addTag);
  }

  function renderTags() {
    const container = document.getElementById('tag-list');
    if (!container) return;
    container.innerHTML = currentTags.map((t, i) =>
      `<span class="movie-tag">${escHtml(t)} <button type="button" class="btn-close btn-close-white" style="font-size:.5rem;vertical-align:middle" data-remove-tag="${i}"></button></span>`
    ).join('');

    container.querySelectorAll('[data-remove-tag]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTags.splice(parseInt(btn.dataset.removeTag), 1);
        renderTags();
      });
    });
  }

  // ---------- Form ----------
  function bindForm() {
    const form = document.getElementById('movie-form');
    if (!form) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); saveFromForm(); });
    document.getElementById('btn-cancel')?.addEventListener('click', resetForm);
  }

  function saveFromForm() {
    const title = document.getElementById('field-title').value.trim();
    if (!title) { alert('Title is required'); return; }

    if (manageMode === 'tv') {
      saveTvShow();
    } else {
      saveMovie();
    }
  }

  function saveMovie() {
    const movie = {
      tmdbId: parseInt(document.getElementById('field-tmdbId').value) || 0,
      title: document.getElementById('field-title').value.trim(),
      releaseDate: document.getElementById('field-releaseDate').value.trim(),
      overview: document.getElementById('field-overview').value.trim(),
      posterPath: document.getElementById('field-posterPath').value.trim(),
      genres: document.getElementById('field-genres').value.trim()
        ? document.getElementById('field-genres').value.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      director: document.getElementById('field-director').value.trim(),
      cast: document.getElementById('field-cast').value.trim()
        ? document.getElementById('field-cast').value.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      rating: currentRating,
      watched: document.getElementById('field-watched').checked,
      tags: [...currentTags],
      customTags: {},
      formats: { physical: [], digital: [] },
      digitalQuality: [],
    };

    // Collect checked formats
    document.querySelectorAll('#movie-form .format-cb:checked').forEach(cb => {
      const key = cb.value;
      const meta = FORMAT_META[key];
      if (meta) movie.formats[meta.category].push(key);
    });

    // Collect digital quality checkboxes
    document.querySelectorAll('#movie-form .dq-cb:checked').forEach(cb => {
      movie.digitalQuality.push(cb.value);
    });

    // Collect custom field checkboxes
    document.querySelectorAll('#custom-field-checks .custom-field-cb:checked').forEach(cb => {
      movie.customTags[cb.value] = true;
    });

    if (editIndex >= 0) {
      movies[editIndex] = movie;
    } else {
      if (movie.tmdbId && movies.some(m => m.tmdbId === movie.tmdbId)) {
        if (!confirm(`A movie with TMDB ID ${movie.tmdbId} already exists. Add anyway?`)) return;
      }
      movies.push(movie);
    }

    renderTable();
    updateCount();
    resetForm();
  }

  function saveTvShow() {
    const show = {
      tmdbId: parseInt(document.getElementById('field-tmdbId').value) || 0,
      title: document.getElementById('field-title').value.trim(),
      firstAirDate: document.getElementById('field-releaseDate').value.trim(),
      overview: document.getElementById('field-overview').value.trim(),
      posterPath: document.getElementById('field-posterPath').value.trim(),
      genres: document.getElementById('field-genres').value.trim()
        ? document.getElementById('field-genres').value.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      creator: document.getElementById('field-creator').value.trim(),
      cast: document.getElementById('field-cast').value.trim()
        ? document.getElementById('field-cast').value.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      rating: currentRating,
      watched: document.getElementById('field-watched').checked,
      tags: [...currentTags],
      customTags: {},
      totalSeasons: parseInt(document.getElementById('field-totalSeasons').value) || 1,
      seasons: collectSeasonsFromUI(),
      boxSet: collectBoxSetFromUI(),
    };

    // Collect custom field checkboxes
    document.querySelectorAll('#custom-field-checks .custom-field-cb:checked').forEach(cb => {
      show.customTags[cb.value] = true;
    });

    if (editIndex >= 0) {
      tvShows[editIndex] = show;
    } else {
      if (show.tmdbId && tvShows.some(s => s.tmdbId === show.tmdbId)) {
        if (!confirm(`A show with TMDB ID ${show.tmdbId} already exists. Add anyway?`)) return;
      }
      tvShows.push(show);
    }

    renderTable();
    updateCount();
    resetForm();
  }

  function collectSeasonsFromUI() {
    const rows = document.querySelectorAll('#seasons-builder .season-row-builder');
    const seasons = [];
    rows.forEach(row => {
      const num = parseInt(row.dataset.season);
      const physicalSelect = row.querySelector('.season-physical');
      const physical = physicalSelect?.value || null;
      const digitalCbs = row.querySelectorAll('.season-digital:checked');
      const digital = Array.from(digitalCbs).map(cb => cb.value);
      seasons.push({ seasonNumber: num, physical: physical || null, digital });
    });
    return seasons;
  }

  function collectBoxSetFromUI() {
    const physCb = document.getElementById('boxset-physical-cb');
    const physFmt = document.getElementById('boxset-physical-format');
    const digCb = document.getElementById('boxset-digital-cb');

    const physical = physCb?.checked && physFmt?.value ? physFmt.value : null;

    let digital = null;
    if (digCb?.checked) {
      const checked = document.querySelectorAll('#boxset-digital-formats .boxset-dig-cb:checked');
      digital = Array.from(checked).map(cb => cb.value);
      if (digital.length === 0) digital = null;
    }

    return { physical, digital };
  }

  // ---------- Seasons Builder UI ----------
  function bindSeasonsBuilder() {
    const btn = document.getElementById('btn-build-seasons');
    if (btn) {
      btn.addEventListener('click', () => {
        const total = parseInt(document.getElementById('field-totalSeasons').value) || 1;
        buildSeasonsUI(total);
      });
    }

    // Box set toggles
    const physCb = document.getElementById('boxset-physical-cb');
    const physFmt = document.getElementById('boxset-physical-format');
    if (physCb && physFmt) {
      physCb.addEventListener('change', () => {
        physFmt.style.display = physCb.checked ? 'inline-block' : 'none';
      });
    }

    const digCb = document.getElementById('boxset-digital-cb');
    const digFmts = document.getElementById('boxset-digital-formats');
    if (digCb && digFmts) {
      digCb.addEventListener('change', () => {
        if (digCb.checked) {
          digFmts.style.display = '';
          renderBoxSetDigitalOptions();
        } else {
          digFmts.style.display = 'none';
        }
      });
    }
  }

  function renderBoxSetDigitalOptions() {
    const container = document.getElementById('boxset-digital-formats');
    if (!container) return;
    container.innerHTML = '';
    const digitalFormats = Object.entries(FORMAT_META).filter(([, v]) => v.category === 'digital');
    digitalFormats.forEach(([key, meta]) => {
      const id = `boxset-dig-${key.replace(/\s+/g, '-').toLowerCase()}`;
      const div = document.createElement('div');
      div.className = 'form-check form-check-inline';
      div.innerHTML = `<input class="form-check-input boxset-dig-cb" type="checkbox" value="${key}" id="${id}"><label class="form-check-label" for="${id}" style="font-size:.82rem">${meta.label}</label>`;
      container.appendChild(div);
    });
  }

  const PHYSICAL_FORMATS = ['VCD', 'DVD', 'Blu-Ray', 'UHD Blu-Ray', '3D DVD', '3D Blu-Ray'];
  const DIGITAL_FORMATS = Object.keys(FORMAT_META).filter(k => FORMAT_META[k].category === 'digital');

  function buildSeasonsUI(total) {
    const container = document.getElementById('seasons-builder');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= total; i++) {
      const row = document.createElement('div');
      row.className = 'season-row-builder border rounded p-2 mb-2';
      row.dataset.season = i;

      let html = `<strong style="font-size:.85rem">Season ${i}</strong><div class="d-flex flex-wrap gap-3 mt-1">`;

      // Physical select
      html += `<div><span class="text-secondary" style="font-size:.75rem">Physical</span><br><select class="form-select form-select-sm season-physical" style="width:130px"><option value="">None</option>`;
      PHYSICAL_FORMATS.forEach(f => { html += `<option value="${f}">${f}</option>`; });
      html += `</select></div>`;

      // Digital checkboxes
      html += `<div><span class="text-secondary" style="font-size:.75rem">Digital</span><div class="d-flex flex-wrap gap-2 mt-1">`;
      DIGITAL_FORMATS.forEach(f => {
        const id = `s${i}-dig-${f.replace(/\s+/g, '-').toLowerCase()}`;
        html += `<div class="form-check form-check-inline"><input class="form-check-input season-digital" type="checkbox" value="${f}" id="${id}"><label class="form-check-label" for="${id}" style="font-size:.8rem">${FORMAT_META[f].label}</label></div>`;
      });
      html += `</div></div></div>`;

      row.innerHTML = html;
      container.appendChild(row);
    }
  }

  function populateSeasonsUI(show) {
    const total = show.totalSeasons || 0;
    if (total > 0) {
      document.getElementById('field-totalSeasons').value = total;
      buildSeasonsUI(total);

      // Fill in season data
      (show.seasons || []).forEach(s => {
        const row = document.querySelector(`#seasons-builder .season-row-builder[data-season="${s.seasonNumber}"]`);
        if (!row) return;
        if (s.physical) {
          const sel = row.querySelector('.season-physical');
          if (sel) sel.value = s.physical;
        }
        (s.digital || []).forEach(f => {
          const cb = row.querySelector(`.season-digital[value="${f}"]`);
          if (cb) cb.checked = true;
        });
      });
    }

    // Box set
    const bs = show.boxSet || {};
    if (bs.physical) {
      document.getElementById('boxset-physical-cb').checked = true;
      const fmt = document.getElementById('boxset-physical-format');
      fmt.style.display = 'inline-block';
      fmt.value = bs.physical;
    }
    if (bs.digital && bs.digital.length > 0) {
      document.getElementById('boxset-digital-cb').checked = true;
      const container = document.getElementById('boxset-digital-formats');
      container.style.display = '';
      renderBoxSetDigitalOptions();
      bs.digital.forEach(f => {
        const cb = container.querySelector(`.boxset-dig-cb[value="${f}"]`);
        if (cb) cb.checked = true;
      });
    }
  }

  function startEdit(index) {
    editIndex = index;
    const data = manageMode === 'tv' ? tvShows : movies;
    const m = data[index];
    document.getElementById('search-input').value = m.title;
    document.getElementById('field-tmdbId').value = m.tmdbId || '';
    document.getElementById('field-title').value = m.title || '';
    document.getElementById('field-releaseDate').value = m.firstAirDate || m.releaseDate || '';
    document.getElementById('field-overview').value = m.overview || '';
    document.getElementById('field-posterPath').value = m.posterPath || '';
    document.getElementById('field-genres').value = (m.genres || []).join(', ');
    document.getElementById('field-director').value = m.director || '';
    document.getElementById('field-creator').value = m.creator || '';
    document.getElementById('field-cast').value = (m.cast || []).join(', ');

    // Watched
    document.getElementById('field-watched').checked = !!m.watched;

    // Rating
    currentRating = m.rating || 0;
    renderStarPicker();

    // Tags
    currentTags = [...(m.tags || [])];
    renderTags();

    if (manageMode === 'tv') {
      toggleTvFields();
      populateSeasonsUI(m);
    } else {
      // Format checkboxes
      const allFormats = [...(m.formats?.physical || []), ...(m.formats?.digital || [])];
      document.querySelectorAll('#movie-form .format-cb').forEach(cb => {
        cb.checked = allFormats.includes(cb.value);
      });

      // Digital quality checkboxes
      const dq = m.digitalQuality || [];
      document.querySelectorAll('#movie-form .dq-cb').forEach(cb => {
        cb.checked = dq.includes(cb.value);
      });
    }

    // Custom fields
    const ct = m.customTags || {};
    document.querySelectorAll('#custom-field-checks .custom-field-cb').forEach(cb => {
      cb.checked = !!ct[cb.value];
    });

    const typeLabel = manageMode === 'tv' ? 'TV Show' : 'Movie';
    document.getElementById('form-heading').textContent = `Edit ${typeLabel}`;
    document.getElementById('btn-submit').textContent = `Update ${typeLabel}`;
    document.getElementById('btn-cancel').style.display = 'inline-block';
    document.getElementById('search-input').scrollIntoView({ behavior: 'smooth' });
  }

  function deleteMovie(index) {
    const data = manageMode === 'tv' ? tvShows : movies;
    const title = data[index]?.title || 'this title';
    if (!confirm(`Remove "${title}" from your library?`)) return;
    data.splice(index, 1);
    if (editIndex === index) resetForm();
    if (editIndex > index) editIndex--;
    renderTable();
    updateCount();
  }

  function resetForm() {
    editIndex = -1;
    document.getElementById('movie-form').reset();
    document.getElementById('field-tmdbId').value = '';
    document.getElementById('field-posterPath').value = '';
    document.getElementById('field-genres').value = '';
    document.getElementById('field-director').value = '';
    document.getElementById('field-cast').value = '';
    document.getElementById('field-creator').value = '';
    currentRating = 0;
    renderStarPicker();
    document.getElementById('field-watched').checked = false;
    currentTags = [];
    renderTags();
    // Reset quality checkboxes
    document.querySelectorAll('#movie-form .dq-cb').forEach(cb => { cb.checked = false; });
    // Reset custom fields
    document.querySelectorAll('#custom-field-checks .custom-field-cb').forEach(cb => { cb.checked = false; });
    // Reset seasons builder
    const seasonsBuilder = document.getElementById('seasons-builder');
    if (seasonsBuilder) seasonsBuilder.innerHTML = '';
    // Reset box set
    const physCb = document.getElementById('boxset-physical-cb');
    const physFmt = document.getElementById('boxset-physical-format');
    if (physCb) physCb.checked = false;
    if (physFmt) { physFmt.value = ''; physFmt.style.display = 'none'; }
    const digCb = document.getElementById('boxset-digital-cb');
    const digFmts = document.getElementById('boxset-digital-formats');
    if (digCb) digCb.checked = false;
    if (digFmts) { digFmts.innerHTML = ''; digFmts.style.display = 'none'; }

    toggleTvFields();
    document.getElementById('btn-cancel').style.display = 'none';
    document.getElementById('tmdb-results').style.display = 'none';
  }

  // ---------- Save / Export JSON ----------
  function exportJson() {
    if (manageMode === 'tv') {
      const json = JSON.stringify(tvShows, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tvshows.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const json = JSON.stringify(movies, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'movies.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  // ---------- Import JSON ----------
  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) { alert('Invalid format: expected a JSON array.'); return; }
        if (manageMode === 'tv') {
          tvShows = data;
        } else {
          movies = data;
        }
        renderTable();
        updateCount();
      } catch (e) { alert('Failed to parse JSON file.'); }
    });
    input.click();
  }

  // ---------- Helpers ----------
  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  return { init, exportJson, importJson };
})();

document.addEventListener('DOMContentLoaded', Manage.init);
