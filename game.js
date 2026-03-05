const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const hudScreen = document.getElementById('hud-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('final-score');
const highScoreEl = document.getElementById('high-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let highScore = localStorage.getItem('missileHighScore') || 0;
let frames = 0;
let animationId;

// Web Audio API Context
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    
    // Resume context if suspended
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'jump') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'score') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'explosion') {
        const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 seconds
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        noise.connect(filter);
        filter.connect(gainNode);
        
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        
        noise.start();
    }
}

// Missile Object
const missile = {
    x: 150,
    y: 300,
    width: 40,
    height: 15,
    dy: 0,
    gravity: 0.25,
    jump: -5.5,
    
    draw: function() {
        if (gameState === 'GAMEOVER') return; // Don't draw if destroyed

        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Rotate missile based on velocity
        let targetRotation = this.dy * 0.1;
        targetRotation = Math.max(-0.5, Math.min(targetRotation, 0.5)); // clamp
        ctx.rotate(targetRotation);
        
        // Draw Missile Body
        ctx.fillStyle = '#e94560'; 
        ctx.beginPath();
        ctx.moveTo(0, -this.height/2);
        ctx.lineTo(this.width - 10, -this.height/2);
        ctx.lineTo(this.width, 0); // Nose cone
        ctx.lineTo(this.width - 10, this.height/2);
        ctx.lineTo(0, this.height/2);
        ctx.closePath();
        ctx.fill();
        
        // Fins
        ctx.fillStyle = '#111';
        ctx.fillRect(-5, -this.height, 10, this.height * 2);
        
        // Cockpit window
        ctx.fillStyle = '#00ffcc';
        ctx.beginPath();
        ctx.arc(this.width - 15, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    },
    
    update: function() {
        this.dy += this.gravity;
        this.y += this.dy;
        
        // Floor and ceiling collision
        if (this.y + this.height/2 >= canvas.height || this.y - this.height/2 <= 0) {
            gameOver();
        }
    },
    
    flap: function() {
        if (gameState !== 'PLAYING') return;
        this.dy = this.jump;
        playSound('jump');
        // Add particles
        for(let i=0; i<5; i++) {
            particles.push(new Particle(this.x - this.width/2, this.y, true));
        }
    }
};

// Particles System
class Particle {
    constructor(x, y, isThrust) {
        this.x = x;
        this.y = y;
        this.isThrust = isThrust;
        
        if (isThrust) {
            this.vx = (Math.random() - 1) * 3 - 2; // Move left
            this.vy = (Math.random() - 0.5) * 2;
            this.life = 1;
            this.decay = Math.random() * 0.05 + 0.02;
            this.color = '#ff9900'; // Fire color
            this.size = Math.random() * 4 + 2;
        } else {
            // Explosion
            this.vx = (Math.random() - 0.5) * 10;
            this.vy = (Math.random() - 0.5) * 10;
            this.life = 1;
            this.decay = Math.random() * 0.02 + 0.01;
            this.color = Math.random() > 0.5 ? '#e94560' : '#ff9900';
            this.size = Math.random() * 6 + 3;
        }
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        
        if (this.isThrust) {
            this.size *= 0.95;
        }
    }
    
    draw() {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1; // reset
    }
}

let particles = [];

// Obstacles
const obstacles = {
    items: [],
    width: 60,
    gap: 150,
    dx: 3, 
    
    draw: function() {
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            ctx.fillStyle = '#0f3460'; 
            ctx.strokeStyle = '#00ffcc'; 
            ctx.lineWidth = 2;
            
            // Top obstacle
            ctx.fillRect(p.x, 0, this.width, p.y);
            ctx.strokeRect(p.x, 0, this.width, p.y);
            
            // Bottom obstacle
            ctx.fillRect(p.x, p.y + this.gap, this.width, canvas.height - p.y - this.gap);
            ctx.strokeRect(p.x, p.y + this.gap, this.width, canvas.height - p.y - this.gap);
        }
    },
    
    update: function() {
        // Increase speed slightly based on score
        let currentDx = this.dx + Math.floor(score / 5) * 0.5;
        
        // Spawn obstacles
        if (frames % 100 === 0) {
             let maxYPos = canvas.height - this.gap - 50;
             let yPos = Math.max(50, Math.random() * maxYPos);
             
             this.items.push({
                 x: canvas.width,
                 y: yPos,
                 passed: false
             });
        }
        
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            p.x -= currentDx;
            
            // Collision detection
            let mLeft = missile.x - missile.width/2 + 5;
            let mRight = missile.x + missile.width/2 - 5;
            let mTop = missile.y - missile.height/2 + 2;
            let mBottom = missile.y + missile.height/2 - 2;
            
            if (mRight > p.x && mLeft < p.x + this.width) {
                 if (mTop < p.y || mBottom > p.y + this.gap) {
                     gameOver();
                 }
            }
            
            // Score handling
            if (p.x + this.width < mLeft && !p.passed) {
                score++;
                p.passed = true;
                scoreEl.innerText = score;
                playSound('score');
            }
            
            // Clean up
            if (p.x + this.width < 0) {
                this.items.shift();
                i--;
            }
        }
    },
    
    reset: function() {
        this.items = [];
    }
}

