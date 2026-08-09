// Parse configuration from config.js
const rawImages = window.SHOWCASE_CONFIG && window.SHOWCASE_CONFIG.images ? window.SHOWCASE_CONFIG.images : [];
const prototypeImages = rawImages.map(item => {
  if (typeof item === 'string') {
    return { filename: item, size: "Image" };
  }
  return { filename: item.filename, size: item.size || "Image" };
});

const defaultImageName = window.SHOWCASE_CONFIG && typeof window.SHOWCASE_CONFIG.defaultImage === 'string'
  ? window.SHOWCASE_CONFIG.defaultImage 
  : (prototypeImages[0] ? prototypeImages[0].filename : "");

// Current directory album state
let currentFolder = "";

// App State
let currentImagesList = []; // Images inside the current folder
let activeImageIndex = 0; // Index in currentImagesList
let activeFilename = defaultImageName; // Maintain global selection filename

// Zooming & Panning State
const ZOOM_LEVELS = [0.7, 1.0, 1.3, 1.5];
let currentZoomIdx = 1; // Default to 100% (1.0)
let isFitMode = true; // Start in "Fit to Screen" mode
let tx = 0; // horizontal pan offset
let ty = 0; // vertical pan offset
let isDragging = false;
let startMouseX = 0;
let startMouseY = 0;
let startTx = 0;
let startTy = 0;

// Sidebar & Pencil Tool States
let isSidebarCollapsed = false;
let isPencilMode = false;
let isDrawing = false;

// Dock Drag & Collapse States
let isDraggingDock = false;
let dockOffsetX = 0;
let dockOffsetY = 0;

// Welcome Screen Starfield Particle Variables
let stars = [];
const numStars = 120;
let starAnimationFrameId = null;
let welcomeCanvas = null;
let wCtx = null;
let windX = 0;
let windY = 0;
let welcomeMouseX = 0;
let welcomeMouseY = 0;
let isWelcomeActive = false;
let lastMouseMoveTime = 0;
let speedMultiplier = 0.0;

// Initialize particles inside welcome screen canvas
function initStars() {
  welcomeCanvas = document.getElementById("welcome-canvas");
  if (!welcomeCanvas) return;
  wCtx = welcomeCanvas.getContext("2d");
  
  resizeWelcomeCanvas();
  
  // Set initial mouse position in center to prevent sudden star drift
  welcomeMouseX = welcomeCanvas.width / 2;
  welcomeMouseY = welcomeCanvas.height / 2;
  lastMouseMoveTime = 0; // Reset movement time
  speedMultiplier = 0.0; // Start at rest and speed up smoothly on hover!
  
  stars = [];
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: Math.random() * welcomeCanvas.width,
      y: Math.random() * welcomeCanvas.height,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
      // Drastically slower speed (0.3x of 0.15 is 0.045)
      speedX: (Math.random() - 0.5) * 0.045,
      speedY: (Math.random() - 0.5) * 0.045
    });
  }
}

// Resizes welcome canvas dynamically
function resizeWelcomeCanvas() {
  if (welcomeCanvas) {
    welcomeCanvas.width = welcomeCanvas.clientWidth;
    welcomeCanvas.height = welcomeCanvas.clientHeight;
  }
}

// Animation loop drawing drifting particles on canvas
function animateStars() {
  if (!isWelcomeActive || !wCtx) return;
  
  wCtx.clearRect(0, 0, welcomeCanvas.width, welcomeCanvas.height);
  
  const cx = welcomeCanvas.width / 2;
  const cy = welcomeCanvas.height / 2;
  
  // Decelerate stars smoothly to a halt when mouse is inactive for more than 1.2s
  const now = Date.now();
  const timeSinceMove = lastMouseMoveTime > 0 ? now - lastMouseMoveTime : 99999;
  
  let targetSpeedMultiplier = 1.0;
  if (timeSinceMove > 1200) {
    // Decays mouse tracking coordinates back to screen center
    welcomeMouseX += (cx - welcomeMouseX) * 0.03;
    welcomeMouseY += (cy - welcomeMouseY) * 0.03;
    
    // Target multiplier goes to 0 (stars stop completely)
    targetSpeedMultiplier = 0.0;
  }
  
  // Smooth transition for speed multiplier
  speedMultiplier += (targetSpeedMultiplier - speedMultiplier) * 0.03;
  
  const targetWindX = (welcomeMouseX - cx) * 0.015;
  const targetWindY = (welcomeMouseY - cy) * 0.015;
  
  windX += (targetWindX - windX) * 0.05;
  windY += (targetWindY - windY) * 0.05;
  
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    // Apply the decaying speedMultiplier to both base and mouse velocities
    s.x += (s.speedX * speedMultiplier) + (windX * speedMultiplier);
    s.y += (s.speedY * speedMultiplier) + (windY * speedMultiplier);
    
    // Wrap around coordinates
    if (s.x < 0) s.x = welcomeCanvas.width;
    if (s.x > welcomeCanvas.width) s.x = 0;
    if (s.y < 0) s.y = welcomeCanvas.height;
    if (s.y > welcomeCanvas.height) s.y = 0;
    
    wCtx.beginPath();
    wCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    wCtx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
    wCtx.fill();
  }
  
  starAnimationFrameId = requestAnimationFrame(animateStars);
}

