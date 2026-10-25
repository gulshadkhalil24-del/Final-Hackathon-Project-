# HCM Lite — Frontend (Neon Purple)

React 19 + Vite + Tailwind, responsive from 375 px, dark mode included (purple night palette).

```bash
npm install
npm run dev    # http://localhost:5173 — proxies /api to the backend on :5000
npm run build  # production bundle
```

Theme tokens live in `tailwind.config.js` (`brand` = neon purple scale, `ink` = deep purple sidebar) and `src/index.css` (glows, dark mode). Charts share the palette in `src/components/ChartCard.jsx`.
