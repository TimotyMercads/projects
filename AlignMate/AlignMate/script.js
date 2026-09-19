// ============================================================
// STUDYGUARD AI
// MoveNet Posture Monitoring System
// ============================================================


// ================================
// DOM ELEMENTS
// ================================

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");

const loadingMessage = document.getElementById("loadingMessage");
const startMessage = document.getElementById("startMessage");

const modelStatus = document.getElementById("modelStatus");
const statusDot = document.getElementById("statusDot");

const postureStatus = document.getElementById("postureStatus");
const postureEmoji = document.getElementById("postureEmoji");
const postureDescription = document.getElementById("postureDescription");

const scoreValue = document.getElementById("scoreValue");
const scoreProgress = document.getElementById("scoreProgress");

const recommendation = document.getElementById("recommendation");

const personDetected = document.getElementById("personDetected");
const confidence = document.getElementById("confidence");

const timerDisplay = document.getElementById("timer");


// ================================
// GLOBAL VARIABLES
// ================================

let detector = null;
let stream = null;

let isRunning = false;

let animationId = null;

let timerSeconds = 0;
let timerInterval = null;


// ================================
// INITIALIZE MODEL
// ================================

async function loadModel() {

    try {

        modelStatus.textContent = "Loading MoveNet...";

        statusDot.style.background = "#f59e0b";

        console.log("Loading MoveNet model...");

        // Make sure TensorFlow.js is ready
        await tf.ready();

        console.log("TensorFlow.js is ready.");

        // Create MoveNet detector
        detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
            }
        );

        console.log("MoveNet loaded successfully.");

        modelStatus.textContent = "MoveNet Ready";

        statusDot.style.background = "#16a34a";

        loadingMessage.classList.add("hidden");

        startMessage.classList.remove("hidden");

        startButton.disabled = false;

    } catch (error) {

        console.error("Error loading MoveNet:", error);

        modelStatus.textContent = "Model failed to load";

        statusDot.style.background = "#dc2626";

        loadingMessage.innerHTML = `
            <p>❌ Failed to load AI model.</p>
            <small>Check your internet connection and refresh.</small>
        `;

    }

}


// ================================
// START CAMERA
// ================================

async function startCamera() {

    try {

        if (!detector) {

            alert("Please wait for MoveNet to finish loading.");

            return;

        }

        console.log("Starting camera...");

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            },
            audio: false
        });

        video.srcObject = stream;

        await video.play();

        // Set canvas dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        console.log(
            "Camera resolution:",
            video.videoWidth,
            "x",
            video.videoHeight
        );

        isRunning = true;

        startButton.disabled = true;

        stopButton.disabled = false;

        startMessage.classList.add("hidden");

        modelStatus.textContent = "Monitoring";

        statusDot.style.background = "#16a34a";

        // Start timer
        startTimer();

        // Start pose detection
        detectPose();

    } catch (error) {

        console.error("Camera error:", error);

        if (error.name === "NotAllowedError") {

            alert(
                "Camera permission was denied. " +
                "Please allow camera access in your browser."
            );

        } else if (error.name === "NotFoundError") {

            alert(
                "No camera was found on this device."
            );

        } else {

            alert(
                "Unable to start the camera. " +
                "Please make sure your browser supports webcam access."
            );

        }

    }

}


// ================================
// STOP CAMERA
// ================================

function stopCamera() {

    console.log("Stopping camera...");

    isRunning = false;

    // Stop animation
    if (animationId) {

        cancelAnimationFrame(animationId);

        animationId = null;

    }

    // Stop camera tracks
    if (stream) {

        stream.getTracks().forEach(track => {
            track.stop();
        });

        stream = null;

    }

    video.srcObject = null;

    // Clear canvas
    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    startButton.disabled = false;

    stopButton.disabled = true;

    modelStatus.textContent = "MoveNet Ready";

    statusDot.style.background = "#16a34a";

    // Stop timer
    stopTimer();

    // Reset display
    postureStatus.textContent = "Waiting";

    postureStatus.className = "posture-status neutral";

    postureEmoji.textContent = "⏳";

    postureDescription.textContent =
        "Start the camera to begin posture analysis.";

    scoreValue.textContent = "--";

    scoreProgress.style.width = "0%";

    recommendation.textContent =
        "Your recommendation will appear here once the AI detects your posture.";

    personDetected.textContent = "No";

    confidence.textContent = "--";

    startMessage.classList.remove("hidden");

}


// ================================
// POSE DETECTION LOOP
// ================================

