const socket = io();
let currentUser = null;
let gameState = null;
let floors = 5; // Changed from 10 to 5
let selectedBid = null;
let selectedAction = null;

// Tutorial close handler
window.closeTutorialHandler = function() {
    const tutorialOverlay = document.getElementById('tutorialOverlay');
    const joinScreen = document.getElementById('joinScreen');
    
    if (tutorialOverlay) {
        tutorialOverlay.classList.add('hidden');
        tutorialOverlay.style.display = 'none';
    }
    
    if (joinScreen) {
        joinScreen.classList.remove('hidden');
        joinScreen.style.display = 'block';
    }
    
    localStorage.setItem('tutorialShown', 'true');
};

// All available actions
const ALL_ACTIONS = [
    { id: 'deferredSummon', name: '⏰ Deferred Summon', cost: 2, effect: 'Schedules elevator to your floor at START of next round' },
    { id: 'liquidityLock', name: '🔒 Liquidity Lock', cost: 2, effect: 'Target player\'s NEXT action costs +$1' },
    { id: 'marketSpoof', name: '🎭 Market Spoof', cost: 2, effect: 'Generates fake high-value bid that influences AI decisions' },
    { id: 'shortTheFloor', name: '📉 Short the Floor', cost: 3, effect: 'All bids targeting chosen floor have -50% effectiveness this round' },
    { id: 'earlyCommit', name: '⚡ Early Commit', cost: 1, effect: 'Your action resolves FIRST this round and cannot be cancelled' },
    { id: 'lateHijack', name: '🕰 Late Hijack', cost: 2, effect: 'At end of round, cancel ONE target player\'s action' },
    { id: 'insuranceProtocol', name: '🛡 Insurance Protocol', cost: 2, effect: 'If your next elevator action fails, refund cost and allow one retry' },
    { id: 'auditShield', name: '🛡 Audit Shield', cost: 1, effect: 'Negates the FIRST hostile action targeting you this round' },
    { id: 'hostileTakeover', name: '👑 Hostile Takeover', cost: 4, effect: 'You temporarily override elevator AI decision logic for this round' },
    { id: 'collapseTrigger', name: '💥 Collapse Trigger', cost: 3, effect: 'Increases system stress level by +25%' }
];

// Initialize UI
function initUI() {
    document.getElementById('joinButton').addEventListener('click', joinGame);
    document.getElementById('restartButton').addEventListener('click', () => location.reload());
    document.getElementById('startRoundButton').addEventListener('click', startRound);
    
    const skipActionButton = document.getElementById('skipActionButton');
    if (skipActionButton) {
        skipActionButton.addEventListener('click', () => {
            if (gameState && gameState.playerBid && !gameState.playerAction && gameState.roundPhase === 'actions') {
                // Skip action and process round
                socket.emit('submitAction', { actionType: null }); // Send null to skip
            }
        });
    }
    document.getElementById('submitBidButton').addEventListener('click', submitBid);
    
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    if (upButton) upButton.addEventListener('click', () => selectDirection('up'));
    if (downButton) downButton.addEventListener('click', () => selectDirection('down'));
    
    setTimeout(() => {
        const closeTutorialBtn = document.getElementById('closeTutorial');
        if (closeTutorialBtn) {
            closeTutorialBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.closeTutorialHandler();
                return false;
            };
        }
    }, 100);
    
    document.getElementById('nicknameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });
    
    const bidInput = document.getElementById('bidInput');
    if (bidInput) {
        bidInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitBid();
        });
    }
    
    const bidUpButton = document.getElementById('bidUpButton');
    const bidDownButton = document.getElementById('bidDownButton');
    if (bidUpButton && bidDownButton && bidInput) {
        bidUpButton.addEventListener('click', () => {
            const currentValue = parseInt(bidInput.value) || 1;
            const maxValue = currentUser ? currentUser.credits : 50;
            if (currentValue < maxValue) {
                bidInput.value = currentValue + 1;
            }
        });
        
        bidDownButton.addEventListener('click', () => {
            const currentValue = parseInt(bidInput.value) || 1;
            if (currentValue > 1) {
                bidInput.value = currentValue - 1;
            }
        });
        bidInput.style.paddingRight = '45px';
    }
    
    const showTutorialButton = document.getElementById('showTutorialButton');
    if (showTutorialButton) {
        showTutorialButton.addEventListener('click', function() {
            const tutorialOverlay = document.getElementById('tutorialOverlay');
            if (tutorialOverlay) {
                tutorialOverlay.classList.remove('hidden');
                tutorialOverlay.style.display = 'flex';
            }
        });
    }
    
    // Hide all screens except join screen
    const tutorialOverlay = document.getElementById('tutorialOverlay');
    const joinScreen = document.getElementById('joinScreen');
    const gameScreen = document.getElementById('gameScreen');
    const collapseScreen = document.getElementById('collapseScreen');
    
    if (tutorialOverlay) tutorialOverlay.classList.add('hidden');
    if (gameScreen) gameScreen.classList.add('hidden');
    if (collapseScreen) collapseScreen.classList.add('hidden');
    if (joinScreen) joinScreen.classList.remove('hidden');
}