// DOM Elements
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search");
const thumbnailList = document.getElementById("thumbnail-list");
const mainImage = document.getElementById("main-image");
const loadingOverlay = document.getElementById("loading-overlay");
const activeTitle = document.getElementById("active-title");
const activeCounter = document.getElementById("active-counter");

// Navigation & Sidebar Elements
const sidebarToggle = document.getElementById("sidebar-toggle");
const leftPanel = document.getElementById("left-panel");
const dockPrevBtn = document.getElementById("dock-prev-btn");
const dockNextBtn = document.getElementById("dock-next-btn");
const indexBtn = document.getElementById("index-btn");
const indexMenu = document.getElementById("index-menu");
const headerRestoreBtn = document.getElementById("header-restore-btn");

// Dock Controls & Elements
const interactionHint = document.getElementById("interaction-hint");
const dockDragHandle = document.getElementById("dock-drag-handle");
const dockCollapseBtn = document.getElementById("dock-collapse-btn");
const expandDockBtn = document.getElementById("expand-dock-btn");
const themeToggleBtn = document.getElementById("theme-toggle-btn");

// Zoom & Draw Controls
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomIndicator = document.getElementById("zoom-indicator");
const zoomInBtn = document.getElementById("zoom-in-btn");
const actualSizeBtn = document.getElementById("actual-size-btn");
const fitScreenBtn = document.getElementById("fit-screen-btn");
const pencilBtn = document.getElementById("pencil-btn");
const viewport = document.getElementById("viewport");
const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

// Helper: Gets the folder name from a relative filename (1-level subfolder)
function getFolder(filename) {
  const idx = filename.indexOf('/');
  if (idx === -1) return "";
  return filename.substring(0, idx);
}

// Helper: Gets the base filename without folder parts
function getBaseName(filename) {
  const idx = filename.lastIndexOf('/');
  if (idx === -1) return filename;
  return filename.substring(idx + 1);
}

