document.addEventListener("DOMContentLoaded", () => {
  const barcodeInput = document.getElementById("barcodeInput");
  const clearBtn = document.getElementById("clearBtn");
  const backspaceBtn = document.getElementById("backspaceBtn");
  const printBtn = document.getElementById("printBtn");
  const keypad = document.getElementById("keypad");
  const barcodeNumberDiv = document.getElementById("barcodeNumber");

  // Generate barcode dynamically whenever input changes
  function updateBarcode() {
    const val = barcodeInput.value.trim();
    if (val.length > 0) {
      try {
        JsBarcode("#barcodeSvg", val, {
          format: "CODE128",
          displayValue: false, // Text is rendered separately below
          margin: 0,
          height: 50,
          width: 2
        });
        barcodeNumberDiv.textContent = val;
      } catch (e) {
        barcodeNumberDiv.textContent = "Invalid Code";
      }
    } else {
      document.getElementById("barcodeSvg").innerHTML = "";
      barcodeNumberDiv.textContent = "";
    }
  }

  // Allow physical keyboard typing
  barcodeInput.addEventListener("input", updateBarcode);

  // Trigger print on Enter key
  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      triggerPrint();
    }
  });

  // Handle on-screen keypad button clicks
  keypad.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const val = btn.getAttribute("data-val");
    if (val !== null) {
      barcodeInput.value += val;
      barcodeInput.focus();
      updateBarcode();
    }
  });

  // Handle Backspace button
  backspaceBtn.addEventListener("click", () => {
    barcodeInput.value = barcodeInput.value.slice(0, -1);
    barcodeInput.focus();
    updateBarcode();
  });

  // Handle Clear button
  clearBtn.addEventListener("click", () => {
    barcodeInput.value = "";
    barcodeInput.focus();
    updateBarcode();
  });

  // Print function
  function triggerPrint() {
    if (!barcodeInput.value.trim()) {
      alert("Please enter a barcode number first.");
      return;
    }
    updateBarcode();
    window.print();
  }

  printBtn.addEventListener("click", triggerPrint);

  // Ensure input field receives focus on load
  barcodeInput.focus();
});
