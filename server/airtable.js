import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

export async function createAirtableAudit(data) {
    const record = await table.create({
        "Nom de site": data.siteName,
        "URL Site": data.siteUrl,
        "Lien Google Sheet": data.auditSheetUrl,
        "Lien Google Sheet plan d'action": data.actionPlanSheetUrl,
        "Lien du rapport my ranking metrics": data.mrmReportUrl,
        "Statut": "A faire"
    });
    return record.id;
}

export async function updateAirtableStatut(recordId, statut) {
    console.log(`[AIRTABLE] SYNC STATUS: record=${recordId}, value="${statut}"`);
    try {
        await table.update(recordId, { "Statut": statut });
        console.log(`[AIRTABLE] Successfully updated status to ${statut}.`);
    } catch (err) {
        console.error(`[AIRTABLE] FAILED to update status:`, err.message);
    }
}

export async function updateAirtableField(recordId, fieldName, value) {
    if (!value) {
        console.warn(`[AIRTABLE] Skipping update for ${fieldName}: value is null/empty`);
        return;
    }
    console.log(`[AIRTABLE] SYNC FIELD: record=${recordId}, field="${fieldName}"`);
    try {
        await table.update(recordId, { [fieldName]: value });
        console.log(`[AIRTABLE] SUCCESS: ${fieldName} updated.`);
    } catch (err) {
        console.error(`[AIRTABLE] ERROR syncing ${fieldName}:`, err.message);
        if (err.message.includes('invalid') || err.message.includes('cell value')) {
            console.warn(`[AIRTABLE] Field "${fieldName}" likely expects Attachment format. If you want a link, change the field type to "URL" or "Single line text" in Airtable.`);
        }
    }
}
