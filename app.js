const ZXING_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.0/+esm";
const ZXING_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm";

const ALLOWED_BARCODE_LENGTHS = [22, 26];
const MAX_BARCODE_LENGTH = 26;
const MAX_UNKNOWN_DIGITS = 2;

/*
  USPS numbers are printed in one of these two groupings. The reader uses the
  grouping to work out where a digit went missing, instead of throwing away the
  tail and settling for a shorter number.
*/
const NUMBER_TEMPLATES = [
  { total: 26, slots: [4, 4, 4, 4, 4, 4, 2] },
  { total: 22, slots: [4, 4, 4, 4, 4, 2] }
];

/*
  Code 128-C packs two digits per symbol. A 22 digit number is
  start + 11 data + check = 13 symbols, plus a 4 bar stop = 43 bars.
  A 26 digit number is 15 symbols plus the stop = 49 bars.
  Counting bars therefore tells us how long the number is even when the
  printed digits underneath are damaged.
*/
const BAR_COUNTS = [
  { total: 22, bars: 43 },
  { total: 26, bars: 49 }
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
  currentNumberCopyButton: document.getElementById("currentNumberCopyButton"),
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

const HISTORY_VIEW_KEY = "barcodeBuddyView";

/* ---------------------------------------------------------------- toast */

function showToast(message, duration = 2400) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, duration);
}

/* -------------------------------------------------------------- history */

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

/* --------------------------------------------------------- number entry */

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

function countUnknownDigits(pattern) {
  return (String(pattern || "").match(/\?/g) || []).length;
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

/*
  The caret is an empty span, so it carries its own inline styling. Inline
  styles outrank anything in styles.css, which is the only way to guarantee it
  is actually visible.
*/
function makeCaret() {
  const caret = document.createElement("span");
  caret.className = "keypad-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.style.cssText = [
    "display:inline-block",
    "position:static",
    "width:3px",
    "min-width:3px",
    "height:1.15em",
    "margin:0 2px",
    "padding:0",
    "border:0",
    "border-radius:2px",
    "vertical-align:-0.18em",
    "background:#d32f2f",
    "opacity:1",
    "visibility:visible"
  ].join(";");

  return caret;
}

