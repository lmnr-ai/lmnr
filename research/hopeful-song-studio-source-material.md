# Hopeful classical studio — source material

## Direction

The revised studio avoids immediately recognizable “name-that-tune” melodies. It uses short passages from public-domain classical teaching repertoire: clearly classical in phrasing and harmony, but less culturally overexposed.

The comparison studio demonstrates **authored adaptive music**: recurring melodic cells keep their identity while fixed treatments change orchestration. Voiceover mode removes continuous melody and preserves only deliberate motif returns.

## Selected passages

### Clementi — Sonatina in C major, Op. 36 No. 1, I

- **Studio source:** [Mutopia score 804](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=804).
- **Edition status:** Mutopia labels the score **Public Domain** and provides LilyPond and MIDI files.
- **Passage:** the opening 15-bar `Spiritoso` statement in C major and 2/2.
- **Why it fits:** bright classical motion and sequential writing without the instant recognition of Beethoven’s “Ode to Joy.”

### Schumann — Melodie, Album for the Young, Op. 68 No. 1

- **Studio source:** [Mutopia score 647](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=647).
- **Edition status:** the Mutopia typesetting is **CC BY-SA 2.5**.
- **Passage:** opening statement, written repeat, expressive rise, and first answer in C major and 4/4.
- **Why it fits:** it behaves like quiet underscore already—lyrical, balanced, and emotionally hopeful without becoming grandiose.

### Schumann — Petite pièce, Album for the Young, Op. 68 No. 5

- **Studio source:** [Mutopia score 653](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=653).
- **Edition status:** the Mutopia typesetting is **CC BY-SA 2.5**.
- **Passage:** the pickup and first 16 full measures in C major and 4/4.
- **Why it fits:** compact song-without-words phrasing leaves room for modern chamber textures and narration.

## Round-two repertoire additions

After the initial selections felt too pedagogical, the studio added five more lyrical sources verified against Mutopia score pages and LilyPond/MIDI files:

- **Fauré — Aurore, Op. 39 No. 1:** [Mutopia 1829](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1829), public-domain typeset. The studio uses the final dawn/reprise span and its F-major close.
- **Field — Nocturne in B-flat, H. 37:** [Mutopia 2137](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2137), public domain. The studio uses the first four complete 12/8 bars.
- **Tchaikovsky — January: At the Fireside, Op. 37a No. 1:** [Mutopia 1171](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1171), public domain. The studio uses the opening eight 3/4 bars.
- **Tchaikovsky — Morning Prayer, Op. 39 No. 1:** [Mutopia 2032](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2032), public domain. The studio uses the opening sixteen 3/4 bars.
- **Schubert — Sängers Morgenlied, D. 163:** [Mutopia 1051](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1051), public domain. The studio uses the first complete vocal statement after its piano introduction.

Pitch and rhythm data were checked against the downloadable LilyPond/MIDI sources. The browser arrangements reduce the original accompaniment to chord-role data; they are excerpts and reductions, not facsimile editions.

The broader candidate search and explicit rejections are documented in [`hopeful-classical-repertoire-round-2.md`](hopeful-classical-repertoire-round-2.md).

## Recurring-DNA comparison additions

Four contrasting candidates were added from directly inspected Mutopia LilyPond editions:

- **Mendelssohn — Song without Words, Op. 85 No. 1:** [Mutopia 1744](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1744), public-domain typeset from the Breitkopf & Härtel 1874–77 edition. The studio transcribes the opening sixteen melodic measures as an introspective contrast.
- **Schubert — Impromptu in A-flat, D. 935 No. 2:** [Mutopia 1195](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1195), public-domain typeset from the Breitkopf & Härtel 1888 edition. The studio uses the opening theme as the strongest sparse-under-voiceover candidate.
- **Mendelssohn — Consolation:** [Mutopia 1232](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1232), public-domain typeset. The studio uses the two opening soprano phrases to test broad, hymn-like DNA.
- **Grieg — Album Leaf, Op. 12 No. 7:** [Mutopia 2194](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2194), CC BY-SA 4.0 typeset from a 1902 Schirmer source. The repeated opening phrase tests a more rhythmic identity.

The harmony tracks are intentionally reduced chord-role sketches rather than reproductions of the original piano accompaniments.

## Adaptive cue implementation

The original random-violin experiment was removed after deeper research. The replacement follows the authored-segment model described in [`adaptive-music-underscore-design.md`](adaptive-music-underscore-design.md):

1. **Authored notes:** the motif always follows the sourced classical passage; playback does not invent pitches.
2. **Shared musical clock:** every palette uses the same notes, harmony, phrase boundaries, and cadence.
3. **Independent orchestration:** piano, digital pings, strings, and hybrid palettes assign different instruments to motif, harmony, pulse, and accent roles.
4. **Vertical development:** the calm state omits pulse; activity adds light motion; reveal uses denser motion and one authored accent.
5. **Horizontal form:** the visible quiet-bed, activity, reveal, and resolve modules occur at explicit phrase boundaries.
6. **Written cadence:** the source line gives way to a fixed final cadence rather than continuing generatively.

## Studio comparison surface

- Sourced melody cards with explicit voiceover-fit and masking-risk guidance
- Authored recurring-DNA cells and highlighted occurrences
- Six fixed, comparable treatments: felt piano, digital pings, chamber strings, hybrid score, signal bloom, and paper pulse
- DNA-only, voiceover-safe, full-phrase, and ending-check auditions
- No mixer or low-level synthesis controls: the prototype isolates the musical decision instead of asking the listener to engineer a patch

## Licensing note

This is an implementation note, not legal advice. The labels above report the licensing stated by the cited Mutopia editions. Preserve attribution and review share-alike obligations before distributing copied notation or derivative score data commercially.
