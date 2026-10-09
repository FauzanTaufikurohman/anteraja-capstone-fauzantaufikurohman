import type { SimulationCommand, SimulationResult } from "../lib/thermalModel";
import { readLegacyShipments, type Shipment } from "../lib/shipments";
import { apiRequest } from "./apiClient";

type ApiResource<T> = { data: T };
export type ShipmentPage = {
  data: Shipment[];
  recordsTotal: number;
  recordsFiltered: number;
};
export type SimulationHistoryRun = {
  id: string;
  runTimestamp: string;
  totalSteps: number;
  hasExcursion: boolean;
  scenarioType: string;
};
export type SimulationHistoryPage = {
  data: SimulationHistoryRun[];
  currentPage: number;
  lastPage: number;
  total: number;
};
export type SimulationHistoryDetail = SimulationHistoryRun & {
  samples: NonNullable<SimulationResult["samples"]>;
  baseline?: SimulationHistoryRun & {
    samples: NonNullable<SimulationResult["samples"]>;
  } | null;
};
const migrationKey = "anteraja_pharma_api_migrated_v1";
let listRequest: Promise<ShipmentPage> | null = null;

export async function listShipmentPage(
  start = 0,
  length = 25,
): Promise<ShipmentPage> {
  const query = new URLSearchParams({
    draw: "0",
    start: String(start),
    length: String(length),
  });
  return apiRequest<ShipmentPage>(`/shipments?${query}`);
}

async function loadAndMigrateShipments(): Promise<ShipmentPage> {
  let page = await listShipmentPage(0, 100);
  if (localStorage.getItem(migrationKey) === "true") return page;

  const legacyShipments = readLegacyShipments();
  if (legacyShipments.length === 0) {
    localStorage.setItem(migrationKey, "true");
    return page;
  }

  const knownIds = new Set(page.data.map((shipment) => shipment.id));
  for (let start = page.data.length; start < page.recordsTotal; start += 100) {
    const nextPage = await listShipmentPage(start, 100);
    nextPage.data.forEach((shipment) => knownIds.add(shipment.id));
  }
  const shipmentsToMigrate = legacyShipments.filter(
    (shipment) => !knownIds.has(shipment.id),
  );

  for (const shipment of shipmentsToMigrate) {
    await apiRequest<ApiResource<Shipment>>("/shipments", {
      method: "POST",
      body: JSON.stringify(shipment),
    });
  }

  localStorage.setItem(migrationKey, "true");
  if (shipmentsToMigrate.length) page = await listShipmentPage(0, 100);
  return page;
}

export function listShipments(): Promise<ShipmentPage> {
  if (!listRequest) {
    listRequest = loadAndMigrateShipments().finally(() => {
      listRequest = null;
    });
  }

  return listRequest;
}

export async function createShipment(shipment: Shipment): Promise<Shipment> {
  const response = await apiRequest<ApiResource<Shipment>>("/shipments", {
    method: "POST",
    body: JSON.stringify(shipment),
  });
  return response.data;
}

export async function updateShipment(
  id: string,
  changes: Partial<Shipment>,
): Promise<Shipment> {
  const response = await apiRequest<ApiResource<Shipment>>(
    `/shipments/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(changes) },
  );
  return response.data;
}

export async function runThermalSimulation(
  shipmentId: string,
  command: SimulationCommand,
): Promise<SimulationResult> {
  const response = await apiRequest<ApiResource<SimulationResult>>(
    `/shipments/${encodeURIComponent(shipmentId)}/simulations`,
    { method: "POST", body: JSON.stringify(command) },
  );
  return response.data;
}

export async function runCorrectiveSimulation(
  shipmentId: string,
  command: SimulationCommand,
): Promise<SimulationResult> {
  const response = await apiRequest<ApiResource<SimulationResult>>(
    `/shipments/${encodeURIComponent(shipmentId)}/corrective-simulations`,
    { method: "POST", body: JSON.stringify(command) },
  );
  return response.data;
}

export async function advanceThermal(shipmentId: string): Promise<Shipment> {
  const response = await apiRequest<ApiResource<Shipment>>(
    `/shipments/${encodeURIComponent(shipmentId)}/thermal-ticks`,
    { method: "POST" },
  );
  return response.data;
}

export async function listSimulationHistory(
  shipmentId: string,
  page = 1,
): Promise<SimulationHistoryPage> {
  const query = new URLSearchParams({ page: String(page), per_page: "10" });
  return apiRequest<SimulationHistoryPage>(
    `/shipments/${encodeURIComponent(shipmentId)}/simulation-history?${query}`,
  );
}

export async function getSimulationHistoryRun(
  shipmentId: string,
  runId: string,
): Promise<SimulationHistoryDetail> {
  const response = await apiRequest<ApiResource<SimulationHistoryDetail>>(
    `/shipments/${encodeURIComponent(shipmentId)}/simulation-history/${encodeURIComponent(runId)}`,
  );
  return response.data;
}

export async function saveSimulation(
  shipmentId: string,
  command: SimulationCommand,
): Promise<string> {
  const response = await apiRequest<ApiResource<{ id: string; status: string }>>(
    `/shipments/${encodeURIComponent(shipmentId)}/simulation-runs`,
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
  return response.data.status;
}

export async function saveCorrectiveSimulation(
  shipmentId: string,
  command: SimulationCommand,
): Promise<string> {
  const response = await apiRequest<ApiResource<{ id: string; status: string }>>(
    `/shipments/${encodeURIComponent(shipmentId)}/corrective-simulation-runs`,
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
  return response.data.status;
}