// Helper: Formats the filename into a clean, readable title
function cleanTitle(filename) {
  const baseFile = getBaseName(filename);
  const base = baseFile.substring(0, baseFile.lastIndexOf('.')) || baseFile;
  return base
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (['ttm', 'csv', 'ui', 'pm', 'sm'].includes(lower)) {
        return word.toUpperCase();
      }
      if (['and', 'or', 'for', 'of', 'in', 'to'].includes(lower) && idx !== 0) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// Helper: Deactivates Pencil mode
function disablePencilMode() {
  if (isPencilMode) {
    isPencilMode = false;
    pencilBtn.classList.remove("active");
    canvas.style.pointerEvents = "none";
    canvas.style.cursor = "default";
    updateViewportState();
  }
}

// Render Thumbnail list / albums in Left Panel
function renderThumbnails() {
  thumbnailList.innerHTML = "";
  
  // Gather unique folders in images/ directory
  const uniqueFolders = [];
  prototypeImages.forEach(img => {
    const f = getFolder(img.filename);
    if (f !== "" && !uniqueFolders.includes(f)) {
      uniqueFolders.push(f);
    }
  });

  // 1. Render Up to Parent Folder navigation element if not at root
  if (currentFolder !== "") {
    const upItem = document.createElement("div");
    upItem.className = "thumbnail-item folder-up-item";
    upItem.innerHTML = `
      <div class="thumb-preview-wrapper folder-icon-wrapper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 10 12 7 9 10"></polyline>
          <line x1="12" y1="7" x2="12" y2="17"></line>
          <path d="M20 21H4"></path>
        </svg>
      </div>
      <div class="thumb-info">
        <div class="thumb-title">....</div>
        <div class="thumb-meta">Up to root folder</div>
      </div>
    `;
    upItem.addEventListener("click", () => {
      currentFolder = "";
      currentImagesList = prototypeImages.filter(img => getFolder(img.filename) === "");
      renderThumbnails();
      if (currentImagesList.length > 0) {
        selectImage(0);
      }
    });
    thumbnailList.appendChild(upItem);
  }

  // 2. Render Folders (only shown at root folder)
  if (currentFolder === "") {
    uniqueFolders.forEach(folderName => {
      const imgCount = prototypeImages.filter(img => getFolder(img.filename) === folderName).length;
      const folderItem = document.createElement("div");
      folderItem.className = "thumbnail-item folder-item";
      folderItem.innerHTML = `
        <div class="thumb-preview-wrapper folder-icon-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <div class="thumb-info">
          <div class="thumb-title" title="${folderName}">${folderName}</div>
          <div class="thumb-meta">${imgCount} image${imgCount > 1 ? "s" : ""}</div>
        </div>
      `;
      folderItem.addEventListener("click", () => {
        currentFolder = folderName;
        currentImagesList = prototypeImages.filter(img => getFolder(img.filename) === currentFolder);
        renderThumbnails();
        if (currentImagesList.length > 0) {
          selectImage(0);
        }
      });
      thumbnailList.appendChild(folderItem);
    });
  }

  // 3. Render Files in current folder
  const currentFolderFiles = prototypeImages.filter(img => getFolder(img.filename) === currentFolder);
  currentFolderFiles.forEach((img) => {
    const title = cleanTitle(img.filename);
    const isActive = img.filename === activeFilename;
    const idxInCurrentList = currentImagesList.findIndex(x => x.filename === img.filename);

    const item = document.createElement("div");
    item.className = `thumbnail-item ${isActive ? "active" : ""}`;
    item.innerHTML = `
      <div class="thumb-preview-wrapper">
        <img class="thumb-preview" 
             src="images/${img.filename}" 
             onerror="this.onerror=null; this.src='../images/${img.filename}';"
             alt="${title}" 
             loading="lazy">
      </div>
      <div class="thumb-info">
        <div class="thumb-title" title="${title}">${title}</div>
        <div class="thumb-meta">
          <span>PNG</span>
          <span>•</span>
          <span>${img.size}</span>
        </div>
      </div>
    `;
    
    item.addEventListener("click", () => {
      if (idxInCurrentList !== -1) {
        selectImage(idxInCurrentList);
      }
    });
    
    thumbnailList.appendChild(item);
  });
}

// Select an image by index in currentImagesList
function selectImage(index) {
  if (currentImagesList.length === 0) return;
  
  if (index < 0) index = 0;
  if (index >= currentImagesList.length) index = currentImagesList.length - 1;
  
  activeImageIndex = index;
  const imageObj = currentImagesList[index];
  activeFilename = imageObj.filename;
  
  disablePencilMode();
  
  // Update left-sidebar thumbnail selection highlights
  const items = thumbnailList.querySelectorAll(".thumbnail-item:not(.folder-item):not(.folder-up-item)");
  const currentFolderFiles = prototypeImages.filter(img => getFolder(img.filename) === currentFolder);
  currentFolderFiles.forEach((img, fileIdx) => {
    if (img.filename === activeFilename) {
      if (items[fileIdx]) {
        items[fileIdx].classList.add("active");
        items[fileIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else {
      if (items[fileIdx]) items[fileIdx].classList.remove("active");
    }
  });

  loadMainImage(imageObj.filename);
}

// Load Image in the viewport
function loadMainImage(filename) {
  if (!filename) {
    mainImage.src = "";
    mainImage.style.display = "none";
    canvas.style.display = "none";
    document.getElementById("welcome-screen").classList.add("visible");
    interactionHint.style.display = "none";
    expandDockBtn.style.display = "none";
    activeTitle.textContent = "Welcome";
    activeCounter.textContent = "0 of 0";
    loadingOverlay.classList.remove("visible");
    
    // Start welcome screen background starfield animation
    isWelcomeActive = true;
    initStars();
    cancelAnimationFrame(starAnimationFrameId);
    animateStars();
    return;
  }
  
  // Stop welcome screen animation to save CPU
  isWelcomeActive = false;
  cancelAnimationFrame(starAnimationFrameId);
  
  mainImage.style.display = "block";
  canvas.style.display = "block";
  document.getElementById("welcome-screen").classList.remove("visible");
  
  // Show dock controls based on collapsed state
  if (interactionHint.classList.contains("collapsed")) {
    expandDockBtn.style.display = "flex";
    interactionHint.style.display = "none";
  } else {
    expandDockBtn.style.display = "none";
    interactionHint.style.display = "flex";
  }

  loadingOverlay.classList.add("visible");
  
  const title = cleanTitle(filename);
  activeTitle.textContent = title;
  
  // Find index in master list vs current list
  const masterIdx = prototypeImages.findIndex(x => x.filename === filename);
  activeCounter.textContent = `${masterIdx + 1} of ${prototypeImages.length}`;

  const tempImg = new Image();
  let fallbackTriggered = false;
  
  tempImg.onload = function() {
    mainImage.src = tempImg.src;
    isFitMode = true;
    tx = 0;
    ty = 0;
    
    clearDrawingCanvas();
    updateViewportState();
    loadingOverlay.classList.remove("visible");
  };
  
  tempImg.onerror = function() {
    if (!fallbackTriggered) {
      fallbackTriggered = true;
      tempImg.src = `../images/${filename}`;
    } else {
      mainImage.src = "";
      activeTitle.textContent = "Failed to load image";
      loadingOverlay.classList.remove("visible");
    }
  };
  
  tempImg.src = `images/${filename}`;
}

// Render dynamic Index popup items
function renderIndexMenu() {
  indexMenu.innerHTML = "";
  
  const uniqueFolders = [];
  prototypeImages.forEach(img => {
    const f = getFolder(img.filename);
    if (f !== "" && !uniqueFolders.includes(f)) {
      uniqueFolders.push(f);
    }
  });

  // 1. Render Up button
  if (currentFolder !== "") {
    const upItem = document.createElement("div");
    upItem.className = "index-menu-item folder-up-item";
    upItem.innerHTML = `<span style="font-weight:bold; color:var(--accent-color);">....</span> <span style="margin-left:8px; opacity:0.6;">(Up to root folder)</span>`;
    upItem.addEventListener("click", (e) => {
      e.stopPropagation();
      currentFolder = "";
      currentImagesList = prototypeImages.filter(img => getFolder(img.filename) === "");
      renderThumbnails();
      renderIndexMenu();
      if (currentImagesList.length > 0) {
        selectImage(0);
      }
    });
    indexMenu.appendChild(upItem);
  }

  // 2. Render folders (only at root)
  if (currentFolder === "") {
    uniqueFolders.forEach(folderName => {
      const folderItem = document.createElement("div");
      folderItem.className = "index-menu-item folder-item";
      folderItem.innerHTML = `📁 <span style="font-weight:600;">${folderName}</span>`;
      folderItem.addEventListener("click", (e) => {
        e.stopPropagation();
        currentFolder = folderName;
        currentImagesList = prototypeImages.filter(img => getFolder(img.filename) === currentFolder);
        renderThumbnails();
        renderIndexMenu();
        if (currentImagesList.length > 0) {
          selectImage(0);
        }
      });
      indexMenu.appendChild(folderItem);
    });
  }

  // 3. Render files
  const currentFolderFiles = prototypeImages.filter(img => getFolder(img.filename) === currentFolder);
  currentFolderFiles.forEach((img) => {
    const title = cleanTitle(img.filename);
    const isActive = img.filename === activeFilename;
    const idxInCurrentList = currentImagesList.findIndex(x => x.filename === img.filename);

    const item = document.createElement("div");
    item.className = `index-menu-item ${isActive ? "active" : ""}`;
    item.textContent = title;
    item.title = title;
    
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idxInCurrentList !== -1) {
        selectImage(idxInCurrentList);
      }
      indexMenu.classList.remove("visible");
    });
    indexMenu.appendChild(item);
  });
}

// Synchronizes the size, position, and scale of the drawing canvas with the main image
function syncCanvasSize() {
  if (!mainImage.naturalWidth) return;
  
  const rect = mainImage.getBoundingClientRect();
  
  canvas.style.width = mainImage.style.width;
  canvas.style.height = mainImage.style.height;
  canvas.style.transform = mainImage.style.transform;
  canvas.style.left = mainImage.style.left;
  canvas.style.top = mainImage.style.top;
  
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
  }
}

