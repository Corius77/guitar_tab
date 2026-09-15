# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## App context

This is a **single-user personal app** (despite the multi-user data model). The owner uses it to practice guitar; there are no plans to ship it as SaaS. This influences design choices — JWT lifetimes are deliberately long (30d access / 5y refresh, no rotation), there is no password-reset flow, no email verification, no rate limiting. Don't add multi-tenant complexity unless explicitly asked.

The codebase has Polish-language comments and commit messages. User-facing strings are also Polish. Match this style for new code (informal, terse).

## Common commands

### Dev environment (Windows)
- `start.bat` from repo root — launches backend (Django runserver on `:8000`) and frontend (Vite on `:5173`) in two terminals.
- `stop.bat` — kills both by port.

### Backend (from `backend/`)
- `venv\Scripts\activate` (Windows) — activate the virtualenv. Many commands assume it's active.
- `python manage.py runserver` — dev server.
- `python manage.py makemigrations <app>` then `python manage.py migrate` — after model changes.
- `python manage.py check` — fast sanity check (no DB hit).
- `python manage.py createsuperuser` — for admin panel access at `/admin/`.

### Frontend (from `frontend/`)
- `npm run dev` — Vite dev server. Proxies `/api` and `/media` to `:8000` (see `vite.config.js`).
- `npm run build` — production build. Use this to verify changes compile (no separate typecheck step).
- `npm run lint` — ESLint. Note: the repo currently has pre-existing lint warnings (empty catch blocks, missing prop-types); don't treat the existing baseline as failures.

### Quick verify after a change
- Backend touched models or views: `python manage.py check && python manage.py migrate`.
- Frontend touched anything: `npm run build` (catches both syntax and import errors).

## Architecture

### Backend (Django 5 + DRF + SimpleJWT)

Three apps under `backend/apps/`:

- **`accounts`** — custom `User` model (`AUTH_USER_MODEL = 'accounts.User'`), JWT login/register/refresh/logout. Logout uses `RefreshToken.blacklist()`.
- **`songs`** — `Song` (Guitar Pro file upload via `tab_file` FileField, validated extensions), `Genre`, `SongVideo`. Filters/ordering via `django-filter`. Songs are uploaded to `media/songs/{slug}.{ext}`.
- **`practice`** — the data behind progress tracking and recording:
  - `PracticeSession` — created via POST, finalized via PATCH with `ended_at`, `bpm_percent`, `total_bars`, and a list of `loop_events`.
  - `LoopEvent` — denormalized **bar plays** per session (`measure_start`, `measure_end`, `loop_count` = how many times that range was played). The player counts every pass of the cursor over a bar, so plain playback and looping both land here; the name is historical. The frontend run-length-encodes its per-bar counts into ranges before sending (`barCountsToEvents`), so one playthrough is usually a single row. Stats views aggregate over these.
  - `SavedLoop` — user's named bookmarked loop ranges per song.
  - `Recording` — uploaded audio (WebM/Opus or WAV) per song. File lives at `media/recordings/{user_id}/{song_id}/`.

Endpoints are listed in `apps/practice/urls.py` and `README.md`'s API Reference table. New endpoints in the practice app go in `views.py` + `urls.py` (no DRF router — plain `APIView`s).

JWT settings (`config/settings.py` → `SIMPLE_JWT`) are tuned for the single-user case. Do not re-enable `ROTATE_REFRESH_TOKENS` without also fixing the frontend to persist new refresh tokens (`frontend/src/api/axios.js` handles this defensively, but rotation creates stale-tab races).

Media is served via `static(settings.MEDIA_URL, ...)` in `config/urls.py` — fine for dev (DEBUG=True), not for prod.

### Frontend (React 18 + Vite + React Router v7)

- **`App.jsx`** routes: `/`, `/login`, `/register`, `/player/:id`, `/progress`. `AuthProvider` wraps everything.
- **`context/AuthContext.jsx`** — restores user on mount via `getMe()` (which triggers refresh via interceptor if access token expired).
- **`api/axios.js`** — single axios instance. Interceptor handles 401 → refresh → retry, with a shared in-flight `refreshPromise` to dedupe concurrent 401s. If refresh fails, redirects to `/login`.
- **`api/practice.js`** — all practice endpoints (sessions, saved loops, recordings).

