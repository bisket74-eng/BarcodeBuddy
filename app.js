const ZXING_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.0/+esm";
const ZXING_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm";

const MAX_BARCODE_LENGTH = 22;
const EXPECTED_GROUP_LENGTHS = [4, 4, 4, 4, 4, 2];

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
let isClosingFullscreen = false;

const HISTORY_VIEW_KEY = "barcodeBuddyView";

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2400);
}

function getHistoryView() {
  return history.state?.[HISTORY_VIEW_KEY] || "";
}

function setHistoryView(view, options = {}) {
  const { replace = false } = options;
  const state = {
    ...(history.state || {}),
    [HISTORY_VIEW_KEY]: view
  };

  if (replace || getHistoryView()) {
    history.replaceState(state, "", window.location.href);
  } else {
    history.pushState(state, "", window.location.href);
  }
}

function closeHistoryView(view, closeDirectly) {
  closeDirectly();

  if (getHistoryView() === view) {
    history.back();
  }
}

function closeInputHistoryIfOpen() {
  const view = getHistoryView();

  if (view === "number" || view === "photo") {
    history.back();
  }
}

function closeAllTransientViewsDirectly() {
  elements.numberPanel.hidden = true;
  elements.photoPanel.hidden = true;
  elements.fullscreenModal.hidden = true;
  elements.fullscreenModal.classList.remove("force-landscape");
  document.body.style.overflow = "";
  updateInputOpenState();
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

function openNumberPanel(options = {}) {
  const { historyMode = "push" } = options;

  elements.photoPanel.hidden = true;
  elements.numberPanel.hidden = false;
  updateInputOpenState();
  keypadCaret = numberText.length;
  renderNumberDisplay();

  if (historyMode === "push") {
    setHistoryView("number");
  } else if (historyMode === "replace") {
    setHistoryView("number", { replace: true });
  }

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
    showToast(`Barcode numbers are limited to ${MAX_BARCODE_LENGTH} digits`);
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
  const raw = String(text || "").replace(/\u001d/g, "|");
  const exactRuns = raw.match(/\d{22}/g) || [];

  if (exactRuns.length === 1) {
    return exactRuns[0];
  }

  const separatedRuns = raw
    .split("|")
    .map((part) => part.replace(/\D/g, ""))
    .filter(Boolean);

  const exactSeparated = separatedRuns.find(
    (run) => run.length === MAX_BARCODE_LENGTH
  );

  if (exactSeparated) {
    return exactSeparated;
  }

  // Some GS1-128 results contain routing data first and the 22-digit
  // tracking number as the final section. Only use that when a GS separator
  // was actually present; never take the first 22 digits of unrelated data.
  if (raw.includes("|")) {
    const finalRun = separatedRuns.at(-1) || "";

    if (finalRun.length >= MAX_BARCODE_LENGTH) {
      return finalRun.slice(-MAX_BARCODE_LENGTH);
    }
  }

  return "";
}

function normalizeOcrCharacter(character) {
  const map = {
    O: "0", o: "0", Q: "0", D: "0",
    I: "1", l: "1", i: "1", "|": "1", "!": "1",
    Z: "2", z: "2",
    S: "5", s: "5",
    G: "6", g: "6",
    B: "8", b: "8"
  };

  if (/\d/.test(character)) {
    return character;
  }

  return map[character] || "?";
}

function normalizeOcrGroup(group) {
  return String(group || "")
    .split("")
    .filter((character) => !/[-_.]/.test(character))
    .map(normalizeOcrCharacter)
    .join("");
}

function patternFromOcrLine(line) {
  const trimmed = String(line || "").trim();

  if (!trimmed) {
    return "";
  }

  // Reject ordinary address/text lines. Only common OCR digit confusions,
  // digits, spaces, and separators are allowed.
  if (/[^0-9OoQDIil|!ZSsGgBb\s\-_.]/.test(trimmed)) {
    return "";
  }

  const groups = trimmed
    .split(/\s+/)
    .map(normalizeOcrGroup)
    .filter(Boolean);

  if (groups.length === EXPECTED_GROUP_LENGTHS.length) {
    const rebuilt = groups.map((group, index) => {
      const expected = EXPECTED_GROUP_LENGTHS[index];

      if (group.length > expected || group.length < expected - 1) {
        return "";
      }

      return group.padEnd(expected, "?");
    });

    if (rebuilt.every(Boolean)) {
      return rebuilt.join("");
    }
  }

  const compact = normalizeOcrGroup(trimmed.replace(/\s+/g, ""));

  if (compact.length === MAX_BARCODE_LENGTH) {
    return compact;
  }

  return "";
}

function extractBestOcrPattern(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const patterns = lines
    .map(patternFromOcrLine)
    .filter((pattern) => pattern.length === MAX_BARCODE_LENGTH)
    .sort((a, b) => {
      const unknownA = (a.match(/\?/g) || []).length;
      const unknownB = (b.match(/\?/g) || []).length;
      return unknownA - unknownB;
    });

  return patterns[0] || "";
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
    const [
      { BrowserMultiFormatReader },
      { BarcodeFormat, DecodeHintType }
    ] = await Promise.all([
      import(ZXING_URL),
      import(ZXING_LIBRARY_URL)
    ]);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageElement(image);

    if (result?.getBarcodeFormat?.() !== BarcodeFormat.CODE_128) {
      return "";
    }

    return result?.getText?.() || "";
  } catch (error) {
    console.warn("ZXing could not decode the Code 128 barcode.", error);
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

function makeOcrRegions(image) {
  const full = makeOcrCanvas(image);
  const regions = [full];
  const starts = [0.34, 0.48, 0.62, 0.74];
  const heights = [0.28, 0.24, 0.22, 0.20];

  starts.forEach((start, index) => {
    const y = Math.round(full.height * start);
    const height = Math.min(
      full.height - y,
      Math.round(full.height * heights[index])
    );

    if (height < 35) {
      return;
    }

    const crop = document.createElement("canvas");
    crop.width = full.width;
    crop.height = height;
    crop.getContext("2d").drawImage(
      full,
      0, y, full.width, height,
      0, 0, full.width, height
    );
    regions.push(crop);
  });

  return regions;
}

async function runOcr(image) {
  if (!window.Tesseract?.createWorker) {
    throw new Error("OCR could not load. Check the internet connection.");
  }

  const regions = makeOcrRegions(image);
  const worker = await Tesseract.createWorker("eng", 1, {
    logger(message) {
      if (message.status === "recognizing text") {
        const percent = Math.round((message.progress || 0) * 100);
        setPhotoStatus(`Reading the 22-digit number… ${percent}%`, percent);
      } else {
        setPhotoStatus("Preparing number reader…", 8);
      }
    }
  });

  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789OoQDIil|!ZSsGgBb -_.",
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "6"
    });

    let bestPattern = "";

    for (const region of regions) {
      const result = await worker.recognize(region);
      const pattern = extractBestOcrPattern(result?.data?.text || "");

      if (!pattern) {
        continue;
      }

      const currentUnknown = (bestPattern.match(/\?/g) || []).length;
      const newUnknown = (pattern.match(/\?/g) || []).length;

      if (!bestPattern || newUnknown < currentUnknown) {
        bestPattern = pattern;
      }

      if (newUnknown === 0) {
        break;
      }
    }

    return bestPattern;
  } finally {
    await worker.terminate();
  }
}

