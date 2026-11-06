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
    nextTrackNumber: 1,
    inspectorMarker: null,
    searchMarker: null,
    previewLine: null, // Rubber-band line while creating/extending
    suppressNextMapClick: false
  };

  // ==================== MAP INITIALIZATION & LAYERS ====================
  // Default center: Lake District / Peak District UK (classic Memory-Map territory)
  const map = L.map('map', {
    center: [54.455, -3.088],
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
  let currentBaseLayer = baseLayers.osm.addTo(map);

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

  // Also add Leaflet's native layer switcher on top-right of map for convenience
  L.control.layers(
    {
      'OpenStreetMap Standard': baseLayers.osm,
      'CyclOSM (Cycle Map)': baseLayers.cyclosm,
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

  // Sync sidebar layer controls with map layers
  document.querySelectorAll('input[name="base-layer"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const val = e.target.value;
      if (baseLayers[val]) {
        map.removeLayer(currentBaseLayer);
        currentBaseLayer = baseLayers[val].addTo(map);
      }
    });
  });

  map.on('baselayerchange', (e) => {
    const mapKey = {
      'OpenStreetMap Standard': 'osm',
      'CyclOSM (Cycle Map)': 'cyclosm',
      'OpenTopoMap (Topographic)': 'opentopo',
      'OSM Humanitarian': 'humanitarian'
    }[e.name];
    if (mapKey) {
      currentBaseLayer = baseLayers[mapKey];
      const radio = document.querySelector(`input[name="base-layer"][value="${mapKey}"]`);
      if (radio) radio.checked = true;
    }
  });

  const bindOverlayCheckbox = (checkboxId, overlayKey) => {
    const cb = document.getElementById(checkboxId);
    if (!cb) return;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        overlayLayers[overlayKey].addTo(map);
      } else {
        map.removeLayer(overlayLayers[overlayKey]);
      }
    });
  };
  bindOverlayCheckbox('overlay-cycling', 'cycling');
  bindOverlayCheckbox('overlay-hiking', 'hiking');
  bindOverlayCheckbox('overlay-scaleGrid', 'scaleGrid');

  map.on('overlayadd', (e) => {
    if (e.name.includes('Cycling')) document.getElementById('overlay-cycling').checked = true;
    if (e.name.includes('Hiking')) document.getElementById('overlay-hiking').checked = true;
    if (e.name.includes('Grid')) document.getElementById('overlay-scaleGrid').checked = true;
  });
  map.on('overlayremove', (e) => {
    if (e.name.includes('Cycling')) document.getElementById('overlay-cycling').checked = false;
    if (e.name.includes('Hiking')) document.getElementById('overlay-hiking').checked = false;
    if (e.name.includes('Grid')) document.getElementById('overlay-scaleGrid').checked = false;
  });

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

  // ==================== GEOMETRY & HAVERSINE HELPERS ====================
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
  function createTrackObject(name, waypoints = []) {
    const id = 'trk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const color = TRACK_COLORS[(state.tracks.length) % TRACK_COLORS.length];
    const track = {
      id,
      name: name || `Track ${state.nextTrackNumber++}`,
      color,
      waypoints, // [{ lat, lng, ele, name }]
      polyline: null,
      hitPolyline: null, // Wider invisible polyline for easier clicking on mobile/desktop
      markers: [],
      stats: computeTrackStats(waypoints)
    };
    return track;
  }

  function getActiveTrack() {
    return state.tracks.find((t) => t.id === state.activeTrackId) || null;
  }

  function getTrackById(id) {
    return state.tracks.find((t) => t.id === id) || null;
  }

  /**
   * Renders or updates a track's semi-transparent polyline and waypoint markers on the Leaflet map
   */
  function renderTrackOnMap(track) {
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
        state.suppressNextMapClick = true;
        handleTrackLineClick(track, e.latlng);
      };

      track.polyline.on('click', onLineClick);
      track.hitPolyline.on('click', onLineClick);
    } else {
      track.polyline.setLatLngs(latlngs);
      track.hitPolyline.setLatLngs(latlngs);
      track.polyline.setStyle({
        color: track.color,
        weight: isActive ? 5 : 4,
        opacity: isActive ? 0.68 : 0.48
      });
    }

    // 2. Waypoint Markers
    // Clear existing markers and recreate
    track.markers.forEach((m) => map.removeLayer(m));
    track.markers = [];

    const showAllMarkers = isActive && (
      state.mode === 'creating' ||
      state.mode === 'editing' ||
      state.mode === 'extending_after' ||
      state.mode === 'extending_before'
    );

    track.waypoints.forEach((wp, index) => {
      const isFirst = index === 0;
      const isLast = index === track.waypoints.length - 1;

      // When not active/editing, still show start & end markers or subtle dots
      if (!showAllMarkers && !isFirst && !isLast && track.waypoints.length > 30 && index % 5 !== 0) {
        return;
      }

      let markerClass = 'wp-marker wp-mid';
      let size = isActive ? 12 : 8;
      if (isFirst) {
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

      const isDraggable = isActive && (state.mode === 'editing' || state.mode === 'creating');

      const marker = L.marker([wp.lat, wp.lng], {
        icon,
        draggable: isDraggable,
        title: `Waypoint #${index + 1}`
      }).addTo(map);

      // Click on waypoint
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        state.suppressNextMapClick = true;

        // If user clicks a waypoint while in idle or creating mode, switch to edit mode on this track
        if (state.activeTrackId !== track.id || state.mode === 'idle' || state.mode === 'creating') {
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
   * Handles clicking on a track line:
   * - If not currently editing this track -> enters Edit Mode on this track.
   * - If already editing this track (or immediately upon clicking the segment) -> offers to insert a waypoint between the two surrounding waypoints!
   */
  function handleTrackLineClick(track, clickLatLng) {
    const wasAlreadyEditingThisTrack = (state.activeTrackId === track.id && state.mode === 'editing');

    if (!wasAlreadyEditingThisTrack) {
      enterEditMode(track.id);
    }

    // Also show popup to insert a waypoint on the clicked line segment
    if (track.waypoints.length >= 2) {
      const segIndex = findClosestSegmentIndex(track.waypoints, clickLatLng);
      openSegmentInsertPopup(track, segIndex, clickLatLng);
    }
  }

  /**
   * Opens popup when clicking on a line segment between two waypoints (Edit requirement #5)
   */
  function openSegmentInsertPopup(track, segIndex, clickLatLng) {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="popup-title">
        <span>Track Segment (#${segIndex + 1} &rarr; #${segIndex + 2})</span>
      </div>
      <div class="popup-coords">
        Lat: ${clickLatLng.lat.toFixed(5)}, Lon: ${clickLatLng.lng.toFixed(5)}
      </div>
      <div class="popup-detail">
        Editing <strong>${escapeHtml(track.name)}</strong>
      </div>
      <div class="popup-actions">
        <button type="button" class="popup-btn primary" id="popup-insert-between-btn">
          + Add Waypoint Here (Between #${segIndex + 1} &amp; #${segIndex + 2})
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
        ele: null
      };
      track.waypoints.splice(segIndex + 1, 0, newWp);
      renderTrackOnMap(track);
      updateTrackStatsAndUI(track.id);
      await fetchElevationsForWaypoints([newWp], track.id);
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

    let badgeRole = 'Intermediate Waypoint';
    if (isFirst && isLast) badgeRole = 'Single Waypoint';
    else if (isFirst) badgeRole = 'Start Waypoint (First)';
    else if (isLast) badgeRole = 'End Waypoint (Last)';

    const elevStr = typeof wp.ele === 'number' ? `${wp.ele} m` : 'Fetching...';

    const container = document.createElement('div');
    container.innerHTML = `
      <div class="popup-title">
        <span>Waypoint #${index + 1} of ${total}</span>
      </div>
      <div class="popup-coords">
        Lat: ${wp.lat.toFixed(5)}, Lon: ${wp.lng.toFixed(5)}<br/>
        Elevation: ${elevStr}
      </div>
      <div class="popup-detail">
        ${badgeRole} &bull; <em>Drag marker to move</em>
      </div>
      <div class="popup-actions">
        ${isFirst ? `
          <button type="button" class="popup-btn accent" id="popup-add-before-btn">
            &larr; Add Waypoint Before Start
          </button>
        ` : ''}
        ${isLast ? `
          <button type="button" class="popup-btn primary" id="popup-add-after-btn">
            + Add Waypoint After End &rarr;
          </button>
        ` : ''}
        <button type="button" class="popup-btn danger" id="popup-delete-wp-btn">
          Delete Waypoint #${index + 1}
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
    el.cursorCoords.textContent = `Lat: ${e.latlng.lat.toFixed(5)} , Lon: ${e.latlng.lng.toFixed(5)}`;
    if (state.mode === 'creating' || state.mode === 'extending_after' || state.mode === 'extending_before') {
      updatePreviewLine(e.latlng);
    }
  });

  map.on('click', async (e) => {
    if (state.suppressNextMapClick) {
      state.suppressNextMapClick = false;
      return;
    }

    const { lat, lng } = e.latlng;
    const activeTrack = getActiveTrack();

    // 1. Creating a new track or appending after last waypoint
    if ((state.mode === 'creating' || state.mode === 'extending_after') && activeTrack) {
      const wp = { lat, lng, ele: null };
      activeTrack.waypoints.push(wp);
      renderTrackOnMap(activeTrack);
      updateTrackStatsAndUI(activeTrack.id);
      await fetchElevationsForWaypoints([wp], activeTrack.id);
      return;
    }

    // 2. Prepending before first waypoint
    if (state.mode === 'extending_before' && activeTrack) {
      const wp = { lat, lng, ele: null };
      activeTrack.waypoints.unshift(wp);
      renderTrackOnMap(activeTrack);
      updateTrackStatsAndUI(activeTrack.id);
      await fetchElevationsForWaypoints([wp], activeTrack.id);
      return;
    }

    // 3. In Idle or Editing mode: clicking empty map inspects that point (Requirement #4)
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

    const initialHtml = `
      <div class="popup-title">Point Information</div>
      <div class="popup-coords">
        Lat: ${lat.toFixed(6)}<br/>
        Lon: ${lng.toFixed(6)}
      </div>
      <div class="popup-detail">Fetching elevation &amp; place details...</div>
    `;

    state.inspectorMarker.bindPopup(initialHtml).openPopup();

    el.pointInspector.innerHTML = `
      <div class="inspector-grid">
        <span class="inspector-key">Latitude:</span>
        <span class="inspector-val">${lat.toFixed(6)}&deg;</span>
        <span class="inspector-key">Longitude:</span>
        <span class="inspector-val">${lng.toFixed(6)}&deg;</span>
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
          Lat: ${lat.toFixed(6)}<br/>
          Lon: ${lng.toFixed(6)}<br/>
          Elev: ${elevText}
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
      const item = document.createElement('div');
      item.className = `track-item ${track.id === state.activeTrackId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="track-item-left">
          <span class="track-color-swatch" style="background:${track.color}"></span>
          <div class="track-item-info">
            <div class="track-item-title">${escapeHtml(track.name)}</div>
            <div class="track-item-sub">${stats.distanceKm.toFixed(2)} km &bull; +${stats.elevGain}m / -${stats.elevLoss}m &bull; ${track.waypoints.length} pts</div>
          </div>
        </div>
        <div class="track-item-actions">
          <button type="button" class="track-action-btn" data-action="zoom" title="Zoom to whole track">Fit</button>
          <button type="button" class="track-action-btn" data-action="edit" title="Edit track">Edit</button>
          <button type="button" class="track-action-btn delete" data-action="delete" title="Remove track">&times;</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('.track-action-btn');
        if (actionBtn) {
          const action = actionBtn.dataset.action;
          if (action === 'zoom') {
            fitTrackBounds(track);
          } else if (action === 'edit') {
            enterEditMode(track.id);
          } else if (action === 'delete') {
            deleteTrack(track.id);
          }
          return;
        }
        enterEditMode(track.id);
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
    const nowIso = new Date().toISOString();
    const stats = computeTrackStats(track.waypoints);
    const trkptsXml = track.waypoints
      .map((wp, idx) => {
        const eleTag = typeof wp.ele === 'number' && !isNaN(wp.ele) ? `\n        <ele>${wp.ele.toFixed(1)}</ele>` : '';
        return `      <trkpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}">${eleTag}\n        <name>WP ${idx + 1}</name>\n      </trkpt>`;
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
