// ==UserScript==
// @name         Funcode Queue Position Viewer
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Részletes stat panel a Funcode várótermeihez.
// @author       ichbinwhy
// @match        https://*.funcode.hu/*
// @grant        none
// ==/UserScript==

(function () {
  console.log("[QueueViewer] Loaded");

  let startTime = null;
  let prevPosition = null;
  let avgSpeed = null;
  let totalJoined = 0;
  let minSpeed = null;
  let maxSpeed = null;
  let countdownInterval = null;

  function handlePositionData(data) {
    const now = Date.now();
    if (!startTime) startTime = now;

    // sebesség számítás
    if (prevPosition !== null) {
      const delta = prevPosition - data.position;
      const deltaTime = (data.poll_after_ms || 1) / 1000;
      if (delta > 0) {
        const instSpeed = delta / deltaTime; // fő/sec
        totalJoined += delta;
        avgSpeed = avgSpeed ? avgSpeed * 0.7 + instSpeed * 0.3 : instSpeed;
        minSpeed = minSpeed ? Math.min(minSpeed, instSpeed) : instSpeed;
        maxSpeed = maxSpeed ? Math.max(maxSpeed, instSpeed) : instSpeed;
      }
    }
    prevPosition = data.position;

    // ETA becslés
    let etaMinutes = null;
    if (avgSpeed && avgSpeed > 0) {
      const secs = data.position / avgSpeed;
      etaMinutes = Math.ceil(secs / 60);
    }

    const elapsedMinutes = Math.floor((now - startTime) / 60000);
    const total = estimateTotal(data.position);

    if (data.position === 0) {
      hideOverlay();
    } else {
      const seconds = Math.floor((data.poll_after_ms || 0) / 1000);
      showOverlay(
        data.position,
        total,
        elapsedMinutes,
        avgSpeed,
        etaMinutes,
        totalJoined,
        minSpeed,
        maxSpeed
      );
      startCountdown(seconds);
    }
  }

  // [OBSOLETE] Total becslés progressbar alapjan. (megjegyzes: A PROGRESSBAR WIDTH NEM A QUEUEBAN LEVO EMBEREK SZAMATOL FUGG, ÍGY NEM IS HASZNALJUK EZT A FUNCTIONT.)
  function estimateTotal(position) {
    const bar = document.getElementById("progressbar");
    if (!bar) return null;
    const match = (bar.style.width || "").match(/([\d.]+)%/);
    if (!match) return null;
    const width = parseFloat(match[1]);
    if (isNaN(width) || width <= 0 || width >= 100) return null;
    return Math.round(position / (1 - width / 100));
  }

  function startCountdown(seconds) {
    clearInterval(countdownInterval);
    let remaining = seconds;
    const timerEl = document.querySelector("#refresh-timer");
    if (!timerEl) return;

    timerEl.textContent = `Következő frissítés: ${remaining}s`;

    countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        timerEl.textContent = "Frissítés folyamatban…";
      } else {
        timerEl.textContent = `Következő frissítés: ${remaining}s`;
      }
    }, 1000);
  }

  // Overlay letrehozasa
  function ensureOverlay() {
    let overlay = document.getElementById("queue-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "queue-overlay";
      overlay.style.position = "fixed";
      overlay.style.bottom = "10px";
      overlay.style.right = "10px";
      overlay.style.background = "rgba(0,0,0,0.9)";
      overlay.style.color = "lime";
      overlay.style.padding = "10px 14px";
      overlay.style.fontSize = "14px";
      overlay.style.fontFamily = "Consolas, monospace";
      overlay.style.borderRadius = "6px";
      overlay.style.zIndex = 999999;
      overlay.style.maxWidth = "320px";
      overlay.style.lineHeight = "1.4em";
      overlay.innerHTML = `
        <div id="basic"></div>
        <div id="refresh-timer">Következő frissítés: …</div>
        <button id="toggle-stats"
          style="margin-top:5px; background:#333; color:lime; border:none; padding:2px 6px; cursor:pointer; border-radius:3px;">
          ▶ Részletek
        </button>
        <div id="stat-details" style="display:none; margin-top:5px; font-size:13px; color:#ccc;"></div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector("#toggle-stats").onclick = () => {
        const det = overlay.querySelector("#stat-details");
        const btn = overlay.querySelector("#toggle-stats");
        if (det.style.display === "none") {
          det.style.display = "block";
          btn.textContent = "▼ Részletek";
        } else {
          det.style.display = "none";
          btn.textContent = "▶ Részletek";
        }
      };
    }
    return overlay;
  }

  function showOverlay(
    position,
    total,
    elapsedMinutes,
    speed,
    etaMinutes,
    totalJoined,
    minSpeed,
    maxSpeed
  ) {
    const overlay = ensureOverlay();
    overlay.style.display = "block";

    // alap adatok
    const basic = overlay.querySelector("#basic");
    basic.innerHTML = `
      <div><strong>Pozíciód:</strong> ${position}</div>
      ${
        etaMinutes
          ? `<div><strong>Várható hátralévő idő:</strong> ~${etaMinutes} perc</div>`
          : ""
      }
      ${
        total
          ? ``
          : ""
      }
    `;

    // részletek
    const det = overlay.querySelector("#stat-details");
    det.innerHTML = `
      <div><strong>Eltelt idő:</strong> ${elapsedMinutes} perc</div>
      <div><strong>Összes beengedett:</strong> ${totalJoined}</div>
      ${
        speed
          ? `<div><strong>Átlagos sebesség:</strong> ${(speed * 60).toFixed(
              1
            )} fő/perc</div>`
          : "<div>Átlagsebesség: n/a</div>"
      }
      ${
        minSpeed && maxSpeed
          ? `<div><strong>Sebesség tartomány:</strong> ${(minSpeed * 60).toFixed(
              1
            )} - ${(maxSpeed * 60).toFixed(1)} fő/perc</div>`
          : ""
      }
      ${
        etaMinutes
          ? `<div><strong>Becsült beengedés ideje:</strong> ${new Date(
              Date.now() + etaMinutes * 60000
            ).toLocaleTimeString("hu-HU", {
              hour: "2-digit",
              minute: "2-digit",
            })}</div>`
          : ""
      }
    `;
  }

  function hideOverlay() {
    const overlay = document.getElementById("queue-overlay");
    if (overlay) overlay.style.display = "none";
  }

  // --- Interception

  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const resp = await origFetch(...args);
    try {
      if (typeof args[0] === "string" && args[0].includes("/waiting-room/position")) {
        resp.clone().json().then((data) => {
          handlePositionData(data);
        });
      }
    } catch {}
    return resp;
  };

  const OrigXHR = window.XMLHttpRequest;
  function NewXHR() {
    const xhr = new OrigXHR();
    const origOpen = xhr.open;
    xhr.open = function (method, url, ...rest) {
      this._isQueue = url.includes("/waiting-room/position");
      return origOpen.call(this, method, url, ...rest);
    };
    xhr.addEventListener("load", function () {
      if (this._isQueue && this.responseText) {
        try {
          const data = JSON.parse(this.responseText);
          handlePositionData(data);
        } catch {}
      }
    });
    return xhr;
  }
  window.XMLHttpRequest = NewXHR;
})();