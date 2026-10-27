// ========================================
// Roboflow 모델 설정
// ========================================

// 실제 Roboflow 프로젝트에서 확인한 모델 ID
const MODEL_ID =
  "jtohnewbie-s-workspace/my-first-project-6mg7b-1-rfdetr-small-t2";

// Roboflow API 키
const API_KEY = "YOUR_ROBOFLOW_API_KEY";

// RF-DETR 모델 추론 API
const API_URL =
  `https://serverless.roboflow.com/${MODEL_ID}`;


// ========================================
// HTML 요소
// ========================================

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");

const statusText = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const placeholder = document.getElementById("placeholder");

const intervalInput = document.getElementById("interval");
const intervalValue = document.getElementById("intervalValue");

const objectCount = document.getElementById("objectCount");
const lastTime = document.getElementById("lastTime");
const results = document.getElementById("results");


// ========================================
// 상태 관리
// ========================================

let cameraStream = null;
let timer = null;
let isRunning = false;
let isAnalyzing = false;
let sessionId = 0;


// ========================================
// 분석 간격 조절
// ========================================

intervalInput.addEventListener("input", () => {
  intervalValue.textContent = `${intervalInput.value}ms`;

  if (isRunning) {
    scheduleNextFrame(sessionId);
  }
});


// ========================================
// 웹캠 시작
// ========================================

startButton.addEventListener("click", startCamera);

async function startCamera() {
  if (isRunning) return;

  if (
    !API_KEY ||
    API_KEY === "YOUR_ROBOFLOW_API_KEY" ||
    !MODEL_VERSION ||
    MODEL_VERSION === "YOUR_MODEL_VERSION"
  ) {
    setStatus(
      "script.js에 Roboflow API 키와 모델 버전을 설정해 주세요."
    );
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("웹캠을 사용할 수 없습니다. HTTPS 접속인지 확인해 주세요.");
    return;
  }

  try {
    setStatus("웹캠에 연결하는 중...");

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    video.srcObject = cameraStream;
    await video.play();

    isRunning = true;
    isAnalyzing = false;

    const currentSession = ++sessionId;

    placeholder.style.display = "none";

    startButton.disabled = true;
    stopButton.disabled = false;

    statusDot.classList.add("live");
    setStatus("웹캠 연결 완료. AI 분석 중...");

    scheduleNextFrame(currentSession);

  } catch (error) {
    stopCamera();

    setStatus(
      `웹캠 연결 실패: ${error.message}. 카메라 권한을 확인해 주세요.`
    );
  }
}


// ========================================
// 웹캠 종료
// ========================================

stopButton.addEventListener("click", stopCamera);

function stopCamera() {
  isRunning = false;
  isAnalyzing = false;

  // 진행 중인 비동기 요청의 결과를 무시하도록 세션 변경
  sessionId++;

  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  video.pause();
  video.srcObject = null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  canvas.width = 0;
  canvas.height = 0;

  canvas.style.display = "none";
  placeholder.style.display = "flex";

  startButton.disabled = false;
  stopButton.disabled = true;

  statusDot.classList.remove("live");

  setStatus("웹캠이 종료되었습니다.");
}


// ========================================
// 다음 프레임 분석 예약
// ========================================

function scheduleNextFrame(currentSession) {
  if (timer !== null) {
    clearTimeout(timer);
  }

  if (!isRunning || currentSession !== sessionId) return;

  timer = setTimeout(
    () => analyzeFrame(currentSession),
    Number(intervalInput.value)
  );
}


// ========================================
// 웹캠 프레임을 JPEG Base64로 변환
// ========================================

function captureFrame() {
  const maxWidth = 640;

  const scale = Math.min(
    1,
    maxWidth / video.videoWidth
  );

  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);

  const frameCanvas = document.createElement("canvas");

  frameCanvas.width = width;
  frameCanvas.height = height;

  const frameContext = frameCanvas.getContext("2d");

  frameContext.drawImage(video, 0, 0, width, height);

  return {
    base64: frameCanvas.toDataURL("image/jpeg", 0.8).split(",")[1],
    width,
    height
  };
}


// ========================================
// Roboflow 실시간 분석
// ========================================

async function analyzeFrame(currentSession) {
  if (
    !isRunning ||
    isAnalyzing ||
    currentSession !== sessionId ||
    video.readyState < 2
  ) {
    scheduleNextFrame(currentSession);
    return;
  }

  isAnalyzing = true;

  try {
    const frame = captureFrame();

    const response = await fetch(
      `${API_URL}?api_key=${encodeURIComponent(API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: frame.base64
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`API 오류 ${response.status}: ${detail}`);
    }

    const data = await response.json();

    // 종료 후 도착한 응답은 화면에 반영하지 않습니다.
    if (!isRunning || currentSession !== sessionId) return;

    drawPredictions(data.predictions || [], frame.width, frame.height);
    showResults(data.predictions || []);

    lastTime.textContent = new Date().toLocaleTimeString("ko-KR");
    setStatus("실시간 AI 분석 중...");

  } catch (error) {
    if (isRunning && currentSession === sessionId) {
      console.error(error);
      setStatus(`분석 오류: ${error.message}`);
    }

  } finally {
    isAnalyzing = false;

    if (isRunning && currentSession === sessionId) {
      scheduleNextFrame(currentSession);
    }
  }
}


// ========================================
// 탐지 결과 그리기
// ========================================

function drawPredictions(predictions, width, height) {
  if (
    canvas.width !== width ||
    canvas.height !== height
  ) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  const lineWidth = Math.max(2, width / 320);
  const fontSize = Math.max(13, width / 38);

  ctx.lineWidth = lineWidth;
  ctx.font = `bold ${fontSize}px Arial`;

  predictions.forEach(prediction => {
    const x = Number(prediction.x);
    const y = Number(prediction.y);
    const w = Number(prediction.width);
    const h = Number(prediction.height);

    if (![x, y, w, h].every(Number.isFinite)) return;

    const left = x - w / 2;
    const top = y - h / 2;

    const label =
      `${prediction.class || "객체"} ` +
      `${(Number(prediction.confidence || 0) * 100).toFixed(1)}%`;

    ctx.strokeStyle = "#22ff88";
    ctx.strokeRect(left, top, w, h);

    const labelHeight = fontSize + 10;
    const labelWidth = ctx.measureText(label).width + 12;
    const labelTop = Math.max(0, top - labelHeight);

    ctx.fillStyle = "#16a34a";
    ctx.fillRect(left, labelTop, labelWidth, labelHeight);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, left + 6, labelTop + fontSize + 1);
  });

  canvas.style.display = "block";
}


// ========================================
// 결과 목록 표시
// ========================================

function showResults(predictions) {
  objectCount.textContent = predictions.length;
  results.replaceChildren();

  if (predictions.length === 0) {
    results.textContent = "현재 탐지된 객체가 없습니다.";
    return;
  }

  predictions.forEach(prediction => {
    const item = document.createElement("div");
    item.className = "result-item";

    const confidence =
      (Number(prediction.confidence || 0) * 100).toFixed(1);

    item.textContent =
      `${prediction.class || "객체"} · 신뢰도 ${confidence}%`;

    results.appendChild(item);
  });
}


// ========================================
// 상태 표시
// ========================================

function setStatus(message) {
  statusText.textContent = message;
}


// 탭을 닫거나 페이지를 벗어날 때 카메라 종료
window.addEventListener("pagehide", stopCamera);
