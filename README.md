# Groeiplaatsbeoordeling PWA

## Bestanden

Zet deze bestanden samen in één map:

- `index.html`
- `styles.css`
- `fflate.min.js`
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
- bodemlagen met bodemsoort en organisch gehalte toevoegen;
- volume automatisch berekenen;
- meerdere onderzoeken lokaal opslaan, openen, kopiëren, selecteren en verwijderen in de browser;
- algemene gegevens optioneel behouden bij een nieuw onderzoek;
- één of meerdere onderzoeken met foto's exporteren als ZIP;
- één gecombineerd afdrukbaar PDF-rapport maken van geselecteerde onderzoeken;
- een onderzoeks-ZIP, verzamel-ZIP of oude JSON opnieuw importeren;
- printbaar rapport maken en opslaan als PDF via de browser;
- basis voor offline gebruik.

Foto's worden eenmalig verkleind tot maximaal 1200 pixels en als JPEG met 75% kwaliteit opgeslagen. Onderzoeken en foto's staan in IndexedDB, waardoor aanzienlijk meer lokale opslag beschikbaar is dan met `localStorage`. Bestaande onderzoeken worden automatisch gemigreerd. De app toont het geschatte opslaggebruik en vraagt waar mogelijk permanente browseropslag aan.

Bij ZIP-export staat een klein `onderzoek.json` met de formuliergegevens in het archief. Foto's staan daarnaast als losse JPEG-bestanden in dezelfde ZIP en worden dus niet meer als Base64 in de JSON opgenomen. Oude JSON-exports met Base64-foto's blijven importeerbaar. De bestaande rapportindeling met twee foto's in de rechterkolom blijft behouden. Centrale synchronisatie kan later worden toegevoegd.

Bij selectie van één opgeslagen onderzoek blijft het bestaande ZIP-formaat ongewijzigd. Bij meerdere onderzoeken maakt de app één verzamel-ZIP met daarin voor ieder onderzoek een afzonderlijke v1.25-compatibele onderzoeks-ZIP en een `verzamelbestand.json`. De actuele app kan het verzamelbestand rechtstreeks importeren. Versies vanaf v1.25 kunnen de verzamel-ZIP eerst uitpakken en daarna de losse onderzoeks-ZIP's importeren. Importen krijgen altijd nieuwe lokale ID's en overschrijven daardoor geen bestaande onderzoeken. De actuele import blijft daarnaast oude JSON-exports met Base64-foto's ondersteunen.

Met **Rapport / PDF selectie** worden alle geselecteerde onderzoeken in één afdrukvenster samengevoegd. Elk onderzoek behoudt zijn bestaande tweepagina-indeling en begint op een nieuwe pagina. Via de afdrukfunctie van de browser kan het geheel als één PDF worden opgeslagen.

Elke foto krijgt de naam `[plantplaatsnummer]_[datum]_situatiefoto-[nummer].jpg`. Dezelfde naam staat bij de foto in de app, als los bestand in de ZIP en in het rapport.

Voor ZIP-ondersteuning wordt de lokaal meegeleverde MIT-bibliotheek fflate 0.8.3 gebruikt; zie `LICENSE-fflate.txt`.