### The big component: `AlphaTabPlayer.jsx`

This is the central, largest component. It wraps the third-party **alphaTab** library and orchestrates playback, metronome, looping, session tracking, track selection, and audio recording.

Key patterns (these are load-bearing, don't refactor them away):

- **Refs everywhere**: alphaTab event handlers (`playerStateChanged`, `playerPositionChanged`, `beatMouseDown`, etc.) are registered **once** inside an init effect. They cannot see updated React state via closure, so the component mirrors every state value into a `useRef` (`loopOnRef`, `bpmRef`, `metronomeOnRef`, ...). The same pattern applies to keyboard shortcuts (`document.addEventListener('keydown')`) — they read refs, not state.
- **Keyboard rules** (one `keydown` listener on `document`): shortcuts bail out on Ctrl/Cmd/Alt so browser bindings keep working; a focused input/textarea/select/contentEditable swallows everything except `Escape`; `Escape` is the universal exit (blur field → close shortcuts/riffs/saved-loops → cancel count-in); an open modal blocks player keys; and auto-repeat (`e.repeat`) is allowed only for `REPEATABLE_KEYS` so toggles don't flicker when a key is held. A document-level `click` listener blurs player buttons clicked with the mouse (`e.detail > 0`) so Space stays Play/Pause instead of re-triggering the last-clicked button — keyboard activation (detail 0) is left alone.
- **Function refs**: things called from those long-lived handlers (e.g. `toggleLoopRef.current`, `startSessionIfNeededRef.current`) are stored in refs and reassigned every render so they always see fresh closures.
- **Session lifecycle**: `startSessionIfNeeded` is idempotent and fires when *either* Play starts OR the metronome is turned on (button or `M` key). Session ends on component unmount or `beforeunload` (uses `fetch` with `keepalive: true` because axios won't reach the server in unload). Duration is wall-clock — pauses count as practice.
- **Mouse on the tab**: alphaTab's `enableUserInteraction` is **off** — its built-in click handler nulls `playbackRange` on every click, which killed the loop. We listen to the DOM events `alphaTab.beatMouseDown/Move/Up` on the container (they carry `originalEvent`, so `shiftKey` and `detail` are available) and resolve the gesture in `handleTabClick`: click = seek only (loop stays), click outside an active loop = loop off + seek (range kept), drag across bars = select range, Shift+click = move the nearer range edge, double-click = single-bar range. The range is drawn by our own overlay (`paintLoopRange` in `barHeatOverlay.js`; alphaTab's `.at-selection` is hidden in CSS) — dim when the loop is off, accent when on; the default whole-song range isn't painted. Range changes while the loop is on are applied live via an effect on `[loopOn, loopStart, loopEnd]`; `applyLoopRange` restores the previous tick when it's still inside the new range, because setting `playbackRange` seeks to its start.
- **Loop on current bar**: when `L` is pressed during playback and the currently playing bar is outside the selected loop range, `toggleLoop` overrides the range to `[currentBar, currentBar]`. `currentBarRef` is updated from `playerPositionChanged.currentTick` against `barPositionsRef`.
- **Metronome only while playing**: clicks come solely from alphaTab's `midiEventsPlayed` (event type `242`) → perfect sync with playback. When the song is paused/stopped the metronome is silent even with the toggle on (the earlier standalone Web Audio scheduler was removed deliberately — don't reintroduce it). The only clicks outside playback are the loop count-in below.
- **Backing track (PODKŁAD)**: inverse of solo — `applyMixToApi` mutes the selected track (alphaTab `changeTrackMute`) so the rest of the score plays as a synth backing while the user plays the selected part live. Mutually exclusive with SOLO; `B` shortcut. Works with the metronome like normal playback (MIDI-event clicks).
- **Count-in**: `requestPlayPause` (Space + Play button) plays one bar of Web Audio clicks before starting playback whenever the `1·2·3·4` toggle is on — with or without the loop; a second press during the countdown cancels it. With the loop on, alphaTab's own `isLooping` is turned **off** (`applyLoopRange`/`toggleCountIn`) so the synth stops cleanly at the range end and resets to the range start; `playerFinished` then runs `startCountIn` again and calls `play()` — every loop iteration gets its own count-in without leaking the first note of the next pass.
- **Heat scale**: the tab overlay (`makeIntensityAt`) and the modal heatmap both divide bar plays by `heatScale(max)` = `Math.max(FULL_HEAT_PLAYS, max)` (`utils/practiceHeat.js`). Pure max-normalisation made a single playthrough paint every bar at full intensity, so the scale stays absolute until some bar passes the threshold and only then follows the song's record. Tune `FULL_HEAT_PLAYS` (currently 12) to make colors climb faster or slower — both views must keep using the same helper.

