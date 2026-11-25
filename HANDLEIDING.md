# Derks Uren – handleiding

Urenregistratie voor Transportbedrijf P.A.M. Derks B.V. als webapp (PWA) voor de iPhone.

## Bestanden

Alle 16 bestanden staan in één map, zonder submappen. Upload ze allemaal naar de hoofdmap van je repository. Posities van de invulvakjes staan in `form-config.js`.

---

## 1. Gratis GitHub-account aanmaken

Dit gaat het makkelijkst op een computer (Windows of Mac).

1. Ga naar **https://github.com** en klik op **Sign up**.
2. Vul je e-mailadres, een wachtwoord en een gebruikersnaam in, bijvoorbeeld `thijs-derks`. De gebruikersnaam komt in het webadres van de app.
3. Bevestig je e-mailadres met de code die je ontvangt. Kies het gratis abonnement (**Free**).

## 2. Repository (projectmap) aanmaken

1. Klik rechtsboven op **+** → **New repository**.
2. Bij **Repository name** vul je `uren` in. Het adres van de app wordt dan `https://thijs-derks.github.io/uren/`.
3. Kies **Public**. GitHub Pages is gratis alleen voor openbare repositories. Alleen de *code* is dan openbaar: je uren staan uitsluitend op je telefoon en komen nooit op GitHub.
4. Klik op **Create repository**.

## 3. Bestanden uploaden

1. Pak het zip-bestand `derks-uren.zip` uit op je computer.
2. Klik in je nieuwe repository op de link **uploading an existing file**, of op **Add file** → **Upload files**.
3. Open de uitgepakte map `derks-uren`. Selecteer **alle 16 bestanden** en sleep ze naar het uploadvak, of klik op **choose your files** en selecteer ze allemaal.
4. Wacht tot alle bestanden in de lijst staan. Klik onderaan op **Commit changes**.
5. Controleer dat er 16 bestanden in de repository staan, waaronder `index.html`, `app.js` en `logo.png`.

## 4. GitHub Pages aanzetten

1. Ga in de repository naar **Settings** (tandwiel) → links **Pages**.
2. Bij **Build and deployment** → **Source**: kies **Deploy from a branch**.
3. Bij **Branch**: kies **main** en de map **/ (root)** → **Save**.
4. Wacht 1 à 2 minuten en ververs de pagina. Bovenaan verschijnt: *Your site is live at `https://thijs-derks.github.io/uren/`*.

## 5. App op het beginscherm van je iPhone zetten

1. Open **Safari** op je iPhone (niet Chrome) en ga naar je adres, bijvoorbeeld `https://thijs-derks.github.io/uren/`.
2. Tik op het **Deel**-icoon (vierkant met pijl omhoog).
3. Scroll en kies **Zet op beginscherm**. De naam is al ingevuld (“Derks Uren”). Zet **Open als webapp** aan als dat er staat. Tik op **Voeg toe**.
4. Open de app vanaf het beginscherm, één keer met internet. Daarna werkt hij ook offline.

**Belangrijk:** de app op het beginscherm heeft een *eigen* opslag, los van Safari. Gebruik daarom altijd het icoon op het beginscherm. Wat je in Safari invoert, zie je niet in de app.

---

## 6. Dagelijks gebruik

- **Start dag** → tijdens de dag **Pauze start / Pauze stop** (zo vaak als nodig) → **Einde dag**.
- Bij Einde dag vul je **Werk** en **Omschrijving werkzaamheden** in. Eerder gebruikte teksten verschijnen als suggestie en als knopjes.
- Verkeerd gedrukt? Tik op **↶ Ongedaan maken**.
- Achteraf aanpassen: tab **Week** → tik op een dag. Je kunt start, eind, pauzes (toevoegen, wijzigen, verwijderen) en teksten aanpassen.
- Een dag vergeten? **Week** → tik op de dag → tijden invullen. Of gebruik de melding “Geen registratie voor …”.
- Loopt een dag over middernacht, dan vul je gewoon een eindtijd in die vroeger is dan de starttijd. Alle uren tellen op de startdag.

**Berekening:** netto = (eind − start) − alle pauzes, per dag afgerond op het dichtstbijzijnde kwartier (instelbaar). Notatie: 7, 7 1/4, 7 2/4, 7 3/4. Het weektotaal is de som van de afgeronde dagen.

## 7. Afdrukken

1. Tab **Week** → **Voorvertoning & afdrukken**. Controleer de waarden; het formulier staat er licht op de achtergrond (dat wordt niet geprint).
2. Leg het doordrukformulier (beide vellen) in de printer. Kijk bij de eerste keer met een proef hoe het papier erin moet.
3. Tik op **Afdrukken**. Het deelmenu opent met een PDF van het formulier. Kies **Druk af** en je printer, met deze instellingen:
   - Papier: **A4**
   - Schaal: **100%** of **Werkelijke grootte**. Nooit “Passend maken” of “Aanpassen aan pagina”.
   - **1** exemplaar (het doordrukvel maakt de kopie).
