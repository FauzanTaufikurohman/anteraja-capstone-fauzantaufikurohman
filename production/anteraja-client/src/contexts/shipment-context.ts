import { createContext } from "react";
import type { SimulationCommand, SimulationResult } from "../lib/thermalModel";
import type { Shipment, ThermalConfig, ThermalState } from "../lib/shipments";
import type { ShipmentPage } from "../services/shipmentApi";

export type ShipmentContextValue = {
  shipments: Shipment[];
  totalShipments: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<boolean>;
  loadShipmentPage: (start: number, length: number) => Promise<ShipmentPage>;
  createShipment: (shipment: Shipment) => Promise<Shipment | null>;
  updateShipment: (
    id: string,
    changes: Partial<Shipment>,
  ) => Promise<Shipment | null>;
  runSimulation: (
    id: string,
    command: SimulationCommand,
  ) => Promise<SimulationResult | null>;
  runCorrectiveSimulation: (
    id: string,
    command: SimulationCommand,
  ) => Promise<SimulationResult | null>;
  advanceThermal: (id: string) => Promise<Shipment | null>;
  saveSimulation: (
    id: string,
    command: SimulationCommand,
    config: ThermalConfig,
    state: ThermalState,
  ) => Promise<boolean>;
  saveCorrectiveSimulation: (
    id: string,
    command: SimulationCommand,
    config: ThermalConfig,
    state: ThermalState,
  ) => Promise<boolean>;
};

export const ShipmentContext = createContext<ShipmentContextValue | null>(null);
