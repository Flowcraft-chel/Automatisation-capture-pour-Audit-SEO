import 'dotenv/config';
import {
    captureSheetImages,
    captureSheetSimpleTab,
    captureSheetH1H6,
    captureSheetMotsBody,
    captureSheetMetaDesc,
    captureSheetBaliseTitle,
    capturePlanTab
} from '../server/modules/google_sheets.js';
import { updateAirtableField } from '../server/airtable.js';

// ── REAL DATA ────────────────────────────────────────────────────────────────
const AUDIT_SHEET = 'https://docs.google.com/spreadsheets/d/119SxL31wtYHjkeNLH28mGHuy4-lkp91SKHHbxyrYJHk/edit?gid=941263829#gid=941263829';
const PLAN_SHEET = 'https://docs.google.com/spreadsheets/d/1dW7DK86dxmlJjCPPTdX_i8kbdA6hctt8OhupwLMmQ5k/edit?usp=sharing';
const AIRTABLE_ID = 'recwFycNjibw7Wwtx';
const AUDIT_ID = 'SHEET-TEST-' + Date.now();

// Pass empty cookies array — sheets should be public
const COOKIES = [];

async function run() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  GOOGLE SHEETS CAPTURE TEST — Real URLs');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // ── AUDIT SHEET TABS ──────────────────────────────────────────────

    // 1. Images
    console.log('[1/12] Sheet: Images...');
    try {
        const r = await captureSheetImages(AUDIT_SHEET, AUDIT_ID, COOKIES);
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_Poids_image', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 2. Même title
    console.log('[2/12] Sheet: Même title...');
    try {
        const r = await captureSheetSimpleTab(AUDIT_SHEET, 'Même title', AUDIT_ID, COOKIES, 'Img_meme_title');
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_meme_title', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 3. Même balise meta desc
    console.log('[3/12] Sheet: Même balise meta desc...');
    try {
        const r = await captureSheetSimpleTab(AUDIT_SHEET, 'Même balise meta desc', AUDIT_ID, COOKIES, 'Img_meta_description_double');
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_meta_description_double', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 4. Doublons H1
    console.log('[4/12] Sheet: Doublons H1...');
    try {
        const r = await captureSheetSimpleTab(AUDIT_SHEET, 'Doublons H1', AUDIT_ID, COOKIES, 'Img_balise_h1_double');
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_balise_h1_double', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 5. H1-H6 (multi-captures)
    console.log('[5/12] Sheet: Balises H1-H6 (complex)...');
    try {
        const h1Results = await captureSheetH1H6(AUDIT_SHEET, AUDIT_ID, COOKIES);
        for (const [field, res] of Object.entries(h1Results)) {
            console.log(`  → [${field}] ${res.statut}`, res.capture || res.details || '');
            if (res.capture) await updateAirtableField(AIRTABLE_ID, field, res.capture);
        }
        if (Object.keys(h1Results).length === 0) console.log('  → Aucun résultat (tab introuvable ?)');
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 6. Nb de mots body
    console.log('[6/12] Sheet: Nb de mots body...');
    try {
        const r = await captureSheetMotsBody(AUDIT_SHEET, AUDIT_ID, COOKIES);
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_longeur_page', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 7. Meta desc
    console.log('[7/12] Sheet: Meta desc...');
    try {
        const r = await captureSheetMetaDesc(AUDIT_SHEET, AUDIT_ID, COOKIES);
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_meta_description', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 8. Balise title
    console.log('[8/12] Sheet: Balise title...');
    try {
        const r = await captureSheetBaliseTitle(AUDIT_SHEET, AUDIT_ID, COOKIES);
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_balises_title', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // ── PLAN D'ACTION TABS ────────────────────────────────────────────

    console.log('\n── PLAN D\'ACTION ──\n');

    // 9. Synthèse
    console.log('[9/12] Plan: Synthèse Audit...');
    try {
        const r = await capturePlanTab(PLAN_SHEET, "Synthèse Audit - Plan d'action", AUDIT_ID, COOKIES, 'plan-synthese');
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, "Img_planD'action", r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 10. Requêtes Clés
    console.log('[10/12] Plan: Requêtes Clés...');
    try {
        const r = await capturePlanTab(PLAN_SHEET, 'Requêtes Clés / Calédito', AUDIT_ID, COOKIES, 'plan-requetes');
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_Requetes_cles', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 11. Données Images
    console.log('[11/12] Plan: Données Images...');
    try {
        const r = await capturePlanTab(PLAN_SHEET, 'Données Images', AUDIT_ID, COOKIES, 'plan-donnees-img');
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_donnee_image', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    // 12. Longueur de page
    console.log('[12/12] Plan: Longueur de page...');
    try {
        const r = await capturePlanTab(PLAN_SHEET, 'Longueur de page', AUDIT_ID, COOKIES, 'plan-longueur');
        console.log(`  → ${r.statut}`, r.capture || r.details || '');
        if (r.capture) await updateAirtableField(AIRTABLE_ID, 'Img_longeur_page_plan', r.capture);
    } catch (e) { console.error('  ❌ CRASH:', e.message); }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  TEST COMPLET — Vérifiez Airtable recwFycNjibw7Wwtx');
    console.log('═══════════════════════════════════════════════════════════════');
}

run().catch(e => console.error('FATAL:', e));
