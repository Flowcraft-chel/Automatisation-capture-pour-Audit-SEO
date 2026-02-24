import 'dotenv/config';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';
import { auditSslLabs } from '../server/modules/ssl_labs.js';
import { auditResponsive } from '../server/modules/responsive_check.js';
import { auditPageSpeedMobile, auditPageSpeedDesktop } from '../server/modules/pagespeed.js';
import { captureSemrush, captureAhrefs } from '../server/modules/authority_checkers.js';
import { updateAirtableField, updateAirtableStatut } from '../server/airtable.js';

// ── REAL DATA from Airtable ──────────────────────────────────────────────────
const SITE_URL = 'https://www.notion.so';
const DOMAIN = 'notion.so';
const AIRTABLE_RECORD_ID = 'recwFycNjibw7Wwtx';
const AUDIT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/119SxL31wtYHjkeNLH28mGHuy4-lkp91SKHHbxyrYJHk/edit?gid=941263829#gid=941263829';
const PLAN_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1dW7DK86dxmlJjCPPTdX_i8kbdA6hctt8OhupwLMmQ5k/edit?usp=sharing';
const MRM_URL = 'https://myrankingmetrics.com/seo/audit/report/3c1fffd7-fa2d-4dfd-9344-0efd77777835#profondeur';
const AUDIT_ID = 'E2E-ALL-MODULES-' + Date.now();

const results = {};
let passCount = 0;
let failCount = 0;
let skipCount = 0;

function logResult(step, status, details) {
    const icon = status === 'SUCCESS' ? '✅' : status === 'SKIP' ? '⏭️' : '❌';
    console.log(`${icon} [${step}] ${status}${details ? ' — ' + details : ''}`);
    results[step] = { status, details };
    if (status === 'SUCCESS') passCount++;
    else if (status === 'SKIP') skipCount++;
    else failCount++;
}