// Clears all drawings from the canvas
function clearDrawingCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Update Image display state based on fit/zoom modes
function updateViewportState() {
  if (!mainImage.naturalWidth) return;

  if (isFitMode) {
    mainImage.className = "img-fit";
    mainImage.style.width = "100%";
    mainImage.style.height = "auto";
    
    const displayWidth = viewport.clientWidth;
    const displayHeight = mainImage.naturalHeight * (displayWidth / mainImage.naturalWidth);
    
    clampTranslation(displayWidth, displayHeight);
    
    mainImage.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
    
    zoomIndicator.textContent = "Fit";
    zoomOutBtn.disabled = false;
    zoomInBtn.disabled = false; 
    fitScreenBtn.disabled = true;
    actualSizeBtn.disabled = false;

    // Toggle viewport-fit-mode class for mobile chevron rendering
    if (!isPencilMode) {
      viewport.classList.add("viewport-fit-mode");
    } else {
      viewport.classList.remove("viewport-fit-mode");
    }
  } else {
    mainImage.className = "img-zoomed";
    const currentScale = ZOOM_LEVELS[currentZoomIdx];
    
    const displayWidth = mainImage.naturalWidth * currentScale;
    const displayHeight = mainImage.naturalHeight * currentScale;
    
    mainImage.style.width = `${displayWidth}px`;
    mainImage.style.height = `${displayHeight}px`;
    
    clampTranslation(displayWidth, displayHeight);
    
    mainImage.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
    
    zoomIndicator.textContent = `${Math.round(currentScale * 100)}%`;
    zoomOutBtn.disabled = currentZoomIdx === 0;
    zoomInBtn.disabled = currentZoomIdx === ZOOM_LEVELS.length - 1;
    fitScreenBtn.disabled = false;
    actualSizeBtn.disabled = currentScale === 1.0;

    viewport.classList.remove("viewport-fit-mode");
    // Hide chevrons if zoomed
    document.getElementById("nav-chevron-left").classList.remove("visible-desktop");
    document.getElementById("nav-chevron-right").classList.remove("visible-desktop");
  }
  
  setTimeout(syncCanvasSize, 10);
}

// Clamps panning translation so that the image cannot be dragged completely outside the viewport boundaries
function clampTranslation(imgWidth, imgHeight) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;

  // Horizontal boundaries
  if (imgWidth > vw) {
    const maxTx = (imgWidth - vw) / 2;
    tx = Math.max(-maxTx, Math.min(maxTx, tx));
  } else {
    tx = 0;
  }

  // Vertical boundaries
  if (imgHeight > vh) {
    const maxTy = (imgHeight - vh) / 2;
    ty = Math.max(-maxTy, Math.min(maxTy, ty));
  } else {
    ty = 0;
  }
}

// Clamps the dragged dock within the viewport boundaries during resize
function adjustDockOnResize() {
  if (interactionHint.style.left) {
    const vRect = viewport.getBoundingClientRect();
    const dRect = interactionHint.getBoundingClientRect();
    let curLeft = parseFloat(interactionHint.style.left);
    let curTop = parseFloat(interactionHint.style.top);
    
    const maxLeft = vRect.width - dRect.width;
    const maxTop = vRect.height - dRect.height;
    
    curLeft = Math.max(0, Math.min(maxLeft, curLeft));
    curTop = Math.max(0, Math.min(maxTop, curTop));
    
    interactionHint.style.left = `${curLeft}px`;
    interactionHint.style.top = `${curTop}px`;
  }
}

