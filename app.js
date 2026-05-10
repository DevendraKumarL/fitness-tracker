/* Fitness Tracker — Full Year, Multi-Year */
(() => {
  "use strict";

  const STORAGE_KEY = "fitness-tracker-v2";
  const MIN_YEAR = 2026;
  const MAX_YEAR = 2032;

  const ACTIVITIES = [
    { id: "run",      label: "Running",   icon: "🏃", color: "var(--c-run)",      hex: "#f0f0f0" },
    { id: "cycle",    label: "Cycling",   icon: "🚴", color: "var(--c-cycle)",    hex: "#c8c8c8" },
    { id: "swim",     label: "Swimming",  icon: "🏊", color: "var(--c-swim)",     hex: "#a8a8a8" },
    { id: "strength", label: "Strength",  icon: "🏋️", color: "var(--c-strength)", hex: "#b8b8b8" },
    { id: "hiit",     label: "HIIT",      icon: "⚡",  color: "var(--c-hiit)",    hex: "#787878" },
    { id: "yoga",     label: "Yoga",      icon: "🧘", color: "var(--c-yoga)",     hex: "#d0d0d0" },
    { id: "walk",     label: "Walk/Hike", icon: "🥾", color: "var(--c-walk)",     hex: "#909090" },
    { id: "cardio",   label: "Cardio",    icon: "❤️", color: "var(--c-cardio)",   hex: "#e0e0e0" },
    { id: "rest",     label: "Rest day",  icon: "😴", color: "var(--c-rest)",     hex: "#505050" },
  ];
  const ACT_BY_ID = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const MONTH_SHORT = MONTH_NAMES.map(n => n.slice(0, 3));
  const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // ---- App state ----
  let currentYear = new Date().getFullYear();
  if (currentYear < MIN_YEAR) currentYear = MIN_YEAR;
  if (currentYear > MAX_YEAR) currentYear = MAX_YEAR;

  let state = loadState();
  let pieChart = null;
  let barChart = null;

  // ---- Persistence ----
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // Also migrate old key if present
      if (!raw) {
        const old = localStorage.getItem("fitness-tracker-2026-v1");
        if (old) return JSON.parse(old);
      }
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---- Date helpers ----
  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function todayKey() {
    const t = new Date();
    return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function weekdayMon(y, m, d) { return (new Date(y, m, d).getDay() + 6) % 7; }
  function shiftDay(key, delta) {
    const [y, mo, d] = key.split("-").map(Number);
    const dt = new Date(y, mo - 1, d + delta);
    return dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  function isNextDay(a, b) { return shiftDay(a, 1) === b; }

  // A day counts towards streak only if it has at least one non-rest activity
  function isStreakDay(entry) {
    return !!(entry?.activities?.length && !entry.activities.every(id => id === "rest"));
  }

  // ---- Year selector ----
  const yearDisplayEl = document.getElementById("yearDisplay");
  const prevYearBtn   = document.getElementById("prevYear");
  const nextYearBtn   = document.getElementById("nextYear");
  const subtitleEl    = document.getElementById("subtitle");

  function updateYearUI() {
    yearDisplayEl.textContent = currentYear;
    subtitleEl.textContent = `Jan ${currentYear} → Dec ${currentYear}`;
    prevYearBtn.disabled = currentYear <= MIN_YEAR;
    nextYearBtn.disabled = currentYear >= MAX_YEAR;
  }

  prevYearBtn.addEventListener("click", () => {
    if (currentYear > MIN_YEAR) { currentYear--; updateYearUI(); refresh(); }
  });
  nextYearBtn.addEventListener("click", () => {
    if (currentYear < MAX_YEAR) { currentYear++; updateYearUI(); refresh(); }
  });

  // ---- Legend ----
  const legendEl = document.getElementById("legend");
  function renderLegend() {
    legendEl.innerHTML = ACTIVITIES.map(a => `
      <span class="pill">
        <span class="dot" style="background:${a.color}"></span>${a.icon} ${a.label}
      </span>
    `).join("");
  }

  // ---- Calendar ----
  const monthsEl = document.getElementById("months");

  function renderMonths() {
    monthsEl.innerHTML = "";
    for (let m = 0; m < 12; m++) {
      monthsEl.appendChild(buildMonth(currentYear, m));
    }
  }

  function buildMonth(year, month) {
    const wrap = document.createElement("section");
    wrap.className = "month";
    const total = daysInMonth(year, month);
    const logged = countMonthLogged(year, month);

    wrap.innerHTML = `
      <header class="month-head">
        <h2>${MONTH_NAMES[month]} <span style="color:var(--muted);font-weight:500">${year}</span></h2>
        <div class="month-head-right">
          <span class="meta">${logged} / ${total} active</span>
          <button class="print-btn" title="Print ${MONTH_NAMES[month]} ${year} to PDF" aria-label="Print month">⎙</button>
        </div>
      </header>
      <div class="weekdays">${WEEKDAYS.map(d => `<span>${d}</span>`).join("")}</div>
      <div class="grid"></div>
    `;

    wrap.querySelector(".print-btn").addEventListener("click", e => {
      e.stopPropagation();
      printMonth(year, month, wrap);
    });

    const grid = wrap.querySelector(".grid");
    const offset = weekdayMon(year, month, 1);
    for (let i = 0; i < offset; i++) {
      const el = document.createElement("div");
      el.className = "day empty";
      grid.appendChild(el);
    }
    for (let d = 1; d <= total; d++) {
      grid.appendChild(buildDay(year, month, d));
    }
    return wrap;
  }

  function buildDay(year, month, d) {
    const key = dateKey(year, month, d);
    const entry = state[key];
    const wd = weekdayMon(year, month, d);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day";
    if (wd >= 5) cell.classList.add("weekend");
    if (key === todayKey()) cell.classList.add("today");
    if (entry?.activities?.length) {
      cell.classList.add("logged");
      if (entry.intensity) cell.classList.add(`intensity-${entry.intensity}`);
    }
    cell.dataset.key = key;

    const dots = (entry?.activities || []).slice(0, 6)
      .map(id => {
        const a = ACT_BY_ID[id];
        return a ? `<span class="d" title="${a.label}" style="background:${a.color}"></span>` : "";
      }).join("");

    const minsBadge = entry?.duration ? `<span class="mins">${entry.duration}m</span>` : "";

    const tip = entry?.activities?.length
      ? `${entry.activities.map(id => ACT_BY_ID[id]?.label).filter(Boolean).join(", ")}` +
        `${entry.duration ? ` · ${entry.duration} min` : ""}` +
        `${entry.notes ? ` — ${entry.notes}` : ""}`
      : "Click to log activity";
    cell.title = tip;

    cell.innerHTML = `${minsBadge}<span class="num">${d}</span><div class="dots">${dots}</div>`;
    cell.addEventListener("click", () => openModal(key));
    return cell;
  }

  // ---- Print Month ----
  function printMonth(year, month, wrapEl) {
    const total = daysInMonth(year, month);
    const logged = countMonthLogged(year, month);

    // Build day cells HTML for the print view
    const offset = weekdayMon(year, month, 1);
    let daysHtml = "";
    for (let i = 0; i < offset; i++) daysHtml += `<div class="day empty"></div>`;
    for (let d = 1; d <= total; d++) {
      const key = dateKey(year, month, d);
      const entry = state[key];
      const wd = weekdayMon(year, month, d);
      const classes = [
        "day",
        wd >= 5 ? "weekend" : "",
        key === todayKey() ? "today" : "",
        entry?.activities?.length ? "logged" : "",
        entry?.intensity ? `intensity-${entry.intensity}` : "",
      ].filter(Boolean).join(" ");

      const dots = (entry?.activities || []).slice(0, 6)
        .map(id => {
          const a = ACT_BY_ID[id];
          return a ? `<span class="d" style="background:${a.color}"></span>` : "";
        }).join("");

      const mins = entry?.duration ? `<span class="mins">${entry.duration}m</span>` : "";
      const notesText = entry?.notes ? `<span class="print-note">${entry.notes}</span>` : "";
      const actText = entry?.activities?.length
        ? entry.activities.filter(id => id !== "rest").map(id => ACT_BY_ID[id]?.icon || "").join(" ")
        : "";

      daysHtml += `<div class="${classes}">${mins}<span class="num">${d}</span>${actText ? `<span class="act-icons">${actText}</span>` : ""}<div class="dots">${dots}</div>${notesText}</div>`;
    }

    // Compute month stats
    let monthMins = 0;
    for (let d = 1; d <= total; d++) {
      const e = state[dateKey(year, month, d)];
      if (e?.duration) monthMins += Number(e.duration) || 0;
    }

    const activitySummary = ACTIVITIES
      .map(a => {
        let count = 0;
        for (let d = 1; d <= total; d++) {
          const e = state[dateKey(year, month, d)];
          if (e?.activities?.includes(a.id)) count++;
        }
        return count > 0 ? `${a.icon} ${a.label}: ${count}` : null;
      })
      .filter(Boolean)
      .join("  ·  ");

    const w = window.open("", "_blank", "width=900,height=700");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${MONTH_NAMES[month]} ${year} — Fitness Tracker</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#fff;--bg2:#f5f5f5;--panel:#efefef;--border:#d0d0d0;
    --text:#111;--muted:#555;--accent:#111;--today-ring:#000;
    --c-run:#aaa;--c-cycle:#999;--c-swim:#888;--c-strength:#bbb;
    --c-hiit:#666;--c-yoga:#ccc;--c-walk:#777;--c-cardio:#ddd;--c-rest:#eee;
  }
  body{background:var(--bg);color:var(--text);font-family:'Rajdhani',sans-serif;padding:28px 32px;}
  .page-header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid var(--text);padding-bottom:10px;margin-bottom:18px;}
  .page-header h1{font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:900;letter-spacing:3px;text-transform:uppercase;}
  .page-header .sub{font-family:'JetBrains Mono',monospace;font-size:0.72rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
  .summary{display:flex;gap:24px;margin-bottom:16px;}
  .sum-item{display:flex;flex-direction:column;gap:2px;}
  .sum-label{font-family:'JetBrains Mono',monospace;font-size:0.62rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);}
  .sum-val{font-family:'Orbitron',sans-serif;font-size:1.1rem;font-weight:700;}
  .weekdays,.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
  .weekdays{margin-bottom:5px;}
  .weekdays span{font-family:'JetBrains Mono',monospace;font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);text-align:center;padding:3px 0;}
  .day{border:1px solid var(--border);border-radius:7px;padding:4px 5px;min-height:64px;position:relative;display:flex;flex-direction:column;background:var(--bg);}
  .day.empty{border-color:transparent;background:transparent;}
  .day.weekend .num{color:#555;}
  .day.logged{background:var(--bg2);}
  .day.today{border-color:var(--today-ring);border-width:2px;}
  .day.today .num{font-weight:900;}
  .num{font-family:'Orbitron',sans-serif;font-size:0.72rem;font-weight:700;letter-spacing:1px;color:var(--muted);}
  .day.logged .num{color:var(--text);}
  .mins{position:absolute;top:3px;right:5px;font-family:'JetBrains Mono',monospace;font-size:0.55rem;color:var(--muted);background:rgba(0,0,0,0.07);padding:1px 4px;border-radius:999px;}
  .act-icons{font-size:0.75rem;margin-top:1px;line-height:1.3;}
  .dots{display:flex;gap:3px;flex-wrap:wrap;margin-top:auto;padding-top:3px;}
  .dots .d{width:6px;height:6px;border-radius:50%;}
  .print-note{font-size:0.6rem;color:var(--muted);font-family:'JetBrains Mono',monospace;line-height:1.3;margin-top:2px;word-break:break-word;}
  .intensity-light{outline:2px solid rgba(0,0,0,0.15);}
  .intensity-moderate{outline:2px solid rgba(0,0,0,0.35);}
  .intensity-hard{outline:2px solid rgba(0,0,0,0.6);}
  .intensity-max{outline:2px solid rgba(0,0,0,0.9);}
  .activity-row{margin-top:16px;padding-top:10px;border-top:1px solid var(--border);font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--muted);letter-spacing:0.5px;}
  .footer{margin-top:14px;font-family:'JetBrains Mono',monospace;font-size:0.6rem;color:#bbb;letter-spacing:0.5px;text-align:right;}
  @media print{
    body{padding:14px 16px;}
    @page{size:A4;margin:10mm 12mm;}
  }
</style></head><body>
<div class="page-header">
  <h1>${MONTH_NAMES[month]} <span style="font-weight:500;opacity:.5">${year}</span></h1>
  <span class="sub">Fitness Tracker</span>
</div>
<div class="summary">
  <div class="sum-item"><span class="sum-label">Active days</span><span class="sum-val">${logged} / ${total}</span></div>
  <div class="sum-item"><span class="sum-label">Total minutes</span><span class="sum-val">${monthMins.toLocaleString()}</span></div>
</div>
<div class="weekdays">${WEEKDAYS.map(d => `<span>${d}</span>`).join("")}</div>
<div class="grid">${daysHtml}</div>
${activitySummary ? `<div class="activity-row">${activitySummary}</div>` : ""}
<div class="footer">Printed ${new Date().toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
</body></html>`);
    w.document.close();
    w.addEventListener("load", () => { w.focus(); w.print(); });
  }

  function countMonthLogged(year, month) {
    let count = 0;
    const total = daysInMonth(year, month);
    for (let d = 1; d <= total; d++) {
      const e = state[dateKey(year, month, d)];
      if (e?.activities?.length) count++;
    }
    return count;
  }

  // ---- Stats ----
  function renderStats() {
    const allKeys = Object.keys(state).filter(k => state[k]?.activities?.length);
    const active  = allKeys.length;
    const minutes = allKeys.reduce((s, k) => s + (Number(state[k].duration) || 0), 0);

    // Streak counts only non-rest days
    const streakKeys = allKeys.filter(k => isStreakDay(state[k])).sort();
    const streakSet  = new Set(streakKeys);

    let longest = 0, run = 0, cursor = null;
    for (const k of streakKeys) {
      run = (cursor && isNextDay(cursor, k)) ? run + 1 : 1;
      longest = Math.max(longest, run);
      cursor = k;
    }

    let current = 0, probe = todayKey();
    if (!streakSet.has(probe)) probe = shiftDay(probe, -1);
    while (streakSet.has(probe)) { current++; probe = shiftDay(probe, -1); }

    const now = new Date();
    const monthCount = countMonthLogged(now.getFullYear(), now.getMonth());

    document.getElementById("statActive").textContent  = active;
    document.getElementById("statMinutes").textContent = minutes.toLocaleString();
    document.getElementById("statStreak").textContent  = current;
    document.getElementById("statLongest").textContent = longest;
    document.getElementById("statMonth").textContent   = monthCount;
  }

  // ---- Charts ----
  function renderCharts() {
    // Aggregate data for currentYear
    const activityCounts = {};
    const monthMinutes   = new Array(12).fill(0);
    const monthDays      = new Array(12).fill(0);

    for (let m = 0; m < 12; m++) {
      const total = daysInMonth(currentYear, m);
      for (let d = 1; d <= total; d++) {
        const entry = state[dateKey(currentYear, m, d)];
        if (!entry?.activities?.length) continue;
        if (entry.duration) monthMinutes[m] += Number(entry.duration) || 0;
        monthDays[m]++;
        entry.activities.forEach(id => {
          activityCounts[id] = (activityCounts[id] || 0) + 1;
        });
      }
    }

    const hasAnyData = Object.keys(activityCounts).length > 0;

    // ---- Pie / Doughnut chart ----
    const pieCtx = document.getElementById("pieChart").getContext("2d");
    if (pieChart) pieChart.destroy();

    const pieIds     = hasAnyData ? Object.keys(activityCounts) : ACTIVITIES.map(a => a.id);
    const pieData    = hasAnyData ? pieIds.map(id => activityCounts[id]) : ACTIVITIES.map(() => 1);
    const pieColors  = pieIds.map(id => ACT_BY_ID[id]?.hex || "#888");
    const pieLabels  = pieIds.map(id => `${ACT_BY_ID[id]?.icon || ""} ${ACT_BY_ID[id]?.label || id}`);

    document.getElementById("pieChart").style.height = "180px";
    pieChart = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieData,
          backgroundColor: pieColors,
          borderColor: "#0d0d0d",
          borderWidth: 3,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "#7a7a7a",
              font: { family: "'Rajdhani', sans-serif", size: 13, weight: "600" },
              padding: 14,
              usePointStyle: true,
              pointStyleWidth: 10,
            },
          },
          tooltip: {
            backgroundColor: "#141414",
            borderColor: "#2e2e2e",
            borderWidth: 1,
            titleColor: "#f0f0f0",
            bodyColor: "#7a7a7a",
            callbacks: {
              label: ctx => hasAnyData
                ? ` ${ctx.parsed} session${ctx.parsed !== 1 ? "s" : ""}`
                : " (no data yet)",
            },
          },
        },
      },
    });

    // ---- Bar chart ----
    const barCtx = document.getElementById("barChart").getContext("2d");
    if (barChart) barChart.destroy();

    // Gradient fill per bar using canvas gradient
    const grad = barCtx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0.3)");

    const grad2 = barCtx.createLinearGradient(0, 0, 0, 260);
    grad2.addColorStop(0, "rgba(255, 255, 255, 0.35)");
    grad2.addColorStop(1, "rgba(255, 255, 255, 0.08)");

    document.getElementById("barChart").style.height = "180px";
    barChart = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: MONTH_SHORT,
        datasets: [
          {
            label: "Minutes",
            data: monthMinutes,
            backgroundColor: grad,
            borderRadius: 7,
            borderSkipped: false,
            yAxisID: "yMin",
          },
          {
            label: "Active days",
            data: monthDays,
            backgroundColor: grad2,
            borderRadius: 7,
            borderSkipped: false,
            yAxisID: "yDays",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: {
              color: "#7a7a7a",
              font: { family: "'Rajdhani', sans-serif", size: 13, weight: "600" },
              usePointStyle: true,
              pointStyleWidth: 10,
            },
          },
          tooltip: {
            backgroundColor: "#141414",
            borderColor: "#2e2e2e",
            borderWidth: 1,
            titleColor: "#f0f0f0",
            bodyColor: "#7a7a7a",
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(46,46,46,0.8)" },
            ticks: { color: "#7a7a7a", font: { family: "'JetBrains Mono', monospace", size: 11 } },
          },
          yMin: {
            position: "left",
            grid: { color: "rgba(46,46,46,0.8)" },
            ticks: { color: "#7a7a7a", font: { family: "'JetBrains Mono', monospace", size: 11 } },
            beginAtZero: true,
            title: { display: true, text: "Minutes", color: "#555555", font: { size: 11 } },
          },
          yDays: {
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { color: "#7a7a7a", font: { family: "'JetBrains Mono', monospace", size: 11 }, stepSize: 1 },
            beginAtZero: true,
            title: { display: true, text: "Days", color: "#555555", font: { size: 11 } },
          },
        },
      },
    });
  }

  // ---- Modal ----
  const modal      = document.getElementById("modal");
  const modalDate  = document.getElementById("modalDate");
  const chipsEl    = document.getElementById("activityChips");
  const durationEl = document.getElementById("duration");
  const intensityEl= document.getElementById("intensity");
  const notesEl    = document.getElementById("notes");
  let editingKey   = null;

  function buildChips() {
    chipsEl.innerHTML = ACTIVITIES.map(a => `
      <button type="button" class="chip" data-id="${a.id}" style="--c:${a.color}">
        <span class="dot"></span>${a.icon} ${a.label}
      </button>
    `).join("");
    chipsEl.addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (chip) chip.classList.toggle("selected");
    });
  }

  function openModal(key) {
    editingKey = key;
    const [y, m, d] = key.split("-").map(Number);
    modalDate.textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const entry = state[key] || {};
    [...chipsEl.querySelectorAll(".chip")].forEach(c => {
      c.classList.toggle("selected", (entry.activities || []).includes(c.dataset.id));
    });
    durationEl.value  = entry.duration  ?? "";
    intensityEl.value = entry.intensity ?? "";
    notesEl.value     = entry.notes     ?? "";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => durationEl.focus(), 50);
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    editingKey = null;
  }

  function saveModal() {
    if (!editingKey) return;
    const activities = [...chipsEl.querySelectorAll(".chip.selected")].map(c => c.dataset.id);
    const duration   = durationEl.value  ? Math.max(0, Number(durationEl.value)) : undefined;
    const intensity  = intensityEl.value || undefined;
    const notes      = notesEl.value.trim() || undefined;

    if (!activities.length && !duration && !notes) {
      delete state[editingKey];
    } else {
      state[editingKey] = { activities, duration, intensity, notes };
    }
    saveState();
    closeModal();
    refresh();
  }

  function clearDay() {
    if (!editingKey) return;
    delete state[editingKey];
    saveState();
    closeModal();
    refresh();
  }

  // ---- Export / Import / Reset ----
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `fitness-tracker-${currentYear}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj && typeof obj === "object") { state = obj; saveState(); refresh(); }
      } catch { alert("Could not parse file. Please select a valid JSON export."); }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm("Clear all logged activities? This cannot be undone.")) return;
    state = {};
    saveState();
    refresh();
  }

  // ---- Wire-up ----
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  document.getElementById("saveBtn").addEventListener("click", saveModal);
  document.getElementById("clearDay").addEventListener("click", clearDay);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !modal.classList.contains("hidden")) saveModal();
  });
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importInput").addEventListener("change", e => {
    const f = e.target.files?.[0];
    if (f) importData(f);
    e.target.value = "";
  });
  document.getElementById("resetBtn").addEventListener("click", resetAll);

  // ---- Boot ----
  function refresh() {
    renderMonths();
    renderStats();
    renderCharts();
  }

  renderLegend();
  buildChips();
  updateYearUI();
  refresh();
})();
