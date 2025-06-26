// Drag and touch interaction handler module
export class DragHandler {
    constructor(gameState, gameBoard) {
        this.gameState = gameState;
        this.gameBoard = gameBoard;
        this.isDragging = false;
        this.dragStartIndex = -1;
        this.dragEndIndex = -1;
        this.dragLine = null;
        
        this.setupGlobalEvents();
    }
    
    setupGlobalEvents() {
        // Global mouse events
        document.addEventListener('mousemove', (e) => {
            this.handleDragMove(e.clientX, e.clientY);
        });

        document.addEventListener('mouseup', () => {
            this.handleDragEnd();
        });

        // Global touch events
        document.addEventListener('touchmove', (e) => {
            if (this.isDragging) {
                e.preventDefault();
                const touch = e.touches[0];
                this.handleDragMove(touch.clientX, touch.clientY);
            }
        });

        document.addEventListener('touchend', () => {
            this.handleDragEnd();
        });
    }
    
    getIndexFromPosition(x, y) {
        const boardRect = this.gameBoard.getBoundingClientRect();
        const relativeX = x - boardRect.left;
        const relativeY = y - boardRect.top;
        
        const boardSize = this.gameBoard.clientWidth;
        const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap'));
        const cellSize = (boardSize - (this.gameState.gridSize + 1) * gap) / this.gameState.gridSize;
        
        const col = Math.floor((relativeX - gap) / (cellSize + gap));
        const row = Math.floor((relativeY - gap) / (cellSize + gap));
        
        if (col >= 0 && col < this.gameState.gridSize && row >= 0 && row < this.gameState.gridSize) {
            return row * this.gameState.gridSize + col;
        }
        return -1;
    }
    
    getBlockCenterPosition(index) {
        const boardRect = this.gameBoard.getBoundingClientRect();
        const boardSize = this.gameBoard.clientWidth;
        const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap'));
        const cellSize = (boardSize - (this.gameState.gridSize + 1) * gap) / this.gameState.gridSize;
        
        const row = Math.floor(index / this.gameState.gridSize);
        const col = index % this.gameState.gridSize;
        
        const centerX = boardRect.left + gap + col * (cellSize + gap) + cellSize / 2;
        const centerY = boardRect.top + gap + row * (cellSize + gap) + cellSize / 2;
        
        return { x: centerX, y: centerY };
    }
    
    createDragLine(startPos, endPos) {
        if (this.dragLine) {
            this.dragLine.remove();
        }
        
        this.dragLine = document.createElement('div');
        this.dragLine.style.position = 'fixed';
        this.dragLine.style.background = '#2ecc71';
        this.dragLine.style.height = '4px';
        this.dragLine.style.borderRadius = '2px';
        this.dragLine.style.pointerEvents = 'none';
        this.dragLine.style.zIndex = '1000';
        this.dragLine.style.transformOrigin = 'left center';
        
        const deltaX = endPos.x - startPos.x;
        const deltaY = endPos.y - startPos.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = Math.atan2(deltaY, deltaX);
        
        this.dragLine.style.width = distance + 'px';
        this.dragLine.style.left = startPos.x + 'px';
        this.dragLine.style.top = startPos.y + 'px';
        this.dragLine.style.transform = `rotate(${angle}rad)`;
        
        document.body.appendChild(this.dragLine);
    }
    
    removeDragLine() {
        if (this.dragLine) {
            this.dragLine.remove();
            this.dragLine = null;
        }
    }
    
    handleDragStart(startIndex, clientX, clientY) {
        if (this.gameState.getBlockValue(startIndex) === 0) return false;
        
        this.isDragging = true;
        this.dragStartIndex = startIndex;
        this.gameState.selectBlock(startIndex);
        
        const startPos = this.getBlockCenterPosition(startIndex);
        this.createDragLine(startPos, { x: clientX, y: clientY });
        
        return true;
    }
    
    handleDragMove(clientX, clientY) {
        if (!this.isDragging) return;
        
        const startPos = this.getBlockCenterPosition(this.dragStartIndex);
        this.createDragLine(startPos, { x: clientX, y: clientY });
        
        const currentIndex = this.getIndexFromPosition(clientX, clientY);
        if (currentIndex !== this.dragEndIndex) {
            this.dragEndIndex = currentIndex;
        }
    }
    
    handleDragEnd() {
        if (!this.isDragging) return;
        
        this.removeDragLine();
        
        let boardChanged = false;

        const isTargetingIndicator = this.dragEndIndex !== -1 && this.gameState.nextSpawnIndices.includes(this.dragEndIndex);

        if (this.dragEndIndex !== -1 && this.dragEndIndex !== this.dragStartIndex) {
             if (isTargetingIndicator && (this.gameState.currentDifficulty === 'easy' || this.gameState.currentDifficulty === 'zen')) {
                if (this.onIndicatorDrop) {
                    this.onIndicatorDrop(this.dragEndIndex);
                }
                // The drop action itself doesn't change the board (the spawn does), so boardChanged remains false.
            } else {
                boardChanged = this.processDragAction(this.dragStartIndex, this.dragEndIndex);
            }
        }
        
        this.isDragging = false;
        this.dragStartIndex = -1;
        this.dragEndIndex = -1;
        this.gameState.deselectBlock();
        
        // Trigger board re-render after drag operations
        if (this.onDragComplete) {
            this.onDragComplete(boardChanged);
        }
    }
    
    processDragAction(startIndex, endIndex) {
        const startValue = this.gameState.getBlockValue(startIndex);
        const endValue = this.gameState.getBlockValue(endIndex);
        const isNeighbor = this.gameState.areNeighbors(startIndex, endIndex);
        let boardChanged = false;

        const isTargetingIndicator = this.gameState.nextSpawnIndices.includes(endIndex);
        if (isTargetingIndicator && this.gameState.currentDifficulty !== 'easy' && this.gameState.currentDifficulty !== 'zen') {
            return false; // Disallow interaction with indicators on non-easy/zen modes.
        }
        
        if (endValue === 0) {
            // Moving to empty cell
            if (isNeighbor) {
                this.gameState.placeBlock(endIndex, startValue);
                this.gameState.removeBlock(startIndex);
                boardChanged = true;
            }
        } else {
            // Merging with another block
            const sameValue = startValue === endValue;
            const sumValue = startValue + endValue;
            
            if (isNeighbor && sameValue) {
                const mergedValue = endValue + 1;
                this.gameState.placeBlock(endIndex, mergedValue);
                this.gameState.removeBlock(startIndex);
                this.gameState.updateScore(mergedValue);
                boardChanged = true;
            } else if (isNeighbor && sumValue % 2 === 0) {
                const halfValue = sumValue / 2;
                this.gameState.placeBlock(startIndex, halfValue);
                this.gameState.placeBlock(endIndex, halfValue);
                this.gameState.updateScore(halfValue * 2);
                boardChanged = true;
            }
        }
        return boardChanged;
    }
}