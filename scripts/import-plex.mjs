#!/usr/bin/env node
/**
 * Import Plex titles from CSV into movies.json
 * Usage: node scripts/import-plex.mjs [/path/to/plex.csv]
 *
 * CSV format: "Year"|"Title"|"TMDB ID"
 * Deduplicates by TMDB ID within the CSV and against the existing library.
 * Existing titles get "Plex" added to formats.digital; new titles are fetched
 * from the TMDB API.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CSV_PATH = process.argv[2] || resolve(import.meta.dirname, '../import/plex.csv');
const MOVIES_PATH = resolve(import.meta.dirname, '../data/movies.json');
const CONFIG_PATH = resolve(import.meta.dirname, '../data/config.json');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const API_KEY = config.tmdbApiKey;
const TMDB_BASE = 'https://api.themoviedb.org/3';

// --------------- helpers ---------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Parse a pipe-delimited, quoted CSV line: "val1"|"val2"|"val3" */
function parseLine(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('"')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('"')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('"|"');
}

/** Parse the Plex CSV; returns array of { title, tmdbId, year } deduped by TMDB ID */
function parseCsv(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  // Skip header
  const seen = new Set();
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    const year = parseInt(fields[0], 10) || 0;
    const title = (fields[1] || '').trim();
    const tmdbId = parseInt(fields[2], 10) || 0;

    if (!title || !tmdbId) continue;

    // Dedupe by TMDB ID (e.g. same movie with different editions)
    if (seen.has(tmdbId)) continue;
    seen.add(tmdbId);

    results.push({ title, tmdbId, year });
  }
  return results;
}

// --------------- TMDB API ---------------

async function tmdbDetails(id) {
  const params = new URLSearchParams({ api_key: API_KEY, append_to_response: 'credits' });
  const url = `${TMDB_BASE}/movie/${id}?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`TMDB details failed (${resp.status}): ${await resp.text()}`);
  return resp.json();
}

function buildMovieEntry(detail) {
  const director = (detail.credits?.crew || []).find(c => c.job === 'Director');
  const cast = (detail.credits?.cast || []).slice(0, 3).map(c => c.name);
  return {
    tmdbId: detail.id,
    title: detail.title,
    releaseDate: detail.release_date || '',
    overview: detail.overview || '',
    posterPath: detail.poster_path || '',
    genres: (detail.genres || []).map(g => g.name),
    director: director ? director.name : '',
    cast,
    rating: 0,
    tags: [],
    customTags: {},
    formats: {
      physical: [],
      digital: ['Plex'],
    },
    digitalQuality: [],
  };
}

// --------------- main ---------------

async function main() {
  console.log(`Reading CSV: ${CSV_PATH}`);
  const csvText = readFileSync(CSV_PATH, 'utf-8');
  const titles = parseCsv(csvText);
  console.log(`Found ${titles.length} unique titles in CSV.\n`);

  const movies = JSON.parse(readFileSync(MOVIES_PATH, 'utf-8'));
  const existingByTmdbId = new Map(movies.map(m => [m.tmdbId, m]));

  let added = 0, updated = 0, skipped = 0, failed = 0;
  const failures = [];

  for (let i = 0; i < titles.length; i++) {
    const { title, tmdbId } = titles[i];
    const progress = `[${i + 1}/${titles.length}]`;

    // ---- 1. Already in library? Just mark as available on Plex ----
    if (existingByTmdbId.has(tmdbId)) {
      const existing = existingByTmdbId.get(tmdbId);
      if (!existing.formats) existing.formats = { physical: [], digital: [] };
      if (!existing.formats.digital) existing.formats.digital = [];
      if (!existing.formats.digital.includes('Plex')) {
        existing.formats.digital.push('Plex');
        console.log(`${progress} ✓ Updated "${existing.title}" — added Plex`);
        updated++;
      } else {
        console.log(`${progress} — "${existing.title}" already has Plex`);
        skipped++;
      }
      continue;
    }

    // ---- 2. New title — fetch from TMDB by ID and add ----
    try {
      await sleep(80);
      const detail = await tmdbDetails(tmdbId);
      const entry = buildMovieEntry(detail);
      movies.push(entry);
      existingByTmdbId.set(entry.tmdbId, entry);
      console.log(`${progress} ✚ Added "${entry.title}" (TMDB ${entry.tmdbId})`);
      added++;
    } catch (err) {
      console.log(`${progress} ✗ ERROR for "${title}" (TMDB ${tmdbId}): ${err.message}`);
      failures.push(title);
      failed++;
    }
  }

  // Write back
  writeFileSync(MOVIES_PATH, JSON.stringify(movies, null, 2) + '\n', 'utf-8');

  console.log(`\n========== DONE ==========`);
  console.log(`Added:   ${added}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped} (already had Plex)`);
  console.log(`Failed:  ${failed}`);
  if (failures.length) {
    console.log(`\nFailed titles:`);
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log(`\nTotal movies in library: ${movies.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
