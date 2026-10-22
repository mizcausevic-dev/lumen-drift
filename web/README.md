# Listening room

The site plays the note lists in `public/data/collection.json` and serves the MIDI files in `public/midi/`.

From this directory:

```bash
npm install
npm run dev
```

The dev server binds to `127.0.0.1` port `8734`. `npm run build` writes a relative-path static site for GitHub Pages.

Regenerate the collection from the repository root with `python3 tools/build_collection.py` before rebuilding the site if the progressions change.