// Search function to filter prototype images
function handleSearch(query) {
  const cleanQuery = query.toLowerCase().trim();
  
  if (cleanQuery === "") {
    currentImagesList = prototypeImages.filter(img => getFolder(img.filename) === currentFolder);
    clearSearchBtn.classList.remove("visible");
  } else {
    // Search scans all images, bypassing current folder filters
    currentImagesList = prototypeImages.filter(img => 
      cleanTitle(img.filename).toLowerCase().includes(cleanQuery) || 
      img.filename.toLowerCase().includes(cleanQuery)
    );
    clearSearchBtn.classList.add("visible");
  }
  
  renderThumbnails();
  
  const newIdx = currentImagesList.findIndex(x => x.filename === activeFilename);
  if (newIdx !== -1) {
    activeImageIndex = newIdx;
  } else {
    if (currentImagesList.length > 0) {
      selectImage(0);
    } else {
      mainImage.src = "";
      activeTitle.textContent = "No Match";
      activeCounter.textContent = "0 of 0";
      clearDrawingCanvas();
    }
  }
}

// Keyboard Navigation Listeners
document.addEventListener("keydown", (e) => {
  if (document.activeElement === searchInput) return;
  
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    if (currentImagesList.length > 0) {
      const nextIdx = (activeImageIndex + 1) % currentImagesList.length;
      selectImage(nextIdx);
    }
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    if (currentImagesList.length > 0) {
      const prevIdx = (activeImageIndex - 1 + currentImagesList.length) % currentImagesList.length;
      selectImage(prevIdx);
    }
  }
});

let touchStartDist = 0;
let startScale = 1;
let startTouchX = 0;
let startTouchY = 0;
let isSimpleTap = false;
let lastTouchTime = 0;

let isSimpleMouseClick = false;
let startClickX = 0;
let startClickY = 0;

// Click-to-Navigate in Zoom Fit Mode (Right-click: Next, Left-click on 30% edges: Next/Prev)
viewport.addEventListener("mousedown", (e) => {
  if (Date.now() - lastTouchTime < 600) return;
  if (!isFitMode || isPencilMode) return;
  
  if (interactionHint.contains(e.target) || expandDockBtn.contains(e.target) || indexMenu.contains(e.target)) {
    return;
  }
  
  if (e.button === 0 || e.button === 2) {
    isSimpleMouseClick = true;
    startClickX = e.clientX;
    startClickY = e.clientY;
  }
});

// Touch gesture event listeners on mobile viewport
viewport.addEventListener("touchstart", (e) => {
  lastTouchTime = Date.now();
  if (indexMenu.contains(e.target)) return;

  if (e.touches.length === 1) {
    startTouchX = e.touches[0].clientX;
    startTouchY = e.touches[0].clientY;
    isSimpleTap = true;
    
    if (!isFitMode) {
      isDragging = true;
      startMouseX = e.touches[0].clientX;
      startMouseY = e.touches[0].clientY;
      startTx = tx;
      startTy = ty;
    }
  } else if (e.touches.length === 2) {
    isDragging = false;
    isSimpleTap = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    touchStartDist = Math.sqrt(dx * dx + dy * dy);
    
    const vw = viewport.clientWidth;
    const fitScale = vw / mainImage.naturalWidth;
    startScale = isFitMode ? fitScale : ZOOM_LEVELS[currentZoomIdx];
  }
}, { passive: true });

viewport.addEventListener("touchmove", (e) => {
  if (e.touches.length === 1) {
    const dx = Math.abs(e.touches[0].clientX - startTouchX);
    const dy = Math.abs(e.touches[0].clientY - startTouchY);
    if (dx > 10 || dy > 10) {
      isSimpleTap = false;
    }
    
    if (isDragging && !isFitMode) {
      const panDx = e.touches[0].clientX - startMouseX;
      const panDy = e.touches[0].clientY - startMouseY;
      tx = startTx + panDx;
      ty = startTy + panDy;
      updateViewportState();
    }
  } else if (e.touches.length === 2 && touchStartDist > 0) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const ratio = dist / touchStartDist;
    let newScale = startScale * ratio;
    
    const vw = viewport.clientWidth;
    const fitScale = vw / mainImage.naturalWidth;
    newScale = Math.max(fitScale, Math.min(1.5, newScale));
    
    if (newScale <= fitScale * 1.02) {
      isFitMode = true;
      tx = 0;
      ty = 0;
    } else {
      isFitMode = false;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < ZOOM_LEVELS.length; i++) {
        let diff = Math.abs(ZOOM_LEVELS[i] - newScale);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      currentZoomIdx = closestIdx;
    }
    updateViewportState();
  }
}, { passive: true });

