import { chromium } from 'playwright';

async function parseShadowAdvanced() {
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
                if (startNode.classList && startNode.classList.contains(className)) nodes.push(startNode);
                if (startNode.shadowRoot) nodes = nodes.concat(findNodes(startNode.shadowRoot, className));
                const children = startNode.children || startNode.childNodes;
                if (children) {
                    for (let child of children) {
                        nodes = nodes.concat(findNodes(child, className));
                    }
                }
                return nodes;
            }

            // We specifically want the wrapper that contains both the label and the percentage
            // In modern lighthouse, the container is often a 'a' tag with class 'lh-gauge__wrapper'
            const wrappers = findNodes(document.body, 'lh-gauge__wrapper');
            let data = {};

            for (let wrapper of wrappers) {
                const labelMatch = wrapper.className.match(/lh-gauge--([a-z-]+)/);
                const label = labelMatch ? labelMatch[1] : 'unknown';

                // Now find the percentage inside this wrapper
                const textNodes = findNodes(wrapper, 'lh-gauge__percentage');
                if (textNodes.length > 0) {
                    const score = parseInt(textNodes[0].innerText, 10);
                    if (!isNaN(score)) {
                        data[label] = score;
                    }
                }
            }

            if (Object.keys(data).length === 0) {
                // Try looking for 'lh-category' wrappers instead
                const categories = findNodes(document.body, 'lh-category');
                for (let cat of categories) {
                    const titleNode = findNodes(cat, 'lh-category-header__title')[0];
                    const scoreNodes = findNodes(cat, 'lh-gauge__percentage');
                    if (titleNode && scoreNodes.length > 0) {
                        data[titleNode.innerText.trim()] = parseInt(scoreNodes[0].innerText, 10);
                    }
                }
            }

            return data;
        });

        console.log("Extracted Labels & Scores:", scores);

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

parseShadowAdvanced();
