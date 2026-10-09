const routes = {
  "/": {
    partial: "dashboard.html",
    className: "route-dashboard",
    title: "Dashboard",
  },
  "/monitoring": {
    partial: "monitoring.html",
    className: "route-monitoring",
    title: "Temperature Monitor",
  },
  "/simulation": {
    partial: "simulation.html",
    className: "route-simulation",
    title: "Disturbance Simulation",
  },
  "/report": {
    partial: "report.html",
    className: "route-report",
    title: "Report",
  },
  "/notifications": {
    partial: "notifications.html",
    className: "route-notifications",
    title: "Notifications",
  },
};
const COOKIE_KEY = "anteraja_pharma_shipments";
const PAGE_SIZE = 5;
let monitorPage = 1;
let monitorTimer;
let activeTemperatureShipmentId = null;
let editingShipmentId = null;

const toast = (message) => {
  const element = document.getElementById("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.remove("opacity-0", "translate-y-4");
  element.classList.add("opacity-100", "translate-y-0");
  window.setTimeout(() => {
    element.classList.add("opacity-0", "translate-y-4");
    element.classList.remove("opacity-100", "translate-y-0");
  }, 2400);
};
const normalizeShipments = (shipments) =>
  Array.isArray(shipments)
    ? shipments
        .filter((shipment) => shipment && shipment.id)
        .map((shipment) => ({
          ...shipment,
          temperature: Number.isFinite(Number(shipment.temperature))
            ? Number(shipment.temperature)
            : 5.5,
          weight: Number.isFinite(Number(shipment.weight))
            ? Number(shipment.weight)
            : 0,
          status: shipment.status || "Dalam pengantaran",
          category: shipment.category || "Cold chain",
        }))
    : [];
const readShipments = () => {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
  if (!match) return seedShipments();
  try {
    const shipments = normalizeShipments(
      JSON.parse(decodeURIComponent(match.split("=").slice(1).join("="))),
    );
    return shipments.length ? shipments : seedShipments();
  } catch {
    return seedShipments();
  }
};
const writeShipments = (shipments) => {
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify(shipments))}; path=/; max-age=31536000; SameSite=Lax`;
  return shipments;
};
const seedShipments = () =>
  writeShipments([
    {
      id: "DPSVA-20260924-001",
      origin: "APOTEK JAYA ABADI",
      destination: "APOTEK MANDIRI",
      category: "Cold chain",
      weight: 2.5,
      temperature: 5.5,
      status: "Dalam pengantaran",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "DPSVA-20260924-002",
      origin: "APOTEK MANDIRI",
      destination: "APOTEK GILA PHARMA",
      category: "Cold chain",
      weight: 1.2,
      temperature: 7.2,
      status: "Dalam pengantaran",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "DPSVA-20260924-003",
      origin: "APOTEK GILA PHARMA",
      destination: "APOTEK JAYA ABADI",
      category: "Ambient",
      weight: 3.1,
      temperature: 22,
      status: "Selesai",
      updatedAt: new Date().toISOString(),
    },
  ]);
const shipmentIdFromUrl = () =>
  new URLSearchParams(window.location.search).get("shipment");
const getShipment = (id) =>
  readShipments().find((shipment) => shipment.id === id) || readShipments()[0];
const updateShipment = (id, changes) => {
  const shipments = readShipments().map((shipment) =>
    shipment.id === id
      ? { ...shipment, ...changes, updatedAt: new Date().toISOString() }
      : shipment,
  );
  writeShipments(shipments);
  return shipments.find((shipment) => shipment.id === id);
};
const rangeFor = (shipment) =>
  shipment?.category?.toLowerCase().includes("ambient")
    ? { min: 15, max: 25, label: "15°C - 25°C" }
    : shipment?.category?.toLowerCase().includes("frozen")
      ? { min: -20, max: -10, label: "-20°C - -10°C" }
      : { min: 2, max: 8, label: "2°C - 8°C" };
const statusFor = (temperature, shipment) => {
  const range = rangeFor(shipment);
  return temperature < range.min
    ? { label: "Below range", tone: "text-[#1757a6]", bg: "bg-[#f1f6ff]" }
    : temperature > range.max
      ? { label: "Above range", tone: "text-danger", bg: "bg-[#fff1f0]" }
      : { label: "Normal", tone: "text-success", bg: "bg-[#effaf6]" };
};
const markerPosition = (temperature) =>
  `${Math.max(0, Math.min(100, temperature * 10))}%`;
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );

function renderDashboard() {
  if (!document.getElementById("dashboardActive")) return;
  const shipments = readShipments();
  const active = shipments.filter(
    (shipment) => shipment.status === "Dalam pengantaran",
  );
  const alerts = shipments.filter((shipment) => {
    const range = rangeFor(shipment);
    return shipment.temperature < range.min || shipment.temperature > range.max;
  });
  document.getElementById("dashboardActive").textContent = active.length;
  document.getElementById("dashboardCompleted").textContent = shipments.filter(
    (shipment) => shipment.status === "Selesai",
  ).length;
  document.getElementById("dashboardAlerts").textContent = alerts.length;
  document.getElementById("dashboardTotal").textContent = shipments.length;
  document.getElementById("dashboardShipmentTable").innerHTML = active.length
    ? active
        .map((shipment) => {
          const status = statusFor(shipment.temperature, shipment);
          return `<tr class="border-t border-line"><td class="px-4 py-3 font-semibold">${escapeHtml(shipment.id)}</td><td class="px-4 py-3">${escapeHtml(shipment.origin)} → ${escapeHtml(shipment.destination)}</td><td class="px-4 py-3">${shipment.temperature.toFixed(1)}°C</td><td class="px-4 py-3 ${status.tone}">${status.label}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-muted">Belum ada shipment dalam pengantaran.</td></tr>';
}

