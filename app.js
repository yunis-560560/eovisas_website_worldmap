// App Variables
let selectedOrigin = null;
let selectedDestination = null;
let mapData = null;

// D3 Map & Layer References
let svg = null;
let g = null;
let projection = null;
let pathGenerator = null;
let zoom = null;
let flightPathGlow = null;
let flightPath = null;
let animationFrameId = null;
let animationTimeoutId = null;
let planeGroup = null;
let shadowGroup = null;
let activePathNode = null;

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
// Map rendering logic (D3.js Vector Map)
// ----------------------------------------------------
function setupMap() {
    const wrapper = document.getElementById('map-wrapper');
    const width = wrapper.clientWidth || 800;
    const height = wrapper.clientHeight || 500;

    svg = d3.select('#map-wrapper').insert('svg', ':first-child')
        .attr('class', 'map-svg d3-map-svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    g = svg.append('g');

    // NaturalEarth1 is great for global maps without cutting off continents
    projection = d3.geoNaturalEarth1()
        .scale(width / 5.5)
        .translate([width / 2, height / 2.2]);

    pathGenerator = d3.geoPath().projection(projection);

    zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
            
            // Counter-scale markers so they remain constant size
            g.selectAll('.custom-marker').attr('transform', function() {
                const el = d3.select(this);
                const x = el.attr('data-x');
                const y = el.attr('data-y');
                if (x && y) {
                    return `translate(${x}, ${y}) scale(${1 / event.transform.k})`;
                }
                return null;
            });
            
            // Counter-scale stroke widths
            g.selectAll('.flight-path').style('stroke-width', 2.5 / event.transform.k);
            
            g.selectAll('.animated-plane').attr('transform', function() {
                const el = d3.select(this);
                const x = el.attr('data-x');
                const y = el.attr('data-y');
                if (x && y) {
                    return `translate(${x}, ${y})`;
                }
                return null;
            });
            g.selectAll('.flight-path-glow').style('stroke-width', 6 / event.transform.k);
            g.selectAll('.country-path').style('stroke-width', 1 / event.transform.k);
        });
    svg.call(zoom);

    const localUrl = "world.geojson";
    const cdnUrl = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson";

    fetch(localUrl)
        .then(response => {
            if (!response.ok) throw new Error("File Not Found");
            return response.json();
        })
        .then(data => {
            mapData = data;
            drawGeoJson();
        })
        .catch(err => {
            console.warn("Local fetch failed, likely due to file:// protocol CORS. Using CDN fallback.", err);
            fetch(cdnUrl)
                .then(res => res.json())
                .then(data => {
                    mapData = data;
                    drawGeoJson();
                })
                .catch(cdnErr => console.error("Failed to load map data from both sources.", cdnErr));
        });
}

function updateMapTheme(theme) {
    // Handled in CSS
}