async function processPhoto(file) {
  if (!file) {
    return;
  }

  // A new photo must never reuse the previous label's number.
  setNumberText("");
  keypadCaret = 0;
  candidates = [];
  renderResults();

  const replaceExistingView = Boolean(getHistoryView());

  closeNumberPanel();
  setHistoryView("photo", { replace: replaceExistingView });
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

    const ocrPattern = await runOcr(elements.photoPreview);

    if (ocrPattern) {
      setNumberText(ocrPattern);
      closePhotoPanel();

      const unknownCount = (ocrPattern.match(/\?/g) || []).length;

      if (unknownCount <= 2) {
        generateCandidates({ closePanels: true, fromPhoto: true });
        showToast(
          unknownCount
            ? `Found the 22-digit line with ${unknownCount} unreadable digit${unknownCount === 1 ? "" : "s"}`
            : "22-digit number read from the label"
        );
      } else {
        openNumberPanel({ historyMode: "replace" });
        showToast("Some digits are unclear. Check the ? marks before creating.");
      }

      return;
    }

    closePhotoPanel();
    openNumberPanel({ historyMode: "replace" });
    showToast("The photo could not be read. Enter the number below.");
  } catch (error) {
    console.error(error);
    closePhotoPanel();
    openNumberPanel({ historyMode: "replace" });
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
      closeInputHistoryIfOpen();
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
  return window.innerHeight > window.innerWidth;
}

function applyFullscreenOrientation() {
  elements.fullscreenModal.classList.toggle(
    "force-landscape",
    shouldUseRotatedFallback()
  );
}

function openFullscreen(index, options = {}) {
  const { historyMode = "push" } = options;

  fullscreenIndex = Math.max(0, Math.min(candidates.length - 1, index));
  elements.fullscreenModal.hidden = false;
  document.body.style.overflow = "hidden";
  applyFullscreenOrientation();
  renderFullscreen();

  if (historyMode === "push") {
    setHistoryView("fullscreen");
  } else if (historyMode === "replace") {
    setHistoryView("fullscreen", { replace: true });
  }

  window.setTimeout(() => {
    applyFullscreenOrientation();
    renderFullscreen();
  }, 120);
}

function closeFullscreenDirectly() {
  if (isClosingFullscreen) {
    return;
  }

  isClosingFullscreen = true;
  elements.fullscreenModal.classList.remove("force-landscape");
  elements.fullscreenModal.hidden = true;
  document.body.style.overflow = "";
  isClosingFullscreen = false;
}

function closeFullscreen() {
  closeHistoryView("fullscreen", closeFullscreenDirectly);
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
  elements.cameraInput.click();
});

elements.openNumberButton.addEventListener("click", () => {
  if (elements.numberPanel.hidden) {
    openNumberPanel();
  } else {
    closeHistoryView("number", closeNumberPanel);
  }
});

elements.currentNumberValue.addEventListener("click", () => {
  openNumberPanel();
});

elements.currentNumberClearButton.addEventListener("click", (event) => {
  event.stopPropagation();
  clearEverything();
});

elements.closeNumberButton.addEventListener("click", () => {
  closeHistoryView("number", closeNumberPanel);
});
elements.cancelPhotoButton.addEventListener("click", () => {
  closeHistoryView("photo", closePhotoPanel);
});
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


document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!elements.fullscreenModal.hidden) {
    closeFullscreen();
  } else if (!elements.numberPanel.hidden) {
    closeHistoryView("number", closeNumberPanel);
  } else if (!elements.photoPanel.hidden) {
    closeHistoryView("photo", closePhotoPanel);
  }
});

window.addEventListener("popstate", () => {
  closeAllTransientViewsDirectly();
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
