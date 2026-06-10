// App Variables
let selectedOrigin = null;
let selectedDestination = null;
let mapData = null;

// Leaflet Map & Layer References
let map = null;
let tileLayer = null;
let geojsonLayer = null;
let originMarker = null;
let destMarker = null;
let flightPathPolyline = null;
let flightPathGlowPolyline = null;
let planeMarker = null;
let planeShadowMarker = null;
let animationFrameId = null;
let animationTimeoutId = null;

// Initialize when the DOM loads
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    initTheme();
    setupDropdowns();
    setupMap();
    setupControls();
}

// ----------------------------------------------------
// Custom Dropdown Select Logic
// ----------------------------------------------------
function setupDropdowns() {
    const originContainer = document.getElementById("origin-select-container");
    const originTrigger = document.getElementById("origin-trigger");
    const originDropdown = document.getElementById("origin-dropdown");
    const originSearch = document.getElementById("origin-search");
    const originOptions = document.getElementById("origin-options");

    const destContainer = document.getElementById("destination-select-container");
    const destTrigger = document.getElementById("destination-trigger");
    const destDropdown = document.getElementById("destination-dropdown");
    const destSearch = document.getElementById("destination-search");
    const destOptions = document.getElementById("destination-options");

    // Prevent propagation inside search boxes so typing/clicking doesn't close dropdown
    originSearch.addEventListener("click", (e) => e.stopPropagation());
    destSearch.addEventListener("click", (e) => e.stopPropagation());

    // Populate Origins
    ORIGINS_DATABASE.forEach(item => {
        const li = document.createElement("li");
        li.dataset.id = item.id;
        li.innerHTML = `
            ${getFlagHTMLFromEmoji("🇮🇳")}
            <span>${item.name}</span>
            <span class="airport-badge">${item.code}</span>
        `;
        li.addEventListener("click", () => {
            selectOriginItem(item);
            closeAllDropdowns();
        });
        originOptions.appendChild(li);
    });

    // Populate Destinations
    DESTINATIONS_DATABASE.forEach(item => {
        const li = document.createElement("li");
        li.dataset.id = item.id;
        li.innerHTML = `
            ${getFlagHTMLFromEmoji(item.flag)}
            <span>${item.name}</span>
            <span class="airport-badge">${item.code}</span>
        `;
        li.addEventListener("click", () => {
            selectDestinationItem(item);
            closeAllDropdowns();
        });
        destOptions.appendChild(li);
    });

    // Toggle Origins Dropdown
    originTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !originDropdown.classList.contains("hidden");
        closeAllDropdowns();
        if (!isOpen) {
            originContainer.classList.add("open");
            originDropdown.classList.remove("hidden");
            originSearch.value = "";
            filterOptions(originOptions, "");
            setTimeout(() => originSearch.focus(), 50);
        }
    });

    // Toggle Destinations Dropdown
    destTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !destDropdown.classList.contains("hidden");
        closeAllDropdowns();
        if (!isOpen) {
            destContainer.classList.add("open");
            destDropdown.classList.remove("hidden");
            destSearch.value = "";
            filterOptions(destOptions, "");
            setTimeout(() => destSearch.focus(), 50);
        }
    });

    // Search Filtering
    originSearch.addEventListener("input", (e) => {
        filterOptions(originOptions, e.target.value);
    });

    destSearch.addEventListener("input", (e) => {
        filterOptions(destOptions, e.target.value);
    });

    // Click outside to close
    document.addEventListener("click", () => {
        closeAllDropdowns();
    });

    function closeAllDropdowns() {
        originContainer.classList.remove("open");
        destContainer.classList.remove("open");
        originDropdown.classList.add("hidden");
        destDropdown.classList.add("hidden");
    }

    function filterOptions(optionsList, query) {
        const items = optionsList.querySelectorAll("li");
        const q = query.toLowerCase().trim();
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(q)) {
                item.classList.remove("hidden");
            } else {
                item.classList.add("hidden");
            }
        });
    }
}

