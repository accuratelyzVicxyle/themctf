(function () {
  const GRAPH_ID = "score-graph";
  const PRIMARY = "#e67514";
  const SECONDARY = "#f08a1f";
  const TEXT = "#eef1f5";
  const MUTED = "rgba(227, 232, 239, 0.72)";
  const GRID = "rgba(230, 117, 20, 0.14)";
  const FILL = "rgba(230, 117, 20, 0.16)";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function getProfileTarget() {
    const path = window.location.pathname;
    const init = window.init || {};
    const userMatch = path.match(/^\/users\/(\d+)/);
    const teamMatch = path.match(/^\/teams\/(\d+)/);

    if (teamMatch || path === "/team") {
      const id = window.TEAM?.id || init.teamId || teamMatch?.[1] || "me";
      return {
        kind: "team",
        id,
        name: window.TEAM?.name || init.teamName || "Team",
        solves: `/api/v1/teams/${id}/solves`,
        awards: `/api/v1/teams/${id}/awards`,
      };
    }

    if (userMatch || path === "/user") {
      const id = window.USER?.id || init.userId || userMatch?.[1] || "me";
      return {
        kind: "user",
        id,
        name: window.USER?.name || init.userName || "Player",
        solves: `/api/v1/users/${id}/solves`,
        awards: `/api/v1/users/${id}/awards`,
      };
    }

    return null;
  }

  async function getJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Graph request failed: ${response.status}`);
    }
    const body = await response.json();
    if (body.success === false) {
      throw new Error("Graph request was rejected");
    }
    return Array.isArray(body.data) ? body.data : [];
  }

  function getDate(entry) {
    const value = entry.date || entry.created || entry.created_at || entry.timestamp;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function getValue(entry) {
    const value = entry.challenge?.value ?? entry.award?.value ?? entry.value ?? entry.points ?? 0;
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function buildTimeline(solves, awards) {
    const events = []
      .concat(solves.map((entry) => ({ ...entry, graphType: "Solve" })))
      .concat(awards.map((entry) => ({ ...entry, graphType: "Award" })))
      .map((entry) => ({
        date: getDate(entry),
        value: getValue(entry),
        title: entry.challenge?.name || entry.name || entry.title || entry.graphType,
        type: entry.graphType,
      }))
      .filter((entry) => entry.date && entry.value !== 0)
      .sort((left, right) => left.date - right.date);

    let score = 0;
    return events.map((entry) => {
      score += entry.value;
      return { ...entry, score };
    });
  }

  function formatDate(date) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderEmpty(container, message) {
    container.classList.add("profile-score-ready");
    container.innerHTML = `<div class="profile-score-empty">${escapeHtml(message)}</div>`;
  }

  function renderChart(container, target, points) {
    if (points.length === 0) {
      renderEmpty(container, "No score activity yet");
      return;
    }

    const width = 960;
    const height = 330;
    const padding = { top: 34, right: 32, bottom: 58, left: 72 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const times = points.map((point) => point.date.getTime());
    const scores = points.map((point) => point.score);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const maxScore = Math.max(100, Math.ceil(Math.max(...scores) / 100) * 100);
    const span = Math.max(1, maxTime - minTime);

    const toX = (time) => padding.left + ((time - minTime) / span) * plotWidth;
    const toY = (score) => padding.top + plotHeight - (score / maxScore) * plotHeight;
    const line = points.map((point) => `${toX(point.date.getTime()).toFixed(1)},${toY(point.score).toFixed(1)}`).join(" ");
    const area = `${padding.left},${padding.top + plotHeight} ${line} ${padding.left + plotWidth},${padding.top + plotHeight}`;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxScore * ratio));
    const markerStep = Math.max(1, Math.ceil(points.length / 12));

    const grid = yTicks.map((tick) => {
      const y = toY(tick);
      return `
        <line class="profile-score-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}"></line>
        <text class="profile-score-axis-label" x="${padding.left - 18}" y="${y + 5}" text-anchor="end">${tick}</text>
      `;
    }).join("");

    const markers = points.map((point, index) => {
      if (index !== points.length - 1 && index % markerStep !== 0) return "";
      const x = toX(point.date.getTime());
      const y = toY(point.score);
      return `
        <g class="profile-score-marker">
          <circle cx="${x}" cy="${y}" r="5"></circle>
          <title>${escapeHtml(`${point.type}: ${point.title} (+${point.value}) - ${point.score} pts`)}</title>
        </g>
      `;
    }).join("");

    const first = points[0];
    const last = points[points.length - 1];

    container.classList.remove("d-flex", "align-items-center");
    container.classList.add("profile-score-ready");
    container.innerHTML = `
      <div class="profile-score-fallback" role="img" aria-label="${escapeHtml(target.name)} score over time">
        <div class="profile-score-header">
          <div>
            <p class="profile-score-kicker">${escapeHtml(target.kind)} score</p>
            <h3>${escapeHtml(target.name)}</h3>
          </div>
          <div class="profile-score-total">${last.score}<span>pts</span></div>
        </div>
        <svg class="profile-score-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="profile-score-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="${PRIMARY}" stop-opacity="0.28"></stop>
              <stop offset="100%" stop-color="${PRIMARY}" stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          ${grid}
          <text class="profile-score-axis-label" x="${padding.left}" y="${height - 18}" text-anchor="start">${escapeHtml(formatDate(first.date))}</text>
          <text class="profile-score-axis-label" x="${padding.left + plotWidth}" y="${height - 18}" text-anchor="end">${escapeHtml(formatDate(last.date))}</text>
          <polygon class="profile-score-area" points="${area}"></polygon>
          <polyline class="profile-score-line" points="${line}"></polyline>
          ${markers}
        </svg>
      </div>
    `;
  }

  function existingChartRendered(container) {
    return container.querySelector("canvas") && !container.querySelector(".spinner");
  }

  async function renderProfileGraph() {
    const container = document.getElementById(GRAPH_ID);
    if (!container || container.dataset.themProfileGraph === "ready") return;

    const target = getProfileTarget();
    if (!target) return;

    if (existingChartRendered(container)) {
      container.dataset.themProfileGraph = "ready";
      return;
    }

    container.dataset.themProfileGraph = "ready";
    try {
      const [solves, awards] = await Promise.all([getJson(target.solves), getJson(target.awards)]);
      renderChart(container, target, buildTimeline(solves, awards));
    } catch (error) {
      console.warn("[THEM profile graph]", error);
      renderEmpty(container, "Score graph unavailable");
    }
  }

  function scheduleRender() {
    window.setTimeout(renderProfileGraph, 450);
    window.setTimeout(renderProfileGraph, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRender, { once: true });
  } else {
    scheduleRender();
  }
})();
