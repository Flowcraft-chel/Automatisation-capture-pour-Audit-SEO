import axios from 'axios';

async function testPsiApi() {
    const url = 'https://www.notion.so';
    const strategy = 'mobile';

    console.log(`Testing PSI API for ${url} (${strategy})...`);
    try {
        const response = await axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`);

        const lighthouse = response.data.lighthouseResult;
        const score = lighthouse.categories.performance.score * 100;

        console.log(`PERF SCORE: ${score}`);
        console.log(`Other categories:`);
        if (lighthouse.categories.accessibility) console.log(`- a11y: ${lighthouse.categories.accessibility.score * 100}`);
        if (lighthouse.categories['best-practices']) console.log(`- best-prac: ${lighthouse.categories['best-practices'].score * 100}`);
        if (lighthouse.categories.seo) console.log(`- seo: ${lighthouse.categories.seo.score * 100}`);

    } catch (e) {
        console.error("API failed:", e.response ? e.response.data : e.message);
    }
}
testPsiApi();
