import Airtable from 'airtable';
import { auditQueue } from './queue.js';
import { v4 as uuidv4 } from 'uuid';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

export async function initAirtablePoller(io, db) {
    console.log('[POLLER] Airtable Sync initialized (Interval: 20s)');

    // Poll every 20 seconds for better real-time feel
    setInterval(() => {
        syncAirtableToDb(io, db).catch(err => {
            console.error('[POLLER] Sync error:', err);
        });
    }, 20000);

    // Initial sync
    syncAirtableToDb(io, db).catch(err => console.error('[POLLER] Initial sync error:', err));
}

async function syncAirtableToDb(io, db) {
    console.log('[POLLER] Syncing with Airtable...');

    try {
        const records = await table.select({
            filterByFormula: 'OR({Statut} = "A faire", {Statut} = "En cours")',
            maxRecords: 50
        }).all();

        if (records.length === 0) {
            return;
        }

        console.log(`[POLLER] Found ${records.length} records in work-set.`);

        // Get a default user ID if none is provided (e.g., first user or admin)
        const defaultUser = await db.get('SELECT id FROM users LIMIT 1');
        if (!defaultUser) {
            console.warn('[POLLER] No user found in DB, skipping sync.');
            return;
        }

        for (const record of records) {
            const airtableId = record.id;
            const airtableStatus = record.get('Statut');
            const siteName = record.get('Nom de site') || 'Site Sans Nom';
            const siteUrl = record.get('URL Site') || '';
            const sheetAuditUrl = record.get('Lien Google Sheet');
            const sheetPlanUrl = record.get('Lien Google Sheet plan d\'action');
            const mrmReportUrl = record.get('Lien du rapport my ranking metrics');

            // Check if already in DB
            const existing = await db.get('SELECT * FROM audits WHERE airtable_record_id = ?', [airtableId]);

            if (existing) {
                // 1. Bidirectional Sync: Update fields if they changed in Airtable
                if (existing.nom_site !== siteName ||
                    existing.url_site !== siteUrl ||
                    existing.sheet_audit_url !== sheetAuditUrl ||
                    existing.sheet_plan_url !== sheetPlanUrl ||
                    existing.mrm_report_url !== mrmReportUrl) {

                    console.log(`[POLLER] Updating local record ${existing.id} due to Airtable changes.`);
                    await db.run(
                        'UPDATE audits SET nom_site = ?, url_site = ?, sheet_audit_url = ?, sheet_plan_url = ?, mrm_report_url = ? WHERE id = ?',
                        [siteName, siteUrl, sheetAuditUrl, sheetPlanUrl, mrmReportUrl, existing.id]
                    );

                    // Notify frontend of the update
                    io.emit('audit:updated', {
                        id: existing.id,
                        nom_site: siteName,
                        url_site: siteUrl,
                        sheet_audit_url: sheetAuditUrl,
                        sheet_plan_url: sheetPlanUrl,
                        mrm_report_url: mrmReportUrl
                    });
                }

                // 2. Re-trigger logic: If "A faire" in Airtable AND local status is terminal (TERMINE or ERREUR)
                // If local status is EN_ATTENTE or EN_COURS, we skip to avoid duplicates in queue
                if (airtableStatus === 'A faire' && existing.statut_global !== 'EN_ATTENTE' && existing.statut_global !== 'EN_COURS') {
                    console.log(`[POLLER] Re-triggering audit ${existing.id} from Airtable.`);
                    await db.run('UPDATE audits SET statut_global = "EN_ATTENTE" WHERE id = ?', [existing.id]);
                    await db.run('UPDATE audit_steps SET statut = "EN_ATTENTE" WHERE audit_id = ?', [existing.id]);

                    await auditQueue.add(`audit-${existing.id}`, { auditId: existing.id, userId: defaultUser.id }, {
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 5000 }
                    });

                    io.emit('audit:updated', { id: existing.id, statut_global: 'EN_ATTENTE' });
                }
                continue;
            }

            // Import NEW records
            const auditId = uuidv4();
            console.log(`[POLLER] Importing new audit from Airtable: ${siteName} (${airtableId})`);

            // 1. Create Local Audit
            await db.run(
                'INSERT INTO audits (id, user_id, nom_site, url_site, sheet_audit_url, sheet_plan_url, mrm_report_url, airtable_record_id, statut_global) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    auditId,
                    defaultUser.id,
                    siteName,
                    siteUrl,
                    record.get('Lien Google Sheet'),
                    record.get('Lien Google Sheet plan d\'action'),
                    record.get('Lien du rapport my ranking metrics'),
                    airtableId,
                    'EN_ATTENTE'
                ]
            );

            // 2. Initialize Steps
            const stepsKeys = [
                'robots_txt', 'sitemap', 'logo', 'psi_mobile', 'psi_desktop',
                'ami_responsive', 'ssl_labs', 'semrush', 'ahrefs', 'ubersuggest',
                'sheets_audit', 'sheets_plan', 'gsc', 'mrm'
            ];

            for (const stepKey of stepsKeys) {
                await db.run(
                    'INSERT INTO audit_steps (id, audit_id, step_key, statut) VALUES (?, ?, ?, ?)',
                    [uuidv4(), auditId, stepKey, 'EN_ATTENTE']
                );
            }

            // 4. Add to BullMQ
            await auditQueue.add(`audit-${auditId}`, { auditId, userId: defaultUser.id });

            // 5. Notify Frontend
            io.emit('audit:created', {
                id: auditId,
                user_id: defaultUser.id,
                nom_site: siteName,
                url_site: siteUrl,
                statut_global: 'EN_ATTENTE',
                created_at: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('[POLLER] Error during check:', err.message);
    }
}
