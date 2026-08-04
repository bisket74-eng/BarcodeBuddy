POSTAL BARCODE RESCUE
=====================

FILES
-----
index.html
styles.css
app.js
manifest.json
sw.js
icon-192.png
icon-512.png

UPLOAD TO GITHUB PAGES
----------------------
1. Create a new GitHub repository.
2. Upload every file from this folder into the top level of the repository.
3. Open Settings > Pages.
4. Choose Deploy from a branch.
5. Choose the main branch and /(root).
6. Open the GitHub Pages address after deployment finishes.

HOW IT WORKS
------------
- Take Photo opens the phone camera.
- The app first tries to decode the Code 128 barcode.
- If it cannot, it uses browser OCR to try to read the printed numbers.
- Enter Number opens a custom pop-up ten-key. The regular phone keyboard does not appear.
- Use ? for one unreadable digit. The app creates ten candidates.
- Two question marks create 100 candidates.
- Full Screen enlarges the barcode and adapts to portrait or landscape.
- Share Image opens the phone share menu when supported.
- Download saves a PNG barcode image.

IMPORTANT
---------
This app recreates a Code 128 symbol from an existing number. It does not create
postage, register a shipment, or guarantee that every USPS IMpb/GS1-128 label can
be reconstructed from the human-readable tracking number alone.

The barcode and OCR libraries are loaded from public CDNs. The first use of those
features requires an internet connection. No backend, Supabase project, API key,
or paid service is required.