async function detectPose() {

    if (!isRunning) {
        return;
    }

    try {

        // Detect poses
        const poses = await detector.estimatePoses(video, {
            flipHorizontal: false
        });

        // Clear previous skeleton
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        if (poses.length > 0) {

            const pose = poses[0];

            processPose(pose);

            drawPose(pose);

        } else {

            handleNoPerson();

        }

    } catch (error) {

        console.error(
            "Pose detection error:",
            error
        );

    }

    // Continue loop
    animationId = requestAnimationFrame(detectPose);

}


// ================================
// PROCESS DETECTED POSE
// ================================

function processPose(pose) {

    const keypoints = pose.keypoints;

    // Minimum confidence required
    const visiblePoints = keypoints.filter(
        point => point.score >= 0.3
    );

    if (visiblePoints.length < 5) {

        handleNoPerson();

        return;

    }

    // Person detected
    personDetected.textContent = "Yes";

    // Calculate average confidence
    const averageConfidence =
        visiblePoints.reduce(
            (sum, point) => sum + point.score,
            0
        ) / visiblePoints.length;

    confidence.textContent =
        Math.round(averageConfidence * 100) + "%";


    // Get important body points
    const nose = getKeypoint(keypoints, "nose");

    const leftShoulder =
        getKeypoint(
            keypoints,
            "left_shoulder"
        );

    const rightShoulder =
        getKeypoint(
            keypoints,
            "right_shoulder"
        );

    const leftHip =
        getKeypoint(
            keypoints,
            "left_hip"
        );

    const rightHip =
        getKeypoint(
            keypoints,
            "right_hip"
        );


    // Check if necessary points are available
    if (
        !nose ||
        !leftShoulder ||
        !rightShoulder
    ) {

        showInsufficientData();

        return;

    }


    // Calculate posture
    const result = calculatePosture(
        nose,
        leftShoulder,
        rightShoulder,
        leftHip,
        rightHip
    );


    updatePostureUI(result);

}


// ================================
// GET KEYPOINT
// ================================

function getKeypoint(keypoints, name) {

    const point = keypoints.find(
        keypoint => keypoint.name === name
    );

    if (!point) {
        return null;
    }

    if (point.score < 0.3) {
        return null;
    }

    return point;

}


// ================================
// POSTURE CALCULATION
// ================================

function calculatePosture(
    nose,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip
) {

    /*
        IMPORTANT:

        This is a simple educational heuristic.

        MoveNet provides body keypoints.
        Our application interprets those
        points to estimate posture.

        This is NOT a medical diagnosis.
    */


    // --------------------------------
    // 1. Shoulder midpoint
    // --------------------------------

    const shoulderX =
        (
            leftShoulder.x +
            rightShoulder.x
        ) / 2;

    const shoulderY =
        (
            leftShoulder.y +
            rightShoulder.y
        ) / 2;


    // --------------------------------
    // 2. Head alignment
    // --------------------------------

    const horizontalHeadDistance =
        Math.abs(
            nose.x - shoulderX
        );


    // --------------------------------
    // 3. Shoulder tilt
    // --------------------------------

    const shoulderDifference =
        Math.abs(
            leftShoulder.y -
            rightShoulder.y
        );


    // --------------------------------
    // 4. Torso alignment
    // --------------------------------

    let torsoTilt = 0;

    if (leftHip && rightHip) {

        const hipX =
            (
                leftHip.x +
                rightHip.x
            ) / 2;

        const hipY =
            (
                leftHip.y +
                rightHip.y
            ) / 2;

        const torsoHorizontalDifference =
            Math.abs(
                shoulderX - hipX
            );

        const torsoVerticalDistance =
            Math.abs(
                shoulderY - hipY
            );

        if (torsoVerticalDistance > 0) {

            torsoTilt =
                torsoHorizontalDifference /
                torsoVerticalDistance;

        }

    }


    // --------------------------------
    // Calculate score
    // --------------------------------

    let score = 100;

    let issues = [];


    // Head alignment
    if (horizontalHeadDistance > 120) {

        score -= 30;

        issues.push(
            "Try moving your head back over your shoulders."
        );

    } else if (horizontalHeadDistance > 70) {

        score -= 15;

        issues.push(
            "Try keeping your head more aligned with your shoulders."
        );

    }


    // Shoulder alignment
    if (shoulderDifference > 60) {

        score -= 25;

        issues.push(
            "Try keeping your shoulders level."
        );

    } else if (shoulderDifference > 35) {

        score -= 10;

        issues.push(
            "Your shoulders appear slightly tilted."
        );

    }


    // Torso alignment
    if (torsoTilt > 0.55) {

        score -= 25;

        issues.push(
            "Try sitting more upright."
        );

    } else if (torsoTilt > 0.35) {

        score -= 10;

        issues.push(
            "Your upper body may be leaning."
        );

    }


    // Keep score within range
    score = Math.max(
        0,
        Math.min(100, score)
    );


    // --------------------------------
    // Determine posture status
    // --------------------------------

    let status;
    let description;
    let message;


    if (score >= 80) {

        status = "good";

        description =
            "Your body appears to be well aligned.";

        message =
            "Great job! Keep your head, shoulders, and upper body comfortably aligned.";

    } else if (score >= 60) {

        status = "warning";

        description =
            "Your posture could use some improvement.";

        message =
            issues.length > 0
                ? issues[0]
                : "Try sitting a little more upright.";

    } else {

        status = "bad";

        description =
            "Your posture may indicate slouching or leaning.";

        message =
            issues.length > 0
                ? issues[0]
                : "Try straightening your back and aligning your head with your shoulders.";

    }


    return {
        score: score,
        status: status,
        description: description,
        recommendation: message
    };

}


