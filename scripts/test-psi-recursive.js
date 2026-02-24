import { chromium } from 'playwright';

async function parseShadow() {
    const url = 'https://www.notion.so';
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&strategy=mobile`;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });
        console.log("Waiting 20s for analysis...");
        await page.waitForTimeout(20000);

        const scores = await page.evaluate(() => {
            function findNodes(startNode, className) {
                let nodes = [];
                // Check current node
                if (startNode.classList && startNode.classList.contains(className)) {
                    nodes.push(startNode);
                }

                // Check shadow DOM
                if (startNode.shadowRoot) {
                    nodes = nodes.concat(findNodes(startNode.shadowRoot, className));
                }

                // Check children
                const children = startNode.children || startNode.childNodes;
                if (children) {
                    for (let child of children) {
                        nodes = nodes.concat(findNodes(child, className));
                    }
                }
                return nodes;
            }

            const gauges = findNodes(document.body, 'lh-gauge');
            const data = {};

            for (let gauge of gauges) {
                const labelNode = gauge.querySelector('.lh-gauge__label');
                const scoreNode = gauge.querySelector('.lh-gauge__percentage');
                if (labelNode && scoreNode) {
                    const label = labelNode.innerText.trim();
                    const score = parseInt(scoreNode.innerText, 10);
                    if (!isNaN(score)) {
                        data[label] = score;
                    }
                }
            }

            // Sometimes the main performance score is in a different structure
            if (Object.keys(data).length === 0) {
                const rawScores = findNodes(document.body, 'lh-gauge__percentage');
                rawData = rawScores.map(n => n.innerText);
                return { fallback: rawData };
            }

            return data;
        });

        console.log("Found Shadow Scores:", scores);

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

parseShadow();
