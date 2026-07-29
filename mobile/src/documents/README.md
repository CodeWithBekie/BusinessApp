# documents/

**`downloadAndShare.ts`** — one exported function, `downloadAndShareDocument(path, filename)`,
used by both `../../app/order/[id].tsx` (receipts) and `../../app/purchase-order/[id].tsx` (PO
documents) to fetch and open a server-generated PDF.

Fetches with the current auth token (`getAuthToken()`) and API base URL (`getApiBaseUrl()`), both
from `../api/client.ts`. **Web**: fetches as a blob, creates an object URL, triggers a synthetic
`<a download>` click. **Native**: uses `expo-file-system/legacy`'s `downloadAsync` to cache the
file locally, then hands off to `expo-sharing`'s `shareAsync` (which is also how a user "prints"
it — OS share sheets surface Print/AirPrint from there).

The `/legacy` import path is deliberate, not a typo — this Expo SDK moved `expo-file-system`'s main
export to a new File/Directory class API; the old function-based API (which this code uses) only
still exists under that legacy path.
