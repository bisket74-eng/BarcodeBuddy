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
  generateButton: document.getElementById("generateButton"),
  currentNumberStrip: document.getElementById("currentNumberStrip"),
  currentNumberValue: document.getElementById("currentNumberValue"),
  currentNumberClearButton: document.getElementById("currentNumberClearButton"),
  resultsSection: document.getElementById("resultsSection"),
  notice: document.getElementById("notice"),
  results: document.getElementById("results"),
  resultCount: document.getElementById("resultCount"),
  toast: document.getElementById("toast")
};

let numberText = "";
let keypadCaret = 0;
let candidates = [];
let currentPhotoUrl = "";
let toastTimer = 0;
let foundBarcodes = [];

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
  const { replace = false, forcePush = false } = options;
  const state = {
    ...(history.state || {}),
    [HISTORY_VIEW_KEY]: view
  };

  if (replace) {
    history.replaceState(state, "", window.location.href);
  } else if (forcePush || !getHistoryView()) {
    history.pushState(state, "", window.location.href);
  } else {
    history.replaceState(state, "", window.location.href);
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
  const hasEditableNumber = Boolean(numberText);
  const hasResults = candidates.length > 0;
  const hasContent = hasEditableNumber || hasResults;

  elements.currentNumberStrip.hidden = !hasContent;

  if (!hasContent) {
    elements.currentNumberValue.textContent = "";
    elements.currentNumberValue.disabled = false;
    elements.currentNumberValue.classList.remove("results-summary");
    return;
  }

  if (hasEditableNumber) {
    elements.currentNumberValue.textContent = groupNumber(numberText);
    elements.currentNumberValue.disabled = false;
    elements.currentNumberValue.classList.remove("results-summary");
    elements.currentNumberValue.setAttribute(
      "aria-label",
      "Edit the current barcode number"
    );
  } else {
    elements.currentNumberValue.textContent =
      `${candidates.length} barcode${candidates.length === 1 ? "" : "s"} from photo`;
    elements.currentNumberValue.disabled = true;
    elements.currentNumberValue.classList.add("results-summary");
    elements.currentNumberValue.setAttribute(
      "aria-label",
      `${candidates.length} barcode${candidates.length === 1 ? "" : "s"} from photo`
    );
  }

  window.requestAnimationFrame(() => {
    elements.currentNumberValue.scrollLeft = 0;
  });
}

