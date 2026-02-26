import { google } from "googleapis";
import { chromium } from "playwright";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Hooks utilitaires du projet
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { analyzeImage } from "../utils/openai.js";

/**
 * =========================
 * CONFIGURATION ET CSS
 * =========================
 */
// CSS pour cacher tout l'environnement Google Sheets (menus, barres, etc.)
const SHEETS_HIDE_CSS = `
  .grid-bottom-bar, .docs-sheet-tab-bar, #docs-header,
  #docs-chrome, .docs-titlebar-badges, .waffle-chip-container,
  #docs-menubar, .docs-butterbar-container, .docs-offline-indicator,
  .docs-gm3-topbar, .notranslate[role="banner"] { display: none !important; }
`;

const SHEET_CROP_PROMPT = `Tu es un expert en rognage d'images.
Cette image est une capture d'écran d'un Google Sheet.
Tu DOIS rogner pour ne garder STRICTEMENT que le tableau de données visibles.

RÈGLES STRICTES :
1. Supprime TOUT en haut : menus, barre d'outils, barre de formule, en-tête du doc
2. Supprime TOUT en bas : barre d'onglets, barres de défilement
3. Supprime TOUTES les marges vides
4. Supprime les lettres de colonnes (A,B,C) et numéros de lignes (1,2,3)
5. Résultat = tableau SERRÉ, sans espace vide
6. NE COUPE AUCUNE donnée. Conserve la première ligne d'en-tête (noms de colonnes)

Réponds UNIQUEMENT avec : CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

/**
 * Les règles de captures (Filtres API).
 * 'sourceTitle' est l'onglet où l'on lit les données.
 * 'capTitle' est l'onglet généré où Playwright ira prendre la capture.
 */
const CAPTURE_CONFIGS = [
    // --- SHEET 1 : AUDIT SEO ---
    {
        id: "Img_Poids_image",
        sourceTitle: "Images",
        capTitle: "CAP_Images",
        keep: [
            { label: "Destination", matchAny: ["destination"] },
            { label: "Taille (octets)", matchAny: ["taille", "octet", "bytes"] },
        ],
        where: { colMatchAny: ["taille", "octet", "bytes"], op: "bytes_gte", value: 100000 },
        sort: { colMatchAny: ["taille", "octet", "bytes"], type: "bytes", order: "desc" },
    },
    // Balises H1-H6
    {
        id: "Img_balise_h1_absente",
        sourceTitle: "Balises H1-H6",
        capTitle: "CAP_H1_absente",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "H1 absente", matchAny: ["h1 absente"] }],
        where: { colMatchAny: ["h1 absente"], op: "equals_ci", value: "oui" },
    },
    {
        id: "Img_que des H1 vides",
        sourceTitle: "Balises H1-H6",
        capTitle: "CAP_que_des_H1_vides",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "que des H1 vides", matchAny: ["que des h1 vides"] }],
        where: { colMatchAny: ["que des h1 vides"], op: "equals_ci", value: "oui" },
    },
    {
        id: "Img_au moins une H1 vide",
        sourceTitle: "Balises H1-H6",
        capTitle: "CAP_au_moins_une_H1_vide",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "au moins une H1 vide", matchAny: ["au moins une h1 vide"] }],
        where: { colMatchAny: ["au moins une h1 vide"], op: "equals_ci", value: "oui" },
    },
    {
        id: "Img_1ère balise Hn n'est pas H1",
        sourceTitle: "Balises H1-H6",
        capTitle: "CAP_1ere_Hn_pas_H1",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "1ère balise Hn n'est pas H1", matchAny: ["1ere balise hn", "n'est pas h1", "pas h1"] }],
        where: { colMatchAny: ["1ere balise hn", "n'est pas h1", "pas h1"], op: "equals_ci", value: "oui" },
    },
    {
        id: "Img_Sauts de niveau entre les Hn",
        sourceTitle: "Balises H1-H6",
        capTitle: "CAP_Sauts_de_niveau",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "Sauts de niveau", matchAny: ["sauts de niveau"] }],
        where: { colMatchAny: ["sauts de niveau"], op: "number_not_zero" },
        sort: { colMatchAny: ["sauts de niveau"], type: "number", order: "desc" },
    },
    {
        id: "Img_Hn trop longue",
        sourceTitle: "Balises H1-H6",
        capTitle: "CAP_Hn_trop_longue",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "Hn trop longue", matchAny: ["hn trop longue"] }],
        where: { colMatchAny: ["hn trop longue"], op: "number_gte", value: 1 },
        sort: { colMatchAny: ["hn trop longue"], type: "number", order: "desc" },
    },
    // Nb mots body
    {
        id: "Img_longeur_page",
        sourceTitle: "Nb mots body",
        capTitle: "CAP_Nb_mots_body_Top10",
        keep: "ALL",
        sort: { colMatchAny: ["gravité", "gravite", "gravite du probleme"], type: "number", order: "desc" },
        limit: 10,
    },
    // Meta desc (0 caractères)
    {
        id: "Img_meta_description",
        sourceTitle: "Meta desc",
        capTitle: "CAP_Meta_desc_0",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "Nb de caractères", matchAny: ["nb de caracteres", "caractere", "caracter"] }],
        where: { colMatchAny: ["nb de caracteres", "caractere", "caracter"], op: "number_eq", value: 0 },
        ifEmptyTake: 5,
    },
    // Balise title (“trop longue”)
    {
        id: "Img_balises_title",
        sourceTitle: "Balise title",
        capTitle: "CAP_Title_trop_longue",
        keep: [{ label: "URL", matchAny: ["url"] }, { label: "État", matchAny: ["etat", "status", "état"] }],
        where: { colMatchAny: ["etat", "status", "état"], op: "includes_ci", value: "trop longue" },
        ifEmptyTake: 5,
    },
    // Autres onglets pris tels quels
    { id: "Img_meme_title", sourceTitle: "Même title", capTitle: "CAP_Meme_Title", keep: "ALL" },
    { id: "Img_meta_description_double", sourceTitle: "Même balise meta desc", capTitle: "CAP_Meme_Meta_Desc", keep: "ALL" },
    { id: "Img_balise_h1_double", sourceTitle: "Doublons H1", capTitle: "CAP_Doublons_H1", keep: "ALL" },

    // --- SHEET 2 : PLAN D'ACTION (Ajoutés suite aux instructions du client) ---
    { id: "Img_planD'action", sourceTitle: "Synthèse Audit - Plan d'action", capTitle: "CAP_Synthese_Plan_Action", keep: "ALL", isPlanAction: true },
    { id: "Img_Requetes_cles", sourceTitle: "Requêtes Clés / Calédito", capTitle: "CAP_Requetes_Cles", keep: "ALL", isPlanAction: true },
    { id: "Img_donnee image", sourceTitle: "Données Images", capTitle: "CAP_Donnees_Images", keep: "ALL", isPlanAction: true },
    { id: "Img_longeur_page_plan", sourceTitle: "Longueur de page", capTitle: "CAP_Longueur_Page_Plan", keep: "ALL", isPlanAction: true },
];


/**
 * =========================
 * GOOGLE SHEETS AUTH CLIENT
 * =========================
 */
function sheetsClient() {
    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    return google.sheets({ version: "v4", auth: oauth2 });
}

/**
 * =========================
 * HELPERS DE DONNÉES
 * =========================
 */
function norm(s) {
    return String(s ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ");
}

function toFloatAny(v) {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    const cleaned = s.replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : NaN;
}

function toBytes(v) {
    const raw = String(v ?? "").trim();
    if (!raw) return NaN;

    const s = raw.toLowerCase().replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return NaN;

    if (s.includes("mo") || s.includes("mb")) return n * 1024 * 1024;
    if (s.includes("ko") || s.includes("kb")) return n * 1024;
    return n;
}

function findColIndex(headers, matchAny) {
    const h = headers.map((x) => norm(x));
    const targets = (matchAny || []).map(norm);
    for (let i = 0; i < h.length; i++) {
        for (const t of targets) if (t && h[i].includes(t)) return i;
    }
    return -1;
}

function applyWhere(row, colIdx, where) {
    if (!where) return true;
    const cell = String(row[colIdx] ?? "").trim();

    switch (where.op) {
        case "equals_ci": return norm(cell) === norm(where.value);
        case "includes_ci": return norm(cell).includes(norm(where.value));
        case "number_eq": {
            const n = toFloatAny(cell);
            return Number.isFinite(n) && n === Number(where.value);
        }
        case "number_gte": {
            const n = toFloatAny(cell);
            return Number.isFinite(n) && n >= Number(where.value);
        }
        case "number_not_zero": {
            const n = toFloatAny(cell);
            return Number.isFinite(n) && n !== 0;
        }
        case "bytes_gte": {
            const b = toBytes(cell);
            return Number.isFinite(b) && b >= Number(where.value);
        }
        default: return true;
    }
}

function sortRows(rows, colIdx, sort) {
    if (!sort || colIdx < 0) return rows;
    const dir = sort.order === "asc" ? 1 : -1;

    const keyFn =
        sort.type === "bytes" ? (r) => toBytes(r[colIdx])
            : sort.type === "number" ? (r) => toFloatAny(r[colIdx])
                : (r) => norm(r[colIdx]);

    return rows.slice().sort((a, b) => {
        const ka = keyFn(a);
        const kb = keyFn(b);
        const va = Number.isFinite(ka) ? ka : -Infinity;
        const vb = Number.isFinite(kb) ? kb : -Infinity;
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
    });
}

function buildSnapshotTable(sourceValues, cfg) {
    if (!sourceValues || sourceValues.length === 0) return [["(vide)"]];

    const header = sourceValues[0];
    const data = sourceValues.slice(1);

    // Keep columns
    let keepIdx = [];
    let outHeader = [];

    if (cfg.keep === "ALL") {
        keepIdx = header.map((_, i) => i);
        outHeader = header;
    } else {
        for (const col of cfg.keep) {
            const idx = findColIndex(header, col.matchAny);
            keepIdx.push(idx);
            outHeader.push(idx >= 0 ? header[idx] : col.label);
        }
    }

    const whereIdx = cfg.where ? findColIndex(header, cfg.where.colMatchAny) : -1;

    let filtered = data.filter((row) => {
        const hasAny = row.some((c) => String(c ?? "").trim() !== "");
        if (!hasAny) return false;

        if (!cfg.where) return true;
        if (whereIdx < 0) return false;
        return applyWhere(row, whereIdx, cfg.where);
    });

    if (filtered.length === 0 && cfg.ifEmptyTake) {
        filtered = data
            .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
            .slice(0, cfg.ifEmptyTake);
    }

    const sortIdx = cfg.sort ? findColIndex(header, cfg.sort.colMatchAny) : -1;
    filtered = sortRows(filtered, sortIdx, cfg.sort);

    if (cfg.limit) filtered = filtered.slice(0, cfg.limit);

    const projected = filtered.map((row) => keepIdx.map((idx) => (idx >= 0 ? row[idx] ?? "" : "")));
    return [outHeader, ...projected];
}

/**
 * =========================
 * TRANSACTIONS API GOOGLE SHEETS
 * =========================
 */
function extractSpreadsheetId(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

async function getSpreadsheetMeta(sheets, spreadsheetId) {
    try {
        const res = await sheets.spreadsheets.get({ spreadsheetId });
        return (res?.data?.sheets || []).map((s) => ({
            title: s.properties?.title,
            sheetId: s.properties?.sheetId,
        }));
    } catch (e) {
        console.log(`[SHEETS-API] Impossible d'ouvrir le fichier ${spreadsheetId}: ${e.message}`);
        return [];
    }
}

