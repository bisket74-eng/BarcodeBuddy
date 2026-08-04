const ZXING_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.0/+esm";

const MAX_BARCODE_LENGTH = 18;

const elements = {
  takePhotoButton: document.getElementById("takePhotoButton"),
  openNumberButton: document.getElementById("openNumberButton"),
  cameraInput: document.getElementById("cameraInput"),
  photoPanel: document.getElementById("photoPanel"),
  photoPreview: document.getElementById("photoPreview"),
  photoStatus: document.getElementById("photoStatus"),
  progressTrack: document.getElementById("progressTrack"),
  progressBar: document.getElementById("progressBar"),
  cancelPhotoButton: document.getElementById("cancelPhotoButton"),
  numberPanel: document.getElementById("numberPanel"),
  closeNumberButton: document.getElementById("closeNumberButton"),
  numberDisplay: document.getElementById("numberDisplay"),
  clearButton: document.getElementById("clearButton"),
  generateButton: document.getElementById("generateButton"),
  currentNumberStrip: document.getElementById("currentNumberStrip"),
  currentNumberValue: document.getElementById("currentNumberValue"),
  currentNumberClearButton: document.getElementById("currentNumberClearButton"),
  resultsSection: document.getElementById("resultsSection"),
  notice: document.getElementById("notice"),
  results: document.getElementById("results"),
  resultCount: document.getElementById("resultCount"),
  fullscreenModal: document.getElementById("fullscreenModal"),
  closeFullscreenButton: document.getElementById("closeFullscreenButton"),
  fullscreenCanvas: document.getElementById("fullscreenCanvas"),
  fullscreenNumber: document.getElementById("fullscreenNumber"),
  fullscreenNavigation: document.getElementById("fullscreenNavigation"),
  previousCandidateButton: document.getElementById("previousCandidateButton"),
  nextCandidateButton: document.getElementById("nextCandidateButton"),
  fullscreenPosition: document.getElementById("fullscreenPosition"),
  toast: document.getElementById("toast")
};

let numberText = "";
let keypadCaret = 0;
let candidates = [];
let fullscreenIndex = 0;
let currentPhotoUrl = "";
let toastTimer = 0;
let openedNativeFullscreen = false;
let orientationLocked = false;
let isClosingFullscreen = false;

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2400);
}

function groupNumber(value) {
  return String(value || "").replace(/(.{4})/g, "$1 ").trim();
}

function sanitizeEditableNumber(value) {
  return String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/[^0-9?]/g, "")
    .slice(0, MAX_BARCODE_LENGTH);
}

function updateCurrentNumberStrip() {
  const hasNumber = Boolean(numberText);
  elements.currentNumberStrip.hidden = !hasNumber;

  if (hasNumber) {
    elements.currentNumberValue.textContent = groupNumber(numberText);

    window.requestAnimationFrame(() => {
      elements.currentNumberValue.scrollLeft = 0;
    });
  }
}

function renderNumberDisplay() {
  elements.numberDisplay.innerHTML = "";

  if (!numberText) {
    elements.numberDisplay.textContent = "Enter numbers below";
    elements.numberDisplay.classList.add("empty");
    return;
  }

  elements.numberDisplay.classList.remove("empty");

  for (let index = 0; index <= numberText.length; index += 1) {
    if (index === keypadCaret) {
      const caret = document.createElement("span");
      caret.className = "keypad-caret";
      elements.numberDisplay.appendChild(caret);
    }

    if (index < numberText.length) {
      const digit = document.createElement("span");
      digit.className = "keypad-digit";
      digit.textContent = numberText[index];
      digit.dataset.index = String(index);
      elements.numberDisplay.appendChild(digit);

      if ((index + 1) % 4 === 0 && index < numberText.length - 1) {
        const gap = document.createElement("span");
        gap.textContent = " ";
        gap.style.width = "0.35em";
        elements.numberDisplay.appendChild(gap);
      }
    }
  }

  window.requestAnimationFrame(() => {
    const caret = elements.numberDisplay.querySelector(".keypad-caret");
    caret?.scrollIntoView({ inline: "center", block: "nearest" });
  });
}