function populateShipmentSelect(selectId, selectedId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = readShipments()
    .map(
      (shipment) =>
        `<option value="${escapeHtml(shipment.id)}" ${shipment.id === selectedId ? "selected" : ""}>${escapeHtml(shipment.id)} · ${escapeHtml(shipment.status)}</option>`,
    )
    .join("");
}

function renderMonitoringTable() {
  const shipments = readShipments();
  const totalPages = Math.max(1, Math.ceil(shipments.length / PAGE_SIZE));
  monitorPage = Math.min(monitorPage, totalPages);
  const visible = shipments.slice(
    (monitorPage - 1) * PAGE_SIZE,
    monitorPage * PAGE_SIZE,
  );
  const table = document.getElementById("tempLog");
  if (!table) return;
  table.innerHTML = visible
    .map((shipment) => {
      const status = statusFor(shipment.temperature, shipment);
      return `<tr class="border-t border-line"><td class="px-5 py-3 font-semibold">${escapeHtml(shipment.id)}</td><td class="px-5 py-3">${escapeHtml(shipment.origin)} → ${escapeHtml(shipment.destination)}</td><td class="px-5 py-3">${shipment.temperature.toFixed(1)}°C</td><td class="px-5 py-3 ${status.tone}">${status.label}</td><td class="px-5 py-3"><div class="flex flex-wrap gap-2"><button type="button" data-edit-shipment="${escapeHtml(shipment.id)}" aria-label="Edit shipment ${escapeHtml(shipment.id)}" title="Edit shipment" class="group relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#f3bfd9] bg-[#faeff1] text-[#bd005f] transition hover:border-[#ed0677] hover:bg-[#f7dce8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed0677]"><svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span role="tooltip" class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#212121] px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Edit shipment</span></button><button type="button" data-open-temp="${escapeHtml(shipment.id)}" aria-label="Kontrol suhu ${escapeHtml(shipment.id)}" title="Kontrol suhu" class="group relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#bdebdc] bg-[#effaf6] text-[#087f5b] transition hover:border-[#15966c] hover:bg-[#dff5ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087f5b]"><svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0Z"/><path d="M12 12V6"/></svg><span role="tooltip" class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#212121] px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Kontrol suhu</span></button><a href="/report?shipment=${encodeURIComponent(shipment.id)}" aria-label="Buka report ${escapeHtml(shipment.id)}" title="Buka report" class="group relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#cfe1ff] bg-[#f1f6ff] text-[#1757a6] transition hover:border-[#1757a6] hover:bg-[#e3efff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1757a6]"><svg class="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg><span role="tooltip" class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#212121] px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Buka report</span></a></div></td></tr>`;
    })
    .join("");
  document.getElementById("monitorPageInfo").textContent =
    `Halaman ${monitorPage} dari ${totalPages} · ${shipments.length} shipment`;
  document.getElementById("monitorPrev").disabled = monitorPage === 1;
  document.getElementById("monitorNext").disabled = monitorPage === totalPages;
}

