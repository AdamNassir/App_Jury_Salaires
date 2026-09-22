import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import mammoth from "mammoth";
import { JWT } from "google-auth-library";

// Load Google Sheets config dynamically
function getSheetsConfig() {
  try {
    const configPath = path.join(process.cwd(), "google-sheets-config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (e) {
    console.warn("Could not read google-sheets-config.json on server:", e);
  }
  return { defaultSpreadsheetId: "1QbvLbW39EgHCtOtj2LrrP7w1byWlkE6F5deOXOjCWmk", spreadsheets: {} };
}

function saveJsonFiles(filename: string, data: any) {
  const targets = [
    path.join(process.cwd(), "src", "data", filename),
    path.join(process.cwd(), "data", filename),
  ];
  for (const targetPath of targets) {
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error(`Failed to write ${targetPath}:`, err);
    }
  }
}

function readJsonArray(filename: string): any[] {
  const targets = [
    path.join(process.cwd(), "src", "data", filename),
    path.join(process.cwd(), "data", filename),
  ];
  for (const targetPath of targets) {
    if (fs.existsSync(targetPath)) {
      try {
        const content = fs.readFileSync(targetPath, "utf-8");
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
      } catch (err) {
        console.warn(`Failed to parse ${targetPath}:`, err);
      }
    }
  }
  return [];
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Larger payload body parsers for base64 file transfers
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route: healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: Sync added user(s) to data/users.json
  app.post("/api/sync/users", (req, res) => {
    try {
      const incoming = Array.isArray(req.body)
        ? req.body
        : req.body?.users && Array.isArray(req.body.users)
        ? req.body.users
        : [req.body];

      const currentUsers = readJsonArray("users.json");
      for (const newUser of incoming) {
        if (!newUser || typeof newUser !== "object") continue;
        const id = newUser.id || newUser.idProfil;
        const email = newUser.email ? String(newUser.email).toLowerCase().trim() : "";
        const existingIndex = currentUsers.findIndex((u: any) => {
          if (id && (u.id === id || u.idProfil === id)) return true;
          if (email && u.email && String(u.email).toLowerCase().trim() === email) return true;
          return false;
        });

        if (existingIndex >= 0) {
          currentUsers[existingIndex] = { ...currentUsers[existingIndex], ...newUser };
        } else {
          currentUsers.push(newUser);
        }
      }

      saveJsonFiles("users.json", currentUsers);
      console.log(`Synced ${incoming.length} user(s) to data/users.json. Total: ${currentUsers.length}`);
      res.json({ success: true, count: currentUsers.length });
    } catch (error: any) {
      console.error("Error syncing users.json:", error);
      res.status(500).json({ error: error.message || "Failed to sync users.json" });
    }
  });

  // API Route: Replace users list in data/users.json (e.g. after mass-deleting non-admins)
  app.post("/api/sync/users/replace", (req, res) => {
    try {
      const incoming = Array.isArray(req.body)
        ? req.body
        : req.body?.users && Array.isArray(req.body.users)
        ? req.body.users
        : [];

      saveJsonFiles("users.json", incoming);
      console.log(`Replaced users.json with ${incoming.length} user(s).`);
      res.json({ success: true, count: incoming.length });
    } catch (error: any) {
      console.error("Error replacing users.json:", error);
      res.status(500).json({ error: error.message || "Failed to replace users.json" });
    }
  });

  // API Route: Sync added campaign(s) to data/campaigns.json
  app.post("/api/sync/campaigns", (req, res) => {
    try {
      const incoming = Array.isArray(req.body)
        ? req.body
        : req.body?.campaigns && Array.isArray(req.body.campaigns)
        ? req.body.campaigns
        : [req.body];

      const currentCampaigns = readJsonArray("campaigns.json");
      for (const newCamp of incoming) {
        if (!newCamp || typeof newCamp !== "object") continue;
        const id = newCamp.id;
        const year = newCamp.year;
        const existingIndex = currentCampaigns.findIndex((c: any) => {
          if (id && c.id === id) return true;
          if (year !== undefined && c.year === year) return true;
          return false;
        });

        if (existingIndex >= 0) {
          currentCampaigns[existingIndex] = { ...currentCampaigns[existingIndex], ...newCamp };
        } else {
          currentCampaigns.push(newCamp);
        }
      }

      saveJsonFiles("campaigns.json", currentCampaigns);
      console.log(`Synced ${incoming.length} campaign(s) to data/campaigns.json. Total: ${currentCampaigns.length}`);
      res.json({ success: true, count: currentCampaigns.length });
    } catch (error: any) {
      console.error("Error syncing campaigns.json:", error);
      res.status(500).json({ error: error.message || "Failed to sync campaigns.json" });
    }
  });

  // API Route: Parse Bilan/Dossier Document (PDF or DOCX) with Gemini
  app.post("/api/parse-document", async (req, res) => {
    try {
      const { name, mimeType, base64 } = req.body;
      if (!base64 || !mimeType) {
        return res.status(400).json({ error: "Champs 'base64' et 'mimeType' obligatoires." });
      }

      console.log(`Analyzing document: ${name} (${mimeType}), size: ${Math.round(base64.length / 1024)} KB`);

      let geminiInputParts: any[] = [];

      if (mimeType === "application/pdf") {
        // PDF: send directly to multimodality Gemini
        geminiInputParts = [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64,
            },
          },
          {
            text: "Analyse ce document de bilan annuel et extrait toutes les informations pertinentes pour remplir les champs ci-dessous."
          }
        ];
      } else {
        // For DOCX or text files, extract text on server first and send as text prompt
        try {
          const buffer = Buffer.from(base64, "base64");
          const extraction = await mammoth.extractRawText({ buffer });
          const text = extraction.value;

          if (!text || text.trim().length === 0) {
            throw new Error("L'extraction de texte de ce document a échoué ou le document est vide.");
          }

          geminiInputParts = [
            {
              text: `Analyse le document de bilan annuel de promotion textuel suivant et extrait toutes les informations pertinentes pour remplir les champs requis.
              
Document:
---
${text}
---`
            }
          ];
        } catch (err: any) {
          console.error("Mammoth docx extraction error:", err);
          return res.status(400).json({ error: `Impossible de lire le document Word: ${err.message || err}` });
        }
      }

      // Safe get GoogleGenAI key
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "La clé API Gemini (GEMINI_API_KEY) n'est pas configurée dans l'environnement." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      console.log("Calling Gemini for document analysis...");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: geminiInputParts,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              yearSummary: { type: Type.STRING, description: "Résumé global de l'année (contexte, missions effectuées)" },
              synthesis: { type: Type.STRING, description: "Synthèse d'activité de l'année passée" },
              knowHow: { type: Type.STRING, description: "Liste ou description des savoir-faire d'expertise" },
              commercialActivities: { type: Type.STRING, description: "Activités d'animation, d'avant-vente, ou de développement commercial chez le client" },
              training: { type: Type.STRING, description: "Formations suivies ou dispensées au cours de la période" },
              progressionDetails: { type: Type.STRING, description: "Détails sur la progression (métier, sectorielle, fonctionnelle)" },
              techDetails: { type: Type.STRING, description: "Compétences techniques clés mobilisées" },
              deliverables: { type: Type.STRING, description: "Livrables spécifiques d'ingénierie ou de projet produits" },
              autonomyJustification: { type: Type.STRING, description: "Justifications et preuves apportées au niveau d'autonomie" },
              careerGoals: { type: Type.STRING, description: "Objectifs à moyen-terme et aspirations de carrière" },
            }
          }
        }
      });

      const jsonText = response.text?.trim() || "{}";
      const parsedData = JSON.parse(jsonText);

      console.log("Gemini parsed document successfully!");
      return res.json({ success: true, data: parsedData });
    } catch (error: any) {
      console.error("Parse document server error:", error);
      return res.status(500).json({ error: error.message || "Erreur interne serveurs Gemini" });
    }
  });

  // API Route: Extract Past Objectives from Word (.docx) stored in Drive
  app.post("/api/drive/extract-word-objectives", async (req, res) => {
    try {
      const { fileId, accessToken } = req.body;
      if (!fileId || !accessToken) {
        return res.status(400).json({ error: "fileId et accessToken obligatoires." });
      }

      // 1. Download file bytes from Google Drive API
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!driveRes.ok) {
        const errText = await driveRes.text();
        return res.status(driveRes.status).json({ error: `Erreur Drive lors du téléchargement: ${errText}` });
      }

      const arrayBuffer = await driveRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 2. Convert Word to HTML with mammoth to parse tables reliably
      const conversion = await mammoth.convertToHtml({ buffer });
      const html = conversion.value || "";

      // 3. Extract table rows under "objectifs pour l'année prochaine"
      const objectives: string[] = [];

      // Regex matching table containing "objectif"
      const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi) || [];

      for (const tableHtml of tableMatches) {
        const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
        if (rowMatches.length > 1) {
          const firstRow = rowMatches[0].toLowerCase();
          if (firstRow.includes("objectif")) {
            // Found objectives table! Extract 1st cell of each subsequent row
            for (let r = 1; r < rowMatches.length; r++) {
              const cellMatches = rowMatches[r].match(/<td[\s\S]*?<\/td>/gi) || [];
              if (cellMatches.length > 0) {
                // Strip HTML tags
                const cleanText = cellMatches[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                if (cleanText && cleanText.length > 2 && !cleanText.toLowerCase().startsWith("objectif")) {
                  objectives.push(cleanText);
                }
              }
            }
            if (objectives.length > 0) break;
          }
        }
      }

      // If no table matched by "objectif" header, fallback to Gemini with the raw text to locate the objectives
      if (objectives.length === 0) {
        const rawText = (await mammoth.extractRawText({ buffer })).value || "";
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey && rawText.trim()) {
          const ai = new GoogleGenAI({
            apiKey: apiKey,
            httpOptions: { headers: { "User-Agent": "aistudio-build" } },
          });

          const geminiRes = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              {
                text: `Extrais uniquement la liste des objectifs fixés pour l'année prochaine depuis la section "Les objectifs pour l’année prochaine" du document suivant. Ne renvoie rien d'autre que les énoncés d'objectifs sous forme d'un tableau JSON de chaînes de caractères.
                
Document:
${rawText}`
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          });

          const list = JSON.parse(geminiRes.text?.trim() || "[]");
          if (Array.isArray(list) && list.length > 0) {
            objectives.push(...list);
          }
        }
      }

      return res.json({ success: true, objectives });
    } catch (error: any) {
      console.error("Extract Word objectives error:", error);
      return res.status(500).json({ error: error.message || "Erreur lors de l'extraction du document Word." });
    }
  });

  // Helper: Obtain access token using Google Service Account JWT
  async function getServiceAccountAccessToken(): Promise<string> {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "sheets-backend@sheets-backend-508208.iam.gserviceaccount.com";
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";

    if (!privateKey) {
      throw new Error("GOOGLE_PRIVATE_KEY is missing. Configure your Service Account private key in environment variables.");
    }

    // Replace escaped newlines if passed as string literal
    privateKey = privateKey.replace(/\\n/g, "\n");

    const client = new JWT({
      email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const tokens = await client.authorize();
    if (!tokens.access_token) {
      throw new Error("Could not acquire access token from Google Service Account.");
    }
    return tokens.access_token;
  }

  // API Route: Export Deliberations to Google Sheet via Service Account
  app.post("/api/sheets/export", async (req, res) => {
    try {
      const sheetsCfg = getSheetsConfig();
      const defaultExportSheetId = process.env.VITE_GOOGLE_SHEET_EXPORT_ID || sheetsCfg.defaultSpreadsheetId || "1QbvLbW39EgHCtOtj2LrrP7w1byWlkE6F5deOXOjCWmk";
      const { 
        spreadsheetId = defaultExportSheetId,
        tabName = "Délibérations_Jury",
        values 
      } = req.body;

      if (!values || !Array.isArray(values) || values.length === 0) {
        return res.status(400).json({ error: "No data rows provided to export." });
      }

      console.log(`Exporting ${values.length} rows to spreadsheet ${spreadsheetId}, tab '${tabName}' via Service Account...`);

      const token = await getServiceAccountAccessToken();

      // 1. Ensure tab exists
      try {
        const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (metaRes.ok) {
          const metaData: any = await metaRes.json();
          const exists = metaData.sheets?.some(
            (s: any) => s.properties?.title?.toLowerCase() === tabName.toLowerCase()
          );
          if (!exists) {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                requests: [
                  {
                    addSheet: {
                      properties: {
                        title: tabName,
                        gridProperties: { frozenRowCount: 1 }
                      }
                    }
                  }
                ]
              })
            });
          }
        }
      } catch (checkErr: any) {
        console.warn("Could not check/create sheet tab:", checkErr.message);
      }

      // 2. Clear existing tab values to keep data clean
      try {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}:clear`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          }
        );
      } catch (clearErr) {
        console.warn("Notice: Clear range skipped:", clearErr);
      }

      // 3. Write data to range A1
      const updateRange = `${tabName}!A1`;
      const writeRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            range: updateRange,
            majorDimension: "ROWS",
            values: values
          })
        }
      );

      if (!writeRes.ok) {
        const errJson = await writeRes.json().catch(() => ({}));
        const msg = errJson?.error?.message || `Google Sheets API responded with status ${writeRes.status}`;
        return res.status(writeRes.status).json({ error: msg });
      }

      const rowsCount = values.length > 1 ? values.length - 1 : values.length;
      return res.json({
        success: true,
        rowsExported: rowsCount,
        spreadsheetId,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        timestamp: new Date().toLocaleTimeString("fr-FR")
      });
    } catch (err: any) {
      console.error("Sheets export error:", err);
      return res.status(500).json({ error: err.message || "Erreur lors de l'exportation vers Google Sheets." });
    }
  });

  // API Route: Import data from Google Sheet via Service Account
  app.get("/api/sheets/import", async (req, res) => {
    try {
      const spreadsheetId = (req.query.spreadsheetId as string) || process.env.VITE_GOOGLE_SHEET_IMPORT_ID || "1QbvLbW39EgHCtOtj2LrrP7w1byWlkE6F5deOXOjCWmk";
      const range = (req.query.range as string) || "A1:Z100";

      const token = await getServiceAccountAccessToken();
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

      const sheetRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!sheetRes.ok) {
        const errJson = await sheetRes.json().catch(() => ({}));
        return res.status(sheetRes.status).json({ error: errJson?.error?.message || `Erreur Google Sheets (${sheetRes.status})` });
      }

      const data: any = await sheetRes.json();
      return res.json({
        success: true,
        values: data.values || [],
        spreadsheetId,
        timestamp: new Date().toLocaleTimeString("fr-FR")
      });
    } catch (err: any) {
      console.error("Sheets import error:", err);
      return res.status(500).json({ error: err.message || "Erreur lors de l'importation depuis Google Sheets." });
    }
  });

  // API Route: Import Accounts from Google Sheet via Service Account
  app.get("/api/sheets/import-accounts", async (req, res) => {
    try {
      const sheetsCfg = getSheetsConfig();
      const defaultImportSheetId = process.env.VITE_GOOGLE_SHEET_IMPORT_ID || sheetsCfg.defaultSpreadsheetId || "1QbvLbW39EgHCtOtj2LrrP7w1byWlkE6F5deOXOjCWmk";
      const spreadsheetId = (req.query.spreadsheetId as string) || defaultImportSheetId;
      const token = await getServiceAccountAccessToken();

      // Check spreadsheet metadata to find existing sheet names
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!metaRes.ok) {
        const errJson = await metaRes.json().catch(() => ({}));
        return res.status(metaRes.status).json({ error: errJson?.error?.message || `Erreur Google Sheets (${metaRes.status})` });
      }

      const metaData: any = await metaRes.json();
      const sheetTitles: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title || "");

      // 1. Check if configured explicitly in google-sheets-config.json for this spreadsheetId
      let targetTab: string | undefined;
      const sheetDef = sheetsCfg.spreadsheets?.[spreadsheetId];
      if (sheetDef?.tabs) {
        for (const [tabKey, tabVal] of Object.entries(sheetDef.tabs as any)) {
          if ((tabVal as any).purpose === "IMPORT_ACCOUNTS") {
            targetTab = tabKey;
            break;
          }
        }
      }

      // 2. Fallback to name heuristic
      if (!targetTab) {
        targetTab = sheetTitles.find(t => ["comptes", "utilisateurs", "users", "accounts"].includes(t.toLowerCase().trim()));
      }
      if (!targetTab) {
        const nonDelibTab = sheetTitles.find(t => !t.toLowerCase().includes("délibération") && !t.toLowerCase().includes("deliberation"));
        targetTab = nonDelibTab || sheetTitles[0] || "Sheet1";
      }

      const range = `${targetTab}!A1:Z500`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
      const sheetRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!sheetRes.ok) {
        const errJson = await sheetRes.json().catch(() => ({}));
        return res.status(sheetRes.status).json({ error: errJson?.error?.message || `Erreur Google Sheets (${sheetRes.status})` });
      }

      const data: any = await sheetRes.json();
      const values: (string | number)[][] = data.values || [];

      return res.json({
        success: true,
        tabName: targetTab,
        sheetTitles,
        values,
        spreadsheetId,
        timestamp: new Date().toLocaleTimeString("fr-FR")
      });
    } catch (err: any) {
      console.error("Sheets import-accounts error:", err);
      return res.status(500).json({ error: err.message || "Erreur lors de l'importation des comptes depuis Google Sheets." });
    }
  });

  // Serve static UI assets with Vite or express.static
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} under NODE_ENV=${process.env.NODE_ENV}`);
  });
}

startServer();