function setNumberText(value) {
  numberText = sanitizeEditableNumber(value);
  keypadCaret = Math.min(keypadCaret, numberText.length);
  renderNumberDisplay();
  updateCurrentNumberStrip();
}

function updateInputOpenState() {
  const inputIsOpen =
    !elements.numberPanel.hidden || !elements.photoPanel.hidden;

  document.body.classList.toggle("input-open", inputIsOpen);
}

function closeInputPanels() {
  elements.numberPanel.hidden = true;
  elements.photoPanel.hidden = true;
  updateInputOpenState();
}

function openNumberPanel() {
  elements.photoPanel.hidden = true;
  elements.numberPanel.hidden = false;
  updateInputOpenState();
  keypadCaret = numberText.length;
  renderNumberDisplay();

  window.setTimeout(() => {
    elements.numberPanel.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }, 40);
}

function closeNumberPanel() {
  elements.numberPanel.hidden = true;
  updateInputOpenState();
}

function insertAtCaret(character) {
  if (numberText.length >= MAX_BARCODE_LENGTH) {
    showToast("Barcode numbers are limited to 18 digits");
    return;
  }

  numberText =
    numberText.slice(0, keypadCaret) +
    character +
    numberText.slice(keypadCaret);

  keypadCaret += 1;
  renderNumberDisplay();
  updateCurrentNumberStrip();
}

function backspaceAtCaret() {
  if (keypadCaret <= 0) {
    return;
  }

  numberText =
    numberText.slice(0, keypadCaret - 1) +
    numberText.slice(keypadCaret);

  keypadCaret -= 1;
  renderNumberDisplay();
  updateCurrentNumberStrip();
}

function handleKeypadKey(key) {
  if (/^[0-9?]$/.test(key)) {
    insertAtCaret(key);
    return;
  }

  if (key === "backspace") {
    backspaceAtCaret();
    return;
  }

  if (key === "left") {
    keypadCaret = Math.max(0, keypadCaret - 1);
    renderNumberDisplay();
    return;
  }

  if (key === "right") {
    keypadCaret = Math.min(numberText.length, keypadCaret + 1);
    renderNumberDisplay();
    return;
  }

  if (key === "clear") {
    setNumberText("");
    keypadCaret = 0;
  }
}

function setPhotoStatus(message, progress = null) {
  elements.photoStatus.textContent = message;

  if (typeof progress === "number") {
    elements.progressTrack.hidden = false;
    elements.progressBar.style.width =
      `${Math.max(0, Math.min(100, progress))}%`;
  } else {
    elements.progressTrack.hidden = true;
    elements.progressBar.style.width = "0%";
  }
}

function releasePhotoUrl() {
  if (currentPhotoUrl) {
    URL.revokeObjectURL(currentPhotoUrl);
    currentPhotoUrl = "";
  }
}

function closePhotoPanel() {
  elements.photoPanel.hidden = true;
  updateInputOpenState();
  releasePhotoUrl();
  elements.photoPreview.removeAttribute("src");
  setPhotoStatus("");
}

function clearEverything() {
  setNumberText("");
  keypadCaret = 0;
  candidates = [];
  renderResults();
  closePhotoPanel();
  showToast("Cleared");
}

function extractDecodedDigits(text) {
  const cleaned = String(text || "").replace(/\u001d/g, "");
  const digitRuns = cleaned.match(/\d+/g) || [];

  const exact = digitRuns.find(
    (run) => run.length === MAX_BARCODE_LENGTH
  );

  if (exact) {
    return exact;
  }

  const combined = cleaned.replace(/\D/g, "");

  if (combined.length >= MAX_BARCODE_LENGTH) {
    return combined.slice(0, MAX_BARCODE_LENGTH);
  }

  return "";
}