function updateVerification() {
  const input = document.getElementById("tempInput");
  const badge = document.getElementById("verificationBadge");
  if (!input || !badge) return;
  const temperature = Number(input.value) || 0;
  const selected = getShipment(
    activeTemperatureShipmentId || shipmentIdFromUrl(),
  );
  if (selected) updateShipment(selected.id, { temperature });
  document.getElementById("tempMarker")?.style &&
    (document.getElementById("tempMarker").style.left =
      markerPosition(temperature));
  const range = rangeFor(selected);
  const outsideRange = temperature < range.min || temperature > range.max;
  const notificationLink = outsideRange
    ? `<a href="/notifications?shipment=${encodeURIComponent(selected.id)}" class="mt-3 inline-flex items-center rounded-lg border border-[#e7b4b0] px-3 py-2 text-xs font-bold text-danger hover:bg-white">Lihat notifikasi</a>`
    : "";
  badge.className = `rounded-xl border p-5 ${outsideRange ? "border-[#e7b4b0] bg-[#fff6f5]" : "border-[#bdebdc] bg-[#effaf6]"}`;
  badge.innerHTML = `<div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${outsideRange ? "bg-[#b42318]" : "bg-[#15966c]"} text-lg font-bold text-white">${outsideRange ? "!" : "✓"}</div><div><strong class="block ${outsideRange ? "text-danger" : "text-success"}">${outsideRange ? "TEMPERATURE EXCURSION" : "SAFE IN RANGE"}</strong><p class="mt-1 text-sm ${outsideRange ? "text-danger" : "text-success"}">${outsideRange ? `${temperature.toFixed(1)}°C berada di luar range ${range.label}.` : `Suhu berada dalam range ${range.label}.`}</p>${notificationLink}</div></div>`;
}

function renderReport() {
  const shipment = getShipment(shipmentIdFromUrl());
  if (!shipment) return;
  const range = rangeFor(shipment);
  const status = statusFor(shipment.temperature, shipment);
  document.getElementById("reportShipmentId").textContent = shipment.id;
  document.getElementById("reportCategory").textContent = shipment.category;
  document.getElementById("reportTemperature").textContent =
    `${shipment.temperature.toFixed(1)}°C`;
  document.getElementById("reportTemperatureStatus").textContent = status.label;
  document.getElementById("reportTemperatureStatus").className =
    `text-xs ${status.tone}`;
  document.getElementById("reportRange").textContent = range.label;
  document.getElementById("reportRoute").textContent =
    `${shipment.origin} → ${shipment.destination}`;
  document.getElementById("reportWeight").textContent =
    `${shipment.weight} kg chargeable`;
  const ready =
    shipment.temperature >= range.min && shipment.temperature <= range.max;
  document.getElementById("reportStatus").textContent = ready
    ? "READY FOR SHIPMENT"
    : "HOLD FOR REVIEW";
  document.getElementById("reportStatus").className =
    `mt-1 block text-xl font-bold ${ready ? "text-success" : "text-danger"}`;
  document.getElementById("reportSummaryStatus").textContent = ready
    ? `Verified in range ${range.label}`
    : `Perlu pemeriksaan · ${status.label}`;
  document.getElementById("reportSummaryStatus").className =
    `text-sm font-bold ${ready ? "text-success" : "text-danger"}`;
}

