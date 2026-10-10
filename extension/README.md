# Calendar Window Scheduler

A Manifest V3 prototype that adds a details panel and availability overlays to Google Calendar. The solver is bundled CP-SAT WebAssembly: no scheduler process, hosted solver, or daily startup is needed.

## Build and connect

Requires Node 22.12+ (Node 24 recommended), npm, and current desktop Chrome. All testers use the same development extension identity, but connect their own Google account and keep their own drafts locally.

1. From `extension/`, run `npm ci` and `npm run extension:id`.
2. In Google Cloud Console, create a project and enable **Google Calendar API**. Configure a Google Auth Platform consent screen with an External audience in Testing, and add each tester's Google address as a test user. Add `calendar.events` and `calendar.calendarlist.readonly` to the requested access scopes.
3. Create an OAuth client of type **Chrome Extension**, registering the extension ID printed above. Chrome profiles should be signed in to the same account testers want to schedule. This prototype uses Chrome Identity's account selection; it does not switch automatically when the Calendar webpage switches accounts.
4. Copy `.env.example` to `.env.local`, fill in the client ID, and run `npm run build`. The OAuth client ID and manifest public key are public identifiers; no client secret or token file belongs in the extension.
5. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`. Pin the extension. The maintainer can share a zip of this configured `dist` directory; testers unzip it before loading.
6. Open `https://calendar.google.com`, reload it after loading the extension, and click the extension icon. Click **Connect Google Calendar** and grant its permissions. The panel shows the connected primary calendar's account identity: check it before applying events.
7. Expand **Calendars, resources & timezone**. Select calendars to use. The primary calendar is enabled initially; additional calendars are opt-in. Enabled calendars default to blocking **My attention**. Confirm that the timezone matches Calendar's displayed timezone when it cannot be detected.

Google OAuth testing access may need renewed authorization. Reconnect in the panel; never edit token files. Public Chrome Web Store distribution and production OAuth verification are outside this prototype.

## Use

Click **Flexible event**, enter a title and duration (30 minutes by default), and choose a writable destination. Description and location are optional. Enable **Draw availability on Calendar**, drag across time, and press Escape when finished. Add several windows if needed. During drawing, window edge handles resize it and × removes it; the panel can also remove windows. Native event creation is suppressed only inside the drawing surface while drawing mode is active.

If drawing is disabled, read the explanation below its button. The adapter automatically rechecks text, visibility, and layout changes during Calendar navigation. **Recheck Calendar view** reconnects the page adapter and requests a fresh measurement. Confirm the timezone when prompted; unsupported views stay disabled.

With the extension panel open and connected, these shortcuts work in both Google Calendar and the panel (use **Option** for **Alt** on Mac):

| Shortcut | Action |
| --- | --- |
| Alt+Shift+N | Create a draft and focus its title |
| Alt+Shift+D | Toggle drawing for the current draft |
| Alt+Shift+↑ / ↓ | Select the previous / next pending draft, wrapping at the ends |
| Escape | Finish drawing, or cancel the current drag |

Use Tab to move through event fields. Draft edits save automatically before switching. Shortcut hints also appear above the draft list; shortcuts respect the same account, view, timezone, and operation locks as the buttons. Holding a shortcut does not repeat its action, and ordinary typing is unaffected.

The selected draft's windows are teal. **Schedule selected drafts** fetches fresh commitments across every selected draft's availability, then minimizes the last completion time. Starts use a stable five-minute UTC grid and durations retain their exact minutes. A task must fit entirely inside one window; it is never split or silently omitted. Preview placements appear in amber and in the panel. **Apply proposal to Calendar** checks conflicts and permissions again before creating events.

Existing events are visible on Calendar and in the panel agenda. Hiding a calendar's agenda does not remove its conflicts. **Use this calendar** controls whether it is queried; **Visual only** displays it without reserving resources. **Block selected resources** lets a personal calendar reserve attention and an equipment calendar reserve a machine. Busy all-day dates and recurring occurrences are supported. Ordinary events marked Available or declined do not block.

Each draft can require multiple capacity-one resources. Background tasks omit **My attention**, but can still need a washing machine or another resource. Two drafts sharing any resource cannot overlap. Applied background events are marked Available in Calendar and retain private resource metadata, so subsequent runs still reserve their equipment. Unknown or removed resource metadata falls back to the calendar policy.

In the agenda, **Allow overlap for this draft** creates an explicit exception for that occurrence, optionally only a portion. It affects the selected draft, leaves the Google event unchanged, and does not override other commitments at the same time. An exception stops applying if the occurrence moves.