async function ensureSheet(sheets, spreadsheetId, title) {
    const meta = await getSpreadsheetMeta(sheets, spreadsheetId);
    if (!meta || meta.length === 0) return null; // Sheet inaccessible

    const existing = meta.find((x) => x.title === title);
    if (existing) return existing.sheetId;

    try {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title } } }] },
        });

        const meta2 = await getSpreadsheetMeta(sheets, spreadsheetId);
        const created = meta2.find((x) => x.title === title);
        if (!created) throw new Error(`[SHEETS-API] Création onglet "${title}" non confirmée.`);
        return created.sheetId;
    } catch (e) {
        console.error(`[SHEETS-API] Erreur création de l'onglet ${title}: ${e.message}`);
        throw e;
    }
}

function escapeSheetTitle(title) {
    return `'${title.replace(/'/g, "''")}'`;
}

function a1(title, range) {
    return `${escapeSheetTitle(title)}!${range}`;
}

async function readAllValues(sheets, spreadsheetId, sheetTitle) {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: a1(sheetTitle, "A1:ZZ"),
            valueRenderOption: "FORMATTED_VALUE",
        });
        return res?.data?.values || [];
    } catch (e) {
        console.warn(`[SHEETS-API] Onglet introuvable ou illisible "${sheetTitle}": ${e.message}`);
        return [];
    }
}

