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
    { id: 'goldenSummon', name: '👑 Golden Summon', cost: 3, effect: 'Summon elevator to your floor' },
    { id: 'bribeAI', name: '💰 Bribe the AI', cost: 2, effect: 'Increase bid priority' },
    { id: 'capitalistBlitz', name: '⚡ Capitalist Blitz', cost: 3, effect: 'All actions 50% off for 60s' },
    { id: 'emergencyCall', name: '🚨 Emergency Call', cost: 2, effect: 'Force nearest elevator to your floor' },
    { id: 'priorityBoost', name: '🚀 Priority Boost', cost: 1, effect: 'Double your bid effectiveness' },
    { id: 'forceCloseDoor', name: '🚪 Force Close Door', cost: 1, effect: 'Cancel all other bids' },
    { id: 'royalAscent', name: '⭐ Royal Ascent', cost: 2, effect: 'Non-stop express ride' },
    { id: 'floor1Priority', name: '🎯 Floor 1 Priority', cost: 2, effect: 'Guaranteed stop at Floor 1' },
    { id: 'skipFloors', name: '⚡ Skip Floors', cost: 3, effect: 'Skip all floors, go directly to Floor 1' },
    { id: 'disableAction', name: '🚫 Disable Action', cost: 2, effect: 'Disable target player actions for 6s' }
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
    if (!gameState || gameState.roundPhase !== 'waiting') {
        showNotification('Cannot start round at this time', 'error');
        return;
    }
    
    socket.emit('startRound');
    showNotification('Round started! Submit your bid and action.');
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
    if (gameState.playerAction) {
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
    
    socket.emit('submitAction', { actionType });
    selectedAction = actionType;
    showNotification(`Action ${action.name} submitted!`);
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
    const actionStatus = gameState.playerAction ? getActionDisplayName(gameState.playerAction) : 'Not submitted';
    const bidStatusEl = document.getElementById('bidStatus');
    const actionStatusEl = document.getElementById('actionStatus');
    if (bidStatusEl) bidStatusEl.textContent = bidStatus;
    if (actionStatusEl) actionStatusEl.textContent = actionStatus;
    
    // Update start round button
    const startRoundButton = document.getElementById('startRoundButton');
    if (startRoundButton) {
        startRoundButton.disabled = roundPhase !== 'waiting';
        if (roundPhase === 'waiting') {
            startRoundButton.textContent = 'START ROUND';
        } else if (roundPhase === 'processing') {
            startRoundButton.textContent = 'PROCESSING...';
        } else {
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
    const isActionSubmitted = !!gameState.playerAction;
    const isBidSubmitted = !!gameState.playerBid;
    
    // If both submitted, disable all buttons
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
    
    // Show/hide skip action button
    const skipActionButton = document.getElementById('skipActionButton');
    if (skipActionButton) {
        // Show skip button if bid is submitted but action is not, and round is in actions phase
        if (isBidSubmitted && !isActionSubmitted && roundPhase === 'actions') {
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
    showNotification(`Action ${getActionDisplayName(data.actionType)} submitted!`);
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
    const bidInputSection = document.getElementById('bidInputSection');
    if (bidInputSection) {
        bidInputSection.classList.add('hidden');
    }
    updateUI();
});

socket.on('roundProcessing', (data) => {
    showNotification(`Round ${data.round} processing...`);
    updateUI();
});

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