viewport.addEventListener("touchend", (e) => {
  if (isSimpleTap && isFitMode && !isPencilMode) {
    if (interactionHint.contains(e.target) || expandDockBtn.contains(e.target) || indexMenu.contains(e.target)) {
      return;
    }
    
    const rect = viewport.getBoundingClientRect();
    const clickX = startTouchX - rect.left;
    const viewportWidth = rect.width;
    
    if (clickX < 0.3 * viewportWidth) {
      if (currentImagesList.length > 0) {
        const prevIdx = (activeImageIndex - 1 + currentImagesList.length) % currentImagesList.length;
        selectImage(prevIdx);
      }
    } else if (clickX > 0.7 * viewportWidth) {
      if (currentImagesList.length > 0) {
        const nextIdx = (activeImageIndex + 1) % currentImagesList.length;
        selectImage(nextIdx);
      }
    }
  }
  isDragging = false;
  touchStartDist = 0;
  isSimpleTap = false;
}, { passive: true });

// Prevent context menu from popping up when right clicking on viewport in Fit Mode
viewport.addEventListener("contextmenu", (e) => {
  if (isFitMode) {
    e.preventDefault();
  }
});

// Panning Event Listeners (Drag & Drop behavior on main image)
viewport.addEventListener("mousedown", (e) => {
  if (isPencilMode) return;
  if (interactionHint.contains(e.target) || expandDockBtn.contains(e.target)) return;
  if (e.button !== 0) return;
  
  isDragging = true;
  mainImage.classList.add("dragging");
  
  startMouseX = e.clientX;
  startMouseY = e.clientY;
  startTx = tx;
  startTy = ty;
  
  e.preventDefault();
});

// Mousemove Desktop Chevron Hover and Image Panning logic
viewport.addEventListener("mousemove", (e) => {
  // Show navigation chevrons and hover zone highlights on Desktop hover inside Fit mode
  if (window.innerWidth > 768 && isFitMode && !isPencilMode) {
    const rect = viewport.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    
    const leftChevron = document.getElementById("nav-chevron-left");
    const rightChevron = document.getElementById("nav-chevron-right");
    const leftZone = document.getElementById("hover-zone-left");
    const rightZone = document.getElementById("hover-zone-right");
    
    if (interactionHint.contains(e.target) || expandDockBtn.contains(e.target) || indexMenu.contains(e.target)) {
      leftChevron.classList.remove("visible-desktop");
      rightChevron.classList.remove("visible-desktop");
      leftZone.classList.remove("active");
      rightZone.classList.remove("active");
    } else if (x < 0.3 * w) {
      leftChevron.classList.add("visible-desktop");
      rightChevron.classList.remove("visible-desktop");
      leftZone.classList.add("active");
      rightZone.classList.remove("active");
    } else if (x > 0.7 * w) {
      rightChevron.classList.add("visible-desktop");
      leftChevron.classList.remove("visible-desktop");
      rightZone.classList.add("active");
      leftZone.classList.remove("active");
    } else {
      leftChevron.classList.remove("visible-desktop");
      rightChevron.classList.remove("visible-desktop");
      leftZone.classList.remove("active");
      rightZone.classList.remove("active");
    }
  }
});

viewport.addEventListener("mouseleave", () => {
  document.getElementById("nav-chevron-left").classList.remove("visible-desktop");
  document.getElementById("nav-chevron-right").classList.remove("visible-desktop");
  document.getElementById("hover-zone-left").classList.remove("active");
  document.getElementById("hover-zone-right").classList.remove("active");
});

window.addEventListener("mousemove", (e) => {
  if (isSimpleMouseClick) {
    const dx = Math.abs(e.clientX - startClickX);
    const dy = Math.abs(e.clientY - startClickY);
    if (dx > 5 || dy > 5) {
      isSimpleMouseClick = false;
    }
  }

  if (!isDragging || isPencilMode) return;
  
  const dx = e.clientX - startMouseX;
  const dy = e.clientY - startMouseY;
  
  tx = startTx + dx;
  ty = startTy + dy;
  
  updateViewportState();
});

window.addEventListener("mouseup", (e) => {
  if (isDragging) {
    isDragging = false;
    mainImage.classList.remove("dragging");
  }
  
  if (isSimpleMouseClick && isFitMode && !isPencilMode) {
    if (interactionHint.contains(e.target) || expandDockBtn.contains(e.target) || indexMenu.contains(e.target)) {
      isSimpleMouseClick = false;
      return;
    }
    
    const rect = viewport.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const viewportWidth = rect.width;
    
    if (e.button === 0) {
      if (clickX < 0.3 * viewportWidth) {
        e.preventDefault();
        if (currentImagesList.length > 0) {
          const prevIdx = (activeImageIndex - 1 + currentImagesList.length) % currentImagesList.length;
          selectImage(prevIdx);
        }
      } else if (clickX > 0.7 * viewportWidth) {
        e.preventDefault();
        if (currentImagesList.length > 0) {
          const nextIdx = (activeImageIndex + 1) % currentImagesList.length;
          selectImage(nextIdx);
        }
      }
    } else if (e.button === 2) {
      e.preventDefault();
      if (currentImagesList.length > 0) {
        const nextIdx = (activeImageIndex + 1) % currentImagesList.length;
        selectImage(nextIdx);
      }
    }
  }
  isSimpleMouseClick = false;
});

