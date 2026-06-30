# Radar OIP — Chrome Extension (Phase 2)

Human-assisted, visible-only Chrome MV3 capture extension for Radar OIP.

## Local dev

```bash
pnpm --filter @radar/extension build
```

Load the resulting `extension/dist` folder via Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/dist`

The popup accepts:

- API base URL, for example `http://localhost:4000`
- A scoped capture token generated from the Radar web app in `/settings/extension`

The extension only captures data when the operator clicks **Capture Current Results** and only
reads currently visible DOM nodes.