function selectOriginItem(item) {
    selectedOrigin = item;

    // Update Trigger display
    const trigger = document.getElementById("origin-trigger");
    trigger.querySelector(".trigger-text").innerText = item.name;
    trigger.querySelector(".trigger-icon").innerHTML = getFlagHTMLFromEmoji("🇮🇳");

    // Highlight list selection
    const listItems = document.querySelectorAll("#origin-options li");
    listItems.forEach(li => {
        li.classList.toggle("selected", li.dataset.id === item.id);
    });

    calculateRoute();
}

function selectDestinationItem(item) {
    selectedDestination = item;

    // Update Trigger display
    const trigger = document.getElementById("destination-trigger");
    trigger.querySelector(".trigger-text").innerText = item.name;
    trigger.querySelector(".trigger-icon").innerHTML = getFlagHTMLFromEmoji(item.flag);

    // Highlight list selection
    const listItems = document.querySelectorAll("#destination-options li");
    listItems.forEach(li => {
        li.classList.toggle("selected", li.dataset.id === item.id);
    });

    calculateRoute();
}

// ----------------------------------------------------
// Map rendering logic (Leaflet.js)
// ----------------------------------------------------
function setupMap() {
    // Initialize map centering on Europe/Middle East/India
    map = L.map('map-wrapper', {
        center: [22.5, 45],
        zoom: 3,
        minZoom: 2,
        maxZoom: 10,
        zoomControl: false,
        attributionControl: false
    });

    // Load initial tile layer based on active theme
    const theme = document.body.classList.contains("dark-theme") ? "dark" : "light";
    updateMapTheme(theme);

    // Load GeoJSON data - Fetch local first, fall back to CDN if local fetch fails
    const localUrl = "world.geojson";
    const cdnUrl = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson";

    fetch(localUrl)
        .then(response => {
            if (!response.ok) throw new Error("CORS or File Not Found");
            return response.json();
        })
        .then(data => {
            mapData = data;
            drawGeoJson();
        })
        .catch(err => {
            console.warn("Local world.geojson failed to load. Fetching from CDN fallback...", err);
            fetch(cdnUrl)
                .then(res => res.json())
                .then(data => {
                    mapData = data;
                    drawGeoJson();
                })
                .catch(cdnErr => {
                    console.error("Failed to load map data from both local and CDN sources.", cdnErr);
                });
        });
}

function updateMapTheme(theme) {
    if (tileLayer) {
        map.removeLayer(tileLayer);
    }
    const tileUrl = theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    tileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

function drawGeoJson() {
    if (!mapData) return;

    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }

    geojsonLayer = L.geoJSON(mapData, {
        style: function (feature) {
            // Invisible overlay styles that still capture mouse clicks
            return {
                fillColor: '#ffffff',
                fillOpacity: 0.001,
                color: 'transparent',
                weight: 0
            };
        },
        onEachFeature: function (feature, layer) {
            layer.on({
                mouseover: function (e) {
                    highlightCountry(feature, layer, e);
                },
                mousemove: function (e) {
                    moveTooltip(e);
                },
                mouseout: function (e) {
                    resetCountryHighlight(layer);
                },
                click: function (e) {
                    L.DomEvent.stopPropagation(e);
                    handleCountryClick(feature);
                }
            });
        }
    }).addTo(map);

    // Render initial highlight state if selection already exists
    updateMapHighlights();
}

function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode === '-99') return "<span>🌐</span>";
    const isoCode = countryCode.toLowerCase();
    if (isoCode.match(/^[a-z]{2}$/)) {
        return `<img src="https://flagcdn.com/w40/${isoCode}.png" class="flag-image" alt="${isoCode}" />`;
    }
    return "<span>🌐</span>";
}