Drafts, windows, presets, exceptions, and proposals save automatically per account in this browser. Presets turn weekly wall-clock slots into dated windows for the week currently being viewed. Applied drafts are archived: subsequent scheduling affects pending drafts only.

## Interrupted Apply

Event IDs are deterministically derived from draft IDs and saved with the insertion body before writing. After a lost response, reopen the panel and retry **Apply**: it retrieves uncertain insertions before sending any further writes. Successful events are archived; pending events are checked against fresh commitments. A conflicting or manually modified insertion requires inspection rather than overwriting it. **Inspect previous insertion** lets you keep an existing event and archive its draft, or release a missing insertion for rescheduling while preserving the stable event ID. Calendar does not provide a multi-event transaction, so a batch can partially succeed and external edits can race the final checks.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Unit tests run actual CP-SAT WASM under Node, independently enumerate small optima, test Calendar API responses and write recovery, and check grid geometry with DOM fixtures. Static protobuf codecs are compared with upstream serialization while runtime code generation is disabled. Browser tests load the packaged extension in temporary Chrome profiles, verify local WASM solving and cancellation under its real CSP/isolation settings, and exercise account connection, drawing, and recovery against a locally mocked Calendar page/API. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a Chrome for Testing executable to use an existing installation.

Verification: 48 unit tests, the build, and both packaged Chrome browser tests passed, including keyboard creation, title focus, Tab navigation, drawing toggles, and switching drafts. Signed-in Google Calendar OAuth, live page layouts, and actual Calendar writes still need the acceptance pass below; mocked layouts cannot establish compatibility with all of Google's current live markup.

Tester acceptance checklist:

- Connect the intended account; select both personal and equipment calendars.
- Draw, resize, delete, and duplicate windows in day/week views; scroll and navigate weeks. Confirm native events are not created while painting and resume working afterward.
- Create a draft with Alt/Option+Shift+N, tab through its details, toggle drawing with Alt/Option+Shift+D, and switch pending drafts with Alt/Option+Shift+↑/↓. Check that titles and windows survive switching.
- Check that unsupported layouts disable drawing. Check timezone alignment, especially a DST boundary. Missing/repeated wall times are rejected rather than silently shifted.
- Schedule homework alongside laundry; verify two laundry tasks sharing a machine do not overlap.
- Verify a calendar set to visual only can be overlapped, while hidden blocking calendars still constrain scheduling.
- Add two overlapping existing meetings; confirm they block their union without making unrelated drafts infeasible.
- Allow a career-fair draft to overlap only part of a class; confirm another attention task remains blocked by that class.
- Refresh the panel and confirm draft/proposal restoration. Apply to a test calendar and verify title, description, location, duration, and resource behavior.
- Add a meeting after preview: Apply must reject a newly conflicting placement. Revoke a destination's write permission and verify no writes occur.
- Interrupt an Apply, reopen, and retry; verify one insertion per draft and fixed commitments on later runs.

## Architecture and limits

`src/content.ts` and `src/grid.ts` own the page adapter. They inspect date-column and hour-label geometry, not event details. Google Calendar's packed `data-datekey` attributes and ISO `data-date` columns are supported; hourly labels currently need English AM/PM or numeric 24-hour formatting. Month, schedule, custom multiday, and unrecognized layouts disable drawing. Google's page markup can change without notice.

The panel reads/writes Calendar through `src/calendar.ts`; `src/constraints.ts` applies resource and per-draft exception rules; `src/solver.worker.ts` owns solver execution. The executor is explicitly local and disables upstream cloud fallback. Cancellation terminates the dedicated worker. CP-SAT search is capped at ten seconds, with a thirty-second wall timeout allowing cold WASM initialization. Browser requests are limited to Google Calendar APIs; locally saved data is not synced to a backend.

Vite emits only CP-SAT runtime assets rather than the package's other solvers (about 21 MB unpacked). A fixed package version and an asset-table guard protect the bundling adjustment. Packaged browser solving now passes its Chrome checks, so no companion service is included. A Python companion remains the fallback if a future browser/runtime incompatibility cannot be resolved within the extension.

`build/solver-protobuf.ts` generates protobuf constructors and codecs during the build, retaining the reflection metadata that OR-Tools uses for exact integer conversion. This replaces upstream's runtime JavaScript generation, which Manifest V3 blocks. The packaged solver cannot evaluate strings as JavaScript; an uncompiled codec or an incompatible upstream context fails explicitly. Workers and WASM remain packaged extension assets.

Guest invitations, conferencing, recurring drafts, linked activity phases, automatic attendance decisions, and moving already-applied events are excluded. The Python scheduler and version-1 JSON contracts in the repository are unchanged. Use one panel session per account when editing/applying; simultaneous windows are not a transactional collaborative editor.