function renderNotifications() {
  const list = document.getElementById("notificationList");
  if (!list) return;
  const alerts = readShipments().filter((shipment) => {
    const range = rangeFor(shipment);
    return shipment.temperature < range.min || shipment.temperature > range.max;
  });
  list.innerHTML = alerts.length
    ? alerts
        .map((shipment) => {
          const range = rangeFor(shipment);
          const status = statusFor(shipment.temperature, shipment);
          const above = shipment.temperature > range.max;
          return `<article class="overflow-hidden rounded-xl border border-[#e7b4b0] bg-white shadow-panel"><div class="flex gap-4 border-b border-[#f0d3d0] bg-[#fff6f5] p-6"><div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#b42318] text-xl font-bold text-white" aria-hidden="true">!</div><div><p class="text-xs font-bold uppercase tracking-wide text-danger">Temperature excursion</p><h2 class="mt-1 text-xl font-bold text-[#7a1b14]">${above ? "Melewati batas maksimum" : "Di bawah batas minimum"}</h2><p class="mt-2 text-sm leading-6 text-[#7a1b14]">${escapeHtml(shipment.id)} tercatat ${shipment.temperature.toFixed(1)}°C, di luar range ${range.label}.</p></div></div><div class="grid gap-4 p-6 sm:grid-cols-3"><div class="rounded-lg bg-[#f8f9fa] p-4"><small class="block text-xs text-muted">Range kategori</small><strong class="mt-1 block text-lg">${range.label}</strong></div><div class="rounded-lg bg-[#fff6f5] p-4"><small class="block text-xs text-muted">Status</small><strong class="mt-1 block text-lg text-danger">${status.label}</strong></div><div class="rounded-lg bg-[#f8f9fa] p-4"><small class="block text-xs text-muted">Suhu aktual</small><strong class="mt-1 block text-lg">${shipment.temperature.toFixed(1)}°C</strong></div></div><div class="flex flex-wrap gap-3 border-t border-line p-6"><a href="/monitoring?shipment=${encodeURIComponent(shipment.id)}" class="inline-flex items-center rounded-lg bg-anteraja px-5 py-3 text-sm font-bold text-white hover:bg-anteraja-dark">Buka monitoring</a><a href="/report?shipment=${encodeURIComponent(shipment.id)}" class="inline-flex items-center rounded-lg border border-line px-5 py-3 text-sm font-bold hover:bg-[#f8f9fa]">Buka report</a></div></article>`;
        })
        .join("")
    : '<div class="rounded-xl border border-[#bdebdc] bg-white p-8 shadow-panel"><p class="text-xs font-bold uppercase tracking-wide text-success">All clear</p><h2 class="mt-2 text-xl font-bold">Tidak ada notifikasi suhu aktif</h2><p class="mt-2 text-sm leading-6 text-muted">Semua shipment berada di dalam range suhu kategorinya.</p><a href="/monitoring" class="mt-5 inline-flex items-center rounded-lg border border-line px-5 py-3 text-sm font-bold hover:bg-[#f8f9fa]">Buka monitoring</a></div>';
}

function renderNotificationBadge() {
  const badge = document.querySelector(".notification-badge");
  const link = document.querySelector('[data-route="/notifications"]');
  if (!badge || !link) return;
  const count = readShipments().filter((shipment) => {
    const range = rangeFor(shipment);
    return shipment.temperature < range.min || shipment.temperature > range.max;
  }).length;
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
  link.setAttribute("aria-label", `Notifications, ${count} unread`);
}

function updatePreview() {
  const preview = document.getElementById("preview");
  const table = document.getElementById("previewTable");
  if (!preview || !table) return;
  const selected = getShipment(
    document.getElementById("simulationShipmentSelect")?.value,
  );
  if (!selected) return;
  const duration = Math.max(
    5,
    Number(document.getElementById("duration").value) || 30,
  );
  const delta = Math.max(
    0.1,
    Number(document.getElementById("delta").value) || 0.5,
  );
  const direction =
    document.querySelector('input[name="disturbance"]:checked').value === "heat"
      ? 1
      : -1;
  const values = [];
  let temperature = selected.temperature;
  for (
    let index = 0;
    index <= Math.min(Math.floor(duration / 5), 24);
    index += 1
  ) {
    values.push({ time: index * 5, temperature });
    temperature += direction * delta;
  }
  preview.textContent = `${values
    .slice(0, 8)
    .map((value) => value.temperature.toFixed(1))
    .join(" → ")}${values.length > 8 ? " …" : ""}°C`;
  table.innerHTML = values
    .map((value) => {
      const status = statusFor(value.temperature, selected);
      return `<tr class="border-t border-line"><td class="px-6 py-3">${value.time}s</td><td class="px-6 py-3 font-semibold">${value.temperature.toFixed(1)}°C</td><td class="px-6 py-3 ${status.tone}">${status.label}</td></tr>`;
    })
    .join("");
}

