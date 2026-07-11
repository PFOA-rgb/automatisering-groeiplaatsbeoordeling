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
- bodemlagen toevoegen;
- volume automatisch berekenen;
- meerdere onderzoeken lokaal opslaan, openen, kopiëren en verwijderen in de browser;
- algemene gegevens optioneel behouden bij een nieuw onderzoek;
- gegevens exporteren als JSON;
- eerder geëxporteerde JSON opnieuw importeren;
- printbaar rapport maken en opslaan als PDF via de browser;
- basis voor offline gebruik.

Foto's worden verkleind opgeslagen in de browser en meegenomen in de JSON-export. PDF-export, handtekening en centrale synchronisatie kunnen later worden toegevoegd.
