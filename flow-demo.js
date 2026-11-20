(() => {
  const figure = document.getElementById("flow-demo");
  const play = figure.querySelector(".flow-play");
  const slider = figure.querySelector("#flow-time");
  const sliderTrack = slider.closest(".flow-slider");
  const readout = figure.querySelector(".flow-time-value");
  const generatedColor = getComputedStyle(figure).getPropertyValue("--generated-blue").trim();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Toy transport adapted from paper Fig. 2(d).
  const targetMean = 0.6;
  const targetStd = 0.25;
  const lateStart = 0.8;
  const gysGrid = [0, 0.298, 0.390, 0.583, 0.752, 1];
  const uniformGrid = Array.from({ length: 101 }, (_, index) => index / 100);

  const bendStart = 0.82;
  const lateStretch = 0.09;
  const lateShift = -0.24;
  const auxiliaryScale = 0.27;

  // Representative draws for the projected fan, selected to show both bend directions.
  const fan = [
    [-2.30, 0.105], [-1.99, 0.060], [-1.72, 0.017], [-1.48, -0.032],
    [-1.29, -0.069], [-1.12, -0.104], [-0.96, -0.138], [-0.82, -0.164],
    [-0.69, -0.189], [-0.56, -0.213], [-0.43, -0.236], [-0.29, -0.26],
    [0, -0.31], [0.1875, -0.225], [0.375, -0.173], [0.5625, -0.133],
    [0.75, -0.080], [0.9375, -0.028], [1.125, 0.022], [1.3125, 0.069],
    [1.5, 0.116], [1.6875, 0.163], [1.875, 0.210], [2.0625, 0.253], [2.25, 0.290],
  ];

  function velocity(value, auxiliary, time) {
    const scale = 1 - time + time * targetStd;
    const fraction = Math.max(0, (time - bendStart) / (1 - bendStart));
    const warp = 0.8 * fraction ** 2.16 + 0.2 * fraction ** 7;
    const warpRate = (0.8 * 2.16 * fraction ** 1.16 + 0.2 * 7 * fraction ** 6) / (1 - bendStart);
    // The auxiliary noise coordinate stays fixed in this two-dimensional toy field.
    const shift = lateShift + auxiliaryScale * auxiliary;
    const noise = (value - time * targetMean - warp * shift) / (scale + warp * lateStretch);
    return targetMean + (targetStd - 1) * noise + warpRate * (lateStretch * noise + shift);
  }

  function integrate(grid, initial, auxiliary) {
    const states = [initial];
    for (let index = 0; index < grid.length - 1; index++) {
      const time = grid[index];
      const state = states[index];
      states.push(state + (grid[index + 1] - time) * velocity(state, auxiliary, time));
    }
    return states;
  }

  const densityStates = Array.from({ length: 121 }, (_, index) => -0.6 + 2.4 * index / 120);
  const bandwidth = 0.075;

  function densitySamples(mean, std) {
    const smoothedStd = Math.hypot(std, bandwidth);
    return densityStates.map(state => Math.exp(-0.5 * ((state - mean) / smoothedStd) ** 2) * targetStd / smoothedStd);
  }

  const referenceDensity = densitySamples(targetMean, targetStd);

  function makePanel(canvas) {
    const gys = canvas.dataset.flow === "gys";
    const grid = gys ? gysGrid : uniformGrid;
    const paths = fan.map(([initial, offset]) => {
      const auxiliary = (offset - lateStretch * initial - lateShift) / auxiliaryScale;
      return integrate(grid, initial, auxiliary);
    });
    // Euler updates are affine in two independent standard Gaussian coordinates.
    const mean = integrate(grid, 0, 0).at(-1);
    const std = Math.hypot(integrate(grid, 1, 0).at(-1) - mean, integrate(grid, 0, 1).at(-1) - mean);
    return { canvas, grid, paths, endpoint: densitySamples(mean, std), gys };
  }

  const panels = Array.from(figure.querySelectorAll(".flow-chart"), makePanel);
  const densityPeak = Math.max(1, ...panels.flatMap(panel => panel.endpoint));
  const duration = 1200;
  const autoplayThreshold = 0.35;
  let progress = 1;
  let frame = null;
  let startTime = null;

  function drawPanel(panel) {
    const { canvas, grid, paths, gys } = panel;
    const width = canvas.clientWidth;
    if (!width) return;
    const height = canvas.clientHeight;
    const scale = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const left = 32;
    const right = width - 12;
    const top = 24;
    const bottom = height - 134;
    const base = height - 24;
    const x = time => left + time * (right - left);
    const y = state => top + (2.5 - state) * (bottom - top) / 5;
    const densityX = state => left + (state + 0.6) * (right - left) / 2.4;

    function line(x0, y0, x1, y1, ink, dash = []) {
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function label(value, x, y, align = "left") {
      ctx.fillStyle = "#526879";
      ctx.font = '14px "Myriad Pro", sans-serif';
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
    }

    ctx.fillStyle = "#fbf0de";
    ctx.fillRect(x(lateStart), top, right - x(lateStart), bottom - top);
    for (const tick of [-2, 0, 2]) {
      line(left, y(tick), right, y(tick), "#dce5eb");
      label(String(tick), left - 7, y(tick) + 4, "right");
    }
    line(x(lateStart), top, x(lateStart), bottom, "#b48b52", [3, 4]);
    line(left, bottom, right, bottom, "#a4b5c1");
    label("State X(τ)", 0, 12);
    label("Lipschitz window", right, 12, "right");
    for (const tick of [0, 0.5, 1]) label(String(tick), x(tick), bottom + 16, "center");
    label("Flow time τ", x(0.5), bottom + 32, "center");

    const segment = grid.findIndex((time, index) => index && time >= progress) - 1;
    const fraction = (progress - grid[segment]) / (grid[segment + 1] - grid[segment]);
    for (const [index, states] of paths.entries()) {
      const highlighted = index === 5 || index === 12 || index === 20;
      const current = states[segment] + fraction * (states[segment + 1] - states[segment]);
      ctx.beginPath();
      ctx.moveTo(left, y(states[0]));
      for (let step = 1; step <= segment; step++) ctx.lineTo(x(grid[step]), y(states[step]));
      ctx.lineTo(x(progress), y(current));
      ctx.globalAlpha = highlighted ? 1 : 0.42;
      ctx.strokeStyle = generatedColor;
      ctx.lineWidth = highlighted ? 1.9 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (gys && highlighted) {
        for (let step = 0; step < grid.length - 1 && grid[step] <= progress; step++) {
          ctx.beginPath();
          ctx.arc(x(grid[step]), y(states[step]), 2.7, 0, 2 * Math.PI);
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.strokeStyle = generatedColor;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }
    if (progress < 1) line(x(progress), top, x(progress), bottom, generatedColor, [2, 4]);

    label("Endpoint distribution", left, base - 62);
    line(left, base, right, base, "#a4b5c1");
    for (const tick of [-0.5, 0, 0.5, 1, 1.5]) {
      line(densityX(tick), base, densityX(tick), base + 3, "#a4b5c1");
      label(String(tick), densityX(tick), base + 17, "center");
    }

    function density(amplitudes, ink, dashed = false) {
      ctx.beginPath();
      amplitudes.forEach((amplitude, index) => {
        ctx.lineTo(densityX(densityStates[index]), base - 51 * amplitude / densityPeak);
      });
      ctx.strokeStyle = ink;
      ctx.lineWidth = dashed ? 1.5 : 2.2;
      ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!dashed) {
        ctx.lineTo(right, base);
        ctx.lineTo(left, base);
        ctx.closePath();
        ctx.globalAlpha *= 0.16;
        ctx.fillStyle = ink;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (progress >= 0.98) {
      ctx.globalAlpha = Math.min(1, 0.2 + 40 * (progress - 0.98));
      density(panel.endpoint, generatedColor);
    }
    density(referenceDensity, "#253d4d", true);
  }

  function render(value) {
    progress = value;
    slider.value = Math.round(progress * 1000);
    sliderTrack.style.setProperty("--flow-progress", Number(slider.value) / 1000);
    slider.setAttribute("aria-valuetext", progress.toFixed(2));
    readout.textContent = progress.toFixed(2);
    panels.forEach(drawPanel);
  }

  function pause() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    play.textContent = progress === 1 ? "Replay" : "Play";
  }

  function advance(time) {
    if (startTime === null) startTime = time - progress * duration;
    const elapsed = Math.min(1, (time - startTime) / duration);
    render(elapsed);
    if (elapsed < 1) {
      frame = requestAnimationFrame(advance);
    } else {
      pause();
    }
  }

  function start() {
    if (progress === 1) render(0);
    startTime = null;
    play.textContent = "Pause";
    frame = requestAnimationFrame(advance);
  }

  play.disabled = false;
  slider.disabled = false;
  const observer = new IntersectionObserver(entries => {
    if (entries[0].intersectionRatio >= autoplayThreshold && !reducedMotion.matches) {
      start();
      observer.disconnect();
    }
  }, { threshold: autoplayThreshold });
  play.addEventListener("click", () => {
    observer.disconnect();
    if (frame === null) start();
    else pause();
  });
  slider.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    sliderTrack.classList.add("is-pressed");
    const press = new AbortController();
    const release = releaseEvent => {
      if (releaseEvent.type !== "blur" && releaseEvent.pointerId !== event.pointerId) return;
      sliderTrack.classList.remove("is-pressed");
      press.abort();
    };
    for (const type of ["pointerup", "pointercancel", "blur"]) {
      window.addEventListener(type, release, { signal: press.signal });
    }
  });
  slider.addEventListener("input", () => {
    observer.disconnect();
    render(Number(slider.value) / 1000);
    pause();
  });
  const resize = new ResizeObserver(() => panels.forEach(drawPanel));
  panels.forEach(({ canvas }) => resize.observe(canvas));
  render(1);
  document.fonts.load('14px "Myriad Pro"').then(() => panels.forEach(drawPanel), () => {});
  observer.observe(figure);
})();