// ================================
// UPDATE USER INTERFACE
// ================================

function updatePostureUI(result) {

    scoreValue.textContent =
        result.score;

    scoreProgress.style.width =
        result.score + "%";


    postureStatus.className =
        "posture-status " +
        result.status;


    if (result.status === "good") {

        postureStatus.textContent =
            "Good Posture";

        postureEmoji.textContent =
            "🟢";

    } else if (result.status === "warning") {

        postureStatus.textContent =
            "Needs Improvement";

        postureEmoji.textContent =
            "🟡";

    } else {

        postureStatus.textContent =
            "Poor Posture";

        postureEmoji.textContent =
            "🔴";

    }


    postureDescription.textContent =
        result.description;

    recommendation.textContent =
        result.recommendation;

}


// ================================
// NO PERSON DETECTED
// ================================

function handleNoPerson() {

    personDetected.textContent = "No";

    confidence.textContent = "--";

    postureStatus.textContent =
        "No Person Detected";

    postureStatus.className =
        "posture-status neutral";

    postureEmoji.textContent =
        "👤";

    postureDescription.textContent =
        "Move into the camera frame so MoveNet can detect your body.";

    scoreValue.textContent =
        "--";

    scoreProgress.style.width =
        "0%";

    recommendation.textContent =
        "Position yourself clearly in front of the camera.";

}


// ================================
// INSUFFICIENT DATA
// ================================

function showInsufficientData() {

    postureStatus.textContent =
        "Move Closer";

    postureStatus.className =
        "posture-status warning";

    postureEmoji.textContent =
        "⚠️";

    postureDescription.textContent =
        "Not enough body keypoints are visible.";

    recommendation.textContent =
        "Make sure your head and shoulders are clearly visible.";

}


// ================================
// DRAW SKELETON
// ================================

function drawPose(pose) {

    const keypoints =
        pose.keypoints;

    // Draw connections
    const adjacentPairs =
        poseDetection.util.getAdjacentPairs(
            poseDetection.SupportedModels.MoveNet
        );


    ctx.lineWidth = 4;

    ctx.strokeStyle = "#22c55e";

    adjacentPairs.forEach(
        ([i, j]) => {

            const kp1 =
                keypoints[i];

            const kp2 =
                keypoints[j];

            if (
                kp1.score > 0.3 &&
                kp2.score > 0.3
            ) {

                ctx.beginPath();

                ctx.moveTo(
                    kp1.x,
                    kp1.y
                );

                ctx.lineTo(
                    kp2.x,
                    kp2.y
                );

                ctx.stroke();

            }

        }
    );


    // Draw keypoints
    keypoints.forEach(
        point => {

            if (point.score > 0.3) {

                ctx.beginPath();

                ctx.arc(
                    point.x,
                    point.y,
                    6,
                    0,
                    2 * Math.PI
                );

                ctx.fillStyle = "#ffffff";

                ctx.fill();

                ctx.strokeStyle = "#2563eb";

                ctx.lineWidth = 3;

                ctx.stroke();

            }

        }
    );

}


// ================================
// STUDY TIMER
// ================================

function startTimer() {

    if (timerInterval) {
        return;
    }

    timerInterval =
        setInterval(
            () => {

                timerSeconds++;

                updateTimer();

            },
            1000
        );

}


function stopTimer() {

    if (timerInterval) {

        clearInterval(timerInterval);

        timerInterval = null;

    }

}


function updateTimer() {

    const hours =
        Math.floor(
            timerSeconds / 3600
        );

    const minutes =
        Math.floor(
            (timerSeconds % 3600) / 60
        );

    const seconds =
        timerSeconds % 60;


    timerDisplay.textContent =
        String(hours).padStart(2, "0") +
        ":" +
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0");

}


// ================================
// BUTTON EVENTS
// ================================

startButton.addEventListener(
    "click",
    startCamera
);

stopButton.addEventListener(
    "click",
    stopCamera
);


// ================================
// INITIALIZE
// ================================

startButton.disabled = true;

loadModel();