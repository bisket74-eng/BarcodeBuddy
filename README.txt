BARCODE BUDDY — 22-DIGIT POSTAL UPDATE
======================================

- Manual entry now requires exactly 22 digits.
- A ? counts as one of the 22 positions.
- Every new photo clears the previous number and results first.
- Barcode decoding is restricted to Code 128, so QR codes are ignored.
- OCR no longer combines unrelated numbers from the whole shipping label.
- OCR only accepts a single 22-position line.
- Common OCR-confused characters are converted carefully.
- Unreadable positions are shown as ?.
- One or two ? characters generate the candidate barcodes.
- More than two unclear positions open the editor instead of inventing a result.
- Service-worker cache updated to barcode-buddy-v8.

The two screenshots supplied with this request show Barcode Buddy's output, not
the original label photographs. An actual label photo can still be useful for
fine-tuning the crop and OCR if a specific label format remains difficult.