function joinGame() {
    const nickname = document.getElementById('nicknameInput').value.trim();
    if (!nickname) {
        showNotification('Please enter a nickname', 'error');
        return;
    }
    
    socket.emit('joinGame', { nickname });
    localStorage.setItem('tutorialShown', 'true');
    document.getElementById('tutorialOverlay').classList.add('hidden');
}

let selectedDirection = null;

function selectDirection(direction) {
    selectedDirection = direction;
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    const bidInputSection = document.getElementById('bidInputSection');
    
    if (upButton) upButton.disabled = true;
    if (downButton) downButton.disabled = true;
    
    if (direction === 'up') {
        if (upButton) upButton.classList.add('selected');
        if (downButton) downButton.classList.remove('selected');
    } else {
        if (downButton) downButton.classList.add('selected');
        if (upButton) upButton.classList.remove('selected');
    }
    
    if (bidInputSection) {
        bidInputSection.classList.remove('hidden');
    }
}

function startRound() {
    if (!gameState) {
        showNotification('Game state not available', 'error');
        return;
    }
    
    const roundPhase = gameState.roundPhase || 'waiting';
    
    // Allow startRound in waiting, bidding, or actions phase
    // Server will handle the logic based on the phase
    if (roundPhase !== 'waiting' && roundPhase !== 'bidding' && roundPhase !== 'actions') {
        showNotification('Cannot start round at this time', 'error');
        return;
    }
    
    // If in waiting phase, start the bidding phase
    if (roundPhase === 'waiting') {
        socket.emit('startRound');
        showNotification('Round started! Submit your bid and action.');
    } 
    // If in bidding or actions phase, confirm and start the round processing
    else if (roundPhase === 'bidding' || roundPhase === 'actions') {
        // Check if bid is submitted
        if (!gameState.playerBid) {
            showNotification('Please submit a bid first', 'error');
            return;
        }
        
        socket.emit('startRound');
        showNotification('Confirming round...');
    }
}

function submitBid() {
    const bidInput = document.getElementById('bidInput');
    if (!bidInput || !currentUser || !selectedDirection) {
        showNotification('Please select a direction and enter a bid', 'error');
        return;
    }
    
    // Check if bid already submitted for this round
    if (gameState.playerBid) {
        showNotification('Bid already submitted for this round', 'error');
        return;
    }
    
    if (gameState.roundPhase !== 'bidding' && gameState.roundPhase !== 'waiting') {
        showNotification('Cannot submit bid at this time', 'error');
        return;
    }
    
    const bid = parseInt(bidInput.value);
    if (!bid || bid < 1 || bid > currentUser.credits) {
        showNotification('Invalid bid amount', 'error');
        return;
    }
    
    // Check bid limit
    const maxBidReached = gameState.maxBidReached || 0;
    let bidLimit = 5;
    if (maxBidReached >= 5) bidLimit = 10;
    if (maxBidReached >= 10) bidLimit = 15;
    if (maxBidReached >= 15) bidLimit = 20;
    if (maxBidReached >= 20) bidLimit = 25;
    if (maxBidReached >= 25) bidLimit = 30;
    if (maxBidReached >= 30) bidLimit = 35;
    if (maxBidReached >= 35) bidLimit = 40;
    if (maxBidReached >= 40) bidLimit = 45;
    if (maxBidReached >= 45) bidLimit = 50;
    
    if (bid > bidLimit) {
        showNotification(`Bid limit is $${bidLimit}. Reach higher bid to unlock more.`, 'error');
        return;
    }
    
    const bidData = {
        bid: bid,
        floor: currentUser.floor,
        direction: selectedDirection
    };
    
    socket.emit('submitBid', bidData);
    selectedBid = bidData;
    
    // Reset UI
    selectedDirection = null;
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    if (upButton) {
        upButton.disabled = false;
        upButton.classList.remove('selected');
    }
    if (downButton) {
        downButton.disabled = false;
        downButton.classList.remove('selected');
    }
    document.getElementById('bidInputSection').classList.add('hidden');
    
    showNotification(`Bid of $${bid} submitted!`);
}

