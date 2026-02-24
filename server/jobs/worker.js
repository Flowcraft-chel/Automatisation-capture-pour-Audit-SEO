import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { auditRobotsSitemap } from '../modules/robots_sitemap.js';
import { extractLogo } from '../modules/logo_extraction.js';
import { auditSslLabs } from '../modules/ssl_labs.js';
import { auditResponsive } from '../modules/responsive_check.js';
import { auditPageSpeedMobile, auditPageSpeedDesktop } from '../modules/pagespeed.js';
import {
    captureSheetImages,
    captureSheetSimpleTab,
    captureSheetH1H6,
    captureSheetMotsBody,
    captureSheetMetaDesc,
    captureSheetBaliseTitle,
    capturePlanTab
} from '../modules/google_sheets.js';
import { captureGscSitemaps, captureGscHttps } from '../modules/google_search_console.js';
import { captureMrmProfondeur } from '../modules/mrm.js';
import { captureUbersuggest } from '../modules/ubersuggest.js';
import { captureSemrush, captureAhrefs } from '../modules/authority_checkers.js';
import { updateAirtableStatut, updateAirtableField } from '../airtable.js';
import { decrypt } from '../utils/encrypt.js';

const REDIS_URL = process.env.REDIS_URL;
const finalRedisUrl = REDIS_URL || 'redis://localhost:6379';

const redisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 50, 2000)
};

if (finalRedisUrl.startsWith('rediss://')) {
    redisOptions.tls = { rejectUnauthorized: false };
}

const connection = new IORedis(finalRedisUrl, redisOptions);

connection.on('error', (err) => {
    console.error(`❌ [REDIS WORKER ERROR] ${err.message}`);
});

connection.on('connect', () => {
    console.log('[WORKER] Redis connection established.');
});

