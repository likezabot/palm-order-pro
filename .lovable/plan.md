# Fix Printer Settings Layout (V3)

Three targeted CSS/layout fixes on `/configuracoes/impressora`. No business logic, routes, or persistence changes.

## 1. Breakpoint lg → md (PrinterSettings.tsx)

The viewport is ~909px, so the `lg:` (1024px) two-column grid never activates and the page falls back to mobile tabs. Switch to `md:` (768px) so the form + preview render side by side on this size.

In `src/pages/PrinterSettings.tsx`:

- Two-column grid (line 137):
  ```tsx
  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6 items-start">
    <div className="min-w-0 space-y-4">{formContent}</div>
    <div className="min-w-0">
      <div className="sticky top-24">
        <div className="bg-card border border-border rounded-xl p-4 max-h-[calc(100vh-180px)] overflow-auto">
          {previewContent}
        </div>
      </div>
    </div>
  </div>
  ```
- Tabs wrapper (line 149): `lg:hidden` → `md:hidden`.

## 2. Container width (PrinterSettings.tsx)

The wrapper already uses `max-w-7xl mx-auto`, so the "espremido em 280px" effect comes from being mounted inside a narrower parent route layout. Confirm by reading `src/App.tsx` route definition and any wrapping layout component to ensure no `max-w-sm/md/xs` is applied around `<PrinterSettings />`. If found, remove it for this route (or render the page outside that wrapper).

Also harden the page itself:
- Header inner div: ensure `w-full max-w-7xl mx-auto` (already correct).
- Main content div (line 132): keep `max-w-7xl mx-auto w-full`.
- Add `w-full` to the outermost `<div className="min-h-screen bg-background">` for safety.

## 3. URL input visibility (BridgeStatusCard.tsx)

The input is rendered, but on tight widths the action buttons next to it can squeeze it. Make the URL block full-width on its own row and put the buttons on a second row on small screens:

In `src/components/printer-settings/BridgeStatusCard.tsx` (lines 105–128), restructure to:

```tsx
<div className="space-y-3">
  <div className="space-y-1.5 w-full">
    <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
      URL da bridge
    </Label>
    <Input
      value={urlDraft}
      onChange={(e) => setUrlDraft(e.target.value)}
      onBlur={() => urlDraft !== cfg.bridgeUrl && onChangeBridgeUrl(urlDraft)}
      placeholder="http://localhost:9100"
      className="w-full font-mono text-sm"
    />
  </div>
  <div className="flex flex-wrap gap-2">
    <Button variant="outline" size="default" onClick={verify} disabled={status === "checking"}>
      {status === "checking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      <span className="ml-2">Testar conexão</span>
    </Button>
    <Button variant="default" size="default" onClick={handleTestPrint} disabled={testing}>
      {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
      <span className="ml-2">Imprimir teste</span>
    </Button>
  </div>
</div>
```

This guarantees the input gets the full row and never collapses to 0 width.

## Files touched

- `src/pages/PrinterSettings.tsx` — breakpoint swap, width hardening
- `src/components/printer-settings/BridgeStatusCard.tsx` — URL row restructure
- `src/App.tsx` (only if a constraining wrapper is found around the route)

## Out of scope

- Saving/loading/reset logic
- Toggles, fields, preview content
- Bridge `/health` integration
- Routing