function drawGeoJson() {
    if (!mapData) return;

    g.selectAll('path.country')
        .data(mapData.features)
        .enter()
        .append('path')
        .attr('class', 'country country-path')
        .attr('d', pathGenerator)
        .on('mouseover', function (event, feature) {
            highlightCountry(feature, this, event);
        })
        .on('mousemove', function (event) {
            moveTooltip(event);
        })
        .on('mouseout', function (event, feature) {
            resetCountryHighlight(this);
        })
        .on('click', function (event, feature) {
            event.stopPropagation();
            handleCountryClick(feature);
        });

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

function highlightCountry(feature, element, e) {
    const name = feature.properties.name || feature.properties.admin || feature.properties.formal_en || "";

    const matchingDest = DESTINATIONS_DATABASE.find(dest =>
        dest.countryName.toLowerCase() === name.toLowerCase() ||
        dest.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(dest.countryName.toLowerCase())
    );

    d3.select(element)
        .style('fill', 'var(--color-primary)')
        .style('opacity', 0.1)
        .style('stroke', 'var(--color-primary)');

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

    const x = e.clientX - containerRect.left + 15;
    const y = e.clientY - containerRect.top + 15;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function resetCountryHighlight(element) {
    d3.select(element).style('fill', null).style('opacity', null).style('stroke', null);
    updateMapHighlights();
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

function setupControls() {
    document.getElementById("zoom-in").addEventListener("click", () => {
        if(svg && zoom) svg.transition().call(zoom.scaleBy, 1.3);
    });

    document.getElementById("zoom-out").addEventListener("click", () => {
        if(svg && zoom) svg.transition().call(zoom.scaleBy, 0.77);
    });

    document.getElementById("zoom-reset").addEventListener("click", () => {
        if (selectedOrigin && selectedDestination) {
            const originLatLng = [selectedOrigin.lng, selectedOrigin.lat];
            const destLatLng = [selectedDestination.lng, selectedDestination.lat];
            zoomToFitRoute(projection(originLatLng), projection(destLatLng));
        } else {
            if(svg && zoom) svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
        }
    });

    document.getElementById("reset-route-btn").addEventListener("click", () => {
        resetRoute();
    });
}

function updateMapHighlights() {
    if (!g) return;

    g.selectAll('path.country').each(function(feature) {
        const name = feature.properties.name || feature.properties.admin || "";
        let isOrigin = false;
        let isDest = false;

        if (selectedOrigin && name.toLowerCase() === "india") isOrigin = true;
        if (selectedDestination && (
            name.toLowerCase() === selectedDestination.countryName.toLowerCase() ||
            selectedDestination.countryName.toLowerCase().includes(name.toLowerCase())
        )) {
            isDest = true;
        }

        const el = d3.select(this);
        if (isOrigin) {
            el.style('fill', 'var(--color-secondary)')
              .style('opacity', 0.15)
              .style('stroke', 'var(--color-secondary)')
              .style('stroke-width', 1.5);
        } else if (isDest) {
            el.style('fill', 'var(--color-primary)')
              .style('opacity', 0.2)
              .style('stroke', 'var(--color-primary)')
              .style('stroke-width', 1.5);
        } else {
            el.style('fill', null)
              .style('opacity', null)
              .style('stroke', null)
              .style('stroke-width', null);
        }
    });
}

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
        document.getElementById("route-indicator").classList.add("hidden");
        document.getElementById("calculator-callout").classList.remove("hidden");
        document.getElementById("reset-route-btn").classList.add("hidden");
        document.getElementById("apply-visa-btn").classList.add("hidden");
        clearRouteElements();
        return;
    }

    document.getElementById("calculator-callout").classList.add("hidden");
    document.getElementById("route-indicator").classList.remove("hidden");
    document.getElementById("reset-route-btn").classList.remove("hidden");

    const applyBtn = document.getElementById("apply-visa-btn");
    applyBtn.classList.remove("hidden");
    let countryNameStr = selectedDestination.countryName || selectedDestination.name;
    let urlSlug = countryNameStr.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim().replace(/[^a-z0-9]+/g, '-');
    applyBtn.href = `https://eovisas.com/country/${urlSlug}`;

    document.getElementById("route-origin-code").innerText = selectedOrigin.code;
    document.getElementById("route-dest-code").innerText = selectedDestination.code;

    const lat1 = selectedOrigin.lat;
    const lon1 = selectedOrigin.lng;
    const lat2 = selectedDestination.lat;
    const lon2 = selectedDestination.lng;

    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    const speed = 800;
    const hours = (distance / speed) + 0.65;
    const calculatedHours = Math.floor(hours);
    const calculatedMinutes = Math.round((hours - calculatedHours) * 60);
    const flightTimeStr = `${calculatedHours}h ${calculatedMinutes}m`;

    document.getElementById("val-flight-time").innerText = flightTimeStr;
    document.getElementById("val-visa-process").innerText = selectedDestination.visaProcess;
    document.getElementById("val-visa-type").innerText = selectedDestination.visaType;

    const departureTime = new Date();
    const additionalDays = parseVisaProcessDays(selectedDestination.visaProcess);
    if (additionalDays > 0) departureTime.setDate(departureTime.getDate() + additionalDays);
    const landingTimeMs = departureTime.getTime() + (hours * 60 * 60 * 1000);
    const tzDiffHours = selectedDestination.timezoneOffset - 5.5;
    const landingTimeInDestMs = landingTimeMs + (tzDiffHours * 60 * 60 * 1000);
    const landingTimeInDest = new Date(landingTimeInDestMs);

    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    const dateFormatted = landingTimeInDest.toLocaleDateString('en-US', options);

    let hoursStr = landingTimeInDest.getUTCHours();
    const minutesStr = String(landingTimeInDest.getUTCMinutes()).padStart(2, '0');
    const ampm = hoursStr >= 12 ? 'PM' : 'AM';
    hoursStr = hoursStr % 12;
    hoursStr = hoursStr ? hoursStr : 12;
    const timeFormatted = `${hoursStr}:${minutesStr} ${ampm}`;

    const landingStr = `${dateFormatted}, ${timeFormatted}`;
    document.getElementById("val-landing-date").innerText = landingStr;

    renderRouteOnMap();
}

function renderRouteOnMap() {
    clearRouteElements();
    if (!selectedOrigin || !selectedDestination || !projection || !g) return;

    const originLatLng = [selectedOrigin.lng, selectedOrigin.lat];
    const destLatLng = [selectedDestination.lng, selectedDestination.lat];

    const originPoint = projection(originLatLng);
    const destPoint = projection(destLatLng);
    
    // Store globally for animation coordinate validation
    window.currentDestPoint = destPoint;

    const dx = destPoint[0] - originPoint[0];
    const dy = destPoint[1] - originPoint[1];
    const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
    
    // Sweep flag 1 curves upward when flying East, 0 curves upward when flying West
    const sweepFlag = destPoint[0] > originPoint[0] ? 1 : 0;
    let pathData = `M ${originPoint[0]},${originPoint[1]} A ${dr},${dr} 0 0,${sweepFlag} ${destPoint[0]},${destPoint[1]}`;

    g.append("path")
        .attr("class", "flight-path-glow")
        .attr("d", pathData)
        .style("fill", "none");

    g.append("path")
        .attr("class", "flight-path")
        .attr("d", pathData)
        .style("fill", "none");

    const originG = g.append("g")
        .attr("class", "custom-marker origin-marker")
        .attr("data-x", originPoint[0])
        .attr("data-y", originPoint[1])
        .attr("transform", `translate(${originPoint[0]}, ${originPoint[1]})`);

    originG.append("foreignObject")
        .attr("x", -30)
        .attr("y", -15)
        .attr("width", 60)
        .attr("height", 30)
        .style("overflow", "visible")
        .html(`<div class="marker-flag-badge">
                   ${getFlagHTMLFromEmoji("🇮🇳")}
                   <span>${selectedOrigin.code}</span>
               </div>`);

    const destG = g.append("g")
        .attr("class", "custom-marker dest-marker")
        .attr("data-x", destPoint[0])
        .attr("data-y", destPoint[1])
        .attr("transform", `translate(${destPoint[0]}, ${destPoint[1]})`);
        
    // Add Airplane elements
    shadowGroup = g.append("g")
        .attr("class", "animated-plane shadow-group")
        .html(`<foreignObject x="-15" y="-15" width="30" height="30" style="overflow: visible;">
                   <i class="fa-solid fa-plane" style="font-size: 18px; color: rgba(0, 0, 0, 0.3); filter: blur(2px);"></i>
               </foreignObject>`);
               
    planeGroup = g.append("g")
        .attr("class", "animated-plane plane-group")
        .html(`<foreignObject x="-15" y="-15" width="30" height="30" style="overflow: visible;">
                   <i class="fa-solid fa-plane" style="font-size: 18px; color: var(--color-secondary); filter: drop-shadow(0 0 5px rgba(251, 191, 36, 0.6));"></i>
               </foreignObject>`);
               
    activePathNode = g.select('.flight-path').node();
    startFlightAnimation();

    const landingStr = document.getElementById("val-landing-date").innerText;
    const flightTimeStr = document.getElementById("val-flight-time").innerText;
    const visaProcessStr = document.getElementById("val-visa-process").innerText;

    destG.append("foreignObject")
        .attr("x", -100)
        .attr("y", -55)
        .attr("width", 200)
        .attr("height", 110)
        .style("overflow", "visible")
        .html(`<div class="marker-dest-badge expanded-badge" style="position: static; margin: 0;">
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
               </div>`);

    zoomToFitRoute(originPoint, destPoint);
}

function clearRouteElements() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (g) {
        g.selectAll('.flight-path-glow').remove();
        g.selectAll('.flight-path').remove();
        g.selectAll('.custom-marker').remove();
        g.selectAll('.animated-plane').remove();
    }
    planeGroup = null;
    shadowGroup = null;
    activePathNode = null;
}