export const initWorker = (io, db) => {
    console.log('[WORKER] Initializing worker for "audit-jobs" queue...');

    const worker = new Worker('audit-jobs', async (job) => {
        const { auditId, userId } = job.data;
        console.log(`[WORKER] [JOB ${job.id}] Starting audit ${auditId} for user ${userId}`);

        try {
            // 1. Get Audit Data
            const audit = await db.get('SELECT * FROM audits WHERE id = ?', [auditId]);
            if (!audit) throw new Error('Audit not found');

            // 2. Initial Setup: Mark as "En cours" only when worker actually starts
            console.log(`[WORKER] [JOB ${job.id}] Transitioning status to "EN_COURS"`);
            await db.run('UPDATE audits SET statut_global = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['EN_COURS', auditId]);
            if (audit.airtable_record_id) {
                await updateAirtableStatut(audit.airtable_record_id, 'En cours');
            }

            // Emit update to clients
            const initialUpdate = await db.get('SELECT * FROM audits WHERE id = ?', [auditId]);
            io.to(`audit:${auditId}`).emit('audit:update', initialUpdate);

            let siteUrl = audit.url_site;
            if (siteUrl && !siteUrl.startsWith('http')) {
                siteUrl = `https://${siteUrl}`;
                console.log(`[WORKER] [JOB ${job.id}] Normalized URL to: ${siteUrl}`);
                // Persist the fixed URL
                await db.run('UPDATE audits SET url_site = ? WHERE id = ?', [siteUrl, auditId]);
            }

            // Helper to update step status
            const updateStep = async (stepKey, status, result = null, cloudinaryUrl = null) => {
                await db.run(
                    'UPDATE audit_steps SET statut = ?, resultat = ?, output_cloudinary_url = ?, updated_at = CURRENT_TIMESTAMP WHERE audit_id = ? AND step_key = ?',
                    [status, result ? JSON.stringify(result) : null, cloudinaryUrl, auditId, stepKey]
                );

                // Fetch the updated step to emit to client
                const updatedStep = await db.get('SELECT * FROM audit_steps WHERE audit_id = ? AND step_key = ?', [auditId, stepKey]);

                io.to(`audit:${auditId}`).emit('step:update', { auditId, step: updatedStep });
                console.log(`[WORKER] [JOB ${job.id}] Step ${stepKey}: ${status}`);
            };

            // Sequence of steps
            // STEP 1: Robots & Sitemap
            console.log(`[WORKER] [JOB ${job.id}] Executing Step: Robots & Sitemap...`);
            await updateStep('robots_txt', 'EN_COURS');
            const robotsResult = await auditRobotsSitemap(siteUrl, auditId);

            await updateStep('robots_txt', robotsResult.robots_txt.statut, robotsResult.robots_txt.details, robotsResult.robots_txt.capture);

            // Sync Robots to Airtable
            if (audit.airtable_record_id) {
                if (robotsResult.robots_txt.statut === 'SUCCESS') {
                    console.log(`[WORKER] [JOB ${job.id}] Syncing Robots URL to Airtable...`);
                    await updateAirtableField(audit.airtable_record_id, 'robot', robotsResult.robots_txt.url);
                    if (robotsResult.robots_txt.capture) {
                        await updateAirtableField(audit.airtable_record_id, 'Img_Robots_Txt', robotsResult.robots_txt.capture);
                    }
                }
            }

            console.log(`[WORKER] [JOB ${job.id}] Executing Step: Sitemap...`);
            await updateStep('sitemap', 'EN_COURS');
            await updateStep('sitemap', robotsResult.sitemap.statut, robotsResult.sitemap.details, robotsResult.sitemap.capture);

            // Sync Sitemap to Airtable
            if (audit.airtable_record_id) {
                if (robotsResult.sitemap.statut === 'SUCCESS') {
                    console.log(`[WORKER] [JOB ${job.id}] Syncing Sitemap URL to Airtable...`);
                    await updateAirtableField(audit.airtable_record_id, 'sitemaps', robotsResult.sitemap.url);
                    if (robotsResult.sitemap.capture) {
                        console.log(`[WORKER] [JOB ${job.id}] Syncing Sitemap Capture to Airtable...`);
                        await updateAirtableField(audit.airtable_record_id, 'Img_Sitemap', robotsResult.sitemap.capture);
                    }
                } else {
                    await updateAirtableField(audit.airtable_record_id, 'sitemaps', "Le fichier sitemaps n'existe pas");
                }
            }

            // STEP 2: Logo Extraction
            console.log(`[WORKER] [JOB ${job.id}] Executing Step: Logo Extraction...`);
            await updateStep('logo', 'IA_EN_COURS');
            const logoResult = await extractLogo(siteUrl, auditId);

            await updateStep('logo', logoResult.statut, logoResult.details, logoResult.url);

            // Sync Logo to Airtable
            if (audit.airtable_record_id) {
                if (logoResult.statut === 'SUCCESS' && logoResult.url) {
                    console.log(`[WORKER] [JOB ${job.id}] Syncing Logo to Airtable...`);
                    await updateAirtableField(audit.airtable_record_id, 'Img_Logo', logoResult.url);
                }
            }

            // STEP 3: SSL Labs
            console.log(`[WORKER] [JOB ${job.id}] Executing Step: SSL Labs...`);
            await updateStep('ssl_labs', 'EN_COURS');
            const domain = new URL(siteUrl).hostname;
            const sslResult = await auditSslLabs(domain, auditId);
            await updateStep('ssl_labs', sslResult.statut, null, sslResult.capture);
            if (audit.airtable_record_id && sslResult.capture) {
                await updateAirtableField(audit.airtable_record_id, 'Img_SSL', sslResult.capture);
            }

            // STEP 4: Responsive Check
            console.log(`[WORKER] [JOB ${job.id}] Executing Step: Responsive Check...`);
            await updateStep('ami_responsive', 'EN_COURS');
            const respResult = await auditResponsive(siteUrl, auditId);
            await updateStep('ami_responsive', respResult.statut, null, respResult.capture);
            if (audit.airtable_record_id && respResult.capture) {
                await updateAirtableField(audit.airtable_record_id, 'Img_AmIResponsive', respResult.capture);
            }

            // STEP 5: PageSpeed Mobile
            console.log(`[WORKER] [JOB ${job.id}] Executing Step: PSI Mobile...`);
            await updateStep('psi_mobile', 'EN_COURS');
            const psiMobile = await auditPageSpeedMobile(siteUrl, auditId);
            await updateStep('psi_mobile', psiMobile.statut, psiMobile.details, psiMobile.capture);
            if (audit.airtable_record_id) {
                if (psiMobile.score) {
                    const mobileScorePercent = psiMobile.score / 100;
                    await updateAirtableField(audit.airtable_record_id, 'pourcentage smartphone', mobileScorePercent);
                }
                if (psiMobile.capture) await updateAirtableField(audit.airtable_record_id, 'Img_PSI_Mobile', psiMobile.capture);
            }

            // STEP 6: PageSpeed Desktop
            console.log(`[WORKER] [JOB ${job.id}] Executing Step: PSI Desktop...`);
            await updateStep('psi_desktop', 'EN_COURS');
            const psiDesktop = await auditPageSpeedDesktop(siteUrl, auditId);
            await updateStep('psi_desktop', psiDesktop.statut, psiDesktop.details, psiDesktop.capture);
            if (audit.airtable_record_id) {
                if (psiDesktop.score) {
                    const desktopScorePercent = psiDesktop.score / 100;
                    await updateAirtableField(audit.airtable_record_id, 'pourcentage desktop', desktopScorePercent);
                }
                if (psiDesktop.capture) await updateAirtableField(audit.airtable_record_id, 'Img_PSI_Desktop', psiDesktop.capture);
            }

            // ──────────────────────────────────────────────────────────────────
            // HELPER: Load encrypted cookies for a service
            // ──────────────────────────────────────────────────────────────────
            const getSessionCookies = async (service) => {
                const sessionRow = await db.get(
                    'SELECT encrypted_cookies FROM user_sessions WHERE user_id = ? AND service = ? ORDER BY created_at DESC LIMIT 1',
                    [userId, service]
                );
                if (!sessionRow) return null;
                try { return JSON.parse(decrypt(sessionRow.encrypted_cookies)); }
                catch { return null; }
            };

            // STEP 7: Google Sheets — Audit Sheet
            const sheetAuditUrl = audit.sheet_audit_url;
            const googleCookies = await getSessionCookies('google');

            if (!sheetAuditUrl) {
                for (const k of ['sheet_images', 'sheet_meme_title', 'sheet_meta_desc_double', 'sheet_doublons_h1', 'sheet_h1_absente', 'sheet_mots_body', 'sheet_meta_desc', 'sheet_balise_title']) {
                    await updateStep(k, 'SKIP', 'Lien Google Sheet non fourni');
                }
            } else {
                // Google Sheets are shared with editor rights (public link), cookies are optional
                if (!googleCookies) console.log(`[WORKER] [JOB ${job.id}] No Google cookies, opening sheets as public viewer.`);
                // 7a. Images
                await updateStep('sheet_images', 'EN_COURS');
                const imgRes = await captureSheetImages(sheetAuditUrl, auditId, googleCookies);
                await updateStep('sheet_images', imgRes.statut, imgRes.details, imgRes.capture);
                if (audit.airtable_record_id && imgRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_Poids_image', imgRes.capture);

                // 7b. Même title
                await updateStep('sheet_meme_title', 'EN_COURS');
                const mTitleRes = await captureSheetSimpleTab(sheetAuditUrl, 'Même title', auditId, googleCookies, 'Img_meme_title');
                await updateStep('sheet_meme_title', mTitleRes.statut, mTitleRes.details, mTitleRes.capture);
                if (audit.airtable_record_id && mTitleRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_meme_title', mTitleRes.capture);

                // 7c. Même balise meta desc
                await updateStep('sheet_meta_desc_double', 'EN_COURS');
                const mMetaRes = await captureSheetSimpleTab(sheetAuditUrl, 'Même balise meta desc', auditId, googleCookies, 'Img_meta_description_double');
                await updateStep('sheet_meta_desc_double', mMetaRes.statut, mMetaRes.details, mMetaRes.capture);
                if (audit.airtable_record_id && mMetaRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_meta_description_double', mMetaRes.capture);

                // 7d. Doublons H1
                await updateStep('sheet_doublons_h1', 'EN_COURS');
                const dh1Res = await captureSheetSimpleTab(sheetAuditUrl, 'Doublons H1', auditId, googleCookies, 'Img_balise_h1_double');
                await updateStep('sheet_doublons_h1', dh1Res.statut, dh1Res.details, dh1Res.capture);
                if (audit.airtable_record_id && dh1Res.capture) await updateAirtableField(audit.airtable_record_id, 'Img_balise_h1_double', dh1Res.capture);

                // 7e. Balises H1-H6 (multiple sub-captures)
                await updateStep('sheet_h1_absente', 'EN_COURS');
                const h1Results = await captureSheetH1H6(sheetAuditUrl, auditId, googleCookies);
                for (const [field, h1Res] of Object.entries(h1Results)) {
                    const stepKey = {
                        'Img_balise_h1_absente': 'sheet_h1_absente',
                        'Img_que des H1 vides': 'sheet_h1_vides',
                        "Img_au moins une H1 vide": 'sheet_h1_au_moins',
                        "Img_1ère balise Hn n'est pas H1": 'sheet_hn_pas_h1',
                        'Img_Sauts de niveau entre les Hn': 'sheet_sauts_hn',
                        'Img_Hn trop longue': 'sheet_hn_longue'
                    }[field];
                    if (stepKey) await updateStep(stepKey, h1Res.statut, h1Res.details, h1Res.capture);
                    if (audit.airtable_record_id && h1Res.capture) await updateAirtableField(audit.airtable_record_id, field, h1Res.capture);
                }

                // 7f. Nb de mots body
                await updateStep('sheet_mots_body', 'EN_COURS');
                const motRes = await captureSheetMotsBody(sheetAuditUrl, auditId, googleCookies);
                await updateStep('sheet_mots_body', motRes.statut, motRes.details, motRes.capture);
                if (audit.airtable_record_id && motRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_longeur_page', motRes.capture);

                // 7g. Meta desc
                await updateStep('sheet_meta_desc', 'EN_COURS');
                const metaRes = await captureSheetMetaDesc(sheetAuditUrl, auditId, googleCookies);
                await updateStep('sheet_meta_desc', metaRes.statut, metaRes.details, metaRes.capture);
                if (audit.airtable_record_id && metaRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_meta_description', metaRes.capture);

                // 7h. Balise title
                await updateStep('sheet_balise_title', 'EN_COURS');
                const titRes = await captureSheetBaliseTitle(sheetAuditUrl, auditId, googleCookies);
                await updateStep('sheet_balise_title', titRes.statut, titRes.details, titRes.capture);
                if (audit.airtable_record_id && titRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_balises_title', titRes.capture);
            }

            // STEP 8: Google Sheets — Plan d'action
            const sheetPlanUrl = audit.sheet_plan_url;
            if (!sheetPlanUrl) {
                for (const k of ['plan_synthese', 'plan_requetes', 'plan_donnees_img', 'plan_longueur']) {
                    await updateStep(k, 'SKIP', "Lien Plan d'action non fourni");
                }
            } else {
                const planTabs = [
                    { tab: "Synthèse Audit - Plan d'action", key: 'plan_synthese', field: "Img_planD'action", slug: 'plan-synthese' },
                    { tab: 'Requêtes Clés / Calédito', key: 'plan_requetes', field: 'Img_Requetes_cles', slug: 'plan-requetes' },
                    { tab: 'Données Images', key: 'plan_donnees_img', field: 'Img_donnee image', slug: 'plan-donnees-img' },
                    { tab: 'Longueur de page', key: 'plan_longueur', field: 'Img_longeur_page', slug: 'plan-longueur' },
                ];
                for (const { tab, key, field, slug } of planTabs) {
                    await updateStep(key, 'EN_COURS');
                    const res = await capturePlanTab(sheetPlanUrl, tab, auditId, googleCookies, slug);
                    await updateStep(key, res.statut, res.details, res.capture);
                    if (audit.airtable_record_id && res.capture) await updateAirtableField(audit.airtable_record_id, field, res.capture);
                }
            }

            // STEP 9: Google Search Console
            await updateStep('gsc_sitemaps', 'EN_COURS');
            if (!googleCookies) {
                await updateStep('gsc_sitemaps', 'SKIP', 'Session Google non connectée');
                await updateStep('gsc_https', 'SKIP', 'Session Google non connectée');
            } else {
                const gscSitRes = await captureGscSitemaps(siteUrl, auditId, googleCookies);
                await updateStep('gsc_sitemaps', gscSitRes.statut, gscSitRes.details, gscSitRes.capture);
                if (audit.airtable_record_id && gscSitRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_sitemap_declaré', gscSitRes.capture);

                await updateStep('gsc_https', 'EN_COURS');
                const gscHttpsRes = await captureGscHttps(siteUrl, auditId, googleCookies);
                await updateStep('gsc_https', gscHttpsRes.statut, gscHttpsRes.details, gscHttpsRes.capture);
                if (audit.airtable_record_id && gscHttpsRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_https', gscHttpsRes.capture);
            }

            // STEP 10: MRM
            await updateStep('mrm_profondeur', 'EN_COURS');
            const mrmSession = await db.get('SELECT encrypted_cookies FROM user_sessions WHERE user_id = ? AND service = ? ORDER BY created_at DESC LIMIT 1', [userId, 'mrm']);
            if (!mrmSession || !audit.mrm_report_url) {
                await updateStep('mrm_profondeur', 'SKIP', !mrmSession ? 'Session MRM non configurée' : 'Lien MRM non fourni');
            } else {
                const mrmRes = await captureMrmProfondeur(audit.mrm_report_url, auditId, mrmSession.encrypted_cookies);
                await updateStep('mrm_profondeur', mrmRes.statut, mrmRes.details, mrmRes.capture);
                if (audit.airtable_record_id && mrmRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_profondeur_clics', mrmRes.capture);
            }

            // STEP 11: Ubersuggest
            await updateStep('ubersuggest_da', 'EN_COURS');
            const uberSession = await db.get('SELECT encrypted_cookies FROM user_sessions WHERE user_id = ? AND service = ? ORDER BY created_at DESC LIMIT 1', [userId, 'ubersuggest']);
            if (!uberSession) {
                await updateStep('ubersuggest_da', 'SKIP', 'Session Ubersuggest non configurée');
            } else {
                const uberRes = await captureUbersuggest(siteUrl, auditId, uberSession.encrypted_cookies);
                await updateStep('ubersuggest_da', uberRes.statut, uberRes.details, uberRes.capture);
                if (audit.airtable_record_id && uberRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_autorité_domaine_UBERSUGGEST', uberRes.capture);
            }

            // STEP 12: Semrush
            await updateStep('semrush_authority', 'EN_COURS');
            const semRes = await captureSemrush(siteUrl, auditId);
            await updateStep('semrush_authority', semRes.statut, semRes.details, semRes.capture);
            if (audit.airtable_record_id && semRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_autorité_domaine_SEMRUSH', semRes.capture);

            // STEP 13: Ahrefs
            await updateStep('ahrefs_authority', 'EN_COURS');
            const ahrRes = await captureAhrefs(siteUrl, auditId);
            await updateStep('ahrefs_authority', ahrRes.statut, ahrRes.details, ahrRes.capture);
            if (audit.airtable_record_id && ahrRes.capture) await updateAirtableField(audit.airtable_record_id, 'Img_autorité_domaine_AHREF', ahrRes.capture);


            // Global Success
            console.log(`[WORKER] [JOB ${job.id}] Finalizing Audit ${auditId}...`);
            await db.run('UPDATE audits SET statut_global = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['TERMINE', auditId]);

            // Sync to Airtable (Non-blocking)
            if (audit.airtable_record_id) {
                try {
                    console.log(`[WORKER] [JOB ${job.id}] Updating Airtable Status to 'fait'...`);
                    await updateAirtableStatut(audit.airtable_record_id, 'fait');
                } catch (e) {
                    console.error('[WORKER] Failed to sync "Terminé" to Airtable:', e.message);
                }
            }

            const finalAudit = await db.get('SELECT * FROM audits WHERE id = ?', [auditId]);
            io.to(`audit:${auditId}`).emit('audit:update', finalAudit);

            console.log(`[WORKER] [JOB ${job.id}] Audit ${auditId} completed successfully`);

        } catch (err) {
            console.error(`[WORKER] [JOB ${job.id}] Audit ${auditId} failed:`, err);
            await db.run('UPDATE audits SET statut_global = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['ERREUR', auditId]);

            // Sync Error to Airtable
            if (audit && audit.airtable_record_id) {
                try {
                    await updateAirtableStatut(audit.airtable_record_id, 'Erreur');
                } catch (e) {
                    console.error('[WORKER] Failed to sync "Erreur" to Airtable:', e.message);
                }
            }

            const finalAudit = await db.get('SELECT * FROM audits WHERE id = ?', [auditId]);
            if (finalAudit) {
                io.to(`audit:${auditId}`).emit('audit:update', finalAudit);
            }
        }

    }, { connection });

    worker.on('ready', () => {
        console.log('[WORKER] Worker is ready and listening for jobs.');
    });

    worker.on('active', (job) => {
        console.log(`[WORKER] Job ${job.id} active.`);
    });

    worker.on('completed', job => {
        console.log(`[WORKER] Job ${job.id} completed.`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[WORKER] Job ${job.id || 'unknown'} failed: ${err.message}`);
    });

    worker.on('error', err => {
        console.error('[WORKER] Critical Worker Error:', err.message);
    });

    return worker;
};
