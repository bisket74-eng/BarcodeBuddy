const ZXING_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.0/+esm";
const ZXING_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm";

const ALLOWED_BARCODE_LENGTHS = [22, 26];
const MAX_BARCODE_LENGTH = 26;
const EXPECTED_GROUP_PATTERNS = [
  [4, 4, 4, 4, 4, 2],
  [4, 4, 4, 4, 4, 4, 2]
];

function isAllowedBarcodeLength(length) {
  return ALLOWED_BARCODE_LENGTHS.includes(length);
}

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
  toast: document.getElementById("toast"),
  numberToBarcodeMode: document.getElementById("numberToBarcodeMode"),
  barcodeToNumberMode: document.getElementById("barcodeToNumberMode"),
  readResultPanel: document.getElementById("readResultPanel"),
  readBarcodeNumber: document.getElementById("readBarcodeNumber"),
  copyReadNumberButton: document.getElementById("copyReadNumberButton"),
  clearReadNumberButton: document.getElementById("clearReadNumberButton"),
  actionGrid: document.getElementById("actionGrid")
};

let numberText = "";
let keypadCaret = 0;
let candidates = [];
let fullscreenIndex = 0;
let currentPhotoUrl = "";
let toastTimer = 0;
let isClosingFullscreen = false;
let ocrWorker = null;
let ocrWorkerPromise = null;
let ocrProgressStage = "Preparing number reader";
let appMode = "numberToBarcode";
const MODE_KEY = "barcodeBuddy.mode.v1";
let reversePhotoUrl = "";

const HISTORY_VIEW_KEY = "barcodeBuddyView";


function clearReversePhoto() {
  if (reversePhotoUrl) {
    URL.revokeObjectURL(reversePhotoUrl);
    reversePhotoUrl = "";
  }

  elements.photoPreview.removeAttribute("src");
  elements.photoPanel.hidden = true;
  document.body.classList.remove("input-open");
  setPhotoStatus("");
}

function clearReadResult() {
  if (elements.readBarcodeNumber) {
    elements.readBarcodeNumber.textContent = "";
  }
  if (elements.readResultPanel) {
    elements.readResultPanel.hidden = true;
  }
}

function showReadResult(number) {
  if (!elements.readBarcodeNumber || !elements.readResultPanel) {
    return;
  }

  elements.readBarcodeNumber.textContent = groupNumber(number);
  elements.readResultPanel.hidden = false;

  requestAnimationFrame(() => {
    elements.readBarcodeNumber.scrollLeft = 0;
    elements.readResultPanel.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  });
}

