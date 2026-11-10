/**
 * GPX Builder — OpenStreetMap & GPX Track Planner / Editor
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
  // Default center: UK
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
      localStorage.setItem('gpx_builder_theme', normalized);
    } catch (e) {
      // Ignore storage errors
    }
  }

  let initialTheme = 'light';
  try {
    const savedTheme = localStorage.getItem('gpx_builder_theme');
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
      el.statDistance.textContent = track.stats.distanceMiles.toFixed(2);
      el.statDistanceMi.textContent = `${track.stats.distanceKm.toFixed(2)} km`;
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
      el.statDistanceMi.textContent = '0.00 km';
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
              <div class="track-item-sub">${stats.distanceMiles.toFixed(2)} mi &bull; +${stats.elevGain}m / -${stats.elevLoss}m &bull; ${track.waypoints.length} pts</div>
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

  // Demo Track Loader (Cycle_on_the_Moss.gpx)
  const DEMO_TRACK_FALLBACK_PTS = '53.476745,-3.024770,14.0;53.475890,-3.023708,13.0;53.473048,-3.030038,7.0;53.474593,-3.032141,9.0;53.475002,-3.032924,9.0;53.476151,-3.034544,11.0;53.477313,-3.036851,7.0;53.477141,-3.037194,7.0;53.477192,-3.037602,6.0;53.477831,-3.038664,9.0;53.479957,-3.041604,7.0;53.480353,-3.042537,7.0;53.481744,-3.044082,9.0;53.481438,-3.045058,7.0;53.481872,-3.045809,7.0;53.482211,-3.045756,7.0;53.482855,-3.044297,9.0;53.484854,-3.046474,9.0;53.484981,-3.046228,9.0;53.486392,-3.048073,9.0;53.489361,-3.051420,9.0;53.489858,-3.052568,8.0;53.490669,-3.053641,8.0;53.491550,-3.054199,8.0;53.492278,-3.054188,8.0;53.493382,-3.054897,9.0;53.494812,-3.055959,9.0;53.496637,-3.056989,9.0;53.496745,-3.057654,6.0;53.496669,-3.058394,6.0;53.497613,-3.058748,7.0;53.497933,-3.058609,7.0;53.499694,-3.059371,5.0;53.500115,-3.059886,7.0;53.504244,-3.061527,5.0;53.506458,-3.062214,5.0;53.507281,-3.061870,3.0;53.508321,-3.061924,4.0;53.509891,-3.062375,7.0;53.510357,-3.062375,7.0;53.510937,-3.062278,8.0;53.511569,-3.062611,0.0;53.512232,-3.062890,3.0;53.512660,-3.062160,7.0;53.512513,-3.061731,7.0;53.512545,-3.061055,8.0;53.512379,-3.060282,8.0;53.512475,-3.058534,8.0;53.513081,-3.058813,7.0;53.513604,-3.058705,8.0;53.514165,-3.058791,8.0;53.514523,-3.058223,8.0;53.515594,-3.057632,8.0;53.516220,-3.057450,8.0;53.518070,-3.057289,9.0;53.519173,-3.057311,9.0;53.519945,-3.056999,9.0;53.520621,-3.056989,8.0;53.521195,-3.057193,9.0;53.521450,-3.057740,10.0;53.523211,-3.058137,8.0;53.523759,-3.057965,9.0;53.524786,-3.058201,;53.524856,-3.057429,9.0;53.525685,-3.057536,7.0;53.528058,-3.058480,7.0;53.528313,-3.058469,7.0;53.531718,-3.060304,4.0;53.532286,-3.060540,4.0;53.543584,-3.067009,5.0;53.544082,-3.067632,3.0;53.543533,-3.068812,3.0;53.543597,-3.069499,3.0;53.545076,-3.070936,6.0;53.545444,-3.071098,30.4;53.545499,-3.071098,30.6;53.545675,-3.071117,31.2;53.545789,-3.071082,31.4;53.545843,-3.071053,31.4;53.545893,-3.071037,31.4;53.546062,-3.071033,31.4;53.546175,-3.071043,31.2;53.546363,-3.071074,30.8;53.546557,-3.071055,31.0;53.546675,-3.070979,31.4;53.546728,-3.070950,31.4;53.546832,-3.070959,31.4;53.547125,-3.070984,32.0;53.547420,-3.070994,32.0;53.547479,-3.071007,32.0;53.547540,-3.071020,32.0;53.547604,-3.071039,32.0;53.547953,-3.071103,32.0;53.548287,-3.071180,32.2;53.548428,-3.071204,32.6;53.548807,-3.071271,32.8;53.549261,-3.071343,32.8;53.549852,-3.071401,32.8;53.550063,-3.071368,33.2;53.550259,-3.071322,33.4;53.550382,-3.071273,33.6;53.550608,-3.071195,34.0;53.550659,-3.071171,34.0;53.550768,-3.071160,34.2;53.550822,-3.071168,34.4;53.550881,-3.071163,34.4;53.551114,-3.071060,34.8;53.551174,-3.071049,34.8;53.551218,-3.071039,34.8;53.551252,-3.071030,34.8;53.551259,-3.071014,34.8;53.551278,-3.070945,34.8;53.551278,-3.070890,34.8;53.551252,-3.070591,34.6;53.551244,-3.070509,34.6;53.551228,-3.070121,34.0;53.551250,-3.070060,34.0;53.551283,-3.070017,34.0;53.551361,-3.069996,33.8;53.551415,-3.069998,33.8;53.551544,-3.070010,34.0;53.551659,-3.070026,34.0;53.552141,-3.070072,33.8;53.552512,-3.070124,34.4;53.552634,-3.070132,34.4;53.552695,-3.070137,34.6;53.552695,-3.070137,34.6;53.552814,-3.070137,34.8;53.552883,-3.070151,34.8;53.553044,-3.070158,34.6;53.553128,-3.070114,34.4;53.553212,-3.070002,34.4;53.553235,-3.069830,34.2;53.553234,-3.069735,34.4;53.553203,-3.069264,34.6;53.553206,-3.069172,34.4;53.553235,-3.068994,34.4;53.553297,-3.068831,34.2;53.553297,-3.068831,34.2;53.553434,-3.068514,34.2;53.553579,-3.068345,34.2;53.553685,-3.068259,34.4;53.553796,-3.068224,34.4;53.553855,-3.068226,34.2;53.553913,-3.068243,34.2;53.554079,-3.068329,34.0;53.554427,-3.068523,34.8;53.554475,-3.068557,34.8;53.554541,-3.068680,35.0;53.554540,-3.068854,34.8;53.554534,-3.068941,34.8;53.554516,-3.069331,34.8;53.554534,-3.069413,35.0;53.554570,-3.069472,35.0;53.554675,-3.069550,35.2;53.554729,-3.069582,35.2;53.554840,-3.069627,34.8;53.554951,-3.069664,34.8;53.555305,-3.069792,34.8;53.555305,-3.069792,34.6;53.555773,-3.069988,34.6;53.555773,-3.069988,34.6;53.555895,-3.070055,34.6;53.555986,-3.070109,34.8;53.556051,-3.070209,35.0;53.556035,-3.070252,35.0;53.556022,-3.070248,35.0;53.556026,-3.070242,35.0;53.556034,-3.070232,35.0;53.556033,-3.070231,35.0;53.556034,-3.070231,35.0;53.556034,-3.070230,35.0;53.556034,-3.070229,35.0;53.556034,-3.070229,35.0;53.556034,-3.070231,35.0;53.556034,-3.070233,31.2;53.556031,-3.070226,31.2;53.556030,-3.070220,31.6;53.556028,-3.070215,31.6;53.556006,-3.070158,31.2;53.556003,-3.070137,31.0;53.555977,-3.070078,30.8;53.555907,-3.070029,30.8;53.555844,-3.069999,31.0;53.555763,-3.069960,31.0;53.555667,-3.069916,30.6;53.555616,-3.069889,30.6;53.555415,-3.069801,30.6;53.555328,-3.069762,30.8;53.555230,-3.069718,30.8;53.555025,-3.069635,30.8;53.554974,-3.069610,30.8;53.554874,-3.069583,30.8;53.554825,-3.069558,31.0;53.554772,-3.069538,31.0;53.554668,-3.069509,31.0;53.554576,-3.069472,31.2;53.554537,-3.069412,31.2;53.554531,-3.069357,31.2;53.554535,-3.069197,31.2;53.554554,-3.068933,31.4;53.554596,-3.068524,31.6;53.554619,-3.068287,31.4;53.554663,-3.068142,31.2;53.554799,-3.067743,31.0;53.554830,-3.067670,31.0;53.555089,-3.067143,31.0;53.555360,-3.066584,31.6;53.555571,-3.066170,31.2;53.555671,-3.065915,31.6;53.555836,-3.065486,31.6;53.555989,-3.065037,31.4;53.556043,-3.064851,31.0;53.556100,-3.064563,30.8;53.556147,-3.064270,31.4;53.556189,-3.063968,31.4;53.556357,-3.063071,31.0;53.556473,-3.062580,30.4;53.556507,-3.062487,30.4;53.556669,-3.062029,30.6;53.556721,-3.061844,30.8;53.556809,-3.061471,31.2;53.556833,-3.061377,31.2;53.556854,-3.061280,31.4;53.556877,-3.061180,31.0;53.557056,-3.060394,30.8;53.557138,-3.060126,31.0;53.557211,-3.059974,31.2;53.557275,-3.059856,31.2;53.557339,-3.059738,31.4;53.557416,-3.059563,31.4;53.557458,-3.059470,31.4;53.557533,-3.059285,31.2;53.557647,-3.059010,31.0;53.557672,-3.058910,31.0;53.557707,-3.058708,30.8;53.557719,-3.058607,30.8;53.557747,-3.058303,30.4;53.557753,-3.058200,30.4;53.557763,-3.057987,30.6;53.557788,-3.057471,30.6;53.557813,-3.057172,30.4;53.557829,-3.056695,30.8;53.557845,-3.056619,31.0;53.557875,-3.056570,31.0;53.557971,-3.056564,31.2;53.558019,-3.056582,31.2;53.558110,-3.056606,30.8;53.558168,-3.056617,30.8;53.558296,-3.056637,30.6;53.558479,-3.056684,31.0;53.558706,-3.056744,30.6;53.558851,-3.056781,30.4;53.559139,-3.056857,30.6;53.559192,-3.056824,30.6;53.559227,-3.056754,30.4;53.559238,-3.056659,30.4;53.559232,-3.056560,30.4;53.559195,-3.056247,30.6;53.559178,-3.055931,30.2;53.559151,-3.055621,29.8;53.559106,-3.054989,30.0;53.559097,-3.054780,30.0;53.559053,-3.054144,30.0;53.559038,-3.053821,30.0;53.559020,-3.053507,30.4;53.559001,-3.053219,30.8;53.559024,-3.053057,30.8;53.559065,-3.053010,30.8;53.559241,-3.052978,30.4;53.559557,-3.052959,30.4;53.559625,-3.052960,30.6;53.559829,-3.052950,30.8;53.559959,-3.052946,30.6;53.560207,-3.052921,30.4;53.560268,-3.052906,30.2;53.560592,-3.052808,30.0;53.560660,-3.052770,30.2;53.560894,-3.052535,30.2;53.560998,-3.052385,30.2;53.561254,-3.052041,29.6;53.561646,-3.051687,29.8;53.562066,-3.051168,30.6;53.562487,-3.050538,30.4;53.562820,-3.050004,30.0;53.562912,-3.049843,30.0;53.563128,-3.049410,30.4;53.563154,-3.049311,30.4;53.563172,-3.049209,30.2;53.563180,-3.048993,30.0;53.563179,-3.048884,30.0;53.563168,-3.048454,30.0;53.563151,-3.048142,30.0;53.563141,-3.047539,30.0;53.563140,-3.047436,30.2;53.563136,-3.047227,30.2;53.563127,-3.046726,30.2;53.563121,-3.046554,30.0;53.563132,-3.046488,30.0;53.563144,-3.046444,30.2;53.563156,-3.046407,30.2;53.563183,-3.046372,30.2;53.563264,-3.046329,30.4;53.563287,-3.046295,30.6;53.563280,-3.046259,30.6;53.563167,-3.046245,30.8;53.562939,-3.046261,30.8;53.562922,-3.046240,31.0;53.562928,-3.046209,31.0;53.563026,-3.046043,30.6;53.563059,-3.045983,30.4;53.563096,-3.045842,29.8;53.563101,-3.045762,29.6;53.563091,-3.045509,29.2;53.563089,-3.045429,29.2;53.563090,-3.045345,29.2;53.563083,-3.045253,29.2;53.563035,-3.044551,29.8;53.563002,-3.044035,30.0;53.562990,-3.043827,30.0;53.562974,-3.043618,29.8;53.562952,-3.043302,29.6;53.562940,-3.043206,29.8;53.562867,-3.042834,29.8;53.562827,-3.042670,29.8;53.562762,-3.042418,29.8;53.562734,-3.042339,29.8;53.562677,-3.042169,29.8;53.562619,-3.041920,29.6;53.562567,-3.041690,29.6;53.562548,-3.041555,29.8;53.562496,-3.041316,30.2;53.562480,-3.041235,30.6;53.562425,-3.041028,31.2;53.562372,-3.040703,31.4;53.562341,-3.039953,29.4;53.562316,-3.038939,29.0;53.562319,-3.038037,29.0;53.562325,-3.037928,29.0;53.562381,-3.037614,28.4;53.562546,-3.037137,28.4;53.562580,-3.037045,28.4;53.562871,-3.036194,29.0;53.562902,-3.036099,29.0;53.562994,-3.035813,28.8;53.563087,-3.035540,29.2;53.563117,-3.035448,29.4;53.563205,-3.035175,29.6;53.563456,-3.034456,29.4;53.563749,-3.033664,29.8;53.563813,-3.033488,29.8;53.563910,-3.033227,29.8;53.564172,-3.032518,29.0;53.564468,-3.031725,29.4;53.564602,-3.031366,29.4;53.564755,-3.030913,29.6;53.564819,-3.030623,29.8;53.564858,-3.030318,30.0;53.564869,-3.030216,30.0;53.564950,-3.029379,29.6;53.564957,-3.029272,29.4;53.565023,-3.028300,29.0;53.565029,-3.028193,28.8;53.565069,-3.027656,28.8;53.565120,-3.027016,29.0;53.565200,-3.026104,29.2;53.565208,-3.025999,29.2;53.565279,-3.025071,29.6;53.565286,-3.024966,29.6;53.565352,-3.024040,29.0;53.565411,-3.023201,28.8;53.565478,-3.022283,29.2;53.565541,-3.021612,29.8;53.565567,-3.021417,30.0;53.565720,-3.020759,29.0;53.565747,-3.020665,29.0;53.565931,-3.020020,28.8;53.566037,-3.019659,29.0;53.566064,-3.019567,29.0;53.566254,-3.018925,29.0;53.566362,-3.018564,29.2;53.566457,-3.018211,29.2;53.566568,-3.017749,28.6;53.566615,-3.017560,28.8;53.566688,-3.017277,29.0;53.566770,-3.017004,28.8;53.566822,-3.016829,28.6;53.566847,-3.016746,28.6;53.566941,-3.016428,29.0;53.567033,-3.016111,30.4;53.567148,-3.015717,30.8;53.567195,-3.015556,31.6;53.567312,-3.015159,32.6;53.567312,-3.015159,32.8;53.567470,-3.014600,33.0;53.567557,-3.014290,33.8;53.567618,-3.014070,35.2;53.567660,-3.013914,35.6;53.567816,-3.013356,33.8;53.567972,-3.012810,32.8;53.568005,-3.012695,32.8;53.568038,-3.012577,32.6;53.568138,-3.012223,31.4;53.568243,-3.011862,30.0;53.568313,-3.011619,29.6;53.568381,-3.011375,29.0;53.568415,-3.011252,28.6;53.568511,-3.010902,27.8;53.568593,-3.010575,27.4;53.568734,-3.010082,27.8;53.568786,-3.009891,27.6;53.568814,-3.009799,27.6;53.568840,-3.009706,27.6;53.568866,-3.009614,27.4;53.568892,-3.009521,27.6;53.568969,-3.009245,27.8;53.569018,-3.009071,28.2;53.569180,-3.008523,28.8;53.569203,-3.008445,28.8;53.569326,-3.008040,28.4;53.569348,-3.007904,28.4;53.569413,-3.007602,28.2;53.569415,-3.007515,28.2;53.569404,-3.007430,28.0;53.569380,-3.007350,27.4;53.569350,-3.007279,27.2;53.569263,-3.007177,26.8;53.569007,-3.006944,26.8;53.568895,-3.006844,27.0;53.568729,-3.006696,26.8;53.568390,-3.006410,27.2;53.567987,-3.006069,27.4;53.567937,-3.006011,27.4;53.567850,-3.005873,27.2;53.567812,-3.005797,27.4;53.567566,-3.005251,27.6;53.567528,-3.005174,27.4;53.567216,-3.004534,27.8;53.566857,-3.003846,27.6;53.566815,-3.003768,27.6;53.566740,-3.003594,27.6;53.566654,-3.003317,27.6;53.566494,-3.002668,28.2;53.566481,-3.002373,28.6;53.566470,-3.002075,28.6;53.566463,-3.001973,28.6;53.566404,-3.001575,28.6;53.566278,-3.000893,27.8;53.566209,-3.000529,28.2;53.566099,-3.000060,28.0;53.566050,-2.999870,28.0;53.565956,-2.999485,28.2;53.565932,-2.999293,28.4;53.565935,-2.999103,28.6;53.565966,-2.998822,29.6;53.565980,-2.998728,29.6;53.565988,-2.998631,29.8;53.566011,-2.998341,30.0;53.566049,-2.997940,30.0;53.566099,-2.997244,30.2;53.566081,-2.996585,29.6;53.565968,-2.995838,29.0;53.565850,-2.995076,30.0;53.565721,-2.994319,29.2;53.565572,-2.993609,30.2;53.565552,-2.993533,30.2;53.565510,-2.993389,30.6;53.565465,-2.993247,30.8;53.565368,-2.992989,32.2;53.565269,-2.992744,33.4;53.565137,-2.992462,33.8;53.565006,-2.992209,34.6;53.564918,-2.992086,35.8;53.564889,-2.992047,36.0;53.564705,-2.991795,35.2;53.564618,-2.991657,34.2;53.564477,-2.991419,33.0;53.564428,-2.991334,32.8;53.564283,-2.991069,31.8;53.564057,-2.990631,30.8;53.563973,-2.990463,30.4;53.563806,-2.990140,29.8;53.563561,-2.989686,29.0;53.563482,-2.989541,28.8;53.563181,-2.988965,29.0;53.563070,-2.988748,29.8;53.562813,-2.988254,30.0;53.562776,-2.988183,29.8;53.562499,-2.987625,30.4;53.562495,-2.987549,30.6;53.562511,-2.987475,30.6;53.562590,-2.987228,30.8;53.562645,-2.987047,31.0;53.562727,-2.986773,31.0;53.562844,-2.986399,30.8;53.563044,-2.985770,30.0;53.563098,-2.985596,30.0;53.563320,-2.984883,30.6;53.563430,-2.984524,30.8;53.563538,-2.984172,30.8;53.563564,-2.984087,31.0;53.563669,-2.983746,31.4;53.563723,-2.983578,31.6;53.563749,-2.983493,31.8;53.563859,-2.983076,31.6;53.564008,-2.982302,31.8;53.564042,-2.982135,32.0;53.564125,-2.981723,33.0;53.564157,-2.981555,33.0;53.564315,-2.980682,33.2;53.564419,-2.980005,33.2;53.564510,-2.979222,33.8;53.564522,-2.978951,34.2;53.564519,-2.978862,34.2;53.564500,-2.978687,34.4;53.564436,-2.978331,34.4;53.564367,-2.978050,34.4;53.564193,-2.977449,35.0;53.564169,-2.977367,35.2;53.564067,-2.976850,35.8;53.564044,-2.976304,36.0;53.564133,-2.975761,36.0;53.564183,-2.975493,36.2;53.564314,-2.974777,37.2;53.564450,-2.973991,37.2;53.564463,-2.973903,37.4;53.564557,-2.973160,37.8;53.564691,-2.972428,38.4;53.564862,-2.971612,38.4;53.564881,-2.971520,38.6;53.564987,-2.970773,38.2;53.564979,-2.970224,38.6;53.564950,-2.970056,38.8;53.564894,-2.969816,39.4;53.564907,-2.969651,39.4;53.564938,-2.969591,39.4;53.564982,-2.969550,39.2;53.565141,-2.969467,39.0;53.565537,-2.969259,39.2;53.565645,-2.969175,39.0;53.565735,-2.969057,39.2;53.565773,-2.968985,39.2;53.565802,-2.968901,39.2;53.565838,-2.968714,39.4;53.565842,-2.968614,39.2;53.565844,-2.968512,39.0;53.565833,-2.968306,38.8;53.565815,-2.968093,38.6;53.565788,-2.967790,38.4;53.565769,-2.967600,38.4;53.565761,-2.967506,38.4;53.565696,-2.966723,39.2;53.565686,-2.966474,39.4;53.565687,-2.966340,39.4;53.565679,-2.966271,39.6;53.565624,-2.965969,39.6;53.565600,-2.965778,39.4;53.565549,-2.965383,39.4;53.565468,-2.964706,40.2;53.565426,-2.964425,40.2;53.565404,-2.963945,40.4;53.565446,-2.963756,40.4;53.565514,-2.963589,40.4;53.565679,-2.963189,40.8;53.565751,-2.963029,40.8;53.566022,-2.962509,40.6;53.566122,-2.962279,40.6;53.566172,-2.962106,40.4;53.566208,-2.961922,40.4;53.566259,-2.961530,41.0;53.566297,-2.960978,41.0;53.566283,-2.960755,41.6;53.566258,-2.960623,42.8;53.566241,-2.960555,43.2;53.566212,-2.960419,43.6;53.566204,-2.960141,43.4;53.566220,-2.959697,41.6;53.566216,-2.959576,41.0;53.566210,-2.959454,40.8;53.566179,-2.959221,40.4;53.566135,-2.959008,39.8;53.565973,-2.958454,40.0;53.565918,-2.958284,40.0;53.565747,-2.957827,41.2;53.565728,-2.957801,41.4;53.565708,-2.957775,41.6;53.565589,-2.957619,42.0;53.565500,-2.957576,42.0;53.565403,-2.957583,42.0;53.565355,-2.957601,41.8;53.565304,-2.957626,41.6;53.565188,-2.957663,41.2;53.565010,-2.957641,41.2;53.564520,-2.957505,41.6;53.564417,-2.957451,41.4;53.564212,-2.957323,41.4;53.564159,-2.957308,41.4;53.563994,-2.957312,41.2;53.563780,-2.957334,41.4;53.563579,-2.957307,41.4;53.563292,-2.957111,42.6;53.563163,-2.956982,43.6;53.563047,-2.956795,44.0;53.562873,-2.956312,43.8;53.562873,-2.956312,43.8;53.562751,-2.955677,44.2;53.562725,-2.955597,44.2;53.562550,-2.955132,42.6;53.562284,-2.954641,43.0;53.562200,-2.954502,43.0;53.562116,-2.954370,42.6;53.561899,-2.954073,42.8;53.561643,-2.953585,43.2;53.561608,-2.953515,43.4;53.561308,-2.952848,43.6;53.561285,-2.952670,43.6;53.561292,-2.952584,43.6;53.561311,-2.952497,43.6;53.561390,-2.952238,43.2;53.561416,-2.952149,43.2;53.561559,-2.951634,43.8;53.561582,-2.951548,44.0;53.561638,-2.951288,44.4;53.561631,-2.951101,44.0;53.561575,-2.950936,44.0;53.561539,-2.950863,44.2;53.561219,-2.950230,44.4;53.561034,-2.949874,44.8;53.560994,-2.949804,44.6;53.560913,-2.949663,44.8;53.560708,-2.949344,44.8;53.560618,-2.949276,44.6;53.560502,-2.949309,44.0;53.560451,-2.949370,43.6;53.560212,-2.949537,43.0;53.560148,-2.949546,42.8;53.560082,-2.949529,42.6;53.559975,-2.949441,43.0;53.559804,-2.949135,43.8;53.559771,-2.949049,44.0;53.559603,-2.948620,44.4;53.559428,-2.948181,44.4;53.559070,-2.947340,44.2;53.558991,-2.947195,44.2;53.558913,-2.947057,44.6;53.558674,-2.946659,44.6;53.558638,-2.946602,44.4;53.558552,-2.946547,44.4;53.558460,-2.946577,44.4;53.558419,-2.946624,44.4;53.558177,-2.946843,44.6;53.557968,-2.947020,44.8;53.557543,-2.947416,45.4;53.557491,-2.947470,45.6;53.557032,-2.947994,45.8;53.556982,-2.948059,45.8;53.556495,-2.948768,45.8;53.556409,-2.948915,45.8;53.556183,-2.949339,45.8;53.556149,-2.949387,45.8;53.556101,-2.949385,45.8;53.556095,-2.949270,45.4;53.556099,-2.949189,45.2;53.556110,-2.948678,45.2;53.556108,-2.948585,45.4;53.556088,-2.948288,45.8;53.556055,-2.948058,45.8;53.556034,-2.947926,46.0;53.556013,-2.947834,45.8;53.555993,-2.947744,46.0;53.555919,-2.947437,45.6;53.555895,-2.947331,45.8;53.555871,-2.947228,45.8;53.555847,-2.947123,45.8;53.555825,-2.947017,45.8;53.555803,-2.946909,46.0;53.555755,-2.946577,46.0;53.555734,-2.946351,46.4;53.555718,-2.946182,46.4;53.555712,-2.946126,46.4;53.555610,-2.945224,46.0;53.555587,-2.945006,46.0;53.555564,-2.944694,45.8;53.555558,-2.944592,45.8;53.555533,-2.944092,46.8;53.555514,-2.943702,47.2;53.555479,-2.943114,47.4;53.555475,-2.943013,47.6;53.555468,-2.942808,47.8;53.555460,-2.942604,48.2;53.555449,-2.942304,48.2;53.555436,-2.942005,47.8;53.555410,-2.941307,47.8;53.555375,-2.940483,48.2;53.555372,-2.940387,48.8;53.555329,-2.939413,48.8;53.555288,-2.938603,49.4;53.555215,-2.937790,49.8;53.555180,-2.937583,50.0;53.555101,-2.937089,50.4;53.555101,-2.937089,50.4;53.554945,-2.936431,50.8;53.554920,-2.936341,50.8;53.554897,-2.936253,51.0;53.554819,-2.935992,51.0;53.554764,-2.935825,51.2;53.554675,-2.935585,51.2;53.554354,-2.934831,51.0;53.554257,-2.934618,50.8;53.554239,-2.934457,51.0;53.554304,-2.934267,51.2;53.554329,-2.934201,51.4;53.554383,-2.934061,52.2;53.554493,-2.933791,53.2;53.554542,-2.933654,53.6;53.554637,-2.933406,54.4;53.554705,-2.933226,55.4;53.554822,-2.932922,55.6;53.555084,-2.932269,55.8;53.555162,-2.932109,56.6;53.555271,-2.931911,57.6;53.555301,-2.931862,57.6;53.555450,-2.931673,58.6;53.555484,-2.931648,59.0;53.555649,-2.931559,59.6;53.555726,-2.931534,59.6;53.555793,-2.931513,60.0;53.555826,-2.931501,60.2;53.555928,-2.931457,60.8;53.556189,-2.931382,61.0;53.556311,-2.931361,61.8;53.556533,-2.931288,62.6;53.556605,-2.931265,63.2;53.556788,-2.931219,64.2;53.556963,-2.931197,65.4;53.557067,-2.931169,65.6;53.557176,-2.931161,66.6;53.557318,-2.931155,67.6;53.557354,-2.931152,68.0;53.557501,-2.931154,69.0;53.557657,-2.931154,69.6;53.557788,-2.931166,70.2;53.557965,-2.931154,70.8;53.558007,-2.931140,71.0;53.558088,-2.931091,71.6;53.558226,-2.930965,72.4;53.558259,-2.930934,72.6;53.558356,-2.930844,73.8;53.558506,-2.930702,74.0;53.558780,-2.930572,73.6;53.559130,-2.930497,73.0;53.559189,-2.930503,72.8;53.559308,-2.930527,72.0;53.559492,-2.930577,72.0;53.559919,-2.930692,71.6;53.559987,-2.930695,71.4;53.560058,-2.930686,71.2;53.560284,-2.930614,70.2;53.560439,-2.930550,69.8;53.560749,-2.930415,69.2;53.560971,-2.930324,68.4;53.561110,-2.930269,68.4;53.561427,-2.930103,69.6;53.561470,-2.930030,70.2;53.561499,-2.929941,70.6;53.561514,-2.929845,71.0;53.561517,-2.929745,71.2;53.561496,-2.929365,71.4;53.561482,-2.929102,72.4;53.561466,-2.928875,73.6;53.561456,-2.928651,74.8;53.561448,-2.928423,75.4;53.561434,-2.928206,75.6;53.561430,-2.928133,75.8;53.561411,-2.927788,77.0;53.561431,-2.927690,77.2;53.561504,-2.927709,77.4;53.561622,-2.927809,77.4;53.561719,-2.927883,77.2;53.561776,-2.927919,77.2;53.561940,-2.928043,76.8;53.562045,-2.928130,76.6;53.562319,-2.928323,76.2;53.562393,-2.928380,75.8;53.562462,-2.928438,75.6;53.562678,-2.928630,74.6;53.562913,-2.928852,73.6;53.562993,-2.928928,73.4;53.563328,-2.929213,72.2;53.563419,-2.929259,72.2;53.563881,-2.929383,71.8;53.564160,-2.929407,71.8;53.564348,-2.929394,71.0;53.564442,-2.929377,70.6;53.564641,-2.929326,70.0;53.564736,-2.929313,69.6;53.564829,-2.929310,69.4;53.564918,-2.929321,69.2;53.565179,-2.929413,69.4;53.565729,-2.929614,70.2;53.566175,-2.929766,70.2;53.566325,-2.929813,71.0;53.566721,-2.929930,70.8;53.567087,-2.930026,69.6;53.567189,-2.930034,69.0;53.567297,-2.930020,68.4;53.567404,-2.929987,67.6;53.567509,-2.929931,66.4;53.567616,-2.929851,65.4;53.567829,-2.929691,63.8;53.567937,-2.929605,63.0;53.568047,-2.929518,62.2;53.568278,-2.929351,61.0;53.568620,-2.929172,59.8;53.568839,-2.929193,58.4;53.568947,-2.929248,57.8;53.569053,-2.929316,57.2;53.569498,-2.929581,56.0;53.569726,-2.929696,55.0;53.569960,-2.929805,53.6;53.570193,-2.929911,52.4;53.570421,-2.930021,51.4;53.570538,-2.930070,50.6;53.570712,-2.930132,49.8;53.570885,-2.930194,49.4;53.571114,-2.930247,48.6;53.571326,-2.930304,48.4;53.571420,-2.930357,48.0;53.571581,-2.930545,47.6;53.571627,-2.930656,46.8;53.571673,-2.930767,46.2;53.571764,-2.930989,45.4;53.571828,-2.931146,44.8;53.571971,-2.931474,44.4;53.572113,-2.931802,43.6;53.572332,-2.932293,43.4;53.572480,-2.932614,43.2;53.572702,-2.933072,42.0;53.572848,-2.933371,41.6;53.573196,-2.934111,41.8;53.573323,-2.934410,42.0;53.573385,-2.934556,41.8;53.573559,-2.934989,41.4;53.573667,-2.935282,41.0;53.573731,-2.935441,40.8;53.574117,-2.936397,39.8;53.574254,-2.936643,39.2;53.574479,-2.936973,38.8;53.574699,-2.937295,38.0;53.574699,-2.937295,37.8;53.575034,-2.937839,37.6;53.575230,-2.938161,37.6;53.575362,-2.938367,37.6;53.575620,-2.938750,37.4;53.575734,-2.938938,37.6;53.575812,-2.939151,37.4;53.575904,-2.939489,37.0;53.575957,-2.939716,36.6;53.575985,-2.939828,36.2;53.576215,-2.940864,35.8;53.576240,-2.940985,35.8;53.576326,-2.941338,35.8;53.576430,-2.941515,35.6;53.576569,-2.941548,35.6;53.576905,-2.941394,35.8;53.577099,-2.941302,36.4;53.577231,-2.941244,36.6;53.577506,-2.941132,36.4;53.577579,-2.941114,36.2;53.577869,-2.941048,35.6;53.577943,-2.941047,35.4;53.578088,-2.941069,35.2;53.578235,-2.941107,34.8;53.578382,-2.941149,35.0;53.578597,-2.941179,35.6;53.578665,-2.941165,35.6;53.578731,-2.941132,35.8;53.578847,-2.941014,35.8;53.579049,-2.940595,35.6;53.579160,-2.940367,35.4;53.579282,-2.940194,35.6;53.579371,-2.940164,35.6;53.579414,-2.940194,35.8;53.579458,-2.940248,35.8;53.579526,-2.940394,36.0;53.579567,-2.940474,36.2;53.579757,-2.940824,36.2;53.579887,-2.941112,35.8;53.580180,-2.941815,36.0;53.580491,-2.942571,35.0;53.580582,-2.942794,34.8;53.580721,-2.943133,34.6;53.580896,-2.943583,35.0;53.581185,-2.944393,35.0;53.581272,-2.944616,35.0;53.581366,-2.944845,35.4;53.581542,-2.945122,35.2;53.581876,-2.945566,36.0;53.581912,-2.945641,36.6;53.581952,-2.945712,37.0;53.582071,-2.945818,37.0;53.582462,-2.946019,35.4;53.582622,-2.946100,34.8;53.582696,-2.946155,34.4;53.582769,-2.946210,34.0;53.582958,-2.946452,33.8;53.583016,-2.946538,33.8;53.583386,-2.947053,34.4;53.583509,-2.947202,34.2;53.583641,-2.947344,34.0;53.583703,-2.947424,34.0;53.583849,-2.947738,34.4;53.583890,-2.947855,34.6;53.584139,-2.948576,34.2;53.584181,-2.948694,34.0;53.584416,-2.949378,34.0;53.584684,-2.950266,34.2;53.584726,-2.950374,34.2;53.585017,-2.951113,33.6;53.585067,-2.951340,33.6;53.585071,-2.951456,33.6;53.585068,-2.951570,33.8;53.585050,-2.951813,33.8;53.585023,-2.952060,33.6;53.585009,-2.952304,33.4;53.585003,-2.952805,33.2;53.585004,-2.953161,33.0;53.584993,-2.953285,32.8;53.584970,-2.953404,32.4;53.584929,-2.953524,32.0;53.584822,-2.953723,31.6;53.584654,-2.953967,31.4;53.584560,-2.954116,31.4;53.584523,-2.954180,31.4;53.584389,-2.954387,31.4;53.584275,-2.954548,32.0;53.584100,-2.954782,32.4;53.584027,-2.954868,32.6;53.583969,-2.954951,32.6;53.583854,-2.955116,32.8;53.583669,-2.955362,33.0;53.583470,-2.955584,33.2;53.583331,-2.955709,33.0;53.583264,-2.955761,32.8;53.583001,-2.955965,32.2;53.582962,-2.956058,32.2;53.582932,-2.956169,32.2;53.582871,-2.956531,32.2;53.582757,-2.957193,31.6;53.582702,-2.957447,31.4;53.582533,-2.958211,31.8;53.582477,-2.958466,32.0;53.582365,-2.959001,32.2;53.582191,-2.959807,32.2;53.582170,-2.959941,32.4;53.582140,-2.960216,32.2;53.582147,-2.960509,32.2;53.582207,-2.960794,32.2;53.582307,-2.961056,32.2;53.582518,-2.961599,31.4;53.582629,-2.961875,31.0;53.582851,-2.962447,30.2;53.583081,-2.963035,29.4;53.583262,-2.963468,29.2;53.583446,-2.963864,29.2;53.583504,-2.963992,29.2;53.583780,-2.964562,30.6;53.583829,-2.964657,30.8;53.583916,-2.964854,31.6;53.584060,-2.965337,32.0;53.584331,-2.966253,30.2;53.584378,-2.966412,29.8;53.584473,-2.966740,29.2;53.584571,-2.967074,28.2;53.584768,-2.967737,27.2;53.584817,-2.967902,27.0;53.584966,-2.968393,26.6;53.585207,-2.969211,26.0;53.585304,-2.969536,25.6;53.585331,-2.969631,25.6;53.585357,-2.969726,25.6;53.585569,-2.970486,25.4;53.585608,-2.970644,25.4;53.585689,-2.971141,24.8;53.585698,-2.971309,24.8;53.585684,-2.972296,24.8;53.585649,-2.973257,25.6;53.585638,-2.973572,25.4;53.585631,-2.973886,25.2;53.585627,-2.974045,25.2;53.585598,-2.974982,25.0;53.585591,-2.975286,25.0;53.585573,-2.975744,25.2;53.585564,-2.975898,25.2;53.585560,-2.976054,25.2;53.585559,-2.976533,25.0;53.585586,-2.977495,24.8;53.585607,-2.977975,24.8;53.585661,-2.978920,25.0;53.585683,-2.979233,24.8;53.585746,-2.979691,24.8;53.585806,-2.979987,24.6;53.585889,-2.980428,24.4;53.586028,-2.981170,23.8;53.586120,-2.981442,23.6;53.586190,-2.981550,23.6;53.586481,-2.981947,23.8;53.586614,-2.982179,23.6;53.586998,-2.982925,23.2;53.587129,-2.983172,23.0;53.587261,-2.983426,22.6;53.587461,-2.983810,22.0;53.587790,-2.984445,22.6;53.587856,-2.984573,22.6;53.588256,-2.985344,22.2;53.588514,-2.985867,22.0;53.588893,-2.986633,22.2;53.588952,-2.986763,22.4;53.589160,-2.987272,21.6;53.589211,-2.987396,21.8;53.589261,-2.987521,21.8;53.589501,-2.988151,21.6;53.589638,-2.988569,21.6;53.589792,-2.989135,21.8;53.589824,-2.989235,21.8;53.589856,-2.989335,21.8;53.589920,-2.989536,22.0;53.590094,-2.990080,21.8;53.590094,-2.990080,21.8;53.590380,-2.990876,21.6;53.590380,-2.990876,21.6;53.590718,-2.991621,21.6;53.590951,-2.992097,21.8;53.591107,-2.992473,21.8;53.591222,-2.992705,21.4;53.591555,-2.993433,22.4;53.591724,-2.993805,22.6;53.592061,-2.994523,22.4;53.592112,-2.994647,22.4;53.592357,-2.995190,22.2;53.592439,-2.995306,22.0;53.592542,-2.995348,21.6;53.592786,-2.995412,21.0;53.592851,-2.995436,21.2;53.592986,-2.995490,21.4;53.592986,-2.995490,21.4;53.593378,-2.995640,22.4;53.593897,-2.995841,21.2;53.593987,-2.995876,21.0;53.594422,-2.996047,21.2;53.594681,-2.996152,21.2;53.595279,-2.996418,21.2;53.595532,-2.996510,21.2;53.595949,-2.996533,21.2;53.596031,-2.996527,21.2;53.596266,-2.996549,21.0;53.596353,-2.996577,21.0;53.596511,-2.996720,21.0;53.596635,-2.997108,21.0;53.596713,-2.997378,20.6;53.596922,-2.998061,20.2;53.597003,-2.998336,20.0;53.597063,-2.998625,19.8;53.597093,-2.998933,20.0;53.597160,-2.999987,20.6;53.597174,-3.000421,20.2;53.597184,-3.000559,20.0;53.597194,-3.000697,20.0;53.597202,-3.000837,19.4;53.597209,-3.000974,19.0;53.597224,-3.001257,19.0;53.597255,-3.001835,19.6;53.597262,-3.001981,19.8;53.597289,-3.002422,20.4;53.597332,-3.003014,20.6;53.597342,-3.003163,20.6;53.597362,-3.003462,20.8;53.597390,-3.003916,21.0;53.597450,-3.004831,21.2;53.597461,-3.004981,21.0;53.597502,-3.005575,21.0;53.597502,-3.005575,21.0;53.597577,-3.006768,21.2;53.597587,-3.006918,21.2;53.597650,-3.007839,21.0;53.597707,-3.008615,21.0;53.597717,-3.008768,21.0;53.597725,-3.008921,21.0;53.597744,-3.009230,21.2;53.597772,-3.009700,21.6;53.597805,-3.010167,21.4;53.597819,-3.010322,21.2;53.597885,-3.010780,20.8;53.597898,-3.010855,21.0;53.597910,-3.010931,20.8;53.597936,-3.011079,20.8;53.597987,-3.011373,20.6;53.598036,-3.011672,20.6;53.598061,-3.011821,20.6;53.598133,-3.012261,20.4;53.598210,-3.012689,20.0;53.598333,-3.013254,20.4;53.598397,-3.013542,20.4;53.598431,-3.013689,20.4;53.598493,-3.013993,20.6;53.598642,-3.014951,20.8;53.598682,-3.015275,21.0;53.598800,-3.016241,21.4;53.598876,-3.016862,21.6;53.598952,-3.017474,21.6;53.599080,-3.018430,20.8;53.599100,-3.018591,20.8;53.599230,-3.019539,20.6;53.599255,-3.019696,20.6;53.599281,-3.019852,20.4;53.599420,-3.020628,20.8;53.599507,-3.021099,20.8;53.599697,-3.022021,21.6;53.599823,-3.022628,21.2;53.599940,-3.023239,20.8;53.600014,-3.023689,21.0;53.600065,-3.023978,21.6;53.600139,-3.024257,21.6;53.600187,-3.024382,21.6;53.600310,-3.024590,21.6;53.600376,-3.024693,21.6;53.600439,-3.024847,21.4;53.600628,-3.025311,21.2;53.600922,-3.026102,21.4;53.600974,-3.026235,21.6;53.601280,-3.027063,22.2;53.601329,-3.027207,22.2;53.601532,-3.027783,22.6;53.601635,-3.028065,23.0;53.601933,-3.028898,23.6;53.601975,-3.028987,23.6;53.602017,-3.029077,24.0;53.602100,-3.029256,24.2;53.602344,-3.029689,24.6;53.602407,-3.029790,24.8;53.602466,-3.029892,24.8;53.602772,-3.030414,26.0;53.602966,-3.030741,27.0;53.603028,-3.030854,27.2;53.603234,-3.031217,27.6;53.603234,-3.031217,27.6;53.603253,-3.031335,27.8;53.603228,-3.031524,28.4;53.603214,-3.031646,28.8;53.603172,-3.032027,28.8;53.603163,-3.032111,28.6;53.603128,-3.032372,28.6;53.603100,-3.032557,28.8;53.603006,-3.033304,28.8;53.602953,-3.034002,12.0;53.602683,-3.034812,12.0;53.602574,-3.035354,12.0;53.602170,-3.038439,13.0;53.602030,-3.040563,13.0;53.602036,-3.041174,13.0;53.602189,-3.042129,13.0;53.601954,-3.042215,13.0;53.599764,-3.044447,14.0;53.599356,-3.043149,12.0;53.599254,-3.041518,12.0;53.598573,-3.039554,11.0;53.597745,-3.039951,10.0;53.597280,-3.037387,9.0;53.596917,-3.036325,9.0;53.596596,-3.036537,27.0;53.596473,-3.036664,26.8;53.595989,-3.037167,26.8;53.595509,-3.037650,27.8;53.595136,-3.038031,27.4;53.594896,-3.038283,27.2;53.594713,-3.038458,27.6;53.594583,-3.038559,27.6;53.594516,-3.038604,27.6;53.594450,-3.038646,27.6;53.593976,-3.038864,27.4;53.593698,-3.038890,27.8;53.593563,-3.038905,27.6;53.593101,-3.038943,27.4;53.592966,-3.038954,27.2;53.592435,-3.038979,28.2;53.591971,-3.038943,27.2;53.591902,-3.038933,27.2;53.591698,-3.038909,27.2;53.591628,-3.038902,27.4;53.591558,-3.038900,27.4;53.591488,-3.038902,27.4;53.591418,-3.038905,27.4;53.591348,-3.038915,27.4;53.591276,-3.038926,27.4;53.591207,-3.038943,27.4;53.590861,-3.039037,27.2;53.590794,-3.039059,27.2;53.590656,-3.039110,27.4;53.590588,-3.039139,27.4;53.590455,-3.039205,27.6;53.590390,-3.039239,27.6;53.590263,-3.039309,27.6;53.589876,-3.039525,27.4;53.589746,-3.039598,27.2;53.589614,-3.039677,27.0;53.589075,-3.039968,27.0;53.588684,-3.040137,26.8;53.588511,-3.040301,26.6;53.588486,-3.040336,26.6;53.588461,-3.040371,26.6;53.588360,-3.040510,26.8;53.588138,-3.040630,26.8;53.588049,-3.040613,26.6;53.587958,-3.040670,26.4;53.587908,-3.040695,26.2;53.587800,-3.040740,26.0;53.587687,-3.040791,26.0;53.587577,-3.040838,26.0;53.587276,-3.041016,26.4;53.587228,-3.041060,26.4;53.587133,-3.041150,26.4;53.587084,-3.041191,26.4;53.586864,-3.041529,26.6;53.586676,-3.041878,27.0;53.586635,-3.041964,27.0;53.586595,-3.042048,26.8;53.586281,-3.042679,27.2;53.586243,-3.042756,27.2;53.586202,-3.042831,27.2;53.586110,-3.042968,27.4;53.586063,-3.043034,27.4;53.585763,-3.043409,27.6;53.585604,-3.043589,27.6;53.585380,-3.043822,27.2;53.585100,-3.044111,27.0;53.584617,-3.044613,27.4;53.584128,-3.045126,26.8;53.584074,-3.045185,27.0;53.583586,-3.045714,27.6;53.583110,-3.046210,27.8;53.582894,-3.046445,27.6;53.582569,-3.046803,27.4;53.582173,-3.047214,27.6;53.582061,-3.047331,27.6;53.581833,-3.047556,27.6;53.581653,-3.047753,27.8;53.581392,-3.048024,27.0;53.581131,-3.048315,27.4;53.580695,-3.048768,27.2;53.580204,-3.049239,27.2;53.580076,-3.049349,27.4;53.579560,-3.049763,27.6;53.579361,-3.049905,27.8;53.578812,-3.050261,27.6;53.578672,-3.050343,27.6;53.578604,-3.050382,27.4;53.578467,-3.050457,27.2;53.578191,-3.050596,26.4;53.577920,-3.050719,26.4;53.577517,-3.050877,26.6;53.577378,-3.050925,26.2;53.577027,-3.051028,26.2;53.576820,-3.051081,26.4;53.576279,-3.051190,26.0;53.576213,-3.051199,26.0;53.575671,-3.051255,26.0;53.575536,-3.051263,25.8;53.575197,-3.051266,25.8;53.575064,-3.051262,25.8;53.574798,-3.051252,25.4;53.574411,-3.051205,25.0;53.574095,-3.051153,24.6;53.573595,-3.051023,24.4;53.573074,-3.050841,25.4;53.572511,-3.050602,24.4;53.572227,-3.050461,24.4;53.572175,-3.050437,24.4;53.572080,-3.050383,24.6;53.571952,-3.050298,25.0;53.571933,-3.050285,25.2;53.571919,-3.050358,25.2;53.571925,-3.050389,25.4;53.571906,-3.050447,25.4;53.571883,-3.050483,25.4;53.571839,-3.050592,25.2;53.571811,-3.050671,25.0;53.571727,-3.050935,25.0;53.571703,-3.050973,24.6;53.571611,-3.050945,24.6;53.571490,-3.050884,24.2;53.571398,-3.050886,24.0;53.571326,-3.050968,24.0;53.571305,-3.051035,24.0;53.571272,-3.051184,24.2;53.571174,-3.051612,24.2;53.571046,-3.052163,24.2;53.570982,-3.052445,24.4;53.570959,-3.052541,24.4;53.570767,-3.053188,24.0;53.570738,-3.053277,23.8;53.570617,-3.053616,23.6;53.570605,-3.053702,23.8;53.570605,-3.053789,23.6;53.570598,-3.053965,23.4;53.570585,-3.054050,23.4;53.570480,-3.054518,23.6;53.570413,-3.054811,23.6;53.570300,-3.055302,23.6;53.570250,-3.055501,24.2;53.570174,-3.055803,24.6;53.569983,-3.056630,24.4;53.569961,-3.056734,24.4;53.569950,-3.056839,24.4;53.569983,-3.057035,24.4;53.570087,-3.057152,24.6;53.570149,-3.057188,24.6;53.570464,-3.057356,24.6;53.570561,-3.057572,24.6;53.570550,-3.057668,24.6;53.570487,-3.057986,24.4;53.570386,-3.058482,24.4;53.570365,-3.058571,24.6;53.570347,-3.058654,24.8;53.570347,-3.058654,25.0;53.570362,-3.058793,25.0;53.570411,-3.058828,25.0;53.570459,-3.058864,25.0;53.570509,-3.058901,25.0;53.570544,-3.058958,25.2;53.570543,-3.059025,25.2;53.570541,-3.059092,25.2;53.570538,-3.059226,25.2;53.570439,-3.059951,24.8;53.570315,-3.060887,25.2;53.570302,-3.060991,25.4;53.570257,-3.061294,25.2;53.570182,-3.061564,25.0;53.570110,-3.061936,24.8;53.570085,-3.062137,24.8;53.569997,-3.062878,25.4;53.569972,-3.063094,25.4;53.569931,-3.063419,25.2;53.569882,-3.063836,25.0;53.569849,-3.064130,25.0;53.569814,-3.064304,25.0;53.569784,-3.064355,25.2;53.569744,-3.064370,25.2;53.569639,-3.064331,25.4;53.569411,-3.064236,25.2;53.569183,-3.064138,25.2;53.568885,-3.064021,25.6;53.568829,-3.064066,25.6;53.568829,-3.064066,25.6;53.568816,-3.064334,25.4;53.568816,-3.064420,25.2;53.568796,-3.064809,25.0;53.568709,-3.065789,25.0;53.568630,-3.066432,25.0;53.568597,-3.066646,25.0;53.568582,-3.066749,25.0;53.568482,-3.067260,25.4;53.568452,-3.067358,25.6;53.568413,-3.067443,25.6;53.568310,-3.067543,25.2;53.568068,-3.067523,25.2;53.567634,-3.067346,25.6;53.567379,-3.067270,25.2;53.567247,-3.067244,25.2;53.567060,-3.067159,25.4;53.566935,-3.067111,25.4;53.566815,-3.067061,25.4;53.566692,-3.066968,25.4;53.566634,-3.066916,25.6;53.566138,-3.066446,25.6;53.566076,-3.066389,25.6;53.565828,-3.066139,26.0;53.565655,-3.065954,25.8;53.565407,-3.065725,25.6;53.565342,-3.065670,25.4;53.565276,-3.065616,25.6;53.564833,-3.065300,25.4;53.564779,-3.065281,25.6;53.564700,-3.065337,25.8;53.564652,-3.065478,25.6;53.564615,-3.065656,25.6;53.564497,-3.066382,26.2;53.564339,-3.067281,25.6;53.564300,-3.067516,25.4;53.564237,-3.067865,25.4;53.564182,-3.068207,25.4;53.564127,-3.068544,25.6;53.564085,-3.068746,25.6;53.563939,-3.069384,25.6;53.563857,-3.069887,25.0;53.563795,-3.070334,25.0;53.563788,-3.070378,25.2;53.563772,-3.070406,25.2;53.563723,-3.070396,25.2;53.563541,-3.070350,25.2;53.563488,-3.070333,25.2;53.563433,-3.070318,25.2;53.563248,-3.070268,25.0;53.563057,-3.070219,24.8;53.562661,-3.070082,24.6;53.562322,-3.069978,24.6;53.562253,-3.069954,24.8;53.562042,-3.069882,24.8;53.561907,-3.069832,24.8;53.561840,-3.069807,24.8;53.561751,-3.069775,24.6;53.561574,-3.069711,24.4;53.561383,-3.069643,24.6;53.560992,-3.069513,24.8;53.560585,-3.069371,24.8;53.560161,-3.069253,24.8;53.560026,-3.069214,24.4;53.559675,-3.069089,24.6;53.559603,-3.069075,24.6;53.559167,-3.068929,24.8;53.559023,-3.068870,24.6;53.558822,-3.068813,24.2;53.558354,-3.068680,24.6;53.558151,-3.068626,25.0;53.557884,-3.068555,24.8;53.557564,-3.068526,24.8;53.557047,-3.068549,25.4;53.556762,-3.068558,25.4;53.556697,-3.068568,25.2;53.556555,-3.068563,25.0;53.556175,-3.068546,25.4;53.555816,-3.068547,25.4;53.555302,-3.068534,25.2;53.554890,-3.068521,25.6;53.554579,-3.068527,25.6;53.554522,-3.068513,25.6;53.554137,-3.068328,25.4;53.553863,-3.068215,25.4;53.553766,-3.068098,25.4;53.553714,-3.068052,25.4;53.553670,-3.068060,25.6;53.553633,-3.068106,25.6;53.553611,-3.068185,25.8;53.553593,-3.068370,25.8;53.553557,-3.068832,26.0;53.553520,-3.069110,26.6;53.553477,-3.069400,27.2;53.553430,-3.069778,27.8;53.553403,-3.070037,28.2;53.553361,-3.070380,28.8;53.553342,-3.070548,29.2;53.553306,-3.070877,29.6;53.553294,-3.070967,29.6;53.553219,-3.071678,29.4;53.553182,-3.072039,27.8;53.553121,-3.072668,27.0;53.553078,-3.073066,26.4;53.553039,-3.073475,25.4;53.553026,-3.073602,25.2;53.553011,-3.073706,25.0;53.552989,-3.073768,24.8;53.552947,-3.073750,24.8;53.552944,-3.073686,24.8;53.552960,-3.073432,24.4;53.552990,-3.073158,23.8;53.553033,-3.072519,24.4;53.553053,-3.072243,24.6;53.553122,-3.071329,24.2;53.553118,-3.071243,24.2;53.553060,-3.071106,24.4;53.552963,-3.071068,24.8;53.552916,-3.071063,25.0;53.552812,-3.071064,25.2;53.552757,-3.071061,25.2;53.552702,-3.071057,25.2;53.552648,-3.071052,25.2;53.552593,-3.071046,25.2;53.552537,-3.071044,25.2;53.552426,-3.071037,25.2;53.552205,-3.071009,25.4;53.551798,-3.070972,25.4;53.551317,-3.070943,25.0;53.551221,-3.070935,25.0;53.551201,-3.070936,25.2;53.551184,-3.070936,25.2;53.551166,-3.070935,25.2;53.550989,-3.070989,25.0;53.550706,-3.071072,24.6;53.550333,-3.071171,24.2;53.550104,-3.071261,24.2;53.549922,-3.071296,24.2;53.549475,-3.071327,24.6;53.549282,-3.071309,24.4;53.549219,-3.071295,24.0;53.549091,-3.071274,23.6;53.548699,-3.071238,23.8;53.548516,-3.071208,24.0;53.548201,-3.071130,23.4;53.548137,-3.071115,23.2;53.547548,-3.071021,23.2;53.547111,-3.070961,23.2;53.546712,-3.070946,23.4;53.546606,-3.070973,23.4;53.546491,-3.071019,23.2;53.546308,-3.071031,22.6;53.546122,-3.071039,22.4;53.546059,-3.071038,22.4;53.545766,-3.071055,22.6;53.545714,-3.071079,22.6;53.545621,-3.071108,22.6;53.545076,-3.070936,6.0;53.543597,-3.069499,3.0;53.543533,-3.068812,3.0;53.544082,-3.067632,3.0;53.543584,-3.067009,5.0;53.541072,-3.065572,6.0;53.532286,-3.060540,4.0;53.531769,-3.060347,4.0;53.528313,-3.058469,7.0;53.528058,-3.058480,7.0;53.525685,-3.057536,7.0;53.524856,-3.057429,9.0;53.524786,-3.058201,8.0;53.523759,-3.057965,9.0;53.523211,-3.058137,8.0;53.521450,-3.057740,10.0;53.521195,-3.057193,9.0;53.520621,-3.056989,8.0;53.519945,-3.056999,9.0;53.519173,-3.057311,9.0;53.518070,-3.057289,9.0;53.516220,-3.057450,8.0;53.515594,-3.057632,8.0;53.514523,-3.058223,8.0;53.514165,-3.058791,8.0;53.513604,-3.058705,8.0;53.513081,-3.058813,7.0;53.512475,-3.058534,8.0;53.512379,-3.060282,8.0;53.512545,-3.061055,8.0;53.512513,-3.061731,7.0;53.512660,-3.062160,7.0;53.512232,-3.062890,3.0;53.511569,-3.062611,0.0;53.510937,-3.062278,8.0;53.510357,-3.062375,7.0;53.509891,-3.062375,7.0;53.508321,-3.061924,4.0;53.507281,-3.061870,3.0;53.506458,-3.062214,5.0;53.504244,-3.061527,5.0;53.500115,-3.059886,7.0;53.499694,-3.059371,5.0;53.497933,-3.058609,7.0;53.497613,-3.058748,7.0;53.496669,-3.058394,6.0;53.496745,-3.057654,6.0;53.496637,-3.056989,9.0;53.494812,-3.055959,9.0;53.493382,-3.054897,9.0;53.492278,-3.054188,8.0;53.491550,-3.054199,8.0;53.490669,-3.053641,8.0;53.489858,-3.052568,8.0;53.489361,-3.051420,9.0;53.486392,-3.048073,9.0;53.484981,-3.046228,9.0;53.484854,-3.046474,9.0;53.482855,-3.044297,9.0;53.482211,-3.045756,7.0;53.481872,-3.045809,7.0;53.481438,-3.045058,7.0;53.481744,-3.044082,9.0;53.480353,-3.042537,7.0;53.479957,-3.041604,7.0;53.477831,-3.038664,9.0;53.477192,-3.037602,6.0;53.477141,-3.037194,7.0;53.477313,-3.036851,7.0;53.476151,-3.034544,11.0;53.475002,-3.032924,9.0;53.474593,-3.032141,9.0;53.473048,-3.030038,7.0;53.475890,-3.023708,13.0;53.476745,-3.024770,14.0';

  function buildDemoTrackFallbackGpx() {
    const trkpts = DEMO_TRACK_FALLBACK_PTS.split(';').map((item, idx) => {
      const [lat, lon, ele] = item.split(',');
      const eleXml = ele ? `<ele>${ele}</ele>` : '';
      return `<trkpt lat="${lat}" lon="${lon}">${eleXml}<name>${formatWaypointName(idx + 1)}</name></trkpt>`;
    }).join('\n      ');
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX Builder" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Cycle on the Moss</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  }

  el.btnLoadSample.addEventListener('click', async () => {
    try {
      const res = await fetch('Cycle_on_the_Moss.gpx');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sampleGpx = await res.text();
      await parseAndLoadGpxString(sampleGpx, 'Cycle on the Moss');
    } catch (_err) {
      // Fallback if opened locally via file:// protocol where fetch is blocked by CORS
      const fallbackGpx = buildDemoTrackFallbackGpx();
      await parseAndLoadGpxString(fallbackGpx, 'Cycle on the Moss');
    }
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
<gpx version="1.1" creator="GPX Builder" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
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
