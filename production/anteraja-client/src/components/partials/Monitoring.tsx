import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  markerPosition,
  rangeFor,
  shipmentStatuses,
  statusFor,
} from "../../lib/shipments";
import { useShipments } from "../../hooks/useShipments";
import { handleInternalLinkClick, navigateTo } from "../../lib/navigation";

type Props = { onNotify: (message: string) => void };

export default function Monitoring({ onNotify }: Props) {
  const {
    shipments,
    totalShipments,
    loadShipmentPage,
    updateShipment,
    advanceThermal,
  } = useShipments();
  const [selectedId, setSelectedId] = useState(
    new URLSearchParams(window.location.search).get("shipment") || "",
  );
  const [page, setPage] = useState(1);
  const [pageShipments, setPageShipments] = useState<typeof shipments>([]);
  const [pageLoadedFor, setPageLoadedFor] = useState<number | null>(null);
  const [pageError, setPageError] = useState("");
  const [running, setRunning] = useState(false);
  const tickInFlight = useRef(false);
  const selected =
    shipments.find((shipment) => shipment.id === selectedId) || shipments[0];
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(totalShipments / pageSize));
  const pageLoading = page > 1 && pageLoadedFor !== page;
  const visible =
    page === 1
      ? shipments.slice(0, pageSize)
      : pageShipments.map(
          (shipment) =>
            shipments.find((updated) => updated.id === shipment.id) ?? shipment,
        );

  useEffect(() => {
    if (page === 1) return;

    let active = true;
    void loadShipmentPage((page - 1) * pageSize, pageSize)
      .then((result) => {
        if (active) {
          setPageShipments(result.data);
          setPageError("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPageError(
            error instanceof Error
              ? error.message
              : "Daftar shipment gagal dimuat.",
          );
        }
      })
      .finally(() => {
        if (active) setPageLoadedFor(page);
      });

    return () => {
      active = false;
    };
  }, [loadShipmentPage, page]);

  const selectShipment = (id: string) => {
    setSelectedId(id);
  };
  const openThermalSimulation = (shipmentId: string) => {
    navigateTo(`/simulation?shipment=${encodeURIComponent(shipmentId)}`);
  };
  const tick = useEffectEvent(async () => {
    const shipment = shipments.find((item) => item.id === selectedId);
    if (!shipment || tickInFlight.current) return;
    tickInFlight.current = true;
    try {
      await advanceThermal(shipment.id);
    } finally {
      tickInFlight.current = false;
    }
  });
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(tick, 5000);
    return () => window.clearInterval(timer);
  }, [running, selectedId]);
  const startMonitoring = () => {
    setRunning((active) => !active);
    onNotify(running ? "Monitoring dihentikan." : "Monitoring termal dimulai.");
  };
  const currentStatus = selected
    ? statusFor(selected.thermalState.productC, selected)
    : statusFor(0);

  return (
    <section id="monitoring" className="scroll-mt-24">
      <div className="mb-5">
        <h2 className="mt-1 text-2xl font-bold">Pemantauan suhu shipment</h2>
        <p className="mt-1 text-sm text-muted">
          Simulasi pembacaan suhu setiap 5 detik selama shipment aktif.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-5">
          <div className="flex flex-wrap items-center gap-8">
            <label className="block text-xs text-muted">
              Shipment aktif
              <select
                value={selectedId}
                onChange={(event) => selectShipment(event.target.value)}
                className="mt-1 block rounded-lg border border-line px-3 py-2 text-sm font-bold text-ink"
              >
                {shipments.map((shipment) => (
                  <option value={shipment.id} key={shipment.id}>
                    {shipment.id} · {shipment.status}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <small className="block text-xs text-muted">
                Produk · rentang
              </small>
              <strong>
                {selected
                  ? `${selected.category} · ${rangeFor(selected).label}`
                  : "-"}
              </strong>
            </div>
          </div>
          <span
            className={`rounded-md px-3 py-2 text-xs font-bold ${running ? "bg-[#effaf6] text-success" : "bg-[#f8f9fa] text-muted"}`}
          >
            {running ? "Model berjalan" : "Model dijeda"}
          </span>
        </div>
        {selected && (
          <div className="grid grid-cols-2 gap-3 border-b border-line p-4 sm:grid-cols-5">
            <div className="rounded-lg bg-[#f8f9fa] p-3">
              <small className="text-xs text-muted">Udara kontainer</small>
              <strong className="mt-1 block">
                {selected.thermalState.airC.toFixed(1)}°C
              </strong>
            </div>
            <div className="rounded-lg bg-[#f8f9fa] p-3">
              <small className="text-xs text-muted">Inti produk</small>
              <strong className="mt-1 block">
                {selected.thermalState.productC.toFixed(1)}°C
              </strong>
            </div>
            <div className="rounded-lg bg-[#f8f9fa] p-3">
              <small className="text-xs text-muted">Pembacaan sensor</small>
              <strong className="mt-1 block">
                {selected.thermalState.sensorC.toFixed(1)}°C
              </strong>
            </div>
            <div className="rounded-lg bg-[#f8f9fa] p-3">
              <small className="text-xs text-muted">Pendingin</small>
              <strong
                className={`mt-1 block ${selected.thermalState.coolingActive ? "text-success" : "text-muted"}`}
              >
                {selected.thermalState.coolingActive ? "Aktif" : "Siaga"}
              </strong>
            </div>
            <label className="rounded-lg bg-[#f8f9fa] p-3 text-xs font-semibold">
              Tahap pengiriman
              <select
                value={selected.status}
                onChange={(event) => {
                  void updateShipment(selected.id, {
                    status: event.target.value,
                  });
                }}
                className="mt-1 block w-full rounded border border-line bg-white px-2 py-2 text-xs"
              >
                {shipmentStatuses.map((status) => (
                  <option value={status} key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="grid gap-6 p-6 xl:grid-cols-[1fr_1.5fr]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-[#f8f9fa] p-5">
                <p className="text-xs text-muted">Kondisi inti produk</p>
                <strong className="mt-2 block text-4xl">
                  {selected?.thermalState.productC.toFixed(1) ?? "0.0"}°C
                </strong>
                <span
                  className={`mt-3 inline-flex rounded-md px-3 py-1 text-xs font-bold ${currentStatus.bg} ${currentStatus.tone}`}
                >
                  {currentStatus.label}
                </span>
              </div>
              <div className="rounded-xl border border-line bg-[#f8f9fa] p-5">
                <p className="text-xs text-muted">Langkah model</p>
                <strong className="mt-2 block text-2xl">1 detik</strong>
                <small className="mt-2 block text-xs text-muted">
                  Tampilan diperbarui tiap 5 detik
                </small>
              </div>
            </div>
            <div className="rounded-xl border border-line p-5">
              <div className="flex justify-between text-sm font-semibold">
                <span>Rentang produk</span>
                <span className="text-anteraja">
                  {selected ? rangeFor(selected).label : "2°C - 8°C"}
                </span>
              </div>
              <div className="relative mt-5 h-3 rounded-full bg-[#bdebdc]">
                <div
                  className="absolute -top-1 h-5 w-5 rounded-full border-4 border-white bg-anteraja shadow"
                  style={{
                    left: markerPosition(
                      selected?.thermalState.productC ?? 0,
                      selected,
                    ),
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              aria-pressed={running}
              onClick={startMonitoring}
              className="w-full rounded-lg bg-anteraja px-5 py-3 font-bold text-white hover:bg-anteraja-dark"
            >
              {running ? "Jeda monitoring" : "Mulai monitoring"}
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex justify-between border-b border-line px-5 py-4">
              <strong className="text-sm">Daftar shipment</strong>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-[#f8f9fa] text-xs text-muted">
                  <tr>
                    <th className="px-5 py-3">Shipment</th>
                    <th className="px-5 py-3">Rute</th>
                    <th className="px-5 py-3">Suhu</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((shipment) => {
                    const result = statusFor(shipment.temperature, shipment);
                    return (
                      <tr className="border-t border-line" key={shipment.id}>
                        <td className="px-5 py-3 font-semibold">
                          {shipment.id}
                        </td>
                        <td className="px-5 py-3">
                          {shipment.origin} → {shipment.destination}
                        </td>
                        <td className="px-5 py-3">
                          {shipment.temperature.toFixed(1)}°C
                        </td>
                        <td className={`px-5 py-3 ${result.tone}`}>
                          {result.label}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                navigateTo(`/?edit=${encodeURIComponent(shipment.id)}`);
                              }}
                              aria-label={`Edit shipment ${shipment.id}`}
                              title="Edit shipment"
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#f3bfd9] bg-[#faeff1] text-[#bd005f]"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => openThermalSimulation(shipment.id)}
                              aria-label={`Atur set suhu ${shipment.id}`}
                              title="Atur set suhu"
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#bdebdc] bg-[#effaf6] text-[#087f5b]"
                            >
                              °C
                            </button>
                            <a
                              href={`/report?shipment=${encodeURIComponent(shipment.id)}`}
                              onClick={(event) =>
                                handleInternalLinkClick(
                                  event,
                                  `/report?shipment=${encodeURIComponent(shipment.id)}`,
                                )
                              }
                              aria-label={`Buka report ${shipment.id}`}
                              title="Buka report"
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#cfe1ff] bg-[#f1f6ff] text-[#1757a6]"
                            >
                              ▤
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pageLoading && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-4 text-center text-xs text-muted"
                      >
                        Memuat halaman...
                      </td>
                    </tr>
                  )}
                  {page > 1 && pageError && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-4 text-center text-xs text-danger"
                      >
                        {pageError}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
                <span>
                  Halaman {page} dari {totalPages} · {totalShipments} shipment
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((value) => value - 1)}
                    className="rounded border border-line px-3 py-2 hover:bg-[#f8f9fa]"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    className="rounded border border-line px-3 py-2 hover:bg-[#f8f9fa]"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 md:hidden">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">Daftar shipment</h3>
          <span className="text-xs text-muted">Data tersimpan di server</span>
        </div>
        <ul className="space-y-3" aria-label="Daftar shipment">
          {visible.length ? (
            visible.map((shipment) => {
              const result = statusFor(shipment.temperature, shipment);
              return (
                <li
                  key={shipment.id}
                  className="rounded-lg border border-line bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="break-all text-sm">{shipment.id}</strong>
                    <strong className="shrink-0 text-sm">
                      {shipment.temperature.toFixed(1)}°C
                    </strong>
                  </div>
                  <p className="mt-2 break-words text-xs text-muted">
                    {shipment.origin} → {shipment.destination}
                  </p>
                  <p className="mt-3 text-xs font-semibold">
                    {shipment.status}
                  </p>
                  <p className={`mt-1 text-xs font-bold ${result.tone}`}>
                    {result.label} · inti{" "}
                    {shipment.thermalState.productC.toFixed(1)}°C
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigateTo(`/?edit=${encodeURIComponent(shipment.id)}`);
                      }}
                      aria-label={`Edit shipment ${shipment.id}`}
                      title="Edit shipment"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#f3bfd9] bg-[#faeff1] text-[#bd005f]"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => openThermalSimulation(shipment.id)}
                      aria-label={`Atur set suhu ${shipment.id}`}
                      title="Atur set suhu"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#bdebdc] bg-[#effaf6] text-[#087f5b]"
                    >
                      °C
                    </button>
                    <a
                      href={`/report?shipment=${encodeURIComponent(shipment.id)}`}
                      onClick={(event) =>
                        handleInternalLinkClick(
                          event,
                          `/report?shipment=${encodeURIComponent(shipment.id)}`,
                        )
                      }
                      aria-label={`Buka report ${shipment.id}`}
                      title="Buka report"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#cfe1ff] bg-[#f1f6ff] text-[#1757a6]"
                    >
                      ▤
                    </a>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="rounded-lg border border-line bg-white px-4 py-6 text-center text-sm text-muted">
              Belum ada shipment.
            </li>
          )}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>
            Halaman {page} dari {totalPages} · {totalShipments} shipment
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded border border-line px-3 py-2 hover:bg-[#f8f9fa]"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded border border-line px-3 py-2 hover:bg-[#f8f9fa]"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