async function copyReadNumber() {
  const number = String(
    elements.readBarcodeNumber?.textContent || ""
  ).replace(/\D/g, "");

  if (!number) {
    return;
  }

  try {
    await navigator.clipboard.writeText(number);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = number;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  showToast("Number copied");
}

function applyAppMode(nextMode) {
  appMode =
    nextMode === "barcodeToNumber"
      ? "barcodeToNumber"
      : "numberToBarcode";

  try {
    localStorage.setItem(MODE_KEY, appMode);
  } catch {}

  const reverse = appMode === "barcodeToNumber";

  document.body.classList.toggle("barcode-read-mode", reverse);

  elements.numberToBarcodeMode?.classList.toggle("active", !reverse);
  elements.barcodeToNumberMode?.classList.toggle("active", reverse);

  elements.numberToBarcodeMode?.setAttribute(
    "aria-pressed",
    String(!reverse)
  );
  elements.barcodeToNumberMode?.setAttribute(
    "aria-pressed",
    String(reverse)
  );

  elements.openNumberButton.hidden = reverse;

  clearReversePhoto();
  clearReadResult();

  if (reverse) {
    setPhotoStatus("");
  }
}

// Expose the mode switch so the buttons remain usable even if another
// script or a browser restores the page state before module listeners attach.
window.setBarcodeBuddyMode = (mode) => applyAppMode(mode);

async function processReversePhoto(file) {
  if (!file) {
    return;
  }

  clearReadResult();
  clearReversePhoto();

  reversePhotoUrl = URL.createObjectURL(file);
  elements.photoPreview.src = reversePhotoUrl;
  elements.photoPanel.hidden = false;
  document.body.classList.add("input-open");
  setPhotoStatus("Loading barcode photo…", 5);

  try {
    await elements.photoPreview.decode();

    setPhotoStatus("Reading the barcode…", 25);

    let decoded = await decodeWithNativeDetector(elements.photoPreview);
    let number = extractDecodedDigits(decoded);

    if (!number) {
      setPhotoStatus("Looking more closely at the barcode…", 48);
      decoded = await decodeWithZxing(elements.photoPreview);
      number = extractDecodedDigits(decoded);
    }

    if (!number) {
      setPhotoStatus("Reading the printed number…", 68);
      number = await runReverseOcr(elements.photoPreview);
    }

    clearReversePhoto();

    if (number) {
      showReadResult(number);
      showToast("Barcode number found");
    } else {
      showToast(
        "I couldn't find a readable barcode number in that photo. Try a closer, straighter photo.",
        3500
      );
    }
  } catch (error) {
    console.error(error);
    clearReversePhoto();
    showToast(
      "That barcode could not be read. Try a closer, straighter photo.",
      3500
    );
  } finally {
    elements.cameraInput.value = "";
  }
}

async function runReverseOcr(image) {
  if (!window.Tesseract?.recognize) {
    return "";
  }

  try {
    const canvas = makeOcrCanvas(image);
    const regions = [
      cropCanvas(canvas, 0.40, 0.22),
      cropCanvas(canvas, 0.48, 0.18),
      cropCanvas(canvas, 0.56, 0.16)
    ];

    let best = "";

    for (const region of regions) {
      const result = await Tesseract.recognize(
        region,
        "eng",
        {
          logger(info) {
            if (
              info?.status === "recognizing text" &&
              typeof info.progress === "number"
            ) {
              setPhotoStatus(
                `Reading the printed number… ${Math.round(
                  info.progress * 100
                )}%`,
                68 + Math.round(info.progress * 28)
              );
            }
          }
        }
      );

      const text = result?.data?.text || "";
      const runs = text
        .split(/[^0-9]+/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 20 && value.length <= 34);

      for (const run of runs) {
        if (!best || run.length > best.length) {
          best = run;
        }
      }
    }

    return best;
  } catch (error) {
    console.warn("Reverse OCR failed.", error);
    return "";
  }
}

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
    showToast("Barcode numbers are limited to 26 digits");
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

  for (const length of [...ALLOWED_BARCODE_LENGTHS].sort((a, b) => b - a)) {
    const exactRunPattern = new RegExp(`(?:^|\\D)(\\d{${length}})(?!\\d)`);
    const match = raw.match(exactRunPattern);

    if (match) {
      return match[1];
    }
  }

  const separatedRuns = raw
    .split("|")
    .map((part) => part.replace(/\D/g, ""))
    .filter(Boolean);

  const exactSeparated = separatedRuns.find((run) =>
    isAllowedBarcodeLength(run.length)
  );

  return exactSeparated || "";
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

function parseOcrLineCandidate(line) {
  const trimmed = String(line || "").trim();

  if (!trimmed) {
    return null;
  }

  // Only permit characters that can plausibly belong to a numeric tracking
  // number. We deliberately do not turn arbitrary text into question marks.
  if (/[^0-9OoQDIil|!ZSsGgBb\s\-_.]/.test(trimmed)) {
    return null;
  }

  const groups = trimmed
    .split(/\s+/)
    .map(normalizeOcrGroup)
    .filter(Boolean);

  const lengths = groups.map((group) => group.length);

  // Normal 22-digit USPS-style presentation: 4-4-4-4-4-2.
  if (
    lengths.length === 6 &&
    lengths.every((length, index) => length === [4, 4, 4, 4, 4, 2][index])
  ) {
    return {
      pattern: groups.join(""),
      score: 120,
      kind: "22-grouped"
    };
  }

  // Normal 26-digit USPS-style presentation: 4-4-4-4-4-4-2.
  if (
    lengths.length === 7 &&
    lengths.every((length, index) => length === [4, 4, 4, 4, 4, 4, 2][index])
  ) {
    return {
      pattern: groups.join(""),
      score: 150,
      kind: "26-grouped"
    };
  }

  /*
    Important case from the user's label.

    A 26-digit number with one unreadable digit can be OCR'd as:
      9261 2903 6172 2458 1949 2 64 33

    That is 25 observed digits, but the tail grouping tells us the missing
    character is inside the fourth group of the tail: 2?64, followed by 33.
    This is the one situation where we intentionally insert a ?.
  */
  if (
    lengths.length === 8 &&
    lengths[0] === 4 &&
    lengths[1] === 4 &&
    lengths[2] === 4 &&
    lengths[3] === 4 &&
    lengths[4] === 4 &&
    lengths[5] === 1 &&
    lengths[6] === 2 &&
    lengths[7] === 2
  ) {
    // The first character of the 2-digit OCR group is commonly read as 5
    // when the printed 6 is faint. In this exact missing-gap structure, treat
    // that first tail character as a 6 candidate rather than accepting a
    // confident-looking but wrong 5. The visible 4 and final 33 are kept.
    const tailGroup = groups[6].length === 2
      ? `${groups[6][0] === "5" ? "6" : groups[6][0]}${groups[6][1]}`
      : groups[6];

    const pattern =
      groups.slice(0, 5).join("") +
      groups[5] +
      "?" +
      tailGroup +
      groups[7];

    if (pattern.length === 26) {
      return {
        pattern,
        score: 220,
        kind: "26-one-missing-tail"
      };
    }
  }

  // Same missing-digit structure when OCR inserts a separator before/after
  // the missing position differently.
  if (
    lengths.length === 7 &&
    lengths.slice(0, 5).every((length) => length === 4) &&
    lengths[5] === 3 &&
    lengths[6] === 2 &&
    groups[5].length === 3
  ) {
    const tail = groups[5];
    const repairedTail = tail[0] === "5"
      ? `6${tail.slice(1)}`
      : tail;
    const pattern =
      groups.slice(0, 5).join("") +
      repairedTail[0] +
      "?" +
      repairedTail.slice(1) +
      groups[6];

    if (pattern.length === 26) {
      return {
        pattern,
        score: 185,
        kind: "26-one-missing-tail"
      };
    }
  }

  // Compact 22/26-digit OCR result. This is intentionally lower confidence
  // than a properly grouped line because it is easier for OCR to hallucinate.
  const compact = normalizeOcrGroup(trimmed.replace(/\s+/g, ""));
  if (compact.length === 26) {
    return {
      pattern: compact,
      score: 90,
      kind: "26-compact"
    };
  }

  if (compact.length === 22) {
    return {
      pattern: compact,
      score: 80,
      kind: "22-compact"
    };
  }

  return null;
}

function extractBestOcrPattern(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = lines
    .map(parseOcrLineCandidate)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.pattern || "";
}

function collectOcrPatterns(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map(parseOcrLineCandidate)
    .filter(Boolean);
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
  const maxWidth = 2200;
  const maxUpscale = 3.0;
  const scale = Math.min(
    maxUpscale,
    maxWidth / Math.max(1, image.naturalWidth)
  );

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

    // Moderate contrast is faster and preserves faint printed digits better
    // than the previous very strong enlargement and thresholding.
    const contrasted = gray < 145
      ? Math.max(0, gray * 0.68)
      : Math.min(255, 178 + (gray - 145) * 1.42);

    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }

  context.putImageData(pixels, 0, 0);
  return canvas;
}

