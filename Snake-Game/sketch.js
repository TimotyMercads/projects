let snake;
let rez = 20;
let food;
let w;
let h;

let score = 0;
let highScore = Number(localStorage.getItem('neonSnakeHighScore') || 0);
let gameStarted = false;
let gameOver = false;
let controlMode = 'keyboard';

// Speed ramps up as the player eats — starts slow, gets faster each bite.
const BASE_FRAMERATE = 6;
const MAX_FRAMERATE = 18;
const FRAMERATE_STEP = 0.6;

let video;
let handpose;
let predictions = [];
let cameraEnabled = false;
let lastGesture = '';
let lastGestureTime = 0;

const $ = (id) => document.getElementById(id);

function setup() {
  const canvas = createCanvas(400, 400);
  canvas.parent('canvas-holder');
  pixelDensity(1);

  w = floor(width / rez);
  h = floor(height / rez);
  frameRate(BASE_FRAMERATE);

  snake = new Snake();
  foodLocation();
  updateHUD();

  $('startBtn').addEventListener('click', startGame);
  $('restartBtn').addEventListener('click', restartGame);
  $('keyboardBtn').addEventListener('click', () => setControlMode('keyboard'));
  $('cameraBtn').addEventListener('click', () => setControlMode('camera'));

  updateStatus('READY');
}

function draw() {
  // Everything below is drawn in "grid cell" units (1 = one cell).
  // scale(rez) blows that up to actual pixels, filling the whole
  // canvas instead of a tiny 20x20px corner of it.
  push();
  scale(rez);

  drawBoard();

  if (!gameStarted) {
    pop();
    return;
  }

  if (controlMode === 'camera') detectCameraGesture();

  // Do not move until a direction is selected.
  if (snake.xdir !== 0 || snake.ydir !== 0) {
    if (snake.eat(food)) {
      score++;
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('neonSnakeHighScore', highScore);
      }

      // Ramp the game speed up a notch each time, capped so it never
      // gets unplayable.
      const newRate = min(MAX_FRAMERATE, BASE_FRAMERATE + score * FRAMERATE_STEP);
      frameRate(newRate);

      foodLocation();
      updateHUD();
    }

    snake.update();

    if (snake.endGame()) {
      pop();
      endGame();
      return;
    }
  }

  snake.show();
  drawFood();
  pop();
}

function drawBoard() {
  background('#080e19');

  // Grid lines (strokeWeight is in cell-units too, since we're scaled)
  stroke('#141f33');
  strokeWeight(0.05);
  for (let x = 0; x <= w; x++) line(x, 0, x, h);
  for (let y = 0; y <= h; y++) line(0, y, w, y);
  noStroke();
}

function drawFood() {
  push();
  drawingContext.shadowBlur = 18;
  drawingContext.shadowColor = '#ff4d67';

  fill('#ff4d67');
  ellipse(food.x + 0.5, food.y + 0.5, 0.82, 0.82);

  // Little highlight so it doesn't read as a flat dot
  drawingContext.shadowBlur = 0;
  fill('#ffb3bf');
  ellipse(food.x + 0.36, food.y + 0.36, 0.18, 0.18);
  pop();
}

function foodLocation() {
  let valid = false;

  while (!valid) {
    food = createVector(floor(random(w)), floor(random(h)));
    valid = true;

    if (snake && snake.body) {
      for (const part of snake.body) {
        if (part.x === food.x && part.y === food.y) {
          valid = false;
          break;
        }
      }
    }
  }
}

function startGame() {
  const music = document.getElementById("bgMusic");
music.volume = 0.25;
music.play();
  score = 0;
  gameStarted = true;
  gameOver = false;
  snake.reset();
  foodLocation();
  frameRate(BASE_FRAMERATE);

  $('overlay').classList.add('hidden');
  updateStatus('PLAYING');
  updateHUD();
  loop();
}

function restartGame() {
  startGame();
}

function endGame() {
  gameStarted = false;
  gameOver = true;
  updateStatus('GAME OVER');

  $('overlayTitle').textContent = 'Game Over!';
  $('overlayText').textContent = `You scored ${score}. Your highest score is ${highScore}.`;
  $('startBtn').textContent = 'PLAY AGAIN';
  $('overlay').classList.remove('hidden');

  noLoop();
}

function updateHUD() {
  $('score').textContent = score;
  $('highScore').textContent = highScore;
  $('controlLabel').textContent = controlMode === 'keyboard' ? 'Keyboard' : 'Camera';
}

