import { chromium } from 'playwright';

async function testPSIJson() {
    const url = 'https://www.notion.so';
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&strategy=mobile`;
    console.log("Going to:", psiUrl);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        console.log("Waiting for results...");
        await page.waitForTimeout(15000);

        // Google PageSpeed Insights embeds the raw Lighthouse JSON in a script block.
        // We can extract it by searching for the LighthouseResult object.
        const html = await page.content();

        // Attempt to find the embedded state JSON
        // It usually starts with window.__INITIAL_STATE__ or similar,
        // or we just find the string "lighthouseResult"

        const lhMatch = html.match(/"lighthouseResult"\s*:\s*(\{.*?\})\s*,\s*"metrics"/);
        if (lhMatch && lhMatch[1]) {
            try {
                const lhData = JSON.parse(lhMatch[1]);
                console.log("Extracted LH Data Score:", lhData.categories.performance.score * 100);
            } catch (e) {
                console.error("Failed to parse LH match", e.message);
            }
        } else {
            console.log("Could not find lighthouseResult regex.");

            // Alternative: let's try grabbing window.__NUXT__ or similar framework states
            const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
            if (nextMatch) {
                const nextData = JSON.parse(nextMatch[1]);
                console.log("NextData keys:", Object.keys(nextData));
            } else {
                console.log("No NEXT_DATA found.");
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

testPSIJson();
