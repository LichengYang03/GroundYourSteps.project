(() => {
  const figure = document.getElementById("flow-demo");
  const play = figure.querySelector(".flow-play");
  const slider = figure.querySelector("#flow-time");
  const sliderTrack = slider.closest(".flow-slider");
  const readout = figure.querySelector(".flow-time-value");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Second coordinate of the toy velocity field in paper Fig. 2(d).
  const targetMean = 0.6;
  const targetStd = 0.25;
  const lateStart = 0.8;
  // Amplify the toy field’s late residual so the bend is visible at page scale.
  const lateResidualScale = 1.8;
  const gysGrid = [0, 0.298, 0.390, 0.583, 0.752, 1];
  const uniformGrid = Array.from({ length: 101 }, (_, index) => index / 100);
  const startingStates = Array.from({ length: 25 }, (_, index) => 2.25 * (index / 12 - 1));

  function velocity(value, time) {
    const scale = 1 - time + time * targetStd;
    const base = (targetStd - 1) * (value - time * targetMean) / scale + targetMean;
    const ramp = Math.max(0, (time - lateStart) / (1 - lateStart));
    const gate = ramp / (1 + Math.exp(-(time - lateStart) / 0.025));
    return base + lateResidualScale * gate * (3.2 * (value - targetMean) - 1.12);
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
    // The updates are affine, so propagating 0 and 1 gives the Gaussian endpoint law.
    const mean = integrate(grid, 0).at(-1);
    const std = integrate(grid, 1).at(-1) - mean;
    return { canvas, grid, paths, mean, std, gys, color: gys ? "#006eb8" : "#546f86" };
  }

  const panels = Array.from(figure.querySelectorAll(".flow-chart"), makePanel);
  const duration = 2000;
  const autoplayThreshold = 0.35;
  let progress = 1;
  let frame = null;
  let startTime = null;

  function drawPanel(panel) {
    const { canvas, grid, paths, color, gys } = panel;
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
    label("State X(τ)", left, 12);
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
      ctx.globalAlpha = highlighted ? 1 : 0.34;
      ctx.strokeStyle = color;
      ctx.lineWidth = highlighted ? 1.9 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (gys && highlighted) {
        for (let step = 0; step < grid.length - 1 && grid[step] <= progress; step++) {
          ctx.beginPath();
          ctx.arc(x(grid[step]), y(states[step]), 2.7, 0, 2 * Math.PI);
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }
    if (progress < 1) line(x(progress), top, x(progress), bottom, color, [2, 4]);

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
      density(panel.mean, panel.std, color);
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
