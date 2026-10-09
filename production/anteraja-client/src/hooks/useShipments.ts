import { useContext } from "react";
import { ShipmentContext } from "../contexts/shipment-context";

export function useShipments() {
  const context = useContext(ShipmentContext);
  if (!context)
    throw new Error("useShipments must be used inside ShipmentProvider.");
  return context;
}
