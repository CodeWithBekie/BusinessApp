// expo-file-system's main export moved to a new File/Directory class API in this SDK; the
// classic downloadAsync/cacheDirectory functions still exist under the /legacy subpath.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getApiBaseUrl, getAuthToken } from '@/src/api/client';

// Fetches a PDF (receipt / purchase-order document) from an authenticated API endpoint and hands
// it to the user — on web via a browser download, on native via the OS share sheet (which is also
// how a user "prints" it, since iOS/Android share sheets surface Print/AirPrint as a target).
export async function downloadAndShareDocument(path: string, filename: string): Promise<void> {
  const url = `${getApiBaseUrl()}${path}`;
  const token = getAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failed to download document: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(objectUrl);
    return;
  }

  const localUri = `${FileSystem.cacheDirectory}${filename}`;
  const { uri, status } = await FileSystem.downloadAsync(url, localUri, { headers });
  if (status !== 200) {
    throw new Error(`Failed to download document: HTTP ${status}`);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}
