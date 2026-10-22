# Groeiplaatsbeoordeling PWA

## Bestanden

Zet deze bestanden samen in één map:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `service-worker.js`
- `icon-192.png`
- `icon-512.png`

## Lokaal testen

Open een terminal in de map en start:

```bash
python -m http.server 8080
```

Open daarna:

```text
http://localhost:8080
```

## Op Android gebruiken

Plaats de map op een HTTPS-webserver. Open de website daarna in Chrome op Android en kies **App installeren** of **Toevoegen aan startscherm**.

## Functies in deze eerste versie

- formulier in vijf stappen;
- GPS ophalen;
- foto's maken en vooraf bekijken;
- afzonderlijke foto's vervangen of verwijderen;
- bodemlagen toevoegen;
- volume automatisch berekenen;
- meerdere onderzoeken lokaal opslaan, openen, kopiëren en verwijderen in de browser;
- algemene gegevens optioneel behouden bij een nieuw onderzoek;
- gegevens exporteren als JSON;
- eerder geëxporteerde JSON opnieuw importeren;
- printbaar rapport maken en opslaan als PDF via de browser;
- basis voor offline gebruik.

Foto's worden eenmalig verkleind tot maximaal 1200 pixels en als JPEG met 75% kwaliteit opgeslagen. Onderzoeken en foto's staan in IndexedDB, waardoor aanzienlijk meer lokale opslag beschikbaar is dan met `localStorage`. Bestaande onderzoeken worden automatisch gemigreerd. De app toont het geschatte opslaggebruik en vraagt waar mogelijk permanente browseropslag aan.

Bij JSON-export worden foto's tijdelijk als Base64 in het exportbestand opgenomen. De bestaande rapportindeling met twee foto's in de rechterkolom blijft behouden. Centrale synchronisatie kan later worden toegevoegd.

Elke foto krijgt metadata met de naam `[plantplaatsnummer]_[datum]_situatiefoto-[nummer].jpg`. Dezelfde naam staat bij de foto in de app, in de JSON-export en in het rapport.