async function clearAndWrite(sheets, spreadsheetId, sheetTitle, values) {
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: a1(sheetTitle, "A1:ZZ"),
        requestBody: {},
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: a1(sheetTitle, "A1"),
        valueInputOption: "RAW",
        requestBody: { majorDimension: "ROWS", values },
    });
}

/**
 * Prépare les onglets 'CAP_*' en base de données.
 */
async function prepareAllCaptures(auditSheetId, planSheetId) {
    const sheets = sheetsClient();
    const sourceCache = new Map();
    const out = [];

    for (const cfg of CAPTURE_CONFIGS) {
        // Déterminer sur quel fichier on travaille et si l'URL a bien été fournie
        const isPlanAction = cfg.isPlanAction;
        const spreadsheetId = isPlanAction ? planSheetId : auditSheetId;
        const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

        if (!spreadsheetId) {
            console.warn(`[SHEETS-API] Fichier Sheet introuvable pour la config ${cfg.id}. On passe.`);
            continue;
        }

        try {
            const capSheetId = await ensureSheet(sheets, spreadsheetId, cfg.capTitle);
            if (!capSheetId && capSheetId !== 0) {
                out.push({ id: cfg.id, error: "Spreadsheet inaccessible ou permissions insuffisantes" });
                continue;
            }

            const cacheKey = `${spreadsheetId}-${cfg.sourceTitle}`;
            if (!sourceCache.has(cacheKey)) {
                const v = await readAllValues(sheets, spreadsheetId, cfg.sourceTitle);
                sourceCache.set(cacheKey, v);
            }

            const sourceValues = sourceCache.get(cacheKey);

            // Appliquer la logique métier aux colonnes
            const capValues = buildSnapshotTable(sourceValues, cfg);

            // Ecrire dans l'onglet temporaire
            await clearAndWrite(sheets, spreadsheetId, cfg.capTitle, capValues);

            out.push({
                id: cfg.id,
                capTitle: cfg.capTitle,
                capSheetId,
                url: `${spreadsheetUrl}#gid=${capSheetId}`,
                rows: Math.max(0, capValues.length - 1),
            });
            console.log(`[SHEETS-API] ✅ Snapshot créé: ${cfg.capTitle} (${Math.max(0, capValues.length - 1)} lignes)`);
        } catch (e) {
            console.error(`[SHEETS-API] ERREUR traitement de ${cfg.id}: ${e.message}`);
            out.push({ id: cfg.id, error: e.message });
        }
    }

    return out;
}

