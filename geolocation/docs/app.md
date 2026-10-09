# Shipment Tracker

Halaman pelacakan pengiriman area Jakarta menampilkan marker berwarna sesuai status. Klik marker untuk melihat tracking number, status, ETA, dan alamat. Pengiriman yang belum memiliki koordinat dicari berdasarkan alamat.

## Teknologi

- Leaflet untuk peta dan marker.
- OpenStreetMap sebagai sumber tile peta.
- Nominatim untuk geocoding alamat di Indonesia.

Implementasi ini tidak memerlukan API key. Layanan publik OpenStreetMap/Nominatim ditujukan untuk pemakaian ringan, mengikuti [kebijakan tile](https://operations.osmfoundation.org/policies/tiles/) dan [kebijakan Nominatim](https://operations.osmfoundation.org/policies/nominatim/), serta tidak menyediakan SLA produksi.

## Menjalankan

Partial dimuat menggunakan `fetch`, jadi jalankan halaman melalui server lokal, bukan dengan membuka file HTML langsung. Dari folder proyek:

```powershell
python -m http.server 8000
```

Buka `http://localhost:8000/shipment-map.html`. Pastikan koneksi internet tersedia agar library Leaflet, tile peta, dan geocoding dapat dimuat.
