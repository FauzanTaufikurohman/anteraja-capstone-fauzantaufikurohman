export type ThermalConfig = {
  setpointC: number;
  ambientC: number;
  enclosureConductanceWPerK: number;
  productSpecificHeatJPerKgK: number;
  productConductanceWPerK: number;
  airHeatCapacityJPerK: number;
  coolingCapacityW: number;
  coolingEfficiency: number;
  sensorTimeConstantSeconds: number;
  sensorOffsetC: number;
  hysteresisC: number;
  doorOpen: boolean;
  powerAvailable: boolean;
};

export type ThermalState = {
  airC: number;
  productC: number;
  sensorC: number;
  coolingActive: boolean;
  elapsedSeconds: number;
};

export type Shipment = {
  id: string;
  origin: string;
  destination: string;
  category: string;
  weight: number;
  temperature: number;
  status: string;
  updatedAt: string;
  thermalConfig: ThermalConfig;
  thermalState: ThermalState;
};

export type TemperatureRange = { min: number; max: number; label: string };

export const shipmentStatuses = [
  "Dalam persiapan",
  "Siap dikirim",
  "Dalam pengantaran",
  "Ditahan",
  "Karantina",
  "Selesai",
] as const;

const STORAGE_KEY = "anteraja_pharma_shipments_v2";
const LEGACY_COOKIE_KEY = "anteraja_pharma_shipments";

export const rangeFor = (
  shipment?: Pick<Shipment, "category">,
): TemperatureRange =>
  shipment?.category.toLowerCase().includes("ambient")
    ? { min: 15, max: 25, label: "15°C - 25°C" }
    : shipment?.category.toLowerCase().includes("frozen")
      ? { min: -20, max: -10, label: "-20°C - -10°C" }
      : { min: 2, max: 8, label: "2°C - 8°C" };

export const createThermalConfig = (category: string): ThermalConfig => {
  const range = rangeFor({ category });
  return {
    setpointC: (range.min + range.max) / 2,
    ambientC: 30,
    enclosureConductanceWPerK: 1.2,
    productSpecificHeatJPerKgK: 3500,
    productConductanceWPerK: 2.4,
    airHeatCapacityJPerK: 2500,
    coolingCapacityW: category.toLowerCase().includes("ambient") ? 0 : 120,
    coolingEfficiency: 1,
    sensorTimeConstantSeconds: 15,
    sensorOffsetC: 0,
    hysteresisC: 1,
    doorOpen: false,
    powerAvailable: true,
  };
};

export const createThermalState = (temperatureC: number): ThermalState => ({
  airC: temperatureC,
  productC: temperatureC,
  sensorC: temperatureC,
  coolingActive: false,
  elapsedSeconds: 0,
});

const seedShipments: Shipment[] = [
  {
    id: "DPSVA-20260924-001",
    origin: "APOTEK JAYA ABADI",
    destination: "APOTEK MANDIRI",
    category: "Cold chain",
    weight: 2.5,
    temperature: 5.5,
    status: "Dalam pengantaran",
    updatedAt: new Date().toISOString(),
    thermalConfig: createThermalConfig("Cold chain"),
    thermalState: createThermalState(5.5),
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
    thermalConfig: createThermalConfig("Cold chain"),
    thermalState: createThermalState(7.2),
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
    thermalConfig: createThermalConfig("Ambient"),
    thermalState: createThermalState(22),
  },
];

const finiteOr = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const normalizeShipments = (value: unknown): Shipment[] =>
  Array.isArray(value)
    ? value
        .filter((shipment): shipment is Record<string, unknown> =>
          Boolean(shipment && typeof shipment === "object" && "id" in shipment),
        )
        .map((shipment) => {
          const category = String(shipment.category || "Cold chain");
          const weight = Math.max(0.1, finiteOr(shipment.weight, 1));
          const temperature = finiteOr(
            shipment.temperature,
            rangeFor({ category }).min,
          );
          const defaults = createThermalConfig(category);
          const storedConfig = shipment.thermalConfig as
            | Partial<ThermalConfig>
            | undefined;
          const storedState = shipment.thermalState as
            | Partial<ThermalState>
            | undefined;
          const thermalConfig = { ...defaults, ...storedConfig };
          const thermalState: ThermalState = {
            airC: finiteOr(storedState?.airC, temperature),
            productC: finiteOr(storedState?.productC, temperature),
            sensorC: finiteOr(storedState?.sensorC, temperature),
            coolingActive: Boolean(storedState?.coolingActive),
            elapsedSeconds: Math.max(
              0,
              finiteOr(storedState?.elapsedSeconds, 0),
            ),
          };
          return {
            id: String(shipment.id),
            origin: String(shipment.origin ?? ""),
            destination: String(shipment.destination ?? ""),
            category,
            weight,
            temperature: thermalState.productC,
            status: String(shipment.status || "Dalam pengantaran"),
            updatedAt: String(shipment.updatedAt || new Date().toISOString()),
            thermalConfig,
            thermalState,
          };
        })
    : [];

const readLegacyCookie = () => {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LEGACY_COOKIE_KEY}=`));
  if (!match) return null;
  try {
    return JSON.parse(
      decodeURIComponent(match.split("=").slice(1).join("=")),
    ) as unknown;
  } catch {
    return null;
  }
};

export const writeShipments = (shipments: Shipment[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
  return shipments;
};

export const readShipments = (): Shipment[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const shipments = normalizeShipments(JSON.parse(stored) as unknown);
      return shipments.length ? shipments : writeShipments(seedShipments);
    }
    const legacy = readLegacyCookie();
    const shipments = normalizeShipments(legacy);
    return writeShipments(shipments.length ? shipments : seedShipments);
  } catch {
    return normalizeShipments(seedShipments);
  }
};

export const updateShipment = (id: string, changes: Partial<Shipment>) => {
  const shipments = readShipments().map((shipment) =>
    shipment.id === id
      ? {
          ...shipment,
          ...changes,
          updatedAt: new Date().toISOString(),
          temperature:
            changes.thermalState?.productC ??
            changes.temperature ??
            shipment.temperature,
        }
      : shipment,
  );
  writeShipments(shipments);
  return shipments.find((shipment) => shipment.id === id);
};

export const getShipment = (id?: string | null) => {
  const shipments = readShipments();
  return shipments.find((shipment) => shipment.id === id) || shipments[0];
};

export const statusFor = (temperature: number, shipment?: Shipment) => {
  const range = rangeFor(shipment);
  return temperature < range.min
    ? { label: "Below range", tone: "text-[#1757a6]", bg: "bg-[#f1f6ff]" }
    : temperature > range.max
      ? { label: "Above range", tone: "text-danger", bg: "bg-[#fff1f0]" }
      : { label: "Normal", tone: "text-success", bg: "bg-[#effaf6]" };
};

export const markerPosition = (temperature: number, shipment?: Shipment) => {
  const range = rangeFor(shipment);
  const position = ((temperature - range.min) / (range.max - range.min)) * 100;
  return `${Math.max(0, Math.min(100, position))}%`;
};
export const shipmentIdFromUrl = () =>
  new URLSearchParams(window.location.search).get("shipment");
