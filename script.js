document.addEventListener('DOMContentLoaded', function () {
  // --- Existing element selection ---
  const uploadArea = document.getElementById('uploadArea');
  const imageUpload = document.getElementById('imageUpload');
  const canvasContainer = document.querySelector('.canvas-container');
  const canvas = document.getElementById('heatmapCanvas');
  const ctx = canvas.getContext('2d');
  const pointModeBtn = document.getElementById('pointModeBtn');
  const drawModeBtn = document.getElementById('drawModeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const tableBody = document.getElementById('tableBody');
  const exportBtn = document.getElementById('exportBtn');
  // --- NEW: Element selection for new features ---
  const exportImageBtn = document.getElementById('exportImageBtn'); // Add this button to your HTML
  const tooltip = document.getElementById('tooltip'); // Add this div to your HTML

  const sampleBtn = document.getElementById('sampleBtn');
  const brushSizeSlider = document.getElementById('brushSize');
  const brushSizeValue = document.getElementById('brushSizeValue');
  const temperatureSlider = document.getElementById('temperature');
  const tempValue = document.getElementById('tempValue');
  const zoneCounterDisplay = document.getElementById('zoneCounter');
  const pointCounter = document.getElementById('pointCounter');
  const fpsCounter = document.getElementById('fpsCounter');

  // --- State variables ---
  let currentMode = 'draw';
  let isDrawing = false;
  let lastX = 0,
    lastY = 0;
  let dataStrokes = [];
  let currentStrokePoints = [];
  let currentImage = null;
  let currentBrushSize = 15;
  let currentTemp = 25;
  let selectedStrokeId = null;
  let zoneCounter = 1;
  const TOOLTIP_OFFSET_X = 0;
  const TOOLTIP_OFFSET_Y = -50;

  // --- NEW: Optimization variables ---
  const cachedBackgroundCanvas = document.createElement('canvas');
  const cachedBgCtx = cachedBackgroundCanvas.getContext('2d');
  let isCacheDirty = true; // Flag to check if the background cache needs updating

  // --- Initial Setup ---
  drawModeBtn.classList.add('active');
  brushSizeValue.textContent = `${currentBrushSize}px`;
  tempValue.textContent = `${currentTemp}°C`;
  canvas.width = 800;
  canvas.height = 600;
  canvasContainer.style.display = 'block';
  loadSampleData();
  requestAnimationFrame(updateFpsCounter);
  setInterval(updatePerformanceStats, 1000);

  // --- Event Listeners ---
  uploadArea.addEventListener('click', () => imageUpload.click());
  imageUpload.addEventListener('change', handleImageUpload);
  pointModeBtn.addEventListener('click', () => setMode('point'));
  drawModeBtn.addEventListener('click', () => setMode('draw'));
  clearBtn.addEventListener('click', clearCanvas);
  exportBtn.addEventListener('click', exportData);
  sampleBtn.addEventListener('click', loadSampleData);
  // --- NEW: Listener for image export ---
  exportImageBtn.addEventListener('click', exportImage);

  brushSizeSlider.addEventListener('input', (e) => {
    currentBrushSize = parseInt(e.target.value);
    brushSizeValue.textContent = `${currentBrushSize}px`;
  });
  temperatureSlider.addEventListener('input', (e) => {
    // MODIFIED: Allow float values
    currentTemp = parseFloat(e.target.value);
    tempValue.textContent = `${currentTemp.toFixed(1)}°C`;
  });

  // Mouse/Touch Events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  canvas.addEventListener('click', handleCanvasClick);
  // --- NEW: Listeners for tooltip ---
  canvas.addEventListener('mousemove', handleCanvasHover);
  canvas.addEventListener('mouseout', () => {
    tooltip.style.display = 'none';
  });

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);

  tableBody.addEventListener('input', handleTableInput);
  tableBody.addEventListener('click', handleTableButtonClick);
  tableBody.addEventListener('change', handleTableInputChange);

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        currentImage = img;
        const maxSize = 1200;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        // NEW: Resize cache canvas as well
        cachedBackgroundCanvas.width = width;
        cachedBackgroundCanvas.height = height;
        canvasContainer.style.display = 'block';
        clearCanvas(); // This will also redraw and update the cache
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setMode(mode) {
    currentMode = mode;
    pointModeBtn.classList.toggle('active', mode === 'point');
    drawModeBtn.classList.toggle('active', mode === 'draw');
  }

  function getEventCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return [x, y];
  }

  function startDrawing(e) {
    if (e.type.startsWith('touch')) e.preventDefault();
    isDrawing = true;
    [lastX, lastY] = getEventCoordinates(e);
    currentStrokePoints = [{ x: lastX, y: lastY }];

    // NEW: Optimization - Update the cache before starting a new drawing.
    if (isCacheDirty) {
      updateCachedBackground();
      isCacheDirty = false;
    }

    if (currentMode === 'point') {
      addStroke();
      isDrawing = false;
    }
  }

  function draw(e) {
    if (e.type.startsWith('touch')) e.preventDefault();
    if (!isDrawing || currentMode !== 'draw') return;

    // OPTIMIZED: Instead of a full redraw, draw on top of the cached background
    requestAnimationFrame(() => {
      const [x, y] = getEventCoordinates(e);
      currentStrokePoints.push({ x, y });

      // 1. Clear main canvas and draw the cached image of previous strokes
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(cachedBackgroundCanvas, 0, 0);

      // 2. Draw just the current, active stroke on top
      const tempStroke = {
        id: -1,
        points: currentStrokePoints,
        temp: currentTemp,
      };
      drawStrokeOnContext(ctx, tempStroke, false); // Draw current stroke without selection highlight

      [lastX, lastY] = [x, y];
    });
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentMode === 'draw' && currentStrokePoints.length > 1) {
      addStroke(); // This will trigger a full redraw and cache update
    }
    // No need for an else, addStroke() already handles the redraw
  }

  function addStroke() {
    if (currentStrokePoints.length === 0) return;
    const stroke = {
      id: Date.now(),
      name: `Zone ${zoneCounter++}`,
      points: [...currentStrokePoints],
      temp: currentTemp,
    };
    dataStrokes.push(stroke);
    selectedStrokeId = stroke.id;
    // NEW: Mark cache as dirty because a new permanent stroke was added
    isCacheDirty = true;
    updateTable();
    redrawCanvas();
  }

  // --- NEW: Tooltip Handler ---
  function handleCanvasHover(e) {
    if (isDrawing) return; // Don't show tooltips while drawing
    const [x, y] = getEventCoordinates(e);
    let hoveredStroke = null;
    let minDistance = Infinity;

    // Find the closest stroke to the cursor
    function handleCanvasHover(e) {
      if (isDrawing) return; // Don't show tooltips while drawing
      const [x, y] = getEventCoordinates(e);
      let hoveredStroke = null;
      let minDistance = Infinity;

      // Find the closest stroke to the cursor
      for (const stroke of dataStrokes) {
        for (const point of stroke.points) {
          const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
          if (distance < currentBrushSize && distance < minDistance) {
            minDistance = distance;
            hoveredStroke = stroke;
          }
        }
      }

      if (hoveredStroke) {
        tooltip.style.display = 'block';
        // MODIFIED: Use the new constants for positioning
        tooltip.style.left = `${e.clientX + TOOLTIP_OFFSET_X}px`;
        tooltip.style.top = `${e.clientY + TOOLTIP_OFFSET_Y}px`;
        tooltip.textContent = `${
          hoveredStroke.name
        }: ${hoveredStroke.temp.toFixed(1)}°C`;
      } else {
        tooltip.style.display = 'none';
      }
    }
  }

  function handleCanvasClick(e) {
    if (isDrawing) return;
    const [x, y] = getEventCoordinates(e);
    let closestStrokeId = null;
    let minDistance = Infinity;

    for (const stroke of dataStrokes) {
      for (const point of stroke.points) {
        const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
        if (distance < minDistance) {
          minDistance = distance;
          closestStrokeId = stroke.id;
        }
      }
    }
    if (minDistance < 20) {
      selectedStrokeId = closestStrokeId;
      isCacheDirty = true; // Selection changed, so cache needs update
      redrawCanvas();
      updateTable();
    }
  }

  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentImage) {
      ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#1e1f22';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawHeatmap();

    // NEW: If we are not in the middle of drawing, update the cache.
    if (!isDrawing) {
      updateCachedBackground();
      isCacheDirty = false;
    }
  }

  // --- NEW: Caching Function ---
  function updateCachedBackground() {
    cachedBgCtx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentImage) {
      cachedBgCtx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    } else {
      cachedBgCtx.fillStyle = '#1e1f22';
      cachedBgCtx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Draw all permanent strokes onto the cache
    for (const stroke of dataStrokes) {
      const isSelected = stroke.id === selectedStrokeId;
      drawStrokeOnContext(cachedBgCtx, stroke, isSelected);
    }
  }

  function drawHeatmap() {
    // This function is now simpler: just draw all strokes.
    // The logic for drawing the temporary active stroke was moved to draw()
    if (dataStrokes.length === 0) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    for (const stroke of dataStrokes) {
      const isSelected = stroke.id === selectedStrokeId;
      drawStrokeOnContext(tempCtx, stroke, isSelected);
    }

    ctx.drawImage(tempCanvas, 0, 0);
  }

  // ... (getColorForTemperature and drawStrokeOnContext functions remain unchanged) ...
  function getColorForTemperature(temp) {
    const t = Math.max(0, Math.min(100, temp)) / 100; // Clamp temp
    let r, g, b;
    if (t < 0.25) {
      r = 0;
      g = t * 4 * 255;
      b = 255;
    } else if (t < 0.5) {
      r = 0;
      g = 255;
      b = 255 * (1 - (t - 0.25) * 4);
    } else if (t < 0.75) {
      r = (t - 0.5) * 4 * 255;
      g = 255;
      b = 0;
    } else {
      r = 255;
      g = 255 * (1 - (t - 0.75) * 4);
      b = 0;
    }
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
  }

  function drawStrokeOnContext(targetCtx, stroke, isSelected) {
    const baseRadius = currentBrushSize;
    const radius = isSelected ? baseRadius * 1.2 : baseRadius;
    const alpha = Math.min(0.2 + (stroke.temp / 100) * 0.5, 1.0);
    targetCtx.filter = isSelected
      ? `blur(${baseRadius * 0.9}px)`
      : `blur(${baseRadius * 0.75}px)`;
    const { r, g, b } = getColorForTemperature(stroke.temp);

    for (const point of stroke.points) {
      const gradient = targetCtx.createRadialGradient(
        point.x,
        point.y,
        0,
        point.x,
        point.y,
        radius
      );
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      targetCtx.fillStyle = gradient;
      targetCtx.beginPath();
      targetCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      targetCtx.fill();
    }
    targetCtx.filter = 'none';
  }

  function updateTable() {
    tableBody.innerHTML = '';
    for (const stroke of dataStrokes) {
      const row = document.createElement('tr');
      row.dataset.strokeId = stroke.id;
      if (stroke.id === selectedStrokeId)
        row.style.backgroundColor = 'rgba(88, 101, 242, 0.3)';

      const fahrenheit = (stroke.temp * 9) / 5 + 32;
      row.innerHTML = `
        <td><input type="text" value="${
          stroke.name
        }" class="zone-name-input" data-id="${stroke.id}"></td>
        <td class="temp-cell">
            <input type="range" min="0" max="100" step="0.1" value="${
              stroke.temp
            }" class="temp-slider" data-id="${stroke.id}">
            <div class="temp-input-group">
                <!-- MODIFIED: Format the value with toFixed(1) for consistency -->
                <input type="number" min="0" max="100" step="0.1" value="${stroke.temp.toFixed(
                  1
                )}" class="temp-input" data-id="${stroke.id}">
                <span>°C</span>
            </div>
        </td>
        <td class="fahrenheit-cell">${fahrenheit.toFixed(1)}°F</td>
        <td class="action-cell">
            <button class="action-btn" data-action="decrease" data-id="${
              stroke.id
            }">-</button>
            <button class="action-btn" data-action="increase" data-id="${
              stroke.id
            }">+</button>
            <button class="action-btn" data-action="delete" data-id="${
              stroke.id
            }"><i class="fas fa-trash"></i></button>
        </td>`;
      tableBody.appendChild(row);
    }
  }

  function handleTableInput(e) {
    const target = e.target;
    const id = parseInt(target.dataset.id);
    const stroke = dataStrokes.find((s) => s.id === id);
    if (!stroke) return;

    if (target.classList.contains('zone-name-input')) {
      stroke.name = target.value;
    } else if (target.classList.contains('temp-slider')) {
      // MODIFIED: Only check for temp-slider here
      let newTemp = parseFloat(target.value);
      if (isNaN(newTemp)) {
        return;
      }
      newTemp = Math.max(0, Math.min(100, newTemp));
      updateStrokeUI(id, newTemp);
    }
  }

  function handleTableInputChange(e) {
    const target = e.target;
    if (!target.classList.contains('temp-input')) return; // Only act on the temp-input

    const id = parseInt(target.dataset.id);
    const stroke = dataStrokes.find((s) => s.id === id);
    if (!stroke) return;

    let newTemp = parseFloat(target.value);
    if (isNaN(newTemp)) {
      // If the input is invalid, reset it to the last known good value.
      target.value = stroke.temp.toFixed(1);
      return;
    }
    newTemp = Math.max(0, Math.min(100, newTemp));
    updateStrokeUI(id, newTemp);
  }

  function handleTableButtonClick(e) {
    const button = e.target.closest('button.action-btn');
    if (!button) return;
    const { action, id } = button.dataset;
    const stroke = dataStrokes.find((s) => s.id === parseInt(id));
    if (!action || !stroke) return;

    // MODIFIED: Handle float increments/decrements
    if (action === 'increase') updateStrokeUI(stroke.id, stroke.temp + 1);
    else if (action === 'decrease') updateStrokeUI(stroke.id, stroke.temp - 1);
    else if (action === 'delete') {
      dataStrokes = dataStrokes.filter((s) => s.id !== stroke.id);
      if (selectedStrokeId === stroke.id) selectedStrokeId = null;
      isCacheDirty = true; // A stroke was removed
      redrawCanvas();
      updateTable();
    }
  }

  function updateStrokeUI(id, newTemp) {
    const stroke = dataStrokes.find((s) => s.id === id);
    if (!stroke) return;
    stroke.temp = Math.max(0, Math.min(100, newTemp));

    const row = tableBody.querySelector(`tr[data-stroke-id="${id}"]`);
    if (row) {
      // Update both slider and input for consistent UI
      row.querySelector('.temp-slider').value = stroke.temp;
      row.querySelector('.temp-input').value = stroke.temp.toFixed(1); // Format the display
      row.querySelector('.fahrenheit-cell').textContent = `${(
        (stroke.temp * 9) / 5 +
        32
      ).toFixed(1)}°F`;
    }
    isCacheDirty = true;
    redrawCanvas();
  }

  function clearCanvas() {
    dataStrokes = [];
    selectedStrokeId = null;
    zoneCounter = 1;
    isCacheDirty = true; // Canvas cleared
    redrawCanvas();
    updateTable();
  }

  // --- NEW: Export Image Function ---
  function exportImage() {
    if (!currentImage && dataStrokes.length === 0) {
      alert('Nothing to export!');
      return;
    }
    // Use the cached canvas which already has the background and heatmap
    // If cache is dirty, update it one last time before exporting
    if (isCacheDirty) {
      updateCachedBackground();
    }

    const link = document.createElement('a');
    link.setAttribute('href', cachedBackgroundCanvas.toDataURL('image/png'));
    link.setAttribute('download', 'heatmap_export.png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportData() {
    if (dataStrokes.length === 0) {
      alert('No thermal data to export!');
      return;
    }
    // MODIFIED: Round temperature to a few decimal places for export
    let csvContent =
      'data:text/csv;charset=utf-8,ZoneName,PointX,PointY,ZoneTemp_C\n';
    for (const stroke of dataStrokes) {
      for (const point of stroke.points) {
        csvContent += `"${stroke.name}",${Math.round(point.x)},${Math.round(
          point.y
        )},${stroke.temp.toFixed(2)}\n`;
      }
    }
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'thermal_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function loadSampleData() {
    clearCanvas();
    currentImage = null;
    canvas.width = 800; // Reset canvas size for sample
    canvas.height = 600;
    cachedBackgroundCanvas.width = 800;
    cachedBackgroundCanvas.height = 600;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    dataStrokes = [
      {
        id: Date.now() + 1,
        name: 'Engine Block',
        temp: 95.5,
        points: [
          { x: centerX - 50, y: centerY - 50 },
          { x: centerX, y: centerY - 20 },
          { x: centerX + 20, y: centerY },
        ],
      },
      {
        id: Date.now() + 2,
        name: 'Coolant Line',
        temp: 15.2,
        points: [
          { x: centerX + 150, y: centerY + 100 },
          { x: centerX + 120, y: centerY + 140 },
          { x: centerX + 100, y: centerY + 160 },
        ],
      },
    ];
    if (dataStrokes.length > 0) selectedStrokeId = dataStrokes[0].id;
    isCacheDirty = true;
    redrawCanvas();
    updateTable();
  }

  // --- Performance counters (unchanged) ---
  function updatePerformanceStats() {
    zoneCounterDisplay.textContent = dataStrokes.length;
    const totalPoints = dataStrokes.reduce(
      (acc, s) => acc + s.points.length,
      0
    );
    pointCounter.textContent = totalPoints;
  }

  let frameCount = 0,
    lastFpsUpdate = 0;
  function updateFpsCounter(timestamp) {
    frameCount++;
    if (timestamp >= lastFpsUpdate + 1000) {
      fpsCounter.textContent = frameCount;
      frameCount = 0;
      lastFpsUpdate = timestamp;
    }
    requestAnimationFrame(updateFpsCounter);
  }
});