/**
 * =========================
 * PLAYWRIGHT ET IA
 * =========================
 */
async function cropWithAI(imagePath, prompt) {
    if (!process.env.OPENAI_API_KEY) return imagePath;
    try {
        console.log(`[SHEETS-AI] Demande de rognage AI sur ${imagePath}...`);
        const response = await analyzeImage(imagePath, prompt);
        const match = response.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);
        if (!match) return imagePath;

        const [, x, y, w, h] = match.map(Number);
        const meta = await sharp(imagePath).metadata();

        const left = Math.min(x, meta.width - 10);
        const top = Math.min(y, meta.height - 10);
        const width = Math.min(w, meta.width - left);
        const height = Math.min(h, meta.height - top);

        if (width < 20 || height < 20) return imagePath;

        const croppedPath = imagePath.replace(".png", "_cropped.png");
        await sharp(imagePath).extract({ left, top, width, height }).toFile(croppedPath);
        fs.unlinkSync(imagePath);
        return croppedPath;
    } catch (e) {
        console.warn(`[SHEETS-AI] AI crop échoué : ${e.message}`);
        return imagePath;
    }
}

async function openSheetBrowser(url, googleCookies) {
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
    });

    const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        locale: "fr-FR",
    });

    if (googleCookies?.length) await context.addCookies(googleCookies);

    const page = await context.newPage();
    page.setDefaultTimeout(90000);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Attendre la grille (waffle-grid)
    try {
        await page.waitForSelector("#waffle-grid-container", { state: "visible", timeout: 25000 });
    } catch {
        console.log("[SHEETS] Waffle grid introuvable, tentative body...");
        await page.waitForSelector("body", { state: "visible", timeout: 5000 });
    }

    // Cacher l'UI Google
    await page.addStyleTag({ content: SHEETS_HIDE_CSS });
    await page.waitForTimeout(2000);

    return { browser, page };
}

