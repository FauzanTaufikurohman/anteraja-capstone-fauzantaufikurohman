# Shipment Tracker

Peta pengiriman area Jakarta dengan marker status dan popup detail. Peta dibuat menggunakan Leaflet dan OpenStreetMap; alamat tanpa koordinat dicari melalui Nominatim. Aplikasi tidak membutuhkan Google Maps API key.

## Menjalankan

Dari folder ini, jalankan server lokal:

```powershell
python -m http.server 8000
```

Buka `http://localhost:8000/shipment-map.html`. Aplikasi membutuhkan koneksi internet untuk memuat Leaflet, tile OpenStreetMap, dan geocoding.

Layanan tile OpenStreetMap dan Nominatim ditujukan untuk penggunaan ringan. Ikuti [kebijakan tile](https://operations.osmfoundation.org/policies/tiles/) dan [kebijakan Nominatim](https://operations.osmfoundation.org/policies/nominatim/); untuk produksi atau trafik tinggi, pilih layanan dengan SLA atau host sendiri.