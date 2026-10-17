# Custom sound feature (added on top of the original Grok Build export)

The app now supports **importing your own ringtone**:

- In the alert panel, under the Sound dropdown, there is a
  "Custom sound" file picker (accepts any audio file up to 2 MB).
- The chosen file is stored in the browser (localStorage, as a data URL),
  so it persists across reloads and works offline.
- While a custom sound is set it replaces the built-in Ringtone / Bell / Siren
  for every alert and for the test button. Use "Remove" to go back to the
  built-in tones.

Code changes:
- `src/lib/ring.ts`  -> new `startCustomRingtone(dataUrl, volume)`; volume
  slider and stop now also apply to the custom audio element.
- `src/components/linebell-app.tsx` -> file picker UI, persistence
  (`customTone` in the saved payload), and routing in `beginRing` / `testRing`.