viewport.addEventListener("mouseleave", () => {
  if (isDragging) {
    isDragging = false;
    mainImage.classList.remove("dragging");
  }
});

// Mouse Wheel Zoom Focal Point Control
viewport.addEventListener("wheel", (e) => {
  if (indexMenu.contains(e.target)) return;
  
  e.preventDefault();
  if (!mainImage.naturalWidth) return;
  
  const isZoomIn = e.deltaY < 0;
  
  const vw = viewport.clientWidth;
  const fitScale = vw / mainImage.naturalWidth;
  const s_old = isFitMode ? fitScale : ZOOM_LEVELS[currentZoomIdx];
  
  let s_new = s_old;
  let newZoomIdx = currentZoomIdx;
  let newFitMode = isFitMode;
  
  if (isZoomIn) {
    if (isFitMode) {
      newFitMode = false;
      let targetIdx = 1; // Default to 100%
      for (let i = 0; i < ZOOM_LEVELS.length; i++) {
        if (ZOOM_LEVELS[i] > fitScale) {
          targetIdx = i;
          break;
        }
      }
      newZoomIdx = targetIdx;
    } else {
      if (currentZoomIdx < ZOOM_LEVELS.length - 1) {
        newZoomIdx = currentZoomIdx + 1;
      }
    }
    s_new = ZOOM_LEVELS[newZoomIdx];
  } else {
    // Zoom Out
    if (isFitMode) {
      newFitMode = false;
      let targetIdx = 0; // Default to 70%
      for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
        if (ZOOM_LEVELS[i] < fitScale) {
          targetIdx = i;
          break;
        }
      }
      newZoomIdx = targetIdx;
    } else {
      if (currentZoomIdx > 0) {
        newZoomIdx = currentZoomIdx - 1;
      }
    }
    s_new = ZOOM_LEVELS[newZoomIdx];
  }
  
  if (s_new !== s_old || newFitMode !== isFitMode) {
    clearDrawingCanvas();
    disablePencilMode();
    
    const rect = viewport.getBoundingClientRect();
    const mx = (e.clientX - rect.left) - rect.width / 2;
    const my = (e.clientY - rect.top) - rect.height / 2;
    
    const r = s_new / s_old;
    
    tx = mx - r * (mx - tx);
    ty = my - r * (my - ty);
    
    isFitMode = newFitMode;
    currentZoomIdx = newZoomIdx;
    
    updateViewportState();
  }
}, { passive: false });

// Zoom Button Click Listeners
zoomInBtn.addEventListener("click", () => {
  clearDrawingCanvas();
  disablePencilMode();
  
  if (isFitMode) {
    isFitMode = false;
    const vw = viewport.clientWidth;
    const fitScale = vw / mainImage.naturalWidth;
    
    let targetIdx = 1;
    for (let i = 0; i < ZOOM_LEVELS.length; i++) {
      if (ZOOM_LEVELS[i] > fitScale) {
        targetIdx = i;
        break;
      }
    }
    currentZoomIdx = targetIdx;
  } else {
    if (currentZoomIdx < ZOOM_LEVELS.length - 1) {
      currentZoomIdx++;
    }
  }
  tx = 0;
  ty = 0;
  updateViewportState();
});

zoomOutBtn.addEventListener("click", () => {
  clearDrawingCanvas();
  disablePencilMode();
  
  if (isFitMode) {
    isFitMode = false;
    const vw = viewport.clientWidth;
    const fitScale = vw / mainImage.naturalWidth;
    
    let targetIdx = 0;
    for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
      if (ZOOM_LEVELS[i] < fitScale) {
        targetIdx = i;
        break;
      }
    }
    currentZoomIdx = targetIdx;
  } else {
    if (currentZoomIdx > 0) {
      currentZoomIdx--;
    }
  }
  tx = 0;
  ty = 0;
  updateViewportState();
});

actualSizeBtn.addEventListener("click", () => {
  clearDrawingCanvas();
  disablePencilMode();
  
  isFitMode = false;
  currentZoomIdx = 1; // 100%
  tx = 0;
  ty = 0;
  updateViewportState();
});

fitScreenBtn.addEventListener("click", () => {
  clearDrawingCanvas();
  disablePencilMode();
  
  isFitMode = true;
  tx = 0;
  ty = 0;
  updateViewportState();
});

// Pencil Drawing Event Listeners
canvas.addEventListener("mousedown", (e) => {
  if (!isPencilMode) return;
  isDrawing = true;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  ctx.beginPath();
  ctx.moveTo(x, y);
  
  ctx.strokeStyle = "red";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  e.preventDefault();
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing || !isPencilMode) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  ctx.lineTo(x, y);
  ctx.stroke();
  
  e.preventDefault();
});

const stopDrawing = () => {
  isDrawing = false;
};
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseleave", stopDrawing);

// Toggle Pencil Mode
pencilBtn.addEventListener("click", () => {
  isPencilMode = !isPencilMode;
  if (isPencilMode) {
    pencilBtn.classList.add("active");
    canvas.style.pointerEvents = "auto";
    canvas.style.cursor = "crosshair";
    syncCanvasSize();
  } else {
    pencilBtn.classList.remove("active");
    canvas.style.pointerEvents = "none";
    canvas.style.cursor = "default";
  }
  updateViewportState();
});

