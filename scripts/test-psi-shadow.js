import { chromium } from 'playwright';

async function testPlaywrightLocators() {
    const url = 'https://www.notion.so';
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&strategy=mobile`;
    console.log("Going to:", psiUrl);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        console.log("Waiting for results...");
        await page.waitForTimeout(20000); // hard wait just for safety

        // Use playwright locator to pierce shadow DOM and get the Performance score
        // The main gauge for performance is usually inside a .lh-gauge--performance or just .lh-gauge
        const gaugesTexts = await page.locator('.lh-gauge__percentage').allInnerTexts();
        console.log("All percentage texts:", gaugesTexts);

        // Or specifically look for the performance gauge
        const perfLocator = page.locator('.lh-gauge__percentage').first();
        if (await perfLocator.count() > 0) {
            console.log("First gauge:", await perfLocator.innerText());
        }

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

testPlaywrightLocators();