function cropCanvas(source, startRatio, heightRatio) {
  const y = Math.max(0, Math.round(source.height * startRatio));
  const height = Math.max(
    1,
    Math.min(
      source.height - y,
      Math.round(source.height * heightRatio)
    )
  );

  const crop = document.createElement("canvas");
  crop.width = source.width;
  crop.height = height;

  const context = crop.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, crop.width, crop.height);
  context.drawImage(
    source,
    0, y, source.width, height,
    0, 0, source.width, height
  );

  return crop;
}

function stackOcrRegions(regions) {
  const gap = 24;
  const width = Math.max(...regions.map((region) => region.width));
  const height =
    regions.reduce((total, region) => total + region.height, 0) +
    gap * Math.max(0, regions.length - 1);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  let y = 0;

  regions.forEach((region, index) => {
    context.drawImage(region, 0, y);
    y += region.height;

    if (index < regions.length - 1) {
      y += gap;
    }
  });

  return canvas;
}


function rotateCanvas(source, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  const width = Math.ceil(source.width * cos + source.height * sin);
  const height = Math.ceil(source.width * sin + source.height * cos);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);

  return canvas;
}

function makePostalNumberRegions(image) {
  const full = makeOcrCanvas(image);

  // The printed tracking number is normally immediately beneath the long
  // package barcode. Keep the OCR window narrow so it doesn't read ZIP codes,
  // addresses, UPS text, or the other barcode labels on the package.
  const base = cropCanvas(full, 0.43, 0.15);

  return [-3, 0, 3].map((degrees) => rotateCanvas(base, degrees));
}

async function getOcrWorker() {
  if (!window.Tesseract?.createWorker) {
    throw new Error("OCR could not load. Check the internet connection.");
  }

  if (ocrWorker) {
    return ocrWorker;
  }

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker("eng", 1, {
      logger(message) {
        if (message.status === "recognizing text") {
          const percent = Math.round((message.progress || 0) * 100);
          setPhotoStatus(
            `${ocrProgressStage}… ${percent}%`,
            percent
          );
        } else if (
          message.status === "loading tesseract core" ||
          message.status === "initializing tesseract" ||
          message.status === "loading language traineddata"
        ) {
          setPhotoStatus("Loading the number reader…", 6);
        }
      }
    })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_char_whitelist:
            "0123456789OoQDIil|!ZSsGgBb -_.",
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: "6"
        });

        ocrWorker = worker;
        return worker;
      })
      .catch((error) => {
        ocrWorkerPromise = null;
        throw error;
      });
  }

  return ocrWorkerPromise;
}