function renderNumberDisplay() {
  elements.numberDisplay.innerHTML = "";

  if (!numberText) {
    elements.numberDisplay.classList.add("empty");
    elements.numberDisplay.appendChild(makeCaret());

    const placeholder = document.createElement("span");
    placeholder.textContent = " Enter numbers below";
    elements.numberDisplay.appendChild(placeholder);
    return;
  }

  elements.numberDisplay.classList.remove("empty");

  for (let index = 0; index <= numberText.length; index += 1) {
    if (index === keypadCaret) {
      elements.numberDisplay.appendChild(makeCaret());
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

async function copyCurrentNumber() {
  if (!numberText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(numberText);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = numberText;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  showToast("Number copied");
}

/* --------------------------------------------------------- photo panel */

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

/* ------------------------------------------------------- canvas toolkit */

function sourceSize(source) {
  return {
    width: source.naturalWidth || source.width || 1,
    height: source.naturalHeight || source.height || 1
  };
}

function drawScaled(source, targetWidth) {
  const { width, height } = sourceSize(source);
  const scale = targetWidth / Math.max(1, width);
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas;
}

function toGrayscale(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray =
      data[index] * 0.299 +
      data[index + 1] * 0.587 +
      data[index + 2] * 0.114;

    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function cropRegion(source, box, targetWidth) {
  const { width, height } = sourceSize(source);
  const left = Math.max(0, Math.round(box.left * width));
  const top = Math.max(0, Math.round(box.top * height));
  const cropWidth = Math.max(
    1,
    Math.min(width - left, Math.round((box.right - box.left) * width))
  );
  const cropHeight = Math.max(
    1,
    Math.min(height - top, Math.round((box.bottom - box.top) * height))
  );

  const scale = Math.min(4, Math.max(0.2, targetWidth / cropWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source,
    left, top, cropWidth, cropHeight,
    0, 0, canvas.width, canvas.height
  );

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

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);

  return canvas;
}

function rotateFixed(source, degrees) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);

  return canvas;
}

function measureGray(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  const histogram = new Uint32Array(256);

  for (let index = 0; index < data.length; index += 4) {
    histogram[data[index]] += 1;
  }

  const target = width * height * 0.06;
  let seen = 0;
  let bright = 255;

  for (let value = 255; value >= 0; value -= 1) {
    seen += histogram[value];

    if (seen >= target) {
      bright = value;
      break;
    }
  }

  bright = Math.max(70, bright);

  return {
    data,
    width,
    height,
    paperLevel: bright * 0.78,
    inkLevel: bright * 0.55
  };
}

function meanBrightness(gray) {
  const context = gray.getContext("2d", { willReadFrequently: true });
  const data = context.getImageData(0, 0, gray.width, gray.height).data;
  let sum = 0;

  for (let index = 0; index < data.length; index += 4) {
    sum += data[index];
  }

  return sum / (data.length / 4);
}

function invertCanvas(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255 - data[index];
    data[index + 1] = 255 - data[index + 1];
    data[index + 2] = 255 - data[index + 2];
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function longestRun(values, threshold, gapAllowance) {
  let best = null;
  let start = -1;
  let gap = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= threshold) {
      if (start < 0) {
        start = index;
      }

      gap = 0;

      if (!best || index - start > best.end - best.start) {
        best = { start, end: index };
      }
    } else if (start >= 0) {
      gap += 1;

      if (gap > gapAllowance) {
        start = -1;
        gap = 0;
      }
    }
  }

  return best;
}

function findPaperBox(gray) {
  const { data, width, height, paperLevel } = measureGray(gray);
  const rows = new Float32Array(height);
  const columns = new Float32Array(width);

  for (let y = 0; y < height; y += 1) {
    const base = y * width * 4;
    let count = 0;

    for (let x = 0; x < width; x += 1) {
      if (data[base + x * 4] > paperLevel) {
        count += 1;
        columns[x] += 1;
      }
    }

    rows[y] = count / width;
  }

  for (let x = 0; x < width; x += 1) {
    columns[x] /= height;
  }

  const rowRun = longestRun(rows, 0.12, Math.round(height * 0.03));
  const columnRun = longestRun(columns, 0.08, Math.round(width * 0.04));
  const fallback = { left: 0, top: 0, right: 1, bottom: 1 };

  if (!rowRun || !columnRun) {
    return fallback;
  }

  const box = {
    left: Math.max(0, columnRun.start / width - 0.012),
    right: Math.min(1, (columnRun.end + 1) / width + 0.012),
    top: Math.max(0, rowRun.start / height - 0.012),
    bottom: Math.min(1, (rowRun.end + 1) / height + 0.012)
  };

  const area = (box.right - box.left) * (box.bottom - box.top);
  return area < 0.12 ? fallback : box;
}

function inkProfileVariance(canvas, inkLevel) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  const profile = new Float32Array(height);
  let mean = 0;

  for (let y = 0; y < height; y += 1) {
    const base = y * width * 4;
    let dark = 0;

    for (let x = 0; x < width; x += 1) {
      if (data[base + x * 4] < inkLevel) {
        dark += 1;
      }
    }

    profile[y] = dark / width;
    mean += profile[y];
  }

  mean /= height;

  let variance = 0;

  for (let y = 0; y < height; y += 1) {
    const difference = profile[y] - mean;
    variance += difference * difference;
  }

  return variance / height;
}

function estimateSkewAngle(gray) {
  const { inkLevel } = measureGray(gray);
  const scoreFor = (angle) =>
    inkProfileVariance(angle === 0 ? gray : rotateFixed(gray, angle), inkLevel);

  let bestAngle = 0;
  let bestScore = -1;

  for (let angle = -12; angle <= 12; angle += 2) {
    const score = scoreFor(angle);

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  const coarse = bestAngle;

  for (const angle of [coarse - 1, coarse + 1]) {
    const score = scoreFor(angle);

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

function findLineBands(gray) {
  const { data, width, height, inkLevel } = measureGray(gray);
  const profile = new Float32Array(height);

  for (let y = 0; y < height; y += 1) {
    const base = y * width * 4;
    let dark = 0;

    for (let x = 0; x < width; x += 1) {
      if (data[base + x * 4] < inkLevel) {
        dark += 1;
      }
    }

    profile[y] = dark / width;
  }

  const runs = [];

  for (let y = 0; y < height; y += 1) {
    const ink = profile[y];
    const kind = ink >= 0.26 ? "heavy" : ink >= 0.012 ? "text" : "blank";
    const last = runs[runs.length - 1];

    if (last && last.kind === kind) {
      last.bottom = y;
    } else {
      runs.push({ kind, top: y, bottom: y });
    }
  }

  const bands = [];

  const addBand = (run, priority, weight, barcode) => {
    const textHeight = run.bottom - run.top + 1;

    if (textHeight < height * 0.004 || textHeight > height * 0.1) {
      return;
    }

    const pad = Math.max(3, textHeight * 0.7);

    bands.push({
      top: Math.max(0, run.top - pad) / height,
      bottom: Math.min(height, run.bottom + pad) / height,
      barcode: barcode
        ? {
            left: 0,
            right: 1,
            top: barcode.top / height,
            bottom: (barcode.bottom + 1) / height
          }
        : null,
      priority,
      weight
    });
  };

  // First choice: a text line printed directly under a barcode.
  runs.forEach((run, index) => {
    if (run.kind !== "heavy") {
      return;
    }

    const runHeight = run.bottom - run.top + 1;

    if (runHeight < height * 0.006) {
      return;
    }

    for (let next = index + 1; next < runs.length && next <= index + 3; next += 1) {
      const following = runs[next];

      if (following.kind === "blank") {
        if (following.bottom - following.top > height * 0.05) {
          break;
        }
        continue;
      }

      if (following.kind !== "text") {
        break;
      }

      addBand(following, 0, runHeight, run);
      break;
    }
  });

  // Second choice: any text line at all, for a number on a screen or a slip.
  runs.forEach((run) => {
    if (run.kind !== "text") {
      return;
    }

    let ink = 0;

    for (let y = run.top; y <= run.bottom; y += 1) {
      ink += profile[y];
    }

    addBand(run, 1, ink * 100, null);
  });

  bands.sort(
    (first, second) =>
      first.priority - second.priority || second.weight - first.weight
  );

  const chosen = [];

  for (const band of bands) {
    const overlaps = chosen.some(
      (existing) =>
        band.top < existing.bottom - 0.004 &&
        band.bottom > existing.top + 0.004
    );

    if (!overlaps) {
      chosen.push(band);
    }

    if (chosen.length >= 5) {
      break;
    }
  }

  return chosen.map((band) => ({
    box: { left: 0, right: 1, top: band.top, bottom: band.bottom },
    barcodeBox: band.barcode,
    anchored: band.priority === 0
  }));
}

/* ------------------------------------------------- barcode bar counting */

function countBarsOnRow(data, width, y) {
  let darkest = 255;
  let lightest = 0;

  for (let x = 0; x < width; x += 1) {
    const value = data[(y * width + x) * 4];

    if (value < darkest) darkest = value;
    if (value > lightest) lightest = value;
  }

  if (lightest - darkest < 45) {
    return 0;
  }

  const threshold = (darkest + lightest) / 2;
  const runs = [];
  let current = null;

  for (let x = 0; x < width; x += 1) {
    const dark = data[(y * width + x) * 4] < threshold;

    if (current && current.dark === dark) {
      current.length += 1;
    } else {
      current = { dark, length: 1 };
      runs.push(current);
    }
  }

  const barWidths = runs
    .filter((run) => run.dark)
    .map((run) => run.length)
    .sort((first, second) => first - second);

  if (barWidths.length < 20) {
    return 0;
  }

  // A narrow module is the thin end of the bar widths. Anything wider than a
  // handful of modules is a gap between separate barcodes, not part of one.
  const unit = Math.max(1, barWidths[Math.floor(barWidths.length * 0.2)]);
  const segments = [];
  let segment = 0;

  for (const run of runs) {
    if (run.dark) {
      segment += 1;
    } else if (run.length > unit * 7) {
      segments.push(segment);
      segment = 0;
    }
  }

  segments.push(segment);

  return Math.max(...segments);
}

function guessLengthFromBarcode(block) {
  toGrayscale(block);

  const context = block.getContext("2d", { willReadFrequently: true });
  const { width, height } = block;
  const data = context.getImageData(0, 0, width, height).data;
  const counts = [];

  for (const ratio of [0.28, 0.42, 0.56, 0.7]) {
    const y = Math.min(height - 1, Math.max(0, Math.round(height * ratio)));
    const count = countBarsOnRow(data, width, y);

    if (count >= 25) {
      counts.push(count);
    }
  }

  if (counts.length < 2) {
    return null;
  }

  counts.sort((first, second) => first - second);

  const median = counts[Math.floor(counts.length / 2)];

  for (const option of BAR_COUNTS) {
    if (Math.abs(median - option.bars) <= 2) {
      return option.total;
    }
  }

  return null;
}

/* ------------------------------------------------------- image cleaning */

function adaptiveThreshold(canvas, radius, offset) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;

    for (let x = 0; x < width; x += 1) {
      rowSum += data[(y * width + x) * 4];
      integral[(y + 1) * stride + (x + 1)] =
        integral[y * stride + (x + 1)] + rowSum;
    }
  }

  const window = Math.max(6, Math.round(radius));

  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - window);
    const bottom = Math.min(height - 1, y + window);

    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - window);
      const right = Math.min(width - 1, x + window);
      const area = (right - left + 1) * (bottom - top + 1);
      const sum =
        integral[(bottom + 1) * stride + (right + 1)] -
        integral[top * stride + (right + 1)] -
        integral[(bottom + 1) * stride + left] +
        integral[top * stride + left];

      const index = (y * width + x) * 4;
      const value = data[index] < sum / area - offset ? 0 : 255;

      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function prepareBandForOcr(band) {
  toGrayscale(band);

  if (meanBrightness(band) < 118) {
    invertCanvas(band);
  }

  const targetHeight = 130;
  const scale = Math.min(3.5, Math.max(1, targetHeight / band.height));
  const drawWidth = Math.min(3200, Math.round(band.width * scale));
  const drawHeight = Math.max(
    12,
    Math.round(band.height * (drawWidth / band.width))
  );

  const canvas = document.createElement("canvas");
  canvas.width = drawWidth + 56;
  canvas.height = drawHeight + 56;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(band, 28, 28, drawWidth, drawHeight);

  toGrayscale(canvas);
  adaptiveThreshold(canvas, Math.round(drawHeight * 0.55), 10);

  return canvas;
}

function buildOcrRegions(image) {
  const preview = toGrayscale(drawScaled(image, 480));
  const paperBox = findPaperBox(preview);
  const paper = cropRegion(image, paperBox, 2000);

  const skewGuide = toGrayscale(drawScaled(paper, 420));
  const angle = estimateSkewAngle(skewGuide);
  const straight = angle === 0 ? paper : rotateCanvas(paper, angle);

  const bandGuide = toGrayscale(drawScaled(straight, 480));

  if (meanBrightness(bandGuide) < 118) {
    invertCanvas(toGrayscale(straight));
    invertCanvas(bandGuide);
  }

  const found = findLineBands(bandGuide);
  const anchored = found.some((band) => band.anchored);

  if (!found.length) {
    found.push({
      box: { left: 0, right: 1, top: 0.30, bottom: 0.55 },
      barcodeBox: null,
      anchored: false
    });
    found.push({
      box: { left: 0, right: 1, top: 0.50, bottom: 0.75 },
      barcodeBox: null,
      anchored: false
    });
  }

  return {
    straight,
    anchored,
    regions: found.slice(0, 5).map((band) => ({
      canvas: cropRegion(straight, band.box, 2000),
      lengthHint: band.barcodeBox
        ? guessLengthFromBarcode(cropRegion(straight, band.barcodeBox, 1800))
        : null
    }))
  };
}

/* ----------------------------------------------- number pattern fitting */

function compositions(total, slots) {
  const results = [];
  const current = new Array(slots).fill(0);

  function build(index, remaining) {
    if (index === slots - 1) {
      current[index] = remaining;
      results.push(current.slice());
      return;
    }

    for (let take = 0; take <= remaining; take += 1) {
      current[index] = take;
      build(index + 1, remaining - take);
    }

    current[index] = 0;
  }

  build(0, total);
  return results;
}

function fitTemplates(groups, lengthHint) {
  const digits = groups.join("");

  if (!digits || !/^[0-9]+$/.test(digits)) {
    return null;
  }

  let best = null;

  for (const template of NUMBER_TEMPLATES) {
    if (lengthHint && template.total !== lengthHint) {
      continue;
    }

    const missing = template.total - digits.length;

    if (missing < 0 || missing > MAX_UNKNOWN_DIGITS) {
      continue;
    }

    const bounds = new Set([0]);
    let cursor = 0;

    for (const slot of template.slots) {
      cursor += slot;
      bounds.add(cursor);
    }

    for (const combo of compositions(missing, groups.length + 1)) {
      let pattern = "";
      let position = 0;
      let score = 0;

      for (let index = 0; index < groups.length; index += 1) {
        if (combo[index]) {
          pattern += "?".repeat(combo[index]);
          position += combo[index];
        }

        const start = position;
        pattern += groups[index];
        position += groups[index].length;

        if (bounds.has(start)) {
          score += 2;
        }

        if (bounds.has(position)) {
          score += 2;
        }
      }

      if (combo[groups.length]) {
        pattern += "?".repeat(combo[groups.length]);
      }

      /*
        A ? sitting at the very end usually means the reader ran out of digits
        rather than that the last digit was smudged, so a fit that parks its
        unknowns on the tail is treated as weaker evidence.
      */
      const trailingUnknowns = (pattern.match(/\?+$/) || [""])[0].length;

      const rank =
        score * 10 -
        missing * 4 -
        trailingUnknowns * 25 +
        (template.total === 26 ? 2 : 0);

      if (!best || rank > best.rank) {
        best = { pattern, rank, score, missing, length: template.total };
      }
    }
  }

  return best;
}

function assembleFromGroups(groups, lengthHint) {
  if (!groups.length) {
    return null;
  }

  let best = null;
  const maxTrim = 2;

  for (let start = 0; start <= Math.min(maxTrim, groups.length - 1); start += 1) {
    const lowestEnd = Math.max(start + 1, groups.length - maxTrim);

    for (let end = groups.length; end >= lowestEnd; end -= 1) {
      const result = fitTemplates(groups.slice(start, end), lengthHint);

      if (!result) {
        continue;
      }

      const trimmed = start + (groups.length - end);
      const rank = result.rank - trimmed * 8;

      if (!best || rank > best.rank) {
        best = { ...result, rank };
      }
    }
  }

  return best;
}

function digitGroups(line) {
  return String(line || "")
    .replace(/[OoQD]/g, "0")
    .replace(/[IiLl|!]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss]/g, "5")
    .replace(/[Gg]/g, "6")
    .replace(/[Bb]/g, "8")
    .replace(/[^0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/*
  A band holds one physical line of print. If the reader breaks it into several
  output lines because a crease interrupted it, the tokens still belong in
  reading order, so the joined reading is offered as a candidate too. This is
  what recovers the digits after a damaged spot instead of stopping there.
*/
function bestCandidateFromLines(lines, lengthHint) {
  const readings = [...lines, lines.join(" ")];
  let best = null;

  for (const reading of readings) {
    const candidate = assembleFromGroups(digitGroups(reading), lengthHint);

    if (candidate && (!best || candidate.rank > best.rank)) {
      best = candidate;
    }
  }

  return best;
}

function applyPostalCorrections(pattern) {
  if (!isAllowedBarcodeLength(pattern.length)) {
    return pattern;
  }

  // 0, 6 and 8 are the shapes read in place of the leading 9 that starts every
  // USPS package barcode number.
  if (/[068]/.test(pattern[0])) {
    return `9${pattern.slice(1)}`;
  }

  return pattern;
}

/* -------------------------------------------------------------- reading */

async function getOcrWorker() {
  if (!window.Tesseract?.createWorker) {
    throw new Error("The number reader could not load. Check the connection.");
  }

  if (ocrWorker) {
    return ocrWorker;
  }

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker("eng", 1, {
      logger(message) {
        if (
          message.status === "loading tesseract core" ||
          message.status === "initializing tesseract" ||
          message.status === "loading language traineddata"
        ) {
          setPhotoStatus("Loading the number reader…", 6);
        }
      }
    })
      .then((worker) => {
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

async function ocrLines(worker, canvas, pageSegmentationMode) {
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789 ",
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: pageSegmentationMode
  });

  const result = await worker.recognize(canvas);

  return String(result?.data?.text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function readBand(worker, region) {
  const prepared = prepareBandForOcr(region.canvas);
  const hint = region.lengthHint;

  let best = bestCandidateFromLines(await ocrLines(worker, prepared, "7"), hint);

  // Sparse mode picks up digit clusters that single-line mode abandons after a
  // crease or a smudge.
  if (!best || best.missing > 0) {
    const sparse = bestCandidateFromLines(
      await ocrLines(worker, prepared, "11"),
      hint
    );

    if (sparse && (!best || sparse.rank > best.rank)) {
      best = sparse;
    }
  }

  // If the bar count hint left nothing readable, fall back to an open fit
  // rather than returning nothing at all.
  if (!best && hint) {
    best = bestCandidateFromLines(await ocrLines(worker, prepared, "7"), null);
  }

  return best;
}

async function runOcr(image, options = {}) {
  const { startProgress = 20, endProgress = 92 } = options;
  const worker = await getOcrWorker();
  const { straight, regions, anchored } = buildOcrRegions(image);
  const found = [];

  async function readWholeImage(progress) {
    setPhotoStatus("Reading the number…", progress);

    const whole = drawScaled(straight, 1600);
    toGrayscale(whole);
    adaptiveThreshold(whole, Math.round(whole.height * 0.02), 10);

    return bestCandidateFromLines(await ocrLines(worker, whole, "6"), null);
  }

  if (!anchored) {
    const candidate = await readWholeImage(startProgress);

    if (candidate) {
      found.push(candidate);

      if (candidate.missing === 0) {
        return applyPostalCorrections(candidate.pattern);
      }
    }
  }

  for (let index = 0; index < regions.length; index += 1) {
    const progress =
      startProgress +
      Math.round((index / (regions.length + 1)) * (endProgress - startProgress));

    setPhotoStatus("Reading the printed number…", progress);

    const candidate = await readBand(worker, regions[index]);

    if (!candidate) {
      continue;
    }

    found.push(candidate);

    if (candidate.missing === 0 && candidate.score >= candidate.length / 2) {
      break;
    }
  }

  if (!found.length) {
    const candidate = await readWholeImage(endProgress);

    if (candidate) {
      found.push(candidate);
    }
  }

  if (!found.length) {
    return "";
  }

  found.sort((first, second) => second.rank - first.rank);
  return applyPostalCorrections(found[0].pattern);
}

/* ------------------------------------------------------ barcode reading */

function extractDecodedDigits(text) {
  const raw = String(text || "").replace(/\u001d/g, "|");

  for (const length of [...ALLOWED_BARCODE_LENGTHS].sort((a, b) => b - a)) {
    const match = raw.match(new RegExp(`(?:^|\\D)(\\d{${length}})(?!\\d)`));

    if (match) {
      return match[1];
    }
  }

  const separated = raw
    .split("|")
    .map((part) => part.replace(/\D/g, ""))
    .filter(Boolean)
    .find((run) => isAllowedBarcodeLength(run.length));

  return separated || "";
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

    for (const result of results || []) {
      if (extractDecodedDigits(result.rawValue)) {
        return result.rawValue;
      }
    }

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
    ] = await Promise.all([import(ZXING_URL), import(ZXING_LIBRARY_URL)]);

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

async function decodeBarcode(image) {
  let raw = await decodeWithNativeDetector(image);

  if (!extractDecodedDigits(raw)) {
    raw = (await decodeWithZxing(image)) || raw;
  }

  return { raw, digits: extractDecodedDigits(raw) };
}

/* ------------------------------------------------------------ main flow */

async function processPhoto(file) {
  if (!file) {
    return;
  }

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
  setPhotoStatus("Loading the photo…", 3);

  try {
    await elements.photoPreview.decode();

    setPhotoStatus("Looking for a barcode…", 12);

    const scanned = await decodeBarcode(elements.photoPreview);

    if (scanned.digits) {
      setNumberText(scanned.digits);
      closePhotoPanel();
      generateCandidates({ closePanels: true });
      showToast(`Barcode scanned — ${scanned.digits.length} digits`);
      return;
    }

    const otherDigits = String(scanned.raw || "").replace(/\D/g, "");

    if (otherDigits.length >= 8) {
      closePhotoPanel();
      setNumberText(otherDigits);
      openNumberPanel({ historyMode: "replace" });
      showToast(
        `That barcode holds ${otherDigits.length} digits. Postal numbers are 22 or 26.`,
        3600
      );
      return;
    }

    setPhotoStatus("No barcode found. Reading the printed number…", 18);

    const pattern = await runOcr(elements.photoPreview);

    if (pattern) {
      setNumberText(pattern);
      closePhotoPanel();

      const unknown = countUnknownDigits(pattern);

      if (unknown <= MAX_UNKNOWN_DIGITS) {
        generateCandidates({ closePanels: true });
        showToast(
          unknown
            ? `Read ${pattern.length} digits with ${unknown} unclear. Tap the number to edit.`
            : `Read all ${pattern.length} digits`,
          3200
        );
      } else {
        openNumberPanel({ historyMode: "replace" });
        showToast("Several digits are unclear. Check the ? marks.", 3200);
      }

      return;
    }

    closePhotoPanel();
    openNumberPanel({ historyMode: "replace" });
    showToast("Nothing readable found. Try a closer, flatter photo.", 3200);
  } catch (error) {
    console.error(error);
    closePhotoPanel();
    openNumberPanel({ historyMode: "replace" });
    showToast(error?.message || "The photo could not be read. Try typing the number.");
  } finally {
    elements.cameraInput.value = "";
  }
}

/* ------------------------------------------------------------- barcodes */

function expandCandidates(pattern) {
  const unknown = countUnknownDigits(pattern);

  if (unknown > MAX_UNKNOWN_DIGITS) {
    throw new Error("Use no more than two question marks.");
  }

  if (unknown === 0) {
    return [pattern];
  }

  const results = [];

  function build(index, value) {
    if (index >= pattern.length) {
      results.push(value);
      return;
    }

    if (pattern[index] === "?") {
      for (let digit = 0; digit <= 9; digit += 1) {
        build(index + 1, value + String(digit));
      }
    } else {
      build(index + 1, value + pattern[index]);
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
      `That is ${pattern.length} digits. Postal numbers need 22 or 26 — use ? for any digit you cannot read.`,
      3600
    );
    openNumberPanel();
    return;
  }

  try {
    const unknown = countUnknownDigits(pattern);

    if (
      unknown === 2 &&
      !window.confirm("Two missing digits create 100 barcode possibilities. Continue?")
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
      "Scan a barcode or a printed tracking number, or type the number in.";
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
      barcodeWrap.textContent = error?.message || "The barcode could not be drawn.";
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

async function shareBarcode(value) {
  try {
    const canvas = createExportCanvas(value);
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], `barcode-${safeFilename(value)}.png`, {
      type: "image/png"
    });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Package barcode" });
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

/* ---------------------------------------------------------------- wiring */

elements.takePhotoButton.addEventListener("click", () => {
  void getOcrWorker().catch((error) => {
    console.warn("The OCR reader could not be preloaded.", error);
  });

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

elements.currentNumberCopyButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  void copyCurrentNumber();
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
  void processPhoto(elements.cameraInput.files?.[0]);
});

document.querySelectorAll("[data-key]").forEach((button) => {
  button.addEventListener("click", () => {
    handleKeypadKey(button.dataset.key || "");
  });
});

elements.numberDisplay.addEventListener("click", (event) => {
  const target = event.target.closest(".keypad-digit");

  keypadCaret = target ? Number(target.dataset.index) || 0 : numberText.length;
  renderNumberDisplay();
});

elements.closeFullscreenButton.addEventListener("click", closeFullscreen);

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

window.addEventListener("popstate", closeAllTransientViewsDirectly);

window.addEventListener("pagehide", () => {
  if (ocrWorker) {
    void ocrWorker.terminate().catch(() => {});
    ocrWorker = null;
    ocrWorkerPromise = null;
  }
});

if ("serviceWorker" in navigator) {
  let reloadedForUpdate = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForUpdate) {
      return;
    }

    reloadedForUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.update();
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });

        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", (event) => {
            if (event.target.state === "installed") {
              registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed.", error);
      });
  });
}

renderNumberDisplay();
updateCurrentNumberStrip();
renderResults();
updateInputOpenState();