function getFlagHTMLFromEmoji(emoji) {
    if (!emoji || emoji === '🌐') return '<span>🌐</span>';
    const chars = [...emoji];
    if (chars.length === 2) {
        const isoCode = String.fromCharCode(chars[0].codePointAt(0) - 127397, chars[1].codePointAt(0) - 127397).toLowerCase();
        if (isoCode.match(/^[a-z]{2}$/)) {
            return `<img src="https://flagcdn.com/w40/${isoCode}.png" class="flag-image" alt="flag" />`;
        }
    }
    return `<span class="flag-emoji">${emoji}</span>`;
}

// Hover Interaction
function highlightCountry(feature, layer, e) {
    const name = feature.properties.name || feature.properties.admin || feature.properties.formal_en || "";

    const matchingDest = DESTINATIONS_DATABASE.find(dest =>
        dest.countryName.toLowerCase() === name.toLowerCase() ||
        dest.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(dest.countryName.toLowerCase())
    );

    // Subtle select hover styling
    layer.setStyle({
        fillColor: 'var(--color-primary)',
        fillOpacity: 0.1,
        color: 'var(--color-primary)',
        weight: 1
    });

    const isoCode = feature.properties.iso_a2;
    const fallbackFlag = getFlagEmoji(isoCode);

    const tooltip = document.getElementById("map-tooltip");
    tooltip.classList.remove("hidden");

    const flagHtml = matchingDest ? getFlagHTMLFromEmoji(matchingDest.flag) : fallbackFlag;

    let content = `
        <div class="tooltip-title">
            ${flagHtml}
            <span>${name}</span>
        </div>
    `;

    if (matchingDest) {
        content += `
            <div class="tooltip-detail">Airport Code: <strong>${matchingDest.code}</strong></div>
            <div class="tooltip-visa-badge">Visa Type: ${matchingDest.visaType}</div>
        `;
    } else {
        content += `<div class="tooltip-detail" style="color: var(--text-muted)">Map details available upon selection</div>`;
    }

    tooltip.innerHTML = content;
    moveTooltip(e);
}