async function captureGridAndUpload(page, cloudinaryFolder, doAiCrop = true) {
    const tmpDir = process.env.RAILWAY_ENVIRONMENT ? "/tmp" : ".";
    const tmpPath = path.join(tmpDir, `cap_${uuidv4()}.png`);

    // Sélection ciblée de la grille ! (la fameuse instruction E)
    const grid = page.locator("#waffle-grid-container");
    await grid.waitFor({ state: "visible", timeout: 20000 });

    await grid.screenshot({ path: tmpPath });
    console.log(`[SHEETS] Grille capturée vers ${tmpPath}.`);

    let finalPath = tmpPath;
    if (doAiCrop && process.env.OPENAI_API_KEY) {
        finalPath = await cropWithAI(tmpPath, SHEET_CROP_PROMPT);
    }

    const result = await uploadToCloudinary(finalPath, cloudinaryFolder);

    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    if (fs.existsSync(tmpPath) && tmpPath !== finalPath) fs.unlinkSync(tmpPath);

    return result?.secure_url || result?.url || result;
}

/**
 * =========================
 * POINT D'ENTRÉE DU MODULE
 * =========================
 */
export async function auditGoogleSheetsAPI(sheetAuditUrl, sheetPlanUrl, auditId) {
    const results = {};
    const auditSheetId = extractSpreadsheetId(sheetAuditUrl);
    const planSheetId = extractSpreadsheetId(sheetPlanUrl);

    if (!auditSheetId) {
        console.error("[SHEETS-API] URL de sheet web audit invalide.");
        return { error: "URL Sheet Audit invalide." };
    }

    console.log(`[SHEETS-API] Démarrage des préparations API (Audit ID: ${auditSheetId}, Plan ID: ${planSheetId || 'NON-FOURNI'})`);

    // 1) Création et écriture dans les onglets CAP_*
    const caps = await prepareAllCaptures(auditSheetId, planSheetId);

    // 2) Navigation vers chaque onglet pour la capture visuelle
    let googleCookies = []; // Ajouter authentification GSC si nécessaire ou connexion active sur page

    for (const cap of caps) {
        if (cap.error) {
            results[cap.id] = { statut: "FAILED", details: cap.error };
            continue;
        }

        console.log(`[SHEETS-API] Playwright -> Capture de ${cap.capTitle} pour ${cap.id}`);
        const { browser, page } = await openSheetBrowser(cap.url, googleCookies);
        try {
            const cloudinaryUrl = await captureGridAndUpload(page, `audit-results/${cap.id}-${auditId}`, true);
            results[cap.id] = {
                statut: "SUCCESS",
                capture: cloudinaryUrl,
                details: `${cap.rows} lignes trouvées.`
            };
            console.log(`[SHEETS-API] Succès ${cap.id}: ${cloudinaryUrl}`);
        } catch (e) {
            console.error(`[SHEETS-API] Erreur capture Playwright sur ${cap.id}: ${e.message}`);
            results[cap.id] = { statut: "FAILED", details: e.message };
        } finally {
            await browser.close();
        }
    }

    return results;
}
