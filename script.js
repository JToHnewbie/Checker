// ======================================
// Roboflow 설정
// ======================================

// Roboflow 프로젝트 주소에서 확인한 프로젝트 ID
const MODEL_ID = "my-first-project-6mg7b";

// Roboflow에서 학습한 모델 버전 번호로 변경하세요.
const MODEL_VERSION = "1";

// Roboflow API 키를 입력하세요.
// 공개 웹사이트에 배포할 경우 키가 방문자에게 노출됩니다.
const API_KEY = "rf_e3x6QcEuPNfrRQikhph8n9cQhwp2";

const API_URL =
  `https://detect.roboflow.com/${MODEL_ID}/${MODEL_VERSION}`;


// ======================================
// HTML 요소
// ======================================

const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const resultCanvas = document.getElementById("resultCanvas");
const predictButton = document.getElementById("predictButton");
const statusText = document.getElementById("status");
const resultsContainer = document.getElementById("results");

const ctx = resultCanvas.getContext("2d");

let selectedFile = null;


// ======================================
// 이미지 선택 및 미리보기
// ======================================

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    statusText.textContent = "이미지 파일을 선택해 주세요.";
    return;
  }

  selectedFile = file;

  const imageURL = URL.createObjectURL(file);

  previewImage.onload = () => {
    previewImage.style.display = "block";
    resultCanvas.style.display = "none";

    predictButton.disabled = false;

    statusText.textContent = "이미지가 준비되었습니다.";

    resultsContainer.textContent =
      "AI 분석 버튼을 눌러 주세요.";

    URL.revokeObjectURL(imageURL);
  };

  previewImage.src = imageURL;
});


// ======================================
// 이미지 파일을 Base64로 변환
// ======================================

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataURL = reader.result;
      resolve(dataURL.split(",")[1]);
    };

    reader.onerror = () => {
      reject(new Error("이미지를 읽지 못했습니다."));
    };

    reader.readAsDataURL(file);
  });
}


// ======================================
// Roboflow AI 분석
// ======================================

predictButton.addEventListener("click", async () => {
  if (!selectedFile) {
    statusText.textContent = "먼저 이미지를 선택해 주세요.";
    return;
  }

  if (
    !API_KEY ||
    API_KEY === "YOUR_ROBOFLOW_API_KEY" ||
    !MODEL_VERSION ||
    MODEL_VERSION === "YOUR_MODEL_VERSION"
  ) {
    statusText.textContent =
      "Roboflow API 키와 모델 버전 번호를 설정해 주세요.";
    return;
  }

  predictButton.disabled = true;
  statusText.textContent = "AI가 이미지를 분석하고 있습니다...";

  resultsContainer.textContent = "";

  try {
    const base64Image = await fileToBase64(selectedFile);

    const response = await fetch(
      `${API_URL}?api_key=${encodeURIComponent(API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: base64Image
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Roboflow API 오류 (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    displayResults(data);

    statusText.textContent = "분석이 완료되었습니다.";

  } catch (error) {
    console.error(error);

    statusText.textContent =
      `분석 실패: ${error.message}`;

  } finally {
    predictButton.disabled = false;
  }
});


// ======================================
// 분석 결과 표시
// ======================================

function displayResults(data) {
  resultsContainer.innerHTML = "";

  const predictions = data.predictions || [];

  if (predictions.length === 0) {
    resultsContainer.textContent = "탐지된 객체가 없습니다.";
    resultCanvas.style.display = "none";
    return;
  }

  predictions.forEach((prediction) => {
    const item = document.createElement("div");

    item.className = "result-item";

    const confidence =
      (Number(prediction.confidence || 0) * 100).toFixed(1);

    item.textContent =
      `${prediction.class || "객체"} - 신뢰도 ${confidence}%`;

    resultsContainer.appendChild(item);
  });

  drawPredictions(predictions);
}


// ======================================
// 이미지 위에 탐지 결과 그리기
// ======================================

function drawPredictions(predictions) {
  const width = previewImage.naturalWidth;
  const height = previewImage.naturalHeight;

  if (!width || !height) {
    return;
  }

  resultCanvas.width = width;
  resultCanvas.height = height;

  ctx.clearRect(0, 0, width, height);

  ctx.lineWidth = Math.max(2, width / 300);
  ctx.font = `${Math.max(14, width / 35)}px Arial`;

  predictions.forEach((prediction) => {
    const x = Number(prediction.x);
    const y = Number(prediction.y);
    const boxWidth = Number(prediction.width);
    const boxHeight = Number(prediction.height);

    // 객체 탐지 결과에 좌표 정보가 없는 경우 건너뜁니다.
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(boxWidth) ||
      !Number.isFinite(boxHeight)
    ) {
      return;
    }

    const left = x - boxWidth / 2;
    const top = y - boxHeight / 2;

    ctx.strokeStyle = "#22c55e";
    ctx.strokeRect(left, top, boxWidth, boxHeight);

    const label =
      `${prediction.class || "객체"} ` +
      `${(Number(prediction.confidence || 0) * 100).toFixed(1)}%`;

    const labelHeight = Math.max(22, width / 25);
    const labelWidth = ctx.measureText(label).width + 12;

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(
      left,
      Math.max(0, top - labelHeight),
      labelWidth,
      labelHeight
    );

    ctx.fillStyle = "#ffffff";
    ctx.fillText(
      label,
      left + 6,
      Math.max(labelHeight * 0.75, top - labelHeight * 0.2)
    );
  });

  resultCanvas.style.display = "block";
}
