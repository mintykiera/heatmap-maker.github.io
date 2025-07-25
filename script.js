document.addEventListener('DOMContentLoaded', function () {
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
  const sampleBtn = document.getElementById('sampleBtn');
  const brushSizeSlider = document.getElementById('brushSize');
  const brushSizeValue = document.getElementById('brushSizeValue');
  const temperatureSlider = document.getElementById('temperature');
  const tempValue = document.getElementById('tempValue');
  const zoneCounterDisplay = document.getElementById('zoneCounter');
  const pointCounter = document.getElementById('pointCounter');
  const fpsCounter = document.getElementById('fpsCounter');

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

  drawModeBtn.classList.add('active');
  brushSizeValue.textContent = `${currentBrushSize}px`;
  tempValue.textContent = `${currentTemp}°C`;
  canvas.width = 800;
  canvas.height = 600;
  canvasContainer.style.display = 'block';
  loadSampleData();
  requestAnimationFrame(updateFpsCounter);
  setInterval(updatePerformanceStats, 1000);

  uploadArea.addEventListener('click', () => imageUpload.click());
  imageUpload.addEventListener('change', handleImageUpload);
  pointModeBtn.addEventListener('click', () => setMode('point'));
  drawModeBtn.addEventListener('click', () => setMode('draw'));
  clearBtn.addEventListener('click', clearCanvas);
  exportBtn.addEventListener('click', exportData);
  sampleBtn.addEventListener('click', loadSampleData);
  brushSizeSlider.addEventListener('input', (e) => {
    currentBrushSize = parseInt(e.target.value);
    brushSizeValue.textContent = `${currentBrushSize}px`;
  });
  temperatureSlider.addEventListener('input', (e) => {
    currentTemp = parseInt(e.target.value);
    tempValue.textContent = `${currentTemp}°C`;
  });
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  canvas.addEventListener('click', handleCanvasClick);

  tableBody.addEventListener('input', handleTableInput);
  tableBody.addEventListener('click', handleTableButtonClick);

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
        canvasContainer.style.display = 'block';
        clearCanvas();
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

  function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    [lastX, lastY] = [e.clientX - rect.left, e.clientY - rect.top];
    currentStrokePoints = [{ x: lastX, y: lastY }];
    if (currentMode === 'point') {
      addStroke();
      isDrawing = false;
    }
  }

  function draw(e) {
    if (!isDrawing || currentMode !== 'draw') return;
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      currentStrokePoints.push({ x, y });
      redrawCanvas();
      [lastX, lastY] = [x, y];
    });
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentMode === 'draw' && currentStrokePoints.length > 1) {
      addStroke();
    } else {
      redrawCanvas();
    }
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
    updateTable();
    redrawCanvas();
  }

  function handleCanvasClick(e) {
    if (isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
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
  }

  function drawHeatmap() {
    if (dataStrokes.length === 0 && !isDrawing) return;

    const allStrokes = [...dataStrokes];
    if (isDrawing && currentStrokePoints.length > 0) {
      allStrokes.push({
        id: -1,
        points: currentStrokePoints,
        temp: currentTemp,
      });
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    for (const stroke of allStrokes) {
      const isSelected = stroke.id === selectedStrokeId;
      drawStrokeOnContext(tempCtx, stroke, isSelected);
    }

    ctx.drawImage(tempCanvas, 0, 0);
  }

  function getColorForTemperature(temp) {
    const t = temp / 100;
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
    const radius = (isSelected ? 25 : 20) + (stroke.temp / 100) * 40;
    const alpha = Math.min(0.2 + (stroke.temp / 100) * 0.5, 1.0);
    targetCtx.filter = isSelected ? 'blur(18px)' : 'blur(15px)';
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
                    <input type="range" min="0" max="100" value="${
                      stroke.temp
                    }" class="temp-slider" data-id="${stroke.id}">
                    <div class="temp-input-group">
                       <input type="number" min="0" max="100" value="${
                         stroke.temp
                       }" class="temp-input" data-id="${stroke.id}">
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
                </td>
            `;
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
    } else if (
      target.classList.contains('temp-slider') ||
      target.classList.contains('temp-input')
    ) {
      let newTemp = parseInt(target.value, 10);
      if (isNaN(newTemp)) {
        return;
      }
      newTemp = Math.max(0, Math.min(100, newTemp));
      updateStrokeUI(id, newTemp);
    }
  }

  function handleTableButtonClick(e) {
    const button = e.target.closest('button.action-btn');
    if (!button) return;
    const { action, id } = button.dataset;
    const stroke = dataStrokes.find((s) => s.id === parseInt(id));
    if (!action || !stroke) return;
    if (action === 'increase') updateStrokeUI(stroke.id, stroke.temp + 1);
    else if (action === 'decrease') updateStrokeUI(stroke.id, stroke.temp - 1);
    else if (action === 'delete') {
      dataStrokes = dataStrokes.filter((s) => s.id !== stroke.id);
      if (selectedStrokeId === stroke.id) selectedStrokeId = null;
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
      row.querySelector('.temp-slider').value = stroke.temp;
      row.querySelector('.temp-input').value = stroke.temp;
      row.querySelector('.fahrenheit-cell').textContent = `${(
        (stroke.temp * 9) / 5 +
        32
      ).toFixed(1)}°F`;
    }
    redrawCanvas();
  }

  function clearCanvas() {
    dataStrokes = [];
    selectedStrokeId = null;
    zoneCounter = 1;
    redrawCanvas();
    updateTable();
  }

  function exportData() {
    if (dataStrokes.length === 0) {
      alert('No thermal data to export!');
      return;
    }
    let csvContent =
      'data:text/csv;charset=utf-8,ZoneName,PointX,PointY,ZoneTemp_C\n';
    for (const stroke of dataStrokes) {
      for (const point of stroke.points) {
        csvContent += `"${stroke.name}",${Math.round(point.x)},${Math.round(
          point.y
        )},${stroke.temp}\n`;
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
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    dataStrokes = [
      {
        id: Date.now() + 1,
        name: 'Engine Block',
        temp: 95,
        points: [
          { x: centerX - 50, y: centerY - 50 },
          { x: centerX, y: centerY - 20 },
          { x: centerX + 20, y: centerY },
        ],
      },
      {
        id: Date.now() + 2,
        name: 'Coolant Line',
        temp: 15,
        points: [
          { x: centerX + 150, y: centerY + 100 },
          { x: centerX + 120, y: centerY + 140 },
          { x: centerX + 100, y: centerY + 160 },
        ],
      },
    ];
    if (dataStrokes.length > 0) selectedStrokeId = dataStrokes[0].id;
    redrawCanvas();
    updateTable();
  }

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
