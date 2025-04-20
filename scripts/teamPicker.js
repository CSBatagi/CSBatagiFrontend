// ==================================================
// --- Team Picker Module/Object --- 
// ==================================================

const TeamPicker = {
    // --- Constants (Specific to Team Picker) ---
    KABILE_JSON_URL: 'data/kabile.json',
    MAPS_JSON_URL: 'data/maps.json',
    DB_PATH: 'teamPickerState', // Firebase root path for this feature

    // --- State (specific to Team Picker) ---
    // These will now be primarily populated/updated by Firebase listeners
    availablePlayers: [], // Populated by updateAvailablePlayerDisplay
    currentAttendanceData: {}, // Stores latest { playerName: status } from Firebase
    teamAPlayers: [],
    teamBPlayers: [],
    teamAName: 'Team A', // Can be updated by Kabile selection via FB
    teamBName: 'Team B', // Can be updated by Kabile selection via FB
    mapSelections: { // Will be populated by FB listener
        map1: { mapName: '', t_team: '', ct_team: '' },
        map2: { mapName: '', t_team: '', ct_team: '' },
        map3: { mapName: '', t_team: '', ct_team: '' },
    },
    teamAAverages: {}, // Added to store calculated averages for Team A
    teamBAverages: {}, // Added to store calculated averages for Team B
    MAX_PLAYERS_PER_TEAM: 15,
    dbRef: null, // Firebase database reference
    listenersAttached: false, // Flag to prevent duplicate listeners

    /**
     * Initializes the team picker page
     */
    init: function() {
        // Get reference to the Firebase path for the team picker
        // Assuming 'database' is globally available from MainScript.js (initialized in DOMContentLoaded)
        if (typeof database === 'undefined' || database === null) {
            console.error("Firebase database is not initialized or assignment failed.");
            showMessage("Error connecting to sync service.", 'error');
            return;
        }
        this.dbRef = database.ref(this.DB_PATH);

        // Load static dropdown options first (Kabile, Maps)
        Promise.all([
            TeamPicker.fetchKabileData(),
            TeamPicker.fetchMapsData(),
        ]).then(([kabileData, mapsData]) => {
            TeamPicker.populateKabileDropdowns(kabileData); // Populate options
            TeamPicker.populateMapDropdowns(mapsData);     // Populate options
            
            // Initial population of available players - REMOVED
            // TeamPicker.updateAvailablePlayersList(); // Now handled by Firebase listener

            // Attach Firebase Listeners (only once)
            if (!this.listenersAttached) {
                TeamPicker.attachFirebaseListeners();
                this.listenersAttached = true;
            }

            // Setup local UI event listeners (dropdown changes, etc.)
            // These will now WRITE to Firebase, not just update local state/UI
            TeamPicker.setupLocalEventListeners(); 

        }).catch(error => {
            console.error('Error loading static data for Team Picker:', error);
            showMessage('Error loading Kabile/Map options.', 'error');
            // Attempt to proceed without dropdown options if necessary
             if (!this.listenersAttached) {
                TeamPicker.attachFirebaseListeners();
                this.listenersAttached = true;
            }
            TeamPicker.setupLocalEventListeners();
        });
    },

    /**
     * Attaches Firebase listeners to sync state
     */
    attachFirebaseListeners: function() {
        if (!this.dbRef) return;

        // --- Listener for Attendance State --- 
        if (typeof database !== 'undefined' && database !== null && Attendance.ATTENDANCE_DB_PATH) {
            const attendanceRef = database.ref(Attendance.ATTENDANCE_DB_PATH);
            attendanceRef.on('value', (snapshot) => {
                const newAttendanceData = snapshot.val() || {};
                console.log("TeamPicker received attendance update:", newAttendanceData); // Debug

                // --- New Logic: Remove players from teams if not 'coming' anymore ---
                const updates = {};
                const playersToRemove = [];

                // Check Team A
                TeamPicker.teamAPlayers.forEach(player => {
                    if (newAttendanceData[player.name] !== 'coming') {
                        updates[`${TeamPicker.DB_PATH}/teamA/players/${player.name}`] = null;
                        playersToRemove.push(player.name);
                    }
                });

                // Check Team B
                TeamPicker.teamBPlayers.forEach(player => {
                    if (newAttendanceData[player.name] !== 'coming') {
                        updates[`${TeamPicker.DB_PATH}/teamB/players/${player.name}`] = null;
                        playersToRemove.push(player.name); // Add to list even if already added from Team A (harmless)
                    }
                });

                // Perform Firebase update if needed
                if (Object.keys(updates).length > 0) {
                    console.log("Removing players due to attendance change:", playersToRemove);
                    database.ref().update(updates).catch(error => {
                        console.error("Error removing players based on attendance change:", error);
                        showMessage("Error updating teams based on attendance.", 'error');
                    });
                    // Note: The teamA/teamB listeners will handle the UI update for team lists
                }
                // --- End New Logic ---

                // Update local state and refresh available players list
                this.currentAttendanceData = newAttendanceData; 
                this.updateAvailablePlayerDisplay(); // Update the list based on new attendance
            }, (error) => {
                console.error("Firebase attendance listener error in TeamPicker:", error);
            });
        } else {
            console.error('Firebase database or Attendance DB path not available for TeamPicker listener.');
        }
        // --- End Attendance Listener ---

        // Listener for Team A
        this.dbRef.child('teamA').on('value', (snapshot) => {
            const teamAData = snapshot.val() || { players: {}, kabile: '' };
            TeamPicker.teamAName = teamAData.kabile || 'Team A';
            TeamPicker.teamAPlayers = teamAData.players ? Object.keys(teamAData.players).map(name => ({ name })) : [];
            TeamPicker.updatePlayerSlots('team-a-players', TeamPicker.teamAPlayers);
            TeamPicker.updateAvailablePlayerDisplay(); // Refresh available list view
            const teamAKabileSelect = document.getElementById('team-a-kabile');
            if(teamAKabileSelect) teamAKabileSelect.value = teamAData.kabile || "";
            TeamPicker.updateMapSideTeamNames();
            TeamPicker.updateStatsDifferenceDisplay(); // Update diff display
        });

        // Listener for Team B
        this.dbRef.child('teamB').on('value', (snapshot) => {
            const teamBData = snapshot.val() || { players: {}, kabile: '' };
            TeamPicker.teamBName = teamBData.kabile || 'Team B';
            TeamPicker.teamBPlayers = teamBData.players ? Object.keys(teamBData.players).map(name => ({ name })) : [];
            TeamPicker.updatePlayerSlots('team-b-players', TeamPicker.teamBPlayers);
            TeamPicker.updateAvailablePlayerDisplay(); // Refresh available list view
            const teamBKabileSelect = document.getElementById('team-b-kabile');
            if(teamBKabileSelect) teamBKabileSelect.value = teamBData.kabile || "";
            TeamPicker.updateMapSideTeamNames();
            TeamPicker.updateStatsDifferenceDisplay(); // Update diff display
        });

        // Listener for Maps
        this.dbRef.child('maps').on('value', (snapshot) => {
            const mapsData = snapshot.val() || {};
            TeamPicker.mapSelections = { // Update local state
                map1: mapsData.map1 || { mapName: '', t_team: '', ct_team: '' },
                map2: mapsData.map2 || { mapName: '', t_team: '', ct_team: '' },
                map3: mapsData.map3 || { mapName: '', t_team: '', ct_team: '' },
            };
            // Update the map and side selection dropdowns in the UI
            TeamPicker.updateMapSelectsFromFirebase(TeamPicker.mapSelections);
        });
        
        // Listener for Available Players (if we decide to sync this list via Firebase)
        // this.dbRef.child('availablePlayers').on('value', (snapshot) => { ... });
        // For now, availablePlayers is derived locally and assignments are synced.
    },
    
     /**
     * Sets up local UI event listeners that trigger Firebase writes
     */
    setupLocalEventListeners: function() {
        // Kabile Selection
        const teamAKabileSelect = document.getElementById('team-a-kabile');
        const teamBKabileSelect = document.getElementById('team-b-kabile');
        if (teamAKabileSelect) teamAKabileSelect.addEventListener('change', (e) => TeamPicker.handleKabileChange('a', e.target.value));
        if (teamBKabileSelect) teamBKabileSelect.addEventListener('change', (e) => TeamPicker.handleKabileChange('b', e.target.value));

        // Map and Side Selection
        TeamPicker.setupMapSideSelectionListeners(); // Reuse existing setup, but handlers will write to FB

        // Player clicks (Available List - Handles Assign AND Remove)
        const availablePlayersContainer = document.getElementById('available-players');
        if (availablePlayersContainer) {
             availablePlayersContainer.removeEventListener('click', TeamPicker.handleAvailableListClick); // Use new handler
             availablePlayersContainer.addEventListener('click', TeamPicker.handleAvailableListClick);
         }
        
        // Player clicks (Team Lists - for removal)
        const teamAContainer = document.getElementById('team-a-players');
        const teamBContainer = document.getElementById('team-b-players');
        if (teamAContainer) {
            teamAContainer.removeEventListener('click', TeamPicker.handleTeamPlayerClick);
            teamAContainer.addEventListener('click', (e) => TeamPicker.handleTeamPlayerClick(e, 'a'));
        }
         if (teamBContainer) {
            teamBContainer.removeEventListener('click', TeamPicker.handleTeamPlayerClick);
            teamBContainer.addEventListener('click', (e) => TeamPicker.handleTeamPlayerClick(e, 'b'));
        }
    },
    
    /**
     * Handles changes to the Kabile select dropdowns. Writes to Firebase.
     * @param {'a' | 'b'} teamId - The team identifier ('a' or 'b').
     * @param {string} kabileName - The selected kabile name.
     */
    handleKabileChange: function(teamId, kabileName) {
        if (!this.dbRef) return;
        const teamPath = teamId === 'a' ? 'teamA' : 'teamB';
        this.dbRef.child(teamPath).child('kabile').set(kabileName)
            .catch(error => {
                console.error(`Error updating Kabile for Team ${teamId.toUpperCase()}:`, error);
                showMessage(`Failed to update Kabile for Team ${teamId.toUpperCase()}.`, 'error');
            });
    },

    /**
     * Handles clicks within the available players list (Assign or Remove).
     * @param {Event} event - The click event.
     */
    handleAvailableListClick: function(event) {
        const assignButton = event.target.closest('button.assign-button');
        const removeButton = event.target.closest('button.remove-from-list-button');

        if (assignButton) {
            // --- ASSIGN LOGIC --- 
            const playerName = assignButton.dataset.player;
            const targetTeam = assignButton.dataset.targetTeam; // 'a' or 'b'
            if (!playerName || !targetTeam || !TeamPicker.dbRef) return;
            console.log(`Assigning ${playerName} to Team ${targetTeam.toUpperCase()} via available list`);
            
            const playerData = TeamPicker.availablePlayers.find(p => p.name === playerName) || { name: playerName, stats: {} };
            const updates = {};
            const sourceTeamPath = targetTeam === 'a' ? 'teamB' : 'teamA';
            
            updates[`${TeamPicker.DB_PATH}/${targetTeam === 'a' ? 'teamA' : 'teamB'}/players/${playerName}`] = playerData;
            updates[`${TeamPicker.DB_PATH}/${sourceTeamPath}/players/${playerName}`] = null;
            
            database.ref().update(updates)
                 .catch(error => {
                    console.error(`Error assigning player ${playerName}:`, error);
                    showMessage(`Failed to assign player ${playerName}.`, 'error');
                });

        } else if (removeButton) {
            // --- REMOVE LOGIC (from available list view) ---
            const playerName = removeButton.dataset.player;
            const currentTeam = removeButton.dataset.currentTeam; // 'a' or 'b'
            if (!playerName || !currentTeam || !TeamPicker.dbRef) return;
            console.log(`Removing ${playerName} from Team ${currentTeam.toUpperCase()} via available list`);

            const teamPath = currentTeam === 'a' ? 'teamA' : 'teamB';
            const updates = {};
            updates[`${TeamPicker.DB_PATH}/${teamPath}/players/${playerName}`] = null;
            
            database.ref().update(updates)
                 .catch(error => {
                    console.error(`Error removing player ${playerName}:`, error);
                    showMessage(`Failed to remove player ${playerName}.`, 'error');
                });
        }
    },
    
     /**
      * Handles clicks on players within Team A or Team B lists (for removal). Writes removal to Firebase.
      * @param {Event} event - The click event.
      * @param {'a' | 'b'} teamId - The team the player is currently in.
      */
    handleTeamPlayerClick: function(event, teamId) {
        const button = event.target.closest('button.remove-button');
        if (!button) return;

        const playerName = button.dataset.player;
        if (!playerName || !TeamPicker.dbRef) return;

        console.log(`Removing ${playerName} from Team ${teamId.toUpperCase()}`); // Debug log

        const teamPath = teamId === 'a' ? 'teamA' : 'teamB';
        
        const updates = {};
        // Remove from the current team
        updates[`${TeamPicker.DB_PATH}/${teamPath}/players/${playerName}`] = null;
        // Add back to available list (if syncing this via Firebase)
        // const playerData = ... get player data if needed ...
        // updates[`${TeamPicker.DB_PATH}/availablePlayers/${playerName}`] = playerData; 

        // Perform atomic update
        database.ref().update(updates)
             .catch(error => {
                console.error(`Error removing player ${playerName}:`, error);
                showMessage(`Failed to remove player ${playerName}.`, 'error');
            });
    },

    /**
     * Updates the map/side select dropdown values based on data from Firebase.
     * @param {object} mapsState - The maps state object from Firebase.
     */
    updateMapSelectsFromFirebase: function(mapsState) {
        for (let i = 1; i <= 3; i++) {
            const mapData = mapsState[`map${i}`] || { mapName: '', t_team: '', ct_team: '' };
            const mapSelect = document.getElementById(`map-${i}`);
            const tSelect = document.getElementById(`map${i}-t-team`);
            const ctSelect = document.getElementById(`map${i}-ct-team`);

            if (mapSelect) mapSelect.value = mapData.mapName || "";
            if (tSelect) tSelect.value = mapData.t_team || "";
            if (ctSelect) ctSelect.value = mapData.ct_team || "";
        }
         // Ensure consistency (if T is A, CT must be B) - might be handled by Firebase rules later
         TeamPicker.enforceMapSideConsistency(); 
    },

    /**
     * Updates the list of available players based on current attendance and renders the table.
     * Called by Firebase listeners for attendance and team assignments.
     */
    updateAvailablePlayerDisplay: function() {
        if (!this.currentAttendanceData || Object.keys(this.currentAttendanceData).length === 0) { // Check if empty too
             // Optionally clear the display or show a loading state
             const availablePlayersContainer = document.getElementById('available-players');
             if (availablePlayersContainer) {
                 availablePlayersContainer.innerHTML = '<div class="text-center py-4 text-gray-500">Loading attendance...</div>';
             }
            return; // Wait for attendance data
        }

        // Filter global players based on Firebase attendance status ('coming')
        const comingPlayerNames = Object.keys(this.currentAttendanceData).filter(
            name => this.currentAttendanceData[name] === 'coming'
        );

        // Map names back to player objects from the global list (which has status etc.)
        // Ensure global players is actually an array
        const globalPlayersArray = Array.isArray(players) ? players : [];
        const comingPlayers = globalPlayersArray.filter(p => comingPlayerNames.includes(p.name));

        // Merge with stats data
        try {
             this.availablePlayers = comingPlayers.map(player => this.mergePlayerWithStats(player));
        } catch (error) {
            console.error("[updateAvailablePlayerDisplay] Error merging player stats:", error);
            this.availablePlayers = []; // Set to empty on error
        }

        this.renderAvailablePlayersTable();
    },

    /**
     * Renders the table of available players based on TeamPicker.availablePlayers
     * This is called initially and potentially by listeners if availablePlayers syncs via FB.
     */
    renderAvailablePlayersTable: function() {
         const availablePlayersContainer = document.getElementById('available-players');
        if (!availablePlayersContainer) return; // Exit if container not found

        // Clear container
        availablePlayersContainer.innerHTML = ''; // Clear previous content
        
        if (TeamPicker.availablePlayers.length === 0) {
            availablePlayersContainer.innerHTML = '<div class="text-center py-4 text-gray-500">No players available. Check attendance.</div>';
            return;
        }
        
        // Create scrollable wrapper
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'overflow-x-auto'; // Add horizontal scrolling
        
        // Create table
        const table = document.createElement('table');
        table.className = 'w-full border-collapse text-xs'; // text-xs
        table.id = 'available-players-table';
        
        const thead = document.createElement('thead');
        // Use <br> for line breaks in headers, remove whitespace-nowrap
        thead.innerHTML = `
            <tr class="bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase sticky top-0 z-10">
                <th class="px-1 py-1">Player</th>
                <th class="px-1 py-1 text-center">L10<br>HLT</th>
                <th class="px-1 py-1 text-center">L10<br>ADR</th>
                <th class="px-1 py-1 text-center">L10<br>K/D</th>
                <th class="px-1 py-1 text-center">S<br>HLT</th>
                <th class="px-1 py-1 text-center">S<br>ADR</th>
                <th class="px-1 py-1 text-center">S<br>K/D</th>
                <th class="px-1 py-1 text-center">Team</th> 
                <th class="px-1 py-1 text-center">Action</th>
            </tr>
        `;
        
        table.appendChild(thead);
        
        const tbody = document.createElement('tbody');
        tbody.id = 'available-players-tbody';
        table.appendChild(tbody);
        
        scrollWrapper.appendChild(table); // Add table to scroll wrapper
        availablePlayersContainer.appendChild(scrollWrapper); // Add scroll wrapper to container
        
        // Sort by HLTV2 by default (could be made dynamic later)
        TeamPicker.availablePlayers.sort((a, b) => {
            const valueA = a.stats && a.stats.L10_HLTV2 !== undefined ? a.stats.L10_HLTV2 : -Infinity;
            const valueB = b.stats && b.stats.L10_HLTV2 !== undefined ? b.stats.L10_HLTV2 : -Infinity;
            return valueB - valueA; // Descending order
        });
        
        // Render the table body rows
        TeamPicker.availablePlayers.forEach(player => {
            const row = TeamPicker.createAvailablePlayerRow(player);
            tbody.appendChild(row);
        });
        
        // After rendering, update rows based on current assignments
        TeamPicker.updateAssignedPlayersInAvailableList();
    },
    
    /**
     * Updates the visual state of rows in the available players list 
     * based on current team assignments (TeamPicker.teamAPlayers / TeamPicker.teamBPlayers).
     */
    updateAssignedPlayersInAvailableList: function() {
        const tbody = document.getElementById('available-players-tbody');
        if (!tbody) return;

        const assignedToA = new Set(TeamPicker.teamAPlayers.map(p => p.name));
        const assignedToB = new Set(TeamPicker.teamBPlayers.map(p => p.name));

        tbody.querySelectorAll('tr').forEach(row => {
            const playerName = row.dataset.playerName;
            const teamCell = row.querySelector('.player-team-cell');
            const actionCell = row.querySelector('.player-action-cell');
            
            if (!playerName || !teamCell || !actionCell) return;

            row.classList.remove('bg-blue-50', 'bg-green-50', 'opacity-50'); 
            actionCell.innerHTML = ''; // Clear actions

            if (assignedToA.has(playerName)) {
                row.classList.add('bg-blue-50', 'opacity-50');
                teamCell.textContent = 'A';
                teamCell.className = 'player-team-cell px-1 py-1 text-center text-blue-600 font-semibold';
                // Add remove button
                actionCell.innerHTML = `
                    <button data-player="${playerName}" data-current-team="a" class="remove-from-list-button text-red-500 hover:text-red-700 px-1 text-xs">Remove</button>
                `;
            } else if (assignedToB.has(playerName)) {
                row.classList.add('bg-green-50', 'opacity-50');
                teamCell.textContent = 'B';
                teamCell.className = 'player-team-cell px-1 py-1 text-center text-green-600 font-semibold';
                 // Add remove button
                 actionCell.innerHTML = `
                    <button data-player="${playerName}" data-current-team="b" class="remove-from-list-button text-red-500 hover:text-red-700 px-1 text-xs">Remove</button>
                `;
            } else {
                // Player is available
                teamCell.textContent = '-';
                teamCell.className = 'player-team-cell px-1 py-1 text-center text-gray-500';
                // Add assign buttons
                actionCell.innerHTML = `
                    <button data-player="${playerName}" data-target-team="a" class="assign-button text-blue-500 hover:text-blue-700 px-1 text-xs">->A</button>
                    <button data-player="${playerName}" data-target-team="b" class="assign-button text-green-500 hover:text-green-700 px-1 text-xs">->B</button>
                `;
            }
        });
    },


    /**
     * Creates a single row for the available players table.
     * @param {Object} player - Player object with stats.
     * @returns {HTMLTableRowElement} The created table row.
     */
    createAvailablePlayerRow: function(player) {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150';
        row.dataset.playerName = player.name; // Store name for easy access

        // Determine if player is already assigned (initially based on local state, updated by listener)
        const isAssignedToA = TeamPicker.teamAPlayers.some(p => p.name === player.name);
        const isAssignedToB = TeamPicker.teamBPlayers.some(p => p.name === player.name);
        const assignedTeam = isAssignedToA ? 'A' : (isAssignedToB ? 'B' : null);
        const rowClass = isAssignedToA ? 'bg-blue-50 opacity-50' : (isAssignedToB ? 'bg-green-50 opacity-50' : '');
        const teamText = isAssignedToA ? 'A' : (isAssignedToB ? 'B' : '-');
        const teamClass = isAssignedToA ? 'text-blue-600 font-semibold' : (isAssignedToB ? 'text-green-600 font-semibold' : 'text-gray-500');


        row.innerHTML = `
            <td class="px-1 py-1 font-medium text-gray-900 whitespace-nowrap">${player.name}</td>
            <td class="px-1 py-1 text-center">${formatStat(player.stats?.L10_HLTV2)}</td>
            <td class="px-1 py-1 text-center">${formatStat(player.stats?.L10_ADR, 0)}</td>
            <td class="px-1 py-1 text-center">${formatStat(player.stats?.L10_KD)}</td>
            <td class="px-1 py-1 text-center">${formatStat(player.stats?.S_HLTV2)}</td>
            <td class="px-1 py-1 text-center">${formatStat(player.stats?.S_ADR, 0)}</td>
            <td class="px-1 py-1 text-center">${formatStat(player.stats?.S_KD)}</td>
            <td class="player-team-cell px-1 py-1 text-center ${teamClass}">${teamText}</td>
            <td class="player-action-cell px-1 py-1 text-center whitespace-nowrap">
                ${!assignedTeam ? `
                    <button data-player="${player.name}" data-target-team="a" class="assign-button text-blue-500 hover:text-blue-700 px-1 text-xs">->A</button>
                    <button data-player="${player.name}" data-target-team="b" class="assign-button text-green-500 hover:text-green-700 px-1 text-xs">->B</button>
                    ` : ''
                }
            </td>
        `;
         if (assignedTeam && rowClass) {
             row.classList.add(...rowClass.split(' '));
         }
        return row;
    },
    
    // --- updatePlayerSlots (rendering logic for team lists) ---
     /**
     * Updates the player slots for a specific team.
     * @param {string} containerId - ID of the container element ('team-a-players' or 'team-b-players').
     * @param {Array} teamPlayers - Array of player objects for the team.
     */
    updatePlayerSlots: function(containerId, teamPlayers) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Clear existing content
        container.innerHTML = '';

        // Determine team context ('a' or 'b')
        const teamId = containerId.includes('team-a') ? 'a' : 'b';
        const teamColor = teamId === 'a' ? 'blue' : 'green';
        
        if (teamPlayers.length === 0) {
             container.innerHTML = '<p class="text-center text-gray-500 text-sm py-2">No players assigned.</p>';
             return; // No need to add table structure if empty
        }

        // Create table structure for assigned players
        const table = document.createElement('table');
        table.className = 'w-full border-collapse text-xs'; // text-xs for consistency

        const thead = document.createElement('thead');
         // Use <br> for line breaks in headers, remove whitespace-nowrap
        thead.innerHTML = `
            <tr class="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase sticky top-0 z-10">
                <th class="px-1 py-1">Player</th>
                <th class="px-1 py-1 text-center">L10<br>HLT</th>
                <th class="px-1 py-1 text-center">L10<br>ADR</th>
                <th class="px-1 py-1 text-center">L10<br>K/D</th>
                <th class="px-1 py-1 text-center">S<br>HLT</th>
                <th class="px-1 py-1 text-center">S<br>ADR</th>
                <th class="px-1 py-1 text-center">S<br>K/D</th>
                <th class="px-1 py-1 text-center">Action</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.id = `team-${teamId}-tbody`;
        
        // Merge players with stats and sort
        const teamPlayersWithStats = teamPlayers
            .map(p => TeamPicker.mergePlayerWithStats(p)) // Ensure stats are present
            .sort((a, b) => { // Sort by L10 HLTV descending
                const valueA = a.stats?.L10_HLTV2 ?? -Infinity;
                const valueB = b.stats?.L10_HLTV2 ?? -Infinity;
                return valueB - valueA;
            });

        teamPlayersWithStats.forEach(player => {
            const row = document.createElement('tr');
            row.className = `border-b border-gray-200 bg-${teamColor}-50`;
            row.dataset.playerName = player.name;

            row.innerHTML = `
                <td class="px-1 py-1 font-medium text-gray-900">${player.name}</td>
                <td class="px-1 py-1 text-center">${formatStat(player.stats?.L10_HLTV2)}</td>
                <td class="px-1 py-1 text-center">${formatStat(player.stats?.L10_ADR, 0)}</td>
                <td class="px-1 py-1 text-center">${formatStat(player.stats?.L10_KD)}</td>
                <td class="px-1 py-1 text-center">${formatStat(player.stats?.S_HLTV2)}</td>
                <td class="px-1 py-1 text-center">${formatStat(player.stats?.S_ADR, 0)}</td>
                <td class="px-1 py-1 text-center">${formatStat(player.stats?.S_KD)}</td>
                <td class="px-1 py-1 text-center">
                     <button data-player="${player.name}" class="remove-button text-red-500 hover:text-red-700 px-1 text-xs">Remove</button>
                 </td>
            `;
            tbody.appendChild(row);
        });

        table.appendChild(tbody);

        // --- Add Averages Row ---
        const averagesRow = table.createTFoot().insertRow(0);
        averagesRow.id = `team-${teamId}-averages-row`;
        averagesRow.className = `bg-${teamColor}-200 font-bold text-${teamColor}-800 text-xs`; // Style for averages
        averagesRow.innerHTML = `
             <td class="px-1 py-1 whitespace-nowrap">TEAM AVG</td>
             <td class="px-1 py-1 text-center whitespace-nowrap" data-stat="L10_HLTV2">N/A</td>
             <td class="px-1 py-1 text-center whitespace-nowrap" data-stat="L10_ADR">N/A</td>
             <td class="px-1 py-1 text-center whitespace-nowrap" data-stat="L10_KD">N/A</td>
             <td class="px-1 py-1 text-center whitespace-nowrap" data-stat="S_HLTV2">N/A</td>
             <td class="px-1 py-1 text-center whitespace-nowrap" data-stat="S_ADR">N/A</td>
             <td class="px-1 py-1 text-center whitespace-nowrap" data-stat="S_KD">N/A</td>
             <td class="px-1 py-1"></td> <!-- Empty cell for actions -->
         `;
        container.appendChild(table);

        // Calculate and update stats after rendering table structure
        TeamPicker.updateTeamStats(teamId);
    },

    // --- updateTeamStats ---
    /**
     * Calculates and updates the average stats row for a team.
     * @param {'a' | 'b'} teamId - The team identifier ('a' or 'b').
     */
    updateTeamStats: function(teamId) {
        const teamPlayers = (teamId === 'a') ? TeamPicker.teamAPlayers : TeamPicker.teamBPlayers;
        const averagesRow = document.getElementById(`team-${teamId}-averages-row`);
        const targetAvgObject = (teamId === 'a') ? this.teamAAverages : this.teamBAverages;

        // Clear stored averages first
        for (const key in targetAvgObject) {
            delete targetAvgObject[key];
        }

        if (!averagesRow || teamPlayers.length === 0) {
             // If row exists but team is empty, reset stats in UI
            if (averagesRow) {
                 averagesRow.querySelectorAll('td[data-stat]').forEach(cell => {
                     cell.textContent = 'N/A';
                 });
             }
             // Ensure stored averages are cleared (already done above)
             TeamPicker.updateStatsDifferenceDisplay(); // Update diff display when a team becomes empty
             return;
         }

        const teamPlayersWithStats = teamPlayers.map(p => TeamPicker.mergePlayerWithStats(p));

        const statsToAverage = ['L10_HLTV2', 'L10_ADR', 'L10_KD', 'S_HLTV2', 'S_ADR', 'S_KD'];
        const sums = {};
        const counts = {};

        statsToAverage.forEach(stat => {
            sums[stat] = 0;
            counts[stat] = 0;
        });

        teamPlayersWithStats.forEach(player => {
            statsToAverage.forEach(stat => {
                const value = player.stats?.[stat];
                if (value !== undefined && value !== null && !isNaN(value)) {
                    sums[stat] += value;
                    counts[stat]++;
                }
            });
        });

        averagesRow.querySelectorAll('td[data-stat]').forEach(cell => {
            const statKey = cell.dataset.stat;
            if (counts[statKey] > 0) {
                const average = sums[statKey] / counts[statKey];
                 // Format based on stat type (ADR = 0 decimals, others = 1 or 2)
                const decimals = statKey.includes('ADR') ? 0 : (statKey.includes('KD') ? 1 : 2);
                 cell.textContent = formatStat(average, decimals); // Use global formatStat
                 targetAvgObject[statKey] = average; // Store the raw average
            } else {
                cell.textContent = 'N/A';
                // Ensure N/A is reflected in stored averages (or absence implies N/A)
                 delete targetAvgObject[statKey]; // Remove if no valid data
            }
        });
        // Update the difference display whenever a team's stats are updated
        TeamPicker.updateStatsDifferenceDisplay(); 
    },

    /**
     * Calculates and displays the difference between Team A and Team B averages.
     * REVISED: Calculates averages directly from current team lists to avoid potential async issues.
     */
    updateStatsDifferenceDisplay: function() {
        const diffContainer = document.getElementById('team-stats-diff');
        if (!diffContainer) return;

        const statsToCompare = ['L10_HLTV2', 'L10_ADR', 'L10_KD', 'S_HLTV2', 'S_ADR', 'S_KD'];

        // Helper function to calculate averages for a given team list
        const calculateAverages = (teamPlayers) => {
            const averages = {};
            if (!teamPlayers || teamPlayers.length === 0) {
                return averages; // Return empty object if no players
            }

            const teamPlayersWithStats = teamPlayers.map(p => TeamPicker.mergePlayerWithStats(p));
            const sums = {};
            const counts = {};

            statsToCompare.forEach(stat => {
                sums[stat] = 0;
                counts[stat] = 0;
            });

            teamPlayersWithStats.forEach(player => {
                statsToCompare.forEach(stat => {
                    const value = player.stats?.[stat];
                    if (value !== undefined && value !== null && !isNaN(value)) {
                        sums[stat] += value;
                        counts[stat]++;
                    }
                });
            });

            statsToCompare.forEach(statKey => {
                if (counts[statKey] > 0) {
                    averages[statKey] = sums[statKey] / counts[statKey];
                }
            });
            return averages;
        };

        // Calculate current averages directly
        const currentTeamAAverages = calculateAverages(TeamPicker.teamAPlayers);
        const currentTeamBAverages = calculateAverages(TeamPicker.teamBPlayers);


        statsToCompare.forEach(statKey => {
            const diffCell = diffContainer.querySelector(`div[data-diff-stat="${statKey}"]`);
            if (!diffCell) return;

            // Use the freshly calculated averages
            const avgA = currentTeamAAverages[statKey];
            const avgB = currentTeamBAverages[statKey];
            const decimals = statKey.includes('ADR') ? 0 : (statKey.includes('KD') ? 1 : 2);

            if (avgA !== undefined && avgB !== undefined) {
                const diff = avgA - avgB;
                // Format with explicit plus sign for positive differences
                const formattedDiff = (diff > 0 ? '+' : '') + diff.toFixed(decimals); 
                let displayVal = '';
                let textColor = 'text-gray-700'; // Default color

                if (diff > 0) {
                     // Include "(A)" to indicate Team A is higher
                    displayVal = `${formattedDiff} (A)`;
                    textColor = 'text-blue-600'; 
                } else if (diff < 0) {
                     // Include "(B)" to indicate Team B is higher
                    displayVal = `${formattedDiff} (B)`; // Negative sign included by toFixed
                    textColor = 'text-green-600';
                } else {
                    displayVal = diff.toFixed(decimals); // Just "0.0" or "0.00"
                    textColor = 'text-gray-500';
                }
                diffCell.textContent = displayVal;
                diffCell.className = `text-center ${textColor}`; // Apply text color

            } else {
                // If either average is missing, display '-'
                diffCell.textContent = '-';
                diffCell.className = 'text-center text-gray-500'; // Reset color
            }
        });
    },

    // --- Map/Side Selection Logic ---
     /**
     * Sets up event listeners for map and side selection dropdowns.
     */
    setupMapSideSelectionListeners: function() {
        for (let i = 1; i <= 3; i++) {
            const mapSelect = document.getElementById(`map-${i}`);
            const tSelect = document.getElementById(`map${i}-t-team`);
            const ctSelect = document.getElementById(`map${i}-ct-team`);

            if (mapSelect) mapSelect.addEventListener('change', () => TeamPicker.handleMapChange(i));
            if (tSelect) tSelect.addEventListener('change', () => TeamPicker.handleSideChange(i, 't'));
            if (ctSelect) ctSelect.addEventListener('change', () => TeamPicker.handleSideChange(i, 'ct'));
        }
    },

    /**
     * Handles changes in map selection. Writes to Firebase.
     * @param {number} mapIndex - 1, 2, or 3.
     */
    handleMapChange: function(mapIndex) {
         if (!this.dbRef) return;
         const mapSelect = document.getElementById(`map-${mapIndex}`);
         if (!mapSelect) return;
         const mapName = mapSelect.value;
         this.dbRef.child(`maps/map${mapIndex}/mapName`).set(mapName)
            .catch(error => console.error(`Error updating Map ${mapIndex} name:`, error));
        // Side consistency check might be needed or handled by listener update
         TeamPicker.enforceMapSideConsistency(); 
    },

    /**
     * Handles changes in T/CT side selection. Writes to Firebase.
     * @param {number} mapIndex - 1, 2, or 3.
     * @param {'t' | 'ct'} side - The side that was changed.
     */
    handleSideChange: function(mapIndex, side) {
         if (!this.dbRef) return;
        const selectElement = document.getElementById(`map${mapIndex}-${side}-team`);
        if (!selectElement) return;
        const selectedTeam = selectElement.value; // 'A' or 'B' or ''

        const otherSide = (side === 't') ? 'ct' : 't';
        const otherSelectElement = document.getElementById(`map${mapIndex}-${otherSide}-team`);
        
        const updates = {};
        updates[`maps/map${mapIndex}/${side}_team`] = selectedTeam;

        // Auto-select other side if one is chosen and the other is empty or same
        if (selectedTeam && otherSelectElement) {
            const otherTeamCurrentValue = otherSelectElement.value;
            const otherTeamShouldBe = selectedTeam === 'A' ? 'B' : 'A';
             if(otherTeamCurrentValue === '' || otherTeamCurrentValue === selectedTeam) {
                 updates[`maps/map${mapIndex}/${otherSide}_team`] = otherTeamShouldBe;
             }
         } else if (!selectedTeam && otherSelectElement) {
             // If clearing one side, clear the other too for simplicity? Or leave it? Let's clear.
             updates[`maps/map${mapIndex}/${otherSide}_team`] = "";
         }

        this.dbRef.update(updates)
             .catch(error => console.error(`Error updating Map ${mapIndex} sides:`, error));
             
         // Note: UI update will be handled by the 'maps' listener reacting to the DB change.
         // We might still call enforceMapSideConsistency locally for immediate feedback, but the listener is the source of truth.
         // TeamPicker.enforceMapSideConsistency(); // Optional immediate UI update
    },
    
    /**
     * Updates the display names (Team A/B or Kabile name) in map side selectors.
     */
    updateMapSideTeamNames: function() {
        const teamAName = TeamPicker.teamAName || 'Team A';
        const teamBName = TeamPicker.teamBName || 'Team B';
        
        document.querySelectorAll('.map-container select option[value="A"]').forEach(opt => opt.textContent = teamAName);
        document.querySelectorAll('.map-container select option[value="B"]').forEach(opt => opt.textContent = teamBName);
    },

    /**
     * Enforces consistency in map side selections (if T is A, CT must be B).
     * This is mainly for immediate UI feedback; Firebase rules could enforce this too.
     */
    enforceMapSideConsistency: function() {
        for (let i = 1; i <= 3; i++) {
            const tSelect = document.getElementById(`map${i}-t-team`);
            const ctSelect = document.getElementById(`map${i}-ct-team`);

            if (!tSelect || !ctSelect) continue;

            const tVal = tSelect.value;
            const ctVal = ctSelect.value;

            if (tVal && tVal === ctVal) {
                // If both are set to the same, clear the one that wasn't just changed (tricky without event context)
                // For simplicity, let's just clear CT if T was set, and vice-versa (less ideal)
                // A better approach is in handleSideChange which writes the correct opposite to Firebase.
                // This function becomes more of a final check or visual sync if needed.
                console.warn(`Inconsistent sides detected for Map ${i}. Firebase update should correct this.`);
            }
            // The Firebase listener reacting to handleSideChange should ultimately fix the UI state.
        }
    },
     /**
     * Updates the team name based on kabile selection (Local UI update, FB triggers actual name change).
     */
    updateTeamName: function(event) {
         // This function might become redundant if kabile listener handles name update
         // Or it can provide immediate (though temporary) UI feedback before FB sync
         const teamId = event.target.id.includes('-a-') ? 'a' : 'b';
         const selectedKabile = event.target.value;
         const teamHeader = document.querySelector(`#page-team_picker .team-container:nth-child(${teamId === 'a' ? 1 : 2}) h3`);
         
         if (teamHeader) {
             teamHeader.textContent = selectedKabile || (teamId === 'a' ? 'Team A' : 'Team B');
             // Update local state immediately for responsiveness? Or rely purely on FB?
             // if (teamId === 'a') TeamPicker.teamAName = selectedKabile || 'Team A';
             // else TeamPicker.teamBName = selectedKabile || 'Team B';
         }
         // TeamPicker.updateMapSideTeamNames(); // Update names in map selects immediately
         // Note: The actual state change happens via handleKabileChange writing to Firebase.
    },

    /**
     * Fetches kabile data from JSON file
     */
    fetchKabileData: async function() {
        try {
            // Use the constant defined within the module
            const response = await fetch(this.KABILE_JSON_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching kabile data:', error);
            // Return default values if there's an error
            return ["Team A", "Team B", "Kabile 1", "HilingTurimik", "Kianlar", "ShilkadinoguflarI"];
        }
    },

    /**
     * Fetches maps data from JSON file
     */
    fetchMapsData: async function() {
        try {
            // Use the constant defined within the module
            const response = await fetch(this.MAPS_JSON_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching maps data:', error);
            // Return default values if there's an error
            return [
                {"id": "anubis", "name": "Anubis"},
                {"id": "ancient", "name": "Ancient"},
                {"id": "dust2", "name": "Dust II"},
                {"id": "inferno", "name": "Inferno"},
                {"id": "mirage", "name": "Mirage"},
                {"id": "nuke", "name": "Nuke"},
                {"id": "overpass", "name": "Overpass"}
            ];
        }
    },

    /**
     * Populates kabile dropdowns with data from JSON
     */
    populateKabileDropdowns: function(kabileData) {
        const teamAKabile = document.getElementById('team-a-kabile');
        const teamBKabile = document.getElementById('team-b-kabile');
        
        if (!teamAKabile || !teamBKabile) return;
        
        // Clear existing options
        teamAKabile.innerHTML = '<option value="">Select Kabile</option>';
        teamBKabile.innerHTML = '<option value="">Select Kabile</option>';
        
        // Add options from JSON data
        kabileData.forEach(kabile => {
            const optionA = document.createElement('option');
            optionA.value = kabile;
            optionA.textContent = kabile;
            teamAKabile.appendChild(optionA);
            
            const optionB = document.createElement('option');
            optionB.value = kabile;
            optionB.textContent = kabile;
            teamBKabile.appendChild(optionB);
        });
    },

    /**
     * Populates map dropdowns with data from JSON
     */
    populateMapDropdowns: function(mapsData) {
        const mapSelects = [
            document.getElementById('map-1'),
            document.getElementById('map-2'),
            document.getElementById('map-3')
        ];
        
        mapSelects.forEach(select => {
            if (!select) return;
            
            // Clear existing options
            select.innerHTML = '<option value="">Select Map</option>';
            
            // Add options from JSON data
            mapsData.forEach(map => {
                const option = document.createElement('option');
                option.value = map.id;
                option.textContent = map.name;
                select.appendChild(option);
            });
        });
    },
    
    /**
     * Merges player data with their stats (uses global stats arrays)
     * @param {Object} player - The player object with attendance info
     * @returns {Object} - Player with merged stats
     */
    mergePlayerWithStats: function(player) {
        const playerWithStats = { ...player, stats: {} };
        
        // Find player in last 10 stats (use StatsTables module state)
        const last10Player = StatsTables.last10Stats.find(p => p.name === player.name);
        if (last10Player) {
            playerWithStats.stats.L10_HLTV2 = last10Player.hltv_2;
            playerWithStats.stats.L10_ADR = last10Player.adr;
            playerWithStats.stats.L10_KD = last10Player.kd;
        }
        
        // Find player in season stats (use StatsTables module state)
        const seasonPlayer = StatsTables.seasonStats.find(p => p.name === player.name);
        if (seasonPlayer) {
            playerWithStats.stats.S_HLTV2 = seasonPlayer.hltv_2;
            playerWithStats.stats.S_ADR = seasonPlayer.adr;
            playerWithStats.stats.S_KD = seasonPlayer.kd;
        }
        
        return playerWithStats;
    },
}; 