function extractBestOcrNumber(text) {
  const normalized = String(text || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1");

  const runs = normalized.match(/\d[\d\s-]{6,60}\d/g) || [];
  const found = runs
    .map((run) => run.replace(/\D/g, ""))
    .filter((run) => run.length >= MAX_BARCODE_LENGTH)
    .map((run) => run.slice(0, MAX_BARCODE_LENGTH));

  const exact = found.find(
    (run) => run.length === MAX_BARCODE_LENGTH
  );

  if (exact) {
    return exact;
  }

  const allDigits = normalized.replace(/\D/g, "");

  return allDigits.length >= MAX_BARCODE_LENGTH
    ? allDigits.slice(0, MAX_BARCODE_LENGTH)
    : "";
}

async function decodeWithNativeDetector(image) {
  if (!("BarcodeDetector" in window)) {
    return "";
  }

  try {
    const supported =
      typeof BarcodeDetector.getSupportedFormats === "function"
        ? await BarcodeDetector.getSupportedFormats()
        : ["code_128"];

    if (!supported.includes("code_128")) {
      return "";
    }

    const detector = new BarcodeDetector({ formats: ["code_128"] });
    const results = await detector.detect(image);
    return results?.[0]?.rawValue || "";
  } catch (error) {
    console.warn("Native barcode detection failed.", error);
    return "";
  }
}

async function decodeWithZxing(image) {
  try {
    const { BrowserMultiFormatReader } = await import(ZXING_URL);
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageElement(image);
    return result?.getText?.() || String(result || "");
  } catch (error) {
    console.warn("ZXing could not decode this image.", error);
    return "";
  }
}

function makeOcrCanvas(image) {
  const maxWidth = 1900;
  const scale = Math.min(3, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray =
      data[index] * 0.299 +
      data[index + 1] * 0.587 +
      data[index + 2] * 0.114;

    const contrasted = gray < 150
      ? Math.max(0, gray * 0.55)
      : Math.min(255, 190 + (gray - 150) * 1.5);

    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }

  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function runOcr(image) {
  if (!window.Tesseract?.createWorker) {
    throw new Error("OCR could not load. Check the internet connection.");
  }

  const ocrCanvas = makeOcrCanvas(image);

  const worker = await Tesseract.createWorker("eng", 1, {
    logger(message) {
      if (message.status === "recognizing text") {
        const percent = Math.round((message.progress || 0) * 100);
        setPhotoStatus(`Reading printed numbers… ${percent}%`, percent);
      } else {
        setPhotoStatus("Preparing number reader…", 8);
      }
    }
  });

  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789 -",
      preserve_interword_spaces: "1"
    });

    const result = await worker.recognize(ocrCanvas);
    return result?.data?.text || "";
  } finally {
    await worker.terminate();
  }
}

async function processPhoto(file) {
  if (!file) {
    return;
  }

  closeNumberPanel();
  releasePhotoUrl();

  currentPhotoUrl = URL.createObjectURL(file);
  elements.photoPreview.src = currentPhotoUrl;
  elements.photoPanel.hidden = false;
  updateInputOpenState();
  setPhotoStatus("Loading label photo…", 3);

  try {
    await elements.photoPreview.decode();

    setPhotoStatus("Trying to read the barcode…", 12);

    let decoded = await decodeWithNativeDetector(elements.photoPreview);

    if (!decoded) {
      decoded = await decodeWithZxing(elements.photoPreview);
    }

    const decodedDigits = extractDecodedDigits(decoded);

    if (decodedDigits) {
      setNumberText(decodedDigits);
      closePhotoPanel();
      generateCandidates({ closePanels: true, fromPhoto: true });
      showToast("Barcode read from photo");
      return;
    }

    setPhotoStatus(
      "The barcode did not scan. Trying to read the printed numbers…",
      18
    );

    const ocrText = await runOcr(elements.photoPreview);
    const ocrNumber = extractBestOcrNumber(ocrText);

    if (ocrNumber) {
      setNumberText(ocrNumber);
      closePhotoPanel();
      generateCandidates({ closePanels: true, fromPhoto: true });
      showToast("Printed number read—tap the number line to correct it");
      return;
    }

    closePhotoPanel();
    openNumberPanel();
    showToast("The photo could not be read. Enter the number below.");
  } catch (error) {
    console.error(error);
    closePhotoPanel();
    openNumberPanel();
    showToast(
      error?.message ||
        "The photo could not be read. Try typing the number."
    );
  } finally {
    elements.cameraInput.value = "";
  }
}