function submitAction(actionType) {
    if (!currentUser) return;
    
    // Check if action already submitted for this round
    if (gameState.playerAction !== null && gameState.playerAction !== undefined) {
        showNotification('Action already submitted for this round', 'error');
        return;
    }
    
    if (gameState.roundPhase !== 'actions' && gameState.roundPhase !== 'waiting' && gameState.roundPhase !== 'bidding') {
        showNotification('Cannot submit action at this time', 'error');
        return;
    }
    
    const action = ALL_ACTIONS.find(a => a.id === actionType);
    if (!action) {
        showNotification('Invalid action', 'error');
        return;
    }
    
    if (currentUser.credits < action.cost) {
        showNotification('Insufficient credits!', 'error');
        return;
    }
    
    // Update local gameState immediately for better UX
    gameState.playerAction = actionType;
    selectedAction = actionType;
    
    socket.emit('submitAction', { actionType });
    showNotification(`Action ${action.name} submitted!`);
    
    // Update UI immediately
    updateUI();
}

function useAction(actionType) {
    submitAction(actionType);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateUI() {
    if (!gameState || !currentUser) return;
    
    // Update round info
    document.getElementById('currentRound').textContent = gameState.currentRound;
    const roundPhase = gameState.roundPhase || 'waiting';
    document.getElementById('roundPhase').textContent = roundPhase.toUpperCase();
    
    // Update round status
    const bidStatus = gameState.playerBid ? `$${gameState.playerBid.bid}` : 'Not submitted';
    let actionStatus = 'Not submitted';
    if (gameState.playerAction !== null && gameState.playerAction !== undefined) {
        actionStatus = getActionDisplayName(gameState.playerAction);
    } else if (gameState.playerAction === null) {
        actionStatus = 'Skipped';
    }
    const bidStatusEl = document.getElementById('bidStatus');
    const actionStatusEl = document.getElementById('actionStatus');
    if (bidStatusEl) bidStatusEl.textContent = bidStatus;
    if (actionStatusEl) actionStatusEl.textContent = actionStatus;
    
    // Update start round button
    const startRoundButton = document.getElementById('startRoundButton');
    if (startRoundButton) {
        const isBidSubmitted = !!gameState.playerBid;
        const isActionSubmitted = gameState.playerAction !== null && gameState.playerAction !== undefined;
        
        if (roundPhase === 'waiting') {
            // Waiting for round to start - can start bidding
            startRoundButton.disabled = false;
            startRoundButton.textContent = 'START ROUND';
        } else if (roundPhase === 'processing') {
            // Round is processing
            startRoundButton.disabled = true;
            startRoundButton.textContent = 'PROCESSING...';
        } else if (roundPhase === 'bidding' || roundPhase === 'actions') {
            // In bidding or actions phase - enable if bid is submitted
            if (isBidSubmitted) {
                startRoundButton.disabled = false;
                // Show action status in button text
                if (isActionSubmitted || gameState.playerAction === null) {
                    startRoundButton.textContent = 'CONFIRM & START';
                } else {
                    startRoundButton.textContent = 'START (SKIP ACTION)';
                }
            } else {
                startRoundButton.disabled = true;
                startRoundButton.textContent = 'SUBMIT BID FIRST';
            }
        } else {
            startRoundButton.disabled = true;
            startRoundButton.textContent = 'ROUND IN PROGRESS';
        }
    }
    
    // Update user info
    document.getElementById('userCredits').textContent = `$${currentUser.credits}`;
    document.getElementById('userFloor').textContent = currentUser.floor;
    
    // Update bid input max
    const bidInput = document.getElementById('bidInput');
    if (bidInput) {
        bidInput.max = currentUser.credits;
    }
    
    // Enable/disable direction buttons based on current floor and round phase
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    const isBidSubmitted = !!gameState.playerBid;
    const canBid = (roundPhase === 'bidding' || roundPhase === 'waiting') && !isBidSubmitted && !roundProcessing;
    
    if (upButton && downButton) {
        upButton.disabled = currentUser.floor >= 5 || !canBid;
        downButton.disabled = currentUser.floor <= 1 || !canBid;
    }
    
    // Disable bid input section if bid already submitted or round processing
    const bidInputSection = document.getElementById('bidInputSection');
    const bidPanel = document.getElementById('bidPanel');
    if (bidPanel) {
        if (isBidSubmitted || roundProcessing) {
            bidPanel.style.opacity = '0.6';
            bidPanel.style.pointerEvents = 'none';
        } else if (canBid) {
            bidPanel.style.opacity = '1';
            bidPanel.style.pointerEvents = 'auto';
        }
    }
    
    // Update actions panel
    updateActionsPanel();
    
    // Update players list
    updatePlayersList();
    
    // Update announcements
    updateAnnouncements();
    
    // Update building visualization
    updateBuilding();
}

function getActionDisplayName(actionType) {
    const action = ALL_ACTIONS.find(a => a.id === actionType);
    return action ? action.name : actionType;
}

function updateActionsPanel() {
    if (!gameState || !currentUser) return;
    
    const actionsContainer = document.getElementById('actionsContainer');
    if (!actionsContainer) return;
    
    actionsContainer.innerHTML = '';
    
    const roundPhase = gameState.roundPhase || 'waiting';
    // Can submit action during actions phase, waiting phase (before round starts), or bidding phase (can submit anytime before processing)
    const canSubmitAction = roundPhase === 'actions' || roundPhase === 'waiting' || roundPhase === 'bidding';
    const isActionSubmitted = gameState.playerAction !== null && gameState.playerAction !== undefined;
    const isBidSubmitted = !!gameState.playerBid;
    
    // If both submitted, disable all buttons (but player can still click CONFIRM & START)
    const roundProcessing = roundPhase === 'processing';
    
    ALL_ACTIONS.forEach(action => {
        const button = document.createElement('button');
        button.className = 'action-button';
        button.id = `action-${action.id}`;
        button.innerHTML = `
            <div class="action-name">${action.name}</div>
            <div class="action-cost">COST: $${action.cost}</div>
            <div class="action-effect">${action.effect}</div>
        `;
        
        const canAfford = currentUser.credits >= action.cost;
        // Disable if: round is processing, can't submit action, can't afford, or already submitted
        const isDisabled = roundProcessing || !canSubmitAction || !canAfford || isActionSubmitted;
        button.disabled = isDisabled;
        
        // Show submitted state
        if (isActionSubmitted && gameState.playerAction === action.id) {
            button.style.opacity = '0.7';
            button.style.background = 'linear-gradient(135deg, #4ade80 0%, #3ac968 100%)';
            button.innerHTML += '<div style="color: #fff; font-size: 0.5em; margin-top: 5px; font-weight: bold;">✓ SUBMITTED</div>';
        }
        
        // Show if round is processing
        if (roundProcessing) {
            button.innerHTML += '<div style="color: #9ca3af; font-size: 0.5em; margin-top: 5px;">Processing round...</div>';
        }
        
        button.addEventListener('click', () => useAction(action.id));
        actionsContainer.appendChild(button);
    });
    
    // Show/hide skip action button (optional - can skip action before confirming)
    const skipActionButton = document.getElementById('skipActionButton');
    if (skipActionButton) {
        // Show skip button if bid is submitted but action is not, and round is in actions or bidding phase
        // This allows player to explicitly skip action before clicking "CONFIRM & START"
        if (isBidSubmitted && !isActionSubmitted && (roundPhase === 'actions' || roundPhase === 'bidding')) {
            skipActionButton.classList.remove('hidden');
        } else {
            skipActionButton.classList.add('hidden');
        }
    }
    
    // Show instruction
    if (!isActionSubmitted && canSubmitAction && !roundProcessing) {
        const instruction = document.createElement('p');
        instruction.style.fontSize = '0.6em';
        instruction.style.color = '#ffd93d';
        instruction.style.marginTop = '10px';
        instruction.textContent = 'Select one action per round';
        actionsContainer.appendChild(instruction);
    }
}

function updatePlayersList() {
    const playersList = document.getElementById('playersList');
    if (!playersList) return;
    
    playersList.innerHTML = '';
    
    if (gameState) {
        if (gameState.player) {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item player';
            const inElevator = gameState.player.inElevator ? ' (IN ELEVATOR)' : '';
            playerItem.innerHTML = `
                <span>${gameState.player.nickname} (YOU)${inElevator}</span>
                <span>$${gameState.player.credits}</span>
            `;
            playersList.appendChild(playerItem);
        }
        
        if (gameState.bot) {
            const botItem = document.createElement('div');
            botItem.className = 'player-item';
            const inElevator = gameState.bot.inElevator ? ' (IN ELEVATOR)' : '';
            botItem.innerHTML = `
                <span>${gameState.bot.nickname}${inElevator}</span>
                <span>$${gameState.bot.credits}</span>
            `;
            playersList.appendChild(botItem);
        }
    }
}

function updateAnnouncements() {
    const announcementsList = document.getElementById('announcementsList');
    if (!announcementsList) return;
    
    announcementsList.innerHTML = '';
    
    if (gameState && gameState.announcements && gameState.announcements.length > 0) {
        gameState.announcements.forEach(announcement => {
            const item = document.createElement('div');
            item.className = 'announcement-item';
            const timeAgo = Math.floor((Date.now() - announcement.time) / 1000);
            const timeText = timeAgo < 3 ? 'Just now' : `${timeAgo}s ago`;
            item.innerHTML = `
                <div class="announcement-main"><span class="announcement-bot">${announcement.bot}</span></div>
                <div class="announcement-action">${announcement.action}</div>
                <div class="announcement-time">${timeText}</div>
            `;
            announcementsList.appendChild(item);
        });
    } else {
        const item = document.createElement('div');
        item.className = 'announcement-item';
        item.textContent = 'Waiting for activity...';
        announcementsList.appendChild(item);
    }
}

function updateBuilding() {
    const building = document.getElementById('building');
    if (!building) return;
    
    building.innerHTML = '';
    
    if (!gameState || !gameState.elevators) return;
    
    // Create floors from top to bottom (5 to 1)
    for (let floorNum = floors; floorNum >= 1; floorNum--) {
        const floor = document.createElement('div');
        floor.className = 'floor';
        floor.id = `floor-${floorNum}`;
        
        const floorContent = document.createElement('div');
        floorContent.className = 'floor-content';
        
        const floorNumber = document.createElement('div');
        floorNumber.className = 'floor-number';
        floorNumber.textContent = `F${floorNum}`;
        floorContent.appendChild(floorNumber);
        
        // Add characters on this floor
        const floorCharacters = document.createElement('div');
        floorCharacters.className = 'floor-characters';
        
        // Add player if on this floor
        if (gameState.player && gameState.player.floor === floorNum && !gameState.player.inElevator) {
            const playerChar = document.createElement('div');
            playerChar.className = 'floor-character player-character';
            playerChar.innerHTML = `
                <div class="character-sprite pixel-character player-sprite"></div>
                <div class="character-name">${gameState.player.nickname}</div>
            `;
            floorCharacters.appendChild(playerChar);
        }
        
        // Add bot if on this floor
        if (gameState.bot && gameState.bot.floor === floorNum && !gameState.bot.inElevator) {
            const botChar = document.createElement('div');
            botChar.className = 'floor-character bot-character';
            botChar.innerHTML = `
                <div class="character-sprite pixel-character bot-sprite-1"></div>
                <div class="character-name">${gameState.bot.nickname}</div>
            `;
            floorCharacters.appendChild(botChar);
        }
        
        floorContent.appendChild(floorCharacters);
        
        const elevatorShaft = document.createElement('div');
        elevatorShaft.className = 'elevator-shaft';
        elevatorShaft.id = `shaft-${floorNum}`;
        
        // Create elevator for this floor
        gameState.elevators.forEach((elevator) => {
            if (elevator.currentFloor === floorNum) {
                const elevatorDiv = document.createElement('div');
                elevatorDiv.className = 'elevator';
                elevatorDiv.id = `elevator-${elevator.id}-floor-${floorNum}`;
                
                let stateClass = 'idle';
                if (elevator.state === 'moving') stateClass = 'moving';
                if (elevator.locked) stateClass = 'locked';
                
                elevatorDiv.classList.add(stateClass);
                
                const doors = document.createElement('div');
                doors.className = 'elevator-doors';
                doors.innerHTML = `
                    <div class="elevator-door left"></div>
                    <div class="elevator-door right"></div>
                `;
                elevatorDiv.appendChild(doors);
                
                const infoDiv = document.createElement('div');
                infoDiv.className = 'elevator-info';
                
                if (elevator.currentBid) {
                    const userId = elevator.currentBid.userId;
                    const isPlayer = userId !== 'bot_0' && gameState.player && userId === gameState.player.id;
                    const user = isPlayer ? gameState.player : gameState.bot;
                    const bidderName = user ? user.nickname : 'Unknown';
                    
                    infoDiv.innerHTML = `
                        <div style="font-weight: bold; color: #ff6b6b; margin-bottom: 3px;">${bidderName}</div>
                        <div style="color: #4ade80;">Bid: $${elevator.currentBid.bid}</div>
                        <div style="color: #4ecdc4; font-size: 0.9em;">→ Floor ${elevator.currentBid.destination}</div>
                    `;
                    
                    if (user && user.inElevator && user.elevatorId === elevator.id) {
                        const character = document.createElement('div');
                        character.className = 'character';
                        character.style.position = 'absolute';
                        character.style.top = '50%';
                        character.style.left = '50%';
                        character.style.transform = 'translate(-50%, -50%)';
                        character.style.zIndex = '12';
                        character.innerHTML = `<div class="character-sprite pixel-character ${isPlayer ? 'player-sprite' : 'bot-sprite-1'}"></div>`;
                        elevatorDiv.appendChild(character);
                        
                        elevatorDiv.classList.add('doors-open');
                        setTimeout(() => {
                            elevatorDiv.classList.remove('doors-open');
                            elevatorDiv.classList.add('doors-closing');
                        }, 4000);
                    }
                } else {
                    infoDiv.innerHTML = `
                        <div style="color: #9ca3af; font-size: 0.9em;">IDLE</div>
                        <div style="color: #9ca3af; font-size: 0.8em;">Waiting for bid</div>
                    `;
                }
                elevatorShaft.appendChild(infoDiv);
                
                elevatorDiv.innerHTML += `<div class="elevator-label">E${elevator.id}</div>`;
                elevatorShaft.appendChild(elevatorDiv);
            }
        });
        
        floorContent.appendChild(elevatorShaft);
        floor.appendChild(floorContent);
        building.appendChild(floor);
    }
}

// Socket event handlers
socket.on('joined', (data) => {
    currentUser = {
        id: data.userId,
        credits: data.credits,
        floor: data.floor,
        inElevator: data.gameState?.player?.inElevator || false,
        elevatorId: data.gameState?.player?.elevatorId || null
    };
    gameState = data.gameState;
    
    const joinScreen = document.getElementById('joinScreen');
    const gameScreen = document.getElementById('gameScreen');
    
    if (joinScreen) {
        joinScreen.classList.add('hidden');
        joinScreen.style.display = 'none';
    }
    
    if (gameScreen) {
        gameScreen.classList.remove('hidden');
        gameScreen.style.display = 'block';
    }
    
    document.getElementById('userNickname').textContent = 
        document.getElementById('nicknameInput').value;
    
    updateUI();
});

socket.on('gameState', (state) => {
    gameState = state;
    
    if (currentUser && state.player) {
        currentUser.credits = state.player.credits;
        currentUser.floor = state.player.floor;
        currentUser.inElevator = state.player.inElevator;
        currentUser.elevatorId = state.player.elevatorId;
    }
    
    updateUI();
});

socket.on('bidSubmitted', (data) => {
    showNotification(`Bid of $${data.bid} submitted!`);
    updateUI();
});

socket.on('actionSubmitted', (data) => {
    // Update gameState with the action that was submitted
    if (data.gameState) {
        gameState = data.gameState;
        // Update currentUser if player data exists
        if (currentUser && gameState.player) {
            currentUser.credits = gameState.player.credits;
            currentUser.floor = gameState.player.floor;
            currentUser.inElevator = gameState.player.inElevator;
            currentUser.elevatorId = gameState.player.elevatorId;
        }
    } else {
        // Fallback: update local gameState if server didn't send full state
        if (data.actionType !== null && data.actionType !== undefined) {
            gameState.playerAction = data.actionType;
        } else {
            gameState.playerAction = null;
        }
    }
    
    if (data.actionType !== null && data.actionType !== undefined) {
        showNotification(`Action ${getActionDisplayName(data.actionType)} submitted!`);
    } else {
        showNotification('Action skipped!');
    }
    updateUI();
});

socket.on('roundStart', (data) => {
    // Update gameState with the new round information
    if (data.gameState) {
        gameState = data.gameState;
        // Update currentUser if player data exists
        if (currentUser && gameState.player) {
            currentUser.credits = gameState.player.credits;
            currentUser.floor = gameState.player.floor;
            currentUser.inElevator = gameState.player.inElevator;
            currentUser.elevatorId = gameState.player.elevatorId;
        }
    }
    
    showNotification(`Round ${data.round} started! Submit your bid and action.`);
    selectedBid = null;
    selectedAction = null;
    // Reset direction selection
    selectedDirection = null;
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    if (upButton) {
        upButton.disabled = false;
        upButton.classList.remove('selected');
    }
    if (downButton) {
        downButton.disabled = false;
        downButton.classList.remove('selected');
    }
    // Reset bid input section - show it again for new round
    const bidInputSection = document.getElementById('bidInputSection');
    if (bidInputSection) {
        bidInputSection.classList.add('hidden'); // Will be shown when direction is selected
    }
    // Reset bid panel to enable it
    const bidPanel = document.getElementById('bidPanel');
    if (bidPanel) {
        bidPanel.style.opacity = '1';
        bidPanel.style.pointerEvents = 'auto';
    }
    updateUI();
});

socket.on('roundProcessing', (data) => {
    showNotification(`Round ${data.round} processing...`);
    updateUI();
});

socket.on('roundAnalysis', (data) => {
    const analysis = data.analysis;
    
    // Show analysis modal/overlay
    showRoundAnalysis(analysis);
    
    // Update gameState
    if (data.gameState) {
        gameState = data.gameState;
        if (currentUser && gameState.player) {
            currentUser.credits = gameState.player.credits;
            currentUser.floor = gameState.player.floor;
            currentUser.inElevator = gameState.player.inElevator;
            currentUser.elevatorId = gameState.player.elevatorId;
        }
    }
    
    updateUI();
});

function showRoundAnalysis(analysis) {
    // Remove existing analysis overlay
    const existingOverlay = document.getElementById('analysisOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // Clear any existing timer
    if (window.analysisTimerInterval) {
        clearInterval(window.analysisTimerInterval);
    }
    if (window.analysisTimeout) {
        clearTimeout(window.analysisTimeout);
    }
    
    // Create analysis overlay
    const overlay = document.createElement('div');
    overlay.id = 'analysisOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 5px solid #ffd93d;
        padding: 30px;
        z-index: 10000;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 0 30px rgba(255, 217, 61, 0.5), 8px 8px 0px #000;
        font-family: 'Press Start 2P', cursive;
        animation: slideIn 0.3s ease;
    `;
    
    let bidSection = '';
    if (analysis.bidWinner === 'player') {
        bidSection = `
            <div style="background: #4ade80; color: #000; padding: 15px; margin-bottom: 15px; border: 3px solid #000;">
                <div style="font-size: 0.8em; margin-bottom: 8px;">🎯 ELEVATOR DECISION</div>
                <div style="font-size: 0.7em;">Goes to Floor ${analysis.elevatorDestination?.floor || '?'} (YOUR floor)</div>
                <div style="font-size: 0.6em; margin-top: 5px; color: #166534;">${analysis.elevatorDestination?.reason || ''}</div>
            </div>
        `;
    } else if (analysis.bidWinner === 'bot') {
        bidSection = `
            <div style="background: #ff6b6b; color: #fff; padding: 15px; margin-bottom: 15px; border: 3px solid #000;">
                <div style="font-size: 0.8em; margin-bottom: 8px;">🎯 ELEVATOR DECISION</div>
                <div style="font-size: 0.7em;">Goes to Floor ${analysis.elevatorDestination?.floor || '?'} (AI Bot's floor)</div>
                <div style="font-size: 0.6em; margin-top: 5px; color: #fef2f2;">${analysis.elevatorDestination?.reason || ''}</div>
            </div>
        `;
    } else {
        bidSection = `
            <div style="background: #6b7280; color: #fff; padding: 15px; margin-bottom: 15px; border: 3px solid #000;">
                <div style="font-size: 0.8em; margin-bottom: 8px;">🎯 ELEVATOR DECISION</div>
                <div style="font-size: 0.7em;">No valid bids this round</div>
            </div>
        `;
    }
    
    let bidsSection = '<div style="display: flex; gap: 15px; margin-bottom: 15px;">';
    
    // Player bid
    bidsSection += `
        <div style="flex: 1; background: #0f3460; padding: 12px; border: 2px solid #4ecdc4;">
            <div style="font-size: 0.6em; color: #4ecdc4; margin-bottom: 5px;">YOUR BID</div>
            <div style="font-size: 1em; color: #ffd93d;">$${analysis.playerBid?.amount || 0}</div>
        </div>
    `;
    
    // Bot bid
    bidsSection += `
        <div style="flex: 1; background: #0f3460; padding: 12px; border: 2px solid #ff6b6b;">
            <div style="font-size: 0.6em; color: #ff6b6b; margin-bottom: 5px;">AI BOT BID</div>
            <div style="font-size: 1em; color: #ffd93d;">$${analysis.botBid?.amount || 0}</div>
        </div>
    `;
    bidsSection += '</div>';
    
    let actionsSection = '';
    if (analysis.playerAction || analysis.botAction) {
        actionsSection = '<div style="margin-bottom: 15px;">';
        actionsSection += '<div style="font-size: 0.7em; color: #ffd93d; margin-bottom: 10px;">⚡ ACTIONS</div>';
        
        if (analysis.playerAction) {
            actionsSection += `
                <div style="background: #0f3460; padding: 10px; border-left: 4px solid #4ecdc4; margin-bottom: 8px;">
                    <span style="font-size: 0.6em; color: #4ecdc4;">YOU:</span>
                    <span style="font-size: 0.6em; color: #fff;"> ${analysis.playerAction.name} ($${analysis.playerAction.cost})</span>
                </div>
            `;
        }
        
        if (analysis.botAction) {
            actionsSection += `
                <div style="background: #0f3460; padding: 10px; border-left: 4px solid #ff6b6b; margin-bottom: 8px;">
                    <span style="font-size: 0.6em; color: #ff6b6b;">AI BOT:</span>
                    <span style="font-size: 0.6em; color: #fff;"> ${analysis.botAction.name} ($${analysis.botAction.cost})</span>
                </div>
            `;
        }
        
        actionsSection += '</div>';
    }
    
    overlay.innerHTML = `
        <h3 style="color: #ffd93d; font-size: 1em; margin-bottom: 20px; text-align: center;">📊 ROUND ANALYSIS</h3>
        ${bidsSection}
        ${bidSection}
        ${actionsSection}
        <div style="text-align: center; margin-top: 20px;">
            <div style="font-size: 0.6em; color: #9ca3af; margin-bottom: 10px;">
                ⏱️ Time remaining: <span id="analysisTimer" style="color: #ffd93d;">1:30</span>
            </div>
            <div style="width: 100%; height: 6px; background: #0f3460; border-radius: 3px; margin-bottom: 15px;">
                <div id="analysisProgressBar" style="width: 100%; height: 100%; background: #4ecdc4; border-radius: 3px; transition: width 1s linear;"></div>
            </div>
            <button id="closeAnalysisBtn" style="
                padding: 15px 30px;
                background: #4ecdc4;
                color: #000;
                border: 4px solid #000;
                cursor: pointer;
                font-family: 'Press Start 2P', cursive;
                font-size: 0.8em;
                box-shadow: 4px 4px 0px #000;
                transition: all 0.1s;
            ">CONTINUE ▶</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close button handler
    const closeBtn = document.getElementById('closeAnalysisBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeRoundAnalysis);
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.transform = 'translate(2px, 2px)';
            closeBtn.style.boxShadow = '2px 2px 0px #000';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.transform = 'translate(0, 0)';
            closeBtn.style.boxShadow = '4px 4px 0px #000';
        });
    }
    
    // Timer: 90 seconds (1 min 30 sec)
    const maxTime = 90;
    let remainingTime = maxTime;
    
    // Update timer every second
    window.analysisTimerInterval = setInterval(() => {
        remainingTime--;
        
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        const timerDisplay = document.getElementById('analysisTimer');
        const progressBar = document.getElementById('analysisProgressBar');
        
        if (timerDisplay) {
            timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Change color when time is running low
            if (remainingTime <= 30) {
                timerDisplay.style.color = '#ff6b6b';
            }
            if (remainingTime <= 10) {
                timerDisplay.style.animation = 'blink 0.5s infinite';
            }
        }
        
        if (progressBar) {
            const percentage = (remainingTime / maxTime) * 100;
            progressBar.style.width = `${percentage}%`;
            
            // Change color when time is running low
            if (remainingTime <= 30) {
                progressBar.style.background = '#ffd93d';
            }
            if (remainingTime <= 10) {
                progressBar.style.background = '#ff6b6b';
            }
        }
        
        if (remainingTime <= 0) {
            closeRoundAnalysis();
        }
    }, 1000);
    
    // Auto-close after 90 seconds
    window.analysisTimeout = setTimeout(() => {
        closeRoundAnalysis();
    }, maxTime * 1000);
}

function closeRoundAnalysis() {
    // Clear timers
    if (window.analysisTimerInterval) {
        clearInterval(window.analysisTimerInterval);
        window.analysisTimerInterval = null;
    }
    if (window.analysisTimeout) {
        clearTimeout(window.analysisTimeout);
        window.analysisTimeout = null;
    }
    
    // Remove overlay with animation
    const overlayToRemove = document.getElementById('analysisOverlay');
    if (overlayToRemove) {
        overlayToRemove.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => overlayToRemove.remove(), 300);
    }
    
    // Notify server that user confirmed analysis
    socket.emit('analysisConfirmed');
}

