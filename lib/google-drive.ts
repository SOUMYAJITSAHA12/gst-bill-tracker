declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const SCOPES = "https://www.googleapis.com/auth/drive.file";

let accessToken: string | null = null;

export function getGoogleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
}

export function isGoogleDriveConfigured(): boolean {
  return !!getGoogleClientId();
}

export function requestGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = getGoogleClientId();
    if (!clientId) {
      reject(new Error("Google Client ID not configured"));
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google Identity Services not loaded. Please refresh the page."));
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        if (response.access_token) {
          accessToken = response.access_token;
          resolve(response.access_token);
        } else {
          reject(new Error("No access token received"));
        }
      },
    });

    client.requestAccessToken();
  });
}

async function getOrCreateFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const metadata: Record<string, unknown> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });
  const createData = await createRes.json();
  return createData.id;
}

const MONTH_NAMES: Record<string, string> = {
  "01": "01-January",
  "02": "02-February",
  "03": "03-March",
  "04": "04-April",
  "05": "05-May",
  "06": "06-June",
  "07": "07-July",
  "08": "08-August",
  "09": "09-September",
  "10": "10-October",
  "11": "11-November",
  "12": "12-December",
};

export async function uploadToDrive(
  file: File,
  invoiceNumber: string,
  financialYear: string,
  invoiceDate?: string
): Promise<{ fileId: string; webViewLink: string }> {
  let token = accessToken;
  if (!token) {
    token = await requestGoogleAccessToken();
  }

  // Create folder structure: GST Bills / FY 2025-26 / 04-April /
  const rootFolder = await getOrCreateFolder(token, "GST Bills");
  const fyFolder = await getOrCreateFolder(token, `FY ${financialYear}`, rootFolder);

  let monthFolder = fyFolder;
  if (invoiceDate) {
    const d = new Date(invoiceDate);
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const monthName = MONTH_NAMES[mm] || mm;
    monthFolder = await getOrCreateFolder(token, monthName, fyFolder);
  }

  // Upload the file
  const safeName = invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const fileName = `${safeName}_${file.name}`;

  const metadata = {
    name: fileName,
    parents: [monthFolder],
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", file);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    if (uploadRes.status === 401) {
      accessToken = null;
      throw new Error("Google session expired. Please try again.");
    }
    throw new Error(`Upload failed: ${errText}`);
  }

  const uploadData = await uploadRes.json();
  return {
    fileId: uploadData.id,
    webViewLink: uploadData.webViewLink,
  };
}
