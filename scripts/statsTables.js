/* global showMessage, formatStat, applyHeatmapToColumn, setInitialSortState, PlayerCharts, createPlayerCard, convertStatsArrayToObject */ // Added PlayerCharts dependencies
/* global SEASON_AVG_JSON_URL, LAST10_JSON_URL, NIGHT_AVG_JSON_URL */ // Assume these are defined globally or imported

// --- Constants --- (Moved outside IIFE for potential reuse if needed)
const PENTAGON_STAT_LIMIT_STATS = 5;

const StatsTables = (() => {
    let seasonStats = null;
    let last10Stats = null;
    let nightAvgStats = null;
    let seasonStatsBySteamId = {}; // NEW: Map for quick lookup
    let last10StatsBySteamId = {}; // NEW: Map for quick lookup
    let nightAvgStatsBySteamId = {}; // NEW: Map for quick lookup (though not requested for picker yet)

    // --- State specific to Season Avg Graph View ---
    let seasonAvgGraphPopulated = false;
    let seasonAvgSelectableStats = {}; // { key: { label: '...', format: '...' }, ... }
    let seasonAvgAllStatRanges = {}; // Store ranges for all selectable stats
    let seasonAvgInitialRenderDone = false; // Flag to prevent redundant initial setup

    // --- DOM Element References (Season Avg Graph Tab) ---
    let seasonAvgCheckboxContainer = null;
    let seasonAvgUpdateButton = null;
    let seasonAvgValidationMsg = null;
    let seasonAvgPlayerGrid = null;
    let seasonAvgSelectorToggle = null;
    let seasonAvgSelectorContent = null;
    let seasonAvgSelectorArrow = null;

    // --- NEW: State specific to Season Avg Head-to-Head View ---
    let seasonAvgH2HInitialRenderDone = false;
    let seasonAvgH2HSelectableStats = {}; // Config for selectable stats

    // --- NEW: DOM Element References (Season Avg Head-to-Head Tab) ---
    let seasonAvgH2HPlayer1Select = null;
    let seasonAvgH2HPlayer2Select = null;
    let seasonAvgH2HCheckboxContainer = null;
    let seasonAvgH2HUpdateButton = null;
    let seasonAvgH2HValidationMsg = null;
    let seasonAvgH2HChartContainer = null; // Container for the single comparison chart
    let seasonAvgH2HStatSelectorToggle = null;
    let seasonAvgH2HStatSelectorContent = null;
    let seasonAvgH2HStatSelectorArrow = null;

    // --- State specific to Last 10 Graph View ---
    let last10GraphPopulated = false;
    let last10SelectableStats = {};
    let last10AllStatRanges = {};
    let last10InitialRenderDone = false;

    // --- DOM Element References (Last 10 Graph Tab) ---
    let last10CheckboxContainer = null;
    let last10UpdateButton = null;
    let last10ValidationMsg = null;
    let last10PlayerGrid = null;
    let last10SelectorToggle = null;
    let last10SelectorContent = null;
    let last10SelectorArrow = null;

    // --- State specific to Night Avg Graph View ---
    let nightAvgGraphPopulated = false;
    let nightAvgSelectableStats = {};
    let nightAvgAllStatRanges = {};
    let nightAvgInitialRenderDone = false;

    // --- DOM Element References (Night Avg Graph Tab) ---
    let nightAvgCheckboxContainer = null;
    let nightAvgUpdateButton = null;
    let nightAvgValidationMsg = null;
    let nightAvgPlayerGrid = null;
    let nightAvgSelectorToggle = null;
    let nightAvgSelectorContent = null;
    let nightAvgSelectorArrow = null;

    const DEFAULT_SORT_KEY_SEASON = 'hltv_2';
    const DEFAULT_SORT_KEY_LAST10 = 'hltv_2';
    const DEFAULT_SORT_KEY_NIGHT = 'HLTV 2';
    const DEFAULT_SORT_DIR = 'desc';

    // Heatmap Gradients (Example)
    const hltvGradient = [
        { percent: 0, color: '#f8696b' },    // Red
        { percent: 0.5, color: '#ffeb84' },  // Yellow
        { percent: 1, color: '#63be7b' }     // Green
    ];
    const kdGradient = [
        { percent: 0, color: '#f8696b' },
        { percent: 0.5, color: '#ffeb84' },
        { percent: 1, color: '#63be7b' }
    ];
    const adrGradient = [
        { percent: 0, color: '#f8696b' },
        { percent: 0.5, color: '#ffeb84' },
        { percent: 1, color: '#63be7b' }
    ];
    const diffGradient = [
        { percent: 0, color: '#f8696b' },   // Bad diff (negative)
        { percent: 0.5, color: '#ffffff' }, // Neutral (zero diff)
        { percent: 1, color: '#63be7b' }    // Good diff (positive)
    ];

    // --- Fetching Logic ---
    async function fetchJsonData(url, description) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log(`${description} data fetched successfully:`, data);
            return data;
        } catch (error) {
            console.error(`Error fetching ${description} data from ${url}:`, error);
            showMessage(`Failed to load ${description} data. Please try refreshing.`, 'error');
            return null; // Indicate failure
        }
    }

    // --- Rendering Logic ---

    function fillTableBody(tbody, data, columns, defaultSortKey, defaultSortDir) {
        if (!tbody) {
            console.error("Table body element not found for filling.");
            return;
        }
        tbody.innerHTML = ''; // Clear existing content or loading message

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center py-4 text-gray-500">No data available.</td></tr>`;
            return;
        }

        // Store original data for sorting
        tbody.dataset.originalData = JSON.stringify(data);

        data.forEach(player => {
            const row = tbody.insertRow();
            columns.forEach((col, index) => {
                const cell = row.insertCell();
                let value = player[col.key];
                let displayValue = 'N/A';

                if (value !== undefined && value !== null) {
                    if (col.key === 'name') {
                        displayValue = value;
                        cell.className = 'font-medium text-gray-900 whitespace-nowrap';
                    } else if (col.isPercentage) {
                         displayValue = `${formatStat(value, 1)}%`;
                    } else if (col.decimals !== undefined) {
                        displayValue = formatStat(value, col.decimals);
                    } else {
                        displayValue = value; // Display raw value if no format specified
                    }
                } else {
                    // Explicitly handle N/A for sorting/display if needed
                     if (col.key === 'name') {
                        displayValue = player.name || 'Unknown Player'; // Fallback if name is missing
                    }
                }

                // Apply text alignment
                cell.classList.add(index === 0 ? 'text-left' : 'text-center');

                // Apply badges and specific classes
                 if (col.isBadge) {
                    const badgeSpan = document.createElement('span');
                    badgeSpan.className = 'stat-badge'; // Base class for badges
                    badgeSpan.textContent = displayValue;
                    cell.appendChild(badgeSpan);
                } else {
                    cell.textContent = displayValue;
                }

                // Apply diff coloring
                if (col.isDiff) {
                     const numValue = parseFloat(value);
                     if (!isNaN(numValue)) {
                        cell.classList.add(numValue > 0 ? 'text-green-600' : numValue < 0 ? 'text-red-600' : 'text-gray-500');
                        cell.classList.add('font-bold'); // Add bold font style
                     }
                }
            });
        });

        // Apply initial sort state
        setInitialSortState(tbody, defaultSortKey, defaultSortDir);

        // Apply heatmaps after data is rendered
        columns.forEach((col, index) => {
             if (col.heatmapGradient) {
                // Use a slight delay to ensure DOM update before calculating heatmap
                setTimeout(() => applyHeatmapToColumn(tbody.id, index, col.heatmapGradient), 0);
            }
        });
    }

    // Define column configurations
    const commonColumns = [
        { key: 'name', label: 'Oyuncu' },
        { key: 'hltv_2', label: 'HLTV2', decimals: 2, isBadge: true, heatmapGradient: hltvGradient },
        { key: 'adr', label: 'ADR', decimals: 1, isBadge: true, heatmapGradient: adrGradient },
        { key: 'kd', label: 'K/D', decimals: 2, isBadge: true, heatmapGradient: kdGradient },
        { key: 'mvp', label: 'MVP', decimals: 0 },
        { key: 'kills', label: 'Kills', decimals: 1 },
        { key: 'deaths', label: 'Deaths', decimals: 1 },
        { key: 'assists', label: 'Assists', decimals: 1 },
        { key: 'hs', label: 'HS', decimals: 1 },
        { key: 'hs_ratio', label: 'HS/Kill ratio', decimals: 1, isPercentage: true },
        { key: 'first_kill', label: 'First Kill', decimals: 1 },
        { key: 'first_death', label: 'First Death', decimals: 1 },
        { key: 'bomb_planted', label: 'Bomb Planted', decimals: 1 },
        { key: 'bomb_defused', label: 'Bomb Defused', decimals: 1 },
        { key: 'hltv', label: 'HLTV', decimals: 2 },
        { key: 'kast', label: 'KAST', decimals: 1, isPercentage: true },
        { key: 'utl_dmg', label: 'Utility Damage', decimals: 1 },
        { key: 'two_kills', label: '2 kills', decimals: 1 },
        { key: 'three_kills', label: '3 kills', decimals: 1 },
        { key: 'four_kills', label: '4 kills', decimals: 1 },
        { key: 'five_kills', label: '5 kills', decimals: 1 },
        { key: 'matches', label: 'Nr of Matches', decimals: 0 },
        { key: 'win_rate', label: 'WIN RATE (%)', decimals: 1, isPercentage: true },
        { key: 'avg_clutches', label: 'Nr of clutches per game', decimals: 2 },
        { key: 'avg_clutches_won', label: 'Clutches Won', decimals: 1 },
        { key: 'clutch_success', label: 'Successful Clutch (%)', decimals: 1, isPercentage: true },
    ];

    const nightAvgColumns = [
        { key: 'name', label: 'Oyuncu' },
        { key: 'HLTV 2', label: 'HLTV2', decimals: 2, isBadge: true, heatmapGradient: hltvGradient },
        { key: 'ADR', label: 'ADR', decimals: 1, isBadge: true, heatmapGradient: adrGradient },
        { key: 'K/D', label: 'K/D', decimals: 2, isBadge: true, heatmapGradient: kdGradient },
        { key: 'HLTV2 DIFF', label: 'HLTV2 DIFF', decimals: 2, isDiff: true },
        { key: 'ADR DIFF', label: 'ADR DIFF', decimals: 1, isDiff: true },
        { key: 'MVP', label: 'MVP', decimals: 0 },
        { key: 'Kills', label: 'Kills', decimals: 0 },
        { key: 'Deaths', label: 'Deaths', decimals: 0 },
        { key: 'Assists', label: 'Assists', decimals: 0 },
        { key: 'HS', label: 'HS', decimals: 0 },
        { key: 'HS/Kill ratio', label: 'HS/Kill ratio', decimals: 1, isPercentage: true },
        { key: 'First Kill', label: 'First Kill', decimals: 0 },
        { key: 'First Death', label: 'First Death', decimals: 0 },
        { key: 'Bomb Planted', label: 'Bomb Planted', decimals: 0 },
        { key: 'Bomb Defused', label: 'Bomb Defused', decimals: 0 },
        { key: 'HLTV', label: 'HLTV', decimals: 2 },
        { key: 'KAST', label: 'KAST', decimals: 1, isPercentage: true },
        { key: 'Utility Damage', label: 'Utility Damage', decimals: 1 },
        { key: '2 kills', label: '2 kills', decimals: 0 },
        { key: '3 kills', label: '3 kills', decimals: 0 },
        { key: '4 kills', label: '4 kills', decimals: 0 },
        { key: '5 kills', label: '5 kills', decimals: 0 },
        { key: 'Nr of Matches', label: 'Nr of Matches', decimals: 0 },
        { key: 'Clutch Opportunity', label: 'Clutch Opportunity', decimals: 0 },
        { key: 'Clutches Won', label: 'Clutches Won', decimals: 0 },
    ];

    function fillSeasonAvgTable(data, tbody) {
        fillTableBody(tbody, data, commonColumns, DEFAULT_SORT_KEY_SEASON, DEFAULT_SORT_DIR);
    }

    function fillLast10Table(data, tbody) {
        fillTableBody(tbody, data, commonColumns, DEFAULT_SORT_KEY_LAST10, DEFAULT_SORT_DIR);
    }

    function fillNightAvgTable(data, tbody) {
        fillTableBody(tbody, data, nightAvgColumns, DEFAULT_SORT_KEY_NIGHT, DEFAULT_SORT_DIR);
    }

    // --- Loading and Rendering Orchestration ---
    async function loadAndRenderSeasonAvgTable() {
        const tbody = document.getElementById('season-avg-table-body');
        if (!tbody) {
             console.error("Season Avg table body not found");
             return;
        }
        tbody.innerHTML = `<tr><td colspan="${commonColumns.length}" class="text-center py-4 text-gray-500">Loading season data...</td></tr>`;

        seasonStats = await fetchJsonData(SEASON_AVG_JSON_URL, 'Season Average');
        if (seasonStats) {
             // Initial render
            fillSeasonAvgTable(seasonStats, tbody);
            // NEW: Process data into map after fetching
            seasonStatsBySteamId = processStatsIntoMap(seasonStats, 'steam_id');
            console.log("Processed season stats by SteamID:", seasonStatsBySteamId);
            // Potentially trigger initial graph render if graph tab exists and is active (though unlikely on initial load)
            checkAndRenderSeasonGraph();
        }
    }

    async function loadAndRenderLast10Table() {
        const tbody = document.getElementById('last10-table-body');
         if (!tbody) {
             console.error("Last 10 table body not found");
             return;
         }
        tbody.innerHTML = `<tr><td colspan="${commonColumns.length}" class="text-center py-4 text-gray-500">Loading last 10 data...</td></tr>`;
        last10Stats = await fetchJsonData(LAST10_JSON_URL, 'Last 10');
        if (last10Stats) {
            fillLast10Table(last10Stats, tbody);
             // NEW: Process data into map after fetching
            last10StatsBySteamId = processStatsIntoMap(last10Stats, 'steam_id');
            console.log("Processed last 10 stats by SteamID:", last10StatsBySteamId);
        }
    }

    async function loadAndRenderNightAvgTable() {
        const tbody = document.getElementById('night-avg-table-body');
         if (!tbody) {
             console.error("Night Avg table body not found");
             return;
         }
        tbody.innerHTML = `<tr><td colspan="${nightAvgColumns.length}" class="text-center py-4 text-gray-500">Loading night average data...</td></tr>`;
        nightAvgStats = await fetchJsonData(NIGHT_AVG_JSON_URL, 'Night Average');
        if (nightAvgStats) {
            fillNightAvgTable(nightAvgStats, tbody);
             // NEW: Process data into map after fetching
            // Assuming night_avg.json also includes steam_id now
            nightAvgStatsBySteamId = processStatsIntoMap(nightAvgStats, 'steam_id');
            console.log("Processed night average stats by SteamID:", nightAvgStatsBySteamId);
            checkAndRenderNightAvgGraph(); // Trigger graph check if needed
        }
    }

    // --- NEW: Helper function to calculate Season Avg Stat Ranges if needed ---
    function ensureSeasonAvgStatRangesCalculated() {
        // Only calculate if stats are loaded and ranges don't exist yet
        if (!seasonStats || Object.keys(seasonAvgAllStatRanges).length > 0) {
            return;
        }

        console.log("Calculating Season Avg stat ranges...");
        const allPlayersSeasonData = convertStatsArrayToObject(seasonStats);

        // Ensure selectable stats config is generated if needed (e.g., H2H visited first)
        if (Object.keys(seasonAvgSelectableStats).length === 0) {
            console.log("Generating seasonAvgSelectableStats before range calculation.");
            seasonAvgSelectableStats = generateSelectableStatsConfig(commonColumns);
        }

        const allSelectableStatKeys = Object.keys(seasonAvgSelectableStats);
        if (allSelectableStatKeys.length === 0) {
             console.warn("Cannot calculate ranges: No selectable stats found.");
             return;
        }

        seasonAvgAllStatRanges = PlayerCharts.calculateStatRanges(allPlayersSeasonData, allSelectableStatKeys);
        console.log("Calculated all stat ranges for Season Avg:", seasonAvgAllStatRanges);
    }

    // --- Season Avg Graph View Logic ---
    function renderSeasonAvgGraphView() {
        // Initial setup (run only once when tab is first viewed or data arrives)
        if (!seasonAvgInitialRenderDone) {
             console.log("Performing initial setup for Season Avg Graph View...");
            // Get DOM elements
            seasonAvgCheckboxContainer = document.getElementById('season-avg-pentagon-stat-checkboxes');
            seasonAvgUpdateButton = document.getElementById('update-season-avg-graphs-btn');
            seasonAvgValidationMsg = document.getElementById('season-avg-stat-validation-msg');
            seasonAvgPlayerGrid = document.getElementById('season-avg-player-grid');
            seasonAvgSelectorToggle = document.getElementById('season-avg-stat-selector-toggle');
            seasonAvgSelectorContent = document.getElementById('season-avg-stat-selector-content');
            seasonAvgSelectorArrow = document.getElementById('season-avg-stat-arrow');

            if (!seasonAvgCheckboxContainer || !seasonAvgUpdateButton || !seasonAvgValidationMsg || !seasonAvgPlayerGrid || !seasonAvgSelectorToggle || !seasonAvgSelectorContent || !seasonAvgSelectorArrow) {
                console.error("Missing required elements for Season Avg graph tab setup!");
                // Display error in a visible place if possible
                 const graphTab = document.getElementById('season-avg-tab-graph');
                 if(graphTab) graphTab.innerHTML = '<p class="text-red-500 p-4">Error: UI elements missing for graph view.</p>';
                return; // Stop further processing for this tab
            }

            // Generate selectable stats config using the correct columns
            seasonAvgSelectableStats = generateSelectableStatsConfig(commonColumns);

            // Populate checkboxes
            populateSeasonAvgStatCheckboxes();

            // Add listener to the update button (only once)
            seasonAvgUpdateButton.addEventListener('click', handleUpdateSeasonAvgGraphsClick);

            // Add listener for the collapsible toggle (only once)
            seasonAvgSelectorToggle.addEventListener('click', () => {
                seasonAvgSelectorContent.classList.toggle('hidden');
                seasonAvgSelectorArrow.classList.toggle('rotate-180');
            });

            seasonAvgInitialRenderDone = true; // Mark setup as complete
        }

        // --- Data Dependent Rendering --- (Runs every time the function is called if data is ready)

        if (!seasonStats) {
            console.warn("Season stats not loaded yet for graph view.");
            seasonAvgPlayerGrid.innerHTML = '<div class="text-center py-8 text-orange-500 col-span-full">Season data is still loading. Please wait...</div>';
            return; // Don't proceed further until data is loaded
        }

        // Calculate ranges for ALL selectable stats if not already done
        ensureSeasonAvgStatRangesCalculated();

        // Render the graphs if the view isn't already populated or if triggered by update button
        // The actual rendering logic is now inside handleUpdateSeasonAvgGraphsClick
        // We just ensure the initial placeholder is correct or trigger initial render if needed.
        if (!seasonAvgGraphPopulated) {
            // If exactly 5 are selected by default, trigger the initial render
            if (Object.keys(getSelectedSeasonAvgStats()).length === PENTAGON_STAT_LIMIT_STATS) {
                 console.log("Triggering initial graph render for Season Avg.");
                 handleUpdateSeasonAvgGraphsClick(); // Render initial graphs
                 seasonAvgGraphPopulated = true;
            } else {
                // Show placeholder message if defaults are not 5
                seasonAvgPlayerGrid.innerHTML = '<div class="text-center py-8 text-gray-500 col-span-full">Select 5 stats and click "Update Graphs".</div>';
            }
        }
    }

    // Internal helper to create card specifically for StatsTables (avoids direct call to players.js global)
    function createPlayerCardInternal(playerData, container, canvasId) {
        const card = document.createElement('div');
        card.className = 'player-card border rounded-lg bg-white shadow p-3 flex flex-col items-center text-center';
        card.dataset.playerName = playerData.name;

        /* Commented out Picture Placeholder
        const picDiv = document.createElement('div');
        picDiv.className = 'w-20 h-20 bg-gray-300 rounded-full flex items-center justify-center mb-2';
        picDiv.innerHTML = '<span class="text-gray-500 text-xs">Pic</span>';
        card.appendChild(picDiv);
        */

        const nameSpan = document.createElement('span');
        nameSpan.className = 'text-base font-semibold text-gray-800 mb-2';
        nameSpan.textContent = playerData.name;
        card.appendChild(nameSpan);

        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'w-full relative';
        card.appendChild(canvasContainer);

        const canvas = document.createElement('canvas');
        canvas.id = canvasId; // Use provided unique ID
        canvas.width = 200;
        canvas.height = 192;
        canvasContainer.appendChild(canvas);

        container.appendChild(card);
        return card; // Return the card element itself
    }

    // Check if the graph tab is active and needs rendering
    function checkAndRenderSeasonGraph() {
        const graphTabButton = document.getElementById('season-avg-graph-tab');
        if (graphTabButton && graphTabButton.getAttribute('aria-selected') === 'true') {
            renderSeasonAvgGraphView();
        }
    }

    // --- Event Handlers ---
    function handleSeasonAvgSubTabClick(event) {
        const clickedTab = event.target.closest('.map-tab-button'); // Find closest map-tab-button
        if (!clickedTab || !clickedTab.closest('#season-avg-sub-tabs')) return; // Ensure it's within the correct tab list

        event.preventDefault();

        const targetPaneSelector = clickedTab.dataset.tabsTarget;
        const targetPane = document.querySelector(targetPaneSelector);
        const tabContainer = clickedTab.closest('ul'); // #season-avg-sub-tabs
        const allTabs = tabContainer.querySelectorAll('.map-tab-button'); // Select by map-tab-button
        const contentContainer = document.getElementById('season-avg-tab-content');
        const allPanes = contentContainer ? contentContainer.querySelectorAll('.season-avg-tab-pane') : [];

        // Update tab appearance - relies ONLY on adding/removing .active class
        allTabs.forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });
        clickedTab.classList.add('active'); // Add ONLY the .active class
        clickedTab.setAttribute('aria-selected', 'true');

        // Update content pane visibility
        allPanes.forEach(pane => {
            pane.classList.add('hidden');
            pane.classList.remove('active');
        });
        if (targetPane) {
            targetPane.classList.remove('hidden');
            targetPane.classList.add('active');
        } else {
            console.error(`Target pane not found for selector: ${targetPaneSelector}`);
        }

        // If the graph tab was clicked, ensure its content is initialized/rendered
        if (targetPaneSelector === '#season-avg-tab-graph') {
            renderSeasonAvgGraphView(); // This now handles both initial setup and data loading checks
        } else if (targetPaneSelector === '#season-avg-tab-head2head') { // NEW: Handle H2H tab click
            renderSeasonAvgH2HView();
        }
    }

    // --- Helper: Generate Selectable Stats from Columns ---
    function generateSelectableStatsConfig(columns) {
        const config = {};
        let defaultCount = 0;
        const PENTAGON_LIMIT = 5; // Use local constant

        // First pass: identify potential candidates and assign defaults
        columns.forEach(col => {
            // Exclude only the name column
            if (col.key && col.label && col.key !== 'name') { // REMOVED !col.isDiff check
                // Determine if it should be a default selection
                // Prioritize non-diff columns for defaults if possible, but check only first 5 suitable overall
                const isDefaultCandidate = defaultCount < PENTAGON_LIMIT; // Still limit defaults to 5
                // Let's keep the simple logic: first 5 suitable stats are default
                const isDefault = isDefaultCandidate;

                config[col.key] = {
                    label: col.label,
                    default: isDefault,
                    // Assign format, handle potential missing decimals for DIFF columns if necessary
                    format: col.isPercentage ? 'percent' : (col.decimals === 2 ? 'decimal2' : (col.decimals === 1 ? 'decimal1' : 'decimal0'))
                };
                if (isDefault) {
                    defaultCount++;
                }
            }
        });

        // If fewer than 5 defaults were found (e.g., very few numeric columns),
        // this logic doesn't automatically select more. The user must choose 5.
        console.log(`Generated selectable stats config for columns:`, columns, config);
        return config;
    }

    // --- Season Avg Graph View Specific Helpers ---
    function getSelectedSeasonAvgStats() {
        const selectedConfig = {};
        if (!seasonAvgCheckboxContainer) return selectedConfig;
        const checkboxes = seasonAvgCheckboxContainer.querySelectorAll('.season-avg-pentagon-stat-option:checked');
        checkboxes.forEach(cb => {
            const key = cb.dataset.statKey;
            if (seasonAvgSelectableStats[key]) { // Get the full config for the selected key
                selectedConfig[key] = seasonAvgSelectableStats[key];
            }
        });
        return selectedConfig;
    }

    function updateSeasonAvgStatSelectionUI() {
        if (!seasonAvgCheckboxContainer || !seasonAvgValidationMsg || !seasonAvgUpdateButton) return;

        const selectedCount = Object.keys(getSelectedSeasonAvgStats()).length;
        const checkboxes = seasonAvgCheckboxContainer.querySelectorAll('.season-avg-pentagon-stat-option');

        if (selectedCount === PENTAGON_STAT_LIMIT_STATS) {
            seasonAvgValidationMsg.textContent = '';
            seasonAvgUpdateButton.disabled = false;
            seasonAvgUpdateButton.classList.remove('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = !cb.checked; });
        } else {
            seasonAvgValidationMsg.textContent = `Select ${PENTAGON_STAT_LIMIT_STATS} stats (${selectedCount} selected)`;
            seasonAvgUpdateButton.disabled = true;
            seasonAvgUpdateButton.classList.add('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = false; });
        }
    }

     function handleSeasonAvgCheckboxChange() {
        updateSeasonAvgStatSelectionUI();
    }

    function handleUpdateSeasonAvgGraphsClick() {
        console.log("Updating Season Avg graphs...");
        const selectedStatsConfig = getSelectedSeasonAvgStats(); // Get the rich config object

        if (Object.keys(selectedStatsConfig).length !== PENTAGON_STAT_LIMIT_STATS) {
            seasonAvgValidationMsg.textContent = `Error: Select exactly ${PENTAGON_STAT_LIMIT_STATS} stats.`;
            return;
        }

        if (!seasonStats || !seasonAvgPlayerGrid) {
            console.error("Cannot update graphs: Season data or grid container missing.");
             seasonAvgValidationMsg.textContent = "Error: Data or container missing.";
            return;
        }

        // Re-render all charts using the stored raw data and ALL calculated ranges
        const allPlayersSeasonData = convertStatsArrayToObject(seasonStats);
        const activePlayersData = Object.values(allPlayersSeasonData)
            .filter(p => p && typeof p.matches === 'number' && p.matches > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

        seasonAvgPlayerGrid.innerHTML = ''; // Clear existing cards before re-rendering

        activePlayersData.forEach(playerData => {
            const canvasId = `season-avg-chart-${playerData.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            createPlayerCardInternal(playerData, seasonAvgPlayerGrid, canvasId); // Create card structure
            // Render with the NEW selected stats and the initially calculated ranges for ALL stats
            setTimeout(() => {
                 // Pass the rich config object
                 PlayerCharts.renderPentagonChart(playerData, canvasId, selectedStatsConfig, seasonAvgAllStatRanges);
            }, 0);
        });

        seasonAvgValidationMsg.textContent = 'Graphs updated!';
        setTimeout(() => { seasonAvgValidationMsg.textContent = ''; }, 2000);
    }

    function populateSeasonAvgStatCheckboxes() {
        if (!seasonAvgCheckboxContainer) return;
        seasonAvgCheckboxContainer.innerHTML = ''; // Clear loading/placeholders

        Object.entries(seasonAvgSelectableStats).forEach(([key, config]) => {
            const div = document.createElement('div');
            const label = document.createElement('label');
            label.className = 'inline-flex items-center';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 season-avg-pentagon-stat-option'; // Unique class
            input.dataset.statKey = key;
            input.dataset.statLabel = config.label;
            input.checked = config.default;
            input.addEventListener('change', handleSeasonAvgCheckboxChange);
            const span = document.createElement('span');
            span.className = 'ml-2 text-sm text-gray-700';
            span.textContent = config.label;
            label.appendChild(input);
            label.appendChild(span);
            div.appendChild(label);
            seasonAvgCheckboxContainer.appendChild(div);
        });
         updateSeasonAvgStatSelectionUI(); // Set initial state after populating
    }

    // --- NEW: Helper function to process raw stats array into a map ---
    function processStatsIntoMap(statsArray, mapKey = 'steam_id') {
        const statsMap = {};
        if (!Array.isArray(statsArray)) {
            console.error("Invalid stats data provided for processing:", statsArray);
            return statsMap;
        }
        statsArray.forEach(player => {
            if (player && player[mapKey]) {
                statsMap[player[mapKey]] = player;
            } else {
                console.warn("Skipping player object due to missing key:", player);
            }
        });
        return statsMap;
    }

    // --- Last 10 Graph View Specific Helpers ---
    function getSelectedLast10Stats() {
        const selectedConfig = {};
        if (!last10CheckboxContainer) return selectedConfig;
        const checkboxes = last10CheckboxContainer.querySelectorAll('.last10-pentagon-stat-option:checked');
        checkboxes.forEach(cb => {
            const key = cb.dataset.statKey;
            if (last10SelectableStats[key]) { // Get the full config
                 selectedConfig[key] = last10SelectableStats[key];
            }
        });
        return selectedConfig;
    }

    function updateLast10StatSelectionUI() {
        if (!last10CheckboxContainer || !last10ValidationMsg || !last10UpdateButton) return;
        const selectedCount = Object.keys(getSelectedLast10Stats()).length;
        const checkboxes = last10CheckboxContainer.querySelectorAll('.last10-pentagon-stat-option');
        if (selectedCount === PENTAGON_STAT_LIMIT_STATS) {
            last10ValidationMsg.textContent = '';
            last10UpdateButton.disabled = false;
            last10UpdateButton.classList.remove('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = !cb.checked; });
        } else {
            last10ValidationMsg.textContent = `Select ${PENTAGON_STAT_LIMIT_STATS} stats (${selectedCount} selected)`;
            last10UpdateButton.disabled = true;
            last10UpdateButton.classList.add('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = false; });
        }
    }

    function handleLast10CheckboxChange() {
        updateLast10StatSelectionUI();
    }

    function handleUpdateLast10GraphsClick() {
        console.log("Updating Last 10 graphs...");
        const selectedStatsConfig = getSelectedLast10Stats(); // Get the rich config object
        if (Object.keys(selectedStatsConfig).length !== PENTAGON_STAT_LIMIT_STATS) {
            last10ValidationMsg.textContent = `Error: Select exactly ${PENTAGON_STAT_LIMIT_STATS} stats.`;
            return;
        }
        if (!last10Stats || !last10PlayerGrid) {
            console.error("Cannot update graphs: Last 10 data or grid container missing.");
            last10ValidationMsg.textContent = "Error: Data or container missing.";
            return;
        }
        const allPlayersLast10Data = convertStatsArrayToObject(last10Stats);
        const activePlayersData = Object.values(allPlayersLast10Data)
            .filter(p => p && typeof p.matches === 'number' && p.matches > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
        last10PlayerGrid.innerHTML = '';
        activePlayersData.forEach(playerData => {
            const canvasId = `last10-chart-${playerData.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            createPlayerCardInternal(playerData, last10PlayerGrid, canvasId);
            setTimeout(() => {
                // Pass the rich config object
                PlayerCharts.renderPentagonChart(playerData, canvasId, selectedStatsConfig, last10AllStatRanges);
            }, 0);
        });
        last10ValidationMsg.textContent = 'Graphs updated!';
        setTimeout(() => { last10ValidationMsg.textContent = ''; }, 2000);
    }

    function populateLast10StatCheckboxes() {
        if (!last10CheckboxContainer) return;
        last10CheckboxContainer.innerHTML = '';
        Object.entries(last10SelectableStats).forEach(([key, config]) => {
            const div = document.createElement('div');
            const label = document.createElement('label');
            label.className = 'inline-flex items-center';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 last10-pentagon-stat-option'; // Unique class
            input.dataset.statKey = key;
            input.dataset.statLabel = config.label;
            input.checked = config.default;
            input.addEventListener('change', handleLast10CheckboxChange);
            const span = document.createElement('span');
            span.className = 'ml-2 text-sm text-gray-700';
            span.textContent = config.label;
            label.appendChild(input);
            label.appendChild(span);
            div.appendChild(label);
            last10CheckboxContainer.appendChild(div);
        });
        updateLast10StatSelectionUI();
    }

    // --- Main Rendering Logic for Last 10 Graph ---
    function renderLast10GraphView() {
        if (!last10InitialRenderDone) {
            console.log("Performing initial setup for Last 10 Graph View...");
            last10CheckboxContainer = document.getElementById('last10-pentagon-stat-checkboxes');
            last10UpdateButton = document.getElementById('update-last10-graphs-btn');
            last10ValidationMsg = document.getElementById('last10-stat-validation-msg');
            last10PlayerGrid = document.getElementById('last10-player-grid');
            last10SelectorToggle = document.getElementById('last10-stat-selector-toggle');
            last10SelectorContent = document.getElementById('last10-stat-selector-content');
            last10SelectorArrow = document.getElementById('last10-stat-arrow');

            if (!last10CheckboxContainer || !last10UpdateButton || !last10ValidationMsg || !last10PlayerGrid || !last10SelectorToggle || !last10SelectorContent || !last10SelectorArrow) {
                console.error("Missing required elements for Last 10 graph tab setup!");
                const graphTab = document.getElementById('last10-tab-graph');
                if(graphTab) graphTab.innerHTML = '<p class="text-red-500 p-4">Error: UI elements missing for graph view.</p>';
                return;
            }
            // Generate selectable stats config using the correct columns
            last10SelectableStats = generateSelectableStatsConfig(commonColumns);
            populateLast10StatCheckboxes();
            last10UpdateButton.addEventListener('click', handleUpdateLast10GraphsClick);
            last10SelectorToggle.addEventListener('click', () => {
                last10SelectorContent.classList.toggle('hidden');
                last10SelectorArrow.classList.toggle('rotate-180');
            });
            last10InitialRenderDone = true;
        }

        if (!last10Stats) {
            console.warn("Last 10 stats not loaded yet for graph view.");
            last10PlayerGrid.innerHTML = '<div class="text-center py-8 text-orange-500 col-span-full">Last 10 data is still loading. Please wait...</div>';
            return;
        }

        if (Object.keys(last10AllStatRanges).length === 0) {
            const allPlayersLast10Data = convertStatsArrayToObject(last10Stats);
            const allSelectableStatKeys = Object.keys(last10SelectableStats);
            last10AllStatRanges = PlayerCharts.calculateStatRanges(allPlayersLast10Data, allSelectableStatKeys);
            console.log("Calculated all stat ranges for Last 10:", last10AllStatRanges);
        }

        if (!last10GraphPopulated) {
            if (Object.keys(getSelectedLast10Stats()).length === PENTAGON_STAT_LIMIT_STATS) {
                 console.log("Triggering initial graph render for Last 10.");
                 handleUpdateLast10GraphsClick();
                 last10GraphPopulated = true;
            } else {
                last10PlayerGrid.innerHTML = '<div class="text-center py-8 text-gray-500 col-span-full">Select 5 stats and click "Update Graphs".</div>';
            }
        }
    }

    // --- NEW Event Handler for Last 10 Tabs ---
    function handleLast10SubTabClick(event) {
        const clickedTab = event.target.closest('.map-tab-button');
        if (!clickedTab || !clickedTab.closest('#last10-sub-tabs')) return;
        event.preventDefault();
        const targetPaneSelector = clickedTab.dataset.tabsTarget;
        const targetPane = document.querySelector(targetPaneSelector);
        const tabContainer = clickedTab.closest('ul');
        const allTabs = tabContainer.querySelectorAll('.map-tab-button');
        const contentContainer = document.getElementById('last10-tab-content');
        const allPanes = contentContainer ? contentContainer.querySelectorAll('.last10-tab-pane') : [];
        allTabs.forEach(tab => { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); });
        clickedTab.classList.add('active');
        clickedTab.setAttribute('aria-selected', 'true');
        allPanes.forEach(pane => { pane.classList.add('hidden'); pane.classList.remove('active'); });
        if (targetPane) {
            targetPane.classList.remove('hidden');
            targetPane.classList.add('active');
        } else {
            console.error(`Target pane not found for selector: ${targetPaneSelector}`);
        }
        if (targetPaneSelector === '#last10-tab-graph') {
            renderLast10GraphView(); // Call specific render function
        }
    }

    // --- Night Avg Graph View Specific Helpers ---
    function getSelectedNightAvgStats() {
        const selectedConfig = {};
        if (!nightAvgCheckboxContainer) return selectedConfig;
        const checkboxes = nightAvgCheckboxContainer.querySelectorAll('.night-avg-pentagon-stat-option:checked');
        checkboxes.forEach(cb => {
            const key = cb.dataset.statKey;
            if (nightAvgSelectableStats[key]) { // Get the full config
                 selectedConfig[key] = nightAvgSelectableStats[key];
            }
        });
        return selectedConfig;
    }

    function updateNightAvgStatSelectionUI() {
        if (!nightAvgCheckboxContainer || !nightAvgValidationMsg || !nightAvgUpdateButton) return;
        const selectedCount = Object.keys(getSelectedNightAvgStats()).length;
        const checkboxes = nightAvgCheckboxContainer.querySelectorAll('.night-avg-pentagon-stat-option');
        if (selectedCount === PENTAGON_STAT_LIMIT_STATS) {
            nightAvgValidationMsg.textContent = '';
            nightAvgUpdateButton.disabled = false;
            nightAvgUpdateButton.classList.remove('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = !cb.checked; });
        } else {
            nightAvgValidationMsg.textContent = `Select ${PENTAGON_STAT_LIMIT_STATS} stats (${selectedCount} selected)`;
            nightAvgUpdateButton.disabled = true;
            nightAvgUpdateButton.classList.add('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = false; });
        }
    }

    function handleNightAvgCheckboxChange() {
        updateNightAvgStatSelectionUI();
    }

    function handleUpdateNightAvgGraphsClick() {
        console.log("Updating Night Avg graphs...");
        const selectedStatsConfig = getSelectedNightAvgStats(); // Get the rich config object
        if (Object.keys(selectedStatsConfig).length !== PENTAGON_STAT_LIMIT_STATS) {
            nightAvgValidationMsg.textContent = `Error: Select exactly ${PENTAGON_STAT_LIMIT_STATS} stats.`;
            return;
        }
        if (!nightAvgStats || !nightAvgPlayerGrid) {
            console.error("Cannot update graphs: Night Avg data or grid container missing.");
            nightAvgValidationMsg.textContent = "Error: Data or container missing.";
            return;
        }
        // Convert Night Avg data (keys might have spaces, need to handle)
        const allPlayersNightAvgData = convertStatsArrayToObject(nightAvgStats);
        const activePlayersData = Object.values(allPlayersNightAvgData)
            // Night avg data doesn't have matches, assume all players shown are 'active' for the night
            .sort((a, b) => a.name.localeCompare(b.name));

        nightAvgPlayerGrid.innerHTML = '';
        activePlayersData.forEach(playerData => {
            const canvasId = `night-avg-chart-${playerData.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            createPlayerCardInternal(playerData, nightAvgPlayerGrid, canvasId);
            setTimeout(() => {
                // Pass the rich config object
                PlayerCharts.renderPentagonChart(playerData, canvasId, selectedStatsConfig, nightAvgAllStatRanges);
            }, 0);
        });
        nightAvgValidationMsg.textContent = 'Graphs updated!';
        setTimeout(() => { nightAvgValidationMsg.textContent = ''; }, 2000);
    }

    function populateNightAvgStatCheckboxes() {
        if (!nightAvgCheckboxContainer) return;
        nightAvgCheckboxContainer.innerHTML = '';
        Object.entries(nightAvgSelectableStats).forEach(([key, config]) => {
            const div = document.createElement('div');
            const label = document.createElement('label');
            label.className = 'inline-flex items-center';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 night-avg-pentagon-stat-option'; // Unique class
            input.dataset.statKey = key;
            input.dataset.statLabel = config.label;
            input.checked = config.default;
            input.addEventListener('change', handleNightAvgCheckboxChange);
            const span = document.createElement('span');
            span.className = 'ml-2 text-sm text-gray-700';
            span.textContent = config.label;
            label.appendChild(input);
            label.appendChild(span);
            div.appendChild(label);
            nightAvgCheckboxContainer.appendChild(div);
        });
        updateNightAvgStatSelectionUI();
    }

    // --- Main Rendering Logic for Night Avg Graph ---
    function renderNightAvgGraphView() {
        if (!nightAvgInitialRenderDone) {
            console.log("Performing initial setup for Night Avg Graph View...");
            nightAvgCheckboxContainer = document.getElementById('night-avg-pentagon-stat-checkboxes');
            nightAvgUpdateButton = document.getElementById('update-night-avg-graphs-btn');
            nightAvgValidationMsg = document.getElementById('night-avg-stat-validation-msg');
            nightAvgPlayerGrid = document.getElementById('night-avg-player-grid');
            nightAvgSelectorToggle = document.getElementById('night-avg-stat-selector-toggle');
            nightAvgSelectorContent = document.getElementById('night-avg-stat-selector-content');
            nightAvgSelectorArrow = document.getElementById('night-avg-stat-arrow');

            if (!nightAvgCheckboxContainer || !nightAvgUpdateButton || !nightAvgValidationMsg || !nightAvgPlayerGrid || !nightAvgSelectorToggle || !nightAvgSelectorContent || !nightAvgSelectorArrow) {
                console.error("Missing required elements for Night Avg graph tab setup!");
                const graphTab = document.getElementById('night-avg-tab-graph');
                if(graphTab) graphTab.innerHTML = '<p class="text-red-500 p-4">Error: UI elements missing.</p>';
                return;
            }
            // Generate selectable stats using nightAvgColumns definition
            nightAvgSelectableStats = generateSelectableStatsConfig(nightAvgColumns);
            populateNightAvgStatCheckboxes();
            nightAvgUpdateButton.addEventListener('click', handleUpdateNightAvgGraphsClick);
            nightAvgSelectorToggle.addEventListener('click', () => {
                nightAvgSelectorContent.classList.toggle('hidden');
                nightAvgSelectorArrow.classList.toggle('rotate-180');
            });
            nightAvgInitialRenderDone = true;
        }

        if (!nightAvgStats) {
            console.warn("Night Avg stats not loaded yet for graph view.");
            nightAvgPlayerGrid.innerHTML = '<div class="text-center py-8 text-orange-500 col-span-full">Night Avg data is still loading...</div>';
            return;
        }

        if (Object.keys(nightAvgAllStatRanges).length === 0) {
            const allPlayersNightAvgData = convertStatsArrayToObject(nightAvgStats);
            const allSelectableStatKeys = Object.keys(nightAvgSelectableStats);
            // Calculate ranges using the correct data and keys
            nightAvgAllStatRanges = PlayerCharts.calculateStatRanges(allPlayersNightAvgData, allSelectableStatKeys);
            console.log("Calculated all stat ranges for Night Avg:", nightAvgAllStatRanges);
        }

        if (!nightAvgGraphPopulated) {
            if (Object.keys(getSelectedNightAvgStats()).length === PENTAGON_STAT_LIMIT_STATS) {
                 console.log("Triggering initial graph render for Night Avg.");
                 handleUpdateNightAvgGraphsClick();
                 nightAvgGraphPopulated = true;
            } else {
                nightAvgPlayerGrid.innerHTML = '<div class="text-center py-8 text-gray-500 col-span-full">Select 5 stats and click "Update Graphs".</div>';
            }
        }
    }

    // --- NEW Event Handler for Night Avg Tabs ---
    function handleNightAvgSubTabClick(event) {
        const clickedTab = event.target.closest('.map-tab-button');
        if (!clickedTab || !clickedTab.closest('#night-avg-sub-tabs')) return;
        event.preventDefault();
        const targetPaneSelector = clickedTab.dataset.tabsTarget;
        const targetPane = document.querySelector(targetPaneSelector);
        const tabContainer = clickedTab.closest('ul');
        const allTabs = tabContainer.querySelectorAll('.map-tab-button');
        const contentContainer = document.getElementById('night-avg-tab-content');
        const allPanes = contentContainer ? contentContainer.querySelectorAll('.night-avg-tab-pane') : [];
        allTabs.forEach(tab => { tab.classList.remove('active'); tab.setAttribute('aria-selected', 'false'); });
        clickedTab.classList.add('active');
        clickedTab.setAttribute('aria-selected', 'true');
        allPanes.forEach(pane => { pane.classList.add('hidden'); pane.classList.remove('active'); });
        if (targetPane) {
            targetPane.classList.remove('hidden');
            targetPane.classList.add('active');
        } else {
            console.error(`Target pane not found for selector: ${targetPaneSelector}`);
        }
        if (targetPaneSelector === '#night-avg-tab-graph') {
            renderNightAvgGraphView(); // Call specific render function
        }
    }

    // --- NEW: Getter functions for stats by steam ID ---
    function getSeasonStatsBySteamId(steamId) {
        return seasonStatsBySteamId[steamId] || null;
    }

    function getLast10StatsBySteamId(steamId) {
        return last10StatsBySteamId[steamId] || null;
    }

    function getNightAvgStatsBySteamId(steamId) { // Added for completeness
        return nightAvgStatsBySteamId[steamId] || null;
    }

    // --- NEW: Season Avg Head-to-Head View Logic ---

    // Populate Player Select Dropdowns for H2H
    function populateSeasonAvgH2HPlayerSelectors() {
        if (!seasonStats || !seasonAvgH2HPlayer1Select || !seasonAvgH2HPlayer2Select) return;

        const activePlayers = seasonStats
            .filter(p => p && typeof p.matches === 'number' && p.matches > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

        // Clear existing options
        seasonAvgH2HPlayer1Select.innerHTML = '<option value="" disabled selected>Select Player 1</option>';
        seasonAvgH2HPlayer2Select.innerHTML = '<option value="" disabled selected>Select Player 2</option>';

        activePlayers.forEach(player => {
            const option1 = document.createElement('option');
            option1.value = player.steam_id;
            option1.textContent = player.name;
            seasonAvgH2HPlayer1Select.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = player.steam_id;
            option2.textContent = player.name;
            seasonAvgH2HPlayer2Select.appendChild(option2);
        });

        // Add listeners to disable selecting the same player
        const handlePlayerSelectionChange = () => {
            const p1 = seasonAvgH2HPlayer1Select.value;
            const p2 = seasonAvgH2HPlayer2Select.value;

            Array.from(seasonAvgH2HPlayer2Select.options).forEach(opt => {
                opt.disabled = (opt.value === p1 && p1 !== '');
            });
            Array.from(seasonAvgH2HPlayer1Select.options).forEach(opt => {
                opt.disabled = (opt.value === p2 && p2 !== '');
            });
            updateSeasonAvgH2HStatSelectionUI(); // Also update button state based on player selection

            // Auto-update H2H graph if both players and 5 stats are selected
            const selectedStatCount = Object.keys(getSelectedSeasonAvgH2HStats()).length;
            if (p1 && p2 && selectedStatCount === PENTAGON_STAT_LIMIT_STATS) {
                handleUpdateSeasonAvgH2HGraphClick();
            }
        };

        seasonAvgH2HPlayer1Select.removeEventListener('change', handlePlayerSelectionChange); // Prevent duplicates
        seasonAvgH2HPlayer1Select.addEventListener('change', handlePlayerSelectionChange);
        seasonAvgH2HPlayer2Select.removeEventListener('change', handlePlayerSelectionChange); // Prevent duplicates
        seasonAvgH2HPlayer2Select.addEventListener('change', handlePlayerSelectionChange);
    }


    // Get Selected Stats Config for H2H
    function getSelectedSeasonAvgH2HStats() {
        const selectedConfig = {};
        if (!seasonAvgH2HCheckboxContainer) return selectedConfig;
        const checkboxes = seasonAvgH2HCheckboxContainer.querySelectorAll('.season-avg-h2h-pentagon-stat-option:checked');
        checkboxes.forEach(cb => {
            const key = cb.dataset.statKey;
            if (seasonAvgH2HSelectableStats[key]) {
                selectedConfig[key] = seasonAvgH2HSelectableStats[key];
            }
        });
        return selectedConfig;
    }

    // Update UI State for H2H Stat Selection
    function updateSeasonAvgH2HStatSelectionUI() {
        if (!seasonAvgH2HCheckboxContainer || !seasonAvgH2HValidationMsg || !seasonAvgH2HUpdateButton || !seasonAvgH2HPlayer1Select || !seasonAvgH2HPlayer2Select) return;

        const selectedStatCount = Object.keys(getSelectedSeasonAvgH2HStats()).length;
        const checkboxes = seasonAvgH2HCheckboxContainer.querySelectorAll('.season-avg-h2h-pentagon-stat-option');
        const player1Selected = seasonAvgH2HPlayer1Select.value !== '';
        const player2Selected = seasonAvgH2HPlayer2Select.value !== '';

        const canUpdate = selectedStatCount === PENTAGON_STAT_LIMIT_STATS && player1Selected && player2Selected;

        if (canUpdate) {
            seasonAvgH2HValidationMsg.textContent = '';
            seasonAvgH2HUpdateButton.disabled = false;
            seasonAvgH2HUpdateButton.classList.remove('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = !cb.checked; });
        } else {
            let message = '';
            if (!player1Selected || !player2Selected) {
                message = 'Select two players. ';
            }
            if (selectedStatCount !== PENTAGON_STAT_LIMIT_STATS) {
                 message += `Select ${PENTAGON_STAT_LIMIT_STATS} stats (${selectedStatCount} selected).`;
            }
            seasonAvgH2HValidationMsg.textContent = message.trim();
            seasonAvgH2HUpdateButton.disabled = true;
            seasonAvgH2HUpdateButton.classList.add('opacity-50', 'cursor-not-allowed');
            checkboxes.forEach(cb => { cb.disabled = false; });
        }
    }

    // Handle Checkbox Change for H2H
    function handleSeasonAvgH2HCheckboxChange() {
        updateSeasonAvgH2HStatSelectionUI();
        // Auto-update H2H graph if both players and 5 stats are selected
        const p1 = seasonAvgH2HPlayer1Select && seasonAvgH2HPlayer1Select.value;
        const p2 = seasonAvgH2HPlayer2Select && seasonAvgH2HPlayer2Select.value;
        const selectedStatCount = Object.keys(getSelectedSeasonAvgH2HStats()).length;
        if (p1 && p2 && selectedStatCount === PENTAGON_STAT_LIMIT_STATS) {
            handleUpdateSeasonAvgH2HGraphClick();
        }
    }

    // Handle Update Button Click for H2H Graph
    function handleUpdateSeasonAvgH2HGraphClick() {
        console.log("Updating Season Avg H2H graph...");
        const selectedStatsConfig = getSelectedSeasonAvgH2HStats();
        const player1Id = seasonAvgH2HPlayer1Select.value;
        const player2Id = seasonAvgH2HPlayer2Select.value;

        if (Object.keys(selectedStatsConfig).length !== PENTAGON_STAT_LIMIT_STATS || !player1Id || !player2Id) {
            updateSeasonAvgH2HStatSelectionUI(); // Re-run validation to show appropriate message
            return;
        }

        if (!seasonStatsBySteamId || !seasonAvgH2HChartContainer || !PlayerCharts || typeof PlayerCharts.renderOverlayPentagonChart !== 'function') {
            console.error("Cannot update H2H graph: Data, container, or PlayerCharts.renderOverlayPentagonChart missing.");
            seasonAvgH2HValidationMsg.textContent = "Error: Required resources missing.";
            return;
        }

        const player1Data = seasonStatsBySteamId[player1Id];
        const player2Data = seasonStatsBySteamId[player2Id];

        if (!player1Data || !player2Data) {
             console.error("Could not find data for selected players:", player1Id, player2Id);
             seasonAvgH2HValidationMsg.textContent = "Error: Player data not found.";
             return;
        }

        // Ensure the chart canvas exists within the container
        let canvasId = 'season-avg-h2h-chart-canvas';
        let canvas = document.getElementById(canvasId);
        if (!canvas) {
             seasonAvgH2HChartContainer.innerHTML = ''; // Clear previous content
             canvas = document.createElement('canvas');
             canvas.id = canvasId;
             canvas.width = 400; // Adjust size as needed
             canvas.height = 384;
             seasonAvgH2HChartContainer.appendChild(canvas);
        }

        // We need the stat ranges calculated from the 'Graph' tab's logic.
        ensureSeasonAvgStatRangesCalculated();

        // Check if ranges were successfully calculated (might fail if seasonStats isn't ready)
        if (Object.keys(seasonAvgAllStatRanges).length === 0) {
            console.error("Cannot update H2H graph: Stat ranges could not be calculated.");
            seasonAvgH2HValidationMsg.textContent = "Error: Stat ranges unavailable. Data might still be loading.";
            return;
        }

        // Render the overlay chart
        setTimeout(() => {
            PlayerCharts.renderOverlayPentagonChart(
                player1Data,
                player2Data,
                canvasId,
                selectedStatsConfig,
                seasonAvgAllStatRanges // Use the globally calculated ranges
            );
        }, 0);

        seasonAvgH2HValidationMsg.textContent = 'Comparison updated!';
        setTimeout(() => { seasonAvgH2HValidationMsg.textContent = ''; }, 2000);
    }

    // Populate Stat Checkboxes for H2H
    function populateSeasonAvgH2HStatCheckboxes() {
        if (!seasonAvgH2HCheckboxContainer || Object.keys(seasonAvgH2HSelectableStats).length === 0) return;
        seasonAvgH2HCheckboxContainer.innerHTML = ''; // Clear

        Object.entries(seasonAvgH2HSelectableStats).forEach(([key, config]) => {
            const div = document.createElement('div');
            const label = document.createElement('label');
            label.className = 'inline-flex items-center';
            const input = document.createElement('input');
            input.type = 'checkbox';
            // Use a unique class for H2H checkboxes
            input.className = 'form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 season-avg-h2h-pentagon-stat-option';
            input.dataset.statKey = key;
            input.dataset.statLabel = config.label;
            input.checked = config.default; // Use defaults from H2H config
            input.addEventListener('change', handleSeasonAvgH2HCheckboxChange);
            const span = document.createElement('span');
            span.className = 'ml-2 text-sm text-gray-700';
            span.textContent = config.label;
            label.appendChild(input);
            label.appendChild(span);
            div.appendChild(label);
            seasonAvgH2HCheckboxContainer.appendChild(div);
        });
        updateSeasonAvgH2HStatSelectionUI(); // Set initial state
    }


    // Main Rendering Function for H2H View
    function renderSeasonAvgH2HView() {
        if (!seasonAvgH2HInitialRenderDone) {
            console.log("Performing initial setup for Season Avg H2H View...");
            // Get DOM elements for H2H tab
            seasonAvgH2HPlayer1Select = document.getElementById('season-avg-h2h-player1-select');
            seasonAvgH2HPlayer2Select = document.getElementById('season-avg-h2h-player2-select');
            seasonAvgH2HCheckboxContainer = document.getElementById('season-avg-h2h-pentagon-stat-checkboxes');
            seasonAvgH2HUpdateButton = document.getElementById('update-season-avg-h2h-graph-btn');
            seasonAvgH2HValidationMsg = document.getElementById('season-avg-h2h-stat-validation-msg');
            seasonAvgH2HChartContainer = document.getElementById('season-avg-h2h-chart-container');
            seasonAvgH2HStatSelectorToggle = document.getElementById('season-avg-h2h-stat-selector-toggle');
            seasonAvgH2HStatSelectorContent = document.getElementById('season-avg-h2h-stat-selector-content');
            seasonAvgH2HStatSelectorArrow = document.getElementById('season-avg-h2h-stat-arrow'); // Assuming same arrow ID structure

             // Basic element check
            if (!seasonAvgH2HPlayer1Select || !seasonAvgH2HPlayer2Select || !seasonAvgH2HCheckboxContainer || !seasonAvgH2HUpdateButton || !seasonAvgH2HValidationMsg || !seasonAvgH2HChartContainer || !seasonAvgH2HStatSelectorToggle || !seasonAvgH2HStatSelectorContent || !seasonAvgH2HStatSelectorArrow) {
                console.error("Missing required elements for Season Avg H2H tab setup!");
                const h2hTab = document.getElementById('season-avg-tab-head2head');
                if(h2hTab) h2hTab.innerHTML = '<p class="text-red-500 p-4">Error: UI elements missing for H2H view.</p>';
                return; // Stop setup
            }

            // Generate selectable stats config (using the same source as Graph tab)
            // It's important these stats are comparable, so use commonColumns
            seasonAvgH2HSelectableStats = generateSelectableStatsConfig(commonColumns);

            // Populate player dropdowns
            populateSeasonAvgH2HPlayerSelectors();

            // Populate stat checkboxes
            populateSeasonAvgH2HStatCheckboxes();

            // Add listener to the update button
            seasonAvgH2HUpdateButton.addEventListener('click', handleUpdateSeasonAvgH2HGraphClick);

             // Add listener for the collapsible stat selector
            seasonAvgH2HStatSelectorToggle.addEventListener('click', () => {
                seasonAvgH2HStatSelectorContent.classList.toggle('hidden');
                seasonAvgH2HStatSelectorArrow.classList.toggle('rotate-180');
            });

            seasonAvgH2HInitialRenderDone = true; // Mark setup as complete
        }

        // --- Data Dependent Logic --- (Runs every time tab is viewed)
        if (!seasonStats) {
             console.warn("Season stats not loaded yet for H2H view.");
             // Display a loading message in the main container or specific area
             if(seasonAvgH2HChartContainer) seasonAvgH2HChartContainer.innerHTML = '<div class="text-center py-8 text-orange-500 col-span-full">Season data is still loading...</div>';
             if(seasonAvgH2HPlayer1Select) seasonAvgH2HPlayer1Select.disabled = true; // Disable selects while loading
             if(seasonAvgH2HPlayer2Select) seasonAvgH2HPlayer2Select.disabled = true;
             if(seasonAvgH2HUpdateButton) seasonAvgH2HUpdateButton.disabled = true; // Disable button
             return;
        } else {
             // Re-enable elements if they were disabled during loading
             if(seasonAvgH2HPlayer1Select) seasonAvgH2HPlayer1Select.disabled = false;
             if(seasonAvgH2HPlayer2Select) seasonAvgH2HPlayer2Select.disabled = false;
             // Update button state depends on selections, call UI update
             updateSeasonAvgH2HStatSelectionUI();

             // If players aren't populated yet (e.g., data loaded after initial render attempt)
             if (seasonAvgH2HPlayer1Select && seasonAvgH2HPlayer1Select.options.length <= 1) {
                 populateSeasonAvgH2HPlayerSelectors();
             }
        }

        // Ensure the placeholder or existing chart is displayed correctly.
        // The actual chart update happens on button click.
        if (seasonAvgH2HChartContainer && !seasonAvgH2HChartContainer.querySelector('canvas')) {
            seasonAvgH2HChartContainer.innerHTML = '<div class="text-center py-8 text-gray-500 col-span-full">Select two players and 5 stats, then click "Update Comparison".</div>';
        }
    }

    // --- Initialization ---
    function init() {
        loadAndRenderSeasonAvgTable();
        loadAndRenderLast10Table();
        loadAndRenderNightAvgTable();

        // Add event listener for season average sub-tabs
        const seasonAvgTabsContainer = document.getElementById('season-avg-sub-tabs');
        if (seasonAvgTabsContainer) {
            seasonAvgTabsContainer.addEventListener('click', handleSeasonAvgSubTabClick);
        }

        // Add event listener for last 10 sub-tabs
        const last10TabsContainer = document.getElementById('last10-sub-tabs');
        if (last10TabsContainer) {
            last10TabsContainer.addEventListener('click', handleLast10SubTabClick);
        }

        // Add event listener for night average sub-tabs
        const nightAvgTabsContainer = document.getElementById('night-avg-sub-tabs');
        if (nightAvgTabsContainer) {
            nightAvgTabsContainer.addEventListener('click', handleNightAvgSubTabClick);
        }
    }

    // Public interface
    return {
        init: init,
        fillSeasonAvgTable: fillSeasonAvgTable,
        fillLast10Table: fillLast10Table,
        fillNightAvgTable: fillNightAvgTable,
        get seasonStats() { return seasonStats; },
        get last10Stats() { return last10Stats; },
        get nightAvgStats() { return nightAvgStats; },
        getSeasonStatsBySteamId: getSeasonStatsBySteamId, // Expose new getter
        getLast10StatsBySteamId: getLast10StatsBySteamId, // Expose new getter
        getNightAvgStatsBySteamId: getNightAvgStatsBySteamId // Expose new getter
    };
})();

// Make StatsTables globally available if needed by other scripts (like MainScript for sorting)
// window.StatsTables = StatsTables; // Or manage dependencies differently
// Expose globally for TeamPicker to use
window.StatsTables = StatsTables;