function moveTooltip(e) {
    const tooltip = document.getElementById("map-tooltip");
    const containerRect = document.getElementById("map-wrapper").getBoundingClientRect();

    const x = e.originalEvent.clientX - containerRect.left + 15;
    const y = e.originalEvent.clientY - containerRect.top + 15;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function resetCountryHighlight(layer) {
    // Revert styling using state helper
    const feature = layer.feature;
    const name = feature.properties.name || feature.properties.admin || "";

    let isOrigin = false;
    let isDest = false;

    if (selectedOrigin && name.toLowerCase() === "india") {
        isOrigin = true;
    }
    if (selectedDestination && (
        name.toLowerCase() === selectedDestination.countryName.toLowerCase() ||
        selectedDestination.countryName.toLowerCase().includes(name.toLowerCase())
    )) {
        isDest = true;
    }

    if (isOrigin) {
        layer.setStyle({
            fillColor: 'var(--color-secondary)',
            fillOpacity: 0.15,
            color: 'var(--color-secondary)',
            weight: 1.5
        });
    } else if (isDest) {
        layer.setStyle({
            fillColor: 'var(--color-primary)',
            fillOpacity: 0.2,
            color: 'var(--color-primary)',
            weight: 1.5
        });
    } else {
        layer.setStyle({
            fillColor: '#ffffff',
            fillOpacity: 0.001,
            color: 'transparent',
            weight: 0
        });
    }

    const tooltip = document.getElementById("map-tooltip");
    tooltip.classList.add("hidden");
}

function handleCountryClick(feature) {
    const name = feature.properties.name || feature.properties.admin || feature.properties.formal_en || "";

    const matchingDest = DESTINATIONS_DATABASE.find(dest =>
        dest.countryName.toLowerCase() === name.toLowerCase() ||
        dest.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(dest.countryName.toLowerCase())
    );

    if (matchingDest) {
        selectDestinationItem(matchingDest);
    } else {
        const isoCode = feature.properties.iso_a2;
        const fallbackFlag = getFlagEmoji(isoCode);
        const tooltip = document.getElementById("map-tooltip");
        tooltip.innerHTML = `
            <div class="tooltip-title">${fallbackFlag} ${name}</div>
            <div class="tooltip-detail" style="color: #fca5a5">Destination route is not in database. Select another country.</div>
        `;
        tooltip.classList.remove("hidden");
        setTimeout(() => tooltip.classList.add("hidden"), 2500);
    }
}

// Reset/zoom buttons logic
function setupControls() {
    document.getElementById("zoom-in").addEventListener("click", () => {
        map.zoomIn();
    });

    document.getElementById("zoom-out").addEventListener("click", () => {
        map.zoomOut();
    });

    document.getElementById("zoom-reset").addEventListener("click", () => {
        if (selectedOrigin && selectedDestination) {
            zoomToFitRoute();
        } else {
            map.setView([22.5, 45], 3);
        }
    });

    document.getElementById("reset-route-btn").addEventListener("click", () => {
        resetRoute();
    });

}

// Highlight country borders on map
function updateMapHighlights() {
    if (!geojsonLayer) return;

    geojsonLayer.eachLayer(layer => {
        const feature = layer.feature;
        const name = feature.properties.name || feature.properties.admin || "";

        let isOrigin = false;
        let isDest = false;

        if (selectedOrigin && name.toLowerCase() === "india") {
            isOrigin = true;
        }

        if (selectedDestination && (
            name.toLowerCase() === selectedDestination.countryName.toLowerCase() ||
            selectedDestination.countryName.toLowerCase().includes(name.toLowerCase())
        )) {
            isDest = true;
        }

        if (isOrigin) {
            layer.setStyle({
                fillColor: 'var(--color-secondary)',
                fillOpacity: 0.15,
                color: 'var(--color-secondary)',
                weight: 1.5
            });
        } else if (isDest) {
            layer.setStyle({
                fillColor: 'var(--color-primary)',
                fillOpacity: 0.2,
                color: 'var(--color-primary)',
                weight: 1.5
            });
        } else {
            layer.setStyle({
                fillColor: '#ffffff',
                fillOpacity: 0.001,
                color: 'transparent',
                weight: 0
            });
        }
    });
}

// ----------------------------------------------------
// Travel Planning Route Calculations
// ----------------------------------------------------
function parseVisaProcessDays(processStr) {
    if (!processStr) return 0;
    const str = processStr.toLowerCase();
    let multiplier = 1;
    if (str.includes("week")) multiplier = 7;
    else if (str.includes("month")) multiplier = 30;
    else if (str.includes("minute") || str.includes("hour") || str.includes("arrival") || str.includes("free")) return 0;

    const matches = str.match(/\d+/g);
    if (matches && matches.length > 0) {
        return Math.max(...matches.map(Number)) * multiplier;
    }
    return 0;
}

function calculateRoute() {
    updateMapHighlights();

    if (!selectedOrigin || !selectedDestination) {
        // Show callout, hide route stats
        document.getElementById("route-indicator").classList.add("hidden");
        document.getElementById("calculator-callout").classList.remove("hidden");
        document.getElementById("reset-route-btn").classList.add("hidden");
        document.getElementById("apply-visa-btn").classList.add("hidden");
        clearRouteElements();
        return;
    }

    // Hide instructional callout and show route header
    document.getElementById("calculator-callout").classList.add("hidden");
    document.getElementById("route-indicator").classList.remove("hidden");
    document.getElementById("reset-route-btn").classList.remove("hidden");
    
    const applyBtn = document.getElementById("apply-visa-btn");
    applyBtn.classList.remove("hidden");
    let countryNameStr = selectedDestination.countryName || selectedDestination.name;
    let urlSlug = countryNameStr.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim().replace(/[^a-z0-9]+/g, '-');
    applyBtn.href = `https://eovisas.com/country/${urlSlug}`;

    // Update Airport Codes on Widget
    document.getElementById("route-origin-code").innerText = selectedOrigin.code;
    document.getElementById("route-dest-code").innerText = selectedDestination.code;

    // --- GEODETIC CALCULATIONS ---
    const lat1 = selectedOrigin.lat;
    const lon1 = selectedOrigin.lng;
    const lat2 = selectedDestination.lat;
    const lon2 = selectedDestination.lng;

    const R = 6371; // Earth Radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // in kilometers

    // Commercial flight speed: avg 800 km/h, + 40 mins takeoff/landing/routing buffer
    const speed = 800;
    const hours = (distance / speed) + 0.65;

    const calculatedHours = Math.floor(hours);
    const calculatedMinutes = Math.round((hours - calculatedHours) * 60);
    const flightTimeStr = `${calculatedHours}h ${calculatedMinutes}m`;

    document.getElementById("val-flight-time").innerText = flightTimeStr;

    // Visa type and processing details
    document.getElementById("val-visa-process").innerText = selectedDestination.visaProcess;
    document.getElementById("val-visa-type").innerText = selectedDestination.visaType;

    // Landing Date and Time estimation (accounting for time zones)
    const departureTime = new Date();
    
    // Add Visa Processing Time
    const additionalDays = parseVisaProcessDays(selectedDestination.visaProcess);
    if (additionalDays > 0) {
        departureTime.setDate(departureTime.getDate() + additionalDays);
    }
    
    const landingTimeMs = departureTime.getTime() + (hours * 60 * 60 * 1000);

    // Convert to target destination's timezone
    // IST is UTC+5.5. Difference = Destination offset - 5.5
    const tzDiffHours = selectedDestination.timezoneOffset - 5.5;
    const landingTimeInDestMs = landingTimeMs + (tzDiffHours * 60 * 60 * 1000);
    const landingTimeInDest = new Date(landingTimeInDestMs);

    // Format destination landing date
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    const dateFormatted = landingTimeInDest.toLocaleDateString('en-US', options);

    let hoursStr = landingTimeInDest.getUTCHours();
    const minutesStr = String(landingTimeInDest.getUTCMinutes()).padStart(2, '0');
    const ampm = hoursStr >= 12 ? 'PM' : 'AM';
    hoursStr = hoursStr % 12;
    hoursStr = hoursStr ? hoursStr : 12; // conversion of 0 to 12
    const timeFormatted = `${hoursStr}:${minutesStr} ${ampm}`;

    const landingStr = `${dateFormatted}, ${timeFormatted}`;
    document.getElementById("val-landing-date").innerText = landingStr;

    // --- MAP OVERLAY REDRAW (Pins & Lines) ---
    renderRouteOnMap();
}

// Bezier curved path generator
function getCurvePoints(latlng1, latlng2) {
    const lat1 = latlng1[0];
    const lng1 = latlng1[1];
    const lat2 = latlng2[0];
    const lng2 = latlng2[1];

    const points = [];
    const steps = 100;

    // Calculate control point for curved line
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;

    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;

    // Curve direction
    const curvature = 0.25;
    const controlLat = midLat + (dLng * curvature);
    const controlLng = midLng - (dLat * curvature);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2;
        const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2;
        points.push([lat, lng]);
    }
    return points;
}

