# TTM Showcase System - Documentation for Developers & AI Agents

This repository contains a premium, client-side, zero-dependency image showcase system built using HTML5, CSS3, and Vanilla JavaScript. It is designed to present software prototypes and design assets to Project Managers and Scrum Masters (PM/SM).

---

## 📂 Project Structure

```text
showcase/
 ┣ 📄 index.html    # Core markup structure, interactive controls, and SVG icons
 ┣ 📄 style.css     # Premium dark theme styling, glassmorphism, responsive column grid, and dock styles
 ┣ 📄 script.js    # Application controller (math for zoom-focal, dragging, drawing, and navigation)
 ┣ 📄 config.js    # Data configuration file containing the list of image assets
 ┗ 📄 README.md     # System documentation (this file)
```

---

## ⚙️ Configuration Setup (`config.js`)

To make the system completely reusable and data-driven without modifying core code, image assets are declared in the `config.js` file.

The application reads configurations from the global `window.SHOWCASE_CONFIG` object. This approach bypasses CORS restrictions when launching `index.html` locally via the `file://` protocol.

### Start Image and Alphabetical Sorting Logic
* **Default Start Image (`__` prefix)**: Users can define a default start image by prefixing its filename with `__` (two underscores), e.g. `__holiday_dashboard.png`.
* **Automatic Detection**: The Python generator script detects these files, sorts them, and sets `defaultImage` in `config.js` to the first such file.
* **Welcome Screen**: If no file starting with `__` is found in the `images` directory, `defaultImage` is set to `""`. On startup, the application displays a Welcome screen prompting the user to select an image, and starts with the root folder (`currentFolder = ""`).
* **Sorting order**: All files in the list are sorted alphabetically. However, files starting with `__` are grouped and placed at the very top of the list.

### Format Option A: Simple Array (Recommended for quick additions)
```javascript
window.SHOWCASE_CONFIG = {
  defaultImage: "__status_alert_rules_prototype.png",
  images: [
    "__status_alert_rules_prototype.png",
    "epic_detail_dashboard_overview.png",
    "project_permissions_dashboard_modal.png"
  ]
};
```

### Format Option B: Object Array (Allows custom file metadata)
```javascript
window.SHOWCASE_CONFIG = {
  defaultImage: "__status_alert_rules_prototype.png",
  images: [
    { filename: "__status_alert_rules_prototype.png", size: "1.43 MB" },
    { filename: "epic_detail_dashboard_overview.png", size: "1.08 MB" }
  ]
};
```

*Note: If no size is specified, the application defaults to displaying the "Image" badge.*

---

## 🧠 Core Mathematics & Interaction Algorithms

### 1. Mouse Wheel Zoom Center-on-Cursor
When scrolling the mouse wheel, the point under the cursor remains under the cursor after the scale adjusts.

Let:
* $s_{old}$ be the zoom scale factor before the scroll.
* $s_{new}$ be the zoom scale factor after the scroll.
* $r = \frac{s_{new}}{s_{old}}$ be the zoom multiplier ratio.
* $m_x, m_y$ be the mouse coordinates relative to the viewport's center.
* $t_x, t_y$ be the current panning translations of the image.

The updated translation offsets ($t_{x, new}, t_{y, new}$) are computed as follows:
$$t_{x, new} = m_x - r \cdot (m_x - t_x)$$
$$t_{y, new} = m_y - r \cdot (m_y - t_y)$$

### 2. Viewport Panning Bounds
To prevent the user from dragging the image out of bounds, translations are clamped based on size comparisons:

Let:
* $V_w, V_h$ be the viewport dimensions.
* $I_w, I_h$ be the scaled image dimensions ($naturalSize \cdot scale$).

$$\text{If } I_w > V_w: \quad -\frac{I_w - V_w}{2} \le t_x \le \frac{I_w - V_w}{2}$$
$$\text{If } I_w \le V_w: \quad t_x = 0 \quad (\text{force center})$$

$$\text{If } I_h > V_h: \quad -\frac{I_h - V_h}{2} \le t_y \le \frac{I_h - V_h}{2}$$
$$\text{If } I_h \le V_h: \quad t_y = 0 \quad (\text{force center})$$

### 3. Canvas Drawing Sync
The Pencil tool overlays an HTML5 `<canvas>` on top of the image.
1. The canvas layout dimensions are bound 1:1 to the image client width/height using `mainImage.getBoundingClientRect()`.
2. When the user draws, coordinates are recorded relative to the canvas bounding box, mapping 1:1 to the drawing buffer.
3. Canvas context clears automatically on zoom or image load to wipe annotations. Panning shifts both image and canvas concurrently.

---

## ☁️ Netlify Deployment Guide

When zipping the source directory for upload to Netlify, organize the folders like this:

```text
📂 upload.zip
 ┣ 📂 images/                 # Copy all image prototypes here (supports 1-level subfolders for albums)
 ┃ ┣ 📄 __status_alert_rules_prototype.png
 ┃ ┣ 📂 album_a/
 ┃ ┃ ┗ 📄 ttm_monitor.png
 ┃ ┗ ...
 ┣ 📄 index.html
 ┣ 📄 style.css
 ┣ 📄 script.js
 ┗ 📄 config.js
```

### 🔧 Dynamic Path Resolution (Local Dev vs Netlify Host)
The system uses an **Automatic Path Fallback** technique:
1. Thumbnails and main image load attempts look inside the local folder `./images/` first (Netlify zip output structure).
2. If the request fails (e.g. during local developer file testing), the `onerror` handler falls back to loading from the parent directory `../images/`.
3. This ensures the app is 100% plug-and-play in both environments without altering a single path.