socket.on('roundEnd', (data) => {
    const roundResult = data.roundResult;
    
    // Update gameState with the new round information
    if (data.gameState) {
        gameState = data.gameState;
        // Update currentUser if player data exists
        if (currentUser && gameState.player) {
            currentUser.credits = gameState.player.credits;
            currentUser.floor = gameState.player.floor;
            currentUser.inElevator = gameState.player.inElevator;
            currentUser.elevatorId = gameState.player.elevatorId;
        }
    }
    
    let message = `Round ${roundResult.round} ended!\n`;
    message += `Player: Floor ${roundResult.playerFloor}, Bid $${roundResult.playerBid?.bid || 0}\n`;
    message += `Bot: Floor ${roundResult.botFloor}, Bid $${roundResult.botBid?.bid || 0}`;
    showNotification(`Round ${roundResult.round} ended!`);
    
    selectedBid = null;
    selectedAction = null;
    selectedDirection = null;
    
    // Reset UI for next round
    const bidInputSection = document.getElementById('bidInputSection');
    if (bidInputSection) {
        bidInputSection.classList.add('hidden');
    }
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    if (upButton) {
        upButton.disabled = false;
        upButton.classList.remove('selected');
    }
    if (downButton) {
        downButton.disabled = false;
        downButton.classList.remove('selected');
    }
    
    updateUI();
});

socket.on('gameEnd', (data) => {
    const gameScreen = document.getElementById('gameScreen');
    const collapseScreen = document.getElementById('collapseScreen');
    
    if (gameScreen) {
        gameScreen.classList.add('hidden');
        gameScreen.style.display = 'none';
    }
    
    if (collapseScreen) {
        collapseScreen.classList.remove('hidden');
        collapseScreen.style.display = 'block';
        document.getElementById('collapseReason').textContent = data.reason || '🎉 GAME END! 🎉';
        document.getElementById('finalDisruptionScore').textContent = gameState?.disruptionScore || 0;
        document.getElementById('finalInstability').textContent = `Round ${data.round || 0}`;
    }
});

socket.on('error', (data) => {
    showNotification(data.message, 'error');
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initUI);