function renderRouteOnMap() {
    clearRouteElements();

    if (!selectedOrigin || !selectedDestination) return;

    const originLatLng = [selectedOrigin.lat, selectedOrigin.lng];
    const destLatLng = [selectedDestination.lat, selectedDestination.lng];

    const curvePoints = getCurvePoints(originLatLng, destLatLng);

    // Draw Glow line
    flightPathGlowPolyline = L.polyline(curvePoints, {
        className: 'leaflet-flight-path-glow',
        color: 'var(--color-primary)',
        weight: 6,
        fill: false
    }).addTo(map);

    // Draw Dashed line
    flightPathPolyline = L.polyline(curvePoints, {
        className: 'leaflet-flight-path',
        color: 'var(--color-primary)',
        weight: 2.5,
        dashArray: '6, 6',
        fill: false
    }).addTo(map);

    // Draw Custom Origin Marker - NO circular nodes/pulses!
    const originIcon = L.divIcon({
        className: 'plane-marker-icon-container',
        html: `<div class="marker-flag-badge">
                   ${getFlagHTMLFromEmoji("🇮🇳")}
                   <span>${selectedOrigin.code}</span>
               </div>`,
        iconSize: [60, 30],
        iconAnchor: [30, 15]
    });
    originMarker = L.marker(originLatLng, { icon: originIcon }).addTo(map);
    originMarker.on("click", () => resetRoute());

    // Draw Custom Destination Marker - NO circular nodes/pulses!
    const landingStr = document.getElementById("val-landing-date").innerText;
    const flightTimeStr = document.getElementById("val-flight-time").innerText;
    const visaProcessStr = document.getElementById("val-visa-process").innerText;
    
    const destIcon = L.divIcon({
        className: 'plane-marker-icon-container',
        html: `<div class="marker-dest-badge expanded-badge">
                   <div class="badge-header">
                       ${getFlagHTMLFromEmoji(selectedDestination.flag)}
                       <div class="marker-text-content">
                           <span class="marker-name">${selectedDestination.name}</span>
                       </div>
                   </div>
                   <div class="badge-details">
                       <div class="badge-detail-row"><i class="fa-solid fa-bolt"></i> Process: ${visaProcessStr}</div>
                       <div class="badge-detail-row"><i class="fa-regular fa-clock"></i> Flight: ${flightTimeStr}</div>
                       <div class="badge-detail-row"><i class="fa-regular fa-calendar-check"></i> Land: ${landingStr}</div>
                   </div>
               </div>`,
        iconSize: [200, 110],
        iconAnchor: [100, 55]
    });
    destMarker = L.marker(destLatLng, { icon: destIcon }).addTo(map);

    // Draw Animated Airplane Markers
    const planeIcon = L.divIcon({
        className: 'plane-marker-icon',
        html: `<i class="fa-solid fa-plane" style="font-size: 14px; color: var(--color-secondary); transform: rotate(45deg); display: block;"></i>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const planeShadowIcon = L.divIcon({
        className: 'plane-marker-icon-shadow',
        html: `<i class="fa-solid fa-plane" style="font-size: 14px; color: rgba(0, 0, 0, 0.28); transform: rotate(45deg); filter: blur(1.5px); display: block;"></i>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    planeShadowMarker = L.marker(originLatLng, { icon: planeShadowIcon }).addTo(map);
    planeMarker = L.marker(originLatLng, { icon: planeIcon }).addTo(map);

    // Perform animation
    let startTime = null;
    const duration = 3800; // 3.8 seconds per flight animation loop
    const activePlaneMarker = planeMarker;

    function animate(timestamp) {
        if (activePlaneMarker !== planeMarker) return; // Abort if global marker changed

        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const stepIndex = Math.floor(progress * (curvePoints.length - 1));
        const currentPt = curvePoints[stepIndex];
        const nextPt = curvePoints[Math.min(stepIndex + 1, curvePoints.length - 1)];

        // Calculate rotation heading
        const dLat = nextPt[0] - currentPt[0];
        const dLng = nextPt[1] - currentPt[1];
        const screenAngle = Math.atan2(-dLat, dLng) * 180 / Math.PI;
        const rotation = screenAngle - 45;

        // 3D Parallax height scale & shadow offsets
        const alt = Math.sin(progress * Math.PI);
        const scale = 1.0 + (0.45 * alt);
        const offset = 4 + (14 * alt);

        if (planeShadowMarker) {
            planeShadowMarker.setLatLng(currentPt);
            const shadowElem = planeShadowMarker.getElement();
            if (shadowElem) {
                const iconInner = shadowElem.querySelector('i');
                if (iconInner) {
                    iconInner.style.transform = `rotate(${rotation}deg) scale(${scale})`;
                    iconInner.style.translate = `${offset}px ${offset}px`;
                }
            }
        }

        if (planeMarker) {
            planeMarker.setLatLng(currentPt);
            const planeElem = planeMarker.getElement();
            if (planeElem) {
                const iconInner = planeElem.querySelector('i');
                if (iconInner) {
                    iconInner.style.transform = `rotate(${rotation}deg) scale(${scale})`;
                }
            }
        }

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            animationTimeoutId = setTimeout(() => {
                startTime = null;
                if (planeMarker && planeShadowMarker) {
                    animationFrameId = requestAnimationFrame(animate);
                }
            }, 1500);
        }
    }

    animationFrameId = requestAnimationFrame(animate);

    zoomToFitRoute();
}

function clearRouteElements() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (animationTimeoutId) {
        clearTimeout(animationTimeoutId);
        animationTimeoutId = null;
    }
    if (originMarker) {
        map.removeLayer(originMarker);
        originMarker = null;
    }
    if (destMarker) {
        map.removeLayer(destMarker);
        destMarker = null;
    }
    if (flightPathPolyline) {
        map.removeLayer(flightPathPolyline);
        flightPathPolyline = null;
    }
    if (flightPathGlowPolyline) {
        map.removeLayer(flightPathGlowPolyline);
        flightPathGlowPolyline = null;
    }
    if (planeMarker) {
        map.removeLayer(planeMarker);
        planeMarker = null;
    }
    if (planeShadowMarker) {
        map.removeLayer(planeShadowMarker);
        planeShadowMarker = null;
    }
}