### Recording (`components/RecordingPanel.jsx`, `audio/recorder.js`)

Recording is post-hoc analysis-ready capture — currently Etap 1 (upload + playback). Two formats:

- **WebM/Opus** — `MediaRecorder` at 192 kbps (small, default).
- **WAV** — Web Audio capture via `ScriptProcessorNode` into Float32 chunks, encoded to 16-bit PCM WAV (lossless, larger).

The picker calls `getUserMedia` with `echoCancellation: false, noiseSuppression: false, autoGainControl: false` — these are critical for a clean guitar signal through an audio interface. REC start triggers `onStartPlayback` callback (which calls alphaTab `playPause`) so audio captured aligns with playback timing.

Future work (Etap 2/3) — monophonic pitch (`pitchy`/YIN) + onset detection on the saved AudioBuffer, compared against expected pitches/timings extracted from the alphaTab score, then a report UI. The Recording model already has fields ready for analysis metadata; add new fields rather than reshaping.

### LocalStorage keys

Prefix everything with `guitarTab.` for consistency. Existing keys:

- `guitarTab.selectedTrackBySong` — map `{ songId: trackIndex | null }`. `null` means "all tracks".
- `guitarTab.soloSelectedTrack` — `'true'`/`'false'`. Global (not per-song) toggle: play only the selected track (alphaTab `changeTrackSolo`). No-op while "all tracks" is selected.
- `guitarTab.backingTrack` — `'true'`/`'false'`. Global toggle, inverse of solo: mute the selected track so the rest plays as a synth backing track (alphaTab `changeTrackMute`). Mutually exclusive with solo (solo wins on conflicting stored values). No-op while "all tracks" is selected.
- `guitarTab.loopCountIn` — `'true'`/`'false'`. One bar of metronome count-in before playback starts (loop-independent; the key name is historical).
- `guitarTab.masterVolume`, `guitarTab.metronomeVolume` — `0..1`, global. Master volume is pushed to `at.masterVolume` right after the alphaTab instance is created; metronome volume is read via `metronomeVolumeRef`.
- `guitarTab.metronomeOn` — `'true'`/`'false'`, global. Restored on mount and kept across song changes (the old "reset on new song" was dropped). Restoring it does **not** start a practice session — only an explicit toggle (button / `M`) does; the click handler lazily creates the AudioContext, since nobody pressed `M` to create it.
- `guitarTab.bpmBySong` — map `{ songId: bpm }`. Absolute practice tempo (not a percent) restored in `scoreLoaded` via `playbackSpeed = saved / score.tempo`; written from `applyBpm` only, so the original tempo on load is never stored.
- `guitarTab.recDeviceId` — last-used audio input deviceId.
- `guitarTab.recFormat` — `'webm'` or `'wav'`.
- `access`, `refresh` — JWT tokens (legacy, no prefix — leave alone).

## Notes & gotchas

- **AlphaTab's `metronomeVolume` is set to 0**; the audible metronome is fully reimplemented in Web Audio so we control sound design and standalone-mode timing. Don't re-enable AlphaTab's built-in metronome.
- **`enumerateDevices()` returns empty labels** until the user grants microphone permission. The recording panel re-queries devices after the first successful `getUserMedia`.
- **Polyphony**: any planned analysis work is **monophonic only** for now. Polyphonic pitch detection is intentionally out of scope.
- **CORS / media URLs**: `RecordingSerializer.get_file_url` returns absolute URLs (`request.build_absolute_uri`). In dev these point at `http://127.0.0.1:8000/media/...` and are served unauthenticated by `static()`. Fine for single-user dev; would need real auth-gated media serving in prod.
- **The user's commit style** is brief Polish (often lowercase, no period). Match it when committing unless told otherwise.