4. Waarom via een PDF? Bij afdrukken vanuit de browser voegt iOS eigen marges en een kop-/voettekst toe (webadres, datum, paginanummer). Dan verschuift alles en loopt het over naar een tweede pagina. Een PDF print op ware grootte. In de voorvertoning staat "Afdrukken via Safari" alleen nog als noodoptie.

De app legt automatisch vast wanneer je een week hebt afgedrukt of als PDF hebt gemaakt. Wijzig je daarna nog iets, dan zie je “gewijzigd na de laatste afdruk”.

## 8. Kalibreren (eenmalig)

De posities zijn gemeten uit de scan en kloppen ongeveer. Elke printer trekt het papier net iets anders in, dus stel het één keer bij:

1. **Instellingen** → **Kalibratiepagina bekijken / afdrukken** → **Afdrukken** → **Druk af** op een **wit A4-vel**.
2. Meet de liniaal onderaan: die moet **precies 100 mm** zijn. Is hij 99 mm, zet de schaal op **101%**.
3. Leg het vel op een leeg formulier en houd het tegen het licht.
4. Staan de kruisjes 2 mm te ver naar rechts? Zet **horizontaal** op **−2,0**. Staan ze te laag? Maak **verticaal** negatief. Gebruik stapjes van 0,1 mm.
5. Herhaal tot de kaders over de vakjes vallen. Doe daarna een proef op een echt formulier.

Staat één bepaald vakje structureel verkeerd, dan kan het getal in `form-config.js` worden aangepast (of geef het door, dan pas ik het aan).

## 9. Herinnering om 17:30 (app Opdrachten)

Een webapp kan zelf geen melding op een vast tijdstip sturen. De app waarschuwt wel bij het openen: een niet afgesloten dag, een werkdag zonder registratie, en een blauwe balk als je dag nog loopt. Voor een dagelijkse herinnering:

1. Open de app **Opdrachten** (Shortcuts) → tab **Automatisering** → **+** (of **Nieuwe automatisering**).
2. Kies **Tijdstip** → **17:30** → **Wekelijks** → selecteer **ma t/m vr**.
3. Kies **Voer direct uit** (dan vraagt hij niet steeds om bevestiging) → **Volgende**.
4. Kies **Nieuwe lege opdracht** en voeg de actie **Toon melding** toe, met de tekst: `Uren afsluiten in Derks Uren`.
5. Tik op **Gereed**.

Om 17:30 krijg je dan een melding. Open daarna de app via het icoon op je beginscherm. Gebruik géén “Open URL”-actie: die opent Safari, en Safari heeft een andere opslag dan de app op je beginscherm.

## 10. Back-up naar iCloud

**Wat kan wel en niet automatisch?**
- iOS staat niet toe dat een webapp zelf en ongemerkt bestanden in iCloud Drive zet. Opdrachten kan ook niet bij de gegevens van een webapp. Een volledig automatische back-up is daarom niet mogelijk.
- Wat wel kan: met twee tikken een back-up maken. De app herinnert je eraan (na elke werkdag of wekelijks) en waarschuwt als de laatste back-up meer dan 7 dagen oud is.

**Eenmalig:** maak in de app **Bestanden** → **iCloud Drive** een map **Derks Uren**.

**Back-up maken:** tab **Back-up** → **Back-up maken** → in het deelmenu **Bewaar in Bestanden** → **iCloud Drive / Derks Uren** → **Bewaar**.

**Terugzetten** (bijvoorbeeld na een nieuwe telefoon of als iOS de websitedata heeft gewist): tab **Back-up** → **Back-up terugzetten** → kies het nieuwste bestand. Je krijgt de keuze:
- **Samenvoegen** (aanbevolen): voegt ontbrekende dagen toe; bij een verschil blijft de meest recent gewijzigde versie staan.
- **Alles vervangen**: zet de back-up volledig terug, eventueel inclusief instellingen en printpositie.

**Wekelijkse herinnering met Opdrachten:** maak net als bij stap 9 een automatisering, bijvoorbeeld **vrijdag 16:00**, met de melding `Back-up maken in Derks Uren`.

## 11. Een nieuwe versie uploaden

1. Upload de gewijzigde bestanden op dezelfde manier naar GitHub (bestaande bestanden worden overschreven).
2. Verhoog in `sw.js` het versienummer, bijvoorbeeld `derks-uren-v1.0.2`.
3. Open de app twee keer: de eerste keer wordt de nieuwe versie op de achtergrond gedownload, de tweede keer zie je hem. Je gegevens blijven gewoon bewaard.
