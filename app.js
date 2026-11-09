/**
 * MemoryMap Web — OpenStreetMap & GPX Track Planner / Editor
 * Supports desktop & mobile browsers.
 */

(function () {
  'use strict';

  // ==================== STATE ====================
  const TRACK_COLORS = [
    '#3b82f6', // Blue
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#f97316', // Orange
    '#14b8a6', // Teal
    '#eab308'  // Yellow
  ];

  const state = {
    mode: 'idle', // 'idle' | 'creating' | 'editing' | 'extending_after' | 'extending_before'
    tracks: [],
    activeTrackId: null,
    renamingTrackId: null,
    movingWaypoint: null, // { trackId, index } when positioning a newly inserted waypoint in edit mode
    nextTrackNumber: 1,
    inspectorMarker: null,
    searchMarker: null,
    previewLine: null, // Rubber-band line while creating/extending
    suppressNextMapClick: false
  };

  // ==================== MAP INITIALIZATION & LAYERS ====================
  // Default center: Lake District / Peak District UK (classic Memory-Map territory)
  const map = L.map('map', {
    center: [53.477, -3.025],
    zoom: 12,
    zoomControl: false,
    doubleClickZoom: false // Prevent accidental zoom while clicking waypoints rapidly
  });

  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ imperial: true, metric: true, position: 'bottomright' }).addTo(map);

  // Base Layers
  const baseLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }),
    cyclosm: L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors, Tiles style by <a href="https://www.cyclosm.org">CyclOSM</a>'
    }),
    cyclemap: L.layerGroup([
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }),
      L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
        maxZoom: 18,
        opacity: 0.9,
        attribution: '&copy; <a href="https://cycling.waymarkedtrails.org">Waymarked Trails: Cycling</a>'
      })
    ]),
    transport: L.tileLayer('https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: 'Map <a href="https://memomaps.de/">memomaps.de</a> <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }),
    opentopo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    }),
    humanitarian: L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors, Tiles courtesy of Humanitarian OpenStreetMap Team'
    })
  };

  // Start with standard OSM layer
  baseLayers.osm.addTo(map);

  // Switchable Overlays
  const overlayLayers = {
    cycling: L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
      maxZoom: 18,
      opacity: 0.85,
      attribution: '&copy; <a href="https://cycling.waymarkedtrails.org">Waymarked Trails: Cycling</a>'
    }),
    hiking: L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
      maxZoom: 18,
      opacity: 0.85,
      attribution: '&copy; <a href="https://hiking.waymarkedtrails.org">Waymarked Trails: Hiking</a>'
    }),
    scaleGrid: createCoordinateGridLayer()
  };

  // Leaflet layer switcher on top-right of map
  L.control.layers(
    {
      'OpenStreetMap Standard': baseLayers.osm,
      'CyclOSM (Cycle Map)': baseLayers.cyclosm,
      'Cycle Map': baseLayers.cyclemap,
      'Transport Map': baseLayers.transport,
      'OpenTopoMap (Topographic)': baseLayers.opentopo,
      'OSM Humanitarian': baseLayers.humanitarian
    },
    {
      'Waymarked Cycling Routes': overlayLayers.cycling,
      'Waymarked Hiking Trails': overlayLayers.hiking,
      'Lat/Lon Coordinate Grid': overlayLayers.scaleGrid
    },
    { position: 'topright', collapsed: true }
  ).addTo(map);

  // Coordinate Grid Layer Generator
  function createCoordinateGridLayer() {
    const GridLayer = L.GridLayer.extend({
      createTile: function (coords) {
        const tile = document.createElement('canvas');
        const tileSize = this.getTileSize();
        tile.width = tileSize.x;
        tile.height = tileSize.y;
        const ctx = tile.getContext('2d');

        const nwPoint = coords.scaleBy(tileSize);
        const nw = map.unproject(nwPoint, coords.z);

        ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, tileSize.x, tileSize.y);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`${nw.lat.toFixed(3)}, ${nw.lng.toFixed(3)}`, 6, 14);
        return tile;
      }
    });
    return new GridLayer({ opacity: 0.9 });
  }

  // ==================== DOM ELEMENTS ====================
  const el = {
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    searchInput: document.getElementById('place-search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    searchResults: document.getElementById('search-results'),
    btnNewTrack: document.getElementById('btn-new-track'),
    btnLoadGpx: document.getElementById('btn-load-gpx'),
    gpxFileInput: document.getElementById('gpx-file-input'),
    btnSaveGpx: document.getElementById('btn-save-gpx'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeIconMoon: document.getElementById('theme-icon-moon'),
    themeIconSun: document.getElementById('theme-icon-sun'),
    themeToggleLabel: document.getElementById('theme-toggle-label'),
    btnLoadSample: document.getElementById('btn-load-sample'),
    modeBanner: document.getElementById('mode-banner'),
    modeTitle: document.getElementById('mode-title'),
    modeDesc: document.getElementById('mode-description'),
    modeActions: document.getElementById('mode-actions'),
    btnFinishMode: document.getElementById('btn-finish-mode'),
    floatingBanner: document.getElementById('map-floating-banner'),
    floatingBannerText: document.getElementById('floating-banner-text'),
    floatingBannerBtn: document.getElementById('floating-banner-btn'),
    elevationStatus: document.getElementById('elevation-status'),
    activeTrackName: document.getElementById('active-track-name'),
    activeTrackPts: document.getElementById('active-track-pts'),
    statDistance: document.getElementById('stat-distance'),
    statDistanceMi: document.getElementById('stat-distance-mi'),
    statElevGain: document.getElementById('stat-elev-gain'),
    statElevLoss: document.getElementById('stat-elev-loss'),
    statElevRange: document.getElementById('stat-elev-range'),
    elevProfileContainer: document.getElementById('elevation-profile-container'),
    elevCanvas: document.getElementById('elevation-canvas'),
    elevHoverReadout: document.getElementById('elev-hover-readout'),
    trackCount: document.getElementById('track-count'),
    trackList: document.getElementById('track-list'),
    pointInspector: document.getElementById('point-inspector'),
    btnClearInspector: document.getElementById('btn-clear-inspector'),
    cursorCoords: document.getElementById('cursor-coords'),
    copyCursorCoordsBtn: document.getElementById('copy-cursor-coords-btn'),
    mapEl: document.getElementById('map'),
    // Save Modal
    saveModal: document.getElementById('save-modal'),
    saveModalClose: document.getElementById('save-modal-close'),
    saveModalCancel: document.getElementById('save-modal-cancel'),
    saveModalConfirm: document.getElementById('save-modal-confirm'),
    saveSameNamePreview: document.getElementById('save-same-name-preview'),
    newNameInputGroup: document.getElementById('new-name-input-group'),
    saveTrackNameInput: document.getElementById('save-track-name-input'),
    saveSummaryPts: document.getElementById('save-summary-pts'),
    saveSummaryDist: document.getElementById('save-summary-dist'),
    saveSummaryElev: document.getElementById('save-summary-elev')
  };

  // Mobile Sidebar Toggle
  el.sidebarToggle.addEventListener('click', () => {
    el.sidebar.classList.toggle('open');
  });

  // Theme Toggle (Light / Dark Mode, defaults to Light)
  function applyTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalized);
    if (el.themeIconMoon && el.themeIconSun && el.themeToggleLabel) {
      if (normalized === 'light') {
        el.themeIconMoon.classList.remove('hidden');
        el.themeIconSun.classList.add('hidden');
        el.themeToggleLabel.textContent = 'Dark';
        el.btnThemeToggle.title = 'Switch to Dark Mode';
      } else {
        el.themeIconMoon.classList.add('hidden');
        el.themeIconSun.classList.remove('hidden');
        el.themeToggleLabel.textContent = 'Light';
        el.btnThemeToggle.title = 'Switch to Light Mode';
      }
    }
    try {
      localStorage.setItem('memorymap_theme', normalized);
    } catch (e) {
      // Ignore storage errors
    }
  }

  let initialTheme = 'light';
  try {
    const savedTheme = localStorage.getItem('memorymap_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      initialTheme = savedTheme;
    }
  } catch (e) {
    // Ignore storage errors
  }
  applyTheme(initialTheme);

  if (el.btnThemeToggle) {
    el.btnThemeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(current === 'light' ? 'dark' : 'light');
    });
  }

  // ==================== GEOMETRY & HAVERSINE HELPERS ====================
  function formatLatLon5(lat, lng) {
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }

  async function copyCoordinatesToClipboard(lat, lng, btnEl) {
    const formatted = formatLatLon5(lat, lng);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formatted);
      } else {
        const ta = document.createElement('textarea');
        ta.value = formatted;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (btnEl) {
        const origHtml = btnEl.dataset.origHtml || btnEl.innerHTML;
        btnEl.dataset.origHtml = origHtml;
        btnEl.textContent = 'Copied!';
        btnEl.classList.add('copied');
        setTimeout(() => {
          btnEl.innerHTML = origHtml;
          btnEl.classList.remove('copied');
        }, 1400);
      }
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  }

  // Global delegated click listener for any .copy-coords-btn with data-lat & data-lng
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-coords-btn[data-lat][data-lng]');
    if (!copyBtn) return;
    e.stopPropagation();
    const lat = parseFloat(copyBtn.dataset.lat);
    const lng = parseFloat(copyBtn.dataset.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      copyCoordinatesToClipboard(lat, lng, copyBtn);
    }
  });

  function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Finds the segment index (between i and i+1) closest to the clicked LatLng
   * in screen pixel coordinates so inserting between waypoints is accurate.
   */
  function findClosestSegmentIndex(waypoints, clickLatLng) {
    if (waypoints.length < 2) return 0;
    const p = map.latLngToLayerPoint(clickLatLng);
    let bestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = map.latLngToLayerPoint([waypoints[i].lat, waypoints[i].lng]);
      const p2 = map.latLngToLayerPoint([waypoints[i + 1].lat, waypoints[i + 1].lng]);
      const dist = L.LineUtil.pointToSegmentDistance(p, p1, p2);
      if (dist < minDist) {
        minDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  /**
   * Computes total distance (meters), elevation gain (m), elevation loss (m), min/max elevation
   */
  function computeTrackStats(waypoints) {
    let totalDistanceMeters = 0;
    let elevGain = 0;
    let elevLoss = 0;
    let minElev = Infinity;
    let maxElev = -Infinity;
    let hasElev = false;

    let prevValidElev = null;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (i > 0) {
        const prev = waypoints[i - 1];
        totalDistanceMeters += haversineDistanceMeters(prev.lat, prev.lng, wp.lat, wp.lng);
      }

      if (typeof wp.ele === 'number' && !isNaN(wp.ele)) {
        hasElev = true;
        if (wp.ele < minElev) minElev = wp.ele;
        if (wp.ele > maxElev) maxElev = wp.ele;

        if (prevValidElev !== null) {
          const diff = wp.ele - prevValidElev;
          if (diff > 0) elevGain += diff;
          else if (diff < 0) elevLoss += Math.abs(diff);
        }
        prevValidElev = wp.ele;
      }
    }

    return {
      distanceMeters: totalDistanceMeters,
      distanceKm: totalDistanceMeters / 1000,
      distanceMiles: totalDistanceMeters / 1609.344,
      elevGain: Math.round(elevGain),
      elevLoss: Math.round(elevLoss),
      minElev: hasElev ? Math.round(minElev) : null,
      maxElev: hasElev ? Math.round(maxElev) : null,
      hasElev
    };
  }

  // ==================== ELEVATION API SERVICE (Open-Meteo DEM) ====================
  /**
   * Fetches elevations for waypoints missing `ele` (or a single waypoint that moved).
   * Uses Open-Meteo Elevation API (CORS-enabled, fast, free, global 90m/30m DEM).
   */
  async function fetchElevationsForWaypoints(waypointsToFetch, trackId) {
    if (!waypointsToFetch || waypointsToFetch.length === 0) return;

    el.elevationStatus.textContent = 'Fetching DEM...';

    // Chunk into batches of 80 coordinates per request
    const chunkSize = 80;
    for (let i = 0; i < waypointsToFetch.length; i += chunkSize) {
      const chunk = waypointsToFetch.slice(i, i + chunkSize);
      const lats = chunk.map((w) => w.lat.toFixed(6)).join(',');
      const lngs = chunk.map((w) => w.lng.toFixed(6)).join(',');

      try {
        const resp = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.elevation)) {
            chunk.forEach((wp, idx) => {
              if (typeof data.elevation[idx] === 'number') {
                wp.ele = Math.round(data.elevation[idx] * 10) / 10;
              }
            });
          }
        }
      } catch (err) {
        console.warn('Elevation lookup warning:', err);
      }
    }

    el.elevationStatus.textContent = 'Ready';
    if (trackId) {
      updateTrackStatsAndUI(trackId);
    }
  }

  async function fetchSinglePointElevation(lat, lng) {
    try {
      const resp = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.elevation) && typeof data.elevation[0] === 'number') {
          return Math.round(data.elevation[0] * 10) / 10;
        }
      }
    } catch (e) {
      // Ignore network errors
    }
    return null;
  }

  // ==================== TRACK DATA MODEL & RENDERING ====================
  function formatWaypointName(oneBasedIndex) {
    return `WP${String(oneBasedIndex).padStart(4, '0')}`;
  }

  function renumberTrackWaypoints(track) {
    if (!track || !Array.isArray(track.waypoints)) return;
    track.waypoints.forEach((wp, idx) => {
      wp.name = formatWaypointName(idx + 1);
    });
  }

  function createTrackObject(name, waypoints = []) {
    const id = 'trk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const color = TRACK_COLORS[(state.tracks.length) % TRACK_COLORS.length];
    const track = {
      id,
      name: name || `Track ${state.nextTrackNumber++}`,
      color,
      visible: true,
      showWaypoints: true,
      waypoints, // [{ lat, lng, ele, name }]
      polyline: null,
      hitPolyline: null, // Wider invisible polyline for easier clicking on mobile/desktop
      markers: [],
      stats: computeTrackStats(waypoints)
    };
    renumberTrackWaypoints(track);
    return track;
  }

  function getActiveTrack() {
    return state.tracks.find((t) => t.id === state.activeTrackId) || null;
  }

  function getTrackById(id) {
    return state.tracks.find((t) => t.id === id) || null;
  }

  function suppressMapClickThisTick() {
    state.suppressNextMapClick = true;
    setTimeout(() => {
      state.suppressNextMapClick = false;
    }, 0);
  }

  /**
   * Renders or updates a track's semi-transparent polyline and waypoint markers on the Leaflet map
   */
  function renderTrackOnMap(track) {
    renumberTrackWaypoints(track);

    // Clear existing waypoint markers first
    track.markers.forEach((m) => map.removeLayer(m));
    track.markers = [];

    // 5.1 If track is hidden, remove polylines from map and return
    if (track.visible === false) {
      if (track.polyline && map.hasLayer(track.polyline)) {
        map.removeLayer(track.polyline);
      }
      if (track.hitPolyline && map.hasLayer(track.hitPolyline)) {
        map.removeLayer(track.hitPolyline);
      }
      return;
    }

    const latlngs = track.waypoints.map((w) => [w.lat, w.lng]);
    const isActive = track.id === state.activeTrackId;

    // 1. Polyline (semi-transparent line between points as requested)
    if (!track.polyline) {
      track.polyline = L.polyline(latlngs, {
        color: track.color,
        weight: isActive ? 5 : 4,
        opacity: 0.62, // Semi-transparent line between points
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // Wide transparent hit area for comfortable clicking
      track.hitPolyline = L.polyline(latlngs, {
        color: track.color,
        weight: 18,
        opacity: 0.01
      }).addTo(map);

      const onLineClick = (e) => {
        L.DomEvent.stopPropagation(e);
        suppressMapClickThisTick();
        handleTrackLineClick(track, e.latlng);
      };

      track.polyline.on('click', onLineClick);
      track.hitPolyline.on('click', onLineClick);
    } else {
      if (!map.hasLayer(track.polyline)) {
        track.polyline.addTo(map);
      }
      if (!map.hasLayer(track.hitPolyline)) {
        track.hitPolyline.addTo(map);
      }
      track.polyline.setLatLngs(latlngs);
      track.hitPolyline.setLatLngs(latlngs);
      track.polyline.setStyle({
        color: track.color,
        weight: isActive ? 5 : 4,
        opacity: isActive ? 0.68 : 0.48
      });
    }

    // 5.2 If waypoints are hidden for this track, keep the line displayed and skip markers
    if (track.showWaypoints === false) {
      return;
    }

    // 2. Waypoint Markers
    track.waypoints.forEach((wp, index) => {
      const isFirst = index === 0;
      const isLast = index === track.waypoints.length - 1;
      const wpName = wp.name || formatWaypointName(index + 1);
      const isMovingThisWp = Boolean(
        state.movingWaypoint &&
        state.movingWaypoint.trackId === track.id &&
        state.movingWaypoint.index === index
      );

      let markerClass = 'wp-marker wp-mid';
      let size = isActive ? 12 : 10;
      if (isMovingThisWp) {
        markerClass = 'wp-marker wp-moving';
        size = 16;
      } else if (isFirst) {
        markerClass = 'wp-marker wp-start';
        size = 16;
      } else if (isLast && track.waypoints.length > 1) {
        markerClass = 'wp-marker wp-end';
        size = 16;
      }

      const icon = L.divIcon({
        className: markerClass,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      const isDraggable = isActive && state.mode === 'editing' && !isMovingThisWp;

      const marker = L.marker([wp.lat, wp.lng], {
        icon,
        draggable: isDraggable,
        interactive: !isMovingThisWp,
        title: wpName
      }).addTo(map);

      // Click on waypoint
      marker.on('click', async (e) => {
        L.DomEvent.stopPropagation(e);
        suppressMapClickThisTick();

        // If currently moving a newly inserted waypoint in edit mode, clicking drops it here
        if (state.movingWaypoint) {
          await dropMovingWaypoint(marker.getLatLng());
          return;
        }

        // When creating or extending a track, disable waypoint selection/popup and instead
        // add a new waypoint at this existing waypoint's position to the active track
        if (
          state.mode === 'creating' ||
          state.mode === 'extending_after' ||
          state.mode === 'extending_before'
        ) {
          await addWaypointToActiveTrack(wp.lat, wp.lng, wp.ele);
          return;
        }

        // Otherwise (in idle or editing mode), select this track in Edit Mode and show waypoint actions
        if (state.activeTrackId !== track.id || state.mode === 'idle') {
          enterEditMode(track.id);
        }

        openWaypointActionPopup(track, index, marker.getLatLng());
      });

      // Drag waypoint to move location
      marker.on('drag', (e) => {
        const newPos = e.target.getLatLng();
        track.waypoints[index].lat = newPos.lat;
        track.waypoints[index].lng = newPos.lng;
        const updatedLatLngs = track.waypoints.map((w) => [w.lat, w.lng]);
        track.polyline.setLatLngs(updatedLatLngs);
        track.hitPolyline.setLatLngs(updatedLatLngs);
        updateTrackStatsAndUI(track.id, false);
      });

      marker.on('dragend', async (e) => {
        const newPos = e.target.getLatLng();
        track.waypoints[index].lat = newPos.lat;
        track.waypoints[index].lng = newPos.lng;
        renderTrackOnMap(track);
        updateTrackStatsAndUI(track.id);
        // Re-fetch elevation for moved waypoint
        await fetchElevationsForWaypoints([track.waypoints[index]], track.id);
      });

      track.markers.push(marker);
    });
  }

  /**
   * Drops a currently moving waypoint at `latlng` and finalizes it in the track.
   */
  async function dropMovingWaypoint(latlng) {
    if (!state.movingWaypoint) return;
    const { trackId, index } = state.movingWaypoint;
    state.movingWaypoint = null;

    const track = getTrackById(trackId);
    if (!track || !track.waypoints[index]) {
      setMode(state.mode, state.activeTrackId);
      return;
    }

    if (latlng && typeof latlng.lat === 'number' && typeof latlng.lng === 'number') {
      track.waypoints[index].lat = latlng.lat;
      track.waypoints[index].lng = latlng.lng;
    }

    const droppedWp = track.waypoints[index];
    setMode('editing', track.id);
    await fetchElevationsForWaypoints([droppedWp], track.id);
  }

  /**
   * Handles clicking on a track line:
   * - If currently moving a newly inserted waypoint -> drops the waypoint at the clicked position.
   * - If currently creating or extending a track -> adds a waypoint at the clicked position.
   * - If in edit mode (Requirement 3) -> automatically inserts a waypoint at that point and keeps it selected/moving with the cursor until the next click drops it.
   * - If NOT in edit mode (Requirement 2) -> does NOT enter edit mode yet; offers popup to either Insert Waypoint (which enters edit mode) or Split Track Here (which stays out of edit mode).
   */
  async function handleTrackLineClick(track, clickLatLng) {
    if (state.movingWaypoint) {
      await dropMovingWaypoint(clickLatLng);
      return;
    }

    if (
      state.mode === 'creating' ||
      state.mode === 'extending_after' ||
      state.mode === 'extending_before'
    ) {
      await addWaypointToActiveTrack(clickLatLng.lat, clickLatLng.lng);
      return;
    }

    if (track.waypoints.length < 2) return;
    const segIndex = findClosestSegmentIndex(track.waypoints, clickLatLng);

    // Requirement 3: When in edit mode and clicking on a track, automatically add a waypoint at that point
    // and keep it selected so the user can move it to a new position, then click again to drop it.
    if (state.mode === 'editing') {
      map.closePopup();
      if (state.activeTrackId !== track.id) {
        state.activeTrackId = track.id;
      }
      track.showWaypoints = true;
      const newIndex = segIndex + 1;
      const newWp = {
        lat: clickLatLng.lat,
        lng: clickLatLng.lng,
        ele: null,
        name: ''
      };
      track.waypoints.splice(newIndex, 0, newWp);
      renumberTrackWaypoints(track);
      state.movingWaypoint = { trackId: track.id, index: newIndex };

      el.mapEl.classList.add('crosshair-cursor');
      el.floatingBanner.classList.remove('hidden');
      el.floatingBannerText.textContent = `Moving ${newWp.name}: Move to position, then click to drop waypoint`;

      renderTrackOnMap(track);
      updateTrackStatsAndUI(track.id, false);
      return;
    }

    // Requirement 2: When NOT in edit mode, offer the option to insert a waypoint (entering edit mode)
    // OR split the track at that point into two tracks (without entering edit mode).
    openSegmentInsertPopup(track, segIndex, clickLatLng);
  }

  /**
   * Splits a track into two tracks starting and ending at clickLatLng without entering edit mode.
   */
  async function splitTrackAtSegment(track, segIndex, clickLatLng) {
    const trackIdx = state.tracks.findIndex((t) => t.id === track.id);
    if (trackIdx === -1 || track.waypoints.length < 2) return;

    const splitLat = clickLatLng.lat;
    const splitLng = clickLatLng.lng;
    const baseName = track.name.replace(/\s*\(Part\s+\d+\)$/i, '');

    const splitWpEnd = { lat: splitLat, lng: splitLng, ele: null, name: '' };
    const splitWpStart = { lat: splitLat, lng: splitLng, ele: null, name: '' };

    const firstWaypoints = [
      ...track.waypoints.slice(0, segIndex + 1).map((w) => ({
        lat: w.lat,
        lng: w.lng,
        ele: w.ele,
        name: w.name
      })),
      splitWpEnd
    ];

    const secondWaypoints = [
      splitWpStart,
      ...track.waypoints.slice(segIndex + 1).map((w) => ({
        lat: w.lat,
        lng: w.lng,
        ele: w.ele,
        name: w.name
      }))
    ];

    // Update original track as Part 1
    track.name = `${baseName} (Part 1)`;
    track.waypoints = firstWaypoints;
    renumberTrackWaypoints(track);
    track.stats = computeTrackStats(track.waypoints);

    // Create Part 2 track right after Part 1
    const secondTrack = createTrackObject(`${baseName} (Part 2)`, secondWaypoints);
    secondTrack.visible = track.visible;
    secondTrack.showWaypoints = track.showWaypoints;
    state.tracks.splice(trackIdx + 1, 0, secondTrack);

    // Stay out of edit mode (Requirement 2)
    state.activeTrackId = track.id;
    setMode('idle', track.id);
    renderTrackOnMap(track);
    renderTrackOnMap(secondTrack);
    updateTrackStatsAndUI(track.id);

    // Fetch elevation for the split point and update both tracks
    const elev = await fetchSinglePointElevation(splitLat, splitLng);
    if (elev !== null) {
      splitWpEnd.ele = elev;
      splitWpStart.ele = elev;
      track.stats = computeTrackStats(track.waypoints);
      secondTrack.stats = computeTrackStats(secondTrack.waypoints);
      updateTrackStatsAndUI(state.activeTrackId);
    }
  }

  /**
   * Opens popup when clicking on a line segment between two waypoints when not in edit mode (Requirement 2)
   */
  function openSegmentInsertPopup(track, segIndex, clickLatLng) {
    const formattedCoords = formatLatLon5(clickLatLng.lat, clickLatLng.lng);
    const wpFrom = formatWaypointName(segIndex + 1);
    const wpTo = formatWaypointName(segIndex + 2);
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="popup-title">
        <span>Track Segment (${wpFrom} &rarr; ${wpTo})</span>
      </div>
      <div class="popup-coords">
        <div class="coords-row">
          <span>${formattedCoords}</span>
          <button type="button" class="copy-coords-btn" data-lat="${clickLatLng.lat}" data-lng="${clickLatLng.lng}" title="Copy coordinates">Copy</button>
        </div>
      </div>
      <div class="popup-detail">
        Track: <strong>${escapeHtml(track.name)}</strong>
      </div>
      <div class="popup-actions">
        <button type="button" class="popup-btn primary" id="popup-insert-between-btn">
          + Insert Waypoint Here (${wpFrom} &ndash; ${wpTo})
        </button>
        <button type="button" class="popup-btn accent" id="popup-split-track-btn">
          &#9986; Split Track Here
        </button>
      </div>
    `;

    const popup = L.popup({ closeButton: true, autoPan: true })
      .setLatLng(clickLatLng)
      .setContent(container)
      .openOn(map);

    const insertBtn = container.querySelector('#popup-insert-between-btn');
    insertBtn.addEventListener('click', async () => {
      map.closePopup(popup);
      const newWp = {
        lat: clickLatLng.lat,
        lng: clickLatLng.lng,
        ele: null,
        name: ''
      };
      track.showWaypoints = true;
      track.waypoints.splice(segIndex + 1, 0, newWp);
      renumberTrackWaypoints(track);
      enterEditMode(track.id);
      await fetchElevationsForWaypoints([newWp], track.id);
    });

    const splitBtn = container.querySelector('#popup-split-track-btn');
    splitBtn.addEventListener('click', async () => {
      map.closePopup(popup);
      await splitTrackAtSegment(track, segIndex, clickLatLng);
    });
  }

  /**
   * Opens popup when clicking a waypoint (Edit requirements #2, #6, #7):
   * - Option to delete waypoint
   * - If first waypoint (index 0): option to add waypoint BEFORE
   * - If last waypoint (index length - 1): option to add waypoint AFTER
   */
  function openWaypointActionPopup(track, index, latlng) {
    const wp = track.waypoints[index];
    if (!wp) return;

    const isFirst = index === 0;
    const isLast = index === track.waypoints.length - 1;
    const total = track.waypoints.length;
    const wpName = wp.name || formatWaypointName(index + 1);

    let badgeRole = 'Intermediate Waypoint';
    if (isFirst && isLast) badgeRole = 'Single Waypoint';
    else if (isFirst) badgeRole = 'Start Waypoint (First)';
    else if (isLast) badgeRole = 'End Waypoint (Last)';

    const elevStr = typeof wp.ele === 'number' ? `${wp.ele} m` : 'Fetching...';
    const formattedCoords = formatLatLon5(wp.lat, wp.lng);

    const container = document.createElement('div');
    container.innerHTML = `
      <div class="popup-title">
        <span>${escapeHtml(wpName)} (${index + 1} of ${total})</span>
      </div>
      <div class="popup-coords">
        <div class="coords-row">
          <span>${formattedCoords}</span>
          <button type="button" class="copy-coords-btn" data-lat="${wp.lat}" data-lng="${wp.lng}" title="Copy coordinates">Copy</button>
        </div>
        <div style="margin-top:3px;">Elevation: ${elevStr}</div>
      </div>
      <div class="popup-detail">
        ${badgeRole} &bull; <em>Drag marker to move</em>
      </div>
      <div class="popup-actions">
        ${isFirst ? `
          <button type="button" class="popup-btn accent" id="popup-add-before-btn">
            &larr; Add Waypoint Before ${escapeHtml(wpName)}
          </button>
        ` : ''}
        ${isLast ? `
          <button type="button" class="popup-btn primary" id="popup-add-after-btn">
            + Add Waypoint After ${escapeHtml(wpName)} &rarr;
          </button>
        ` : ''}
        <button type="button" class="popup-btn danger" id="popup-delete-wp-btn">
          Delete ${escapeHtml(wpName)}
        </button>
      </div>
    `;

    const popup = L.popup({ closeButton: true, offset: [0, -6] })
      .setLatLng(latlng)
      .setContent(container)
      .openOn(map);

    const addBeforeBtn = container.querySelector('#popup-add-before-btn');
    if (addBeforeBtn) {
      addBeforeBtn.addEventListener('click', () => {
        map.closePopup(popup);
        setMode('extending_before', track.id);
      });
    }

    const addAfterBtn = container.querySelector('#popup-add-after-btn');
    if (addAfterBtn) {
      addAfterBtn.addEventListener('click', () => {
        map.closePopup(popup);
        setMode('extending_after', track.id);
      });
    }

    const deleteBtn = container.querySelector('#popup-delete-wp-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        map.closePopup(popup);
        track.waypoints.splice(index, 1);
        renumberTrackWaypoints(track);
        renderTrackOnMap(track);
        updateTrackStatsAndUI(track.id);
      });
    }
  }

  // ==================== MODES & WORKFLOWS ====================
  function setMode(newMode, trackId = state.activeTrackId) {
    state.mode = newMode;
    if (trackId !== undefined) {
      state.activeTrackId = trackId;
    }

    clearPreviewLine();

    const activeTrack = getActiveTrack();

    // Update UI classes
    el.modeBanner.className = 'mode-banner';
    el.btnNewTrack.classList.remove('active-drawing');
    el.mapEl.classList.remove('crosshair-cursor');
    el.floatingBanner.classList.add('hidden');
    el.modeActions.classList.add('hidden');

    if (newMode === 'idle') {
      el.modeBanner.classList.add('mode-idle');
      el.modeTitle.textContent = 'Explore Mode';
      el.modeDesc.innerHTML = 'Click any point on the map for coordinates, elevation &amp; place info, or click any track to edit.';
    } else if (newMode === 'creating') {
      el.modeBanner.classList.add('mode-creating');
      el.btnNewTrack.classList.add('active-drawing');
      el.mapEl.classList.add('crosshair-cursor');
      el.modeTitle.textContent = `Creating: ${activeTrack ? activeTrack.name : 'Track'}`;
      el.modeDesc.innerHTML = 'Click anywhere on the map to add waypoints. Press <kbd>Esc</kbd> to finish creating.';
      el.modeActions.classList.remove('hidden');
      el.floatingBanner.classList.remove('hidden');
      el.floatingBannerText.textContent = 'Creating Track: Click map to add waypoints';
    } else if (newMode === 'editing') {
      el.modeBanner.classList.add('mode-editing');
      el.modeTitle.textContent = `Editing: ${activeTrack ? activeTrack.name : 'Track'}`;
      el.modeDesc.innerHTML = 'Drag waypoints to move, click a waypoint to delete or extend start/end, or click the line to insert a waypoint.';
      el.modeActions.classList.remove('hidden');
      el.floatingBanner.classList.remove('hidden');
      el.floatingBannerText.textContent = `Editing ${activeTrack ? activeTrack.name : 'Track'}: Drag points, click line to insert, or click waypoint`;
    } else if (newMode === 'extending_after') {
      el.modeBanner.classList.add('mode-extending');
      el.mapEl.classList.add('crosshair-cursor');
      el.modeTitle.textContent = 'Adding Waypoints After End';
      el.modeDesc.innerHTML = 'Click on the map to append new waypoints after the last waypoint. Press <kbd>Esc</kbd> to return to Edit Mode.';
      el.modeActions.classList.remove('hidden');
      el.floatingBanner.classList.remove('hidden');
      el.floatingBannerText.textContent = 'Click map to add waypoint AFTER last point (Esc to stop)';
    } else if (newMode === 'extending_before') {
      el.modeBanner.classList.add('mode-extending');
      el.mapEl.classList.add('crosshair-cursor');
      el.modeTitle.textContent = 'Adding Waypoints Before Start';
      el.modeDesc.innerHTML = 'Click on the map to prepend new waypoints before the first waypoint. Press <kbd>Esc</kbd> to return to Edit Mode.';
      el.modeActions.classList.remove('hidden');
      el.floatingBanner.classList.remove('hidden');
      el.floatingBannerText.textContent = 'Click map to add waypoint BEFORE first point (Esc to stop)';
    }

    // Re-render all tracks so active track highlights and enables marker dragging
    state.tracks.forEach((t) => renderTrackOnMap(t));
    updateTrackStatsAndUI(state.activeTrackId);
  }

  function startNewTrack() {
    map.closePopup();
    const newTrack = createTrackObject(`Track ${state.nextTrackNumber++}`, []);
    state.tracks.push(newTrack);
    state.activeTrackId = newTrack.id;
    setMode('creating', newTrack.id);
  }

  function enterEditMode(trackId) {
    const track = getTrackById(trackId);
    if (!track) return;
    state.activeTrackId = track.id;
    setMode('editing', track.id);
  }

  function finishCurrentMode() {
    map.closePopup();
    if (state.movingWaypoint) {
      dropMovingWaypoint(null);
      return;
    }
    if (state.mode === 'extending_after' || state.mode === 'extending_before') {
      setMode('editing', state.activeTrackId);
      return;
    }

    // If finishing creation of an empty track, remove it
    const active = getActiveTrack();
    if (state.mode === 'creating' && active && active.waypoints.length === 0) {
      deleteTrack(active.id);
      return;
    }

    setMode('idle', state.activeTrackId);
  }

  function deleteTrack(trackId) {
    const idx = state.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    const t = state.tracks[idx];
    if (t.polyline) map.removeLayer(t.polyline);
    if (t.hitPolyline) map.removeLayer(t.hitPolyline);
    t.markers.forEach((m) => map.removeLayer(m));
    state.tracks.splice(idx, 1);

    if (state.activeTrackId === trackId) {
      state.activeTrackId = state.tracks.length > 0 ? state.tracks[state.tracks.length - 1].id : null;
      setMode('idle', state.activeTrackId);
    } else {
      updateTrackStatsAndUI(state.activeTrackId);
    }
  }

  // Rubber-band preview line during creation / extension
  function updatePreviewLine(cursorLatLng) {
    const track = getActiveTrack();
    if (!track || track.waypoints.length === 0) {
      clearPreviewLine();
      return;
    }

    let anchorWp = null;
    if (state.mode === 'creating' || state.mode === 'extending_after') {
      anchorWp = track.waypoints[track.waypoints.length - 1];
    } else if (state.mode === 'extending_before') {
      anchorWp = track.waypoints[0];
    } else {
      clearPreviewLine();
      return;
    }

    const latlngs = [
      [anchorWp.lat, anchorWp.lng],
      [cursorLatLng.lat, cursorLatLng.lng]
    ];

    if (!state.previewLine) {
      state.previewLine = L.polyline(latlngs, {
        color: track.color,
        weight: 3,
        opacity: 0.5,
        dashArray: '6, 6',
        interactive: false
      }).addTo(map);
    } else {
      state.previewLine.setLatLngs(latlngs);
      state.previewLine.setStyle({ color: track.color });
    }
  }

  function clearPreviewLine() {
    if (state.previewLine) {
      map.removeLayer(state.previewLine);
      state.previewLine = null;
    }
  }

  // ==================== MAP INTERACTION EVENTS ====================
  map.on('mousemove', (e) => {
    el.cursorCoords.textContent = formatLatLon5(e.latlng.lat, e.latlng.lng);
    el.copyCursorCoordsBtn.dataset.lat = e.latlng.lat;
    el.copyCursorCoordsBtn.dataset.lng = e.latlng.lng;
    el.copyCursorCoordsBtn.classList.remove('hidden');

    // If positioning a newly created waypoint in edit mode, move it live with the cursor
    if (state.movingWaypoint) {
      const movingTrack = getTrackById(state.movingWaypoint.trackId);
      const idx = state.movingWaypoint.index;
      if (movingTrack && movingTrack.waypoints[idx]) {
        movingTrack.waypoints[idx].lat = e.latlng.lat;
        movingTrack.waypoints[idx].lng = e.latlng.lng;
        if (movingTrack.markers[idx]) {
          movingTrack.markers[idx].setLatLng(e.latlng);
        }
        const updatedLatLngs = movingTrack.waypoints.map((w) => [w.lat, w.lng]);
        if (movingTrack.polyline) movingTrack.polyline.setLatLngs(updatedLatLngs);
        if (movingTrack.hitPolyline) movingTrack.hitPolyline.setLatLngs(updatedLatLngs);
        updateTrackStatsAndUI(movingTrack.id, false);
      }
      return;
    }

    if (state.mode === 'creating' || state.mode === 'extending_after' || state.mode === 'extending_before') {
      updatePreviewLine(e.latlng);
    }
  });

  async function addWaypointToActiveTrack(lat, lng, existingEle = null) {
    const activeTrack = getActiveTrack();
    if (!activeTrack) return;

    const hasValidEle = typeof existingEle === 'number' && !isNaN(existingEle);
    const wp = {
      lat,
      lng,
      ele: hasValidEle ? existingEle : null
    };

    if (state.mode === 'creating' || state.mode === 'extending_after') {
      activeTrack.waypoints.push(wp);
    } else if (state.mode === 'extending_before') {
      activeTrack.waypoints.unshift(wp);
    } else {
      return;
    }

    renderTrackOnMap(activeTrack);
    updateTrackStatsAndUI(activeTrack.id);

    if (!hasValidEle) {
      await fetchElevationsForWaypoints([wp], activeTrack.id);
    }
  }

  map.on('click', async (e) => {
    if (state.suppressNextMapClick) {
      state.suppressNextMapClick = false;
      return;
    }

    // If positioning a newly inserted waypoint in edit mode, clicking drops it here
    if (state.movingWaypoint) {
      await dropMovingWaypoint(e.latlng);
      return;
    }

    const { lat, lng } = e.latlng;
    const activeTrack = getActiveTrack();

    // 1. Creating a new track or extending (after end / before start)
    if (
      (state.mode === 'creating' ||
        state.mode === 'extending_after' ||
        state.mode === 'extending_before') &&
      activeTrack
    ) {
      await addWaypointToActiveTrack(lat, lng);
      return;
    }

    // 2. In Idle or Editing mode: clicking empty map inspects that point (Requirement #4)
    inspectMapPoint(lat, lng);
  });

  // Escape key to finish track creation / extension / editing (Requirement #5)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.saveModal.classList.contains('hidden')) {
        closeSaveModal();
        return;
      }
      if (state.mode !== 'idle') {
        finishCurrentMode();
      }
    }
  });

  el.btnNewTrack.addEventListener('click', () => {
    if (state.mode === 'creating') {
      finishCurrentMode();
    } else {
      startNewTrack();
    }
  });

  el.btnFinishMode.addEventListener('click', finishCurrentMode);
  el.floatingBannerBtn.addEventListener('click', finishCurrentMode);

  // ==================== POINT INSPECTOR (CLICK ANY POINT FOR INFO) ====================
  async function inspectMapPoint(lat, lng) {
    if (state.inspectorMarker) {
      map.removeLayer(state.inspectorMarker);
    }

    el.btnClearInspector.classList.remove('hidden');

    // Place marker & open loading popup
    state.inspectorMarker = L.circleMarker([lat, lng], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#10b981',
      fillOpacity: 0.9
    }).addTo(map);

    const formattedCoords = formatLatLon5(lat, lng);

    const initialHtml = `
      <div class="popup-title">Point Information</div>
      <div class="popup-coords">
        <div class="coords-row">
          <span>${formattedCoords}</span>
          <button type="button" class="copy-coords-btn" data-lat="${lat}" data-lng="${lng}" title="Copy coordinates">Copy</button>
        </div>
      </div>
      <div class="popup-detail">Fetching elevation &amp; place details...</div>
    `;

    state.inspectorMarker.bindPopup(initialHtml).openPopup();

    el.pointInspector.innerHTML = `
      <div class="inspector-grid">
        <span class="inspector-key">Lat, Lon:</span>
        <span class="inspector-val coords-row">
          <span>${formattedCoords}</span>
          <button type="button" class="copy-coords-btn" data-lat="${lat}" data-lng="${lng}" title="Copy coordinates">Copy</button>
        </span>
        <span class="inspector-key">Elevation:</span>
        <span class="inspector-val" id="insp-elev">Loading...</span>
      </div>
      <div class="inspector-address" id="insp-addr">Looking up OSM place info...</div>
    `;

    // Fetch Elevation & Nominatim Reverse Geocode in parallel
    const [elev, placeData] = await Promise.all([
      fetchSinglePointElevation(lat, lng),
      reverseGeocodeNominatim(lat, lng)
    ]);

    const elevText = elev !== null ? `${elev} m (${Math.round(elev * 3.28084)} ft)` : 'N/A';
    const placeName = placeData?.display_name || 'Open area / Unnamed location';
    const category = placeData?.type ? `${placeData.class || ''}: ${placeData.type}`.replace(/^:\s*/, '') : '';

    // Update Sidebar Inspector
    const inspElevEl = document.getElementById('insp-elev');
    const inspAddrEl = document.getElementById('insp-addr');
    if (inspElevEl) inspElevEl.textContent = elevText;
    if (inspAddrEl) {
      inspAddrEl.innerHTML = `
        ${category ? `<strong style="color:#10b981;text-transform:capitalize;">${escapeHtml(category)}</strong><br/>` : ''}
        ${escapeHtml(placeName)}
      `;
    }

    // Update Map Popup if still open
    if (state.inspectorMarker && map.hasLayer(state.inspectorMarker)) {
      const popupContent = document.createElement('div');
      popupContent.innerHTML = `
        <div class="popup-title">
          <span>${escapeHtml(placeData?.name || 'Clicked Point')}</span>
        </div>
        <div class="popup-coords">
          <div class="coords-row">
            <span>${formattedCoords}</span>
            <button type="button" class="copy-coords-btn" data-lat="${lat}" data-lng="${lng}" title="Copy coordinates">Copy</button>
          </div>
          <div style="margin-top:3px;">Elev: ${elevText}</div>
        </div>
        <div class="popup-detail">${escapeHtml(placeName)}</div>
        <div class="popup-actions">
          <button type="button" class="popup-btn primary" id="insp-start-track-here">Start New Track Here</button>
        </div>
      `;

      state.inspectorMarker.setPopupContent(popupContent);
      const startBtn = popupContent.querySelector('#insp-start-track-here');
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          map.closePopup();
          startNewTrack();
          const active = getActiveTrack();
          const wp = { lat, lng, ele: elev };
          active.waypoints.push(wp);
          renderTrackOnMap(active);
          updateTrackStatsAndUI(active.id);
        });
      }
    }
  }

  async function reverseGeocodeNominatim(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&zoom=18&addressdetails=1`;
      const resp = await fetch(url, {
        headers: { 'Accept-Language': 'en' }
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
    }
    return null;
  }

  el.btnClearInspector.addEventListener('click', () => {
    if (state.inspectorMarker) {
      map.removeLayer(state.inspectorMarker);
      state.inspectorMarker = null;
    }
    el.btnClearInspector.classList.add('hidden');
    el.pointInspector.innerHTML = `<p class="empty-state-sm">Click any point on the map (when not drawing) to inspect its coordinates, elevation, and address.</p>`;
  });

  // ==================== SEARCH PLACES & POIs (NOMINATIM) ====================
  let searchDebounceTimer = null;

  el.searchInput.addEventListener('input', () => {
    const q = el.searchInput.value.trim();
    el.searchClearBtn.classList.toggle('hidden', q.length === 0);

    clearTimeout(searchDebounceTimer);
    if (q.length < 2) {
      el.searchResults.classList.add('hidden');
      return;
    }

    searchDebounceTimer = setTimeout(() => {
      performPlaceSearch(q);
    }, 320);
  });

  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchDebounceTimer);
      const q = el.searchInput.value.trim();
      if (q.length >= 2) performPlaceSearch(q);
    }
  });

  el.searchClearBtn.addEventListener('click', () => {
    el.searchInput.value = '';
    el.searchClearBtn.classList.add('hidden');
    el.searchResults.classList.add('hidden');
    if (state.searchMarker) {
      map.removeLayer(state.searchMarker);
      state.searchMarker = null;
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      el.searchResults.classList.add('hidden');
    }
  });

  async function performPlaceSearch(query) {
    try {
      const bounds = map.getBounds();
      const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=7&addressdetails=1&viewbox=${viewbox}`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!resp.ok) return;
      const results = await resp.json();

      el.searchResults.innerHTML = '';
      if (results.length === 0) {
        el.searchResults.innerHTML = `<li style="cursor:default;"><span class="search-result-sub">No matching places or POIs found.</span></li>`;
        el.searchResults.classList.remove('hidden');
        return;
      }

      results.forEach((item) => {
        const li = document.createElement('li');
        const mainTitle = item.name || item.display_name.split(',')[0];
        const typeLabel = item.type ? ` (${item.type.replace(/_/g, ' ')})` : '';
        li.innerHTML = `
          <span class="search-result-title">${escapeHtml(mainTitle)}${escapeHtml(typeLabel)}</span>
          <span class="search-result-sub">${escapeHtml(item.display_name)}</span>
        `;
        li.addEventListener('click', () => {
          el.searchResults.classList.add('hidden');
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          map.flyTo([lat, lng], 15, { duration: 1.0 });
          inspectMapPoint(lat, lng);
        });
        el.searchResults.appendChild(li);
      });

      el.searchResults.classList.remove('hidden');
    } catch (err) {
      console.warn('Search error:', err);
    }
  }

  // ==================== UI & TELEMETRY UPDATER ====================
  function updateTrackStatsAndUI(trackId, redrawProfile = true) {
    const track = getTrackById(trackId);

    if (track) {
      track.stats = computeTrackStats(track.waypoints);
      el.activeTrackName.textContent = track.name;
      el.activeTrackPts.textContent = `${track.waypoints.length} pts`;
      el.statDistance.textContent = track.stats.distanceKm.toFixed(2);
      el.statDistanceMi.textContent = `${track.stats.distanceMiles.toFixed(2)} mi`;
      el.statElevGain.textContent = `+${track.stats.elevGain}`;
      el.statElevLoss.textContent = `-${track.stats.elevLoss}`;
      el.statElevRange.textContent = track.stats.hasElev
        ? `Min: ${track.stats.minElev}m | Max: ${track.stats.maxElev}m`
        : 'Min: — | Max: —';

      el.btnSaveGpx.disabled = track.waypoints.length === 0;

      if (redrawProfile) {
        drawElevationProfile(track);
      }
    } else {
      el.activeTrackName.textContent = 'No track selected';
      el.activeTrackPts.textContent = '0 pts';
      el.statDistance.textContent = '0.00';
      el.statDistanceMi.textContent = '0.00 mi';
      el.statElevGain.textContent = '+0';
      el.statElevLoss.textContent = '-0';
      el.statElevRange.textContent = 'Min: — | Max: —';
      el.btnSaveGpx.disabled = true;
      el.elevProfileContainer.classList.add('hidden');
    }

    renderSidebarTrackList();
  }

  function renderSidebarTrackList() {
    el.trackCount.textContent = String(state.tracks.length);

    if (state.tracks.length === 0) {
      el.trackList.innerHTML = `
        <div class="empty-state">
          No tracks yet. Click <strong>New Track</strong> to draw on the map or <strong>Load GPX</strong> to open a file.
        </div>
      `;
      return;
    }

    el.trackList.innerHTML = '';
    state.tracks.forEach((track) => {
      const stats = computeTrackStats(track.waypoints);
      const isRenaming = state.renamingTrackId === track.id;
      const isTrackVisible = track.visible !== false;
      const isWaypointsVisible = track.showWaypoints !== false;

      const item = document.createElement('div');
      item.className = `track-item ${track.id === state.activeTrackId ? 'active' : ''} ${!isTrackVisible ? 'track-hidden' : ''}`;
      item.innerHTML = `
        <div class="track-item-top">
          <div class="track-item-left">
            <span class="track-color-swatch" style="background:${track.color}"></span>
            <div class="track-item-info">
              ${isRenaming ? `
                <div class="track-rename-row">
                  <input type="text" class="track-rename-input" value="${escapeHtml(track.name)}" aria-label="Edit track name" />
                  <button type="button" class="track-action-btn" data-action="save-rename" title="Save name">Save</button>
                  <button type="button" class="track-action-btn" data-action="cancel-rename" title="Cancel">&times;</button>
                </div>
              ` : `
                <div class="track-item-title-row">
                  <div class="track-item-title" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</div>
                </div>
              `}
              <div class="track-item-sub">${stats.distanceKm.toFixed(2)} km &bull; +${stats.elevGain}m / -${stats.elevLoss}m &bull; ${track.waypoints.length} pts</div>
            </div>
          </div>
          <div class="track-item-actions">
            <button type="button" class="track-action-btn" data-action="rename" title="Edit track name">Rename</button>
            <button type="button" class="track-action-btn" data-action="zoom" title="Zoom to whole track">Fit</button>
            <button type="button" class="track-action-btn" data-action="edit" title="Edit track">Edit</button>
            <button type="button" class="track-action-btn delete" data-action="delete" title="Remove track">&times;</button>
          </div>
        </div>
        <div class="track-item-toggles">
          <label class="track-toggle-label" title="Show or hide this track on the map">
            <input type="checkbox" data-toggle="visible" ${isTrackVisible ? 'checked' : ''} />
            <span>Show Track</span>
          </label>
          <label class="track-toggle-label ${!isTrackVisible ? 'disabled' : ''}" title="Show or hide all waypoints for this track">
            <input type="checkbox" data-toggle="waypoints" ${isWaypointsVisible ? 'checked' : ''} ${!isTrackVisible ? 'disabled' : ''} />
            <span>Show Waypoints</span>
          </label>
        </div>
      `;

      // Handle inline rename input if active
      if (isRenaming) {
        const inputEl = item.querySelector('.track-rename-input');
        if (inputEl) {
          setTimeout(() => {
            inputEl.focus();
            inputEl.select();
          }, 0);

          const commitRename = () => {
            const newName = inputEl.value.trim();
            if (newName) {
              track.name = newName;
            }
            state.renamingTrackId = null;
            if (state.activeTrackId === track.id && (state.mode === 'editing' || state.mode === 'creating')) {
              setMode(state.mode, track.id);
            } else {
              updateTrackStatsAndUI(state.activeTrackId, false);
            }
          };

          inputEl.addEventListener('click', (ev) => ev.stopPropagation());
          inputEl.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
              ev.preventDefault();
              commitRename();
            } else if (ev.key === 'Escape') {
              ev.preventDefault();
              state.renamingTrackId = null;
              renderSidebarTrackList();
            }
          });
        }
      }

      // Handle Show Track & Show Waypoints toggles
      const visCheckbox = item.querySelector('input[data-toggle="visible"]');
      if (visCheckbox) {
        visCheckbox.addEventListener('click', (ev) => ev.stopPropagation());
        visCheckbox.addEventListener('change', (ev) => {
          track.visible = ev.target.checked;
          renderTrackOnMap(track);
          renderSidebarTrackList();
        });
      }

      const wpCheckbox = item.querySelector('input[data-toggle="waypoints"]');
      if (wpCheckbox) {
        wpCheckbox.addEventListener('click', (ev) => ev.stopPropagation());
        wpCheckbox.addEventListener('change', (ev) => {
          track.showWaypoints = ev.target.checked;
          renderTrackOnMap(track);
          renderSidebarTrackList();
        });
      }

      item.querySelector('.track-item-toggles')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
      });

      item.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('.track-action-btn');
        if (actionBtn) {
          e.stopPropagation();
          const action = actionBtn.dataset.action;
          if (action === 'rename') {
            state.renamingTrackId = track.id;
            renderSidebarTrackList();
          } else if (action === 'save-rename') {
            const inputEl = item.querySelector('.track-rename-input');
            const newName = inputEl ? inputEl.value.trim() : '';
            if (newName) {
              track.name = newName;
            }
            state.renamingTrackId = null;
            if (state.activeTrackId === track.id && (state.mode === 'editing' || state.mode === 'creating')) {
              setMode(state.mode, track.id);
            } else {
              updateTrackStatsAndUI(state.activeTrackId, false);
            }
          } else if (action === 'cancel-rename') {
            state.renamingTrackId = null;
            renderSidebarTrackList();
          } else if (action === 'zoom') {
            fitTrackBounds(track);
          } else if (action === 'edit') {
            track.visible = true;
            enterEditMode(track.id);
          } else if (action === 'delete') {
            deleteTrack(track.id);
          }
          return;
        }
        state.activeTrackId = track.id;
        state.tracks.forEach((t) => renderTrackOnMap(t));
        updateTrackStatsAndUI(track.id);
      });

      el.trackList.appendChild(item);
    });
  }

  function fitTrackBounds(track) {
    if (!track || track.waypoints.length === 0) return;
    if (track.waypoints.length === 1) {
      map.setView([track.waypoints[0].lat, track.waypoints[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(track.waypoints.map((w) => [w.lat, w.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }

  // ==================== ELEVATION SPARKLINE CANVAS ====================
  function drawElevationProfile(track) {
    const validPts = track.waypoints.filter((w) => typeof w.ele === 'number');
    if (validPts.length < 2) {
      el.elevProfileContainer.classList.add('hidden');
      return;
    }

    el.elevProfileContainer.classList.remove('hidden');
    const canvas = el.elevCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    let minE = Math.min(...validPts.map((p) => p.ele));
    let maxE = Math.max(...validPts.map((p) => p.ele));
    if (maxE - minE < 10) {
      minE -= 5;
      maxE += 5;
    }

    const padTop = 8;
    const padBot = 8;
    const plotH = height - padTop - padBot;

    ctx.beginPath();
    validPts.forEach((pt, i) => {
      const x = (i / (validPts.length - 1)) * width;
      const y = padTop + plotH - ((pt.ele - minE) / (maxE - minE)) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill gradient under curve
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // ==================== LOAD GPX FILE FROM FILESYSTEM ====================
  el.btnLoadGpx.addEventListener('click', () => {
    el.gpxFileInput.value = '';
    el.gpxFileInput.click();
  });

  el.gpxFileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const xmlText = ev.target.result;
        await parseAndLoadGpxString(xmlText, file.name.replace(/\.gpx$/i, ''));
      };
      reader.readAsText(file);
    });
  });

  async function parseAndLoadGpxString(xmlString, fallbackName) {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlString, 'text/xml');

      // Extract track name
      const nameNode = xml.querySelector('trk > name') || xml.querySelector('rte > name') || xml.querySelector('metadata > name');
      const trackName = (nameNode && nameNode.textContent.trim()) ? nameNode.textContent.trim() : (fallbackName || `Loaded Track ${state.nextTrackNumber}`);

      // Extract points from <trkpt>, <rtept>, or <wpt>
      let ptNodes = Array.from(xml.querySelectorAll('trkpt'));
      if (ptNodes.length === 0) ptNodes = Array.from(xml.querySelectorAll('rtept'));
      if (ptNodes.length === 0) ptNodes = Array.from(xml.querySelectorAll('wpt'));

      if (ptNodes.length === 0) {
        alert('No valid GPX track points (<trkpt>, <rtept>, or <wpt>) found in this file.');
        return;
      }

      const waypoints = [];
      const missingElevWps = [];

      ptNodes.forEach((node) => {
        const lat = parseFloat(node.getAttribute('lat'));
        const lng = parseFloat(node.getAttribute('lon'));
        if (isNaN(lat) || isNaN(lng)) return;

        const eleNode = node.querySelector('ele');
        const eleVal = eleNode ? parseFloat(eleNode.textContent) : NaN;
        const wp = {
          lat,
          lng,
          ele: !isNaN(eleVal) ? Math.round(eleVal * 10) / 10 : null
        };
        if (wp.ele === null) missingElevWps.push(wp);
        waypoints.push(wp);
      });

      const track = createTrackObject(trackName, waypoints);
      state.tracks.push(track);
      state.activeTrackId = track.id;

      // Render track, update stats, and move map view to show the whole track (Requirement #2, #3, #4)
      setMode('idle', track.id);
      renderTrackOnMap(track);
      updateTrackStatsAndUI(track.id);
      fitTrackBounds(track);

      // If any points in the GPX lacked <ele> tags, automatically fetch DEM elevations
      if (missingElevWps.length > 0) {
        await fetchElevationsForWaypoints(missingElevWps, track.id);
      }
    } catch (err) {
      console.error('Error parsing GPX file:', err);
      alert('Failed to parse GPX file. Please check that it is a valid XML GPX file.');
    }
  }

  // Demo Track Loader for quick testing
  el.btnLoadSample.addEventListener('click', async () => {
    const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MemoryMap Web" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Catbells Lakeland Ridge Loop</name>
    <trkseg>
      <trkpt lat="54.5794" lon="-3.1645"><ele>142</ele></trkpt>
      <trkpt lat="54.5742" lon="-3.1682"><ele>285</ele></trkpt>
      <trkpt lat="54.5683" lon="-3.1708"><ele>451</ele></trkpt>
      <trkpt lat="54.5625" lon="-3.1726"><ele>412</ele></trkpt>
      <trkpt lat="54.5608" lon="-3.1631"><ele>290</ele></trkpt>
      <trkpt lat="54.5675" lon="-3.1565"><ele>165</ele></trkpt>
      <trkpt lat="54.5751" lon="-3.1588"><ele>118</ele></trkpt>
      <trkpt lat="54.5794" lon="-3.1645"><ele>142</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;
    await parseAndLoadGpxString(sampleGpx, 'Catbells Lakeland Ridge Loop');
  });

  // ==================== SAVE GPX MODAL & EXPORT ====================
  el.btnSaveGpx.addEventListener('click', () => {
    const track = getActiveTrack();
    if (!track || track.waypoints.length === 0) return;

    const cleanSameFile = sanitizeFileName(track.name) + '.gpx';
    el.saveSameNamePreview.textContent = cleanSameFile;
    el.saveTrackNameInput.value = track.name;

    // Default to "same" radio option
    const sameRadio = document.querySelector('input[name="save-name-option"][value="same"]');
    if (sameRadio) sameRadio.checked = true;
    el.newNameInputGroup.classList.add('hidden');

    const stats = computeTrackStats(track.waypoints);
    el.saveSummaryPts.textContent = `${track.waypoints.length} waypoints`;
    el.saveSummaryDist.textContent = `${stats.distanceKm.toFixed(2)} km`;
    el.saveSummaryElev.textContent = `+${stats.elevGain}m / -${stats.elevLoss}m`;

    el.saveModal.classList.remove('hidden');
  });

  document.querySelectorAll('input[name="save-name-option"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'new') {
        el.newNameInputGroup.classList.remove('hidden');
        el.saveTrackNameInput.focus();
        el.saveTrackNameInput.select();
      } else {
        el.newNameInputGroup.classList.add('hidden');
      }
    });
  });

  function closeSaveModal() {
    el.saveModal.classList.add('hidden');
  }

  el.saveModalClose.addEventListener('click', closeSaveModal);
  el.saveModalCancel.addEventListener('click', closeSaveModal);

  el.saveModalConfirm.addEventListener('click', () => {
    const track = getActiveTrack();
    if (!track) return;

    const modeChoice = document.querySelector('input[name="save-name-option"]:checked')?.value || 'same';
    let chosenName = track.name;

    if (modeChoice === 'new') {
      const typed = el.saveTrackNameInput.value.trim();
      if (typed) {
        chosenName = typed.replace(/\.gpx$/i, '');
        track.name = chosenName;
        updateTrackStatsAndUI(track.id, false);
      }
    }

    const gpxXml = buildGpxXml(track, chosenName);
    const fileName = sanitizeFileName(chosenName) + '.gpx';

    const blob = new Blob([gpxXml], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    closeSaveModal();
  });

  function buildGpxXml(track, exportName) {
    renumberTrackWaypoints(track);
    const nowIso = new Date().toISOString();
    const stats = computeTrackStats(track.waypoints);
    const trkptsXml = track.waypoints
      .map((wp, idx) => {
        const wpName = wp.name || formatWaypointName(idx + 1);
        const eleTag = typeof wp.ele === 'number' && !isNaN(wp.ele) ? `\n        <ele>${wp.ele.toFixed(1)}</ele>` : '';
        return `      <trkpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}">${eleTag}\n        <name>${escapeXml(wpName)}</name>\n      </trkpt>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MemoryMap Web" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(exportName)}</name>
    <desc>Distance: ${stats.distanceKm.toFixed(2)} km | Elevation Gain: +${stats.elevGain}m | Elevation Loss: -${stats.elevLoss}m</desc>
    <time>${nowIso}</time>
  </metadata>
  <trk>
    <name>${escapeXml(exportName)}</name>
    <trkseg>
${trkptsXml}
    </trkseg>
  </trk>
</gpx>`;
  }

  function sanitizeFileName(name) {
    return (name || 'track')
      .replace(/\.gpx$/i, '')
      .replace(/[^a-zA-Z0-9_\-\s.]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'track';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
})();