function zoomToFitRoute(p1, p2) {
    if (!p1 || !p2 || !svg || !zoom) return;
    
    const minX = Math.min(p1[0], p2[0]);
    const maxX = Math.max(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const maxY = Math.max(p1[1], p2[1]);
    
    const wrapper = document.getElementById('map-wrapper');
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    
    const dx = maxX - minX;
    const dy = maxY - minY;
    const x = (minX + maxX) / 2;
    const y = (minY + maxY) / 2;
    
    const scale = Math.max(1, Math.min(5, 0.75 / Math.max(dx / width, dy / height)));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];
    
    svg.transition()
        .duration(1500)
        .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
}

function resetRoute() {
    selectedOrigin = null;
    selectedDestination = null;

    const originTrigger = document.getElementById("origin-trigger");
    originTrigger.querySelector(".trigger-text").innerText = "Select origin state...";
    originTrigger.querySelector(".trigger-icon").innerHTML = `<i class="fa-solid fa-location-dot"></i>`;

    const destTrigger = document.getElementById("destination-trigger");
    destTrigger.querySelector(".trigger-text").innerText = "Select destination country...";
    destTrigger.querySelector(".trigger-icon").innerHTML = `<i class="fa-solid fa-globe"></i>`;

    document.querySelectorAll(".options-list li").forEach(li => {
        li.classList.remove("selected");
    });

    document.getElementById("val-flight-time").innerText = "-";
    document.getElementById("val-visa-process").innerText = "-";
    document.getElementById("val-visa-type").innerText = "-";
    document.getElementById("val-landing-date").innerText = "-";

    document.getElementById("route-indicator").classList.add("hidden");
    document.getElementById("calculator-callout").classList.remove("hidden");
    document.getElementById("reset-route-btn").classList.add("hidden");
    document.getElementById("apply-visa-btn").classList.add("hidden");

    clearRouteElements();
    updateMapHighlights();

    if(svg && zoom) {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    }
}

