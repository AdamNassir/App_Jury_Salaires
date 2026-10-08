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

  // Shared dossier storage used by candidates, evaluators and jury members.
  app.get("/api/data/dossiers", (_req, res) => {
    res.json({ dossiers: readJsonArray("dossiers.json") });
  });

  app.post("/api/sync/dossiers", (req, res) => {
    try {
      const incoming = Array.isArray(req.body)
        ? req.body
        : req.body?.dossiers && Array.isArray(req.body.dossiers)
          ? req.body.dossiers
          : [req.body];
      const currentDossiers = readJsonArray("dossiers.json");

      for (const dossier of incoming) {
        if (!dossier || typeof dossier !== "object" || !dossier.id) continue;
        const index = currentDossiers.findIndex((item: any) => item.id === dossier.id);
        if (index >= 0) currentDossiers[index] = { ...currentDossiers[index], ...dossier };
        else currentDossiers.push(dossier);
      }

      saveJsonFiles("dossiers.json", currentDossiers);
      res.json({ success: true, count: currentDossiers.length });
    } catch (error: any) {
      console.error("Error syncing dossiers.json:", error);
      res.status(500).json({ error: error.message || "Failed to sync dossiers.json" });
    }
  });

  app.post("/api/sync/dossiers/delete", (req, res) => {
    try {
      const idsToDelete: string[] = Array.isArray(req.body?.ids)
        ? req.body.ids
        : req.body?.id
          ? [req.body.id]
          : [];
      const campaignIdToDelete = req.body?.campaignId;

      let currentDossiers = readJsonArray("dossiers.json");
      const initialCount = currentDossiers.length;

      currentDossiers = currentDossiers.filter((item: any) => {
        if (idsToDelete.includes(item.id)) return false;
        if (campaignIdToDelete && (item.campaignId === campaignIdToDelete || item.campaignId === `campaign_${campaignIdToDelete}`)) return false;
        return true;
      });

      saveJsonFiles("dossiers.json", currentDossiers);
      console.log(`Deleted ${initialCount - currentDossiers.length} dossiers on server. Remaining: ${currentDossiers.length}`);
      res.json({ success: true, deleted: initialCount - currentDossiers.length, remaining: currentDossiers.length });
    } catch (error: any) {
      console.error("Error deleting from dossiers.json:", error);
      res.status(500).json({ error: error.message || "Failed to delete from dossiers.json" });
    }
  });

  app.post("/api/sync/dossiers/replace", (req, res) => {
    try {
      const incoming = Array.isArray(req.body)
        ? req.body
        : Array.isArray(req.body?.dossiers)
          ? req.body.dossiers
          : [];
      saveJsonFiles("dossiers.json", incoming);
      res.json({ success: true, count: incoming.length });
    } catch (error: any) {
      console.error("Error replacing dossiers.json:", error);
      res.status(500).json({ error: error.message || "Failed to replace dossiers.json" });
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

      // Helper to decode HTML entities (accents, apostrophes, spaces)
      const decodeHtml = (str: string): string => {
        return str
          .replace(/&eacute;/gi, "é")
          .replace(/&egrave;/gi, "è")
          .replace(/&ecirc;/gi, "ê")
          .replace(/&euml;/gi, "ë")
          .replace(/&agrave;/gi, "à")
          .replace(/&acirc;/gi, "â")
          .replace(/&icirc;/gi, "î")
          .replace(/&iuml;/gi, "ï")
          .replace(/&ocirc;/gi, "ô")
          .replace(/&ugrave;/gi, "ù")
          .replace(/&ucirc;/gi, "û")
          .replace(/&ccedil;/gi, "ç")
          .replace(/&#39;/gi, "'")
          .replace(/&rsquo;/gi, "'")
          .replace(/&lsquo;/gi, "'")
          .replace(/&rdquo;/gi, '"')
          .replace(/&ldquo;/gi, '"')
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&");
      };

      const normalizeText = (str: string): string => {
        return str
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[’'"`]/g, "'")
          .replace(/[\s\u00A0]+/g, " ")
          .replace(/[^a-z0-9\s]/g, "")
          .trim();
      };

      // 2. Convert Word to HTML with mammoth to parse tables reliably
      const conversion = await mammoth.convertToHtml({ buffer });
      const rawHtml = conversion.value || "";
      const decodedHtml = decodeHtml(rawHtml);

      const objectives: string[] = [];
      const debugTables: any[] = [];
      const headingsFound: string[] = [];

      // Extract headings for diagnostics
      const headingMatches = decodedHtml.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>/gi) || [];
      for (const h of headingMatches) {
        const clean = h.replace(/<[^>]+>/g, " ").trim();
        const norm = normalizeText(clean);
        if (norm.includes("objectif") && clean.length < 150) {
          headingsFound.push(clean);
        }
      }

      // Extract only the table following "Les objectifs pour l’année prochaine :".
      // Earlier SMART tables may describe unrelated sections of the annual review.
      const targetHeading = "les objectifs pour lannee prochaine";
      const paragraphs = [...decodedHtml.matchAll(/<(?:p|h[1-6])\b[^>]*>[\s\S]*?<\/(?:p|h[1-6])>/gi)];
      const headingMatch = paragraphs.find(match =>
        normalizeText(match[0].replace(/<[^>]*>/g, ' ')).includes(targetHeading)
      );
      const allTableMatches = [...decodedHtml.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
      for (let t = 0; t < allTableMatches.length; t++) {
        const match = allTableMatches[t];
        const rows = [...match[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)];
        const grid = rows.map(row => [...row[0].matchAll(/<(?:td|th)\b[^>]*>[\s\S]*?<\/(?:td|th)>/gi)]
          .map(cell => cell[0].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').trim()));
        debugTables.push({ index: t + 1, rowCount: grid.length,
          colCount: grid[0]?.length || 0, headers: grid[0] || [], rows: grid.slice(0, 10) });
        if (!headingMatch || match.index! <= headingMatch.index!) continue;
        const header = normalizeText((grid[0] || []).join(' '));
        if (!header.includes('objectif') || !header.includes('benefice')) continue;
        // Skip the heading row; column 0 is 1, 2, ... and column 1 is the objective.
        for (const row of grid.slice(1)) {
          const numberCell = (row[0] || '').trim();
          const objectiveCell = (row[1] || '').trim();
          const normalized = normalizeText(objectiveCell);
          if (/^\d+[.)\s-]*$/.test(numberCell) && objectiveCell &&
              !normalized.startsWith('objectifs') && !normalized.includes('specifique')) {
            objectives.push(objectiveCell);
          }
        }
        break;
      }

      const debugInfo = {
        fileName: "Document Word (.docx)",
        fileMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headingsFound,
        tables: debugTables,
        rawTextPreview: "",
        message: `${objectives.length} objectif(s) extrait(s), ${debugTables.length} tableau(x) analysé(s)`
      };

      console.log(`Extracted ${objectives.length} objectives from Word file. Tables:`, debugTables.length);

      return res.json({ success: true, objectives, debugInfo });
    } catch (error: any) {
      console.error("Extract Word objectives error:", error);
      return res.status(500).json({ error: error.message || "Erreur lors de l'extraction du document Word." });
    }
  });

  // API Route: Extract Past Objectives from Manually Uploaded File (.docx, .pdf, .json, etc.)
  app.post("/api/candidate/extract-file-objectives", async (req, res) => {
    try {
      const { fileName, fileData, mimeType } = req.body;
      if (!fileName || !fileData) {
        return res.status(400).json({ error: "fileName et fileData obligatoires." });
      }

      const base64Str = fileData.includes(",") ? fileData.split(",")[1] : fileData;
      const buffer = Buffer.from(base64Str, "base64");
      const lowerName = fileName.toLowerCase();

      const decodeHtml = (str: string): string => {
        return str
          .replace(/&eacute;/gi, "é")
          .replace(/&egrave;/gi, "è")
          .replace(/&ecirc;/gi, "ê")
          .replace(/&euml;/gi, "ë")
          .replace(/&agrave;/gi, "à")
          .replace(/&acirc;/gi, "â")
          .replace(/&icirc;/gi, "î")
          .replace(/&iuml;/gi, "ï")
          .replace(/&ocirc;/gi, "ô")
          .replace(/&ugrave;/gi, "ù")
          .replace(/&ucirc;/gi, "û")
          .replace(/&ccedil;/gi, "ç")
          .replace(/&#39;/gi, "'")
          .replace(/&rsquo;/gi, "'")
          .replace(/&lsquo;/gi, "'")
          .replace(/&rdquo;/gi, '"')
          .replace(/&ldquo;/gi, '"')
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&");
      };

      const normalizeText = (str: string): string => {
        return str
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[’'"`]/g, "'")
          .replace(/[\s\u00A0]+/g, " ")
          .replace(/[^a-z0-9\s]/g, "")
          .trim();
      };

      // 1. If Word document (.docx or .doc)
      if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
        try {
          const conversion = await mammoth.convertToHtml({ buffer });
          const rawHtml = conversion.value || "";
          const decodedHtml = decodeHtml(rawHtml);
          const objectives: string[] = [];

          const allTableMatches = decodedHtml.match(/<table[\s\S]*?<\/table>/gi) || [];
          let activeSmartCol = -1;
          let hasFoundSmartTable = false;

          for (let t = 0; t < allTableMatches.length; t++) {
            const tableHtml = allTableMatches[t];
            const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
            if (rowMatches.length === 0) continue;

            const grid: string[][] = [];
            for (let r = 0; r < rowMatches.length; r++) {
              const cellMatches = rowMatches[r].match(/<(td|th)[\s\S]*?<\/(td|th)>/gi) || [];
              const rowCells = cellMatches.map(c => c.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").trim());
              grid.push(rowCells);
            }

            const headerRow = grid[0] || [];
            const firstRowText = normalizeText(headerRow.join(" "));

            if (hasFoundSmartTable && (firstRowText.includes("visa") || firstRowText.includes("synthese") || firstRowText.includes("signature"))) {
              break;
            }

            let tableSmartCol = -1;
            for (let c = 0; c < headerRow.length; c++) {
              const normCell = normalizeText(headerRow[c]);
              if (
                normCell.includes("specifique") ||
                normCell.includes("s de smart") ||
                normCell.includes("doivent etre specifiques") ||
                (normCell.includes("objectif") && normCell.includes("smart"))
              ) {
                tableSmartCol = c;
                break;
              }
            }

            if (tableSmartCol === -1 && grid.length > 1) {
              for (let c = 0; c < grid[1].length; c++) {
                const normCell = normalizeText(grid[1][c]);
                if (
                  normCell.includes("specifique") ||
                  normCell.includes("s de smart") ||
                  normCell.includes("doivent etre specifiques")
                ) {
                  tableSmartCol = c;
                  break;
                }
              }
            }

            if (headerRow.length >= 2 && tableSmartCol === -1) {
              let col0IsNumbering = true;
              let col1HasText = false;
              for (let r = 1; r < grid.length; r++) {
                const c0 = (grid[r][0] || "").trim();
                const c1 = (grid[r][1] || "").trim();
                if (c0 && !/^\d+[\.\)\:\-]?$/.test(c0)) col0IsNumbering = false;
                if (c1 && c1.length > 3 && !/^\d+$/.test(c1)) col1HasText = true;
              }
              if (col0IsNumbering && col1HasText) tableSmartCol = 1;
            }

            if (tableSmartCol !== -1) {
              hasFoundSmartTable = true;
              activeSmartCol = tableSmartCol;
              for (let r = 1; r < grid.length; r++) {
                let rawCellText = grid[r][activeSmartCol] || "";
                if ((/^\d+[\.\)\:\-]?$/.test(rawCellText.trim()) || !rawCellText.trim()) && grid[r].length > 1) {
                  const altText = (grid[r][1] || "").trim();
                  if (altText.length > 3 && !/^\d+$/.test(altText)) rawCellText = altText;
                }
                const clean = rawCellText.replace(/^[\s\d]+[\.\)\:\-\n\s]+/, "").trim();
                const normClean = normalizeText(clean);
                if (
                  clean &&
                  clean.length > 3 &&
                  !/^\d+$/.test(clean) &&
                  !normClean.startsWith("objectif") &&
                  !normClean.includes("specifique") &&
                  !normClean.includes("moyen terme") &&
                  !normClean.includes("vision carriere")
                ) {
                  objectives.push(clean);
                }
              }
            }
          }

          if (objectives.length > 0) {
            return res.json({ success: true, objectives });
          }
        } catch (wordErr) {
          console.warn("Word parser exception:", wordErr);
        }
      }

      // 2. If JSON file (.json)
      if (lowerName.endsWith(".json")) {
        try {
          const text = buffer.toString("utf-8");
          const json = JSON.parse(text);
          const rawObjs = json?.previousObjectives || json?.nextObjectives || json?.annualReport?.nextObjectives || json?.annualReport?.previousObjectives || [];
          const objectives = rawObjs
            .map((o: any) => typeof o === "string" ? o : (o.objective || o.title || ""))
            .filter((o: string) => o && o.trim().length > 2);
          if (objectives.length > 0) {
            return res.json({ success: true, objectives });
          }
        } catch (jsonErr) {
          console.warn("JSON parser exception:", jsonErr);
        }
      }

      // 3. Fallback / PDF: Gemini AI extraction
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });

        let parts: any[] = [];
        if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
          parts = [
            {
              inlineData: {
                data: base64Str,
                mimeType: "application/pdf"
              }
            },
            {
              text: "Analyse ce document de Bilan Annuel N-1 et extrait UNIQUEMENT la liste des objectifs fixés pour l'année à venir / l'année prochaine (les objectifs SMART définis à la fin du bilan annuel précédent). Ne confonds pas avec les objectifs à moyen terme ou la vision carrière. Retourne UNIQUEMENT les libellés de ces objectifs sous forme de tableau JSON avec la clé 'objectives'."
            }
          ];
        } else if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
          const rawText = (await mammoth.extractRawText({ buffer })).value || "";
          parts = [
            {
              text: `Analyse le texte suivant issu d'un Bilan Annuel N-1 et extrait UNIQUEMENT la liste des objectifs fixés pour l'année à venir / l'année prochaine (les objectifs SMART définis à la fin du bilan annuel précédent). Ne confonds pas avec les objectifs à moyen terme ou la vision carrière.

Texte du document:
---
${rawText}
---`
            }
          ];
        } else {
          const rawText = buffer.toString("utf-8");
          parts = [
            {
              text: `Analyse le document suivant et extrait la liste des objectifs fixés pour l'année à venir:
              
${rawText}`
            }
          ];
        }

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: parts,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                objectives: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Liste des libellés d'objectifs pour l'année à venir extraits du document"
                }
              },
              required: ["objectives"]
            }
          }
        });

        const jsonText = response.text?.trim() || "{}";
        const parsed = JSON.parse(jsonText);
        const objectives = (parsed.objectives || []).filter((o: string) => o && o.trim().length > 3);
        if (objectives.length > 0) {
          return res.json({ success: true, objectives });
        }
      }

      return res.status(404).json({
        error: "Aucun objectif pour l'année passée n'a pu être identifié dans ce fichier. Assurez-vous qu'il contient la section 'Objectifs pour l'année prochaine' ou le tableau des objectifs SMART."
      });
    } catch (err: any) {
      console.error("Extract file objectives error:", err);
      return res.status(500).json({ error: err.message || "Erreur lors de l'analyse du fichier." });
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
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
      ],
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
      const defaultFolderId = process.env.VITE_GOOGLE_DRIVE_EXPORT_FOLDER_ID || sheetsCfg.exportDriveFolderId || "1BHFi8Z_0K1tTUalK6BKC-B4eXh6PLOx5";
      let { 
        spreadsheetId = process.env.VITE_GOOGLE_SHEET_EXPORT_ID || sheetsCfg.defaultSpreadsheetId || "1QbvLbW39EgHCtOtj2LrrP7w1byWlkE6F5deOXOjCWmk",
        folderId = defaultFolderId,
        tabName = "Délibérations_Jury",
        values 
      } = req.body;

      if (!values || !Array.isArray(values) || values.length === 0) {
        return res.status(400).json({ error: "No data rows provided to export." });
      }

      const token = await getServiceAccountAccessToken();

      // Check or create spreadsheet inside target Drive folder
      if (folderId) {
        try {
          const query = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
          const searchUrl = `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
            q: query,
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
            corpora: "allDrives",
            fields: "files(id, name, webViewLink)"
          })}`;

          const searchRes = await fetch(searchUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (searchRes.ok) {
            const searchData: any = await searchRes.json();
            const existing = (searchData.files || []).find((f: any) => 
              f.name === "Délibérations_Jury" || f.name.includes("Délibérations") || f.name.includes("Salaires")
            ) || (searchData.files || [])[0];

            if (existing) {
              spreadsheetId = existing.id;
            } else {
              const createRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  name: "Délibérations_Jury",
                  mimeType: "application/vnd.google-apps.spreadsheet",
                  parents: [folderId]
                })
              });
              if (createRes.ok) {
                const createData: any = await createRes.json();
                if (createData.id) {
                  spreadsheetId = createData.id;
                }
              }
            }
          } else {
            return res.status(403).json({ error: "Target folder is not accessible by the server service account. Using client OAuth." });
          }
        } catch (folderErr: any) {
          console.warn("Folder search/create failed in service account:", folderErr);
          return res.status(403).json({ error: `Service account cannot access folder ${folderId}. Using client OAuth.` });
        }
      }

      console.log(`Exporting ${values.length} rows to spreadsheet ${spreadsheetId}, tab '${tabName}' via Service Account...`);

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