// Sidebar Expand / Collapse Toggle
sidebarToggle.addEventListener("click", () => {
  isSidebarCollapsed = !isSidebarCollapsed;
  if (isSidebarCollapsed) {
    leftPanel.classList.add("collapsed");
  } else {
    leftPanel.classList.remove("collapsed");
    indexMenu.classList.remove("visible");
  }
  setTimeout(updateViewportState, 310);
});

// Index Menu Trigger listener
indexBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  renderIndexMenu();
  indexMenu.classList.toggle("visible");
});

// Header Restore Zoom trigger
headerRestoreBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  clearDrawingCanvas();
  disablePencilMode();
  isFitMode = true;
  tx = 0;
  ty = 0;
  updateViewportState();
});

// Close Index Menu if user clicks anywhere outside of it
document.addEventListener("click", (e) => {
  if (!indexMenu.contains(e.target) && e.target !== indexBtn) {
    indexMenu.classList.remove("visible");
  }
});

// Dock Navigation Click Handlers
dockPrevBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentImagesList.length > 0) {
    const prevIdx = (activeImageIndex - 1 + currentImagesList.length) % currentImagesList.length;
    selectImage(prevIdx);
  }
});

dockNextBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentImagesList.length > 0) {
    const nextIdx = (activeImageIndex + 1) % currentImagesList.length;
    selectImage(nextIdx);
  }
});

// Dragging the Bottom Dock
dockDragHandle.addEventListener("mousedown", (e) => {
  e.stopPropagation();
  isDraggingDock = true;
  const rect = interactionHint.getBoundingClientRect();
  
  dockOffsetX = e.clientX - rect.left;
  dockOffsetY = e.clientY - rect.top;
  
  interactionHint.style.transition = "none";
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!isDraggingDock) return;
  
  const vRect = viewport.getBoundingClientRect();
  const dRect = interactionHint.getBoundingClientRect();
  
  let newLeft = e.clientX - vRect.left - dockOffsetX;
  let newTop = e.clientY - vRect.top - dockOffsetY;
  
  const maxLeft = vRect.width - dRect.width;
  const maxTop = vRect.height - dRect.height;
  
  newLeft = Math.max(0, Math.min(maxLeft, newLeft));
  newTop = Math.max(0, Math.min(maxTop, newTop));
  
  interactionHint.style.left = `${newLeft}px`;
  interactionHint.style.top = `${newTop}px`;
  interactionHint.style.bottom = "auto";
  interactionHint.style.transform = "none";
});

window.addEventListener("mouseup", () => {
  if (isDraggingDock) {
    isDraggingDock = false;
    interactionHint.style.transition = "";
  }
});

// Collapse and Expand Dock
dockCollapseBtn.addEventListener("click", () => {
  interactionHint.classList.add("collapsed");
  expandDockBtn.style.display = "flex";
  indexMenu.classList.remove("visible");
});

expandDockBtn.addEventListener("click", () => {
  interactionHint.classList.remove("collapsed");
  expandDockBtn.style.display = "none";
});

// Dark/Light Theme Toggle trigger
themeToggleBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  
  const isLight = document.body.classList.contains("light-mode");
  if (isLight) {
    // Switch to Sun icon
    themeToggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
  } else {
    // Switch to Moon icon
    themeToggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
  }
});

// Search input events
searchInput.addEventListener("input", (e) => {
  handleSearch(e.target.value);
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  handleSearch("");
  searchInput.focus();
});

// Handle window resizing
window.addEventListener("resize", () => {
  updateViewportState();
  adjustDockOnResize();
  resizeWelcomeCanvas();
});

// App Initialization
function init() {
  if (defaultImageName !== "") {
    const defaultIdx = prototypeImages.findIndex(x => x.filename === defaultImageName);
    const activeIdx = defaultIdx !== -1 ? defaultIdx : 0;
    
    if (prototypeImages[activeIdx]) {
      activeFilename = prototypeImages[activeIdx].filename;
      currentFolder = getFolder(activeFilename);
    }
    currentImagesList = prototypeImages.filter(img => getFolder(img.filename) === currentFolder);
    
    renderThumbnails();
    
    const innerIdx = currentImagesList.findIndex(x => x.filename === activeFilename);
    if (innerIdx !== -1) {
      selectImage(innerIdx);
    } else if (currentImagesList.length > 0) {
      selectImage(0);
    }
  } else {
    // Welcome Screen Mode
    activeFilename = "";
    currentFolder = "";
    currentImagesList = prototypeImages.filter(img => getFolder(img.filename) === "");
    
    renderThumbnails();
    loadMainImage("");
  }
}

// Trigger setup on DOM load
document.addEventListener("DOMContentLoaded", () => {
  init();
  
  // Listen to mouse movements on welcome screen to control wind direction
  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) {
    welcomeScreen.addEventListener("mousemove", (e) => {
      const rect = welcomeScreen.getBoundingClientRect();
      welcomeMouseX = e.clientX - rect.left;
      welcomeMouseY = e.clientY - rect.top;
      lastMouseMoveTime = Date.now(); // Record mouse movement time
    });
  }
});
