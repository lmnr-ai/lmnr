# Broader underscore repertoire

## Purpose

The first Song Studio shortlist leaned too heavily on European concert music. This pass adds seven materially different identities: early jazz, Finnish and Northumbrian song, Swedish dance, and two Japanese historical transcriptions.

The studio uses newly synthesized audio. It does **not** use source recordings. Composition status and edition license remain separate questions.

## Implemented candidates

### Scott Joplin — *Bethena: A Concert Waltz* (1905)

- **Source:** [Mutopia 463](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=463).
- **Source metadata:** the inspected LilyPond header identifies the source as the original manuscript, style as Jazz, and typesetting license as Public Domain.
- **Studio excerpt:** the first 16-bar `Valse cantabile` melody from `partOneRHvI`.
- **Why test it:** lyrical early jazz without relying on stride bass or a comic ragtime treatment.

### Scott Joplin — *Solace: A Mexican Serenade* (1909)

- **Source:** [Mutopia 482](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=482).
- **Source metadata:** the inspected LilyPond header identifies the 1909 original manuscript and a Public Domain typesetting.
- **Studio excerpt:** the opening four-bar chromatic cell of Part One, repeated for comparison.
- **Why test it:** close chromatic motion can become a precise product signal rather than a literal period piece.

### *Aamulla varhain* — traditional Finnish song

- **Source:** [Mutopia 1020](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1020).
- **Source metadata:** Finnish folk song; public-domain transcription by Tanja Kivi.
- **Studio excerpt:** the complete notated vocal melody.
- **Why test it:** repeated tones and small turns remain intelligible at very low melodic density.

### *The Water of Tyne* — traditional Northumbrian song

- **Source:** [Mutopia 889](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=889).
- **Historical source named by edition:** *English County Songs* (1893), edited by L. Broadwood and J. A. Fuller Maitland.
- **Edition status:** Mutopia labels its typesetting Public Domain.
- **Studio excerpt:** the complete vocal stanza melody, including pickup.
- **Why test it:** broad 6/8 breathing and a high transformed phrase leave natural room for narration.

### *O-Edo Nihonbashi* — traditional Japanese song

- **Source:** [Mutopia 1963](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1963).
- **Historical source named by edition:** Nagai, Iwai, and Obata, *Seiyo gakufu Nihon zokkyokushu* (Miki Shoten, Osaka, 1895).
- **Edition status:** public-domain typesetting.
- **Studio excerpt:** the full 20-bar melody from the historical Western notation.
- **Caution:** do not market an equal-tempered historical transcription as an authoritative account of Japanese tuning or ornament. Use abstract treatments rather than imitation koto/shamisen clichés.

### Polska from Västergötland — traditional Swedish dance

- **Source:** [Mutopia 830](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=830).
- **Historical source named by edition:** *Traditioner af Swenska Folk-Dansar*, part 1 (1814).
- **Edition status:** Mutopia typesetting is CC BY 2.5.
- **Studio excerpt:** the first repeated eight-bar strain.
- **Why test it:** a bold opening leap and asymmetric dance character create a kinetic alternative to lyrical songs.

### *Fuku-Ju-So* — traditional Japanese repertoire

- **Source:** [Mutopia 1987](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1987).
- **Historical source named by edition:** Nagai, Iwai, and Obata, *Seiyo gakufu Nihon zokkyokushu* (1895).
- **Edition status:** public-domain typesetting.
- **Studio excerpt:** the first eight bars.
- **Why test it:** sustained tones, register space, and a slow descent provide maximum room for speech.
- **Caution:** same transcription and cultural-context limitations as *O-Edo Nihonbashi*.

## Deliberate exclusions

- **Headline folk melodies** such as “Simple Gifts,” “Amazing Grace,” “Greensleeves,” and “Sakura”: too recognizable or association-heavy.
- **Modern folk arrangements:** underlying traditional material may be old while arrangement, engraving, MIDI, and recording rights remain protected.
- **Spirituals in this prototype pass:** legal public-domain status alone is not sufficient; provenance and editorial review should precede product use.
- **Literal ethnic instrumentation:** the comparison should test melodic structure, not trigger regional stereotypes.

## Verification performed

The seven studio transcriptions were entered from the note and duration data in the corresponding Mutopia LilyPond source files. Melody and reduced-harmony durations are checked to match exactly in `song-studio/songs.js`. The browser audio is a new Web Audio synthesis, not a copied performance.