function renderNumberDisplay() {
  keypadCaret = Math.max(0, Math.min(keypadCaret, numberText.length));
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

    if (!caret) {
      return;
    }

    const displayRect = elements.numberDisplay.getBoundingClientRect();
    const caretRect = caret.getBoundingClientRect();

    if (caretRect.right > displayRect.right - 12) {
      elements.numberDisplay.scrollLeft +=
        caretRect.right - displayRect.right + 18;
    } else if (caretRect.left < displayRect.left + 12) {
      elements.numberDisplay.scrollLeft -=
        displayRect.left - caretRect.left + 18;
    }
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
  numberText = "";
  keypadCaret = 0;
  candidates = [];
  foundBarcodes = [];
  renderNumberDisplay();
  updateCurrentNumberStrip();
  renderResults();
  closePhotoPanel();
  showToast("Cleared");
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractDecodedDigitList(text) {
  const raw = String(text || "").replace(/\u001d/g, "|");
  const found = raw.match(/\d{22}/g) || [];

  const separatedRuns = raw
    .split("|")
    .map((part) => part.replace(/\D/g, ""))
    .filter(Boolean);

  separatedRuns.forEach((run) => {
    if (run.length === MAX_BARCODE_LENGTH) {
      found.push(run);
    }
  });

  // Some GS1-128 results contain routing data first and the 22-digit
  // tracking number as the final section. Only use that when a GS separator
  // was actually present; never take the first 22 digits of unrelated data.
  if (raw.includes("|")) {
    const finalRun = separatedRuns.at(-1) || "";

    if (finalRun.length >= MAX_BARCODE_LENGTH) {
      found.push(finalRun.slice(-MAX_BARCODE_LENGTH));
    }
  }

  return uniqueValues(found);
}

function extractDecodedDigits(text) {
  return extractDecodedDigitList(text)[0] || "";
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

function extractAllOcrPatterns(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const patterns = [];

  lines.forEach((line) => {
    const exactRuns = line.match(/\d{22}/g) || [];
    patterns.push(...exactRuns);

    const groupedMatches =
      line.match(/(?:[0-9OoQDIil|!ZSsGgBb]{3,4}[\s\-_.]+){5}[0-9OoQDIil|!ZSsGgBb]{1,2}/g) || [];

    groupedMatches.forEach((match) => {
      const pattern = patternFromOcrLine(match);

      if (pattern) {
        patterns.push(pattern);
      }
    });

    const wholeLinePattern = patternFromOcrLine(line);

    if (wholeLinePattern) {
      patterns.push(wholeLinePattern);
    }
  });

  return uniqueValues(patterns).sort((a, b) => {
    const unknownA = (a.match(/\?/g) || []).length;
    const unknownB = (b.match(/\?/g) || []).length;
    return unknownA - unknownB;
  });
}

function extractBestOcrPattern(text) {
  return extractAllOcrPatterns(text)[0] || "";
}

async function decodeAllWithNativeDetector(image) {
  if (!("BarcodeDetector" in window)) {
    return [];
  }

  try {
    const supported =
      typeof BarcodeDetector.getSupportedFormats === "function"
        ? await BarcodeDetector.getSupportedFormats()
        : ["code_128"];

    if (!supported.includes("code_128")) {
      return [];
    }

    const detector = new BarcodeDetector({ formats: ["code_128"] });
    const results = await detector.detect(image);
    return uniqueValues((results || []).map((result) => result?.rawValue || ""));
  } catch (error) {
    console.warn("Native barcode detection failed.", error);
    return [];
  }
}

async function decodeWithNativeDetector(image) {
  const results = await decodeAllWithNativeDetector(image);
  return results[0] || "";
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

async function runOcrPatterns(image) {
  if (!window.Tesseract?.createWorker) {
    throw new Error("OCR could not load. Check the internet connection.");
  }

  const regions = makeOcrRegions(image);
  const worker = await Tesseract.createWorker("eng", 1, {
    logger(message) {
      if (message.status === "recognizing text") {
        const percent = Math.round((message.progress || 0) * 100);
        setPhotoStatus(`Reading barcode numbers… ${percent}%`, percent);
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

    const patterns = [];

    for (const region of regions) {
      const result = await worker.recognize(region);
      patterns.push(...extractAllOcrPatterns(result?.data?.text || ""));
    }

    return uniqueValues(patterns).sort((a, b) => {
      const unknownA = (a.match(/\?/g) || []).length;
      const unknownB = (b.match(/\?/g) || []).length;
      return unknownA - unknownB;
    });
  } finally {
    await worker.terminate();
  }
}

async function runOcr(image) {
  const patterns = await runOcrPatterns(image);
  return patterns[0] || "";
}

function showDetectedBarcodes(values) {
  foundBarcodes = uniqueValues(
    values
      .map((value) => sanitizeEditableNumber(value))
      .filter((value) => /^\d{22}$/.test(value))
  );

  if (!foundBarcodes.length) {
    return false;
  }

  candidates = [...foundBarcodes];

  if (foundBarcodes.length === 1) {
    numberText = foundBarcodes[0];
    keypadCaret = numberText.length;
  } else {
    numberText = "";
    keypadCaret = 0;
  }

  closePhotoPanel();
  renderNumberDisplay();
  updateCurrentNumberStrip();
  renderResults();
  closeInputHistoryIfOpen();

  window.setTimeout(() => {
    elements.currentNumberStrip.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 80);

  showToast(
    foundBarcodes.length === 1
      ? "Barcode read from photo"
      : `${foundBarcodes.length} barcodes found`
  );
  return true;
}

async function processPhoto(file) {
  if (!file) {
    return;
  }

  // A new photo must never reuse the previous label's number or list.
  numberText = "";
  keypadCaret = 0;
  candidates = [];
  foundBarcodes = [];
  renderNumberDisplay();
  updateCurrentNumberStrip();
  renderResults();

  const replaceExistingView = Boolean(getHistoryView());

  closeNumberPanel();
  setHistoryView("photo", { replace: replaceExistingView });
  releasePhotoUrl();

  currentPhotoUrl = URL.createObjectURL(file);
  elements.photoPreview.src = currentPhotoUrl;
  elements.photoPanel.hidden = false;
  updateInputOpenState();
  setPhotoStatus("Loading photo…", 3);

  try {
    await elements.photoPreview.decode();

    setPhotoStatus("Looking for barcodes…", 12);

    const decodedValues = await decodeAllWithNativeDetector(
      elements.photoPreview
    );

    if (!decodedValues.length) {
      const zxingValue = await decodeWithZxing(elements.photoPreview);

      if (zxingValue) {
        decodedValues.push(zxingValue);
      }
    }

    const decodedNumbers = uniqueValues(
      decodedValues.flatMap(extractDecodedDigitList)
    );

    if (decodedNumbers.length > 1) {
      showDetectedBarcodes(decodedNumbers);
      return;
    }

    setPhotoStatus(
      decodedNumbers.length
        ? "One barcode was found. Checking for any others…"
        : "Trying to read the printed numbers…",
      18
    );

    const ocrPatterns = await runOcrPatterns(elements.photoPreview);
    const exactOcrNumbers = ocrPatterns.filter((pattern) => /^\d{22}$/.test(pattern));
    const allExactNumbers = uniqueValues([
      ...decodedNumbers,
      ...exactOcrNumbers
    ]);

    if (allExactNumbers.length) {
      showDetectedBarcodes(allExactNumbers);
      return;
    }

    const bestPattern = ocrPatterns[0] || "";

    if (bestPattern) {
      setNumberText(bestPattern);
      closePhotoPanel();

      const unknownCount = (bestPattern.match(/\?/g) || []).length;

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

    const barcodeDisplay = document.createElement("div");
    barcodeDisplay.className = "barcode-static";

    const barcodeWrap = document.createElement("div");
    barcodeWrap.className = "barcode-wrap";

    const canvas = document.createElement("canvas");
    barcodeWrap.appendChild(canvas);

    const number = document.createElement("div");
    number.className = "candidate-number";
    number.textContent = groupNumber(value);

    barcodeDisplay.append(barcodeWrap, number);

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
    card.append(barcodeDisplay, actions);
    elements.results.appendChild(card);

    try {
      drawBarcode(canvas, value);
    } catch (error) {
      barcodeWrap.textContent =
        error?.message || "The barcode could not be drawn.";
    }
  });
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
  if (numberText) {
    openNumberPanel();
  }
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


document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!elements.numberPanel.hidden) {
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