function bindInteractions() {
  const route = window.location.pathname;
  document
    .querySelectorAll(".nav-item")
    .forEach((link) =>
      link.classList.toggle(
        "active",
        link.dataset.route === window.location.pathname,
      ),
    );
  renderNotificationBadge();
  document
    .querySelectorAll("[data-close-modal]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        document
          .getElementById(button.dataset.closeModal)
          ?.classList.add("hidden"),
      ),
    );
  document
    .getElementById("openShipmentModal")
    ?.addEventListener("click", () => {
      document.getElementById("shipmentModal").classList.remove("hidden");
      document.getElementById("shipmentOrigin").focus();
    });
  if (
    route === "/" &&
    new URLSearchParams(window.location.search).get("edit")
  ) {
    editingShipmentId = new URLSearchParams(window.location.search).get("edit");
    const editing = getShipment(editingShipmentId);
    if (editing) {
      document.getElementById("shipmentOrigin").value = editing.origin;
      document.getElementById("shipmentDestination").value =
        editing.destination;
      document.getElementById("shipmentWeight").value = editing.weight;
      document
        .querySelector(`input[name="category"][value="${editing.category}"]`)
        ?.click();
      document.getElementById("shipmentModal").classList.remove("hidden");
    }
  }
  document
    .getElementById("shipmentForm")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const shipments = readShipments();
      const id =
        editingShipmentId ||
        `DPSVA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(shipments.length + 1).padStart(3, "0")}`;
      const current = shipments.find((shipment) => shipment.id === id);
      const shipment = {
        id,
        origin: document.getElementById("shipmentOrigin").value,
        destination: document.getElementById("shipmentDestination").value,
        category:
          document.querySelector('input[name="category"]:checked')?.value ||
          "Cold chain",
        weight: Number(document.getElementById("shipmentWeight").value) || 0,
        temperature: current?.temperature ?? 5.5,
        status: current?.status ?? "Dalam pengantaran",
        updatedAt: new Date().toISOString(),
      };
      writeShipments(
        current
          ? shipments.map((item) => (item.id === id ? shipment : item))
          : [...shipments, shipment],
      );
      document.getElementById("shipmentModal").classList.add("hidden");
      toast(current ? "Shipment diperbarui." : "Shipment baru tersimpan.");
      renderDashboard();
    });
  if (route === "/") renderDashboard();
  if (route === "/monitoring") {
    const selected = getShipment(shipmentIdFromUrl());
    populateShipmentSelect("monitorShipmentSelect", selected?.id);
    if (selected) {
      document.getElementById("liveTemp").textContent =
        `${selected.temperature.toFixed(1)}°C`;
      document.getElementById("monitorMarker").style.left = markerPosition(
        selected.temperature,
      );
      document.getElementById("liveBadge").textContent = statusFor(
        selected.temperature,
        selected,
      ).label;
      document.getElementById("monitorProduct").textContent =
        `${selected.category} · ${rangeFor(selected).label}`;
    }
    renderMonitoringTable();
    document.getElementById("tempLog")?.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-open-temp], [data-edit-shipment]",
      );
      if (!button) return;
      const shipmentId = button.dataset.openTemp || button.dataset.editShipment;
      if (button.dataset.editShipment) {
        window.location.href = `/?edit=${encodeURIComponent(shipmentId)}`;
        return;
      }
      const shipment = getShipment(shipmentId);
      activeTemperatureShipmentId = shipment.id;
      document.getElementById("temperatureShipmentLabel").textContent =
        `${shipment.id} · ${shipment.origin} → ${shipment.destination}`;
      document.getElementById("tempInput").value = shipment.temperature;
      document.getElementById("temperatureModal").classList.remove("hidden");
      updateVerification();
      document.getElementById("tempInput").focus();
    });
    document
      .getElementById("temperatureForm")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        updateVerification();
        document.getElementById("temperatureModal").classList.add("hidden");
        renderMonitoringTable();
        toast("Pemeriksaan suhu tersimpan.");
      });
    document
      .getElementById("monitorShipmentSelect")
      ?.addEventListener("change", (event) => {
        const shipment = getShipment(event.target.value);
        document.getElementById("liveTemp").textContent =
          `${shipment.temperature.toFixed(1)}°C`;
        document.getElementById("monitorMarker").style.left = markerPosition(
          shipment.temperature,
        );
        document.getElementById("liveBadge").textContent = statusFor(
          shipment.temperature,
          shipment,
        ).label;
        document.getElementById("monitorProduct").textContent =
          `${shipment.category} · ${rangeFor(shipment).label}`;
      });
    document.getElementById("monitorPrev")?.addEventListener("click", () => {
      monitorPage -= 1;
      renderMonitoringTable();
    });
    document.getElementById("monitorNext")?.addEventListener("click", () => {
      monitorPage += 1;
      renderMonitoringTable();
    });
    document.getElementById("startMonitor")?.addEventListener("click", () => {
      clearInterval(monitorTimer);
      const selectedId = document.getElementById("monitorShipmentSelect").value;
      monitorTimer = window.setInterval(() => {
        const shipment = getShipment(selectedId);
        updateShipment(selectedId, {
          temperature: Math.max(
            0,
            Number(
              (shipment.temperature + (Math.random() * 0.2 - 0.1)).toFixed(1),
            ),
          ),
        });
        renderMonitoringTable();
        renderDashboard();
      }, 5000);
      toast("Monitoring dimulai dan data disimpan di cookie.");
    });
  }
  if (route === "/simulation") {
    const selected = getShipment(shipmentIdFromUrl());
    populateShipmentSelect("simulationShipmentSelect", selected?.id);
    const updateSimulationSummary = () => {
      const shipment = getShipment(
        document.getElementById("simulationShipmentSelect")?.value,
      );
      if (!shipment) return;
      document.getElementById("simulationShipmentRoute").textContent =
        `${shipment.origin} → ${shipment.destination}`;
      document.getElementById("simulationShipmentState").textContent =
        `${shipment.category} · ${shipment.temperature.toFixed(1)}°C · ${rangeFor(shipment).label}`;
    };
    document
      .getElementById("simulationShipmentSelect")
      ?.addEventListener("change", () => {
        updateSimulationSummary();
        updatePreview();
      });
    ["duration", "delta"].forEach((id) =>
      document.getElementById(id)?.addEventListener("input", updatePreview),
    );
    document
      .querySelectorAll('input[name="disturbance"]')
      .forEach((input) => input.addEventListener("change", updatePreview));
    document
      .getElementById("startDisturbance")
      ?.addEventListener("click", () => {
        clearInterval(monitorTimer);
        const selectedId = document.getElementById(
          "simulationShipmentSelect",
        ).value;
        const direction =
          document.querySelector('input[name="disturbance"]:checked').value ===
          "heat"
            ? 1
            : -1;
        const delta = Math.max(
          0.1,
          Number(document.getElementById("delta").value) || 0.5,
        );
        const duration = Math.max(
          5,
          Number(document.getElementById("duration").value) || 30,
        );
        let elapsed = 0;
        monitorTimer = window.setInterval(() => {
          const shipment = getShipment(selectedId);
          updateShipment(selectedId, {
            temperature: Number(
              (shipment.temperature + direction * delta).toFixed(1),
            ),
          });
          elapsed += 5;
          updateSimulationSummary();
          updatePreview();
          if (elapsed >= duration) {
            clearInterval(monitorTimer);
            toast("Simulasi selesai dan data tersimpan.");
          }
        }, 5000);
        toast("Simulasi berjalan. Buka monitoring untuk melihat perubahan.");
      });
    updateSimulationSummary();
    updatePreview();
  }
  if (route === "/simulation") {
    const button = document.getElementById("startDisturbance");
    const status = document.getElementById("simulationStatus");
    button?.addEventListener("pointerdown", () => {
      const duration = Math.max(
        5,
        Number(document.getElementById("duration").value) || 30,
      );
      status.textContent = `Simulasi berjalan selama ${duration} detik. Perubahan disimpan setiap 5 detik.`;
      status.className =
        "rounded-lg border border-[#cfe1ff] bg-[#f1f6ff] px-4 py-3 text-sm text-[#1757a6]";
      button.textContent = "Simulasi berjalan...";
      window.setTimeout(
        () => {
          status.textContent =
            "Simulasi selesai. Data shipment sudah diperbarui di browser.";
          status.className =
            "rounded-lg border border-[#bdebdc] bg-[#effaf6] px-4 py-3 text-sm text-success";
          button.textContent = "Jalankan simulasi lagi";
        },
        duration * 1000 + 250,
      );
    });
  }
  if (route === "/report") {
    renderReport();
    document
      .getElementById("printReport")
      ?.addEventListener("click", () => window.print());
  }
  if (route === "/notifications") renderNotifications();
}

async function loadPage() {
  const route = routes[window.location.pathname] || routes["/"];
  document.body.classList.add(route.className);
  document.title = `Anteraja Pharma | ${route.title}`;
  const sidebar = await fetch("partials/sidebar.html");
  document.getElementById("sidebar-partial").innerHTML = await sidebar.text();
  const page = await fetch(`partials/${route.partial}`);
  document.getElementById("page-partial").innerHTML = await page.text();
  bindInteractions();
}
loadPage().catch(() =>
  toast("Halaman belum dapat dimuat. Jalankan melalui local server."),
);
