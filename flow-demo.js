(() => {
  const figure = document.getElementById("flow-demo");
  const play = figure.querySelector(".flow-play");
  const slider = figure.querySelector("#flow-time");
  const sliderTrack = slider.closest(".flow-slider");
  const readout = figure.querySelector(".flow-time-value");
  const generatedColor = getComputedStyle(figure).getPropertyValue("--generated-blue").trim();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Second coordinate of the toy velocity field in paper Fig. 2(d).
  const targetMean = 0.6;
  const targetStd = 0.25;
  const lateStart = 0.8;
  const bendStart = 0.82;
  const pivotNoise = 1.32843899;
  const gysGrid = [0, 0.298, 0.390, 0.583, 0.752, 1];
  const uniformGrid = Array.from({ length: 101 }, (_, index) => index / 100);
  const startingStates = Array.from({ length: 25 }, (_, index) => 2.25 * (index / 12 - 1));

  function velocity(value, time) {
    const scale = 1 - time + time * targetStd;
    const noise = (value - time * targetMean) / scale;
    const base = targetMean + (targetStd - 1) * noise;
    const u = Math.max(0, (time - bendStart) / (1 - bendStart));
    const midPhase = Math.max(0, (time - 0.84) / 0.16);
    const terminalPhase = Math.max(0, (time - 0.95) / 0.05);
    const gradualGain = u + 0.21291756 * u ** 2 + 0.21951923 * midPhase ** 5;
    const terminalGain = 0.60936 * terminalPhase ** 2 + terminalPhase ** 7 + 2 * terminalPhase ** 9;
    const gain = gradualGain + terminalGain;
    return base + gain * (noise - pivotNoise);
  }

  function integrate(grid, initial) {
    const states = [initial];
    for (let index = 0; index < grid.length - 1; index++) {
      const time = grid[index];
      const state = states[index];
      states.push(state + (grid[index + 1] - time) * velocity(state, time));
    }
    return states;
  }

  function makePanel(canvas) {
    const gys = canvas.dataset.flow === "gys";
    const grid = gys ? gysGrid : uniformGrid;
    const paths = startingStates.map(initial => integrate(grid, initial));
    // The affine flow maps standard Gaussian noise to a Gaussian with this center and scale.
    const mean = paths[(paths.length - 1) / 2].at(-1);
    const std = (paths.at(-1).at(-1) - paths[0].at(-1)) / (startingStates.at(-1) - startingStates[0]);
    return { canvas, grid, paths, mean, std, gys };
  }

  const detailEnd = 0.95;
  const detailPathIndex = 5;
  const tangentColor = "#996b33";

  function stateAt(grid, path, time) {
    const end = Math.max(1, grid.findIndex(node => node >= time));
    const fraction = (time - grid[end - 1]) / (grid[end] - grid[end - 1]);
    return path[end - 1] + fraction * (path[end] - path[end - 1]);
  }

  const panels = Array.from(figure.querySelectorAll(".flow-chart"), makePanel);
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
    const bottom = height - 286;
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

    const detailPath = paths[detailPathIndex];
    const incomingSlope = (detailPath[1] - detailPath[0]) / grid[1];
    const tangent = time => detailPath[0] + time * incomingSlope;
    line(x(bendStart), y(tangent(bendStart)), x(detailEnd), y(tangent(detailEnd)), tangentColor, [3, 3]);

    const segment = Math.max(0, grid.findIndex(time => time >= progress) - 1);
    const fraction = (progress - grid[segment]) / (grid[segment + 1] - grid[segment]);
    for (const [index, states] of paths.entries()) {
      const highlighted = index === 5 || index === 12 || index === 20;
      const current = states[segment] + fraction * (states[segment + 1] - states[segment]);
      ctx.beginPath();
      ctx.moveTo(left, y(states[0]));
      for (let step = 1; step <= segment; step++) ctx.lineTo(x(grid[step]), y(states[step]));
      ctx.lineTo(x(progress), y(current));
      ctx.globalAlpha = highlighted ? 1 : 0.34;
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

    const detailTop = bottom + 65;
    const detailBottom = detailTop + 87;
    const detailX = time => left + (time - bendStart) / (detailEnd - bendStart) * (right - left);
    const detailY = state => detailBottom - (state + 0.04) / 0.25 * (detailBottom - detailTop);
    label("Lower trajectory · close-up", left, detailTop - 8);
    ctx.fillStyle = "#fcf6eb";
    ctx.fillRect(left, detailTop, right - left, detailBottom - detailTop);
    for (const state of [0, 0.1, 0.2]) {
      line(left, detailY(state), right, detailY(state), "#e5e2dc");
      label(state.toFixed(1), left - 6, detailY(state) + 4, "right");
    }
    for (const time of [bendStart, 0.85, 0.90, detailEnd]) {
      const align = time === bendStart ? "left" : time === detailEnd ? "right" : "center";
      label(time.toFixed(2), detailX(time), detailBottom + 16, align);
    }

    const through = Math.min(progress, detailEnd);
    if (through > bendStart) {
      ctx.beginPath();
      ctx.moveTo(left, detailY(stateAt(grid, detailPath, bendStart)));
      for (let i = 1; i < grid.length && grid[i] < through; i++) {
        if (grid[i] > bendStart) ctx.lineTo(detailX(grid[i]), detailY(detailPath[i]));
      }
      ctx.lineTo(detailX(through), detailY(stateAt(grid, detailPath, through)));
      ctx.strokeStyle = generatedColor;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.lineTo(detailX(through), detailY(tangent(through)));
      ctx.lineTo(left, detailY(tangent(bendStart)));
      ctx.closePath();
      ctx.fillStyle = generatedColor;
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    line(left, detailY(tangent(bendStart)), right, detailY(tangent(detailEnd)), tangentColor, [4, 4]);
    if (progress >= bendStart && progress < detailEnd) {
      line(detailX(progress), detailTop, detailX(progress), detailBottom, generatedColor, [2, 4]);
    }

    label("Endpoint distribution", left, base - 62);
    line(left, base, right, base, "#a4b5c1");
    for (const tick of [-0.5, 0, 0.5, 1, 1.5]) {
      line(densityX(tick), base, densityX(tick), base + 3, "#a4b5c1");
      label(String(tick), densityX(tick), base + 17, "center");
    }

    function density(mean, std, ink, dashed = false) {
      ctx.beginPath();
      for (let index = 0; index <= 120; index++) {
        const state = -0.6 + 2.4 * index / 120;
        const amplitude = Math.exp(-0.5 * ((state - mean) / std) ** 2) * targetStd / std;
        ctx.lineTo(densityX(state), base - 51 * amplitude);
      }
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
      density(panel.mean, panel.std, generatedColor);
    }
    density(targetMean, targetStd, "#253d4d", true);
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
