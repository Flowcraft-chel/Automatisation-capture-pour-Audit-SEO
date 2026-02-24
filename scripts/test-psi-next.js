import { chromium } from 'playwright';

async function testNextData() {
    const url = 'https://www.notion.so';
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&strategy=mobile`;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });
        console.log("Waiting 15s for analysis...");
        await page.waitForTimeout(15000);

        const nextData = await page.evaluate(() => {
            const scriptNode = document.getElementById('__NEXT_DATA__');
            if (scriptNode) {
                try {
                    return JSON.parse(scriptNode.innerText);
                } catch (e) {
                    return { error: 'Parse failed' };
                }
            }
            return { error: 'No NEXT_DATA found' };
        });

        console.log("NextData Keys:", Object.keys(nextData));

        // PSI doesn't use Next.js, it uses lit/web components and an internal framework.
        // Let's try to grab window.__INITIAL_STATE__ or similar
        const windowState = await page.evaluate(() => {
            return Object.keys(window).filter(k => k.includes('STATE') || k.includes('DATA') || k.includes('LIGHTHOUSE'));
        });

        console.log("Window state candidates:", windowState);

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

testNextData();