function updateStatus(text) {
  $('gameStatus').textContent = text;
}

function setControlMode(mode) {
  controlMode = mode;

  $('keyboardBtn').classList.toggle('active', mode === 'keyboard');
  $('cameraBtn').classList.toggle('active', mode === 'camera');
  $('keyboardHelp').classList.toggle('hidden', mode !== 'keyboard');
  $('cameraHelp').classList.toggle('hidden', mode !== 'camera');
  $('cameraCard').classList.toggle('hidden', mode !== 'camera');

  updateHUD();

  if (mode === 'camera') {
    startCamera();
  } else {
    stopCamera();
  }
}

function keyPressed() {
  if (key === ' ' || keyCode === ENTER) {
    if (!gameStarted) startGame();
    return false;
  }

  if (key === 'r' || key === 'R') {
    restartGame();
    return false;
  }

  if (!gameStarted || controlMode !== 'keyboard') return;

  if (keyCode === LEFT_ARROW) snake.setDir(-1, 0);
  else if (keyCode === RIGHT_ARROW) snake.setDir(1, 0);
  else if (keyCode === UP_ARROW) snake.setDir(0, -1);
  else if (keyCode === DOWN_ARROW) snake.setDir(0, 1);

  return false;
}

// ---------------- CAMERA CONTROL ----------------

function startCamera() {
  if (cameraEnabled) return;

  $('cameraStatus').textContent = 'Starting camera...';

  video = createCapture(VIDEO, () => {
    cameraEnabled = true;
    $('cameraStatus').textContent = 'Camera active • show your hand';
  });

  // Don't hard-set pixel dimensions here — that fights the responsive
  // CSS on #video-holder video and made the feed spill out of its box.
  // Let CSS own the sizing; the <video> element stays at whatever
  // native resolution the webcam gives us.
  video.parent('video-holder');
  video.show();

  // ml5 handpose detects a single hand and provides 21 landmarks.
  if (typeof ml5 === 'undefined' || !ml5.handpose) {
    $('cameraStatus').textContent = 'Hand tracking is unavailable in this browser/library.';
    return;
  }

  handpose = ml5.handpose(video, () => {
    $('cameraStatus').textContent = 'Hand tracking ready • move your hand';
  });

  handpose.on('predict', results => {
    predictions = results;
  });
}

function stopCamera() {
  predictions = [];
  lastGesture = '';

  if (video) {
    const stream = video.elt && video.elt.srcObject;
    if (stream) stream.getTracks().forEach(track => track.stop());
    video.remove();
    video = null;
  }

  cameraEnabled = false;
  $('cameraStatus').textContent = 'Camera is off';
}

function detectCameraGesture() {
  if (!predictions.length || !gameStarted) return;

  const hand = predictions[0];
  const landmarks = hand.landmarks;

  // Palm center from a few stable landmarks.
  const palm = averagePoints([
    landmarks[0],
    landmarks[5],
    landmarks[9],
    landmarks[13],
    landmarks[17]
  ]);

  // Compare index fingertip to palm to determine dominant direction.
  const tip = landmarks[8];

  // The preview video is mirrored (CSS scaleX(-1)) so it feels natural
  // to look at, like a mirror — but the raw landmark coordinates are
  // NOT mirrored. Flip dx here so "move hand right" (what the player
  // sees on screen) actually registers as "right", not "left".
  const dx = -(tip[0] - palm[0]);
  const dy = tip[1] - palm[1];

  let gesture = '';

  if (Math.abs(dx) > Math.abs(dy)) {
    gesture = dx > 35 ? 'right' : dx < -35 ? 'left' : '';
  } else {
    gesture = dy > 35 ? 'down' : dy < -35 ? 'up' : '';
  }

  if (!gesture) return;

  // Debounce gestures so one held hand doesn't change direction every frame.
  const now = millis();
  if (gesture !== lastGesture || now - lastGestureTime > 650) {
    if (gesture === 'left') snake.setDir(-1, 0);
    if (gesture === 'right') snake.setDir(1, 0);
    if (gesture === 'up') snake.setDir(0, -1);
    if (gesture === 'down') snake.setDir(0, 1);

    lastGesture = gesture;
    lastGestureTime = now;
    $('cameraStatus').textContent = `Gesture: ${gesture.toUpperCase()}`;
  }
}

function averagePoints(points) {
  let x = 0, y = 0;
  points.forEach(p => {
    x += p[0];
    y += p[1];
  });
  return [x / points.length, y / points.length];
}