function initTheme() {
    document.body.classList.remove("dark-theme");
    localStorage.removeItem("theme");
}

function startFlightAnimation() {
    if (!activePathNode) return;
    const pathLength = activePathNode.getTotalLength();
    let startTime = null;
    const duration = 4000; // 4 seconds flight
    
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        let progress = (timestamp - startTime) / duration;
        
        let isFinalFrame = false;
        if (progress >= 1) {
            progress = 1; // Clamp to exactly 100%
            isFinalFrame = true;
        }

        // Get coordinates at current progress
        let point = activePathNode.getPointAtLength(progress * pathLength);
        
        // Enforce strict landing coordinate matching destination marker on final frame
        if (isFinalFrame && window.currentDestPoint) {
            point = { x: window.currentDestPoint[0], y: window.currentDestPoint[1] };
        }
        
        // Calculate rotation using a small delta ahead
        const lookAhead = Math.min(progress * pathLength + 1, pathLength);
        const nextPoint = activePathNode.getPointAtLength(lookAhead);
        const dx = nextPoint.x - point.x;
        const dy = nextPoint.y - point.y;
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI) + 45; // +45 because FA plane points top-right (-45 deg)
        
        // 3D Altitude Scale and Shadow calculation
        // It peaks in the middle of the flight (progress = 0.5)
        const altitude = Math.sin(progress * Math.PI); // 0 at start/end, 1 in middle
        const scale = 1 + (0.6 * altitude);
        const shadowOffset = 8 + (20 * altitude);
        
        // Apply zoom counter-scaling
        let zoomScale = 1;
        if (d3.zoomTransform(svg.node())) {
            zoomScale = d3.zoomTransform(svg.node()).k;
        }
        
        const finalScale = scale / zoomScale;

        // Apply transformations
        if (planeGroup) {
            planeGroup
                .attr("data-x", point.x)
                .attr("data-y", point.y)
                .attr("transform", `translate(${point.x}, ${point.y})`);
                
            planeGroup.select('i')
                .style("transform", `scale(${finalScale}) rotate(${angle}deg)`);
        }
        
        if (shadowGroup) {
            shadowGroup
                .attr("data-x", point.x)
                .attr("data-y", point.y)
                .attr("transform", `translate(${point.x}, ${point.y})`);
                
            shadowGroup.select('i')
                .style("transform", `translate(${shadowOffset/zoomScale}px, ${shadowOffset/zoomScale}px) scale(${finalScale}) rotate(${angle}deg)`);
        }
        
        // Animate Trail Glow (stroke-dasharray/offset approach)
        g.selectAll('.flight-path-glow')
            .style('stroke-dasharray', pathLength)
            .style('stroke-dashoffset', pathLength - (progress * pathLength));

        if (isFinalFrame) {
            // Reached destination, show ping on destination marker
            d3.select('.dest-marker .marker-dest-badge').classed('arrive-ping', true);
            setTimeout(() => {
                startTime = null; // loop animation
                d3.select('.dest-marker .marker-dest-badge').classed('arrive-ping', false);
                animationFrameId = requestAnimationFrame(animate);
            }, 2000);
        } else {
            animationFrameId = requestAnimationFrame(animate);
        }
    }
    
    // reset trails
    g.selectAll('.flight-path-glow')
        .style('stroke-dasharray', pathLength)
        .style('stroke-dashoffset', pathLength);
        
    animationFrameId = requestAnimationFrame(animate);
}