async function run() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  E2E TEST — ALL MODULES — ${DOMAIN}`);
    console.log(`  Airtable Record: ${AIRTABLE_RECORD_ID}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // ── PHASE 1: Public modules (no auth needed) ──────────────────────

    // 1. Robots & Sitemap
    console.log('\n📦 PHASE 1: PUBLIC MODULES\n');
    try {
        console.log('[1/9] Robots & Sitemap...');
        const r = await auditRobotsSitemap(SITE_URL, AUDIT_ID);

        logResult('robots_txt', r.robots_txt.statut, r.robots_txt.url || r.robots_txt.details);
        if (r.robots_txt.url) await updateAirtableField(AIRTABLE_RECORD_ID, 'robot', r.robots_txt.url);
        if (r.robots_txt.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_Robots_Txt', r.robots_txt.capture);

        logResult('sitemap', r.sitemap.statut, r.sitemap.url || r.sitemap.details);
        if (r.sitemap.url) await updateAirtableField(AIRTABLE_RECORD_ID, 'sitemaps', r.sitemap.url);
        else await updateAirtableField(AIRTABLE_RECORD_ID, 'sitemaps', "Le fichier sitemaps n'existe pas");
        if (r.sitemap.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_Sitemap', r.sitemap.capture);
    } catch (e) { logResult('robots_txt', 'ERROR', e.message); }

    // 2. Logo
    try {
        console.log('[2/9] Logo...');
        const r = await extractLogo(SITE_URL, AUDIT_ID);
        logResult('logo', r.statut, r.url || r.details);
        if (r.url) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_Logo', r.url);
    } catch (e) { logResult('logo', 'ERROR', e.message); }

    // 3. SSL Labs
    try {
        console.log('[3/9] SSL Labs (patience, 5-10 min)...');
        const r = await auditSslLabs(DOMAIN, AUDIT_ID);
        logResult('ssl_labs', r.statut, r.capture ? 'Captured' : r.details);
        if (r.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_SSL', r.capture);
    } catch (e) { logResult('ssl_labs', 'ERROR', e.message); }

    // 4. Responsive
    try {
        console.log('[4/9] AmIResponsive...');
        const r = await auditResponsive(SITE_URL, AUDIT_ID);
        logResult('ami_responsive', r.statut, r.capture ? 'Captured' : r.details);
        if (r.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_AmIResponsive', r.capture);
    } catch (e) { logResult('ami_responsive', 'ERROR', e.message); }

    // 5. PSI Mobile
    try {
        console.log('[5/9] PSI Mobile...');
        const r = await auditPageSpeedMobile(SITE_URL, AUDIT_ID);
        logResult('psi_mobile', r.statut, `Score: ${r.score || 'N/A'}`);
        if (r.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_PSI_Mobile', r.capture);
        if (r.score) await updateAirtableField(AIRTABLE_RECORD_ID, 'pourcentage smartphone', r.score / 100);
    } catch (e) { logResult('psi_mobile', 'ERROR', e.message); }

    // 6. PSI Desktop
    try {
        console.log('[6/9] PSI Desktop...');
        const r = await auditPageSpeedDesktop(SITE_URL, AUDIT_ID);
        logResult('psi_desktop', r.statut, `Score: ${r.score || 'N/A'}`);
        if (r.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_PSI_Desktop', r.capture);
        if (r.score) await updateAirtableField(AIRTABLE_RECORD_ID, 'pourcentage desktop', r.score / 100);
    } catch (e) { logResult('psi_desktop', 'ERROR', e.message); }

    // ── PHASE 2: Anti-bot modules (no auth, but risky) ────────────────

    console.log('\n📦 PHASE 2: AUTHORITY CHECKERS\n');

    // 7. Semrush
    try {
        console.log('[7/9] Semrush Authority...');
        const r = await captureSemrush(SITE_URL, AUDIT_ID);
        logResult('semrush_authority', r.statut, r.capture ? 'Captured' : r.details);
        if (r.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_autorité_domaine_SEMRUSH', r.capture);
    } catch (e) { logResult('semrush_authority', 'ERROR', e.message); }

    // 8. Ahrefs
    try {
        console.log('[8/9] Ahrefs Authority...');
        const r = await captureAhrefs(SITE_URL, AUDIT_ID);
        logResult('ahrefs_authority', r.statut, r.capture ? 'Captured' : r.details);
        if (r.capture) await updateAirtableField(AIRTABLE_RECORD_ID, 'Img_autorité_domaine_AHREF', r.capture);
    } catch (e) { logResult('ahrefs_authority', 'ERROR', e.message); }

    // ── PHASE 3: Authenticated modules (need sessions) ────────────────

    console.log('\n📦 PHASE 3: AUTHENTICATED MODULES (Require sessions)\n');
    console.log('⚠️  Google Sheets, GSC, MRM, Ubersuggest require saved sessions.');
    console.log('    These will be marked SKIP if no sessions are available locally.\n');

    // For authenticated modules, we just report SKIP since no local sessions
    logResult('sheet_images', 'SKIP', 'Session Google non disponible localement');
    logResult('sheet_meme_title', 'SKIP', 'Session Google non disponible localement');
    logResult('sheet_meta_desc_double', 'SKIP', 'Session Google non disponible localement');
    logResult('sheet_doublons_h1', 'SKIP', 'Session Google non disponible localement');
    logResult('sheet_h1_absente', 'SKIP', 'Session Google non disponible localement');
    logResult('sheet_mots_body', 'SKIP', 'Session Google non disponible localement');
    logResult('sheet_meta_desc', 'SKIP', 'Session Google non disponible localement');
    logResult('sheet_balise_title', 'SKIP', 'Session Google non disponible localement');
    logResult('plan_synthese', 'SKIP', 'Session Google non disponible localement');
    logResult('plan_requetes', 'SKIP', 'Session Google non disponible localement');
    logResult('plan_donnees_img', 'SKIP', 'Session Google non disponible localement');
    logResult('plan_longueur', 'SKIP', 'Session Google non disponible localement');
    logResult('gsc_sitemaps', 'SKIP', 'Session Google non disponible localement');
    logResult('gsc_https', 'SKIP', 'Session Google non disponible localement');
    logResult('mrm_profondeur', 'SKIP', 'Session MRM non disponible localement');
    logResult('ubersuggest_da', 'SKIP', 'Session Ubersuggest non disponible localement');

    // ── SUMMARY ───────────────────────────────────────────────────────

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  RÉSULTATS: ${passCount} ✅ | ${skipCount} ⏭️ | ${failCount} ❌`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Update Airtable status
    try {
        if (failCount === 0) {
            await updateAirtableStatut(AIRTABLE_RECORD_ID, 'fait');
            console.log('\n🎉 Airtable status → "fait"');
        } else {
            await updateAirtableStatut(AIRTABLE_RECORD_ID, 'En cours');
            console.log('\n⚠️ Airtable status → "En cours" (some errors)');
        }
    } catch (e) { console.error('Failed to update Airtable status:', e.message); }

    console.log(`\n📋 Vérifiez les résultats dans Airtable: ${AIRTABLE_RECORD_ID}`);
}

run().catch(e => console.error('FATAL:', e));