function expandCandidates(pattern) {
  const unknownCount = (pattern.match(/\?/g) || []).length;

  if (unknownCount > 2) {
    throw new Error("Use no more than two question marks.");
  }

  if (unknownCount === 0) {
    return [pattern];
  }

  const results = [];

  function build(index, value) {
    if (index >= pattern.length) {
      results.push(value);
      return;
    }

    const character = pattern[index];

    if (character === "?") {
      for (let digit = 0; digit <= 9; digit += 1) {
        build(index + 1, value + String(digit));
      }
    } else {
      build(index + 1, value + character);
    }
  }

  build(0, "");
  return results;
}

function drawBarcode(canvas, value, large = false) {
  if (!window.bwipjs?.toCanvas) {
    throw new Error("The barcode generator could not load.");
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);

  bwipjs.toCanvas(canvas, {
    bcid: "code128",
    text: value,
    scale: large
      ? Math.max(4, Math.round(pixelRatio * 2.4))
      : Math.max(2, Math.round(pixelRatio * 1.15)),
    height: large ? 24 : 16,
    includetext: false,
    paddingwidth: large ? 14 : 8,
    paddingheight: large ? 8 : 5,
    backgroundcolor: "FFFFFF",
    barcolor: "000000"
  });
}

function generateCandidates(options = {}) {
  const { closePanels = true } = options;
  const pattern = sanitizeEditableNumber(numberText);

  if (!pattern) {
    showToast("Enter a tracking number first");
    openNumberPanel();
    return;
  }

  if (pattern.length !== MAX_BARCODE_LENGTH) {
    showToast(
      `Enter all ${MAX_BARCODE_LENGTH} digits. Use ? for an unreadable digit.`
    );
    openNumberPanel();
    return;
  }

  try {
    const unknownCount = (pattern.match(/\?/g) || []).length;

    if (
      unknownCount === 2 &&
      !window.confirm(
        "Two missing digits create 100 barcode possibilities. Continue?"
      )
    ) {
      return;
    }

    numberText = pattern;
    keypadCaret = numberText.length;
    candidates = expandCandidates(pattern);
    updateCurrentNumberStrip();
    renderNumberDisplay();
    renderResults();

    if (closePanels) {
      closeInputPanels();
    }

    window.setTimeout(() => {
      elements.currentNumberStrip.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);
  } catch (error) {
    showToast(error?.message || "The barcode could not be created.");
  }
}

function renderResults() {
  elements.results.innerHTML = "";
  elements.resultCount.textContent = String(candidates.length);

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "empty-results";
    empty.textContent =
      "Take a label photo or enter the complete number above.";
    elements.results.appendChild(empty);
    return;
  }

  candidates.forEach((value, index) => {
    const card = document.createElement("article");
    card.className = "barcode-card";

    const barcodeTap = document.createElement("button");
    barcodeTap.type = "button";
    barcodeTap.className = "barcode-tap";
    barcodeTap.setAttribute(
      "aria-label",
      `Open barcode ${groupNumber(value)} in landscape full screen`
    );
    barcodeTap.addEventListener("click", () => openFullscreen(index));

    const barcodeWrap = document.createElement("div");
    barcodeWrap.className = "barcode-wrap";

    const canvas = document.createElement("canvas");
    barcodeWrap.appendChild(canvas);

    const number = document.createElement("div");
    number.className = "candidate-number";
    number.textContent = groupNumber(value);

    barcodeTap.append(barcodeWrap, number);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const shareButton = document.createElement("button");
    shareButton.className = "share-button";
    shareButton.type = "button";
    shareButton.textContent = "Share Image";
    shareButton.addEventListener("click", () => shareBarcode(value));

    const downloadButton = document.createElement("button");
    downloadButton.className = "download-button";
    downloadButton.type = "button";
    downloadButton.textContent = "Download";
    downloadButton.addEventListener("click", () => downloadBarcode(value));

    actions.append(shareButton, downloadButton);
    card.append(barcodeTap, actions);
    elements.results.appendChild(card);

    try {
      drawBarcode(canvas, value);
    } catch (error) {
      barcodeWrap.textContent =
        error?.message || "The barcode could not be drawn.";
    }
  });
}