function zoomToFitRoute() {
    if (!selectedOrigin || !selectedDestination) return;
    const bounds = L.latLngBounds(
        [selectedOrigin.lat, selectedOrigin.lng],
        [selectedDestination.lat, selectedDestination.lng]
    );

    map.fitBounds(bounds, {
        padding: [80, 80],
        maxZoom: 6,
        animate: true,
        duration: 1.5
    });
}

function resetRoute() {
    selectedOrigin = null;
    selectedDestination = null;

    // Reset dropdown trigger texts
    const originTrigger = document.getElementById("origin-trigger");
    originTrigger.querySelector(".trigger-text").innerText = "Select origin state...";
    originTrigger.querySelector(".trigger-icon").innerHTML = `<i class="fa-solid fa-location-dot"></i>`;

    const destTrigger = document.getElementById("destination-trigger");
    destTrigger.querySelector(".trigger-text").innerText = "Select destination country...";
    destTrigger.querySelector(".trigger-icon").innerHTML = `<i class="fa-solid fa-globe"></i>`;

    // Remove active select classes
    document.querySelectorAll(".options-list li").forEach(li => {
        li.classList.remove("selected");
    });

    // Reset statistics values
    document.getElementById("val-flight-time").innerText = "-";
    document.getElementById("val-visa-process").innerText = "-";
    document.getElementById("val-visa-type").innerText = "-";
    document.getElementById("val-landing-date").innerText = "-";

    // Hide Widget container route indicator & Show info card
    document.getElementById("route-indicator").classList.add("hidden");
    document.getElementById("calculator-callout").classList.remove("hidden");
    document.getElementById("reset-route-btn").classList.add("hidden");

    clearRouteElements();
    updateMapHighlights();

    // Zoom back to default global view
    map.setView([22.5, 45], 3);
}

// ----------------------------------------------------
// Theme Switcher & Helpers
// ----------------------------------------------------
function initTheme() {
    document.body.classList.remove("dark-theme");
    localStorage.removeItem("theme");
}
