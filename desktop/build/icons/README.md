Placeholder — no app icon exists yet. Add:

- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `icon.png` (Linux, 512x512 recommended)

then add an `icon:` line under the matching platform block in
`../../electron-builder.yml`. Until then, `electron-builder` uses its own
default Electron icon.