function shouldUseRotatedFallback() {
  return window.innerHeight > window.innerWidth && !orientationLocked;
}

function applyFullscreenOrientation() {
  elements.fullscreenModal.classList.toggle(
    "force-landscape",
    shouldUseRotatedFallback()
  );
}

async function tryNativeLandscape() {
  openedNativeFullscreen = false;
  orientationLocked = false;

  try {
    if (
      !document.fullscreenElement &&
      typeof elements.fullscreenModal.requestFullscreen === "function"
    ) {
      await elements.fullscreenModal.requestFullscreen({
        navigationUI: "hide"
      });
      openedNativeFullscreen = true;
    }
  } catch (error) {
    console.warn("Full-screen request was blocked.", error);
  }

  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
      orientationLocked = true;
    }
  } catch (error) {
    console.warn("Landscape orientation lock was blocked.", error);
  }

  applyFullscreenOrientation();
}

async function openFullscreen(index) {
  fullscreenIndex = Math.max(0, Math.min(candidates.length - 1, index));
  elements.fullscreenModal.hidden = false;
  document.body.style.overflow = "hidden";
  renderFullscreen();

  await tryNativeLandscape();

  window.setTimeout(() => {
    applyFullscreenOrientation();
    renderFullscreen();
  }, 220);
}

async function closeFullscreen(options = {}) {
  if (isClosingFullscreen) {
    return;
  }

  isClosingFullscreen = true;

  try {
    if (screen.orientation?.unlock) {
      screen.orientation.unlock();
    }
  } catch (error) {
    console.warn("Could not unlock orientation.", error);
  }

  orientationLocked = false;
  elements.fullscreenModal.classList.remove("force-landscape");
  elements.fullscreenModal.hidden = true;
  document.body.style.overflow = "";

  if (
    options.exitNative !== false &&
    openedNativeFullscreen &&
    document.fullscreenElement &&
    typeof document.exitFullscreen === "function"
  ) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn("Could not exit browser full screen.", error);
    }
  }

  openedNativeFullscreen = false;
  isClosingFullscreen = false;
}

function renderFullscreen() {
  const value = candidates[fullscreenIndex];

  if (!value) {
    closeFullscreen();
    return;
  }

  drawBarcode(elements.fullscreenCanvas, value, true);
  elements.fullscreenNumber.textContent = groupNumber(value);

  const multiple = candidates.length > 1;
  elements.fullscreenNavigation.hidden = !multiple;

  if (multiple) {
    elements.fullscreenPosition.textContent =
      `${fullscreenIndex + 1} of ${candidates.length}`;
    elements.previousCandidateButton.disabled = fullscreenIndex <= 0;
    elements.nextCandidateButton.disabled =
      fullscreenIndex >= candidates.length - 1;
  }
}