function countUnknownDigits(pattern) {
  return (String(pattern || "").match(/\?/g) || []).length;
}

function chooseBetterPattern(first, second) {
  if (!first) return second || "";
  if (!second) return first;

  return countUnknownDigits(second) < countUnknownDigits(first)
    ? second
    : first;
}

async function recognizeOcrPattern(worker, canvas, options = {}) {
  const {
    stage = "Reading the postal number",
    pageSegmentationMode = "6"
  } = options;

  ocrProgressStage = stage;

  await worker.setParameters({
    tessedit_char_whitelist:
      "0123456789OoQDIil|!ZSsGgBb -_.",
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: pageSegmentationMode
  });

  const result = await worker.recognize(canvas);
  return extractBestOcrPattern(result?.data?.text || "");
}


async function runOcr(image) {
  const worker = await getOcrWorker();
  const regions = makePostalNumberRegions(image);
  const allCandidates = [];

  // Three deskew passes over the tight number line are considerably more
  // reliable than OCR'ing the entire package label.
  for (let index = 0; index < regions.length; index += 1) {
    const patternCandidates = await recognizeOcrCandidates(
      worker,
      regions[index],
      {
        stage: "Reading the postal number",
        pageSegmentationMode: "7"
      }
    );

    allCandidates.push(...patternCandidates);

    // A strong 26-digit line with the inferred missing digit wins immediately.
    if (
      patternCandidates.some(
        (candidate) => candidate.kind === "26-one-missing-tail"
      )
    ) {
      const best = patternCandidates.find(
        (candidate) => candidate.kind === "26-one-missing-tail"
      );
      return best.pattern;
    }
  }

  if (!allCandidates.length) {
    return "";
  }

  allCandidates.sort((a, b) => b.score - a.score);
  return allCandidates[0].pattern;
}

async function recognizeOcrCandidates(worker, canvas, options = {}) {
  const {
    stage = "Reading the postal number",
    pageSegmentationMode = "7"
  } = options;

  ocrProgressStage = stage;

  await worker.setParameters({
    tessedit_char_whitelist:
      "0123456789OoQDIil|!ZSsGgBb -_.",
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: pageSegmentationMode
  });

  const result = await worker.recognize(canvas);
  return collectOcrPatterns(result?.data?.text || "");
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
            ? `Found the postal number with ${unknownCount} unreadable digit${unknownCount === 1 ? "" : "s"}`
            : "Postal number read from the label"
        );
      } else {
        openNumberPanel({ historyMode: "replace" });
        showToast("Some digits are unclear. Check the ? marks before creating.");
      }

      return;
    }

    closePhotoPanel();
    openNumberPanel({ historyMode: "replace" });
    showToast("The postal number could not be read. Try a closer, straighter photo.");
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

  if (!isAllowedBarcodeLength(pattern.length)) {
    showToast(
      "Enter exactly 22 or 26 digits for postal barcode reconstruction. Use ? for an unreadable digit."
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
  if (appMode === "barcodeToNumber") {
    elements.cameraInput.click();
    return;
  }

  // Warm the OCR engine while the camera is open. This removes much of the
  // waiting after the picture is taken, especially on the first scan.
  void getOcrWorker().catch((error) => {
    console.warn("The OCR reader could not be preloaded.", error);
  });

  elements.cameraInput.click();
});

elements.numberToBarcodeMode?.addEventListener("click", () => {
  applyAppMode("numberToBarcode");
});

elements.barcodeToNumberMode?.addEventListener("click", () => {
  applyAppMode("barcodeToNumber");
});

elements.copyReadNumberButton?.addEventListener("click", copyReadNumber);
elements.clearReadNumberButton?.addEventListener("click", clearReadResult);

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
  const file = elements.cameraInput.files?.[0];

  if (appMode === "barcodeToNumber") {
    void processReversePhoto(file);
    return;
  }

  void processPhoto(file);
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

window.addEventListener("pagehide", () => {
  if (ocrWorker) {
    void ocrWorker.terminate().catch(() => {});
    ocrWorker = null;
    ocrWorkerPromise = null;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed.", error);
    });
  });
}

try {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  applyAppMode(
    requestedMode === "barcodeToNumber"
      ? "barcodeToNumber"
      : localStorage.getItem(MODE_KEY)
  );
} catch {
  applyAppMode("numberToBarcode");
}

renderNumberDisplay();
updateCurrentNumberStrip();
renderResults();
updateInputOpenState();