// Background starfield / speed lines
const bgLines = {
    lines: [],
    
    draw: function() {
        ctx.fillStyle = '#ffffff';
        for(let i=0; i<this.lines.length; i++) {
            let l = this.lines[i];
            ctx.globalAlpha = l.alpha;
            ctx.fillRect(l.x, l.y, l.length, 1);
        }
        ctx.globalAlpha = 1;
    },
    
    update: function() {
        if(Math.random() < 0.3) {
            this.lines.push({
                x: canvas.width,
                y: Math.random() * canvas.height,
                length: Math.random() * 30 + 10,
                speed: Math.random() * 5 + 2,
                alpha: Math.random() * 0.5 + 0.1
            });
        }
        
        for(let i=0; i<this.lines.length; i++) {
            let l = this.lines[i];
            let currentDx = (obstacles.dx + Math.floor(score / 5) * 0.5) * 0.5;
            l.x -= l.speed + currentDx;
            
            if(l.x + l.length < 0) {
                this.lines.splice(i, 1);
                i--;
            }
        }
    }
}

function draw() {
    ctx.fillStyle = '#0f3460'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    bgLines.draw();
    obstacles.draw();
    missile.draw();
    
    for(let i=0; i<particles.length; i++) {
        particles[i].draw();
    }
}

function update() {
    if (gameState === 'PLAYING') {
        bgLines.update();
        missile.update();
        obstacles.update();
        
        // Thrust trail
        if (frames % 3 === 0) {
            particles.push(new Particle(missile.x - missile.width/2, missile.y, true));
        }
    } else if (gameState === 'START') {
         bgLines.update();
         missile.y = 300 + Math.sin(frames * 0.05) * 10; // hovering effect
    }
    
    for(let i=0; i<particles.length; i++) {
        particles[i].update();
        if(particles[i].life <= 0) {
            particles.splice(i, 1);
            i--;
        }
    }
}

function loop() {
    update();
    draw();
    frames++;
    requestAnimationFrame(loop);
}

function setGameOverUI() {
    hudScreen.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    finalScoreEl.innerText = score;
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('missileHighScore', highScore);
    }
    highScoreEl.innerText = highScore;
}

function gameOver() {
    if (gameState === 'GAMEOVER') return;
    gameState = 'GAMEOVER';
    playSound('explosion');
    
    for(let i=0; i<40; i++) {
        particles.push(new Particle(missile.x, missile.y, false));
    }
    
    setTimeout(setGameOverUI, 1000); 
}

function resetGame() {
    missile.y = 300;
    missile.dy = 0;
    obstacles.reset();
    particles = [];
    score = 0;
    scoreEl.innerText = score;
    frames = 0;
}

function startGame() {
    initAudio();
    resetGame();
    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hudScreen.classList.remove('hidden');
    missile.flap();
}

function handleInput(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    
    if (gameState === 'START') {
        startGame();
    } else if (gameState === 'PLAYING') {
        missile.flap();
    } else if (gameState === 'GAMEOVER' && !gameOverScreen.classList.contains('hidden')) {
        startGame();
    }
}

window.addEventListener('keydown', handleInput);
window.addEventListener('mousedown', handleInput);

startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startGame();
});

restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startGame();
});

// Init
loop();