function createExportCanvas(value) {
  const barcodeCanvas = document.createElement("canvas");
  drawBarcode(barcodeCanvas, value, true);

  const padding = 42;
  const numberHeight = 86;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = barcodeCanvas.width + padding * 2;
  exportCanvas.height = barcodeCanvas.height + padding * 2 + numberHeight;

  const context = exportCanvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(barcodeCanvas, padding, padding);

  context.fillStyle = "#000000";
  context.font = "700 32px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    groupNumber(value),
    exportCanvas.width / 2,
    exportCanvas.height - numberHeight / 2
  );

  return exportCanvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The barcode image could not be created."));
      }
    }, "image/png");
  });
}

function safeFilename(value) {
  return value.replace(/[^0-9]/g, "").slice(0, 40) || "barcode";
}

async function shareBarcode(value) {
  try {
    const canvas = createExportCanvas(value);
    const blob = await canvasToBlob(canvas);
    const file = new File(
      [blob],
      `barcode-${safeFilename(value)}.png`,
      { type: "image/png" }
    );

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Package barcode"
      });
      return;
    }

    downloadBlob(blob, file.name);
    showToast("Sharing is unavailable, so the image was downloaded");
  } catch (error) {
    if (error?.name !== "AbortError") {
      showToast(error?.message || "The barcode image could not be shared.");
    }
  }
}

async function downloadBarcode(value) {
  try {
    const canvas = createExportCanvas(value);
    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, `barcode-${safeFilename(value)}.png`);
    showToast("Barcode downloaded");
  } catch (error) {
    showToast(error?.message || "The barcode image could not be downloaded.");
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

elements.takePhotoButton.addEventListener("click", () => {
  closeNumberPanel();
  elements.cameraInput.click();
});

elements.openNumberButton.addEventListener("click", () => {
  if (elements.numberPanel.hidden) {
    openNumberPanel();
  } else {
    closeNumberPanel();
  }
});

elements.currentNumberValue.addEventListener("click", openNumberPanel);

elements.currentNumberClearButton.addEventListener("click", (event) => {
  event.stopPropagation();
  clearEverything();
});

elements.closeNumberButton.addEventListener("click", closeNumberPanel);
elements.cancelPhotoButton.addEventListener("click", closePhotoPanel);
elements.clearButton.addEventListener("click", clearEverything);
elements.generateButton.addEventListener("click", () => {
  generateCandidates({ closePanels: true });
});

elements.cameraInput.addEventListener("change", () => {
  processPhoto(elements.cameraInput.files?.[0]);
});

document.querySelectorAll("[data-key]").forEach((button) => {
  button.addEventListener("click", () => {
    handleKeypadKey(button.dataset.key || "");
  });
});

elements.numberDisplay.addEventListener("click", (event) => {
  const target = event.target.closest(".keypad-digit");

  if (!target) {
    keypadCaret = numberText.length;
  } else {
    keypadCaret = Number(target.dataset.index) || 0;
  }

  renderNumberDisplay();
});

elements.closeFullscreenButton.addEventListener("click", () => {
  closeFullscreen();
});

elements.previousCandidateButton.addEventListener("click", () => {
  if (fullscreenIndex > 0) {
    fullscreenIndex -= 1;
    renderFullscreen();
  }
});

elements.nextCandidateButton.addEventListener("click", () => {
  if (fullscreenIndex < candidates.length - 1) {
    fullscreenIndex += 1;
    renderFullscreen();
  }
});

window.addEventListener("resize", () => {
  if (!elements.fullscreenModal.hidden && candidates.length) {
    applyFullscreenOrientation();
    renderFullscreen();
  }
});

window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    if (!elements.fullscreenModal.hidden && candidates.length) {
      applyFullscreenOrientation();
      renderFullscreen();
    }
  }, 180);
});

document.addEventListener("fullscreenchange", () => {
  if (
    openedNativeFullscreen &&
    !document.fullscreenElement &&
    !elements.fullscreenModal.hidden &&
    !isClosingFullscreen
  ) {
    closeFullscreen({ exitNative: false });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.fullscreenModal.hidden) {
    closeFullscreen();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed.", error);
    });
  });
}

renderNumberDisplay();
updateCurrentNumberStrip();
renderResults();
updateInputOpenState();
