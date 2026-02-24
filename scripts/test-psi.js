import { chromium } from 'playwright';

async function testPSI() {
    const url = 'https://www.notion.so';
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&strategy=mobile`;
    console.log("Going to:", psiUrl);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        console.log("Waiting for 15s to let it load...");
        await page.waitForTimeout(15000);

        const html = await page.content();

        // Let's try to extract any numbers or gauges
        const gauges = await page.evaluate(() => {
            const result = {};
            document.querySelectorAll('*').forEach(el => {
                if (el.className && typeof el.className === 'string' && el.className.includes('lh-gauge')) {
                    result[el.className] = el.innerText;
                }
                if (el.innerText && el.innerText.includes('Performances')) {
                    // Try to find nearby scores
                }
            });
            return result;
        });

        console.log("Found gauges?", gauges);

        // Regex on raw HTML just to see if the score is somewhere
        const scoreMatches = html.match(/class="[^"]*"?\>([0-9]{1,3})\<\/div\>/g);
        console.log("Raw HTML score candidates:", scoreMatches?.slice(0, 10));

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

testPSI();
